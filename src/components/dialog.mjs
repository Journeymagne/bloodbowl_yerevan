/**
 * Asking before something irreversible.
 *
 * Step 7.10. These were `confirm()` calls: unstyled, untranslatable beyond the
 * message text, and with a browser-chosen "OK" that says nothing about what is
 * about to happen. A dialog can name the action on its own button, which is
 * the difference between "OK" and "Delete the team".
 *
 * Built on the native `<dialog>` element, which brings the focus trap, the
 * backdrop, Escape-to-close and the correct role with it — a hand-rolled modal
 * has to reimplement all of that and usually gets the focus part wrong.
 *
 * Unlike `confirm()` this is asynchronous, so callers must await it. That is
 * the one real cost of the change and the reason every call site had to be
 * touched rather than swapped.
 *
 * Since stage 13 the question is a 3.0 window: ui/sheet.mjs's renderSheet and
 * wireSheets, the same sheet every other choice opens in.
 */
import { t } from "../core/i18n.mjs";
import { delegate, escapeHtml, focusLost, patch } from "../core/dom.mjs";
import { renderButton } from "../ui/button.mjs";
import { renderSheet, wireSheets } from "../ui/sheet.mjs";

/** Patch a checklist without dropping the native modal's open state or focus. */
export function patchWithModal(root, markup, selector = "") {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const wanted = selector ? template.content.querySelector(selector) : null;
  for (const dialog of root.querySelectorAll("dialog:modal")) {
    if (wanted && dialog.matches(selector)) wanted.setAttribute("open", "");
    else { if (!dialog.open) dialog.open = true; dialog.close(); }
  }
  patch(root, template.content);
  const dialog = wanted && root.querySelector(selector);
  if (dialog && !dialog.matches(":modal")) {
    if (dialog.open) dialog.close();
    dialog.showModal();
  }
}

/** Each question's window has an id of its own: its title's id and the selectors that find it stay unique. */
let asked = 0;

/**
 * Ask the coach to confirm, and resolve to what they chose.
 *
 * The 3.0 window on renderSheet (ruling L7): from 901px DeskAdminReset's, 520 wide and 110 from the top (no `at`), up
 * to 900px a sheet from the bottom as PlayerDeadConfirm's. It is named by the action (or the `title` given), says the
 * caller's message, and ends in «Cancel», in its ring and in the focus, beside the action: the primary, or the red
 * button when `destructive`. The window stands in a host of its own at the end of <body>, so no screen's redraw takes
 * it away and no screen's sheets hear it. The answer is no for «Cancel», the cross, the backdrop, Escape, the Android
 * back gesture, or a close of any other kind (wireSheets' one path); yes only for the action. Either way the window
 * goes, and the focus goes back to what had it when the question was asked.
 *
 * @param {object} options
 * @param {string} options.message         already translated
 * @param {string} [options.title]         names the window; the action's label when left out
 * @param {string} [options.confirmLabel]  names the action, not "OK"
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.destructive]  the action is the red button
 * @returns {Promise<boolean>}
 */
export function confirmAction({
  message,
  title = "",
  confirmLabel = "",
  cancelLabel = "",
  destructive = false,
} = {}) {
  // Without <dialog> there is no safe way to block on a choice, so fall back
  // to the browser's own prompt rather than proceeding as if confirmed.
  if (typeof HTMLDialogElement === "undefined") {
    return Promise.resolve(confirm(message));
  }

  const opener = document.activeElement;
  const id = `confirm-${++asked}`;
  const action = confirmLabel || t("common.confirm");
  const host = document.createElement("div");
  host.setAttribute("data-confirm-host", "");
  host.innerHTML = renderSheet({
    id,
    title: title || action,
    className: "g-confirm",
    bodyHtml: `<p class="g-confirm__text" id="${id}-text">${escapeHtml(message)}</p>`,
    footHtml: renderButton({ label: cancelLabel || t("common.cancel"), data: { confirm: "no" } })
      + renderButton({ label: action, kind: destructive ? "danger" : "primary", data: { confirm: "yes" } }),
  });
  const dialog = host.querySelector("dialog");
  dialog.setAttribute("aria-describedby", `${id}-text`);
  document.body.append(host);

  return new Promise((resolve) => {
    let settled = false;
    const offs = [];
    const settle = (confirmed) => {
      if (settled) return;
      settled = true;
      offs.forEach((off) => off());
      if (dialog.open) dialog.close();
      host.parentNode?.removeChild(host);
      if (!focusLost(opener)) opener.focus();
      resolve(confirmed);
    };
    offs.push(
      wireSheets(host, { onClose: () => settle(false) }),
      delegate(host, "click", "[data-confirm]", (event, button) => settle(button.getAttribute("data-confirm") === "yes")),
    );
    // A close no button, key or backdrop made (another script's) is a no as well.
    dialog.addEventListener("close", () => settle(false));

    dialog.showModal();
    // Cancel takes focus, so Enter does not fire the destructive action and
    // Escape and the default both land on the same, safe answer.
    host.querySelector('[data-confirm="no"]').focus();
  });
}

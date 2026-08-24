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
 */
import { t } from "../core/i18n.mjs";

/**
 * Ask the coach to confirm, and resolve to what they chose.
 *
 * @param {object} options
 * @param {string} options.message         already translated
 * @param {string} [options.title]
 * @param {string} [options.confirmLabel]  names the action, not "OK"
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.destructive]  styles the confirm button as a warning
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

  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="app-dialog-form">
      ${title ? `<h2 class="app-dialog-title">${escapeText(title)}</h2>` : ""}
      <p class="app-dialog-message">${escapeText(message)}</p>
      <div class="app-dialog-actions">
        <button class="filter-button" type="submit" value="cancel">${escapeText(cancelLabel || t("common.cancel"))}</button>
        <button class="primary-button ${destructive ? "danger-action" : ""}" type="submit" value="confirm">${escapeText(confirmLabel || t("common.confirm"))}</button>
      </div>
    </form>
  `;

  document.body.append(dialog);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (confirmed) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(confirmed);
    };

    // The answer comes from the buttons and the key, not from the dialog's own
    // `close` event. That event is queued by the browser, and a promise that
    // waits for one that never arrives leaves the caller hanging forever —
    // which is exactly what happens in some embedded Chromium builds. `close`
    // stays as a backstop for a dialog closed some other way.
    dialog.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", (event) => {
        // The form is `method="dialog"`, so a submit would close the element a
        // second time — after `settle` has already removed it, which the
        // browser reports as a cancelled submission on a disconnected form.
        event.preventDefault();
        settle(button.value === "confirm");
      });
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") settle(false);
    });
    dialog.addEventListener("cancel", () => settle(false));
    dialog.addEventListener("close", () => settle(dialog.returnValue === "confirm"));

    dialog.showModal();
    // Cancel takes focus, so Enter does not fire the destructive action and
    // Escape and the default both land on the same, safe answer.
    dialog.querySelector("button[value='cancel']")?.focus();
  });
}

/** Text into markup, without pulling core/dom.mjs in for one call. */
function escapeText(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

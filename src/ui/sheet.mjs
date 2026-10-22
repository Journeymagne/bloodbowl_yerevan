/**
 * Every choice, multi-step flow and detail view opens in a sheet: advancement,
 * a missed-match reason, the rule behind a skill chip, a question before
 * something that cannot be taken back (confirmAction).
 *
 * It is the native `<dialog>`, so the focus trap, the backdrop and the role
 * come with it. A screen puts renderSheet(…) in its own markup and shows it
 * with patchWithModal(root, markup, "#" + id), which opens it modally and
 * keeps it open, and focus where it was, through the screen's redraws. Up to
 * 900px it is a sheet from the bottom of the screen, from 901px a modal in
 * the middle, as high as its prototype puts its window (`at`).
 *
 * What goes inside is the caller's: bodyHtml and footHtml are markup from
 * other render…() functions, and the screen's state (which step, whether it
 * is open) stays with the screen.
 */
import { delegate, escapeHtml, focusLost, patch } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { renderButton, renderIconButton } from "./button.mjs";
import { classNames } from "./markup.mjs";
import { renderStepDots } from "./progress-dots.mjs";

const SHEET = "dialog.g-sheet";
// The id lands in `#id` selectors and in aria-labelledby, neither of which is escaped.
const ID = /^[A-Za-z][\w-]*$/;

/**
 * How far from the top a modal stands from 901px, as the prototypes' windows do: 110 for most (DeskOverview,
 * DeskSeason, DeskOppTeam, the administration's, the challenges'), the default, which needs no class; 64 for the
 * advancement and a new team (DeskRosterAdv, DeskTeamNew), 80 for the hiring (DeskRosterHire), 120 for the sale, a
 * player's edit and the password (DeskRosterSell, DeskRosterEdit, DeskCoachPassword). sheet.css has a class for each.
 */
export const SHEET_TOPS = Object.freeze([64, 80, 110, 120]);
const DEFAULT_TOP = 110;

/**
 * @param {object} props
 * @param {string} props.id a plain name: what the screen shows it by, and what wireSheets reports
 * @param {string} props.title
 * @param {string} [props.sub] the one line of context under the title (the player, the cost)
 * @param {{current: number, total: number}} [props.step] step dots for a flow; `current` counts from 1
 * @param {boolean} [props.canGoBack] draws the back button, which the screen answers through wireSheets
 * @param {string} props.bodyHtml markup from a render…() function
 * @param {string} [props.footHtml] the one primary button of the sheet, as markup
 * @param {string} [props.footStartHtml] one quiet control that stands beside that button (a switch such as "Show passwords"), as markup; without a button there is no footer to hold it
 * @param {boolean} [props.wide] a 640px modal on a wide screen instead of 480px
 * @param {boolean} [props.anchored] a panel of 300px by the SideNav from 901px (the team switcher), instead of a modal in the middle; up to 900px the same sheet from the bottom
 * @param {string} [props.className] one plain class of the caller's on the dialog: a frame several of its sheets share (a player's, stage 07d)
 * @param {string} [props.leadHtml] markup of a render…() function before the titles in the head (a desk's row; the player's number, stage 07d)
 * @param {number} [props.at] how far from the top the modal stands from 901px, one of SHEET_TOPS: its prototype's (110 when left out)
 */
export function renderSheet({ id, title, sub = "", step = null, canGoBack = false, bodyHtml, footHtml = "", footStartHtml = "", wide = false, anchored = false, className = "", leadHtml = "", at = DEFAULT_TOP }) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`a sheet id is a plain name, not ${JSON.stringify(id)}`);
  if (className && !ID.test(className)) throw new Error(`a sheet's class is one plain name, not ${JSON.stringify(className)}`);
  if (!title) throw new Error("a sheet needs a title: it is what names the dialog");
  if (!SHEET_TOPS.includes(at)) throw new Error(`a sheet stands 64, 80, 110 or 120 from the top, not ${JSON.stringify(at)}`);
  const back = canGoBack
    ? renderIconButton({ icon: "back", label: t("ui.sheet.back"), data: { sheetBack: "" } })
    : '<span class="g-sheet__spacer"></span>';
  const close = renderIconButton({ icon: "close", label: t("ui.sheet.close"), data: { sheetClose: "" } });
  const context = sub ? `<p class="g-sheet__sub">${escapeHtml(sub)}</p>` : "";
  const titles = `<div class="g-sheet__titles"><h2 class="g-sheet__title" id="${escapeHtml(id)}-title">${escapeHtml(title)}</h2>${context}</div>`;
  const start = footStartHtml ? `<div class="g-sheet__foot-start">${footStartHtml}</div>` : "";
  const foot = footHtml ? `<footer class="g-sheet__foot">${start}${footHtml}</footer>` : "";
  const top = at !== DEFAULT_TOP && `g-sheet--at-${at}`;
  return `<dialog class="${classNames("g-sheet", wide && "g-sheet--wide", anchored && "g-sheet--anchored", top, className)}" id="${escapeHtml(id)}" aria-labelledby="${escapeHtml(id)}-title">`
    + '<div class="g-sheet__panel"><div class="g-sheet__handle" aria-hidden="true"></div>'
    + `<header class="g-sheet__head">${back}${leadHtml}${titles}${close}</header>`
    + `${step ? renderStepDots(step) : ""}<div class="g-sheet__body">${bodyHtml}</div>${foot}`
    + "</div></dialog>";
}

/**
 * Wire every sheet under `root`.
 *
 * The close button, a click on the backdrop and Escape are one path: the dialog
 * is closed and `onClose(id)` hears it. Escape is taken here, and its default
 * prevented, so that the browser does not close the dialog behind the screen's
 * back. A close request that is no keydown inside `root` (the Android back
 * gesture, an Escape pressed while focus sits on the body after a click on part
 * of the sheet that takes none) reaches the dialog as a `cancel`, which does
 * not bubble: it is heard in the capture phase and taken into the same path. A
 * browser that is told not to close sends no `cancel` after the Escape keydown,
 * so nothing is reported twice. A click that lands on the dialog element itself
 * is the backdrop: the panel fills the dialog, so a click inside never targets
 * it. But a press that began inside the panel and was let go over the backdrop
 * (a text selection dragged out of a field) also ends as a click on the dialog,
 * the nearest element holding both ends: the `pointerdown` says where the press
 * began, and only a press that began on the backdrop, or none at all (a
 * keyboard, a script), closes the sheet. A press that never ends in a click is
 * forgotten: a `pointercancel` (a scroll, a system gesture) and the sheet
 * closing, by whatever means, clear it, so the next click on the backdrop is
 * not taken for the end of it. Back is the screen's own step and closes
 * nothing.
 *
 * @param {Element} root a container that outlives re-renders
 * @param {object} [handlers]
 * @param {(id: string) => void} [handlers.onClose]
 * @param {(id: string) => void} [handlers.onBack]
 * @returns {() => void} removes the listeners
 */
export function wireSheets(root, { onClose = () => {}, onBack = () => {} } = {}) {
  // Where the press that the next click ends began: inside a panel, or not.
  let pressedInside = false;
  const dismiss = (dialog) => {
    pressedInside = false;
    dialog.close();
    onClose(dialog.id);
  };
  const offs = [
    delegate(root, "pointerdown", SHEET, (event, dialog) => {
      pressedInside = event.target !== dialog;
    }),
    delegate(root, "pointercancel", SHEET, () => {
      pressedInside = false;
    }),
    delegate(root, "click", "[data-sheet-close]", (event, button) => {
      const dialog = button.closest(SHEET);
      if (dialog) dismiss(dialog);
    }),
    delegate(root, "click", "[data-sheet-back]", (event, button) => {
      const dialog = button.closest(SHEET);
      if (dialog) onBack(dialog.id);
    }),
    delegate(root, "click", SHEET, (event, dialog) => {
      const fromInside = pressedInside;
      pressedInside = false;
      if (event.target === dialog && !fromInside) dismiss(dialog);
    }),
    delegate(root, "keydown", SHEET, (event, dialog) => {
      // An Escape something inside already used (a menu it closed) is not also the sheet's.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dismiss(dialog);
    }),
  ];
  const onCancel = (event) => {
    if (!event.target.matches?.(SHEET)) return;
    event.preventDefault();
    dismiss(event.target);
  };
  // A close the screen made itself (patchWithModal, a native form) is no dismiss, and `close` does not bubble.
  const onClosed = (event) => {
    if (event.target.matches?.(SHEET)) pressedInside = false;
  };
  root.addEventListener("cancel", onCancel, true);
  root.addEventListener("close", onClosed, true);
  return () => {
    offs.forEach((off) => off());
    root.removeEventListener("cancel", onCancel, true);
    root.removeEventListener("close", onClosed, true);
  };
}

/** Patch a screen's markup without dropping a native modal's open state or the focus in it. */
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
 * Once the browser's confirm(): unstyled, untranslatable beyond the message, and with an «OK» that says nothing of
 * what is about to happen. A window names the action on its own button. It is asynchronous, so callers await it.
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

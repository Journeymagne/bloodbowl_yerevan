/**
 * Every choice, multi-step flow and detail view opens in a sheet: advancement,
 * a missed-match reason, the rule behind a skill chip.
 *
 * It is the native `<dialog>` that components/dialog.mjs already stands on,
 * so the focus trap, the backdrop and the role come with it. A screen puts
 * renderSheet(…) in its own markup and shows it with
 * patchWithModal(root, markup, "#" + id), which opens it modally and keeps it
 * open, and focus where it was, through the screen's redraws. Up to 900px it
 * is a sheet from the bottom of the screen, from 901px a modal in the middle.
 *
 * What goes inside is the caller's: bodyHtml and footHtml are markup from
 * other render…() functions, and the screen's state (which step, whether it
 * is open) stays with the screen.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { renderIconButton } from "./button.mjs";
import { classNames, dataAttributes } from "./markup.mjs";
import { renderStepDots } from "./progress-dots.mjs";

const SHEET = "dialog.g-sheet";
// The id lands in `#id` selectors and in aria-labelledby, neither of which is escaped.
const ID = /^[A-Za-z][\w-]*$/;

/**
 * @param {object} props
 * @param {string} props.id a plain name: what the screen shows it by, and what wireSheets reports
 * @param {string} props.title
 * @param {string} [props.sub] the one line of context under the title (the player, the cost)
 * @param {{current: number, total: number}} [props.step] step dots for a flow; `current` counts from 1
 * @param {boolean} [props.canGoBack] draws the back button, which the screen answers through wireSheets
 * @param {string} props.bodyHtml markup from a render…() function
 * @param {string} [props.footHtml] the one primary button of the sheet, as markup
 * @param {boolean} [props.wide] a 640px modal on a wide screen instead of 480px
 */
export function renderSheet({ id, title, sub = "", step = null, canGoBack = false, bodyHtml, footHtml = "", wide = false }) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`a sheet id is a plain name, not ${JSON.stringify(id)}`);
  if (!title) throw new Error("a sheet needs a title: it is what names the dialog");
  const back = canGoBack
    ? renderIconButton({ icon: "back", label: t("ui.sheet.back"), data: { sheetBack: "" } })
    : '<span class="g-sheet__spacer"></span>';
  const close = renderIconButton({ icon: "close", label: t("ui.sheet.close"), data: { sheetClose: "" } });
  const context = sub ? `<p class="g-sheet__sub">${escapeHtml(sub)}</p>` : "";
  const titles = `<div class="g-sheet__titles"><h2 class="g-sheet__title" id="${escapeHtml(id)}-title">${escapeHtml(title)}</h2>${context}</div>`;
  const foot = footHtml ? `<footer class="g-sheet__foot">${footHtml}</footer>` : "";
  return `<dialog class="${classNames("g-sheet", wide && "g-sheet--wide")}" id="${escapeHtml(id)}" aria-labelledby="${escapeHtml(id)}-title">`
    + '<div class="g-sheet__panel"><div class="g-sheet__handle" aria-hidden="true"></div>'
    + `<header class="g-sheet__head">${back}${titles}${close}</header>`
    + `${step ? renderStepDots(step) : ""}<div class="g-sheet__body">${bodyHtml}</div>${foot}`
    + "</div></dialog>";
}

/**
 * Wire every sheet under `root`.
 *
 * The close button, a click on the backdrop and Escape are one path: the
 * dialog is closed and `onClose(id)` hears it. Escape is taken here, and its
 * default prevented, so that the browser does not close the dialog behind the
 * screen's back. A click that lands on the dialog element itself is the
 * backdrop: the panel fills the dialog, so a click inside never targets it.
 * Back is the screen's own step and closes nothing.
 *
 * @param {Element} root a container that outlives re-renders
 * @param {object} [handlers]
 * @param {(id: string) => void} [handlers.onClose]
 * @param {(id: string) => void} [handlers.onBack]
 * @returns {() => void} removes the listeners
 */
export function wireSheets(root, { onClose = () => {}, onBack = () => {} } = {}) {
  const dismiss = (dialog) => {
    dialog.close();
    onClose(dialog.id);
  };
  const offs = [
    delegate(root, "click", "[data-sheet-close]", (event, button) => {
      const dialog = button.closest(SHEET);
      if (dialog) dismiss(dialog);
    }),
    delegate(root, "click", "[data-sheet-back]", (event, button) => {
      const dialog = button.closest(SHEET);
      if (dialog) onBack(dialog.id);
    }),
    delegate(root, "click", SHEET, (event, dialog) => {
      if (event.target === dialog) dismiss(dialog);
    }),
    delegate(root, "keydown", SHEET, (event, dialog) => {
      // An Escape something inside already used (a menu it closed) is not also the sheet's.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dismiss(dialog);
    }),
  ];
  return () => offs.forEach((off) => off());
}

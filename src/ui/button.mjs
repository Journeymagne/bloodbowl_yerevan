/**
 * Buttons: the six kinds the design names, and the round icon button.
 *
 * A button that has an href is a link (navigation to a deeper screen), and a
 * link is never disabled: a screen that cannot go there does not draw it.
 * What the label says, in particular what is missing from a disabled primary
 * ("Choose a skill"), is the caller's text.
 */
import { escapeHtml } from "../core/dom.mjs";
import { icon as renderIcon } from "./icons.mjs";
import { assertLinkHref, classNames, dataAttributes } from "./markup.mjs";

export const BUTTON_KINDS = ["primary", "outline", "dark", "danger", "danger-outline", "danger-quiet"];

// The id lands in a `form="…"` attribute that is not escaped for it, as a text field's does in `for`.
const FORM_ID = /^[A-Za-z][\w-]*$/;

/**
 * A button or, with an href, a link that looks like one.
 *
 * `outline` is the base look and has no class of its own beyond `g-btn`. The
 * label is required: the icon beside it is decoration, hidden from a screen
 * reader (an icon on its own is renderIconButton). `hidden` draws it out of
 * sight and out of the tab order until the screen takes the attribute off: a
 * "save" that only has something to do once a field has changed. `form` is the
 * id of the form a submit button belongs to when it is not inside it: the
 * footer of a sheet is a sibling of the sheet's body, so its one button names
 * the form there. `busy` is a press on its way: the button says so
 * (aria-busy, aria-disabled) but is not `disabled`, which would take the focus
 * from a focused button in Chrome; the screen takes no second press.
 */
export function renderButton({ label, kind = "outline", type = "button", href = "", disabled = false, hidden = false, busy = false, icon = "", block = false, form = "", data = {} }) {
  if (!label) throw new Error("a button needs a label: its icon is decoration, and nothing else names it");
  if (!BUTTON_KINDS.includes(kind)) throw new Error(`unknown button kind: ${kind}`);
  if (form && (href || !FORM_ID.test(form))) throw new Error(`a button's form is a plain id on a button, not ${JSON.stringify(form)}${href ? " on a link" : ""}`);
  const className = classNames("g-btn", kind !== "outline" && `g-btn--${kind}`, block && "g-btn--block");
  const content = `${icon ? renderIcon(icon, kind === "primary" ? 20 : 16) : ""}${escapeHtml(label)}`;
  const out = hidden ? " hidden" : "";
  if (href) {
    assertLinkHref(href);
    return `<a class="${className}" href="${escapeHtml(href)}"${out}${dataAttributes(data)}>${content}</a>`;
  }
  return `<button type="${escapeHtml(type)}" class="${className}"${form ? ` form="${escapeHtml(form)}"` : ""}${disabled ? " disabled" : ""}${busy ? ' aria-busy="true" aria-disabled="true"' : ""}${out}${dataAttributes(data)}>${content}</button>`;
}

/** The round close or back button of a sheet. Nothing else names it, so the label is required. */
export function renderIconButton({ icon, label, data = {} }) {
  if (!label) throw new Error("an icon button needs a label: nothing else names it");
  return `<button type="button" class="g-icon-btn" aria-label="${escapeHtml(label)}"${dataAttributes(data)}>${renderIcon(icon, 18)}</button>`;
}

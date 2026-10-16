/**
 * Buttons: the five kinds the design names, and the round icon button.
 *
 * A button that has an href is a link (navigation to a deeper screen), and a
 * link is never disabled: a screen that cannot go there does not draw it.
 * What the label says, in particular what is missing from a disabled primary
 * ("Choose a skill"), is the caller's text.
 */
import { escapeHtml } from "../core/dom.mjs";
import { icon as renderIcon } from "./icons.mjs";
import { assertLinkHref, classNames, dataAttributes } from "./markup.mjs";

export const BUTTON_KINDS = ["primary", "outline", "dark", "danger", "danger-outline"];

/**
 * A button or, with an href, a link that looks like one.
 *
 * `outline` is the base look and has no class of its own beyond `g-btn`. The
 * label is required: the icon beside it is decoration, hidden from a screen
 * reader (an icon on its own is renderIconButton).
 */
export function renderButton({ label, kind = "outline", type = "button", href = "", disabled = false, icon = "", block = false, data = {} }) {
  if (!label) throw new Error("a button needs a label: its icon is decoration, and nothing else names it");
  if (!BUTTON_KINDS.includes(kind)) throw new Error(`unknown button kind: ${kind}`);
  const className = classNames("g-btn", kind !== "outline" && `g-btn--${kind}`, block && "g-btn--block");
  const content = `${icon ? renderIcon(icon, kind === "primary" ? 20 : 16) : ""}${escapeHtml(label)}`;
  if (href) {
    assertLinkHref(href);
    return `<a class="${className}" href="${escapeHtml(href)}"${dataAttributes(data)}>${content}</a>`;
  }
  return `<button type="${escapeHtml(type)}" class="${className}"${disabled ? " disabled" : ""}${dataAttributes(data)}>${content}</button>`;
}

/** The round close or back button of a sheet. Nothing else names it, so the label is required. */
export function renderIconButton({ icon, label, data = {} }) {
  if (!label) throw new Error("an icon button needs a label: nothing else names it");
  return `<button type="button" class="g-icon-btn" aria-label="${escapeHtml(label)}"${dataAttributes(data)}>${renderIcon(icon, 18)}</button>`;
}

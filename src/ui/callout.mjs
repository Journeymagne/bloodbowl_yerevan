/**
 * A banner that tells the coach something is waiting or something is wrong.
 *
 * With an href it is one link, with a chevron: an advancement available, a
 * score that does not match the records. Without one it is a plain banner
 * that may carry one action of its own, such as the "edit outside the match"
 * switch. It cannot be both, because a button does not nest in a link. The
 * tone says how loud it is: `accent` is news, `warn` is a state the coach
 * should keep in mind, `danger` is a fault. Which one a situation is, and
 * every word on it, is the caller's.
 */
import { escapeHtml } from "../core/dom.mjs";
import { icon as renderIcon } from "./icons.mjs";
import { assertLinkHref, classNames } from "./markup.mjs";

export const CALLOUT_TONES = ["accent", "warn", "danger"];

/**
 * @param {object} props
 * @param {string} props.title the news, in a few words
 * @param {string} [props.sub] the one line of detail under it: who, how much
 * @param {string} [props.tone] one of CALLOUT_TONES; `accent` is the base look and has no class of its own
 * @param {string} [props.href] makes the whole banner a link
 * @param {string} [props.actionHtml] markup from a render…() function, drawn at the right of a banner that is no link
 */
export function renderCallout({ title, sub = "", tone = "accent", href = "", actionHtml = "" }) {
  if (!title) throw new Error("a callout needs a title: it is the news");
  if (!CALLOUT_TONES.includes(tone)) throw new Error(`unknown callout tone: ${tone}`);
  if (href && actionHtml) throw new Error("a callout with an href is a link and cannot carry an action: a button does not nest in a link");
  const className = classNames("g-callout", tone !== "accent" && `g-callout--${tone}`);
  const line = sub ? `<span class="g-callout__sub">${escapeHtml(sub)}</span>` : "";
  const text = `<span class="g-callout__text"><span class="g-callout__title">${escapeHtml(title)}</span>${line}</span>`;
  if (href) {
    assertLinkHref(href);
    return `<a class="${className}" href="${escapeHtml(href)}">${text}${renderIcon("chevron", 16)}</a>`;
  }
  const action = actionHtml ? `<div class="g-callout__action">${actionHtml}</div>` : "";
  return `<div class="${className}">${text}${action}</div>`;
}

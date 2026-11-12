/**
 * The way from a card's few rows to the whole of them («Whole season →», «Whole table →»): one link, one look,
 * wherever a card shows part of a list. The words, with their «→», are the caller's; where it stands is the card's.
 */
import { escapeHtml } from "../core/dom.mjs";
import { assertLinkHref, classNames } from "./markup.mjs";

/**
 * @param {object} props
 * @param {string} props.label what the whole is, with its «→»
 * @param {string} props.href where the whole is
 * @param {string} [props.className] the card's own class, for where the link stands in it
 */
export function renderSeeAll({ label, href, className = "" }) {
  if (!label) throw new Error("a see-all link needs a label: it says what the whole is");
  assertLinkHref(href);
  return `<a class="${classNames("g-seeall", className)}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

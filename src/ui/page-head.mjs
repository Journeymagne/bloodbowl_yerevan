/**
 * The head of a screen: its one `h1` with the line under it, and a slot at the
 * right for a status or an action (a season's round, a team's place).
 *
 * From 901px it is a band across the top of the content, on the card colour
 * over a rule (DeskCoach.html). Up to 900px the shell's header already names
 * the screen, so the head is only for a screen reader there, unless the screen
 * asks for it (`phone`): the one whose title is its own content, not the
 * header's. The `h1` takes the focus when a screen is entered
 * (`tabindex="-1"`), the place a keyboard starts from.
 */
import { escapeHtml } from "../core/dom.mjs";
import { classNames } from "./markup.mjs";

/**
 * @param {object} props
 * @param {string} props.title the screen's name: the page's one `h1`
 * @param {string} [props.sub] the one line of context under it
 * @param {string} [props.metaHtml] markup from a render…() function, drawn at the right of the band
 * @param {boolean} [props.phone] drawn on a phone too, not only for a screen reader
 */
export function renderPageHead({ title, sub = "", metaHtml = "", phone = false }) {
  if (!title) throw new Error("a page head needs a title: it is what names the screen");
  const line = sub ? `<p class="g-pagehead__sub">${escapeHtml(sub)}</p>` : "";
  const meta = metaHtml ? `<div class="g-pagehead__meta">${metaHtml}</div>` : "";
  return `<header class="${classNames("g-pagehead", phone && "g-pagehead--phone")}"><div class="g-pagehead__text">`
    + `<h1 class="g-pagehead__title" tabindex="-1">${escapeHtml(title)}</h1>${line}</div>${meta}</header>`;
}

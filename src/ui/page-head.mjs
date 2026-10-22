/**
 * The head of a screen: its title with the line under it, and a slot at the
 * right for a status, an action or the search (a season's round, a team's
 * place, the reference's field).
 *
 * From 901px it is a band across the top of the content, on the card colour
 * over a rule (DeskCoach.html, DeskRef.html, DeskGuest.html). Up to 900px the
 * shell's header already names the screen, so the head is only for a screen
 * reader there, unless the screen asks for it (`phone`): the one whose title is
 * its own content, not the header's. A screen whose line is said elsewhere on a
 * phone (the team's value, in its card) keeps it off a phone (`phoneSub`).
 *
 * The title is the page's one `h1`, which takes the focus when a screen is
 * entered (`tabindex="-1"`), the place a keyboard starts from; or, where the
 * page's `h1` is elsewhere (a reference article's, the guest's hero), a
 * paragraph, which takes no focus.
 */
import { escapeHtml } from "../core/dom.mjs";
import { classNames } from "./markup.mjs";

/** What a head may title its page with: the page's h1, or a paragraph when the h1 is the content's. */
const TITLE_TAGS = ["h1", "p"];

/**
 * @param {object} props
 * @param {string} props.title the screen's name
 * @param {string} [props.sub] the one line of context under it
 * @param {string} [props.metaHtml] markup from a render…() function, drawn at the right of the band
 * @param {boolean} [props.phone] drawn on a phone too, not only for a screen reader
 * @param {"h1"|"p"} [props.titleTag] `p` when the page's `h1` is elsewhere
 * @param {boolean} [props.phoneSub] false: the line is not shown on a phone, where the screen says it another way
 */
export function renderPageHead({ title, sub = "", metaHtml = "", phone = false, titleTag = "h1", phoneSub = true }) {
  if (!title) throw new Error("a page head needs a title: it is what names the screen");
  if (!TITLE_TAGS.includes(titleTag)) throw new Error(`a page head titles its page with h1 or p, not ${JSON.stringify(titleTag)}`);
  const focus = titleTag === "h1" ? ' tabindex="-1"' : "";
  const line = sub ? `<p class="g-pagehead__sub">${escapeHtml(sub)}</p>` : "";
  const meta = metaHtml ? `<div class="g-pagehead__meta">${metaHtml}</div>` : "";
  const classes = classNames("g-pagehead", phone && "g-pagehead--phone", !phoneSub && "g-pagehead--nosub-phone");
  return `<header class="${classes}"><div class="g-pagehead__text">`
    + `<${titleTag} class="g-pagehead__title"${focus}>${escapeHtml(title)}</${titleTag}>${line}</div>${meta}</header>`;
}

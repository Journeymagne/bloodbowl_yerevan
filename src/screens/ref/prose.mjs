/**
 * The one wrapper of the reference's prose: what prose.css styles, around a page's text. The article,
 * the overview's card, the legal page, the Skill Table, a skill's panel and the roster's sheet of a skill
 * all draw their text through it, so the class is written in one place.
 */

/**
 * @param {string} html the build's markup of a page (scripts/build-data.mjs escapes it), or markup the
 *   caller made of text it escaped itself
 * @returns {string}
 */
export function proseMarkup(html) {
  return `<div class="g-prose">${html}</div>`;
}

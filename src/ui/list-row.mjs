/**
 * The rows of a list: a link to a deeper screen, a label with its value, and
 * a place in a ranking.
 *
 * Rows run inside the screen's gutter, one under another, each with its own
 * divider. What a row says, and the order of the rows, is the caller's.
 */
import { escapeHtml } from "../core/dom.mjs";
import { icon as renderIcon } from "./icons.mjs";
import { assertLinkHref } from "./markup.mjs";

/** A number can be a count or a score, and zero is one: only the empty string (or no value at all) is nothing to draw. */
const isEmpty = (value) => value === "" || value === null || value === undefined;

/** The glyphs a row may end with: the kit's long chevron, or the short one of the rows whose prototype draws it. */
const ROW_CHEVRONS = ["chevron", "chevronShort"];

/**
 * A row that is a link, with a count of what is behind it and a chevron.
 *
 * @param {object} props
 * @param {string} props.href
 * @param {string} props.title
 * @param {string} [props.desc] the quiet line under the title
 * @param {string|number} [props.count] how many records are behind the link, in the accent colour
 * @param {"chevron"|"chevronShort"} [props.chevron] the long one of the kit's ListRow (Ref, DeskRef), or the short one
 *   where the row's prototype draws it (Settings' «Администрирование»)
 */
export function renderNavRow({ href, title, desc = "", count = "", chevron = "chevron" }) {
  if (!href) throw new Error("a navigation row needs an href: it is a link");
  assertLinkHref(href);
  if (!title) throw new Error("a navigation row needs a title");
  if (!ROW_CHEVRONS.includes(chevron)) throw new Error(`a navigation row ends with a chevron, not ${JSON.stringify(chevron)}`);
  const line = desc ? `<span class="g-list-row__desc">${escapeHtml(desc)}</span>` : "";
  const text = `<span class="g-list-row__text"><span class="g-list-row__title">${escapeHtml(title)}</span>${line}</span>`;
  const records = isEmpty(count) ? "" : `<span class="g-list-row__count">${escapeHtml(count)}</span>`;
  return `<a class="g-list-row" href="${escapeHtml(href)}">${text}${records}${renderIcon(chevron, 16)}</a>`;
}

/** A label on the left and its value, heavier, on the right: the staff a team has, a price. A missing value (`null`, `undefined`) is drawn empty. */
export function renderKeyValueRow({ label, value }) {
  return `<div class="g-kv"><span class="g-kv__label">${escapeHtml(label)}</span><span class="g-kv__value">${escapeHtml(value ?? "")}</span></div>`;
}

/**
 * A place in a ranking: a short label, a rank or a result pill at the left,
 * the name with a line under it, and the figure at the right.
 *
 * The lead is always drawn, even empty: it is the first column of a fixed
 * grid, and a row without it would put its title where the others have the
 * lead. `leadHtml` is markup from a render…() function.
 *
 * @param {object} props
 * @param {string} [props.leadHtml]
 * @param {string} props.title
 * @param {string} [props.caption] the line under the title: a position, a number
 * @param {string|number} [props.value]
 */
export function renderRankedRow({ leadHtml = "", title, caption = "", value = "" }) {
  if (!title) throw new Error("a ranked row needs a title");
  const line = caption ? `<span class="g-ranked__caption">${escapeHtml(caption)}</span>` : "";
  const figure = isEmpty(value) ? "" : `<span class="g-ranked__value">${escapeHtml(value)}</span>`;
  return `<div class="g-ranked"><span class="g-ranked__lead">${leadHtml}</span>`
    + `<span class="g-ranked__text"><span class="g-ranked__title">${escapeHtml(title)}</span>${line}</span>${figure}</div>`;
}

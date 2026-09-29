/**
 * Inline SVG icons, and the square icon button every table row action uses.
 *
 * One helper so the actions look the same in every table: yellow for adding,
 * editing and opening, red for removing.
 */
import { escapeHtml } from "../core/dom.mjs";

const ICON_PATHS = {
  plus: "M8 3v10M3 8h10",
  edit: "M10.5 2.5l3 3L6 13H3v-3zM9 4l3 3",
  trash: "M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5",
  profile: "M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4",
};

/** The small ✕ at the end of a removable pill. */
export const REMOVE_ICON = `<svg class="remove-icon" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6"/></svg>`;

/**
 * @param {object} options
 * @param {"plus"|"edit"|"trash"|"profile"} options.icon
 * @param {string} options.title tooltip, and the name a screen reader announces
 * @param {"accent"|"danger"} [options.tone] accent (yellow) to add, edit or open; danger (red) to remove
 * @param {string} [options.href] renders a link instead of a button
 * @param {string} [options.attributes] extra attributes: data-* hooks, disabled, aria-disabled
 */
export function iconButton({ icon, title, tone = "accent", href = "", attributes = "" }) {
  const shared = `class="filter-button table-icon-button ${tone}-icon-button" title="${escapeHtml(title)}" ${attributes}`;
  const svg = `<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICON_PATHS[icon]}"/></svg>`;
  return href ? `<a ${shared} href="${href}">${svg}</a>` : `<button type="button" ${shared}>${svg}</button>`;
}

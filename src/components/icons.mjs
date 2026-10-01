/**
 * Inline SVG icons, and the square icon button for compact actions.
 *
 * One helper so the actions look the same everywhere: yellow for adding,
 * editing and opening, red for removing. Each icon carries its own
 * tone and default title, so a call site only says which icon and what it hooks.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";

const ICONS = {
  plus: { path: "M8 3v10M3 8h10", title: "common.add" },
  edit: { path: "M10.5 2.5l3 3L6 13H3v-3zM9 4l3 3", title: "common.edit" },
  trash: { path: "M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5", title: "common.remove", tone: "danger" },
  collapse: { path: "M3.5 10.5L8 6l4.5 4.5", title: "roster.previewAction" },
  expand: { path: "M3.5 5.5L8 10l4.5-4.5", title: "roster.advanceAction" },
};

/** The small ✕ at the end of a removable pill. */
export const REMOVE_ICON = `<svg class="remove-icon" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6"/></svg>`;

/**
 * @param {"plus"|"edit"|"trash"|"collapse"|"expand"} icon
 * @param {object} [options]
 * @param {string} [options.attributes] extra attributes: data-* hooks, disabled, aria-disabled
 * @param {string} [options.href] renders a link instead of a button
 * @param {string} [options.title] overrides the icon's default tooltip / screen-reader name
 */
export function iconButton(icon, { attributes = "", href = "", title = "" } = {}) {
  const { path, tone = "accent", title: titleKey } = ICONS[icon];
  const shared = `class="filter-button table-icon-button ${tone}-icon-button" title="${escapeHtml(title || t(titleKey))}" ${attributes}`;
  const svg = `<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="${path}"/></svg>`;
  return href ? `<a ${shared} href="${href}">${svg}</a>` : `<button type="button" ${shared}>${svg}</button>`;
}

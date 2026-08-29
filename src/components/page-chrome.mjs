/**
 * Page chrome shared by every screen: the header block, the active-nav
 * highlight, and which section the current view belongs to.
 *
 * Mechanically moved out of src/app.js — every screen used these, so unlike
 * the reference-only helpers in components/cards.mjs and components/
 * content-links.mjs, this one has to be genuinely shared rather than owned
 * by a single screens/*.mjs file.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { view } from "../core/view.mjs";

/**
 * Sections that no longer have a sidebar entry of their own.
 *
 * The reference sections live inside References and the builder is reached
 * from My Teams, so that is what should look active while a coach is in one —
 * otherwise the whole sidebar goes dark and nothing says where they are.
 */
const NAV_PARENT = new Map([
  ["builder", "my-teams"],
  ["teams", "pages"],
  ["skills", "pages"],
  ["traits", "pages"],
  ["rules", "pages"],
  ["cheatsheets", "pages"],
  ["inducements", "pages"],
  ["star-players", "pages"],
]);

export function setActiveNav(route) {
  const active = NAV_PARENT.get(route) ?? route;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === active);
  });
}

export function setViewSection(section) {
  view.dataset.section = section;
}

export function renderHeader(title, description, actions = "", options = {}) {
  const backButton = options.back ? `
    <button
      class="primary-button page-back-button"
      type="button"
      data-history-back
      data-history-fallback="${escapeHtml(options.backFallback || "#/")}"
    >${t("common.back")}</button>
  ` : "";
  return `
    <header class="page-head" data-key="page-head">
      <div class="page-heading-main">
        <div class="page-title-row">
          <h1>${escapeHtml(title)}</h1>
          ${backButton}
        </div>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      ${actions ? `<div class="toolbar">${actions}</div>` : ""}
    </header>
  `;
}

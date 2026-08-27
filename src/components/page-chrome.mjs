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

export function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === route);
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

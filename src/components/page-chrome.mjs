/**
 * Page chrome shared by every screen: the header block, the active-nav
 * highlight, and which section the current view belongs to.
 *
 * Mechanically moved out of src/app.js — every screen used these, so unlike
 * the reference-only helpers in components/content-links.mjs, this one has
 * to be genuinely shared rather than owned by a single screens/*.mjs file.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { MATCHDAY_CREST } from "./matchday.mjs";
import { view } from "../core/view.mjs";

/**
 * Sections that no longer have a sidebar entry of their own.
 *
 * The reference sections live inside References and the builder is reached
 * from My Teams, so that is what should look active while a coach is in one —
 * otherwise the whole sidebar goes dark and nothing says where they are.
 *
 * The 2.x sidebar is gone (stage 05): no `[data-nav]` link is left on the
 * page, and the 3.0 shell lights its tab and item from the route name
 * (shell/navigation.mjs). This map and the two calls below stay only because
 * the 2.x screens still make them (plan stage 05, decision 23).
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

/** A no-op until stage 13 removes the calls: it lights `[data-nav]` links, and there are none any more. */
export function setActiveNav(route) {
  const active = NAV_PARENT.get(route) ?? route;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === active);
  });
}

/** Nothing reads `#app-view[data-section]` since the 2.x sidebar went; a no-op in effect until stage 13 removes the calls. */
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
      <span class="site-page-crest" aria-hidden="true">${MATCHDAY_CREST}</span>
      <div class="page-heading-main">
        <span class="site-page-kicker">${t("roster.sevensLabel")}</span>
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

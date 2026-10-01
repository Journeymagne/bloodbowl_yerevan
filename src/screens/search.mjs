import { t } from "../core/i18n.mjs";
import { escapeHtml } from "../core/dom.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { pageUrl } from "../core/routes.mjs";
import { searchPages } from "../data/search.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";

export function renderSearch() {
  setActiveNav("pages");
  setViewSection("search");
  const results = searchPages(state.data.pages, state.query);
  view.innerHTML = `${renderHeader(t("search.title"), t("search.resultCount", { count: results.length }))}
    <div class="reference-list search-results">
      ${results.map(page => `<a class="reference-row" href="${pageUrl(page)}">
        <span><strong>${escapeHtml(page.title)}</strong><small>${t(sectionKey(page.kind))}</small></span>
        <svg class="link-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
      </a>`).join("") || `<p class="empty-state">${t("search.noResults")}</p>`}
    </div>`;
}

function sectionKey(kind) {
  return ({ team: "nav.teamsRules", skill: "nav.skills", trait: "nav.traits", starPlayer: "nav.starPlayers", inducement: "nav.inducements", rules: "section.rulesTitle", cheatsheet: "section.cheatsheetsTitle" })[kind] ?? "nav.references";
}

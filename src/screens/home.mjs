/** The player's desk: season, team management and match-day rules. */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { onScreenLeave } from "../core/screen-lifecycle.mjs";
import { setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { activeOverviewCards } from "./overview.mjs";
import { loadSeason } from "./season/season-data.mjs";
import { renderHomeSeason } from "../components/home-season.mjs";

const arrow = `<svg class="link-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>`;

function deskLink(href, titleKey, descriptionKey = "") {
  return `<a class="desk-link" href="${href}"><span><strong>${t(titleKey)}</strong>
    ${descriptionKey ? `<small>${t(descriptionKey)}</small>` : ""}</span>${arrow}</a>`;
}

function renderHandbook() {
  return `<section class="home-handbook"><div class="section-heading"><h2>${t("home.handbook")}</h2>
    <p>${t("home.handbookNote")}</p></div><div class="handbook-list">
    ${activeOverviewCards().map(card => `<a href="#/overview/${encodeURIComponent(card.slug)}">
      <span>${escapeHtml(card.title)}</span>${arrow}</a>`).join("")}</div></section>`;
}

export async function renderHome() {
  setActiveNav("home");
  setViewSection("home");
  let active = true;
  onScreenLeave("home:season", () => { active = false; });
  view.innerHTML = `<div class="home-desk">
    <section class="home-season">
      <header class="home-season-head"><div><h1>${t("nav.season")}</h1><p>${t("home.seasonNote")}</p></div>
        <a class="primary-button" href="#/season">${t("home.openSeason")}${arrow}</a></header>
      <nav class="season-shortcuts" aria-label="${t("season.sectionsAriaLabel")}">
        ${deskLink("#/season/standings", "season.tab.standings")}
        ${deskLink("#/season/schedule", "season.tab.schedule")}
      </nav>
      <div class="home-season-data" data-home-season aria-live="polite" aria-busy="true"><p class="loading">${t("season.loading")}</p></div>
      <div class="home-match-link">${deskLink("#/my-games", "nav.myGames", "home.gamesNote")}</div>
    </section>
    <aside class="home-tools" aria-label="${t("home.playerTools")}">
      <section class="home-team"><h2>${t("nav.myTeams")}</h2><p>${t("home.teamsNote")}</p>
        <a class="primary-button" href="#/my-teams">${t("home.openTeams")}${arrow}</a></section>
      <section class="home-rules"><div class="section-heading"><h2>${t("home.matchRules")}</h2><p>${t("home.rulesNote")}</p></div>
        <div class="quick-rules">${deskLink("#/weather", "home.weather")}${deskLink("#/kick-off-table", "home.kickoff")}
        ${deskLink("#/prayers-to-nuffle", "home.prayers")}${deskLink("#/casualties", "home.casualties")}</div>
        <a class="text-link" href="#/pages">${t("home.allReferences")}${arrow}</a></section>
    </aside>
  </div>${renderHandbook()}`;
  const region = view.querySelector("[data-home-season]");
  await loadSeason(true);
  if (!active || !region.isConnected) return;
  region.innerHTML = renderHomeSeason(state.season);
  region.setAttribute("aria-busy", "false");
  region.querySelector("[data-home-retry]")?.addEventListener("click", renderHome);
}

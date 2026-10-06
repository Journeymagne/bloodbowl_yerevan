/**
 * The front page: hero banner plus the overview-article grid.
 *
 * Mechanically moved out of src/app.js.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { view } from "../core/view.mjs";
import { setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { activeOverviewCards } from "./overview.mjs";

export function renderHome() {
  setActiveNav("home");
  setViewSection("home");

  view.innerHTML = `
    <section class="league-hero matchday-hero">
      <div class="league-hero-mark" aria-hidden="true"><img src="assets/brand/gata-league-logo.png" alt=""></div>
      <div class="league-hero-copy">
        <span class="matchday-eyebrow">${t("roster.sevensLabel")}</span>
        <h1>${t("home.heroTitle")}</h1>
        <p>${t("home.heroSubtitle")}</p>
      </div>
      <div class="matchday-edition" aria-hidden="true">07</div>
    </section>

    <nav class="site-quick-links" aria-label="${t("nav.navigationAria")}">
      ${[["my-teams", "nav.myTeams"], ["my-games", "nav.myGames"], ["season", "nav.season"], ["pages", "nav.references"]].map(([route, key], index) => `<a href="#/${route}"><span aria-hidden="true">0${index + 1}</span><strong>${t(key)}</strong><span aria-hidden="true">↗</span></a>`).join("")}
    </nav>

    <section>
      <div class="page-head">
        <div>
          <!-- h2, not h1: the hero above is this screen's heading, and a second
               h1 tells a screen reader the page starts again here. -->
          <h2>${t("home.overviewTitle")}</h2>
          <p>${t("home.overviewSubtitle")}</p>
        </div>
      </div>
      <div class="card-grid overview-grid">
        ${activeOverviewCards().map(renderOverviewIndexCard).join("")}
      </div>
    </section>
  `;
}

function overviewCardUrl(card) {
  return `#/overview/${encodeURIComponent(card.slug)}`;
}

function renderOverviewIndexCard(card, index) {
  return `
    <a class="card compact overview-index-card" href="${overviewCardUrl(card)}">
      <span class="site-card-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.summary ?? "")}</p>
    </a>
  `;
}

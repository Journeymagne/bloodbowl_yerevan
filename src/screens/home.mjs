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
    <section class="league-hero">
      <div class="league-hero-copy">
        <h1>${t("home.heroTitle")}</h1>
        <p>${t("home.heroSubtitle")}</p>
      </div>
      <div class="league-hero-media" aria-hidden="true">
        <img src="assets/brand/gata-league-logo.png" alt="">
      </div>
    </section>

    <section>
      <div class="page-head">
        <div>
          <h1>${t("home.overviewTitle")}</h1>
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

function renderOverviewIndexCard(card) {
  return `
    <a class="card compact overview-index-card" href="${overviewCardUrl(card)}">
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.summary ?? "")}</p>
    </a>
  `;
}

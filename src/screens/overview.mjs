/**
 * The league-rules overview articles reachable from #/overview/:slug.
 *
 * Mechanically moved out of src/app.js. The card data itself lives in
 * data/overview-cards-{en,ru}.mjs — task 10.4 of the refactor plan moves it
 * into content/Gata/Overview/*.md so it stops being wired-in code.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { overviewCards } from "../data/overview-cards-en.mjs";
import { overviewCardsRu } from "../data/overview-cards-ru.mjs";

export function activeOverviewCards() {
  return state.locale === "ru" ? overviewCardsRu : overviewCards;
}

export function findOverviewCard(slug = "") {
  return activeOverviewCards().find((card) => card.slug === slug) ?? null;
}

export function renderOverviewDetail(slug) {
  const card = findOverviewCard(slug);
  setActiveNav("home");
  setViewSection("home");
  if (!card) {
    view.innerHTML = `
      ${renderHeader(t("home.overviewTitle"), t("overview.pagesSubtitle"), "", { back: true, backFallback: "#/" })}
      <div class="empty-state">${t("overview.notFound")}</div>
    `;
    return;
  }
  view.innerHTML = `
    ${renderHeader(card.title, t("home.overviewTitle"), "", { back: true, backFallback: "#/" })}
    <article class="content-panel content-body overview-detail">
      ${renderOverviewContent(card)}
    </article>
  `;
}

function renderOverviewContent(card) {
  return `
    <div class="overview-card">
      ${(card.sections ?? []).map(renderOverviewSection).join("")}
    </div>
  `;
}

function renderOverviewSection(section) {
  return `
    <section class="overview-card-section">
      <h3>${escapeHtml(section.title)}</h3>
      <ul class="overview-list">
        ${(section.items ?? []).map((item) => `<li>${renderOverviewItem(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderOverviewItem(item = "") {
  const match = String(item).match(/^([^:]{2,42}):\s+(.+)$/);
  if (!match) return escapeHtml(item);
  return `<strong>${escapeHtml(match[1])}:</strong> ${escapeHtml(match[2])}`;
}

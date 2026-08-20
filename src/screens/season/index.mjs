/**
 * The season screen: `#/season` and its tabs, `#/season/:tab`.
 *
 * Mechanically moved out of src/app.js, with one deliberate exception to
 * "no behaviour change" — spelled out by task 6.7 of the refactor plan: the
 * active tab used to live in `state.season.activeTab`, so a tab couldn't be
 * linked and reset on reload. It's now the route's `tab` param instead.
 *
 * Switching tabs updates the URL via `history.replaceState` rather than a
 * real hash navigation, so it doesn't fire `hashchange` (which would re-run
 * `renderSeason` a second time through the router) and doesn't grow browser
 * history with every click — but the tab still survives a reload and can be
 * copied as a link. Entering the screen from elsewhere (a nav link, back/
 * forward, typing the URL) goes through the router as usual and force-
 * refreshes the season data, same as before.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { seasonTabUrl } from "../../core/routes.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderSeasonRegistration, wireRegistration } from "./registration.mjs";
import { renderLeagueFixture } from "./fixture.mjs";
import { renderSeasonStandings } from "./standings.mjs";
import { renderSeasonRounds } from "./schedule.mjs";
import { renderSeasonAdmin, wireAdmin } from "./admin.mjs";
import { loadSeason } from "./season-data.mjs";

const seasonTabDefinitions = [
  { id: "registration", labelKey: "season.tab.registration" },
  { id: "fixture", labelKey: "season.tab.fixture" },
  { id: "standings", labelKey: "season.tab.standings" },
  { id: "schedule", labelKey: "season.tab.schedule" },
  { id: "administration", labelKey: "nav.administration", adminOnly: true },
];

function availableSeasonTabs() {
  return seasonTabDefinitions.filter((tab) => !tab.adminOnly || state.auth.currentUser?.isAdmin);
}

function normalizeSeasonTab(tabId = "") {
  const tabs = availableSeasonTabs();
  return tabs.some((tab) => tab.id === tabId) ? tabId : tabs[0]?.id ?? "registration";
}

function renderSeasonTabs(activeTab) {
  return `
    <div class="season-tabs" role="tablist" aria-label="${t("season.sectionsAriaLabel")}">
      ${availableSeasonTabs().map((tab) => `
        <button
          class="season-tab ${tab.id === activeTab ? "active" : ""}"
          type="button"
          role="tab"
          aria-selected="${tab.id === activeTab ? "true" : "false"}"
          data-season-tab="${escapeHtml(tab.id)}"
        >${t(tab.labelKey)}</button>
      `).join("")}
    </div>
  `;
}

function renderSeasonTabContent(data, activeTab) {
  if (activeTab === "fixture") return renderLeagueFixture(data);
  if (activeTab === "standings") return renderSeasonStandings(data);
  if (activeTab === "schedule") return renderSeasonRounds(data);
  if (activeTab === "administration" && state.auth.currentUser?.isAdmin) return renderSeasonAdmin(data);
  return renderSeasonRegistration(data);
}

export async function renderSeason(refresh = true, tab = "") {
  setActiveNav("season");
  setViewSection("season");
  view.innerHTML = `
    ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
    <div class="loading">${t("season.loading")}</div>
  `;

  await loadSeason(refresh);

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"))}
      <div class="empty-state">${t("season.loginToCommit")}</div>
    `;
    return;
  }

  const activeTab = normalizeSeasonTab(tab);

  if (state.season.error) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
      <div class="empty-state">${escapeHtml(state.season.error)}</div>
    `;
    wireSeason(activeTab);
    return;
  }

  const data = state.season.data ?? {};
  view.innerHTML = `
    ${renderHeader(t("nav.season"), `${data.season?.name ?? t("season.defaultName")} · ${t("season.swissPairingControl")}`, `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
    ${renderSeasonTabs(activeTab)}
    ${renderSeasonTabContent(data, activeTab)}
  `;
  wireSeason(activeTab);
}

function wireSeason(activeTab) {
  view.querySelector("[data-season-refresh]")?.addEventListener("click", () => {
    state.season.loaded = false;
    renderSeason(true, activeTab);
  });

  view.querySelectorAll("[data-season-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = normalizeSeasonTab(button.dataset.seasonTab);
      history.replaceState(null, "", seasonTabUrl(nextTab));
      renderSeason(false, nextTab);
    });
  });

  const rerender = () => renderSeason(false, activeTab);
  if (activeTab === "registration") wireRegistration(rerender);
  if (activeTab === "administration") wireAdmin(rerender);
}

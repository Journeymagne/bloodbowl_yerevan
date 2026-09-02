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

/**
 * `signedIn` marks a tab that says something about *you*: entering the season
 * and your current fixture. Since step 10.3 the rest is readable without an
 * account, so a visitor lands on the standings rather than on a login notice.
 */
const seasonTabDefinitions = [
  { id: "registration", labelKey: "season.tab.registration", signedIn: true },
  { id: "fixture", labelKey: "season.tab.fixture", signedIn: true },
  { id: "standings", labelKey: "season.tab.standings" },
  { id: "schedule", labelKey: "season.tab.schedule" },
  { id: "administration", labelKey: "nav.administration", adminOnly: true },
];

function availableSeasonTabs() {
  const user = state.auth.currentUser;
  return seasonTabDefinitions.filter((tab) => {
    if (tab.adminOnly) return Boolean(user?.isAdmin);
    if (tab.signedIn) return Boolean(user);
    return true;
  });
}

function normalizeSeasonTab(tabId = "") {
  const tabs = availableSeasonTabs();
  return tabs.some((tab) => tab.id === tabId) ? tabId : tabs[0]?.id ?? "registration";
}

const SEASON_PANEL_ID = "season-panel";

const seasonTabId = (tabId) => `season-tab-${tabId}`;

/**
 * The tab strip.
 *
 * Step 15.7 finishes what the roles started: a tab now names the panel it
 * controls, and only the selected one is a tab stop. That is the roving
 * tabindex a tablist is meant to have — Tab moves past the whole strip rather
 * than through it, and the arrow keys move within, which wireSeason handles.
 */
function renderSeasonTabs(activeTab) {
  return `
    <div class="season-tabs" role="tablist" aria-label="${t("season.sectionsAriaLabel")}">
      ${availableSeasonTabs().map((tab) => `
        <button
          class="season-tab ${tab.id === activeTab ? "active" : ""}"
          type="button"
          role="tab"
          id="${seasonTabId(tab.id)}"
          aria-controls="${SEASON_PANEL_ID}"
          aria-selected="${tab.id === activeTab ? "true" : "false"}"
          tabindex="${tab.id === activeTab ? "0" : "-1"}"
          data-season-tab="${escapeHtml(tab.id)}"
        >${t(tab.labelKey)}</button>
      `).join("")}
    </div>
  `;
}

/** The tab's content, told to a reader as the panel that tab controls. */
function renderSeasonPanel(data, activeTab) {
  return `
    <div id="${SEASON_PANEL_ID}" role="tabpanel" tabindex="0" aria-labelledby="${seasonTabId(activeTab)}">
      ${renderSeasonTabContent(data, activeTab)}
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
  if (refresh) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
      <div class="loading">${t("season.loading")}</div>
    `;
  }

  await loadSeason(refresh);


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
    ${renderSeasonPanel(data, activeTab)}
  `;
  wireSeason(activeTab);
}

function wireSeason(activeTab) {
  view.querySelector("[data-season-refresh]")?.addEventListener("click", () => {
    state.season.loaded = false;
    renderSeason(true, activeTab);
  });

  /**
   * Switch tabs, and leave focus where the person left it.
   *
   * The switch re-renders the strip, so the button that was focused is gone by
   * the end of it — focus would drop to the body and a keyboard user would
   * have to walk back to the tabs. Rendering the new tab with tabindex="0"
   * makes it focusable, not focused; only this does.
   */
  const openTab = async (tabId, { focusTab = false } = {}) => {
    const nextTab = normalizeSeasonTab(tabId);
    history.replaceState(null, "", seasonTabUrl(nextTab));
    await renderSeason(false, nextTab);
    if (focusTab) view.querySelector(`#${seasonTabId(nextTab)}`)?.focus();
  };

  const buttons = [...view.querySelectorAll("[data-season-tab]")];
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => openTab(button.dataset.seasonTab));
    // Arrow keys move within a tablist; Home and End jump to its ends. Without
    // this the strip is one tab stop with no way to reach the other tabs from
    // the keyboard at all, which is what a roving tabindex costs if the keys
    // that go with it are missing.
    button.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      let next = null;
      if (step) next = buttons[(index + step + buttons.length) % buttons.length];
      if (event.key === "Home") next = buttons[0];
      if (event.key === "End") next = buttons[buttons.length - 1];
      if (!next) return;
      event.preventDefault();
      openTab(next.dataset.seasonTab, { focusTab: true });
    });
  });

  const rerender = () => renderSeason(false, activeTab);
  if (activeTab === "registration") wireRegistration(rerender);
  if (activeTab === "administration") wireAdmin(rerender);
}

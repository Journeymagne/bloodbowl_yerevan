/**
 * Bootstrap: load translations and content, restore the session, attach the
 * listeners that belong to the page rather than to any one screen, and start
 * the router.
 *
 * Everything else now lives in a module — screens under src/screens/, the
 * pieces they share under src/components/, the frame around them under
 * src/shell/, and the route table itself in src/core/router.mjs.
 */
import { initTheme } from "./core/theme.mjs";
import { applyStaticI18n, getLocale, initLocale, isSupportedLocale, loadTranslations, onLocaleChange, setLocale, storedLocale, t } from "./core/i18n.mjs";
import { loadReferenceData } from "./data/reference.mjs";
import { setOnUnauthorized } from "./core/api-client.mjs";
import { setLocaleHandler } from "./core/locale-request.mjs";
import { renderRoute } from "./core/router.mjs";
import { state } from "./core/state.mjs";
import { view } from "./core/view.mjs";
import { toast } from "./components/toast.mjs";
import { onActiveTeamChange, syncActiveTeam } from "./data/active-team.mjs";
import { loadGames } from "./data/games.mjs";
import { syncThemeWithAccount } from "./data/preferences.mjs";
import { followSessionAcrossTabs, loadSession, onSessionChange, sessionEnded, sessionFailureText } from "./data/session.mjs";
import { loadSeason } from "./screens/season/season-data.mjs";
import { openNewTeamSheet } from "./screens/teams/new-sheet.mjs";
import { mountShell, refreshShell } from "./shell/shell.mjs";
import { renderCallout } from "./ui/callout.mjs";

// Cache-busting token: index.html loads this module as `src/app.js?v=<version>`
// and the build stamps that value, so data and i18n fetches reuse it rather
// than a second copy that drifts (it said gata-93 while index.html said 97).
const assetVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const referenceDataOptions = { version: assetVersion, inlineData: globalThis.__REFERENCE_DATA__ };

/** The page's text in the language: the static attributes, and the frame, which is drawn. */
function applyLocaleChrome() {
  applyStaticI18n();
  refreshShell();
}

/**
 * Switch language without reloading: fetch that locale's content, then
 * re-render the current route. If the content cannot be loaded the locale goes
 * back to what it was, so the interface never disagrees with the data.
 */
async function switchLocale(nextLocale) {
  if (!isSupportedLocale(nextLocale) || nextLocale === getLocale()) return;
  const previous = getLocale();
  try {
    state.data = await loadReferenceData(nextLocale, referenceDataOptions);
  } catch (error) {
    console.error(error);
    return;
  }
  setLocale(nextLocale);
  state.locale = nextLocale;
  if (previous !== nextLocale) renderRoute();
}

function handleHistoryBack(event) {
  const trigger = event.target instanceof Element ? event.target.closest("[data-history-back]") : null;
  if (!trigger) return;
  event.preventDefault();
  const fallback = trigger.dataset.historyFallback || "#/";
  if (window.history.length > 1) {
    window.history.back();
  } else {
    location.hash = fallback;
  }
}

function wireFrame() {
  view.addEventListener("click", handleHistoryBack);
  document.querySelector("[data-skip-to-content]")?.addEventListener("click", () => view.focus());
  // A step of a roster still waiting for its answer asks before the tab closes: 3.0's own guard (screens/team/roster/save.mjs).
  window.addEventListener("hashchange", renderRoute);
}

/** Every change of session, the first load included (it draws the first screen): theme, active team, games and table, screen. */
function afterSessionChange() {
  void syncThemeWithAccount(); // repaints at once; the account is written in the background
  syncActiveTeam(); // before the route: a coach's `#/` is their active team
  // The frame's match card and place wait on these; the screen does not.
  void Promise.allSettled([loadGames(true), loadSeason()]).then(() => refreshShell());
  renderRoute();
}

async function init() {
  setOnUnauthorized(sessionEnded);
  followSessionAcrossTabs(window); // another tab that signs in or out moves this page's session too
  setLocaleHandler(switchLocale); // screens and the SideNav ask for a language; this file reloads the data
  mountShell({ onNewTeam: openNewTeamSheet }); // before the session: its first change draws the first screen, and the frame with it
  onSessionChange(afterSessionChange);
  onActiveTeamChange(() => refreshShell());
  // applyStaticI18n cannot reach the frame: it is drawn, not marked up.
  onLocaleChange(applyLocaleChrome);
  initTheme();
  state.locale = initLocale(storedLocale());
  await loadTranslations(assetVersion);
  state.data = await loadReferenceData(state.locale, referenceDataOptions);
  if ((await loadSession()) === "offline") toast(sessionFailureText(), { tone: "error" });
  // No await from here on: a first-load redirect's hashchange must find the listener wireFrame adds.
  applyLocaleChrome();
  wireFrame();
}

init().catch((error) => {
  console.error(error);
  view.innerHTML = renderCallout({ tone: "danger", title: t("app.dataLoadError") });
});

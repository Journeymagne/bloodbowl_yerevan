/**
 * "My games": the signed-in coach's fixture list, split into the next
 * game and past ones.
 *
 * Mechanically moved out of src/app.js; the list's loader and the rules that
 * sort a game into "next" or "history" now live in src/data/games.mjs, which
 * the single game page and the SideNav's match card read as well.
 */
import { errorText } from "../../core/api.mjs";
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { isCurrentPlayerRoundGame, isGameClosedForPlayers, isGameResultSubmitted, loadGames } from "../../data/games.mjs";
import { gameUrl } from "../../core/routes.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { gameStatusLabel } from "../../components/game-status.mjs";
import { pairingCasualties, pairingTouchdowns } from "../season/season-links.mjs";
import { renderChallenges, mountChallenges } from "../../components/games/challenges.mjs";
import { gameContextLabel } from "../../components/games/context.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";

function gameOpponent(game) {
  return game.viewerIsHome ? game.away : game.home;
}
function renderGameCard(game) {
  const opponent = gameOpponent(game);
  const resultSubmitted = isGameResultSubmitted(game);
  return `
    <a class="card compact game-card" href="${gameUrl(game)}">
      <div class="game-card-flags">
      <span class="season-status-pill" data-status="${escapeHtml(game.resultStatus)}">${escapeHtml(gameStatusLabel(game.resultStatus))}</span>
      ${game.kind === "friendly" ? `<span class="pre-badge">${t("games.noLeaguePoints")}</span>` : ""}
      ${game.postMatchStatus && game.postMatchStatus !== 'not_started' ? `<span class="pre-badge">${t('post.status.' + game.postMatchStatus)}</span>` : game.preparationStatus && game.preparationStatus !== "not_started" ? `<span class="pre-badge">${t(`pre.status.${game.preparationStatus}`)}</span>` : ""}
      </div>
      <h3>${escapeHtml(gameContextLabel(game))}</h3>
      <p>${t("games.vsLabel")} <strong>${escapeHtml(opponent?.team?.name || t("season.byeLabel"))}</strong>${opponent ? ` · ${escapeHtml(opponent.user.login)}` : ""}</p>
      ${resultSubmitted ? `<p>${t("season.touchdownsLabel")}: ${escapeHtml(pairingTouchdowns(game))} · ${t("season.casualtiesHeader")}: ${escapeHtml(pairingCasualties(game))}</p>` : ""}
    </a>
  `;
}
export async function renderMyGames() {
  setActiveNav("my-games");
  setViewSection("my-games");
  if (!state.auth.currentUser) {
    view.innerHTML = `${renderHeader(t("nav.myGames"), t("games.subtitle"))}<div class="empty-state">${t("games.loginRequired")}</div>`;
    return;
  }
  let disposed = false, timer, mounted;
  onScreenLeave("my-games", () => { disposed = true; clearInterval(timer); mounted?.cleanup(); });
  if (!state.games.loaded) {
    view.innerHTML = `${renderHeader(t("nav.myGames"), t("games.subtitle"))}<div class="loading">${t("games.loading")}</div>`;
  }
  let challengePayload, challengeError = "";
  await Promise.all([loadGames(true), apiRequest("/api/challenges").then(payload => { challengePayload = payload; }).catch(error => { challengeError = errorText(error); })]);
  if (disposed) return;
  if (state.games.error) {
    view.innerHTML = `${renderHeader(t("nav.myGames"), t("games.subtitle"))}<div class="empty-state">${escapeHtml(state.games.error)}</div>`;
    return;
  }
  const needsPostMatch = game => game.preparationStatus === 'in_progress' && game.postMatchStatus !== 'completed';
  const nextGames = state.games.items.filter((game) => needsPostMatch(game) || (!isGameResultSubmitted(game) && isCurrentPlayerRoundGame(game)));
  const history = state.games.items.filter((game) => !needsPostMatch(game) && (isGameResultSubmitted(game) || isGameClosedForPlayers(game)));
  view.innerHTML = `
    ${renderHeader(t("nav.myGames"), t("games.subtitle"), `<button class="filter-button" data-games-refresh>${t("common.refresh")}</button><button class="primary-button" data-open-challenge ${!challengePayload?.teams.length ? "disabled" : ""}>${t("challenges.send")}</button>`)}
    ${challengePayload ? renderChallenges(challengePayload) : `<p class="notice-box" role="alert">${escapeHtml(challengeError)}</p>`}
    <section class="content-panel season-card"><h2>${t("games.nextGameHeading")}</h2>
      ${nextGames.length ? `<div class="card-grid games-grid">${nextGames.map(renderGameCard).join("")}</div>` : `<p>${t("games.noNextGame")}</p>`}
    </section>
    <section class="content-panel season-card"><h2>${t("games.historyHeading")}</h2>
      ${history.length ? `<div class="card-grid games-grid">${history.map(renderGameCard).join("")}</div>` : `<p>${t("games.noHistory")}</p>`}
    </section>`;
  mounted = mountChallenges(view, renderMyGames);
  const fingerprint = JSON.stringify([challengePayload, state.games.items]);
  timer = setInterval(async () => {
    if (disposed || document.hidden || !mounted.canRefresh()) return;
    try {
      const [challenges] = await Promise.all([apiRequest("/api/challenges"), loadGames(true)]);
      if (!disposed && mounted.canRefresh() && JSON.stringify([challenges, state.games.items]) !== fingerprint) renderMyGames();
    } catch { /* Keep the current cards while offline. */ }
  }, 6000);
}

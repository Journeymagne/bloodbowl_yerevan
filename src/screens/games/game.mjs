/**
 * A single game page: the versus header and the opponent-confirmation flow.
 *
 * The coach's quick score is gone (spec 3.0 §9.6): a match is played through its
 * preparation and post-match. A score sent before 3.0 is still confirmed or
 * rejected here. The admin's manual result left with stage 12: it is the
 * administration's season (`#/administration/season`, a pair's «Result…»).
 *
 * Mechanically moved out of src/app.js.
 */
import { errorText } from "../../core/api.mjs";
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { invalidateGames, isGameClosedForPlayers, isGameResultSubmitted } from "../../data/games.mjs";
import { toastError } from "../../components/toast.mjs";
import { renderGamePreparationPanel } from "../../components/pre-match/game-panel.mjs";
import { renderGamePostMatchPanel } from "../../components/post-match/game-panel.mjs";
import { gameContextLabel } from "../../components/games/context.mjs";

function renderGameScore(game, proposed = false) {
  const prefix = proposed ? "proposed" : "";
  const value = (name) => game[`${prefix}${prefix ? name[0].toUpperCase() + name.slice(1) : name}`];
  return `${t("season.touchdownsLabel")}: ${value("homeTouchdowns") ?? "-"} / ${value("awayTouchdowns") ?? "-"} · ${t("season.casualtiesHeader")}: ${value("homeCasualties") ?? "-"} / ${value("awayCasualties") ?? "-"}`;
}

export async function renderGamePage(gameId) {
  setActiveNav("my-games");
  setViewSection("my-games");
  if (!state.auth.currentUser) {
    view.innerHTML = `${renderHeader(t("games.gameHeading"), t("games.subtitle"))}<div class="empty-state">${t("games.loginRequired")}</div>`;
    return;
  }
  try {
    const { game } = await apiRequest(`/api/games/${encodeURIComponent(gameId)}`);
    const preparationHtml = await renderGamePreparationPanel(game);
    const isAdmin = Boolean(state.auth.currentUser?.isAdmin);
    const resultSubmitted = isGameResultSubmitted(game);
    const playerLocked = !isAdmin && isGameClosedForPlayers(game);
    const awaitingConfirmation = game.resultStatus === "awaiting_confirmation";
    const postMatchEnabled = game.preparationStatus === 'in_progress';
    // The coach who proposed the result is shown that it is sent, not buttons
    // to agree with themselves. The server refuses it either way (step 14.1);
    // this is so nobody is offered a button that cannot work.
    const waitingForOpponent = !postMatchEnabled && awaitingConfirmation && !isAdmin && game.viewerIsProposer;
    const confirmationBox = !postMatchEnabled && awaitingConfirmation && !resultSubmitted && !playerLocked && !waitingForOpponent
      ? `<div class="notice-box"><strong>${t("games.confirmRequestHeading")}</strong><p>${escapeHtml(renderGameScore(game, true))}</p><div class="game-confirm-actions"><button class="primary-button" data-game-confirm>${t("games.confirmAction")}</button><button class="filter-button danger-action" data-game-reject>${t("games.rejectAction")}</button></div></div>`
      : waitingForOpponent
        ? `<div class="notice-box" data-game-awaiting><strong>${t("games.awaitingOpponent")}</strong><p>${escapeHtml(renderGameScore(game, true))}</p></div>`
        : "";
    const lockedNotice = playerLocked && !resultSubmitted ? `<p class="notice-box">${t("games.roundClosed")}</p>` : "";
    const actions = resultSubmitted
      ? `<p class="notice-box">${escapeHtml(renderGameScore(game))}</p>`
      : postMatchEnabled ? '' : `${lockedNotice}${confirmationBox}`;
    view.innerHTML = `
      ${renderHeader(t("games.gameHeading"), gameContextLabel(game), "", { back: true, backFallback: "#/my-games" })}
      ${game.kind === "friendly" ? `<p class="notice-box">${t("games.friendlyRules")}</p>` : ""}
      <section class="content-panel game-page"><div class="game-versus"><div><span>${t("season.homeLabel")}</span><h2>${escapeHtml(game.home?.user?.login || "-")}</h2><p class="game-team-name">${escapeHtml(game.home?.team?.name || "-")}</p>${game.home?.team?.logoUrl ? `<img class="game-team-logo" src="${escapeHtml(game.home.team.logoUrl)}" alt="" loading="lazy" decoding="async">` : ""}</div><strong>VS</strong><div><span>${t("season.awayLabel")}</span><h2>${escapeHtml(game.away?.user?.login || "-")}</h2><p class="game-team-name">${escapeHtml(game.away?.team?.name || "-")}</p>${game.away?.team?.logoUrl ? `<img class="game-team-logo" src="${escapeHtml(game.away.team.logoUrl)}" alt="" loading="lazy" decoding="async">` : ""}</div></div>${actions}</section>`;
    view.querySelector(".game-page")?.insertAdjacentHTML("afterbegin", preparationHtml + renderGamePostMatchPanel(game));
    wireGamePage(game);
  } catch (error) {
    view.innerHTML = `${renderHeader(t("games.gameHeading"), t("games.subtitle"), "", { back: true, backFallback: "#/my-games" })}<div class="empty-state">${escapeHtml(errorText(error))}</div>`;
  }
}
function wireGamePage(game) {
  for (const [selector, action] of [["[data-game-confirm]", "confirm"], ["[data-game-reject]", "reject"]]) {
    view.querySelector(selector)?.addEventListener("click", async () => {
      try { await apiRequest(`/api/games/${game.id}/${action}`, { method: "POST", body: "{}" }); void invalidateGames(); renderGamePage(game.id); } catch (error) { toastError(error); }
    });
  }
}

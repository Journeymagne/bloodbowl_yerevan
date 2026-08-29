/**
 * A single game page: the versus header, the result forms, and the
 * opponent-confirmation flow.
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
import { isGameClosedForPlayers, isGameResultSubmitted } from "./my-games.mjs";
import { toastError } from "../../components/toast.mjs";

function renderGameScore(game, proposed = false) {
  const prefix = proposed ? "proposed" : "";
  const value = (name) => game[`${prefix}${prefix ? name[0].toUpperCase() + name.slice(1) : name}`];
  return `${t("season.touchdownsLabel")}: ${value("homeTouchdowns") ?? "-"} / ${value("awayTouchdowns") ?? "-"} · ${t("season.casualtiesHeader")}: ${value("homeCasualties") ?? "-"} / ${value("awayCasualties") ?? "-"}`;
}
function renderGameProposalForm(game) {
  const value = (confirmedKey, proposedKey) => game[proposedKey] ?? game[confirmedKey] ?? "";
  return `
    <form class="game-result-form fixture-result-form" data-game-proposal>
      <label class="filter-field"><span>${t("season.homeTouchdownsField")}</span><input name="homeTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("homeTouchdowns", "proposedHomeTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.awayTouchdownsField")}</span><input name="awayTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("awayTouchdowns", "proposedAwayTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.homeCasualtiesField")}</span><input name="homeCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("homeCasualties", "proposedHomeCasualties"))}"></label>
      <label class="filter-field"><span>${t("season.awayCasualtiesField")}</span><input name="awayCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("awayCasualties", "proposedAwayCasualties"))}"></label>
      <button class="primary-button" type="submit">${t("games.requestConfirmationAction")}</button>
    </form>`;
}
function renderAdminGameResultForm(game) {
  const value = (confirmedKey, proposedKey) => game[confirmedKey] ?? game[proposedKey] ?? "";
  return `
    <form class="game-result-form fixture-result-form notice-box" data-admin-game-result>
      <strong>${t("games.adminEditHeading")}</strong>
      <label class="filter-field"><span>${t("season.homeTouchdownsField")}</span><input name="homeTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("homeTouchdowns", "proposedHomeTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.awayTouchdownsField")}</span><input name="awayTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("awayTouchdowns", "proposedAwayTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.homeCasualtiesField")}</span><input name="homeCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("homeCasualties", "proposedHomeCasualties"))}"></label>
      <label class="filter-field"><span>${t("season.awayCasualtiesField")}</span><input name="awayCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("awayCasualties", "proposedAwayCasualties"))}"></label>
      <button class="primary-button" type="submit">${t("games.adminSaveResultAction")}</button>
    </form>`;
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
    const isAdmin = Boolean(state.auth.currentUser?.isAdmin);
    const resultSubmitted = isGameResultSubmitted(game);
    const playerLocked = !isAdmin && isGameClosedForPlayers(game);
    const awaitingConfirmation = game.resultStatus === "awaiting_confirmation";
    const playerResultForm = !isAdmin && !resultSubmitted && !playerLocked ? renderGameProposalForm(game) : "";
    // The coach who proposed the result is shown that it is sent, not buttons
    // to agree with themselves. The server refuses it either way (step 14.1);
    // this is so nobody is offered a button that cannot work.
    const waitingForOpponent = awaitingConfirmation && !isAdmin && game.viewerIsProposer;
    const confirmationBox = awaitingConfirmation && !resultSubmitted && !playerLocked && !waitingForOpponent
      ? `<div class="notice-box"><strong>${t("games.confirmRequestHeading")}</strong><p>${escapeHtml(renderGameScore(game, true))}</p><div class="game-confirm-actions"><button class="primary-button" data-game-confirm>${t("games.confirmAction")}</button><button class="filter-button danger-action" data-game-reject>${t("games.rejectAction")}</button></div></div>`
      : waitingForOpponent
        ? `<div class="notice-box" data-game-awaiting><strong>${t("games.awaitingOpponent")}</strong><p>${escapeHtml(renderGameScore(game, true))}</p></div>`
        : "";
    const lockedNotice = playerLocked && !resultSubmitted ? `<p class="notice-box">${t("games.roundClosed")}</p>` : "";
    const actions = resultSubmitted
      ? `<p class="notice-box">${escapeHtml(renderGameScore(game))}</p>`
      : `${lockedNotice}${confirmationBox}${playerResultForm}`;
    view.innerHTML = `
      ${renderHeader(t("games.gameHeading"), `${game.season.name} · ${t("season.roundLabel")} ${game.roundNumber}`, "", { back: true, backFallback: "#/my-games" })}
      <section class="content-panel game-page"><div class="game-versus"><div><span>${t("season.homeLabel")}</span><h2>${escapeHtml(game.home?.user?.login || "-")}</h2><p class="game-team-name">${escapeHtml(game.home?.team?.name || "-")}</p>${game.home?.team?.logoUrl ? `<img class="game-team-logo" src="${escapeHtml(game.home.team.logoUrl)}" alt="" loading="lazy" decoding="async">` : ""}</div><strong>VS</strong><div><span>${t("season.awayLabel")}</span><h2>${escapeHtml(game.away?.user?.login || "-")}</h2><p class="game-team-name">${escapeHtml(game.away?.team?.name || "-")}</p>${game.away?.team?.logoUrl ? `<img class="game-team-logo" src="${escapeHtml(game.away.team.logoUrl)}" alt="" loading="lazy" decoding="async">` : ""}</div></div>${actions}${isAdmin ? renderAdminGameResultForm(game) : ""}</section>`;
    wireGamePage(game);
  } catch (error) {
    view.innerHTML = `${renderHeader(t("games.gameHeading"), t("games.subtitle"), "", { back: true, backFallback: "#/my-games" })}<div class="empty-state">${escapeHtml(errorText(error))}</div>`;
  }
}
function wireGamePage(game) {
  view.querySelector("[data-admin-game-result]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try { await apiRequest(`/api/games/${game.id}`, { method: "PATCH", body: JSON.stringify(form) }); state.games.loaded = false; renderGamePage(game.id); } catch (error) { toastError(error); }
  });
  view.querySelector("[data-game-proposal]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try { await apiRequest(`/api/games/${game.id}/propose`, { method: "POST", body: JSON.stringify(form) }); renderGamePage(game.id); } catch (error) { toastError(error); }
  });
  for (const [selector, action] of [["[data-game-confirm]", "confirm"], ["[data-game-reject]", "reject"]]) {
    view.querySelector(selector)?.addEventListener("click", async () => {
      try { await apiRequest(`/api/games/${game.id}/${action}`, { method: "POST", body: "{}" }); state.games.loaded = false; renderGamePage(game.id); } catch (error) { toastError(error); }
    });
  }
}

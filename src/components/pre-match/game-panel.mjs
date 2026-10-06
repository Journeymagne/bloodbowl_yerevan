import { t } from "../../core/i18n.mjs";
import { preMatchUrl } from "../../core/routes.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { safe, money } from "./shared.mjs";

export async function renderGamePreparationPanel(game) {
  if (!game.home || !game.away) return "";
  const started = game.preparationStatus === "in_progress";
  const closed = game.resultStatus === "confirmed" || (game.kind !== "friendly" && (game.roundStatus !== "started" || Number(game.roundNumber) !== Number(game.season.currentRound)));
  if (closed && !started) return "";
  let detail = "";
  if (started) {
    const payload = await apiRequest(`/api/games/${game.id}/preparation`).catch(() => null);
    detail = payload ? `<div class="pre-two-teams">${["home", "away"].map(side => {
      const snapshot = payload.snapshots[side];
      return snapshot ? `<div><h3>${safe(snapshot.team.name)}</h3><p>${t("pre.ctv")}: ${money(snapshot.ctv.total)} · ${t("pre.matchPlayers", { count: snapshot.players.length })}</p><p>${snapshot.purchases.map(item => `${safe(item.title)} × ${item.quantity}`).join(" · ") || t("pre.noInducements")}</p></div>` : "";
    }).join("")}</div><p class="pre-game-reminder">${t("pre.setupReminder")}</p>` : "";
  }
  return `<section class="pre-game-panel"><div class="pre-section-head"><div><span class="matchday-eyebrow">${t("roster.sevensLabel")}</span><h2>${t(started ? "pre.matchSheet" : "pre.title")}</h2></div><a class="primary-button" href="${preMatchUrl(game, started ? "review" : "")}">${t(started ? "pre.viewSheet" : "pre.prepareAction")}</a></div><p>${t(started ? "pre.started" : "pre.prepareIntro")}</p>${detail}</section>`;
}

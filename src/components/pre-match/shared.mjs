import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { renderRosterLinks } from "../content-links.mjs";
import { calculateMatchCtv } from "../../domain/match/roster.mjs";
import { matchBudget } from "../../domain/match/budget.mjs";
import { otherSide } from "../../domain/match/rules.mjs";
import { state } from "../../core/state.mjs";
import { renderChecklistSummary } from "../games/checklist-layout.mjs";
import { PLAYER_STATS } from "../../domain/roster/values.mjs";

export const money = value => `${value}k`;
export const safe = escapeHtml;

export function actionButton(label, action, blocked = false, className = "primary-button") {
  return `<button type="button" class="${className}" data-pre-action="${action}" ${blocked ? 'disabled' : ''}>${t(label)}</button>`;
}

export function diceField(name, value, maximum, label) {
  return `<label class="pre-dice-field"><span>${safe(label)}</span><input type="number" name="${name}" min="1" max="${maximum}" step="1" value="${value ?? ""}" required inputmode="numeric"><small>D${maximum}</small></label>`;
}

export function playerCard(player, remove = false) {
  return `<article class="matchday-player-card pre-player-card" data-key="${safe(player.id)}">
    <header><span class="pre-player-number">${safe(player.number)}</span><div><h3>${safe(player.name)}</h3><small>${safe(player.row?.position || t("pre.star"))}</small></div><strong>${money(player.value)}</strong></header>
    <div class="pre-stat-grid">${PLAYER_STATS.map(stat => `<div><span>${t(`stats.${stat}`)}</span><strong>${safe(player.stats?.[stat] || "—")}</strong></div>`).join("")}</div>
    <div class="pre-skills">${renderRosterLinks(player.skills || [])}</div>
    <footer>${player.temporary ? `<span class="pre-badge">${t("pre.temporary")}</span>` : ""}${player.isCaptain ? `<span class="pre-badge">${t("roster.captain")}</span>` : ""}${player.temporaryEffects?.length ? `<span class="pre-badge">${safe(player.temporaryEffects.join(" · "))}</span>` : ""}
    ${remove ? `<button class="filter-button" type="button" data-pre-remove="${safe(player.id)}">${t("common.remove")}</button>` : ""}</footer>
  </article>`;
}

export function renderSummary(payload, sideName) {
  const prep = payload.preparation, side = prep[sideName], rival = prep[otherSide(sideName)];
  const ctv = calculateMatchCtv(side), budget = matchBudget(prep, sideName, state.data);
  const values = [["pre.ctv", money(ctv.total)], ["pre.opponentCtv", money(calculateMatchCtv(rival).total)],
    ["pre.compensation", money(budget.pettyCash)], ["pre.tierBonus", money(budget.bonus)],
    ["pre.fromTreasury", money(budget.treasuryUsed)], ["pre.chosen", money(budget.chosen)],
    ["pre.willExpire", money(budget.unspent)], ["savedRoster.treasury", `${money(side.roster.treasury)} → ${money(budget.treasuryAfter)}`]];
  return renderChecklistSummary({ title: "pre.matchSummary", teamName: side.team.name, values,
    noteHtml: `${!side.rosterLocked || !rival.rosterLocked ? `<p>${t("pre.provisionalCtv")}</p>` : ""}${t("pre.treasuryNotice")}`,
    sides: [side, rival] });

}

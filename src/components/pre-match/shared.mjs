import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { renderCaptainBadge, renderRosterLinks } from "../content-links.mjs";
import { PLAYER_STATS } from "../../domain/roster/values.mjs";

export const money = value => `${value}k`;
export const safe = escapeHtml;

export function playerCard(player, remove = false) {
  return `<article class="matchday-player-card pre-player-card" data-key="${safe(player.id)}">
    <header><span class="pre-player-number">${safe(player.number)}</span><div><h3>${safe(player.name)}</h3><small>${safe(player.row?.position || t("pre.star"))}</small></div><strong>${money(player.value)}</strong></header>
    <div class="pre-stat-grid">${PLAYER_STATS.map(stat => `<div><span>${t(`stats.${stat}`)}</span><strong>${safe(player.stats?.[stat] || "—")}</strong></div>`).join("")}</div>
    <div class="pre-skills">${renderRosterLinks(player.skills || [])}</div>
    <footer>${player.temporary ? `<span class="pre-badge">${t("pre.temporary")}</span>` : ""}${player.isCaptain ? renderCaptainBadge("pre-badge") : ""}${player.temporaryEffects?.length ? `<span class="pre-badge">${safe(player.temporaryEffects.join(" · "))}</span>` : ""}
    ${remove ? `<button class="filter-button" type="button" data-pre-remove="${safe(player.id)}">${t("common.remove")}</button>` : ""}</footer>
  </article>`;
}

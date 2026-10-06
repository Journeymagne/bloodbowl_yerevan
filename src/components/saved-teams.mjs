/** One saved-team card for My Teams and public/admin coach profiles. */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { pageUrl } from "../core/routes.mjs";
import { normalizeSavedRoster } from "../data/roster-draft.mjs";
import { ensureDraftPlayers } from "../domain/roster/players.mjs";
import { calculateRosterCosts } from "../domain/roster/costs.mjs";
import { countToNumber } from "../domain/roster/values.mjs";
import { renderPublicTeamLink } from "./content-links.mjs";
import { iconButton } from "./icons.mjs";

export function renderSavedTeams(teams, { owner, editUrl, canManage = false } = {}) {
  if (!teams.length) return `<p class="empty-state">${t("myTeams.noSavedTeams")}</p>`;
  return `<div class="saved-team-list">${teams.map(team => renderSavedTeamCard(team, owner, canManage ? editUrl?.(team) : "")).join("")}</div>`;
}

function renderSavedTeamCard(team, owner, editUrl) {
  const draft = normalizeSavedRoster(team);
  const base = state.data.teams.find(item => item.slug === draft.teamSlug)
    ?? state.data.teams.find(item => item.slug === team.baseTeamSlug);
  if (base) ensureDraftPlayers(base, draft);
  const costs = base ? calculateRosterCosts(base, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "—";
  return `<article class="card saved-team-card">
    <header class="saved-team-card-head">
      ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
      <div><h3>${renderPublicTeamLink(owner, team)}${team.inActiveSeason ? `<span class="badge season-badge">${t("myTeams.inSeasonBadge")}</span>` : ""}</h3>
      <p>${base ? `<a class="inline-rule-link" href="${pageUrl(base)}">${escapeHtml(base.title)}</a>` : escapeHtml(team.baseTeamSlug || "—")}</p></div>
    </header>
    <dl class="saved-team-card-stats">
      <div><dt>${t("catalog.players")}</dt><dd>${costs ? costs.totalPlayersCount : "—"}</dd></div>
      <div><dt>${t("roster.totalCost")}</dt><dd>${costs ? costs.total + "k" : "—"}</dd></div>
      <div><dt>${t("roster.treasuryTitle")}</dt><dd>${countToNumber(draft.treasury)}k</dd></div>
      <div><dt>${t("footer.updated")}</dt><dd>${escapeHtml(updated)}</dd></div>
    </dl>
    ${editUrl ? `<div class="saved-team-actions"><a class="primary-button" href="${escapeHtml(editUrl)}">${t("myTeams.openRoster")}</a>
      ${iconButton("trash", { title: t("common.delete"), attributes: `data-delete-team="${escapeHtml(team.id)}" data-delete-team-owner="${escapeHtml(owner.id)}" data-delete-team-name="${escapeHtml(team.name || "")}"` })}</div>` : ""}
  </article>`;
}

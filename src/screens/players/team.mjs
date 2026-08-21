/**
 * A coach's saved team, read-only: summary, league rules and roster.
 *
 * Mechanically moved out of src/app.js. This is the third renderer of a
 * roster (after screens/builder.mjs and screens/saved-roster.mjs) — unlike
 * those two it is view-only, so task 7's merge covers the editors and
 * leaves this one alone.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { adminTeamEditUrl, playerTeamUrl, playerUrl } from "../../core/routes.mjs";
import { countToNumber, statValueForDisplayByStat } from "../../domain/roster/values.mjs";
import { hasBribery } from "../../domain/roster/team-rules.mjs";
import { ensureDraftPlayers, selectedRosterPlayers, skillNamesForPlayer } from "../../domain/roster/players.mjs";
import { calculateRosterCosts, playerCurrentCost } from "../../domain/roster/costs.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderPlayerLink, renderRosterLinks } from "../../components/content-links.mjs";
import { ensureDraftLeagueChoice, playerStatusText, renderTeamRuleAccess } from "../../components/roster-editor-shared.mjs";
import { normalizeSavedRoster } from "../../data/roster-draft.mjs";

export async function renderPublicTeamProfile(userId, teamId) {
  // "players" matches no nav item, so nothing lights up — which is what
  // routeSection() in core/routes.mjs already says these routes are. The two
  // used to disagree, and this screen highlighted "Season".
  setActiveNav("players");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), "", { back: true, backFallback: playerUrl(userId) })}
    <div class="loading">${t("myTeams.loadingTeam")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewSavedTeams")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}`);
    const draft = normalizeSavedRoster(payload.team);
    const team = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? state.data.teams[0];
    ensureDraftLeagueChoice(team, draft);
    ensureDraftPlayers(team, draft);
    const costs = calculateRosterCosts(team, draft);
    const actions = `
      ${state.auth.currentUser?.isAdmin ? `<a class="primary-button" href="${adminTeamEditUrl(payload.user, payload.team)}">${t("admin.editTeamAction")}</a>` : ""}
    `;
    view.innerHTML = `
      ${renderHeader(`${t("sidebar.teamHeading")} "${payload.team.name}"`, `${t("admin.coachHeading")}: ${payload.user.login}`, actions, { back: true, backFallback: playerUrl(payload.user) })}
      ${renderPublicTeamOverview(payload.user, payload.team, team, draft, costs)}
      <section class="content-panel compact-table-panel">
        <h2>${t("savedRoster.rosterHeading")}</h2>
        ${renderPublicTeamRosterTable(team, draft)}
      </section>
    `;
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), "", { back: true, backFallback: playerUrl(userId) })}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}
function renderPublicTeamOverview(user, savedTeam, team, draft, costs) {
  const totalRerolls = countToNumber(draft.startingRerolls) + countToNumber(draft.teamRerolls);
  return `
    <section class="public-team-overview side-panel">
      ${draft.logoData ? `<div class="summary-logo-block public-team-logo-block"><img src="${escapeHtml(draft.logoData)}" alt=""></div>` : ""}
      <div class="public-team-overview-grid">
        <div class="public-team-summary-block">
          <div class="summary-title-block">
            <h3>${t("savedRoster.summaryTitle")}</h3>
            <a class="builder-team-link" href="${playerTeamUrl(user, savedTeam)}">${escapeHtml(savedTeam.name)}</a>
          </div>
          <dl class="stat-list summary-stat-grid">
            <dt>${t("savedRoster.activePlayers")}</dt><dd>${costs.playersCount}</dd>
            <dt>${t("savedRoster.totalPlayers")}</dt><dd>${costs.totalPlayersCount}</dd>
            <dt>${t("savedRoster.teamRerolls")}</dt><dd>${totalRerolls}</dd>
            ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(draft.bribes)}</dd>` : ""}
            <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(draft.dedicatedFans)}</dd>
            <dt>${t("savedRoster.treasury")}</dt><dd>${countToNumber(draft.treasury)}k</dd>
            <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
          </dl>
        </div>
        <div class="public-team-coach-block">
          <h2>${t("admin.coachHeading")}</h2>
          <p>${renderPlayerLink(user)}</p>
          <div class="public-team-rules-wrap">
            ${renderTeamRuleAccess(team, draft)}
          </div>
        </div>
      </div>
    </section>
  `;
}
function renderPublicTeamRosterTable(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) return `<p>${t("savedRoster.noPlayersYet")}</p>`;
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="compact-roster-table public-roster-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t("roster.nameHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("admin.statusHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(player.name)}</strong></td>
              <td>${escapeHtml(player.row.position)}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ma", player.row.ma, player.statMods.ma ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("st", player.row.st, player.statMods.st ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ag", player.row.ag, player.statMods.ag ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("pa", player.row.pa, player.statMods.pa ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ar", player.row.ar, player.statMods.ar ?? 0))}</td>
              <td class="skills-cell">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</td>
              <td>${playerCurrentCost(player.row, player, true)}k</td>
              <td>${escapeHtml(playerStatusText(player))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

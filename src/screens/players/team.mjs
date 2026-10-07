/** A coach's saved team in Matchday, with navigation but no roster mutations. */
import { errorText } from "../../core/api.mjs";
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { pageUrl, playerUrl } from "../../core/routes.mjs";
import { advancementRanks, advancementTypeLabels } from "../../domain/league-rules.mjs";
import { countToNumber, PLAYER_STATS, statValueForDisplayByStat } from "../../domain/roster/values.mjs";
import { hasBribery } from "../../domain/roster/team-rules.mjs";
import { ensureDraftPlayers, favouredSkillNames, normalizePlayerAdvancements, selectedRosterPlayers, skillNamesForPlayer } from "../../domain/roster/players.mjs";
import { calculateRosterCosts, playerCurrentCost } from "../../domain/roster/costs.mjs";
import { playerAvailableSpp, rosterTotalSpp } from "../../domain/roster/progression.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderCaptainBadge, renderPlayerLink, renderRosterLinks } from "../../components/content-links.mjs";
import { ensureDraftLeagueChoice, playerStatusText, renderTeamRuleAccess, rosterWarnings } from "../../components/roster-editor-shared.mjs";
import { renderMatchdayEditor } from "../../components/roster-editor/matchday-layout.mjs";
import { LEAGUE_MODE } from "../../components/roster-editor/modes.mjs";
import { renderSummaryPanel } from "../../components/roster-editor/summary-panel.mjs";
import { renderSppControls } from "../../components/roster-editor/spp-controls.mjs";
import { renderPlayerLevel } from "../../components/roster-editor/advancement-controls.mjs";
import { renderDedicatedFansLine, renderHiredStaffLines, renderStaffControl } from "../../components/roster-editor/staff-control.mjs";
import { normalizeSavedRoster } from "../../data/roster-draft.mjs";

export async function renderPublicTeamProfile(userId, teamId) {
  setActiveNav("players");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), "", { back: true, backFallback: playerUrl(userId) })}
    <div class="loading">${t("myTeams.loadingTeam")}</div>`;
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewSavedTeams")}</div>`;
    return;
  }
  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}`);
    const draft = normalizeSavedRoster(payload.team);
    const team = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? state.data.teams[0];
    ensureDraftLeagueChoice(team, draft);
    ensureDraftPlayers(team, draft);
    const costs = calculateRosterCosts(team, draft);
    view.innerHTML = `
      <div class="matchday-editor matchday-public">
        ${renderHeader(`${t("sidebar.teamHeading")} "${payload.team.name}"`, `${t("admin.coachHeading")}: ${payload.user.login}`, "", { back: true, backFallback: playerUrl(payload.user) })}
        ${renderMatchdayEditor({ team, draft, costs, mode: LEAGUE_MODE, readOnly: true,
          identityHtml: `<section class="public-team-coach-block"><h2>${t("admin.coachHeading")}</h2><p>${renderPlayerLink(payload.user)}</p>${renderTeamRuleAccess(team, draft, "", { readOnly: true })}</section>`,
          summaryHtml: renderPublicTeamSummary(team, draft, costs),
          purchasesHtml: renderPublicTeamResources(team, draft),
          playersHtml: renderPublicTeamPlayers(team, draft),
        })}
      </div>`;
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), "", { back: true, backFallback: playerUrl(userId) })}
      <div class="empty-state">${escapeHtml(errorText(error))}</div>`;
  }
}

function renderPublicTeamSummary(team, draft, costs) {
  return renderSummaryPanel({
    className: "builder-summary saved-roster-summary-panel side-panel",
    teamTitle: team.title,
    teamHref: pageUrl(team),
    statusHtml: `<p class="matchday-readonly-label">${t("roster.readOnly")}</p>`,
    rows: [
      { label: t("savedRoster.activePlayers"), value: costs.playersCount },
      { label: t("savedRoster.totalPlayers"), value: costs.totalPlayersCount },
      { label: t("savedRoster.startingRerolls"), value: countToNumber(draft.startingRerolls) },
      { label: t("savedRoster.teamRerolls"), value: countToNumber(draft.teamRerolls) },
      ...(hasBribery(team) ? [{ label: t("savedRoster.bribes"), value: countToNumber(draft.bribes) }] : []),
      { label: t("savedRoster.dedicatedFans"), value: countToNumber(draft.dedicatedFans) },
      { label: t("savedRoster.treasury"), value: `${countToNumber(draft.treasury)}k`, valueAttributes: "data-treasury-display" },
      { label: t("savedRoster.totalSppLabel"), value: `${rosterTotalSpp(team, draft)} SPP`, valueAttributes: "data-total-spp-display" },
      { label: t("savedRoster.playersCost"), value: `${costs.playersCost}k` },
      { label: t("savedRoster.staffCost"), value: `${costs.staffCost}k` },
      { label: t("roster.totalCost"), value: `${costs.total}k` },
    ],
    warnings: rosterWarnings(team, draft, costs),
    actionsHtml: "",
  });
}

function renderPublicMoney(title, description, value) {
  return `<div class="builder-addon compact-staff-control roster-purchase-card roster-money-card">
    <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>
    <output class="table-input matchday-money-value">${countToNumber(value)}k</output>
  </div>`;
}

function renderPublicTeamResources(team, draft) {
  const options = { mode: LEAGUE_MODE, readOnly: true };
  return `<div class="roster-purchases-layout">
    <section class="roster-controls-panel side-panel">
      <h2>${t("roster.teamResourcesHeading")}</h2>
      <div class="builder-tracker-list roster-resource-list">
        ${renderDedicatedFansLine({ draft, ...options })}
        ${renderPublicMoney(t("roster.treasuryTitle"), t("roster.treasuryDescription"), draft.treasury)}
        ${renderPublicMoney("Coach's Safe", t("roster.coachesSafeDescription"), draft.coachesSafe)}
      </div>
    </section>
    <section class="roster-controls-panel side-panel">
      <h2>${t("roster.purchasesHeading")}</h2>
      <div class="builder-tracker-list roster-tracker-list">
        ${renderStaffControl({ key: "startingRerolls", title: t("savedRoster.startingRerolls"), value: draft.startingRerolls, ...options })}
        ${renderStaffControl({ key: "teamRerolls", title: t("savedRoster.teamRerolls"), value: draft.teamRerolls, ...options })}
        ${renderHiredStaffLines({ team, draft, ...options })}
      </div>
    </section>
  </div>`;
}

function renderPublicTeamPlayers(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) return `<div class="builder-empty-roster">${t("savedRoster.noPlayersYet")}</div>`;
  return `<div class="matchday-player-list">${players.map((player, index) => renderPublicPlayerCard(team, player, index)).join("")}</div>`;
}

function renderPublicPlayerCard(team, player, index) {
  return `<article class="saved-roster-player-card mobile-roster-player-card matchday-player-card is-preview ${player.skipNextGame ? "is-skipped" : ""}">
    <div class="matchday-card-top">
      <span class="matchday-jersey">${escapeHtml(String(player.number ?? index + 1))}</span>
      <span>${escapeHtml(player.row.position)}</span><strong>${playerCurrentCost(player.row, player, true)}k</strong>
    </div>
    <header><div class="mobile-player-title">
      <h3 class="matchday-player-name">${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}</h3>
      <small>${escapeHtml(playerStatusText(player))}</small>
    </div></header>
    <section class="mobile-player-section">
      <h3>${t("roster.statsHeading")}</h3>
      ${renderPublicPlayerStats(player)}
    </section>
    <section class="mobile-player-section">
      <h3>${t("roster.skillsLabel")}</h3>
      <div class="mobile-player-pills">${renderRosterLinks(skillNamesForPlayer(player.row, player), favouredSkillNames(player.row, player))}${player.isCaptain ? renderCaptainBadge() : ""}</div>
    </section>
    ${renderPublicPlayerDetails(team, player)}
    <details class="matchday-player-spp">
      <summary><span>${t("roster.sppAvailable")}</span><strong data-player-available-spp>${playerAvailableSpp(team, player)}</strong></summary>
      <div class="matchday-player-spp-body">${renderSppControls(team, player, { readOnly: true })}</div>
    </details>
  </article>`;
}

function renderPublicPlayerStats(player) {
  return `<div class="player-stat-editors readonly-stat-line">${PLAYER_STATS.map(stat => {
    const mod = Number(player.statMods?.[stat] ?? 0);
    return `<div class="player-stat-editor ${mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : ""}">
      <span>${stat.toUpperCase()}</span><strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], mod))}</strong>
    </div>`;
  }).join("")}</div>`;
}

function renderPublicPlayerDetails(team, player) {
  const flags = [["roster.captain", player.isCaptain], ["roster.skipNextGame", player.skipNextGame], ["roster.niglingInjury", player.niglingInjury]];
  const advancements = normalizePlayerAdvancements(player.advancements);
  return `<details class="matchday-player-details">
    <summary>${t("roster.playerDetails")}</summary>
    <div class="mobile-player-checks">${flags.map(([key, value]) => `<label class="table-checkbox"><input type="checkbox" disabled ${value ? "checked" : ""}><span>${t(key)}</span></label>`).join("")}</div>
    <section class="mobile-player-section">
      <h3>${t("roster.extendedContracts")}</h3>
      <div class="mini-stepper matchday-contract-value"><button type="button" disabled>−</button><strong>${countToNumber(player.extendedContracts)}</strong><button type="button" disabled>+</button></div>
    </section>
    <section class="mobile-player-section">
      <h3>${t("roster.levelHeader")}</h3>
      ${renderPlayerLevel(team, player)}
      <div class="mobile-player-pills">${advancements.map((advancement, index) => `<span class="roster-pill advancement-pill">${escapeHtml(`${index + 1}. ${advancementTypeLabels[advancement.type] ?? advancement.type}: ${advancementRanks[index]?.costs?.[advancement.type] ?? 0} SPP`)}</span>`).join("")}</div>
    </section>
  </details>`;
}

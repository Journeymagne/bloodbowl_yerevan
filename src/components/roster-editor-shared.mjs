/**
 * Bits the builder and the saved-roster editor both need: a team's
 * league/Favoured-Of panel, the domain-violation codes rendered as text,
 * and the roster export text used by both "copy roster" buttons.
 *
 * Mechanically moved out of src/app.js. `renderTeamRuleAccess` and its
 * `ensureDraft*`/`sanitizeFavouredSkillsForTeam` helpers are also called
 * from the public team profile in app.js, so this stays a components/
 * module rather than living inside either screen.
 *
 * These are the kind of duplicate-shaped pairs design spec section 5.1
 * counts (`renderRosterStaffControl`/`renderBuilderStaffControl` and
 * friends, which stay screen-local because they are *not* actually
 * called from both sides) — task 7 is where the two editors merge, not
 * this move.
 */
import { escapeHtml, renderOption } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { medicalStaffDefinitions } from "../domain/league-rules.mjs";
import { calculateRosterCosts } from "../domain/roster/costs.mjs";
import { normalizePlayerExtraSkills, normalizePlayerFavouredSkills, selectedRosterPlayers, skillNamesForPlayer } from "../domain/roster/players.mjs";
import { favouredSkillsForChoice, ruleLookupKey, teamFavouredOptions, teamLeagueOptions, teamSpecialRuleTokens } from "../domain/roster/team-rules.mjs";
import { validateRoster } from "../domain/roster/validate.mjs";
import { parseAccessCodes, rowCost, rowsForTeam, statValueForDisplayByStat } from "../domain/roster/values.mjs";
import { renderRuleLinks } from "./content-links.mjs";

export function playerStatusText(player) {
  const statuses = [];
  if (player.isCaptain) statuses.push(t("roster.captain"));
  if (player.skipNextGame) statuses.push(t("admin.skipNextGameStatus"));
  if (player.niglingInjury) statuses.push(t("roster.niglingInjury"));
  return statuses.join(", ") || "-";
}

export function ensureDraftLeagueChoice(team, draft) {
  const options = teamLeagueOptions(team);
  if (!options.length) {
    draft.selectedLeague = "";
    return "";
  }
  const current = options.find((option) => ruleLookupKey(option) === ruleLookupKey(draft.selectedLeague));
  draft.selectedLeague = current ?? options[0];
  return draft.selectedLeague;
}

export function ensureDraftFavouredChoice(team, draft) {
  const options = teamFavouredOptions(team);
  if (!options.length) {
    draft.favouredChoice = "";
    return "";
  }
  const current = options.find((option) => ruleLookupKey(option) === ruleLookupKey(draft.favouredChoice));
  draft.favouredChoice = current ?? options[0];
  return draft.favouredChoice;
}

export function favouredSkillOptionsForPlayer(team, draft, row, player) {
  const choice = ensureDraftFavouredChoice(team, draft);
  if (!choice) return [];
  const taken = new Set(skillNamesForPlayer(row, player));
  return favouredSkillsForChoice(choice)
    .filter((name) => !taken.has(name))
    .map((name) => ({ name, access: "favoured", alignment: choice }));
}

export function sanitizeFavouredSkillsForTeam(team, draft) {
  const choice = ensureDraftFavouredChoice(team, draft);
  const allowed = new Set(favouredSkillsForChoice(choice));
  (draft.players ?? []).forEach((player) => {
    const row = rowsForTeam(team)[player.rowIndex];
    if (!row) return;
    const regularSkills = new Set([
      ...(row.skills ?? []),
      ...normalizePlayerExtraSkills(row, player.extraSkills ?? []).map((skill) => skill.name),
    ]);
    player.favouredSkills = normalizePlayerFavouredSkills(row, player.favouredSkills ?? [])
      .filter((skill) => allowed.has(skill.name) && !regularSkills.has(skill.name));
  });
}

export function renderTeamRuleAccess(team, draft, controlName = "") {
  const leagueOptions = teamLeagueOptions(team);
  const selectedLeague = ensureDraftLeagueChoice(team, draft);
  const favouredOptions = teamFavouredOptions(team);
  const selectedFavoured = ensureDraftFavouredChoice(team, draft);
  const specialRules = teamSpecialRuleTokens(team);
  return `
    <section class="team-rules-panel">
      <div class="team-rules-row">
        <span>${t("roster.tier")}</span>
        <strong>${escapeHtml(team.team?.meta?.league ?? "-")}</strong>
      </div>
      <div class="team-rules-row">
        <span>${t("roster.leagueAccess")}</span>
        ${leagueOptions.length > 1 ? `
          <select ${controlName ? `data-${controlName}-league` : ""}>
            ${leagueOptions.map((option) => renderOption(option, option, selectedLeague)).join("")}
          </select>
        ` : `<div class="rule-link-list">${renderRuleLinks(leagueOptions)}</div>`}
      </div>
      <div class="team-rules-row team-rules-row-wide">
        <span>${t("roster.specialRules")}</span>
        <div class="rule-link-list">${renderRuleLinks(specialRules)}</div>
      </div>
      ${favouredOptions.length ? `
        <div class="team-rules-row">
          <span>${t("roster.favouredOf")}</span>
          ${favouredOptions.length > 1 ? `
            <select ${controlName ? `data-${controlName}-favoured` : ""}>
              ${favouredOptions.map((option) => renderOption(option, option, selectedFavoured)).join("")}
            </select>
          ` : `<strong>${escapeHtml(selectedFavoured)}</strong>`}
        </div>
      ` : ""}
    </section>
  `;
}

export function renderAccessCell(values = []) {
  const access = parseAccessCodes(values).join(" ");
  return escapeHtml(access || "-");
}

export function renderRosterStatCells(row) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => `<td class="stat-table-cell">${escapeHtml(row[stat] || "-")}</td>`)
    .join("");
}

function warningMessages(violations) {
  return violations.map((violation) => t(`validation.${violation.code}`, violation.params));
}

export function rosterWarnings(team, draft, costs) {
  return warningMessages(validateRoster(team, draft, costs));
}


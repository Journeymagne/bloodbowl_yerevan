/**
 * The season's registration tab: the signed-in coach's "commit a team"
 * panel, the admin's "add a saved team" shortcut, and the entries list.
 *
 * Mechanically moved out of src/app.js, with one deliberate change:
 * `wireRegistration` used to call `renderSeason(false)` directly; it now
 * takes the re-render as a `rerender` callback so this module and
 * screens/season/index.mjs don't import each other — the same shape as
 * components/filters.mjs's `wireFilters`.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { renderPlayerLink } from "../../components/content-links.mjs";
import { seasonTeamProfileLink, seasonTeamRulesLink } from "./season-links.mjs";
import { replaceSeasonData } from "./season-data.mjs";

export function renderSeasonRegistration(data) {
  return `
    <div class="season-registration-layout">
      <div class="season-registration-top">
        ${renderSeasonCommitPanel(data)}
        ${state.auth.currentUser?.isAdmin ? renderSeasonRegistrationAdminPanel(data) : ""}
      </div>
      <section class="content-panel season-card season-registered-panel">
        <h2>${t("season.registeredTeamsHeading")}</h2>
        ${renderSeasonEntriesTable(data, Boolean(state.auth.currentUser?.isAdmin))}
      </section>
    </div>
  `;
}

export function availableSeasonSavedTeams(data) {
  const admin = data.admin ?? { savedTeams: [] };
  const committedTeamIds = new Set((data.entries ?? []).map((entry) => entry.team.id));
  const committedUserIds = new Set((data.entries ?? []).map((entry) => entry.user.id));
  return admin.savedTeams.filter((team) => !committedTeamIds.has(team.id) && !committedUserIds.has(team.owner.id));
}

function renderSeasonRegistrationAdminPanel(data) {
  const availableSavedTeams = availableSeasonSavedTeams(data);
  return `
    <section class="content-panel season-card">
      <h2>${t("season.adminRegistrationHeading")}</h2>
      ${availableSavedTeams.length ? `
        <p>${t("season.addSavedTeamNote")}</p>
        <div class="season-action-row">
          <label class="filter-field">
            <span>${t("season.savedTeamField")}</span>
            <select data-season-admin-team>
              ${availableSavedTeams.map((team) => renderOption(team.id, `${team.owner.login} · ${team.name}`, "")).join("")}
            </select>
          </label>
          <button class="primary-button" type="button" data-season-admin-add-team>${t("season.addTeamAction")}</button>
        </div>
      ` : `<p>${t("season.noEligibleSavedTeams")}</p>`}
    </section>
  `;
}

function renderSeasonCommitPanel(data) {
  const myEntry = data.myEntry;
  const teams = data.myTeams ?? [];
  if (myEntry) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.yourTeamHeading")}</h2>
        <div class="season-committed-team">
          ${myEntry.team.logoData ? `<img src="${escapeHtml(myEntry.team.logoData)}" alt="">` : ""}
          <div>
            <strong>${escapeHtml(myEntry.team.name)}</strong>
            <p>${seasonTeamRulesLink(myEntry)}</p>
            <p class="muted-text">${t("season.committedAs")} ${escapeHtml(myEntry.user.login)}.</p>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="content-panel season-card">
      <h2>${t("season.commitTeamHeading")}</h2>
      ${teams.length ? `
        <p>${t("season.selectSavedTeamNote")}</p>
        <div class="season-action-row">
          <label class="filter-field">
            <span>${t("season.savedTeamField")}</span>
            <select data-season-commit-team>
              ${teams.map((team) => renderOption(team.id, team.name, "")).join("")}
            </select>
          </label>
          <button class="primary-button" type="button" data-season-commit>${t("season.commitAction")}</button>
        </div>
      ` : `
        <p>${t("myTeams.noSavedTeams")}</p>
        <a class="primary-button" href="#/builder">${t("myTeams.createTeam")}</a>
      `}
    </section>
  `;
}

export function renderSeasonEntriesTable(data, adminActions = false) {
  const entries = data.entries ?? [];
  if (!entries.length) return `<p>${t("season.noTeamsCommittedYet")}</p>`;
  return `
    <div class="table-scroll">
      <table class="compact-roster-table season-table">
        <thead>
          <tr>
            <th>${t("admin.coachHeading")}</th>
            <th>${t("sidebar.teamHeading")}</th>
            <th>${t("myTeams.table.rules")}</th>
            ${adminActions ? `<th>${t("roster.actionHeader")}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => `
            <tr>
              <td>${renderPlayerLink(entry.user)}</td>
              <td><strong>${seasonTeamProfileLink(entry)}</strong></td>
              <td>${seasonTeamRulesLink(entry)}</td>
              ${adminActions ? `<td><button class="filter-button compact-action" type="button" data-season-remove-entry="${escapeHtml(entry.id)}">${t("common.remove")}</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function wireRegistration(rerender) {
  view.querySelector("[data-season-commit]")?.addEventListener("click", async () => {
    const teamId = view.querySelector("[data-season-commit-team]")?.value;
    if (!teamId) return;
    try {
      replaceSeasonData(await apiRequest("/api/season/commit", {
        method: "POST",
        body: JSON.stringify({ teamId }),
      }));
      rerender();
    } catch (error) {
      alert(error.message);
    }
  });
}

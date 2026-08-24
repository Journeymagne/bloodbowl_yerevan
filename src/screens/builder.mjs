/**
 * The team builder: `#/builder`, a fresh team creation flow.
 *
 * Mechanically moved out of src/app.js. This is the other of the two
 * "roster editor" implementations design spec section 5.1 counts —
 * screens/saved-roster.mjs is the other. Task 7 merges them; this task
 * only relocates the code as-is.
 */
import { escapeHtml, renderOption } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { storage } from "../core/storage.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes, optimizeLogoDataUrl } from "../core/logo-upload.mjs";
import { pageUrl } from "../core/routes.mjs";
import { builderStaffCosts, builderStaffMaximums, startingBudget } from "../domain/league-rules.mjs";
import { clamp, countToNumber, rowCost, rowsForTeam, statValueForDisplayByStat } from "../domain/roster/values.mjs";
import { availableMedicalStaffDefinitions, hasBribery } from "../domain/roster/team-rules.mjs";
import {
  ensureDraftPlayers,
  rowCountInPlayers,
  selectedRosterPlayers,
  setRosterCaptain,
  skillNamesForPlayer,
  syncRosterCountsFromPlayers,
} from "../domain/roster/players.mjs";
import { calculateRosterCosts, syncMedicalStaffForTeam } from "../domain/roster/costs.mjs";
import { createBuilderDraftStore, isEmptyBuilderDraft } from "../data/builder-draft.mjs";
import { builderPayload, emptyBuilderState, resetBuilderForTeam } from "../data/roster-draft.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { renderRosterLinks } from "../components/content-links.mjs";
import { CREATE_MODE } from "../components/roster-editor/modes.mjs";
import { confirmRaceChange, restoreTeamSelect } from "../components/roster-editor/team-change.mjs";
import { renderHirePanel, wireHirePanel } from "../components/roster-editor/hire-panel.mjs";
import {
  ensureDraftLeagueChoice,
  renderTeamRuleAccess,
  rosterWarnings,
  sanitizeFavouredSkillsForTeam,
} from "../components/roster-editor-shared.mjs";

const autosaveDelayMs = 450;
const builderDraftStore = createBuilderDraftStore({ storage, debounceMs: autosaveDelayMs });

/** Adopt a stored draft when the builder is opened with nothing in it. */
function restoreBuilderDraft() {
  if (!isEmptyBuilderDraft(state.builder)) return false;
  const teams = state.data.teams;
  const stored = builderDraftStore.read((slug) => teams.some((item) => item.slug === slug));
  if (!stored) return false;
  state.builder = { ...emptyBuilderState(), ...stored, editingTeamId: "" };
  return true;
}
export function renderBuilder() {
  setActiveNav("builder");
  setViewSection("teams");
  const teams = state.data.teams;
  if (state.builder.editingTeamId) {
    resetBuilderForTeam(teams[0]);
  }
  const restoredDraft = restoreBuilderDraft();
  if (!state.builder.teamSlug && teams[0]) {
    state.builder.teamSlug = teams[0].slug;
    state.builder.teamName = teams[0].title;
  }
  const team = teams.find((item) => item.slug === state.builder.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, state.builder);
  syncMedicalStaffForTeam(team, state.builder);
  ensureDraftPlayers(team, state.builder);
  sanitizeFavouredSkillsForTeam(team, state.builder);
  const costs = calculateBuilderCosts(team);
  const warnings = builderWarnings(team, costs);

  view.innerHTML = `
    ${renderHeader(t("nav.builder"), t("builder.subtitle"), `<button class="filter-button" type="button" data-builder-reset>${t("builder.startOver")}</button>`)}
    ${restoredDraft ? `<p class="notice-box" data-builder-restored>${t("builder.draftRestored")}</p>` : ""}
    ${renderBuilderInfoPanel(team, teams, costs, warnings)}
    <div class="builder-layout builder-layout-main">
      <section class="builder-panel">
        <section class="builder-pool">
          <h2>${t("builder.availablePlayers")}</h2>
          ${renderHirePanel(team, state.builder, CREATE_MODE)}
        </section>

        <section class="builder-selected">
          <h2>${t("savedRoster.rosterHeading")}</h2>
          ${renderBuilderPlayerList(team, state.builder)}
        </section>
      </section>
    </div>
  `;
  wireBuilder(team);
}
function renderBuilderInfoPanel(team, teams, costs, warnings) {
  return `
    <section class="builder-info-panel side-panel">
      <div class="builder-info-section builder-info-identity">
        <div class="builder-form builder-identity-form">
          <label class="filter-field">
            <span>${t("sidebar.teamHeading")}</span>
            <select data-builder-team>
              ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.teamName")}</span>
            <input type="text" value="${escapeHtml(state.builder.teamName || team.title)}" data-builder-name>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.logoField")}</span>
            <input type="file" accept="image/*" data-builder-logo>
          </label>
        </div>
        ${state.builder.logoData ? `
          <div class="builder-logo-inline roster-logo-inline">
            <img class="builder-logo-preview" src="${escapeHtml(state.builder.logoData)}" alt="">
            <button class="filter-button compact-action" type="button" data-builder-remove-logo>${t("savedRoster.removeLogo")}</button>
          </div>
        ` : ""}
        ${renderTeamRuleAccess(team, state.builder, "builder")}
      </div>
      <div class="builder-info-grid">
        <div class="builder-info-section builder-info-summary">
          <div class="summary-title-block">
            <h3>${t("savedRoster.summaryTitle")}</h3>
            <a class="builder-team-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>
          </div>
          <dl class="stat-list summary-stat-grid">
            <dt>${t("myTeams.table.players")}</dt><dd>${costs.totalPlayersCount}</dd>
            <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(state.builder.dedicatedFans)}</dd>
            ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(state.builder.bribes)}</dd>` : ""}
            <dt>${t("savedRoster.playersCost")}</dt><dd>${costs.playersCost}k</dd>
            <dt>${t("savedRoster.staffCost")}</dt><dd>${costs.staffCost}k</dd>
            <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
            <dt>${t("builder.remaining")}</dt><dd class="${costs.remaining < 0 ? "danger-text" : ""}">${costs.remaining}k</dd>
          </dl>
          <div class="summary-state-block">
            ${warnings.length ? `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : `<div class="builder-ok">${t("savedRoster.withinLimits")}</div>`}
            <div class="summary-actions">
              <button class="primary-button" type="button" data-save-team ${costs.total > startingBudget || !state.builder.players.length ? "disabled" : ""}>${t("builder.saveTeam")}</button>
            </div>
          </div>
        </div>
        <div class="builder-info-section builder-info-purchases">
          <h2>${t("roster.purchasesHeading")}</h2>
          <div class="builder-tracker-list roster-tracker-list" aria-label="${t("roster.startingRosterTrackersAriaLabel")}">
            <div class="builder-addon compact-staff-control builder-tracker-control">
              <div>
                <strong>${t("savedRoster.startingRerolls")}</strong>
                <span>60k ${t("roster.each")}</span>
              </div>
              <div class="inline-stepper-control">
                <button class="filter-button" type="button" data-builder-reroll="-1" ${state.builder.startingRerolls <= 0 ? "disabled" : ""}>-</button>
                <strong>${state.builder.startingRerolls}</strong>
                <button class="filter-button" type="button" data-builder-reroll="1" ${costs.total + builderStaffCosts.startingRerolls > startingBudget ? "disabled" : ""}>+</button>
              </div>
            </div>
            ${renderBuilderStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), state.builder.dedicatedFans, costs.total + builderStaffCosts.dedicatedFans > startingBudget)}
            ${hasBribery(team) ? renderBuilderStaffControl("bribes", t("savedRoster.bribes"), state.builder.bribes, costs.total + builderStaffCosts.bribes > startingBudget) : ""}
            ${renderBuilderStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), state.builder.assistantCoaches, costs.total + builderStaffCosts.assistantCoaches > startingBudget)}
            ${renderBuilderStaffControl("cheerleaders", t("savedRoster.cheerleaders"), state.builder.cheerleaders, costs.total + builderStaffCosts.cheerleaders > startingBudget)}
            ${availableMedicalStaffDefinitions(team).map((staff) => {
              const blocked = costs.total + (builderStaffCosts[staff.key] ?? 0) > startingBudget;
              return renderBuilderStaffControl(staff.key, staff.title, state.builder[staff.key], blocked);
            }).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}
function renderBuilderStaffControl(key, title, value, plusBlocked = false) {
  const max = builderStaffMaximums[key] ?? 6;
  const current = countToNumber(value);
  const cost = builderStaffCosts[key] ?? 0;
  return `
    <div class="builder-addon compact-staff-control builder-tracker-control">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${cost}k${max > 1 ? ` ${t("roster.each")}` : ""}</span>
      </div>
      <div class="inline-stepper-control">
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="-1" ${current <= 0 ? "disabled" : ""}>-</button>
        <strong>${current}</strong>
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="1" ${current >= max || plusBlocked ? "disabled" : ""}>+</button>
      </div>
    </div>
  `;
}
function renderPlayerStatCells(player) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => {
      const value = statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0);
      return `<td class="stat-table-cell">${escapeHtml(value)}</td>`;
    })
    .join("");
}
function renderBuilderPlayerList(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) {
    return `<div class="builder-empty-roster">${t("builder.emptyRosterHint")}</div>`;
  }
  return `
    <div class="table-scroll builder-table-scroll builder-selected-table-wrap">
      <table class="builder-selected-table compact-roster-table">
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
            <th>${t("roster.captain")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => renderBuilderPlayerRow(player, index)).join("")}
        </tbody>
      </table>
    </div>
    <div class="builder-mobile-card-list builder-selected-mobile-list">
      ${players.map((player, index) => renderBuilderPlayerCard(player, index)).join("")}
    </div>
  `;
}
function renderBuilderPlayerRow(player, index) {
  return `
    <tr>
      <td>${index + 1}</td>
      <td>
        <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-builder-player-name="${escapeHtml(player.id)}">
      </td>
      <td><strong>${escapeHtml(player.row.position)}</strong></td>
      ${renderPlayerStatCells(player)}
      <td>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </td>
      <td class="skills-cell">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</td>
      <td>${escapeHtml(rowCost(player.row) || "-")}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}
function renderBuilderPlayerStatGrid(player) {
  const value = (stat) => statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0);
  return `
    <dl class="team-stat-grid">
      <div><dt>MA</dt><dd>${escapeHtml(value("ma"))}</dd></div>
      <div><dt>ST</dt><dd>${escapeHtml(value("st"))}</dd></div>
      <div><dt>AG</dt><dd>${escapeHtml(value("ag"))}</dd></div>
      <div><dt>PA</dt><dd>${escapeHtml(value("pa"))}</dd></div>
      <div><dt>AR</dt><dd>${escapeHtml(value("ar"))}</dd></div>
    </dl>
  `;
}
function renderBuilderPlayerCard(player, index) {
  return `
    <article class="saved-roster-player-card mobile-roster-player-card builder-selected-player-card">
      <header>
        <div class="mobile-player-title">
          <span>#${index + 1}</span>
          <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-builder-player-name="${escapeHtml(player.id)}">
          <small>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row) || "-")}</small>
        </div>
        <button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button>
      </header>
      <section class="mobile-player-section">
        <h3>${t("roster.statsLabel")}</h3>
        ${renderBuilderPlayerStatGrid(player)}
      </section>
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</div>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </section>
    </article>
  `;
}
function calculateBuilderCosts(team) {
  return calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
}
function builderWarnings(team, costs) {
  return rosterWarnings(team, state.builder, costs);
}
function wireBuilder(team) {
  // Any control in the builder mutates state.builder directly, so listening on
  // the container is enough to know something changed.
  const persistDraft = () => builderDraftStore.save(state.builder);
  for (const event of ["input", "click", "change"]) view.addEventListener(event, persistDraft);
  view.querySelector("[data-builder-reset]")?.addEventListener("click", () => {
    if (!isEmptyBuilderDraft(state.builder) && !confirm(t("builder.startOverConfirm"))) return;
    builderDraftStore.clear();
    resetBuilderForTeam(state.data.teams[0]);
    renderBuilder();
  });
  view.querySelector("[data-builder-team]")?.addEventListener("change", (event) => {
    const select = event.currentTarget;
    const nextTeam = state.data.teams.find((item) => item.slug === select.value);
    if (!nextTeam) return;
    if (!confirmRaceChange(team, state.builder, nextTeam)) {
      restoreTeamSelect(select, team.slug);
      return;
    }
    state.builder.teamSlug = nextTeam.slug;
    resetBuilderForTeam(nextTeam);
    renderBuilder();
  });
  view.querySelector("[data-builder-league]")?.addEventListener("change", (event) => {
    state.builder.selectedLeague = event.currentTarget.value;
  });
  view.querySelector("[data-builder-favoured]")?.addEventListener("change", (event) => {
    state.builder.favouredChoice = event.currentTarget.value;
  });
  view.querySelector("[data-builder-name]")?.addEventListener("input", (event) => {
    state.builder.teamName = event.currentTarget.value;
  });
  view.querySelector("[data-builder-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      alert(t("savedRoster.logoTooLarge"));
      event.currentTarget.value = "";
      return;
    }
    state.builder.logoData = await fileToOptimizedLogoDataUrl(file);
    renderBuilder();
  });
  view.querySelector("[data-builder-remove-logo]")?.addEventListener("click", () => {
    state.builder.logoData = "";
    renderBuilder();
  });
  wireHirePanel(view, { team, draft: state.builder, mode: CREATE_MODE, onChange: renderBuilder });
  view.querySelectorAll("[data-remove-player]").forEach((button) => {
    button.addEventListener("click", () => {
      state.builder.players = state.builder.players.filter((player) => player.id !== button.dataset.removePlayer);
      syncRosterCountsFromPlayers(state.builder);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-player-name]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const player = state.builder.players.find((item) => item.id === input.dataset.builderPlayerName);
      if (player) player.name = event.currentTarget.value;
    });
  });
  view.querySelectorAll("[data-builder-player-captain]").forEach((input) => {
    input.addEventListener("change", (event) => {
      setRosterCaptain(state.builder, input.dataset.builderPlayerCaptain, event.currentTarget.checked);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.builderReroll);
      const next = clamp(countToNumber(state.builder.startingRerolls) + delta, 0, builderStaffMaximums.startingRerolls);
      const previous = countToNumber(state.builder.startingRerolls);
      const projected = calculateRosterCosts(team, { ...state.builder, startingRerolls: next }, { includeDedicatedFans: true }).total;
      if (projected > startingBudget && next > previous) return;
      state.builder.startingRerolls = next;
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-staff]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.builderStaff;
      const delta = Number(button.dataset.builderStaffStep);
      const max = builderStaffMaximums[key] ?? 6;
      const next = clamp(countToNumber(state.builder[key]) + delta, 0, max);
      const previous = countToNumber(state.builder[key]);
      const projected = calculateRosterCosts(team, { ...state.builder, [key]: next }, { includeDedicatedFans: true }).total;
      if (projected > startingBudget && next > previous) return;
      state.builder[key] = next;
      renderBuilder();
    });
  });
  view.querySelector("[data-save-team]")?.addEventListener("click", () => saveTeam(team));
}
async function saveTeam(team) {
  if (!state.auth.currentUser) {
    openAuthModal("login");
    return;
  }
  syncRosterCountsFromPlayers(state.builder);
  const payload = builderPayload(team);
  payload.logoData = await optimizeLogoDataUrl(payload.logoData);
  state.builder.logoData = payload.logoData;
  const startupCosts = calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
  payload.treasury = Math.max(0, startingBudget - startupCosts.total);
  const request = {
    name: payload.teamName,
    baseTeamSlug: team.slug,
    logoData: payload.logoData,
    roster: payload,
  };
  try {
    const result = await apiRequest("/api/teams", {
      method: "POST",
      body: JSON.stringify(request),
    });
    state.builder.editingTeamId = result.team.id;
    builderDraftStore.clear();
    state.myTeams.loaded = false;
    const button = view.querySelector("[data-save-team]");
    if (button) {
      button.textContent = t("roster.savedStatus");
      setTimeout(() => {
        location.hash = `#/my-teams/${encodeURIComponent(result.team.id)}`;
      }, 700);
    }
  } catch (error) {
    alert(error.message);
  }
}

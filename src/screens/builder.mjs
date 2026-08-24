/**
 * The team builder: `#/builder`, a fresh team creation flow.
 *
 * Mechanically moved out of src/app.js. This is the other of the two
 * "roster editor" implementations design spec section 5.1 counts —
 * screens/saved-roster.mjs is the other. Task 7 merges them; this task
 * only relocates the code as-is.
 */
import { escapeHtml, listenerGroup, renderOption } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { storage } from "../core/storage.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes, optimizeLogoDataUrl } from "../core/logo-upload.mjs";
import { pageUrl } from "../core/routes.mjs";
import { onScreenLeave } from "../core/screen-lifecycle.mjs";
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
import { renderSummaryPanel } from "../components/roster-editor/summary-panel.mjs";
import { confirmRaceChange, restoreTeamSelect } from "../components/roster-editor/team-change.mjs";
import { renderHirePanel, wireHirePanel } from "../components/roster-editor/hire-panel.mjs";
import {
  ensureDraftLeagueChoice,
  renderTeamRuleAccess,
  rosterWarnings,
  sanitizeFavouredSkillsForTeam,
} from "../components/roster-editor-shared.mjs";
import { toast, toastError } from "../components/toast.mjs";
import { confirmAction } from "../components/dialog.mjs";

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
function renderBuilderSummary(team, costs, warnings) {
  return renderSummaryPanel({
    className: "builder-info-section builder-info-summary",
    teamTitle: team.title,
    teamHref: pageUrl(team),
    rows: [
      { label: t("myTeams.table.players"), value: costs.totalPlayersCount },
      { label: t("savedRoster.dedicatedFans"), value: countToNumber(state.builder.dedicatedFans) },
      ...(hasBribery(team) ? [{ label: t("savedRoster.bribes"), value: countToNumber(state.builder.bribes) }] : []),
      { label: t("savedRoster.playersCost"), value: `${costs.playersCost}k` },
      { label: t("savedRoster.staffCost"), value: `${costs.staffCost}k` },
      { label: t("roster.totalCost"), value: `${costs.total}k` },
      { label: t("builder.remaining"), value: `${costs.remaining}k`, valueClass: costs.remaining < 0 ? "danger-text" : "" },
    ],
    warnings,
    actionsHtml: `
              <button class="primary-button" type="button" data-save-team ${costs.total > startingBudget || !state.builder.players.length ? "disabled" : ""}>${t("builder.saveTeam")}</button>
    `,
  });
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
        ${renderBuilderSummary(team, costs, warnings)}
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
                <button class="filter-button" type="button" data-builder-reroll="1" ${blockedAttributes(stepUpVerdict("startingRerolls", t("savedRoster.startingRerolls"), state.builder.startingRerolls, costs.total))}>+</button>
              </div>
            </div>
            ${renderBuilderStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), state.builder.dedicatedFans, costs.total)}
            ${hasBribery(team) ? renderBuilderStaffControl("bribes", t("savedRoster.bribes"), state.builder.bribes, costs.total) : ""}
            ${renderBuilderStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), state.builder.assistantCoaches, costs.total)}
            ${renderBuilderStaffControl("cheerleaders", t("savedRoster.cheerleaders"), state.builder.cheerleaders, costs.total)}
            ${availableMedicalStaffDefinitions(team)
              .map((staff) => renderBuilderStaffControl(staff.key, staff.title, state.builder[staff.key], costs.total))
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}
/**
 * Why one more of something cannot be bought, if it cannot.
 *
 * Step 7.6: the "+" used to be plain `disabled`, which says no without saying
 * why. Same shape as the hire pool's `hireVerdict` — the verdict is worked out
 * once and both the markup and the click handler read it, so the tooltip and
 * the message after a refused click can never drift apart.
 */
function stepUpVerdict(key, title, value, committedTotal) {
  const max = builderStaffMaximums[key] ?? 6;
  if (countToNumber(value) >= max) return { blocked: true, title: t("validation.STAFF_MAX", { title, max }) };
  if (committedTotal + (builderStaffCosts[key] ?? 0) > startingBudget) {
    return { blocked: true, title: t("validation.BUDGET_EXCEEDED", { budget: startingBudget, total: committedTotal }) };
  }
  return { blocked: false, title: "" };
}

/**
 * `aria-disabled` rather than `disabled`: a disabled button takes no click and
 * shows no tooltip, so its reason never reaches the coach. The handler turns
 * the refusal down instead, and says why.
 */
function blockedAttributes(verdict) {
  return verdict.blocked ? `aria-disabled="true" title="${escapeHtml(verdict.title)}"` : "";
}

function renderBuilderStaffControl(key, title, value, committedTotal = 0) {
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
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="1" ${blockedAttributes(stepUpVerdict(key, title, value, committedTotal))}>+</button>
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
/** The label each stepper carries, so a refusal can name what it refused. */
function stepperTitles(team) {
  const titles = {
    startingRerolls: t("savedRoster.startingRerolls"),
    dedicatedFans: t("savedRoster.dedicatedFans"),
    bribes: t("savedRoster.bribes"),
    assistantCoaches: t("savedRoster.assistantCoaches"),
    cheerleaders: t("savedRoster.cheerleaders"),
  };
  for (const staff of availableMedicalStaffDefinitions(team)) titles[staff.key] = staff.title;
  return titles;
}

/**
 * The reroll and staff steppers, both of which stop at the budget and at their
 * own maximum. Step 7.6: a refused click now says which of the two it was.
 */
function wireBuilderSteppers(team, events) {
  const titles = stepperTitles(team);

  const step = (key, delta) => {
    const current = countToNumber(state.builder[key]);
    if (delta > 0) {
      const committed = calculateRosterCosts(team, state.builder, { includeDedicatedFans: true }).total;
      const verdict = stepUpVerdict(key, titles[key] ?? key, current, committed);
      if (verdict.blocked) {
        toast(verdict.title, { tone: "error" });
        return;
      }
    }
    state.builder[key] = clamp(current + delta, 0, builderStaffMaximums[key] ?? 6);
    renderBuilder();
  };

  events.on("click", "[data-builder-reroll]", (event, button) => step("startingRerolls", Number(button.dataset.builderReroll)));
  events.on("click", "[data-builder-staff]", (event, button) => step(button.dataset.builderStaff, Number(button.dataset.builderStaffStep)));
}

function wireBuilder(team) {
  // Delegated to the container, which survives a re-render, so the group has to
  // be dropped when this runs again. It always did: the three persistDraft
  // listeners below sat on `view` and were added again on every render, so a
  // coach who had hired ten players was writing the draft to storage thirty
  // times per keystroke.
  const events = listenerGroup(view);
  onScreenLeave("builder:events", () => events.release());

  // Any control in the builder mutates state.builder directly, so listening on
  // the container is enough to know something changed.
  const persistDraft = () => builderDraftStore.save(state.builder);
  for (const eventName of ["input", "click", "change"]) events.on(eventName, "*", persistDraft);

  events.on("click", "[data-builder-reset]", async () => {
    if (!isEmptyBuilderDraft(state.builder) && !await confirmAction({
      message: t("builder.startOverConfirm"),
      confirmLabel: t("builder.startOver"),
      destructive: true,
    })) return;
    builderDraftStore.clear();
    resetBuilderForTeam(state.data.teams[0]);
    renderBuilder();
  });
  events.on("change", "[data-builder-team]", async (event, select) => {
    const nextTeam = state.data.teams.find((item) => item.slug === select.value);
    if (!nextTeam) return;
    if (!await confirmRaceChange(team, state.builder, nextTeam)) {
      restoreTeamSelect(select, team.slug);
      return;
    }
    state.builder.teamSlug = nextTeam.slug;
    resetBuilderForTeam(nextTeam);
    renderBuilder();
  });
  events.on("change", "[data-builder-league]", (event, select) => {
    state.builder.selectedLeague = select.value;
  });
  events.on("change", "[data-builder-favoured]", (event, select) => {
    state.builder.favouredChoice = select.value;
  });
  events.on("input", "[data-builder-name]", (event, input) => {
    state.builder.teamName = input.value;
  });
  events.on("change", "[data-builder-logo]", async (event, input) => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      toast(t("savedRoster.logoTooLarge"), { tone: "error" });
      input.value = "";
      return;
    }
    state.builder.logoData = await fileToOptimizedLogoDataUrl(file);
    renderBuilder();
  });
  events.on("click", "[data-builder-remove-logo]", () => {
    state.builder.logoData = "";
    renderBuilder();
  });
  events.own(wireHirePanel(view, { team, draft: state.builder, mode: CREATE_MODE, onChange: renderBuilder }));
  events.on("click", "[data-remove-player]", (event, button) => {
    state.builder.players = state.builder.players.filter((player) => player.id !== button.dataset.removePlayer);
    syncRosterCountsFromPlayers(state.builder);
    renderBuilder();
  });
  events.on("input", "[data-builder-player-name]", (event, input) => {
    const player = state.builder.players.find((item) => item.id === input.dataset.builderPlayerName);
    if (player) player.name = input.value;
  });
  events.on("change", "[data-builder-player-captain]", (event, input) => {
    setRosterCaptain(state.builder, input.dataset.builderPlayerCaptain, input.checked);
    renderBuilder();
  });
  wireBuilderSteppers(team, events);
  events.on("click", "[data-save-team]", () => saveTeam(team));
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
    toastError(error);
  }
}

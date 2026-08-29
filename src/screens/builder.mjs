/**
 * The team builder: `#/builder`, a fresh team creation flow.
 *
 * Mechanically moved out of src/app.js. This is the other of the two
 * "roster editor" implementations design spec section 5.1 counts —
 * screens/saved-roster.mjs is the other. Task 7 merges them; this task
 * only relocates the code as-is.
 */
import { escapeHtml, listenerGroup, patch } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { storage } from "../core/storage.mjs";
import { fileToOptimizedLogoDataUrl, logoUploadMaxBytes, optimizeLogoDataUrl } from "../core/logo-upload.mjs";
import { pageUrl } from "../core/routes.mjs";
import { onScreenLeave } from "../core/screen-lifecycle.mjs";
import { builderStaffMaximums, startingBudget } from "../domain/league-rules.mjs";
import { PLAYER_STATS, clamp, countToNumber, rowCost, rowsForTeam, statValueForDisplayByStat } from "../domain/roster/values.mjs";
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
import { builderPayload, emptyBuilderState, resetBuilderForTeam, rosterForStorage } from "../data/roster-draft.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { renderRosterLinks } from "../components/content-links.mjs";
import { CREATE_MODE } from "../components/roster-editor/modes.mjs";
import { renderDedicatedFansLine, renderHiredStaffLines, renderStaffControl, staffStepVerdict } from "../components/roster-editor/staff-control.mjs";
import { renderSummaryPanel } from "../components/roster-editor/summary-panel.mjs";
import { confirmRaceChange, restoreTeamSelect } from "../components/roster-editor/team-change.mjs";
import { renderHirePanel, wireHirePanel } from "../components/roster-editor/hire-panel.mjs";
import { renderPlayerList } from "../components/roster-editor/player-list.mjs";
import { renderIdentityFields } from "../components/roster-editor/identity.mjs";
import {
  ensureDraftLeagueChoice,
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

  patch(view, `
    ${renderHeader(t("nav.builder"), t("builder.subtitle"), `<button class="filter-button" type="button" data-builder-reset>${t("builder.startOver")}</button>`)}
    ${restoredDraft ? `<p class="notice-box" data-key="builder-restored" data-builder-restored>${t("builder.draftRestored")}</p>` : ""}
    ${renderBuilderInfoPanel(team, teams, costs, warnings)}
    <div class="builder-layout builder-layout-main" data-key="builder-main">
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
  `);
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
    <section class="builder-info-panel side-panel" data-key="builder-info">
      <div class="builder-info-section builder-info-identity">
        ${renderIdentityFields({ team, draft: state.builder, teams, mode: CREATE_MODE })}
      </div>
      <div class="builder-info-grid">
        ${renderBuilderSummary(team, costs, warnings)}
        <div class="builder-info-section builder-info-purchases">
          <h2>${t("roster.purchasesHeading")}</h2>
          <div class="builder-tracker-list roster-tracker-list" aria-label="${t("roster.startingRosterTrackersAriaLabel")}">
            ${renderStaffControl({ key: "startingRerolls", title: t("savedRoster.startingRerolls"), value: state.builder.startingRerolls, mode: CREATE_MODE, committedTotal: costs.total })}
            ${renderDedicatedFansLine({ draft: state.builder, mode: CREATE_MODE, committedTotal: costs.total })}
            ${renderHiredStaffLines({ team, draft: state.builder, mode: CREATE_MODE, committedTotal: costs.total })}
          </div>
        </div>
      </div>
    </section>
  `;
}


/** The builder's columns, declared once and read by both the header and the body. */
function builderColumns() {
  const statColumn = (stat) => ({
    header: t(`stats.${stat}`),
    className: "stat-table-cell",
    cell: (player) => escapeHtml(statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0)),
  });
  return [
    { header: "#", cell: (player, index) => String(index + 1) },
    { header: t("roster.nameHeader"), cell: (player, index) => renderBuilderNameInput(player, index) },
    { header: t("roster.positionHeader"), cell: (player) => `<strong>${escapeHtml(player.row.position)}</strong>` },
    ...PLAYER_STATS.map(statColumn),
    { header: t("roster.captain"), cell: (player) => renderBuilderCaptainCheckbox(player) },
    {
      header: t("roster.skillsLabel"),
      className: "skills-cell",
      cell: (player) => renderRosterLinks(skillNamesForPlayer(player.row, player)),
    },
    { header: t("sidebar.cost"), cell: (player) => escapeHtml(rowCost(player.row) || "-") },
    {
      header: t("roster.actionHeader"),
      cell: (player) => `<button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button>`,
    },
  ];
}

function renderBuilderNameInput(player, index) {
  const name = player.name || `${player.row.position} ${index + 1}`;
  return `<input class="table-input" type="text" value="${escapeHtml(name)}" data-builder-player-name="${escapeHtml(player.id)}">`;
}

function renderBuilderCaptainCheckbox(player) {
  return `
    <label class="table-checkbox" title="${t("roster.captain")}">
      <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
      <span>${t("roster.captain")}</span>
    </label>
  `;
}

function renderBuilderPlayerList(team, draft) {
  return renderPlayerList({
    players: selectedRosterPlayers(team, draft),
    columns: builderColumns(),
    emptyText: t("builder.emptyRosterHint"),
    classes: {
      wrap: "builder-selected-table-wrap",
      table: "builder-selected-table",
      mobileList: "builder-mobile-card-list builder-selected-mobile-list",
    },
    renderCard: renderBuilderPlayerCard,
  });
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
    <article class="saved-roster-player-card mobile-roster-player-card builder-selected-player-card" data-key="${escapeHtml(player.id)}">
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
      const verdict = staffStepVerdict(key, titles[key] ?? key, current, CREATE_MODE, committed);
      if (verdict.blocked) {
        toast(verdict.title, { tone: "error" });
        return;
      }
    }
    state.builder[key] = clamp(current + delta, 0, builderStaffMaximums[key] ?? 6);
    renderBuilder();
  };

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
    roster: rosterForStorage(payload),
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

/**
 * The league roster editor: `#/my-teams/:id`, the admin equivalent, and the
 * public player-team edit route.
 *
 * One of the two editors design spec section 5.1 counts — screens/builder.mjs
 * is the other. Task 7b is folding the shared parts into
 * components/roster-editor/*; what stays here is what a team already in play
 * needs and a brand-new one does not.
 *
 * `renderSavedRoster` and `rosterStore` are exported: the former is a
 * screens-map entry in app.js, the latter is read by app.js's `beforeunload`
 * handler to warn about unsaved edits.
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
import {
  advancementRanks,
  advancementTypeLabels,
  builderStaffMaximums,
  sppCounterDefinitions,
} from "../domain/league-rules.mjs";
import { categoriesForAccess, clamp, costToNumber, countToNumber, rowCost, rowsForTeam, statValueForDisplayByStat } from "../domain/roster/values.mjs";
import { hasBribery, teamFavouredOptions } from "../domain/roster/team-rules.mjs";
import {
  ensureDraftPlayers,
  normalizePlayerAdvancements,
  normalizePlayerExtraSkills,
  normalizePlayerFavouredSkills,
  normalizeSppCounters,
  rowCountInPlayers,
  selectedRosterPlayers,
  setRosterCaptain,
  skillNamesForPlayer,
  syncRosterCountsFromPlayers,
} from "../domain/roster/players.mjs";
import {
  canTakeAdvancement,
  playerAdvancementLevel,
  playerAdvancementSpent,
  playerAvailableSpp,
  playerLevelRank,
  playerSppTotal,
  rosterTotalSpp,
} from "../domain/roster/progression.mjs";
import {
  applyPaidStaffChange,
  calculateRosterCosts,
  eliteComboCost,
  playerAdjustmentCost,
  refundTreasury,
  syncMedicalStaffForTeam,
} from "../domain/roster/costs.mjs";
import { SAVE_STATUS, createRosterStore } from "../data/roster-store.mjs";
import { normalizeSavedRoster, updateSavedRosterFields } from "../data/roster-draft.mjs";
import { renderRosterNotices, wireRosterNotices } from "../components/roster-notices.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { renderRosterLinks, uniqueSorted } from "../components/content-links.mjs";
import { LEAGUE_MODE } from "../components/roster-editor/modes.mjs";
import { renderDedicatedFansLine, renderHiredStaffLines, renderStaffControl } from "../components/roster-editor/staff-control.mjs";
import { renderSummaryPanel } from "../components/roster-editor/summary-panel.mjs";
import { confirmRaceChange, restoreTeamSelect } from "../components/roster-editor/team-change.mjs";
import { renderHirePanel, wireHirePanel } from "../components/roster-editor/hire-panel.mjs";
import { renderPlayerList } from "../components/roster-editor/player-list.mjs";
import { renderIdentityFields } from "../components/roster-editor/identity.mjs";
import {
  ensureDraftFavouredChoice,
  ensureDraftLeagueChoice,
  favouredSkillOptionsForPlayer,
  rosterWarnings,
  sanitizeFavouredSkillsForTeam,
} from "../components/roster-editor-shared.mjs";
import { deleteSavedTeam, loadMyTeams } from "./my-teams.mjs";
import { toast, toastError } from "../components/toast.mjs";
import { confirmAction } from "../components/dialog.mjs";

const autosaveDelayMs = 450;

function isSavedRosterPlayerExpanded(playerId) {
  return state.savedRosterUi.expandedPlayers.has(playerId);
}

function setSavedRosterPlayerExpanded(playerId, expanded) {
  if (!playerId) return;
  const expandedPlayers = state.savedRosterUi.expandedPlayers;
  if (expanded) expandedPlayers.add(playerId);
  else expandedPlayers.delete(playerId);
}
function availableSkillOptionsForPlayer(row, player) {
  const base = new Set(skillNamesForPlayer(row, player));
  const primaryCategories = categoriesForAccess(row.primary ?? []);
  const secondaryCategories = categoriesForAccess(row.secondary ?? []);
  const options = [];

  (state.data.skillGroups ?? []).forEach((group) => {
    const access = primaryCategories.includes(group.category)
      ? "primary"
      : secondaryCategories.includes(group.category)
        ? "secondary"
        : "";
    if (!access) return;
    (group.skills ?? []).forEach((name) => {
      if (!base.has(name)) options.push({ name, access, category: group.category });
    });
  });

  return options.sort((a, b) => a.name.localeCompare(b.name, "en"));
}
export async function renderSavedRoster(teamId, refresh = true, options = {}) {
  const isAdminEdit = Boolean(options.adminOwnerId);
  setActiveNav(isAdminEdit ? "administration" : "my-teams");
  setViewSection("teams");
  if (refresh) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="loading">${t("myTeams.loadingTeam")}</div>
    `;
  }
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="empty-state">${t("myTeams.loginRequired")}</div>
    `;
    return;
  }

  let savedTeam = null;
  let owner = state.auth.currentUser;
  if (isAdminEdit) {
    if (!state.auth.currentUser.isAdmin) {
      view.innerHTML = `
        ${renderHeader(t("nav.administration"), t("savedRoster.editingTeamSubtitle"), "", { back: true, backFallback: "#/administration" })}
        <div class="empty-state">${t("admin.accessRequired")}</div>
      `;
      return;
    }
    state.admin.editingTeams ??= new Map();
    savedTeam = !refresh ? state.admin.editingTeams.get(teamId) : null;
    owner = savedTeam?._owner ?? owner;
    if (!savedTeam) {
      try {
        const payload = await apiRequest(`/api/admin/teams/${encodeURIComponent(teamId)}`);
        savedTeam = payload.team;
        owner = payload.owner;
        savedTeam._saveEndpoint = `/api/admin/teams/${encodeURIComponent(teamId)}`;
        savedTeam._owner = owner;
        state.admin.editingTeams.set(teamId, savedTeam);
      } catch (error) {
        view.innerHTML = `
          ${renderHeader(t("nav.administration"), t("savedRoster.editingTeamSubtitle"), "", { back: true, backFallback: `#/administration/users/${encodeURIComponent(options.adminOwnerId)}` })}
          <div class="empty-state">${escapeHtml(error.message)}</div>
        `;
        return;
      }
    }
  } else {
    await loadMyTeams(refresh);
    savedTeam = state.myTeams.items.find((item) => item.id === teamId);
  }

  if (!savedTeam) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="empty-state">${t("savedRoster.notFound")}</div>
    `;
    return;
  }

  // The store owns the draft. A local re-render reuses the very same object;
  // only a fresh load from the server offers a new one, and even then the store
  // keeps the existing draft if it still holds unsaved edits.
  const draft = trackSavedRoster(savedTeam, { refresh });
  const teams = state.data.teams;
  if (!draft.teamSlug && teams[0]) draft.teamSlug = teams[0].slug;
  const team = teams.find((item) => item.slug === draft.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, draft);
  syncMedicalStaffForTeam(team, draft);
  ensureDraftPlayers(team, draft);
  sanitizeFavouredSkillsForTeam(team, draft);
  const costs = calculateRosterCosts(team, draft);
  const warnings = rosterWarnings(team, draft, costs);
  const backUrl = isAdminEdit ? `#/administration/users/${encodeURIComponent(owner?.id || options.adminOwnerId)}` : "#/my-teams";
  const titlePrefix = isAdminEdit ? `${t("common.editing")} "${draft.teamName || savedTeam.name || team.title}"` : `${t("sidebar.teamHeading")} "${draft.teamName || savedTeam.name || team.title}"`;

  patch(view, `
    ${renderHeader(titlePrefix, `${team.title} ${t("savedRoster.rosterSuffix")}${isAdminEdit && owner ? ` · ${owner.login}` : ""}`, "", { back: true, backFallback: backUrl })}
    ${renderRosterNotices({ pending: rosterStore.readPending(savedTeam.id), serverUpdatedAt: savedTeam.updatedAt, conflict: rosterStore.statusOf(savedTeam.id) === SAVE_STATUS.CONFLICT, t })}
    <div class="saved-roster-top-grid" data-key="roster-top">
      ${renderSavedRosterIdentity(team, draft, teams)}
      ${renderSavedRosterSummary(savedTeam, team, draft, costs, warnings)}
    </div>
    ${renderSavedRosterPurchases(team, draft)}
    <div class="builder-layout builder-layout-main" data-key="roster-main">
      <section class="builder-panel">
        <section class="builder-selected">
          <h2>${t("savedRoster.rosterHeading")}</h2>
          ${renderSavedPlayerList(team, draft)}
        </section>

        <section class="builder-pool saved-add-player-section">
          <h2>${t("savedRoster.addNewPlayers")}</h2>
          ${renderHirePanel(team, draft, LEAGUE_MODE)}
        </section>
      </section>
    </div>
  `);
  wireSavedRoster(savedTeam, team, draft, {
    rerender: () => renderSavedRoster(teamId, false, options),
  });
}
function renderSavedRosterSummary(savedTeam, team, draft, costs, warnings) {
  const autosaveStatus = rosterStore.statusOf(savedTeam.id);
  return renderSummaryPanel({
    tag: "aside",
    className: "builder-summary saved-roster-summary-panel side-panel",
    teamTitle: team.title,
    teamHref: pageUrl(team),
    statusHtml: `<p class="autosave-status" data-autosave-status data-status="${escapeHtml(autosaveStatus)}">${escapeHtml(autosaveMessageFor(autosaveStatus))}</p>`,
    rows: [
      { label: t("savedRoster.activePlayers"), value: costs.playersCount },
      { label: t("savedRoster.totalPlayers"), value: costs.totalPlayersCount },
      { label: t("savedRoster.startingRerolls"), value: draft.startingRerolls ?? 0 },
      { label: t("savedRoster.teamRerolls"), value: draft.teamRerolls ?? 0 },
      ...(hasBribery(team) ? [{ label: t("savedRoster.bribes"), value: countToNumber(draft.bribes) }] : []),
      { label: t("savedRoster.dedicatedFans"), value: countToNumber(draft.dedicatedFans) },
      { label: t("savedRoster.treasury"), value: `${countToNumber(draft.treasury)}k`, valueAttributes: "data-treasury-display" },
      { label: t("savedRoster.totalSppLabel"), value: `${rosterTotalSpp(team, draft)} SPP`, valueAttributes: "data-total-spp-display" },
      { label: t("savedRoster.playersCost"), value: `${costs.playersCost}k` },
      { label: t("savedRoster.staffCost"), value: `${costs.staffCost}k` },
      { label: t("roster.totalCost"), value: `${costs.total}k` },
    ],
    warnings,
    actionsHtml: `
          <button class="primary-button" type="button" data-save-roster>${t("roster.saveChanges")}</button>
          <button class="filter-button danger-action" type="button" data-delete-saved-roster>${t("common.delete")}</button>
    `,
  });
}
function renderSavedRosterIdentity(team, draft, teams) {
  return `
    <section class="builder-setup-panel roster-identity-panel side-panel">
      ${renderIdentityFields({ team, draft, teams, mode: LEAGUE_MODE })}
    </section>
  `;
}
function renderSavedRosterPurchases(team, draft) {
  return `
    <div class="roster-purchases-layout" data-key="roster-purchases">
      <section class="roster-controls-panel roster-resources-panel side-panel">
        <h2>${t("roster.teamResourcesHeading")}</h2>
        <div class="builder-tracker-list roster-resource-list" aria-label="${t("roster.teamResourceTrackersAriaLabel")}">
          ${renderDedicatedFansLine({ draft, mode: LEAGUE_MODE })}
          ${renderRosterMoneyControl(t("roster.treasuryTitle"), t("roster.treasuryDescription"), draft.treasury, "data-roster-treasury")}
          ${renderRosterMoneyControl("Coach's Safe", t("roster.coachesSafeDescription"), draft.coachesSafe, "data-roster-coaches-safe")}
        </div>
      </section>
      <section class="roster-controls-panel roster-purchases-panel side-panel">
        <h2>${t("roster.purchasesHeading")}</h2>
        <div class="builder-tracker-list roster-tracker-list roster-purchase-grid" aria-label="${t("roster.purchaseTrackersAriaLabel")}">
        ${renderStaffControl({ key: "startingRerolls", title: t("savedRoster.startingRerolls"), value: draft.startingRerolls, mode: LEAGUE_MODE })}
        ${renderStaffControl({ key: "teamRerolls", title: t("savedRoster.teamRerolls"), value: draft.teamRerolls, mode: LEAGUE_MODE })}
        ${renderHiredStaffLines({ team, draft, mode: LEAGUE_MODE })}
        </div>
      </section>
    </div>
  `;
}
function renderRosterMoneyControl(title, description, value, dataAttribute) {
  return `
    <label class="builder-addon compact-staff-control roster-purchase-card roster-money-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <input class="table-input roster-purchase-input" type="number" step="10" value="${countToNumber(value)}" ${dataAttribute}>
    </label>
  `;
}
function wireSavedRoster(savedTeam, team, draft, options = {}) {
  wireAutosaveStatus(savedTeam.id);
  // Delegated to the container, which survives a re-render: the group must be
  // dropped when this runs again, or every edit doubles the handlers.
  const events = listenerGroup(view);
  onScreenLeave("saved-roster:events", () => events.release());

  const reload = () => renderSavedRoster(savedTeam.id, true, options);
  events.own(wireRosterNotices(view, {
    onRestore: () => rosterStore.restorePending(savedTeam.id) && renderSavedRoster(savedTeam.id, false, options),
    onDiscard: () => { rosterStore.discardPending(savedTeam.id); reload(); },
    onReload: reload,
  }));
  const autosave = () => scheduleSavedRosterAutosave(savedTeam.id);
  const rerender = () => {
    syncRosterCountsFromPlayers(draft);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
    if (options.rerender) {
      options.rerender();
    } else {
      renderSavedRoster(savedTeam.id, false);
    }
  };

  events.on("change", "[data-roster-team]", async (event, select) => {
    const nextTeam = state.data.teams.find((item) => item.slug === select.value);
    if (!nextTeam) return;
    if (!await confirmRaceChange(team, draft, nextTeam)) {
      restoreTeamSelect(select, team.slug);
      return;
    }
    draft.teamSlug = nextTeam.slug;
    draft.players = [];
    draft.selectedLeague = "";
    draft.favouredChoice = "";
    syncRosterCountsFromPlayers(draft);
    if (!draft.teamName) draft.teamName = nextTeam.title;
    rerender();
  });
  events.on("input", "[data-roster-name]", (event, input) => {
    draft.teamName = input.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  events.on("input", "[data-roster-treasury]", (event, input) => {
    draft.treasury = countToNumber(input.value);
    // The treasury readout used to be updated by hand for the same reason the
    // SPP readouts were: a re-render would have emptied the field being typed.
    rerender();
  });
  events.on("input", "[data-roster-coaches-safe]", (event, input) => {
    draft.coachesSafe = countToNumber(input.value);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  events.on("change", "[data-roster-league]", (event, select) => {
    draft.selectedLeague = select.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  events.on("change", "[data-roster-favoured]", (event, select) => {
    draft.favouredChoice = select.value;
    sanitizeFavouredSkillsForTeam(team, draft);
    rerender();
  });
  events.on("change", "[data-roster-logo]", async (event, input) => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      toast(t("savedRoster.logoTooLarge"), { tone: "error" });
      input.value = "";
      return;
    }
    draft.logoData = await fileToOptimizedLogoDataUrl(file);
    rerender();
  });
  events.on("click", "[data-roster-remove-logo]", () => {
    draft.logoData = "";
    rerender();
  });
  events.on("click", "[data-roster-staff]", (event, button) => {
    // The markup already worked out why a step is refused and put the reason in
    // the button's title; reading it back cannot drift from what the coach saw.
    if (button.getAttribute("aria-disabled") === "true") {
      toast(button.getAttribute("title") || "", { tone: "error" });
      return;
    }
    const key = button.dataset.rosterStaff;
    const max = builderStaffMaximums[key] ?? 6;
    const delta = Number(button.dataset.rosterStaffStep);
    const previous = countToNumber(draft[key]);
    draft[key] = clamp(previous + delta, 0, max);
    applyPaidStaffChange(draft, key, previous, draft[key]);
    rerender();
  });
  events.own(wireHirePanel(view, { team, draft, mode: LEAGUE_MODE, onChange: rerender }));
  events.own(wireSavedPlayerEditors(team, draft, rerender));

  events.on("click", "[data-save-roster]", () => saveSavedRoster(savedTeam));
  events.on("click", "[data-delete-saved-roster]", async () => {
    const ownerId = savedTeam._owner?.id || options.adminOwnerId || state.auth.currentUser?.id || "";
    try {
      const deleted = await deleteSavedTeam(savedTeam.id, {
        ownerId,
        teamName: draft.teamName || savedTeam.name || team.title,
      });
      if (!deleted) return;
      location.hash = options.adminOwnerId ? `#/administration/users/${encodeURIComponent(ownerId)}` : "#/my-teams";
    } catch (error) {
      toastError(error);
    }
  });
}
function moveRosterPlayer(draft, draggedId, targetId, position = "before") {
  if (!draggedId || !targetId || draggedId === targetId || !Array.isArray(draft.players)) return false;
  const fromIndex = draft.players.findIndex((player) => player.id === draggedId);
  if (fromIndex === -1) return false;
  const [dragged] = draft.players.splice(fromIndex, 1);
  const targetIndex = draft.players.findIndex((player) => player.id === targetId);
  if (targetIndex === -1) {
    draft.players.splice(fromIndex, 0, dragged);
    return false;
  }
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  draft.players.splice(insertIndex, 0, dragged);
  return true;
}
/** @returns {() => void} removes the listeners */
function wireSavedRosterDragAndDrop(draft, rerender) {
  const events = listenerGroup(view);
  const rowSelector = ".saved-roster-table tbody tr[data-roster-player]";
  let draggedId = "";

  events.on("dragstart", rowSelector, (event, row) => {
    const source = event.target instanceof Element ? event.target : null;
    if (!source?.closest("[data-player-drag-handle]")) {
      event.preventDefault();
      return;
    }
    draggedId = row.dataset.rosterPlayer || "";
    row.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedId);
    }
  });

  events.on("dragover", rowSelector, (event, row) => {
    if (!draggedId || draggedId === row.dataset.rosterPlayer) return;
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    row.dataset.dropPosition = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    row.classList.toggle("drop-after", row.dataset.dropPosition === "after");
    row.classList.toggle("drop-before", row.dataset.dropPosition !== "after");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  events.on("dragleave", rowSelector, (event, row) => {
    row.classList.remove("drop-before", "drop-after");
    delete row.dataset.dropPosition;
  });

  events.on("drop", rowSelector, (event, row) => {
    event.preventDefault();
    const moved = moveRosterPlayer(draft, draggedId, row.dataset.rosterPlayer || "", row.dataset.dropPosition);
    draggedId = "";
    if (moved) rerender();
  });

  events.on("dragend", rowSelector, () => {
    draggedId = "";
    view.querySelectorAll(".saved-roster-table tbody tr").forEach((item) => {
      item.classList.remove("is-dragging", "drop-before", "drop-after");
      delete item.dataset.dropPosition;
    });
  });

  return () => events.release();
}
/**
 * Wire the player rows and cards, delegated rather than bound per card: which
 * player a click belongs to is read back out of the DOM instead of closed over.
 *
 * @returns {() => void} removes the listeners
 */
function wireSavedPlayerEditors(team, draft, rerender) {
  const autosave = () => scheduleSavedRosterAutosave(draft.editingTeamId);
  const events = listenerGroup(view);
  /** Run `handler` with the player whose card the event happened in. */
  const onPlayer = (eventName, selector, handler) => {
    events.on(eventName, selector, (event, target) => {
      const card = target.closest("[data-roster-player]");
      const player = card ? draft.players.find((item) => item.id === card.dataset.rosterPlayer) : null;
      if (player) handler({ target, card, player });
    });
  };
  onPlayer("click", "[data-saved-player-expand],[data-saved-player-collapse]", ({ target, player }) => {
    setSavedRosterPlayerExpanded(player.id, target.hasAttribute("data-saved-player-expand"));
    rerender();
  });
  onPlayer("click", "[data-saved-player-spp-action]", ({ target, player }) => {
    const key = target.dataset.savedPlayerSppAction;
    player.spp = normalizeSppCounters(player.spp);
    player.spp[key] = Math.max(0, countToNumber(player.spp[key]) + 1);
    autosave();
    rerender();
  });
  onPlayer("input", "[data-saved-player-name]", ({ target, player }) => {
    player.name = target.value;
    autosave();
  });
  onPlayer("input", "[data-saved-player-number]", ({ target, player }) => {
    player.number = target.value;
    autosave();
  });
  onPlayer("change", "[data-saved-player-skip]", ({ target, player }) => {
    player.skipNextGame = target.checked;
    rerender();
  });
  onPlayer("change", "[data-saved-player-nigling]", ({ target, player }) => {
    player.niglingInjury = target.checked;
    autosave();
  });
  onPlayer("change", "[data-saved-player-captain]", ({ target, player }) => {
    setRosterCaptain(draft, player.id, target.checked);
    rerender();
  });
  onPlayer("click", "[data-saved-player-contract-delta]", ({ target, player }) => {
    const delta = Number(target.dataset.savedPlayerContractDelta);
    player.extendedContracts = Math.max(0, countToNumber(player.extendedContracts) + delta);
    rerender();
  });
  onPlayer("input", "[data-saved-player-spp]", ({ target, player }) => {
    player.spp = normalizeSppCounters(player.spp);
    player.spp[target.dataset.savedPlayerSpp] = Math.max(0, countToNumber(target.value));
    autosave();
    // Used to hand-update four nodes — the row total, the available SPP, the
    // next rank and the roster total — because a re-render would have taken the
    // caret out of the field being typed into. patch() keeps it.
    rerender();
  });
  onPlayer("click", "[data-saved-stat]", ({ target, player }) => {
    const stat = target.dataset.savedStat;
    player.statMods ??= {};
    player.statMods[stat] = clamp(countToNumber(player.statMods[stat]) + Number(target.dataset.savedStatDelta), -10, 10);
    rerender();
  });
  onPlayer("click", "[data-saved-player-add-skill]", ({ card, player }) => {
    const input = card.querySelector("[data-saved-player-skill]");
    const row = rowsForTeam(team)[player.rowIndex];
    const typed = String(input?.value || "").trim();
    const option = availableSkillOptionsForPlayer(row, player)
      .find((item) => item.name.toLowerCase() === typed.toLowerCase());
    if (!option) {
      if (input) input.value = "";
      return;
    }
    player.extraSkills ??= [];
    if (player.extraSkills.some((skill) => skill.name === option.name)) return;
    player.extraSkills.push({ name: option.name, access: option.access });
    player.extraSkills = normalizePlayerExtraSkills(row, player.extraSkills);
    sanitizeFavouredSkillsForTeam(team, draft);
    rerender();
  });
  onPlayer("click", "[data-saved-player-remove-skill]", ({ target, player }) => {
    player.extraSkills = (player.extraSkills ?? []).filter((skill) => skill.name !== target.dataset.savedPlayerRemoveSkill);
    rerender();
  });
  onPlayer("click", "[data-saved-player-add-favoured]", ({ card, player }) => {
    const input = card.querySelector("[data-saved-player-favoured-skill]");
    const row = rowsForTeam(team)[player.rowIndex];
    if (!row) return;
    const typed = String(input?.value || "").trim();
    const option = favouredSkillOptionsForPlayer(team, draft, row, player)
      .find((item) => item.name.toLowerCase() === typed.toLowerCase());
    if (!option) {
      if (input) input.value = "";
      return;
    }
    player.favouredSkills ??= [];
    if (player.favouredSkills.some((skill) => skill.name === option.name)) return;
    player.favouredSkills.push({ name: option.name, access: "favoured" });
    sanitizeFavouredSkillsForTeam(team, draft);
    rerender();
  });
  onPlayer("click", "[data-saved-player-remove-favoured]", ({ target, player }) => {
    const removed = target.dataset.savedPlayerRemoveFavoured;
    player.favouredSkills = (player.favouredSkills ?? [])
      .filter((skill) => (typeof skill === "string" ? skill : skill.name) !== removed);
    rerender();
  });
  onPlayer("click", "[data-saved-player-add-advancement]", ({ card, player }) => {
    const type = card.querySelector("[data-saved-player-advancement-type]")?.value ?? "primary";
    const verdict = canTakeAdvancement(team, player, type);
    if (!verdict.allowed) {
      // Used to fail silently whenever the cost was zero, and to happily let
      // available SPP go negative otherwise.
      toast(t(`validation.${verdict.reason}`, verdict.params), { tone: "error" });
      return;
    }
    player.advancements = normalizePlayerAdvancements(player.advancements);
    player.advancements.push({ type });
    rerender();
  });
  onPlayer("click", "[data-saved-player-remove-advancement]", ({ target, player }) => {
    const index = Number(target.dataset.savedPlayerRemoveAdvancement);
    player.advancements = normalizePlayerAdvancements(player.advancements)
      .filter((_advancement, advancementIndex) => advancementIndex !== index);
    rerender();
  });
  events.own(wireSavedRosterDragAndDrop(draft, rerender));
  events.on("click", "[data-remove-saved-player]", (event, button) => {
    const removedId = button.dataset.removeSavedPlayer;
    const removed = draft.players.find((player) => player.id === removedId);
    if (removed?.purchased) {
      const row = rowsForTeam(team)[removed.rowIndex];
      refundTreasury(draft, costToNumber(rowCost(row)));
    }
    draft.players = draft.players.filter((player) => player.id !== removedId);
    syncRosterCountsFromPlayers(draft);
    rerender();
  });

  return () => events.release();
}

/**
 * Everything below hands roster saving to src/data/roster-store.mjs.
 *
 * The store owns the draft object and the request queue; this file only decides
 * what a request looks like and how the status is worded.
 */

const rosterSaveTransport = {
  async save(teamId, request, { endpoint } = {}) {
    return apiRequest(endpoint || `/api/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(request),
    });
  },
};
export const rosterStore = createRosterStore({
  transport: rosterSaveTransport,
  storage,
  debounceMs: autosaveDelayMs,
});
/** Turn the live draft into a PATCH body. Async: the logo is re-encoded here. */
async function buildRosterRequest(savedTeam, team, draft) {
  syncRosterCountsFromPlayers(draft);
  draft.logoData = await optimizeLogoDataUrl(draft.logoData);
  updateSavedRosterFields(savedTeam, draft);
  return {
    name: draft.teamName || team.title,
    baseTeamSlug: draft.teamSlug || team.slug,
    logoData: draft.logoData || "",
    roster: draft,
    revision: savedTeam.revision, // the server writes only while this still matches
  };
}
/**
 * Hand the team to the store and get back the draft to render.
 *
 * On a local re-render the store returns the same object the screen was already
 * mutating. On a fresh load it takes the newly parsed one — unless edits are
 * still queued, in which case those win and the server copy is ignored.
 */
function trackSavedRoster(savedTeam, { refresh = true } = {}) {
  const existing = rosterStore.getDraft(savedTeam.id);
  const draft = refresh || !existing ? normalizeSavedRoster(savedTeam) : existing;
  const teams = state.data.teams;
  const team = teams.find((item) => item.slug === draft.teamSlug) ?? teams[0];
  return rosterStore.track(savedTeam.id, {
    draft,
    meta: savedTeam,
    endpoint: savedTeam._saveEndpoint || `/api/teams/${savedTeam.id}`,
    buildRequest: (current) => buildRosterRequest(savedTeam, team, current),
  });
}
const autosaveStatusMessages = {
  [SAVE_STATUS.IDLE]: "roster.autosaveDefaultMessage",
  [SAVE_STATUS.DIRTY]: "roster.unsavedStatus",
  [SAVE_STATUS.SAVING]: "roster.savingStatus",
  [SAVE_STATUS.SAVED]: "roster.autosavedStatus",
  [SAVE_STATUS.OFFLINE]: "roster.offlineStatus",
  [SAVE_STATUS.CONFLICT]: "roster.conflictStatus",
  [SAVE_STATUS.ERROR]: "roster.autosaveFailedStatus",
};
function autosaveMessageFor(status) {
  return t(autosaveStatusMessages[status] ?? autosaveStatusMessages[SAVE_STATUS.IDLE]);
}
/** Status line in step with the store; the unsubscribe is registered, not dropped. */
/**
 * The status line tells a coach their team was saved somewhere else — already
 * the difference between losing work silently and being told. The *banner*
 * offering a choice between the versions is markup and a conflict arrives
 * between renders, so it needs a render; that trigger must be careful, since
 * subscribe() replays the status and every render subscribes again. It is the
 * rest of step 4.7, in the plan rather than shipped unverified — reaching the
 * state needs unsaved edits, which the beforeunload guard stops a check from
 * driving.
 */
function wireAutosaveStatus(teamId) {
  onScreenLeave("saved-roster:autosave-status", rosterStore.subscribe(teamId, ({ status }) => {
    const node = view.querySelector("[data-autosave-status]");
    if (!node) return;
    node.textContent = autosaveMessageFor(status);
    node.dataset.status = status;
  }));
}
function scheduleSavedRosterAutosave(teamId) {
  if (!teamId) return;
  rosterStore.markDirty(teamId);
}
/** The explicit "save changes" button: write now and say what happened. */
async function saveSavedRoster(savedTeam) {
  const status = await rosterStore.flush(savedTeam.id);
  const button = view.querySelector("[data-save-roster]");
  if (status === SAVE_STATUS.SAVED) {
    if (button) {
      button.textContent = t("roster.savedStatus");
      setTimeout(() => { button.textContent = t("roster.saveChanges"); }, 1200);
    }
    return;
  }
  toast(autosaveMessageFor(status), { tone: "error" });
}
/** One editable stat: the value, and a stepper either side of it. */
function savedStatColumn(stat) {
  return {
    header: t(`stats.${stat}`),
    className: (player) => {
      const mod = Number(player.statMods?.[stat] ?? 0);
      return `stat-table-cell ${mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : ""}`.trim();
    },
    cell: (player) => `
      <div class="table-stat-control">
        <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="-1">-</button>
        <strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], Number(player.statMods?.[stat] ?? 0)))}</strong>
        <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="1">+</button>
      </div>
    `,
  };
}

function renderSavedNumberCell(player, index) {
  return `
    <div class="saved-number-control">
      <button class="filter-button compact-action drag-handle table-drag-handle" type="button" draggable="true" data-player-drag-handle title="${t("roster.dragToReorder")}" aria-label="${t("roster.dragToReorder")}">↕</button>
      <input class="table-input table-number-input" type="text" value="${escapeHtml(player.number ?? index + 1)}" data-saved-player-number>
    </div>
  `;
}

function renderSavedSkillsCell(player) {
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const eliteCost = eliteComboCost(player.row, player);
  return `
    ${renderRosterLinks(player.row.skills)}
    ${extraSkills.length ? `
      <div class="player-extra-skills table-extra-skills">
        ${extraSkills.map((skill) => `
          <button class="roster-pill" type="button" data-saved-player-remove-skill="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
        `).join("")}
      </div>
    ` : ""}
    ${renderFavouredSkillButtons(player)}
    ${renderCaptainSkillBadge(player)}
    ${eliteCost ? `<p class="cost-note">${t("roster.eliteCombo")} +${eliteCost}k</p>` : ""}
  `;
}

function renderSavedSkillEditor(player, index, { className = "", idPrefix = "skill-options" } = {}) {
  const listId = `${idPrefix}-${index}`;
  const options = availableSkillOptionsForPlayer(player.row, player);
  return `
    <div class="table-skill-editor ${className}">
      <input class="table-input" type="text" list="${escapeHtml(listId)}" placeholder="${t("roster.skillPlaceholder")}" data-saved-player-skill>
      <datalist id="${escapeHtml(listId)}">
        ${options.map((option) => `
          <option value="${escapeHtml(option.name)}" label="${escapeHtml(option.access === "secondary" ? t("roster.secondary") : t("roster.primary"))}"></option>
        `).join("")}
      </datalist>
      <button class="filter-button compact-action" type="button" data-saved-player-add-skill>${t("common.add")}</button>
    </div>
  `;
}

/** A labelled checkbox, the shape every flag on a league player wears. */
function renderSavedPlayerFlag(attribute, label, checked) {
  return `
    <label class="table-checkbox" title="${label}">
      <input type="checkbox" ${attribute} ${checked ? "checked" : ""}>
      <span>${label}</span>
    </label>
  `;
}

function renderSavedCostCell(player) {
  const adjustment = playerAdjustmentCost(player.row, player);
  const note = adjustment ? `<span class="cost-note inline-cost-note">${adjustment > 0 ? "+" : ""}${adjustment}k</span>` : "";
  return `${escapeHtml(rowCost(player.row) || "-")}${note}`;
}

/** The league editor's columns, declared once and read by both header and body. */
function savedColumns(team, draft, hasFavouredAccess) {
  return [
    { header: "#", className: "saved-number-cell", cell: renderSavedNumberCell },
    {
      header: t("roster.nameHeader"),
      cell: (player, index) => `<input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-saved-player-name>`,
    },
    { header: t("roster.positionHeader"), cell: (player) => `<strong>${escapeHtml(player.row.position)}</strong>` },
    ...["ma", "st", "ag", "pa", "ar"].map(savedStatColumn),
    { header: t("roster.skillsLabel"), className: "skills-cell", cell: renderSavedSkillsCell },
    { header: t("roster.addSkillHeader"), cell: renderSavedSkillEditor },
    {
      header: t("roster.skipHeader"),
      cell: (player) => renderSavedPlayerFlag("data-saved-player-skip", t("roster.skipNextGame"), player.skipNextGame),
    },
    {
      header: t("roster.niglingInjury"),
      cell: (player) => renderSavedPlayerFlag("data-saved-player-nigling", t("roster.niglingInjury"), player.niglingInjury),
    },
    {
      header: t("roster.captain"),
      cell: (player) => renderSavedPlayerFlag("data-saved-player-captain", t("roster.captain"), player.isCaptain),
    },
    { header: t("roster.extendedContracts"), cell: renderPlayerContractControls },
    { header: "SPP", className: "spp-cell", cell: (player) => renderPlayerSppControls(team, player) },
    { header: t("roster.levelHeader"), className: "level-cell", cell: (player) => renderPlayerLevelCell(team, player) },
    { header: t("roster.advancementHeader"), className: "advancement-cell", cell: (player) => renderPlayerAdvancementControls(team, player) },
    hasFavouredAccess && {
      header: t("roster.favouredOf"),
      className: "favoured-skill-cell",
      cell: (player, index) => renderSavedPlayerFavouredEditor(team, draft, player, `favoured-skill-options-${index}`),
    },
    { header: t("sidebar.cost"), cell: renderSavedCostCell },
    {
      header: t("roster.actionHeader"),
      cell: (player) => `<button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button>`,
    },
  ];
}

function renderSavedPlayerList(team, draft) {
  const hasFavouredAccess = teamFavouredOptions(team).length > 0;
  return renderPlayerList({
    players: selectedRosterPlayers(team, draft),
    columns: savedColumns(team, draft, hasFavouredAccess),
    emptyText: t("savedRoster.noPlayersYet"),
    classes: {
      wrap: "saved-roster-table-wrap",
      table: "saved-roster-table",
      mobileList: "saved-roster-mobile-list",
    },
    rowAttributes: (player) => `data-roster-player="${escapeHtml(player.id)}" draggable="true"`,
    renderCard: (player, index) => renderSavedPlayerCard(team, draft, player, index, hasFavouredAccess),
  });
}
function renderSavedPlayerFavouredEditor(team, draft, player, inputId) {
  const choice = ensureDraftFavouredChoice(team, draft);
  if (!choice) return `<span class="muted-text">-</span>`;
  const options = favouredSkillOptionsForPlayer(team, draft, player.row, player);
  return `
    <div class="favoured-skill-editor">
      <small>${escapeHtml(choice)}</small>
      <div class="table-skill-editor">
        <input class="table-input" type="text" list="${escapeHtml(inputId)}" placeholder="${t("roster.favouredSkillPlaceholder")}" data-saved-player-favoured-skill ${!options.length ? "disabled" : ""}>
        <datalist id="${escapeHtml(inputId)}">
          ${options.map((option) => `<option value="${escapeHtml(option.name)}" label="${escapeHtml(option.alignment)}"></option>`).join("")}
        </datalist>
        <button class="filter-button compact-action" type="button" data-saved-player-add-favoured ${!options.length ? "disabled" : ""}>${t("common.add")}</button>
      </div>
    </div>
  `;
}
function renderPlayerContractControls(player) {
  const contracts = Math.max(0, countToNumber(player.extendedContracts));
  return `
    <div class="player-contract-control">
      <div class="inline-stepper-control compact-contract-stepper">
        <button class="filter-button" type="button" data-saved-player-contract-delta="-1" ${contracts <= 0 ? "disabled" : ""}>-</button>
        <strong>${contracts}</strong>
        <button class="filter-button" type="button" data-saved-player-contract-delta="1">+</button>
      </div>
      ${contracts ? `<small class="cost-note">+${contracts * 20}k</small>` : ""}
    </div>
  `;
}
function renderFavouredSkillButtons(player) {
  const favouredSkills = normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []);
  if (!favouredSkills.length) return "";
  return `
    <div class="player-extra-skills table-extra-skills favoured-extra-skills">
      ${favouredSkills.map((skill) => `
        <button class="roster-pill favoured-skill-pill" type="button" data-saved-player-remove-favoured="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
      `).join("")}
    </div>
  `;
}
function renderCaptainSkillBadge(player) {
  if (!player.isCaptain) return "";
  const nonCaptainSkills = new Set([
    ...(player.row.skills ?? []),
    ...normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).map((skill) => skill.name),
    ...normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []).map((skill) => skill.name),
  ]);
  return `
    <div class="player-extra-skills table-extra-skills captain-extra-skills">
      ${nonCaptainSkills.has("Pro") ? "" : renderRosterLinks(["Pro"])}
      <span class="roster-pill roster-pill-muted">${t("roster.captain")}</span>
    </div>
  `;
}
function renderSavedPlayerCard(team, draft, player, index, hasFavouredAccess = false) {
  if (!isSavedRosterPlayerExpanded(player.id)) {
    return renderSavedPlayerPreviewCard(team, player, index);
  }
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player.row, player);
  const eliteCost = eliteComboCost(player.row, player);
  const favouredInputId = `mobile-favoured-skill-options-${index}`;
  return `
    <article class="saved-roster-player-card mobile-roster-player-card is-expanded" data-key="${escapeHtml(player.id)}" data-roster-player="${escapeHtml(player.id)}">
      <header>
        <div class="mobile-player-title">
          <label class="mobile-player-number">
            <span>${t("roster.numberAbbr")}</span>
            <input class="table-input table-number-input" type="text" value="${escapeHtml(player.number ?? index + 1)}" data-saved-player-number>
          </label>
          <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-saved-player-name>
          <small>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row) || "-")}${adjustment ? ` · ${adjustment > 0 ? "+" : ""}${adjustment}k` : ""}</small>
        </div>
        <div class="mobile-card-actions">
          <button class="filter-button compact-action" type="button" data-saved-player-collapse="${escapeHtml(player.id)}">${t("roster.previewAction")}</button>
          <button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button>
        </div>
      </header>

      <section class="mobile-player-section">
        <h3>${t("roster.statsHeading")}</h3>
        ${renderEditableStatLine(player)}
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">
          ${renderRosterLinks(player.row.skills)}
          ${extraSkills.map((skill) => `
            <button class="roster-pill" type="button" data-saved-player-remove-skill="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
          `).join("")}
          ${renderFavouredSkillButtons(player)}
          ${renderCaptainSkillBadge(player)}
        </div>
        ${eliteCost ? `<p class="cost-note">${t("roster.eliteCombo")} +${eliteCost}k</p>` : ""}
        ${renderSavedSkillEditor(player, index, { className: "mobile-skill-editor", idPrefix: "mobile-skill-options" })}
        ${hasFavouredAccess ? renderSavedPlayerFavouredEditor(team, draft, player, favouredInputId) : ""}
      </section>

      <section class="mobile-player-section mobile-player-checks">
        <label class="table-checkbox" title="${t("roster.skipNextGame")}">
          <input type="checkbox" data-saved-player-skip ${player.skipNextGame ? "checked" : ""}>
          <span>${t("roster.skipNextGame")}</span>
        </label>
        <label class="table-checkbox" title="${t("roster.niglingInjury")}">
          <input type="checkbox" data-saved-player-nigling ${player.niglingInjury ? "checked" : ""}>
          <span>${t("roster.niglingInjury")}</span>
        </label>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-saved-player-captain ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.extendedContracts")}</h3>
        ${renderPlayerContractControls(player)}
      </section>

      <section class="mobile-player-section">
        <h3>SPP</h3>
        ${renderPlayerSppControls(team, player)}
      </section>

      <section class="mobile-player-section mobile-advancement-section">
        <div>
          <h3>${t("roster.levelHeader")}</h3>
          ${renderPlayerLevelCell(team, player)}
        </div>
        <div>
          <h3>${t("roster.advancementHeader")}</h3>
          ${renderPlayerAdvancementControls(team, player)}
        </div>
      </section>
    </article>
  `;
}
function renderSavedPlayerPreviewCard(team, player, index) {
  return `
    <article class="saved-roster-player-card mobile-roster-player-card is-preview" data-key="${escapeHtml(player.id)}" data-roster-player="${escapeHtml(player.id)}">
      <header>
        <div class="mobile-player-title">
          <strong>${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}</strong>
          <small>${escapeHtml(player.row.position)}</small>
        </div>
        <button class="primary-button compact-action" type="button" data-saved-player-expand="${escapeHtml(player.id)}">${t("roster.advanceAction")}</button>
      </header>

      <section class="mobile-player-section">
        <h3>${t("roster.statsHeading")}</h3>
        ${renderReadonlyStatLine(player)}
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">
          ${renderPlayerPreviewSkills(player)}
        </div>
      </section>

      <section class="mobile-player-section">
        <div class="mobile-spp-preview-head">
          <h3>SPP</h3>
          <strong>${playerSppTotal(team, player)} ${t("roster.sppEarned")}</strong>
        </div>
        <div class="mobile-spp-action-grid">
          ${renderSppActionButtons(player)}
        </div>
      </section>
    </article>
  `;
}
function renderPlayerPreviewSkills(player) {
  const names = [
    ...(player.row.skills ?? []),
    ...normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).map((skill) => skill.name),
    ...normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []).map((skill) => skill.name),
  ];
  if (player.isCaptain && !names.includes("Pro")) names.push("Pro");
  const rendered = renderRosterLinks(uniqueSorted(names));
  return `${rendered}${player.isCaptain ? `<span class="roster-pill roster-pill-muted">${t("roster.captain")}</span>` : ""}`;
}
function renderSppActionButtons(player) {
  const spp = normalizeSppCounters(player.spp);
  return sppCounterDefinitions.map(([key, label]) => `
    <button class="filter-button mobile-spp-action" type="button" data-saved-player-spp-action="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span>
      <strong>${spp[key]}</strong>
      <em>+1</em>
    </button>
  `).join("");
}
function renderReadonlyStatLine(player) {
  const stats = ["ma", "st", "ag", "pa", "ar"];
  return `
    <div class="player-stat-editors readonly-stat-line">
      ${stats.map((stat) => {
    const mod = Number(player.statMods?.[stat] ?? 0);
    const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
    return `
        <div class="player-stat-editor ${modClass}">
          <span>${stat.toUpperCase()}</span>
          <strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], mod))}</strong>
        </div>
      `;
  }).join("")}
    </div>
  `;
}
function renderPlayerSppControls(team, player) {
  const spp = normalizeSppCounters(player.spp);
  return `
    <div class="spp-counter-grid">
      ${sppCounterDefinitions.map(([key, label]) => `
        <label class="spp-counter-field">
          <span>${escapeHtml(label)}</span>
          <input type="number" min="0" step="1" value="${spp[key]}" data-saved-player-spp="${key}">
        </label>
      `).join("")}
    </div>
    <strong class="spp-total" data-player-spp-total>${playerSppTotal(team, player)} ${t("roster.sppEarned")}</strong>
  `;
}
function renderPlayerLevelCell(team, player) {
  const level = playerAdvancementLevel(player);
  return `
    <div class="player-level-stack">
      <strong>${level}</strong>
      <span>${escapeHtml(playerLevelRank(player))}</span>
      <small data-player-spent-spp>${playerAdvancementSpent(player)} ${t("roster.sppSpent")}</small>
      <small data-player-available-spp>${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}</small>
    </div>
  `;
}
function renderPlayerAdvancementControls(team, player) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  const level = playerAdvancementLevel(player);
  const nextRank = advancementRanks[level];
  const available = playerAvailableSpp(team, player);
  const canAdvance = Boolean(nextRank);
  return `
    <div class="advancement-control">
      ${canAdvance ? `
        <div class="advancement-add-row">
          <select class="table-select" data-saved-player-advancement-type>
            ${Object.entries(advancementTypeLabels).map(([type, label]) => {
    const verdict = canTakeAdvancement(team, player, type);
    return `
              <option value="${type}" ${verdict.allowed ? "" : "disabled"}>${escapeHtml(`${label} (${nextRank.costs[type]} SPP)${verdict.allowed ? "" : ` — ${t("roster.notEnoughSpp")}`}`)}</option>
            `;
  }).join("")}
          </select>
          <button class="filter-button compact-action" type="button" data-saved-player-add-advancement>${t("common.add")}</button>
        </div>
        <small class="advancement-next" data-player-next-advancement>${t("roster.next")}: ${escapeHtml(nextRank.rank)}, ${available} ${t("roster.sppAvailable")}</small>
      ` : `<span class="muted-text">${t("roster.maxLevel")}</span>`}
      <div class="advancement-list">
        ${advancements.length ? advancements.map((advancement, index) => {
    const cost = advancementRanks[index]?.costs?.[advancement.type] ?? 0;
    const label = advancementTypeLabels[advancement.type] ?? advancement.type;
    return `
            <button class="roster-pill advancement-pill" type="button" data-saved-player-remove-advancement="${index}">
              ${escapeHtml(`${index + 1}. ${label}: ${cost} SPP x`)}
            </button>
          `;
  }).join("") : `<span class="muted-text">${t("roster.noAdvancementsYet")}</span>`}
      </div>
    </div>
  `;
}
function renderEditableStatLine(player) {
  const stats = ["ma", "st", "ag", "pa", "ar"];
  return `
    <div class="player-stat-editors editable-stat-line">
      ${stats.map((stat) => {
        const mod = Number(player.statMods?.[stat] ?? 0);
        const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
        return `
          <div class="player-stat-editor ${modClass}">
            <span>${stat.toUpperCase()}</span>
            <strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], mod))}</strong>
            <div class="mini-stepper">
              <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="-1">-</button>
              <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="1">+</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

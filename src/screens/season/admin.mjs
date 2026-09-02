/**
 * The season's administration tab: round/pairing management and the
 * committed-teams roster, admin-only.
 *
 * Mechanically moved out of src/app.js, with the same deliberate change as
 * registration.mjs: `wireAdmin` takes the re-render as a `rerender`
 * callback instead of calling `renderSeason(false)` directly.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { availableSeasonSavedTeams, renderSeasonEntriesTable } from "./registration.mjs";
import { renderSeasonRounds } from "./schedule.mjs";
import { pairingLeaguePoints } from "./season-links.mjs";
import { makeSeasonStarterRoster, replaceSeasonData } from "./season-data.mjs";
import { toastError } from "../../components/toast.mjs";
import { confirmAction } from "../../components/dialog.mjs";
import { gameStatusLabel } from "../../components/game-status.mjs";

export function renderSeasonAdmin(data) {
  const admin = data.admin ?? { users: [], savedTeams: [] };
  const committedUserIds = new Set((data.entries ?? []).map((entry) => entry.user.id));
  const availableSavedTeams = availableSeasonSavedTeams(data);
  const availableUsers = admin.users.filter((user) => !committedUserIds.has(user.id));
  const teams = state.data.teams ?? [];
  return `
    <div class="season-admin-stack">
      <section class="content-panel season-card season-admin-panel">
        <h2>${t("season.adminControlsHeading")}</h2>
        <div class="season-admin-grid">
          <div class="season-admin-block">
            <h3>${t("season.tab.schedule")}</h3>
            <p>${t("season.roundsAdminNote")}</p>
            <button class="primary-button" type="button" data-season-generate-round>${t("season.generateNextRoundAction")}</button>
            <button class="filter-button" type="button" data-season-create-round>${t("season.createEmptyRoundAction")}</button>
          </div>

          <div class="season-admin-block">
            <h3>${t("season.addSavedTeamHeading")}</h3>
            ${availableSavedTeams.length ? `
              <label class="filter-field">
                <span>${t("season.savedTeamField")}</span>
                <select data-season-admin-team>
                  ${availableSavedTeams.map((team) => renderOption(team.id, `${team.owner.login} · ${team.name}`, "")).join("")}
                </select>
              </label>
              <button class="primary-button" type="button" data-season-admin-add-team>${t("season.addTeamAction")}</button>
            ` : `<p>${t("season.noEligibleSavedTeams")}</p>`}
          </div>

          <div class="season-admin-block">
            <h3>${t("season.createTeamForCoachHeading")}</h3>
            ${availableUsers.length ? `
              <label class="filter-field">
                <span>${t("admin.coachHeading")}</span>
                <select data-season-admin-user>
                  ${availableUsers.map((user) => renderOption(user.id, user.login, "")).join("")}
                </select>
              </label>
              <label class="filter-field">
                <span>${t("admin.rulesTeamField")}</span>
                <select data-season-admin-base-team>
                  ${teams.map((team) => renderOption(team.slug, team.title, "")).join("")}
                </select>
              </label>
              <label class="filter-field">
                <span>${t("savedRoster.teamName")}</span>
                <input type="text" data-season-admin-team-name placeholder="${t("season.newRosterNamePlaceholder")}">
              </label>
              <button class="primary-button" type="button" data-season-admin-create-team>${t("season.createAndCommitAction")}</button>
            ` : `<p>${t("season.everyCoachCommittedNote")}</p>`}
          </div>
        </div>
      </section>

      ${renderSeasonRounds(data, true)}

      <section class="content-panel season-card">
        <h2>${t("season.committedTeamsHeading")}</h2>
        ${renderSeasonAdminEntries(data)}
      </section>
    </div>
  `;
}

function renderSeasonAdminEntries(data) {
  return renderSeasonEntriesTable(data, true);
}

function seasonPairingPayload(row) {
  const homeEntry = row?.querySelector("[data-home-entry]");
  const awayEntry = row?.querySelector("[data-away-entry]");
  const payload = {
    homeTouchdowns: row?.querySelector("[data-home-td]")?.value ?? "",
    awayTouchdowns: row?.querySelector("[data-away-td]")?.value ?? "",
    homeCasualties: row?.querySelector("[data-home-casualties]")?.value ?? "",
    awayCasualties: row?.querySelector("[data-away-casualties]")?.value ?? "",
  };
  if (homeEntry && !homeEntry.disabled) payload.homeEntryId = homeEntry.value;
  if (awayEntry && !awayEntry.disabled) payload.awayEntryId = awayEntry.value;
  return payload;
}

function pairingFromSeasonData(data, pairingId) {
  for (const round of data?.rounds ?? []) {
    const pairing = (round.pairings ?? []).find((item) => item.id === pairingId);
    if (pairing) return pairing;
  }
  return null;
}

function updateSavedPairingResult(row, data, pairingId) {
  const pairing = pairingFromSeasonData(data, pairingId);
  if (!pairing) return;
  const status = row.querySelector("[data-pairing-status]");
  if (status) {
    status.dataset.status = pairing.resultStatus ?? "pending";
    status.textContent = gameStatusLabel(pairing.resultStatus);
  }
  const points = row.querySelector("[data-pairing-points]");
  if (points) points.textContent = pairingLeaguePoints(pairing);
}

async function saveSeasonPairingRow(row, { rerender = null } = {}) {
  const pairingId = row?.dataset.pairingRow;
  if (!pairingId) return;
  if (row.dataset.saving === "true") {
    row.dataset.saveAgain = "true";
    return;
  }
  clearTimeout(Number(row.dataset.saveTimer || 0));
  row.dataset.saveTimer = "";
  row.dataset.saveAgain = "";
  row.dataset.saving = "true";
  try {
    const data = await apiRequest(`/api/season/admin/pairings/${pairingId}`, {
      method: "PATCH",
      body: JSON.stringify(seasonPairingPayload(row)),
    });
    replaceSeasonData(data);
    row.dataset.saving = "false";
    if (row.dataset.saveAgain === "true") {
      updateSavedPairingResult(row, data, pairingId);
      void saveSeasonPairingRow(row, { rerender });
      return;
    }
    if (rerender) {
      const scrollX = globalThis.scrollX ?? 0;
      const scrollY = globalThis.scrollY ?? 0;
      await rerender();
      globalThis.scrollTo?.(scrollX, scrollY);
      return;
    }
    updateSavedPairingResult(row, data, pairingId);
  } catch (error) {
    row.dataset.saving = "false";
    toastError(error);
  }
}

/** Adding a coach's saved team, creating a fresh one for them, or removing an entry. */
function wireEntryManagement(rerender) {
  view.querySelector("[data-season-admin-add-team]")?.addEventListener("click", async () => {
    const teamId = view.querySelector("[data-season-admin-team]")?.value;
    if (!teamId) return;
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/entries", {
        method: "POST",
        body: JSON.stringify({ teamId }),
      }));
      rerender();
    } catch (error) {
      toastError(error);
    }
  });

  view.querySelector("[data-season-admin-create-team]")?.addEventListener("click", async () => {
    const userId = view.querySelector("[data-season-admin-user]")?.value;
    const baseTeamSlug = view.querySelector("[data-season-admin-base-team]")?.value;
    const baseTeam = state.data.teams.find((team) => team.slug === baseTeamSlug);
    if (!userId || !baseTeam) return;
    const name = String(view.querySelector("[data-season-admin-team-name]")?.value ?? "").trim() || baseTeam.title;
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/create-team", {
        method: "POST",
        body: JSON.stringify({
          userId,
          name,
          baseTeamSlug,
          roster: makeSeasonStarterRoster(baseTeam, name),
        }),
      }));
      state.myTeams.loaded = false;
      rerender();
    } catch (error) {
      toastError(error);
    }
  });

  view.querySelectorAll("[data-season-remove-entry]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!await confirmAction({
        message: t("season.confirmRemoveTeam"),
        confirmLabel: t("common.remove"),
        destructive: true,
      })) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/entries/${button.dataset.seasonRemoveEntry}`, {
          method: "DELETE",
        }));
        rerender();
      } catch (error) {
        toastError(error);
      }
    });
  });
}

/** Generating/creating/starting/deleting rounds, and adding or deleting a pairing. */
function wireRoundManagement(rerender) {
  view.querySelector("[data-season-generate-round]")?.addEventListener("click", async () => {
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/rounds/generate", {
        method: "POST",
        body: "{}",
      }));
      rerender();
    } catch (error) {
      toastError(error);
    }
  });

  view.querySelector("[data-season-create-round]")?.addEventListener("click", async () => {
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/rounds", {
        method: "POST",
        body: "{}",
      }));
      rerender();
    } catch (error) {
      toastError(error);
    }
  });

  view.querySelectorAll("[data-season-start-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonStartRound}/start`, {
          method: "POST",
          body: "{}",
        }));
        rerender();
      } catch (error) {
        toastError(error);
      }
    });
  });

  view.querySelectorAll("[data-season-delete-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!await confirmAction({
        message: t("season.confirmDeleteRound"),
        confirmLabel: t("common.delete"),
        destructive: true,
      })) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonDeleteRound}`, {
          method: "DELETE",
        }));
        rerender();
      } catch (error) {
        toastError(error);
      }
    });
  });

  view.querySelectorAll("[data-season-add-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonAddPairing}/pairings`, {
          method: "POST",
          body: JSON.stringify({ homeEntryId: "", awayEntryId: "" }),
        }));
        rerender();
      } catch (error) {
        toastError(error);
      }
    });
  });

}

function wirePairingDeletion(rerender) {
  view.querySelectorAll("[data-delete-season-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!await confirmAction({
        message: t("season.confirmDeletePairing"),
        confirmLabel: t("common.delete"),
        destructive: true,
      })) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/pairings/${button.dataset.deleteSeasonPairing}`, {
          method: "DELETE",
        }));
        rerender();
      } catch (error) {
        toastError(error);
      }
    });
  });
}

/** Auto-save on every edit to an admin-mode pairing row's score/entry fields. */
function wirePairingAutosave(rerender) {
  view.querySelectorAll("[data-pairing-row]").forEach((row) => {
    const saveEntries = () => saveSeasonPairingRow(row, { rerender });
    const saveScore = () => saveSeasonPairingRow(row);
    const saveSoon = () => {
      clearTimeout(Number(row.dataset.saveTimer || 0));
      row.dataset.saveTimer = String(setTimeout(saveScore, 350));
    };

    row.querySelectorAll("[data-home-entry], [data-away-entry]").forEach((field) => {
      field.addEventListener("change", saveEntries);
    });

    row.querySelectorAll("[data-home-td], [data-away-td], [data-home-casualties], [data-away-casualties]").forEach((field) => {
      field.addEventListener("input", saveSoon);
      field.addEventListener("change", saveScore);
    });
  });
}

export function wireAdmin(rerender) {
  wireEntryManagement(rerender);
  wireRoundManagement(rerender);
  wirePairingDeletion(rerender);
  wirePairingAutosave(rerender);
}

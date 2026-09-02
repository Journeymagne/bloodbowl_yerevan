/**
 * The season's schedule tab: rounds and their pairings, read-only here.
 *
 * Mechanically moved out of src/app.js. `renderSeasonRounds` also renders
 * the same rounds in edit mode for screens/season/admin.mjs
 * (`adminMode = true`) — admin.mjs imports it from here rather than
 * duplicating it, since the two views share every row but the last
 * (editable) column.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { gameStatusLabel } from "../../components/game-status.mjs";
import {
  pairingCasualties,
  pairingEntry,
  pairingLeaguePoints,
  pairingTeamCell,
  pairingTouchdowns,
  seasonEntryLabel,
} from "./season-links.mjs";

export function renderSeasonRounds(data, adminMode = false) {
  const rounds = data.rounds ?? [];
  if (!rounds.length) {
    return `
      <section class="content-panel season-card">
        <h2>${adminMode ? t("season.pairingControlsHeading") : t("season.tab.schedule")}</h2>
        <p>${t("season.noRoundsGeneratedNote")}</p>
      </section>
    `;
  }

  return `
    <section class="season-rounds">
      ${rounds.map((round) => `
        <article class="content-panel season-card">
          <header class="season-round-header">
            <div>
              <h2>${t("season.roundLabel")} ${round.roundNumber}</h2>
              <span class="season-status-pill" data-status="${escapeHtml(round.status)}">${escapeHtml(round.status)}</span>
            </div>
            ${adminMode ? renderSeasonRoundActions(round) : ""}
          </header>
          <div class="table-scroll">
            <table class="compact-roster-table season-table">
              <thead>
                ${adminMode ? `
                  <tr>
                    <th>${t("season.tableLabel")}</th>
                    <th>${t("season.homeLabel")}</th>
                    <th>${t("season.awayLabel")}</th>
                    <th>${t("admin.statusHeader")}</th>
                    <th>${t("season.tdHeader")}</th>
                    <th>${t("season.casualtiesHeader")}</th>
                    <th>${t("season.leaguePointsLabel")}</th>
                    <th>${t("roster.actionHeader")}</th>
                  </tr>
                ` : `
                  <tr>
                    <th>${t("season.tableLabel")}</th>
                    <th>${t("season.homeLabel")}</th>
                    <th>${t("season.tdHeader")}</th>
                    <th>${t("season.casualtiesHeader")}</th>
                    <th>${t("season.leaguePointsLabel")}</th>
                    <th>${t("season.awayLabel")}</th>
                  </tr>
                `}
              </thead>
              <tbody>
                ${round.pairings.map((pairing) => renderSeasonPairingRow(data, round, pairing, adminMode)).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderSeasonRoundActions(round) {
  return `
    <div class="season-round-actions">
      ${round.status === "draft" ? `
        <button class="primary-button compact-action" type="button" data-season-start-round="${escapeHtml(round.id)}">${t("season.startRoundAction")}</button>
      ` : ""}
      ${round.status === "draft" || round.status === "started" ? `
        <button class="filter-button compact-action" type="button" data-season-add-pairing="${escapeHtml(round.id)}">${t("season.addEmptyPairingAction")}</button>
      ` : ""}
      <button class="filter-button compact-action" type="button" data-season-delete-round="${escapeHtml(round.id)}">${t("season.deleteRoundAction")}</button>
    </div>
  `;
}

function renderSeasonPairingRow(data, round, pairing, adminMode = false) {
  const home = pairingEntry(data, pairing.homeEntryId);
  const away = pairingEntry(data, pairing.awayEntryId);
  const isBye = !away;
  const homeValue = pairing.homePoints ?? "";
  const awayValue = pairing.awayPoints ?? "";
  if (!adminMode) {
    return `
      <tr>
        <td>${pairing.tableNumber}</td>
        <td>${pairingTeamCell(data, pairing.homeEntryId)}</td>
        <td>${escapeHtml(pairingTouchdowns(pairing))}</td>
        <td>${escapeHtml(pairingCasualties(pairing))}</td>
        <td>${escapeHtml(pairingLeaguePoints(pairing))}</td>
        <td>${isBye ? `<strong>${t("season.byeLabel")}</strong>` : pairingTeamCell(data, pairing.awayEntryId)}</td>
      </tr>
    `;
  }

  const selectedEntryIds = selectedRoundEntryIds(round);
  return `
    <tr data-pairing-row="${escapeHtml(pairing.id)}">
      <td>${pairing.tableNumber}</td>
      <td>${renderSeasonEntrySelect(data, "home-entry", pairing.homeEntryId, false, selectedEntryIds)}</td>
      <td>${renderSeasonEntrySelect(data, "away-entry", pairing.awayEntryId, false, selectedEntryIds)}</td>
      <td><span class="season-status-pill" data-status="${escapeHtml(pairing.resultStatus)}" data-pairing-status>${escapeHtml(gameStatusLabel(pairing.resultStatus))}</span></td>
      <td>
        <div class="season-td-pair">
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.homeTouchdowns ?? "")}" data-home-td>
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.awayTouchdowns ?? "")}" data-away-td>
        </div>
      </td>
      <td>
        <div class="season-td-pair">
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.homeCasualties ?? "")}" data-home-casualties>
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.awayCasualties ?? "")}" data-away-casualties>
        </div>
      </td>
      <td data-pairing-points>${escapeHtml(pairingLeaguePoints(pairing))}</td>
      <td>
        <div class="table-actions">
          <button class="filter-button compact-action" type="button" data-delete-season-pairing="${escapeHtml(pairing.id)}">${t("common.delete")}</button>
        </div>
      </td>
    </tr>
  `;
}

function selectedRoundEntryIds(round) {
  const selected = new Set();
  for (const pairing of round.pairings ?? []) {
    if (pairing.homeEntryId) selected.add(pairing.homeEntryId);
    if (pairing.awayEntryId) selected.add(pairing.awayEntryId);
  }
  return selected;
}

function renderSeasonEntrySelect(data, name, selected, disabled = false, unavailableEntryIds = new Set()) {
  const selectedValue = selected ?? "";
  const options = (data.entries ?? []).filter((entry) => entry.id === selectedValue || !unavailableEntryIds.has(entry.id));
  return `
    <select class="table-select" data-${name} ${disabled ? "disabled" : ""}>
      ${renderOption("", t("season.emptySlotLabel"), selectedValue)}
      ${options.map((entry) => renderOption(entry.id, seasonEntryLabel(entry), selectedValue)).join("")}
    </select>
  `;
}

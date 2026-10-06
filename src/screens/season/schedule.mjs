/**
 * The season's schedule tab: rounds and their pairings, read-only here.
 *
 * Mechanically moved out of src/app.js. `renderSeasonRounds` also renders
 * the same rounds in edit mode for screens/season/admin.mjs
 * (`adminMode = true`) — admin.mjs imports it from here rather than
 * duplicating it: both views keep each participant and their scores together.
 */
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { gameStatusLabel } from "../../components/game-status.mjs";
import { iconButton } from "../../components/icons.mjs";
import {
  pairingEntry,
  pairingTeamCell,
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
            <table class="compact-roster-table season-results-table ${adminMode ? 'season-results-admin' : ''}">
              <thead>
                  <tr>
                    <th scope="col" class="season-match-number">${t("season.tableLabel")}</th>
                    <th scope="col">${t("season.participantHeader")}</th>
                    <th scope="col" class="season-result-counter">${t("season.tdHeader")}</th>
                    <th scope="col" class="season-result-counter">${t("season.casualtiesHeader")}</th>
                    <th scope="col" class="season-result-points">${t("season.leaguePointsLabel")}</th>
                    <th scope="col" class="season-match-status">${t("admin.statusHeader")}</th>
                    ${adminMode ? `<th scope="col" class="season-match-actions">${t("roster.actionHeader")}</th>` : ''}
                  </tr>
              </thead>
                ${round.pairings.map((pairing) => renderSeasonPairingRow(data, round, pairing, adminMode)).join("")}
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
  const selectedEntryIds = selectedRoundEntryIds(round);
  return `<tbody class="season-match-group" ${adminMode ? `data-pairing-row="${escapeHtml(pairing.id)}"` : ''} aria-label="${t('season.matchGroupLabel', { number: pairing.tableNumber })}">
    ${['home', 'away'].map(name => `<tr class="season-result-side season-result-${name}">
      ${name === 'home' ? `<td class="season-match-number" rowspan="2" data-label="${t('season.tableLabel')}"><strong>${pairing.tableNumber}</strong></td>` : ''}
      ${renderSeasonParticipant(data, pairing, name, adminMode, selectedEntryIds)}
      ${renderSeasonCounter(pairing, data, name, 'td', adminMode)}
      ${renderSeasonCounter(pairing, data, name, 'casualties', adminMode)}
      <td class="season-result-points" data-pairing-${name}-points data-label="${t('season.leaguePointsLabel')}">${escapeHtml(pairing[name + 'Points'] ?? '—')}</td>
      ${name === 'home' ? renderSeasonMatchMeta(pairing, adminMode) : ''}
    </tr>`).join('')}</tbody>`;
}

function renderSeasonParticipant(data, pairing, name, adminMode, selectedEntryIds) {
  const entryId = pairing[name + 'EntryId'], entry = pairingEntry(data, entryId), label = t(name === 'home' ? 'season.homeLabel' : 'season.awayLabel');
  const other = pairing[name === 'home' ? 'awayEntryId' : 'homeEntryId'];
  const content = adminMode ? renderSeasonEntrySelect(data, name + '-entry', entryId, false, selectedEntryIds)
    : entry ? pairingTeamCell(data, entryId) : `<span class="muted-text">${t(other ? 'season.byeLabel' : 'season.emptySlotLabel')}</span>`;
  return `<th scope="row" class="season-result-participant"><${adminMode ? 'label' : 'div'} class="season-result-identity"><span class="season-result-side-label">${label}</span>${content}</${adminMode ? 'label' : 'div'}></th>`;
}

function renderSeasonCounter(pairing, data, name, counter, adminMode) {
  const key = counter === 'td' ? 'Touchdowns' : 'Casualties', label = t(counter === 'td' ? 'season.tdHeader' : 'season.casualtiesHeader');
  const value = pairing[name + key], entry = pairingEntry(data, pairing[name + 'EntryId']);
  const participant = entry ? seasonEntryLabel(entry) : t(name === 'home' ? 'season.homeLabel' : 'season.awayLabel');
  const content = adminMode ? `<input class="season-score-input" type="number" min="0" step="1" inputmode="numeric" placeholder="—" value="${escapeHtml(value ?? '')}" data-${name}-${counter} aria-label="${escapeHtml(t('season.scoreFieldLabel', { counter: label, participant }))}">` : escapeHtml(value ?? '—');
  return `<td class="season-result-counter" data-label="${label}">${content}</td>`;
}

function renderSeasonMatchMeta(pairing, adminMode) {
  return `<td class="season-match-status" rowspan="2"><span class="season-status-pill" data-status="${escapeHtml(pairing.resultStatus)}" data-pairing-status>${escapeHtml(gameStatusLabel(pairing.resultStatus))}</span></td>
    ${adminMode ? `<td class="season-match-actions" rowspan="2"><div class="table-actions">${iconButton('trash', { title: t('common.delete'), attributes: `data-delete-season-pairing="${escapeHtml(pairing.id)}"` })}</div></td>` : ''}`;
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

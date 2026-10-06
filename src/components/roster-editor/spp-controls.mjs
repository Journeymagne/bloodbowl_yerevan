/** Both directions change one recorded event; totals use the league's real weights. */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { sppCounterDefinitions } from "../../domain/league-rules.mjs";
import { normalizeSppCounters } from "../../domain/roster/players.mjs";
import { playerSppTotal, playerAvailableSpp, sppCounterWeights } from "../../domain/roster/progression.mjs";

export function renderSppControls(team, player, { readOnly = false } = {}) {
  const spp = normalizeSppCounters(player.spp);
  const weights = sppCounterWeights(team);
  return `<div class="spp-counter-grid matchday-spp-grid">
    ${sppCounterDefinitions.map(([key, label]) => {
      const id = `spp-${player.id}-${key}`;
      return `<div class="spp-counter-field matchday-spp-counter" data-key="${escapeHtml(id)}">
        <label for="${escapeHtml(id)}"><span>${label}</span><small>+${weights[key]} SPP</small></label>
        <div class="matchday-spp-stepper">
          <button type="button" class="filter-button" ${readOnly ? "disabled" : `data-saved-player-spp-action="${key}" data-spp-delta="-1" ${spp[key] <= 0 ? "disabled" : ""}`} aria-label="${escapeHtml(t("roster.decreaseSpp", { counter: label }))}">−</button>
          ${readOnly ? `<output id="${escapeHtml(id)}" aria-label="${label}">${spp[key]}</output>` : `<input id="${escapeHtml(id)}" type="number" min="0" step="1" inputmode="numeric" value="${spp[key]}" data-saved-player-spp="${key}" aria-label="${label}">`}
          <button type="button" class="filter-button mobile-spp-action" ${readOnly ? "disabled" : `data-saved-player-spp-action="${key}" data-spp-delta="1"`} aria-label="${escapeHtml(t("roster.increaseSpp", { counter: label }))}">+</button>
        </div>
      </div>`;
    }).join("")}
    <div class="matchday-spp-total"><span>${t("savedRoster.totalSppLabel")}</span><strong data-player-spp-total>${playerSppTotal(team, player)}</strong><small data-player-available-spp>${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}</small></div>
  </div>`;
}

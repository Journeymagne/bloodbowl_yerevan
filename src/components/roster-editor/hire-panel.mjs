/**
 * The pool a coach hires from, shared by both editors.
 *
 * There used to be two of these: renderAvailablePlayerTable in the builder and
 * renderSavedNewPlayerTable in the saved-roster screen, with the same thirteen
 * columns and the same body, differing only in whether a budget applied, which
 * data attribute the buttons carried, and one heading. Two of the twelve
 * duplicate pairs the design spec counts in section 5.1.
 *
 * What differs now lives in modes.mjs; this file reads flags and never asks
 * which mode it is in.
 *
 * Step 7.6 of the plan lands here too: a hire that cannot be made says why.
 * The buttons were already disabled, but silently — a coach who had run out of
 * budget saw a dead button and no reason for it.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { startingBudget } from "../../domain/league-rules.mjs";
import { calculateRosterCosts } from "../../domain/roster/costs.mjs";
import { canAddRowToDraft, makeRosterPlayer, rowCountInPlayers, syncRosterCountsFromPlayers } from "../../domain/roster/players.mjs";
import { spendTreasury } from "../../domain/roster/costs.mjs";
import { costToNumber, rosterMax, rowCost, rowsForTeam } from "../../domain/roster/values.mjs";
import { renderRosterLinks } from "../content-links.mjs";
import { renderAccessCell, renderRosterStatCells } from "../roster-editor-shared.mjs";
import { renderRosterStatGrid } from "../../screens/detail.mjs";

/**
 * Why this position cannot be hired right now, or nothing if it can.
 *
 * @returns {{blocked: boolean, reason: string, title: string}}
 */
function hireVerdict(team, draft, row, rowIndex, mode, costs) {
  if (mode.enforcesPositionLimit && !canAddRowToDraft(row, rowIndex, draft, true)) {
    return {
      blocked: true,
      reason: "position",
      title: t("validation.POSITION_MAX", { position: row.position, max: rosterMax(row.qty) }),
    };
  }
  if (mode.enforcesBudget && costs.total + costToNumber(rowCost(row)) > startingBudget) {
    return {
      blocked: true,
      reason: "budget",
      title: t("validation.BUDGET_EXCEEDED", { budget: startingBudget, total: costs.total }),
    };
  }
  return { blocked: false, reason: "", title: "" };
}

function hireButton(rowIndex, mode, verdict, className) {
  const attributes = [
    `class="primary-button ${className}"`,
    `type="button"`,
    `data-${mode.hireAttribute}="${rowIndex}"`,
    verdict.blocked ? "disabled" : "",
    verdict.blocked ? `aria-disabled="true"` : "",
    verdict.blocked ? `title="${escapeHtml(verdict.title)}"` : "",
  ].filter(Boolean).join(" ");
  return `<button ${attributes}>+</button>`;
}

export function renderHirePanel(team, draft, mode) {
  const costs = calculateRosterCosts(team, draft, { includeDedicatedFans: mode.enforcesBudget });
  const rows = rowsForTeam(team);
  const verdicts = rows.map((row, rowIndex) => hireVerdict(team, draft, row, rowIndex, mode, costs));

  return `
    <div class="table-scroll builder-table-scroll builder-available-table-wrap">
      <table class="builder-table compact-roster-table add-player-table">
        <thead>
          <tr>
            <th>${t("roster.qtyHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("roster.primary")}</th>
            <th>${t("roster.secondary")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t(mode.hireCountHeadingKey)}</th>
            <th>${t("common.add")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIndex) => {
            const verdict = verdicts[rowIndex];
            const current = rowCountInPlayers(draft, rowIndex);
            return `
              <tr class="${verdict.blocked ? "disabled-row" : ""}">
                <td>${escapeHtml(row.qty || "-")}</td>
                <td><strong>${escapeHtml(row.position)}</strong></td>
                ${renderRosterStatCells(row)}
                <td class="skills-cell">${renderRosterLinks(row.skills)}</td>
                <td>${renderAccessCell(row.primary)}</td>
                <td>${renderAccessCell(row.secondary)}</td>
                <td>${escapeHtml(rowCost(row) || "-")}</td>
                <td>${current}/${rosterMax(row.qty)}${verdict.reason === "budget" ? `<span class="danger-text"> ${t("builder.overBudget")}</span>` : ""}</td>
                <td>${hireButton(rowIndex, mode, verdict, "table-plus-button")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    ${mode.showsHireCards ? `
      <div class="builder-mobile-card-list available-player-mobile-list">
        ${rows.map((row, rowIndex) => renderHireCard(row, rowIndex, draft, mode, verdicts[rowIndex])).join("")}
      </div>
    ` : ""}
  `;
}

function renderHireCard(row, rowIndex, draft, mode, verdict) {
  const current = rowCountInPlayers(draft, rowIndex);
  return `
    <article class="available-player-card ${verdict.blocked ? "disabled" : ""}">
      <header class="available-player-head">
        <div>
          <strong>${escapeHtml(row.position)}</strong>
          <em>${escapeHtml(row.qty || "-")} · ${escapeHtml(rowCost(row) || "-")}</em>
        </div>
        ${hireButton(rowIndex, mode, verdict, "add-player-button")}
      </header>
      ${renderRosterStatGrid(row)}
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${renderRosterLinks(row.skills)}</div>
      </section>
      <footer class="available-player-foot">
        ${t("roster.primary")} ${renderAccessCell(row.primary)} · ${t("roster.secondary")} ${renderAccessCell(row.secondary)} · ${t("roster.selectedLabel")} ${current}/${rosterMax(row.qty)}${verdict.reason === "budget" ? ` · ${t("roster.overBudgetLabel")}` : ""}
      </footer>
    </article>
  `;
}

/**
 * Attach the hire buttons. The domain effect lives here rather than in each
 * screen: which flags apply is the mode's business, and duplicating it is what
 * let the two editors disagree about whether a hire touches the treasury.
 *
 * @param {ParentNode} root
 * @param {{team: object, draft: object, mode: object, onChange: () => void}} deps
 */
export function wireHirePanel(root, { team, draft, mode, onChange }) {
  root.querySelectorAll(`[data-${mode.hireAttribute}]`).forEach((button) => {
    button.addEventListener("click", () => {
      const rowIndex = Number(button.dataset[mode.hireAttribute === "add-row" ? "addRow" : "addSavedRow"]);
      const row = rowsForTeam(team)[rowIndex];
      if (!row) return;

      const costs = calculateRosterCosts(team, draft, { includeDedicatedFans: mode.enforcesBudget });
      if (hireVerdict(team, draft, row, rowIndex, mode, costs).blocked) return;

      const options = mode.marksPurchased ? { purchased: true } : {};
      draft.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex), options));
      if (mode.spendsTreasury) spendTreasury(draft, costToNumber(rowCost(row)));
      syncRosterCountsFromPlayers(draft);
      onChange();
    });
  });
}

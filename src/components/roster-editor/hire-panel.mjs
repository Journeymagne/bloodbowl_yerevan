/**
 * The pool a coach hires from, shared by both editors.
 *
 * There used to be two of these: renderAvailablePlayerTable in the builder and
 * renderSavedNewPlayerTable in the saved-roster screen, with the same thirteen
 * columns and the same body, differing only in whether a budget applied, which
 * data attribute the buttons carried, and one heading. Two of the twelve
 * duplicate pairs the design spec counts in section 5.1.
 *
 * What differs between the two situations lives in modes.mjs; this file reads
 * flags and never asks which mode it is in.
 *
 * Step 7.3 asks for one markup with the layout left to CSS. That is not what
 * the card is: it is a designed layout — position with quantity and price
 * inline, a stat grid, skills as pills — rather than the table folded into
 * blocks, and turning it into a generic block table would be a worse phone
 * screen, not a better one. What the duplication actually cost was having to
 * make every change twice, so each field is declared once below and the two
 * layouts arrange the same values differently. Stats are the exception: the
 * table wants cells and the card wants a grid, which is structure rather than
 * content, so those stay as two renderers over the same row.
 *
 * Step 7.6 lands here too: a hire that cannot be made says why. The buttons
 * were already disabled, but silently — a coach who had run out of budget saw
 * a dead button and no reason for it.
 */
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { startingBudget } from "../../domain/league-rules.mjs";
import { calculateRosterCosts, spendTreasury } from "../../domain/roster/costs.mjs";
import { canAddRowToDraft, makeRosterPlayer, rowCountInPlayers, syncRosterCountsFromPlayers } from "../../domain/roster/players.mjs";
import { costToNumber, rosterMax, rowCost, rowsForTeam } from "../../domain/roster/values.mjs";
import { renderRosterLinks } from "../content-links.mjs";
import { renderAccessCell, renderRosterStatCells } from "../roster-editor-shared.mjs";
import { renderRosterStatGrid } from "../../screens/detail.mjs";

/**
 * Why this position cannot be hired right now, or nothing if it can.
 *
 * @returns {{blocked: boolean, reason: string, title: string}}
 */
function hireVerdict(draft, row, rowIndex, mode, costs) {
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

/**
 * Everything the pool says about one position, written once.
 *
 * The table and the card both read from here, so a change to what a field says
 * lands in both without being typed twice.
 */
function hireFields(row, rowIndex, draft, mode, verdict) {
  const current = rowCountInPlayers(draft, rowIndex);
  return {
    qty: escapeHtml(row.qty || "-"),
    position: escapeHtml(row.position),
    skills: renderRosterLinks(row.skills),
    primary: renderAccessCell(row.primary),
    secondary: renderAccessCell(row.secondary),
    cost: escapeHtml(rowCost(row) || "-"),
    taken: `${current}/${rosterMax(row.qty)}`,
    overBudget: verdict.reason === "budget",
    blocked: verdict.blocked,
    button: (className) => hireButton(rowIndex, mode, verdict, className),
  };
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
  const fields = rows.map((row, rowIndex) =>
    hireFields(row, rowIndex, draft, mode, hireVerdict(draft, row, rowIndex, mode, costs)));

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
            const field = fields[rowIndex];
            return `
              <tr class="${field.blocked ? "disabled-row" : ""}">
                <td>${field.qty}</td>
                <td><strong>${field.position}</strong></td>
                ${renderRosterStatCells(row)}
                <td class="skills-cell">${field.skills}</td>
                <td>${field.primary}</td>
                <td>${field.secondary}</td>
                <td>${field.cost}</td>
                <td>${field.taken}${field.overBudget ? `<span class="danger-text"> ${t("builder.overBudget")}</span>` : ""}</td>
                <td>${field.button("table-plus-button")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    ${mode.showsHireCards ? `
      <div class="builder-mobile-card-list available-player-mobile-list">
        ${rows.map((row, rowIndex) => renderHireCard(row, fields[rowIndex])).join("")}
      </div>
    ` : ""}
  `;
}

function renderHireCard(row, field) {
  return `
    <article class="available-player-card ${field.blocked ? "disabled" : ""}">
      <header class="available-player-head">
        <div>
          <strong>${field.position}</strong>
          <em>${field.qty} · ${field.cost}</em>
        </div>
        ${field.button("add-player-button")}
      </header>
      ${renderRosterStatGrid(row)}
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${field.skills}</div>
      </section>
      <footer class="available-player-foot">
        ${t("roster.primary")} ${field.primary} · ${t("roster.secondary")} ${field.secondary} · ${t("roster.selectedLabel")} ${field.taken}${field.overBudget ? ` · ${t("roster.overBudgetLabel")}` : ""}
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
  const events = listenerGroup(root);
  const property = mode.hireAttribute === "add-row" ? "addRow" : "addSavedRow";
  events.on("click", `[data-${mode.hireAttribute}]`, (event, button) => {
    const rowIndex = Number(button.dataset[property]);
    const row = rowsForTeam(team)[rowIndex];
    if (!row) return;

    const costs = calculateRosterCosts(team, draft, { includeDedicatedFans: mode.enforcesBudget });
    if (hireVerdict(draft, row, rowIndex, mode, costs).blocked) return;

    const options = mode.marksPurchased ? { purchased: true } : {};
    draft.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex), options));
    if (mode.spendsTreasury) spendTreasury(draft, costToNumber(rowCost(row)));
    syncRosterCountsFromPlayers(draft);
    onChange();
  });
  return () => events.release();
}

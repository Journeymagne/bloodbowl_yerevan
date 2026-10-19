/**
 * The pool a coach hires from.
 *
 * There used to be two of these: renderAvailablePlayerTable in the 2.x builder
 * and renderSavedNewPlayerTable in the saved-roster screen, with the same
 * thirteen columns and the same body. The builder is gone (the 3.0 team builder
 * replaced it), and this is the one that stayed.
 *
 * A hire is never refused here: the league editor does not enforce position
 * limits at the button, and a roster that breaks one is reported by
 * validateRoster, which the server answers with 422. What the mode says about
 * the pool lives in modes.mjs; this file reads it and never asks which mode it
 * is in.
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
 */
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { spendTreasury } from "../../domain/roster/costs.mjs";
import { makeRosterPlayer, rowCountInPlayers, syncRosterCountsFromPlayers } from "../../domain/roster/players.mjs";
import { costToNumber, rosterMax, rowCost, rowsForTeam } from "../../domain/roster/values.mjs";
import { renderRosterLinks } from "../content-links.mjs";
import { iconButton } from "../icons.mjs";
import { renderAccessCell, renderRosterStatCells } from "../roster-editor-shared.mjs";

/**
 * Everything the pool says about one position, written once.
 *
 * The table and the card both read from here, so a change to what a field says
 * lands in both without being typed twice.
 */
function hireFields(row, rowIndex, draft, mode) {
  const current = rowCountInPlayers(draft, rowIndex);
  return {
    qty: escapeHtml(row.qty || "-"),
    position: escapeHtml(row.position),
    skills: renderRosterLinks(row.skills),
    primary: renderAccessCell(row.primary),
    secondary: renderAccessCell(row.secondary),
    cost: escapeHtml(rowCost(row) || "-"),
    taken: `${current}/${rosterMax(row.qty)}`,
    iconButton: () => iconButton("plus", { attributes: `data-${mode.hireAttribute}="${rowIndex}"` }),
  };
}

export function renderHirePanel(team, draft, mode, { cardsOnly = false } = {}) {
  const rows = rowsForTeam(team);
  const fields = rows.map((row, rowIndex) => hireFields(row, rowIndex, draft, mode));
  if (cardsOnly) return `<div class="available-player-mobile-list matchday-hire-list">${rows.map((row, index) => renderHireCard(row, fields[index])).join("")}</div>`;

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
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIndex) => {
            const field = fields[rowIndex];
            return `
              <tr>
                <td>${field.qty}</td>
                <td><strong>${field.position}</strong></td>
                ${renderRosterStatCells(row)}
                <td class="skills-cell">${field.skills}</td>
                <td>${field.primary}</td>
                <td>${field.secondary}</td>
                <td>${field.cost}</td>
                <td>${field.taken}</td>
                <td class="fit-cell center-cell">${field.iconButton()}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRosterStatGrid(row) {
  return `
    <dl class="team-stat-grid">
      <div><dt>${t("stats.ma")}</dt><dd>${escapeHtml(row.ma || "-")}</dd></div>
      <div><dt>${t("stats.st")}</dt><dd>${escapeHtml(row.st || "-")}</dd></div>
      <div><dt>${t("stats.ag")}</dt><dd>${escapeHtml(row.ag || "-")}</dd></div>
      <div><dt>${t("stats.pa")}</dt><dd>${escapeHtml(row.pa || "-")}</dd></div>
      <div><dt>${t("stats.ar")}</dt><dd>${escapeHtml(row.ar || "-")}</dd></div>
    </dl>
  `;
}

function renderHireCard(row, field) {
  return `
    <article class="available-player-card">
      <header class="available-player-head">
        <div>
          <strong>${field.position}</strong>
          <em>${field.taken} · ${field.cost}</em>
        </div>
        ${field.iconButton()}
      </header>
      ${renderRosterStatGrid(row)}
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${field.skills}</div>
      </section>
      <footer class="available-player-foot">
        ${t("roster.primary")} ${field.primary} · ${t("roster.secondary")} ${field.secondary} · ${t("roster.selectedLabel")} ${field.taken}
      </footer>
    </article>
  `;
}

/**
 * Attach the hire buttons. The domain effect lives here rather than in each
 * screen: a hire is recorded as bought after the team started, with the price it
 * can be refunded at, and paid for out of the treasury.
 *
 * @param {ParentNode} root
 * @param {{team: object, draft: object, mode: object, onChange: () => void}} deps
 */
export function wireHirePanel(root, { team, draft, mode, onChange }) {
  const events = listenerGroup(root);
  events.on("click", `[data-${mode.hireAttribute}]`, (event, button) => {
    const rowIndex = Number(button.dataset.addSavedRow);
    const row = rowsForTeam(team)[rowIndex];
    if (!row) return;

    const price = costToNumber(rowCost(row));
    draft.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex),
      { purchased: true, purchaseRefund: price }));
    spendTreasury(draft, price);
    syncRosterCountsFromPlayers(draft);
    onChange();
  });
  return () => events.release();
}

/**
 * The roster table, shared by both editors.
 *
 * There used to be two: renderBuilderPlayerList and renderSavedPlayerList, the
 * same scroll wrapper, table, header row, body and mobile card list twice, and
 * the same empty-state guard. Two more of the duplicate pairs section 5.1 of
 * the design spec counts.
 *
 * The cells are **not** merged into one row renderer with a flag per column.
 * The builder shows a finished line — twelve columns, nothing to edit but the
 * name; the league editor shows twenty, most of them controls: stat steppers,
 * SPP counters, advancements, injuries, contracts. A single row renderer would
 * need a flag on nearly every cell, which moves the branching from two files
 * into one rather than removing it — the reason step 7.2 was deliberately left
 * undone in task 7.
 *
 * What is shared instead is the **shape**: a list of columns, each declared
 * once with its heading and its cell. Both editors describe their own columns
 * and hand them here. That kills the structural duplication and closes a real
 * hazard along with it — with twenty columns, a heading added to `<thead>` and
 * forgotten in the row shifted every cell after it, and nothing complained.
 *
 * Cards stay per-editor. Step 7.3 settled that question for the hire pool and
 * the answer is the same here: a phone card is a designed layout, not the table
 * folded into blocks.
 */
import { escapeHtml } from "../../core/dom.mjs";

/**
 * @typedef {object} PlayerColumn
 * @property {string} header already-translated heading text
 * @property {string|((player: object) => string)} [className] class for the `<td>`
 * @property {(player: object, index: number) => string} cell the cell's markup
 */

function classFor(column, player) {
  const value = typeof column.className === "function" ? column.className(player) : column.className;
  return value ? ` class="${value}"` : "";
}

/**
 * @param {object} options
 * @param {object[]} options.players from selectedRosterPlayers()
 * @param {PlayerColumn[]} options.columns declared by the editor, in order
 * @param {string} options.emptyText shown instead of the table when there are none
 * @param {{wrap: string, table: string, mobileList: string}} options.classes
 * @param {(player: object) => string} [options.rowAttributes] extra `<tr>` attributes
 * @param {(player: object, index: number) => string} options.renderCard the phone layout
 */
export function renderPlayerList({ players, columns, emptyText, classes, rowAttributes, renderCard }) {
  if (!players.length) return `<div class="builder-empty-roster">${emptyText}</div>`;
  const cells = columns.filter(Boolean);
  return `
    <div class="table-scroll builder-table-scroll ${classes.wrap}">
      <table class="${classes.table} compact-roster-table">
        <thead>
          <tr>${cells.map((column) => `<th>${column.header}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${players.map((player, index) => `
            <tr data-key="${escapeHtml(player.id)}" ${rowAttributes?.(player) ?? ""}>
              ${cells.map((column) => `<td${classFor(column, player)}>${column.cell(player, index)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="${classes.mobileList}">
      ${players.map((player, index) => renderCard(player, index)).join("")}
    </div>
  `;
}

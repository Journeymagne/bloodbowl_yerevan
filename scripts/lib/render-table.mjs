/**
 * A Markdown table as the HTML the reference pages show.
 *
 * The layout of a column is decided here, at build time, from its header and
 * its cells: stat, dice and cost columns stay narrow, numbers are centred, a
 * short table fits the page instead of scrolling. The text inside a cell is
 * rendered by the caller, which is the only part that knows about the pages
 * a name can link to.
 */
import { stripMarkdownFormatting as stripFormatting } from "../../src/core/markdown.mjs";
import { SENTENCE } from "./auto-link.mjs";

const NUMBER_RANGE = /^\d+\s*[-–]\s*\d+$/;
const WHOLE_NUMBER = /^\d+$/;
const DICE_COLUMN = /^\d*d\d+$/i;
const UNLINKED_COLUMNS = ["Position", "Позиция", "Result", "Результат"];
const CENTERED_COLUMNS = ["Qty", "MA", "ST", "AG", "PA", "AR", "Roll", "Бросок", "Trigger", "Триггер"];
const FIT_TABLE_MAX_COLUMNS = 5;

function classAttribute(...names) {
  const classes = names.filter(Boolean);
  return classes.length ? ` class="${classes.join(" ")}"` : "";
}

function columnClass(headerLabel, cells) {
  if (CENTERED_COLUMNS.includes(headerLabel) || DICE_COLUMN.test(headerLabel)) return "fit-cell center-cell";
  if (headerLabel === "Cost") return "fit-cell number-cell";
  return cells.length && cells.every((cell) => WHOLE_NUMBER.test(cell.trim())) ? "center-cell" : "";
}

/**
 * @param {string[]} header the cells of the header row
 * @param {string[][]} rows the cells of each body row
 * @param {(cell: string, linking?: {autoLinkKnown: boolean, prose: boolean}) => string} renderInline
 * @returns {string[]} the table's HTML, one entry per line
 */
export function renderTable(header, rows, renderInline) {
  const headerLabels = header.map(stripFormatting);
  const columnClasses = headerLabels.map((label, column) => columnClass(label, rows.map((row) => row[column] ?? "")));
  const tableClass = classAttribute(headerLabels[0] === "#" ? "numbered-table" : "", header.length <= FIT_TABLE_MAX_COLUMNS ? "fit-table" : "");
  const renderCell = (cell, column) => {
    const cellClass = classAttribute(NUMBER_RANGE.test(cell.trim()) ? "nowrap-cell" : "", columnClasses[column]);
    const linking = { autoLinkKnown: !UNLINKED_COLUMNS.includes(headerLabels[column] ?? ""), prose: SENTENCE.test(cell) };
    return `<td${cellClass}>${renderInline(cell, linking)}</td>`;
  };
  return [
    `<div class="table-scroll"><table${tableClass}><thead><tr>`,
    header.map((cell, column) => `<th${classAttribute(columnClasses[column])}>${renderInline(cell)}</th>`).join(""),
    "</tr></thead><tbody>",
    ...rows.flatMap((row) => ["<tr>", row.map(renderCell).join(""), "</tr>"]),
    "</tbody></table></div>",
  ];
}

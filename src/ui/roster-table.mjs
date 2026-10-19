/**
 * The roster as a real table (not the README's grid of buttons): sortable
 * columns a screen reader reads as columns, one body per player — his row, his
 * skills for a phone, his open panel — and a foot that repeats the labels at the
 * end of a long list. Which order, which values and what the panel says is the
 * caller's.
 *
 * Two widths, one markup. Up to 900px the table is the page's width: the
 * player, the five characteristics, and under each player a row of his skills
 * (and, once he is opened, his panel); the career columns and the over-heads are
 * hidden. From 901px every column shows, the skills stand under the name, the
 * table scrolls inside its frame with the player's column held in place, and
 * the panel is the screen's, beside the table.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames, dataAttributes } from "./markup.mjs";

/** The column groups a width is set for: see roster-table.css. */
const GROUPS = ["stats", "career", "spp"];
/** The tones a value can wear; a value with none is plain. */
const TONES = ["zero", "up", "down", "strong"];
const ARROWS = { asc: "▲", desc: "▼" };
const ARIA_SORT = { asc: "ascending", desc: "descending" };
/** An id an aria-controls names: one, with no blank to make it a list. */
const PLAIN_ID = /^[A-Za-z][\w-]*$/;

/** A table that would draw wrong is a bug in the caller, found where the caller is. */
function check({ label, columns, groups, rows, sort }) {
  if (!label) throw new Error("a roster table needs a label: it is what names the table for a screen reader");
  if (!Array.isArray(columns) || !columns.length) throw new Error("a roster table needs columns, the first of them the player's");
  // After the player's, every column has a group: its width is its group's, and a column with none would be left whatever the others do not take.
  const stray = columns.find((column, index) => (index > 0 || column.group !== undefined) && !GROUPS.includes(column.group));
  if (stray && stray.group === undefined) throw new Error(`column ${JSON.stringify(stray.key)} has no group: one of ${GROUPS.join(", ")}`);
  if (stray) throw new Error(`unknown column group: ${JSON.stringify(stray.group)}`);
  const spanned = groups.reduce((sum, { span }) => sum + (Number.isInteger(span) && span > 0 ? span : NaN), 0);
  if (groups.length && spanned !== columns.length - 1) {
    throw new Error(`the groups span ${spanned} columns and the table has ${columns.length - 1} after the player's: an over-head that is not over its columns draws wrong`);
  }
  if (sort && !Object.hasOwn(ARROWS, sort.dir)) throw new Error(`unknown sort direction: ${JSON.stringify(sort.dir)}`);
  const keys = new Set();
  for (const row of rows) {
    if (!row.key) throw new Error("a row needs a key: it is what the table reports, and what finds its body");
    if (/\s/.test(row.key)) throw new Error(`the key ${JSON.stringify(row.key)} has a blank in it: it makes the id of the row's panel, which an aria-controls reads as a list`);
    if (keys.has(row.key)) throw new Error(`two rows with the key ${JSON.stringify(row.key)}: a key is unique among the rows`);
    keys.add(row.key);
    if (!row.badgeHtml) throw new Error(`row ${JSON.stringify(row.key)} needs a badge: the markup of renderPlayerBadge`);
    if (row.controls !== undefined && !(typeof row.controls === "string" && PLAIN_ID.test(row.controls))) throw new Error(`row ${JSON.stringify(row.key)} controls ${JSON.stringify(row.controls)}: a plain id, as aria-controls reads it`);
    if (row.controls && row.expanded) throw new Error(`row ${JSON.stringify(row.key)} both opens its own panel and controls ${JSON.stringify(row.controls)}: a button does one`);
    if (row.cells?.length !== columns.length - 1) {
      throw new Error(`row ${JSON.stringify(row.key)} has ${row.cells?.length ?? "no"} cells for ${columns.length - 1} columns after the player's`);
    }
  }
}

/** The classes that say where a column stands, on its header, its cells and its foot. */
const placeOf = (column) => classNames(column.group && `g-rtable__c--${column.group}`, column.desk && "g-rtable__c--desk");

/** The `<col>` of a column: its width is its group's, and the player's column has its own. */
function renderCol(column, first) {
  return `<col class="${classNames(first && "g-rtable__col--who", column.group && `g-rtable__col--${column.group}`, column.desk && "g-rtable__col--desk")}">`;
}

function renderColumns(columns) {
  return `<colgroup>${columns.map((column, index) => renderCol(column, index === 0)).join("")}</colgroup>`;
}

/** The over-heads: one cell over the player's column, then a cell over each group. */
function renderGroups(groups) {
  if (!groups.length) return "";
  const cells = groups.map(({ label, span }) => `<td class="g-rtable__g" colspan="${span}">${escapeHtml(label)}</td>`).join("");
  return `<tr class="g-rtable__groups" aria-hidden="true"><td class="g-rtable__g g-rtable__g--who"></td>${cells}</tr>`;
}

/** A column's header: a button that sorts by it, or, for a column that cannot be sorted, its label (and the name a screen reader hears for it, on the cell). */
function renderHeadCell(column, index, sort, headLeadHtml) {
  const first = index === 0;
  const sortable = column.sortable !== false;
  const sorted = sortable && sort?.key === column.key;
  const arrow = sorted ? `<span class="g-sort__arrow" aria-hidden="true">${ARROWS[sort.dir]}</span>` : "";
  const name = column.name ? ` aria-label="${escapeHtml(column.name)}"` : "";
  const control = sortable
    ? `<button type="button" class="g-sort"${dataAttributes({ sortKey: column.key })}${name}>${escapeHtml(column.label)}${arrow}</button>`
    : escapeHtml(column.label);
  const direction = sorted ? ` aria-sort="${ARIA_SORT[sort.dir]}"` : "";
  const cellName = sortable ? "" : name;
  return `<th scope="col" class="${classNames("g-rtable__h", first && "g-rtable__h--who", placeOf(column))}"${direction}${cellName}>${first ? headLeadHtml : ""}${control}</th>`;
}

/** One value: its words for a screen reader (a tint is not a message), and what this match added to it. */
function renderCell(cell, column) {
  if (cell.tone && !TONES.includes(cell.tone)) throw new Error(`unknown cell tone: ${JSON.stringify(cell.tone)}`);
  const added = cell.delta > 0 ? `<sup class="g-rtable__delta"><span class="g-sr-only">, ${escapeHtml(t("ui.stepper.thisMatch"))} </span>+${escapeHtml(cell.delta)}</sup>` : "";
  const note = cell.note ? `<span class="g-sr-only"> ${escapeHtml(cell.note)}</span>` : "";
  return `<td class="${classNames("g-rtable__c", placeOf(column), cell.tone && `g-rtable__c--${cell.tone}`)}">${escapeHtml(cell.text ?? "")}${added}${note}</td>`;
}

/**
 * The player's cell: the button that opens his row, and, for a desk, his skills under it. The panel's id is made
 * of the row's key (a player's id, unique on the page), so two tables on one screen never share one. A button
 * that chooses the player for a panel elsewhere (`controls`) opens nothing: it names that panel, and says no
 * aria-expanded.
 */
function renderWho(row) {
  const skills = row.skillsHtml ? `<div class="g-rtable__skills g-rtable__skills--desk">${row.skillsHtml}</div>` : "";
  const sub = `<span class="${classNames("g-rtable__sub", row.alert && "g-rtable__sub--alert")}">${escapeHtml(row.sub ?? "")}</span>`;
  const relation = row.controls
    ? `aria-controls="${escapeHtml(row.controls)}"`
    : `aria-expanded="${row.expanded ? "true" : "false"}" aria-controls="rt-panel-${escapeHtml(row.key)}"`;
  return `<th scope="row" class="g-rtable__who"><button type="button" class="g-rtable__toggle" ${relation}${row.selected ? ' aria-current="true"' : ""}${dataAttributes({ rowKey: row.key })}>`
    + `${row.badgeHtml}<span class="g-rtable__text"><span class="g-rtable__name">${escapeHtml(row.name)}</span>${sub}</span></button>${skills}</th>`;
}

/**
 * One player's body: his row, his skills for a phone and, when he is open, his
 * panel. The two extra rows span the columns a phone shows and no more: a
 * `colspan` over columns that are hidden would make the browser add the
 * missing ones, and the player's column would share the width with them.
 */
function renderPlayer(row, columns, phoneSpan) {
  const cells = row.cells.map((cell, index) => renderCell(cell, columns[index + 1])).join("");
  const skillRow = row.skillsHtml ? `<tr class="g-rtable__skillrow"><td colspan="${phoneSpan}">${row.skillsHtml}</td></tr>` : "";
  const panelRow = row.expanded ? `<tr class="g-rtable__panelrow" id="rt-panel-${escapeHtml(row.key)}"><td colspan="${phoneSpan}">${row.panelHtml ?? ""}</td></tr>` : "";
  const className = classNames("g-rtable__player", row.expanded && "is-expanded", row.selected && "is-selected");
  return `<tbody class="${className}"${dataAttributes({ key: row.key })}><tr class="g-rtable__row">${renderWho(row)}${cells}</tr>${skillRow}${panelRow}</tbody>`;
}

/** The labels again, at the end of a long list: for the eye, so a screen reader hears them once. */
function renderFoot(columns) {
  const cells = columns.map((column, index) => `<td class="${classNames("g-rtable__h", index === 0 && "g-rtable__h--who", placeOf(column))}">${escapeHtml(column.label)}</td>`);
  return `<tfoot aria-hidden="true"><tr class="g-rtable__foot">${cells.join("")}</tr></tfoot>`;
}

/**
 * @param {object} props
 * @param {string} props.label names the table for a screen reader
 * @param {{key: string, label: string, name?: string, group?: "stats"|"career"|"spp", desk?: boolean, sortable?: boolean}[]} props.columns
 *   the first is the player's; every other has a `group`, which is its width; `name` is what a screen reader hears
 *   for a short label (aria-label of its button, or of its header when it cannot be sorted);
 *   `desk` hides the column up to 900px; `sortable` defaults to true
 * @param {{label: string, span: number}[]} [props.groups] the over-heads from 901px ("Characteristics", "Career", "SPP"), aria-hidden;
 *   the first group starts after the player's column
 * @param {RosterTableRow[]} props.rows
 * @param {{key: string, dir: "asc"|"desc"}|null} [props.sort]
 * @param {string} [props.headLeadHtml] markup before the player's header button (stage 07c's «+»)
 * @param {boolean} [props.foot] the foot that repeats the labels; true by default. A table drawn above another one
 *   leaves the foot to the last: the labels repeat once, at the end of the list
 * @returns {string} `<div class="g-rtable-frame"><table class="g-rtable" aria-label="…">…</table></div>`
 *
 * @typedef {object} RosterTableRow
 * @property {string} key unique on the page and with no blank in it (a player's id): it is the row's data-key, what wireRosterTable reports, and the id of its panel
 * @property {string} badgeHtml markup from renderPlayerBadge
 * @property {string} name
 * @property {string} sub the line under the name (the position, or why he misses the match)
 * @property {boolean} [alert] `sub` states an injury or a missed match: drawn in --danger
 * @property {{text: string, tone?: ""|"zero"|"up"|"down"|"strong", note?: string, delta?: number}[]} cells one per column after the first
 * @property {string} [skillsHtml] markup from renderSkillChips
 * @property {boolean} [expanded] the row's panel is open (up to 900px)
 * @property {boolean} [selected] the row's player is the one in the side panel (from 901px); his button says `aria-current`
 * @property {string} [controls] the id of the panel beside the table that the row's button chooses the player for (a desk's,
 *   R11): the button names it in `aria-controls` and says no `aria-expanded`; such a row opens no panel of its own
 * @property {string} [panelHtml] what the open row shows
 */
export function renderRosterTable({ label, columns, groups = [], rows, sort = null, headLeadHtml = "", foot = true }) {
  check({ label, columns, groups, rows, sort });
  const phoneSpan = columns.filter((column) => !column.desk).length;
  const heads = columns.map((column, index) => renderHeadCell(column, index, sort, headLeadHtml)).join("");
  const players = rows.map((row) => renderPlayer(row, columns, phoneSpan)).join("");
  return `<div class="g-rtable-frame"><table class="g-rtable" aria-label="${escapeHtml(label)}">${renderColumns(columns)}`
    + `<thead>${renderGroups(groups)}<tr>${heads}</tr></thead>${players}${foot ? renderFoot(columns) : ""}</table></div>`;
}

/** A header button reports `onSort(columnKey)`, a player's button `onToggle(rowKey)`. @returns {() => void} */
export function wireRosterTable(root, { onSort = () => {}, onToggle = () => {} } = {}) {
  const offs = [
    delegate(root, "click", ".g-sort[data-sort-key]", (event, button) => onSort(button.getAttribute("data-sort-key"))),
    delegate(root, "click", ".g-rtable__toggle[data-row-key]", (event, button) => onToggle(button.getAttribute("data-row-key"))),
  ];
  return () => offs.forEach((off) => off());
}

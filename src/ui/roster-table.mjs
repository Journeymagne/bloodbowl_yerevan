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
 * hidden. From 901px every column shows as DeskRoster.html draws it: the name and
 * the position on one line, the skills as small chips under them, a gap before
 * each group after the first (`lead`), the over-heads on their rules at the head
 * and the foot; the table scrolls inside its frame with the player's column held
 * in place, and the panel is the screen's, beside the table. A table drawn under
 * another (`quietHead`) keeps its column headers for a screen reader alone.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames, dataAttributes } from "./markup.mjs";

/** The column groups a width is set for: see roster-table.css. */
const GROUPS = ["stats", "career", "spp"];
/** The tones a value can wear; a value with none is plain. `quiet` is `strong`'s size in the muted ink: SPP that buy nothing yet. */
const TONES = ["zero", "up", "down", "strong", "quiet"];
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

/**
 * Where each column stands: its group, whether it is a desk's, whether it leads a group after the first (`lead`: a
 * desk sets the groups apart by a gap before it, DeskRoster.html's 12px), and whether it is the last (`last`: the
 * row's end, flush right). Worked out once per table from the columns' order.
 */
function placesOf(columns) {
  return columns.map((column, index) => ({
    group: column.group,
    desk: Boolean(column.desk),
    lead: index > 1 && column.group !== columns[index - 1].group,
    last: index > 0 && index === columns.length - 1,
  }));
}

/** The classes that say where a column stands, on its header, its cells and its foot. */
const placeOf = (place) => classNames(place.group && `g-rtable__c--${place.group}`, place.desk && "g-rtable__c--desk", place.lead && "g-rtable__c--lead", place.last && "g-rtable__c--last");

/** The `<col>` of a column: its width is its group's (and its place's), and the player's column has its own. */
function renderCol(place, first) {
  return `<col class="${classNames(first && "g-rtable__col--who", place.group && `g-rtable__col--${place.group}`, place.desk && "g-rtable__col--desk",
    place.lead && "g-rtable__col--lead", place.last && "g-rtable__col--last")}">`;
}

function renderColumns(places) {
  return `<colgroup>${places.map((place, index) => renderCol(place, index === 0)).join("")}</colgroup>`;
}

/**
 * The over-heads: one cell over the player's column, then a cell over each group, its label on a rule (under it at
 * the head, over it at the foot); a group after the first leads with the desk's gap, as its first column does.
 */
function renderGroups(groups) {
  if (!groups.length) return "";
  const cells = groups.map(({ label, span }, index) => `<td class="${classNames("g-rtable__g", index > 0 && "g-rtable__g--lead")}" colspan="${span}">`
    + `<span class="g-rtable__glabel">${escapeHtml(label)}</span></td>`).join("");
  return `<tr class="g-rtable__groups" aria-hidden="true"><td class="g-rtable__g g-rtable__g--who"></td>${cells}</tr>`;
}

/**
 * A column's header: a button that sorts by it, or, for a column that cannot be sorted, its label (and the name a
 * screen reader hears for it, on the cell). The player's carries the caller's markup after it, on its line
 * (`headTailHtml`, DeskRosterHire.html: «PLAYER▲» and the «+» 8px apart). A quiet header (`quiet`) is a label for a
 * screen reader alone: no button, nothing on the screen — the table above it shows the labels and sorts them all.
 */
function renderHeadCell(column, place, index, sort, headTailHtml, quiet) {
  const first = index === 0;
  if (quiet) {
    const name = column.name ? ` aria-label="${escapeHtml(column.name)}"` : "";
    return `<th scope="col" class="${classNames("g-rtable__h", first && "g-rtable__h--who", placeOf(place))}"${name}><span class="g-sr-only">${escapeHtml(column.label)}</span></th>`;
  }
  const sortable = column.sortable !== false;
  const sorted = sortable && sort?.key === column.key;
  const arrow = sorted ? `<span class="g-sort__arrow" aria-hidden="true">${ARROWS[sort.dir]}</span>` : "";
  const name = column.name ? ` aria-label="${escapeHtml(column.name)}"` : "";
  const control = sortable
    ? `<button type="button" class="g-sort"${dataAttributes({ sortKey: column.key })}${name}>${escapeHtml(column.label)}${arrow}</button>`
    : escapeHtml(column.label);
  const direction = sorted ? ` aria-sort="${ARIA_SORT[sort.dir]}"` : "";
  const cellName = sortable ? "" : name;
  return `<th scope="col" class="${classNames("g-rtable__h", first && "g-rtable__h--who", placeOf(place))}"${direction}${cellName}>${control}${first ? headTailHtml : ""}</th>`;
}

/** One value: its words for a screen reader (a tint is not a message), and what this match added to it. */
function renderCell(cell, place) {
  if (cell.tone && !TONES.includes(cell.tone)) throw new Error(`unknown cell tone: ${JSON.stringify(cell.tone)}`);
  const added = cell.delta > 0 ? `<sup class="g-rtable__delta"><span class="g-sr-only">, ${escapeHtml(t("ui.stepper.thisMatch"))} </span>+${escapeHtml(cell.delta)}</sup>` : "";
  const note = cell.note ? `<span class="g-sr-only"> ${escapeHtml(cell.note)}</span>` : "";
  return `<td class="${classNames("g-rtable__c", placeOf(place), cell.tone && `g-rtable__c--${cell.tone}`)}">${escapeHtml(cell.text ?? "")}${added}${note}</td>`;
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
function renderPlayer(row, places, phoneSpan) {
  const cells = row.cells.map((cell, index) => renderCell(cell, places[index + 1])).join("");
  const skillRow = row.skillsHtml ? `<tr class="g-rtable__skillrow"><td colspan="${phoneSpan}">${row.skillsHtml}</td></tr>` : "";
  const panelRow = row.expanded ? `<tr class="g-rtable__panelrow" id="rt-panel-${escapeHtml(row.key)}"><td colspan="${phoneSpan}">${row.panelHtml ?? ""}</td></tr>` : "";
  const className = classNames("g-rtable__player", row.expanded && "is-expanded", row.selected && "is-selected");
  return `<tbody class="${className}"${dataAttributes({ key: row.key, reorderIndex: row.reorderIndex })}><tr class="g-rtable__row">${renderWho(row)}${cells}</tr>${skillRow}${panelRow}</tbody>`;
}

/**
 * The labels again, at the end of a long list, and the over-heads under them (DeskRoster.html): for the eye, so a
 * screen reader hears them once.
 */
function renderFoot(columns, places, groups) {
  const cells = columns.map((column, index) => `<td class="${classNames("g-rtable__h", index === 0 && "g-rtable__h--who", placeOf(places[index]))}">${escapeHtml(column.label)}</td>`);
  return `<tfoot aria-hidden="true"><tr class="g-rtable__foot">${cells.join("")}</tr>${renderGroups(groups)}</tfoot>`;
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
 * @param {string} [props.headTailHtml] markup after the player's header button (stage 07c's «+»)
 * @param {boolean} [props.foot] the foot that repeats the labels; true by default. A table drawn above another one
 *   leaves the foot to the last: the labels repeat once, at the end of the list
 * @param {boolean} [props.quietHead] the header row is for a screen reader alone, with no over-heads and no buttons: a
 *   table drawn under another one that shows the labels and sorts (a desk's sections, DeskRosterInjured.html)
 * @returns {string} `<div class="g-rtable-frame"><table class="g-rtable" aria-label="…">…</table></div>`
 *
 * @typedef {object} RosterTableRow
 * @property {string} key unique on the page and with no blank in it (a player's id): it is the row's data-key, what wireRosterTable reports, and the id of its panel
 * @property {number} [reorderIndex] editable roster slot, enables hold-and-drag within this table
 * @property {string} badgeHtml markup from renderPlayerBadge
 * @property {string} name
 * @property {string} sub the line under the name (the position, or why he misses the match)
 * @property {boolean} [alert] `sub` states an injury or a missed match: drawn in --danger
 * @property {{text: string, tone?: ""|"zero"|"up"|"down"|"strong"|"quiet", note?: string, delta?: number}[]} cells one per column after the first
 * @property {string} [skillsHtml] markup from renderSkillChips
 * @property {boolean} [expanded] the row's panel is open (up to 900px)
 * @property {boolean} [selected] the row's player is the one in the side panel (from 901px); his button says `aria-current`
 * @property {string} [controls] the id of the panel beside the table that the row's button chooses the player for (a desk's,
 *   R11): the button names it in `aria-controls` and says no `aria-expanded`; such a row opens no panel of its own
 * @property {string} [panelHtml] what the open row shows
 */
export function renderRosterTable({ label, columns, groups = [], rows, sort = null, headTailHtml = "", foot = true, quietHead = false }) {
  check({ label, columns, groups, rows, sort });
  const phoneSpan = columns.filter((column) => !column.desk).length;
  const places = placesOf(columns);
  const heads = columns.map((column, index) => renderHeadCell(column, places[index], index, sort, quietHead ? "" : headTailHtml, quietHead)).join("");
  const players = rows.map((row) => renderPlayer(row, places, phoneSpan)).join("");
  return `<div class="g-rtable-frame"><table class="g-rtable" aria-label="${escapeHtml(label)}">${renderColumns(places)}`
    + `<thead>${quietHead ? "" : renderGroups(groups)}<tr${quietHead ? ' class="g-rtable__quiet"' : ""}>${heads}</tr></thead>${players}${foot ? renderFoot(columns, places, groups) : ""}</table></div>`;
}

/** What a click inside a player's row leaves to itself: his own button, which reports him once, and a skill chip, which is the screen's. */
const OWN_CONTROL = "a, button, input, label, select, textarea";

/**
 * A header button reports `onSort(columnKey)`; a player's button `onToggle(rowKey)`, and so does a click anywhere else
 * in his row or his skills' row (the owner, 2026-10-23: the whole of him opens him, not his name alone) — the button
 * stays what a keyboard and a screen reader use. His open panel reports nothing. @returns {() => void}
 */
export function wireRosterTable(root, { onSort = () => {}, onToggle = () => {} } = {}) {
  const offs = [
    delegate(root, "click", ".g-sort[data-sort-key]", (event, button) => onSort(button.getAttribute("data-sort-key"))),
    delegate(root, "click", ".g-rtable__toggle[data-row-key]", (event, button) => onToggle(button.getAttribute("data-row-key"))),
    delegate(root, "click", ".g-rtable__row, .g-rtable__skillrow", (event, row) => {
      const key = row.closest(".g-rtable__player")?.getAttribute("data-key");
      if (key && !event.target.closest(OWN_CONTROL)) onToggle(key);
    }),
  ];
  return () => offs.forEach((off) => off());
}

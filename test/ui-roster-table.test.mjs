import assert from "node:assert/strict";
import test from "node:test";

import { assertContrast, assertReadable, blocks, read, valuesOf } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { renderPlayerBadge } from "../src/ui/number-badge.mjs";
import { renderRosterTable, wireRosterTable } from "../src/ui/roster-table.mjs";
import { renderSkillChips } from "../src/ui/skill-chip.mjs";

const SHEET = "src/ui/roster-table.css";
const SHEETS = ["roster-table.css", "number-badge.css", "skill-chip.css"];

const COLUMNS = [
  { key: "player", label: "Player" },
  { key: "ma", label: "MA", group: "stats" },
  { key: "st", label: "ST", group: "stats" },
  { key: "ag", label: "AG", group: "stats" },
  { key: "pa", label: "PA", group: "stats" },
  { key: "ar", label: "AR", group: "stats" },
  { key: "touchdowns", label: "TD", name: "touchdowns", group: "career", desk: true },
  { key: "casualties", label: "CAS", name: "casualties", group: "career", desk: true },
  { key: "earned", label: "Total", group: "spp", desk: true },
  { key: "available", label: "Avail.", group: "spp", desk: true },
];
const GROUPS = [{ label: "Characteristics", span: 5 }, { label: "Career", span: 2 }, { label: "SPP", span: 2 }];

const cells = (overrides = {}) => [
  { text: "6" }, { text: "3" }, { text: "3+" }, { text: "4+" }, { text: "9+" },
  { text: "1" }, { text: "0", tone: "zero" }, { text: "3" }, { text: "3", tone: "strong" },
].map((cell, index) => overrides[index] ?? cell);

const row = (key, extra = {}) => ({
  key,
  badgeHtml: renderPlayerBadge({ number: 7, kind: "blitzer" }),
  name: "Grak",
  sub: "Blitzer",
  cells: cells(),
  skillsHtml: renderSkillChips({ skills: [{ name: "Block" }] }),
  ...extra,
});

const table = (props = {}) => renderRosterTable({ label: "Active roster", columns: COLUMNS, groups: GROUPS, rows: [row("p1"), row("p2", { name: "Brug" })], ...props });

/** The part of the sheet that is for 901px and up, and the part for 900px and down. */
function parts(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const wide = bare.match(/@media\s*\(min-width: 901px\)\s*\{([\s\S]*)\n\}/)?.[1] ?? "";
  const narrow = [...bare.replace(wide, "").matchAll(/@media\s*\(max-width: 900px\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]).join("\n");
  return { wide, narrow };
}

const spaced = (text) => text.replace(/\s+/g, " ").trim();

/** The element children of a node: the fake DOM has childNodes only. */
const elements = (node) => node.childNodes.filter((child) => child.nodeType === 1);

test("a roster table is a table: a head of sortable columns, a body per player, and a foot that repeats the labels for the eye", () => {
  const fragment = mount(table());
  const grid = fragment.querySelector("table.g-rtable");
  assert.equal(grid.getAttribute("aria-label"), "Active roster");
  assert.ok(grid.parentNode.classList.contains("g-rtable-frame"));
  const heads = grid.querySelectorAll('thead th[scope="col"]');
  assert.deepEqual(heads.map((head) => head.querySelector("button.g-sort").getAttribute("data-sort-key")), COLUMNS.map((column) => column.key));
  assert.deepEqual(heads.map((head) => head.querySelector("button").textContent), COLUMNS.map((column) => column.label));
  assert.deepEqual(grid.querySelectorAll("tbody.g-rtable__player").map((body) => body.getAttribute("data-key")), ["p1", "p2"]);
  for (const body of grid.querySelectorAll("tbody")) {
    assert.ok(body.querySelector('tr.g-rtable__row th[scope="row"] .g-rtable__toggle'));
    assert.equal(body.querySelectorAll("tr.g-rtable__row td").length, COLUMNS.length - 1);
  }
  const foot = grid.querySelector('tfoot[aria-hidden="true"]');
  assert.equal(foot.querySelector("button"), null);
  assert.deepEqual(foot.querySelectorAll("td").map((cell) => cell.textContent), COLUMNS.map((column) => column.label));
  assertCspSafe(fragment);
  assertStyled(fragment, ...SHEETS);
});

test("the over-heads, the head and the foot are in the order a browser keeps them", () => {
  const grid = mount(table()).querySelector("table.g-rtable");
  assert.deepEqual(elements(grid).map((child) => child.tagName), ["COLGROUP", "THEAD", "TBODY", "TBODY", "TFOOT"]);
  assert.deepEqual(elements(grid.querySelector("thead")).map((child) => child.getAttribute("class")), ["g-rtable__groups", null]);
  assert.equal(grid.querySelector("thead tr").getAttribute("aria-hidden"), "true");
  const over = grid.querySelectorAll(".g-rtable__groups td");
  assert.deepEqual(over.map((cell) => cell.textContent), ["", "Characteristics", "Career", "SPP"]);
  assert.deepEqual(over.map((cell) => Number(cell.getAttribute("colspan") ?? 1)), [1, 5, 2, 2]);
  const withoutGroups = mount(table({ groups: [] })).querySelector("table.g-rtable");
  assert.equal(withoutGroups.querySelector(".g-rtable__groups"), null);
});

test("the sorted column says so and points its arrow; the others say nothing", () => {
  const up = mount(table({ sort: { key: "ag", dir: "asc" } }));
  const heads = up.querySelectorAll('thead th[scope="col"]');
  const sorted = heads.filter((head) => head.hasAttribute("aria-sort"));
  assert.equal(sorted.length, 1);
  assert.equal(sorted[0].querySelector("button").getAttribute("data-sort-key"), "ag");
  assert.equal(sorted[0].getAttribute("aria-sort"), "ascending");
  assert.equal(sorted[0].querySelector(".g-sort__arrow").textContent, "▲");
  assert.equal(sorted[0].querySelector(".g-sort__arrow").getAttribute("aria-hidden"), "true");
  assert.equal(up.querySelectorAll(".g-sort__arrow").length, 1);
  const down = mount(table({ sort: { key: "ag", dir: "desc" } }));
  assert.equal(down.querySelector("th[aria-sort]").getAttribute("aria-sort"), "descending");
  assert.equal(down.querySelector(".g-sort__arrow").textContent, "▼");
  const none = mount(table());
  assert.equal(none.querySelector("[aria-sort]"), null);
  assert.equal(none.querySelector(".g-sort__arrow"), null);
});

test("a short label has a name for a screen reader, and a column that is not sortable is a label with no button", () => {
  const columns = COLUMNS.map((column) => (column.key === "earned" ? { ...column, sortable: false } : column));
  const fragment = mount(table({ columns, sort: { key: "earned", dir: "asc" } }));
  const button = (key) => fragment.querySelector(`[data-sort-key="${key}"]`);
  assert.equal(button("touchdowns").getAttribute("aria-label"), "touchdowns");
  assert.equal(button("ma").hasAttribute("aria-label"), false);
  assert.equal(button("earned"), null);
  const plain = fragment.querySelectorAll('thead th[scope="col"]').find((head) => head.textContent === "Total");
  assert.equal(plain.querySelector("button"), null);
  assert.equal(plain.hasAttribute("aria-sort"), false, "no button, nothing to sort by, nothing to say");
  assert.equal(plain.hasAttribute("aria-label"), false, "no name given, none said");
  assert.equal(fragment.querySelector(".g-sort__arrow"), null);
});

test("a column that cannot be sorted keeps the name a screen reader hears for its short label, on its header", () => {
  const columns = COLUMNS.map((column) => (column.key === "touchdowns" ? { ...column, sortable: false } : column));
  const fragment = mount(table({ columns }));
  const head = fragment.querySelectorAll('thead th[scope="col"]').find((cell) => cell.textContent === "TD");
  assert.equal(head.getAttribute("aria-label"), "touchdowns");
  assert.equal(head.querySelector("button"), null);
  assert.equal(fragment.querySelectorAll("[aria-label]").filter((node) => node.getAttribute("aria-label") === "touchdowns").length, 1, "once: the foot is hidden and says nothing");
  assert.equal(fragment.querySelector("tfoot [aria-label]"), null);
  // A sortable one says it on its button and not on its header as well.
  const sortable = mount(table()).querySelectorAll('thead th[scope="col"]').find((cell) => cell.textContent === "TD");
  assert.equal(sortable.hasAttribute("aria-label"), false);
  assert.equal(sortable.querySelector("button").getAttribute("aria-label"), "touchdowns");
});

test("the player's header carries what the caller puts before it, and the foot does not", () => {
  const fragment = mount(table({ headLeadHtml: '<button type="button" class="g-btn" data-add="1">+</button>' }));
  const [who, ...others] = fragment.querySelectorAll('thead th[scope="col"]');
  const [lead, sort] = elements(who);
  assert.equal(elements(who).length, 2);
  assert.equal(lead.getAttribute("data-add"), "1");
  assert.equal(sort.getAttribute("data-sort-key"), "player");
  assert.ok(others.every((head) => head.querySelector("[data-add]") === null));
  assert.equal(fragment.querySelectorAll("[data-add]").length, 1);
});

test("a header button reports its column, a player's button his row", () => {
  const fragment = mount(table());
  const sorted = [];
  const toggled = [];
  const off = wireRosterTable(fragment, { onSort: (key) => sorted.push(key), onToggle: (key) => toggled.push(key) });
  fireEvent(fragment.querySelector('[data-sort-key="ag"]'), "click");
  fireEvent(fragment.querySelector('[data-sort-key="touchdowns"]'), "click");
  fireEvent(fragment.querySelector('[data-row-key="p2"] .g-num__n'), "click");
  fireEvent(fragment.querySelector('[data-row-key="p1"]'), "click");
  assert.deepEqual(sorted, ["ag", "touchdowns"]);
  assert.deepEqual(toggled, ["p2", "p1"]);
  // A skill chip, a cell and the foot are the screen's or nobody's: the table reports none of them.
  fireEvent(fragment.querySelector("[data-skill]"), "click");
  fireEvent(fragment.querySelector(".g-rtable__c"), "click");
  fireEvent(fragment.querySelector("tfoot td"), "click");
  assert.deepEqual([sorted.length, toggled.length], [2, 2]);
  off();
  fireEvent(fragment.querySelector('[data-sort-key="ag"]'), "click");
  fireEvent(fragment.querySelector('[data-row-key="p1"]'), "click");
  assert.deepEqual([sorted.length, toggled.length], [2, 2]);
});

test("a table wired with no callbacks hears clicks and does nothing", () => {
  const fragment = mount(table());
  const off = wireRosterTable(fragment);
  fireEvent(fragment.querySelector("[data-sort-key]"), "click");
  fireEvent(fragment.querySelector("[data-row-key]"), "click");
  off();
});

test("an open row carries its panel in a row of its own, and its button says it is open and which row it controls", () => {
  const panelHtml = '<div class="g-panel-test">Panel of Brug</div>';
  const fragment = mount(table({ rows: [row("p1"), row("p2", { expanded: true, panelHtml })] }));
  const [shut, open] = fragment.querySelectorAll("tbody.g-rtable__player");
  const button = open.querySelector(".g-rtable__toggle");
  assert.equal(button.getAttribute("aria-expanded"), "true");
  const panel = open.querySelector("tr.g-rtable__panelrow");
  assert.equal(panel.getAttribute("id"), "rt-panel-p2", "the id is made of the row's key");
  assert.equal(button.getAttribute("aria-controls"), panel.getAttribute("id"));
  assert.equal(panel.querySelector(".g-panel-test").textContent, "Panel of Brug");
  assert.ok(open.classList.contains("is-expanded"));
  assert.equal(shut.querySelector(".g-rtable__toggle").getAttribute("aria-expanded"), "false");
  assert.equal(shut.querySelector(".g-rtable__panelrow"), null);
  assert.equal(shut.classList.contains("is-expanded"), false);
  assert.equal(fragment.querySelectorAll("[id]").length, 1);
  assert.equal(fragment.querySelector("main"), null);
});

test("two tables on one page never share the id of a panel, and a key that would make a list of ids is refused", () => {
  const open = (key) => row(key, { expanded: true, panelHtml: `<span>panel of ${key}</span>` });
  const fragment = mount(table({ label: "Active", rows: [open("p1"), row("p2")] }) + table({ label: "Reserves", rows: [open("p9")] }));
  const ids = fragment.querySelectorAll("[id]").map((node) => node.getAttribute("id"));
  assert.deepEqual(ids, ["rt-panel-p1", "rt-panel-p9"]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [key, id] of [["p1", "rt-panel-p1"], ["p9", "rt-panel-p9"]]) {
    const button = fragment.querySelector(`[data-row-key="${key}"]`);
    assert.equal(button.getAttribute("aria-controls"), id);
    assert.match(fragment.querySelector(`#${id}`).textContent, new RegExp(`panel of ${key}`));
  }
  for (const key of ["p 1", "p\t1", "p1\n", " p1"]) assert.throws(() => table({ rows: [row(key)] }), /blank/, JSON.stringify(key));
});

test("the row of the player in the side panel is marked, and one that is not is not", () => {
  const fragment = mount(table({ rows: [row("p1", { selected: true }), row("p2")] }));
  const [first, second] = fragment.querySelectorAll("tbody.g-rtable__player");
  assert.ok(first.classList.contains("is-selected"));
  assert.equal(second.classList.contains("is-selected"), false);
  assert.equal(second.classList.contains("is-expanded"), false);
  // The mark is for the eye alone unless the button says it too.
  assert.equal(first.querySelector(".g-rtable__toggle").getAttribute("aria-current"), "true");
  assert.equal(second.querySelector(".g-rtable__toggle").hasAttribute("aria-current"), false);
  assert.equal(mount(table()).querySelector("[aria-current]"), null);
});

test("a row whose button chooses the player for a panel beside the table names that panel and says nothing of opening (R11)", () => {
  const fragment = mount(table({ rows: [row("p1", { selected: true, controls: "roster-aside" }), row("p2", { controls: "roster-aside" })] }));
  const [chosen, other] = fragment.querySelectorAll(".g-rtable__toggle");
  for (const button of [chosen, other]) {
    assert.equal(button.getAttribute("aria-controls"), "roster-aside");
    assert.equal(button.hasAttribute("aria-expanded"), false, "it opens nothing: no aria-expanded");
  }
  assert.equal(chosen.getAttribute("aria-current"), "true");
  assert.equal(other.hasAttribute("aria-current"), false);
  assert.equal(fragment.querySelector(".g-rtable__panelrow"), null);
  // Without it the button is the phone's: it opens the row's own panel.
  assert.equal(mount(table()).querySelector(".g-rtable__toggle").getAttribute("aria-expanded"), "false");
  for (const controls of ["", "roster aside", "1aside", null]) {
    assert.throws(() => table({ rows: [row("p1", { controls })] }), /plain id/, JSON.stringify(controls));
  }
  assert.throws(() => table({ rows: [row("p1", { controls: "roster-aside", expanded: true, panelHtml: "<span>x</span>" })] }), /does one/);
});

test("a row's extra rows span the columns a phone shows, so a hidden column never leaves a phantom one for the player's to share", () => {
  const fragment = mount(table({ rows: [row("p1", { expanded: true, panelHtml: "<span>x</span>" })] }));
  const phone = COLUMNS.filter((column) => !column.desk).length;
  assert.equal(phone, 6);
  assert.equal(fragment.querySelector(".g-rtable__skillrow td").getAttribute("colspan"), String(phone));
  assert.equal(fragment.querySelector(".g-rtable__panelrow td").getAttribute("colspan"), String(phone));
  // The extra rows are not there at all for a row with nothing to put in them.
  const bare = mount(table({ rows: [row("p1", { skillsHtml: "" })] }));
  assert.equal(bare.querySelector(".g-rtable__skillrow"), null);
  assert.equal(bare.querySelector(".g-rtable__skills--desk"), null);
});

test("a player's skills are drawn twice — under the name for a desk, in a row of their own for a phone — and each width hides the other", () => {
  const fragment = mount(table());
  const body = fragment.querySelector("tbody.g-rtable__player");
  assert.equal(body.querySelector("th .g-rtable__skills--desk [data-skill]").textContent, "Block");
  assert.equal(body.querySelector("tr.g-rtable__skillrow td [data-skill]").textContent, "Block");
  assert.ok(valuesOf(SHEET, ".g-rtable__skills--desk", "display").includes("none"));
  assert.ok(valuesOf(SHEET, ".g-rtable__skillrow", "display").includes("none"));
  const { wide, narrow } = parts(read(SHEET));
  assert.match(narrow, /\.g-rtable__skills--desk[^{]*\{[^}]*display:\s*none/, "a phone has the row of chips, not the desk's");
  assert.match(wide, /\.g-rtable__skillrow[^{]*\{[^}]*display:\s*none/, "a desk has the chips under the name, not the row");
  assert.ok(!/\.g-rtable__skillrow\s*\{[^}]*display:\s*none/.test(narrow), "and the row is not hidden on a phone");
  assert.ok(!/\.g-rtable__skills--desk\s*\{[^}]*display:\s*none/.test(wide), "nor the desk's chips on a desk");
});

test("a changed value says so in words, not only in colour; a zero is quiet; this match's addition is a superscript with words", () => {
  const fragment = mount(table({
    rows: [row("p1", {
      cells: cells({
        2: { text: "2+", tone: "up", note: "improved" },
        3: { text: "5+", tone: "down", note: "lowered" },
        5: { text: "7", delta: 1 },
        6: { text: "0", tone: "zero" },
      }),
    })],
  }));
  const body = fragment.querySelector("tbody.g-rtable__player");
  const improved = body.querySelector(".g-rtable__c--up");
  assert.equal(improved.querySelector(".g-sr-only").textContent, " improved");
  assert.equal(spaced(improved.textContent), "2+ improved");
  assert.equal(body.querySelector(".g-rtable__c--down .g-sr-only").textContent, " lowered");
  assert.equal(body.querySelectorAll(".g-rtable__c--zero").length, 1);
  assert.equal(body.querySelector(".g-rtable__c--zero").textContent, "0");
  assert.equal(body.querySelector(".g-rtable__c--zero .g-sr-only"), null);
  assert.equal(body.querySelectorAll(".g-rtable__c--strong").length, 1);
  const added = body.querySelector("sup.g-rtable__delta");
  assert.equal(spaced(added.closest("td").textContent), "7, this match +1");
  assert.equal(added.querySelectorAll("sup").length, 0);
  assert.equal(body.querySelectorAll("sup").length, 1, "only the cell with an addition has one");
  // A zero addition is no addition.
  const none = mount(table({ rows: [row("p1", { cells: cells({ 0: { text: "6", delta: 0 } }) })] }));
  assert.equal(none.querySelector("sup"), null);
});

test("the cells of a group carry its class, and a column with none carries no group's", () => {
  const body = mount(table()).querySelector("tbody.g-rtable__player");
  const classes = body.querySelectorAll("tr.g-rtable__row td").map((cell) => cell.getAttribute("class"));
  assert.deepEqual(classes.slice(0, 5), Array(5).fill("g-rtable__c g-rtable__c--stats"));
  assert.equal(classes[5], "g-rtable__c g-rtable__c--career g-rtable__c--desk");
  assert.equal(classes[6], "g-rtable__c g-rtable__c--career g-rtable__c--desk g-rtable__c--zero");
  assert.equal(classes[8], "g-rtable__c g-rtable__c--spp g-rtable__c--desk g-rtable__c--strong");
});

test("a desk column is hidden on a phone, and the over-heads are the desk's", () => {
  const fragment = mount(table());
  const deskColumns = COLUMNS.filter((column) => column.desk).map((column) => column.label);
  const heads = fragment.querySelectorAll('thead th[scope="col"].g-rtable__c--desk');
  assert.deepEqual(heads.map((head) => head.textContent), deskColumns);
  const body = fragment.querySelector("tbody.g-rtable__player");
  assert.equal(body.querySelectorAll("tr.g-rtable__row td.g-rtable__c--desk").length, deskColumns.length);
  assert.deepEqual(fragment.querySelectorAll("tfoot td.g-rtable__c--desk").map((cell) => cell.textContent), deskColumns);
  assert.equal(fragment.querySelectorAll('thead th[scope="col"]').length - heads.length, COLUMNS.length - deskColumns.length);
  const { narrow, wide } = parts(read(SHEET));
  assert.match(narrow, /\.g-rtable__c--desk[^{]*\{[^}]*display:\s*none/);
  assert.match(narrow, /\.g-rtable__groups[^{]*\{[^}]*display:\s*none/);
  assert.ok(!/display:\s*none/.test(wide.replace(/\.g-rtable__(skillrow|panelrow)[^{]*\{[^}]*\}/g, "")), "from 901px nothing but the phone's extra rows is hidden");
});

test("the columns' widths are on the <col>s, because a fixed table takes them from its first row and from 901px that is the row of over-heads", () => {
  const grid = mount(table()).querySelector("table.g-rtable");
  const cols = grid.querySelectorAll("colgroup col");
  assert.deepEqual(cols.map((col) => col.getAttribute("class")), [
    "g-rtable__col--who",
    ...Array(5).fill("g-rtable__col--stats"),
    ...Array(2).fill("g-rtable__col--career g-rtable__col--desk"),
    ...Array(2).fill("g-rtable__col--spp g-rtable__col--desk"),
  ]);
  // The same number of columns in every row of the grid: nothing here makes the browser add one.
  assert.equal(cols.length, COLUMNS.length);
  assert.equal(grid.querySelectorAll("thead th").length, COLUMNS.length);
  assert.equal(grid.querySelectorAll("tfoot td").length, COLUMNS.length);
  assert.deepEqual(grid.querySelectorAll("tbody tr.g-rtable__row").map((tr) => elements(tr).length), [10, 10]);
  assert.equal(valuesOf(SHEET, ".g-rtable", "table-layout").at(-1), "fixed");
  const { narrow, wide } = parts(read(SHEET));
  const declared = (css, selector) => [...css.matchAll(new RegExp(`${selector.replace(/\./g, "\\.")}\\s*\\{[^}]*?(?:^|[;\\s])width:\\s*([^;]+);`, "g"))].map((match) => match[1].trim());
  assert.deepEqual(declared(narrow, ".g-rtable__col--stats"), ["36px"], "a phone: the characteristics' 36px, the player's column takes the rest");
  assert.deepEqual(declared(narrow, ".g-rtable__col--who"), [], "a phone gives the player's column no width of its own");
  assert.deepEqual(
    [".g-rtable__col--who", ".g-rtable__col--stats", ".g-rtable__col--career", ".g-rtable__col--spp"].map((selector) => declared(wide, selector)),
    [["180px"], ["32px"], ["36px"], ["48px"]],
    "a desk: the player 180px, then 32, 36 and 48",
  );
  assert.ok(valuesOf(SHEET, ".g-rtable__col--stats", "width").length && valuesOf(SHEET, ".g-rtable__col--who", "width").includes("180px"));
  assert.match(narrow, /\.g-rtable__col--desk[^{]*\{[^}]*display:\s*none/, "a column that is hidden is gone from the grid, its <col> too");
});

test("from 901px the table scrolls inside its frame and the player's column stays", () => {
  assert.ok(valuesOf(SHEET, ".g-rtable-frame", "overflow-x").includes("auto"));
  assert.ok(valuesOf(SHEET, ".g-rtable__who", "position").includes("sticky"));
  assert.ok(valuesOf(SHEET, ".g-rtable__who", "left").includes("0"));
  assert.ok(valuesOf(SHEET, ".g-rtable__who", "background").includes("var(--surface)"));
  const { wide, narrow } = parts(read(SHEET));
  assert.match(wide, /\.g-rtable-frame\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(wide, /\.g-rtable__who[^{]*\{[^}]*position:\s*sticky/);
  assert.ok(!/sticky/.test(narrow), "a phone's table is the page's width and does not scroll");
  assert.match(wide, /\.g-rtable__player\.is-selected \.g-rtable__row\s*\{[^}]*outline:\s*2px solid var\(--accent-text\)/);
  // The held cell is drawn over the row's outline, so it carries the same line itself.
  assert.match(wide, /\.g-rtable__player\.is-selected \.g-rtable__who\s*\{[^}]*box-shadow:[^;]*var\(--accent-text\)/);
});

test("the focus ring of a head's button is drawn inside it, where the frame cannot clip it", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-sort:focus-visible", "outline-offset"), ["-3px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__toggle:focus-visible", "outline-offset"), ["-3px"]);
  assert.equal(valuesOf(SHEET, ".g-sort:focus-visible", "outline").length, 0, "the ring itself is base.css's");
});

test("a header's button fills its whole column: no padding on the header, so 36px on a phone and 32px on a desk, 44px high", () => {
  assert.deepEqual(valuesOf(SHEET, "th.g-rtable__h", "padding-inline"), ["0"]);
  assert.deepEqual(valuesOf(SHEET, ".g-sort", "width"), ["100%"]);
  assert.deepEqual(valuesOf(SHEET, ".g-sort", "padding"), ["0"]);
  assert.deepEqual(valuesOf(SHEET, ".g-sort", "box-sizing"), ["border-box"]);
  // Nothing after the rule takes the padding back: the player's header (a desk's 12px on the left) is the one exception, with its own, stronger rule.
  const { narrow, wide } = parts(read(SHEET));
  assert.ok(!/th\.g-rtable__h\s*\{[^}]*padding/.test(narrow + wide));
  assert.match(wide, /th\.g-rtable__h--who\s*\{[^}]*padding-left:\s*var\(--space-12\)/);
  assert.deepEqual(valuesOf(SHEET, ".g-sort", "min-height"), ["var(--size-touch)"]);
});

test("a strong value keeps its digits tabular after the font shorthand that would reset them", () => {
  const [strong] = blocks(read(SHEET)).filter((block) => block.selectors.includes(".g-rtable__c--strong"));
  assert.ok(strong.body.indexOf("font:") >= 0 && strong.body.indexOf("font:") < strong.body.indexOf("font-variant-numeric: tabular-nums"));
});

test("what a finger presses is 44px", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-sort", "min-height"), ["var(--size-touch)"]);
  // The player's button is as wide as its word, not its column: «ИГРОК» alone is 41px.
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__h--who .g-sort", "min-width"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__toggle", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__row", "height"), ["var(--size-row)"]);
});

test("the sheet sets what the 2.x globals for table, th, td and button would otherwise set", () => {
  for (const [selector, property] of [
    [".g-rtable", "min-width"], [".g-rtable", "font"], [".g-rtable", "text-transform"], [".g-rtable", "letter-spacing"], [".g-rtable", "background"],
    [".g-rtable__c", "border"], [".g-rtable__c", "background"], [".g-rtable__c", "padding"], [".g-rtable__c", "vertical-align"],
    [".g-rtable__h", "border"], [".g-rtable__h", "background"], [".g-rtable__h", "font"], [".g-rtable__h", "text-transform"], [".g-rtable__h", "letter-spacing"],
    [".g-rtable__who", "border"], [".g-rtable__who", "background"], [".g-rtable__who", "font"],
    [".g-sort", "font"], [".g-sort", "text-transform"], [".g-sort", "letter-spacing"], [".g-sort", "border"], [".g-sort", "background"],
    [".g-rtable__toggle", "font"], [".g-rtable__toggle", "border"], [".g-rtable__toggle", "background"], [".g-rtable__toggle", "text-transform"], [".g-rtable__toggle", "letter-spacing"],
  ]) {
    assert.ok(valuesOf(SHEET, selector, property).length, `${selector} sets its ${property}`);
  }
  assert.deepEqual(valuesOf(SHEET, ".g-rtable", "min-width"), ["0"]);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable", "width"), ["100%"]);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable", "border-collapse"), ["collapse"]);
});

test("only the stage's two breakpoints", () => {
  const queries = [...read(SHEET).matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  assert.ok(queries.length >= 2);
  for (const query of queries) assert.match(query, /^\((max-width: 900px|min-width: 901px)\)$/);
  assert.ok(!read(SHEET).includes("--focus-ring"));
});

test("the colours of the table are readable in every palette", () => {
  const grounds = ["--page", "--surface", "--surface-2"];
  assertReadable(SHEET, ".g-sort", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable__sub", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable__sub--alert", "color", grounds, 4.5);
  assertReadable(SHEET, "[aria-sort] .g-sort", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable__c--up", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable__c--down", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable__c--strong", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable__delta", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-rtable", "color", grounds, 4.5);
  // A zero is quiet (muted), not faint: --faint is 3.1-3.35:1 on the light palettes, too little for 15px text, and 2.9:1 on an open row's tint.
  assertReadable(SHEET, ".g-rtable__c--zero", "color", grounds, 4.5);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__c--zero", "color"), ["var(--muted)"]);
  assert.ok(!read(SHEET).replace(/\/\*[\s\S]*?\*\//g, "").includes("--faint"), "nothing in the table is faint");
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__player.is-expanded", "background"), ["var(--surface-2)"]);
  // A plain chip is --surface-2 itself: on the open row's tint it takes --surface, or it would have no edge.
  assert.deepEqual(valuesOf("src/ui/skill-chip.css", ".g-skill", "background"), ["var(--surface-2)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-rtable__player.is-expanded .g-skill:not(.g-skill--gained)", "background"), ["var(--surface)"]);
  // The selected row is a desk's, on the frame's --surface.
  assertContrast("--accent-text", ["--surface"], 3, { what: "the selected row's outline" });
});

test("names are text", () => {
  const fragment = mount(renderRosterTable({
    label: HOSTILE,
    columns: COLUMNS.map((column, index) => (index === 1 ? { ...column, label: HOSTILE, name: HOSTILE } : column)),
    groups: [{ label: HOSTILE, span: 5 }, { label: "Career", span: 2 }, { label: "SPP", span: 2 }],
    rows: [row("<b>", { name: HOSTILE, sub: HOSTILE, cells: cells({ 0: { text: HOSTILE, note: HOSTILE } }), expanded: true, panelHtml: "<span>panel</span>" })],
  }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("table").getAttribute("aria-label"), HOSTILE);
  assert.equal(fragment.querySelector(".g-rtable__name").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-rtable__sub").textContent, HOSTILE);
  assert.equal(fragment.querySelector('[data-sort-key="ma"]').getAttribute("aria-label"), HOSTILE);
  assert.equal(fragment.querySelector('[data-sort-key="ma"]').textContent, HOSTILE);
  assert.equal(fragment.querySelectorAll(".g-rtable__groups td")[1].textContent, HOSTILE);
  assert.equal(fragment.querySelectorAll("tfoot td")[1].textContent, HOSTILE);
  assert.equal(fragment.querySelector("tr.g-rtable__row td").textContent, `${HOSTILE} ${HOSTILE}`);
  assert.equal(fragment.querySelector("tbody").getAttribute("data-key"), "<b>");
  assert.equal(fragment.querySelector(".g-rtable__toggle").getAttribute("data-row-key"), "<b>");
  assert.equal(fragment.querySelector("b"), null);
  assertCspSafe(fragment);
});

test("a table that would draw wrong refuses", () => {
  assert.throws(() => table({ label: "" }), /label/);
  assert.throws(() => renderRosterTable({ columns: COLUMNS, rows: [] }), /label/);
  assert.throws(() => table({ rows: [row("p1", { cells: cells().slice(1) })] }), /p1.*8.*9/);
  assert.throws(() => table({ rows: [row("p1", { cells: [...cells(), { text: "1" }] })] }), /p1.*10.*9/);
  assert.throws(() => table({ rows: [row("p1"), row("p1")] }), /p1/);
  assert.throws(() => table({ rows: [row("")] }), /key/);
  assert.throws(() => table({ columns: [] }), /column/);
  assert.throws(() => table({ columns: COLUMNS.map((column, index) => (index === 1 ? { ...column, group: "extra" } : column)) }), /extra/);
  assert.throws(() => table({ rows: [row("p1", { cells: cells({ 0: { text: "6", tone: "loud" } }) })] }), /loud/);
  assert.throws(() => table({ columns: COLUMNS.map((column, index) => (index === 1 ? { key: column.key, label: column.label } : column)) }), /column "ma" has no group/);
  assert.throws(() => table({ columns: COLUMNS.map((column, index) => (index === 1 ? { ...column, group: "" } : column)) }), /group/);
  assert.throws(() => table({ sort: { key: "ag", dir: "sideways" } }), /sideways/);
  // A word every object has is no direction either.
  assert.throws(() => table({ sort: { key: "ag", dir: "toString" } }), /toString/);
  assert.throws(() => table({ sort: { key: "ag", dir: "constructor" } }), /constructor/);
  assert.throws(() => table({ groups: [{ label: "Characteristics", span: 5 }] }), /group/);
  assert.throws(() => table({ groups: [{ label: "x", span: 0 }, { label: "y", span: 9 }] }), /group/);
  assert.throws(() => table({ rows: [row("p1", { badgeHtml: undefined })] }), /badge/);
  // No players is a table with a head: the screen says what it means.
  const empty = mount(table({ rows: [] }));
  assert.equal(empty.querySelectorAll("tbody").length, 0);
  assert.ok(empty.querySelector("thead"));
});

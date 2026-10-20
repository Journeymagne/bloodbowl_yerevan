import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import {
  ADVANCED, FALLEN, PLAYERS, STYLES, api, aside, coach, died, headingText, namesIn, playerPage, releaseCurrentScreen, renderTeamRoster, save, settle, tables,
  text, view, withPlayers,
} from "./helpers/roster-page.mjs";

// Stage 07d, owner review, Task 25: a desk's search in the roster's page band (DeskRoster.html). The page, the coach and
// his team are helpers/roster-page.mjs's: Ann, Bors (Blitzer: Block) and Cade play; Dell and Finn (Linemen), Edda and
// Grom miss the next match; Pike (Blitzer) and Joe (Lineman) are fallen.

const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const { lineMatches, queryWords } = await import("../src/screens/team/roster/search.mjs");
const { refQuery, setRefQuery, takeSearchFocus } = await import("../src/screens/ref/memory.mjs");

const FRAME = "src/screens/team/roster/frame.css";
const field = () => view.querySelector("#roster-query");
const found = () => view.querySelector(".g-roster__foundcount");
const refLink = () => view.querySelector(".g-roster__refsearch");
const names = () => tables().map(namesIn);
const FULL = [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]];
/** The coach types `value` into the field: it has the focus, its value is what is typed, then the browser's `input`. */
function type(value) {
  const input = field();
  input.focus();
  input.value = value;
  fireEvent(input, "input");
}

test("a desk's roster head has the search as DeskRoster draws it", async () => {
  coach();
  await renderTeamRoster("t1");
  const input = view.querySelector(".g-pagehead__meta #roster-query");
  assert.ok(input, "at the right of the page band");
  assert.equal(input.getAttribute("type"), "search");
  assert.equal(input.getAttribute("placeholder"), "Players, skills, rules…");
  assert.equal(view.querySelector('label[for="roster-query"]').textContent, "Search", "named for a screen reader");
  assert.equal(input.value, "");
  assert.ok(input.closest(".g-roster__search"));
  // DeskRoster.html: a 320px field, never wider than the band, 44px high, its words 15px; the band wraps.
  assert.deepEqual(valuesOf(FRAME, ".g-roster__search", "width"), ["320px"]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster__search", "max-width"), ["100%"]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster__search .g-search__input", "height"), ["44px"]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster__search .g-search__input", "font-size"), ["15px"]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster > .g-pagehead", "flex-wrap"), ["wrap"]);
  // The shared field keeps its own 48px and 16px elsewhere (the reference's).
  assert.deepEqual(valuesOf("src/ui/search-field.css", ".g-search__input", "height"), ["48px"]);
});

test("typing narrows the three tables by name, number, position and skill; every word must match; «ё» as «е»", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.deepEqual(names(), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  type("cade");
  assert.deepEqual(names(), [["Cade"]]);
  assert.equal(document.activeElement, field(), "the focus stays in the field");
  assert.equal(field().value, "cade");
  // The number whole: «Blitzer» and the skills with digits in them («Loner (4+)») are no number.
  type("3");
  assert.deepEqual(names(), [["Cade"]]);
  type("lineman");
  assert.deepEqual(names(), [["Ann"], ["Dell", "Finn"], ["Joe"]]);
  // The headings count those shown.
  assert.match(headingText("roster-heading"), /^Active roster 1$/);
  assert.match(headingText("roster-skips-heading"), /^Missing the match 2$/);
  assert.match(headingText("roster-fallen-heading"), /^Fallen 1$/);
  type("ann lineman");
  assert.deepEqual(names(), [["Ann"]]);
  type("  LINEMAN   ann ");
  assert.deepEqual(names(), [["Ann"]]);
  type("block");
  assert.deepEqual(names(), [["Bors"], ["Pike"]], "Bors's Block, and the fallen Blitzer's");
  type("pike");
  assert.deepEqual(names(), [["Pike"]]);
  assert.equal(view.querySelector(".g-roster__section .g-roster__empty").textContent, "Nobody in the active roster matches «pike»");
  assert.equal(headingText("roster-skips-heading"), null, "«Missing the match» is not drawn");
  type("");
  assert.deepEqual(names(), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  // The words as the reference reads them: lower case, «ё» as «е»; a number of digits whole; any skill's name.
  assert.deepEqual(queryWords("  Ёрш   БЛОК "), ["ерш", "блок"]);
  assert.ok(lineMatches({ name: "Ёрш" }, queryWords("ерш")));
  assert.ok(lineMatches({ name: "Ёрш" }, queryWords("ЁРШ")));
  assert.ok(lineMatches({ number: "07", name: "Hal" }, queryWords("7")));
  assert.ok(!lineMatches({ number: "17", name: "Hal" }, queryWords("7")));
  assert.ok(!lineMatches({ number: "", name: "Hal" }, queryWords("0")), "a number that is none matches no digits");
  assert.ok(lineMatches({ name: "Grom", skills: [{ name: "Mighty Blow (+1)" }] }, queryWords("mighty")));
  assert.ok(!lineMatches({ name: "Grom", skills: [{ name: "Loner (4+)" }] }, queryWords("4")));
  assert.ok(lineMatches({ name: "Ann", position: "Human Lineman" }, []), "no words find everyone");
  // With no query nothing of the line is read: every draw with none, a counter's tap included, costs nothing.
  assert.ok(lineMatches({ get name() { throw new Error("read with no query"); } }, []));
});

test("the count is said in a live region; a query that finds nobody says so under «Active roster» and draws no other section", async () => {
  coach();
  await renderTeamRoster("t1");
  // There before its first words, so that a screen reader hears them when they come.
  assert.equal(view.querySelector(".g-roster__main").firstChild, found().parentNode, "first in the tables' column");
  assert.equal(found().getAttribute("role"), "status");
  assert.equal(found().textContent, "");
  assert.ok(!refLink(), "no way to the reference with no query");
  type("cade");
  assert.equal(found().textContent, "Players found: 1");
  type("block");
  assert.equal(found().textContent, "Players found: 2");
  type("pike");
  assert.equal(found().textContent, "Players found: 1");
  type("nobody");
  assert.equal(found().textContent, "Players found: 0");
  const sections = view.querySelectorAll("section.g-roster__section");
  assert.equal(sections.length, 1, "«Active roster» alone");
  assert.equal(sections[0].querySelector(".g-roster__empty").textContent, "Nobody in the active roster matches «nobody»");
  assert.ok(!sections[0].querySelector(".g-market__hirebar"), "no «Hire players» under a search's words");
  assert.match(headingText("roster-heading"), /^Active roster 0$/);
  assert.ok(!aside(), "nobody found, no panel");
  assert.equal(tables().length, 0);
  assert.ok(!view.querySelector(".g-roster__caption"), "no table, no line on how to read one");
  type("   ");
  assert.equal(found().textContent, "", "blanks are no query");
  assert.ok(!refLink());
  assert.equal(tables().length, 3);
});

test("Esc clears the query; the focus stays in the field", async () => {
  coach();
  await renderTeamRoster("t1");
  type("cade");
  const input = field();
  const event = fireEvent(input, "keydown", { key: "Escape" });
  assert.ok(event.defaultPrevented);
  assert.equal(input.value, "", "the field is empty, not only the memory (K17)");
  assert.equal(field(), input);
  assert.equal(rosterMemory("t1").query, "");
  assert.deepEqual(names(), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  assert.equal(document.activeElement, input);
  assert.equal(found().textContent, "");
  // The next letter is a new query, not the old one and a letter.
  type(`${input.value}b`);
  assert.equal(rosterMemory("t1").query, "b");
  // Another key types.
  assert.ok(!fireEvent(input, "keydown", { key: "a" }).defaultPrevented);
  assert.equal(rosterMemory("t1").query, "b");
});

test("«Search the reference: «block»» leads to #/ref with the query and the caret asked for", async () => {
  coach();
  setRefQuery("");
  takeSearchFocus();
  await renderTeamRoster("t1");
  type("block");
  const link = refLink();
  assert.equal(link.tagName, "A");
  assert.equal(link.getAttribute("href"), "#/ref");
  assert.equal(link.textContent, "Search the reference: «block»");
  assert.equal(link.parentNode, found().parentNode, "beside the count");
  // A new tab or window is another page, with a reference of its own: nothing is handed over, and no caret is asked for here.
  for (const modified of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    fireEvent(link, "click", modified);
    assert.equal(refQuery(), "", JSON.stringify(modified));
    assert.equal(takeSearchFocus(), false, JSON.stringify(modified));
  }
  fireEvent(link, "click", { button: 0 });
  assert.equal(refQuery(), "block");
  assert.equal(takeSearchFocus(), true);
  assert.equal(rosterMemory("t1").query, "block", "the roster keeps its own");
  setRefQuery("");
});

test("the panel shows the first player found when the chosen one is filtered out, and the chosen one again once the query is gone", async () => {
  coach({ open: "p1#0" });
  await renderTeamRoster("t1");
  assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
  type("cade");
  assert.equal(aside().getAttribute("data-panel-player"), "p3#0");
  assert.equal(view.querySelector('[data-row-key="p3#0"]').getAttribute("aria-current"), "true");
  assert.equal(rosterMemory("t1").selected, "p1#0", "the choice stands");
  fireEvent(field(), "keydown", { key: "Escape" });
  assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
  // A query that keeps the chosen one keeps him in the panel.
  type("lineman");
  assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
});

test("an address names a player a kept query would hide: the query gives way, in the field too, and the table and the panel show him", async () => {
  coach();
  await renderTeamRoster("t1");
  type("cade");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  // The read held, so that the field drawn with the query kept has the focus when the answer comes: a patch leaves its value.
  const gate = api.hold("GET /api/teams/t1");
  const drawing = playerPage("p1");
  await settle();
  assert.equal(field().value, "cade");
  field().focus();
  gate.release();
  await drawing;
  assert.equal(rosterMemory("t1").query, "");
  assert.equal(field().value, "");
  assert.equal(rosterMemory("t1").selected, "p1#0");
  assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "Ann, whom the address names");
  assert.equal(view.querySelector('[data-row-key="p1#0"]').getAttribute("aria-current"), "true");
  assert.deepEqual(names(), FULL);
  assert.equal(found().textContent, "");
  // Once: the coach's next query stands, even one that hides him.
  type("cade");
  assert.deepEqual(names(), [["Cade"]]);
  assert.equal(rosterMemory("t1").query, "cade");
});

test("an address whose player a kept query finds keeps the query", async () => {
  coach();
  await renderTeamRoster("t1");
  type("lineman");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  await playerPage("p1");
  assert.equal(rosterMemory("t1").query, "lineman");
  assert.equal(field().value, "lineman");
  assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
  assert.deepEqual(names(), [["Ann"], ["Dell", "Finn"], ["Joe"]]);
  assert.equal(found().textContent, "Players found: 4");
});

test("an advancement's skill and a favoured one are found; «ё» typed finds «е»; typing asks the server nothing and saves nothing", async () => {
  const players = [PLAYERS[0], { ...PLAYERS[1], favouredSkills: [{ name: "Dodge", access: "favoured" }] }, ADVANCED, ...PLAYERS.slice(3),
    { id: "p8", rowIndex: 0, number: "10", name: "Фёдор" }];
  coach({ teamAnswer: withPlayers(players) });
  await renderTeamRoster("t1");
  await settle();
  const calls = api.calls.length;
  const saved = JSON.stringify(save.saveState("t1"));
  type("frenzy");
  assert.deepEqual(names(), [["Cade"]], "Frenzy, which his advancement gave");
  type("dodge");
  assert.deepEqual(names(), [["Bors", "Cade"]], "Bors's favoured Dodge, and the Catcher's own");
  type("федор");
  assert.deepEqual(names(), [["Фёдор"]]);
  type("ФЁДОР");
  assert.deepEqual(names(), [["Фёдор"]]);
  fireEvent(field(), "keydown", { key: "Escape" });
  await settle();
  assert.equal(api.calls.length, calls, "no request");
  assert.equal(JSON.stringify(save.saveState("t1")), saved, "no step of the save queue");
});

test("the sort orders what the query finds, and the whole roster once it is gone", async () => {
  coach();
  await renderTeamRoster("t1");
  type("lineman");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  // MA: Finn 6, Dell 5 (lowered).
  assert.deepEqual(names(), [["Ann"], ["Finn", "Dell"], ["Joe"]]);
  fireEvent(field(), "keydown", { key: "Escape" });
  assert.deepEqual(names(), [["Cade", "Bors", "Ann"], ["Edda", "Finn", "Dell", "Grom"], ["Pike", "Joe"]]);
});

test("a fallen record with no name is found by the name the table shows", async () => {
  // A record the race has no row for (a league admin's shape) and that names nobody: the table says «Fallen».
  coach({ fallen: [...FALLEN, died("f3", { id: "d3", number: "11" })] });
  await renderTeamRoster("t1");
  assert.deepEqual(names().at(-1), ["Pike", "Joe", "Fallen"]);
  type("fallen");
  assert.deepEqual(names(), [["Fallen"]]);
  type("11");
  assert.deepEqual(names(), [["Fallen"]]);
});

test("a phone has no field, and a query kept from a desk filters nothing there", async () => {
  coach();
  await renderTeamRoster("t1");
  type("cade");
  releaseCurrentScreen();
  await withWindow({ phone: true }, async () => {
    view.innerHTML = "";
    await renderTeamRoster("t1");
    assert.ok(!view.querySelector("#roster-query"));
    assert.ok(!view.querySelector(".g-roster__found"));
    assert.ok(!view.querySelector(".g-roster__search"));
    assert.deepEqual(names(), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  });
  releaseCurrentScreen();
});

test("the query is the page's memory: a visit elsewhere and back finds it; the address and the storage hold nothing", async () => {
  coach();
  await renderTeamRoster("t1");
  type("block");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  await renderTeamRoster("t1");
  assert.equal(field().value, "block");
  assert.deepEqual(names(), [["Bors"], ["Pike"]]);
  assert.equal(found().textContent, "Players found: 2");
  assert.equal(globalThis.location.hash, "#/t/t1/roster");
  assert.ok(![...api.items.entries()].some(([key, value]) => `${key} ${value}`.includes("block")), "nothing in the browser's storage");
  // A visit starts clean for another test: coach() forgets it (K19).
  coach();
  assert.equal(rosterMemory("t1").query, "");
});

test("every key in both dictionaries; styled; D2", async () => {
  assertDictionaryCovers("src/screens/team/roster/search.mjs", "src/screens/team/roster/view.mjs");
  const en = JSON.parse(text("src/i18n/en.json"));
  const ru = JSON.parse(text("src/i18n/ru.json"));
  assert.deepEqual(["label", "placeholder", "found", "none", "ref"].map((key) => [en[`teamRoster.search.${key}`], ru[`teamRoster.search.${key}`]]), [
    ["Search", "Поиск"],
    ["Players, skills, rules…", "Игроки, навыки, правила…"],
    ["Players found: {count}", "Найдено игроков: {count}"],
    ["Nobody in the active roster matches «{query}»", "В активном составе по запросу «{query}» никого нет"],
    ["Search the reference: «{query}»", "Искать в справочнике: «{query}»"],
  ]);
  coach();
  await renderTeamRoster("t1");
  // The roster's own sheets style the field (K18): frame.css names .g-search, so every roster list of sheets holds it.
  assertStyled(view, ...STYLES);
  type("block");
  assertStyled(view, ...STYLES);
  type("nobody");
  assertStyled(view, ...STYLES);
  type(HOSTILE);
  assertCspSafe(view);
  assert.equal(refLink().textContent, `Search the reference: «${HOSTILE}»`);
  assert.equal(view.querySelector(".g-roster__empty").textContent, `Nobody in the active roster matches «${HOSTILE}»`);
  // D2: a desk's link no smaller than 24px; its words and the count readable on the page in every palette.
  assert.deepEqual(valuesOf(FRAME, ".g-roster__refsearch", "min-height"), ["32px"]);
  // The house rule for new CSS: the link sets its box; the words that name the query wrap however long it is.
  assert.deepEqual(["margin", "padding", "border", "background"].map((property) => valuesOf(FRAME, ".g-roster__refsearch", property)), [["0"], ["0"], ["0"], ["none"]]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster__sections .g-roster__empty", "overflow-wrap"), ["anywhere"]);
  assertReadable(FRAME, ".g-roster__foundcount", "color", ["--page"], 4.5);
  assertReadable(FRAME, ".g-roster__refsearch", "color", ["--page"], 4.5);
  for (const selector of [".g-roster__found", ".g-roster__foundcount", ".g-roster__refsearch"]) assert.deepEqual(valuesOf(FRAME, selector, "text-overflow"), []);
});

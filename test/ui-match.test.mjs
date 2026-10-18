import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { renderButton } from "../src/ui/button.mjs";
import { renderFormStrip } from "../src/ui/form-strip.mjs";
import { renderKpiGrid, renderKpiTile } from "../src/ui/kpi-tile.mjs";
import { renderBoardActions, renderMatchBoard } from "../src/ui/match-board.mjs";
import { renderMatchCard } from "../src/ui/match-card.mjs";
import { RESULT_KINDS, renderResultPill, resultLabels } from "../src/ui/result-pill.mjs";
import { STATUS_TONES, renderStatusChip } from "../src/ui/status-chip.mjs";

/** Runs `body` with the interface in Russian and puts English back, whatever happens. */
function inRussian(body) {
  initLocale("ru");
  try {
    return body();
  } finally {
    initLocale("en");
  }
}

test("kpi tiles: label over value, positive and compact forms, in a grid", () => {
  const fragment = mount(renderKpiGrid([{ label: "Team value", value: "1 120k" }, { label: "Inducements", value: "+60k", positive: true }]) + renderKpiTile({ label: "TV", value: HOSTILE, compact: true }));
  assert.equal(fragment.querySelectorAll(".g-kpis .g-kpi").length, 2);
  assert.equal(fragment.querySelector(".g-kpi__v").textContent, "1 120k");
  assert.ok(fragment.querySelector(".g-kpi--positive"));
  assert.equal(fragment.querySelector(".g-kpi--compact .g-kpi__v").textContent, HOSTILE);
  assertCspSafe(fragment);
  assertStyled(fragment, "kpi-tile.css");
});

test("a kpi tile is the label, then the value, and only the forms it was asked for", () => {
  const plain = mount(renderKpiTile({ label: "Treasury", value: "35k" })).querySelector(".g-kpi");
  assert.equal(plain.tagName, "DIV");
  assert.equal(plain.getAttribute("class"), "g-kpi");
  assert.deepEqual(plain.childNodes.map((node) => node.getAttribute("class")), ["g-kpi__k", "g-kpi__v"]);
  assert.equal(plain.querySelector(".g-kpi__k").textContent, "Treasury");

  const both = mount(renderKpiTile({ label: "TV", value: "1 060k", positive: true, compact: true })).querySelector(".g-kpi");
  assert.equal(both.getAttribute("class"), "g-kpi g-kpi--positive g-kpi--compact");
});

test("a kpi tile escapes its label, and a zero is a figure", () => {
  const fragment = mount(renderKpiTile({ label: HOSTILE, value: 0 }));
  assert.equal(fragment.querySelector(".g-kpi__k").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-kpi__v").textContent, "0");
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

test("a kpi tile is named and has a figure: the caller writes a dash when there is none", () => {
  assert.throws(() => renderKpiTile({ value: "1" }), /label/);
  assert.throws(() => renderKpiTile({ label: "", value: "1" }), /label/);
  for (const value of ["", null, undefined]) assert.throws(() => renderKpiTile({ label: "TV", value }), /value/, String(value));
  assert.doesNotThrow(() => renderKpiTile({ label: "TV", value: "–" }));
});

test("a kpi grid keeps its tiles in order, two to a row", () => {
  const tiles = [{ label: "A", value: "1" }, { label: "B", value: "2", positive: true }, { label: "C", value: "3" }, { label: "D", value: "4" }];
  const grid = mount(renderKpiGrid(tiles)).querySelector(".g-kpis");
  assert.deepEqual(grid.querySelectorAll(".g-kpi__k").map((node) => node.textContent), ["A", "B", "C", "D"]);
  assert.deepEqual(grid.childNodes.map((node) => node.classList.contains("g-kpi--positive")), [false, true, false, false]);
});

test("an empty grid draws nothing, an odd one gives its last tile the row, and a row grid is one line from 901px (05–13)", () => {
  const tile = { label: "TV", value: "1 120k" };
  assert.equal(renderKpiGrid([]), "");
  assert.equal(mount(renderKpiGrid([tile, tile, tile])).querySelectorAll(".g-kpi").length, 3);
  assert.equal(mount(renderKpiGrid([tile])).querySelectorAll(".g-kpi").length, 1);
  assert.ok(mount(renderKpiGrid([tile, tile], { row: true })).querySelector(".g-kpis.g-kpis--row"));
  assert.equal(mount(renderKpiGrid([tile, tile])).querySelector(".g-kpis--row"), null);
  assert.throws(() => renderKpiGrid(), /tiles/);
  assert.throws(() => renderKpiGrid("tiles"), /tiles/);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis > .g-kpi:last-child:nth-child(odd)", "grid-column"), ["1 / -1"]);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis--row", "grid-auto-flow"), ["column"]);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis--row > .g-kpi:last-child:nth-child(odd)", "grid-column"), ["auto"]);
  // valuesOf reads every rule whatever its at-rule, so "from 901px" is read from the source text: the row rules are inside that query, and nowhere else.
  const css = readFileSync(new URL("../src/ui/kpi-tile.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = css.match(/@media \(min-width: 901px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(desk, /\.g-kpis--row \{[^}]*grid-auto-flow: column/);
  assert.match(desk, /\.g-kpis--row > \.g-kpi:last-child:nth-child\(odd\) \{[^}]*grid-column: auto/);
  assert.ok(!css.replace(desk, "").includes(".g-kpis--row"), "the row rules are not outside the 901px query");
});

test("a result pill is the letter, with the word for screen readers", () => {
  const pill = mount(renderResultPill({ result: "w" })).querySelector(".g-result");
  assert.equal(pill.querySelector('[aria-hidden="true"]').textContent, "W");
  assert.equal(pill.querySelector(".g-sr-only").textContent, "Win");
  for (const result of RESULT_KINDS) assertStyled(mount(renderResultPill({ result, compact: true })), "result-pill.css");
  assert.throws(() => renderResultPill({ result: "x" }), /result/);
});

test("a result pill has the kind's class, and the compact form only when asked", () => {
  assert.deepEqual(RESULT_KINDS, ["w", "d", "l", "t"]);
  for (const result of RESULT_KINDS) {
    const fragment = mount(renderResultPill({ result }));
    assert.equal(fragment.querySelector(".g-result").getAttribute("class"), `g-result g-result--${result}`);
    assertCspSafe(fragment);
    assert.equal(mount(renderResultPill({ result, compact: true })).querySelector(".g-result").getAttribute("class"), `g-result g-result--${result} g-result--compact`);
  }
});

test("every result says its letter and its word, in both languages", () => {
  const english = RESULT_KINDS.map((result) => resultLabels(result));
  assert.deepEqual(english, [{ letter: "W", name: "Win" }, { letter: "D", name: "Draw" }, { letter: "L", name: "Loss" }, { letter: "F", name: "Friendly" }]);
  const russian = inRussian(() => RESULT_KINDS.map((result) => resultLabels(result)));
  assert.deepEqual(russian, [{ letter: "В", name: "Победа" }, { letter: "Н", name: "Ничья" }, { letter: "П", name: "Поражение" }, { letter: "Т", name: "Товарищеский" }]);
});

test("a result the pill does not know is a bug, whatever it is called", () => {
  for (const result of ["x", "", undefined, null, "W", "toString", "__proto__"]) {
    assert.throws(() => resultLabels(result), /result/, String(result));
    assert.throws(() => renderResultPill({ result }), /result/, String(result));
  }
});

test("a result pill is read as its word, not its letter", () => {
  const pill = mount(renderResultPill({ result: "l" })).querySelector(".g-result");
  assert.deepEqual(pill.childNodes.map((node) => node.getAttribute("aria-hidden") ?? node.getAttribute("class")), ["true", "g-sr-only"]);
  assert.equal(pill.querySelector('[aria-hidden="true"]').textContent, "L");
  assert.equal(pill.querySelector(".g-sr-only").textContent, "Loss");
});

test("the form strip keeps the last ten, oldest first", () => {
  const results = ["l", "l", "w", "w", "d", "t", "w", "w", "l", "w", "w", "d"];
  const fragment = mount(renderFormStrip({ results }));
  const items = fragment.querySelectorAll(".g-form__item");
  assert.deepEqual(items.map((item) => item.getAttribute("data-result")), results.slice(-10));
  assert.equal(fragment.querySelector(".g-form").getAttribute("aria-label"), "Recent results");
  assert.equal(items[0].getAttribute("title"), "Win");
  assertCspSafe(fragment);
  assertStyled(fragment, "form-strip.css");
});

test("in Russian the letters are В, Н, П and Т", () => {
  initLocale("ru");
  try {
    const items = mount(renderFormStrip({ results: ["w", "d", "l", "t"] })).querySelectorAll(".g-form__item");
    assert.deepEqual(items.map((item) => item.textContent), ["В", "Н", "П", "Т"]);
  } finally {
    initLocale("en");
  }
});

test("a form strip is a list of results, each with its class, letter and word", () => {
  const fragment = mount(renderFormStrip({ results: ["w", "d", "l", "t"] }));
  const strip = fragment.querySelector(".g-form");
  assert.equal(strip.getAttribute("role"), "list");
  const items = strip.querySelectorAll(".g-form__item");
  assert.deepEqual(items.map((item) => item.getAttribute("role")), ["listitem", "listitem", "listitem", "listitem"]);
  assert.deepEqual(items.map((item) => item.getAttribute("class")), ["g-form__item g-form__item--w", "g-form__item g-form__item--d", "g-form__item g-form__item--l", "g-form__item g-form__item--t"]);
  assert.deepEqual(items.map((item) => item.textContent), ["W", "D", "L", "F"]);
  assert.deepEqual(items.map((item) => item.getAttribute("title")), ["Win", "Draw", "Loss", "Friendly"]);
  assert.equal(strip.getAttribute("aria-label"), "Recent results");
  assert.equal(inRussian(() => mount(renderFormStrip({ results: ["w"] })).querySelector(".g-form").getAttribute("aria-label")), "Последние результаты");
  assert.equal(inRussian(() => mount(renderFormStrip({ results: ["t"] })).querySelector(".g-form__item").getAttribute("title")), "Товарищеский");
});

test("a form strip shorter than ten is drawn as it is, and ten is the limit", () => {
  const few = mount(renderFormStrip({ results: ["w", "l"] })).querySelectorAll(".g-form__item");
  assert.deepEqual(few.map((item) => item.getAttribute("data-result")), ["w", "l"]);
  const ten = Array.from({ length: 10 }, (_, index) => RESULT_KINDS[index % 4]);
  assert.equal(mount(renderFormStrip({ results: ten })).querySelectorAll(".g-form__item").length, 10);
  assert.equal(mount(renderFormStrip({ results: [...ten, "w"] })).querySelectorAll(".g-form__item").length, 10);
  assert.equal(mount(renderFormStrip({ results: [] })).querySelectorAll(".g-form__item").length, 0);
});

test("a form strip refuses a result it does not know, even one that would be cut off", () => {
  assert.throws(() => renderFormStrip({ results: ["w", "x"] }), /result/);
  assert.throws(() => renderFormStrip({ results: ["x", ...Array(10).fill("w")] }), /result/);
  assert.throws(() => renderFormStrip({ results: ["<b>"] }), /result/);
  assert.throws(() => renderFormStrip({}), /results/);
  assert.throws(() => renderFormStrip({ results: "wdl" }), /results/);
});

test("status chips carry the caller's words in three tones, on light or dark", () => {
  for (const tone of STATUS_TONES) {
    const fragment = mount(renderStatusChip({ label: HOSTILE, tone, onDark: tone === "live" }));
    assert.equal(fragment.querySelector(".g-status").textContent, HOSTILE);
    assertStyled(fragment, "status-chip.css");
  }
  assert.ok(mount(renderStatusChip({ label: "Live", tone: "live", onDark: true })).querySelector(".g-status--live.g-status--on-dark"));
  assert.throws(() => renderStatusChip({ label: "x", tone: "error" }), /tone/);
});

test("a status chip is neutral unless told otherwise, and neutral is the base look", () => {
  assert.deepEqual(STATUS_TONES, ["neutral", "live", "wait"]);
  const classOf = (props) => mount(renderStatusChip({ label: "Not started", ...props })).querySelector(".g-status").getAttribute("class");
  assert.equal(classOf({}), "g-status");
  assert.equal(classOf({ tone: "neutral" }), "g-status");
  assert.equal(classOf({ tone: "live" }), "g-status g-status--live");
  assert.equal(classOf({ tone: "wait" }), "g-status g-status--wait");
  assert.equal(classOf({ onDark: true }), "g-status g-status--on-dark");
  assert.equal(classOf({ tone: "wait", onDark: true }), "g-status g-status--wait g-status--on-dark");
  assertCspSafe(mount(renderStatusChip({ label: "Waiting for confirmation", tone: "wait" })));
});

test("a status chip says its state in words, so it has a label and a known tone", () => {
  assert.throws(() => renderStatusChip({}), /label/);
  assert.throws(() => renderStatusChip({ label: "" }), /label/);
  for (const tone of ["", "toString", "LIVE", null]) assert.throws(() => renderStatusChip({ label: "x", tone }), /tone/, String(tone));
});

test("a match card: meta, teams, vs or score, status, tiles and actions", () => {
  const props = {
    title: "Next match",
    statusHtml: renderStatusChip({ label: "Not started" }),
    meta: { left: "Round 7 · home", right: "[DATE]" },
    home: { name: "Ashgrove Wardens", sub: "Human · 3rd" },
    away: { name: HOSTILE, sub: "Wood Elf · 5th" },
    tilesHtml: renderKpiTile({ label: "TV", value: "1 120k", compact: true }) + renderKpiTile({ label: "TV", value: "1 060k", compact: true }),
    actionsHtml: renderButton({ label: "Prepare for the match", kind: "primary" }),
  };
  const fragment = mount(renderMatchCard(props));
  assert.equal(fragment.querySelector(".g-match__mid").textContent, "vs");
  assert.deepEqual(fragment.querySelectorAll(".g-match__name").map((node) => node.textContent), ["Ashgrove Wardens", HOSTILE]);
  assert.deepEqual(fragment.querySelectorAll(".g-match__meta span").map((node) => node.textContent), ["Round 7 · home", "[DATE]"]);
  assert.equal(fragment.querySelectorAll(".g-match__tiles .g-kpi").length, 2);
  assert.ok(fragment.querySelector(".g-match__actions button.g-btn--primary"));
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
  assertStyled(fragment, "match-card.css", "status-chip.css", "kpi-tile.css", "button.css");
  const live = mount(renderMatchCard({ ...props, score: "2–1", live: true, tilesHtml: "", actionsHtml: "" }));
  assert.ok(live.querySelector(".g-match").classList.contains("g-match--live"));
  assert.equal(live.querySelector(".g-match__mid--score").textContent, "2–1");
  assert.equal(live.querySelector(".g-match__tiles"), null);
  assert.equal(live.querySelector(".g-match__actions"), null);
});

test("a match card is an article: a heading with the status, then what it was given, in order", () => {
  const card = mount(renderMatchCard({
    title: "Current match",
    statusHtml: renderStatusChip({ label: "Live", tone: "live" }),
    meta: { left: "Round 7", right: "[DATE]" },
    home: { name: "A", sub: "Human" },
    away: { name: "B", sub: "Orc" },
    tilesHtml: '<div class="tiles-mark"></div>',
    bodyHtml: '<div class="body-mark"></div>',
    actionsHtml: '<div class="actions-mark"></div>',
  })).querySelector(".g-match");
  assert.equal(card.tagName, "ARTICLE");
  assert.deepEqual(card.childNodes.map((node) => node.getAttribute("class")), ["g-match__head", "g-match__meta", "g-match__teams", "g-match__tiles", "body-mark", "g-match__actions"]);
  const head = card.querySelector("header.g-match__head");
  assert.equal(head.querySelector("h3.g-match__title").textContent, "Current match");
  assert.ok(head.querySelector(".g-status--live"), "the status sits in the heading row");
  assert.ok(card.querySelector(".g-match__tiles .tiles-mark"));
  assert.ok(card.querySelector(".g-match__actions .actions-mark"));
  assert.equal(card.querySelector("p"), null, "no <p>: a browser would close it at the first block inside");
});

test("a match card draws only the parts it was given, and a plain one is a heading and two teams", () => {
  const bare = mount(renderMatchCard({ title: "Next match", home: { name: "A" }, away: { name: "B" } })).querySelector(".g-match");
  assert.equal(bare.getAttribute("class"), "g-match");
  assert.deepEqual(bare.childNodes.map((node) => node.getAttribute("class")), ["g-match__head", "g-match__teams"]);
  assert.deepEqual(bare.querySelector(".g-match__head").childNodes.map((node) => node.tagName), ["H3"]);
  assert.equal(bare.querySelector(".g-match__sub"), null, "no line under a name that has none");
  assert.equal(bare.querySelector(".g-match__mid").textContent, "vs");
  assert.equal(bare.querySelector(".g-match__mid--score"), null);
});

test("the two sides: the home one, then the away one that is aligned the other way", () => {
  const sides = mount(renderMatchCard({ title: "T", home: { name: "Home", sub: "Human" }, away: { name: "Away", sub: "Orc" } })).querySelectorAll(".g-match__side");
  assert.deepEqual(sides.map((side) => side.getAttribute("class")), ["g-match__side", "g-match__side g-match__side--away"]);
  assert.deepEqual(sides.map((side) => side.querySelector(".g-match__name").textContent), ["Home", "Away"]);
  assert.deepEqual(sides.map((side) => side.querySelector(".g-match__sub").textContent), ["Human", "Orc"]);
  const teams = sides[0].parentNode;
  assert.deepEqual(teams.childNodes.map((node) => node.getAttribute("class")), ["g-match__side", "g-match__mid", "g-match__side g-match__side--away"]);
});

test("the middle is the score when there is one, and the score is text", () => {
  const props = { title: "T", home: { name: "A" }, away: { name: "B" } };
  assert.equal(mount(renderMatchCard({ ...props, score: "0–0" })).querySelector(".g-match__mid").getAttribute("class"), "g-match__mid g-match__mid--score");
  assert.equal(mount(renderMatchCard({ ...props, score: "0–0" })).querySelector(".g-match__mid").textContent, "0–0");
  assert.equal(mount(renderMatchCard({ ...props, score: HOSTILE })).querySelector(".g-match__mid--score").textContent, HOSTILE);
  assert.equal(inRussian(() => mount(renderMatchCard(props)).querySelector(".g-match__mid").textContent), "vs");
});

test("a match card keeps the meta line's two ends where they are, whichever one it has", () => {
  const props = { title: "T", home: { name: "A" }, away: { name: "B" } };
  const spans = (meta) => mount(renderMatchCard({ ...props, meta })).querySelectorAll(".g-match__meta span").map((node) => node.textContent);
  assert.deepEqual(spans({ left: "Round 7" }), ["Round 7", ""]);
  assert.deepEqual(spans({ right: "[DATE]" }), ["", "[DATE]"]);
  assert.deepEqual(spans({ left: HOSTILE, right: HOSTILE }), [HOSTILE, HOSTILE]);
  assert.equal(mount(renderMatchCard({ ...props, meta: {} })).querySelector(".g-match__meta"), null);
  assert.equal(mount(renderMatchCard({ ...props, meta: { left: null, right: "" } })).querySelector(".g-match__meta"), null);
});

test("a match card is text where it says words and markup where it was handed markup", () => {
  const fragment = mount(renderMatchCard({
    title: HOSTILE,
    meta: { left: HOSTILE, right: HOSTILE },
    home: { name: HOSTILE, sub: HOSTILE },
    away: { name: HOSTILE, sub: HOSTILE },
    statusHtml: '<span class="status-mark">s</span>',
  }));
  assert.equal(fragment.querySelector(".g-match__title").textContent, HOSTILE);
  assert.deepEqual(fragment.querySelectorAll(".g-match__name").map((node) => node.textContent), [HOSTILE, HOSTILE]);
  assert.deepEqual(fragment.querySelectorAll(".g-match__sub").map((node) => node.textContent), [HOSTILE, HOSTILE]);
  assert.equal(fragment.querySelector("img"), null);
  assert.ok(fragment.querySelector(".g-match__head .status-mark"));
  assertCspSafe(fragment);
});

test("a match card has a title and two named teams", () => {
  const home = { name: "A" };
  const away = { name: "B" };
  assert.throws(() => renderMatchCard({ home, away }), /title/);
  assert.throws(() => renderMatchCard({ title: "", home, away }), /title/);
  assert.throws(() => renderMatchCard({ title: "T", away }), /home/);
  assert.throws(() => renderMatchCard({ title: "T", home: {}, away }), /home/);
  assert.throws(() => renderMatchCard({ title: "T", home }), /away/);
  assert.throws(() => renderMatchCard({ title: "T", home, away: { name: "" } }), /away/);
});

test("a draw's white letter reads 4.5:1 on its square and its pill, in every palette", () => {
  for (const [sheet, base, draw] of [["src/ui/result-pill.css", ".g-result", ".g-result--d"], ["src/ui/form-strip.css", ".g-form__item", ".g-form__item--d"]]) {
    const letter = valuesOf(sheet, base, "color").at(-1);
    const fill = valuesOf(sheet, draw, "background").at(-1);
    assertContrast(letter, [fill], 4.5, { what: `${draw} ${letter}` });
  }
});

test("a form strip square is named by its word, since a title is not reliably read, and still shows its letter", () => {
  const fragment = mount(renderFormStrip({ results: ["w", "d", "l", "t"] }));
  const items = fragment.querySelectorAll(".g-form__item");
  assert.deepEqual(items.map((item) => item.getAttribute("aria-label")), ["Win", "Draw", "Loss", "Friendly"]);
  assert.deepEqual(items.map((item) => item.textContent), ["W", "D", "L", "F"]);
  assertCspSafe(fragment);
  const russian = inRussian(() => mount(renderFormStrip({ results: ["d"] })).querySelector(".g-form__item"));
  assert.equal(russian.getAttribute("aria-label"), "Ничья");
  assert.equal(russian.textContent, "Н");
});

test("a compact kpi figure keeps tabular digits: its font shorthand would reset them", () => {
  const sheet = "src/ui/kpi-tile.css";
  assert.deepEqual(valuesOf(sheet, ".g-kpi--compact .g-kpi__v", "font-variant-numeric"), ["tabular-nums"]);
  const body = readFileSync(new URL("../src/ui/kpi-tile.css", import.meta.url), "utf8").match(/\.g-kpi--compact \.g-kpi__v\s*\{([^}]*)\}/)[1];
  assert.ok(body.indexOf("font-variant-numeric") > body.indexOf("font:"), "after the shorthand, or the shorthand wins");
});

test("a match board: the overline, both teams, the score or a dash pair, the status, the season's squares with the current one ringed, the actions", () => {
  const fragment = mount(renderMatchBoard({
    overline: "Round 3 · home", own: { name: "Wardens", sub: "Human · #2" }, opponent: { name: "Raiders", sub: "Skaven" },
    statusHtml: renderStatusChip({ label: "Not started", onDark: true }),
    pager: [{ label: "1", result: "w", current: false }, { label: "2", result: "l", current: false }, { label: "3", result: null, current: true }],
    actionsHtml: renderButton({ label: "Match preparation", href: "#/games/g1/pre-match" }),
  }));
  assert.equal(fragment.querySelector(".g-board__mid").textContent.includes("–:–"), true);
  assert.deepEqual(fragment.querySelectorAll(".g-board__square").map((square) => square.getAttribute("aria-label")), ["1: Win", "2: Loss", "3: Not played"]);
  assert.ok(fragment.querySelector(".g-board__square--current.g-board__square--none"));
  assert.equal(fragment.querySelector("ol.g-board__pager").getAttribute("aria-label"), "Season matches");
  assert.equal(fragment.querySelector(".g-board__square a"), null, "squares are no links: they are smaller than a tap");
  assertCspSafe(fragment);
  assertStyled(fragment, "match-board.css", "status-chip.css", "button.css");
  assertDictionaryCovers("src/ui/match-board.mjs");
});

test("with no opponent yet the board says when there will be one; names and lines are text", () => {
  const fragment = mount(renderMatchBoard({ own: { name: HOSTILE, sub: HOSTILE }, pendingText: "Opponent — after round 2" }));
  assert.equal(fragment.querySelector(".g-board__side--away").textContent, "Opponent — after round 2");
  assert.equal(fragment.querySelector("img"), null);
  assert.throws(() => renderMatchBoard({ own: {} }), /own/);
});

test("the board's dark band reads in every palette", () => {
  assertReadable("src/ui/match-board.css", ".g-board__name", "color", ["--header"], 4.5);
  assertReadable("src/ui/match-board.css", ".g-board__sub", "color", ["--header"], 4.5);
  assertReadable("src/ui/match-board.css", ".g-board__square--current", "color", ["--header"], 4.5);
});

// Beyond the brief's table: the parts of the board it leaves to the component.

const BOARD_CSS = "src/ui/match-board.css";
const own = { name: "Wardens", sub: "Human · #2" };

test("the board is one section: the main row of three columns, then a bar that is there only when it has something to hold", () => {
  const bare = mount(renderMatchBoard({ own, opponent: { name: "Raiders" } }));
  assert.equal(bare.querySelector("section.g-board").getAttribute("class"), "g-board");
  assert.deepEqual(bare.querySelector(".g-board__main").childNodes.map((node) => node.getAttribute("class")), ["g-board__side", "g-board__mid", "g-board__side g-board__side--away"]);
  assert.equal(bare.querySelector(".g-board__bar"), null, "no squares and no actions: no bar");
  assert.equal(bare.querySelector(".g-board__overline"), null);
  assert.equal(bare.querySelectorAll(".g-board__sub").length, 1, "the opponent had no line");
  const squares = mount(renderMatchBoard({ own, pager: [{ label: "1", result: "w", current: true }] }));
  assert.deepEqual(squares.querySelector(".g-board__bar").childNodes.map((node) => node.getAttribute("class")), ["g-board__pager"], "squares only: no empty actions box");
  const actions = mount(renderMatchBoard({ own, actionsHtml: renderButton({ label: "Go", href: "#/x" }) }));
  assert.deepEqual(actions.querySelector(".g-board__bar").childNodes.map((node) => node.getAttribute("class")), ["g-board__actions"], "actions only: no empty list of squares");
  assert.equal(actions.querySelector("ol"), null);
});

test("the board's two teams are named by the caller; a line under a name is there only when given", () => {
  const fragment = mount(renderMatchBoard({ own, opponent: { name: "Raiders", sub: "Skaven · #1" } }));
  assert.deepEqual(fragment.querySelectorAll(".g-board__name").map((node) => node.textContent), ["Wardens", "Raiders"]);
  assert.deepEqual(fragment.querySelectorAll(".g-board__sub").map((node) => node.textContent), ["Human · #2", "Skaven · #1"]);
  assert.equal(mount(renderMatchBoard({ own: { name: "Solo" } })).querySelector(".g-board__sub"), null);
  assert.throws(() => renderMatchBoard({}), /own/);
  assert.throws(() => renderMatchBoard({ own: { name: "" } }), /own/);
});

test("a score is text between the names; the dash pair stands in until there is one", () => {
  const score = (props) => mount(renderMatchBoard({ own, ...props })).querySelector(".g-board__score").textContent;
  assert.equal(score({}), "–:–");
  assert.equal(score({ score: "2:1" }), "2:1");
  assert.equal(score({ score: "0:0" }), "0:0", "a goalless score is a score");
  assert.equal(mount(renderMatchBoard({ own, score: HOSTILE, overline: HOSTILE })).querySelector("img"), null);
});

test("the status and the overline sit in the middle: the overline over the score, the status under it", () => {
  const fragment = mount(renderMatchBoard({ own, overline: "Round 3 · home", statusHtml: renderStatusChip({ label: "Live", tone: "live", onDark: true }) }));
  assert.deepEqual(fragment.querySelector(".g-board__mid").childNodes.map((node) => node.getAttribute("class")), ["g-board__overline", "g-board__score", "g-status g-status--live g-status--on-dark"]);
  assert.equal(fragment.querySelector(".g-board__overline").textContent, "Round 3 · home");
});

test("a match in play rings the board", () => {
  assert.equal(mount(renderMatchBoard({ own, live: true })).querySelector("section").getAttribute("class"), "g-board g-board--live");
  assert.equal(mount(renderMatchBoard({ own })).querySelector(".g-board--live"), null);
  assert.match(valuesOf(BOARD_CSS, ".g-board--live", "box-shadow")[0], /var\(--live\)/);
});

test("a square says its round and its result, and is the colour of the result; the current one keeps its colour", () => {
  const pager = [["w", "1"], ["d", "2"], ["l", "3"], ["t", "4"], [null, "5"]].map(([result, label], at) => ({ label, result, current: at === 3 }));
  const fragment = mount(renderMatchBoard({ own, pager }));
  const squares = fragment.querySelectorAll(".g-board__square");
  assert.deepEqual(squares.map((square) => square.getAttribute("class")), [
    "g-board__square g-board__square--w", "g-board__square g-board__square--d", "g-board__square g-board__square--l",
    "g-board__square g-board__square--t g-board__square--current", "g-board__square g-board__square--none"]);
  assert.deepEqual(squares.map((square) => square.getAttribute("aria-label")), ["1: Win", "2: Draw", "3: Loss", "4: Friendly", "5: Not played"]);
  assert.deepEqual(squares.map((square) => square.textContent), ["1", "2", "3", "4", "5"]);
  assertStyled(fragment, "match-board.css");
  assert.throws(() => renderMatchBoard({ own, pager: [{ label: "1", result: "x", current: false }] }), /unknown result/);
  assert.equal(mount(renderMatchBoard({ own, pager: [{ label: "1", result: "", current: false }] })).querySelector(".g-board__square").getAttribute("class"), "g-board__square g-board__square--none", "no result is not played, however it is written");
  const tricky = mount(renderMatchBoard({ own, pager: [{ label: HOSTILE, result: null, current: false }] }));
  assert.equal(tricky.querySelector("img"), null);
  assert.equal(tricky.querySelector(".g-board__square").textContent, HOSTILE);
});

test("the board reads in Russian: the dash pair, the list's name and the word for a square not yet played", () => {
  const fragment = inRussian(() => mount(renderMatchBoard({ own, pager: [{ label: "1", result: "d", current: false }, { label: "2", result: null, current: true }] })));
  assert.equal(fragment.querySelector(".g-board__score").textContent, "–:–");
  assert.equal(fragment.querySelector("ol").getAttribute("aria-label"), "Матчи сезона");
  assert.deepEqual(fragment.querySelectorAll(".g-board__square").map((square) => square.getAttribute("aria-label")), ["1: Ничья", "2: Не сыгран"]);
});

test("a square's letter and number read on its colour in every palette", () => {
  const ink = (selector) => valuesOf(BOARD_CSS, selector, "color").at(-1);
  for (const [selector, fill] of [[".g-board__square--w", "--accent"], [".g-board__square--d", "--neutral-result"], [".g-board__square--l", "--danger"], [".g-board__square--t", "--result-friendly"]]) {
    assert.deepEqual(valuesOf(BOARD_CSS, selector, "background"), [`var(${fill})`], `${selector} fill`);
    assertContrast(ink(selector), [`var(${fill})`], 4.5, { what: `${selector} ${ink(selector)}` });
  }
  const wash = "color-mix(in srgb, var(--header-ink) 14%, var(--header))";
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__square--none", "background"), ["color-mix(in srgb, var(--header-ink) 14%, transparent)"]);
  assertContrast(ink(".g-board__square--none"), [wash], 4.5, { what: "an unplayed square" });
  assertContrast(ink(".g-board__square--current"), [wash], 4.5, { what: "the current square" });
});

test("the board is drawn as the design says: a dark 16px card, a 72px score on a desk and 40px on a phone, 30px squares, a darker bar", () => {
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board", "background"), valuesOf(BOARD_CSS, ".g-board", "color"), valuesOf(BOARD_CSS, ".g-board", "border-radius")], [["var(--header)"], ["var(--header-ink)"], ["var(--radius-2xl)"]]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__main", "grid-template-columns"), ["minmax(0, 1fr) auto minmax(0, 1fr)"]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__score", "font"), ["700 40px/1 var(--font-display)", "700 72px/1 var(--font-display)"]);
  assert.match(valuesOf(BOARD_CSS, ".g-board__overline", "font")[0], /^700 12px\//);
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__overline", "text-transform"), valuesOf(BOARD_CSS, ".g-board__overline", "color")], [["uppercase"], ["var(--header-muted)"]]);
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__square", "width"), valuesOf(BOARD_CSS, ".g-board__square", "height"), valuesOf(BOARD_CSS, ".g-board__square", "border-radius")], [["30px"], ["30px"], ["var(--radius-sm)"]]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__square--current", "outline"), ["2px solid var(--header-ink)"]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__bar", "background"), ["color-mix(in srgb, #000 20%, transparent)"]);
  const css = readFileSync(new URL(`../${BOARD_CSS}`, import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 901px\)/);
});

test("on the band a primary action is the light button and the rest are outlined; every one is a 44px target", () => {
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__actions .g-btn--primary", "background"), valuesOf(BOARD_CSS, ".g-board__actions .g-btn--primary", "color")], [["var(--header-ink)"], ["var(--header)"]]);
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__actions .g-btn", "background"), valuesOf(BOARD_CSS, ".g-board__actions .g-btn", "border")], [["transparent"], ["1px solid var(--header-ink)"]]);
  for (const selector of [".g-board__actions .g-btn", ".g-board__link"]) assert.deepEqual(valuesOf(BOARD_CSS, selector, "min-height"), ["var(--size-touch)"], selector);
  assertReadable(BOARD_CSS, ".g-board__actions .g-btn--primary", "color", ["--header-ink"], 4.5);
  for (const selector of [".g-board__actions .g-btn", ".g-board__link", ".g-board__note", ".g-board__pending"]) assertReadable(BOARD_CSS, selector, "color", ["--header", "color-mix(in srgb, #000 20%, var(--header))"], 4.5);
  assertReadable(BOARD_CSS, ".g-board__overline", "color", ["--header"], 4.5);
});

test("the focus ring on the board's dark band is the header's ink, not the page's accent", () => {
  for (const selector of [".g-board__actions .g-btn:focus-visible", ".g-board__link:focus-visible"]) assert.deepEqual(valuesOf(BOARD_CSS, selector, "outline-color"), ["var(--header-ink)"], selector);
});

test("the board's actions: a primary and a light button, a plain link, and a note that is text", () => {
  const fragment = mount(renderBoardActions({
    links: [{ label: "Match records", href: "#/t/t1/roster", kind: "text" }, { label: "Post-match", href: "#/games/g1/post-match", kind: "light" }, { label: "Preparation", href: "#/games/g1/pre-match", kind: "primary" }],
    sentLine: "Win 2–1 · CAS 1–0",
  }));
  assert.deepEqual(fragment.childNodes.map((node) => [node.tagName, node.getAttribute("class"), node.textContent]), [
    ["SPAN", "g-board__note", "Win 2–1 · CAS 1–0"],
    ["A", "g-board__link", "Match records"],
    ["A", "g-btn", "Post-match"],
    ["A", "g-btn g-btn--primary", "Preparation"],
  ]);
  assert.deepEqual(fragment.querySelectorAll("a").map((link) => link.getAttribute("href")), ["#/t/t1/roster", "#/games/g1/post-match", "#/games/g1/pre-match"]);
  assertCspSafe(fragment);
  assertStyled(fragment, "match-board.css", "button.css");
});

test("the board's actions draw nothing for nothing, and refuse a kind or a link they cannot draw", () => {
  assert.equal(renderBoardActions({ links: [], sentLine: "" }), "");
  assert.equal(renderBoardActions({}), "");
  for (const kind of ["outline", "danger", "toString", undefined]) assert.throws(() => renderBoardActions({ links: [{ label: "L", href: "#/x", kind }] }), /action kind/, String(kind));
  assert.throws(() => renderBoardActions({ links: [{ label: "L", href: "javascript:alert(1)", kind: "text" }] }), /javascript/);
  const hostile = mount(renderBoardActions({ links: [{ label: HOSTILE, href: '#/x"onmouseover="1', kind: "text" }, { label: HOSTILE, href: "#/y", kind: "light" }], sentLine: HOSTILE }));
  assert.equal(hostile.querySelector("img"), null);
  assert.deepEqual(hostile.querySelectorAll("a").map((link) => link.textContent), [HOSTILE, HOSTILE]);
  assertCspSafe(hostile);
});

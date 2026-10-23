import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertContrast, assertReadable, inMedia, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints, mediaText, outsideMedia } from "./helpers/css.mjs";
import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { renderCrest } from "../src/shell/crest.mjs";
import { renderButton } from "../src/ui/button.mjs";
import { renderFormStrip } from "../src/ui/form-strip.mjs";
import { renderKpiGrid, renderKpiTile } from "../src/ui/kpi-tile.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import {
  renderBoardActions, renderBoardBubble, renderBoardChips, renderBoardToCurrent, renderMatchBoard, wireBoardPager,
} from "../src/ui/match-board.mjs";
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

test("an empty grid draws nothing, an odd one gives its last tile the row, and a row grid wraps by 180px from 901px (DeskOverview.html)", () => {
  const tile = { label: "TV", value: "1 120k" };
  assert.equal(renderKpiGrid([]), "");
  assert.equal(mount(renderKpiGrid([tile, tile, tile])).querySelectorAll(".g-kpi").length, 3);
  assert.equal(mount(renderKpiGrid([tile])).querySelectorAll(".g-kpi").length, 1);
  assert.ok(mount(renderKpiGrid([tile, tile], { row: true })).querySelector(".g-kpis.g-kpis--row"));
  assert.equal(mount(renderKpiGrid([tile, tile])).querySelector(".g-kpis--row"), null);
  assert.throws(() => renderKpiGrid(), /tiles/);
  assert.throws(() => renderKpiGrid("tiles"), /tiles/);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis > .g-kpi:last-child:nth-child(odd)", "grid-column"), ["1 / -1"]);
  // DeskOverview.html's row: as many 180px cards as the width holds, 12 apart, the rest on the next line.
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis--row", "grid-auto-flow"), ["row"]);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis--row", "grid-template-columns"), ["repeat(auto-fit, minmax(180px, 1fr))"]);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis--row", "gap"), ["var(--space-12)"]);
  assert.deepEqual(valuesOf("src/ui/kpi-tile.css", ".g-kpis--row > .g-kpi:last-child:nth-child(odd)", "grid-column"), ["auto"], "a lone last card is one card, not the row");
  // valuesOf reads every rule whatever its at-rule, so "from 901px" is read from the source text: the row rules are inside that query, and nowhere else.
  const desk = mediaText("src/ui/kpi-tile.css", "min-width: 901px");
  assert.match(desk, /\.g-kpis--row \{[^}]*grid-auto-flow: row/);
  assert.match(desk, /\.g-kpis--row \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(180px, 1fr\)\)/);
  assert.match(desk, /\.g-kpis--row > \.g-kpi:last-child:nth-child\(odd\) \{[^}]*grid-column: auto/);
  assert.ok(!outsideMedia("src/ui/kpi-tile.css", "min-width: 901px").includes(".g-kpis--row"), "the row rules are not outside the 901px query");
  assertBreakpoints("src/ui/kpi-tile.css");
});

test("a tile can say a quieter second part of its figure, and a figure in the accent; both escaped", () => {
  const place = mount(renderKpiTile({ label: "Place in the league", value: "2", rest: "/ 10" })).querySelector(".g-kpi");
  assert.equal(place.getAttribute("class"), "g-kpi", "a second part is no form of the tile");
  const figure = place.querySelector(".g-kpi__v");
  assert.equal(figure.textContent, "2 / 10", "one line, read as one figure: the number, a space, the quieter part");
  assert.equal(figure.querySelector(".g-kpi__rest").textContent, "/ 10");
  assert.equal(figure.childNodes.length, 2, "the number as text, then the part in its own span");
  assert.equal(mount(renderKpiTile({ label: "Team value", value: "1 120k" })).querySelector(".g-kpi__rest"), null, "no second part, no span and no trailing space");
  assert.equal(mount(renderKpiTile({ label: "Team value", value: "1 120k" })).querySelector(".g-kpi__v").textContent, "1 120k");
  const good = mount(renderKpiTile({ label: "TD ± / CAS ±", value: "+6 / +4", accent: true })).querySelector(".g-kpi");
  assert.equal(good.getAttribute("class"), "g-kpi g-kpi--accent");
  assert.equal(mount(renderKpiTile({ label: "TD ± / CAS ±", value: "−1 / −1" })).querySelector(".g-kpi--accent"), null, "only when asked for");
  // Text, whatever it holds; a zero is a figure here too.
  const hostile = mount(renderKpiTile({ label: HOSTILE, value: HOSTILE, rest: HOSTILE, accent: true }));
  assert.equal(hostile.querySelector("img"), null);
  assert.equal(hostile.querySelector(".g-kpi__rest").textContent, HOSTILE);
  assert.equal(hostile.querySelector(".g-kpi__v").textContent, `${HOSTILE} ${HOSTILE}`);
  assertCspSafe(hostile);
  assert.equal(mount(renderKpiTile({ label: "Points", value: 0, rest: "· 0/0/0" })).querySelector(".g-kpi__v").textContent, "0 · 0/0/0");
  assert.equal(mount(renderKpiTile({ label: "Place", value: "2", rest: 0 })).querySelector(".g-kpi__rest").textContent, "0", "a second part of zero is one (fix round 1, M7)");
  for (const rest of [null, undefined, ""]) assert.equal(mount(renderKpiTile({ label: "Place", value: "2", rest })).querySelector(".g-kpi__v").textContent, "2", String(rest));
  // A grid hands both on, tile by tile.
  const grid = mount(renderKpiGrid([{ label: "Points", value: "13", rest: "· 4/1/1" }, { label: "Treasury", value: "70k", href: "#/t/t1/team" }, { label: "TD ± / CAS ±", value: "+6 / +4", accent: true }], { row: true }));
  assert.deepEqual(grid.querySelectorAll(".g-kpi").map((tile) => [tile.getAttribute("class"), tile.querySelector(".g-kpi__rest")?.textContent ?? ""]),
    [["g-kpi", "· 4/1/1"], ["g-kpi g-kpi--link", ""], ["g-kpi g-kpi--accent", ""]]);
  assertStyled(grid, "kpi-tile.css");
  // The part is the figure's own font and weight, smaller and grey; the accent is the accent's text colour. Readable on a desk's card and a phone's tile.
  const sheet = "src/ui/kpi-tile.css";
  assert.deepEqual(valuesOf(sheet, ".g-kpi__rest", "color"), ["var(--muted)"]);
  assert.deepEqual(valuesOf(sheet, ".g-kpi__rest", "font-size"), ["22px"]);
  assert.deepEqual(valuesOf(sheet, ".g-kpi__rest", "font"), [], "the figure's Oswald 700, not a font of its own");
  assert.deepEqual(valuesOf(sheet, ".g-kpi--accent .g-kpi__v", "color"), ["var(--accent-text)"]);
  assertReadable(sheet, ".g-kpi__rest", "color", ["--surface", "--surface-2"], 4.5);
  assertReadable(sheet, ".g-kpi--accent .g-kpi__v", "color", ["--surface", "--surface-2"], 4.5);
});

test("a tile may lead somewhere: a link with the same face (06 → 08: the treasury tile)", () => {
  const fragment = mount(renderKpiGrid([{ label: "Treasury", value: "120k", href: "#/t/t1/team" }, { label: "TV", value: "1 000k" }]));
  assert.equal(fragment.querySelector("a.g-kpi.g-kpi--link").getAttribute("href"), "#/t/t1/team");
  assert.equal(fragment.querySelector("a.g-kpi .g-kpi__k").textContent, "Treasury");
  assert.equal(fragment.querySelectorAll("div.g-kpi").length, 1);
  assert.throws(() => renderKpiTile({ label: "x", value: 1, href: "javascript:alert(1)" }));
  assertStyled(fragment, "kpi-tile.css");
  const link = mount(renderKpiTile({ label: HOSTILE, value: "1", href: `#/t/${HOSTILE}` })).querySelector("a");
  assert.deepEqual([link.getAttribute("class"), link.getAttribute("href"), link.querySelector(".g-kpi__k").textContent], ["g-kpi g-kpi--link", `#/t/${HOSTILE}`, HOSTILE]);
  assert.equal(document.querySelector("img"), null);
  assertCspSafe(mount(renderKpiTile({ label: "Treasury", value: "1", href: "#/t/t1/team" })));
});

test("a link tile has no underline and shows a hover in every palette: a shade of the ink, not --surface-3 (K13)", () => {
  const sheet = "src/ui/kpi-tile.css";
  assert.deepEqual(valuesOf(sheet, "a.g-kpi--link", "text-decoration"), ["none"]);
  assert.deepEqual(valuesOf(sheet, "a.g-kpi--link", "cursor"), ["pointer"]);
  const [hover] = valuesOf(sheet, "a.g-kpi--link:hover", "background");
  // The tile is --surface-2; --surface-3 is the same colour in the dark palettes, and a hover there would show nothing.
  assertContrast(hover, ["--surface-2"], 1.1, { what: "the hover of a link tile" });
  assert.deepEqual(valuesOf(sheet, "a.g-kpi--link:focus-visible", "outline"), [], "the keyboard ring is base.css's");
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

test("status chips carry the caller's words in four tones, on light or dark", () => {
  for (const tone of STATUS_TONES) {
    const fragment = mount(renderStatusChip({ label: HOSTILE, tone, onDark: tone === "live" }));
    assert.equal(fragment.querySelector(".g-status").textContent, HOSTILE);
    assertStyled(fragment, "status-chip.css");
  }
  assert.ok(mount(renderStatusChip({ label: "Live", tone: "live", onDark: true })).querySelector(".g-status--live.g-status--on-dark"));
  assert.throws(() => renderStatusChip({ label: "x", tone: "error" }), /tone/);
});

test("a status chip is neutral unless told otherwise, and neutral is the base look", () => {
  assert.deepEqual(STATUS_TONES, ["neutral", "live", "wait", "danger"]);
  const classOf = (props) => mount(renderStatusChip({ label: "Not started", ...props })).querySelector(".g-status").getAttribute("class");
  assert.equal(classOf({}), "g-status");
  assert.equal(classOf({ tone: "neutral" }), "g-status");
  assert.equal(classOf({ tone: "live" }), "g-status g-status--live");
  assert.equal(classOf({ tone: "wait" }), "g-status g-status--wait");
  assert.equal(classOf({ tone: "danger" }), "g-status g-status--danger");
  assert.equal(classOf({ onDark: true }), "g-status g-status--on-dark");
  assert.equal(classOf({ tone: "wait", onDark: true }), "g-status g-status--wait g-status--on-dark");
  assertCspSafe(mount(renderStatusChip({ label: "Waiting for confirmation", tone: "wait" })));
});

test("a fault is a red chip (07a)", () => {
  const fragment = mount(renderStatusChip({ label: "Not saved", tone: "danger" }));
  assert.ok(fragment.querySelector(".g-status.g-status--danger"));
  assert.equal(fragment.querySelector(".g-status").textContent, "Not saved");
  assertStyled(fragment, "status-chip.css");
  assert.deepEqual(valuesOf("src/ui/status-chip.css", ".g-status--danger::before", "background"), ["var(--danger)"], "the dot is the colour of the word");
  // The page behind the chip is --page (tokens.css has no --bg: that is the 2.x alias), and the chip itself sits on --surface-3.
  assertReadable("src/ui/status-chip.css", ".g-status--danger", "color", ["--surface", "--page", "--surface-3"], 4.5);
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

test("a card labelled by a heading outside it has none of its own; a side with an address leads to its team", () => {
  const card = mount(renderMatchCard({ labelledBy: "x", meta: { left: "Round 3 · home" }, home: { name: "A" }, away: { name: HOSTILE, sub: "Orc", href: "#/coaches/u2/teams/t9" },
    statusHtml: renderStatusChip({ label: "Live", tone: "live" }) })).querySelector("article");
  assert.equal(card.getAttribute("aria-labelledby"), "x");
  assert.equal(card.querySelector(".g-match__head"), null, "no heading inside, nor the chip that sits in it");
  assert.deepEqual(card.childNodes.map((node) => node.getAttribute("class")), ["g-match__meta", "g-match__teams"]);
  const away = card.querySelector(".g-match__side--away a.g-match__name");
  assert.equal(away.getAttribute("href"), "#/coaches/u2/teams/t9");
  assert.equal(away.textContent, HOSTILE);
  assert.equal(card.querySelector(".g-match__side").querySelector("a"), null, "no address, no link");
  assertCspSafe(card.parentNode);
  assert.throws(() => renderMatchCard({ home: { name: "A" }, away: { name: "B" } }), /needs a title/);
  assert.throws(() => renderMatchCard({ labelledBy: "x", home: { name: "A" }, away: { name: "B", href: "javascript:alert(1)" } }));
  // Without it, as before.
  assert.equal(mount(renderMatchCard({ title: "T", home: { name: "A" }, away: { name: "B" } })).querySelector("article").hasAttribute("aria-labelledby"), false);
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

const classAttr = (node) => node.getAttribute("class");

test("the board can carry our crest, the opponent's initial, and the opponent's race as a link heading the line under the name; without them it is as it was", () => {
  const fragment = mount(renderMatchBoard({
    own: { ...own, crestHtml: renderCrest({ size: "md" }) },
    opponent: { name: "Raiders", href: "#/coaches/u2/teams/r1", hint: "Team overview", sub: "#1", initial: "R", race: { title: "Skaven", href: "#/teams/skaven", hint: "Rules" } },
  }));
  const [ours, theirs] = fragment.querySelectorAll(".g-board__side");
  // Our side (DeskOverview.html): the crest, then the name and its line together.
  assert.equal(classAttr(ours), "g-board__side g-board__side--emblem");
  assert.deepEqual(ours.childNodes.map(classAttr), ["g-board__crest", "g-board__texts"]);
  assert.ok(ours.querySelector(".g-board__crest svg.g-crest.g-crest--md"), "the league's crest, renderCrest's");
  assert.deepEqual(ours.querySelector(".g-board__texts").childNodes.map(classAttr), ["g-board__name", "g-board__sub"]);
  assert.equal(ours.querySelector(".g-board__name").tagName, "SPAN", "our name is no link: the page is ours");
  // Theirs: the circle with the letter, the name leading to the team, the race leading to its rules at the head of the line.
  assert.equal(classAttr(theirs), "g-board__side g-board__side--away g-board__side--emblem");
  assert.deepEqual(theirs.childNodes.map(classAttr), ["g-board__initial", "g-board__texts"]);
  assert.equal(theirs.querySelector(".g-board__initial").textContent, "R");
  const name = theirs.querySelector(".g-board__name");
  assert.deepEqual([name.tagName, name.getAttribute("href"), name.textContent, name.getAttribute("title")], ["A", "#/coaches/u2/teams/r1", "Raiders", "Team overview"]);
  const line = theirs.querySelector(".g-board__sub");
  assert.equal(classAttr(line), "g-board__sub g-board__sub--race");
  const race = line.childNodes[0];
  assert.deepEqual([race.tagName, classAttr(race), race.getAttribute("href"), race.textContent, race.getAttribute("title")], ["A", "g-board__race", "#/teams/skaven", "Skaven", "Rules"]);
  assert.ok(race.querySelector("svg.g-icon"), "the book before the race");
  assert.equal(line.textContent, "Skaven · #1");
  assertCspSafe(fragment);
  assertStyled(fragment, "match-board.css", "src/shell/crest.css");
  // A race with nothing after it is the line alone; a race with no crest or letter needs no box around the texts.
  const raceOnly = mount(renderMatchBoard({ own, opponent: { name: "Raiders", race: { title: "Skaven", href: "#/teams/skaven" } } }));
  assert.equal(raceOnly.querySelector(".g-board__side--away .g-board__sub").textContent, "Skaven");
  assert.equal(raceOnly.querySelector(".g-board__race").hasAttribute("title"), false, "a link with no hint has no tooltip");
  assert.equal(raceOnly.querySelector(".g-board__texts"), null);
  assert.equal(classAttr(raceOnly.querySelector(".g-board__side--away")), "g-board__side g-board__side--away");
  // Without the new fields, the markup is as it was before them (0c9255b), string for string: the name and the line straight
  // in the side, no box, no mark, no link.
  assert.equal(renderMatchBoard({ own, opponent: { name: "Raiders", sub: "Skaven · #1" } }), '<section class="g-board"><div class="g-board__main">'
    + '<div class="g-board__side"><span class="g-board__name">Wardens</span><span class="g-board__sub">Human · #2</span></div>'
    + '<div class="g-board__mid"><span class="g-board__score">–:–</span></div>'
    + '<div class="g-board__side g-board__side--away"><span class="g-board__name">Raiders</span><span class="g-board__sub">Skaven · #1</span></div></div></section>');
  // An initial of nothing is no initial: the caller says what the circle holds.
  assert.equal(mount(renderMatchBoard({ own, opponent: { name: "Raiders", initial: "" } })).querySelector(".g-board__initial"), null);
});

test("the initial is hidden from a screen reader; the race's title and the line are text", () => {
  const fragment = mount(renderMatchBoard({
    own: { name: HOSTILE, sub: HOSTILE, crestHtml: renderCrest() },
    opponent: { name: HOSTILE, href: "#/coaches/u2/teams/r1", hint: HOSTILE, sub: HOSTILE, initial: HOSTILE, race: { title: HOSTILE, href: "#/teams/skaven", hint: HOSTILE } },
  }));
  assert.equal(fragment.querySelector("img"), null);
  const initial = fragment.querySelector(".g-board__initial");
  assert.equal(initial.getAttribute("aria-hidden"), "true", "the name beside it is what is read");
  assert.equal(initial.textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-board__crest svg").getAttribute("aria-hidden"), "true");
  assert.equal(fragment.querySelector("a.g-board__name").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-board__race").textContent, HOSTILE);
  assert.deepEqual(fragment.querySelectorAll("a").map((link) => link.getAttribute("title")), [HOSTILE, HOSTILE], "a tooltip is text too");
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__sub").textContent, `${HOSTILE} · ${HOSTILE}`);
  assertCspSafe(fragment);
  // A link the board cannot draw is refused, the name's as the race's.
  assert.throws(() => renderMatchBoard({ own, opponent: { name: "R", href: "javascript:alert(1)" } }), /javascript/);
  assert.throws(() => renderMatchBoard({ own, opponent: { name: "R", race: { title: "S", href: " javascript:alert(1)" } } }), /javascript/);
  const quoted = mount(renderMatchBoard({ own, opponent: { name: "R", href: '#/x"onmouseover="1', race: { title: "S", href: '#/y"onfocus="1' } } }));
  assert.deepEqual(quoted.querySelectorAll("a").map((link) => link.getAttribute("href")), ['#/x"onmouseover="1', '#/y"onfocus="1']);
  assertCspSafe(quoted);
});

test("styled; the crest and the initial are a desk's", () => {
  const desk = (selector, property) => inMedia(BOARD_CSS, "min-width: 901px", selector, property);
  // From 901px, DeskOverview.html's: the side a row 16px apart, the shield 52×59, the circle 52 in a 2px ring of half the ink on an eighth of it.
  assert.deepEqual([desk(".g-board__side--emblem", "flex-direction"), desk(".g-board__side--emblem", "align-items"), desk(".g-board__side--emblem", "gap")], [["row"], ["center"], ["var(--space-16)"]]);
  assert.deepEqual(desk(".g-board__side--away.g-board__side--emblem", "flex-direction"), ["row-reverse"]);
  assert.deepEqual([desk(".g-board__crest .g-crest", "width"), desk(".g-board__crest .g-crest", "height")], [["52px"], ["59px"]]);
  assert.deepEqual([desk(".g-board__initial", "width"), desk(".g-board__initial", "height"), desk(".g-board__initial", "border-radius")], [["52px"], ["52px"], ["var(--radius-full)"]]);
  assert.deepEqual(desk(".g-board__initial", "background"), ["color-mix(in srgb, var(--header-ink) 12%, transparent)"]);
  assert.deepEqual(desk(".g-board__initial", "box-shadow"), ["inset 0 0 0 2px color-mix(in srgb, var(--header-ink) 50%, transparent)"]);
  assert.deepEqual([desk(".g-board__initial", "font"), desk(".g-board__initial", "color")], [["700 26px/1 var(--font-display)"], ["var(--header-ink)"]]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__initial", "width"), ["52px"], "nowhere but on a desk");
  // Up to 900px neither is drawn: the phone's board is as it was (Team.html has none).
  assert.deepEqual(inMedia(BOARD_CSS, "max-width: 900px", ".g-board__crest", "display"), ["none"]);
  assert.deepEqual(inMedia(BOARD_CSS, "max-width: 900px", ".g-board__initial", "display"), ["none"]);
  // The texts beside the mark are the column the side was; theirs at the right.
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__texts", "flex-direction"), valuesOf(BOARD_CSS, ".g-board__texts", "gap"), valuesOf(BOARD_CSS, ".g-board__texts", "min-width")], [["column"], ["var(--space-4)"], ["0"]]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__side--away .g-board__texts", "align-items"), ["flex-end"]);
  // The race: 13/600 in the ink, underlined in 40% of it 3px under the words, the book 5px before them; the rest 6px after it.
  const race = (property) => valuesOf(BOARD_CSS, ".g-board__race", property);
  assert.deepEqual([race("display"), race("align-items"), race("gap"), race("font"), race("color")], [["inline-flex"], ["center"], ["5px"], ["600 13px/1.35 var(--font-body)"], ["var(--header-ink)"]]);
  assert.deepEqual([race("text-decoration"), race("text-decoration-color"), race("text-underline-offset")], [["underline"], ["color-mix(in srgb, var(--header-ink) 40%, transparent)"], ["3px"]]);
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__sub--race", "gap"), valuesOf(BOARD_CSS, ".g-board__sub--race", "flex-wrap")], [["0 var(--space-6)"], ["wrap"]]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__side--away .g-board__sub--race", "justify-content"), ["flex-end"]);
  // D2: a finger's 44px up to 900px, from 24px on a desk (the overview draws the links on a desk only); the keyboard's ring the header's ink.
  const px = (value) => (value === "var(--size-touch)" ? 44 : Number.parseFloat(value));
  for (const selector of [".g-board__race", "a.g-board__name"]) {
    assert.deepEqual(valuesOf(BOARD_CSS, selector, "min-height")[0], "var(--size-touch)", selector);
    const onDesk = desk(selector, "min-height");
    assert.ok(onDesk.length === 1 && px(onDesk[0]) >= 24, `${selector}: ${onDesk}`);
    assert.deepEqual(valuesOf(BOARD_CSS, `${selector}:focus-visible`, "outline-color"), ["var(--header-ink)"], selector);
  }
  // The race's 24px take no room from its line: −3px above and below keep the line about the prototype's 17.5px, as
  // .g-profile__back does (T34 I1). The name's 32px clear 24 by themselves.
  assert.deepEqual([desk(".g-board__race", "margin"), desk("a.g-board__name", "margin")], [["-3px 0"], []]);
  // The state's chip as DeskOverview.html's from 901px: 24px high, 12px (the kit's 26 and 13); its 700 and its dots the kit's.
  assert.deepEqual([desk(".g-board__mid .g-status", "height"), desk(".g-board__mid .g-status", "font-size")], [["24px"], ["12px"]]);
  assert.deepEqual([desk(".g-board__mid .g-status", "font-weight"), desk(".g-board__mid .g-status::before", "background")], [[], []]);
  assert.deepEqual(valuesOf(BOARD_CSS, "a.g-board__name", "text-decoration"), ["none"], "the name is white, not underlined");
  for (const selector of [".g-board__name", ".g-board__race"]) assert.deepEqual(valuesOf(BOARD_CSS, selector, "overflow-wrap"), ["anywhere"], selector);
  assertReadable(BOARD_CSS, ".g-board__race", "color", ["--header"], 4.5);
  assertReadable(BOARD_CSS, ".g-board__initial", "color", ["color-mix(in srgb, var(--header-ink) 12%, var(--header))"], 4.5);
  for (const selector of [".g-board__name", "a.g-board__name", ".g-board__texts", ".g-board__sub--race", ".g-board__race"]) {
    assert.deepEqual([valuesOf(BOARD_CSS, selector, "white-space"), valuesOf(BOARD_CSS, selector, "text-overflow")], [[], []], `${selector} wraps, and nothing is cut off`);
  }
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

test("a match in play rings the board, inside the band where the ring can be seen, in every palette", () => {
  assert.equal(mount(renderMatchBoard({ own, live: true })).querySelector("section").getAttribute("class"), "g-board g-board--live");
  assert.equal(mount(renderMatchBoard({ own })).querySelector(".g-board--live"), null);
  // An outline inside the card: a shadow outside it sits on the page (the live green is 1.7:1 there in the light palettes) and goes in forced-colours mode.
  const [ring] = valuesOf(BOARD_CSS, ".g-board--live", "outline");
  assert.match(ring, /^2px solid var\(--live\)$/);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board--live", "outline-offset"), ["-2px"]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board--live", "box-shadow"), []);
  assertContrast(ring.match(/var\(--[\w-]+\)/)[0], ["--header"], 3, { what: "the live ring on the band" });
});

test("a square says its round and its result, and is the colour of the result; the current one keeps its colour", () => {
  const pager = [["w", "1"], ["d", "2"], ["l", "3"], ["t", "4"], [null, "5"]].map(([result, label], at) => ({ label, result, current: at === 3 }));
  const fragment = mount(renderMatchBoard({ own, pager }));
  const squares = fragment.querySelectorAll(".g-board__square");
  assert.deepEqual(squares.map((square) => square.getAttribute("class")), [
    "g-board__square g-board__square--w", "g-board__square g-board__square--d", "g-board__square g-board__square--l",
    "g-board__square g-board__square--t g-board__square--current", "g-board__square g-board__square--none"]);
  assert.deepEqual(squares.map((square) => square.getAttribute("aria-label")), ["1: Win", "2: Draw", "3: Loss", "4: Friendly", "5: Not played"]);
  assert.deepEqual(squares.map((square) => square.getAttribute("aria-current")), [null, null, null, "true", null], "only the match the page is about says it is the current one");
  assert.deepEqual(squares.map((square) => square.textContent), ["1", "2", "3", "4", "5"]);
  assertStyled(fragment, "match-board.css");
  assert.throws(() => renderMatchBoard({ own, pager: [{ label: "1", result: "x", current: false }] }), /unknown result/);
  assert.equal(mount(renderMatchBoard({ own, pager: [{ label: "1", result: "", current: false }] })).querySelector(".g-board__square").getAttribute("class"), "g-board__square g-board__square--none", "no result is not played, however it is written");
  const tricky = mount(renderMatchBoard({ own, pager: [{ label: HOSTILE, result: null, current: false }] }));
  assert.equal(tricky.querySelector("img"), null);
  assert.equal(tricky.querySelector(".g-board__square").textContent, HOSTILE);
});

test("the list of squares keeps its list role where list-style: none takes it from Safari, and the current square says it is current", () => {
  const fragment = mount(renderMatchBoard({ own, pager: [{ label: "1", result: "w", current: false }, { label: "2", result: null, current: true }] }));
  assert.equal(fragment.querySelector("ol.g-board__pager").getAttribute("role"), "list");
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__pager", "list-style"), ["none"]);
  assert.deepEqual(fragment.querySelectorAll("li").map((square) => [square.getAttribute("aria-label"), square.getAttribute("aria-current")]), [["1: Win", null], ["2: Not played", "true"]]);
  assert.deepEqual(fragment.querySelectorAll("[aria-current]").map((node) => node.tagName), ["LI"]);
  assertCspSafe(fragment);
});

test("a status on a phone fits the middle column: the chip is tightened so «подтверждения» and its dot are no wider than the 124px it has", () => {
  // The longest word of the Russian «Ожидает подтверждения» is 103px at the chip's 13px, 95px at 12px; with the dot (8px), the gap and the padding
  // that was 137px in a 124px column (measured in Chrome at 375 and 320). The numbers below are what is left to fit it in: 95 + 8 + 4 + 2 × 6 = 119px.
  const chip = ".g-board__mid .g-status";
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__mid", "max-width"), ["124px"]);
  const phone = (property) => inMedia(BOARD_CSS, "max-width: 900px", chip, property);
  assert.deepEqual([phone("font-size"), phone("gap"), phone("padding")], [["12px"], ["var(--space-4)"], ["var(--space-4) var(--space-6)"]]);
  assert.deepEqual(valuesOf(BOARD_CSS, chip, "white-space"), ["normal"], "a longer status still wraps");
  const tokens = tokensOf("grass");
  assert.deepEqual([tokens["--space-4"], tokens["--space-6"]], ["4px", "6px"]);
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
  // From 901px a side keeps the room of its bubble on one line, the other gives way (the fidelity pass's G1).
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__main", "grid-template-columns"), ["minmax(0, 1fr) auto minmax(0, 1fr)", "minmax(min-content, 1fr) auto minmax(min-content, 1fr)"]);
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
  // From 901px the note is DeskSeason's quiet line of who confirms a score sent (G5): 14px/1.4, the header's muted ink, 260px.
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__note", "font"), ["700 14px/1.3 var(--font-body)", "400 14px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__note", "color"), ["var(--header-ink)", "var(--header-muted)"]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__note", "max-width"), ["260px"]);
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

// Stage 09a: a desk's board pages through the season (DeskSeason.html, DeskOverview.html).

test("a board given none of the new props is drawn as before", () => {
  // The markup of 0c9a292's renderMatchBoard for these props, string for string (stage 06, 07d): the tests of both pass as they were.
  const props = {
    overline: "Round 3 · home", own, opponent: { name: "Raiders", href: "#/coaches/u2/teams/r1", hint: "Team overview", sub: "#1", initial: "R" },
    score: "2–1", statusHtml: renderStatusChip({ label: "Live", tone: "live", onDark: true }), live: true,
    pager: [{ label: "1", result: "w", current: false }, { label: "2", result: null, current: true }],
    actionsHtml: renderBoardActions({ links: [{ label: "Post-match", href: "#/games/g1/post-match", kind: "light" }], sentLine: "" }),
  };
  assert.equal(renderMatchBoard(props), '<section class="g-board g-board--live"><div class="g-board__main"><div class="g-board__side"><span class="g-board__name">Wardens</span>'
    + '<span class="g-board__sub">Human · #2</span></div><div class="g-board__mid"><span class="g-board__overline">Round 3 · home</span><span class="g-board__score">2–1</span>'
    + '<span class="g-status g-status--live g-status--on-dark">Live</span></div><div class="g-board__side g-board__side--away g-board__side--emblem">'
    + '<span class="g-board__initial" aria-hidden="true">R</span><span class="g-board__texts"><a class="g-board__name" href="#/coaches/u2/teams/r1" title="Team overview">Raiders</a>'
    + '<span class="g-board__sub">#1</span></span></div></div><div class="g-board__bar"><ol class="g-board__pager" role="list" aria-label="Season matches">'
    + '<li class="g-board__square g-board__square--w" aria-label="1: Win">1</li><li class="g-board__square g-board__square--none g-board__square--current" aria-label="2: Not played" aria-current="true">2</li>'
    + '</ol><div class="g-board__actions"><a class="g-btn" href="#/games/g1/post-match">Post-match</a></div></div></section>');
  assert.equal(renderMatchBoard({ ...props, tabs: false, outcome: null, scoreResult: "", chipsHtml: "", bubbles: {}, toCurrentHtml: "" }), renderMatchBoard(props), "the new props left empty change nothing");
});

/** Five matches of a season, the fourth (index 3) shown: two wins, a friendly, a loss, the current one not played. */
const SEASON_PAGER = [["1", "w"], ["F", "t"], ["2", "w"], ["3", "l"], ["4", null]].map(([label, result], at) => ({ label, result, current: at === 4, title: `Match ${label}` }));
const pagerAt = (selected) => SEASON_PAGER.map((item, at) => ({ ...item, selected: at === selected }));

/** A board on a page that draws it again for every pick, as a screen does; what was picked, in order. */
function pagingBoard(selected) {
  const fragment = mount('<div class="host"></div>');
  const root = fragment.querySelector(".host");
  const picks = [];
  const draw = (at) => { root.innerHTML = renderMatchBoard({ own, tabs: true, pager: pagerAt(at) }); };
  draw(selected);
  const off = wireBoardPager(root, (index) => { picks.push(index); draw(index); });
  const tab = (index) => root.querySelector(`[data-board-item="${index}"]`);
  return { root, picks, off, tab, arrow: (step) => root.querySelector(`[data-board-step="${step}"]`) };
}

test("the squares are tabs of one group: arrows, Home and End move the selection and the focus", () => {
  const { root, picks, off, tab } = pagingBoard(3);
  const list = root.querySelector('[role="tablist"]');
  assert.equal(list.getAttribute("aria-label"), "Season matches");
  const tabs = list.querySelectorAll('[role="tab"]');
  assert.deepEqual(tabs.map((each) => [each.tagName, each.getAttribute("aria-selected"), each.getAttribute("tabindex")]),
    [["BUTTON", "false", "-1"], ["BUTTON", "false", "-1"], ["BUTTON", "false", "-1"], ["BUTTON", "true", "0"], ["BUTTON", "false", "-1"]]);
  assert.deepEqual(tabs.map((each) => each.getAttribute("aria-label")), ["Match 1: Win", "Match F: Friendly", "Match 2: Win", "Match 3: Loss", "Match 4: Not played"]);
  assert.equal(tabs[4].getAttribute("aria-current"), "true", "the match on says so whichever is shown");
  assert.equal(root.querySelector("ol"), null, "the tabs are no list");
  // The teams and the score are the tabs' panel, named by the tab selected (the final review, m-4).
  const panel = root.querySelector('[role="tabpanel"]');
  assert.ok(panel?.classList.contains("g-board__main"));
  assert.ok(tabs.every((each, at) => each.getAttribute("aria-controls") === panel.id && each.id === `g-board-tab-${at}`));
  assert.equal(panel.getAttribute("aria-labelledby"), tabs[3].id);
  tab(3).focus();
  fireEvent(tab(3), "keydown", { key: "ArrowLeft" });
  assert.deepEqual(picks, [2]);
  assert.equal(document.activeElement, tab(2), "the focus goes with the selection");
  fireEvent(tab(2), "keydown", { key: "Home" });
  fireEvent(tab(0), "keydown", { key: "End" });
  fireEvent(tab(4), "keydown", { key: "ArrowRight" });
  fireEvent(tab(4), "keydown", { key: "End" });
  assert.deepEqual(picks, [2, 0, 4], "nothing past the last, and the one shown is not picked again");
  assert.equal(document.activeElement, tab(4));
  fireEvent(tab(4), "keydown", { key: "ArrowRight" });
  fireEvent(tab(4), "keydown", { key: "Enter" });
  fireEvent(tab(4), "keydown", { key: "toString" });
  assert.deepEqual(picks, [2, 0, 4]);
  fireEvent(tab(1), "click");
  assert.deepEqual(picks, [2, 0, 4, 1]);
  assert.equal(document.activeElement, tab(1), "a square clicked takes the focus");
  off();
  fireEvent(tab(2), "click");
  assert.deepEqual(picks, [2, 0, 4, 1], "unwired, it hears nothing");
});

test("the arrows are off at the ends", () => {
  const first = pagingBoard(0);
  assert.equal(first.arrow(-1).hasAttribute("disabled"), true);
  assert.equal(first.arrow(1).hasAttribute("disabled"), false);
  assert.deepEqual([first.arrow(-1).getAttribute("aria-label"), first.arrow(1).getAttribute("aria-label")], ["Previous match", "Next match"]);
  first.arrow(1).focus();
  fireEvent(first.arrow(1), "click");
  assert.deepEqual(first.picks, [1]);
  const last = pagingBoard(4);
  assert.equal(last.arrow(1).hasAttribute("disabled"), true);
  assert.equal(last.arrow(-1).hasAttribute("disabled"), false);
  const before = pagingBoard(3);
  before.arrow(1).focus();
  fireEvent(before.arrow(1), "click");
  assert.deepEqual(before.picks, [4]);
  assert.equal(before.arrow(1).hasAttribute("disabled"), true);
  assert.equal(document.activeElement, before.tab(4), "an arrow that went off gives the focus to the square shown");
  // With none said selected, the last one is: the current match.
  const none = mount(renderMatchBoard({ own, tabs: true, pager: SEASON_PAGER }));
  assert.equal(none.querySelector('[aria-selected="true"]').getAttribute("data-board-item"), "4");
});

test("a past match: its score in the result's colour, the outcome under it, its chips", () => {
  const fragment = mount(renderMatchBoard({
    own, score: "2:1", scoreResult: "w", outcome: { label: "Win", note: "+3 in the table", result: "w" },
    chipsHtml: renderBoardChips(["CAS 1–0", "MVP Gruk"]), toCurrentHtml: renderBoardToCurrent(),
  }));
  assert.equal(fragment.querySelector(".g-board__score").getAttribute("class"), "g-board__score g-board__score--w");
  const outcome = fragment.querySelector(".g-board__mid .g-board__outcome");
  assert.equal(outcome.getAttribute("class"), "g-board__outcome g-board__outcome--w");
  assert.equal(outcome.textContent, "Win · +3 in the table");
  assert.equal(outcome.querySelector(".g-board__outcome-note").textContent, "+3 in the table");
  assert.deepEqual(fragment.querySelectorAll(".g-board__bar .g-board__chips .g-board__chip").map((chip) => chip.textContent), ["CAS 1–0", "MVP Gruk"]);
  const back = fragment.querySelector(".g-board__actions .g-board__tocurrent");
  assert.deepEqual([back.tagName, back.getAttribute("type"), back.hasAttribute("data-board-current"), back.textContent], ["BUTTON", "button", true, "To the current match →"]);
  assert.equal(mount(renderMatchBoard({ own, outcome: { label: "Draw", note: "", result: "d" } })).querySelector(".g-board__outcome").textContent, "Draw", "no note, no dot");
  assertCspSafe(fragment);
  assertStyled(fragment, "match-board.css");
  const hostile = mount(renderMatchBoard({ own, outcome: { label: HOSTILE, note: HOSTILE, result: "l" }, chipsHtml: renderBoardChips([HOSTILE]) }));
  assert.equal(hostile.querySelector("img"), null);
  assert.equal(hostile.querySelector(".g-board__chip").textContent, HOSTILE);
});

test("bubbles stand under their side and under the state", () => {
  const bubble = (text) => renderBoardBubble({ text, data: { beforeOpen: "" } });
  const fragment = mount(renderMatchBoard({
    own: { ...own, crestHtml: renderCrest() }, opponent: { name: "Raiders", sub: "#1", initial: "R" },
    statusHtml: renderStatusChip({ label: "Not started", onDark: true }),
    bubbles: { own: bubble("+90k for inducements"), mid: bubble("missing the match: 3"), other: bubble(HOSTILE) },
  }));
  const [ours, theirs] = fragment.querySelectorAll(".g-board__side");
  assert.equal(ours.querySelector(".g-board__texts .g-board__bubble").textContent, "+90k for inducements");
  assert.equal(fragment.querySelector(".g-board__mid").childNodes.at(-1).textContent, "missing the match: 3", "under the state");
  assert.equal(theirs.querySelector(".g-board__bubble").textContent, HOSTILE);
  assert.ok(ours.classList.contains("g-board__side--bubble") && theirs.classList.contains("g-board__side--bubble"), "a side with a bubble says so");
  // A pill keeps its line (G1); the side without one wraps its emblem rather than its name, the one with one does not.
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__bubble", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(BOARD_CSS, ".g-board__side--emblem:not(.g-board__side--bubble)", "flex-wrap"), ["wrap"]);
  assert.equal(fragment.querySelector("img"), null);
  for (const each of fragment.querySelectorAll(".g-board__bubble")) {
    assert.deepEqual([each.tagName, each.getAttribute("type"), each.getAttribute("aria-haspopup"), each.hasAttribute("data-before-open")], ["BUTTON", "button", "dialog", true]);
    assert.ok(each.querySelector("svg.g-icon[aria-hidden=\"true\"]"), "the «i» after the words");
  }
  assertCspSafe(fragment);
  assertStyled(fragment, "match-board.css", "src/shell/crest.css", "status-chip.css");
});

test("the paging board is styled as DeskSeason.html draws it; readable on the band; every target a desk's 24px and more", () => {
  const tabs = mount(renderMatchBoard({ own, tabs: true, pager: pagerAt(2) }));
  assertCspSafe(tabs);
  assertStyled(tabs, "match-board.css");
  assert.deepEqual(valuesOf("src/styles/tokens.css", ":root", "--on-header-loss"), ["#F2A99C"]);
  // A win's green and a loss's red on the band, in every palette.
  assertContrast("--live", ["--header", "color-mix(in srgb, #000 20%, var(--header))"], 4.5, { what: "a win on the band" });
  assertContrast("--on-header-loss", ["--header", "color-mix(in srgb, #000 20%, var(--header))"], 4.5, { what: "a loss on the band" });
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__score--w", "color"), valuesOf(BOARD_CSS, ".g-board__score--l", "color")], [["var(--live)"], ["var(--on-header-loss)"]]);
  assert.deepEqual([valuesOf(BOARD_CSS, ".g-board__outcome--w", "color"), valuesOf(BOARD_CSS, ".g-board__outcome--l", "color")], [["var(--live)"], ["var(--on-header-loss)"]]);
  assertReadable(BOARD_CSS, ".g-board__outcome-note", "color", ["--header"], 4.5);
  // The chips' words on their wash of the white, over the bar.
  assertReadable(BOARD_CSS, ".g-board__chip", "color", ["color-mix(in srgb, var(--header-ink) 10%, var(--header))", "color-mix(in srgb, #000 20%, var(--header))"], 4.5);
  assertReadable(BOARD_CSS, ".g-board__bubble", "color", ["color-mix(in srgb, var(--header-ink) 14%, var(--header))"], 4.5);
  assertReadable(BOARD_CSS, '.g-board__nav [role="tab"][aria-selected="true"]', "color", ["--header-ink"], 4.5);
  // DeskSeason.html's values.
  const prop = (selector, property) => valuesOf(BOARD_CSS, selector, property);
  assert.deepEqual([prop(".g-board__step", "width"), prop(".g-board__step", "height"), prop(".g-board__step", "border-radius")], [["32px"], ["32px"], ["var(--radius-sm)"]]);
  assert.deepEqual(prop(".g-board__step:disabled", "color"), ["color-mix(in srgb, var(--header-ink) 30%, transparent)"]);
  assert.deepEqual(prop(".g-board__tabs", "gap"), ["var(--space-4)"]);
  assert.deepEqual(prop('.g-board__nav [role="tab"].g-board__square--current:not([aria-selected="true"])', "box-shadow"), ["inset 0 0 0 1.5px color-mix(in srgb, var(--header-ink) 60%, transparent)"]);
  assert.deepEqual([prop(".g-board__chip", "min-height"), prop(".g-board__chip", "border-radius"), prop(".g-board__chip", "font"), prop(".g-board__chip", "background")],
    [["30px"], ["15px"], ["600 13px/1.3 var(--font-body)"], ["color-mix(in srgb, var(--header-ink) 10%, transparent)"]]);
  assert.deepEqual([prop(".g-board__bubble", "min-height"), prop(".g-board__bubble", "border-radius"), prop(".g-board__bubble", "background"), prop(".g-board__bubble", "box-shadow")],
    [["28px"], ["var(--radius-xl)"], ["color-mix(in srgb, var(--header-ink) 14%, transparent)"], ["inset 0 0 0 1px color-mix(in srgb, var(--header-ink) 25%, transparent)"]]);
  assert.deepEqual([prop(".g-board__tocurrent", "min-height"), prop(".g-board__tocurrent", "box-shadow"), prop(".g-board__tocurrent", "font")],
    [["40px"], ["inset 0 0 0 1.5px color-mix(in srgb, var(--header-ink) 40%, transparent)"], ["600 14px/1.2 var(--font-body)"]]);
  assert.deepEqual(prop(".g-board__outcome", "font"), ["700 13px/1.3 var(--font-body)"]);
  // D2 from 901px: every target of the paging 24px and more (the square's 30, the arrow's 32, the bubble's 28, the way back's 40).
  for (const [selector, property] of [[".g-board__square", "height"], [".g-board__step", "height"], [".g-board__bubble", "min-height"], [".g-board__tocurrent", "min-height"]]) {
    assert.ok(Number.parseFloat(prop(selector, property)[0]) >= 24, selector);
  }
  // The ring of the keyboard is the band's ink; the bar's background and the squares' 30px stay 07d's (L15).
  for (const selector of [".g-board__step:focus-visible", '.g-board__nav [role="tab"]:focus-visible', ".g-board__bubble:focus-visible", ".g-board__tocurrent:focus-visible"]) {
    assert.deepEqual([prop(selector, "outline"), prop(selector, "outline-offset")], [["3px solid var(--header-ink)"], ["2px"]], selector);
  }
  assert.deepEqual(prop(".g-board__square", "width"), ["30px"]);
  assert.deepEqual(prop(".g-board__bar", "background"), ["color-mix(in srgb, #000 20%, transparent)"]);
  const css = readFileSync(new URL(`../${BOARD_CSS}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /ellipsis|text-overflow/);
  assertDictionaryCovers("src/ui/match-board.mjs");
});

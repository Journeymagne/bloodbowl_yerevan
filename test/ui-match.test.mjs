import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertContrast, valuesOf } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { renderButton } from "../src/ui/button.mjs";
import { renderFormStrip } from "../src/ui/form-strip.mjs";
import { renderKpiGrid, renderKpiTile } from "../src/ui/kpi-tile.mjs";
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

test("a kpi grid is whole rows: an odd tile would leave a hole, none draws nothing", () => {
  const tile = { label: "TV", value: "1" };
  assert.throws(() => renderKpiGrid([tile, tile, tile]), /tiles/);
  assert.throws(() => renderKpiGrid([tile]), /tiles/);
  assert.throws(() => renderKpiGrid([]), /tiles/);
  assert.throws(() => renderKpiGrid(), /tiles/);
  assert.throws(() => renderKpiGrid("tiles"), /tiles/);
  assert.doesNotThrow(() => renderKpiGrid([tile, tile]));
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

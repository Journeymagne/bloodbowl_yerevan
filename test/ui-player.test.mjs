import assert from "node:assert/strict";
import test from "node:test";

import { assertContrast, assertReadable, read, valuesOf } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { renderDie } from "../src/ui/die.mjs";
import { PLAYER_BADGE_KINDS, renderPlayerBadge } from "../src/ui/number-badge.mjs";
import { renderSkillChip, renderSkillChips, wireSkillChips } from "../src/ui/skill-chip.mjs";
import { renderStatStrip } from "../src/ui/stat-strip.mjs";

test("skill chips open their rule and mark gained skills", () => {
  const fragment = mount(renderSkillChips({ skills: [{ name: "Block" }, { name: "Diving Catch", gained: true }] }));
  const chips = fragment.querySelectorAll("[data-skill]");
  assert.deepEqual(chips.map((chip) => chip.getAttribute("data-skill")), ["Block", "Diving Catch"]);
  assert.equal(chips[0].getAttribute("aria-haspopup"), "dialog");
  assert.ok(chips[1].classList.contains("g-skill--gained"));
  assert.equal(chips[0].querySelector(".g-skill__source"), null);
  assertCspSafe(fragment);
  assertStyled(fragment, "skill-chip.css");
});

test("no skills is a word, not a chip", () => {
  const fragment = mount(renderSkillChips({ skills: [] }));
  assert.equal(fragment.querySelector(".g-skills-none").textContent, "no skills");
  assert.equal(fragment.querySelector("[data-skill]"), null);
  assertStyled(fragment, "skill-chip.css");
});

test("a card chip carries its source, names are escaped, a tap reports the skill", () => {
  const fragment = mount(renderSkillChips({ skills: [{ name: HOSTILE, source: "starting" }], card: true }) + renderSkillChip({ name: "Wrestle" }));
  assert.ok(fragment.querySelector(".g-skills--cards .g-skill--card"));
  assert.equal(fragment.querySelector(".g-skill__source").textContent, "starting");
  assert.equal(fragment.querySelector("img"), null);
  const opened = [];
  wireSkillChips(fragment, (name) => opened.push(name));
  fireEvent(fragment.querySelector(".g-skill__source"), "click");
  fireEvent(fragment.querySelector('[data-skill="Wrestle"]'), "click");
  assert.deepEqual(opened, [HOSTILE, "Wrestle"]);
  assertStyled(fragment, "skill-chip.css");
});

test("a stat strip is the five characteristics in roster order", () => {
  const fragment = mount(renderStatStrip({ values: { ma: "6", st: "3", ag: "3+", pa: null, ar: "9+" }, improved: ["ma"] }));
  assert.deepEqual(fragment.querySelectorAll(".g-stat__k").map((node) => node.textContent), ["MA", "ST", "AG", "PA", "AR"]);
  assert.deepEqual(fragment.querySelectorAll(".g-stat__v").map((node) => node.textContent), ["6 improved", "3", "3+", "–", "9+"]);
  assert.equal(fragment.querySelectorAll(".g-stat--up").length, 1);
  assert.ok(fragment.querySelector("dl.g-stats .g-stat--up dd"));
  assertCspSafe(fragment);
  assertStyled(fragment, "stat-strip.css");
});

test("a die shows its type and a question before the roll, the result after", () => {
  const before = mount(renderDie({ type: "D8" }));
  assert.equal(before.querySelector(".g-die__value").textContent, "?");
  assert.equal(before.querySelector('[role="img"]').getAttribute("aria-label"), "D8: not rolled yet");
  const after = mount(renderDie({ type: "D16", value: 11 }));
  assert.ok(after.querySelector(".g-die").classList.contains("g-die--rolled"));
  assert.equal(after.querySelector(".g-die__value").textContent, "11");
  assert.equal(after.querySelector('[role="img"]').getAttribute("aria-label"), "D16 roll: 11");
  assertCspSafe(after);
  assertStyled(after, "die.css");
});

test("a source is the card's: a plain chip draws the name alone, and a card without one has no empty line", () => {
  const plain = mount(renderSkillChip({ name: "Block", source: "starting" }));
  assert.equal(plain.querySelector(".g-skill__source"), null);
  assert.equal(plain.querySelector("[data-skill]").textContent, "Block");
  const bare = mount(renderSkillChip({ name: "Block", card: true }));
  assert.ok(bare.querySelector(".g-skill--card"));
  assert.equal(bare.querySelector(".g-skill__source"), null);
  const both = mount(renderSkillChip({ name: "Block", card: true, gained: true, source: "Primary" }));
  assert.ok(both.querySelector(".g-skill.g-skill--card.g-skill--gained"));
  assert.equal(both.querySelector("button").getAttribute("type"), "button");
});

test("a skill name and its source are text, in the attribute too", () => {
  const fragment = mount(renderSkillChip({ name: HOSTILE, card: true, source: HOSTILE }));
  assert.equal(fragment.querySelector("[data-skill]").getAttribute("data-skill"), HOSTILE);
  assert.equal(fragment.querySelector(".g-skill__source").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

test("chips that are not drawn by the list are not reported, and the listener can be removed", () => {
  const fragment = mount(`<span data-other="x">no</span>${renderSkillChips({ skills: [{ name: "Block" }] })}`);
  const opened = [];
  const off = wireSkillChips(fragment, (name, chip) => opened.push([name, chip.tagName]));
  fireEvent(fragment.querySelector("[data-other]"), "click");
  fireEvent(fragment.querySelector("[data-skill]"), "click");
  assert.deepEqual(opened, [["Block", "BUTTON"]]);
  off();
  fireEvent(fragment.querySelector("[data-skill]"), "click");
  assert.equal(opened.length, 1);
});

test("a skill chip and its list refuse what would draw nothing", () => {
  assert.throws(() => renderSkillChip({ name: "" }), /name/);
  assert.throws(() => renderSkillChip({}), /name/);
  assert.throws(() => renderSkillChips({}), /skills/);
  assert.throws(() => renderSkillChips({ skills: "Block" }), /skills/);
});

test("a stat that has no value, or is not known, is a dash or a bug", () => {
  const fragment = mount(renderStatStrip({ values: { ma: "", st: undefined, ag: "<b>3+</b>", pa: null } }));
  assert.deepEqual(fragment.querySelectorAll(".g-stat__v").map((node) => node.textContent), ["–", "–", "<b>3+</b>", "–", "–"]);
  assert.equal(fragment.querySelector("b"), null);
  assert.equal(fragment.querySelectorAll(".g-stat--up").length, 0);
  const improved = mount(renderStatStrip({ values: {}, improved: ["st", "ar"] }));
  assert.deepEqual(improved.querySelectorAll(".g-stat").map((node) => node.classList.contains("g-stat--up")), [false, true, false, false, true]);
  assert.throws(() => renderStatStrip({ values: {}, improved: ["mv"] }), /mv/);
  assert.throws(() => renderStatStrip({}), /values/);
});

test("a die is text: its type and its value are escaped, in the label too", () => {
  const fragment = mount(renderDie({ type: HOSTILE, value: HOSTILE }));
  assert.equal(fragment.querySelector(".g-die__type").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-die__value").textContent, HOSTILE);
  assert.equal(fragment.querySelector('[role="img"]').getAttribute("aria-label"), `${HOSTILE} roll: ${HOSTILE}`);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

test("a die that rolled a zero or a word has rolled; only no value is still waiting", () => {
  assert.equal(mount(renderDie({ type: "D6", value: 0 })).querySelector(".g-die__value").textContent, "0");
  assert.ok(mount(renderDie({ type: "D6", value: 0 })).querySelector(".g-die--rolled"));
  assert.equal(mount(renderDie({ type: "D6", value: "" })).querySelector(".g-die--rolled"), null);
  assert.equal(mount(renderDie({ type: "D6", value: undefined })).querySelector(".g-die__value").textContent, "?");
  assert.throws(() => renderDie({}), /type/);
  assert.throws(() => renderDie({ type: "" }), /type/);
});

test("the raised characteristics are a list of known ones: none is an empty list, a blank is not one", () => {
  assert.throws(() => renderStatStrip({ values: {}, improved: null }), /improved/);
  assert.throws(() => renderStatStrip({ values: {}, improved: "st" }), /improved/);
  assert.throws(() => renderStatStrip({ values: {}, improved: [""] }), /unknown characteristic: ""/);
  assert.throws(() => renderStatStrip({ values: {}, improved: ["st", "MA"] }), /unknown characteristic: "MA"/);
});

test("a player's badge is his number on his position's colour; the captain's has a «C» that says the word", () => {
  const fragment = mount(renderPlayerBadge({ number: "3", kind: "catcher", captain: true }));
  const badge = fragment.querySelector(".g-num.g-num--catcher");
  assert.equal(badge.querySelector(".g-num__n").textContent, "3");
  assert.equal(badge.querySelector(".g-num__captain").getAttribute("aria-hidden"), "true");
  assert.equal(badge.querySelector(".g-sr-only").textContent, "Captain");
  assert.ok(mount(renderPlayerBadge({ number: "12", kind: "big", large: true })).querySelector(".g-num.g-num--big.g-num--lg"));
  assert.equal(mount(renderPlayerBadge({ number: HOSTILE })).querySelector(".g-num__n").textContent, HOSTILE);
  assert.throws(() => renderPlayerBadge({ number: "1", kind: "ogre" }), /kind/);
  assertCspSafe(fragment);
  assertStyled(fragment, "number-badge.css");
  assert.ok(valuesOf("src/ui/number-badge.css", ".g-num--catcher", "background").includes("var(--pos-catcher)"));
  assert.ok(valuesOf("src/ui/number-badge.css", ".g-num__captain", "background").includes("var(--crest-gold)"));
});

test("a fallen player's number is grey: no position's colour, no captain's mark, readable in every palette", () => {
  const fragment = mount(renderPlayerBadge({ number: "8", kind: "blitzer", captain: true, fallen: true }));
  const badge = fragment.querySelector(".g-num.g-num--fallen");
  assert.ok(badge);
  assert.equal(badge.querySelector(".g-num__n").textContent, "8");
  assert.ok(!fragment.querySelector(".g-num--blitzer"), "his position's colour is not worn");
  assert.ok(!fragment.querySelector(".g-num__captain"), "a captain who has fallen wears no mark");
  assert.ok(!fragment.querySelector(".g-sr-only"), "and says no word for it");
  assert.ok(mount(renderPlayerBadge({ number: "8", kind: "big", large: true, fallen: true })).querySelector(".g-num.g-num--fallen.g-num--lg"));
  assert.ok(mount(renderPlayerBadge({ number: "8" })).querySelector(".g-num--lineman"), "a player still on the roster is not grey");
  assert.ok(!mount(renderPlayerBadge({ number: "8", captain: true, fallen: false })).querySelector(".g-num--fallen"));
  assert.throws(() => renderPlayerBadge({ number: "1", kind: "ogre", fallen: true }), /kind/, "a kind that is no kind is a bug of the caller even for a fallen player");
  assertCspSafe(fragment);
  assertStyled(fragment, "number-badge.css");
  assert.deepEqual(valuesOf("src/ui/number-badge.css", ".g-num--fallen", "background"), ["var(--surface-3)"]);
  assertReadable("src/ui/number-badge.css", ".g-num--fallen", "color", ["--surface-3"], 4.5);
  // After the positions' classes: the same specificity, so the later one wins.
  const css = read("src/ui/number-badge.css");
  assert.ok(css.indexOf(".g-num--fallen {") > css.indexOf(".g-num--big {"));
});

test("a changed characteristic says so in words, not only in colour (WCAG 1.4.1, 07a)", () => {
  const values = { ma: "7", st: "3", ag: "2+", pa: "4+", ar: "8+" };
  const fragment = mount(renderStatStrip({ values, improved: ["ag"], lowered: ["ar"] }));
  const [ma, , ag, , ar] = fragment.querySelectorAll(".g-stat");
  assert.ok(ag.classList.contains("g-stat--up"));
  assert.equal(ag.querySelector("dd .g-sr-only").textContent.trim(), "improved");
  assert.ok(ar.classList.contains("g-stat--down"));
  assert.equal(ar.querySelector("dd .g-sr-only").textContent.trim(), "lowered");
  assert.equal(ma.querySelector(".g-sr-only"), null);
  assert.throws(() => renderStatStrip({ values, improved: ["ag"], lowered: ["ag"] }), /both/);
  assertStyled(fragment, "stat-strip.css");
});

test("a badge is drawn for every kind of position the roster has, and for no other", () => {
  for (const kind of PLAYER_BADGE_KINDS) {
    const fragment = mount(renderPlayerBadge({ number: "1", kind }));
    assert.ok(fragment.querySelector(`.g-num--${kind}`), kind);
    assert.equal(fragment.querySelector(".g-num__captain"), null, "no captain mark unless he is the captain");
    assert.ok(valuesOf("src/ui/number-badge.css", `.g-num--${kind}`, "background").includes(`var(--pos-${kind})`), kind);
  }
  assert.deepEqual(PLAYER_BADGE_KINDS, ["blitzer", "catcher", "thrower", "lineman", "big"]);
  assert.ok(mount(renderPlayerBadge({ number: "1" })).querySelector(".g-num--lineman"), "no kind is a lineman's");
});

test("a characteristic neither raised nor lowered has no word; the two lists are lists of known ones", () => {
  const values = { ma: "6", st: "3", ag: "3+", pa: null, ar: "9+" };
  const bare = mount(renderStatStrip({ values }));
  assert.equal(bare.querySelector(".g-sr-only"), null);
  assert.equal(bare.querySelector(".g-stat--down"), null);
  assert.throws(() => renderStatStrip({ values, lowered: null }), /lowered/);
  assert.throws(() => renderStatStrip({ values, lowered: ["mv"] }), /mv/);
});

test("a badge's number reads on every position's colour, and the captain's «C» on the gold, in every palette", () => {
  const colours = PLAYER_BADGE_KINDS.map((kind) => `--pos-${kind}`);
  assertContrast("--on-accent", colours, 4.5, { what: "the number on a position's colour" });
  assert.deepEqual(valuesOf("src/ui/number-badge.css", ".g-num", "color"), ["var(--on-accent)"]);
  assertReadable("src/ui/number-badge.css", ".g-num__captain", "color", ["--crest-gold"], 4.5);
  assert.deepEqual(valuesOf("src/ui/number-badge.css", ".g-num", "width"), ["var(--size-badge)"]);
  assert.deepEqual(valuesOf("src/ui/number-badge.css", ".g-num--lg", "width"), ["60px"]);
});

test("a lowered characteristic is a red value on the plain tile, and both changed values read in every palette", () => {
  assert.deepEqual(valuesOf("src/ui/stat-strip.css", ".g-stat--down", "background"), ["var(--surface-2)"]);
  assertReadable("src/ui/stat-strip.css", ".g-stat--down .g-stat__v", "color", ["--surface-2"], 4.5);
  // The raised value is 26px bold, large text: 3:1 is its bar (WCAG 1.4.3), and 4.46:1 in grass is above it.
  assertReadable("src/ui/stat-strip.css", ".g-stat--up .g-stat__v", "color", ["--accent-tint"], 3);
});

test("a stat strip's words are escaped and follow the site's language", () => {
  const fragment = mount(renderStatStrip({ values: { ma: HOSTILE, st: "3", ag: "3+", pa: null, ar: "9+" }, improved: ["ma"], lowered: ["ar"] }));
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
  initLocale("ru");
  try {
    const russian = mount(renderStatStrip({ values: { ma: "6", st: "3", ag: "3+", pa: null, ar: "9+" }, improved: ["ma"], lowered: ["ar"] }));
    assert.deepEqual(russian.querySelectorAll(".g-stat .g-sr-only").map((node) => node.textContent.trim()), ["улучшена", "снижена"]);
    assert.equal(mount(renderPlayerBadge({ number: "1", captain: true })).querySelector(".g-sr-only").textContent, "Капитан");
  } finally {
    initLocale("en");
  }
});

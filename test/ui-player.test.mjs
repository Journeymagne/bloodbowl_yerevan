import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { renderDie } from "../src/ui/die.mjs";
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
  assert.deepEqual(fragment.querySelectorAll(".g-stat__v").map((node) => node.textContent), ["6", "3", "3+", "–", "9+"]);
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

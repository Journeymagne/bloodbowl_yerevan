import assert from "node:assert/strict";
import test from "node:test";

import { assertContrast, valuesOf } from "./helpers/contrast.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { renderActionStepper, wireActionSteppers } from "../src/ui/action-stepper.mjs";
import { renderResourceCounter, wireResourceCounters } from "../src/ui/resource-counter.mjs";
import { renderStepButton, wireStepButtons } from "../src/ui/stepper.mjs";

const TD = { key: "touchdowns", label: "TD", name: "touchdown", spp: 3, player: "L. Ashby", data: { playerId: "p1" } };

test("an action stepper says what each button does and for whom", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 0 }));
  const [minus, plus] = fragment.querySelectorAll("[data-action-step]");
  assert.equal(minus.getAttribute("aria-label"), "Remove: touchdown, L. Ashby");
  assert.equal(plus.getAttribute("aria-label"), "Add: touchdown, L. Ashby");
  assert.ok(minus.hasAttribute("disabled"), "minus is disabled at zero");
  assert.equal(fragment.querySelector(".g-stepper__label").textContent, "TD +3");
  assert.equal(fragment.querySelector("[data-action-key]").getAttribute("data-player-id"), "p1");
  assertCspSafe(fragment);
  assertStyled(fragment, "action-stepper.css");
});

test("during a match the counter shows what this match added", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 4, delta: 1 }));
  assert.equal(fragment.querySelector(".g-stepper__delta").textContent, "+1");
  assert.equal(fragment.querySelector('[data-action-step="-1"]').hasAttribute("disabled"), false);
});

test("a refused plus keeps focus and says why", () => {
  const fragment = mount(renderActionStepper({ ...TD, key: "mvp", label: "MVP", name: "MVP", spp: 5, value: 0, incBlockedReason: "MVP is chosen in the post-match" }));
  const plus = fragment.querySelector('[data-action-step="1"]');
  assert.equal(plus.hasAttribute("disabled"), false);
  assert.equal(plus.getAttribute("aria-disabled"), "true");
  assert.equal(plus.getAttribute("title"), "MVP is chosen in the post-match");
});

test("player names are escaped in labels", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 1, player: HOSTILE }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector('[data-action-step="1"]').getAttribute("aria-label"), `Add: touchdown, ${HOSTILE}`);
});

test("a resource counter shows name, note and value", () => {
  const fragment = mount(renderResourceCounter({ key: "teamRerolls", name: "Team Re-rolls", note: "120k", value: 2 }));
  assert.equal(fragment.querySelector(".g-resource__name").textContent, "Team Re-rolls");
  assert.equal(fragment.querySelector(".g-resource__note").textContent, "120k");
  assert.equal(fragment.querySelector(".g-resource__value").textContent, "2");
  assert.equal(fragment.querySelector('[data-resource-step="-1"]').getAttribute("aria-label"), "Decrease: Team Re-rolls");
  assertCspSafe(fragment);
  assertStyled(fragment, "resource-counter.css");
});

test("a locked counter stays visible with the reason on both buttons", () => {
  const fragment = mount(renderResourceCounter({ key: "startingRerolls", name: "Start Re-rolls", note: "60k", value: 1, lockedReason: "Only before the season starts" }));
  assert.ok(fragment.querySelector(".g-resource").classList.contains("g-resource--locked"));
  assert.equal(fragment.querySelector(".g-resource__note").textContent, "Only before the season starts");
  assert.equal(fragment.querySelector(".g-resource__lock").getAttribute("aria-label"), "Unavailable");
  for (const button of fragment.querySelectorAll("[data-resource-step]")) {
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.equal(button.getAttribute("title"), "Only before the season starts");
  }
  assertStyled(fragment, "resource-counter.css");
});

test("each wiring hears only its own buttons and skips refused ones", () => {
  const fragment = mount(
    renderActionStepper({ ...TD, value: 1 })
    + renderActionStepper({ ...TD, key: "mvp", value: 0, incBlockedReason: "no" })
    + renderResourceCounter({ key: "apothecary", name: "Apothecary", value: 0, incBlockedReason: "Not for this team" })
    + renderResourceCounter({ key: "cheerleaders", name: "Cheerleaders", value: 2 }),
  );
  const actions = [];
  const resources = [];
  wireActionSteppers(fragment, ({ key, delta, element }) => actions.push([key, delta, element.getAttribute("data-player-id")]));
  wireResourceCounters(fragment, ({ key, delta }) => resources.push([key, delta]));
  fireEvent(fragment.querySelector('[data-action-key="touchdowns"] [data-action-step="-1"] svg'), "click");
  fireEvent(fragment.querySelector('[data-action-key="mvp"] [data-action-step="1"]'), "click");
  fireEvent(fragment.querySelector('[data-resource-key="apothecary"] [data-resource-step="1"]'), "click");
  fireEvent(fragment.querySelector('[data-resource-key="cheerleaders"] [data-resource-step="1"]'), "click");
  fireEvent(fragment.querySelector('[data-resource-key="apothecary"] [data-resource-step="-1"]'), "click");
  assert.deepEqual(actions, [["touchdowns", -1, "p1"]]);
  assert.deepEqual(resources, [["cheerleaders", 1]]);
});

test("a counter at zero adds nothing, and one that added shows only a positive delta", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 0, delta: 0 }));
  assert.equal(fragment.querySelector(".g-stepper__delta"), null);
  assert.equal(fragment.querySelector(".g-stepper__value").textContent, "0");
  assert.equal(fragment.querySelector('[data-action-step="1"]').hasAttribute("aria-disabled"), false);
});

test("the cell key and the label cannot be taken over by the data bag or by markup", () => {
  const fragment = mount(renderActionStepper({ ...TD, label: HOSTILE, data: { actionKey: "stolen", playerId: HOSTILE } }));
  assert.equal(fragment.querySelectorAll("[data-action-key]").length, 1);
  assert.equal(fragment.querySelector("[data-action-key]").getAttribute("data-action-key"), "touchdowns");
  assert.equal(fragment.querySelector("[data-action-key]").getAttribute("data-player-id"), HOSTILE);
  assert.equal(fragment.querySelector(".g-stepper__label").textContent, `${HOSTILE} +3`);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

test("a locked counter is explained even at zero, and a free one only disables its minus", () => {
  const locked = mount(renderResourceCounter({ key: "a", name: "A", value: 0, lockedReason: "Why" }));
  const minus = locked.querySelector('[data-resource-step="-1"]');
  assert.equal(minus.hasAttribute("disabled"), false);
  assert.equal(minus.getAttribute("aria-disabled"), "true");
  assert.equal(minus.getAttribute("title"), "Why");

  const free = mount(renderResourceCounter({ key: "b", name: "B", value: 0 }));
  assert.ok(free.querySelector('[data-resource-step="-1"]').hasAttribute("disabled"));
  assert.equal(free.querySelector('[data-resource-step="1"]').hasAttribute("aria-disabled"), false);
  assert.equal(free.querySelector(".g-resource__lock"), null);
  assert.equal(free.querySelector(".g-resource__note"), null, "no note, no empty line");
  assert.equal(free.querySelector(".g-resource").classList.contains("g-resource--locked"), false);

  const full = mount(renderResourceCounter({ key: "c", name: "C", value: 6, decDisabled: false, incBlockedReason: "At the maximum" }));
  assert.equal(full.querySelector('[data-resource-step="-1"]').hasAttribute("disabled"), false);
  assert.equal(full.querySelector('[data-resource-step="1"]').getAttribute("title"), "At the maximum");
  assert.equal(mount(renderResourceCounter({ key: "d", name: "D", value: 3, decDisabled: true })).querySelector('[data-resource-step="-1"]').hasAttribute("disabled"), true);
});

test("counter names and notes are escaped", () => {
  const fragment = mount(renderResourceCounter({ key: "x", name: HOSTILE, note: HOSTILE, value: 1 }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-resource__name").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-resource__note").textContent, HOSTILE);
  assert.equal(fragment.querySelector('[data-resource-step="1"]').getAttribute("aria-label"), `Increase: ${HOSTILE}`);
  assertCspSafe(fragment);
});

test("the buttons speak Russian when the site does", () => {
  initLocale("ru");
  try {
    const fragment = mount(renderActionStepper({ ...TD, value: 1 }) + renderResourceCounter({ key: "r", name: "Рероллы", value: 1, lockedReason: "Только до старта сезона" }));
    assert.equal(fragment.querySelector('[data-action-step="-1"]').getAttribute("aria-label"), "Убрать: touchdown, L. Ashby");
    assert.equal(fragment.querySelector('[data-action-step="1"]').getAttribute("aria-label"), "Добавить: touchdown, L. Ashby");
    assert.equal(fragment.querySelector('[data-resource-step="-1"]').getAttribute("aria-label"), "Уменьшить: Рероллы");
    assert.equal(fragment.querySelector('[data-resource-step="1"]').getAttribute("aria-label"), "Увеличить: Рероллы");
    assert.equal(fragment.querySelector(".g-resource__lock").getAttribute("aria-label"), "Недоступно");
  } finally {
    initLocale("en");
  }
});

test("a step button refuses what would never work", () => {
  const base = { hook: "action", delta: 1, label: "Add", className: "g-stepper__btn" };
  assert.throws(() => renderStepButton({ ...base, delta: 2 }), /-1 or 1/);
  assert.throws(() => renderStepButton({ ...base, delta: 0 }), /-1 or 1/);
  assert.throws(() => renderStepButton({ ...base, label: "" }), /label/);
  assert.throws(() => renderStepButton({ ...base, hook: 'x" onclick="y' }), /hook/);
  assert.throws(() => wireStepButtons(mount("<p>x</p>"), "Action", () => {}), /hook/);
});

test("a step button draws a minus or a plus and nothing else", () => {
  const fragment = mount(renderStepButton({ hook: "action", delta: -1, label: "Remove", className: "g-stepper__btn" }) + renderStepButton({ hook: "action", delta: 1, label: "Add", className: "g-stepper__btn" }));
  const [minus, plus] = fragment.querySelectorAll("button");
  assert.equal(minus.getAttribute("type"), "button");
  assert.equal(minus.querySelector("path").getAttribute("d"), "M5 12h14");
  assert.equal(plus.querySelector("path").getAttribute("d"), "M12 5v14M5 12h14");
  assert.equal(minus.textContent, "");
  assertCspSafe(fragment);
  assertStyled(fragment, "action-stepper.css");
});

test("a released wiring stops hearing clicks, and a button outside any cell reports nothing", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 1 }) + renderStepButton({ hook: "action", delta: 1, label: "Stray", className: "g-stepper__btn" }));
  const seen = [];
  const release = wireActionSteppers(fragment, ({ key, delta }) => seen.push([key, delta]));
  fireEvent(fragment.querySelectorAll("[data-action-step]")[2], "click");
  assert.deepEqual(seen, [], "no cell, no key to report");
  fireEvent(fragment.querySelector('[data-action-step="1"]'), "click");
  assert.deepEqual(seen, [["touchdowns", 1]]);
  release();
  fireEvent(fragment.querySelector('[data-action-step="1"]'), "click");
  assert.deepEqual(seen, [["touchdowns", 1]]);
});

test("a minus that is plainly disabled reports nothing, even through its icon", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 0 }) + renderResourceCounter({ key: "cheerleaders", name: "Cheerleaders", value: 0 }));
  const seen = [];
  wireActionSteppers(fragment, (step) => seen.push(step.key));
  wireResourceCounters(fragment, (step) => seen.push(step.key));
  fireEvent(fragment.querySelector('[data-action-step="-1"] svg'), "click");
  fireEvent(fragment.querySelector('[data-resource-step="-1"]'), "click");
  assert.deepEqual(seen, []);
});

test("a refused plus is drawn as a refusal in both steppers: the minus's --surface-3, not the accent fill", () => {
  // On the accent, the --disabled icon is 1.1-1.5:1 in the dark palettes: a live-looking button with no sign on it.
  for (const [sheet, plus] of [["src/ui/action-stepper.css", ".g-stepper__btn--inc"], ["src/ui/resource-counter.css", ".g-resource__btn--inc"]]) {
    for (const refused of [`${plus}:disabled`, `${plus}[aria-disabled="true"]`]) {
      assert.deepEqual(valuesOf(sheet, refused, "background"), ["var(--surface-3)"], refused);
    }
  }
  assert.deepEqual(valuesOf("src/ui/action-stepper.css", ".g-stepper__btn", "background"), ["var(--surface-3)"]);
});

test("a locked counter's note is the reason, so it stays muted text a reader can read; the name and count go faint", () => {
  const sheet = "src/ui/resource-counter.css";
  const note = valuesOf(sheet, ".g-resource--locked .g-resource__note", "color").at(-1) ?? valuesOf(sheet, ".g-resource__note", "color").at(-1);
  assertContrast(note, ["--page", "--surface", "--surface-2"], 4.5, { what: `the locked note ${note}` });
  assert.deepEqual(valuesOf(sheet, ".g-resource--locked .g-resource__name", "color"), ["var(--faint)"]);
});

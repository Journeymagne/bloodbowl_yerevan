import assert from "node:assert/strict";
import test from "node:test";

import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
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

test("a refused step is heard with its reason; a plainly disabled one is not (05–13)", () => {
  const root = mount(renderResourceCounter({ key: "rr", name: "Re-rolls", value: 0, incBlockedReason: "Re-rolls: at most 8." }));
  const refused = [];
  const off = wireResourceCounters(root, () => assert.fail("a refused step is no step"), { onRefused: (step) => refused.push([step.key, step.delta, step.reason]) });
  fireEvent(root.querySelector('[data-resource-step="1"]'), "click");
  fireEvent(root.querySelector('[data-resource-step="-1"]'), "click");
  assert.deepEqual(refused, [["rr", 1, "Re-rolls: at most 8."]]);
  off();
});

test("the action stepper passes its options on too, and the refusal names the cell and the button it came from", () => {
  const root = mount(renderActionStepper({ ...TD, key: "mvp", label: "MVP", name: "MVP", spp: 5, value: 0, incBlockedReason: "MVP is chosen in the post-match" }));
  const heard = [];
  const off = wireActionSteppers(root, () => assert.fail("a refused step is no step"), { onRefused: (step, button) => heard.push([step.key, step.element, button.getAttribute("data-action-step"), step.reason]) });
  fireEvent(root.querySelector('[data-action-step="1"] svg'), "click");
  assert.deepEqual(heard, [["mvp", root.querySelector("[data-action-key]"), "1", "MVP is chosen in the post-match"]]);
  off();
});

test("a locked counter's refusal is heard on both buttons, with the lock's reason", () => {
  const root = mount(renderResourceCounter({ key: "bribes", name: "Bribes", value: 0, lockedReason: "Only for teams with Bribery and Corruption" }));
  const heard = [];
  const off = wireResourceCounters(root, () => assert.fail("a locked counter takes no step"), { onRefused: (step) => heard.push([step.delta, step.reason]) });
  fireEvent(root.querySelector('[data-resource-step="-1"]'), "click");
  fireEvent(root.querySelector('[data-resource-step="1"]'), "click");
  assert.deepEqual(heard, [[-1, "Only for teams with Bribery and Corruption"], [1, "Only for teams with Bribery and Corruption"]]);
  off();
});

test("without onRefused a refused click is silent, as it always was", () => {
  const root = mount(renderResourceCounter({ key: "rr", name: "Re-rolls", value: 0, incBlockedReason: "No" }));
  const off = wireResourceCounters(root, () => assert.fail("a refused step is no step"));
  fireEvent(root.querySelector('[data-resource-step="1"]'), "click");
  off();
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

test("a note may speak up: a shortage is red, a price is not", () => {
  const short = mount(renderResourceCounter({ key: "rr", name: "Re-rolls", value: 1, note: "Not enough · 120k", noteTone: "danger" }));
  assert.ok(short.querySelector(".g-resource__note.g-resource__note--danger"));
  assert.equal(mount(renderResourceCounter({ key: "rr", name: "Re-rolls", value: 1, note: "120k" })).querySelector(".g-resource__note--danger"), null);
  assertReadable("src/ui/resource-counter.css", ".g-resource__note--danger", "color", ["--surface"], 4.5);
  // A lock's reason replaces the note and is not a shortage, whatever tone the note was given.
  assert.equal(mount(renderResourceCounter({ key: "rr", name: "Re-rolls", value: 1, note: "Not enough", noteTone: "danger", lockedReason: "Why" })).querySelector(".g-resource__note--danger"), null);
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

test("a stepper needs the key its wiring reports, and the names its buttons are read by", () => {
  const { key, label, name, ...rest } = TD;
  assert.throws(() => renderActionStepper({ ...rest, label, name, value: 0 }), /key/);
  assert.throws(() => renderActionStepper({ ...rest, key, name, value: 0 }), /label/);
  assert.throws(() => renderActionStepper({ ...rest, key, label: "", name, value: 0 }), /label/);
  assert.throws(() => renderActionStepper({ ...rest, key, label, value: 0 }), /name/);
  assert.throws(() => renderActionStepper({ ...rest, key, label, name: "", value: 0 }), /name/);
  assert.throws(() => renderResourceCounter({ name: "Team Re-rolls", value: 1 }), /key/);
  assert.throws(() => renderResourceCounter({ key: "", name: "Team Re-rolls", value: 1 }), /key/);
  assert.throws(() => renderResourceCounter({ key: "teamRerolls", value: 1 }), /name/);
  assert.throws(() => renderResourceCounter({ key: "teamRerolls", name: "", value: 1 }), /name/);
});

// Stage 07a: the roster table's counters (compact, locked, a minus that stops above zero, a count that reads aloud).

test("a compact stepper is two rows: the label, the count and its addition over a − + pair (07a, R2)", () => {
  const fragment = mount(renderActionStepper({ ...TD, value: 7, delta: 1, compact: true }));
  const cell = fragment.querySelector(".g-stepper.g-stepper--compact");
  assert.ok(cell, "the compact class");
  assert.deepEqual(cell.childNodes.map((node) => node.getAttribute("class")), ["g-stepper__top", "g-stepper__row"], "two rows");
  const [top, row] = cell.childNodes;
  assert.deepEqual(top.childNodes.map((node) => node.getAttribute("class")), ["g-stepper__label", "g-stepper__value"], "the label and the count share the top row");
  assert.deepEqual(row.childNodes.map((node) => node.getAttribute("class")), ["g-stepper__btn", "g-stepper__btn g-stepper__btn--inc"], "− and + side by side under them");
  assert.equal(top.querySelector(".g-stepper__label").textContent, "TD +3");
  assert.equal(top.querySelector(".g-stepper__value .g-stepper__delta").textContent, "+1", "the addition is seen beside the count");
  assert.equal(cell.getAttribute("data-action-key"), "touchdowns");
  assertCspSafe(fragment);
  assertStyled(fragment, "action-stepper.css");
  const plain = mount(renderActionStepper({ ...TD, value: 2 }));
  assert.equal(plain.querySelector(".g-stepper--compact"), null, "not compact unless asked");
  assert.equal(plain.querySelector(".g-stepper__row"), null, "the one-row cell keeps its markup");
  assert.equal(plain.querySelector(".g-stepper__top"), null);
});

test("a compact stepper's two rows fit a third of a phone: the count never shares a line with a button, and the buttons stay a thumb wide (07a, R2)", () => {
  const sheet = "src/ui/action-stepper.css";
  assert.deepEqual(valuesOf(sheet, ".g-stepper--compact", "flex-direction"), ["column"]);
  assert.deepEqual(valuesOf(sheet, ".g-stepper__top", "display"), ["flex"]);
  assert.deepEqual(valuesOf(sheet, ".g-stepper__top", "justify-content"), ["space-between"]);
  assert.deepEqual(valuesOf(sheet, ".g-stepper__top", "flex-wrap"), ["wrap"], "a label too long for the line sends the count under it, not under the label");
  assert.deepEqual(valuesOf(sheet, ".g-stepper__top .g-stepper__value", "margin-left"), ["auto"], "the count stays at the right edge on its own line too");
  assert.deepEqual(valuesOf(sheet, ".g-stepper__row", "display"), ["grid"]);
  assert.deepEqual(valuesOf(sheet, ".g-stepper__row", "grid-template-columns"), ["repeat(2, minmax(var(--size-touch), 1fr))"], "two buttons, each from 44px up");
  assert.deepEqual(valuesOf(sheet, ".g-stepper--compact .g-stepper__btn", "min-width"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(sheet, ".g-stepper__btn", "height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(sheet, ".g-stepper__btn", "width"), ["var(--size-touch)"], "the one-row cell's buttons are as they were");
});

test("a compact stepper steps and refuses as the plain one does", () => {
  const root = mount(renderActionStepper({ ...TD, value: 0, compact: true, incBlockedReason: "No more" }));
  const taken = [];
  const refused = [];
  wireActionSteppers(root, (step) => taken.push(step), { onRefused: (step) => refused.push([step.key, step.delta, step.reason]) });
  fireEvent(root.querySelector('[data-action-step="-1"]'), "click");
  fireEvent(root.querySelector('[data-action-step="1"]'), "click");
  assert.deepEqual(taken, []);
  assert.deepEqual(refused, [["touchdowns", 1, "No more"]]);
  const live = mount(renderActionStepper({ ...TD, value: 1, compact: true }));
  wireActionSteppers(live, (step) => taken.push([step.key, step.delta]));
  fireEvent(live.querySelector('[data-action-step="-1"]'), "click");
  assert.deepEqual(taken, [["touchdowns", -1]]);
});

test("a locked stepper refuses both ways and says why on each button", () => {
  const reason = "Change them on the Players step";
  const root = mount(renderActionStepper({ ...TD, value: 2, lockedReason: reason }));
  for (const button of root.querySelectorAll("[data-action-step]")) {
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.equal(button.getAttribute("title"), reason);
    assert.equal(button.hasAttribute("disabled"), false, "a locked button keeps its focus and its tooltip");
  }
  const heard = [];
  wireActionSteppers(root, () => assert.fail("a locked stepper takes no step"), { onRefused: (step) => heard.push([step.key, step.delta, step.reason]) });
  fireEvent(root.querySelector('[data-action-step="-1"]'), "click");
  fireEvent(root.querySelector('[data-action-step="1"]'), "click");
  assert.deepEqual(heard, [["touchdowns", -1, reason], ["touchdowns", 1, reason]]);
});

test("a locked stepper is explained even at zero, and the lock outranks an explained plus", () => {
  const root = mount(renderActionStepper({ ...TD, value: 0, compact: true, lockedReason: "Locked", incBlockedReason: "No more" }));
  const [minus, plus] = root.querySelectorAll("[data-action-step]");
  assert.equal(minus.hasAttribute("disabled"), false);
  assert.equal(minus.getAttribute("title"), "Locked");
  assert.equal(plus.getAttribute("title"), "Locked");
  assert.equal(mount(renderActionStepper({ ...TD, value: 0, lockedReason: HOSTILE })).querySelector('[data-action-step="1"]').getAttribute("title"), HOSTILE);
  assert.equal(mount(renderActionStepper({ ...TD, value: 0, lockedReason: HOSTILE })).querySelector("img"), null);
});

test("the minus may stop above zero: the caller says where (07a)", () => {
  assert.ok(mount(renderActionStepper({ ...TD, value: 3, decDisabled: true })).querySelector('[data-action-step="-1"]').hasAttribute("disabled"));
  assert.equal(mount(renderActionStepper({ ...TD, value: 3 })).querySelector('[data-action-step="-1"]').hasAttribute("disabled"), false);
  assert.ok(mount(renderActionStepper({ ...TD, value: 0 })).querySelector('[data-action-step="-1"]').hasAttribute("disabled"), "at zero, as it was");
  assert.equal(mount(renderActionStepper({ ...TD, value: 0, decDisabled: false })).querySelector('[data-action-step="-1"]').hasAttribute("disabled"), false);
});

test("a count with this match's addition reads \"7, this match +1\" (stage 04 note)", () => {
  const text = (props) => mount(renderActionStepper({ ...TD, ...props })).querySelector(".g-stepper__value").textContent.replace(/\s+/g, " ").trim();
  assert.equal(text({ value: 7, delta: 1 }), "7, this match +1");
  assert.equal(text({ value: 7, delta: 0 }), "7", "no addition, nothing more to hear");
  const fragment = mount(renderActionStepper({ ...TD, value: 7, delta: 1 }));
  assert.equal(fragment.querySelector(".g-stepper__value .g-sr-only").textContent, ", this match ");
  assert.equal(fragment.querySelector(".g-stepper__delta").textContent, "+1");
  initLocale("ru");
  try {
    assert.equal(text({ value: 7, delta: 1 }), "7, в этом матче +1");
  } finally {
    initLocale("en");
  }
});

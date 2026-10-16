import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { BUTTON_KINDS, renderButton, renderIconButton } from "../src/ui/button.mjs";
import { wireRadioGroups } from "../src/ui/choice.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../src/ui/segmented-control.mjs";
import { renderToggle, wireToggles } from "../src/ui/toggle.mjs";

const MODES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }];

test("a primary button names its action and can say what is missing", () => {
  const fragment = mount(renderButton({ label: "Take Diving Catch", kind: "primary", disabled: true, icon: "check" }));
  const button = fragment.querySelector("button");
  assert.equal(button.getAttribute("type"), "button");
  assert.ok(button.classList.contains("g-btn") && button.classList.contains("g-btn--primary"));
  assert.ok(button.hasAttribute("disabled"));
  assert.equal(button.textContent, "Take Diving Catch");
  assert.ok(button.querySelector("svg.g-icon"));
  assertCspSafe(fragment);
  assertStyled(fragment, "button.css");
});

test("every kind has its class, an unknown kind is a bug", () => {
  for (const kind of BUTTON_KINDS) {
    const fragment = mount(renderButton({ label: "x", kind, block: true }));
    assertStyled(fragment, "button.css");
    assert.ok(fragment.querySelector(".g-btn--block"), kind);
  }
  assert.throws(() => renderButton({ label: "x", kind: "ghost" }), /kind/);
});

test("a button with an href is a link and never disabled", () => {
  const link = mount(renderButton({ label: "Profile", kind: "dark", href: "#/t/1/roster/p1", disabled: true })).querySelector("a");
  assert.equal(link.getAttribute("href"), "#/t/1/roster/p1");
  assert.equal(link.hasAttribute("disabled"), false);
});

test("labels and data are escaped", () => {
  const fragment = mount(renderButton({ label: HOSTILE, data: { player: HOSTILE } }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("button").textContent, HOSTILE);
  assert.equal(fragment.querySelector("button").getAttribute("data-player"), HOSTILE);
});

test("an icon button cannot be built without a name", () => {
  assert.throws(() => renderIconButton({ icon: "close" }), /label/);
  const fragment = mount(renderIconButton({ icon: "close", label: "Close", data: { sheetClose: "" } }));
  assert.equal(fragment.querySelector("button.g-icon-btn").getAttribute("aria-label"), "Close");
  assertStyled(fragment, "button.css");
});

test("a segmented control is a radio group with one checked segment", () => {
  const fragment = mount(renderSegmentedControl({ label: "Mode", items: MODES, selected: "dark" }));
  const group = fragment.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "Mode");
  assert.ok(group.classList.contains("g-seg--3"));
  const radios = fragment.querySelectorAll('[role="radio"]');
  assert.deepEqual(radios.map((radio) => radio.getAttribute("aria-checked")), ["false", "true", "false"]);
  assert.deepEqual(radios.map((radio) => radio.getAttribute("tabindex")), ["-1", "0", "-1"]);
  assertCspSafe(fragment);
  assertStyled(fragment, "segmented-control.css");
});

test("link segments mark the current page instead", () => {
  const fragment = mount(renderSegmentedControl({ label: "View", items: [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP", href: "#/b" }], selected: "spp" }));
  assert.equal(fragment.querySelector('a[aria-current="page"]').getAttribute("href"), "#/b");
  assert.equal(fragment.querySelector('[role="radio"]'), null);
});

test("two or three segments, never one or four", () => {
  assert.throws(() => renderSegmentedControl({ label: "x", items: MODES.slice(0, 1), selected: "light" }), RangeError);
  assert.throws(() => renderSegmentedControl({ label: "x", items: [...MODES, { value: "x", label: "X" }], selected: "light" }), RangeError);
});

test("clicking or arrowing moves the selection, reports it, and stops when released", () => {
  const fragment = mount(renderSegmentedControl({ label: "Mode", items: MODES, selected: "light" }));
  const seen = [];
  const release = wireSegmentedControls(fragment, (value) => seen.push(value));
  fireEvent(fragment.querySelector('[data-seg-value="system"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-value="system"]'), "click");
  assert.equal(fragment.querySelector('[aria-checked="true"]').getAttribute("data-seg-value"), "system");
  const key = fireEvent(fragment.querySelector('[data-seg-value="system"]'), "keydown", { key: "ArrowRight" });
  assert.equal(key.defaultPrevented, true);
  assert.equal(document.activeElement.getAttribute("data-seg-value"), "light", "wraps around");
  assert.deepEqual(seen, ["system", "light"], "a click on the checked segment reports nothing");
  release();
  fireEvent(fragment.querySelector('[data-seg-value="dark"]'), "click");
  assert.deepEqual(seen, ["system", "light"]);
});

test("a toggle is a switch row that flips and reports; a disabled one does not move", () => {
  const fragment = mount(renderToggle({ key: "matchReminders", label: "Match reminders", caption: HOSTILE }) + renderToggle({ key: "locked", label: "Locked", disabled: true }));
  const [live, locked] = fragment.querySelectorAll('[role="switch"]');
  assert.equal(live.getAttribute("aria-checked"), "false");
  assert.equal(fragment.querySelector(".g-toggle__caption").textContent, HOSTILE);
  const seen = [];
  wireToggles(fragment, (key, checked) => seen.push([key, checked]));
  fireEvent(live.querySelector(".g-toggle__knob"), "click");
  fireEvent(locked, "click");
  assert.equal(live.getAttribute("aria-checked"), "true");
  assert.equal(locked.getAttribute("aria-checked"), "false");
  assert.deepEqual(seen, [["matchReminders", true]]);
  assertCspSafe(fragment);
  assertStyled(fragment, "toggle.css");
});

test("the default button is an outline button of type button, and a form can ask for submit", () => {
  const plain = mount(renderButton({ label: "Skip" })).querySelector("button");
  assert.equal(plain.getAttribute("class"), "g-btn");
  assert.equal(plain.getAttribute("type"), "button");
  assert.equal(plain.hasAttribute("disabled"), false);
  assert.equal(plain.querySelector("svg"), null);
  assert.equal(mount(renderButton({ label: "Save", type: "submit" })).querySelector("button").getAttribute("type"), "submit");
});

test("a segmented control refuses what would leave it unusable", () => {
  const linked = [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP" }];
  assert.throws(() => renderSegmentedControl({ label: "x", items: linked, selected: "stats" }), /all links or all buttons/);
  assert.throws(() => renderSegmentedControl({ label: "x", items: MODES, selected: "auto" }), /selected/);
});

test("segment labels, values and data are escaped", () => {
  const items = [{ value: HOSTILE, label: HOSTILE }, { value: "b", label: "B" }];
  const fragment = mount(renderSegmentedControl({ label: HOSTILE, items, selected: HOSTILE, data: { owner: HOSTILE } }));
  const group = fragment.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), HOSTILE);
  assert.equal(group.getAttribute("data-owner"), HOSTILE);
  assert.equal(fragment.querySelector('[role="radio"]').getAttribute("data-seg-value"), HOSTILE);
  assert.equal(fragment.querySelector('[role="radio"]').textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
});

const CHOICES = [["a", true, false], ["b", false, true], ["c", false, false], ["d", false, true]];

function mountChoices(onChange) {
  const choices = CHOICES.map(([value, on, disabled]) => `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}"${disabled ? ' aria-disabled="true"' : ""} data-choice="${value}">${value}</button>`).join("");
  const fragment = mount(`<div role="radiogroup" aria-label="Choice">${choices}</div>`);
  wireRadioGroups(fragment, { group: '[role="radiogroup"]', item: "[data-choice]", attribute: "data-choice", onChange });
  const at = (value) => fragment.querySelector(`[data-choice="${value}"]`);
  const press = (from, key, init = {}) => fireEvent(at(from), "keydown", { key, ...init });
  return { at, press, fragment };
}

test("arrows, Home and End move through a radio group, skip disabled items and wrap", () => {
  const seen = [];
  const { at, press } = mountChoices((value) => seen.push(value));
  const checked = () => at("a").parentNode.querySelectorAll('[aria-checked="true"]').map((item) => item.getAttribute("data-choice"));

  assert.equal(press("a", "ArrowRight").defaultPrevented, true);
  assert.deepEqual(checked(), ["c"], "b is disabled");
  assert.equal(document.activeElement, at("c"));
  assert.equal(at("c").getAttribute("tabindex"), "0");
  assert.equal(at("a").getAttribute("tabindex"), "-1");

  press("c", "ArrowRight");
  assert.deepEqual(checked(), ["a"], "d is disabled, so the walk wraps to a");
  press("a", "ArrowLeft");
  assert.deepEqual(checked(), ["c"], "and back the other way");
  press("c", "Home");
  assert.deepEqual(checked(), ["a"]);
  press("a", "End");
  assert.deepEqual(checked(), ["c"], "the last item that can be chosen");
  press("c", "ArrowDown");
  press("a", "ArrowUp");
  assert.deepEqual(seen, ["c", "a", "c", "a", "c", "a", "c"]);
});

test("a disabled item cannot be clicked, and a key that is not ours is left to the browser", () => {
  const seen = [];
  const { at, press } = mountChoices((value) => seen.push(value));
  fireEvent(at("b"), "click");
  assert.equal(at("b").getAttribute("aria-checked"), "false");
  assert.equal(at("a").getAttribute("aria-checked"), "true");

  for (const init of [{ key: "Tab" }, { key: "Enter" }, { key: "ArrowRight", altKey: true }, { key: "ArrowRight", ctrlKey: true }, { key: "Home", metaKey: true }]) {
    const event = press("a", init.key, init);
    assert.equal(event.defaultPrevented, false, JSON.stringify(init));
  }
  assert.deepEqual(seen, []);
  assert.equal(at("a").getAttribute("aria-checked"), "true");
});

test("arrowing from a focused disabled item still lands on one that can be chosen", () => {
  const { at, press } = mountChoices(() => {});
  press("b", "ArrowRight");
  assert.equal(at("c").getAttribute("aria-checked"), "true");
  assert.equal(document.activeElement, at("c"));
});

test("a click moves the roving tabindex, and groups under one root stay apart", () => {
  const group = (name) => `<div role="radiogroup" aria-label="${name}" data-group="${name}"><button type="button" role="radio" aria-checked="true" tabindex="0" data-choice="one">1</button><button type="button" role="radio" aria-checked="false" tabindex="-1" data-choice="two">2</button></div>`;
  const fragment = mount(group("first") + group("second"));
  const seen = [];
  wireRadioGroups(fragment, { group: '[role="radiogroup"]', item: "[data-choice]", attribute: "data-choice", onChange: (value, groupElement) => seen.push([value, groupElement.getAttribute("data-group")]) });
  const second = fragment.querySelector('[data-group="second"]');
  fireEvent(second.querySelector('[data-choice="two"]'), "click");
  assert.deepEqual(seen, [["two", "second"]]);
  assert.deepEqual(second.querySelectorAll("button").map((item) => item.getAttribute("tabindex")), ["-1", "0"]);
  const first = fragment.querySelector('[data-group="first"]');
  assert.deepEqual(first.querySelectorAll("button").map((item) => item.getAttribute("aria-checked")), ["true", "false"]);
});

test("an item outside any group is left alone", () => {
  const fragment = mount('<button type="button" role="radio" aria-checked="false" tabindex="-1" data-choice="x">x</button>');
  const seen = [];
  wireRadioGroups(fragment, { group: '[role="radiogroup"]', item: "[data-choice]", attribute: "data-choice", onChange: (value) => seen.push(value) });
  fireEvent(fragment.querySelector("button"), "click");
  const key = fireEvent(fragment.querySelector("button"), "keydown", { key: "ArrowRight" });
  assert.deepEqual(seen, []);
  assert.equal(key.defaultPrevented, false);
});

test("a toggle starts where it is told, flips back on the next click, and stops when released", () => {
  const fragment = mount(renderToggle({ key: "digest", label: "Digest", checked: true }));
  const button = fragment.querySelector("button");
  assert.equal(button.getAttribute("aria-checked"), "true");
  assert.equal(fragment.querySelector(".g-toggle__caption"), null, "no caption, no empty line");
  assert.equal(button.hasAttribute("disabled"), false);
  const seen = [];
  const release = wireToggles(fragment, (key, checked, source) => seen.push([key, checked, source === button]));
  fireEvent(button, "click");
  fireEvent(button, "click");
  assert.deepEqual(seen, [["digest", false, true], ["digest", true, true]]);
  assert.equal(button.getAttribute("aria-checked"), "true");
  release();
  fireEvent(button, "click");
  assert.equal(seen.length, 2);
  assert.equal(button.getAttribute("aria-checked"), "true");
});

test("toggle labels and keys are escaped and the track is hidden from a screen reader", () => {
  const fragment = mount(renderToggle({ key: HOSTILE, label: HOSTILE }));
  assert.equal(fragment.querySelector("button").getAttribute("data-toggle-key"), HOSTILE);
  assert.equal(fragment.querySelector(".g-toggle__label").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-toggle__track").getAttribute("aria-hidden"), "true");
  assert.equal(fragment.querySelector(".g-toggle__knob").getAttribute("aria-hidden"), "true");
  assertCspSafe(fragment);
});

const HIDDEN_SCRIPT = ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "\x01javascript:alert(1)"];

test("a button needs a label: an icon draws nothing a screen reader hears", () => {
  assert.throws(() => renderButton({}), /label/);
  assert.throws(() => renderButton({ label: "", icon: "check", kind: "primary" }), /label/);
});

test("a button link refuses a javascript: href, however it is written", () => {
  for (const href of HIDDEN_SCRIPT) assert.throws(() => renderButton({ label: "Go", href }), /javascript:/, JSON.stringify(href));
});

test("a segmented control needs a label, and link segments refuse a javascript: href", () => {
  assert.throws(() => renderSegmentedControl({ items: MODES, selected: "light" }), /label/);
  assert.throws(() => renderSegmentedControl({ label: "", items: MODES, selected: "light" }), /label/);
  for (const href of HIDDEN_SCRIPT) {
    const items = [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP", href }];
    assert.throws(() => renderSegmentedControl({ label: "View", items, selected: "stats" }), /javascript:/, JSON.stringify(href));
  }
});

test("link segments may have no current page; radio segments may not have none checked", () => {
  const links = [{ value: "stats", label: "Stats", href: "#/a" }, { value: "spp", label: "SPP", href: "#/b" }];
  const nav = mount(renderSegmentedControl({ label: "View", items: links, selected: "" }));
  assert.equal(nav.querySelector("[aria-current]"), null);
  assert.equal(nav.querySelectorAll("a").length, 2);
  assertCspSafe(nav);
  assert.throws(() => renderSegmentedControl({ label: "Mode", items: MODES, selected: "" }), /selected/);
});

test("a toggle needs a key, which is all its wiring reports, and a label", () => {
  assert.throws(() => renderToggle({ label: "Digest" }), /key/);
  assert.throws(() => renderToggle({ key: "", label: "Digest" }), /key/);
  assert.throws(() => renderToggle({ key: "digest" }), /label/);
  assert.throws(() => renderToggle({ key: "digest", label: "" }), /label/);
});

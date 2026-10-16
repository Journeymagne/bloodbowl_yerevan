import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { renderButton } from "../src/ui/button.mjs";
import { renderOptionCard, renderOptionList, wireOptionLists } from "../src/ui/option-card.mjs";
import { renderProgressDots, renderStepDots } from "../src/ui/progress-dots.mjs";
import { renderSheet, wireSheets } from "../src/ui/sheet.mjs";

const OPTIONS = [
  { value: "primary", title: "Primary skill", sub: "Choose from the list", pill: "6 SPP" },
  { value: "secondary", title: "Secondary skill", sub: "Not enough SPP: 2", pill: "10 SPP", disabled: true },
  { value: "stat", title: "Characteristic", sub: "Roll a D8", pill: "14 SPP" },
];

test("progress dots count what is done and say it in words", () => {
  const fragment = mount(renderProgressDots({ total: 6, done: 2, label: "Advancements" }));
  assert.equal(fragment.querySelectorAll(".g-progress__dot").length, 6);
  assert.equal(fragment.querySelectorAll(".g-progress__dot--on").length, 2);
  assert.equal(fragment.querySelector(".g-progress__dots").getAttribute("aria-hidden"), "true");
  assert.equal(fragment.querySelector(".g-progress__caption").textContent, "Advancements: 2 of 6");
  assert.equal(mount(renderProgressDots({ total: 6, done: 9, label: "x" })).querySelectorAll(".g-progress__dot--on").length, 6);
  assert.equal(mount(renderProgressDots({ total: 6, done: -1, label: "x" })).querySelectorAll(".g-progress__dot--on").length, 0);
  assertCspSafe(fragment);
  assertStyled(fragment, "progress-dots.css");
});

test("step dots mark done, current and ahead", () => {
  const fragment = mount(renderStepDots({ current: 3, total: 4 }));
  assert.equal(fragment.querySelector(".g-steps").getAttribute("aria-label"), "Step 3 of 4");
  assert.equal(fragment.querySelectorAll(".g-steps__dot").length, 4);
  assert.equal(fragment.querySelectorAll(".g-steps__dot--done").length, 2);
  assert.equal(fragment.querySelectorAll(".g-steps__dot--now").length, 1);
  assertStyled(fragment, "progress-dots.css");
});

test("a sheet is a labelled native dialog with back, close, steps, body and one footer", () => {
  const fragment = mount(renderSheet({
    id: "adv", title: "Advancement", sub: HOSTILE, step: { current: 2, total: 4 }, canGoBack: true,
    bodyHtml: renderOptionList({ label: "Type", options: OPTIONS, selected: "primary" }),
    footHtml: renderButton({ label: "Next", kind: "primary" }),
  }));
  const dialog = fragment.querySelector("dialog.g-sheet");
  assert.equal(dialog.id, "adv");
  assert.equal(dialog.hasAttribute("open"), false, "patchWithModal opens it");
  assert.equal(dialog.getAttribute("aria-labelledby"), "adv-title");
  assert.equal(fragment.querySelector("#adv-title").textContent, "Advancement");
  assert.equal(fragment.querySelector(".g-sheet__sub").textContent, HOSTILE);
  assert.equal(fragment.querySelector("[data-sheet-back]").getAttribute("aria-label"), "Back");
  assert.equal(fragment.querySelector("[data-sheet-close]").getAttribute("aria-label"), "Close");
  assert.equal(fragment.querySelector(".g-steps").getAttribute("aria-label"), "Step 2 of 4");
  assert.equal(fragment.querySelectorAll(".g-sheet__foot button").length, 1);
  assertCspSafe(fragment);
  assertStyled(fragment, "sheet.css", "button.css", "progress-dots.css", "option-card.css");
});

test("no back button on the first step, no footer without one", () => {
  const fragment = mount(renderSheet({ id: "s1", title: "Missed match", bodyHtml: "<p>x</p>" }));
  assert.equal(fragment.querySelector("[data-sheet-back]"), null);
  assert.ok(fragment.querySelector(".g-sheet__spacer"));
  assert.equal(fragment.querySelector(".g-sheet__foot"), null);
  assert.equal(fragment.querySelector(".g-steps"), null);
});

test("closing by button, backdrop or Escape goes through one path; back is its own", () => {
  const fragment = mount(renderSheet({ id: "s2", title: "T", bodyHtml: "<p>inside</p>", canGoBack: true }));
  const dialog = fragment.querySelector("dialog");
  const closed = [];
  const back = [];
  wireSheets(fragment, { onClose: (id) => closed.push(id), onBack: (id) => back.push(id) });
  dialog.showModal();
  fireEvent(fragment.querySelector("[data-sheet-back]"), "click");
  assert.deepEqual(back, ["s2"]);
  fireEvent(fragment.querySelector(".g-sheet__body p"), "click");
  assert.equal(dialog.open, true, "a click inside is not the backdrop");
  fireEvent(dialog, "click");
  assert.equal(dialog.open, false);
  dialog.showModal();
  const escape = fireEvent(fragment.querySelector(".g-sheet__body p"), "keydown", { key: "Escape" });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(dialog.open, false);
  dialog.showModal();
  fireEvent(fragment.querySelector("[data-sheet-close] svg"), "click");
  assert.equal(dialog.open, false);
  assert.deepEqual(closed, ["s2", "s2", "s2"]);
});

test("an option list is a radio group; a disabled option stays focusable with its reason", () => {
  const fragment = mount(renderOptionList({ label: "Type", options: OPTIONS, selected: "primary" }));
  const cards = fragment.querySelectorAll('[role="radio"]');
  assert.equal(fragment.querySelector(".g-options").getAttribute("aria-label"), "Type");
  assert.deepEqual(cards.map((card) => card.getAttribute("aria-checked")), ["true", "false", "false"]);
  assert.equal(cards[1].getAttribute("aria-disabled"), "true");
  assert.equal(cards[1].hasAttribute("disabled"), false);
  assert.equal(cards[1].querySelector(".g-option__sub").textContent, "Not enough SPP: 2");
  assert.equal(cards[2].querySelector(".g-option__pill").textContent, "14 SPP");
  assertStyled(fragment, "option-card.css");
});

test("choosing an option moves the check and skips disabled ones", () => {
  const fragment = mount(renderOptionList({ label: "Type", options: OPTIONS, selected: "primary" }));
  const seen = [];
  wireOptionLists(fragment, (value) => seen.push(value));
  fireEvent(fragment.querySelector('[data-option-value="secondary"]'), "click");
  fireEvent(fragment.querySelector('[data-option-value="primary"]'), "keydown", { key: "ArrowDown" });
  assert.deepEqual(seen, ["stat"], "the disabled card is skipped by click and by arrow");
  assert.equal(fragment.querySelector('[aria-checked="true"]').getAttribute("data-option-value"), "stat");
});

test("a radio option card shows its dot", () => {
  const fragment = mount(renderOptionCard({ value: "miss", title: "Miss next game", radio: true, selected: true }));
  assert.ok(fragment.querySelector(".g-option__radio"));
  assertStyled(fragment, "option-card.css");
});

// What follows is beyond the brief's own tests.

test("progress dots escape the label, clamp the caption too and tolerate an empty row", () => {
  const fragment = mount(renderProgressDots({ total: 6, done: 9, label: HOSTILE }));
  assert.equal(fragment.querySelector(".g-progress__caption").textContent, `${HOSTILE}: 6 of 6`);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
  assert.equal(mount(renderProgressDots({ total: 0, done: 3, label: "x" })).querySelectorAll(".g-progress__dot").length, 0);
});

test("a wide sheet carries its modifier; the title is escaped and an id that is not a plain name is refused", () => {
  const fragment = mount(renderSheet({ id: "wide-1", title: HOSTILE, bodyHtml: "<p>x</p>", wide: true }));
  assert.ok(fragment.querySelector("dialog").classList.contains("g-sheet--wide"));
  assert.equal(fragment.querySelector("#wide-1-title").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-sheet__sub"), null, "no empty subtitle line");
  assertCspSafe(fragment);
  assertStyled(fragment, "sheet.css", "button.css");
  assert.equal(mount(renderSheet({ id: "n", title: "T", bodyHtml: "<p>x</p>" })).querySelector("dialog").classList.contains("g-sheet--wide"), false);
  for (const id of ['a" onclick="x', "a b", "a.b", "1a", ""]) assert.throws(() => renderSheet({ id, title: "T", bodyHtml: "" }), /id/, id);
  assert.throws(() => renderSheet({ id: "ok", title: "", bodyHtml: "" }), /title/);
});

test("a sheet's close and back buttons are plain buttons that stay out of the form", () => {
  const fragment = mount(renderSheet({ id: "s4", title: "T", bodyHtml: "<p>x</p>", canGoBack: true }));
  for (const button of fragment.querySelectorAll(".g-sheet__head button")) assert.equal(button.getAttribute("type"), "button");
  assert.deepEqual(fragment.querySelector(".g-sheet__head").childNodes.map((node) => node.getAttribute("class")), ["g-icon-btn", "g-sheet__titles", "g-icon-btn"]);
});

test("other keys leave a sheet alone, an Escape already handled inside is not taken twice, and release unwires", () => {
  const fragment = mount(renderSheet({ id: "s3", title: "T", bodyHtml: '<button type="button" id="inner">x</button>', canGoBack: true }));
  const dialog = fragment.querySelector("dialog");
  const inner = fragment.querySelector("#inner");
  const closed = [];
  const off = wireSheets(fragment, { onClose: (id) => closed.push(id) });
  dialog.showModal();
  assert.equal(fireEvent(inner, "keydown", { key: "Enter" }).defaultPrevented, false);
  assert.equal(dialog.open, true);
  inner.addEventListener("keydown", (event) => event.preventDefault());
  fireEvent(inner, "keydown", { key: "Escape" });
  assert.equal(dialog.open, true, "something inside already took the Escape");
  fireEvent(fragment.querySelector("[data-sheet-back]"), "click");
  assert.equal(dialog.open, true, "back does not close, and without onBack it is only a no-op");
  assert.deepEqual(closed, []);
  off();
  fireEvent(dialog, "click");
  fireEvent(fragment.querySelector("[data-sheet-close]"), "click");
  assert.equal(dialog.open, true, "released");
  assert.deepEqual(closed, []);
});

test("wireSheets needs no options, and a close or back button outside any sheet reports nothing", () => {
  const sheet = mount(renderSheet({ id: "s5", title: "T", bodyHtml: "<p>x</p>" }));
  wireSheets(sheet);
  sheet.querySelector("dialog").showModal();
  fireEvent(sheet.querySelector("[data-sheet-close]"), "click");
  assert.equal(sheet.querySelector("dialog").open, false);

  const stray = mount('<button type="button" data-sheet-close="">x</button><button type="button" data-sheet-back="">y</button>');
  const heard = [];
  wireSheets(stray, { onClose: (id) => heard.push(id), onBack: (id) => heard.push(id) });
  fireEvent(stray.querySelector("[data-sheet-close]"), "click");
  fireEvent(stray.querySelector("[data-sheet-back]"), "click");
  assert.deepEqual(heard, []);
});

test("a close request that is no keydown (the Android back gesture, Escape with focus on the body) closes through the same path, once", () => {
  const fragment = mount(renderSheet({ id: "s6", title: "T", bodyHtml: "<p>x</p>" }));
  const dialog = fragment.querySelector("dialog");
  const closed = [];
  const off = wireSheets(fragment, { onClose: (id) => closed.push(id) });
  dialog.showModal();
  const cancel = fireEvent(dialog, "cancel", { bubbles: false });
  assert.equal(cancel.defaultPrevented, true, "the browser is not left to close it behind the screen's back");
  assert.equal(dialog.open, false);
  assert.deepEqual(closed, ["s6"]);
  dialog.showModal();
  const escape = fireEvent(fragment.querySelector(".g-sheet__body p"), "keydown", { key: "Escape" });
  assert.equal(escape.defaultPrevented, true, "a browser told not to close sends no cancel after it");
  assert.deepEqual(closed, ["s6", "s6"], "an Escape is one report");
  off();
  dialog.showModal();
  const late = fireEvent(dialog, "cancel", { bubbles: false });
  assert.equal(late.defaultPrevented, false);
  assert.equal(dialog.open, true, "released");
  assert.deepEqual(closed, ["s6", "s6"]);
});

test("a cancel on a dialog that is not a sheet is left to its own screen", () => {
  const fragment = mount(`${renderSheet({ id: "s7", title: "T", bodyHtml: "<p>x</p>" })}<dialog id="other" class="app-dialog"><p>y</p></dialog>`);
  const other = fragment.querySelector("#other");
  const closed = [];
  wireSheets(fragment, { onClose: (id) => closed.push(id) });
  other.showModal();
  const cancel = fireEvent(other, "cancel", { bubbles: false });
  assert.equal(cancel.defaultPrevented, false);
  assert.equal(other.open, true);
  assert.deepEqual(closed, []);
});

test("an option card escapes what it shows, puts the radio first and the pill last, and draws nothing it was not given", () => {
  const fragment = mount(renderOptionCard({ value: HOSTILE, title: HOSTILE, sub: HOSTILE, pill: HOSTILE, radio: true }));
  const card = fragment.querySelector(".g-option");
  assert.equal(card.getAttribute("type"), "button");
  assert.equal(card.getAttribute("role"), "radio");
  assert.equal(card.getAttribute("aria-checked"), "false");
  assert.equal(card.getAttribute("data-option-value"), HOSTILE);
  assert.equal(card.hasAttribute("tabindex"), false, "a card on its own is in the tab order as any button is");
  assert.equal(card.hasAttribute("aria-disabled"), false);
  assert.deepEqual(card.childNodes.map((node) => node.getAttribute("class")), ["g-option__radio", "g-option__text", "g-option__pill"]);
  assert.equal(card.querySelector(".g-option__radio").getAttribute("aria-hidden"), "true");
  assert.equal(card.querySelector(".g-option__title").textContent, HOSTILE);
  assert.equal(card.querySelector(".g-option__sub").textContent, HOSTILE);
  assert.equal(card.querySelector(".g-option__pill").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);

  const bare = mount(renderOptionCard({ value: "v", title: "T", selected: true, disabled: true })).querySelector(".g-option");
  assert.deepEqual(bare.childNodes.map((node) => node.getAttribute("class")), ["g-option__text"]);
  assert.equal(bare.querySelector(".g-option__sub"), null);
  assert.equal(bare.getAttribute("aria-checked"), "true");
  assert.equal(bare.getAttribute("aria-disabled"), "true");
  assert.equal(bare.hasAttribute("disabled"), false);
});

test("the list is entered at one card: the checked one, else the first available, else the first", () => {
  const tabs = (selected, options = OPTIONS) => mount(renderOptionList({ label: "Type", options, selected })).querySelectorAll("[data-option-value]").map((card) => card.getAttribute("tabindex"));
  assert.deepEqual(tabs("stat"), ["-1", "-1", "0"]);
  assert.deepEqual(tabs("secondary"), ["-1", "0", "-1"], "a checked card is the way in even when it is refused");
  assert.deepEqual(tabs(""), ["0", "-1", "-1"]);
  assert.deepEqual(tabs("nothing like it"), ["0", "-1", "-1"]);
  assert.deepEqual(tabs("", OPTIONS.slice(1)), ["-1", "0"], "the first available, not the first");
  assert.deepEqual(tabs("", [OPTIONS[1]]), ["0"], "everything refused still leaves a way in to read the reasons");
  const none = mount(renderOptionList({ label: "Type", options: OPTIONS, selected: "" })).querySelectorAll('[aria-checked="true"]');
  assert.equal(none.length, 0);
});

test("the list's selected value wins over a card's own flag, and only the first match is checked", () => {
  const fragment = mount(renderOptionList({ label: "Type", options: [{ ...OPTIONS[0], selected: true }, OPTIONS[2], OPTIONS[2]], selected: "stat" }));
  assert.deepEqual(fragment.querySelectorAll("[data-option-value]").map((card) => card.getAttribute("aria-checked")), ["false", "true", "false"]);
  assert.equal(mount(renderOptionList({ label: HOSTILE, options: OPTIONS, selected: "" })).querySelector(".g-options").getAttribute("aria-label"), HOSTILE);
});

test("an option list reports a change once, and release stops it", () => {
  const fragment = mount(renderOptionList({ label: "Type", options: OPTIONS, selected: "primary" }));
  const seen = [];
  const off = wireOptionLists(fragment, (value, list) => seen.push([value, list.getAttribute("aria-label")]));
  fireEvent(fragment.querySelector('[data-option-value="primary"]'), "click");
  fireEvent(fragment.querySelector('[data-option-value="stat"] .g-option__title'), "click");
  fireEvent(fragment.querySelector('[data-option-value="stat"]'), "click");
  assert.deepEqual(seen, [["stat", "Type"]], "the card already checked is no change");
  assert.equal(fragment.querySelector('[data-option-value="stat"]').getAttribute("tabindex"), "0");
  assert.equal(fragment.querySelector('[data-option-value="primary"]').getAttribute("tabindex"), "-1");
  off();
  fireEvent(fragment.querySelector('[data-option-value="primary"]'), "click");
  assert.equal(seen.length, 1);
});

test("the sheet and the dots speak Russian when the site does", () => {
  initLocale("ru");
  try {
    const fragment = mount(renderSheet({ id: "ru", title: "Улучшение", step: { current: 1, total: 3 }, canGoBack: true, bodyHtml: renderProgressDots({ total: 6, done: 2, label: "Улучшения" }) }));
    assert.equal(fragment.querySelector("[data-sheet-back]").getAttribute("aria-label"), "Назад");
    assert.equal(fragment.querySelector("[data-sheet-close]").getAttribute("aria-label"), "Закрыть");
    assert.equal(fragment.querySelector(".g-steps").getAttribute("aria-label"), "Шаг 1 из 3");
    assert.equal(fragment.querySelector(".g-progress__caption").textContent, "Улучшения: 2 из 6");
  } finally {
    initLocale("en");
  }
});

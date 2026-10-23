import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, valuesOf } from "./helpers/contrast.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { PALETTE_KEYS, THEME_MODES } from "../src/core/theme.mjs";
import { nextChoice, themePickerMarkup, wireThemePicker } from "../src/screens/settings/theme-picker.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const SHEET = "src/screens/settings/theme-picker.css";
const SHEETS = [SHEET, "segmented-control.css"];
const LANGUAGE = '<div class="g-seg g-seg--2" role="radiogroup" aria-label="L" data-seg-group="language"><button type="button" class="g-seg__item" role="radio" aria-checked="true" tabindex="0" data-seg-value="en">EN</button><button type="button" class="g-seg__item" role="radio" aria-checked="false" tabindex="-1" data-seg-value="ru">RU</button></div>';

test("a fixed mode shows its own palettes; system shows both, each named for its mode", () => {
  const light = mount(themePickerMarkup({ mode: "light", light: "ice", dark: "night" }));
  assert.deepEqual(light.querySelectorAll(".g-palettes").map((row) => row.getAttribute("data-palette-mode")), ["light"]);
  assert.equal(light.querySelector(".g-palettes").getAttribute("aria-label"), "Palette");
  const system = mount(themePickerMarkup({ mode: "system", light: "ice", dark: "night" }));
  assert.deepEqual(system.querySelectorAll(".g-palettes").map((row) => row.getAttribute("aria-label")), ["Palette for light mode", "Palette for dark mode"]);
  assert.equal(system.querySelector('[data-seg-group="mode"] [aria-checked="true"]').getAttribute("data-seg-value"), "system");
  assertCspSafe(system);
  assertStyled(system, ...SHEETS);
});

test("a card is a radio with a name and a mood, checked for the palette in use, drawn in its own colours", () => {
  const fragment = mount(themePickerMarkup({ mode: "dark", light: "grass", dark: "embers" }));
  const cards = fragment.querySelectorAll(".g-palette");
  assert.deepEqual(cards.map((card) => card.getAttribute("data-palette-key")), [...PALETTE_KEYS.dark]);
  assert.deepEqual(cards.map((card) => card.getAttribute("aria-checked")), ["false", "false", "true", "false"]);
  assert.equal(cards[2].querySelector(".g-palette__name").textContent, "Flames of Chaos");
  assert.equal(cards[2].querySelector(".g-palette__mood").textContent, "coal and fire");
  assert.equal(cards[2].querySelector("[data-palette-preview]").getAttribute("data-palette-preview"), "embers");
  assert.equal(cards[2].hasAttribute("data-palette-preview"), false, "the button itself stays in the page's palette");
});

test("a card in a fixed mode sets its palette and mode; in system it changes that mode's palette only", () => {
  const ice = { mode: "light", light: "ice", dark: "night" };
  assert.deepEqual(nextChoice(ice, { palette: { mode: "light", key: "imperial" } }), { mode: "light", light: "imperial", dark: "night" });
  assert.deepEqual(nextChoice({ ...ice, mode: "system" }, { palette: { mode: "dark", key: "abyss" } }), { mode: "system", light: "ice", dark: "abyss" });
  assert.deepEqual(nextChoice(ice, { mode: "dark" }), { mode: "dark", light: "ice", dark: "night" });
});

test("choosing a card or a mode reports the next choice; the language control is not the picker's", () => {
  const fragment = mount(themePickerMarkup({ mode: "light", light: "grass", dark: "night" }) + LANGUAGE);
  let current = { mode: "light", light: "grass", dark: "night" };
  const seen = [];
  wireThemePicker(fragment, { current: () => current, onChoice: (choice) => { seen.push(choice); current = choice; } });
  fireEvent(fragment.querySelector('[data-palette-key="parchment"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="system"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
  assert.deepEqual(seen, [{ mode: "light", light: "parchment", dark: "night" }, { mode: "system", light: "parchment", dark: "night" }]);
});

test("every palette has a name and a mood in both languages", () => {
  const dictionaries = [read("src/i18n/en.json"), read("src/i18n/ru.json")];
  for (const key of [...PALETTE_KEYS.light, ...PALETTE_KEYS.dark]) {
    for (const dictionary of dictionaries) {
      assert.ok(dictionary[`theme.palette.${key}`], key);
      assert.ok(dictionary[`theme.palette.${key}.mood`], `${key}.mood`);
    }
  }
  assertDictionaryCovers("src/screens/settings/theme-picker.mjs");
});

// What nextChoice is given by the markup is a name from a list; one that is not on it changes nothing.
test("a mode or a palette that is not one of the picker's changes nothing", () => {
  const choice = { mode: "dark", light: "ice", dark: "abyss" };
  assert.deepEqual(nextChoice(choice, { mode: "sepia" }), choice);
  assert.deepEqual(nextChoice(choice, { palette: { mode: "light", key: "abyss" } }), choice, "a dark palette is not a light one");
  assert.deepEqual(nextChoice(choice, { palette: { mode: "dark", key: "constructor" } }), choice);
  assert.deepEqual(nextChoice(choice, { palette: { mode: "twilight", key: "night" } }), choice);
  assert.deepEqual(nextChoice(choice, {}), choice);
  const given = { mode: "light", light: "ice", dark: "night" };
  nextChoice(given, { palette: { mode: "light", key: "imperial" } });
  assert.deepEqual(given, { mode: "light", light: "ice", dark: "night" }, "the choice it was given is not changed");
});

test("the mode is offered as light, dark, system; each has its label and its hint in both languages", () => {
  const fragment = mount(themePickerMarkup({ mode: "light", light: "grass", dark: "night" }));
  assert.deepEqual(fragment.querySelectorAll('[data-seg-group="mode"] [data-seg-value]').map((item) => item.getAttribute("data-seg-value")), [...THEME_MODES]);
  assert.deepEqual(fragment.querySelectorAll('[data-seg-group="mode"] [data-seg-value]').map((item) => item.textContent), ["Light", "Dark", "Match system"]);
  assert.equal(fragment.querySelector('[data-seg-group="mode"]').getAttribute("aria-label"), "Theme");
  const hints = { light: "Light theme", dark: "Dark theme, for evening matches", system: "The site follows your system: pick a palette for each mode" };
  for (const [mode, hint] of Object.entries(hints)) {
    assert.equal(mount(themePickerMarkup({ mode, light: "grass", dark: "night" })).querySelector(".g-theme__hint").textContent, hint, mode);
  }
  const ru = read("src/i18n/ru.json");
  for (const mode of THEME_MODES) {
    for (const key of [`theme.mode.${mode}`, `settings.modeHint.${mode}`]) {
      assert.ok(ru[key], `ru ${key}`);
      assert.ok(read("src/i18n/en.json")[key], `en ${key}`);
    }
  }
});

test("the preview is a picture, hidden from a screen reader", () => {
  const fragment = mount(themePickerMarkup({ mode: "light", light: "grass", dark: "night" }));
  for (const card of fragment.querySelectorAll(".g-palette")) {
    assert.equal(card.querySelector("[data-palette-preview]").getAttribute("aria-hidden"), "true");
    assert.equal(card.getAttribute("type"), "button");
    assert.equal(card.getAttribute("role"), "radio");
  }
});

test("a card is named for its palette and described by its mood, through ids of its own", () => {
  const system = mount(themePickerMarkup({ mode: "system", light: "ice", dark: "night" }));
  const cards = system.querySelectorAll(".g-palette");
  assert.equal(cards.length, 8);
  for (const card of cards) {
    const key = card.getAttribute("data-palette-key");
    assert.equal(card.getAttribute("aria-labelledby"), `palette-${key}-name`);
    assert.equal(card.getAttribute("aria-describedby"), `palette-${key}-mood`);
    assert.ok(system.querySelector(`#palette-${key}-name`) === card.querySelector(".g-palette__name"), `${key}: the name is what names it`);
    assert.ok(system.querySelector(`#palette-${key}-mood`) === card.querySelector(".g-palette__mood"), `${key}: the mood is what describes it`);
  }
  const ids = system.querySelectorAll("[id]").map((node) => node.getAttribute("id"));
  assert.equal(new Set(ids).size, ids.length, "no id twice, with both rows drawn");
  assert.equal(ids.length, 16);
  assertCspSafe(system);
});

test("one card is in the tab order in each row, the checked one", () => {
  const system = mount(themePickerMarkup({ mode: "system", light: "imperial", dark: "dungeon" }));
  for (const row of system.querySelectorAll(".g-palettes")) {
    const stops = row.querySelectorAll(".g-palette").filter((card) => card.getAttribute("tabindex") === "0");
    assert.equal(stops.length, 1, row.getAttribute("data-palette-mode"));
    assert.equal(stops[0].getAttribute("aria-checked"), "true");
  }
  // A choice the table does not know still leaves the row reachable by keyboard.
  const odd = mount(themePickerMarkup({ mode: "light", light: "nope", dark: "night" }));
  assert.equal(odd.querySelectorAll(".g-palette").filter((card) => card.getAttribute("tabindex") === "0").length, 1);
});

test("the arrow keys move through the cards of a row and through the modes, each reporting its own choice", () => {
  const fragment = mount(themePickerMarkup({ mode: "system", light: "grass", dark: "night" }) + LANGUAGE);
  let current = { mode: "system", light: "grass", dark: "night" };
  const seen = [];
  wireThemePicker(fragment, { current: () => current, onChoice: (choice) => { seen.push(choice); current = choice; } });
  const lightRow = fragment.querySelector('[data-palette-mode="light"]');
  const darkRow = fragment.querySelector('[data-palette-mode="dark"]');
  const press = (target, key) => fireEvent(target, "keydown", { key });
  press(lightRow.querySelector('[data-palette-key="grass"]'), "ArrowRight");
  press(darkRow.querySelector('[data-palette-key="night"]'), "ArrowLeft");
  press(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="system"]'), "ArrowLeft");
  press(fragment.querySelector('[data-seg-group="language"] [data-seg-value="en"]'), "ArrowRight");
  assert.deepEqual(seen, [
    { mode: "system", light: "parchment", dark: "night" },
    { mode: "system", light: "parchment", dark: "abyss" },
    { mode: "dark", light: "parchment", dark: "abyss" },
  ]);
  assert.equal(lightRow.querySelector('[aria-checked="true"]').getAttribute("data-palette-key"), "parchment");
  assert.equal(darkRow.querySelector('[aria-checked="true"]').getAttribute("data-palette-key"), "abyss");
});

test("wireThemePicker gives its listeners back", () => {
  const fragment = mount(themePickerMarkup({ mode: "light", light: "grass", dark: "night" }));
  const seen = [];
  const release = wireThemePicker(fragment, { current: () => ({ mode: "light", light: "grass", dark: "night" }), onChoice: (choice) => seen.push(choice) });
  release();
  fireEvent(fragment.querySelector('[data-palette-key="ice"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="dark"]'), "click");
  assert.deepEqual(seen, []);
});

test("a click on the card already chosen reports nothing", () => {
  const fragment = mount(themePickerMarkup({ mode: "light", light: "grass", dark: "night" }));
  const seen = [];
  wireThemePicker(fragment, { current: () => ({ mode: "light", light: "grass", dark: "night" }), onChoice: (choice) => seen.push(choice) });
  fireEvent(fragment.querySelector('[data-palette-key="grass"]'), "click");
  fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="light"]'), "click");
  assert.deepEqual(seen, []);
});

test("the cards sit two to a row, the mood on one line, and the whole thing is styled with tokens", () => {
  const css = readFileSync(new URL(`../${SHEET}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual(valuesOf(SHEET, ".g-palettes", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(SHEET, ".g-palettes", "gap"), ["var(--space-10)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-palette", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(SHEET, '.g-palette[aria-checked="true"]', "box-shadow"), ["inset 0 0 0 2px var(--accent), 0 0 0 2px var(--accent)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-palette__mood", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(SHEET, ".g-palette__mood", "text-overflow"), ["ellipsis"]);
  assert.match(valuesOf(SHEET, ".g-palette__mood", "font").at(-1), /^400 11px\//);
  assert.deepEqual(valuesOf(SHEET, ".g-theme .g-seg__item", "min-height"), ["var(--size-touch)"], "a segment is a tap target");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "colours come from the tokens, the preview's from its own palette's");
  assert.doesNotMatch(css, /\brgba?\(/, "no colour of its own");
});

test("the preview wears its own palette's header, page, surface, ink, muted, accent, tint and line", () => {
  const used = (selector, property) => valuesOf(SHEET, selector, property).at(-1);
  assert.equal(used(".g-palette__preview", "background"), "var(--page)");
  assert.equal(used(".g-palette__bar", "background"), "var(--header)");
  assert.equal(used(".g-palette__crest", "background"), "var(--crest-gold)");
  assert.equal(used(".g-palette__sheet", "background"), "var(--surface)");
  assert.equal(used(".g-palette__line--ink", "background"), "var(--ink)");
  assert.equal(used(".g-palette__line--muted", "background"), "var(--muted)");
  assert.equal(used(".g-palette__chip--accent", "background"), "var(--accent)");
  assert.equal(used(".g-palette__chip--tint", "background"), "var(--accent-tint)");
  assert.equal(used(".g-palette__preview", "border-bottom"), "1px solid var(--line)");
});

test("the name and the mood are readable on the card, in every palette", () => {
  assertContrast(valuesOf(SHEET, ".g-palette__name", "color").at(-1), ["--surface"], 4.5, { what: ".g-palette__name" });
  assertContrast(valuesOf(SHEET, ".g-palette__mood", "color").at(-1), ["--surface"], 4.5, { what: ".g-palette__mood" });
  assertContrast(valuesOf(SHEET, ".g-theme__caption", "color").at(-1), ["--page", "--surface"], 4.5, { what: ".g-theme__caption" });
  assertContrast(valuesOf(SHEET, ".g-theme__hint", "color").at(-1), ["--page", "--surface"], 4.5, { what: ".g-theme__hint" });
});

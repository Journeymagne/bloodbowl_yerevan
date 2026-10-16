import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { ICON_NAMES, icon } from "../src/ui/icons.mjs";
import { classNames, dataAttributes } from "../src/ui/markup.mjs";
import { HOSTILE, assertCspSafe, assertStyled, mount } from "./helpers/ui.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const uiFiles = readdirSync(new URL("../src/ui/", import.meta.url));

test("every component stylesheet reaches the page", () => {
  const styles = read("src/styles.css");
  const sheets = uiFiles.filter((name) => name.endsWith(".css"));
  assert.ok(sheets.includes("base.css"));
  for (const sheet of sheets) assert.ok(styles.includes(`@import url("ui/${sheet}");`), sheet);
});

test("every key src/ui asks t() for exists in both dictionaries", () => {
  const en = JSON.parse(read("src/i18n/en.json"));
  const ru = JSON.parse(read("src/i18n/ru.json"));
  for (const file of uiFiles.filter((name) => name.endsWith(".mjs"))) {
    for (const [, key] of read(`src/ui/${file}`).matchAll(/\bt\(\s*"([^"]+)"/g)) {
      assert.ok(en[key], `${file}: en ${key}`);
      assert.ok(ru[key], `${file}: ru ${key}`);
    }
  }
});

test("data attributes are dashed, escaped and skip empty values", () => {
  assert.equal(dataAttributes({ playerId: "p1", note: '"<x>"', off: false, none: null, gone: undefined, n: 0 }),
    ' data-player-id="p1" data-note="&quot;&lt;x&gt;&quot;" data-n="0"');
  assert.equal(dataAttributes(), "");
});

test("classNames keeps only what is there", () => {
  assert.equal(classNames("g-btn", false, null, undefined, "", "g-btn--block"), "g-btn g-btn--block");
});

test("icons are decorative stroke SVGs and an unknown one is a bug", () => {
  for (const name of ICON_NAMES) {
    const fragment = mount(icon(name, 14));
    const svg = fragment.querySelector("svg.g-icon");
    assert.equal(svg.getAttribute("aria-hidden"), "true", name);
    assert.equal(svg.getAttribute("stroke"), "currentColor", name);
    assert.equal(svg.getAttribute("width"), "14", name);
    assertCspSafe(fragment);
    assertStyled(fragment);
  }
  assert.throws(() => icon("rocket"), /unknown icon/);
  // A name Object.prototype owns is no more an icon than a name nobody wrote.
  assert.throws(() => icon("toString"), /unknown icon/);
});

test("the kit parses hostile text back as text, in the page, and refuses what the CSP refuses", () => {
  const fragment = mount(`<span class="g-x"${dataAttributes({ note: HOSTILE })}></span>`);
  assert.equal(fragment.querySelector("span").getAttribute("data-note"), HOSTILE);
  assert.ok(fragment.querySelector("span").isConnected);
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);

  assert.throws(() => assertCspSafe(mount('<p style="color: red"></p>')), /style attribute/);
  assert.throws(() => assertCspSafe(mount('<button onclick="go()"></button>')), /onclick/);
  assert.throws(() => assertStyled(mount('<i class="g-icon g-nowhere"></i>')), /\.g-nowhere is not styled/);
  assert.doesNotThrow(() => assertStyled(mount('<i class="g-icon g-sr-only"></i>')));
});

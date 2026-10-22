import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { bootPage } from "./helpers/boot-page.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/**
 * Stage 13, Task 3: the 2.x classes the 3.0 screens still drew, styled only by the 2.x tables of src/styles/ that the
 * second wave deletes. Their 3.0 places: the frame's `.g-loading` and `.g-skip`, the kit's `.g-sr-only`, the toasts'
 * `.g-toasts` and `.g-toast` (ui/toast.css), and a callout for a page that could not load.
 */
const LEGACY = ["loading", "empty-state", "sr-only", "skip-link", "toast", "toast-region", "toast-info", "toast-error"];

/**
 * Every script under src, as a path from the root of the repository. No 2.x module is left out (pre-flight L28): the
 * 2.x pages of games went with the 3.0 match page (Task 5, `game.mjs`) and with 09c (`my-games.mjs`).
 */
const scripts = () => readdirSync(new URL("../src/", import.meta.url), { recursive: true })
  .map((name) => `src/${name.split("\\").join("/")}`)
  .filter((file) => /\.m?js$/.test(file));

/** The string literals in a piece of code: what classList and classNames are handed. */
const literals = (code) => [...code.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map(([, , text]) => text);

/**
 * The class names a source writes: in `class="…"` (markup and template strings), in what `className` is set to, and
 * in the literals handed to `classList.add|remove|toggle|replace` and to `classNames(…)`. A template's `${…}` is no
 * name of its own; the literals inside it are.
 */
function classWords(source) {
  const lists = [
    ...[...source.matchAll(/\bclass="([^"]*)"/g)].map(([, value]) => value),
    ...[...source.matchAll(/\bclassName\s*=\s*(["'`])((?:(?!\1).)*)\1/g)].map(([, , value]) => value),
    ...[...source.matchAll(/\bclassList\.(?:add|remove|toggle|replace)\(([^)]*)\)/g)].flatMap(([, args]) => literals(args)),
    ...[...source.matchAll(/\bclassNames\(([^)]*)\)/g)].flatMap(([, args]) => literals(args)),
  ];
  return lists.flatMap((list) => list.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)).filter(Boolean);
}

test("the class finder sees a 2.x name wherever code writes one, and none of 3.0's", () => {
  const found = (source) => classWords(source).filter((word) => LEGACY.includes(word));
  assert.deepEqual(found('<div class="loading">'), ["loading"]);
  assert.deepEqual(found('view.innerHTML = `<div class="empty-state">${t("x")}</div>`;'), ["empty-state"]);
  assert.deepEqual(found("node.className = `toast toast-${tone}`;"), ["toast"]);
  assert.deepEqual(found('region.className = "toast-region";'), ["toast-region"]);
  assert.deepEqual(found('node.classList.add("sr-only", "x");'), ["sr-only"]);
  assert.deepEqual(found('classNames("g-x", busy && "skip-link")'), ["skip-link"]);
  for (const clean of ['<p class="g-loading" role="status">', 'node.className = `g-toast g-toast--${tone}`;', '<span class="g-sr-only">',
    '<img loading="lazy" alt="">', 't("myTeams.loadingTeams")', '<button class="g-skip" type="button">', 'region.className = "g-toasts";']) {
    assert.deepEqual(found(clean), [], clean);
  }
});

test("a 3.0 screen draws no 2.x class", () => {
  for (const file of [...scripts(), "index.html"]) {
    const drawn = classWords(read(file)).filter((word) => LEGACY.includes(word));
    assert.deepEqual(drawn, [], `${file} draws ${drawn.join(", ")}`);
  }
});

// Pre-flight L28: the two calls lit 2.x's sidebar and marked a section nobody reads (components/page-chrome.mjs).
test("no 3.0 module asks for the 2.x page chrome", () => {
  for (const file of scripts()) {
    assert.doesNotMatch(read(file), /from\s+["'][^"']*components\/page-chrome\.mjs["']/, file);
  }
});

// The app's own last word, when the site's data cannot be read: 3.0's callout, not the 2.x empty state.
test("a page whose data could not be read says so in a 3.0 callout", async () => {
  const api = installFakeApi();
  const { document } = bootPage(api, { hash: "#/" });
  api.reply("GET public/data.en.json?v=dev", 404, {});
  const errors = [];
  const report = console.error;
  console.error = (error) => errors.push(error);
  try {
    await import("../src/app.js");
    for (let turn = 0; turn < 20; turn += 1) await new Promise((resolve) => { setImmediate(resolve); });
  } finally {
    console.error = report;
  }
  const said = document.querySelector("#app-view .g-callout.g-callout--danger");
  assert.ok(said, "a danger callout in the view");
  assert.equal(said.querySelector(".g-callout__title").textContent, JSON.parse(read("src/i18n/en.json"))["app.dataLoadError"]);
  assert.equal(document.querySelector("#app-view .empty-state"), null);
  assert.match(String(errors[0]?.message), /Reference data for "en" is missing \(404\)/);
});

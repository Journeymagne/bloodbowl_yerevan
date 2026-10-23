import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

// Pre-flight L28: the two calls lit 2.x's sidebar and marked a section nobody reads (components/page-chrome.mjs). Once
// no 3.0 module asked for it, the module went (Task 23), with the 2.x crest only it drew, the context line only «My
// games» wrote, and the roster domain's barrel, which nothing ever imported.
test("the 2.x page chrome and the modules nothing imports are gone, and no module asks for them", () => {
  const gone = ["src/components/page-chrome.mjs", "src/components/matchday.mjs", "src/components/games/context.mjs", "src/domain/roster/index.mjs"];
  for (const file of gone) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  for (const file of scripts()) {
    assert.doesNotMatch(read(file), /from\s+["'][^"']*components\/(page-chrome|matchday|games\/context)\.mjs["']/, file);
  }
});

// What test/legacy-screens.test.mjs kept out until it went with 2.x's stylesheets (Task 23; review of stage 13): the 2.x
// post-match, its screen and parts, the checklist layout, the admin's manual result of the game page, the game page's
// panels, the roster editor and its parts, the 2.x season and administration screens. A merge of a branch from before
// 3.0 that brings one back fails here, whatever else stays green.
test("the 2.x screens and parts are gone and stay gone", () => {
  const gone = [
    "src/screens/games", "src/screens/games/post-match.mjs", "src/screens/games/game.mjs",
    ...["steps", "players", "review", "shared", "finance", "game-panel"].map((name) => `src/components/post-match/${name}.mjs`),
    "src/components/pre-match", "src/components/games", "src/components/games/checklist-layout.mjs", "src/components/games/result-fields.mjs",
    "src/screens/saved-roster.mjs", "src/components/roster-editor", "src/components/roster-editor-shared.mjs", "src/components/roster-notices.mjs",
    "src/screens/season/index.mjs", "src/screens/season/registration.mjs", "src/screens/season/admin.mjs", "src/screens/season/schedule.mjs",
    "src/screens/administration", "src/components/dialog.mjs", "src/components/page-chrome.mjs",
    "src/styles/post-match.css", "src/styles/result-form.css", "src/styles/legacy-aliases.css", "src/styles/roster.css", "src/styles/pre-match.css",
  ];
  for (const file of gone) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  // Of src/styles/ only the tokens are left; of src/components/ only the 3.0 toasts and live region.
  assert.deepEqual(readdirSync(new URL("../src/styles/", import.meta.url)), ["tokens.css"]);
  assert.deepEqual(readdirSync(new URL("../src/components/", import.meta.url)).sort(), ["live-region.mjs", "toast.mjs"]);
});

/** The relative modules a source imports — `from "…"`, `import "…"`, `import("…")` — as paths from the repository's root. */
function importsOf(file) {
  const base = file.split("/").slice(0, -1);
  return [...read(file).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"'?]+)["']/g)].map(([, specifier]) => {
    const parts = [...base];
    for (const part of specifier.split("/")) {
      if (part === "..") parts.pop();
      else if (part !== ".") parts.push(part);
    }
    return parts.join("/");
  });
}

// check-dead-code counts every exported function as a root, so a module nothing imports passes it (review of stage 13):
// this does not. A page loads src/app.js and src/theme-boot.js (index.html); every other module is imported by one.
test("every module under src/ is imported by a module of src/, server/ or scripts/; index.html loads the two others", () => {
  const under = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true })
    .map((name) => `${dir}/${name.split("\\").join("/")}`)
    .filter((file) => /\.m?js$/.test(file));
  const imported = new Set(["src", "server", "scripts"].flatMap(under).flatMap(importsOf));
  const loaded = ["index.html", "public/play.html"].flatMap(file => [...read(file).matchAll(/<script[^>]*\ssrc="\/?(src\/[^"?]+)/g)].map(([, source]) => source)).sort();
  assert.deepEqual(loaded, ["src/app.js", "src/play/app.mjs", "src/play/theme-boot.js", "src/theme-boot.js"]);
  const orphans = under("src").filter((file) => !imported.has(file) && !loaded.includes(file));
  assert.deepEqual(orphans, [], `nothing imports ${orphans.join(", ")}`);
  // The finder sees the three ways in.
  assert.deepEqual(importsOf("src/app.js").filter((file) => file.endsWith("core/router.mjs")), ["src/core/router.mjs"]);
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

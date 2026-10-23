/**
 * The pairs the 06 handoff left for stage 13 (decision 15): each holds the minimum its use asks, in all eight palettes,
 * with the palettes' tokens as they are.
 *
 * - --accent-text on --accent-tint (4.46:1 in grass) is never body text: the switcher's tick on the current team's
 *   tint, the raised characteristic's 26px figure. A graphic and large text ask 3:1 (WCAG 1.4.11, 1.4.3).
 * - The builder's budget bar is a graphic that repeats the figures beside it; its fill on the --line track asks 3:1.
 *   --accent there was 2.48:1 in night: the fill is --accent-text, the same colour in a light palette and the lighter
 *   one a dark palette writes its accent's words in.
 * - The captain's «C» is a letter on the gold disc, 4.5:1. The disc carries nothing by itself: the letter is the mark,
 *   and a screen reader hears the word.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { renderPlayerBadge } from "../src/ui/number-badge.mjs";

/** The sheet under src/screens/teams/ that styles a selector: the builder's sheets may share their rules out. */
function teamsSheetOf(selector) {
  const sheets = readdirSync(new URL("../src/screens/teams/", import.meta.url)).filter((name) => name.endsWith(".css")).map((name) => `src/screens/teams/${name}`);
  const owners = sheets.filter((file) => valuesOf(file, selector, "background").length);
  assert.equal(owners.length, 1, `${selector} is styled in one sheet of src/screens/teams, not ${owners.length}`);
  return owners[0];
}

/** The colour a rule sets for its background: one value, the last in the sheet. */
function backgroundOf(file, selector) {
  const values = valuesOf(file, selector, "background");
  assert.ok(values.length, `${file} sets no background for ${selector}`);
  return values.at(-1);
}

test("the accent's words on its tint are only a graphic or large text, and hold 3:1 in every palette", () => {
  assertContrast("--accent-text", ["--accent-tint"], 3);
  // The switcher's tick on the current team's row.
  assert.deepEqual(valuesOf("src/shell/team-switcher.css", '.g-switcher__row[aria-current="true"]', "background"), ["var(--accent-tint)"]);
  assertReadable("src/shell/team-switcher.css", ".g-switcher__row .g-icon", "color", ["--accent-tint"], 3);
  // The raised characteristic: its figure is 26px bold, large text.
  assert.deepEqual(valuesOf("src/ui/stat-strip.css", ".g-stat--up", "background"), ["var(--accent-tint)"]);
  assert.match(valuesOf("src/ui/stat-strip.css", ".g-stat__v", "font")[0], /^700 26px\//);
  assertReadable("src/ui/stat-strip.css", ".g-stat--up .g-stat__v", "color", ["--accent-tint"], 3);
});

test("the builder's budget bar is filled at 3:1 on its track in every palette, and so is its overspent fill", () => {
  const file = teamsSheetOf(".g-build__bar");
  const track = backgroundOf(file, ".g-build__bar");
  assert.equal(track, "var(--line)", "the track");
  assert.equal(backgroundOf(teamsSheetOf(".g-build__bar::before"), ".g-build__bar::before"), "var(--accent-text)", "the fill: the accent's words' colour");
  for (const fill of [".g-build__bar::before", ".g-build__bar--over::before"]) {
    assertReadable(teamsSheetOf(fill), fill, "background", [track], 3);
  }
});

test("the captain's «C» reads 4.5:1 on its gold disc in every palette; the disc carries no sign by itself", () => {
  assertContrast("--pitch-900", ["--crest-gold"], 4.5);
  const discs = [
    ["src/ui/number-badge.css", ".g-num__captain"],
    [teamsSheetOf('.g-roster-row__captain[aria-checked="true"]'), '.g-roster-row__captain[aria-checked="true"]'],
    ["src/screens/team/roster/player-sheets.css", "#player-edit .g-player-edit__c"],
  ];
  for (const [file, selector] of discs) {
    assert.equal(backgroundOf(file, selector), "var(--crest-gold)", `${selector}: the gold disc`);
    assertReadable(file, selector, "color", [backgroundOf(file, selector)], 4.5);
  }
  // The mark is the letter, and the word is the screen reader's: the gold alone tells nothing.
  const badge = mount(renderPlayerBadge({ number: "3", captain: true }));
  assert.equal(badge.querySelector(".g-num__captain").textContent, "C");
  assert.equal(badge.querySelector(".g-num__captain").getAttribute("aria-hidden"), "true");
  assert.equal(badge.querySelector(".g-sr-only").textContent, "Captain");
  assert.equal(mount(renderPlayerBadge({ number: "3" })).querySelector(".g-num__captain"), null);
});

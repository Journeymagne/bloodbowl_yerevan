import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { assertReadable as assertReadableIn, read, valuesOf } from "./helpers/contrast.mjs";

/*
 * The 2.x screens were put on the 3.0 tokens through legacy-aliases.css and not
 * moved (stage 04). Comparing before/after screenshots found a few places where
 * an alias, or a literal 2.x colour, left something pale or half drawn; each
 * fix is one value in a 2.x stylesheet, and the tests here keep it fixed in all
 * eight palettes.
 */

const LEGACY = { layers: ["src/styles/legacy-aliases.css"] };
const assertReadable = (file, selector, property, backgrounds, minimum) => assertReadableIn(file, selector, property, backgrounds, minimum, LEGACY);

test("the edition numeral and the VS between player cards are readable, not a tint of the surface", () => {
  assertReadable("src/styles/site-matchday.css", ".game-versus > strong", "color", ["--surface", "--surface-2"], 3);
  assertReadable("src/styles/matchday.css", ".matchday-edition", "color", ["--surface-2"], 3);
});

test("an improved stat on a roster card is text-accent green, not the button fill, on a dark surface too", () => {
  const selector = ".matchday-player-card .readonly-stat-line .stat-up strong";
  assertReadable("src/styles/matchday.css", selector, "color", ["--surface", "--surface-2"], 4.5);
});

test("the stat strip's divider is a 3.0 line, not 2.x taupe", () => {
  assert.deepEqual(valuesOf("src/styles/pages.css", ".team-stat-grid div", "border-left"), ["1px solid var(--line)"]);
});

test("the badges of the games list are text colour, not the pale border colour", () => {
  const pre = "src/styles/pre-match.css";
  const onPage = ["--surface", "--surface-2", "--page"];
  assertReadable(pre, ".pre-badge", "color", onPage, 4.5);
  // The badge's outline is a border and keeps the border colour.
  assert.deepEqual(valuesOf(pre, ".pre-badge", "border"), ["1px solid var(--line-bright)"]);
});

test("a checked checkbox is filled with the text accent, which a control's outline needs at 3:1", () => {
  const sheet = "src/styles/controls.css";
  for (const selector of ['.filter-field input[type="checkbox"]', ".checkbox-field input"]) {
    // The fill accent is 2.91:1 on dungeon's surface; the text accent is the same colour in every light palette.
    assertReadable(sheet, selector, "accent-color", ["--surface", "--surface-2", "--page"], 3);
    assert.deepEqual(valuesOf(sheet, selector, "accent-color"), ["var(--accent-text)"], selector);
  }
});

test("the error notice of match preparation and results, and a negative budget, are danger text a light page can read", () => {
  // A notice box is the --md-wash tint; the budget sits on a panel.
  assertReadable("src/styles/roster.css", ".danger-text", "color", ["--surface", "--surface-2", "--page", "--accent-tint-soft"], 4.5);
});

test("a started round or game is accent text on its pill, not a pale green made for a dark page", () => {
  // The pill is the --md-wash tint (site-matchday.css); its label is .6rem, so 4.5:1.
  assertReadable("src/styles/season.css", '.season-status-pill[data-status="started"]', "color", ["--accent-tint-soft", "--surface"], 4.5);
});

test("the destructive confirm button keeps its label readable in every palette, hovered too", () => {
  const sheet = "src/styles/season.css";
  const button = ".primary-button.danger-action";
  const fill = valuesOf(sheet, button, "background").at(-1);
  const hovered = valuesOf(sheet, `${button}:hover:not(:disabled)`, "background").at(-1);
  // Large bold text would need 3:1; the dialog's label is neither, so 4.5:1.
  assertReadable(sheet, button, "color", [fill, hovered], 4.5);
});

test("the 2.x post-match is gone — its screen, its steps, the checklist layout and its stylesheet; the game page keeps its panels", () => {
  const gone = [
    "src/screens/games/post-match.mjs",
    ...["steps", "players", "review", "shared", "finance"].map((name) => `src/components/post-match/${name}.mjs`),
    "src/components/games/checklist-layout.mjs",
    "src/styles/post-match.css",
    // The admin's manual result of the game page went with the 2.x season screen (stage 12): the administration's season has it.
    "src/components/games/result-fields.mjs",
    "src/styles/result-form.css",
  ];
  for (const file of gone) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  // The 2.x game page (#/games/:id, stage 13) draws these; the 3.0 post-match saves through the client.
  const kept = [
    "src/components/post-match/game-panel.mjs",
    "src/components/pre-match/game-panel.mjs",
    "src/components/pre-match/shared.mjs",
    "src/components/matchday.mjs",
    "src/data/post-match-client.mjs",
  ];
  for (const file of kept) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  assert.doesNotMatch(read("src/styles.css"), /styles\/post-match\.css/);
  assert.doesNotMatch(read("src/styles.css"), /styles\/(result-form|season-results|season-entries)\.css/);
  // The 2.x post-match's player card had no other reader.
  assert.doesNotMatch(read("src/components/pre-match/shared.mjs"), /playerCard/);
  // The checklist layout was the last to draw .pre-match: its rules went with it.
  assert.doesNotMatch(read("src/styles/pre-match.css"), /\.pre-match\b/);
});

test("the 2.x roster editor is gone — its screen, its parts, and the rules of roster.css only it read (stage 12, Task 15)", () => {
  const gone = ["src/screens/saved-roster.mjs", "src/components/roster-editor", "src/components/roster-editor-shared.mjs", "src/components/roster-notices.mjs"];
  for (const file of gone) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  // Its table, its stat cells, its steppers and its cards: the 3.0 roster (screens/team/roster) draws none of them.
  assert.doesNotMatch(read("src/styles/roster.css"), /\.(saved-roster-|stat-table-cell|table-stepper|player-stat-editors|roster-identity-panel)/);
  // What the 2.x screens that are left still draw stays: the icon buttons a template names by their tone.
  assert.deepEqual(valuesOf("src/styles/roster.css", ".danger-icon-button", "color"), ["var(--danger)"]);
});

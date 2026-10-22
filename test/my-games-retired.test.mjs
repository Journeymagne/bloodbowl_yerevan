import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import test from "node:test";

import { blocks, read } from "./helpers/contrast.mjs";

/*
 * Stage 09c moved the challenges to their 3.0 screen (screens/matches/challenges.mjs): 2.x «My games», the last thing
 * `#/t/:id/challenges` drew, goes with its challenges' view, its stylesheet, the rules only it wore and the keys only it
 * read. The 2.x game page (#/games/:id) went in stage 13, when the address became the 3.0 match page.
 *
 * Stages 09b and 12 removed the other 2.x screens first, so what «My games» shared with them had it as its last reader:
 * season-links.mjs, game-status.mjs, catalog.css (the 2.x card and badge), the challenge dialog's rules, the status pill,
 * the games list's badges, the muted text, and their keys go with it.
 */

const exists = (file) => existsSync(new URL(`../${file}`, import.meta.url));

/** Every stylesheet under src/, as a path from the project's root. */
function stylesheets(dir = "src") {
  return readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? stylesheets(`${dir}/${entry.name}`) : entry.name.endsWith(".css") ? [`${dir}/${entry.name}`] : []);
}

test("2.x «My games» is gone — its screen, its challenges' view and its stylesheet; and so is the 2.x game page", () => {
  const gone = [
    "src/screens/games/my-games.mjs",
    "src/components/games/challenges.mjs",
    "src/styles/challenges.css",
    // Its score line read pairingTouchdowns and pairingCasualties, all stage 12 left of season-links.mjs.
    "src/screens/season/season-links.mjs",
    // Its cards' status pill was the last to read gameStatusLabel.
    "src/components/game-status.mjs",
    // Its cards were the last 2.x .card, after the saved team's card (stage 12).
    "src/styles/catalog.css",
    // Stage 13 (Task 5): #/games/:id is the 3.0 match page (screens/matches/game.mjs); the 2.x one went with its panels.
    "src/screens/games/game.mjs",
  ];
  for (const file of gone) assert.equal(exists(file), false, file);
  assert.doesNotMatch(read("src/styles.css"), /styles\/(challenges|catalog)\.css/);
});

test("no stylesheet styles «My games», its cards, pills and badges, or its challenges and their dialog", () => {
  // The 3.0 screen's classes are g-challenge* and g-friendly*: a 2.x name starts the class.
  const RETIRED = /\.(challenge-[\w-]+|game-card[\w-]*|games-grid|card-grid|card|badge|pre-badge|season-status-pill|season-card|matchday-hire-dialog|muted-text)(?![\w-])/;
  for (const file of stylesheets()) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) assert.doesNotMatch(selector, RETIRED, `${file}: ${selector}`);
    }
  }
});

test("the keys only «My games» read are gone from both dictionaries; the game page's stay", () => {
  const GONE_FAMILIES = ["challenges.", "pre.status.", "post.status.", "games.status."];
  const GONE = ["nav.myGames", "nav.myTeams", "games.historyHeading", "games.loading", "games.nextGameHeading", "games.noHistory",
    "games.noLeaguePoints", "games.noNextGame", "games.vsLabel", "season.byeLabel", "common.close"];
  const KEPT = ["games.subtitle", "games.friendlyMatch", "games.friendlyRules", "games.loginRequired", "common.refresh",
    "season.touchdownsLabel", "season.casualtiesHeader"];
  for (const locale of ["en", "ru"]) {
    const keys = Object.keys(JSON.parse(read(`src/i18n/${locale}.json`)));
    assert.deepEqual(keys.filter((key) => GONE.includes(key) || GONE_FAMILIES.some((family) => key.startsWith(family))), [], locale);
    for (const key of KEPT) assert.ok(keys.includes(key), `${locale}: ${key}`);
  }
});

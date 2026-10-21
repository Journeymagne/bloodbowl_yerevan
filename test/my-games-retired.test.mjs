import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import test from "node:test";

import { blocks, read } from "./helpers/contrast.mjs";

/*
 * Stage 09c moved the challenges to their 3.0 screen (screens/matches/challenges.mjs): 2.x «My games», the last thing
 * `#/t/:id/challenges` drew, goes with its challenges' view, its stylesheet, the rules only it wore and the keys only it
 * read. The 2.x game page (#/games/:id, stage 13) keeps what it draws.
 */

const exists = (file) => existsSync(new URL(`../${file}`, import.meta.url));

/** Every stylesheet under src/, as a path from the project's root. */
function stylesheets(dir = "src") {
  return readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? stylesheets(`${dir}/${entry.name}`) : entry.name.endsWith(".css") ? [`${dir}/${entry.name}`] : []);
}

test("2.x «My games» is gone — its screen, its challenges' view and its stylesheet; the game page keeps its own", () => {
  for (const file of ["src/screens/games/my-games.mjs", "src/components/games/challenges.mjs", "src/styles/challenges.css"]) {
    assert.equal(exists(file), false, file);
  }
  for (const file of ["src/screens/games/game.mjs", "src/components/games/context.mjs", "src/components/game-status.mjs"]) {
    assert.ok(exists(file), file);
  }
  assert.doesNotMatch(read("src/styles.css"), /styles\/challenges\.css/);
  // Its score line read pairingTouchdowns and pairingCasualties, all stage 12 left of season-links.mjs: the file goes.
  assert.equal(exists("src/screens/season/season-links.mjs"), false);
});

test("no stylesheet styles «My games», its game cards or its challenges", () => {
  // The 3.0 screen's classes are g-challenge* and g-friendly*: a 2.x name starts the class.
  const RETIRED = /\.(challenge-|game-card|games-grid|card-grid)|\.card\.compact\b/;
  for (const file of stylesheets()) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) assert.doesNotMatch(selector, RETIRED, `${file}: ${selector}`);
    }
  }
});

test("the keys only «My games» read are gone from both dictionaries; the game page's stay", () => {
  const GONE_FAMILIES = ["challenges.", "pre.status.", "post.status."];
  const GONE = ["nav.myGames", "nav.myTeams", "games.historyHeading", "games.loading", "games.nextGameHeading", "games.noHistory",
    "games.noLeaguePoints", "games.noNextGame"];
  const KEPT = ["games.subtitle", "games.friendlyMatch", "games.friendlyRules", "games.loginRequired", "common.refresh"];
  for (const locale of ["en", "ru"]) {
    const keys = Object.keys(JSON.parse(read(`src/i18n/${locale}.json`)));
    assert.deepEqual(keys.filter((key) => GONE.includes(key) || GONE_FAMILIES.some((family) => key.startsWith(family))), [], locale);
    for (const key of KEPT) assert.ok(keys.includes(key), `${locale}: ${key}`);
  }
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import * as phase from "../src/data/match-phase.mjs";
import * as card from "../src/shell/current-match.mjs";

const ROOT = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");

/** The `.mjs` files under a folder of the project, at any depth, as paths from its root. */
function modulesUnder(folder) {
  return readdirSync(new URL(folder, ROOT), { recursive: true })
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => `${folder}/${name}`);
}

/** What a module reads: every `import … from`, `export … from` and `import(…)` it names. */
function importsOf(source) {
  const named = [...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)].map((match) => match[1]);
  const bare = [...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm)].map((match) => match[1]);
  const dynamic = [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
  return [...named, ...bare, ...dynamic];
}

// 08 T3 M2 (stage 13, decision 22): the team page's model asked the shell which match is on, and the shell is what draws
// the frame. The match's phase is data's now; a model, the data and the domain read nothing of the shell.
const PURE = [
  "src/screens/team/manage/model.mjs",
  "src/screens/team/roster/model.mjs",
  ...modulesUnder("src/data"),
  ...modulesUnder("src/domain"),
];

test("a pure model reads no module of the shell", () => {
  assert.ok(PURE.includes("src/data/match-phase.mjs"), "the match's phase is among the data");
  assert.ok(PURE.length > 40, `the data and the domain are read: ${PURE.length} modules`);
  for (const file of PURE) {
    const shell = importsOf(read(file)).filter((target) => /(^|\/)shell\//.test(target));
    assert.deepEqual(shell, [], `${file} reads the shell`);
  }
  for (const file of ["src/screens/team/manage/model.mjs", "src/screens/team/roster/model.mjs"]) {
    assert.ok(importsOf(read(file)).includes("../../../data/match-phase.mjs"), `${file} takes the match's phase from the data`);
  }
});

test("the match's phase draws nothing: no markup, no words, no frame", () => {
  const imports = importsOf(read("src/data/match-phase.mjs"));
  assert.deepEqual(imports.filter((target) => /\/(?:shell|ui|screens|components)\/|core\/(?:dom|i18n)\.mjs$/.test(target)), [], imports.join(", "));
});

test("the SideNav's card and every reader of the shell's copy meet the one rule of the data", () => {
  assert.equal(card.currentMatch, phase.currentMatch);
  assert.equal(card.isMatchLive, phase.isMatchLive);
  const side = (teamId) => ({ user: { id: `u-${teamId}`, login: "x" }, team: { id: teamId, name: teamId } });
  const game = (id, over = {}) => ({
    id, kind: "league", roundStatus: "started", roundNumber: 7, season: { currentRound: 7 }, resultStatus: "pending",
    preparationStatus: "not_started", postMatchStatus: "not_started", updatedAt: "2026-10-10T10:00:00Z", home: side("t1"), away: side("r1"), ...over,
  });
  const live = game("g-live", { preparationStatus: "in_progress", postMatchStatus: "draft" });
  assert.deepEqual(phase.currentMatch([game("g-next"), live], "t1"), { game: live, phase: "live" });
  assert.equal(phase.currentMatch([live], null), null);
  assert.equal(phase.isMatchLive(live), true);
  assert.equal(phase.isMatchLive({ ...live, postMatchStatus: "completed" }), false);
});

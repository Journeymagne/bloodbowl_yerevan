import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { state } from "../src/core/state.mjs";
import { isLive, teamOf } from "../src/screens/team/manage/team-of.mjs";

const ROOT = new URL("../", import.meta.url);
const MANAGE = "src/screens/team/manage";
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");
const own = (teamId) => ({ team: { id: teamId } });
const game = (over) => ({ id: "g1", home: own("t1"), away: own("r1"), preparationStatus: "not_started", postMatchStatus: "not_started", resultStatus: "pending", ...over });
const LIVE = { preparationStatus: "in_progress", postMatchStatus: "draft" };

// 08 T8 (stage 13, decision 22; pre-flight L34): the team page's sheets and its resources each found the team in the list,
// and asked whether its match was on, in a copy of their own. One of each now, in a module of their own: the model stays pure.
const PARTS = ["resources", "money-sheet", "fix-sheet", "settings", "sheet-host"].map((name) => `${MANAGE}/${name}.mjs`);

test("one teamOf and one isLive for the team's page and its sheets", () => {
  const modules = readdirSync(new URL(MANAGE, ROOT)).filter((name) => name.endsWith(".mjs"));
  for (const name of modules) {
    if (name === "team-of.mjs") continue;
    const source = read(`${MANAGE}/${name}`);
    assert.doesNotMatch(source, /\b(?:const|let|var|function)\s+(?:teamOf|isLive)\b/, `${name} keeps a teamOf or an isLive of its own`);
  }
  for (const file of PARTS) {
    const source = read(file);
    assert.match(source, /^import \{[^}]*\bteamOf\b[^}]*\} from "\.\/team-of\.mjs";$/m, `${file} takes the one teamOf`);
    assert.doesNotMatch(source, /state\.myTeams\.items\.find\(/, `${file} looks for the team itself`);
    assert.doesNotMatch(source, /matchLock\(state\.games\.items, [\w.]+\)\?\.kind === "live"/, `${file} asks for a match on itself`);
  }
  assert.doesNotMatch(read(`${MANAGE}/model.mjs`), /core\/state\.mjs/, "the model reads no state: the two readers of it are team-of.mjs's");
});

test("teamOf is the team as the coach's list holds it; isLive, whether its match is on as the page and the SideNav judge it", () => {
  const ravens = { id: "t1", name: "Ravens" };
  state.myTeams = { items: [{ id: "t0", name: "Other" }, ravens], loaded: true, loading: false, error: "" };
  assert.ok(teamOf("t1") === ravens, "the list's own object");
  assert.equal(teamOf("t9"), undefined);
  state.games.items = [game(LIVE)];
  assert.deepEqual([isLive("t1"), isLive("r1"), isLive("t9")], [true, true, false]);
  state.games.items = [game({ preparationStatus: "ready", kind: "league", roundStatus: "started", roundNumber: 3, season: { currentRound: 3 } })];
  assert.equal(isLive("t1"), false, "a preparation only warns");
  state.games.items = [game({ ...LIVE, postMatchStatus: "completed" })];
  assert.equal(isLive("t1"), false, "a post-match done is no match on");
  state.games.items = [];
  assert.equal(isLive("t1"), false);
});

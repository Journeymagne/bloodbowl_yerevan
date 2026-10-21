import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { expandCollections } from "../src/data/reference.mjs";
import { createMatchSide } from "../src/domain/match/roster.mjs";
import { applyPostAction, createPostMatch } from "../src/domain/post-match/state.mjs";
import { postAdvancer, projectPostRoster } from "../src/domain/post-match/roster.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const siteRoll = (n) => ({ id: `8f6c1d1e-0000-4000-8000-00000000000${n}`, via: "site" });

/** A team as its coach brings it: eleven of the race's first position, the first two with 30 SPP to spend. */
function source(name, slug, roster = {}) {
  const players = Array.from({ length: 11 }, (_, at) => ({ id: `${name[0]}${at + 1}`, rowIndex: 0, number: String(at + 1),
    name: `Player ${at + 1}`, spp: at < 2 ? { touchdowns: 10 } : {} }));
  return { user: { id: name, login: name }, gamesPlayed: 4, events: [],
    team: { id: name, name, revision: 2, baseTeamSlug: slug, roster: { treasury: 150, dedicatedFans: 2, coachesSafe: 0, players, ...roster } } };
}

/** A 0–0 both coaches agreed, both sides on the Players step. Humans unless `home` names another race. */
function toPlayers({ home = "teams/human", roster = {} } = {}) {
  const sources = { home: source("home", home, roster), away: source("away", "teams/human") };
  const snapshots = Object.fromEntries(Object.entries(sources).map(([name, item]) => [name, { ...createMatchSide(item, data), fanFactor: 3, effects: {} }]));
  let state = createPostMatch("game", sources, snapshots, data);
  state = applyPostAction(state, "home", { type: "result", home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, data);
  state = applyPostAction(state, "away", { type: "agree-result" }, data);
  for (const name of ["home", "away"]) state = applyPostAction(state, name, { type: "fans", roll: 3 }, data);
  return state;
}

const advance = (playerId, advancementType, grant, more = {}) => ({ type: "advance", playerId, advancementType, grant, ...more });
const rosterPlayer = (state, id, name = "home") => projectPostRoster(state, name, data).roster.players.find((player) => player.id === id);

test("an advancement of the post-match keeps the roll it names, and one roll is not named twice", () => {
  const state = toPlayers();
  const roll = siteRoll(1);
  const next = applyPostAction(state, "home", advance("h1", "random", { skill: "Block" }, { roll }), data);
  assert.deepEqual(next.home.advancements.h1, [{ type: "random", grant: { skill: "Block" }, roll }]);
  assert.deepEqual(rosterPlayer(next, "h1").advancements.at(-1), { type: "random", grants: { skill: "Block" }, roll });
  assert.throws(() => applyPostAction(next, "home", advance("h2", "random", { skill: "Wrestle" }, { roll }), data), { code: "DICE_ROLL_USED" });
  const fresh = applyPostAction(next, "home", advance("h2", "random", { skill: "Wrestle" }, { roll: siteRoll(2) }), data);
  assert.deepEqual(rosterPlayer(fresh, "h2").advancements, [{ type: "random", grants: { skill: "Wrestle" }, roll: siteRoll(2) }]);
});

test("a second advancement of the same player takes a fresh roll; only this side's choices hold a roll", () => {
  const first = applyPostAction(toPlayers(), "home", advance("h1", "random", { skill: "Block" }, { roll: siteRoll(1) }), data);
  const second = applyPostAction(first, "home", advance("h1", "random", { skill: "Wrestle" }, { roll: siteRoll(2) }), data);
  assert.deepEqual(rosterPlayer(second, "h1").advancements.map(({ roll }) => roll), [siteRoll(1), siteRoll(2)]);
  assert.throws(() => applyPostAction(second, "home", advance("h1", "random", { skill: "Tackle" }, { roll: siteRoll(1) }), data), { code: "DICE_ROLL_USED" });
  // A roll is a team's (the server says whose); the domain only keeps one side from naming its own roll twice.
  const away = applyPostAction(second, "away", advance("a1", "random", { skill: "Block" }, { roll: siteRoll(1) }), data);
  assert.deepEqual(away.away.advancements.a1[0].roll, siteRoll(1));
});

test("a chosen type takes no roll, and a roll of another shape is refused", () => {
  const state = toPlayers();
  assert.throws(() => applyPostAction(state, "home", advance("h1", "primary", { skill: "Block" }, { roll: siteRoll(1) }), data), { code: "POST_ADVANCEMENT" });
  assert.throws(() => applyPostAction(state, "home", advance("h1", "random", { skill: "Block" }, { roll: { via: "dice" } }), data), { code: "POST_ADVANCEMENT" });
  assert.throws(() => applyPostAction(state, "home", advance("h1", "random", { skill: "Block" }, { roll: { via: "site" } }), data), { code: "POST_ADVANCEMENT" });
  const table = applyPostAction(state, "home", advance("h1", "stat", { stat: "ma" }, { roll: { via: "table" } }), data);
  assert.deepEqual(rosterPlayer(table, "h1").advancements, [{ type: "stat", grants: { stat: "ma" }, roll: { via: "table" } }]);
  const none = applyPostAction(state, "home", advance("h1", "primary", { skill: "Block" }, { roll: null }), data);
  assert.deepEqual(none.home.advancements.h1, [{ type: "primary", grant: { skill: "Block" } }], "no key without a value");
  assert.deepEqual(rosterPlayer(none, "h1").advancements, [{ type: "primary", grants: { skill: "Block" } }]);
});

test("a characteristic advancement taking a skill in its place keeps its roll and its type", () => {
  const roll = siteRoll(3);
  const next = applyPostAction(toPlayers(), "home", advance("h1", "stat", { skill: "Block" }, { roll }), data);
  const player = rosterPlayer(next, "h1");
  assert.deepEqual(player.advancements, [{ type: "stat", grants: { skill: "Block" }, roll }]);
  assert.deepEqual(player.extraSkills, [{ name: "Block", access: "primary" }]);
});

test("a Favoured roster's advancement needs no D8: the bonus is added after it, or not at all", () => {
  const state = toPlayers({ home: "teams/khorne", roster: { favouredChoice: "Khorne" } });
  const taken = applyPostAction(state, "home", advance("h1", "primary", { skill: "Block" }), data);
  assert.deepEqual(taken.home.advancements.h1, [{ type: "primary", grant: { skill: "Block" } }]);
  assert.deepEqual(rosterPlayer(taken, "h1").favouredSkills, [], "no bonus, and nothing refused");
  const favoured = applyPostAction(taken, "home", { type: "favoured", playerId: "h1", skill: "Horns" }, data);
  assert.deepEqual(favoured.home.advancements.h1, [{ type: "primary", grant: { skill: "Block" }, favouredRoll: 8, favouredSkill: "Horns" }]);
  assert.deepEqual(rosterPlayer(favoured, "h1").favouredSkills, [{ name: "Horns", access: "favoured" }]);
  assert.throws(() => applyPostAction(taken, "home", { type: "favoured", playerId: "h1", skill: "Tentacles" }, data), { code: "POST_FAVOURED" });
  assert.throws(() => applyPostAction(taken, "home", { type: "favoured", playerId: "h1", skill: "" }, data), { code: "POST_FAVOURED" });
  assert.throws(() => applyPostAction(taken, "home", { type: "favoured", playerId: "h2", skill: "Horns" }, data), { code: "POST_ACTION" });
  const horns = applyPostAction(state, "home", advance("h1", "primary", { skill: "Horns" }), data);
  assert.throws(() => applyPostAction(horns, "home", { type: "favoured", playerId: "h1", skill: "Horns" }, data), { code: "POST_FAVOURED" }, "a skill he holds by now");
  const undone = applyPostAction(favoured, "home", { type: "undo-advance", playerId: "h1" }, data);
  assert.deepEqual(rosterPlayer(undone, "h1").favouredSkills, [], "the bonus goes with its advancement");
  assert.throws(() => applyPostAction(undone, "home", { type: "favoured", playerId: "h1", skill: "Horns" }, data), { code: "POST_ACTION" });
  const human = applyPostAction(toPlayers(), "home", advance("h1", "primary", { skill: "Block" }), data);
  assert.throws(() => applyPostAction(human, "home", { type: "favoured", playerId: "h1", skill: "Horns" }, data), { code: "POST_ACTION" });
});

test("a 2.x step with the D8 in the advancement is read as before", () => {
  const state = toPlayers({ home: "teams/khorne", roster: { favouredChoice: "Khorne" } });
  const step = advance("h1", "primary", { skill: "Block" }, { favouredRoll: 8, favouredSkill: "Horns" });
  const hit = applyPostAction(state, "home", step, data);
  assert.deepEqual(hit.home.advancements.h1, [{ type: "primary", grant: { skill: "Block" }, favouredRoll: 8, favouredSkill: "Horns" }]);
  assert.deepEqual(rosterPlayer(hit, "h1").favouredSkills, [{ name: "Horns", access: "favoured" }]);
  assert.deepEqual(rosterPlayer(applyPostAction(state, "home", { ...step, favouredRoll: 3 }, data), "h1").favouredSkills, [], "the D8 missed");
  assert.deepEqual(rosterPlayer(applyPostAction(state, "home", { ...step, favouredSkill: "" }, data), "h1").favouredSkills, [], "declined");
  assert.throws(() => applyPostAction(state, "home", { ...step, favouredRoll: 0 }, data), { code: "POST_DICE" });
  assert.throws(() => applyPostAction(state, "home", { ...step, favouredSkill: "Tentacles" }, data), { code: "POST_FAVOURED" });
});

test("undoing an advancement takes its roll away from the side", () => {
  const roll = siteRoll(4);
  const taken = applyPostAction(toPlayers(), "home", advance("h1", "random", { skill: "Block" }, { roll }), data);
  const undone = applyPostAction(taken, "home", { type: "undo-advance", playerId: "h1" }, data);
  assert.deepEqual(undone.home.advancements.h1, []);
  const again = applyPostAction(undone, "home", advance("h1", "random", { skill: "Wrestle" }, { roll }), data);
  assert.deepEqual(rosterPlayer(again, "h1").advancements, [{ type: "random", grants: { skill: "Wrestle" }, roll }]);
});

test("who may advance in the post-match, and who may have the site's roll for it", () => {
  const state = toPlayers(), side = state.home, row = rowsForTeam(side.reference)[0];
  side.snapshot.players.push({ id: "star-1", kind: "star", name: "Star", number: "S" },
    { id: "journeyman-12", kind: "journeyman", rowIndex: 0, row, name: "Temp", number: "12" });
  side.injuries.h3 = { code: "dead" };
  assert.deepEqual(["h1", "h3", "star-1", "journeyman-12", "nobody"].map((id) => postAdvancer(side, id)), [true, false, false, true, false]);
  assert.deepEqual(["h1", "journeyman-12"].map((id) => postAdvancer(side, id, { site: true })), [true, false]);
  assert.throws(() => applyPostAction(state, "home", advance("h3", "primary", { skill: "Block" }), data), { code: "POST_PLAYER" });
  assert.throws(() => applyPostAction(state, "home", advance("star-1", "primary", { skill: "Block" }), data), { code: "POST_PLAYER" });
  side.gamesPlayed = 2;
  assert.equal(postAdvancer(side, "h3"), true, "rookie protection: Dead reads as Badly Hurt");
});

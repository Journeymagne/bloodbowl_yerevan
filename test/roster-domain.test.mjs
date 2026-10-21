import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeCase, stableJson } from "./helpers/roster-cases.mjs";
import { calculateRosterCosts, playerCurrentCost, skillModCost, statModCost } from "../src/domain/roster/costs.mjs";
import { ensureDraftPlayers, positionKind, selectedRosterPlayers, skillNamesForPlayer, skillsForPlayer } from "../src/domain/roster/players.mjs";
import { playerAvailableSpp, playerSppTotal, playerLevelRank } from "../src/domain/roster/progression.mjs";
import { teamHasSpecialRule } from "../src/domain/roster/team-rules.mjs";
import { costToNumber, countToNumber, rosterMax, rowCost } from "../src/domain/roster/values.mjs";
import { advancementStatCosts, builderStaffCosts } from "../src/domain/league-rules.mjs";
import { validateRoster as validateRosterSync } from "../src/domain/roster/validate.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(await fs.readFile(path.join(rootDir, "test", "fixtures", "roster-cases.json"), "utf8"));
const data = expandCollections(JSON.parse(await fs.readFile(path.join(rootDir, "public", "data.json"), "utf8")));
const teamBySlug = new Map(data.teams.map((team) => [team.slug, team]));

// ---------------------------------------------------------------------------
// Behavioural baseline. These fixtures were generated from the implementation
// that lived in src/app.js before the domain was extracted, and verified to
// match it exactly across all 37 teams. A diff here means the rules changed —
// intentionally or not.
// ---------------------------------------------------------------------------

test("fixtures cover the teams whose special rules the domain branches on", () => {
  assert.equal(cases.length, 8);
  for (const item of cases) assert.equal(item.generation, "modern");
  for (const slug of ["teams/black-orc", "teams/elven-union", "teams/nurgle"]) {
    assert.ok(cases.some((item) => item.team === slug), `${slug} missing from fixtures`);
  }
});

// Keep the pinned pre-extraction arithmetic baseline; new post-match fields
// with empty defaults are covered by post-match.test.mjs, and `absence` with its
// null default by roster-absence.test.mjs.
function baselineView(value) {
  if (Array.isArray(value)) return value.map(baselineView);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => !(
    ['throws', 'landings', 'bonus'].includes(key) && entry === 0
    || key === 'nigglingInjuries' && entry === (value.niglingInjury ? 1 : 0)
    || key === 'temporarilyRetired' && entry === false
    || key === 'injuryStatMods' && Object.keys(entry).length === 0
    || key === 'absence' && entry === null
  )).map(([key, entry]) => [key, baselineView(entry)]));
}

for (const item of cases) {
  test(`${item.team} / ${item.generation} matches the pinned baseline`, () => {
    const team = teamBySlug.get(item.team);
    assert.ok(team, `team ${item.team} is missing from public/data.json`);
    assert.deepEqual(baselineView(describeCase(team, item.draft)), item.expected);
  });
}

// ---------------------------------------------------------------------------
// Properties that must hold whatever the fixtures say.
// ---------------------------------------------------------------------------

test("normalisation is idempotent", () => {
  for (const item of cases) {
    const team = teamBySlug.get(item.team);
    const draft = JSON.parse(JSON.stringify(item.draft));
    ensureDraftPlayers(team, draft);
    const once = stableJson(draft.players);
    ensureDraftPlayers(team, draft);
    assert.deepEqual(stableJson(draft.players), once, `${item.team}/${item.generation}`);
  }
});

test("the two retired roster shapes are no longer read", () => {
  // Support for `slots` and for `roster` counts plus `playerEdits` was removed
  // once every saved team had been in the players[] shape for a while (see
  // scripts/check-roster-shapes.mjs, run against the database before deploying).
  // A blob in either old shape now normalises to an empty roster rather than
  // being silently half-understood.
  const team = teamBySlug.get("teams/amazon");

  const slotsBlob = {
    slots: [{ rowIndex: 0, name: "Old slot", statMods: { ma: 1 }, extraSkills: [], spp: {}, advancements: [] }],
    roster: {},
  };
  ensureDraftPlayers(team, slotsBlob);
  assert.deepEqual(slotsBlob.players, []);

  const editsBlob = {
    roster: { 0: 2 },
    playerEdits: { "0-0": { name: "Old A" }, "0-1": { name: "Old B" } },
  };
  ensureDraftPlayers(team, editsBlob);
  assert.deepEqual(editsBlob.players, []);
  assert.deepEqual(editsBlob.roster, {}, "counts are recomputed from players");
});

test("a player carries its edits through normalisation", () => {
  const team = teamBySlug.get("teams/amazon");
  const draft = {
    players: [{
      id: "keep-me",
      rowIndex: 0,
      number: "7",
      name: "Named Player",
      statMods: { st: 1 },
      extraSkills: [{ name: "Block", access: "primary" }],
      favouredSkills: [],
      skipNextGame: true,
      niglingInjury: true,
      isCaptain: true,
      extendedContracts: 2,
      spp: { touchdowns: 2, casualties: 1, mvps: 1 },
      advancements: [{ type: "primary" }],
    }],
    roster: {},
  };
  ensureDraftPlayers(team, draft);
  const [player] = draft.players;
  assert.equal(player.name, "Named Player");
  assert.equal(player.number, "7");
  assert.equal(player.statMods.st, 1);
  assert.equal(player.extraSkills[0].name, "Block");
  assert.equal(player.skipNextGame, true);
  assert.equal(player.niglingInjury, true);
  assert.equal(player.isCaptain, true);
  assert.equal(player.extendedContracts, 2);
  assert.equal(player.spp.touchdowns, 2);
  assert.equal(player.advancements.length, 1);
  assert.deepEqual(draft.roster, { 0: 1 });
});

test("costs add up: players + staff = total", () => {
  for (const item of cases) {
    const team = teamBySlug.get(item.team);
    const draft = JSON.parse(JSON.stringify(item.draft));
    ensureDraftPlayers(team, draft);
    const costs = calculateRosterCosts(team, draft);
    assert.equal(costs.total, costs.playersCost + costs.staffCost, `${item.team}/${item.generation}`);
    const players = selectedRosterPlayers(team, draft);
    assert.equal(costs.totalPlayersCount, players.length);
    assert.equal(costs.playersCount, players.filter((player) => !player.skipNextGame).length);
    const manual = players
      .filter((player) => !player.skipNextGame)
      .reduce((sum, player) => sum + playerCurrentCost(player.row, player, true), 0);
    assert.equal(costs.playersCost, manual);
  }
});

test("a player who skips the next game is left out of cost and count", () => {
  const team = teamBySlug.get("teams/amazon");
  const row = team.team.roster[0];
  const base = {
    players: [
      { id: "a", rowIndex: 0, name: "A", statMods: {}, extraSkills: [], spp: {}, advancements: [] },
      { id: "b", rowIndex: 0, name: "B", statMods: {}, extraSkills: [], spp: {}, advancements: [] },
    ],
    roster: {}, playerEdits: {}, purchasedStaff: {}, treasury: 0,
  };
  const both = calculateRosterCosts(team, JSON.parse(JSON.stringify(base)));
  const skipped = JSON.parse(JSON.stringify(base));
  skipped.players[1].skipNextGame = true;
  const one = calculateRosterCosts(team, skipped);
  assert.equal(both.playersCount, 2);
  assert.equal(one.playersCount, 1);
  assert.equal(both.playersCost - one.playersCost, costToNumber(rowCost(row)));
  // Documented oddity, see design spec section 5 and league question 2:
  // an injured player currently reduces the team's value.
  assert.ok(one.total < both.total);
});

test("skill and stat surcharges follow the league rules table", () => {
  assert.equal(skillModCost({ name: "Block", access: "primary" }), 20);
  assert.equal(skillModCost({ name: "Block", access: "secondary" }), 40);
  assert.equal(skillModCost({ name: "Block", access: "favoured" }), 0);
  for (const [stat, cost] of Object.entries(advancementStatCosts)) {
    assert.equal(statModCost(stat, 1), cost);
    assert.equal(statModCost(stat, 2), cost * 2);
    assert.equal(statModCost(stat, -1), 0, "negative modifiers are free");
  }
});

test("SPP maths follows the team's special rules", () => {
  const plain = teamBySlug.get("teams/amazon");
  const brutes = teamBySlug.get("teams/black-orc");
  const passers = teamBySlug.get("teams/elven-union");
  assert.equal(teamHasSpecialRule(brutes, "Brawlin' Brutes"), true);
  assert.equal(teamHasSpecialRule(passers, "Passing Virtuosos"), true);

  const player = { spp: { touchdowns: 1, casualties: 1, catches: 1 }, advancements: [] };
  // plain: TD 3 + CAS 2 + catches 0
  assert.equal(playerSppTotal(plain, player), 5);
  // Brawlin' Brutes: TD 2 + CAS 3
  assert.equal(playerSppTotal(brutes, player), 5);
  // Passing Virtuosos: TD 2 + CAS 2 + catch 1
  assert.equal(playerSppTotal(passers, player), 5);

  const scorer = { spp: { touchdowns: 3 }, advancements: [] };
  assert.equal(playerSppTotal(plain, scorer), 9);
  assert.equal(playerSppTotal(brutes, scorer), 6);
});

test("advancements spend SPP and raise the player's level", () => {
  const team = teamBySlug.get("teams/amazon");
  const player = { spp: { mvps: 4 }, advancements: [] };
  assert.equal(playerSppTotal(team, player), 20);
  assert.equal(playerAvailableSpp(team, player), 20);
  assert.equal(playerLevelRank(player), "Rookie");

  player.advancements = [{ type: "primary" }];
  assert.equal(playerAvailableSpp(team, player), 14, "Experienced primary costs 6");
  assert.equal(playerLevelRank(player), "Experienced");

  player.advancements.push({ type: "stat" });
  assert.equal(playerAvailableSpp(team, player), -2, "Veteran stat costs 16; nothing stops overspending yet");
});

test("value parsers cope with the strings the content pipeline produces", () => {
  assert.equal(costToNumber("50K"), 50);
  assert.equal(costToNumber("50k"), 50);
  assert.equal(costToNumber(""), 0);
  assert.equal(costToNumber("-"), 0);
  // Prices in the content vault are written in thousands ("50K"), so the parser
  // takes the first digit group and stops. A price written with a separator
  // would be read as its first group only — worth knowing before anyone edits
  // the vault to "120,000".
  assert.equal(costToNumber("120,000"), 120);
  assert.equal(countToNumber("3"), 3);
  assert.equal(countToNumber("x"), 0);
  assert.equal(countToNumber(-2), -2);
  assert.equal(rosterMax("0-16"), 16);
  assert.equal(rosterMax("0-2"), 2);
  assert.equal(rosterMax("1-1"), 1);
  // Latent trap: rosterMax() only understands ranges. A quantity written as a
  // bare number falls back to 16, so a position limited to "2" would silently
  // allow 16. Every qty in the current vault is a range, which is why this has
  // never bitten — see the content validation step in the plan (task 16).
  assert.equal(rosterMax("2"), 16);
  assert.equal(rosterMax(""), 16);
});

test("staff prices are the ones the builder charges", () => {
  assert.equal(builderStaffCosts.teamRerolls, 120);
  assert.equal(builderStaffCosts.startingRerolls, 60);
  assert.equal(builderStaffCosts.apothecary, 50);
  assert.equal(builderStaffCosts.dedicatedFans, 10);
});

// ---------------------------------------------------------------------------
// Validation returns codes, not sentences: the interface translates them.
// ---------------------------------------------------------------------------

test("validation reports codes with the parameters the UI needs", async () => {
  const { validateRoster, VALIDATION_CODES, positionMinimum } = await import("../src/domain/roster/validate.mjs");
  const team = teamBySlug.get("teams/amazon");

  const tooFew = validateRoster(team, { roster: {} }, { playersCount: 3, totalPlayersCount: 3 });
  const min = tooFew.find((item) => item.code === VALIDATION_CODES.ROSTER_MIN_PLAYERS);
  assert.ok(min, "expected a minimum-players violation");
  assert.deepEqual(min.params, { min: 7, count: 3 });

  const tooMany = validateRoster(team, { roster: {} }, { playersCount: 15, totalPlayersCount: 15 });
  const max = tooMany.find((item) => item.code === VALIDATION_CODES.ROSTER_MAX_PLAYERS);
  assert.ok(max, "expected a maximum-players violation");
  assert.deepEqual(max.params, { max: 14, count: 15 });

  const legal = validateRoster(team, { roster: {} }, { playersCount: 14, totalPlayersCount: 14 });
  assert.deepEqual(legal.filter((item) => item.code.startsWith("ROSTER_")), []);

  assert.equal(positionMinimum("1-2"), 1);
  assert.equal(positionMinimum("0-16"), 0);
  assert.equal(positionMinimum("2"), 0);

  // Every code must have an English and a Russian message.
  const en = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "en.json"), "utf8"));
  const ru = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "ru.json"), "utf8"));
  for (const code of Object.values(VALIDATION_CODES)) {
    assert.ok(en[`validation.${code}`], `missing English message for ${code}`);
    assert.ok(ru[`validation.${code}`], `missing Russian message for ${code}`);
  }
});

// Owner ruling of 2026-10-19 (stage 07c, question 2): the 14-player limit counts EVERYONE on the roster —
// players sitting out the next match too. The minimum of 7 stays about the players who play it.
test("the 14-player maximum counts everyone on the roster, those sitting out included; the minimum counts only those who play", () => {
  const team = teamBySlug.get("teams/human");
  /** The violations of a roster of `playing` players, `skipping` of them marked for the next match, `retired` retired for the season. */
  const roster = (playing, skipping, retired = 0) => {
    const player = (id, flags = {}) => ({ id, rowIndex: 0, name: id, statMods: {}, extraSkills: [], spp: {}, advancements: [], ...flags });
    const draft = { roster: {}, playerEdits: {}, purchasedStaff: {}, treasury: 0, players: [
      ...Array.from({ length: playing }, (_, n) => player(`p${n}`)),
      ...Array.from({ length: skipping }, (_, n) => player(`s${n}`, { skipNextGame: true })),
      ...Array.from({ length: retired }, (_, n) => player(`r${n}`, { temporarilyRetired: true })) ] };
    return validateRosterSync(team, draft, calculateRosterCosts(team, draft)).filter((item) => item.code.startsWith("ROSTER_"));
  };
  assert.deepEqual(roster(12, 3), [{ code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 15 } }], "12 playing + 3 skipping are 15 on the roster");
  assert.deepEqual(roster(11, 3), [], "11 + 3 are 14: the limit itself is legal");
  assert.deepEqual(roster(13, 0, 2), [{ code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 15 } }], "a player retired for the season is on the roster still");
  assert.deepEqual(roster(14, 0), [], "14 who play are 14");
  assert.deepEqual(roster(5, 3), [{ code: "ROSTER_MIN_PLAYERS", params: { min: 7, count: 5 } }], "8 on the roster, 5 to play the match: the minimum counts the five");
  assert.deepEqual(roster(7, 7), [], "7 playing is the minimum, and 14 on the roster the maximum");
  assert.deepEqual(roster(2, 14), [{ code: "ROSTER_MIN_PLAYERS", params: { min: 7, count: 2 } }, { code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 16 } }], "both at once");
});

test("position limits are reported per position", () => {
  const team = teamBySlug.get("teams/amazon");
  const rows = team.team.roster;
  const overFilled = Object.fromEntries(rows.map((_row, index) => [index, 99]));
  const violations = validateRosterSync(team, { roster: overFilled }, { playersCount: 9, totalPlayersCount: 9 });
  assert.equal(violations.filter((item) => item.code === "POSITION_MAX").length, rows.length);
  for (const violation of violations.filter((item) => item.code === "POSITION_MAX")) {
    assert.ok(violation.params.position, "violation must name the position");
    assert.equal(typeof violation.params.max, "number");
  }
});

// Stage 12, decision 27: Starting and Team Re-rolls together are at most `combinedRerollsMaximum` (8) — a violation
// every write refuses (server/domain/roster.mjs, BLOCKING_CODES), read from the draft as normalised, where the first
// builder's `rerolls` is Starting Re-rolls.
test("nine re-rolls are refused on every write, eight are not", async () => {
  const { combinedRerollsMaximum } = await import("../src/domain/league-rules.mjs");
  const { normalizeDraft } = await import("../src/domain/roster/schema.mjs");
  const team = teamBySlug.get("teams/human");
  const legal = { playersCount: 11, totalPlayersCount: 11 };
  const rerolls = (draft) => validateRosterSync(team, { roster: {}, ...draft }, legal).filter((item) => item.code === "REROLLS_MAX");
  const nine = [{ code: "REROLLS_MAX", params: { max: 8, count: 9 } }];
  assert.equal(combinedRerollsMaximum, 8);
  assert.deepEqual(rerolls({ startingRerolls: 5, teamRerolls: 4 }), nine, "5 + 4");
  assert.deepEqual(rerolls({ startingRerolls: 8, teamRerolls: 1 }), nine, "8 + 1: each within its own maximum, not together");
  assert.deepEqual(rerolls({ startingRerolls: 0, teamRerolls: 12 }), [{ code: "REROLLS_MAX", params: { max: 8, count: 12 } }]);
  assert.deepEqual(rerolls({ startingRerolls: 4, teamRerolls: 4 }), [], "4 + 4 are eight");
  assert.deepEqual(rerolls({ startingRerolls: 8, teamRerolls: 0 }), [], "8 + 0");
  assert.deepEqual(rerolls({}), [], "none at all");
  assert.deepEqual(rerolls({ startingRerolls: "5", teamRerolls: "4" }), nine, "counted as the roster counts them");
  const legacy = normalizeDraft({ rerolls: 6, teamRerolls: 3 });
  assert.deepEqual(validateRosterSync(team, legacy, legal).filter((item) => item.code === "REROLLS_MAX"), nine, "2.x `rerolls` 6 + Team 3");
  assert.deepEqual(validateRosterSync(team, normalizeDraft({ rerolls: 5, teamRerolls: 3 }), legal).filter((item) => item.code === "REROLLS_MAX"), [], "2.x 5 + 3");
  // Its words, in both dictionaries (and through VALIDATION_CODES, "validation reports codes…" above checks every code).
  const { VALIDATION_CODES } = await import("../src/domain/roster/validate.mjs");
  assert.equal(VALIDATION_CODES.REROLLS_MAX, "REROLLS_MAX");
  const en = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "en.json"), "utf8"));
  const ru = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "ru.json"), "utf8"));
  assert.equal(en["validation.REROLLS_MAX"], "Starting and Team Re-rolls together: at most {max}, the team has {count}.");
  assert.equal(ru["validation.REROLLS_MAX"], "Start и Team Re-rolls вместе — не больше {max}, у команды {count}.");
});

// ---------------------------------------------------------------------------
// Advancements cannot be taken on credit.
// ---------------------------------------------------------------------------

test("canTakeAdvancement refuses to overspend SPP", async () => {
  const { canTakeAdvancement, ADVANCEMENT_BLOCKED } = await import("../src/domain/roster/progression.mjs");
  const team = teamBySlug.get("teams/amazon");

  // 4 MVPs = 20 SPP. Experienced primary costs 6, stat costs 14.
  const player = { spp: { mvps: 4 }, advancements: [] };
  assert.equal(canTakeAdvancement(team, player, "primary").allowed, true);
  assert.equal(canTakeAdvancement(team, player, "stat").allowed, true);

  // Spend 14 on a stat: 6 left. A Veteran primary now costs 8 — too much.
  player.advancements = [{ type: "stat" }];
  assert.equal(playerAvailableSpp(team, player), 6);
  const veteranPrimary = canTakeAdvancement(team, player, "primary");
  assert.equal(veteranPrimary.allowed, false);
  assert.equal(veteranPrimary.reason, ADVANCEMENT_BLOCKED.NOT_ENOUGH_SPP);
  assert.deepEqual(veteranPrimary.params, { cost: 8, available: 6, rank: "Veteran", missing: 2 });

  // A cheaper one at the same rank still fits.
  assert.equal(canTakeAdvancement(team, player, "random").allowed, true, "Veteran random costs 4");
});

test("canTakeAdvancement stops at the top rank and on unknown types", async () => {
  const { canTakeAdvancement, ADVANCEMENT_BLOCKED } = await import("../src/domain/roster/progression.mjs");
  const { advancementRanks } = await import("../src/domain/league-rules.mjs");
  const team = teamBySlug.get("teams/amazon");

  const maxed = { spp: { mvps: 200 }, advancements: advancementRanks.map(() => ({ type: "random" })) };
  const verdict = canTakeAdvancement(team, maxed, "random");
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, ADVANCEMENT_BLOCKED.MAX_LEVEL);

  const rookie = { spp: { mvps: 200 }, advancements: [] };
  const unknown = canTakeAdvancement(team, rookie, "nonsense");
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.reason, ADVANCEMENT_BLOCKED.UNKNOWN_TYPE);
});

test("every advancement block reason has a message in both locales", async () => {
  const { ADVANCEMENT_BLOCKED } = await import("../src/domain/roster/progression.mjs");
  const en = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "en.json"), "utf8"));
  const ru = JSON.parse(await fs.readFile(path.join(rootDir, "src", "i18n", "ru.json"), "utf8"));
  for (const reason of Object.values(ADVANCEMENT_BLOCKED)) {
    assert.ok(en[`validation.${reason}`], `missing English message for ${reason}`);
    assert.ok(ru[`validation.${reason}`], `missing Russian message for ${reason}`);
  }
});

// ---------------------------------------------------------------------------
// What a roster as sent breaks player by player, read before normalisation
// can hide it: an SPP counter outside 0…999, an id two players share.
// ---------------------------------------------------------------------------

test("every SPP counter of a player as sent, MVPs included, must be a whole number from 0 to 999, read as the roster reads it", async () => {
  const { playerViolations, VALIDATION_CODES } = await import("../src/domain/roster/validate.mjs");
  const out = (who, counter) => ({ code: VALIDATION_CODES.SPP_OUT_OF_RANGE, params: { ...who, counter } });
  const roster = { players: [
    { id: "a", name: "  Bo  ", rowIndex: 0, spp: { mvps: 2.5, bonus: 1000, casualties: -1, touchdowns: "100000", completions: 999, catches: "7", knockouts: null, throws: "abc", landings: 0 } },
    { rowIndex: 0, spp: { interceptions: 1000 } },
    { id: "b", name: " ", rowIndex: 0, spp: { touchdowns: "1e3", catches: 0.5 } },
    { id: "c", rowIndex: 0 },
  ] };
  // `player` and `counter` are what a person reads (the name, or the place in the list; the counter's short
  // label); `playerId`, or `row` for a player without an id, is what the client finds him by.
  const bo = { playerId: "a", player: "Bo" }, third = { playerId: "b", player: "#3" };
  assert.deepEqual(playerViolations(roster), [out(bo, "TD"), out(bo, "CAS"), out(bo, "BONUS"), out(bo, "MVP"),
    out({ row: 1, player: "#2" }, "INT"), out(third, "TD"), out(third, "CATCH")]);
  assert.deepEqual(playerViolations({ players: [{ id: "a", spp: { touchdowns: 999, mvps: 0, bonus: "12" } }] }), []);
  for (const shapeless of [{}, null, { players: "none" }, { players: [null, 7, { spp: "x" }] }]) assert.deepEqual(playerViolations(shapeless), [], JSON.stringify(shapeless));
});

test("two players under one id are refused once per id; players without an id never clash, and an id is read as the roster stores it", async () => {
  const { playerViolations, VALIDATION_CODES } = await import("../src/domain/roster/validate.mjs");
  const twice = (playerId, names) => ({ code: VALIDATION_CODES.DUPLICATE_PLAYER_ID, params: { playerId, names } });
  const players = (...ids) => ({ players: ids.map((id) => (id === undefined ? { rowIndex: 0 } : { id, rowIndex: 0 })) });
  const named = { players: [{ id: "a", name: "Bo" }, { id: "b" }, { id: "a", name: " Al " }, { id: "a" }, { id: "c" }, { id: "b", name: "Cy" }] };
  assert.deepEqual(playerViolations(named), [twice("a", "Bo, Al, #4"), twice("b", "#2, Cy")]);
  assert.deepEqual(playerViolations(players(undefined, undefined, "", "", null, null, 0, 0)), [], "no id is nobody's: the roster gives each his own");
  assert.deepEqual(playerViolations(players(5, "5")), [twice("5", "#1, #2")], "stored, both are \"5\"");
});

test("skillsForPlayer is what skillNamesForPlayer names, with where each came from", () => {
  const catcher = { skills: ["Catch", "Dodge"] };
  const player = {
    extraSkills: [{ name: "Frenzy", access: "primary" }, { name: "Dodge", access: "secondary" }, { name: "Block", access: "secondary" }],
    favouredSkills: [{ name: "Block" }, { name: "Tackle" }, "Wrestle"], isCaptain: true,
  };
  assert.deepEqual(skillsForPlayer(catcher, player), [
    { name: "Catch", access: "base" }, { name: "Dodge", access: "base" }, { name: "Frenzy", access: "primary" }, { name: "Block", access: "secondary" },
    { name: "Tackle", access: "favoured" }, { name: "Wrestle", access: "favoured" }, { name: "Pro", access: "captain" },
  ], "a skill he starts with is not an advancement's, and each name is listed once");
  assert.deepEqual(skillNamesForPlayer(catcher, player), skillsForPlayer(catcher, player).map(({ name }) => name));
  assert.deepEqual(skillsForPlayer(catcher, { extraSkills: [{ name: "Pro", access: "primary" }], isCaptain: true }).map(({ name, access }) => [name, access]),
    [["Catch", "base"], ["Dodge", "base"], ["Pro", "primary"]], "the captain's Pro, once, as the one he took");
  assert.deepEqual(skillsForPlayer({}, {}), []);
});

test("a position's kind is read from its tags: a big guy, a thrower, a catcher, a blitzer, else a lineman's", () => {
  assert.equal(positionKind({ tags: ["Ogre", "Big Guy"] }), "big");
  assert.equal(positionKind({ tags: ["Human", "Thrower"] }), "thrower");
  assert.equal(positionKind({ tags: ["Human", "Catcher"] }), "catcher");
  assert.equal(positionKind({ tags: ["Human", "Blitzer"] }), "blitzer");
  assert.equal(positionKind({ tags: ["Human", "Blocker"] }), "lineman");
  assert.equal(positionKind({}), "lineman");
  assert.equal(positionKind({ tags: ["Thrower", "Big Guy"] }), "big", "a big guy comes first, as the order of the tags in the list says");
});

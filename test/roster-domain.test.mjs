import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeCase, stableJson } from "./helpers/roster-cases.mjs";
import { calculateRosterCosts, playerCurrentCost, skillModCost, statModCost } from "../src/domain/roster/costs.mjs";
import { ensureDraftPlayers, selectedRosterPlayers } from "../src/domain/roster/players.mjs";
import { playerAvailableSpp, playerSppTotal, playerLevelRank } from "../src/domain/roster/progression.mjs";
import { teamHasSpecialRule } from "../src/domain/roster/team-rules.mjs";
import { costToNumber, countToNumber, rosterMax, rowCost } from "../src/domain/roster/values.mjs";
import { advancementStatCosts, builderStaffCosts } from "../src/domain/league-rules.mjs";
import { validateRoster as validateRosterSync } from "../src/domain/roster/validate.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(await fs.readFile(path.join(rootDir, "test", "fixtures", "roster-cases.json"), "utf8"));
const data = JSON.parse(await fs.readFile(path.join(rootDir, "public", "data.json"), "utf8"));
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

for (const item of cases) {
  test(`${item.team} / ${item.generation} matches the pinned baseline`, () => {
    const team = teamBySlug.get(item.team);
    assert.ok(team, `team ${item.team} is missing from public/data.json`);
    assert.deepEqual(describeCase(team, item.draft), item.expected);
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

  const tooFew = validateRoster(team, { roster: {} }, { playersCount: 3 });
  const min = tooFew.find((item) => item.code === VALIDATION_CODES.ROSTER_MIN_PLAYERS);
  assert.ok(min, "expected a minimum-players violation");
  assert.deepEqual(min.params, { min: 7, count: 3 });

  const tooMany = validateRoster(team, { roster: {} }, { playersCount: 12 });
  const max = tooMany.find((item) => item.code === VALIDATION_CODES.ROSTER_MAX_PLAYERS);
  assert.ok(max, "expected a maximum-players violation");
  assert.deepEqual(max.params, { max: 11, count: 12 });

  const legal = validateRoster(team, { roster: {} }, { playersCount: 9 });
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

test("position limits are reported per position", () => {
  const team = teamBySlug.get("teams/amazon");
  const rows = team.team.roster;
  const overFilled = Object.fromEntries(rows.map((_row, index) => [index, 99]));
  const violations = validateRosterSync(team, { roster: overFilled }, { playersCount: 9 });
  assert.equal(violations.filter((item) => item.code === "POSITION_MAX").length, rows.length);
  for (const violation of violations.filter((item) => item.code === "POSITION_MAX")) {
    assert.ok(violation.params.position, "violation must name the position");
    assert.equal(typeof violation.params.max, "number");
  }
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { expandCollections } from "../src/data/reference.mjs";
import * as model from "../src/screens/team/manage/model.mjs";

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const race = (slug) => data.teams.find((team) => team.slug === slug);
const human = race("teams/human"), goblin = race("teams/goblin"), necro = race("teams/necromantic-horror");
const ROSTER = { treasury: 500, startingRerolls: 1, teamRerolls: 1, dedicatedFans: 3, assistantCoaches: 1, cheerleaders: 6, apothecary: 0, purchasedStaff: { cheerleaders: 1 }, players: [] };
const rows = (input) => Object.fromEntries(model.resourceRows(input).map((row) => [row.key, row]));
const game = (over) => ({ id: "g1", home: { team: { id: "t1" } }, away: { team: { id: "r1" } }, preparationStatus: "not_started", postMatchStatus: "not_started", resultStatus: "pending", ...over });
const leagueGame = (over) => game({ kind: "league", preparationStatus: "ready", roundStatus: "started", roundNumber: 3, season: { currentRound: 3 }, ...over });
const LIVE = { preparationStatus: "in_progress", postMatchStatus: "draft" };
const check = (over) => model.moneyCheck({ treasury: 70, sign: 1, amountText: "20", reason: "friendly", note: "", ...over });

test("an active team: Starting rerolls closed whole by the stage, Team Rerolls on sale, fans after matches, bribes only with Bribery and Corruption, the race's medics", () => {
  const list = model.resourceRows({ race: human, roster: ROSTER, stage: "active" });
  assert.deepEqual(list.map(({ key, kind, lock }) => [key, kind, lock]), [
    ["startingRerolls", "counter", "stage"], ["teamRerolls", "counter", null], ["dedicatedFans", "counter", "fans"],
    ["assistantCoaches", "counter", null], ["cheerleaders", "counter", null], ["bribes", "counter", "unavailable"], ["apothecary", "medic", null]]);
  assert.equal(rows({ race: goblin, roster: ROSTER, stage: "active" }).bribes.lock, null);
  assert.deepEqual(model.resourceRows({ race: necro, roster: ROSTER, stage: "active" }).filter((row) => row.kind === "medic").map((row) => row.key), ["mortuaryAssistant"]);
});

test("a team in the build: the other way round", () => {
  const draft = rows({ race: human, roster: ROSTER, stage: "draft" });
  assert.deepEqual([draft.startingRerolls.lock, draft.teamRerolls.lock, draft.dedicatedFans.lock], [null, "stage", "fans"]);
});

test("a stage nobody knows sells neither re-roll; an unknown race sells no bribes and no medic, and does not crash", () => {
  const unknown = rows({ race: human, roster: ROSTER, stage: undefined });
  assert.deepEqual([unknown.startingRerolls.lock, unknown.teamRerolls.lock], ["stage", "stage"]);
  const list = model.resourceRows({ race: null, roster: ROSTER, stage: "active" });
  assert.equal(list.find((row) => row.key === "bribes").lock, "unavailable");
  assert.equal(list.some((row) => row.kind === "medic"), false);
});

test("«+» says no at the maximum and when the treasury cannot pay; «−» is off at zero and gives back only what was bought", () => {
  const rich = rows({ race: human, roster: ROSTER, stage: "active" });
  assert.equal(rich.cheerleaders.incRefusal, "max");
  assert.deepEqual([rich.cheerleaders.refund, rich.assistantCoaches.refund], [10, 0]);
  assert.equal(rich.teamRerolls.refund, 120, "a team saved before purchases were recorded bought every Team Reroll");
  const poor = rows({ race: human, roster: { ...ROSTER, treasury: 50 }, stage: "active" });
  assert.deepEqual([poor.teamRerolls.incRefusal, poor.assistantCoaches.incRefusal], ["short", null]);
  assert.equal(rows({ race: human, roster: { ...ROSTER, apothecary: 0 }, stage: "active" }).apothecary.decDisabled, true);
});

test("a row carries the figures the page prints: the count, the price and the maximum of the rules, the room the treasury leaves", () => {
  const { teamRerolls, apothecary } = rows({ race: human, roster: ROSTER, stage: "active" });
  assert.deepEqual([teamRerolls.value, teamRerolls.price, teamRerolls.max, teamRerolls.decDisabled], [1, 120, 7, false], "8 re-rolls in all, one of them a Starting one");
  assert.deepEqual([apothecary.value, apothecary.price, apothecary.max], [0, 50, 1]);
  assert.equal(rows({ race: human, roster: { ...ROSTER, treasury: 120 }, stage: "active" }).teamRerolls.incRefusal, null, "a treasury exactly the price can pay");
  assert.equal(rows({ race: human, roster: { ...ROSTER, apothecary: 1 }, stage: "active" }).apothecary.incRefusal, "max");
});

test("Starting and Team rerolls together are 8, as the post-match flow counts them: each one's room is what the other leaves", () => {
  const room = (over) => rows({ race: human, roster: { ...ROSTER, ...over }, stage: "active" });
  const [three, five] = [room({ startingRerolls: 3, teamRerolls: 5 }), room({ startingRerolls: 0, teamRerolls: 5 })];
  assert.deepEqual([three.teamRerolls.max, three.startingRerolls.max], [5, 3]);
  assert.deepEqual([three.teamRerolls.incRefusal, five.teamRerolls.incRefusal], ["max", null], "eight in all: no ninth; five alone: room for three more");
  assert.deepEqual([five.teamRerolls.max, five.startingRerolls.max], [8, 3]);
  const over = room({ startingRerolls: 6, teamRerolls: 4 });
  assert.deepEqual([over.teamRerolls.max, over.startingRerolls.max], [2, 4], "a team already over the line has no room, and is not given a negative one");
  assert.equal(over.teamRerolls.incRefusal, "max");
  assert.equal(model.stepResource({ race: human, roster: { ...ROSTER, startingRerolls: 3, teamRerolls: 5 }, stage: "active", key: "teamRerolls", delta: 1 }).refused.incRefusal, "max");
  assert.equal(model.stepResource({ race: human, roster: { ...ROSTER, startingRerolls: 5, teamRerolls: 3 }, stage: "draft", key: "startingRerolls", delta: 1 }).refused.incRefusal, "max");
  assert.equal(room({ startingRerolls: 0, teamRerolls: 8 }).teamRerolls.max, 8);
  assert.equal(room({}).assistantCoaches.max, 6, "the other counters keep their own maximum");
});

test("a count stored under the first builder's name is still read", () => {
  const legacy = { ...ROSTER, startingRerolls: undefined, rerolls: 2 };
  assert.equal(rows({ race: human, roster: legacy, stage: "draft" }).startingRerolls.value, 2);
  assert.equal(model.stepResource({ race: human, roster: legacy, stage: "draft", key: "startingRerolls", delta: 1 }).roster.startingRerolls, 3);
});

test("a live match closes every row, and a race without bribes keeps «unavailable» to the end", () => {
  const live = rows({ race: human, roster: ROSTER, stage: "active", locked: true });
  assert.ok(Object.values(live).every((row) => row.lock !== null), "every row is closed");
  assert.deepEqual(Object.values(live).filter((row) => row.lock === "live").map((row) => row.key),
    ["startingRerolls", "teamRerolls", "dedicatedFans", "assistantCoaches", "cheerleaders", "apothecary"]);
  assert.equal(live.bribes.lock, "unavailable", "it does not open after the match, so «after the post-match» would lie");
  assert.equal(rows({ race: goblin, roster: ROSTER, stage: "active", locked: true }).bribes.lock, "live");
  assert.equal(Object.values(live).every((row) => row.incRefusal === null), true, "a closed row says nothing about «+»");
});

test("a step spends and refunds as the 2.x editor does, and leaves the roster it was given alone", () => {
  const before = structuredClone(ROSTER);
  const { roster } = model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "teamRerolls", delta: 1 });
  assert.deepEqual([roster.teamRerolls, roster.treasury, roster.purchasedStaff.teamRerolls], [2, 380, 2]);
  assert.deepEqual(ROSTER, before);
  const medic = model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "apothecary", delta: 1 }).roster;
  assert.deepEqual([medic.apothecary, medic.treasury], [1, 450]);
  const back = model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "assistantCoaches", delta: -1 }).roster;
  assert.deepEqual([back.assistantCoaches, back.treasury], [0, 500], "nothing bought, nothing back");
  const refund = model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "cheerleaders", delta: -1 }).roster;
  assert.deepEqual([refund.cheerleaders, refund.treasury, refund.purchasedStaff.cheerleaders], [5, 510, 0], "a bought one is paid back and no longer counts as bought");
});

test("a closed or refused step is no step", () => {
  assert.equal(model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "startingRerolls", delta: -1 }).refused.lock, "stage");
  assert.equal(model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "cheerleaders", delta: 1 }).refused.incRefusal, "max");
  assert.equal(model.stepResource({ race: human, roster: { ...ROSTER, treasury: 50 }, stage: "active", key: "teamRerolls", delta: 1 }).refused.incRefusal, "short");
  assert.equal(model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "apothecary", delta: -1 }).refused.decDisabled, true);
  assert.equal(model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "teamRerolls", delta: 1, locked: true }).refused.lock, "live");
  assert.equal(model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "bribes", delta: 1 }).refused.lock, "unavailable");
  assert.throws(() => model.stepResource({ race: human, roster: ROSTER, stage: "active", key: "plagueDoctor", delta: 1 }), /plagueDoctor/, "a counter the page does not draw is a mistake of the caller");
});

test("a stage-closed counter lets «−» take back a purchase on record, and only that (the server refuses growth alone)", () => {
  const bought = { ...ROSTER, startingRerolls: 2, purchasedStaff: { startingRerolls: 1 } };
  const step = (input) => model.stepResource({ race: human, roster: bought, stage: "active", key: "startingRerolls", ...input });
  const { roster } = step({ delta: -1 });
  assert.deepEqual([roster.startingRerolls, roster.treasury, roster.purchasedStaff.startingRerolls], [1, 560, 0], "paid back and no longer on record");
  assert.equal(step({ delta: 1 }).refused.lock, "stage", "«+» stays shut");
  assert.equal(step({ delta: -1, roster: { ...bought, purchasedStaff: {} } }).refused.lock, "stage", "nothing on record: the row is closed whole, a re-roll that cannot be bought back is not dropped");
  assert.equal(step({ delta: -1, roster: { ...bought, startingRerolls: 0 } }).refused.decDisabled, true, "nothing to take back at zero");
  // A match on comes before the stage (final T3): the purchase on record does not open «−» while it is on.
  const live = step({ delta: -1, locked: true });
  assert.equal(live.roster, undefined, "nothing to send");
  assert.equal(live.refused.lock, "live");
  assert.equal(model.stepResource({ race: human, roster: { ...ROSTER, teamRerolls: 2, purchasedStaff: { teamRerolls: 2 } }, stage: "draft", key: "teamRerolls", delta: -1 }).roster.treasury, 620, "the other re-roll, the other stage");
});

test("«−» works on a row only when the row is open, or stage-closed with a purchase on record", () => {
  const bought = { ...ROSTER, bribes: 1, dedicatedFans: 3, apothecary: 1, purchasedStaff: { bribes: 1, startingRerolls: 1, apothecary: 1 } };
  const canStepDown = (input, key) => model.canStepDown(rows({ roster: bought, stage: "active", ...input })[key]);
  assert.deepEqual(["teamRerolls", "startingRerolls", "assistantCoaches", "apothecary"].map((key) => canStepDown({ race: human }, key)), [true, true, true, true],
    "open, or closed by the stage with a purchase on record");
  assert.equal(canStepDown({ race: human }, "dedicatedFans"), false, "the fans move after matches only");
  assert.equal(canStepDown({ race: human }, "bribes"), false, "a race without bribes keeps its bribes closed whatever was bought");
  assert.equal(canStepDown({ race: goblin, locked: true }, "bribes"), false, "a match on closes «−» whole, a purchase on record or not");
  assert.equal(canStepDown({ race: human, locked: true }, "startingRerolls"), false);
  assert.equal(model.canStepDown(rows({ race: human, roster: ROSTER, stage: "active" }).startingRerolls), false, "closed by the stage and nothing on record");
});

test("a match on locks, a preparation warns, another team's match or a finished one says nothing", () => {
  assert.equal(model.matchLock([game(LIVE)], "t1").kind, "live");
  assert.equal(model.matchLock([game({ preparationStatus: "ready" })], "t1").kind, "preparing");
  assert.equal(model.matchLock([game(LIVE)], "t9"), null);
  assert.equal(model.matchLock([game({ preparationStatus: "in_progress", postMatchStatus: "completed" })], "t1"), null);
});

test("a match on beats a preparation whichever comes first, and the lock names the game", () => {
  const preparing = game({ id: "g1", preparationStatus: "preparing" });
  const live = game({ id: "g2", ...LIVE });
  assert.deepEqual(model.matchLock([preparing, live], "t1"), { kind: "live", game: live });
  assert.deepEqual(model.matchLock([preparing], "t1"), { kind: "preparing", game: preparing });
  assert.equal(model.matchLock([game({ id: "g3" })], "t1"), null, "a match not begun warns of nothing");
  assert.equal(model.matchLock([], "t1"), null);
});

test("of two matches on, the lock names the one the SideNav card shows: a league match before a friendly, then the freshest", () => {
  const friendly = game({ id: "f1", kind: "friendly", updatedAt: "2026-10-18T12:00:00Z", ...LIVE });
  const old = leagueGame({ id: "l1", updatedAt: "2026-10-17T12:00:00Z", ...LIVE });
  const fresh = leagueGame({ id: "l2", updatedAt: "2026-10-18T12:00:00Z", ...LIVE });
  assert.equal(model.matchLock([friendly, old], "t1").game.id, "l1", "the league match, though the friendly is fresher and first");
  assert.equal(model.matchLock([old, fresh, friendly], "t1").game.id, "l2");
});

test("a preparation in a round the players can no longer play warns of nothing, as the SideNav card rules", () => {
  assert.equal(model.matchLock([leagueGame({})], "t1").kind, "preparing");
  assert.equal(model.matchLock([leagueGame({ season: { currentRound: 4 } })], "t1"), null, "the round has moved on");
  assert.equal(model.matchLock([leagueGame({ roundStatus: "completed" })], "t1"), null, "the round is over");
  assert.equal(model.matchLock([leagueGame({ kind: "friendly", resultStatus: "confirmed" })], "t1"), null, "a friendly with its score confirmed");
  assert.equal(model.matchLock([leagueGame({ kind: "friendly" })], "t1").kind, "preparing");
});

test("the phase follows the stage: a build, a season with its round, or neither", () => {
  const season = { season: { currentRound: 3 } };
  assert.deepEqual(model.phaseOf({ stage: "draft" }, season), { key: "draft", round: null });
  assert.deepEqual(model.phaseOf({ stage: "active", inActiveSeason: true }, season), { key: "season", round: 3 });
  assert.deepEqual(model.phaseOf({ stage: "active", inActiveSeason: false }, season), { key: "out", round: null });
});

test("a season whose first round has not begun has no round to name, never «round 0»", () => {
  const team = { stage: "active", inActiveSeason: true };
  for (const seasonData of [{ season: { currentRound: 0 } }, { season: { currentRound: null } }, { season: {} }, { season: null }, null, undefined]) {
    assert.deepEqual(model.phaseOf(team, seasonData), { key: "season", round: null }, JSON.stringify(seasonData));
  }
  assert.deepEqual(model.phaseOf({ stage: "draft", inActiveSeason: true }, { season: { currentRound: 3 } }), { key: "draft", round: null }, "a build is a build whatever the table says");
});

test("amounts are read with a dot or a comma, to the tenth of a thousand, and nothing else", () => {
  assert.deepEqual(["20", " 42,5 ", "12.5", "0.5", "0", "", "-5", "0.05", "0.005", "1.0005", "1e3", "abc"].map(model.readAmount),
    [20, 42.5, 12.5, 0.5, 0, null, null, null, null, null, null, null]);
});

test("the check says what the button waits for, in order", () => {
  assert.deepEqual(check({}), { delta: 20, after: 90, short: 0, problem: null });
  assert.equal(check({ amountText: "0" }).problem, "amount");
  assert.equal(check({ amountText: "100001" }).problem, "tooMuch");
  assert.equal(check({ reason: "" }).problem, "reason");
  assert.equal(check({ reason: "gift" }).problem, "reason", "a reason the server does not know");
  assert.equal(check({ note: "x".repeat(201) }).problem, "note");
  assert.deepEqual(check({ sign: -1, amountText: "80" }), { delta: -80, after: -10, short: 10, problem: "short" });
});

test("the check reads what is typed without drifting, and each problem comes before the next", () => {
  assert.deepEqual(check({ amountText: "0,3" }), { delta: 0.3, after: 70.3, short: 0, problem: null }, "70 + 0.3 is 70.3, not 70.30000000000001");
  assert.deepEqual(check({ amountText: "", reason: "" }), { delta: null, after: 70, short: 0, problem: "amount" }, "no sum yet: the treasury as it is");
  assert.equal(Object.is(check({ sign: -1, amountText: "0" }).delta, 0), true, "a debit of nothing is 0, not −0");
  assert.equal(check({ amountText: "100000" }).problem, null, "the largest entry is allowed");
  assert.equal(check({ amountText: "100000.1" }).problem, "tooMuch");
  assert.equal(check({ amountText: "20.05" }).problem, "amount", "a second decimal is no amount, not a rounded one");
  assert.equal(check({ note: "x".repeat(200) }).problem, null);
  assert.equal(check({ note: `  ${"x".repeat(200)}  ` }).problem, null, "the spaces around a note are not counted");
  assert.equal(check({ sign: -1, amountText: "80", reason: "", note: "x".repeat(201) }).problem, "reason", "a missing reason is said before a long note, and before the shortfall");
  assert.equal(check({ sign: -1, amountText: "80", note: "x".repeat(201) }).problem, "note");
  assert.equal(check({ sign: -1, amountText: "70" }).problem, null, "a debit that empties the treasury is allowed");
  assert.equal(check({ treasury: "70", amountText: "5" }).after, 75, "a treasury sent as text still adds up");
});

test("an amount too large to enter is not added up: the treasury stays as it is, however many digits are typed", () => {
  const untouched = { delta: null, after: 70, short: 0, problem: "tooMuch" };
  assert.deepEqual(check({ amountText: "9".repeat(400) }), untouched);
  assert.deepEqual(check({ sign: -1, amountText: "9".repeat(400) }), untouched, "a debit of Infinity is no shortfall");
  assert.deepEqual(check({ sign: -1, amountText: "100000.1" }), untouched);
  assert.deepEqual(check({ sign: -1, amountText: "100000" }), { delta: -100000, after: -99930, short: 99930, problem: "short" }, "the largest entry still adds up");
});

test("the last deposit to the safe is the newest «safe» line", () => {
  assert.deepEqual(model.lastSafeDeposit([{ kind: "manual", delta: 5 }, { kind: "safe", delta: -20, createdAt: "b" }, { kind: "safe", delta: -10, createdAt: "a" }]), { amount: 20, createdAt: "b" });
  assert.equal(model.lastSafeDeposit([]), null);
  assert.equal(model.lastSafeDeposit([{ kind: "manual", delta: 5 }]), null);
});

test("the counters the page edits, in the order it draws them", () => {
  assert.deepEqual(model.COUNTER_KEYS, ["startingRerolls", "teamRerolls", "dedicatedFans", "assistantCoaches", "cheerleaders", "bribes"]);
  assert.deepEqual([model.MAX_ENTRY, model.MAX_NOTE], [100000, 200]);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { expandCollections } from "../src/data/reference.mjs";
import {
  EXTRA_COUNTERS, MAIN_COUNTERS, SORT_KEYS, counterSlots, nextSort, rosterCounts, rosterLines, rosterMode, sortLines, stepRule,
} from "../src/screens/team/roster/model.mjs";
import { currentMatch } from "../src/shell/current-match.mjs";

// Not test/helpers/ui.mjs's: that sets up a document and the dictionaries, and a model that reached for either would go unnoticed.
const HOSTILE = `<img src=x onerror="alert(1)"> & 'Grak'`;
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const race = (slug) => data.teams.find((team) => team.slug === slug);
// The rows of Human: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 4 Halfling Hopeful, 5 Ogre. Dwarf: 0 Blocker, 1 Runner, 2 Blitzer, 3 Troll Slayer, 4 Deathroller.
// Chaos Dwarfs: 5 Minotaur, whose PA the vault writes as a dash ("—"), where the Troll Slayer's is a hyphen.
const HUMAN = race("teams/human");
const DWARF = race("teams/dwarf");
const CHAOS_DWARFS = race("teams/chaos-dwarfs");

const player = (rowIndex, over = {}) => ({ id: `p${rowIndex}`, rowIndex, number: String(rowIndex + 1), ...over });
const PLAIN = { kind: "plain" };
const MATCH = { kind: "match", game: { id: "g2" }, round: 7 };
const PREP = { kind: "prep", game: { id: "g3" }, round: 7 };
/** The lines of a roster of Human (or of `over.race`), in the mode the test names. */
const linesOf = (players, over = {}) => rosterLines({ draft: { players }, race: HUMAN, mode: PLAIN, ...over });
/** One row of match_events as GET …/events sends it: outside any match and not settled unless said. */
const row = (playerId, counter, delta, over = {}) => ({ playerId, counter, delta, pairingId: null, settledAt: null, injury: null, ...over });
const SETTLED = "2026-10-01T10:00:00Z";

test("the slots are six main counters and a row of three, a fourth where catches earn SPP; each is worth what the race says", () => {
  const worth = (slug) => Object.fromEntries([...counterSlots(race(slug)).main, ...counterSlots(race(slug)).extra].map(({ key, spp }) => [key, spp]));
  assert.deepEqual(counterSlots(race("teams/human")).main.map(({ key }) => key), MAIN_COUNTERS);
  assert.deepEqual(counterSlots(race("teams/human")).extra.map(({ key }) => key), ["throws", "landings", "bonus"]);
  assert.deepEqual([...MAIN_COUNTERS, ...EXTRA_COUNTERS], ["touchdowns", "casualties", "completions", "knockouts", "interceptions", "mvps", "throws", "landings", "bonus"]);
  assert.deepEqual([worth("teams/human").touchdowns, worth("teams/human").mvps], [3, 5]);
  assert.deepEqual([worth("teams/orc").touchdowns, worth("teams/orc").casualties], [2, 3], "Brawlin' Brutes");
  assert.deepEqual(counterSlots(race("teams/wood-elves")).extra.map(({ key }) => key), ["throws", "landings", "bonus", "catches"], "Passing Virtuosos");
  assert.equal(worth("teams/wood-elves").catches, 1);
});

// Games as /api/games sends them; t1 is at home against r1 unless said otherwise. Live = preparationStatus in_progress and a post-match draft.
const side = (id) => ({ user: { id: `u-${id}`, login: id }, team: { id, name: id } });
const rivalSide = side("r2");
const game = (id, over = {}) => ({
  id, kind: "league", roundStatus: "started", roundNumber: 7, season: { currentRound: 7 }, resultStatus: "pending",
  preparationStatus: "not_started", postMatchStatus: "not_started", updatedAt: "2026-10-10T10:00:00Z", home: side("t1"), away: side("r1"), ...over,
});
const LIVE = { preparationStatus: "in_progress", postMatchStatus: "draft" };

test("the mode is the team's live match, else a preparation that is on, else none; a closed game or another team's is none", () => {
  assert.equal(rosterMode([game("g1"), game("g2", LIVE)], "t1").game.id, "g2");
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing" })], "t1").kind, "prep");
  assert.equal(rosterMode([game("g1", { preparationStatus: "ready", kind: "friendly", season: null })], "t1").round, null);
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing", roundStatus: "completed" })], "t1").kind, "plain");
  assert.equal(rosterMode([game("g1", { preparationStatus: "in_progress", home: rivalSide })], "t1").kind, "plain");
  assert.equal(rosterMode([game("gx", { preparationStatus: "in_progress", postMatchStatus: "not_started", resultStatus: "confirmed" })], "t1").kind, "plain",
    "a score confirmed around the post-match is no match on (isMatchLive)");
});

test("the mode: nothing on is plain; the round is the game's, none for a friendly; a bye and an earlier round are not on", () => {
  assert.deepEqual(rosterMode([], "t1"), { kind: "plain" });
  assert.deepEqual(rosterMode([game("g1")], "t1"), { kind: "plain" }, "a match not begun is no preparation");
  const live = rosterMode([game("g2", LIVE)], "t1");
  assert.deepEqual([live.kind, live.round, live.game.id], ["match", 7, "g2"]);
  const friendly = rosterMode([game("g4", { ...LIVE, kind: "friendly", season: null, roundNumber: null })], "t1");
  assert.deepEqual([friendly.kind, friendly.round], ["match", null]);
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing", away: null })], "t1").kind, "plain", "a bye");
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing", roundNumber: 6 })], "t1").kind, "plain", "an earlier round of a season past it");
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing", kind: "friendly", season: null, resultStatus: "confirmed" })], "t1").kind, "plain", "a played friendly");
});

test("a match on beats a preparation; league beats friendly and then the freshest wins, as the SideNav's card picks", () => {
  const friendly = { kind: "friendly", season: null, roundNumber: null };
  assert.equal(rosterMode([game("p", { preparationStatus: "preparing" }), game("m", LIVE)], "t1").game.id, "m");
  assert.equal(rosterMode([game("f", { ...LIVE, ...friendly, updatedAt: "2026-10-12T10:00:00Z" }), game("l", LIVE)], "t1").game.id, "l");
  assert.equal(rosterMode([game("old", { ...LIVE, updatedAt: "2026-10-09T10:00:00Z" }), game("new", { ...LIVE, updatedAt: "2026-10-11T10:00:00Z" })], "t1").game.id, "new");
  assert.equal(rosterMode([game("f", { preparationStatus: "ready", ...friendly }), game("l", { preparationStatus: "preparing" })], "t1").game.id, "l");
  assert.equal(rosterMode([game("f", { preparationStatus: "ready", ...friendly })], "t1").round, null);
});

test("the match on is the one the SideNav's card and stage 08's lock pick: currentMatch's live game", () => {
  const friendly = { kind: "friendly", season: null, roundNumber: null };
  const sets = {
    "two live league matches": [game("old", { ...LIVE, updatedAt: "2026-10-09T10:00:00Z" }), game("new", { ...LIVE, updatedAt: "2026-10-11T10:00:00Z" })],
    "the same, the fresher first": [game("new", { ...LIVE, updatedAt: "2026-10-11T10:00:00Z" }), game("old", { ...LIVE, updatedAt: "2026-10-09T10:00:00Z" })],
    "a league match and a fresher friendly": [game("f", { ...LIVE, ...friendly, updatedAt: "2026-10-12T10:00:00Z" }), game("l", LIVE)],
    "a friendly and an older league match, the friendly first": [game("l", { ...LIVE, updatedAt: "2026-10-01T10:00:00Z" }), game("f", { ...LIVE, ...friendly })],
    "two live friendlies": [game("a", { ...LIVE, ...friendly, updatedAt: "2026-10-09T10:00:00Z" }), game("b", { ...LIVE, ...friendly, updatedAt: "2026-10-10T10:00:00Z" })],
    "a stamp that cannot be read": [game("a", { ...LIVE, updatedAt: "soon" }), game("b", { ...LIVE, updatedAt: "2026-10-09T10:00:00Z" })],
    "a live match among others": [game("n"), game("p", { preparationStatus: "preparing" }), game("m", LIVE), game("x", { ...LIVE, home: rivalSide })],
    "a score confirmed around the post-match": [game("c", { ...LIVE, postMatchStatus: "not_started", resultStatus: "confirmed" }), game("m", LIVE)],
  };
  for (const [name, games] of Object.entries(sets)) {
    const current = currentMatch(games, "t1");
    assert.equal(current.phase, "live", name);
    assert.equal(rosterMode(games, "t1").game, current.game, name);
    assert.equal(rosterMode(games, "t1").kind, "match", name);
  }
  // Where the card has no match on, neither has the roster.
  for (const games of [[], [game("g1")], [game("p", { preparationStatus: "ready" })], [game("x", { ...LIVE, home: rivalSide })]]) {
    assert.notEqual(rosterMode(games, "t1").kind, "match");
    assert.notEqual(currentMatch(games, "t1")?.phase, "live");
  }
});

test("a line is what the roster and the unsettled rows say: the career, the match's own, and the blob with the edits waiting", () => {
  const events = [
    row("p0", "touchdowns", 1, { pairingId: "g2" }),
    row("p0", "touchdowns", 1),
    row("p0", "touchdowns", 1, { settledAt: SETTLED }),
  ];
  const [line] = linesOf([player(0, { spp: { touchdowns: 2 } })], { mode: MATCH, events });
  assert.equal(line.blob.touchdowns, 2);
  assert.equal(line.career.touchdowns, 4);
  assert.equal(line.match.touchdowns, 1);
  assert.equal(line.waiting.touchdowns, 3);
  assert.equal(line.matchSpp, 3);
  assert.deepEqual([line.match.mvps, line.career.mvps, line.waiting.mvps], [0, 0, 0], "every counter of the roster is there, the MVP too");
});

test("outside a match the match's own rows are nothing, and another match's rows are in the career but in no part of this one", () => {
  const events = [row("p0", "casualties", 1, { pairingId: "g2" }), row("p0", "casualties", 1, { pairingId: "g9" })];
  const [plain] = linesOf([player(0)], { events });
  assert.deepEqual([plain.career.casualties, plain.match.casualties, plain.waiting.casualties, plain.matchSpp], [2, 0, 0, 0]);
  const [live] = linesOf([player(0)], { mode: MATCH, events });
  assert.deepEqual([live.career.casualties, live.match.casualties, live.waiting.casualties, live.matchSpp], [2, 1, 0, 2]);
});

test("a line says who the player is: his place, number, position, colour, cost and what he may take", () => {
  const [lineman, catcher] = linesOf([player(0), player(2, { number: "9", name: "Ashby", statMods: { ag: 1 } })]);
  assert.deepEqual([lineman.key, lineman.id, lineman.index, lineman.number, lineman.name, lineman.position, lineman.kind],
    ["p0#0", "p0", 0, "1", "Human Lineman 1", "Human Lineman", "lineman"]);
  assert.deepEqual([lineman.primary, lineman.secondary, lineman.value], [["General"], ["Agility", "Strength", "Devious"], 50]);
  assert.deepEqual([catcher.key, catcher.number, catcher.name, catcher.position, catcher.kind], ["p2#1", "9", "Ashby", "Catcher", "catcher"]);
  assert.equal(catcher.value, 75 + 40, "the price and a characteristic raised");
  assert.deepEqual([lineman.captain, lineman.skip, lineman.injury], [false, false, null]);
  const [ogre, captain, absent] = linesOf([player(5), player(3, { isCaptain: true }), player(1, { skipNextGame: true })]);
  assert.equal(ogre.kind, "big");
  assert.deepEqual([captain.captain, captain.kind, absent.skip], [true, "blitzer", true]);
});

test("the minus of each kind of edit stops where the server would refuse it", () => {
  const withBlob = (count, events = [], mode = PLAIN) => linesOf([player(0, { spp: { touchdowns: count } })], { events, mode })[0];
  // Outside a match: the blob's counter. A career of 1 made of a row waiting is no blob to take from.
  const plain = withBlob(0, [row("p0", "touchdowns", 1)]);
  assert.equal(plain.career.touchdowns, 1);
  assert.deepEqual(stepRule(plain, "touchdowns", { mode: PLAIN }), { via: "roster", decDisabled: true, incBlocked: "", locked: "" });
  assert.equal(stepRule(withBlob(1), "touchdowns", { mode: PLAIN }).decDisabled, false);
  assert.deepEqual(stepRule(withBlob(1), "touchdowns", { mode: PREP }), { via: "roster", decDisabled: false, incBlocked: "", locked: "" }, "a preparation is no match");
  // In a match: the match's own rows, whatever the career.
  const tapped = withBlob(3, [], MATCH);
  assert.equal(tapped.career.touchdowns, 3);
  assert.deepEqual(stepRule(tapped, "touchdowns", { mode: MATCH }), { via: "match", decDisabled: true, incBlocked: "", locked: "" });
  const scored = withBlob(3, [row("p0", "touchdowns", 1, { pairingId: "g2" })], MATCH);
  assert.equal(stepRule(scored, "touchdowns", { mode: MATCH }).decDisabled, false);
  // An edit outside the match, made in one: the blob and the edits waiting.
  const taken = withBlob(1, [row("p0", "touchdowns", -1)], MATCH);
  assert.equal(taken.waiting.touchdowns, 0);
  assert.deepEqual(stepRule(taken, "touchdowns", { mode: MATCH, outside: true }), { via: "outside", decDisabled: true, incBlocked: "", locked: "" });
  assert.equal(stepRule(withBlob(2, [row("p0", "touchdowns", -1)], MATCH), "touchdowns", { mode: MATCH, outside: true }).decDisabled, false);
  assert.equal(stepRule(withBlob(0, [], MATCH), "touchdowns", { mode: MATCH, outside: true }).decDisabled, true);
});

test("the MVP is not tapped in a match, a player who sits it out is not in it; an edit outside the match does both", () => {
  const [line, absent] = linesOf([player(0, { spp: { mvps: 1 } }), player(1, { skipNextGame: true })], { mode: MATCH });
  assert.equal(stepRule(line, "mvps", { mode: MATCH }).incBlocked, "mvp");
  assert.equal(stepRule(line, "mvps", { mode: MATCH, outside: true }).incBlocked, "");
  assert.equal(stepRule(line, "touchdowns", { mode: MATCH }).incBlocked, "");
  assert.equal(stepRule(line, "mvps", { mode: PLAIN }).incBlocked, "", "outside a match the MVP is a count like the rest");
  assert.equal(stepRule(line, "touchdowns", { mode: MATCH }).locked, "");
  assert.equal(stepRule(absent, "touchdowns", { mode: MATCH }).locked, "notPlaying");
  assert.equal(stepRule(absent, "touchdowns", { mode: MATCH, outside: true }).locked, "");
  assert.equal(stepRule(absent, "touchdowns", { mode: PLAIN }).locked, "");
  assert.equal(stepRule(absent, "touchdowns", { mode: PREP }).locked, "");
});

test("a characteristic raised or lowered is marked; AG and PA read the other way", () => {
  const [catcher, lineman] = linesOf([player(2, { statMods: { ag: 1, ar: -1 } }), player(0)]);
  assert.deepEqual(catcher.stats.ag, { text: "2+", change: "up", order: 2 });
  assert.deepEqual(catcher.stats.ar, { text: "7+", change: "down", order: 7 });
  assert.deepEqual(catcher.stats.ma, { text: "8", change: "", order: 8 });
  assert.deepEqual(lineman.stats.pa, { text: "4+", change: "", order: 4 });
  assert.deepEqual(Object.keys(lineman.stats), ["ma", "st", "ag", "pa", "ar"]);
  const [lowered, raised] = linesOf([player(0, { statMods: { ma: -1, pa: -1 } }), player(1, { statMods: { st: 1 } })]);
  assert.deepEqual([lowered.stats.ma.text, lowered.stats.ma.change], ["5", "down"]);
  assert.deepEqual([lowered.stats.pa.text, lowered.stats.pa.change], ["5+", "down"], "a worse target is lowered");
  assert.deepEqual([raised.stats.st.text, raised.stats.st.change], ["4", "up"]);
  const [slayer] = rosterLines({ draft: { players: [player(3)] }, race: DWARF, mode: PLAIN });
  assert.deepEqual(slayer.stats.pa, { text: "–", change: "", order: null }, "a dash like the StatStrip's, not the vault's hyphen");
  const [advanced] = rosterLines({ draft: { players: [player(3, { statMods: { pa: 1 } })] }, race: DWARF, mode: PLAIN });
  assert.deepEqual(advanced.stats.pa, { text: "–", change: "", order: null }, "nothing to raise in a characteristic he has not");
  assert.deepEqual(linesOf([player(0, { statMods: { ma: "x" } })])[0].stats.ma, { text: "6", change: "", order: 6 }, "a modifier that is no number is none");
});

test("a characteristic the vault writes as a dash is none, whichever dash it is", () => {
  const [minotaur, raised] = rosterLines({ draft: { players: [player(5), player(5, { id: "p5b", statMods: { pa: 1 } })] }, race: CHAOS_DWARFS, mode: PLAIN });
  assert.equal(CHAOS_DWARFS.team.roster[5].pa, "—", "the em dash, as the vault has it");
  assert.deepEqual(minotaur.stats.pa, { text: "–", change: "", order: null });
  assert.deepEqual(raised.stats.pa, { text: "–", change: "", order: null }, "nothing to raise in a characteristic he has not");
  assert.deepEqual([minotaur.stats.ag.text, minotaur.stats.ar.text], ["4+", "9+"], "the rest are as written");
  const slayer = rosterLines({ draft: { players: [3, 4].map((at) => player(at)) }, race: DWARF, mode: PLAIN });
  assert.deepEqual(slayer.map((line) => line.stats.pa), [{ text: "–", change: "", order: null }, { text: "–", change: "", order: null }], "and the hyphen still is");
  const sorted = sortLines(rosterLines({ draft: { players: [player(5), player(0, { id: "p0" })] }, race: CHAOS_DWARFS, mode: PLAIN }), { key: "pa", dir: "desc" });
  assert.deepEqual(sorted.map(({ index }) => index), [1, 0], "a Minotaur is last by PA both ways");
});

test("skills come with where they came from, and the captain's Pro once", () => {
  const [captain] = linesOf([player(3, { extraSkills: [{ name: "Mighty Blow", access: "primary" }], isCaptain: true })]);
  assert.deepEqual(captain.skills.map(({ name, source }) => [name, source]), [["Block", "base"], ["Tackle", "base"], ["Mighty Blow", "primary"], ["Pro", "captain"]]);
  assert.deepEqual(captain.skills.filter(({ gained }) => gained).map(({ name }) => name), ["Mighty Blow"]);
  const [taken] = linesOf([player(3, { extraSkills: [{ name: "Pro", access: "primary" }], isCaptain: true })]);
  assert.deepEqual(taken.skills.filter(({ name }) => name === "Pro"), [{ name: "Pro", gained: true, source: "primary" }], "one Pro, the one he took");
});

test("skills: a secondary and a favoured one are gained, one he starts with is not listed twice, a player with none has an empty list", () => {
  const [line] = linesOf([player(3, {
    extraSkills: [{ name: "Dodge", access: "secondary" }, { name: "Block", access: "primary" }],
    favouredSkills: [{ name: "Frenzy" }, { name: "Dodge" }],
  })]);
  assert.deepEqual(line.skills, [
    { name: "Block", gained: false, source: "base" }, { name: "Tackle", gained: false, source: "base" },
    { name: "Dodge", gained: true, source: "secondary" }, { name: "Frenzy", gained: true, source: "favoured" },
  ]);
  assert.deepEqual(linesOf([player(0)])[0].skills, []);
});

test("SPP: earned from the career, spent on advancements, the cheapest next one, and who can advance", () => {
  const [fresh, advanced, legend, short] = linesOf([
    player(0, { spp: { touchdowns: 2, mvps: 1 } }),
    player(1, { spp: { touchdowns: 2, mvps: 1 }, advancements: [{ type: "random" }] }),
    player(2, { spp: { touchdowns: 999 }, advancements: Array.from({ length: 6 }, () => ({ type: "random" })) }),
    player(3, { spp: { completions: 2 } }),
  ]);
  assert.equal(fresh.earned, 11, "2 touchdowns of 3 and an MVP of 5");
  assert.deepEqual([fresh.spent, fresh.available, fresh.level, fresh.cheapest, fresh.ready], [0, 11, 0, 3, true]);
  assert.deepEqual([advanced.earned, advanced.spent, advanced.available, advanced.level, advanced.cheapest, advanced.ready], [11, 3, 8, 1, 4, true], "the second rank's random skill");
  assert.deepEqual([legend.level, legend.cheapest, legend.ready], [6, null, false], "nothing left to take, whatever he has earned");
  assert.deepEqual([short.earned, short.available, short.cheapest, short.ready], [2, 2, 3, false]);
});

test("SPP follow the career: a row waiting counts, and the race's worth of a counter", () => {
  const [line] = linesOf([player(0, { spp: { touchdowns: 1 } })], { events: [row("p0", "touchdowns", 1, { pairingId: "g2" })] });
  assert.deepEqual([line.earned, line.available], [6, 6]);
  const [brute] = rosterLines({ draft: { players: [player(0, { spp: { touchdowns: 1, casualties: 1 } })] }, race: race("teams/orc"), mode: PLAIN });
  assert.equal(brute.earned, 2 + 3, "Brawlin' Brutes");
});

test("sorting: numbers down, AG and PA up, a missing PA last both ways, a tie in roster order; the second press turns it round", () => {
  assert.deepEqual(nextSort(null, "ma"), { key: "ma", dir: "desc" });
  assert.deepEqual(nextSort({ key: "ma", dir: "desc" }, "ma"), { key: "ma", dir: "asc" });
  assert.deepEqual(nextSort({ key: "ma", dir: "asc" }, "ma"), { key: "ma", dir: "desc" });
  assert.deepEqual(nextSort(null, "ag"), { key: "ag", dir: "asc" });
  assert.deepEqual(nextSort(null, "pa"), { key: "pa", dir: "asc" });
  assert.deepEqual(nextSort(null, "player"), { key: "player", dir: "asc" });
  assert.deepEqual(nextSort({ key: "pa", dir: "asc" }, "pa"), { key: "pa", dir: "desc" });
  assert.deepEqual(nextSort({ key: "ag", dir: "asc" }, "ma"), { key: "ma", dir: "desc" }, "another column starts afresh");
  for (const key of SORT_KEYS) assert.equal(nextSort(null, key).key, key);
  assert.throws(() => nextSort(null, "value"), /unknown sort key/);

  const dwarves = rosterLines({ draft: { players: [0, 1, 2, 3, 4].map((at) => player(at)) }, race: DWARF, mode: PLAIN });
  const order = (lines, sort) => sortLines(lines, sort).map(({ index }) => index);
  // PA: Blocker 6+, Runner 4+, Blitzer 4+, and the Troll Slayer and the Deathroller have none.
  assert.deepEqual(order(dwarves, { key: "pa", dir: "asc" }), [1, 2, 0, 3, 4]);
  assert.deepEqual(order(dwarves, { key: "pa", dir: "desc" }), [0, 1, 2, 3, 4]);
  // MA: 4, 6, 5, 5, 4
  assert.deepEqual(order(dwarves, { key: "ma", dir: "desc" }), [1, 2, 3, 0, 4], "equal MA in roster order");
  assert.deepEqual(order(dwarves, { key: "ma", dir: "asc" }), [0, 4, 2, 3, 1], "and in roster order again going up");
  // The tie is broken by the place in the roster, not by where the lines happen to lie.
  const reversed = [...dwarves].reverse();
  assert.deepEqual(order(reversed, { key: "ma", dir: "desc" }), [1, 2, 3, 0, 4]);
  assert.deepEqual(order(reversed, { key: "pa", dir: "desc" }), [0, 1, 2, 3, 4]);
});

test("sorting by the other columns: the number as a number, the career counters, the SPP", () => {
  const lines = linesOf([
    player(0, { number: "10", spp: { touchdowns: 1 } }),
    player(1, { number: "2", spp: { casualties: 2 }, advancements: [{ type: "random" }] }),
    player(2, { number: "", spp: { touchdowns: 3 } }),
    player(3, { number: "2", spp: { touchdowns: 1 } }),
  ]);
  const order = (key, dir) => sortLines(lines, { key, dir }).map(({ index }) => index);
  assert.deepEqual(order("player", "asc"), [1, 3, 0, 2], "2, 2 (roster order), 10, and a player with no number last");
  assert.deepEqual(order("player", "desc"), [0, 1, 3, 2]);
  assert.deepEqual(order("touchdowns", "desc"), [2, 0, 3, 1]);
  assert.deepEqual(order("touchdowns", "asc"), [1, 0, 3, 2]);
  assert.deepEqual(order("earned", "desc"), [2, 1, 0, 3], "9 (3 touchdowns), 4 (2 casualties), then the two with 3");
  assert.deepEqual(order("available", "desc"), [2, 0, 3, 1], "the advancement he took costs him 3 of his 4");
  assert.throws(() => sortLines(lines, { key: "value", dir: "asc" }), /unknown sort key/);
  assert.throws(() => sortLines(lines, { key: "ma", dir: "up" }), /unknown sort direction/);
});

test("no sort is the roster's order, and a sort is a copy: the lines it was given stay as they were", () => {
  const lines = linesOf([player(0), player(1), player(2)]);
  const shuffled = [lines[2], lines[0], lines[1]];
  assert.deepEqual(sortLines(shuffled, null).map(({ index }) => index), [0, 1, 2]);
  const sorted = sortLines(lines, { key: "ma", dir: "desc" });
  assert.notEqual(sorted, lines);
  assert.deepEqual(lines.map(({ index }) => index), [0, 1, 2]);
  assert.notEqual(sortLines(lines, null), lines);
});

test("the standing injury of the match is the last one not taken back", () => {
  const injury = (delta, value) => row("p0", "injury", delta, { pairingId: "g2", injury: value });
  const events = [injury(1, { code: "lasting", stat: "ag" }), injury(1, { code: "miss" }), injury(-1, { code: "miss" })];
  assert.deepEqual(linesOf([player(0)], { mode: MATCH, events })[0].injury, { code: "lasting", stat: "ag" });
  assert.equal(linesOf([player(0)], { mode: PLAIN, events })[0].injury, null, "outside a match there is none");
  assert.deepEqual(linesOf([player(0)], { mode: MATCH, events: [injury(1, { code: "miss" })] })[0].injury, { code: "miss" });
  assert.equal(linesOf([player(0)], { mode: MATCH, events: [injury(1, { code: "miss" }), injury(-1, { code: "miss" })] })[0].injury, null);
  assert.equal(linesOf([player(0)], { mode: MATCH, events: [{ ...injury(1, { code: "miss" }), pairingId: "g9" }] })[0].injury, null, "another match's");
  assert.equal(linesOf([player(0)], { mode: MATCH, events: [{ ...injury(1, { code: "miss" }), settledAt: SETTLED }] })[0].injury, null, "a settled one");
  assert.equal(linesOf([player(0), player(1)], { mode: MATCH, events })[1].injury, null, "his own only");
});

test("an odd roster: no race, a row the race has not, a shared id, a missing PA", () => {
  assert.deepEqual(rosterLines({ draft: { players: [player(0)] }, race: null, mode: PLAIN }), []);
  assert.deepEqual(rosterLines({ draft: { players: [] }, race: HUMAN, mode: PLAIN }), []);
  assert.deepEqual(rosterLines({ draft: {}, race: HUMAN, mode: PLAIN }), []);
  const gap = linesOf([player(0), player(99), player(2)]);
  assert.deepEqual(gap.map(({ key }) => key), ["p0#0", "p2#2"], "nobody for a row the race has not, and the places stay as they were stored");
  const shared = linesOf([player(0, { id: "dup" }), player(1, { id: "dup" })]);
  assert.deepEqual(shared.map(({ key, id }) => [key, id]), [["dup#0", "dup"], ["dup#1", "dup"]]);
  assert.equal(linesOf([player(0, { name: HOSTILE })])[0].name, HOSTILE, "the markup escapes it, the model does not");
  assert.equal(rosterLines({ draft: { players: [player(3)] }, race: DWARF, mode: PLAIN })[0].stats.pa.order, null);
});

test("an id is the text a write names: a 2.x number, a blank in it, none at all", () => {
  const events = [row("5", "touchdowns", 1)];
  const [numbered] = linesOf([player(0, { id: 5 })], { events });
  assert.deepEqual([numbered.id, numbered.key, numbered.career.touchdowns], ["5", "5#0", 1], "his rows are named by the text of his id");
  const [spaced] = linesOf([player(0, { id: "a b\tc" })]);
  assert.deepEqual([spaced.id, spaced.key], ["a b\tc", "a_b_c#0"], "a blank would make a list of the id of his panel");
  const [nameless, other] = linesOf([player(0, { id: undefined }), player(1)], { events: [row("p1", "touchdowns", 1)] });
  assert.deepEqual([nameless.id, nameless.key, nameless.career.touchdowns, other.key, other.career.touchdowns], ["", "#0", 0, "p1#1", 1], "nobody can name him, so no row is his");
  const [odd] = linesOf([player(0, { id: "constructor" })], { mode: MATCH, events: [row("constructor", "touchdowns", 1, { pairingId: "g2" })] });
  assert.deepEqual([odd.injury, odd.match.touchdowns], [null, 1]);
});

test("counts: the roster, those who miss a match, those who can advance", () => {
  const lines = linesOf([player(0, { spp: { touchdowns: 1 } }), player(1, { skipNextGame: true }), player(2)]);
  assert.deepEqual(rosterCounts(lines), { players: 3, skipping: 1, ready: 1 });
  assert.deepEqual(rosterCounts([]), { players: 0, skipping: 0, ready: 0 });
});

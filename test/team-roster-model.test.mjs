import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { expandCollections } from "../src/data/reference.mjs";
import { ADVANCEMENT_TYPES } from "../src/domain/roster/progression.mjs";
import {
  EXTRA_COUNTERS, MAIN_COUNTERS, SORT_KEYS, counterSlots, fallenLines, nextSort, rosterCounts, rosterLines, rosterMode, rosterSections, sortLines, stepRule, undoable,
} from "../src/screens/team/roster/model.mjs";
import { currentMatch } from "../src/shell/current-match.mjs";

// Not test/helpers/ui.mjs's: that sets up a document and the dictionaries, and a model that reached for either would go unnoticed.
const HOSTILE = `<img src=x onerror="alert(1)"> & 'Grak'`;
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const race = (slug) => data.teams.find((team) => team.slug === slug);
const { skillGroups } = data;
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
  assert.deepEqual([catcher.key, catcher.number, catcher.name, catcher.position, catcher.kind], ["p2#0", "9", "Ashby", "Catcher", "catcher"]);
  assert.equal(catcher.value, 75 + 40, "the price and a characteristic raised");
  assert.deepEqual([lineman.captain, lineman.skip, lineman.injury], [false, false, null]);
  const [ogre, captain, absent] = linesOf([player(5), player(3, { isCaptain: true }), player(1, { skipNextGame: true })]);
  assert.equal(ogre.kind, "big");
  assert.deepEqual([captain.captain, captain.kind, absent.skip], [true, "blitzer", true]);
});

/** Eight Human players with ids of their own: a Catcher with a skill he took, then linemen; `over` is the first's. */
const eightHumans = (over = {}) => [player(2, over), ...Array.from({ length: 7 }, (_, at) => player(0, { id: `m${at}`, number: String(at + 2) }))];

test("a line says what letting him go brings back, and whether the roster may lose him", () => {
  const block = [{ name: "Block", access: "primary" }];
  const [catcher, ...linemen] = linesOf(eightHumans({ extraSkills: block }));
  assert.equal(catcher.price, 75, "his position's price, in thousands, not his value");
  assert.equal(catcher.value, 95);
  assert.deepEqual(catcher.removal, { type: "sell", amount: 47.5, blocked: false }, "half his value, the advancement's worth too");
  assert.deepEqual([linemen[0].price, linemen[0].removal], [50, { type: "sell", amount: 25, blocked: false }]);
  const bought = linesOf(eightHumans({ purchased: true, purchaseRefund: 50 }))[0];
  assert.deepEqual(bought.removal, { type: "cancel-purchase", amount: 50, blocked: false }, "what he was bought for, not half of it");
  assert.equal(bought.price, 75);
  const seven = eightHumans({ extraSkills: block, id: "c" }).slice(1);
  assert.deepEqual(linesOf(seven)[0].removal, { type: "sell", amount: 25, blocked: true }, "a sale would leave fewer than seven");
  const [left, ...rest] = linesOf([player(2, { id: "c", purchased: true, purchaseRefund: 50 }), ...seven.slice(1)]);
  assert.deepEqual([left.removal.type, left.removal.blocked], ["cancel-purchase", false], "a purchase is cancelled at seven (the owner's Q1)");
  assert.deepEqual(rest.map(({ removal }) => removal.blocked), rest.map(() => true), "the others cannot be sold");
  assert.equal(linesOf([player(2, { id: "c", purchased: true })])[0].removal.type, "sell", "a purchased flag with no refund is no purchase to cancel");
});

test("the seven a sale leaves is everyone on the roster: those who miss the next match count", () => {
  const missing = (players) => players.map((one, at) => (at < 3 ? { ...one, skipNextGame: true } : one));
  assert.deepEqual(linesOf(missing(eightHumans())).map(({ removal }) => removal.blocked), eightHumans().map(() => false), "eight, three of them out, may lose one");
  assert.deepEqual(linesOf(missing(eightHumans().slice(1))).map(({ removal }) => removal.blocked), eightHumans().slice(1).map(() => true), "seven may not");
});

test("Architect of Fate: his full value and his injuries", () => {
  const TZEENTCH = race("teams/tzeentch");
  const horrors = (over = {}) => [player(1, { id: "h0", ...over }), ...Array.from({ length: 7 }, (_, at) => player(1, { id: `h${at + 1}`, number: String(at + 2) }))];
  const [hurt, whole] = rosterLines({ draft: { players: horrors({ nigglingInjuries: 1 }) }, race: TZEENTCH, mode: PLAIN });
  assert.deepEqual([hurt.position, hurt.price, hurt.value], ["Pink Horror", 75, 75]);
  assert.deepEqual(hurt.removal, { type: "sell", amount: 85, blocked: false }, "his value and ten for the injury");
  assert.equal(whole.removal.amount, 75, "his full value, not half");
  const maimed = rosterLines({ draft: { players: horrors({ nigglingInjuries: 1, injuryStatMods: { ma: -1, st: -1 } }) }, race: TZEENTCH })[0];
  assert.equal(maimed.removal.amount, 75 + 30, "a niggling injury and two lost points of characteristics");
  assert.equal(linesOf(eightHumans({ nigglingInjuries: 2 }))[0].removal.amount, 37.5, "any other team gets half and nothing for injuries");
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
  assert.deepEqual(taken.skills.filter(({ name }) => name === "Pro"), [{ name: "Pro", gained: true, source: "primary", advancement: null }], "one Pro, the one he took");
});

test("skills: a secondary and a favoured one are gained, one he starts with is not listed twice, a player with none has an empty list", () => {
  const [line] = linesOf([player(3, {
    extraSkills: [{ name: "Dodge", access: "secondary" }, { name: "Block", access: "primary" }],
    favouredSkills: [{ name: "Frenzy" }, { name: "Dodge" }],
  })]);
  assert.deepEqual(line.skills, [
    { name: "Block", gained: false, source: "base", advancement: null }, { name: "Tackle", gained: false, source: "base", advancement: null },
    { name: "Dodge", gained: true, source: "secondary", advancement: null }, { name: "Frenzy", gained: true, source: "favoured", advancement: null },
  ]);
  assert.deepEqual(linesOf([player(0)])[0].skills, []);
});

test("a line lists his advancements in order: its type, what it granted, how it was rolled, what it cost", () => {
  const [line] = linesOf([player(3, { advancements: [
    { type: "random", grants: { skill: "Frenzy" }, roll: { id: "r1", via: "site" } },
    { type: "stat", grants: { stat: "ma" }, roll: { via: "table" } },
    { type: "primary", grants: { skill: "Block" } },
    { type: "secondary" },
  ] })]);
  assert.deepEqual(line.advancements, [
    { type: "random", grants: { skill: "Frenzy" }, via: "site", rollId: "r1", cost: 3 },
    { type: "stat", grants: { stat: "ma" }, via: "table", rollId: "", cost: 16 },
    { type: "primary", grants: { skill: "Block" }, via: "", rollId: "", cost: 12 },
    { type: "secondary", grants: null, via: "", rollId: "", cost: 20 },
  ], "the price of the rank each was taken at; one that granted nothing says so");
  assert.deepEqual(linesOf([player(3)])[0].advancements, []);
});

test("what each type of advancement costs him now is the roster's own SPP, not the career", () => {
  const [line] = linesOf([player(3, { spp: { touchdowns: 2 } })], { events: [1, 2, 3].map(() => row("p3", "touchdowns", 1)), skillGroups });
  assert.deepEqual([line.earned, line.available], [15, 15], "the career counts the edit outside a match");
  assert.equal(line.offers.available, 6, "the roster's own: two touchdowns of three");
  assert.deepEqual(line.offers.offers.map(({ type, cost }) => [type, cost]), [["random", 3], ["primary", 6], ["secondary", 10], ["stat", 14]]);
  assert.deepEqual(line.offers.offers.map(({ refusal }) => refusal?.code ?? null), [null, null, "ADVANCEMENT_NOT_ENOUGH_SPP", "ADVANCEMENT_NOT_ENOUGH_SPP"]);
  assert.deepEqual([line.offers.level, line.offers.maxed], [0, false]);
});

test("until the Skill Table comes in, a line's offers are unknown, never «no skill left»", () => {
  const players = [player(3, { spp: { touchdowns: 5 } }), player(2, { spp: { mvps: 4 }, advancements: [{ type: "random" }] })];
  const unknown = linesOf(players);
  assert.deepEqual(unknown.map(({ offers }) => offers), [null, null], "no Skill Table, so nobody can say what a skill type leaves");
  assert.deepEqual(linesOf(players, { skillGroups: null }).map(({ offers }) => offers), [null, null]);
  assert.equal(JSON.stringify(unknown).includes("NO_SKILL_LEFT"), false);
  const known = linesOf(players, { skillGroups });
  assert.deepEqual(known.map(({ offers }) => offers.offers.map(({ type }) => type)), [ADVANCEMENT_TYPES, ADVANCEMENT_TYPES]);
  assert.deepEqual(known[0].offers.offers.map(({ refusal }) => refusal), [null, null, null, null], "with the table, what he can pay for is offered");
  assert.deepEqual(known.map(({ offers }) => offers.level), [0, 1]);
});

test("his injuries: Niggling Injuries and each characteristic a lasting injury took", () => {
  const [hurt] = linesOf([player(3, { nigglingInjuries: 2, injuryStatMods: { ag: -1, ma: -2 } })]);
  assert.deepEqual(hurt.injuries, { niggling: 2, lasting: [{ stat: "ma", count: 2 }, { stat: "ag", count: 1 }] }, "in the order of the characteristics");
  assert.deepEqual(linesOf([player(3, { niglingInjury: true })])[0].injuries, { niggling: 1, lasting: [] }, "a 2.x flag is one");
  assert.deepEqual(linesOf([player(3)])[0].injuries, { niggling: 0, lasting: [] });
});

test("a skill an advancement granted knows which", () => {
  const [catcher] = linesOf([player(2, {
    extraSkills: [{ name: "Frenzy", access: "primary" }, { name: "Dodge", access: "secondary" }],
    advancements: [{ type: "stat", grants: { stat: "ma" } }, { type: "primary", grants: { skill: "Frenzy" } }],
  })]);
  assert.deepEqual(catcher.skills.map(({ name, advancement }) => [name, advancement]), [["Catch", null], ["Dodge", null], ["Frenzy", 1]],
    "Frenzy is the second advancement; Catch and Dodge are the position's, and a Dodge written as an advancement's is not listed twice");
  const [odd] = linesOf([player(2, { favouredSkills: [{ name: "Frenzy" }], isCaptain: true, advancements: [{ type: "random", grants: { skill: "Frenzy" } }, { type: "random", grants: { skill: "Catch" } }, { type: "random", grants: { skill: "Pro" } }] })]);
  assert.deepEqual(odd.skills.map(({ name, source, advancement }) => [name, source, advancement]),
    [["Catch", "base", null], ["Dodge", "base", null], ["Frenzy", "favoured", null], ["Pro", "captain", null]],
    "what the position, a god and the captaincy gave was granted by none, whatever an advancement is written to have granted");
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
  assert.deepEqual(gap.map(({ key, index }) => [key, index]), [["p0#0", 0], ["p2#0", 2]], "nobody for a row the race has not, and the places stay as they were stored");
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
  assert.deepEqual([nameless.id, nameless.key, nameless.career.touchdowns, other.key, other.career.touchdowns], ["", "#0", 0, "p1#0", 1], "nobody can name him, so no row is his");
  const [odd] = linesOf([player(0, { id: "constructor" })], { mode: MATCH, events: [row("constructor", "touchdowns", 1, { pairingId: "g2" })] });
  assert.deepEqual([odd.injury, odd.match.touchdowns], [null, 1]);
});

// The final review's row keys (T8): a key is not the player's place, so a place taken out of the roster re-keys nobody.
test("a key is the id and how many before him share it: a player taken out re-keys nobody after him", () => {
  const roster = [player(0), player(3, { id: "dup" }), player(2), player(1, { id: "dup" }), player(5)];
  const keys = (players) => linesOf(players).map(({ key }) => key);
  assert.deepEqual(keys(roster), ["p0#0", "dup#0", "p2#0", "dup#1", "p5#0"]);
  assert.deepEqual(keys(roster.slice(1)), ["dup#0", "p2#0", "dup#1", "p5#0"], "the first gone, the rest keep theirs");
  assert.deepEqual(keys([roster[0], roster[2], roster[3], roster[4]]), ["p0#0", "p2#0", "dup#0", "p5#0"], "the first twin gone, the other is the first of the id now");
  // Ids a blank alone tells apart make the same key: they are counted as one, so the keys stay apart.
  assert.deepEqual(keys([player(0, { id: "a b" }), player(1, { id: "a_b" }), player(2, { id: "a\tb" })]), ["a_b#0", "a_b#1", "a_b#2"]);
});

test("counts: the roster, those who miss a match, those who can advance", () => {
  const lines = linesOf([player(0, { spp: { touchdowns: 1 } }), player(1, { skipNextGame: true }), player(2)]);
  assert.deepEqual(rosterCounts(lines), { players: 3, skipping: 1, ready: 1 });
  assert.deepEqual(rosterCounts([]), { players: 0, skipping: 0, ready: 0 });
});

test("a line says why he misses the match, and whether he is retired for the season", () => {
  const [niggling, lasting, noReason, retired, playing, stale] = linesOf([
    player(0, { skipNextGame: true, absence: { code: "niggling" } }),
    player(1, { skipNextGame: true, absence: { code: "lasting", stat: "ag", pairingId: "g2", extra: 1 } }),
    player(2, { skipNextGame: true }),
    player(3, { temporarilyRetired: true }),
    player(4),
    player(5, { absence: { code: "miss", note: "left over" } }),
  ]);
  assert.deepEqual([niggling.skip, niggling.absence, niggling.retired], [true, { code: "niggling" }, false]);
  assert.deepEqual(lasting.absence, { code: "lasting", stat: "ag", pairingId: "g2" }, "as the roster reads it: a code, a characteristic, the match, nothing else");
  assert.deepEqual([noReason.skip, noReason.absence, noReason.retired], [true, null, false], "a 2.x skip has no reason");
  assert.deepEqual([retired.skip, retired.retired, retired.absence], [true, true, null], "a temporary retirement misses the match, and the season");
  assert.deepEqual([playing.skip, playing.retired, playing.absence], [false, false, null]);
  assert.equal(stale.absence, null, "a reason that is left over on a player who plays is none");
  assert.deepEqual(linesOf([player(0, { skipNextGame: true, absence: { code: "dead" } })])[0].absence, null, "an unknown code is none");
});

test("the roster in two: those who play the next match, then those who miss it, each in the roster's order", () => {
  const lines = linesOf([player(0, { skipNextGame: true }), player(1), player(2, { temporarilyRetired: true }), player(3), player(4, { skipNextGame: true })]);
  const sections = rosterSections(lines);
  assert.deepEqual(Object.keys(sections), ["active", "skipping"]);
  assert.deepEqual(sections.active.map(({ index }) => index), [1, 3]);
  assert.deepEqual(sections.skipping.map(({ index }) => index), [0, 2, 4]);
  assert.equal(sections.active[0], lines[1], "the lines themselves, not copies");
  const shuffled = sortLines(lines, { key: "player", dir: "desc" });
  assert.deepEqual(rosterSections(shuffled).skipping.map(({ index }) => index), [4, 2, 0], "the order it is given");
  assert.deepEqual(rosterSections([]), { active: [], skipping: [] });
});

/** A record as GET /api/teams/:id/fallen sends it. */
const died = (id, snapshot, over = {}) => ({ id, player: snapshot, cause: "Foul", pairingId: null, roundNumber: null, diedAt: "2026-10-18T10:00:00Z", fromMatch: false, ...over });

test("the fallen as lines: what the roster held when he died, the cause and how it was recorded", () => {
  const record = { id: "f1", player: { id: "d1", rowIndex: 3, number: "8", name: "Pike", spp: { touchdowns: 2 } }, cause: "Foul", pairingId: null, roundNumber: null, diedAt: "2026-10-18T10:00:00Z", fromMatch: false };
  const before = structuredClone(record);
  const [line] = fallenLines({ fallen: [record], race: race("teams/human") });
  assert.deepEqual([line.key, line.id, line.name, line.position, line.career.touchdowns, line.earned], ["fallen-f1", "d1", "Pike", "Blitzer", 2, 6]);
  assert.deepEqual(line.fallen, { id: "f1", cause: "Foul", fromMatch: false, round: null, diedAt: "2026-10-18T10:00:00Z" });
  assert.deepEqual(line.skills.map(({ name }) => name), ["Block", "Tackle"]);
  assert.deepEqual([line.skip, line.captain, line.ready], [false, false, false]);
  assert.deepEqual(record, before, "the record is only read");
  assert.deepEqual([line.number, line.kind, line.index, line.injury, line.absence, line.retired], ["8", "blitzer", 0, null, null, false]);
  assert.deepEqual([line.stats.ma.text, line.value], ["7", 80], "his position's characteristics and his price, as the roster reads them");
  assert.deepEqual(Object.values(line.match), Object.values(line.match).map(() => 0), "no match is on for the dead");
  assert.deepEqual([line.matchSpp, line.outsideSpp], [0, 0]);
});

test("a fallen line is the roster's own line made for the dead: nothing he could still do, and the same fields", () => {
  const snapshot = { id: "d1", rowIndex: 3, number: "8", name: "Pike", skipNextGame: true, absence: { code: "niggling" }, isCaptain: true, spp: { casualties: 4 } };
  const [dead] = fallenLines({ fallen: [died("f1", snapshot, { roundNumber: 7, fromMatch: true, cause: null })], race: HUMAN });
  const [alive] = linesOf([snapshot]);
  assert.deepEqual(Object.keys(dead).sort(), [...Object.keys(alive), "bare", "fallen"].sort());
  assert.equal(dead.bare, false, "the race reads him");
  assert.deepEqual([dead.skip, dead.captain, dead.ready, dead.injury, dead.absence, dead.retired], [false, false, false, null, null, false], "he is not marked, not the captain, not about to advance");
  assert.deepEqual(dead.fallen, { id: "f1", cause: null, fromMatch: true, round: 7, diedAt: "2026-10-18T10:00:00Z" });
  assert.deepEqual([dead.career.casualties, dead.blob.casualties, dead.waiting.casualties, dead.earned], [4, 4, 4, 8], "the career is the counters of the snapshot, no rows");
  assert.equal(fallenLines({ fallen: [died("f2", snapshot, { cause: undefined })], race: HUMAN })[0].fallen.cause, null, "a cause the server did not send is none");
  assert.deepEqual(fallenLines({ fallen: [died("f3", snapshot, { roundNumber: undefined })], race: HUMAN })[0].fallen.round, null);
});

test("a dead captain is no captain: neither the mark nor the captain's Pro, which goes with the captaincy (R1)", () => {
  const captain = { id: "d1", rowIndex: 3, number: "8", name: "Pike", isCaptain: true, extraSkills: [{ name: "Mighty Blow", access: "primary" }] };
  const [dead] = fallenLines({ fallen: [died("f1", captain)], race: HUMAN });
  assert.deepEqual(dead.skills.map(({ name, source }) => [name, source]), [["Block", "base"], ["Tackle", "base"], ["Mighty Blow", "primary"]]);
  assert.equal(dead.captain, false);
  const [took] = fallenLines({ fallen: [died("f2", { ...captain, extraSkills: [{ name: "Pro", access: "secondary" }] })], race: HUMAN });
  assert.deepEqual(took.skills.filter(({ name }) => name === "Pro"), [{ name: "Pro", gained: true, source: "secondary", advancement: null }], "a Pro he took is his");
  assert.deepEqual(linesOf([captain])[0].skills.at(-1), { name: "Pro", gained: false, source: "captain", advancement: null }, "the living captain keeps it");
});

test("no race, no lines; the places are those of the server's list", () => {
  assert.deepEqual(fallenLines({ fallen: [died("f1", { id: "d1", rowIndex: 0 })], race: null }), []);
  assert.deepEqual(fallenLines({ fallen: [], race: HUMAN }), []);
  assert.deepEqual(fallenLines({ fallen: undefined, race: HUMAN }), []);
  const lines = fallenLines({ fallen: [died("a", { id: "x", rowIndex: 0 }), died("b", { id: "y", rowIndex: 1 }), died("c", { id: "z", rowIndex: 2 })], race: HUMAN });
  assert.deepEqual(lines.map(({ key, index }) => [key, index]), [["fallen-a", 0], ["fallen-b", 1], ["fallen-c", 2]]);
});

test("a fallen record the roster cannot read is a line all the same: his name, dashes and no skills", () => {
  const records = [
    died("f1", { id: "d1", number: "3", name: "No Row" }),
    died("f2", { id: "d2", rowIndex: 99, number: "4", name: "Far Row", spp: { touchdowns: 9 } }),
    died("f3", { name: "Old Joe", position: "Lineman", number: 5 }),
  ];
  const lines = fallenLines({ fallen: records, race: HUMAN });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map(({ key }) => key), ["fallen-f1", "fallen-f2", "fallen-f3"]);
  for (const line of lines) {
    assert.deepEqual(line.stats.ma, { text: "–", change: "", order: null });
    assert.deepEqual(Object.keys(line.stats), ["ma", "st", "ag", "pa", "ar"]);
    assert.deepEqual([line.skills, line.primary, line.secondary, line.earned, line.spent, line.available, line.level], [[], [], [], 0, 0, 0, 0]);
    assert.deepEqual([line.kind, line.cheapest, line.ready, line.value, line.matchSpp, line.outsideSpp, line.injury], ["lineman", null, false, 0, 0, 0, null]);
    assert.deepEqual([line.skip, line.captain, line.absence, line.retired], [false, false, null, false]);
  }
  assert.deepEqual(lines.map(({ id, number, name, position }) => [id, number, name, position]),
    [["d1", "3", "No Row", ""], ["d2", "4", "Far Row", ""], ["", "5", "Old Joe", "Lineman"]], "the text of the snapshot, a number as text, none as nothing");
  assert.deepEqual(lines[1].career, lines[2].career);
  assert.deepEqual(Object.values(lines[1].career), Object.values(lines[1].career).map(() => 0), "a counter nobody can price is not shown");
  const read = fallenLines({ fallen: [died("f4", { id: "d4", rowIndex: 3 })], race: HUMAN })[0];
  for (const field of ["blob", "career", "match", "waiting"]) assert.deepEqual(Object.keys(lines[0][field]), Object.keys(read[field]), field);
  assert.deepEqual(Object.keys(lines[0]).sort(), Object.keys(read).sort(), "the same fields as a line the race reads");
  assert.deepEqual(lines[2].fallen, { id: "f3", cause: "Foul", fromMatch: false, round: null, diedAt: "2026-10-18T10:00:00Z" });
});

test("a fallen record the roster cannot read lets nobody go: no price, a sale that is blocked", () => {
  const [joe] = fallenLines({ fallen: [died("f3", { name: "Old Joe", position: "Lineman", number: 5 })], race: HUMAN });
  assert.deepEqual([joe.bare, joe.price, joe.removal], [true, 0, { type: "sell", amount: 0, blocked: true }]);
  const [read] = fallenLines({ fallen: [died("f4", { id: "d4", rowIndex: 3 })], race: HUMAN });
  assert.deepEqual([read.price, read.value], [80, 80], "a fallen line the race reads has the price of his position");
});

test("a fallen record the roster cannot read has no advancement to offer", () => {
  const [bare] = fallenLines({ fallen: [died("f1", { id: "d1", rowIndex: 99, name: "Far Row" })], race: HUMAN });
  assert.equal(bare.bare, true);
  assert.deepEqual(bare.offers, { level: 0, maxed: true, available: 0, offers: [] });
  assert.deepEqual([bare.advancements, bare.injuries], [[], { niggling: 0, lasting: [] }]);
  assert.equal(fallenLines({ fallen: [died("f2", { id: "d2", rowIndex: 3 })], race: HUMAN })[0].offers, null, "a record the race reads is made the same way as a line: unknown without the table");
});

test("a record whose player is no object is a bare line from nothing, not an error", () => {
  const records = [died("n1", null), died("n2", undefined), died("n3", "Joe"), died("n4", 7), died("n5", []), died("n6", { id: "d6", rowIndex: null, name: null, number: null })];
  const lines = fallenLines({ fallen: records, race: HUMAN });
  assert.deepEqual(lines.map(({ key, id, number, name, position }) => [key, id, number, name, position]), [
    ["fallen-n1", "", "", "", ""], ["fallen-n2", "", "", "", ""], ["fallen-n3", "", "", "", ""], ["fallen-n4", "", "", "", ""], ["fallen-n5", "", "", "", ""],
    ["fallen-n6", "d6", "", "", ""],
  ]);
  for (const line of lines) assert.deepEqual([line.stats.st.text, line.skills, line.earned, line.fallen.cause], ["–", [], 0, "Foul"]);
  assert.equal(JSON.stringify(lines).includes("undefined"), false);
});

// K11: the server would not undo such a record (FALLEN_NOT_RESTORABLE), so the screen offers no undo of it.
test("a record the roster cannot read is bare: no row of the race for it, or no player at all", () => {
  const records = [
    died("b1", { id: "d1", number: "3", name: "No Row" }),
    died("b2", { id: "d2", rowIndex: 99, name: "Far Row" }),
    died("b3", { name: "Old Joe", position: "Lineman", number: 5 }),
    died("b4", null),
    died("b5", []),
    // A snapshot the race reads but with no id: the roster could not name him back, nor a read find him there.
    died("b6", { rowIndex: 0, name: "No Id" }),
    died("b7", { id: "", rowIndex: 0, name: "Blank Id" }),
    died("r1", { id: "d6", rowIndex: 3, name: "Pike" }),
    died("r2", { id: 7, rowIndex: 0, name: "A 2.x number" }),
  ];
  assert.deepEqual(fallenLines({ fallen: records, race: HUMAN }).map(({ key, bare }) => [key, bare]), [
    ["fallen-b1", true], ["fallen-b2", true], ["fallen-b3", true], ["fallen-b4", true], ["fallen-b5", true], ["fallen-b6", true], ["fallen-b7", true],
    ["fallen-r1", false], ["fallen-r2", false],
  ]);
  assert.equal("bare" in linesOf([{ id: "d6", rowIndex: 3, name: "Pike" }])[0], false, "a player of the roster is none");
});

test("a death the screen undoes: one a coach marked, in a record the roster reads (K11)", () => {
  const [manual, fromMatch, bare, noId] = fallenLines({
    fallen: [died("u1", { id: "d1", rowIndex: 3 }), died("u2", { id: "d2", rowIndex: 3 }, { fromMatch: true }), died("u3", { id: "d3" }), died("u4", { rowIndex: 3 })],
    race: HUMAN,
  });
  assert.deepEqual([manual, fromMatch, bare, noId].map(undoable), [true, false, false, false]);
  assert.equal(undoable(linesOf([{ id: "d6", rowIndex: 3 }])[0]), false, "a player of the roster has no death to undo");
  assert.equal(undoable(null), false);
});

test("a fallen player who is on the roster as read is drawn once, on the roster", () => {
  const record = died("f1", { id: "d1", rowIndex: 3, name: "Pike" });
  assert.deepEqual(fallenLines({ fallen: [record], race: HUMAN, rosterIds: ["d1"] }), []);
  assert.equal(fallenLines({ fallen: [record], race: HUMAN, rosterIds: ["d2"] }).length, 1);
  assert.equal(fallenLines({ fallen: [record], race: HUMAN, rosterIds: [] }).length, 1);
  assert.equal(fallenLines({ fallen: [record], race: HUMAN }).length, 1, "none given, none held back");
  const numbered = died("f2", { id: 5, rowIndex: 0 });
  assert.deepEqual(fallenLines({ fallen: [numbered], race: HUMAN, rosterIds: ["5"] }), [], "a 2.x number is the id's text on the roster as well");
  const bare = died("f3", { id: "d3", name: "Old Joe" });
  assert.deepEqual(fallenLines({ fallen: [bare], race: HUMAN, rosterIds: ["d3"] }), [], "a snapshot the roster cannot read, whose id it holds, too");
  const nobody = died("f4", { rowIndex: 0, name: "No Id" });
  assert.equal(fallenLines({ fallen: [nobody], race: HUMAN, rosterIds: [""] }).length, 1, "a roster player with no id is not every dead one with none");
  const several = fallenLines({ fallen: [record, died("f5", { id: "d5", rowIndex: 1 }), died("f6", { id: "d6", rowIndex: 2 })], race: HUMAN, rosterIds: ["d5"] });
  assert.deepEqual(several.map(({ key, index }) => [key, index]), [["fallen-f1", 0], ["fallen-f6", 2]], "the others keep their places in the server's list");
});

test("the fallen sort with the roster's sort; with none, in the server's order", () => {
  const lines = fallenLines({
    fallen: [
      died("a", { id: "a", rowIndex: 3, number: "9" }), // Blitzer, MA 7
      died("b", { name: "Old Joe", number: "1" }), // bare
      died("c", { id: "c", rowIndex: 0, number: "2" }), // Lineman, MA 6
      died("d", { id: "d", rowIndex: 2, number: "4", spp: { touchdowns: 2 } }), // Catcher, MA 8
    ],
    race: HUMAN,
  });
  const order = (sort) => sortLines([lines[2], lines[3], lines[0], lines[1]], sort).map(({ fallen }) => fallen.id);
  assert.deepEqual(order(null), ["a", "b", "c", "d"], "the server's order");
  assert.deepEqual(order({ key: "ma", dir: "desc" }), ["d", "a", "c", "b"], "a bare line, with no MA, last");
  assert.deepEqual(order({ key: "ma", dir: "asc" }), ["c", "a", "d", "b"], "and last going up");
  assert.deepEqual(order({ key: "player", dir: "asc" }), ["b", "c", "d", "a"]);
  assert.deepEqual(order({ key: "earned", dir: "desc" }), ["d", "a", "b", "c"], "6, then the three with none in the server's order");
});

test("a name and a cause are kept as they are", () => {
  const [read, bare] = fallenLines({
    fallen: [died("f1", { id: "d1", rowIndex: 0, name: HOSTILE, number: HOSTILE }, { cause: HOSTILE }), died("f2", { name: HOSTILE, position: HOSTILE }, { cause: HOSTILE })],
    race: HUMAN,
  });
  assert.deepEqual([read.name, read.number, read.fallen.cause], [HOSTILE, HOSTILE, HOSTILE], "the markup escapes it, the model does not");
  assert.deepEqual([bare.name, bare.position, bare.fallen.cause], [HOSTILE, HOSTILE, HOSTILE]);
});

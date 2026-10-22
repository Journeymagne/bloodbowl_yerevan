import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../src/data/reference.mjs";
import { sameValues } from "../src/domain/post-match/events.mjs";
import { calculateRosterCosts } from "../src/domain/roster/costs.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import * as edits from "../src/domain/roster/team-edits.mjs";
import { teamFavouredOptions, teamLeagueOptions } from "../src/domain/roster/team-rules.mjs";
import { validateRoster } from "../src/domain/roster/validate.mjs";
import { blockingViolations, checkRoster, loadTeamReference } from "../server/domain/roster.mjs";

await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));

const { TEAM_EDIT_REFUSALS, byNumber, rosterViolations, teamNameRefusal, withFans, withFavoured, withLeague } = edits;

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const race = (slug) => data.teams.find((team) => team.slug === slug);
const races = data.teams;
// Human: 0 Human Lineman (0-16), 1 Thrower, 2 Catcher, 3 Blitzer (0-2 each); an apothecary, no bribes, no god.
const HUMAN = "teams/human";
const human = race(HUMAN);
// The first race of the data with two leagues or more, and the first with two gods or more.
const twoLeagues = races.find((team) => teamLeagueOptions(team).length >= 2);
const twoGods = races.find((team) => teamFavouredOptions(team).length >= 2);

/** A roster as the server stores it (`checkRoster`): Iron Rooks, 120k in the treasury. */
function stored(slug, players, over = {}) {
  return JSON.parse(JSON.stringify(checkRoster(slug, { teamSlug: slug, teamName: "Iron Rooks", treasury: 120, players, ...over }).roster));
}
/** Players of these rows, numbered and named by their place: p1 «P1» №1 first. */
const squad = (rowIndexes) => rowIndexes.map((rowIndex, n) => ({ id: `p${n + 1}`, rowIndex, number: String(n + 1), name: `P${n + 1}` }));
const ELEVEN = squad([0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3]);

/** The step's answer, the draft handed over checked to be as it was. */
function untouched(draft, step) {
  const before = structuredClone(draft);
  const result = step(draft);
  assert.deepEqual(draft, before, "the draft handed over is not changed");
  return result;
}
/** Whether the server stores the draft as it is sent: no refusal over it, and nothing of it changed. */
function asStored(slug, draft) {
  const { violations, roster } = checkRoster(slug, rosterForStorage(draft));
  assert.deepEqual(blockingViolations(violations), [], slug);
  return sameValues(normalizeDraft(roster), normalizeDraft(rosterForStorage(draft)));
}

test("a team's name is what is left without the blanks at its ends, and never nothing", () => {
  for (const name of ["", "  ", "\t\n", undefined, null]) {
    assert.deepEqual(teamNameRefusal(name), { code: "TEAM_NAME_EMPTY", params: {} }, JSON.stringify(name));
  }
  assert.equal(teamNameRefusal(" Rooks "), null);
  assert.equal(teamNameRefusal("R"), null);
});

test("a league and a god only from the race's own; the favoured skills a new god does not grant come off, and are named", () => {
  assert.ok(twoLeagues && twoGods, "the data has a race with two leagues and one with two gods");
  const [first, second] = teamLeagueOptions(twoLeagues);
  const leagued = stored(twoLeagues.slug, [], { selectedLeague: first });
  assert.deepEqual(untouched(leagued, (draft) => withLeague(twoLeagues, draft, second)), { draft: { ...leagued, selectedLeague: second } });
  assert.equal(withLeague(twoLeagues, leagued, ` ${second.toUpperCase()} `).draft.selectedLeague, second, "by its rule key, written as the race writes it");
  const foreign = races.flatMap(teamLeagueOptions).find((name) => !teamLeagueOptions(twoLeagues).includes(name));
  for (const league of [foreign, "", undefined, null]) {
    assert.deepEqual(withLeague(twoLeagues, leagued, league), { code: "LEAGUE_UNKNOWN", params: {} }, String(league));
  }

  // Undivided grants Prehensile Tail, Extra Arms, Disturbing Presence; Slaanesh grants Tentacles, Foul Appearance, Extra Arms.
  assert.ok(["Undivided", "Slaanesh"].every((god) => teamFavouredOptions(twoGods).includes(god)));
  const players = [
    { ...squad([0])[0], favouredSkills: ["Prehensile Tail", "Extra Arms"] },
    { id: "p2", rowIndex: 1, number: "2", name: "P2", favouredSkills: [{ name: "Disturbing Presence", access: "favoured" }] },
    // Extra Arms by an advancement too: the favoured copy comes off, the player keeps the skill and it is not named.
    { id: "p3", rowIndex: 0, number: "3", name: "P3", favouredSkills: ["Extra Arms"], extraSkills: [{ name: "Extra Arms", access: "primary" }] },
  ];
  const godly = stored(twoGods.slug, players, { favouredChoice: "Undivided" });
  const changed = untouched(godly, (draft) => withFavoured(twoGods, draft, "slaanesh"));
  assert.equal(changed.draft.favouredChoice, "Slaanesh");
  assert.deepEqual(changed.dropped, [{ playerId: "p1", name: "P1", skill: "Prehensile Tail" }, { playerId: "p2", name: "P2", skill: "Disturbing Presence" }]);
  assert.deepEqual(changed.draft.players.map((player) => player.favouredSkills), [[{ name: "Extra Arms", access: "favoured" }], [], []]);
  assert.deepEqual(changed.draft.players[2].extraSkills, [{ name: "Extra Arms", access: "primary" }]);
  assert.deepEqual(withFavoured(twoGods, godly, "Undivided").dropped, [], "the god the team has takes nothing off");

  // A favoured copy of a skill the player keeps — Prehensile Tail by an advancement, Horns by the position (a raw
  // draft: the server strips that one) — is a skill Slaanesh does not grant, and still not named: it is not lost.
  const kept = { ...godly, players: [...godly.players,
    { id: "p4", rowIndex: 1, number: "4", name: "P4", favouredSkills: ["Prehensile Tail"], extraSkills: [{ name: "Prehensile Tail", access: "secondary" }] },
    { id: "p5", rowIndex: 0, number: "5", name: "P5", favouredSkills: ["Horns"] }] };
  const keeping = untouched(kept, (draft) => withFavoured(twoGods, draft, "Slaanesh"));
  assert.deepEqual(keeping.dropped.map(({ playerId, skill }) => [playerId, skill]), [["p1", "Prehensile Tail"], ["p2", "Disturbing Presence"]]);
  assert.deepEqual(keeping.draft.players.slice(3).map((player) => player.favouredSkills), [[], []], "the copies come off");
  assert.deepEqual(keeping.draft.players[3].extraSkills, [{ name: "Prehensile Tail", access: "secondary" }]);
  for (const [team, god] of [[twoGods, "Grungni"], [twoGods, ""], [human, "Nurgle"]]) {
    assert.deepEqual(withFavoured(team, godly, god), { code: "FAVOURED_UNKNOWN", params: {} }, `${team.slug} ${god}`);
  }
});

test("Dedicated Fans: from 0 to 6, and no money moves", () => {
  const draft = stored(HUMAN, ELEVEN, { dedicatedFans: 2, cheerleaders: 1, purchasedStaff: { cheerleaders: 1 } });
  for (const fans of [7, -1, 1.5, NaN, undefined]) {
    assert.deepEqual(withFans(draft, fans), { code: "FANS_RANGE", params: { max: 6 } }, String(fans));
  }
  const { draft: next } = untouched(draft, (held) => withFans(held, 4));
  assert.equal(next.dedicatedFans, 4);
  assert.deepEqual([next.treasury, next.purchasedStaff], [draft.treasury, draft.purchasedStaff]);
  assert.ok(sameValues({ ...next, dedicatedFans: 2 }, draft), "the fans alone change");
  assert.deepEqual([0, 6].map((fans) => withFans(draft, fans).draft.dedicatedFans), [0, 6]);
});

test("by number: 1, 2, 10 in that order, a number that is no number last, the rest as it was", () => {
  const numbered = (numbers) => stored(HUMAN, numbers.map((number, n) => ({ id: `p${n + 1}`, rowIndex: 0, number, name: `P${n + 1}` })));
  const draft = numbered(["10", "2", "x", "1", "y"]);
  const { draft: sorted, moved } = untouched(draft, byNumber);
  assert.deepEqual(sorted.players.map((player) => [player.number, player.id]), [["1", "p4"], ["2", "p2"], ["10", "p1"], ["x", "p3"], ["y", "p5"]]);
  assert.equal(moved, true);
  assert.ok(sameValues({ ...sorted, players: draft.players }, draft), "the order alone changes");
  assert.deepEqual(byNumber(sorted), { draft: sorted, moved: false }, "already in order");
  assert.deepEqual(byNumber(numbered(["5", "3", "03"])).draft.players.map((player) => player.id), ["p2", "p3", "p1"], "the same number keeps its order");
  assert.deepEqual(byNumber(numbered([" ", "2"])).draft.players.map((player) => player.id), ["p2", "p1"], "a blank is no number");
  assert.deepEqual(byNumber(stored(HUMAN, [])), { draft: stored(HUMAN, []), moved: false });
});

// Owner, 2026-10-20: a coach does not change a team's race, so team-edits has no step for it.
test("there is no race to change: team-edits has no withRace", () => {
  assert.equal(edits.withRace, undefined);
});

test("a league, a god, the fans and the order changed are rosters the server stores as sent", () => {
  const godly = stored(twoGods.slug, [{ ...squad([0])[0], favouredSkills: ["Prehensile Tail", "Extra Arms"] }], { favouredChoice: "Undivided" });
  assert.ok(asStored(twoGods.slug, withFavoured(twoGods, godly, "Slaanesh").draft), "a god");
  const leagued = stored(twoLeagues.slug, [], { selectedLeague: teamLeagueOptions(twoLeagues)[0] });
  assert.ok(asStored(twoLeagues.slug, withLeague(twoLeagues, leagued, teamLeagueOptions(twoLeagues)[1]).draft), "a league");
  const draft = stored(HUMAN, ["10", "2", "x", "1"].map((number, n) => ({ id: `p${n + 1}`, rowIndex: 0, number, name: `P${n + 1}` })));
  assert.ok(asStored(HUMAN, withFans(draft, 5).draft), "the fans");
  assert.ok(asStored(HUMAN, byNumber(draft).draft), "the order");
});

test("the roster's violations, as the 2.x editor listed them", () => {
  const legal = stored(HUMAN, ELEVEN);
  assert.deepEqual(rosterViolations(human, legal), []);
  const blitzers = stored(HUMAN, squad([0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3]));
  const over = [{ code: "POSITION_MAX", params: { position: "Blitzer", max: 2, count: 3 } }];
  assert.deepEqual(rosterViolations(human, blitzers), over);
  assert.deepEqual(rosterViolations(human, blitzers), validateRoster(human, blitzers, calculateRosterCosts(human, blitzers)), "what the 2.x editor listed");
  assert.deepEqual(untouched({ ...blitzers, roster: {} }, (draft) => rosterViolations(human, draft)), over,
    "counted from the players, not from a map the draft carries");
  assert.deepEqual(untouched(blitzers, (draft) => rosterViolations(human, draft)), over);
  assert.deepEqual(rosterViolations(human, stored(HUMAN, squad([0, 0, 0, 0, 0, 0]))), [{ code: "ROSTER_MIN_PLAYERS", params: { min: 7, count: 6 } }]);
});

test("every refusal of the settings is worded in both dictionaries, with the same placeholders", () => {
  assert.deepEqual(TEAM_EDIT_REFUSALS, ["TEAM_NAME_EMPTY", "LEAGUE_UNKNOWN", "FAVOURED_UNKNOWN", "FANS_RANGE"]);
  assert.ok(Object.isFrozen(TEAM_EDIT_REFUSALS));
  const draft = stored(HUMAN, ELEVEN);
  const given = [teamNameRefusal(" "), withLeague(human, draft, "Chaos Clash"), withFavoured(human, draft, "Nurgle"), withFans(draft, 7)];
  assert.deepEqual(given.map(({ code }) => code), TEAM_EDIT_REFUSALS, "each is one a step gives");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  for (const { code, params } of given) {
    const key = `teamSettings.refusal.${code}`;
    assert.ok(en[key] && ru[key], `${key} in both`);
    assert.deepEqual(placeholders(ru[key]), placeholders(en[key]), key);
    assert.deepEqual(placeholders(en[key]), Object.keys(params).sort(), `${key} says what the refusal brings`);
  }
});

test("the race's words are gone from both dictionaries", () => {
  const gone = [
    "teamSettings.refusal.RACE_SAME", "teamSettings.refusal.RACE_UNKNOWN", "teamSettings.refusal.RACE_IN_SEASON",
    "teamSettings.raceOpen", "teamSettings.raceDrops", "teamSettings.raceStaff", "teamSettings.racePreparing", "teamSettings.raceChange",
    // The 2.x editor's season lock went with the editor (stage 12): nobody changes a race (the owner's answer).
    "roster.raceLockedInSeason",
  ];
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const key of gone) assert.equal(key in words, false, `${locale}: ${key}`);
    // What stays: the read-only row's label, TeamNew's «Choose a race».
    for (const key of ["teamSettings.race", "newTeam.needRace"]) assert.ok(words[key], `${locale}: ${key}`);
  }
});

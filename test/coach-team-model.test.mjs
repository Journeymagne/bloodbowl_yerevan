import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertDictionaryCovers } from "./helpers/ui.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { state } from "../src/core/state.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { teamValue } from "../src/data/team-record.mjs";
import { raceTeamOf } from "../src/data/teams.mjs";
import { opponentModel } from "../src/screens/coaches/team-model.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
state.data = { teams: data.teams };

const COACH_U2 = { id: "u2", login: "rival", telegram: "@rival_bb", isAdmin: false, createdAt: "2025-03-01T00:00:00Z" };
const side = (user, id, name, slug) => ({ user: { id: user, login: user }, team: { id, name, baseTeamSlug: slug } });
const OURS = side("u1", "t1", "Ashgrove Wardens", "teams/human");
const THEIRS = side("u2", "r1", "Karak Hold Hammers", "teams/dwarf");

/** A Dwarf of the roster: rows 0 Blocker Lineman, 1 Runner, 2 Blitzer. */
const player = (id, rowIndex, number, name, over = {}) => ({ id, rowIndex, number, name, spp: {}, advancements: [], extraSkills: [], ...over });
// Six, of whom Dunn misses the match. Dwarves are Brawlin' Brutes (a TD 2 SPP, a CAS 3): Brakk leads (2 TD and a CAS, 7), the captain
// has 3, Kor and Hild tie at 2 (Kor first in the roster).
const PLAYERS = [
  player("d1", 0, "1", "Kor", { spp: { touchdowns: 1 } }),
  player("d2", 0, "2", "Dunn", { skipNextGame: true, absence: { code: "miss" }, spp: { touchdowns: 3 } }),
  player("d3", 2, "3", "Brakk", { spp: { touchdowns: 2, casualties: 1 }, extraSkills: [{ name: "Wrestle", access: "primary" }],
    advancements: [{ type: "random", grants: { skill: "Wrestle" }, roll: { id: "x1", via: "site" } }] }),
  player("d4", 0, "4", "Hild", { spp: { touchdowns: 1 } }),
  player("d5", 1, "5", "Grimm", { isCaptain: true, spp: { casualties: 1 } }),
  player("d6", 0, "6", "Ulf"),
];
const RIVAL = { id: "r1", name: "Karak Hold Hammers", baseTeamSlug: "teams/dwarf", revision: 3, roster: { treasury: 40, players: PLAYERS } };

// The table: r1 is second with 9 points from six league rounds — L L W W L W (3 · 0 · 3), TD 8–7 (+1), CAS 3–7 (−4).
const standing = (id, user, rank, points) => ({ entryId: `e-${id}`, withdrawnAt: null, user: { id: user, login: user }, team: { id, name: id, baseTeamSlug: "teams/orc" }, rank, points, games: 6 });
const ROUNDS = [[1, 2, 0, 1], [0, 1, 0, 1], [2, 1, 1, 2], [2, 1, 0, 1], [1, 2, 1, 1], [2, 0, 1, 1]];
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 7 },
  standings: [standing("x1", "u9", 1, 12), { ...standing("r1", "u2", 2, 9), team: THEIRS.team }, standing("t1", "u1", 3, 6)],
  rounds: ROUNDS.map(([own, other, cas, casOther], at) => ({ roundNumber: at + 1, status: "completed", pairings: [{
    id: `p${at + 1}`, tableNumber: 1, homeEntryId: "e-r1", awayEntryId: `e-o${at}`, homeTouchdowns: own, awayTouchdowns: other,
    homeCasualties: cas, awayCasualties: casOther, homePoints: own > other ? 3 : 0, awayPoints: own < other ? 3 : 0, resultStatus: "confirmed",
  }] })),
};

/** A game of t1's, as /api/games sends it. */
const game = (id, over = {}) => ({
  id, kind: "league", roundNumber: 7, roundStatus: "started", season: { id: "s1", currentRound: 7 }, resultStatus: "pending",
  preparationStatus: "not_started", postMatchStatus: "not_started", homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  updatedAt: "2026-10-10T10:00:00Z", confirmedAt: null, home: OURS, away: THEIRS, ...over,
});
const confirmed = (id, round, [home, away], over = {}) => game(id, {
  roundNumber: round, roundStatus: "completed", resultStatus: "confirmed", homeTouchdowns: home, awayTouchdowns: away, homeCasualties: 0, awayCasualties: 1,
  confirmedAt: `2026-10-0${round}T10:00:00Z`, ...over,
});

const base = { user: COACH_U2, team: RIVAL, seasonData: SEASON, games: [], viewerId: "u1", activeTeamId: "t1", phone: false };

test("the opponent in the table: his place, value, record, points and differences, his form", () => {
  const model = opponentModel({ user: COACH_U2, team: RIVAL, seasonData: SEASON, games: [], viewerId: "u1", activeTeamId: "t1", phone: false });
  assert.equal(model.place, 2);
  assert.deepEqual(model.tiles.map(({ value }) => value), [formatMoney(teamValue(RIVAL, raceTeamOf(RIVAL.baseTeamSlug))), "3 · 0 · 3", "9", "+1 / −4"]);
  assert.deepEqual(model.form, ["l", "w", "w", "l", "w"]);
  assert.deepEqual(model.tiles.map(({ label }) => label), ["TV", "W · D · L", "Points", "TD ± / CAS ±"], "DeskOppTeam.html's words");
  assert.deepEqual(opponentModel({ ...base, phone: true }).tiles.map(({ label }) => label), ["Team value", "W · D · L", "Points", "TD / CAS difference"], "OppTeam.html's");
  assert.deepEqual([model.userId, model.teamId, model.name, model.initials, model.raceKnown], ["u2", "r1", "Karak Hold Hammers", "KH", true]);
  assert.deepEqual(model.race, { title: "Dwarf", href: "#/teams/dwarf" });
  assert.deepEqual(model.coach, { login: "rival", href: "#/coaches/u2" });
  assert.equal([...model.tiles[3].value].filter((sign) => sign === "−").length, 1, "a real minus sign");
});

test("outside the table: no place, no form, the value alone", () => {
  const model = opponentModel({ ...base, seasonData: { ...SEASON, standings: SEASON.standings.filter((row) => row.team.id !== "r1") } });
  assert.equal(model.place, null);
  assert.deepEqual(model.form, []);
  assert.deepEqual(model.tiles.map(({ label }) => label), ["TV"]);
  // A withdrawn entry is outside it too.
  const withdrawn = { ...SEASON, standings: SEASON.standings.map((row) => (row.team.id === "r1" ? { ...row, withdrawnAt: "2026-10-01T00:00:00Z" } : row)) };
  assert.equal(opponentModel({ ...base, seasonData: withdrawn }).place, null);
  assert.equal(opponentModel({ ...base, seasonData: withdrawn }).tiles.length, 1);
});

test("the table not read: four tiles, the three of the table a dash", () => {
  const model = opponentModel({ ...base, seasonData: null });
  assert.equal(model.place, null);
  assert.deepEqual(model.form, []);
  assert.deepEqual(model.tiles.map(({ value }) => value).slice(1), ["–", "–", "–"]);
  assert.equal(model.tiles.length, 4);
});

test("a race the reference does not know: no value and no roster", () => {
  const model = opponentModel({ ...base, team: { ...RIVAL, baseTeamSlug: "teams/nobody" } });
  assert.equal(model.raceKnown, false);
  assert.equal(model.race, null);
  assert.deepEqual(model.squad, []);
  assert.deepEqual(model.lines, []);
  assert.deepEqual(model.tiles.map(({ label }) => label), ["W · D · L", "Points", "TD ± / CAS ±"], "no TV tile");
  assert.deepEqual(opponentModel({ ...base, team: { ...RIVAL, id: "r9", baseTeamSlug: "teams/nobody" } }).tiles, [], "outside the table as well: nothing");
});

test("the next opponent: the active team's match on against him, not a score sent; it leads to the matches", () => {
  const idle = opponentModel({ ...base, games: [game("g1", { roundNumber: 3, season: { id: "s1", currentRound: 3 } })] });
  assert.deepEqual(idle.next, { line: "Round 3 · home", href: "#/t/t1/matches" });
  const away = opponentModel({ ...base, games: [game("g1", { home: THEIRS, away: OURS })] });
  assert.deepEqual(away.next, { line: "Round 7 · away", href: "#/t/t1/matches" });
  const sent = game("g1", { resultStatus: "awaiting_confirmation", proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1, proposedHomeCasualties: 0, proposedAwayCasualties: 0 });
  assert.equal(opponentModel({ ...base, games: [sent] }).next, null, "a score sent: no next match");
  assert.equal(opponentModel({ ...base, games: [game("g1", { away: side("u3", "z1", "Someone Else", "teams/orc") })] }).next, null, "against another: none");
  assert.equal(opponentModel({ ...base, games: [game("g1")], activeTeamId: null }).next, null, "no active team: none");
});

test("our meeting: the last confirmed match of the active team against him, from our side", () => {
  const games = [confirmed("ga", 1, [1, 2], { home: THEIRS, away: OURS }), confirmed("gb", 2, [0, 3])];
  // gb is the later: 0–3 at home, a loss.
  assert.deepEqual(opponentModel({ ...base, games }).meeting, { result: "l", line: "Round 2 · home", score: "0–3" });
  // The earlier alone: round 1 away, 2–1 from our side, a win.
  assert.deepEqual(opponentModel({ ...base, games: [games[0]] }).meeting, { result: "w", line: "Round 1 · away", score: "2–1" });
  const friendly = confirmed("gf", 3, [1, 1], { kind: "friendly", roundNumber: null, season: null, roundStatus: null });
  assert.deepEqual(opponentModel({ ...base, games: [games[0], friendly] }).meeting, { result: "d", line: "Friendly", score: "1–1" }, "a friendly's outcome is said, not «F»");
  assert.equal(opponentModel({ ...base, games: [confirmed("gc", 1, [2, 0], { away: side("u3", "z1", "Someone Else", "teams/orc") })] }).meeting, null);
  assert.equal(opponentModel({ ...base, games: [game("g1")] }).meeting, null, "a match not played is no meeting");
  assert.equal(opponentModel({ ...base, games, activeTeamId: null }).meeting, null);
});

test("the roster: who misses the match last, then by SPP; the captain, the gained skills marked", () => {
  const model = opponentModel(base);
  assert.deepEqual(model.squad.map(({ name, out, spp }) => [name, out, spp]),
    [["Brakk", false, 7], ["Grimm", false, 3], ["Kor", false, 2], ["Hild", false, 2], ["Ulf", false, 0], ["Dunn", true, 6]]);
  const brakk = model.squad[0];
  assert.match(brakk.key, /^d3#0$/);
  assert.deepEqual([brakk.number, brakk.position, brakk.touchdowns, brakk.casualties], ["3", "Blitzer", 2, 1]);
  assert.equal(brakk.line, "#3 Blitzer · TD 2 · CAS 1");
  assert.deepEqual(brakk.skills.filter(({ gained }) => gained), [{ name: "Wrestle", gained: true }]);
  assert.ok(brakk.skills.some(({ name, gained }) => name === "Block" && !gained), "a position's skill is not gained");
  assert.equal(model.squad.find(({ name }) => name === "Grimm").captain, true);
  assert.equal(model.squad.find(({ name }) => name === "Dunn").line, "#2 Dwarf Blocker Lineman · misses the match");
  assert.equal(model.lines.length, PLAYERS.length, "the lines, for the skill's sheet");
  initLocale("ru");
  try {
    assert.equal(opponentModel(base).squad.at(-1).line, "#2 Dwarf Blocker Lineman · пропускает матч");
  } finally {
    initLocale("en");
  }
});

test("the rolls are handed on as the server sent them; anything else is none", () => {
  const rolls = [{ id: "x1", playerId: "d3", purpose: "random_skill", result: { dice: [{ skill: "Wrestle" }, { skill: "Fend" }] } }];
  assert.deepEqual(opponentModel({ ...base, rolls }).rolls, rolls);
  assert.deepEqual(opponentModel({ ...base, rolls: undefined }).rolls, []);
  assert.deepEqual(opponentModel({ ...base, rolls: "no" }).rolls, []);
});

test("Telegram: a contact the forms accept leads to t.me; another leads nowhere", () => {
  assert.deepEqual(opponentModel(base).telegram, { handle: "@rival_bb", href: "https://t.me/rival_bb" });
  assert.deepEqual(opponentModel({ ...base, user: { ...COACH_U2, telegram: "lilit_leaps" } }).telegram.href, "https://t.me/lilit_leaps");
  for (const contact of ["lili", "t.me/lilit", "https://evil.example/x", "", undefined]) {
    assert.equal(opponentModel({ ...base, user: { ...COACH_U2, telegram: contact } }).telegram.href, "", String(contact));
  }
  assert.equal(opponentModel({ ...base, user: { ...COACH_U2, telegram: undefined } }).telegram.handle, "");
});

test("the way back: a phone's to the table, a desk's to the active team's season, or the table with no team", () => {
  assert.deepEqual(opponentModel({ ...base, phone: true }).back, { label: "Table", href: "#/season" });
  assert.deepEqual(opponentModel(base).back, { label: "Season", href: "#/t/t1/matches" });
  assert.deepEqual(opponentModel({ ...base, activeTeamId: null }).back, { label: "Season", href: "#/season" });
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/coaches/team-model.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  // The keys the model picks by the width, which the scan of `t("…")` does not see.
  for (const key of ["opponent.tile.tv", "teamOverview.tile.value", "teamOverview.tile.diff", "teamOverview.tile.diffDesk", "shell.tab.table", "shell.side.season", "teamOverview.friendly"]) {
    assert.ok(en[key] && ru[key], key);
  }
  const WORDS = {
    "opponent.place": ["#{place}", "{place}-е место"],
    "opponent.coachLine": ["coach {coach}", "тренер {coach}"],
    "opponent.next": ["Next opponent", "Следующий соперник"],
    "opponent.meeting": ["Our meeting", "Наша встреча"],
    "opponent.tile.record": ["W · D · L", "В · Н · П"],
    "opponent.out": ["#{number} {position} · misses the match", "#{number} {position} · пропускает матч"],
    "opponent.noRace": ["The team's race is not in the reference: its roster cannot be shown.", "Расы команды нет в справочнике — состав не показать."],
  };
  for (const [key, words] of Object.entries(WORDS)) assert.deepEqual([en[key], ru[key]], words, key);
  const opponentKeys = (dict) => Object.keys(dict).filter((key) => key.startsWith("opponent."));
  assert.deepEqual(opponentKeys(en), opponentKeys(ru), "the same opponent.* keys in both");
});

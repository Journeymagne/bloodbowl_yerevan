/**
 * A player's career by match as the tests of stage 07d and 07e read it (test/team-player-career.test.mjs, the phone's
 * profile; test/team-roster-career.test.mjs, a desk's panel; test/team-fallen-career.test.mjs, the fallen): the rows of
 * GET …/players/:pid/history as the server sends them, Cade — a Catcher of the humans — as the history tells him, his
 * taps, and the coach whose roster holds him. The page is helpers/roster-page.mjs's, imported first.
 */
import { PLAYERS, api, coach, state, withPlayers } from "./roster-page.mjs";

/** Every counter of a roster's, nought unless said. */
export const counters = (over = {}) => ({ touchdowns: 0, casualties: 0, knockouts: 0, completions: 0, catches: 0, interceptions: 0, throws: 0, landings: 0, bonus: 0, mvps: 0, ...over });
/** A row of the history as the server sends it: what the player did, and what the match was from the team's side. */
export const match = (over = {}) => ({
  pairingId: "g1", played: true, source: "applied", counters: counters(), injury: null, pending: false,
  kind: "league", seasonId: "s1", roundNumber: 1, status: "confirmed", opponent: { teamId: "r1", name: "Grimtusk Raiders" }, score: { own: 2, opponent: 1 }, ...over,
});
export const ROUND_1 = match({ counters: counters({ touchdowns: 2, mvps: 1 }) });
export const FRIENDLY = match({ pairingId: "g2", kind: "friendly", seasonId: null, roundNumber: null, played: null, source: "none", counters: null, opponent: { teamId: "r2", name: "Duskspire Knives" }, score: { own: 1, opponent: 1 } });
export const ROUND_2 = match({ pairingId: "g3", roundNumber: 2, played: false, opponent: { teamId: "r3", name: "Mirefen Rotters" }, score: { own: 0, opponent: 2 } });
export const ROUND_3 = match({
  pairingId: "g4", roundNumber: 3, status: "in_progress", score: null, source: "events", pending: true, counters: counters({ touchdowns: 1, completions: 1 }),
  opponent: { teamId: "r4", name: "Silverbrook Rangers" },
});
/** Oldest first, as the server sends them; one edit outside a match. */
export const HISTORY = { playerId: "p3", matches: [ROUND_1, FRIENDLY, ROUND_2, ROUND_3], outside: counters({ touchdowns: 1 }) };
/**
 * Cade, a Catcher of the humans, as the history tells him (M3: the two agree): round 1's TD 2 and MVP and the edit
 * outside a match's TD 1 on the roster, and round 3's TD 1 and COMP 1 among the records not settled yet — the line
 * counts both (`careerCounters`): TD 4 · COMP 1 · MVP 1, 18 SPP, which the rows add up to (+4, +11, +3).
 */
export const CADE = { ...PLAYERS[2], spp: { touchdowns: 3, mvps: 1 } };
export const TAPS = [
  { id: "e1", pairingId: "g4", playerId: "p3", counter: "touchdowns", delta: 1, injury: null, settledAt: null },
  { id: "e2", pairingId: "g4", playerId: "p3", counter: "completions", delta: 1, injury: null, settledAt: null },
];
/** The roster's players with Cade as `player`. */
export const withCade = (player = CADE) => withPlayers(PLAYERS.map((each) => (each.id === "p3" ? player : each)));
/** The coach, his roster holding Cade as `player`, and the records `events` not settled. */
export function coachCade({ player = CADE, events = TAPS } = {}) {
  coach({ teamAnswer: withCade(player) });
  api.reply("GET /api/teams/t1/events", 200, { events, revision: 4 });
}
/** The humans' page of the reference: what each counter is worth to them. */
export const human = () => state.data.teams.find((team) => team.slug === "teams/human");
/** HISTORY's rows as a list draws them, newest first: the title, the result, what he did, the SPP, the plate. */
export const ROWS = [
  ["Round 3 · Silverbrook Rangers", "", "TD 1 · COMP 1", "+4", "waits for the post-match"],
  ["Round 2 · Mirefen Rotters", "L 0–2", "missed the match", "—", ""],
  ["Friendly · Duskspire Knives", "D 1–1", "no details", "—", ""],
  ["Round 1 · Grimtusk Raiders", "W 2–1", "TD 2 · MVP", "+11", ""],
  ["Edits outside a match", "", "TD 1", "+3", ""],
];
/** The words of a list's rows in `root`, as ROWS holds them. */
export const rowWordsIn = (root) => root.querySelectorAll(".g-career__row").map((row) => [
  row.querySelector(".g-career__name").textContent,
  row.querySelector(".g-career__result")?.textContent ?? "",
  row.querySelector(".g-career__events")?.textContent ?? "",
  row.querySelector(".g-career__spp").textContent,
  row.querySelector(".g-career__pending")?.textContent ?? "",
]);

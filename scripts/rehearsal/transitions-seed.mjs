/**
 * The seed of rehearsal:transitions (scripts/rehearsal-transitions.mjs): against a 2.1.0 site, through its API
 * only, the five states a site can be in on the day it moves to 3.0 (rollout spec §3.3), all on friendlies
 * between two coaches of its own (owner's answer 1: a league pairing would go into the dump's season).
 *
 * 1. `preparation` — a pre-match half done: both sides' fans and the weather, on its «Roster» step;
 * 2. `started` — a match begun: the pre-match done with no inducements, and started;
 * 3. `postPlayers` — a post-match past its Players step: the score agreed, the fans, each side's statistics with
 *    an MVP (and a «Miss next game» at home), both Players steps locked. Its sides carry no `followsEvents`: they
 *    are 2.x sides, which 3.0 finishes by writing their statistics as the match's records;
 * 4. `proposed` — a score sent by the home coach and never answered, with no pre-match;
 * 5. `challenge` — a challenge sent and not accepted.
 *
 * Every coach, team and match is new and named after the run's stamp; nothing that was there is touched.
 */
import { randomUUID } from "node:crypto";

import { preparationStep } from "../../src/domain/match/preparation.mjs";
import { finishPreMatch, openPreMatch, postMatch, preMatch, transitionRoster } from "./transitions-api.mjs";
import { seasonTable } from "./transitions-checks.mjs";

const SIDES = ["home", "away"];
const PAIRED = ["preparation", "started", "postPlayers", "proposed"];
const NAMES = [...PAIRED, "challenge"];
const ROSTER_STEP = 2; // preparationStep: fans and weather done, the rosters not locked

/** The score the `proposed` state sends, and the one the admin enters in 3.0. */
export const PROPOSED_SCORE = Object.freeze({ homeTouchdowns: 2, awayTouchdowns: 0, homeCasualties: 1, awayCasualties: 0 });

// The Players step of `postPlayers`, by index into the roster: who scored what (2–1, CAS 1–0), the MVP, who misses the next game.
const PLAYERS_STEP = {
  home: { result: { touchdowns: 2, casualties: 1 }, stats: [[0, "touchdowns"], [1, "touchdowns"], [2, "casualties"], [5, "completions"]], mvp: 3, miss: 4 },
  away: { result: { touchdowns: 1, casualties: 0 }, stats: [[0, "touchdowns"], [3, "interceptions"]], mvp: 1, miss: null },
};

async function register(api, side, stamp8) {
  const login = `transitions-${side}-${stamp8}`, password = randomUUID();
  const answer = await api.ok("POST", "/api/auth/register", { body: { login, password, telegram: "@transitions" } });
  return { login, password, id: answer.user.id, token: answer.token };
}

// One team per state for the coach of `side`, each with players of its own.
async function createTeams(api, coach, side, stamp8) {
  const teams = {};
  for (const [index, name] of NAMES.entries()) {
    const body = transitionRoster(`Transitions · ${name} · ${side} · ${stamp8}`, `${stamp8}-${side[0]}${index + 1}`);
    teams[name] = (await api.ok("POST", "/api/teams", { token: coach.token, body })).team.id;
  }
  return teams;
}

const sendChallenge = async (api, coaches, teamId) =>
  (await api.ok("POST", "/api/challenges", { token: coaches.home.token, body: { opponentId: coaches.away.id, teamId } })).id;

const acceptChallenge = async (api, coaches, challengeId, teamId) =>
  (await api.ok("POST", `/api/challenges/${challengeId}/accept`, { token: coaches.away.token, body: { teamId } })).gameId;

// A pre-match with both sides' fans and the weather: on its «Roster» step.
async function opened(api, gameId, tokens) {
  const match = preMatch(api, gameId, tokens);
  await openPreMatch(match);
  return match;
}

async function seedPreparation(api, gameId, tokens) {
  const match = await opened(api, gameId, tokens);
  const step = preparationStep(match.answer.preparation);
  if (step !== ROSTER_STEP) throw new Error(`the pre-match of «preparation» is on step ${step}, not ${ROSTER_STEP}`);
  return { gameId, step };
}

async function seedStarted(api, gameId, tokens, teamIds) {
  await finishPreMatch(await opened(api, gameId, tokens));
  return { gameId, teamIds };
}

// A side's Players step as PLAYERS_STEP has it, on the statistics the post-match holds (every player of the match roster).
function playersStep(side, ids, line) {
  const statistics = structuredClone(side.statistics);
  for (const [index, counter] of line.stats) statistics[ids[index]][counter] += 1;
  const injuries = line.miss === null ? {} : { [ids[line.miss]]: { code: "miss" } };
  return { type: "statistics", statistics, mvps: [ids[line.mvp]], injuries };
}

async function seedPostPlayers(api, gameId, tokens, teamIds) {
  await finishPreMatch(await opened(api, gameId, tokens));
  const before = {};
  for (const side of SIDES) before[teamIds[side]] = (await api.ok("GET", `/api/teams/${teamIds[side]}`, { token: tokens[side] })).team.roster;
  const post = postMatch(api, gameId, tokens);
  await post.read();
  await post.act("home", { type: "result", home: PLAYERS_STEP.home.result, away: PLAYERS_STEP.away.result });
  await post.act("away", { type: "agree-result" });
  for (const side of SIDES) await post.act(side, { type: "fans", roll: 3 });
  for (const side of SIDES) {
    const ids = before[teamIds[side]].players.map((player) => player.id);
    await post.act(side, playersStep(post.answer.postMatch[side], ids, PLAYERS_STEP[side]));
  }
  for (const side of SIDES) await post.act(side, { type: "lock-players" });
  const state = post.answer.postMatch;
  for (const side of SIDES) {
    if (state[side].stage !== 3) throw new Error(`the ${side} side of «postPlayers» is on step ${state[side].stage}, not 3`);
    if (Object.hasOwn(state[side], "followsEvents")) throw new Error("the post-match follows the match's records: this is not a 2.1.0 site");
  }
  return { gameId, teamIds, before, statistics: { home: state.home.statistics, away: state.away.statistics }, mvps: { home: state.home.mvps, away: state.away.mvps } };
}

async function seedProposed(api, gameId, tokens) {
  await api.ok("POST", `/api/games/${gameId}/propose`, { token: tokens.home, body: PROPOSED_SCORE });
  return { gameId, score: { ...PROPOSED_SCORE } };
}

/**
 * The five states, seeded on a 2.1.0 site, and the record --finish reads: the coaches (with the passwords this
 * run gave them, test values written only to output/), the league table as 2.1.0 answers it (for the report
 * only: 3.0 answers it its own way), each state's ids and what its checks need, and every row the seed made,
 * which rehearsal:check marks and leaves out of the open states it counts.
 *
 * @param {ReturnType<import("./transitions-api.mjs").siteApi>} api a 2.1.0 site
 * @param {{ stamp: string }} options the run's stamp (a UUID); its first eight characters name what it makes
 * @returns {Promise<object>} the record (`assertTransitionsRecord`)
 */
export async function seedTransitions(api, { stamp }) {
  const stamp8 = stamp.slice(0, 8), coaches = {}, teams = {};
  for (const side of SIDES) coaches[side] = await register(api, side, stamp8);
  for (const side of SIDES) teams[side] = await createTeams(api, coaches[side], side, stamp8);
  const tokens = { home: coaches.home.token, away: coaches.away.token };
  const season = seasonTable(await api.ok("GET", "/api/season"));
  const challengeIds = {}, gameIds = {}, teamIds = {};
  for (const name of PAIRED) {
    challengeIds[name] = await sendChallenge(api, coaches, teams.home[name]);
    gameIds[name] = await acceptChallenge(api, coaches, challengeIds[name], teams.away[name]);
    teamIds[name] = { home: teams.home[name], away: teams.away[name] };
  }
  const cases = {
    preparation: await seedPreparation(api, gameIds.preparation, tokens),
    started: await seedStarted(api, gameIds.started, tokens, teamIds.started),
    postPlayers: await seedPostPlayers(api, gameIds.postPlayers, tokens, teamIds.postPlayers),
    proposed: await seedProposed(api, gameIds.proposed, tokens),
  };
  challengeIds.challenge = await sendChallenge(api, coaches, teams.home.challenge);
  cases.challenge = { challengeId: challengeIds.challenge, teamId: teams.away.challenge };
  const coachRecord = (side) => ({ login: coaches[side].login, password: coaches[side].password, id: coaches[side].id });
  return {
    version: 1, stamp, seededAt: new Date().toISOString(), seedBase: api.base,
    coaches: { home: coachRecord("home"), away: coachRecord("away") },
    season, cases,
    // Keyed by strings: `challengeIds:` would read as a use of the export challengeId to check-references.
    seeded: Object.fromEntries([
      ["pairingIds", PAIRED.map((name) => gameIds[name])],
      ["challengeIds", NAMES.map((name) => challengeIds[name])],
      ["teamIds", SIDES.flatMap((side) => NAMES.map((name) => teams[side][name]))],
    ]),
  };
}

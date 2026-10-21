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
 *
 * The record is written as the seed goes, after every coach, team, challenge and accepted challenge, with
 * «complete»: false until the last write: a seed that stops part-way leaves rows on the site, and the record
 * names them and says it did not finish, which rehearsal:check and --finish refuse (`seededRows`,
 * `assertTransitionsRecord`).
 */
import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

import { preparationStep } from "../../src/domain/match/preparation.mjs";
import { TRANSITIONS_FINISH, TRANSITIONS_RECORD, writePrivate } from "./outputs.mjs";
import { assertSiteVersion, finishPreMatch, openPreMatch, postMatch, preMatch, transitionRoster } from "./transitions-api.mjs";
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

const coachRecord = (coach) => ({ login: coach.login, password: coach.password, id: coach.id });

/**
 * The record of a seed as it goes: `coach(side, coach)` and `made(list, id)` add a coach, or a row the site has
 * just made to `seeded`, and write the record again, still not complete; `finished(fields)` adds the rest and
 * writes it complete.
 */
function seedRecord(api, stamp, save) {
  // Keyed by strings: `challengeIds:` would read as a use of the export challengeId to check-references.
  const seeded = Object.fromEntries([["pairingIds", []], ["challengeIds", []], ["teamIds", []]]);
  const record = { version: 1, stamp, seededAt: null, seedBase: api.base, complete: false, coaches: {}, seeded };
  const write = () => save(structuredClone(record));
  return {
    async coach(side, coach) {
      record.coaches[side] = coachRecord(coach);
      await write();
    },
    async made(list, id) {
      seeded[list].push(id);
      await write();
      return id;
    },
    async finished(fields) {
      Object.assign(record, fields, { seededAt: new Date().toISOString(), complete: true });
      await write();
      return record;
    },
  };
}

// One team per state for the coach of `side`, each with players of its own.
async function createTeams(api, progress, coach, side, stamp8) {
  const teams = {};
  for (const [index, name] of NAMES.entries()) {
    const body = transitionRoster(`Transitions · ${name} · ${side} · ${stamp8}`, `${stamp8}-${side[0]}${index + 1}`);
    teams[name] = await progress.made("teamIds", (await api.ok("POST", "/api/teams", { token: coach.token, body })).team.id);
  }
  return teams;
}

const sendChallenge = async (api, progress, coaches, teamId) => progress.made("challengeIds",
  (await api.ok("POST", "/api/challenges", { token: coaches.home.token, body: { opponentId: coaches.away.id, teamId } })).id);

const acceptChallenge = async (api, progress, coaches, challengeId, teamId) => progress.made("pairingIds",
  (await api.ok("POST", `/api/challenges/${challengeId}/accept`, { token: coaches.away.token, body: { teamId } })).gameId);

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
 * which rehearsal:check marks and leaves out of the open states it counts. `save` is given the record after
 * every row the site makes («complete»: false) and once more at the end («complete»: true).
 *
 * @param {ReturnType<import("./transitions-api.mjs").siteApi>} api a 2.1.0 site
 * @param {{ stamp: string, save?: (record: object) => Promise<void> }} options the run's stamp (a UUID; its
 *   first eight characters name what it makes), and where the record goes
 * @returns {Promise<object>} the record (`assertTransitionsRecord`)
 */
export async function seedTransitions(api, { stamp, save = async () => {} }) {
  const stamp8 = stamp.slice(0, 8), coaches = {}, teams = {}, progress = seedRecord(api, stamp, save);
  for (const side of SIDES) await progress.coach(side, coaches[side] = await register(api, side, stamp8));
  for (const side of SIDES) teams[side] = await createTeams(api, progress, coaches[side], side, stamp8);
  const tokens = { home: coaches.home.token, away: coaches.away.token };
  const season = seasonTable(await api.ok("GET", "/api/season"));
  const gameIds = {}, teamIds = {};
  for (const name of PAIRED) {
    const challengeId = await sendChallenge(api, progress, coaches, teams.home[name]);
    gameIds[name] = await acceptChallenge(api, progress, coaches, challengeId, teams.away[name]);
    teamIds[name] = { home: teams.home[name], away: teams.away[name] };
  }
  const cases = {
    preparation: await seedPreparation(api, gameIds.preparation, tokens),
    started: await seedStarted(api, gameIds.started, tokens, teamIds.started),
    postPlayers: await seedPostPlayers(api, gameIds.postPlayers, tokens, teamIds.postPlayers),
    proposed: await seedProposed(api, gameIds.proposed, tokens),
  };
  cases.challenge = { challengeId: await sendChallenge(api, progress, coaches, teams.home.challenge), teamId: teams.away.challenge };
  return progress.finished({ season, cases });
}

/** What a seed that stopped part-way says: its rows are in the site's database, and only a new restore takes them away. */
const leftRows = (base) => `the seed left rows in the database of ${base} — run rehearsal:restore again, then --seed `
  + `(output/rehearsal/${TRANSITIONS_RECORD} names the rows it made and says «complete»: false; rehearsal:check and --finish refuse it)`;

/**
 * The seed as --seed runs it, its record written to `dir` as it goes (0600: it holds the coaches' passwords).
 * Refused when `dir` holds a record already: that database was seeded once, or a seed stopped part-way on it,
 * and a new record would leave those rows unmarked in rehearsal:check. Refused too, before anything is written
 * anywhere, when the site is not 2.1.0 (`assertSiteVersion`, one read). A finish of an earlier seed is deleted.
 *
 * @param {ReturnType<import("./transitions-api.mjs").siteApi>} api a 2.1.0 site
 * @param {{ dir: string, stamp: string }} options output/rehearsal, and the run's stamp
 * @returns {Promise<object>} the record
 * @throws when a record is there, when the site is not 2.1.0, or when the seed stops — saying, if it made anything,
 *   to restore again
 */
export async function seedToRecord(api, { dir, stamp }) {
  const file = path.join(dir, TRANSITIONS_RECORD);
  if (existsSync(file)) {
    throw new Error(`output/rehearsal/${TRANSITIONS_RECORD} is there: this database was seeded already, or a seed stopped part-way on it, `
      + "and a second seed would leave those rows unmarked — run rehearsal:restore again (it deletes the record), then --seed; "
      + "on a database you made by hand, drop it and delete the record");
  }
  await assertSiteVersion(api, "2.1.0");
  await fs.rm(path.join(dir, TRANSITIONS_FINISH), { force: true });
  let saved = false;
  const save = async (record) => {
    await writePrivate(file, record);
    saved = true;
  };
  try {
    return await seedTransitions(api, { stamp, save });
  } catch (error) {
    if (!saved) throw error;
    throw new Error(`${error.message}; ${leftRows(api.base)}`, { cause: error });
  }
}

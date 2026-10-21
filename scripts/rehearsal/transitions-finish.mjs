/**
 * The finish of rehearsal:transitions (scripts/rehearsal-transitions.mjs): against the 3.0 site of the database
 * the seed was made on, once migrated, through its API only, each of the five states is taken to its end and
 * checked; a state that fails does not stop the next one.
 *
 * - `preparation` goes on from the step the seed left it on, then is played and finished (`playPostMatch`);
 * - `started` takes a tap in the match 2.1.0 began, then is played and finished;
 * - `postPlayers` is a 2.x post-match on its Roster step with no records to follow: it is finished as it is,
 *   and its finish writes its statistics as the match's records, settled, and the SPP once;
 * - `proposed` gets its score from the admin, confirmed, with no points: a friendly;
 * - `challenge` is accepted, and becomes a friendly.
 * Last, the league table: the friendlies left it as it was when the finish began. It is read on 3.0 both times,
 * without a session: 2.1.0 answers `GET /api/season` its own way, so the seed's reading is only for the report.
 */
import { preparationStep } from "../../src/domain/match/preparation.mjs";
import { POST_STEPS } from "../../src/domain/post-match/rules.mjs";
import { finishPreMatch, postMatch, preMatch } from "./transitions-api.mjs";
import { eventMismatches, moneyMismatches, seasonTable, sppAfterMatch, sppMismatches } from "./transitions-checks.mjs";

const SIDES = ["home", "away"];
const ROSTER_STEP = POST_STEPS.indexOf("roster"); // where a side is once its Players step is locked

const signIn = async (api, { login, password }) => (await api.ok("POST", "/api/auth/login", { body: { login, password } })).token;
const rosterOf = async (api, teamId, token) => (await api.ok("GET", `/api/teams/${teamId}`, { token })).team.roster;
const recordsOf = async (api, teamId, gameId, token) => (await api.ok("GET", `/api/teams/${teamId}/events?pairing=${gameId}`, { token })).events;
const total = (events, counter) => events.filter((event) => event.counter === counter).reduce((sum, event) => sum + event.delta, 0);

function failIf(mismatches, what) {
  if (mismatches.length) throw new Error(`${what}: ${mismatches.join("; ")}`);
}

/**
 * What a finished match must show, counted here and not by the post-match: SPP once (`sppAfterMatch`) on the
 * rosters after it, the match's records all settled and adding up to the statistics, each side's money adding
 * up from the team before to the team after, and the result confirmed with no points.
 *
 * @param {{ gameId: string, tokens: object, teamIds: object, before: object, sides: object, answer: object }} match
 *   `before` and `sides` by side: the roster before the finish, and the statistics and MVPs it was given
 * @returns {Promise<string[]>} what was checked
 */
async function checkFinished(api, { gameId, tokens, teamIds, before, sides, answer }) {
  const state = answer.postMatch, checks = [];
  if (state.status !== "completed") throw new Error(`the post-match is ${state.status} after the finish`);
  for (const side of SIDES) {
    const after = await rosterOf(api, teamIds[side], tokens[side]);
    failIf(sppMismatches(sppAfterMatch(before[side].players, sides[side]), after.players), `${side} SPP`);
    const records = await recordsOf(api, teamIds[side], gameId, tokens[side]);
    failIf(eventMismatches(records, sides[side].statistics), `${side} records of the match`);
    failIf(moneyMismatches(state[side].settlement?.accounting, before[side], after), `${side} money`);
    checks.push(`${side}: SPP once for ${before[side].players.length} players, ${records.length} records settled and adding up, the money adds up`);
  }
  const { game } = await api.ok("GET", `/api/games/${gameId}`, { token: tokens.home });
  const score = [game.homeTouchdowns, game.awayTouchdowns, game.homeCasualties, game.awayCasualties];
  const expected = [state.result.home.touchdowns, state.result.away.touchdowns, state.result.home.casualties, state.result.away.casualties];
  if (game.resultStatus !== "confirmed" || score.join() !== expected.join()) throw new Error(`the match is ${game.resultStatus} at ${score.join("/")}, the post-match says ${expected.join("/")}`);
  if (game.homePoints !== 0 || game.awayPoints !== 0) throw new Error(`a friendly gave points: ${game.homePoints}:${game.awayPoints}`);
  return [...checks, `confirmed ${score.join("/")}, points 0:0`];
}

// The money, the next match and the confirmation, both sides; the post-match is then ready to finish.
async function confirmBoth(post) {
  for (const side of SIDES) await post.act(side, { type: "finance", deposit: 0, mistake: { roll: 6 } });
  for (const side of SIDES) await post.act(side, { type: "next", captain: post.answer.postMatch[side].baseRoster.players[0].id });
  for (const side of SIDES) await post.act(side, { type: "confirm" });
}

/**
 * A post-match of 3.0 from its first step to its finish, then `checkFinished`: the score the match's records
 * add up to, agreed; the fans; each side's statistics as the post-match read them from the records, with the
 * roster's second player as MVP; every later step; the finish.
 *
 * @param {ReturnType<import("./transitions-api.mjs").siteApi>} api
 * @param {string} gameId
 * @param {{ home: string, away: string }} tokens
 * @returns {Promise<string[]>} what was checked
 */
export async function playPostMatch(api, gameId, tokens) {
  const post = postMatch(api, gameId, tokens);
  const opening = (await post.read()).postMatch;
  const teamIds = { home: opening.home.team.id, away: opening.away.team.id }, before = {}, score = {}, sides = {};
  for (const side of SIDES) {
    before[side] = await rosterOf(api, teamIds[side], tokens[side]);
    const records = await recordsOf(api, teamIds[side], gameId, tokens[side]);
    score[side] = { touchdowns: total(records, "touchdowns"), casualties: total(records, "casualties") };
  }
  await post.act("home", { type: "result", home: score.home, away: score.away });
  await post.act("away", { type: "agree-result" });
  for (const side of SIDES) await post.act(side, { type: "fans", roll: 3 });
  for (const side of SIDES) {
    const held = post.answer.postMatch[side], mvps = [before[side].players[1].id];
    await post.act(side, { type: "statistics", statistics: held.statistics, mvps, injuries: held.injuries });
    sides[side] = { statistics: post.answer.postMatch[side].statistics, mvps };
  }
  for (const type of ["lock-players", "lock-roster"]) for (const side of SIDES) await post.act(side, { type });
  await confirmBoth(post);
  const answer = await post.finish();
  return [`played ${score.home.touchdowns}–${score.away.touchdowns} as the records say, and finished`,
    ...await checkFinished(api, { gameId, tokens, teamIds, before, sides, answer })];
}

async function finishPreparation(api, seeded, tokens) {
  const match = preMatch(api, seeded.gameId, tokens);
  const step = preparationStep((await match.read()).preparation);
  if (step !== seeded.step) throw new Error(`the pre-match is on step ${step}; 2.1.0 left it on step ${seeded.step}`);
  await finishPreMatch(match);
  return [`the pre-match goes on from step ${step}, and the match starts`, ...await playPostMatch(api, seeded.gameId, tokens)];
}

async function finishStarted(api, seeded, tokens) {
  const playerId = (await rosterOf(api, seeded.teamIds.home, tokens.home)).players[0].id;
  await api.ok("POST", `/api/teams/${seeded.teamIds.home}/events`,
    { token: tokens.home, body: { pairingId: seeded.gameId, playerId, counter: "touchdowns", delta: 1 } });
  return ["a tap in the match 2.1.0 began is taken", ...await playPostMatch(api, seeded.gameId, tokens)];
}

async function finishPostPlayers(api, seeded, tokens) {
  const post = postMatch(api, seeded.gameId, tokens);
  const opening = (await post.read()).postMatch;
  for (const side of SIDES) {
    if (opening[side].stage !== ROSTER_STEP) throw new Error(`the ${side} side is on step ${opening[side].stage}, not ${ROSTER_STEP}`);
    if (Object.hasOwn(opening[side], "followsEvents")) throw new Error(`the ${side} side of a 2.x post-match follows records (followsEvents)`);
  }
  for (const side of SIDES) await post.act(side, { type: "lock-roster" });
  await confirmBoth(post);
  const answer = await post.finish();
  const before = Object.fromEntries(SIDES.map((side) => [side, seeded.before[seeded.teamIds[side]]]));
  const sides = Object.fromEntries(SIDES.map((side) => [side, { statistics: seeded.statistics[side], mvps: seeded.mvps[side] }]));
  return ["the post-match 2.1.0 began is on its Roster step, with no records to follow", "finished, the teams as they were",
    ...await checkFinished(api, { gameId: seeded.gameId, tokens, teamIds: seeded.teamIds, before, sides, answer })];
}

async function finishProposed(api, seeded, tokens) {
  const { game } = await api.ok("PATCH", `/api/games/${seeded.gameId}`, { token: tokens.admin, body: seeded.score });
  const wrong = Object.keys(seeded.score).filter((key) => game[key] !== seeded.score[key]);
  if (game.resultStatus !== "confirmed") throw new Error(`the admin's score left the result ${game.resultStatus}`);
  if (wrong.length) throw new Error(`the admin's score is not the one sent: ${wrong.map((key) => `${key} ${game[key]}`).join(", ")}`);
  if (game.homePoints !== 0 || game.awayPoints !== 0) throw new Error(`a friendly gave points: ${game.homePoints}:${game.awayPoints}`);
  return [`the admin enters the score sent in 2.1.0: confirmed ${Object.values(seeded.score).join("/")}, points 0:0`];
}

async function finishChallenge(api, seeded, tokens) {
  const { gameId } = await api.ok("POST", `/api/challenges/${seeded.challengeId}/accept`, { token: tokens.away, body: { teamId: seeded.teamId } });
  if (!gameId) throw new Error("the challenge was accepted with no match");
  const { game } = await api.ok("GET", `/api/games/${gameId}`, { token: tokens.away });
  if (game.kind !== "friendly" || game.away?.team?.id !== seeded.teamId) throw new Error(`the match ${gameId} is not the friendly of the challenge`);
  return [`accepted: the friendly ${gameId}`];
}

async function checkTable(api, before, seededTable) {
  const after = seasonTable(await api.ok("GET", "/api/season"));
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`the league table changed: ${JSON.stringify(before).slice(0, 300)} → ${JSON.stringify(after).slice(0, 300)}`);
  }
  const alike = JSON.stringify(seededTable) === JSON.stringify(after);
  return [`season ${after.id}: ${after.standings.length} entries, as before the finish`,
    alike ? "as 2.1.0 answered it at the seed" : "2.1.0 answered it otherwise at the seed (for the report only)"];
}

const FINISHERS = [
  ["preparation", finishPreparation], ["started", finishStarted], ["postPlayers", finishPostPlayers],
  ["proposed", finishProposed], ["challenge", finishChallenge],
];

async function settle(name, run) {
  try {
    return { state: name, ok: true, checks: await run() };
  } catch (error) {
    return { state: name, ok: false, checks: [], error: error.message };
  }
}

/**
 * The five states taken to their end on the 3.0 site, then the league table.
 *
 * @param {ReturnType<import("./transitions-api.mjs").siteApi>} api the 3.0 site
 * @param {object} record what --seed wrote (`assertTransitionsRecord`)
 * @param {{ admin: { login: string, password: string } }} options the 3.0 server's admin (ADMIN_LOGIN, ADMIN_PASSWORD)
 * @returns {Promise<{ state: string, ok: boolean, checks: string[], error?: string }[]>} one per state, and `table`
 */
export async function finishTransitions(api, record, { admin }) {
  const tokens = {
    home: await signIn(api, record.coaches.home), away: await signIn(api, record.coaches.away), admin: await signIn(api, admin),
  };
  const table = seasonTable(await api.ok("GET", "/api/season"));
  const results = [];
  for (const [name, finish] of FINISHERS) results.push(await settle(name, () => finish(api, record.cases[name], tokens)));
  results.push(await settle("table", () => checkTable(api, table, record.season)));
  return results;
}

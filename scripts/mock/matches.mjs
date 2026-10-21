/**
 * The mock API's matches (stage 09a): the opponent's team as his coach's public page has it, a match's preparation
 * played by the domain as the server plays it (server/season/preparation.mjs and preparation-store.mjs are the
 * reference), its start, and two routes of the mock's own that set a state for the screenshots.
 *
 *   GET   /api/players/:uid/teams/:tid   an opponent of the coach's matches: `{user, team}` (`publicUser`,
 *                                 `publicSavedTeam`); his team asked under another user is 404 TEAM_NOT_FOUND. The
 *                                 first rival (Rival Team, Dwarf; g1's, also g6's and g7's) has two out — Out One, a
 *                                 Niggling Injury, and Out Two, disqualified (`{code: "other", note: "Disqualified"}`) —
 *                                 and seven who play, in the case `plus` until `before` says otherwise. Every other
 *                                 rival has seven of the race's first position and nobody out. A coach's own team is
 *                                 not this module's: mock-api.mjs answers it (`answerPeople`).
 *   GET   /api/games/:id/preparation   `{preparation, snapshots, viewerSide, isAdmin, fixture}` for any match of the
 *                                 list (else 404 GAME_NOT_FOUND). Made at the first read from the teams as they are
 *                                 (`createPreparation`); a match the list has `in_progress` (g2) is played to its start
 *                                 first, so it has both sheets, one `ready` to both confirmations. A read takes a roster
 *                                 saved since (`resetChangedRosters`: the dice stay) and sets the pair's
 *                                 `preparationStatus` to the preparation's, as the server does: g1 reads `preparing`
 *                                 from then on. `viewerSide` is the coach's side, `isAdmin` is MOCK_ADMIN=1's.
 *   PATCH /api/games/:id/preparation   `{revision, side?, action}`, checked in the server's order: no action 400
 *                                 MATCH_ACTION; a roster saved since 409 MATCH_ROSTER_CHANGED; a closed round 409
 *                                 ROUND_CLOSED_FOR_PLAYERS; a confirmed score 409 RESULT_ALREADY_CONFIRMED; another
 *                                 revision 409 MATCH_REVISION; the other side (not an administrator) 403
 *                                 FIXTURE_NOT_YOURS; then `applyPreparationAction`, whose refusals are 409 with their
 *                                 codes. Else the payload, one revision on.
 *   POST  /api/games/:id/start          `{revision, side?}`: a match in play is answered as it stands (a second start);
 *                                 else the same checks, `createMatchSnapshots` (409 MATCH_WAIT until both confirmed),
 *                                 then `in_progress` with both sheets, one revision on, and the pair in play.
 *   POST  /api/mock/prep/:id/:step      mock only: the match's preparation made afresh and played by the domain for both
 *                                 sides up to `step` — `fans` (nothing done, step 0), `weather` (both Fan Factor dice:
 *                                 the coach 2, the opponent 1; step 1), `roster` (the weather, Autumn 3 + 4; step 2),
 *                                 `inducements` (both rosters confirmed, and the opponent's purchases if he buys first;
 *                                 step 3), `review` (both purchases, the first buyer first; step 4, nobody confirmed),
 *                                 `ready` (both confirmed: `ready`). A match in play is set back too. Answers the
 *                                 payload; 400 FIELD_INVALID `step` for another word.
 *   POST  /api/mock/before/:case        mock only: the first rival's roster for «Before the match», each a new revision
 *                                 of his team, made against Mock Team's CTV as it is when asked: `plus` 90k dearer (the
 *                                 coach gets the inducements), `even` level, `minus` 90k cheaper. Seven Dwarfs play —
 *                                 Blocker Linemen and as few Runners, Blitzers or a Troll Slayer as the sum needs, the
 *                                 re-rolls nearest two — and the two out stay. Both races are Tier 1: no tier bonus. With
 *                                 the mock's Mock Team (670k: scripts/mock/treasury.mjs gives it an apothecary) `plus` is
 *                                 760k (5 Linemen, a Runner, a Blitzer, 4 re-rolls), `even` 670k (3 Linemen, 2 Runners, 2
 *                                 Blitzers, 2 re-rolls), `minus` 580k (5 Linemen, a Runner, a Blitzer, 1 re-roll).
 *                                 `even-bonus` is level too, but the rival plays Tzeentch, a Tier 2 race (the list's
 *                                 game says so too): his tier bonus stands at equal CTVs (decision 12, the final review's
 *                                 m-7) — at 670k 5 Blue Horrors, 2 Forsaken and 4 re-rolls. Any other case gives him back
 *                                 his Dwarfs. Answers `{case, team, ctv: {own, rival}}`; 400 FIELD_INVALID `case` for
 *                                 another word.
 *
 * What it does not do: the start spends no treasury and seals no purchase (the server's `applyPreMatchTreasury`), the
 * teams' revisions stay; nobody hires a Journeyman for the opponent; ids are the mock's, not UUIDs. Everything is held
 * in memory: a write lasts until the mock restarts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sourcesChanged } from "../../server/season/preparation-store.mjs";
import { expandCollections } from "../../src/data/reference.mjs";
import { purchaseOrder } from "../../src/domain/match/budget.mjs";
import { applyPreparationAction, createPreparation, preparationStep, resetChangedRosters, upgradePreparation } from "../../src/domain/match/preparation.mjs";
import { calculateMatchCtv, createMatchSide } from "../../src/domain/match/roster.mjs";
import { CONFIRM_ACTION, SIDES, matchError, otherSide } from "../../src/domain/match/rules.mjs";
import { createMatchSnapshots } from "../../src/domain/match/snapshot.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const STARTED = new Date().toISOString();
const PUBLIC_TEAM = /^\/api\/players\/([^/]+)\/teams\/([^/]+)$/;
const PREPARATION = /^\/api\/games\/([^/]+)\/(preparation|start)$/;
const MOCK_PREP = /^\/api\/mock\/prep\/([^/]+)\/([^/]+)$/;
const MOCK_BEFORE = /^\/api\/mock\/before\/([^/]+)$/;
/** The steps `POST /api/mock/prep` plays to, in order; `ready` is the review with both confirmed. */
const PLAYED_STEPS = ["fans", "weather", "roster", "inducements", "review", "ready"];
/** The match whose opponent is the first rival: the one «Before the match» is photographed on. */
const FIRST_MATCH = "g1";

let reference = null;
/**
 * The built data, read once, as scripts/mock/rolls.mjs reads it: not through server/domain/match-reference.mjs, which
 * would load the server's .env into the mock (pre-flight L22). A read that failed is read again next time.
 */
const referenceData = () => (reference ??= fs.readFile(path.join(rootDir, "public", "data.en.json"), "utf8")
  .then((text) => expandCollections(JSON.parse(text)))
  .catch((error) => {
    reference = null;
    throw error;
  }));

/** A refusal the answer turns into the server's `errorPayload`, as the domain's `matchError` is one (409). */
const refusal = (status, code, params = {}) => Object.assign(new Error(code), { status, code, params });

// ---- The rivals ---------------------------------------------------------------------------------------------------

const playerOf = (team, number, rowIndex, name, changes = {}) => ({
  id: `${team}-${number}`, rowIndex, number: String(number), name, statMods: {}, extraSkills: [], favouredSkills: [], spp: {}, advancements: [], ...changes,
});
/** The first rival's two out, in every case: a Blocker Lineman with a Niggling Injury and a Troll Slayer disqualified. */
const outOf = (team) => [
  playerOf(team, 8, 0, "Out One", { skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, niglingInjury: true }),
  playerOf(team, 9, 3, "Out Two", { skipNextGame: true, absence: { code: "other", note: "Disqualified" } }),
];
/** How far the first rival's CTV stands from the coach's in each case of «Before the match», in k. */
const BEFORE_CASES = { plus: 90, even: 0, minus: -90, "even-bonus": 0 };
/**
 * The race the first rival plays in a case, what he plays beside its first position (row 0) — rows of the race and how
 * many of each it leaves beside the two out — and his players' word. A Dwarf team in mock-api.mjs: Runners (1),
 * Blitzers (2), a Troll Slayer (3). For `even-bonus` Tzeentch, Tier 2: Pink Horrors (1), Forsaken (2).
 */
const DWARVES = { slug: "teams/dwarf", rows: [[1, 2], [2, 2], [3, 1]], word: "Dwarf" };
const CASE_RACES = { "even-bonus": { slug: "teams/tzeentch", rows: [[1, 3], [2, 2]], word: "Horror" } };
const NUMBERS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven"];

/** A roster as the mock's teams carry one (`rosterOf`, mock-api.mjs), with `rerolls` re-rolls. */
const rosterOf = (side, players, rerolls) => ({
  teamSlug: side.team.baseTeamSlug, teamName: side.team.name, players,
  roster: players.reduce((counts, { rowIndex }) => ({ ...counts, [rowIndex]: (counts[rowIndex] ?? 0) + 1 }), {}),
  treasury: 70, coachesSafe: 0, startingRerolls: Math.min(1, rerolls), teamRerolls: Math.max(0, rerolls - 1), purchasedStaff: {}, dedicatedFans: 2,
});
/** The first rival's roster: players of `rows` (row indexes, in order) named by `word`, then the two out. */
const caseRoster = (side, rows, rerolls, word = DWARVES.word) => rosterOf(side,
  [...rows.map((rowIndex, at) => playerOf(side.team.id, at + 1, rowIndex, `${word} ${NUMBERS[at]}`)), ...outOf(side.team.id)], rerolls);
/** Seven of the race's first position, nobody out, two re-rolls. */
const wholeRoster = (side) => rosterOf(side, NUMBERS.map((word, at) => playerOf(side.team.id, at + 1, 0, `Rival ${word}`)), 2);

/** The CTV a team (`baseTeamSlug`, `roster`) would take into a match. */
const ctvOf = (team, data) => calculateMatchCtv(createMatchSide({ user: null, team }, data)).total;

/** Every mix of `rows` (`[row, at most, what one costs over a Lineman]`), fewest players first: `{rows, cost}`. */
function mixesOf(rows) {
  let mixes = [{ rows: [], cost: 0 }];
  for (const [row, most, extra] of rows) {
    mixes = mixes.flatMap((mix) => Array.from({ length: most + 1 }, (_, count) => ({ rows: [...mix.rows, ...Array(count).fill(row)], cost: mix.cost + count * extra })));
  }
  return mixes.sort((one, other) => one.rows.length - other.rows.length);
}

/**
 * The first rival's roster `gap` k from the coach's `own` CTV: seven players (fewer only when seven cost too much), as
 * few besides Blocker Linemen as the sum needs, the re-rolls nearest two. Each part is priced by the domain (the CTV is
 * a sum) and the whole once more; a sum no roster makes is the mock's error.
 */
function caseFor(side, own, gap, data, race = DWARVES) {
  const priced = (rows, rerolls) => ctvOf({ baseTeamSlug: side.team.baseTeamSlug, roster: caseRoster(side, rows, rerolls, race.word) }, data);
  const lineman = priced([0], 0), reroll = priced([], 1);
  const mixes = mixesOf(race.rows.map(([row, most]) => [row, most, priced([row], 0) - lineman]));
  for (const count of [7, 6, 5, 4]) {
    for (const rerolls of [2, 3, 1, 4, 0, 5, 6, 7, 8]) {
      const mix = mixes.find((item) => item.rows.length <= count && item.cost === own + gap - count * lineman - rerolls * reroll);
      const rows = mix && [...Array(count - mix.rows.length).fill(0), ...mix.rows];
      if (rows && priced(rows, rerolls) === own + gap) return caseRoster(side, rows, rerolls, race.word);
    }
  }
  throw new Error(`mock: no roster of ${side.team.name} stands ${gap}k from the coach's ${own}k`);
}

/** The coach's side of a match. */
const viewerSideOf = (game) => (game.viewerIsHome === false ? "away" : "home");
/** The opponent's side of a match: `{user, team}` as the games carry them. */
const opponentOf = (game) => game[otherSide(viewerSideOf(game))];

/** The first rival's roster for the case `name`, against the coach's team of g1 as it is now: `{roster, own, slug}`. */
async function caseNow({ teams, games }, name) {
  const game = games.find((item) => item.id === FIRST_MATCH);
  const team = teams.find((item) => item.id === game[viewerSideOf(game)].team.id);
  if (!team) throw refusal(404, "TEAM_NOT_FOUND");
  const data = await referenceData();
  const own = ctvOf(team, data);
  const race = CASE_RACES[name] ?? DWARVES;
  const rival = opponentOf(game);
  const side = { ...rival, team: { ...rival.team, baseTeamSlug: race.slug } };
  return { roster: caseFor(side, own, BEFORE_CASES[name], data, race), own, slug: race.slug };
}

/** Each rival's team as his public page has it, made at the first ask: rival team id → `publicSavedTeam`. */
const rivals = new Map();
/** The rival team `teamId` of the coach's matches with its coach, or null. The first ask makes his team: g1's in case `plus`. */
async function rivalOf(mock, teamId) {
  const side = mock.games.map(opponentOf).find((item) => item?.team?.id === teamId);
  if (!side) return null;
  if (!rivals.has(teamId)) {
    const first = opponentOf(mock.games.find((game) => game.id === FIRST_MATCH) ?? {})?.team?.id === teamId;
    const roster = first ? (await caseNow(mock, "plus")).roster : wholeRoster(side);
    if (!rivals.has(teamId)) {
      rivals.set(teamId, { id: teamId, name: side.team.name, baseTeamSlug: side.team.baseTeamSlug, logoData: null, roster, revision: 1,
        stage: "active", activatedAt: null, inActiveSeason: true, createdAt: STARTED, updatedAt: STARTED });
    }
  }
  return { user: side.user, team: rivals.get(teamId) };
}

/** `GET /api/players/:uid/teams/:tid` for a rival's team; null for any other team. */
async function publicTeam(mock, userId, teamId) {
  const found = await rivalOf(mock, teamId);
  if (!found) return null;
  if (found.user.id !== userId) throw refusal(404, "TEAM_NOT_FOUND");
  const { id, login } = found.user;
  return mock.reply({ user: { id, login, telegram: `@${login}`, isAdmin: false, createdAt: STARTED }, team: found.team });
}

/** `POST /api/mock/before/:case`: the first rival's roster for the case, a new revision of his team. */
async function setBefore(name, mock) {
  if (!Object.hasOwn(BEFORE_CASES, name)) throw refusal(400, "FIELD_INVALID", { field: "case" });
  const game = mock.games.find((item) => item.id === FIRST_MATCH);
  const found = game && await rivalOf(mock, opponentOf(game).team.id);
  if (!found) throw refusal(404, "TEAM_NOT_FOUND");
  const { roster, own, slug } = await caseNow(mock, name);
  const { team } = found;
  Object.assign(team, { baseTeamSlug: slug, roster, revision: team.revision + 1, updatedAt: new Date().toISOString() });
  // The list's games name his race too: the board's line and «Before the match» agree.
  for (const item of mock.games) if (opponentOf(item)?.team?.id === team.id) opponentOf(item).team.baseTeamSlug = slug;
  return mock.reply({ case: name, team, ctv: { own, rival: ctvOf(team, await referenceData()) } });
}

// ---- The preparation ----------------------------------------------------------------------------------------------

/** gameId → `{state, snapshots}`: each match's preparation and, once started, its two sheets. */
const preparations = new Map();

/** The match `id` of the list, or a 404. */
function gameOf(games, id) {
  const game = games.find((item) => item.id === id);
  if (!game) throw refusal(404, "GAME_NOT_FOUND");
  return game;
}

/** Both sides of a match as the server loads them (`loadPreparationSources`): the coach's team and the rival's. */
async function sourcesOf(game, mock) {
  const sources = {};
  for (const side of SIDES) {
    const { user, team: { id } } = game[side];
    const team = mock.teams.find((item) => item.id === id) ?? (await rivalOf(mock, id))?.team;
    if (!team) throw refusal(404, "TEAM_NOT_FOUND");
    const { name, baseTeamSlug, revision, roster } = team;
    sources[side] = { user: { id: user.id, login: user.login }, team: { id, name, baseTeamSlug, revision, roster } };
  }
  return sources;
}

/** Whether the round of a match is closed to its coaches, as the server's fixture says it. */
const roundClosed = (game) => game.kind !== "friendly" && (game.roundStatus !== "started" || Number(game.roundNumber) !== Number(game.season?.currentRound));

/** What `GET …/preparation` answers (`preparationResponse`). */
const payloadOf = (game, { state, snapshots }) => ({
  preparation: state, snapshots, viewerSide: viewerSideOf(game), isAdmin: process.env.MOCK_ADMIN === "1",
  fixture: { id: game.id, kind: game.kind, seasonName: game.season?.name ?? null, roundNumber: game.roundNumber, tableNumber: game.tableNumber,
    closed: game.resultStatus === "confirmed" || roundClosed(game) },
});

/**
 * The domain's actions for both sides from a fresh preparation up to `step` (`PLAYED_STEPS`), and nothing past it:
 * the coach's side rolls 2 and the weather, the opponent 1. At `inducements` the opponent has bought if he buys first,
 * so the coach's turn is on; at `review` both have bought, the first buyer first.
 */
function playTo(fresh, step, game, data) {
  const reach = PLAYED_STEPS.indexOf(step), viewer = viewerSideOf(game), other = otherSide(viewer);
  let state = fresh;
  const act = (side, action) => { state = applyPreparationAction(state, side, action, data, game[side].user.id); };
  if (reach >= 1) { act(viewer, { type: "fans", value: 2 }); act(other, { type: "fans", value: 1 }); }
  if (reach >= 2) act(viewer, { type: "weather", season: "Autumn", home: 3, away: 4 });
  if (reach >= 3) for (const side of [viewer, other]) act(side, { type: "lock-roster" });
  const first = purchaseOrder(state);
  if (reach === 3 && first === other) act(other, { type: "lock-basket" });
  if (reach >= 4) for (const side of [first ?? viewer, otherSide(first ?? viewer)]) act(side, { type: "lock-basket" });
  if (reach >= 5) for (const side of SIDES) act(side, { type: CONFIRM_ACTION });
  if (preparationStep(state) !== Math.min(reach, 4)) throw new Error(`mock prep: ${game.id} did not reach ${step}`);
  return state;
}

/** A match begun: both sheets, `in_progress`, one revision on (`startPreparedMatch`, without the treasury). */
function started(state, data) {
  const snapshots = createMatchSnapshots(state, data);
  return { state: { ...structuredClone(state), status: "in_progress", startedAt: new Date().toISOString(), revision: state.revision + 1 }, snapshots };
}

/** Keep a match's preparation, and set the pair's status to it, as `savePreparationState` does. */
function hold(game, held) {
  preparations.set(game.id, held);
  game.preparationStatus = held.state.status;
  return held;
}

/** The preparation a match starts the mock with: fresh, or played to `ready` or begun as the list says it is. */
function firstPreparation(game, sources, data) {
  const fresh = createPreparation(sources, data);
  if (game.preparationStatus === "in_progress") return started(playTo(fresh, "ready", game, data), data);
  return { state: game.preparationStatus === "ready" ? playTo(fresh, "ready", game, data) : fresh, snapshots: {} };
}

/** The match's preparation as `loadPreparationState` loads it: a read takes a roster saved since, a write is refused. */
async function loadPreparation(game, mock, data, reading) {
  const sources = await sourcesOf(game, mock);
  const held = preparations.get(game.id) ?? hold(game, firstPreparation(game, sources, data));
  let { state } = held;
  if (state.status !== "in_progress" && sourcesChanged(state, sources)) {
    if (!reading) throw matchError("MATCH_ROSTER_CHANGED");
    state = resetChangedRosters(state, sources, data);
  }
  return { ...held, state: upgradePreparation(state) };
}

/** The side a write is for, after the server's checks (`checkPreparationWrite`). */
function sideOfWrite(game, state, body) {
  if (roundClosed(game)) throw refusal(409, "ROUND_CLOSED_FOR_PLAYERS");
  if (game.resultStatus === "confirmed") throw refusal(409, "RESULT_ALREADY_CONFIRMED");
  if (Number(body.revision) !== state.revision) throw matchError("MATCH_REVISION");
  const viewer = viewerSideOf(game), side = body.side || viewer;
  if (!SIDES.includes(side) || (process.env.MOCK_ADMIN !== "1" && side !== viewer)) throw refusal(403, "FIXTURE_NOT_YOURS");
  return side;
}

/** `GET`/`PATCH …/preparation` and `POST …/start` (`accessPreparation`). */
async function answerPreparation(request, game, route, mock) {
  const { method } = request;
  const reading = route === "preparation" && method === "GET";
  const writing = route === "preparation" && method === "PATCH";
  if (!reading && !writing && !(route === "start" && method === "POST")) throw refusal(405, "ROUTE_NOT_FOUND");
  const body = reading ? null : await mock.readBody(request);
  if (writing && (!body.action || typeof body.action.type !== "string")) throw refusal(400, "MATCH_ACTION");
  const data = await referenceData();
  let held = await loadPreparation(game, mock, data, reading);
  if (writing) {
    const side = sideOfWrite(game, held.state, body);
    held = { ...held, state: applyPreparationAction(held.state, side, body.action, data, game[side].user.id) };
  } else if (!reading && held.state.status !== "in_progress") {
    sideOfWrite(game, held.state, body);
    held = started(held.state, data);
  }
  return mock.reply(payloadOf(game, hold(game, held)));
}

/** `POST /api/mock/prep/:id/:step`: the preparation made afresh and played to the step. */
async function setPreparation(game, step, mock) {
  if (!PLAYED_STEPS.includes(step)) throw refusal(400, "FIELD_INVALID", { field: "step" });
  const data = await referenceData();
  const state = playTo(createPreparation(await sourcesOf(game, mock), data), step, game, data);
  return mock.reply(payloadOf(game, hold(game, { state, snapshots: {} })));
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], games: object[], readBody: Function, reply: Function, refuse: Function}} mock the mock's
 *   lists and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerMatches(request, pathname, mock) {
  const { method } = request;
  const decoded = (match) => match.slice(1).map(decodeURIComponent);
  try {
    const team = pathname.match(PUBLIC_TEAM);
    if (team && method === "GET") return await publicTeam(mock, ...decoded(team));
    const preparation = pathname.match(PREPARATION);
    if (preparation) return await answerPreparation(request, gameOf(mock.games, decoded(preparation)[0]), preparation[2], mock);
    const step = pathname.match(MOCK_PREP);
    if (step && method === "POST") return await setPreparation(gameOf(mock.games, decoded(step)[0]), decoded(step)[1], mock);
    const before = pathname.match(MOCK_BEFORE);
    if (before && method === "POST") return await setBefore(decoded(before)[0], mock);
    return null;
  } catch (error) {
    if (!error.code || !error.status) throw error;
    return mock.refuse(error.status, error.code, error.params ?? {});
  }
}

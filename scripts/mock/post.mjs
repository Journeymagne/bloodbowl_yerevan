/**
 * The mock API's post-match (stage 09b): the post-match of a match in play, played by the domain as the server plays it
 * (server/season/post-match.mjs and server/routes/post-match.mjs are the reference), the site's dice of its Players
 * step, its finish, and a route of the mock's own that sets a state for the screenshots.
 *
 *   GET   /api/games/:id/post-match   `{postMatch, viewerSide, isAdmin, rosterChanged, fixture}` for a match of the list in
 *                                 play (`preparationStatus: "in_progress"`: g2, Mock Humans against Rival Raiders); a match
 *                                 not begun is 409 POST_NOT_STARTED, an id the list has not 404 GAME_NOT_FOUND. Made at the
 *                                 first read from the match's two sheets (scripts/mock/matches.mjs, its start) and the teams
 *                                 as they are now (`createPostMatch`), as the case `result` leaves it; a match started again
 *                                 begins a new one. The records are this module's and followed at every read and write
 *                                 (`followEvents`): each side's players tapped in the order of its sheet, as PostResult.html
 *                                 counts them — ours TD 1 + COMP 1, TD 1, CAS 2, CAS 1 + KO 1, a Lasting Injury (AG); theirs
 *                                 TD 1 + COMP 1, CAS 1: «records: 8 + 3», 2–1, CAS 3–1. Both teams have played four matches
 *                                 before, so no rookie protection turns an injury into Badly Hurt (the prototypes' case).
 *                                 `rosterChanged` says a team saved since the post-match began (its revision).
 *   PATCH /api/games/:id/post-match   `{revision, side?, action}`, checked in the server's order: no `action.type` 400
 *                                 POST_ACTION; the other side (not an administrator) 403 FIXTURE_NOT_YOURS; another revision
 *                                 409 POST_REVISION; a finished post-match 409 POST_CLOSED; `reset-side` starts the side again
 *                                 from its team as it is now; a team saved since 409 POST_TEAM_CHANGED; an advancement naming
 *                                 a site roll that is not this side's roll for that player, or that does not fit it, 422
 *                                 DICE_ROLL_MISMATCH `{playerId}`; then `applyPostAction`, whose refusals are 409 with their
 *                                 codes. Else the payload, one revision on.
 *   POST  /api/games/:id/finish       `{revision, side?}`: a finished post-match is answered as it stands; else the checks
 *                                 above, 409 POST_INCOMPLETE until both sides confirmed (`ready`), each side held to the
 *                                 domain (`validatePostSide`, kept as its `settlement`), `completed`; and the match of the
 *                                 list finished as the server finishes its pair: the score, the points (`postPoints`), the
 *                                 MVPs, `resultStatus: "confirmed"`, `postMatchStatus: "completed"`.
 *   POST  /api/games/:id/post-match/rolls  `{side?, playerId, purpose, category?}`: the body first (400 FIELD_INVALID
 *                                 `purpose`, or `category` for a random skill); the side's coach only (the viewer's side,
 *                                 an administrator's other side neither: 403 FIXTURE_NOT_YOURS); not finished (409
 *                                 POST_CLOSED), the team as it began (409 POST_TEAM_CHANGED), the side on the Players step
 *                                 and not confirmed (409 POST_ACTION); a player of the team's roster who may advance
 *                                 (`postAdvancer` with `site`: a journeyman, a star or the dead is 404 PLAYER_NOT_FOUND).
 *                                 Then the player's earliest roll that no choice of the side names: asked for its purpose,
 *                                 it is the answer again (`stale` once the player holds both dice's skills), for the other
 *                                 409 DICE_ROLL_WAITING `{purpose}`; else a new roll by the roster the post-match holds
 *                                 (`postPlayers`: a skill taken in it is not rolled), on the die scripts/mock/rolls.mjs
 *                                 throws — a characteristic's D8 shows 6, a random skill 16, then the first and the next
 *                                 face of the column whose skill the player lacks —, refused 422 DICE_CATEGORY or
 *                                 DICE_NO_SKILL as `randomSkillRoll` says. The post-match itself is left as it is.
 *   POST  /api/mock/post/:id/:case    mock only: the post-match made afresh (its rolls too) and played by the domain for
 *                                 both sides up to the case below; the match of the list set back to how it was (no score
 *                                 a finish wrote) and its `postMatchStatus` to the post-match's. Answers the payload; 400
 *                                 FIELD_INVALID `case` for another word.
 *
 * The cases: the stage of each side (`POST_STEPS`; ✓ confirmed) — ours, the coach's (home in g2), and theirs —, the status.
 *
 *   case         ours  theirs  status     what
 *   result       0     0       draft      nothing sent
 *   sent         1     1       draft      our score saved from the records, 2–1 and CAS 3–1; both can continue
 *   mismatch     1     1       draft      our score saved 3–1 against records of 2–1 (`scoreMismatches`, PostResultMismatch.html)
 *   agreed       1     1       draft      the score agreed, both on the Income step (PostFans.html: the opponent on it too)
 *   fans         1     2       draft      their income sent: the opponent on the Players step
 *   players      2     2       draft      both on the Players step (PostPlayers.html)
 *   players-two  2     2       draft      a technical win of ours, no records (nothing was played): two MVPs to name
 *   conceded     2     2       draft      we conceded, 0–2 and CAS 3–1 (their records hold the two TD): Blitzer Four is
 *                                         made a veteran of three advancements for the case, so a D6 says if he stays
 *   roster       3     2       draft      our Players saved — the MVP the one who stood out most, a skill of his primary
 *                                         column for him —; +1 Assistant Coach, +1 Cheerleader (PostRoster.html)
 *   finance      4     3       draft      our roster locked; their Players saved, their MVP likewise (PostFinance.html)
 *   next         5     4       draft      our treasury sent: 20k into the safe, a 6 on the Expensive Mistakes (PostNext.html)
 *   review       6 ✓   6       draft      ours confirmed with the captain kept, theirs waited for (PostReview.html)
 *   ready        6 ✓   6 ✓     ready      both confirmed: «Finish the match»
 *   completed    6 ✓   6 ✓     completed  finished, as `POST …/finish` finishes it
 *
 * What it does not do: ids are not UUIDs; the post-match's rolls are not listed by `GET /api/teams/:id/rolls`
 * (scripts/mock/rolls.mjs) and no finish uses them; a finish writes nothing into the teams (no SPP, treasury, fallen or
 * records settled) — only the match of the list; a score an administrator confirmed outside the post-match is not read;
 * a tap of the roster screen does not reach these records. Everything is held in memory until the mock restarts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../../src/data/reference.mjs";
import { CONFIRM_ACTION, SIDES, otherSide } from "../../src/domain/match/rules.mjs";
import { followEvents } from "../../src/domain/post-match/events.mjs";
import { postAdvancer, postPlayers } from "../../src/domain/post-match/roster.mjs";
import { POST_STEPS, resultAgreed } from "../../src/domain/post-match/rules.mjs";
import { mvpChoices, postPoints, sideRecords } from "../../src/domain/post-match/score.mjs";
import { applyPostAction, createPostMatch, createPostSide, validatePostSide } from "../../src/domain/post-match/state.mjs";
import { DICE_PURPOSES, SKILL_DIE, randomSkillRoll, rollFitsAdvancement, rollRefusal, statRoll } from "../../src/domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys } from "../../src/domain/roster/players.mjs";
import { categoriesForAccess, rowsForTeam } from "../../src/domain/roster/values.mjs";
import { answerMatches } from "./matches.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const POST_MATCH = /^\/api\/games\/([^/]+)\/(post-match|finish)$/;
const POST_ROLLS = /^\/api\/games\/([^/]+)\/post-match\/rolls$/;
const MOCK_POST = /^\/api\/mock\/post\/([^/]+)\/([^/]+)$/;
/** The games each team has played before: enough that no rookie protection turns an injury into Badly Hurt. */
const GAMES_PLAYED = 4;
/** What the mock's D8 always shows: a characteristic of two, Agility or Movement Allowance (scripts/mock/rolls.mjs). */
const STAT_FACE = 6;
/** The Players step: the one a roll is asked on. */
const PLAYERS_STAGE = POST_STEPS.indexOf("players");

/** What each player of a side tapped, in the order of the side's sheet: counters, and an injury put on. */
const OURS = [{ touchdowns: 1, completions: 1 }, { touchdowns: 1 }, { casualties: 2 }, { casualties: 1, knockouts: 1 }, { injury: { code: "lasting", stat: "ag" } }];
const THEIRS = [{ touchdowns: 1, completions: 1 }, { casualties: 1 }];
/** Each way a case's match went: the records of both sides. */
const TAPS = {
  played: { ours: OURS, theirs: THEIRS },
  mismatch: { ours: OURS, theirs: THEIRS },
  technical: { ours: [], theirs: [] },
  conceded: { ours: OURS, theirs: [{ touchdowns: 2, completions: 1 }, { casualties: 1 }] },
};
/** Each case: how its match went (`TAPS`) and how many of `playTo`'s moves it plays (the tenth is the finish). */
const CASES = {
  result: ["played", 0], sent: ["played", 1], mismatch: ["mismatch", 1], agreed: ["played", 2], fans: ["played", 3],
  players: ["played", 4], "players-two": ["technical", 4], conceded: ["conceded", 4], roster: ["played", 5],
  finance: ["played", 6], next: ["played", 7], review: ["played", 8], ready: ["played", 9], completed: ["played", 10],
};
/** What a finish writes into the match of the list, kept as the match was before, so that a case can set it back. */
const GAME_FIELDS = ["resultStatus", "homeTouchdowns", "awayTouchdowns", "homeCasualties", "awayCasualties", "homePoints", "awayPoints",
  "confirmedAt", "updatedAt", "postMatchStatus", "homeMvps", "awayMvps"];

let reference = null;
/**
 * The built data, read once, as scripts/mock/matches.mjs reads it: not through server/domain/match-reference.mjs, which
 * would load the server's .env into the mock (09a pre-flight L22). A read that failed is read again next time.
 */
const referenceData = () => (reference ??= fs.readFile(path.join(rootDir, "public", "data.en.json"), "utf8")
  .then((text) => expandCollections(JSON.parse(text)))
  .catch((error) => {
    reference = null;
    throw error;
  }));

/** A refusal the answer turns into the server's `errorPayload`, as the domain's `matchError` is one (409). */
const refusal = (status, code, params = {}) => Object.assign(new Error(code), { status, code, params });

/** Each match's post-match: `{state, events, rolls, startedAt}`; `rolls` are `{side, roll}`, `roll` as `publicRoll` sends it. */
const posts = new WeakMap();
/** Each match of the list as it was before a finish wrote into it (`GAME_FIELDS`). */
const originals = new WeakMap();
let lastRoll = 0;

/** The coach's side of a match. */
const viewerSideOf = (game) => (game.viewerIsHome === false ? "away" : "home");

/** The match `id` of the list, or a 404. */
function gameOf(games, id) {
  const game = games.find((item) => item.id === id);
  if (!game) throw refusal(404, "GAME_NOT_FOUND");
  return game;
}

/** A side's records as the server's `match_events` hand them: one +1 per step of `taps`, the player the sheet's n-th. */
function recordsOf(snapshot, taps) {
  return taps.flatMap((tapped, at) => {
    const playerId = snapshot.players[at]?.id;
    if (!playerId) return [];
    return Object.entries(tapped).flatMap(([counter, value]) => (counter === "injury"
      ? [{ playerId, counter, delta: 1, injury: value }]
      : Array.from({ length: value }, () => ({ playerId, counter, delta: 1, injury: null }))));
  });
}

/** Both teams as the server loads them for the post-match (`postSources`): the coach's as it is now, the rival's as he played. */
const sourcesOf = (preparation, mock) => Object.fromEntries(SIDES.map((side) => {
  const { user, team } = preparation[side];
  const { id, name, baseTeamSlug, revision, roster } = mock.teams.find((item) => item.id === team.id) ?? team;
  return [side, { user, gamesPlayed: GAMES_PLAYED, team: structuredClone({ id, name, baseTeamSlug, revision, roster }) }];
}));

/** Whether the side's team was saved since its post-match began. */
const teamChanged = (sources, state, side) => sources[side].team.revision !== state[side].baseRevision;

/** One action of the post-match, as the server takes it: the records followed before and after. */
const acted = (state, events, side, action, data) => followEvents(applyPostAction(followEvents(state, events), side, action, data), events);

/** The player of the roster the post-match holds (no journeyman, no rookie of the match) and his position's row; null for none. */
function rosterPlayer(state, side, playerId, data) {
  const player = postPlayers(state, side, data).find((item) => item.id === playerId && !item.kind);
  return player ? { player, row: rowsForTeam(state[side].reference)[player.rowIndex] } : null;
}

/** The faces of the category's column whose skills the player lacks, from 1 (a face of the D16), in the column's order. */
function freeFaces(data, row, player, category) {
  const held = heldSkillKeys(row, player);
  const column = data.skillGroups.find((group) => group.category === category)?.skills ?? [];
  return column.map((skill, at) => (held.has(canonicalSkillName(skill)) ? 0 : at + 1)).filter(Boolean);
}

/** The first skill of the player's first primary column that he lacks, or null. */
function freeSkill(data, row, player) {
  const category = categoriesForAccess(row.primary ?? [])[0];
  const [face] = category ? freeFaces(data, row, player, category) : [];
  return face ? data.skillGroups.find((group) => group.category === category).skills[face - 1] : null;
}

/**
 * The coach's player with the most advancements made a veteran for the case `conceded`: skills of his primary column
 * taken up to three advancements, the ones a concession may cost (`validateStatistics`: a D6 for each).
 */
function withVeteran(state, side, data) {
  const [first, ...others] = state[side].baseRoster.players;
  const veteran = others.reduce((most, player) => (player.advancements.length > most.advancements.length ? player : most), first);
  if (!veteran) return state;
  const row = rowsForTeam(state[side].reference)[veteran.rowIndex];
  while (veteran.advancements.length < 3) {
    const skill = freeSkill(data, row, veteran);
    if (!skill) break;
    veteran.extraSkills.push({ name: skill, access: "primary" });
    veteran.advancements.push({ type: "primary", grants: { skill } });
  }
  return state;
}

/** A post-match just begun from the match's sheets, as the match of `kind` (`TAPS`) went: its records followed. */
function begun(game, { preparation, snapshots, sources }, data, kind = "played") {
  const ours = viewerSideOf(game), taps = TAPS[kind];
  const events = { [ours]: recordsOf(snapshots[ours], taps.ours), [otherSide(ours)]: recordsOf(snapshots[otherSide(ours)], taps.theirs) };
  const withEvents = Object.fromEntries(SIDES.map((side) => [side, { ...structuredClone(sources[side]), events: events[side] }]));
  let state = createPostMatch(game.id, withEvents, structuredClone(snapshots), data);
  if (kind === "conceded") state = withVeteran(state, ours, data);
  return { state: followEvents(state, events), events, rolls: [], startedAt: preparation.startedAt };
}

/** Remember the match of the list as it is, once, before anything of this module writes into it. */
function remember(game) {
  if (!originals.has(game)) originals.set(game, structuredClone(Object.fromEntries(GAME_FIELDS.map((key) => [key, game[key] ?? null]))));
}

/** Keep a match's post-match, and set the pair's `postMatchStatus` to it, as the server's pair reads it. */
function hold(game, held) {
  posts.set(game, held);
  game.postMatchStatus = held.state.status;
  return held;
}

/**
 * The match's post-match as `lockPost` opens it: the match in play, its two sheets (read from scripts/mock/matches.mjs,
 * which answers its preparation), the teams now, and the post-match made at the first read or after a new start.
 */
async function openPost(game, mock) {
  if (game.preparationStatus !== "in_progress") throw refusal(409, "POST_NOT_STARTED");
  const prep = await answerMatches({ method: "GET" }, `/api/games/${encodeURIComponent(game.id)}/preparation`, mock);
  if (prep.status !== 200) throw refusal(prep.status, prep.payload.error.code, prep.payload.error.params);
  const { preparation, snapshots } = prep.payload;
  if (!SIDES.every((side) => snapshots[side])) throw refusal(409, "POST_NOT_STARTED");
  remember(game);
  const data = await referenceData(), opened = { preparation, snapshots, sources: sourcesOf(preparation, mock), data };
  const kept = posts.get(game);
  const held = kept?.startedAt === preparation.startedAt ? kept : begun(game, opened, data);
  return { ...opened, held: { ...held, state: followEvents(held.state, held.events) } };
}

/** What `GET …/post-match` answers (`accessPostMatch`). */
const payloadOf = (game, { state }, sources, mock) => ({
  postMatch: state, viewerSide: viewerSideOf(game), isAdmin: Boolean(mock.user?.isAdmin),
  rosterChanged: Object.fromEntries(SIDES.map((side) => [side, state.status !== "completed" && teamChanged(sources, state, side)])),
  fixture: { id: game.id, kind: game.kind, seasonName: game.season?.name ?? null, roundNumber: game.kind === "friendly" ? null : game.roundNumber ?? null },
});

/** `reset-side`: the side starts over from its team as it is now, its records read again; a rival past the Roster step goes back to the Treasury, unconfirmed. */
function resetSide(held, side, sources, data) {
  const state = structuredClone(held.state);
  state[side] = createPostSide({ ...sources[side], events: held.events[side] }, state[side].snapshot, data);
  state[side].stage = resultAgreed(state) ? 1 : 0;
  const rival = state[otherSide(side)];
  if (rival.stage >= 4) Object.assign(rival, { stage: 4, deposit: 0, mistake: {}, confirmed: false });
  return followEvents({ ...state, status: "draft", revision: state.revision + 1 }, held.events);
}

/** An advancement naming a site roll: this side's roll, for that player, which fits the advancement (`checkPostRoll`, in short). */
function checkSiteRoll(held, side, action) {
  const named = held.rolls.find((item) => item.side === side && item.roll.id === String(action.roll.id ?? "").trim())?.roll;
  if (!named || named.playerId !== action.playerId || !rollFitsAdvancement(named, { type: action.advancementType, grants: action.grant })) {
    throw refusal(422, "DICE_ROLL_MISMATCH", { playerId: action.playerId });
  }
}

/** The match of the list finished as `finishPost` finishes the pair: the score, the points, the MVPs, confirmed. */
function finishGame(game, state) {
  const points = (side) => postPoints(state, side, game.kind).total, stamp = new Date().toISOString();
  const mvps = (side) => state[side].mvps.map((id) => ({ id, name: state[side].snapshot.players.find((player) => player.id === id)?.name ?? id }));
  const { home, away } = state.result;
  Object.assign(game, { resultStatus: "confirmed", homeTouchdowns: home.touchdowns, awayTouchdowns: away.touchdowns, homeCasualties: home.casualties,
    awayCasualties: away.casualties, homePoints: points("home"), awayPoints: points("away"), confirmedAt: stamp, updatedAt: stamp,
    homeMvps: mvps("home"), awayMvps: mvps("away") });
}

/** `POST …/finish` past its checks: both confirmed, each side held to the domain, `completed`, the match of the list finished. */
function finished(game, held, sources, data) {
  const state = structuredClone(held.state);
  if (state.status !== "ready" || !resultAgreed(state)) throw refusal(409, "POST_INCOMPLETE");
  for (const side of SIDES) {
    if (teamChanged(sources, state, side)) throw refusal(409, "POST_TEAM_CHANGED");
    state[side].settlement = validatePostSide(state, side, data);
  }
  Object.assign(state, { status: "completed", completedAt: new Date().toISOString(), revision: state.revision + 1 });
  finishGame(game, state);
  return { ...held, state };
}

/** A write of `PATCH …/post-match` or `POST …/finish`, checked in the server's order (`accessPostMatch`). */
function written(game, { held, sources, data }, body, finishing, mock) {
  const viewer = viewerSideOf(game), side = body.side || viewer;
  if (!SIDES.includes(side) || (!mock.user?.isAdmin && side !== viewer)) throw refusal(403, "FIXTURE_NOT_YOURS");
  if (Number(body.revision) !== held.state.revision) throw refusal(409, "POST_REVISION");
  if (held.state.status === "completed") throw refusal(409, "POST_CLOSED");
  if (body.action?.type === "reset-side") return { ...held, state: resetSide(held, side, sources, data) };
  if (teamChanged(sources, held.state, side)) throw refusal(409, "POST_TEAM_CHANGED");
  if (finishing) return finished(game, held, sources, data);
  const { action } = body;
  if (action.type === "advance" && action.roll?.via === "site") checkSiteRoll(held, side, action);
  return { ...held, state: acted(held.state, held.events, side, action, data) };
}

/** `GET`/`PATCH …/post-match` and `POST …/finish`. */
async function answerPostMatch(request, game, route, mock) {
  const { method } = request;
  const reading = route === "post-match" && method === "GET", finishing = route === "finish" && method === "POST";
  if (!reading && !finishing && !(route === "post-match" && method === "PATCH")) throw refusal(405, "ROUTE_NOT_FOUND");
  const body = reading ? null : await mock.readBody(request);
  if (route === "post-match" && body && !body.action?.type) throw refusal(400, "POST_ACTION");
  const opened = await openPost(game, mock);
  let { held } = opened;
  if (body && !(finishing && held.state.status === "completed")) held = written(game, opened, body, finishing, mock);
  return mock.reply(payloadOf(game, hold(game, held), opened.sources, mock));
}

/** What a roll's body asks for, as `checkRoll` (server/routes/team-rolls.mjs) reads it: the ask, or a 400 for its field. */
function rollAsk(body) {
  const { purpose, category } = body ?? {};
  if (!DICE_PURPOSES.includes(purpose)) throw refusal(400, "FIELD_INVALID", { field: "purpose" });
  if (purpose === "random_skill" && (typeof category !== "string" || category === "")) throw refusal(400, "FIELD_INVALID", { field: "category" });
  return { purpose, category };
}

/** A die that shows `faces` in turn, and the last of them from then on. */
function dieOf(faces) {
  let thrown = 0;
  return () => faces[Math.min(thrown++, faces.length - 1)];
}

/** A new roll of the mock's die for the player (see the header), or the refusal of `randomSkillRoll`. */
function rollNew(data, { player, row }, { purpose, category }) {
  if (purpose === "stat") return statRoll(dieOf([STAT_FACE]));
  const [free, second] = freeFaces(data, row, player, category);
  const rolled = randomSkillRoll({ row, player, category, skillGroups: data.skillGroups, rng: dieOf([SKILL_DIE, ...[free, second].filter(Boolean)]) });
  return rolled.ok ? { ...rolled, params: { ...rolled.params, captain: Boolean(player.isCaptain) } } : rolled;
}

/** `POST …/post-match/rolls` (`rollInPostMatch`): the player's earliest roll no choice names, or a new one; nothing written. */
async function rollInPost(request, game, mock) {
  const body = await mock.readBody(request), ask = rollAsk(body);
  const { held, sources, data } = await openPost(game, mock);
  const side = body.side || viewerSideOf(game), state = held.state;
  if (side !== viewerSideOf(game)) throw refusal(403, "FIXTURE_NOT_YOURS");
  if (state.status === "completed") throw refusal(409, "POST_CLOSED");
  if (teamChanged(sources, state, side)) throw refusal(409, "POST_TEAM_CHANGED");
  if (state[side].stage !== PLAYERS_STAGE || state[side].confirmed) throw refusal(409, "POST_ACTION");
  const own = postAdvancer(state[side], body.playerId, { site: true }) && rosterPlayer(state, side, body.playerId, data);
  if (!own) throw refusal(404, "PLAYER_NOT_FOUND");
  const named = new Set(Object.values(state[side].advancements).flat().filter((choice) => choice.roll?.via === "site").map((choice) => choice.roll.id));
  const earliest = held.rolls.find((item) => item.side === side && item.roll.playerId === body.playerId && !named.has(item.roll.id))?.roll;
  if (earliest && earliest.purpose !== ask.purpose) throw refusal(409, "DICE_ROLL_WAITING", { purpose: earliest.purpose });
  if (earliest) return mock.reply({ roll: rollRefusal(earliest, own.row, own.player)?.code === "ROLL_STALE" ? { ...earliest, stale: true } : earliest });
  const rolled = rollNew(data, own, ask);
  if (!rolled.ok) throw refusal(422, rolled.reason);
  const roll = { id: `mock-post-roll-${++lastRoll}`, playerId: body.playerId, purpose: ask.purpose, params: rolled.params, result: rolled.result,
    usedAt: null, createdAt: new Date().toISOString() };
  held.rolls.push({ side, roll });
  hold(game, held);
  return mock.reply({ roll });
}

// ---- The cases ----------------------------------------------------------------------------------------------------

/** The score `ours` sends as the match of `kind` went (`TAPS`): each side's records, ours one TD up for `mismatch`. */
function scoreOf(state, ours, kind) {
  const theirs = otherSide(ours), records = (side) => sideRecords(state[side]);
  const sent = { type: "result", mode: "played", winner: "", ...Object.fromEntries([ours, theirs].map((side) =>
    [side, { touchdowns: records(side).touchdowns, casualties: records(side).casualties }])) };
  if (kind === "mismatch") sent[ours].touchdowns += 1;
  if (kind === "technical") Object.assign(sent, { mode: "technical", winner: ours });
  if (kind === "conceded") Object.assign(sent, { mode: "conceded", winner: theirs, [ours]: { ...sent[ours], touchdowns: 0 } });
  return sent;
}

/** The Income step: a D6 of 4 (a D3 of 2 after conceding; a technical win's D3 of 2 too), not painted, no stalling. */
function fansOf(state, side) {
  const { mode, winner } = state.result;
  return { type: "fans", roll: mode === "conceded" && winner !== side ? 2 : 4, technicalRoll: mode === "technical" && winner === side ? 2 : "", painted: false, stalling: false };
}

/**
 * The Players step of a side: its records saved with the MVP who stood out most (two for a technical or a conceded win),
 * the first skill of his primary column for him when `advancing` and the domain takes it, then locked.
 */
function playersOf(state, side, data, act, advancing) {
  const { count, top, rest } = mvpChoices(state, side), mvps = [...top, ...rest].slice(0, count).map((choice) => choice.id);
  act(side, { type: "statistics", statistics: state[side].statistics, injuries: state[side].injuries, mvps, departures: {} });
  const own = advancing && mvps.length ? rosterPlayer(state, side, mvps[0], data) : null;
  const skill = own && freeSkill(data, own.row, own.player);
  try {
    if (skill) act(side, { type: "advance", playerId: mvps[0], advancementType: "primary", grant: { skill } });
  } catch (error) {
    // Too few SPP for a chosen skill is the domain's to say: the case goes on without the advancement.
    if (error.code !== "POST_ADVANCEMENT") throw error;
  }
  act(side, { type: "lock-players" });
}

/** The captain for the next match: the one the team has, else its first player. */
const captainOf = (state, side) => (state[side].baseRoster.players.find((player) => player.isCaptain) ?? state[side].baseRoster.players[0])?.id ?? "";

/** The post-match played for both sides through the first `reach` moves of the table in the header (`CASES`). */
function playTo(game, held, kind, reach, data) {
  const ours = viewerSideOf(game), theirs = otherSide(ours);
  let state = held.state;
  const act = (side, action) => { state = acted(state, held.events, side, action, data); };
  const moves = [
    () => act(ours, scoreOf(state, ours, kind)),
    () => act(theirs, { type: "agree-result" }),
    () => act(theirs, fansOf(state, theirs)),
    () => act(ours, fansOf(state, ours)),
    () => {
      playersOf(state, ours, data, act, true);
      for (const key of ["assistantCoaches", "cheerleaders"]) act(ours, { type: "roster", operation: "staff", key, delta: 1 });
    },
    () => { playersOf(state, theirs, data, act, false); act(ours, { type: "lock-roster" }); },
    () => { act(theirs, { type: "lock-roster" }); act(ours, { type: "finance", deposit: 20, mistake: { roll: 6 } }); },
    () => {
      act(ours, { type: "next", captain: captainOf(state, ours) });
      act(ours, { type: CONFIRM_ACTION });
      act(theirs, { type: "finance", deposit: 0, mistake: { roll: 6 } });
      act(theirs, { type: "next", captain: captainOf(state, theirs) });
    },
    () => act(theirs, { type: CONFIRM_ACTION }),
  ];
  for (const move of moves.slice(0, reach)) move();
  return { ...held, state };
}

/** `POST /api/mock/post/:id/:case`: the post-match made afresh and played to the case; the match of the list set back first. */
async function setCase(game, word, mock) {
  if (!Object.hasOwn(CASES, word)) throw refusal(400, "FIELD_INVALID", { field: "case" });
  const opened = await openPost(game, mock), [kind, reach] = CASES[word];
  Object.assign(game, structuredClone(originals.get(game)));
  let held = playTo(game, begun(game, opened, opened.data, kind), kind, reach, opened.data);
  if (reach > CASES.ready[1]) held = finished(game, held, opened.sources, opened.data);
  return mock.reply(payloadOf(game, hold(game, held), opened.sources, mock));
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], games: object[], user?: {isAdmin: boolean}, readBody: Function, reply: Function, refuse: Function}} mock
 *   the mock's lists and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerPost(request, pathname, mock) {
  const decoded = (match) => match.slice(1).map(decodeURIComponent);
  try {
    const rolls = pathname.match(POST_ROLLS);
    if (rolls && request.method === "POST") return await rollInPost(request, gameOf(mock.games, decoded(rolls)[0]), mock);
    if (rolls) throw refusal(405, "ROUTE_NOT_FOUND");
    const route = pathname.match(POST_MATCH);
    if (route) return await answerPostMatch(request, gameOf(mock.games, decoded(route)[0]), decoded(route)[1], mock);
    const set = pathname.match(MOCK_POST);
    if (set && request.method === "POST") return await setCase(gameOf(mock.games, decoded(set)[0]), decoded(set)[1], mock);
    return null;
  } catch (error) {
    if (!error.code || !error.status) throw error;
    return mock.refuse(error.status, error.code, error.params ?? {});
  }
}

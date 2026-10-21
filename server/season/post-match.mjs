/**
 * The post-match on the server: read, written and finished in one transaction each, under the pairing's lock,
 * then both teams', then its own row's (`lockPost`; a tap takes them in the same order, live-match.mjs).
 *
 * Its Players step rolls the site's dice for the advancements it takes (stage 09b, decision 22): through its
 * own route and under these locks, since the team's own dice are shut while the team plays (TEAM_IN_MATCH), and
 * by the roster the post-match holds — the SPP and the skills its choices gave a player so far — not the blob
 * (`rollInPostMatch`). A roll is the side's coach's, an admin's neither, for a player of the team's roster. The
 * post-match never stores a roll: a choice names it (`roll: { id, via: "site" }`), held to it when made
 * (`checkPostRoll`), and it waits, unused, until the finish uses it with the roster it goes into
 * (`settleRosterRolls`, the roster save's own rule): a finish refused uses none, the finish of a completed
 * post-match uses nothing again, and an advancement undone leaves its roll waiting for the next ask. A player the
 * finish takes off the roster: one sold frees his used rolls, as a player fired from the roster does (they read as
 * waiting for a player who is gone); one dead keeps them used, his record in «The fallen» naming them, as a death
 * marked by hand does — so the admin's undo of the death gives him back with them taken.
 */
import { pool } from '../db/pool.mjs';
import { withTransaction } from '../db/transaction.mjs';
import { httpError } from '../http/errors.mjs';
import { checkPostRoll, rollForPlayer, serverDie, settleRosterRolls } from '../api/dice-rolls.mjs';
import { matchReference } from '../domain/match-reference.mjs';
import { loadPreparationFixture, loadPreparationSources } from './preparation-store.mjs';
import { createPostMatch, createPostSide, applyPostAction, validatePostSide } from '../../src/domain/post-match/state.mjs';
import { followEvents } from '../../src/domain/post-match/events.mjs';
import { PLAYERS_STAGE, resultAgreed } from '../../src/domain/post-match/rules.mjs';
import { fallenPlayers, postAdvancer, postPlayers } from '../../src/domain/post-match/roster.mjs';
import { postPoints } from '../../src/domain/post-match/score.mjs';
import { SIDES, otherSide } from '../../src/domain/match/rules.mjs';
import { applyPostMatchRoster } from './finance-store.mjs';
import { loadMatchEvents, recordSideStatistics, settleMatchEvents, settleOutsideEdits } from './match-events-store.mjs';


/**
 * The games each of `teamIds` has played, the match `pairingId` left out: its confirmed matches that were not
 * a technical result. A match is a team's by the team its roster snapshot names, and by the pairing's own
 * team where it has no snapshot. Rookie protection counts them (`effectiveInjury`: fewer than 3 games), for a
 * post-match being played (`postSources`) and for the history of a player, which shows an injury the way the
 * roster gets it (server/season/player-history.mjs).
 *
 * @param {{ query: Function }} db a pg pool, or a client (the snapshot a caller reads other tables in)
 * @param {string[]} teamIds the teams as the database holds their ids
 * @param {string} pairingId
 * @returns {Promise<Record<string, number>>} a key for every team of `teamIds`, 0 for a team with no games
 */
export async function gamesPlayedBefore(db, teamIds, pairingId) {
  const rows = (await db.query(`SELECT COALESCE(ms.saved_team_id,sides.team_id) AS saved_team_id, count(*)::integer AS games
    FROM match_pairing_context p
    CROSS JOIN LATERAL (VALUES('home',p.home_team_id),('away',p.away_team_id)) sides(side,team_id)
    LEFT JOIN match_roster_snapshots ms ON ms.pairing_id=p.id AND ms.side=sides.side
    WHERE COALESCE(ms.saved_team_id,sides.team_id)=ANY($1::uuid[]) AND p.result_status='confirmed' AND p.id<>$2
      AND p.result_type<>'technical' GROUP BY COALESCE(ms.saved_team_id,sides.team_id)`,
  [teamIds, pairingId])).rows;
  return Object.fromEntries(teamIds.map(teamId => [teamId, rows.find(row => row.saved_team_id === teamId)?.games || 0]));
}

async function postSources(client, fixture) {
  const sources = await loadPreparationSources(client, fixture);
  const games = await gamesPlayedBefore(client, [fixture.home_team_id, fixture.away_team_id], fixture.id);
  SIDES.forEach(name => { sources[name].gamesPlayed = games[sources[name].team.id]; });
  const events = await loadMatchEvents(client, fixture.id, SIDES.map(name => sources[name].team.id));
  SIDES.forEach(name => { sources[name].events = events[sources[name].team.id]; });
  return sources;
}

function officialResult(fixture) {
  if (fixture.result_status !== 'confirmed') return null;
  return { mode: fixture.result_type === 'technical' ? 'technical' : 'played', official: true,
    winner: fixture.result_type === 'technical' ? fixture.home_touchdowns > fixture.away_touchdowns ? 'home' : 'away' : '',
    accepted: { home: true, away: true }, ...Object.fromEntries(SIDES.map(name => [name,
      { touchdowns: Number(fixture[name + '_touchdowns']), casualties: Number(fixture[name + '_casualties']) }])) };
}

async function loadPost(client, fixture, sources, data) {
  const snapshots = Object.fromEntries((await client.query('SELECT side,snapshot FROM match_roster_snapshots WHERE pairing_id=$1', [fixture.id])).rows.map(row => [row.side, row.snapshot]));
  if (!SIDES.every(name => snapshots[name])) throw httpError(409, 'POST_NOT_STARTED');
  const row = (await client.query('SELECT state FROM match_post_games WHERE pairing_id=$1 FOR UPDATE', [fixture.id])).rows[0];
  return row?.state || createPostMatch(fixture.id, sources, snapshots, data, officialResult(fixture));
}

async function savePost(client, fixture, state) {
  await client.query(`INSERT INTO match_post_games(pairing_id,state) VALUES($1,$2)
    ON CONFLICT(pairing_id) DO UPDATE SET state=EXCLUDED.state,updated_at=now()`, [fixture.id, JSON.stringify(state)]);
}

// The race of a side's team as the roster rules read it: the reference data `teamBySlug` holds, from the same file.
const raceOf = (data, side) => data.teams.find(team => team.slug === side.team.baseTeamSlug) ?? null;

// The site's rolls a side's choices name (kept trimmed, `choiceRoll`): taken, though unused until the finish.
const namedRolls = side => Object.values(side.advancements).flat().filter(choice => choice.roll?.via === 'site').map(choice => String(choice.roll.id));

// The side's roster for the site's dice: as the post-match began, its players as the post-match leaves them so far
// (SPP, injuries, the advancements chosen); the match's journeymen and rookies roll at the table.
function diceRoster(state, name, data) {
  return { ...state[name].baseRoster, players: postPlayers(state, name, data).filter(player => !player.kind) };
}

// What `checkPostRoll` holds an advancement to: the side's team, its race, its roster before the advancement and
// the rolls its other choices name.
function rollCheck(state, name, action, data) {
  const side = state[name];
  return { teamId: side.team.id, race: raceOf(data, side), roster: diceRoster(state, name, data), playerId: action.playerId,
    roll: action.roll, advancement: { type: action.advancementType, grants: action.grant }, exclude: namedRolls(side) };
}

async function finishPost(client, fixture, state, sources, data, actorId) {
  if (state.status !== 'ready' || !resultAgreed(state)) throw httpError(409, 'POST_INCOMPLETE');
  for (const name of SIDES) {
    if (sources[name].team.revision !== state[name].baseRevision) throw httpError(409, 'POST_TEAM_CHANGED');
    const projection = validatePostSide(state, name, data);
    // The site's rolls the side's advancements name are used here, with the roster they go into: a finish refused
    // after this, for this side or the next, rolls them back with the rest. The dead go into «The fallen» as the
    // roster held them, their advancements naming their rolls: those stay used, as a death marked by hand leaves
    // them, so a death undone gives the player back with his rolls taken, not waiting for him again.
    const kept = { ...projection.roster, players: [...projection.roster.players, ...fallenPlayers(state[name])] };
    await settleRosterRolls(client, { teamId: state[name].team.id, race: raceOf(data, state[name]), before: state[name].baseRoster, after: kept });
    await applyPostMatchRoster(client, fixture.id, name, state[name], projection, actorId);
    // The difference once more, for a post-match begun before 3.0: it has no events, and its statistics
    // become rows here. A side begun in 3.0 holds what its events read, or wrote its difference on the
    // Players step, and takes no tap past that step (EVENT_SIDE_LOCKED): for it nothing is left to write.
    // Settled in this same transaction, so settled events add up to the statistics the post-match applied.
    // Then the team's edits outside the match, which waited for this, go into the blob after the match's
    // own record (after_roster).
    await recordSideStatistics(client, fixture.id, state[name], sources[name].events, actorId);
    await settleMatchEvents(client, { teamId: state[name].team.id, pairingId: fixture.id });
    await settleOutsideEdits(client, state[name].team.id);
    state[name].settlement = projection;
  }
  const result = state.result, points = name => postPoints(state, name, fixture.match_kind).total;
  await client.query(`UPDATE season_pairings SET home_touchdowns=$2,away_touchdowns=$3,home_casualties=$4,away_casualties=$5,
    home_points=$6,away_points=$7,result_type=$8,result_status='confirmed',confirmed_at=now(),updated_at=now() WHERE id=$1`,
  [fixture.id, result.home.touchdowns, result.away.touchdowns, result.home.casualties, result.away.casualties,
    points('home'), points('away'), result.mode === 'technical' ? 'technical' : 'played']);
  state.status = 'completed'; state.completedAt = new Date().toISOString(); state.revision++;
  return state;
}

// The side starts over from its team as it is now, its statistics read from the match events again;
// a rival on the finance step or later goes back to it, unconfirmed.
function resetSide(state, name, sources, data) {
  state[name] = createPostSide(sources[name], state[name].snapshot, data);
  state[name].stage = resultAgreed(state) ? 1 : 0;
  const rival = state[otherSide(name)];
  if (rival.stage >= 4) { rival.stage = 4; rival.deposit = 0; rival.mistake = {}; rival.confirmed = false; }
  state.status = 'draft'; state.revision++;
  return state;
}

// The post-match under its locks, in their one order: the pairing, both teams, then its row. A followed side reads
// its events again under them, so no tap lands between this read and a write after it.
async function lockPost(client, pairingId, user, data) {
  const fixture = await loadPreparationFixture(client, pairingId, user), sources = await postSources(client, fixture);
  const events = Object.fromEntries(SIDES.map(name => [name, sources[name].events]));
  const state = followEvents(await loadPost(client, fixture, sources, data), events);
  return { fixture, sources, events, state, viewerSide: fixture.home_user_id === user.id ? 'home' : 'away' };
}

export async function accessPostMatch(pairingId, user, body = null, finish = false) {
  const data = await matchReference(), client = await pool.connect();
  try {
    await client.query('BEGIN');
    const opened = await lockPost(client, pairingId, user, data), { fixture, sources, events, viewerSide } = opened;
    let state = opened.state;
    if (body && !(finish && state.status === 'completed')) {
      const name = body.side || viewerSide;
      if (!SIDES.includes(name) || (!user.is_admin && fixture[name + '_user_id'] !== user.id)) throw httpError(403, 'FIXTURE_NOT_YOURS');
      if (Number(body.revision) !== state.revision) throw httpError(409, 'POST_REVISION');
      if (state.status === 'completed') throw httpError(409, 'POST_CLOSED');
      if (body.action?.type === 'reset-side') state = resetSide(state, name, sources, data);
      else {
        if (sources[name].team.revision !== state[name].baseRevision) throw httpError(409, 'POST_TEAM_CHANGED');
        if (finish) state = await finishPost(client, fixture, state, sources, data, user.id);
        else {
          // The domain's refusals first (the step, a confirmed side, the player, a roll this side names already), then
          // the roll's row, held against the post-match as it stood before this advancement.
          const before = state;
          state = applyPostAction(state, name, body.action, data);
          if (body.action?.type === 'advance' && body.action.roll?.via === 'site') await checkPostRoll(client, rollCheck(before, name, body.action, data));
          if (body.action?.type === 'statistics') events[name] = await recordSideStatistics(client, fixture.id, state[name], events[name], user.id);
        }
      }
      state = followEvents(state, events);
    }
    await savePost(client, fixture, state);
    const response = { postMatch: state, viewerSide, isAdmin: Boolean(user.is_admin),
      rosterChanged: Object.fromEntries(SIDES.map(name => [name, state.status !== 'completed' && sources[name].team.revision !== state[name].baseRevision])),
      fixture: { id: fixture.id, kind: fixture.match_kind, seasonName: fixture.season_name, roundNumber: fixture.round_number } };
    await client.query('COMMIT'); return response;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

/**
 * `POST /api/games/:id/post-match/rolls`: the site's roll for an advancement of the post-match — the one waiting
 * for the player, or a new one kept (`rollForPlayer`), by the roster the post-match holds, the rolls its choices
 * name left out. The side's coach's (an admin's neither), on the Players step of an open post-match whose team
 * is as it began, the side not confirmed, for a player of the team's roster who may advance (`postAdvancer`).
 * The post-match is left as it is: nothing written to it, the same revision.
 *
 * @param {string} pairingId
 * @param {{id: string, is_admin?: boolean}} user
 * @param {{purpose: string, category?: string}} ask what `checkRoll` read of the body
 * @param {{side?: string, playerId?: string}} body the side (the viewer's by default) and the player
 * @param {{rng?: (sides: number) => number}} [options] the die, for a test
 * @returns {Promise<object>} the dice_rolls row
 * @throws 403 FIXTURE_NOT_YOURS; 409 POST_CLOSED, POST_TEAM_CHANGED, POST_ACTION; 404 PLAYER_NOT_FOUND; what
 *   `rollForPlayer` refuses (409 DICE_ROLL_WAITING, 422 DICE_CATEGORY / DICE_NO_SKILL)
 */
export async function rollInPostMatch(pairingId, user, { purpose, category }, body, { rng = serverDie } = {}) {
  const data = await matchReference();
  return withTransaction(async client => {
    const { fixture, sources, state, viewerSide } = await lockPost(client, pairingId, user, data);
    const name = body.side || viewerSide, side = state[name];
    if (!SIDES.includes(name) || fixture[name + '_user_id'] !== user.id) throw httpError(403, 'FIXTURE_NOT_YOURS');
    if (state.status === 'completed') throw httpError(409, 'POST_CLOSED');
    if (sources[name].team.revision !== side.baseRevision) throw httpError(409, 'POST_TEAM_CHANGED');
    if (side.stage !== PLAYERS_STAGE || side.confirmed) throw httpError(409, 'POST_ACTION');
    if (!postAdvancer(side, body.playerId, { site: true })) throw httpError(404, 'PLAYER_NOT_FOUND');
    const teamRow = { id: side.team.id, base_team_slug: side.team.baseTeamSlug, roster: diceRoster(state, name, data) };
    return rollForPlayer(client, { teamRow, playerId: body.playerId, purpose, category, userId: user.id, rng, exclude: namedRolls(side) });
  });
}

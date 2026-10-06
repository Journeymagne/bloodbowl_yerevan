import { pool } from '../db/pool.mjs';
import { httpError } from '../http/errors.mjs';
import { matchReference } from '../domain/match-reference.mjs';
import { loadPreparationFixture, loadPreparationSources } from './preparation-store.mjs';
import { createPostMatch, createPostSide, applyPostAction, validatePostSide } from '../../src/domain/post-match/state.mjs';
import { resultAgreed } from '../../src/domain/post-match/rules.mjs';
import { SIDES, otherSide } from '../../src/domain/match/rules.mjs';
import { matchPoints } from '../../src/domain/league-rules.mjs';
import { applyPostMatchRoster } from './finance-store.mjs';

async function postSources(client, fixture) {
  const sources = await loadPreparationSources(client, fixture);
  const rows = (await client.query(`SELECT COALESCE(ms.saved_team_id,sides.team_id) AS saved_team_id, count(*)::integer AS games
    FROM match_pairing_context p
    CROSS JOIN LATERAL (VALUES('home',p.home_team_id),('away',p.away_team_id)) sides(side,team_id)
    LEFT JOIN match_roster_snapshots ms ON ms.pairing_id=p.id AND ms.side=sides.side
    WHERE COALESCE(ms.saved_team_id,sides.team_id)=ANY($1::uuid[]) AND p.result_status='confirmed' AND p.id<>$2
      AND p.result_type<>'technical' GROUP BY COALESCE(ms.saved_team_id,sides.team_id)`,
  [[fixture.home_team_id, fixture.away_team_id], fixture.id])).rows;
  SIDES.forEach(name => { sources[name].gamesPlayed = rows.find(row => row.saved_team_id === sources[name].team.id)?.games || 0; });
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

function points(state, name, kind) {
  if (kind === 'friendly') return 0;
  if (state.result.mode === 'technical') return state.result.winner === name ? 2 : 0;
  return matchPoints({ touchdownsFor: state.result[name].touchdowns, touchdownsAgainst: state.result[otherSide(name)].touchdowns,
    casualtiesFor: state.result[name].casualties });
}

async function finishPost(client, fixture, state, sources, data) {
  if (state.status !== 'ready' || !resultAgreed(state)) throw httpError(409, 'POST_INCOMPLETE');
  for (const name of SIDES) {
    if (sources[name].team.revision !== state[name].baseRevision) throw httpError(409, 'POST_TEAM_CHANGED');
    const projection = validatePostSide(state, name, data);
    await applyPostMatchRoster(client, fixture.id, name, state[name], projection);
    state[name].settlement = projection;
  }
  const result = state.result;
  await client.query(`UPDATE season_pairings SET home_touchdowns=$2,away_touchdowns=$3,home_casualties=$4,away_casualties=$5,
    home_points=$6,away_points=$7,result_type=$8,result_status='confirmed',confirmed_at=now(),updated_at=now() WHERE id=$1`,
  [fixture.id, result.home.touchdowns, result.away.touchdowns, result.home.casualties, result.away.casualties,
    points(state, 'home', fixture.match_kind), points(state, 'away', fixture.match_kind), result.mode === 'technical' ? 'technical' : 'played']);
  state.status = 'completed'; state.completedAt = new Date().toISOString(); state.revision++;
  return state;
}

export async function accessPostMatch(pairingId, user, body = null, finish = false) {
  const data = await matchReference(), client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fixture = await loadPreparationFixture(client, pairingId, user), sources = await postSources(client, fixture);
    let state = await loadPost(client, fixture, sources, data);
    const viewerSide = fixture.home_user_id === user.id ? 'home' : 'away';
    if (body && !(finish && state.status === 'completed')) {
      const name = body.side || viewerSide;
      if (!SIDES.includes(name) || (!user.is_admin && fixture[name + '_user_id'] !== user.id)) throw httpError(403, 'FIXTURE_NOT_YOURS');
      if (Number(body.revision) !== state.revision) throw httpError(409, 'POST_REVISION');
      if (state.status === 'completed') throw httpError(409, 'POST_CLOSED');
      if (body.action?.type === 'reset-side') {
        state[name] = createPostSide(sources[name], state[name].snapshot, data);
        state[name].stage = resultAgreed(state) ? 1 : 0;
        const rival = state[otherSide(name)];
        if (rival.stage >= 4) { rival.stage = 4; rival.deposit = 0; rival.mistake = {}; rival.confirmed = false; }
        state.status = 'draft'; state.revision++;
      } else {
        if (sources[name].team.revision !== state[name].baseRevision) throw httpError(409, 'POST_TEAM_CHANGED');
        state = finish ? await finishPost(client, fixture, state, sources, data) : applyPostAction(state, name, body.action, data);
      }
    }
    await savePost(client, fixture, state);
    const response = { postMatch: state, viewerSide, isAdmin: Boolean(user.is_admin),
      rosterChanged: Object.fromEntries(SIDES.map(name => [name, state.status !== 'completed' && sources[name].team.revision !== state[name].baseRevision])),
      fixture: { id: fixture.id, kind: fixture.match_kind, seasonName: fixture.season_name, roundNumber: fixture.round_number } };
    await client.query('COMMIT'); return response;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

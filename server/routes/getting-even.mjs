import { currentInjuryEvents, gettingEvenEligible, hatredKeywords, sameCasualty } from '../../src/domain/getting-even.mjs';
import { isValidEventInjury, sideFollowsEvents } from '../../src/domain/post-match/events.mjs';
import { SIDES } from '../../src/domain/match/rules.mjs';
import { starProfiles } from '../../src/domain/match/snapshot.mjs';
import { serverDie } from '../api/dice-rolls.mjs';
import { UUID_SOURCE, isUuid, teamForUser } from '../api/team-access.mjs';
import { currentUser } from '../auth/session.mjs';
import { withTransaction } from '../db/transaction.mjs';
import { httpError, readJson, sendJson } from '../http/responses.mjs';
import { loadPreparationFixture, loadPreparationSources } from '../season/preparation-store.mjs';
import { gamesPlayedBefore } from '../season/post-match.mjs';
import { loadTeamEvents, recordSideStatistics } from '../season/match-events-store.mjs';
import { getDecision, publicGettingEven } from '../season/getting-even-store.mjs';

const ROUTE = new RegExp(`^/api/teams/(${UUID_SOURCE})/getting-even$`, 'i');
const invalid = () => httpError(422, 'GETTING_EVEN_INVALID');

/** Same lock order as a tap and a finish. Resolving a trait may follow the Players step. */
async function context(client, teamId, pairingId, user) {
  teamId = (await teamForUser(client, teamId, user, { admin: true })).id;
  const fixture = await loadPreparationFixture(client, pairingId, user);
  const sources = await loadPreparationSources(client, fixture);
  const own = SIDES.find(side => sources[side].team.id === teamId);
  if (!own || (!user.is_admin && sources[own].user.id !== user.id)) throw httpError(403, 'FIXTURE_NOT_YOURS');
  const post = (await client.query('SELECT state FROM match_post_games WHERE pairing_id=$1 FOR UPDATE', [pairingId])).rows[0]?.state;
  if (fixture.preparation_status !== 'in_progress' || post?.status === 'completed'
    || (!post && fixture.result_status === 'confirmed')) throw httpError(409, 'MATCH_NOT_LIVE');
  const snapshots = (await client.query('SELECT side,snapshot FROM match_roster_snapshots WHERE pairing_id=$1', [pairingId])).rows;
  if (snapshots.length !== 2) throw httpError(409, 'MATCH_NOT_LIVE');
  const players = snapshots.flatMap(({ side, snapshot }) => {
    // Old snapshots may lack explicit keywords. Only their own frozen data is used.
    const stars = (snapshot.purchases ?? []).filter(item => item.category === 'stars').flatMap(starProfiles);
    return snapshot.players.map(player => ({ side, playerId: player.id, name: player.name, number: player.number,
      teamName: snapshot.team.name, kind: player.kind ?? '',
      keywords: hatredKeywords(player.keywords || player.row?.tags ? player : stars.find(star => star.id === player.id)) }));
  });
  const games = post?.[own]?.gamesPlayed ?? (await gamesPlayedBefore(client, [teamId], pairingId))[teamId];
  const events = await loadTeamEvents(client, teamId, { pairingId });
  const decisions = (await client.query('SELECT * FROM match_getting_even WHERE pairing_id=$1 AND saved_team_id=$2 ORDER BY created_at,id', [pairingId, teamId])).rows.map(publicGettingEven);
  return { own, players, gamesPlayed: games, events, decisions, post };
}

async function change(client, ctx, teamId, pairingId, user, body) {
  const { playerId, injury, action } = body;
  let eventId = body.eventId ?? null;
  if (typeof playerId !== 'string' || !ctx.players.some(p => p.side === ctx.own && p.playerId === playerId && p.kind !== 'star')
    || (eventId !== null && !isUuid(eventId)) || !isValidEventInjury(injury)
    || !gettingEvenEligible(injury, ctx.gamesPlayed) || !['roll', 'table', 'save'].includes(action)) throw invalid();
  let active = currentInjuryEvents(ctx.events)[playerId];
  // A pre-events checklist can be resolved explicitly, without inventing a historical roll.
  if (!eventId && ctx.post && !sideFollowsEvents(ctx.post[ctx.own]) && sameCasualty(ctx.post[ctx.own].injuries?.[playerId], injury)) {
    ctx.events = await recordSideStatistics(client, pairingId, ctx.post[ctx.own], ctx.events, user.id);
    active = currentInjuryEvents(ctx.events)[playerId];
    eventId = active?.id ?? null;
  }
  if (eventId && (active?.id !== eventId || !sameCasualty(active.injury, injury))) throw httpError(409, 'GETTING_EVEN_CHANGED');
  // A post-match edit uses the injury that actually stands in its checklist.
  if (eventId && ctx.post && !sameCasualty(ctx.post[ctx.own].injuries?.[playerId], injury)
    && !sideFollowsEvents(ctx.post[ctx.own])) throw httpError(409, 'GETTING_EVEN_CHANGED');
  if (!eventId && ctx.post && !sideFollowsEvents(ctx.post[ctx.own])) throw httpError(409, 'EVENT_SIDE_LOCKED');
  const row = await getDecision(client, { pairingId, teamId, playerId, eventId, injury, userId: user.id });
  let attacker = row.attacker, keyword = row.keyword;
  if (Object.hasOwn(body, 'attacker')) {
    attacker = body.attacker === null ? null : ctx.players.find(p => p.side === body.attacker?.side && p.playerId === body.attacker?.playerId);
    if (body.attacker !== null && !attacker) throw invalid();
    if (attacker?.side === ctx.own && attacker.playerId === playerId) throw invalid();
    keyword = null;
  }
  let roll = row.roll, source = row.source;
  if (!roll && action === 'roll') { roll = serverDie(6); source = 'site'; }
  if (!roll && action === 'table') {
    if (!Number.isInteger(body.roll) || body.roll < 1 || body.roll > 6) throw invalid();
    roll = body.roll; source = 'table';
  }
  if (roll >= 4 && attacker) {
    const wanted = body.keyword || (attacker.keywords.length === 1 ? attacker.keywords[0] : keyword);
    if (wanted && !attacker.keywords.includes(wanted)) throw invalid();
    keyword = wanted || null;
  } else keyword = null;
  const saved = (await client.query(`UPDATE match_getting_even SET injury=$2, roll=$3, source=$4, attacker=$5,
    keyword=$6, updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
  [row.id, JSON.stringify(injury), roll, source, attacker ? JSON.stringify(attacker) : null, keyword])).rows[0];
  return publicGettingEven(saved);
}

export async function handleGettingEvenRoutes(request, response, url) {
  const match = ROUTE.exec(url.pathname);
  if (!match || !['GET', 'POST'].includes(request.method)) return false;
  const user = await currentUser(request);
  if (!user) throw httpError(401, 'NOT_AUTHORIZED');
  const body = request.method === 'POST' ? await readJson(request) : null;
  const pairingId = body?.pairingId ?? url.searchParams.get('pairing');
  if (!isUuid(pairingId)) throw invalid();
  const answer = await withTransaction(async client => {
    const ctx = await context(client, match[1], pairingId, user);
    if (body) return { decision: await change(client, ctx, match[1], pairingId, user, body) };
    return { own: ctx.own, players: ctx.players, gamesPlayed: ctx.gamesPlayed, decisions: ctx.decisions,
      injuries: currentInjuryEvents(ctx.events) };
  });
  sendJson(response, 200, answer);
  return true;
}

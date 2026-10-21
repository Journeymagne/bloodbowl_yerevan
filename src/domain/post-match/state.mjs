import { normalizeDraft } from '../roster/schema.mjs';
import { ensureDraftPlayers } from '../roster/players.mjs';
import { SIDES, otherSide, CONFIRM_ACTION } from '../match/rules.mjs';
import { choiceRoll } from '../roster/progression.mjs';
import { POST_STEPS, INJURIES, RESULT_MODES, postCount, postError, resultAgreed, mvpCount } from './rules.mjs';
import { normalizeMatchStats, validateStatistics } from './statistics.mjs';
import { statisticsFromEvents, sameValues } from './events.mjs';
import { validateFans } from './finance.mjs';
import { projectPostRoster, postAdvancer } from './roster.mjs';

export function createPostSide(source, snapshot, data) {
  const reference = data.teams.find(team => team.slug === source.team.baseTeamSlug);
  if (!reference) throw postError('UNKNOWN_TEAM');
  const baseRoster = normalizeDraft(source.team.roster);
  ensureDraftPlayers(reference, baseRoster);
  const recorded = statisticsFromEvents(snapshot, source.events ?? []);
  return { user: source.user, team: source.team, reference, snapshot, baseRoster,
    baseRevision: source.team.revision, gamesPlayed: source.gamesPlayed || 0, stage: 0,
    statistics: recorded.statistics, injuries: recorded.injuries, followsEvents: true,
    departures: {}, mvps: [], advancements: {}, operations: [], fansRoll: null, technicalRoll: null,
    painted: false, stalling: false, deposit: 0, mistake: {}, captain: '', confirmed: false };
}

export function createPostMatch(gameId, sources, snapshots, data, official = null) {
  const state = { gameId, version: 1, revision: 1, status: 'draft', result: official,
    ...Object.fromEntries(SIDES.map(name => [name, createPostSide(sources[name], snapshots[name], data)])) };
  if (official) SIDES.forEach(name => { state[name].stage = 1; });
  return state;
}

function setResult(state, name, action, data) {
  if (state.result?.official) throw postError('POST_RESULT_LOCKED');
  const mode = action.mode || 'played';
  if (!RESULT_MODES.includes(mode)) throw postError('POST_VALUE');
  const result = { mode, winner: mode === 'played' ? '' : action.winner, accepted: { home: false, away: false },
    ...Object.fromEntries(SIDES.map(key => [key, { touchdowns: postCount(action[key]?.touchdowns), casualties: postCount(action[key]?.casualties) }])) };
  if (mode === 'technical' && SIDES.includes(result.winner)) {
    SIDES.forEach(key => { result[key] = { touchdowns: key === result.winner ? 2 : 0, casualties: 0 }; });
  }
  if (mode !== 'played' && (!SIDES.includes(result.winner) || result[result.winner].touchdowns < 2
    || result[otherSide(result.winner)].touchdowns !== 0)) throw postError('POST_VALUE');
  for (const key of SIDES) {
    const side = state[key];
    state[key] = createPostSide({ user: side.user, team: { ...side.team, roster: side.baseRoster, revision: side.baseRevision }, gamesPlayed: side.gamesPlayed }, side.snapshot, data);
  }
  result.accepted[name] = true; state.result = result;
}

function saveStatistics(state, name, action) {
  const side = state[name], values = action.statistics || {};
  if (Object.keys(values).some(id => !Object.hasOwn(side.statistics, id))) throw postError('POST_PLAYER');
  const statistics = Object.fromEntries(Object.keys(side.statistics).map(id => [id, normalizeMatchStats(values[id])]));
  const mvps = Array.isArray(action.mvps) ? action.mvps : [];
  if (mvps.length > mvpCount(state, name) || mvps.some(id => !side.snapshot.players.some(player => player.id === id && player.kind !== 'star'))) throw postError('POST_MVP');
  const injuries = {};
  for (const [id, injury] of Object.entries(action.injuries || {})) {
    if (!Object.hasOwn(side.statistics, id) || !INJURIES.includes(injury.code)
      || (injury.code === 'lasting' && !['ma', 'st', 'ag', 'pa', 'ar'].includes(injury.stat))) throw postError('POST_PLAYER');
    injuries[id] = { code: injury.code, stat: injury.stat, retire: Boolean(injury.retire) };
  }
  if (!sameValues([side.statistics, side.mvps, side.injuries], [statistics, mvps, injuries])) side.advancements = {};
  side.statistics = statistics; side.mvps = mvps; side.injuries = injuries;
  side.departures = Object.fromEntries(side.baseRoster.players.filter(player => player.advancements.length >= 3)
    .filter(player => action.departures?.[player.id]).map(player => [player.id, postCount(action.departures[player.id], 6)]));
  side.followsEvents = false;
}

function clearLater(side) {
  side.advancements = {}; side.operations = []; side.deposit = 0; side.mistake = {}; side.captain = ''; side.confirmed = false;
}

function invalidateOpponent(state, name) {
  const other = state[otherSide(name)];
  if (other.stage >= 4) { other.stage = 4; other.deposit = 0; other.mistake = {}; other.confirmed = false; }
}

function rosterAction(state, name, action) {
  const side = state[name];
  if (action.type === 'undo-roster') { side.operations.pop(); return; }
  if (side.operations.length >= 64) throw postError('POST_VALUE');
  side.operations.push({ type: action.operation, id: 'post-' + state.gameId + '-' + name + '-' + state.revision,
    playerId: action.playerId, rowIndex: postCount(action.rowIndex), key: action.key, delta: Number(action.delta) });
}

// A site roll's id as the server matches it: a UUID in either case is one roll (Postgres's uuid). The choice keeps
// it trimmed (`choiceRoll`).
const rollKey = id => String(id).toLowerCase();

// The site's rolls this side's choices name, whatever player each is for.
function namedRolls(side) {
  return new Set(Object.values(side.advancements).flat().filter(choice => choice.roll?.via === 'site').map(choice => rollKey(choice.roll.id)));
}

// An advancement may name its roll (stage 09b): the site's, kept until the finish uses it (server), or the
// table's. A Favoured roster's carries the god's D8 (`favouredRoll`) and, on his face, the skill or none
// (`favouredSkill`) — every one (the owner, 2026-10-21, as 2.x did): the projection refuses one without it
// (POST_DICE), unless the player holds every skill the god offers (roster.mjs `applyFavoured`).
// The roll's shape, and whether the type is rolled at all, is the roster's rule (`takeAdvancement`, when
// the roster is projected: POST_ADVANCEMENT); a roll is kept as the roster keeps it (`choiceRoll`: the id
// trimmed, nothing else), and one of another shape as sent, for that projection to refuse. A site roll
// another choice of this side names is DICE_ROLL_USED, so a second advancement of the same player takes a
// fresh roll. A step of 2.x carries the god's D8 in the advancement: it is kept, so a post-match begun then
// reads as before.
function addAdvancement(side, action) {
  const id = action.playerId, kept = choiceRoll(action.roll), roll = kept === null ? action.roll : kept;
  if (!postAdvancer(side, id)) throw postError('POST_PLAYER');
  // A journeyman or a rookie of the match rolls at the table: the site's roll waits for no one it could not go to.
  if (kept?.via === 'site' && !postAdvancer(side, id, { site: true })) throw postError('POST_ADVANCEMENT');
  if (kept?.via === 'site' && namedRolls(side).has(rollKey(kept.id))) throw postError('DICE_ROLL_USED');
  const carried = ['favouredRoll', 'favouredSkill'].filter(key => action[key] !== undefined).map(key => [key, action[key]]);
  side.advancements[id] ||= [];
  side.advancements[id].push({ type: action.advancementType, grant: action.grant, ...(roll === undefined ? {} : { roll }), ...Object.fromEntries(carried) });
}

function performAction(state, name, action, data) {
  const side = state[name], type = action.type;
  if (type === 'result') { setResult(state, name, action, data); return; }
  if (type === 'agree-result') {
    if (!state.result) throw postError('POST_RESULT');
    state.result.accepted[name] = true;
    if (resultAgreed(state)) SIDES.forEach(key => { state[key].stage = Math.max(1, state[key].stage); });
    return;
  }
  if (!resultAgreed(state)) throw postError('POST_RESULT');
  if (type === 'reopen') { side.stage = 1; clearLater(side); invalidateOpponent(state, name); return; }
  if (type === 'fans' && side.stage === 1) {
    side.fansRoll = action.roll === '' ? null : postCount(action.roll, 6);
    side.technicalRoll = action.technicalRoll === '' ? null : postCount(action.technicalRoll, 3);
    side.painted = Boolean(action.painted); side.stalling = Boolean(action.stalling);
    validateFans(state, name); side.stage = 2; return;
  }
  if (type === 'statistics' && side.stage === 2) { saveStatistics(state, name, action); return; }
  if (type === 'advance' && side.stage === 2) { addAdvancement(side, action); return; }
  if (type === 'undo-advance' && side.stage === 2) {
    if (Object.hasOwn(side.advancements, String(action.playerId))) side.advancements[action.playerId].pop();
    return;
  }
  if (type === 'lock-players' && side.stage === 2) { validateStatistics(state, name); side.stage = 3; return; }
  if (['roster', 'undo-roster'].includes(type) && side.stage === 3) { rosterAction(state, name, action); return; }
  if (type === 'lock-roster' && side.stage === 3) { side.stage = 4; return; }
  if (type === 'finance' && side.stage === 4) {
    if (state[otherSide(name)].stage < 3) throw postError('POST_WAIT_STATISTICS');
    side.deposit = postCount(action.deposit, 50); side.mistake = action.mistake || {};
    projectPostRoster(state, name, data, true); side.stage = 5; return;
  }
  if (type === 'next' && side.stage === 5) {
    side.captain = String(action.captain || '');
    if (!side.captain && projectPostRoster(state, name, data).roster.players.some(player => !player.temporarilyRetired)) throw postError('POST_CAPTAIN');
    side.stage = 6; return;
  }
  if (type === CONFIRM_ACTION && side.stage === 6) { validatePostSide(state, name, data); side.confirmed = true; return; }
  throw postError('POST_ACTION');
}

export function validatePostSide(state, name, data) {
  if (!resultAgreed(state) || state[name].stage < POST_STEPS.length - 1) throw postError('POST_INCOMPLETE');
  validateFans(state, name); validateStatistics(state, name);
  return projectPostRoster(state, name, data, true);
}

export function applyPostAction(current, name, action, data) {
  if (!SIDES.includes(name) || !action || current.status === 'completed') throw postError('POST_CLOSED');
  const state = structuredClone(current);
  if (state[name].confirmed && action.type !== 'reopen') throw postError('POST_CLOSED');
  performAction(state, name, action, data);
  projectPostRoster(state, name, data);
  state.status = SIDES.every(key => state[key].confirmed) ? 'ready' : 'draft';
  state.revision++;
  return state;
}

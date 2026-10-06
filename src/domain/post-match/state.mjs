import { normalizeDraft } from '../roster/schema.mjs';
import { ensureDraftPlayers } from '../roster/players.mjs';
import { SIDES, otherSide, CONFIRM_ACTION } from '../match/rules.mjs';
import { POST_STEPS, INJURIES, RESULT_MODES, postCount, postError, resultAgreed, mvpCount } from './rules.mjs';
import { normalizeMatchStats, validateStatistics } from './statistics.mjs';
import { validateFans } from './finance.mjs';
import { projectPostRoster } from './roster.mjs';

export function createPostSide(source, snapshot, data) {
  const reference = data.teams.find(team => team.slug === source.team.baseTeamSlug);
  if (!reference) throw postError('UNKNOWN_TEAM');
  const baseRoster = normalizeDraft(source.team.roster);
  ensureDraftPlayers(reference, baseRoster);
  return { user: source.user, team: source.team, reference, snapshot, baseRoster,
    baseRevision: source.team.revision, gamesPlayed: source.gamesPlayed || 0, stage: 0,
    statistics: Object.fromEntries(snapshot.players.map(player => [player.id, normalizeMatchStats()])),
    injuries: {}, departures: {}, mvps: [], advancements: {}, operations: [], fansRoll: null, technicalRoll: null,
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
  if (JSON.stringify([side.statistics, side.mvps, side.injuries]) !== JSON.stringify([statistics, mvps, injuries])) side.advancements = {};
  side.statistics = statistics; side.mvps = mvps; side.injuries = injuries;
  side.departures = Object.fromEntries(side.baseRoster.players.filter(player => player.advancements.length >= 3)
    .filter(player => action.departures?.[player.id]).map(player => [player.id, postCount(action.departures[player.id], 6)]));
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
  if (type === 'advance' && side.stage === 2) {
    if (!side.snapshot.players.some(player => player.id === action.playerId && player.kind !== 'star')) throw postError('POST_PLAYER');
    side.advancements[action.playerId] ||= [];
    side.advancements[action.playerId].push({ type: action.advancementType, grant: action.grant,
      favouredRoll: action.favouredRoll, favouredSkill: action.favouredSkill });
    return;
  }
  if (type === 'undo-advance' && side.stage === 2) { side.advancements[action.playerId]?.pop(); return; }
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

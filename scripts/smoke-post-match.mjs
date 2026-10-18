/** Local fixtures only. Real teams and results are never edited. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pool, databaseUrl } from '../server/db/pool.mjs';
import { hashPassword } from '../server/auth/session.mjs';
import { calculateMatchCtv } from '../src/domain/match/roster.mjs';
import { postWinnings } from '../src/domain/post-match/finance.mjs';

const base = process.env.SMOKE_BASE_URL || 'http://localhost:3002', stamp = randomUUID();
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) throw new Error('Local smoke only');
const tokens = {}, users = {}, fixtures = [];
let outsiderId, keep;

async function request(name, path, body, method = 'GET') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(tokens[name] ? { Authorization: 'Bearer ' + tokens[name] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}

// A read that must answer 200: the failure says what it was and what came back, and the body is returned.
async function get(name, path) {
  const response = await request(name, path);
  assert.equal(response.status, 200, 'GET ' + path + ' -> ' + response.status + ' ' + JSON.stringify(response.data));
  return response.data;
}

// The first item of a list that matches, or a failure that says what was looked for and what the list held.
function found(list, match, what) {
  const item = Array.isArray(list) ? list.find(match) : undefined;
  assert.ok(item, 'not found: ' + what + ' in ' + JSON.stringify(list)?.slice(0, 300));
  return item;
}

async function logins() {
  for (const name of ['home', 'away']) {
    const login = await request(null, '/api/auth/login', { login: 'preview-' + name, password: 'preview2026' }, 'POST');
    assert.equal(login.status, 200); tokens[name] = login.data.token; users[name] = login.data.user.id;
  }
  const login = 'post-smoke-' + stamp;
  outsiderId = (await pool.query('INSERT INTO users(login,login_key,telegram,password_hash) VALUES($1,$1,$2,$3) RETURNING id',
    [login, '@post-smoke', hashPassword(stamp)])).rows[0].id;
  tokens.outsider = (await request(null, '/api/auth/login', { login, password: stamp }, 'POST')).data.token;
}

async function change(f, name, action, pre = false) {
  const revision = pre ? f.pre.preparation.revision : f.post.postMatch.revision;
  const response = await request(name, '/api/games/' + f.gameId + (pre ? '/preparation' : '/post-match'), { revision, action }, 'PATCH');
  assert.equal(response.status, 200, JSON.stringify(response.data));
  if (pre) f.pre = response.data; else f.post = response.data;
}

async function fixture(kind, preview = false, previousGames = 0) {
  const f = { kind, teamIds: [], preview }; fixtures.push(f);
  for (const name of ['home', 'away']) {
    const source = (await pool.query('SELECT * FROM saved_teams WHERE user_id=$1 AND name=$2', [users[name], name === 'home' ? 'Yerevan Lions' : 'Drunken Rune Guard'])).rows[0];
    assert.ok(source, 'Seed the preview accounts first');
    const roster = structuredClone(source.roster);
    roster.players = roster.players.slice(0, name === 'home' ? 6 : 7).map(player => ({ ...player, skipNextGame: false }));
    roster.players[0].spp = { ...roster.players[0].spp, bonus: 40 };
    roster.players.push({ ...structuredClone(roster.players[0]), id: randomUUID(), number: '14', name: 'Recovering player', skipNextGame: true, spp: {} });
    roster.treasury = 150; roster.coachesSafe = 0;
    const teamName = preview ? name === 'home' ? 'Post-match · Yerevan Lions' : 'Post-match · Rune Guard' : 'Post smoke ' + name + ' ' + stamp;
    roster.teamName = teamName;
    const team = (await pool.query('INSERT INTO saved_teams(user_id,name,base_team_slug,roster) VALUES($1,$2,$3,$4) RETURNING id',
      [users[name], teamName, source.base_team_slug, JSON.stringify(roster)])).rows[0];
    f.teamIds.push(team.id);
  }
  if (kind === 'friendly') f.gameId = (await pool.query(`INSERT INTO season_pairings(match_kind,table_number,friendly_home_user_id,friendly_away_user_id,friendly_home_team_id,friendly_away_team_id)
    VALUES('friendly',1,$1,$2,$3,$4) RETURNING id`, [users.home, users.away, ...f.teamIds])).rows[0].id;
  else {
    f.seasonId = (await pool.query(`INSERT INTO seasons(name,status,current_round) VALUES($1,'preview-test',1) RETURNING id`, ['Post smoke ' + stamp])).rows[0].id;
    const round = (await pool.query(`INSERT INTO season_rounds(season_id,round_number,status) VALUES($1,1,'started') RETURNING id`, [f.seasonId])).rows[0].id;
    const entries = [];
    for (const [index, name] of ['home', 'away'].entries()) entries.push((await pool.query('INSERT INTO season_entries(season_id,user_id,saved_team_id) VALUES($1,$2,$3) RETURNING id', [f.seasonId, users[name], f.teamIds[index]])).rows[0].id);
    f.gameId = (await pool.query('INSERT INTO season_pairings(round_id,table_number,home_entry_id,away_entry_id) VALUES($1,1,$2,$3) RETURNING id', [round, ...entries])).rows[0].id;
  }
  f.historyIds = [];
  for (let index = 0; index < previousGames; index++) {
    const history = await pool.query(`INSERT INTO season_pairings(match_kind,table_number,friendly_home_user_id,friendly_away_user_id,friendly_home_team_id,friendly_away_team_id,
      result_status,result_type,home_touchdowns,away_touchdowns,home_casualties,away_casualties,home_points,away_points)
      VALUES('friendly',1,$1,$2,$3,$4,'confirmed',$5,2,0,0,0,0,0) RETURNING id`,
    [users.home, users.away, ...f.teamIds, index === previousGames - 1 ? 'technical' : 'played']);
    f.historyIds.push(history.rows[0].id);
  }
  await start(f); return f;
}

// The one path of a team's events, for a tap and for an edit outside a match alike.
const eventsPath = (f, query = '') => '/api/teams/' + f.teamIds[0] + '/events' + query;
const tapBody = (f, extra = {}) => ({ playerId: f.journeymanId, counter: 'catches', delta: 1, ...extra });

// A tap in the live match, and an edit outside it, both on the home side; then what the team's events say of them.
async function tapAndEdit(f, homeSnapshot) {
  f.journeymanId = found(homeSnapshot.players, player => player.kind === 'journeyman', 'a journeyman in the home snapshot').id;
  const tap = await request('home', eventsPath(f), tapBody(f, { pairingId: f.gameId }), 'POST');
  assert.equal(tap.status, 201, JSON.stringify(tap.data));
  const player = (await pool.query('SELECT roster FROM saved_teams WHERE id=$1', [f.teamIds[0]])).rows[0].roster.players[2];
  assert.ok(player, 'the home blob has no third player');
  f.outsidePlayer = player.id; f.outsideBefore = player.spp?.completions ?? 0; f.outsideMvpBefore = player.spp?.mvps ?? 0;
  const edit = await request('home', eventsPath(f), { playerId: f.outsidePlayer, counter: 'completions', delta: 1 }, 'POST');
  assert.equal(edit.status, 201, JSON.stringify(edit.data));
  assert.equal(edit.data.event.pairingId, null, 'an edit outside a match has no match');
  const mvp = await request('home', eventsPath(f), { playerId: f.outsidePlayer, counter: 'mvps', delta: 1 }, 'POST');
  assert.equal(mvp.status, 201, JSON.stringify(mvp.data));
  const ofMatch = await get('home', eventsPath(f, '?pairing=' + f.gameId));
  assert.equal(ofMatch.events.length, 1, 'one event in the match: ' + JSON.stringify(ofMatch));
  const waiting = await get('home', eventsPath(f));
  assert.equal(waiting.events.length, 3, 'the tap and the two edits wait to be settled: ' + JSON.stringify(waiting));
}

async function start(f) {
  const path = '/api/games/' + f.gameId;
  f.pre = (await request('home', path + '/preparation')).data;
  for (const name of ['home', 'away']) await change(f, name, { type: 'fans', value: 2 }, true);
  await change(f, 'home', { type: 'weather', season: 'Autumn', home: 3, away: 4 }, true);
  await change(f, 'home', { type: 'add-journeyman', rowIndex: 0 }, true);
  for (const name of ['home', 'away']) await change(f, name, { type: 'lock-roster' }, true);
  const buyingOrder = ['home', 'away'].sort((a, b) => calculateMatchCtv(f.pre.preparation[b]).total - calculateMatchCtv(f.pre.preparation[a]).total);
  for (const name of buyingOrder) await change(f, name, { type: 'lock-basket' }, true);
  for (const name of ['home', 'away']) await change(f, name, { type: 'confirm' }, true);
  const started = await request('home', path + '/start', { revision: f.pre.preparation.revision }, 'POST');
  assert.equal(started.status, 200, JSON.stringify(started.data));
  await tapAndEdit(f, started.data.snapshots.home);
  f.post = (await request('home', path + '/post-match')).data;
  await change(f, 'home', { type: 'result', home: { touchdowns: 2, casualties: 1 }, away: { touchdowns: 1, casualties: 0 } });
  await change(f, 'away', { type: 'agree-result' });
  for (const name of ['home', 'away']) await change(f, name, { type: 'fans', roll: 3, painted: name === 'away' });
}

async function stats(f, name) {
  const side = f.post.postMatch[name], statistics = structuredClone(side.statistics), player = side.snapshot.players[0];
  Object.assign(statistics[player.id], f.post.postMatch.result[name]);
  const mvp = name === 'home' ? side.snapshot.players.find(item => item.kind === 'journeyman').id : player.id;
  await change(f, name, { type: 'statistics', statistics, mvps: [mvp], injuries: name === 'home' ? { [side.snapshot.players[1].id]: { code: 'dead' } } : {} });
  await change(f, name, { type: 'lock-players' });
}

async function confirmation(f, name) {
  await change(f, name, { type: 'finance', deposit: 20, mistake: { roll: 6 } });
  await change(f, name, { type: 'next', captain: f.post.postMatch[name].baseRoster.players[0].id });
  await change(f, name, { type: 'confirm' });
}

async function matchEvents(f) {
  return (await pool.query(`SELECT saved_team_id, counter, sum(delta)::integer AS total, count(*)::integer AS rows, count(settled_at)::integer AS settled
    FROM match_events WHERE pairing_id=$1 GROUP BY saved_team_id, counter ORDER BY saved_team_id, counter`, [f.gameId])).rows;
}
const byTeam = (rows, team) => Object.fromEntries(rows.filter(row => row.saved_team_id === team).map(row => [row.counter, row.total]));

// A tap in the match that the side can no longer take: refused with `code` (the tally of the match's events, checked last, shows it wrote nothing).
async function refusedTap(f, code) {
  const refused = await request('home', eventsPath(f), tapBody(f, { pairingId: f.gameId }), 'POST');
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.equal(refused.data.error.code, code);
}

const historyOf = async (f, playerId) => (await get('home', '/api/teams/' + f.teamIds[0] + '/players/' + playerId + '/history')).history;

// What the finish did with the tap and the edit: the edit is in the blob, nothing waits, the match is over for taps,
// and the career has the match as the post-match applied it and the edit outside it.
async function afterFinish(f) {
  const home = (await pool.query('SELECT roster FROM saved_teams WHERE id=$1', [f.teamIds[0]])).rows[0].roster;
  const edited = found(home.players, player => player.id === f.outsidePlayer, 'the player of the edit ' + f.outsidePlayer + ' in the home blob');
  assert.equal(edited.spp.completions, f.outsideBefore + 1, 'the finish carried the edit into the blob');
  assert.equal(edited.spp.mvps, f.outsideMvpBefore + 1, 'the finish carried the MVP edit into the blob');
  const waiting = await get('home', eventsPath(f));
  assert.deepEqual(waiting.events, [], 'nothing is left waiting after the finish');
  await refusedTap(f, 'MATCH_NOT_LIVE');
  const scorer = await historyOf(f, f.post.postMatch.home.snapshot.players[0].id);
  const row = found(scorer.matches, match => match.pairingId === f.gameId, 'the match ' + f.gameId + ' in the career');
  assert.equal(row.source, 'applied'); assert.equal(row.counters.touchdowns, 2);
  assert.equal((await historyOf(f, f.outsidePlayer)).outside.completions, 1);
  assert.equal((await historyOf(f, f.outsidePlayer)).outside.mvps, 1);
}

async function verify(f) {
  const path = '/api/games/' + f.gameId;
  assert.equal((await request(null, path + '/post-match')).status, 401);
  assert.equal((await request('outsider', path + '/post-match')).status, 403);
  const forged = await request('away', path + '/post-match', { revision: f.post.postMatch.revision, side: 'home', action: { type: 'reopen' } }, 'PATCH');
  assert.equal(forged.status, 403);
  const stale = await request('home', path + '/post-match', { revision: 0, action: { type: 'reopen' } }, 'PATCH');
  assert.equal(stale.data.error.code, 'POST_REVISION');
  for (const name of ['home', 'away']) await stats(f, name);
  await refusedTap(f, 'EVENT_SIDE_LOCKED');
  const jm = f.post.postMatch.home.snapshot.players.find(item => item.kind === 'journeyman');
  await change(f, 'home', { type: 'roster', operation: 'keep', playerId: jm.id });
  await change(f, 'home', { type: 'roster', operation: 'staff', key: 'assistantCoaches', delta: 1 });
  for (const name of ['home', 'away']) await change(f, name, { type: 'lock-roster' });
  for (const name of ['home', 'away']) await confirmation(f, name);
  const before = (await pool.query('SELECT id,roster FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id', [f.teamIds])).rows;
  assert.ok(before.every(team => team.roster.treasury === 150 && team.roster.coachesSafe === 0));
  await pool.query('UPDATE saved_teams SET revision=revision+1 WHERE id=$1', [f.teamIds[1]]);
  const failed = await request('home', path + '/finish', { revision: f.post.postMatch.revision }, 'POST');
  assert.equal(failed.data.error.code, 'POST_TEAM_CHANGED');
  assert.ok((await matchEvents(f)).every(row => row.settled === 0), 'a refused finish settles nothing');
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM match_post_applications WHERE pairing_id=$1', [f.gameId])).rows[0].n, 0);
  assert.deepEqual((await pool.query('SELECT id,roster FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id', [f.teamIds])).rows, before);
  await change(f, 'away', { type: 'reset-side' });
  await change(f, 'away', { type: 'fans', roll: 3, painted: true }); await stats(f, 'away');
  await change(f, 'away', { type: 'lock-roster' });
  for (const name of ['home', 'away']) await confirmation(f, name);
  const unpainted = structuredClone(f.post.postMatch); unpainted.away.painted = false;
  const expectedAwayTreasury = 150 + postWinnings(unpainted, 'away') + 15 - 20;
  const finished = await Promise.all(['home', 'away'].map(name => request(name, path + '/finish', { revision: f.post.postMatch.revision }, 'POST')));
  assert.ok(finished.every(response => response.status === 200), JSON.stringify(finished));
  assert.ok(finished.every(response => response.data.postMatch.status === 'completed'));
  for (const name of ['home', 'away']) {
    const settlement = finished[0].data.postMatch[name].settlement, account = settlement.accounting;
    assert.equal(account.opening + account.winnings + account.sales - account.purchases - account.deposit - account.loss, account.closing);
    assert.equal(account.safeOpening + account.deposit, account.safeClosing);
    assert.equal(settlement.finance.pending, false);
  }
  const count = (await pool.query('SELECT count(*)::integer AS n FROM match_post_applications WHERE pairing_id=$1', [f.gameId])).rows[0].n;
  assert.equal(count, 2);
  await afterFinish(f);
  const events = await matchEvents(f);
  assert.deepEqual(byTeam(events, f.teamIds[0]), { casualties: 1, catches: 1, injury: 1, touchdowns: 2 });
  assert.deepEqual(byTeam(events, f.teamIds[1]), { touchdowns: 1 });
  assert.ok(events.every(row => row.settled === row.rows), 'every event of the match is settled');
  const rosters = (await pool.query('SELECT roster FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id', [f.teamIds])).rows;
  assert.ok(rosters.every(team => team.roster.coachesSafe === 20 && team.roster.players.length === 8));
  assert.ok(rosters.every(team => team.roster.players.find(player => player.name === 'Recovering player').skipNextGame === false));
  const away = (await pool.query('SELECT roster FROM saved_teams WHERE id=$1', [f.teamIds[1]])).rows[0].roster;
  assert.equal(away.treasury, expectedAwayTreasury);
  const home = (await pool.query('SELECT roster FROM saved_teams WHERE id=$1', [f.teamIds[0]])).rows[0].roster;
  const kept = home.players.find(player => player.id.startsWith('post-'));
  assert.equal(kept.purchased, true);
  assert.equal(Object.hasOwn(kept, 'purchaseRefund'), false, 'A confirmed post-match purchase is not cancellable in the editor');
  assert.equal(kept.spp.mvps, 1); assert.equal(kept.advancements.length, 0);
  assert.equal(home.players[0].spp.bonus, 40); assert.equal(home.players[0].advancements.length, 0);
  const game = (await request('home', path)).data.game;
  assert.equal(game.postMatchStatus, 'completed'); assert.equal(game.homePoints, f.kind === 'friendly' ? 0 : 3);
  const duplicate = await request('home', path + '/finish', { revision: 0 }, 'POST'); assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.data.postMatch.home.settlement, finished[0].data.postMatch.home.settlement);
  assert.deepEqual(duplicate.data.postMatch.away.settlement, finished[0].data.postMatch.away.settlement);
  assert.deepEqual((await pool.query('SELECT roster FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id', [f.teamIds])).rows, rosters);
  assert.deepEqual(await matchEvents(f), events);
  const locked = await request('home', path + '/post-match', { revision: duplicate.data.postMatch.revision, action: { type: 'reopen' } }, 'PATCH');
  assert.equal(locked.data.error.code, 'POST_CLOSED');
}

async function cleanup() {
  for (const f of fixtures.filter(item => item !== keep)) {
    if (f.historyIds?.length) await pool.query('DELETE FROM season_pairings WHERE id=ANY($1::uuid[])', [f.historyIds]);
    if (f.seasonId) await pool.query('DELETE FROM seasons WHERE id=$1', [f.seasonId]);
    else if (f.gameId) await pool.query('DELETE FROM season_pairings WHERE id=$1', [f.gameId]);
    await pool.query('DELETE FROM saved_teams WHERE id=ANY($1::uuid[])', [f.teamIds]);
  }
  if (outsiderId) await pool.query('DELETE FROM users WHERE id=$1 AND login=$2', [outsiderId, 'post-smoke-' + stamp]);
  await pool.end();
}

try {
  await logins();
  for (const kind of ['league', 'friendly']) await verify(await fixture(kind));
  const veteran = await fixture('friendly', false, 4);
  assert.equal(veteran.post.postMatch.home.gamesPlayed, 3);
  assert.equal(veteran.post.postMatch.away.gamesPlayed, 3);
  if (process.argv.includes('--keep-preview')) {
    const candidate = await fixture('friendly', true);
    await mkdir('.codex_tmp', { recursive: true }); // ignored by git, so a fresh worktree has none
    await writeFile('.codex_tmp/post-match-preview.json', JSON.stringify(candidate)); keep = candidate;
    console.log('Preview: ' + base + '/#/games/' + candidate.gameId + '/post-match/players');
  }
  console.log('Post-match API smoke passed: rights, revisions, rollback, league/friendly LP, 15k painting bonus, optional advancement, manual MVP, recovery, idempotent completion, match events settled once, taps, edits outside a match, an MVP edited outside a match and the player\'s career.');
} finally { await cleanup(); }

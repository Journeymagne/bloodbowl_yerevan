import test from 'node:test';
import assert from 'node:assert/strict';
import { accessPreparation } from '../server/season/preparation.mjs';
import { generateSwissRound, startSeasonRound } from '../server/season/rounds.mjs';
import { G, SIDES, coaches, startedFriendly, teams } from './helpers/match-db.mjs';
import { scratchSkip, withScratchDatabase, withServerPool } from './helpers/scratch-db.mjs';

async function pairedLeague(client) {
  await startedFriendly(client);
  // Keep the two coaches and teams, then pair them through the real league flow.
  await client.query('DELETE FROM season_pairings WHERE id=$1', [G]);
  const season = (await client.query("INSERT INTO seasons(name) VALUES ('Refresh test') RETURNING *")).rows[0];
  for (const name of SIDES) await client.query('INSERT INTO season_entries(season_id,user_id,saved_team_id) VALUES ($1,$2,$3)',
    [season.id, coaches[name].id, teams[name]]);
  const round = await generateSwissRound(season);
  await startSeasonRound(season.id, round.id);
  return (await client.query('SELECT id FROM season_pairings WHERE round_id=$1', [round.id])).rows[0].id;
}

async function progressTeam(client, { bumpRevision = true } = {}) {
  const roster = (await client.query('SELECT roster FROM saved_teams WHERE id=$1', [teams.home])).rows[0].roster;
  Object.assign(roster, { treasury: 105, dedicatedFans: 4, teamRerolls: 2 });
  Object.assign(roster.players[0], { extraSkills: [{ name: 'Block', access: 'primary' }], statMods: { ma: 1 },
    advancements: [{ type: 'primary', grants: { skill: 'Block' } }], spp: { casualties: 4 } });
  Object.assign(roster.players[1], { skipNextGame: true, absence: { code: 'miss' } });
  roster.players.push({ id: 'new-hire', rowIndex: 0, number: '8', name: 'New signing' });
  await client.query('UPDATE saved_teams SET roster=$2,revision=revision+$3 WHERE id=$1', [teams.home, JSON.stringify(roster), bumpRevision ? 1 : 0]);
}

function assertCurrent(side) {
  const player = side.players.find(item => item.id === 'home-0');
  assert.ok(player.skills.includes('Block'));
  assert.equal(player.stats.ma, '7');
  assert.equal(player.spp.casualties, 4);
  assert.equal(player.advancements.length, 1);
  assert.equal(side.players.find(item => item.id === 'home-1').skipNextGame, true);
  assert.ok(side.players.some(item => item.id === 'new-hire'));
  assert.deepEqual([side.roster.treasury, side.roster.dedicatedFans, side.roster.teamRerolls], [105, 4, 2]);
}

async function ready(gameId, preparation) {
  let state = preparation;
  for (const side of SIDES) {
    const coach = Object.values(coaches).find(user => user.id === state[side].user.id);
    for (const action of [{ type: 'fans', value: 2 }, { type: 'weather', season: 'Autumn', home: 3, away: 4 },
      { type: 'lock-roster' }, { type: 'lock-basket' }, { type: 'confirm' }]) {
      state = (await accessPreparation(gameId, coach, { side, revision: state.revision, action })).preparation;
    }
  }
  return state;
}

test('prematch opened after pairing takes current development, hires, injuries and team resources; kickoff seals them', { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => withServerPool(url, async () => {
    const gameId = await pairedLeague(client);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM match_preparations')).rows[0].n, 0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM match_roster_snapshots')).rows[0].n, 0);
    await progressTeam(client);
    const opened = await accessPreparation(gameId, coaches.home), side = opened.viewerSide;
    assertCurrent(opened.preparation[side]);
    assert.equal(opened.preparation[side].team.revision, 2);
    const preparation = await ready(gameId, opened.preparation);
    const started = await accessPreparation(gameId, coaches.home, { revision: preparation.revision }, true);
    assert.ok(started.snapshots[side].players.find(player => player.id === 'home-0').skills.includes('Block'));
    assert.ok(started.snapshots[side].players.some(player => player.id === 'new-hire'));
    assert.ok(!started.snapshots[side].players.some(player => player.id === 'home-1'), 'MNG player stays out of the match');
    // Later team repairs cannot rewrite the match's historical roster.
    await client.query("UPDATE saved_teams SET roster=jsonb_set(roster,'{treasury}','999'),revision=revision+1 WHERE id=$1", [teams.home]);
    const reread = await accessPreparation(gameId, coaches.home);
    assert.deepEqual(reread.preparation, started.preparation);
    assert.deepEqual(reread.snapshots, started.snapshots);
    const repeated = await accessPreparation(gameId, coaches.home, { revision: preparation.revision }, true);
    assert.deepEqual(repeated.snapshots, started.snapshots);
  }));
});

test('an old prematch refreshes from actual roster data even without a team revision change; a stale start writes nothing', { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => withServerPool(url, async () => {
    const gameId = await pairedLeague(client);
    const opened = await accessPreparation(gameId, coaches.home), side = opened.viewerSide;
    const preparation = await ready(gameId, opened.preparation);
    await progressTeam(client, { bumpRevision: false });
    await assert.rejects(accessPreparation(gameId, coaches.home, { revision: preparation.revision }, true), { code: 'MATCH_ROSTER_CHANGED' });
    assert.equal((await client.query('SELECT count(*)::int AS n FROM match_roster_snapshots')).rows[0].n, 0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM match_treasury_spends')).rows[0].n, 0);
    const refreshed = (await accessPreparation(gameId, coaches.home)).preparation;
    assertCurrent(refreshed[side]);
    assert.equal(refreshed[side].team.revision, preparation[side].team.revision);
    assert.equal(refreshed.revision, preparation.revision + 1);
    assert.equal(refreshed[side].fansRoll, 2);
    assert.deepEqual(refreshed.weather, preparation.weather);
    assert.equal(refreshed[side].rosterLocked, false);
    assert.equal(refreshed[side].confirmed, false);
    assert.equal(refreshed.status, 'preparing');
    const unchanged = (await accessPreparation(gameId, coaches.home)).preparation;
    assert.deepEqual(unchanged, refreshed, 'reading unchanged JSONB does not reset progress again');
  }));
});

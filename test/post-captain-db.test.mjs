import test from 'node:test';
import assert from 'node:assert/strict';
import { accessPostMatch } from '../server/season/post-match.mjs';
import { G, SIDES, act, coaches, startedFriendly, teams } from './helpers/match-db.mjs';
import { scratchSkip, withScratchDatabase, withServerPool } from './helpers/scratch-db.mjs';

for (const dies of [false, true]) test(`settlement persists the captain once; incumbent dies: ${dies}`, { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await client.query("UPDATE saved_teams SET roster=jsonb_set(roster, '{players,2,isCaptain}', 'true')");
    await withServerPool(url, async () => {
      let state = (await accessPostMatch(G, coaches.home)).postMatch;
      state = await act('home', state, { type: 'result', home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
      // Exercise a veteran's recorded death as well as the living captain in the same fixture.
      state.home.gamesPlayed = 4;
      await client.query('UPDATE match_post_games SET state=$2 WHERE pairing_id=$1', [G, JSON.stringify(state)]);
      for (const name of SIDES) {
        state = await act(name, state, { type: 'fans', roll: '' });
        state = await act(name, state, { type: 'statistics', statistics: state[name].statistics, mvps: [],
          injuries: dies && name === 'home' ? { 'home-2': { code: 'dead' } } : {} });
        for (const action of [{ type: 'lock-players' }, { type: 'lock-roster' }, { type: 'finance', deposit: 0, mistake: { roll: 6 } },
          { type: 'next', captain: `${name}-3` }, { type: 'confirm' }]) state = await act(name, state, action);
      }
      const done = await act('home', state, null, true);
      assert.equal(done.status, 'completed');
      const saved = (await client.query('SELECT id, revision, roster FROM saved_teams ORDER BY id')).rows;
      for (const name of SIDES) {
        const roster = saved.find(team => team.id === teams[name]).roster;
        const expected = dies && name === 'home' ? 'home-3' : `${name}-2`;
        assert.deepEqual(roster.players.filter(player => player.isCaptain).map(player => player.id), [expected]);
        assert.equal(roster.players.some(player => player.id === 'home-2'), name === 'home' && !dies);
      }
      assert.equal((await act('away', state, null, true)).revision, done.revision);
      assert.deepEqual((await client.query('SELECT id, revision, roster FROM saved_teams ORDER BY id')).rows, saved);
    });
  });
});

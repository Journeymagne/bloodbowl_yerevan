import test from 'node:test';
import assert from 'node:assert/strict';
import { accessPreparation } from '../server/season/preparation.mjs';
import { accessPostMatch } from '../server/season/post-match.mjs';
import { G, SIDES, act, coaches, homeScores, startedFriendly, teams } from './helpers/match-db.mjs';
import { scratchSkip, withScratchDatabase, withServerPool } from './helpers/scratch-db.mjs';

test('independent preparation preserves side ownership, readiness and a single start', { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await client.query('DELETE FROM match_roster_snapshots WHERE pairing_id=$1', [G]);
    await client.query("UPDATE season_pairings SET preparation_status='preparing' WHERE id=$1", [G]);
    await withServerPool(url, async () => {
      let state = (await accessPreparation(G, coaches.home)).preparation;
      await assert.rejects(accessPreparation(G, coaches.home, { side: 'away', revision: state.revision, action: { type: 'fans', value: 2 } }), { code: 'FIXTURE_NOT_YOURS' });
      for (const name of SIDES) {
        for (const action of [{ type: 'fans', value: 2 }, { type: 'weather', season: 'Autumn', home: 3, away: 4 },
          { type: 'lock-roster' }, { type: 'lock-basket' }, { type: 'confirm' }]) {
          state = (await accessPreparation(G, coaches[name], { side: name, revision: state.revision, action })).preparation;
        }
        assert.equal(state[name].confirmed, true);
        if (name === 'home') {
          assert.equal(state.status, 'preparing');
          assert.equal(state.away.confirmed, false);
          await assert.rejects(accessPreparation(G, coaches.home, { revision: state.revision }, true), { code: 'MATCH_WAIT' });
          assert.equal((await client.query('SELECT count(*)::int AS n FROM match_roster_snapshots WHERE pairing_id=$1', [G])).rows[0].n, 0);
        }
      }
      assert.equal(state.status, 'ready');
      const started = await accessPreparation(G, coaches.away, { revision: state.revision }, true);
      assert.equal(started.preparation.status, 'in_progress');
      const repeated = await accessPreparation(G, coaches.away, { revision: state.revision }, true);
      assert.equal(repeated.preparation.revision, started.preparation.revision);
      assert.equal(Object.keys(repeated.snapshots).length, 2);
    });
  });
});

for (const chooseMvp of [false, true]) test(`independent settlement waits for both and runs once; MVP chosen: ${chooseMvp}`, { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      let state = (await accessPostMatch(G, coaches.home)).postMatch;
      state = await act('home', state, { type: 'result', home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
      await assert.rejects(accessPostMatch(G, coaches.home, { side: 'away', revision: state.revision, action: { type: 'fans', roll: 3 } }), { code: 'FIXTURE_NOT_YOURS' });
      for (const name of SIDES) {
        state = await act(name, state, { type: 'fans', roll: 3 });
        state = await act(name, state, { type: 'statistics', statistics: homeScores(name, state[name]), mvps: chooseMvp ? [`${name}-6`] : [] });
        for (const action of [{ type: 'lock-players' }, { type: 'lock-roster' }, { type: 'finance', deposit: 0, mistake: { roll: 6 } },
          { type: 'next', captain: `${name}-0` }, { type: 'confirm' }]) state = await act(name, state, action);
        if (name === 'home') {
          assert.equal(state.home.confirmed, true);
          assert.equal(state.away.stage, 1);
          assert.equal(state.status, 'draft');
          await assert.rejects(act('home', state, null, true), { code: 'POST_INCOMPLETE' });
          assert.equal((await client.query('SELECT revision FROM saved_teams WHERE id=$1', [teams.home])).rows[0].revision, 1);
        }
      }
      assert.equal(state.status, 'ready');
      assert.deepEqual(state.result.accepted, { home: true, away: false }, 'no invented opponent score approval');
      const done = await act('away', state, null, true);
      assert.equal(done.status, 'completed');
      const rosters = (await client.query('SELECT id, revision, roster FROM saved_teams ORDER BY id')).rows;
      for (const name of SIDES) {
        const player = rosters.find(row => row.id === teams[name]).roster.players.find(player => player.id === `${name}-6`);
        assert.equal(player.spp.mvps, Number(chooseMvp), 'skipping MVP grants no phantom award');
      }
      assert.equal((await act('home', state, null, true)).revision, done.revision);
      assert.deepEqual((await client.query('SELECT id, revision, roster FROM saved_teams ORDER BY id')).rows, rosters);
    });
  });
});

test('reading a legacy pending score unblocks its stages and persists a new revision', { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      let state = (await accessPostMatch(G, coaches.home)).postMatch;
      state = await act('home', state, { type: 'result', home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
      state.home.stage = 0; state.away.stage = 0;
      await client.query('UPDATE match_post_games SET state=$2 WHERE pairing_id=$1', [G, JSON.stringify(state)]);
      const resumed = (await accessPostMatch(G, coaches.home)).postMatch;
      assert.deepEqual([resumed.home.stage, resumed.away.stage, resumed.revision], [1, 1, state.revision + 1]);
      await assert.rejects(act('home', state, { type: 'fans', roll: 3 }), { code: 'POST_REVISION' });
      assert.equal((await act('home', resumed, { type: 'fans', roll: 3 })).home.stage, 2);
    });
  });
});

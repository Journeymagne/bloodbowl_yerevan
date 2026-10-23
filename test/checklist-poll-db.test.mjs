import test from 'node:test';
import assert from 'node:assert/strict';
import { accessPreparation } from '../server/season/preparation.mjs';
import { accessPostMatch } from '../server/season/post-match.mjs';
import { G, coaches, startedFriendly, teams } from './helpers/match-db.mjs';
import { scratchSkip, withScratchDatabase, withServerPool } from './helpers/scratch-db.mjs';

// xmin changes on UPDATE, even when the saved JSON is identical. Row locks alone leave it alone.
const versions = async client => (await client.query(`SELECT p.xmin::text AS pairing, m.xmin::text AS preparation
  FROM season_pairings p JOIN match_preparations m ON m.pairing_id=p.id WHERE p.id=$1`, [G])).rows[0];
const postRow = async client => (await client.query('SELECT xmin::text AS version,state FROM match_post_games WHERE pairing_id=$1', [G])).rows[0];

test('preparation polls leave rows untouched; refreshing a changed roster is still persisted', { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => withServerPool(url, async () => {
    await startedFriendly(client);
    await client.query('DELETE FROM match_roster_snapshots WHERE pairing_id=$1', [G]);
    await client.query("UPDATE season_pairings SET preparation_status='not_started' WHERE id=$1", [G]);
    const first = await accessPreparation(G, coaches.home);
    const before = await versions(client);
    assert.deepEqual((await accessPreparation(G, coaches.home)).preparation, first.preparation);
    assert.deepEqual(await versions(client), before, 'no checklist or pairing UPDATE on an unchanged poll');
    await client.query("UPDATE saved_teams SET roster=jsonb_set(roster,'{treasury}','200') WHERE id=$1", [teams.home]);
    const refreshed = await accessPreparation(G, coaches.home);
    assert.equal(refreshed.preparation.home.team.roster.treasury, 200);
    const after = await versions(client);
    assert.notEqual(after.preparation, before.preparation);
    assert.deepEqual((await accessPreparation(G, coaches.home)).preparation, refreshed.preparation);
    assert.deepEqual(await versions(client), after, 'refreshed state is saved once');
  }));
});

test('post-match polls write only when records or legacy stages change', { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => withServerPool(url, async () => {
    await startedFriendly(client);
    const first = await accessPostMatch(G, coaches.home);
    const before = await postRow(client);
    assert.deepEqual((await accessPostMatch(G, coaches.home)).postMatch, first.postMatch);
    assert.deepEqual(await postRow(client), before);
    await client.query(`INSERT INTO match_events(saved_team_id,pairing_id,player_id,counter,delta,created_by)
      VALUES ($1,$2,'home-0','casualties',1,$3)`, [teams.home, G, coaches.home.id]);
    const refreshed = (await accessPostMatch(G, coaches.home)).postMatch;
    assert.equal(refreshed.home.statistics['home-0'].casualties, 1);
    assert.ok(refreshed.revision > first.postMatch.revision);
    const after = await postRow(client);
    assert.notEqual(after.version, before.version);
    assert.deepEqual(after.state, refreshed);
    await accessPostMatch(G, coaches.home);
    assert.deepEqual(await postRow(client), after);
    const legacy = structuredClone(refreshed);
    legacy.result = { mode: 'played', accepted: { home: true, away: false },
      home: { touchdowns: 0, casualties: 1 }, away: { touchdowns: 0, casualties: 0 } };
    await client.query('UPDATE match_post_games SET state=$2 WHERE pairing_id=$1', [G, JSON.stringify(legacy)]);
    const resumed = (await accessPostMatch(G, coaches.home)).postMatch;
    assert.equal(resumed.home.stage, 1);
    assert.equal(resumed.away.stage, 1);
    assert.deepEqual((await postRow(client)).state, resumed);
  }));
});

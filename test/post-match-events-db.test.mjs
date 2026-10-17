import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch } from "../server/season/post-match.mjs";
import { G, SIDES, act, coaches, homeScores, spp, startedFriendly, teams, toPlayersStep, toReady, totals } from "./helpers/match-db.mjs";
import { lockRow, scratchSkip, withForcedOverlap, withScratchDatabase, withServerPool } from "./helpers/scratch-db.mjs";

/** What 03's endpoint will write for a tap. */
const tap = (client, team, playerId, counter, delta = 1) => client.query(
  "INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta) VALUES ($1, $2, $3, $4, $5)", [team, G, playerId, counter, delta]);

test("a match tapped in 3.0: the post-match starts from the taps, the Players step corrects them, the finish settles them once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    for (const delta of [1, 1, -1]) await tap(client, teams.home, "home-0", "touchdowns", delta);
    await tap(client, teams.home, "home-1", "completions");
    await withServerPool(url, async () => {
      const state = await toPlayersStep();
      assert.equal(state.home.statistics["home-0"].touchdowns, 1);
      assert.equal(state.home.statistics["home-1"].completions, 1);
      const corrected = (name, side) => name === "home"
        ? { ...side.statistics, "home-1": { ...side.statistics["home-1"], completions: 0 } } : side.statistics;
      assert.equal((await act("home", await toReady(state, corrected), null, true)).status, "completed");
    });
    assert.deepEqual(await totals(client, teams.home), [
      { player_id: "home-0", counter: "touchdowns", total: 1, rows: 3, settled: true },
      { player_id: "home-1", counter: "completions", total: 0, rows: 2, settled: true }]);
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1);
    assert.equal((await spp(client, "home", "home-1")).completions, 0);
  });
});

test("a post-match from 2.x — statistics in its state, no events — finishes in 3.0: SPP grow once, the finish writes the events and settles them", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      // What 2.x leaves: the same state without the flag, and no events at all.
      await client.query("DELETE FROM match_events WHERE pairing_id = $1", [G]);
      await client.query("UPDATE match_post_games SET state = state #- '{home,followsEvents}' #- '{away,followsEvents}' WHERE pairing_id = $1", [G]);
      assert.equal((await act("home", ready, null, true)).status, "completed");
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: true }]);
    assert.deepEqual(await totals(client, teams.away), []);
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1);
  });
});

test("a tap after the post-match was opened reaches it before the Players step is saved, and a step sent on the old revision is refused", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const opened = (await accessPostMatch(G, coaches.home)).postMatch;
      await tap(client, teams.home, "home-0", "touchdowns");
      await assert.rejects(act("home", opened, { type: "result", home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }),
        { code: "POST_REVISION" });
      const reread = (await accessPostMatch(G, coaches.home)).postMatch;
      assert.equal(reread.home.statistics["home-0"].touchdowns, 1);
      assert.ok(reread.revision > opened.revision);
    });
  });
});

test("the Players step sent twice on one revision writes its difference once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const state = await toPlayersStep();
      const step = { type: "statistics", statistics: homeScores("home", state.home), mvps: ["home-6"] };
      const results = await withForcedOverlap(url, { lock: lockRow("season_pairings", G), waiting: 2 }, [() => act("home", state, step), () => act("home", state, step)]);
      assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
      assert.equal(results.find((result) => result.status === "rejected").reason.code, "POST_REVISION");
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: false }]);
  });
});

test("two coaches finishing at once settle the events once and grow SPP once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      const finished = (await withForcedOverlap(url, { lock: lockRow("season_pairings", G), waiting: 2 }, SIDES.map((name) => () => act(name, ready, null, true))))
        .map((result) => { if (result.status === "rejected") throw result.reason; return result.value; }); // a TypeError on .status would hide why
      assert.ok(finished.every((state) => state.status === "completed"));
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: true }]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM match_post_applications WHERE pairing_id = $1", [G])).rows[0].n, 2);
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1);
  });
});

test("a finish refused for a changed team settles nothing and writes no difference", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      await client.query("UPDATE saved_teams SET revision = revision + 1 WHERE id = $1", [teams.away]);
      await assert.rejects(act("home", ready, null, true), { code: "POST_TEAM_CHANGED" });
    });
    assert.deepEqual(await totals(client, teams.home), [{ player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: false }]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM match_post_applications WHERE pairing_id = $1", [G])).rows[0].n, 0);
  });
});

test("a tap after the Players step was saved leaves the post-match as entered, and the finish takes it back", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await withServerPool(url, async () => {
      const ready = await toReady(await toPlayersStep(), homeScores);
      await tap(client, teams.home, "home-2", "touchdowns");
      const reread = (await accessPostMatch(G, coaches.home)).postMatch;
      assert.equal(reread.revision, ready.revision);
      assert.equal(reread.home.statistics["home-2"].touchdowns, 0);
      assert.equal((await act("home", ready, null, true)).status, "completed");
    });
    assert.deepEqual(await totals(client, teams.home), [
      { player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: true },
      { player_id: "home-2", counter: "touchdowns", total: 0, rows: 2, settled: true }]);
    assert.equal((await spp(client, "home", "home-2")).touchdowns, 0);
  });
});

test("the Players step saved again unchanged, with the state read back from Postgres in between, keeps the chosen advancement", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    await startedFriendly(client);
    await client.query(`UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0,spp}', '{"bonus": 10}') WHERE id = $1`, [teams.home]);
    await withServerPool(url, async () => {
      let state = await toPlayersStep();
      // An injury without a characteristic: its `stat: undefined` is gone once Postgres has the state.
      const step = { type: "statistics", statistics: homeScores("home", state.home), mvps: ["home-6"], injuries: { "home-1": { code: "miss" } } };
      state = await act("home", state, step);
      state = await act("home", state, { type: "advance", playerId: "home-0", advancementType: "primary", grant: { skill: "Block" } });
      assert.equal(state.home.advancements["home-0"].length, 1);
      await act("home", state, step);
    });
    const stored = (await client.query("SELECT state #> '{home,advancements}' AS chosen FROM match_post_games WHERE pairing_id = $1", [G])).rows[0];
    assert.deepEqual(stored.chosen, { "home-0": [{ type: "primary", grant: { skill: "Block" } }] });
    assert.deepEqual(await totals(client, teams.home), [
      { player_id: "home-0", counter: "touchdowns", total: 1, rows: 1, settled: false },
      { player_id: "home-1", counter: "injury", total: 1, rows: 1, settled: false }]);
  });
});

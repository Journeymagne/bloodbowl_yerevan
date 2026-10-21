import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

test("the preview seed runs twice on a migrated database and keeps one entry per preview coach; its pairing reads as its preparation", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    for (const run of [1, 2]) {
      const result = spawnSync(process.execPath, ["scripts/seed-pre-match-preview.mjs"],
        { cwd: rootDir, encoding: "utf8", env: { ...process.env, DATABASE_URL: url } });
      assert.equal(result.status, 0, `run ${run}: ${result.stderr}`);
    }
    const { rows } = await client.query(`SELECT u.login, count(*)::int AS entries FROM season_entries e
      JOIN users u ON u.id = e.user_id GROUP BY u.login ORDER BY u.login`);
    assert.deepEqual(rows, [{ login: "preview-away", entries: 1 }, { login: "preview-home", entries: 1 }]);
    // The pairing reads as the preparation it holds (stage 09a, Task 1): the second run does not make that preparation again.
    const { rows: pairings } = await client.query(`SELECT p.preparation_status FROM season_pairings p
      JOIN match_preparations m ON m.pairing_id = p.id`);
    assert.deepEqual(pairings, [{ preparation_status: "preparing" }]);
    // A preparation that has moved on is kept by a later run, and the pairing reads it (the Task 1 review, M-4): the
    // seed's insert does nothing, and its status is taken from the state it holds, not set back.
    for (const status of ["ready", "in_progress"]) {
      await client.query("UPDATE match_preparations SET state = jsonb_set(state, '{status}', to_jsonb($1::text))", [status]);
      await client.query("UPDATE season_pairings SET preparation_status = 'preparing'");
      const result = spawnSync(process.execPath, ["scripts/seed-pre-match-preview.mjs"],
        { cwd: rootDir, encoding: "utf8", env: { ...process.env, DATABASE_URL: url } });
      assert.equal(result.status, 0, result.stderr);
      const { rows: kept } = await client.query(`SELECT p.preparation_status, m.state->>'status' AS state FROM season_pairings p
        JOIN match_preparations m ON m.pairing_id = p.id`);
      assert.deepEqual(kept, [{ preparation_status: status, state: status }], status);
    }
  });
});

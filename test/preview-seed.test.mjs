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
  });
});

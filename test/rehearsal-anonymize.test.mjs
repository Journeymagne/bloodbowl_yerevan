import test from "node:test";
import assert from "node:assert/strict";

import { anonymizeRehearsalDatabase } from "../scripts/rehearsal/anonymize.mjs";
import { verifyPassword } from "../server/auth/session.mjs";

function recordingClient({ failOn } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql: sql.trim().split(/\s+/).slice(0, 2).join(" "), params });
      if (failOn && sql.includes(failOn)) throw new Error("boom");
      return { rowCount: sql.startsWith("UPDATE") ? 12 : sql.startsWith("DELETE") ? 30 : 0 };
    },
  };
}

test("passwords, contacts and sessions are replaced in one transaction", async () => {
  const client = recordingClient();
  const result = await anonymizeRehearsalDatabase(client, "rehearse-1");
  assert.deepEqual(result, { users: 12, sessions: 30 });
  assert.deepEqual(client.statements.map((statement) => statement.sql), ["BEGIN", "UPDATE users", "DELETE FROM", "COMMIT"]);
  assert.ok(verifyPassword("rehearse-1", client.statements[1].params[0]));
});

test("a failure rolls everything back and is reported", async () => {
  const client = recordingClient({ failOn: "DELETE" });
  await assert.rejects(() => anonymizeRehearsalDatabase(client, "rehearse-1"), /boom/);
  assert.equal(client.statements.at(-1).sql, "ROLLBACK");
});

test("an empty password is refused before anything runs", async () => {
  const client = recordingClient();
  await assert.rejects(() => anonymizeRehearsalDatabase(client, ""), /REHEARSAL_PASSWORD/);
  assert.equal(client.statements.length, 0);
});

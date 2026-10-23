import test from "node:test";
import assert from "node:assert/strict";

import { anonymizeRehearsalDatabase, verifyAnonymized } from "../scripts/rehearsal/anonymize.mjs";
import { verifyPassword } from "../server/auth/session.mjs";

function recordingClient({ failOn } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql: sql.trim().split(/\s+/).slice(0, 2).join(" "), full: sql.trim(), params });
      if (failOn && sql.includes(failOn)) throw new Error("boom");
      return { rowCount: sql.startsWith("UPDATE") ? 12 : sql.startsWith("DELETE") ? 30 : 0 };
    },
  };
}

test("passwords, contacts and sessions are replaced in one transaction", async () => {
  const client = recordingClient();
  const result = await anonymizeRehearsalDatabase(client, "rehearse-1");
  assert.equal(result.users, 12);
  assert.equal(result.sessions, 30);
  assert.deepEqual(client.statements.map((statement) => statement.sql), ["BEGIN", "UPDATE users", "DELETE FROM", "COMMIT"]);
  assert.ok(verifyPassword("rehearse-1", client.statements[1].params[0]));
});

test("the hash that was set is returned, so the caller can check it after COMMIT", async () => {
  const client = recordingClient();
  const result = await anonymizeRehearsalDatabase(client, "rehearse-1", () => "fixed-hash");
  assert.equal(result.hash, "fixed-hash");
  assert.equal(client.statements[1].params[0], "fixed-hash");
});

test("a marker is the last statement before COMMIT", async () => {
  const client = recordingClient();
  await anonymizeRehearsalDatabase(client, "rehearse-1", undefined, { marker: "anonymized 2026-10-16T10:00:00.000Z from a.dump" });
  assert.deepEqual(client.statements.map((statement) => statement.sql), ["BEGIN", "UPDATE users", "DELETE FROM", "COMMENT ON", "COMMIT"]);
  assert.equal(client.statements[3].full, "COMMENT ON DATABASE gata_rehearsal IS 'anonymized 2026-10-16T10:00:00.000Z from a.dump'");
});

test("a quote in the marker (a dump name can contain one) is doubled, never closing the literal", async () => {
  const client = recordingClient();
  await anonymizeRehearsalDatabase(client, "rehearse-1", undefined, { marker: "anonymized x from it's'; DROP DATABASE gata_league; --.dump" });
  assert.equal(
    client.statements[3].full,
    "COMMENT ON DATABASE gata_rehearsal IS 'anonymized x from it''s''; DROP DATABASE gata_league; --.dump'",
  );
});

test("without a marker no comment is written", async () => {
  const client = recordingClient();
  await anonymizeRehearsalDatabase(client, "rehearse-1");
  assert.ok(!client.statements.some((statement) => statement.sql === "COMMENT ON"));
});

test("a failure rolls everything back and is reported", async () => {
  const client = recordingClient({ failOn: "DELETE" });
  await assert.rejects(() => anonymizeRehearsalDatabase(client, "rehearse-1"), /boom/);
  assert.equal(client.statements.at(-1).sql, "ROLLBACK");
});

test("a failing marker rolls the anonymization back too: no marker, no anonymized database", async () => {
  const client = recordingClient({ failOn: "COMMENT" });
  await assert.rejects(() => anonymizeRehearsalDatabase(client, "rehearse-1", undefined, { marker: "anonymized x" }), /boom/);
  assert.equal(client.statements.at(-1).sql, "ROLLBACK");
  assert.ok(!client.statements.some((statement) => statement.sql === "COMMIT"));
});

test("an empty password is refused before anything runs", async () => {
  const client = recordingClient();
  await assert.rejects(() => anonymizeRehearsalDatabase(client, ""), /REHEARSAL_PASSWORD/);
  assert.equal(client.statements.length, 0);
});

function countingClient(row) {
  const calls = [];
  return { calls, async query(sql, params) { calls.push({ sql, params }); return { rows: [row] }; } };
}

test("the check after COMMIT passes only when every user carries the hash and a coach handle, and no session is left", async () => {
  const client = countingClient({ bad: 0, sessions: 0 });
  await verifyAnonymized(client, "fixed-hash");
  assert.deepEqual(client.calls[0].params, ["fixed-hash"]);
  assert.match(client.calls[0].sql, /password_hash <> \$1/);
  assert.match(client.calls[0].sql, /@coach_\[0-9\]\+\$/);
});

test("users left un-anonymized or sessions left behind fail the check, naming both counts", async () => {
  await assert.rejects(
    () => verifyAnonymized(countingClient({ bad: 2, sessions: 0 }), "h"),
    /anonymization check failed \(2 users not anonymized, 0 sessions left\)/,
  );
  await assert.rejects(
    () => verifyAnonymized(countingClient({ bad: 0, sessions: 3 }), "h"),
    /anonymization check failed \(0 users not anonymized, 3 sessions left\)/,
  );
});

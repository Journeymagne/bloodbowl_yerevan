import test from "node:test";
import assert from "node:assert/strict";

import { anonymizedMarker, assertAnonymized, isAnonymizedMarker } from "../scripts/rehearsal/marker.mjs";

test("only text starting with 'anonymized ' counts as the marker", () => {
  assert.equal(isAnonymizedMarker("anonymized 2026-10-16T10:00:00.000Z from a.dump"), true);
  for (const text of [null, undefined, "", "anonymized", "Anonymized x", " anonymized x", "not anonymized x", 5]) {
    assert.equal(isAnonymizedMarker(text), false, String(text));
  }
});

test("the marker the restore writes is one the check accepts", () => {
  const marker = anonymizedMarker("gata_league-20261016-100354.dump", new Date("2026-10-16T10:00:00.000Z"));
  assert.equal(marker, "anonymized 2026-10-16T10:00:00.000Z from gata_league-20261016-100354.dump");
  assert.ok(isAnonymizedMarker(marker));
});

function clientWithMarker(marker) {
  const calls = [];
  return { calls, async query(sql) { calls.push(sql); return { rows: [{ marker }] }; } };
}

test("a database carrying the marker passes", async () => {
  const client = clientWithMarker("anonymized 2026-10-16T10:00:00.000Z from a.dump");
  await assertAnonymized(client);
  assert.match(client.calls[0], /shobj_description\(oid, 'pg_database'\)/);
  assert.match(client.calls[0], /datname = current_database\(\)/);
});

test("a database without the marker is refused, with what to do about it", async () => {
  for (const marker of [null, "", "something else"]) {
    await assert.rejects(
      () => assertAnonymized(clientWithMarker(marker)),
      /gata_rehearsal is not marked as anonymized — run npm run rehearsal:restore first/,
      String(marker),
    );
  }
});

test("no row at all (the database is not there) is refused the same way", async () => {
  const client = { async query() { return { rows: [] }; } };
  await assert.rejects(() => assertAnonymized(client), /not marked as anonymized/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, rehearsalDatabaseUrl } from "../scripts/rehearsal/guard.mjs";

test("only a database on this machine is accepted", () => {
  for (const url of ["postgres://u:p@localhost:5433/gata_league", "postgres://u:p@127.0.0.1:5433/x", "postgres://u:p@[::1]:5433/x"]) {
    assert.doesNotThrow(() => assertLocalDatabaseUrl(url), url);
  }
  for (const url of ["postgres://u:p@51.81.86.51:5432/gata_league", "postgres://u:p@db.example.com/x", "not a url"]) {
    assert.throws(() => assertLocalDatabaseUrl(url), /local/, url);
  }
});

test("the rehearsal database keeps the credentials and swaps only the name", () => {
  const url = new URL(rehearsalDatabaseUrl("postgres://gata_admin:secret@localhost:5433/gata_league?sslmode=disable"));
  assert.equal(url.pathname, `/${REHEARSAL_DATABASE}`);
  assert.equal(url.username, "gata_admin");
  assert.equal(url.password, "secret");
  assert.equal(url.port, "5433");
  assert.equal(url.searchParams.get("sslmode"), "disable");
});

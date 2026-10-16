import test from "node:test";
import assert from "node:assert/strict";

import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, assertLocalDocker, rehearsalDatabaseUrl } from "../scripts/rehearsal/guard.mjs";

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

test("a query string that overrides the host or port is refused, whatever its spelling", () => {
  const forms = [
    ["?host=51.81.86.51", "host"],
    ["?%68ost=51.81.86.51", "host"],
    ["?host=localhost&host=51.81.86.51", "host"],
    ["?port=5432", "port"],
  ];
  for (const [query, key] of forms) {
    const url = `postgres://u:p@localhost:5433/gata_league${query}`;
    assert.throws(() => assertLocalDatabaseUrl(url), new RegExp(`\\?${key}=`), url);
    assert.throws(() => rehearsalDatabaseUrl(url), new RegExp(`\\?${key}=`), url);
  }
});

test("other query parameters still pass", () => {
  assert.doesNotThrow(() => assertLocalDatabaseUrl("postgres://u:p@localhost:5433/gata_league?sslmode=require"));
});

const LOCAL_SOCKET = "unix:///Users/coach/.docker/run/docker.sock";

test("Docker is accepted only as a local unix socket with no DOCKER_HOST override", () => {
  assert.doesNotThrow(() => assertLocalDocker({ dockerHost: undefined, contextEndpoint: LOCAL_SOCKET }));
  assert.doesNotThrow(() => assertLocalDocker({ dockerHost: "", contextEndpoint: `${LOCAL_SOCKET}\n` }));
});

test("a DOCKER_HOST override is refused, whatever it points at", () => {
  for (const dockerHost of ["tcp://51.81.86.51:2375", "ssh://ubuntu@51.81.86.51", "unix:///var/run/docker.sock"]) {
    assert.throws(
      () => assertLocalDocker({ dockerHost, contextEndpoint: LOCAL_SOCKET }),
      (error) => error.message.includes("non-local Docker") && error.message.includes(dockerHost),
      dockerHost,
    );
  }
});

test("a context whose endpoint is not a local socket is refused", () => {
  for (const contextEndpoint of ["tcp://51.81.86.51:2376", "ssh://ubuntu@51.81.86.51", "", undefined, "  \n"]) {
    assert.throws(
      () => assertLocalDocker({ dockerHost: undefined, contextEndpoint }),
      /refusing to run against a non-local Docker \(.+\) — the container name gata-league-postgres is the same as production's/,
      String(contextEndpoint),
    );
  }
  assert.throws(() => assertLocalDocker({ dockerHost: undefined, contextEndpoint: "ssh://ubuntu@51.81.86.51" }), /ssh:\/\/ubuntu@51\.81\.86\.51/);
});

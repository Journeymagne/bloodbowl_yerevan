import test from "node:test";
import assert from "node:assert/strict";

import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, assertLocalDocker, assertSameServer, rehearsalDatabaseUrl } from "../scripts/rehearsal/guard.mjs";

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

test("only a postgres URL is accepted: any other scheme can carry the database in its own query", () => {
  for (const url of ["postgres://u:p@localhost:5433/gata_league", "postgresql://u:p@localhost:5433/gata_league"]) {
    assert.doesNotThrow(() => assertLocalDatabaseUrl(url), url);
  }
  for (const url of ["socket://localhost/x?db=gata_league", "http://localhost:5433/gata_league", "mysql://u:p@127.0.0.1/x", "localhost:5433/gata_league"]) {
    assert.throws(() => assertLocalDatabaseUrl(url), /postgres:\/\/ or postgresql:\/\//, url);
    assert.throws(() => rehearsalDatabaseUrl(url), /postgres:\/\/ or postgresql:\/\//, url);
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

test("the container and the DATABASE_URL connection must be one Postgres server", () => {
  assert.doesNotThrow(() => assertSameServer({ containerId: "7696813753774735404", clientId: "7696813753774735404", container: "gata-league-postgres" }));
  assert.doesNotThrow(() => assertSameServer({ containerId: "7696813753774735404\n", clientId: "7696813753774735404", container: "gata-league-postgres" }));
});

test("a different system identifier is refused, naming the container and the port to check", () => {
  assert.throws(
    () => assertSameServer({ containerId: "7696813753774735404", clientId: "7000000000000000001", container: "gata-league-postgres" }),
    /DATABASE_URL reaches a different Postgres server than the container gata-league-postgres; check the port in DATABASE_URL/,
  );
});

test("an empty or missing identifier on either side is refused rather than matched", () => {
  for (const [containerId, clientId] of [["", ""], [undefined, undefined], ["", "7696813753774735404"], ["7696813753774735404", ""], ["7696813753774735404", null], ["  \n", "  \n"]]) {
    assert.throws(
      () => assertSameServer({ containerId, clientId, container: "gata-league-postgres" }),
      /different Postgres server/,
      JSON.stringify([containerId, clientId]),
    );
  }
});

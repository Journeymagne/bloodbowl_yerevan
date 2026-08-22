import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { parseEnvFile, resolveEnvFilePath, SYSTEM_ENV_PATH } from "../server/config/env-file.mjs";

const root = "/opt/bloodbowl-league";
// The tests never touch the real filesystem: they say which paths exist.
// `override: null` rather than `undefined` is deliberate — a destructuring
// default fires on undefined, which would let the real BLOODBOWL_ENV_FILE of
// whatever machine runs the tests leak into them.
const existing = (...paths) => (candidate) => paths.includes(candidate);

test("prefers the system path over the deploy directory", () => {
  const resolved = resolveEnvFilePath(root, {
    override: null,
    exists: existing(SYSTEM_ENV_PATH, path.join(root, ".env")),
  });
  assert.equal(resolved, SYSTEM_ENV_PATH);
});

test("falls back to the deploy directory when the system path is absent", () => {
  const resolved = resolveEnvFilePath(root, {
    override: null,
    exists: existing(path.join(root, ".env")),
  });
  assert.equal(resolved, path.join(root, ".env"));
});

test("returns null when no candidate exists", () => {
  const resolved = resolveEnvFilePath(root, {
    override: null,
    exists: existing(),
  });
  assert.equal(resolved, null);
});

test("an explicit override wins over both defaults", () => {
  const override = "/srv/secrets/bloodbowl.env";
  const resolved = resolveEnvFilePath(root, {
    override,
    exists: existing(override, SYSTEM_ENV_PATH, path.join(root, ".env")),
  });
  assert.equal(resolved, override);
});

test("resolves a relative override to an absolute path", () => {
  const resolved = resolveEnvFilePath(root, {
    override: "secrets/.env",
    exists: existing(path.resolve("secrets/.env")),
  });
  assert.equal(resolved, path.resolve("secrets/.env"));
});

test("throws when the override points at a file that does not exist", () => {
  assert.throws(
    () => resolveEnvFilePath(root, {
      override: "/srv/secrets/missing.env",
      exists: existing(SYSTEM_ENV_PATH, path.join(root, ".env")),
    }),
    /BLOODBOWL_ENV_FILE/,
  );
});

test("parses keys, ignoring comments and blank lines", () => {
  const values = parseEnvFile(["# comment", "", "POSTGRES_DB=gata_league", "POSTGRES_USER=gata_admin"].join("\n"));
  assert.deepEqual([...values], [["POSTGRES_DB", "gata_league"], ["POSTGRES_USER", "gata_admin"]]);
});

test("keeps everything after the first equals sign", () => {
  const values = parseEnvFile("DATABASE_URL=postgres://user:p=ss@localhost:5433/db");
  assert.equal(values.get("DATABASE_URL"), "postgres://user:p=ss@localhost:5433/db");
});

test("strips surrounding quotes and outer whitespace", () => {
  const values = parseEnvFile(['ADMIN_PASSWORD="quoted secret"', "  ADMIN_LOGIN = admin  "].join("\n"));
  assert.equal(values.get("ADMIN_PASSWORD"), "quoted secret");
  assert.equal(values.get("ADMIN_LOGIN"), "admin");
});

test("the first occurrence of a key wins, matching how the server loaded the file", () => {
  const values = parseEnvFile(["APP_PORT=3002", "APP_PORT=9999"].join("\n"));
  assert.equal(values.get("APP_PORT"), "3002");
});

test("skips lines that carry no assignment", () => {
  const values = parseEnvFile(["nonsense", "#KEY=value", "=orphan"].join("\n"));
  assert.equal(values.size, 0);
});

test("handles CRLF line endings", () => {
  const values = parseEnvFile("POSTGRES_DB=gata_league\r\nPOSTGRES_USER=gata_admin\r\n");
  assert.equal(values.get("POSTGRES_USER"), "gata_admin");
});

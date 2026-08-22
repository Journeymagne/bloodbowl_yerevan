import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveEnvFilePath, SYSTEM_ENV_PATH } from "../server/config/env-file.mjs";

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

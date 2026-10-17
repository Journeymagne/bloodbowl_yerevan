import test from "node:test";
import assert from "node:assert/strict";

import { changesEnvProfile, ensureAdminAccount, isEnvAdmin } from "../server/auth/admin-account.mjs";
import { normalizeLogin } from "../server/api/serializers.mjs";
import { verifyPassword } from "../server/auth/session.mjs";

function recordingPool() {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
}

test("the admin account is upserted from the env values", async () => {
  const pool = recordingPool();
  const login = await ensureAdminAccount(pool, { ADMIN_LOGIN: "Chief", ADMIN_PASSWORD: "pw-1", ADMIN_TELEGRAM: "@chief" });
  assert.equal(login, "Chief");
  assert.equal(pool.calls.length, 1);
  const [{ sql, params }] = pool.calls;
  assert.match(sql, /ON CONFLICT \(login_key\) DO UPDATE/);
  assert.equal(params[0], "Chief");
  assert.equal(params[1], normalizeLogin("Chief"));
  assert.equal(params[2], "@chief");
  assert.ok(verifyPassword("pw-1", params[3]));
});

test("an env file that says nothing gets the documented defaults", async () => {
  const pool = recordingPool();
  assert.equal(await ensureAdminAccount(pool, {}), "admin");
  assert.equal(pool.calls[0].params[2], "@admin");
  assert.ok(verifyPassword("change-me-site-admin-password", pool.calls[0].params[3]));
});

test("the account the env file keeps is the one its upsert writes, found by the same login key", async () => {
  const pool = recordingPool();
  const env = { ADMIN_LOGIN: "Chief" };
  await ensureAdminAccount(pool, env);
  assert.equal(isEnvAdmin({ login_key: pool.calls[0].params[1] }, env), true);
  assert.equal(isEnvAdmin({ login_key: normalizeLogin("Chief") }, env), true);
  assert.equal(isEnvAdmin({ login_key: "admin" }, {}), true, "the default login");
  for (const user of [{ login_key: "admin" }, { login_key: "chief2" }, { login: "Chief" }, null, undefined]) {
    assert.equal(isEnvAdmin(user, env), false, JSON.stringify(user));
  }
});

test("a change of the env administrator's login or Telegram is told from one that leaves him as the start would: letter case and the same contact are no change", () => {
  const env = { ADMIN_LOGIN: "Chief" };
  const chief = { login: "Chief", login_key: "chief", telegram: "@chief" };
  const changes = (change) => changesEnvProfile(chief, change, env);
  assert.equal(changes({ login: "Renamed" }), true);
  assert.equal(changes({ login: "chief 2" }), true);
  assert.equal(changes({ telegram: "@elsewhere" }), true);
  assert.equal(changes({ login: "Renamed", telegram: "@chief" }), true);
  assert.equal(changes({ login: "chief", telegram: "@elsewhere" }), true);
  assert.equal(changes({ login: "CHIEF" }), false, "letter case: the start finds the account by login_key");
  assert.equal(changes({ login: "Chief", telegram: " @chief " }), false, "the contact it has, padded");
  assert.equal(changes({}), false, "a field that is left out is not touched");
  assert.equal(changes({ telegram: "@chief" }), false);
  const other = { login: "Deputy", login_key: "deputy", telegram: "@deputy" };
  assert.equal(changesEnvProfile(other, { login: "Renamed", telegram: "@elsewhere" }, env), false, "another account is nobody's but its user's");
  assert.equal(changesEnvProfile(null, { login: "Renamed" }, env), false);
});

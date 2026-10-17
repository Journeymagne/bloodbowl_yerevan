import test from "node:test";
import assert from "node:assert/strict";

import { ensureAdminAccount, isEnvAdmin } from "../server/auth/admin-account.mjs";
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

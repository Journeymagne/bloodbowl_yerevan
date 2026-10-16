import test from "node:test";
import assert from "node:assert/strict";

import { ensureAdminAccount } from "../server/auth/admin-account.mjs";
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

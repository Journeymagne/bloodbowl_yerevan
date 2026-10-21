import test from "node:test";
import assert from "node:assert/strict";

import { smokeAdminRun, smokeAdminTarget } from "../scripts/smoke-admin.mjs";

const SIGN_IN = { SMOKE_ADMIN_LOGIN: "rd12-admin", SMOKE_ADMIN_PASSWORD: "not-a-real-password" };

test("the site must be local and the admin's sign-in given", () => {
  // No site, no sign-in: the refusal names what is missing, in the words the command line uses.
  assert.throws(() => smokeAdminTarget({}), /smoke:admin needs APP_URL, SMOKE_ADMIN_LOGIN, SMOKE_ADMIN_PASSWORD/);
  assert.throws(() => smokeAdminTarget({ APP_URL: "http://localhost:3080" }), /smoke:admin needs SMOKE_ADMIN_LOGIN, SMOKE_ADMIN_PASSWORD/);
  assert.throws(() => smokeAdminTarget({ ...SIGN_IN }), /smoke:admin needs APP_URL\b/);
  // Blank is as good as missing.
  assert.throws(() => smokeAdminTarget({ APP_URL: " ", SMOKE_ADMIN_LOGIN: "\t", SMOKE_ADMIN_PASSWORD: "" }),
    /smoke:admin needs APP_URL, SMOKE_ADMIN_LOGIN, SMOKE_ADMIN_PASSWORD/);
  assert.throws(() => smokeAdminTarget({ APP_URL: "http://localhost:3080", SMOKE_ADMIN_LOGIN: "rd12-admin" }), /smoke:admin needs SMOKE_ADMIN_PASSWORD/);

  // It writes coaches, teams and results: plain http on this machine, nothing else.
  for (const url of ["https://bloodbowlyerevan.example", "http://10.0.0.2:3080", "https://localhost:3080", "http://localhost.example.com:3080", "x"]) {
    assert.throws(() => smokeAdminTarget({ APP_URL: url, ...SIGN_IN }), /smoke:admin runs only against a local site/, url);
  }
  assert.deepEqual(smokeAdminTarget({ APP_URL: "http://localhost:3080/", ...SIGN_IN }),
    { base: "http://localhost:3080", login: "rd12-admin", password: "not-a-real-password" });
  assert.equal(smokeAdminTarget({ APP_URL: "http://127.0.0.1:3080", ...SIGN_IN }).base, "http://127.0.0.1:3080");
  assert.equal(smokeAdminTarget({ APP_URL: "http://[::1]:3080", ...SIGN_IN }).base, "http://[::1]:3080");
});

test("a refusal never says the admin's password", () => {
  for (const env of [{ APP_URL: "https://example.org", ...SIGN_IN }, { APP_URL: SIGN_IN.SMOKE_ADMIN_PASSWORD, ...SIGN_IN }]) {
    assert.throws(() => smokeAdminTarget(env), (error) => !error.message.includes(SIGN_IN.SMOKE_ADMIN_PASSWORD));
  }
});

test("each run's coaches have logins of their own, which the server takes", () => {
  const first = smokeAdminRun("k3x9a2"), second = smokeAdminRun("k3x9a3");
  const logins = (run) => Object.values(run.logins);
  assert.deepEqual(Object.keys(first.logins).sort(), ["coach", "rival", "spare"]);
  assert.equal(new Set([...logins(first), ...logins(second)]).size, 6, "a second run on the same database meets no taken login");
  for (const login of logins(first)) {
    assert.match(login, /^smoke-admin-k3x9a2-[a-z]+$/);
    assert.ok(login.length >= 3 && login.length <= 40, login);
  }
  // The team names carry the run too: the season's table may hold the teams of earlier runs.
  assert.ok(Object.values(first.teamNames).every((name) => name.includes("k3x9a2")), JSON.stringify(first.teamNames));
});

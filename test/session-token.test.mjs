import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { apiRequest, setOnUnauthorized } = await import("../src/core/api-client.mjs");
const { API_ERROR } = await import("../src/core/api.mjs");
const { state } = await import("../src/core/state.mjs");

let ended = 0;
setOnUnauthorized(() => { ended += 1; });
function signedIn() {
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
  ended = 0;
}

test("a refusal (403) is not the end of the session", async () => {
  for (const code of ["CURRENT_PASSWORD_WRONG", "FIXTURE_NOT_YOURS", "ADMIN_REQUIRED", "FALLEN_FROM_MATCH"]) {
    signedIn();
    api.reply("PATCH /api/x", 403, { error: { code, params: {}, message: code } });
    await assert.rejects(apiRequest("/api/x", { method: "PATCH" }), (error) => error.kind === API_ERROR.FORBIDDEN && error.code === code);
    assert.equal(api.items.get("gata-league-auth-token"), "tok", code);
    assert.equal(state.auth.currentUser?.id, "u1", code);
    assert.equal(ended, 0, code);
  }
});

test("a 401 ends it: no token, no user, the app told once", async () => {
  signedIn();
  api.reply("GET /api/teams", 401, { error: { code: "NOT_AUTHORIZED", params: {}, message: "x" } });
  await assert.rejects(apiRequest("/api/teams"), (error) => error.kind === API_ERROR.UNAUTHORIZED);
  assert.equal(api.items.has("gata-league-auth-token"), false);
  assert.equal(state.auth.currentUser, null);
  assert.equal(ended, 1);
});

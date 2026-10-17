import test from "node:test";
import assert from "node:assert/strict";

import { publicAdminUser, publicUser } from "../server/api/serializers.mjs";
import { callApi, recording, seedCoach, seedTeam, withApiDatabase } from "./helpers/api-db.mjs";
import { lockRow, raceInOrder, scratchSkip, withForcedOverlap } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const patch = (token, body) => callApi("PATCH", "/api/auth/preferences", { token, body });
const stored = async (client, userId) => (await client.query("SELECT preferences FROM users WHERE id = $1", [userId])).rows[0].preferences;
const answers = (results) => results.map((result) => { if (result.status === "rejected") throw result.reason; return result.value; });
const NOBODY = "44444444-4444-4444-8444-444444444444";

test("a user's settings are theirs alone: /me carries them, and nothing that describes a user to others does", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), admin = await seedCoach(client, "boss", { admin: true });
  await client.query("UPDATE users SET preferences = $2 WHERE id = $1", [coach.id, { themeMode: "dark", lightPalette: "retired-palette" }]);
  const me = await callApi("GET", "/api/auth/me", { token: coach.token });
  assert.deepEqual(me.body.user.preferences, { themeMode: "dark" });
  const row = { id: "u", login: "l", telegram: "@t", is_admin: false, created_at: null, preferences: { themeMode: "dark" }, password_hash: "scrypt:x:y" };
  for (const shown of [publicUser(row), publicAdminUser(row)]) assert.deepEqual(Object.keys(shown).filter((key) => /preferences|password/i.test(key)), []);
  for (const path of ["/api/admin/users", `/api/players/${coach.id}`, "/api/season"]) {
    const { body } = await callApi("GET", path, { token: admin.token });
    assert.doesNotMatch(JSON.stringify(body), /preferences|password_hash|scrypt:/, path);
  }
}));

test("a settings change keeps what it does not mention, refuses what it does not know, and stores the active team lower-case", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), team = await seedTeam(client, coach.id);
  assert.deepEqual((await patch(coach.token, { themeMode: "light" })).body.preferences, { themeMode: "light" });
  const set = await patch(coach.token, { activeTeamId: team.toUpperCase() });
  assert.deepEqual([set.status, set.body.preferences], [200, { themeMode: "light", activeTeamId: team }]);
  assert.equal((await patch(coach.token, { fontSize: 3 })).body.error.params.field, "fontSize");
  assert.equal((await patch(coach.token, [])).body.error.params.field, "body");
  assert.deepEqual(await stored(client, coach.id), { themeMode: "light", activeTeamId: team });
}));

test("an active team must be the user's own: another coach's or none at all is 404 and nothing is stored; a deleted one stops showing", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf");
  const theirs = await seedTeam(client, other.id), mine = await seedTeam(client, coach.id);
  for (const activeTeamId of [theirs, "44444444-4444-4444-8444-444444444444"]) {
    const refused = await patch(coach.token, { activeTeamId, themeMode: "dark" });
    assert.deepEqual([refused.status, refused.body.error.code], [404, "TEAM_NOT_FOUND"]);
  }
  assert.deepEqual(await stored(client, coach.id), {});
  await patch(coach.token, { activeTeamId: mine });
  await client.query("DELETE FROM saved_teams WHERE id = $1", [mine]);
  assert.deepEqual((await callApi("GET", "/api/auth/me", { token: coach.token })).body.user.preferences, {});
}));

for (const themeFirst of [true, false]) {
  test(`two tabs changing different settings at once, ${themeFirst ? "the theme" : "the language"} first: both keep their change, and the second is answered with both`, db, () => withApiDatabase(async (database) => {
    const { client } = database;
    const coach = await seedCoach(client, "lion");
    const theme = () => patch(coach.token, { themeMode: "dark" }), language = () => patch(coach.token, { locale: "ru" });
    // Both queue on the user's row; the one named first is first in the queue.
    const [first, second] = answers(await raceInOrder(database, lockRow("users", coach.id), ...(themeFirst ? [theme, language] : [language, theme])));
    assert.deepEqual([first.status, second.status], [200, 200]);
    assert.deepEqual(first.body.preferences, themeFirst ? { themeMode: "dark" } : { locale: "ru" });
    assert.deepEqual(second.body.preferences, { themeMode: "dark", locale: "ru" }, "the second merged over what the first had committed, not over what it saw when it began");
    assert.deepEqual(await stored(client, coach.id), { themeMode: "dark", locale: "ru" });
  }));
}

test("a settings save is one transaction: the user's row is locked first, without a lock that holds up writes that only name the user; the team is read without any", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), team = await seedTeam(client, coach.id);
  const { result, log } = await recording(() => patch(coach.token, { activeTeamId: team, themeMode: "dark" }));
  assert.equal(result.status, 200);
  const steps = [/^BEGIN$/, /^SELECT preferences FROM users WHERE id = \$1 FOR NO KEY UPDATE$/, /^SELECT 1 FROM saved_teams WHERE id = \$1 AND user_id = \$2$/,
    /^UPDATE users SET preferences = \$2, updated_at = now\(\) WHERE id = \$1$/, /^COMMIT$/, /^release$/];
  assert.equal(log.length, steps.length, log.join("\n"));
  for (const [at, step] of steps.entries()) assert.match(log[at], step);
}));

test("what a settings save locks does not hold up a write that only names the user: a ledger line takes FOR KEY SHARE on the user, and FOR NO KEY UPDATE lets it", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const treasury = (revision) => callApi("POST", `/api/teams/${id}/treasury`, { token: coach.token, body: { delta: 5, reason: "sponsor", revision } });
  // The premise: FOR UPDATE on the user's row does make that write wait, so the next check could fail.
  const [stalled] = answers(await withForcedOverlap(url, { lock: lockRow("users", coach.id), waiting: 1 }, [() => treasury(1)]));
  assert.equal(stalled.status, 201);
  await client.query("BEGIN");
  try {
    await client.query("SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE", [coach.id]); // the lock a settings save takes
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("the ledger line is waiting on the user's row")), 5000); });
    try { assert.equal((await Promise.race([treasury(2), late])).status, 201); } finally { clearTimeout(timer); }
  } finally {
    await client.query("ROLLBACK");
  }
}));

test("an empty body is no change: 200 with the settings as they are, no transaction, no write", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  await client.query("UPDATE users SET preferences = $2 WHERE id = $1", [coach.id, { locale: "ru", themeMode: "light", darkPalette: "retired-palette" }]);
  const touched = async () => (await client.query("SELECT updated_at FROM users WHERE id = $1", [coach.id])).rows[0].updated_at;
  const before = await touched();
  const { result, log } = await recording(() => patch(coach.token, {}));
  assert.deepEqual([result.status, result.body], [200, { preferences: { locale: "ru", themeMode: "light" } }]);
  assert.deepEqual(log, []);
  assert.deepEqual(await touched(), before);
  assert.deepEqual(await stored(client, coach.id), { locale: "ru", themeMode: "light", darkPalette: "retired-palette" });
}));

test("a body that is not a JSON object is a 400 for the body, a key or a value the site does not know a 400 for that key; neither stores anything", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const refusals = [...[[], "dark", null, 3].map((body) => [body, "body"]),
    ...[[{ fontSize: 3 }, "fontSize"], [{ themeMode: "dark", colour: "red" }, "colour"], [{ locale: "de" }, "locale"], [{ themeMode: null }, "themeMode"],
      [{ lightPalette: "night" }, "lightPalette"], [{ activeTeamId: "abc" }, "activeTeamId"]]];
  for (const [body, field] of refusals) {
    const refused = await patch(coach.token, body);
    assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.params], [400, "FIELD_INVALID", { field }], JSON.stringify(body));
  }
  assert.deepEqual(await stored(client, coach.id), {});
}));

test("a refused save costs what it must: a bad body opens no transaction, a team that is not the user's rolls back before anything is written", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), theirs = await seedTeam(client, other.id);
  for (const body of [{ fontSize: 3 }, []]) {
    const { result, log } = await recording(() => patch(coach.token, body));
    assert.equal(result.status, 400);
    assert.deepEqual(log, [], `${JSON.stringify(body)}: no transaction was opened`);
  }
  const { result, log } = await recording(() => patch(coach.token, { activeTeamId: theirs, themeMode: "dark" }));
  assert.deepEqual([result.status, result.body.error.code], [404, "TEAM_NOT_FOUND"]);
  assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"]);
  assert.ok(!log.some((sql) => /^UPDATE/.test(sql)), "nothing was written before it was refused");
  assert.deepEqual(await stored(client, coach.id), {});
}));

test("clearing the active team needs no team and keeps the other settings", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), mine = await seedTeam(client, coach.id);
  await patch(coach.token, { activeTeamId: mine, themeMode: "dark" });
  await client.query("DELETE FROM saved_teams WHERE id = $1", [mine]); // the team is gone, and clearing it must not ask about it
  const { result, log } = await recording(() => patch(coach.token, { activeTeamId: null }));
  assert.deepEqual([result.status, result.body.preferences], [200, { themeMode: "dark" }]);
  assert.ok(!log.some((sql) => /saved_teams/.test(sql)), "no team was looked up");
  assert.deepEqual(await stored(client, coach.id), { themeMode: "dark" });
}));

test("an active team that is gone, or was never the user's, is shown by nothing: not /me, not the answer to a save that does not mention it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), theirs = await seedTeam(client, other.id);
  await client.query("UPDATE users SET preferences = $2 WHERE id = $1", [coach.id, { themeMode: "dark", activeTeamId: theirs }]);
  assert.deepEqual((await callApi("GET", "/api/auth/me", { token: coach.token })).body.user.preferences, { themeMode: "dark" });
  const saved = await patch(coach.token, { locale: "ru" });
  assert.deepEqual([saved.status, saved.body.preferences], [200, { themeMode: "dark", locale: "ru" }]);
  assert.equal((await patch(coach.token, { activeTeamId: NOBODY })).status, 404);
}));

test("a user who is gone by the time the save gets its lock is not signed in: 401, nothing written", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion");
  // The lock is the deletion itself: the save has been let in (the session was there) and queues on the row it is about to lose.
  const [saved] = answers(await withForcedOverlap(url, { lock: ["DELETE FROM users WHERE id = $1", [coach.id]], waiting: 1 }, [() => patch(coach.token, { themeMode: "dark" })]));
  assert.deepEqual([saved.status, saved.body.error.code], [401, "NOT_AUTHORIZED"]);
}));

test("without a session there is no user and no settings: /me says null, and a save is 401 before its body is looked at", async () => {
  const me = await callApi("GET", "/api/auth/me");
  assert.deepEqual([me.status, me.body], [200, { user: null }]);
  for (const body of [{ themeMode: "dark" }, [], { fontSize: 3 }]) {
    const refused = await patch(undefined, body);
    assert.deepEqual([refused.status, refused.body.error.code], [401, "NOT_AUTHORIZED"], JSON.stringify(body));
  }
});

test("the profile route answers as it did before it moved here: its refusals keep their codes and shape, a change answers with the user and nothing private", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), taken = await seedCoach(client, "wolf");
  const change = (token, body) => callApi("PATCH", "/api/auth/profile", { token, body });
  const unsigned = await change(undefined, { telegram: "@king" });
  assert.deepEqual([unsigned.status, unsigned.body], [401, { error: { code: "NOT_AUTHORIZED", params: {}, message: "Not authorized." } }]);
  for (const [body, status, code, message] of [[{ login: "ab" }, 400, "LOGIN_TOO_SHORT", "Login must be at least 3 characters."],
    [{ telegram: "  " }, 400, "TELEGRAM_REQUIRED", "Telegram contact is required."], [{ login: ` ${taken.login.toUpperCase()} ` }, 409, "LOGIN_ALREADY_REGISTERED", "This login is already registered."]]) {
    const refused = await change(coach.token, body);
    assert.deepEqual([refused.status, refused.body], [status, { error: { code, params: {}, message } }], code);
  }
  const changed = await change(coach.token, { login: "  Lion King ", telegram: " @king " });
  assert.equal(changed.status, 200);
  assert.deepEqual(Object.keys(changed.body), ["user"]);
  assert.deepEqual(Object.keys(changed.body.user).sort(), ["createdAt", "id", "isAdmin", "login", "telegram"]);
  assert.deepEqual([changed.body.user.id, changed.body.user.login, changed.body.user.telegram], [coach.id, "Lion King", "@king"]);
  assert.equal((await callApi("GET", "/api/auth/me", { token: coach.token })).body.user.login, "Lion King");
}));

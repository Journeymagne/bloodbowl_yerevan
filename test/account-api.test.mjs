import test from "node:test";
import assert from "node:assert/strict";

import { publicAdminUser, publicUser } from "../server/api/serializers.mjs";
import { hashPassword } from "../server/auth/session.mjs";
import { callApi, loggingErrors, recording, seedCoach, seedTeam, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
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
  for (const activeTeamId of [theirs, NOBODY]) {
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

test("the route itself does not wait for a write that only names the user: with the user's row held FOR KEY SHARE, as an insert through a foreign key holds it, a save is answered", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  await client.query("BEGIN");
  try {
    await client.query("SELECT 1 FROM users WHERE id = $1 FOR KEY SHARE", [coach.id]);
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("the settings save is waiting on the user's row")), 5000); });
    try {
      const saved = await Promise.race([patch(coach.token, { themeMode: "dark" }), late]);
      assert.deepEqual([saved.status, saved.body.preferences], [200, { themeMode: "dark" }]);
    } finally { clearTimeout(timer); }
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

// Changing the password: it needs the current one, and wrong guesses are counted as wrong logins.
// The counter is per account (`attemptKey`) and lives for the whole process, so each test below has an account of its own.
const profile = (token, body) => callApi("PATCH", "/api/auth/profile", { token, body });
const login = (name, password) => callApi("POST", "/api/auth/login", { body: { login: name, password } });
/** Who `token` signs in as: the user /me answers with, or null for a session that is over. */
const whoIs = async (token) => (await callApi("GET", "/api/auth/me", { token })).body.user;
/** A burst of cheap requests, so that the pool holds several open connections: two requests started together then run side by side, and do not take turns waiting for a new one. */
const warmThePool = (token) => Promise.all([1, 2, 3, 4].map(() => whoIs(token)));
/** Ten wrong current passwords: the account is at its limit. */
const useUpTheGuesses = async (token) => {
  for (let attempt = 0; attempt < 10; attempt += 1) await profile(token, { password: "brand-new", currentPassword: `guess-${attempt}` });
};

test("a new password needs the current one: missing or wrong, nothing changes", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-lion");
  for (const currentPassword of [undefined, "guess"]) {
    const refused = await profile(coach.token, { password: "brand-new", currentPassword });
    assert.deepEqual([refused.status, refused.body.error.code], [403, "CURRENT_PASSWORD_WRONG"]);
  }
  assert.equal((await login(coach.login, coach.password)).status, 200);
  assert.equal((await profile(coach.token, { telegram: "@lion" })).body.user.telegram, "@lion");
}));

test("with the current password it changes, the other sessions end, and this one goes on", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-wolf"), elsewhere = await sessionFor(client, coach.id);
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 200);
  assert.equal((await login(coach.login, "brand-new")).status, 200);
  assert.equal((await login(coach.login, coach.password)).status, 401);
  assert.equal((await callApi("GET", "/api/auth/me", { token: elsewhere })).body.user, null);
  assert.equal((await callApi("GET", "/api/auth/me", { token: coach.token })).body.user.login, coach.login);
}));

test("guessing the current password counts as guessing the login: after the limit the answer is later", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-fox");
  for (let attempt = 0; attempt < 10; attempt += 1) await profile(coach.token, { password: "brand-new", currentPassword: `guess-${attempt}` });
  const limited = await profile(coach.token, { password: "brand-new", currentPassword: coach.password });
  assert.deepEqual([limited.status, limited.body.error.code], [429, "TOO_MANY_LOGIN_ATTEMPTS"]);
}));

test("the profile route's 429 is the login's 429: the same status, code, header and body keys, for the same login after the limit", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "Pw Owl"); // login finds the account by the normalised name, "pw owl", and it is the account that is counted
  for (let attempt = 0; attempt < 10; attempt += 1) await profile(coach.token, { password: "brand-new", currentPassword: `guess-${attempt}` });
  const changing = await profile(coach.token, { password: "brand-new", currentPassword: coach.password });
  const signingIn = await login("  PW   owl ", coach.password);
  assert.deepEqual([changing.status, signingIn.status], [429, 429]);
  assert.deepEqual(changing.body.error, signingIn.body.error, "the same code, values and English");
  assert.deepEqual(Object.keys(changing.body).sort(), ["error", "retryAfterSeconds"]);
  assert.deepEqual(Object.keys(changing.body).sort(), Object.keys(signingIn.body).sort());
  assert.deepEqual(Object.keys(changing.headers).sort(), Object.keys(signingIn.headers).sort());
  for (const answer of [changing, signingIn]) {
    assert.match(answer.headers["retry-after"], /^[1-9]\d*$/);
    assert.equal(answer.headers["retry-after"], String(answer.body.retryAfterSeconds), "the header and the field say the same");
  }
  // Both read one window; a second may have turned between the two calls.
  assert.ok(Math.abs(changing.body.retryAfterSeconds - signingIn.body.retryAfterSeconds) <= 1);
  // The wait is for guessing the password, which is all it holds up: a bad body is still a 400, a contact change still goes through.
  assert.equal((await profile(coach.token, { password: "abc", currentPassword: coach.password })).body.error.code, "PASSWORD_TOO_SHORT");
  assert.equal((await profile(coach.token, { telegram: "@owl2" })).status, 200);
}));

test("anything but a string cannot be the current password, not even what a string would spell: 403, never a crash and never a pass", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-cat");
  await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [coach.id, hashPassword("12345678")]);
  const wrong = { error: { code: "CURRENT_PASSWORD_WRONG", params: {}, message: "The current password is wrong." } };
  for (const currentPassword of [12345678, null, true, {}, ["12345678"]]) {
    const refused = await profile(coach.token, { password: "brand-new", currentPassword });
    assert.deepEqual([refused.status, refused.body, refused.headers["retry-after"]], [403, wrong, undefined], JSON.stringify(currentPassword));
  }
  // The same digits as a string are the password: the refusals were about the type, and nothing was changed by them.
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: "12345678" })).status, 200);
}));

test("the right current password clears the count of wrong ones", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-yak");
  const wrong = async (times) => {
    for (let n = 0; n < times; n += 1) assert.equal((await profile(coach.token, { password: "other-one", currentPassword: `guess-${n}` })).status, 403);
  };
  await wrong(9);
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 200);
  await wrong(9); // eighteen, had the nine been kept: the limit is ten
  assert.equal((await profile(coach.token, { password: "newer-still", currentPassword: "brand-new" })).status, 200);
}));

test("the body's refusals come first: a bad login, contact or new password is a 400 whatever is said of the current password, and costs no guess", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-elk");
  const unsigned = await profile(undefined, { login: "ab", password: "abc", currentPassword: "guess" });
  assert.deepEqual([unsigned.status, unsigned.body.error.code], [401, "NOT_AUTHORIZED"]);
  const bad = [[{ login: "ab", password: "brand-new" }, "LOGIN_TOO_SHORT"], [{ telegram: "  ", password: "brand-new" }, "TELEGRAM_REQUIRED"], [{ password: "abc" }, "PASSWORD_TOO_SHORT"]];
  for (let round = 0; round < 4; round += 1) {
    for (const [body, code] of bad) {
      for (const currentPassword of [coach.password, `guess-${round}`, undefined]) {
        const refused = await profile(coach.token, { ...body, currentPassword });
        assert.deepEqual([refused.status, refused.body.error.code], [400, code], JSON.stringify(body));
      }
    }
  }
  // Thirty-six refusals, twenty-four of them with a wrong or missing current password, and none was a guess.
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 200);
}));

test("a login or contact change needs no current password and ends no session; a current password sent without a new one is not looked at", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-hare"), elsewhere = await sessionFor(client, coach.id);
  for (const body of [{ login: "Hare Prime", telegram: "@hare2", password: "" }, { telegram: "@hare3", password: null }]) {
    assert.equal((await profile(coach.token, body)).status, 200, JSON.stringify(body));
  }
  for (let n = 0; n < 12; n += 1) assert.equal((await profile(coach.token, { telegram: `@hare-${n}`, currentPassword: `stray-${n}` })).status, 200);
  assert.deepEqual([(await whoIs(elsewhere)).login, (await whoIs(coach.token)).telegram], ["Hare Prime", "@hare-11"]);
  assert.equal((await login("Hare Prime", coach.password)).status, 200, "the password is what it was");
  // Twelve stray values were not twelve wrong guesses.
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 200);
}));

test("a taken login in the same request as a new password changes neither the password nor the sessions", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-ram"), taken = await seedCoach(client, "pw-ewe"), elsewhere = await sessionFor(client, coach.id);
  const refused = await profile(coach.token, { login: ` ${taken.login.toUpperCase()} `, password: "brand-new", currentPassword: coach.password });
  assert.deepEqual([refused.status, refused.body.error.code], [409, "LOGIN_ALREADY_REGISTERED"]);
  assert.equal((await login(coach.login, coach.password)).status, 200, "the old password still opens the account");
  assert.equal((await login(coach.login, "brand-new")).status, 401);
  assert.equal((await whoIs(elsewhere)).login, coach.login, "the other session is still signed in");
}));

test("a password change is one transaction, the user's row and then the other sessions, and a refused one opens none", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-bee"), elsewhere = await sessionFor(client, coach.id);
  const refused = await recording(() => profile(coach.token, { password: "brand-new", currentPassword: "guess" }));
  assert.deepEqual([refused.result.status, refused.log], [403, []], "a wrong current password opens no transaction");
  const contact = await recording(() => profile(coach.token, { telegram: "@bee2" }));
  assert.deepEqual([contact.result.status, contact.log], [200, []], "a contact change is the one statement it always was, on the pool: no transaction, no session ended");
  const { result, log } = await recording(() => profile(coach.token, { password: "brand-new", currentPassword: coach.password }));
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body), ["user"]);
  assert.deepEqual(Object.keys(result.body.user).sort(), ["createdAt", "id", "isAdmin", "login", "telegram"]);
  const steps = [/^BEGIN$/, /^UPDATE users SET .*password_hash = \$5.* WHERE id = \$1 RETURNING \*$/,
    /^DELETE FROM sessions WHERE user_id = \$1 AND token_hash <> \$2$/, /^COMMIT$/, /^release$/];
  assert.equal(log.length, steps.length, log.join("\n"));
  for (const [at, step] of steps.entries()) assert.match(log[at], step);
  assert.equal(await whoIs(elsewhere), null);
}));

test("a password change that cannot end the other sessions does not change the password either: it is rolled back", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-eel"), elsewhere = await sessionFor(client, coach.id);
  // The database, not the route, refuses the second write: a session row cannot be deleted.
  await client.query("CREATE FUNCTION refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sessions are kept'; END $$");
  await client.query("CREATE TRIGGER keep_sessions BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION refuse_delete()");
  const { result, logged } = await loggingErrors(() => profile(coach.token, { password: "brand-new", currentPassword: coach.password }));
  assert.deepEqual([result.status, result.body.error.code], [500, "SERVER_ERROR"]);
  assert.match(String(logged[0]?.[0]?.message), /sessions are kept/, "it failed where the test broke it, on the sessions");
  assert.equal((await login(coach.login, coach.password)).status, 200, "the old password still opens the account");
  assert.equal((await login(coach.login, "brand-new")).status, 401);
  assert.equal((await whoIs(elsewhere)).login, coach.login);
}));

// Fix round 1 (R30): the promise is that a stolen session is not enough to change a password. It had two holes.

test("a refused change ends nothing: after a wrong or missing current password, and after the limit, every session is still signed in", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-kiwi"), elsewhere = await sessionFor(client, coach.id), stranger = await seedCoach(client, "pw-emu");
  const signedIn = async () => [(await whoIs(coach.token))?.login, (await whoIs(elsewhere))?.login, (await whoIs(stranger.token))?.login];
  const everyone = [coach.login, coach.login, stranger.login];
  for (const currentPassword of [undefined, "guess"]) assert.equal((await profile(coach.token, { password: "brand-new", currentPassword })).status, 403);
  assert.deepEqual(await signedIn(), everyone, "after the 403s");
  for (let attempt = 0; attempt < 10; attempt += 1) await profile(coach.token, { password: "brand-new", currentPassword: `guess-${attempt}` });
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429);
  assert.deepEqual(await signedIn(), everyone, "after the 429");
}));

test("a password change ends this user's other sessions, all of them, and no one else's", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-moth"), phone = await sessionFor(client, coach.id), laptop = await sessionFor(client, coach.id);
  const stranger = await seedCoach(client, "pw-newt"), theirs = await sessionFor(client, stranger.id);
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 200);
  assert.deepEqual([await whoIs(phone), await whoIs(laptop)], [null, null]);
  assert.equal((await whoIs(coach.token)).login, coach.login);
  assert.deepEqual([(await whoIs(stranger.token)).login, (await whoIs(theirs)).login], [stranger.login, stranger.login], "a stranger's sessions are theirs");
}));

test("a rename keeps the count of wrong guesses: the new name is as limited as the old one, on the profile route and on login", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-ibis"), stranger = await seedCoach(client, "pw-owlet");
  for (let attempt = 0; attempt < 10; attempt += 1) await profile(coach.token, { password: "brand-new", currentPassword: `guess-${attempt}` });
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429);
  // A rename that is refused moves nothing: the count stays, and does not land on someone else's name.
  assert.equal((await profile(coach.token, { login: stranger.login })).status, 409);
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429);
  assert.equal((await login(stranger.login, stranger.password)).status, 200, "the other user's name inherited nothing");
  // One rename, and a chain of them: the count is the account's, so it is where the account is.
  for (const name of ["pw-ibis-2", "pw-ibis-3", "pw-ibis-4"]) {
    const renamed = await profile(coach.token, { login: name });
    assert.deepEqual([renamed.status, renamed.body.user.login], [200, name]);
    assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429, `the profile route, as ${name}`);
    assert.equal((await login(name, coach.password)).status, 429, `login under ${name}`);
  }
  // Only the capitals change: the same account under the same key.
  assert.equal((await profile(coach.token, { login: "PW-IBIS-4" })).status, 200);
  assert.equal((await login("pw-ibis-4", coach.password)).status, 429);
  // The names it left are nobody's, and answer as names of nobody.
  assert.equal((await login("pw-ibis", coach.password)).status, 401);
}));

test("an administrator's rename of a user keeps that user's count of wrong guesses too", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-chief", { admin: true }), coach = await seedCoach(client, "pw-stag");
  const edit = (body) => callApi("PATCH", `/api/admin/users/${coach.id}`, { token: boss.token, body });
  for (let attempt = 0; attempt < 10; attempt += 1) await login(coach.login, `guess-${attempt}`);
  assert.equal((await login(coach.login, coach.password)).status, 429);
  // A rename that is refused moves nothing: the count stays, and does not land on someone else's name.
  assert.equal((await edit({ login: boss.login })).status, 409);
  assert.equal((await login(coach.login, coach.password)).status, 429);
  assert.equal((await login(boss.login, boss.password)).status, 200, "the other user's name inherited nothing");
  const renamed = await edit({ login: "pw-stag-2" });
  assert.deepEqual([renamed.status, renamed.body.user.login], [200, "pw-stag-2"]);
  assert.equal((await login("pw-stag-2", coach.password)).status, 429, "login under the new name");
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429, "the profile route");
}));

test("an administrator changes their own password in their settings, not in the user edit: 409, and nothing is changed or ended", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-warden", { admin: true }), elsewhere = await sessionFor(client, boss.id);
  const edit = (body) => callApi("PATCH", `/api/admin/users/${boss.id}`, { token: boss.token, body });
  const refused = await edit({ login: "Warden Prime", password: "brand-new" });
  assert.deepEqual([refused.status, refused.body.error.code], [409, "SELF_PASSWORD_RESET"]);
  // The 400s of the edit come first, as they do for any user.
  for (const [body, code] of [[{ login: "ab", password: "brand-new" }, "LOGIN_TOO_SHORT"], [{ password: "abc" }, "PASSWORD_TOO_SHORT"]]) {
    const bad = await edit(body);
    assert.deepEqual([bad.status, bad.body.error.code], [400, code], JSON.stringify(body));
  }
  assert.equal((await login(boss.login, boss.password)).status, 200, "the old password still opens the account");
  assert.equal((await login(boss.login, "brand-new")).status, 401);
  assert.deepEqual([(await whoIs(boss.token)).login, (await whoIs(elsewhere)).login], [boss.login, boss.login], "not renamed either, and the second session is still signed in");
  // The same edit without a password is as it was, and the password has its own door, which asks for the current one.
  assert.equal((await edit({ login: "Warden Prime" })).status, 200);
  assert.equal((await profile(boss.token, { password: "brand-new", currentPassword: boss.password })).status, 200);
  assert.equal(await whoIs(elsewhere), null);
}));

test("an administrator still sets another user's password in the user edit, and that ends all of that user's sessions and no one else's", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-keeper", { admin: true }), coach = await seedCoach(client, "pw-lamb"), phone = await sessionFor(client, coach.id);
  const stranger = await seedCoach(client, "pw-sheep");
  const set = await callApi("PATCH", `/api/admin/users/${coach.id}`, { token: boss.token, body: { password: "set-by-admin" } });
  assert.deepEqual([set.status, set.body.user.login], [200, coach.login]);
  assert.equal((await login(coach.login, "set-by-admin")).status, 200);
  assert.equal((await login(coach.login, coach.password)).status, 401);
  assert.deepEqual([await whoIs(coach.token), await whoIs(phone)], [null, null]);
  assert.deepEqual([(await whoIs(boss.token)).login, (await whoIs(stranger.token)).login], [boss.login, stranger.login]);
}));

test("a user who is gone by the time the profile write gets its turn is not signed in: 401, whatever was asked", db, () => withApiDatabase(async ({ client, url }) => {
  const asks = [["pw-gone-a", () => ({ telegram: "@gone" })], ["pw-gone-b", (coach) => ({ password: "brand-new", currentPassword: coach.password })]];
  for (const [name, ask] of asks) {
    const coach = await seedCoach(client, name);
    // The lock is the deletion itself: the change has been let in (the session was there) and queues on the row it is about to lose.
    const [answer] = answers(await withForcedOverlap(url, { lock: ["DELETE FROM users WHERE id = $1", [coach.id]], waiting: 1 }, [() => profile(coach.token, ask(coach))]));
    assert.deepEqual([answer.status, answer.body.error.code], [401, "NOT_AUTHORIZED"], name);
  }
}));

// Fix round 2 (R31): the count is the account's, so no rename can shed it, however the renames are timed.

test("two renames at once cannot shed the count: both held on the user's row, the account is still limited under whichever name it ends with", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "pw-twin");
  await useUpTheGuesses(coach.token);
  const [first, second] = answers(await withForcedOverlap(url, { lock: lockRow("users", coach.id), waiting: 2 },
    [() => profile(coach.token, { login: "pw-twin-a" }), () => profile(coach.token, { login: "pw-twin-b" })]));
  assert.deepEqual([first.status, second.status], [200, 200]);
  const { login: name } = (await client.query("SELECT login FROM users WHERE id = $1", [coach.id])).rows[0];
  assert.match(name, /^pw-twin-[ab]$/);
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429, "the profile route");
  assert.equal((await login(name, coach.password)).status, 429, `login under ${name}`);
}));

test("two renames started together, with nothing holding them, cannot shed the count either", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-pair");
  await useUpTheGuesses(coach.token);
  await warmThePool(coach.token);
  const [first, second] = await Promise.all([profile(coach.token, { login: "pw-pair-a" }), profile(coach.token, { login: "pw-pair-b" })]);
  assert.deepEqual([first.status, second.status], [200, 200]);
  const { login: name } = (await client.query("SELECT login FROM users WHERE id = $1", [coach.id])).rows[0];
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429, "the profile route");
  assert.equal((await login(name, coach.password)).status, 429, `login under ${name}`);
}));

test("two renames of a user by an administrator, started together, cannot shed that user's count", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-marshal", { admin: true }), coach = await seedCoach(client, "pw-duo");
  const edit = (body) => callApi("PATCH", `/api/admin/users/${coach.id}`, { token: boss.token, body });
  for (let attempt = 0; attempt < 10; attempt += 1) await login(coach.login, `guess-${attempt}`);
  await warmThePool(boss.token);
  const [first, second] = await Promise.all([edit({ login: "pw-duo-a" }), edit({ login: "pw-duo-b" })]);
  assert.deepEqual([first.status, second.status], [200, 200]);
  const { login: name } = (await client.query("SELECT login FROM users WHERE id = $1", [coach.id])).rows[0];
  assert.equal((await login(name, coach.password)).status, 429, `login under ${name}`);
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 429, "the profile route");
}));

test("a newcomer who registers the name an account has left logs in at once and inherits nothing, and the account keeps its count", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-heron");
  await useUpTheGuesses(coach.token);
  assert.equal((await profile(coach.token, { login: "pw-heron-2" })).status, 200);
  const joined = await callApi("POST", "/api/auth/register", { body: { login: "pw-heron", password: "newcomer-pw", telegram: "@heron" } });
  assert.equal(joined.status, 201);
  assert.equal((await login("pw-heron", "newcomer-pw")).status, 200, "the newcomer is not limited");
  assert.equal((await login("pw-heron-2", coach.password)).status, 429, "the account that left the name is");
}));

test("a login that names nobody is still limited by name: ten failures, then 429 whatever the password, and another name is not held up", db, () => withApiDatabase(async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await login("pw-ghost", `guess-${attempt}`)).status, 401);
  const limited = await login(" PW-Ghost ", "whatever");
  assert.deepEqual([limited.status, limited.body.error.code], [429, "TOO_MANY_LOGIN_ATTEMPTS"]);
  assert.match(limited.headers["retry-after"], /^[1-9]\d*$/);
  assert.equal(limited.headers["retry-after"], String(limited.body.retryAfterSeconds));
  assert.equal((await login("pw-ghost-2", "whatever")).status, 401, "another name that names nobody is counted on its own");
}));

test("a correct login clears the account's count, whichever door the wrong guesses came through", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-crane");
  for (let attempt = 0; attempt < 5; attempt += 1) await profile(coach.token, { password: "brand-new", currentPassword: `guess-${attempt}` });
  for (let attempt = 0; attempt < 4; attempt += 1) await login(coach.login, `guess-${attempt}`);
  assert.equal((await login(coach.login, coach.password)).status, 200);
  for (let attempt = 0; attempt < 9; attempt += 1) assert.equal((await login(coach.login, `again-${attempt}`)).status, 401, "eighteen, had the nine been kept");
  assert.equal((await profile(coach.token, { password: "brand-new", currentPassword: coach.password })).status, 200);
}));

test("an administrator cannot reset their own password by spelling their id another way: 409 for upper case, no route for no dashes, and nothing changes", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-regent", { admin: true }), elsewhere = await sessionFor(client, boss.id);
  const hash = async () => (await client.query("SELECT password_hash FROM users WHERE id = $1", [boss.id])).rows[0].password_hash;
  const sessions = async () => (await client.query("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [boss.id])).rows[0].n;
  const [before, count] = [await hash(), await sessions()];
  for (const spelling of [boss.id, boss.id.toUpperCase()]) {
    const refused = await callApi("POST", `/api/admin/users/${spelling}/reset-password`, { token: boss.token });
    assert.deepEqual([refused.status, refused.body.error.code], [409, "SELF_PASSWORD_RESET"], spelling);
  }
  // No dashes is no UUID the route takes (M8): no route, and so nothing reset.
  for (const spelling of [boss.id.replaceAll("-", ""), boss.id.toUpperCase().replaceAll("-", "")]) {
    const refused = await callApi("POST", `/api/admin/users/${spelling}/reset-password`, { token: boss.token });
    assert.deepEqual([refused.status, refused.body.error.code], [404, "ROUTE_NOT_FOUND"], spelling);
  }
  assert.deepEqual([await hash(), await sessions()], [before, count], "the password and the sessions are as they were");
  assert.equal((await login(boss.login, boss.password)).status, 200, "the old password still opens the account");
  assert.deepEqual([(await whoIs(boss.token)).login, (await whoIs(elsewhere)).login], [boss.login, boss.login]);
  // Someone else's id, spelled any way, is still the administrator's to reset.
  const coach = await seedCoach(client, "pw-quail"), phone = await sessionFor(client, coach.id);
  const reset = await callApi("POST", `/api/admin/users/${coach.id.toUpperCase()}/reset-password`, { token: boss.token });
  assert.equal(reset.status, 200);
  assert.equal((await login(coach.login, reset.body.password)).status, 200);
  assert.equal((await login(coach.login, coach.password)).status, 401);
  assert.deepEqual([await whoIs(coach.token), await whoIs(phone)], [null, null]);
}));

test("an administrator cannot delete their own account by spelling their id another way, and a spelling that is no UUID is no route", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-consul", { admin: true }), coach = await seedCoach(client, "pw-otter");
  const remove = (spelling) => callApi("DELETE", `/api/admin/users/${spelling}`, { token: boss.token });
  for (const spelling of [boss.id, boss.id.toUpperCase()]) {
    const refused = await recording(() => remove(spelling));
    assert.deepEqual([refused.result.status, refused.result.body.error.code], [409, "SELF_ADMIN_DELETE"], spelling);
    assert.ok(!refused.log.some((sql) => /^DELETE/.test(sql)), `${spelling}: nothing deleted`);
  }
  assert.deepEqual([(await remove(boss.id.replaceAll("-", ""))).body.error.code, (await whoIs(boss.token)).login], ["ROUTE_NOT_FOUND", boss.login]);
  assert.equal((await remove(coach.id.toUpperCase())).status, 200, "someone else's id, in capitals, is still theirs");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [coach.id])).rows[0].n, 0);
  assert.equal((await remove(NOBODY)).body.error.code, "USER_NOT_FOUND");
}));

test("deleting a user takes his teams' rows first, in one transaction, the order every writer of a team takes them in", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-praetor", { admin: true }), coach = await seedCoach(client, "pw-heron");
  await seedTeam(client, coach.id);
  await seedTeam(client, coach.id, { name: "Wolves" });
  const { result, log } = await recording(() => callApi("DELETE", `/api/admin/users/${coach.id}`, { token: boss.token }));
  assert.equal(result.status, 200);
  const at = (pattern) => log.findIndex((sql) => pattern.test(sql));
  const order = [/^BEGIN$/, /FROM saved_teams WHERE user_id = \$1 ORDER BY id FOR UPDATE$/, /^DELETE FROM users /, /^COMMIT$/].map(at);
  assert.ok(order.every((index) => index >= 0), log.join("\n"));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), log.join("\n"));
}));

for (const writerFirst of [true, false]) {
  test(`deleting a user while a writer of his team is under way, ${writerFirst ? "the writer" : "the delete"} first: no deadlock, both answered`, db, () => withApiDatabase(async (database) => {
    const { client } = database;
    const boss = await seedCoach(client, "pw-tribune", { admin: true }), coach = await seedCoach(client, "pw-vole"), id = await seedTeam(client, coach.id);
    const writing = () => callApi("POST", `/api/teams/${id}/treasury`, { token: coach.token, body: { delta: 5, reason: "sponsor", revision: 1 } });
    const deleting = () => callApi("DELETE", `/api/admin/users/${coach.id}`, { token: boss.token });
    const ended = answers(await raceInOrder(database, lockRow("saved_teams", id), ...(writerFirst ? [writing, deleting] : [deleting, writing])));
    const [written, deleted] = writerFirst ? ended : ended.reverse();
    assert.deepEqual([written.status, deleted.status], writerFirst ? [201, 200] : [404, 200], JSON.stringify([written.body, deleted.body]));
    assert.equal((await client.query("SELECT count(*)::int AS n FROM saved_teams WHERE id = $1", [id])).rows[0].n, 0);
  }));
}

test("two administrators deleting one user at once: the first deletes him, the second is told there is no such user", db, () => withApiDatabase(async (database) => {
  const { client } = database;
  const boss = await seedCoach(client, "pw-consul", { admin: true }), coach = await seedCoach(client, "pw-marten"), id = await seedTeam(client, coach.id);
  const deleting = () => callApi("DELETE", `/api/admin/users/${coach.id}`, { token: boss.token });
  const [first, second] = answers(await raceInOrder(database, lockRow("saved_teams", id), deleting, deleting));
  assert.deepEqual([first.status, second.status, second.body.error?.code], [200, 404, "USER_NOT_FOUND"], JSON.stringify([first.body, second.body]));
}));

test("an administrator's edit of a user who is deleted while it waits is 404, and writes nothing", db, () => withApiDatabase(async ({ client, url }) => {
  const boss = await seedCoach(client, "pw-legate", { admin: true }), coach = await seedCoach(client, "pw-shrew");
  const [answer] = answers(await withForcedOverlap(url, { lock: ["DELETE FROM users WHERE id = $1", [coach.id]], waiting: 1 },
    [() => callApi("PATCH", `/api/admin/users/${coach.id}`, { token: boss.token, body: { login: "pw-shrew-2", password: "set-by-admin" } })]));
  assert.deepEqual([answer.status, answer.body.error?.code], [404, "USER_NOT_FOUND"]);
}));

test("an id that is no UUID, in a coach's team route or an administrator's, is no route: 404, never a 500", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "pw-stoat"), boss = await seedCoach(client, "pw-censor", { admin: true });
  const team = { name: "Lions", baseTeamSlug: "teams/human", roster: {} };
  const { result, logged } = await loggingErrors(async () => {
    const all = [];
    for (const bad of ["abc", "0", "-", "deadbeef", "0000000000004000800000000000000a"]) {
      for (const [method, path, token, body] of [
        ["GET", `/api/teams/${bad}`, coach.token], ["PATCH", `/api/teams/${bad}`, coach.token, team], ["DELETE", `/api/teams/${bad}`, coach.token],
        ["GET", `/api/admin/users/${bad}`, boss.token], ["PATCH", `/api/admin/users/${bad}`, boss.token, {}], ["DELETE", `/api/admin/users/${bad}`, boss.token],
        ["POST", `/api/admin/users/${bad}/reset-password`, boss.token], ["POST", `/api/admin/users/${bad}/teams`, boss.token, team],
        ["GET", `/api/admin/teams/${bad}`, boss.token], ["PATCH", `/api/admin/teams/${bad}`, boss.token, team], ["DELETE", `/api/admin/teams/${bad}`, boss.token]]) {
        const { status, body: answer } = await callApi(method, path, { token, body });
        all.push([`${method} ${path}`, status, answer?.error?.code]);
      }
    }
    return all;
  });
  for (const [label, status, code] of result) assert.deepEqual([status, code], [404, "ROUTE_NOT_FOUND"], label);
  assert.deepEqual(logged, []);
}));

/** The login of the account the env file keeps (server/auth/admin-account.mjs), as the server reads it. */
const envAdminLogin = () => process.env.ADMIN_LOGIN || "admin";

test("the env file's administrator keeps the file's password: his settings, a user edit and a reset are 409 before any guess or write, and nothing changes", db, () => withApiDatabase(async ({ client }) => {
  const env = await seedCoach(client, envAdminLogin(), { admin: true }), boss = await seedCoach(client, "pw-envoy", { admin: true });
  const elsewhere = await sessionFor(client, env.id);
  const hash = async () => (await client.query("SELECT password_hash FROM users WHERE id = $1", [env.id])).rows[0].password_hash;
  const before = await hash();
  const asks = [
    ["his settings", () => profile(env.token, { password: "brand-new", currentPassword: env.password })],
    ["his settings, with a wrong current password", () => profile(env.token, { password: "brand-new", currentPassword: "wrong" })],
    ["another administrator's user edit", () => callApi("PATCH", `/api/admin/users/${env.id}`, { token: boss.token, body: { password: "set-by-admin" } })],
    ["his own user edit", () => callApi("PATCH", `/api/admin/users/${env.id}`, { token: env.token, body: { password: "set-by-admin" } })],
    ["a reset by another administrator", () => callApi("POST", `/api/admin/users/${env.id}/reset-password`, { token: boss.token })],
    ["a reset by himself", () => callApi("POST", `/api/admin/users/${env.id.toUpperCase()}/reset-password`, { token: env.token })],
  ];
  for (const [label, ask] of asks) {
    const { result, log } = await recording(ask);
    assert.deepEqual([result.status, result.body.error.code, result.body.error.message],
      [409, "ADMIN_PASSWORD_FROM_ENV", "This administrator's password is set in the server's settings and cannot be changed here."], label);
    assert.ok(!log.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)), `${label}: nothing written`);
  }
  for (let attempt = 0; attempt < 12; attempt += 1) await profile(env.token, { password: "brand-new", currentPassword: `guess-${attempt}` });
  assert.equal((await login(env.login, "wrong")).status, 401, "none of those was counted as a guess: no 429");
  assert.equal(await hash(), before);
  assert.equal((await login(env.login, env.password)).status, 200);
  assert.equal((await whoIs(elsewhere)).login, env.login, "and no session was ended");
  // What is not the password is his to change, like anybody's.
  const contact = await profile(env.token, { telegram: "@the-env-admin" });
  assert.deepEqual([contact.status, contact.body.user.telegram], [200, "@the-env-admin"]);
  assert.equal((await callApi("PATCH", `/api/admin/users/${env.id}`, { token: boss.token, body: { login: env.login } })).status, 200);
}));

test("any other administrator still changes his own password in settings, and is still reset by another", db, () => withApiDatabase(async ({ client }) => {
  const env = await seedCoach(client, envAdminLogin(), { admin: true }), deputy = await seedCoach(client, "pw-deputy", { admin: true });
  assert.equal((await profile(deputy.token, { password: "brand-new", currentPassword: deputy.password })).status, 200);
  assert.equal((await login(deputy.login, "brand-new")).status, 200);
  const reset = await callApi("POST", `/api/admin/users/${deputy.id}/reset-password`, { token: env.token });
  assert.equal(reset.status, 200);
  assert.equal((await login(deputy.login, reset.body.password)).status, 200);
  assert.equal((await callApi("PATCH", `/api/admin/users/${deputy.id}`, { token: env.token, body: { password: "set-by-env" } })).status, 200);
  assert.equal((await login(deputy.login, "set-by-env")).status, 200);
}));

test("the administrator's edit of a user is one transaction: a taken login leaves everything as it was, and a DELETE of the sessions that fails takes the new password with it", db, () => withApiDatabase(async ({ client }) => {
  const boss = await seedCoach(client, "pw-sheriff", { admin: true }), coach = await seedCoach(client, "pw-badger"), stranger = await seedCoach(client, "pw-ferret");
  const phone = await sessionFor(client, coach.id);
  const edit = (body) => callApi("PATCH", `/api/admin/users/${coach.id}`, { token: boss.token, body });
  const untouched = async (why) => {
    assert.equal((await login(coach.login, coach.password)).status, 200, `${why}: the old password still opens the account`);
    assert.equal((await login(coach.login, "set-by-admin")).status, 401, why);
    assert.equal((await whoIs(phone)).login, coach.login, `${why}: the other session is still signed in`);
  };
  const taken = await edit({ login: stranger.login, password: "set-by-admin" });
  assert.deepEqual([taken.status, taken.body.error.code], [409, "LOGIN_ALREADY_REGISTERED"]);
  await untouched("a taken login");
  // The database, not the route, refuses the second write: a session row cannot be deleted.
  await client.query("CREATE FUNCTION refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sessions are kept'; END $$");
  await client.query("CREATE TRIGGER keep_sessions BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION refuse_delete()");
  const { result, logged } = await loggingErrors(() => edit({ login: "pw-badger-2", password: "set-by-admin" }));
  assert.deepEqual([result.status, result.body.error.code], [500, "SERVER_ERROR"]);
  assert.match(String(logged[0]?.[0]?.message), /sessions are kept/, "it failed where the test broke it, on the sessions");
  await untouched("a failed DELETE");
  assert.equal((await whoIs(coach.token)).login, coach.login, "and the rename was rolled back with it");
}));

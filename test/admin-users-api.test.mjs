import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { teamBySlug } from "../server/domain/roster.mjs";
import { newBuild } from "../src/domain/roster/build.mjs";
import { callApi, seedCoach, seedTeam, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const NOBODY = "44444444-4444-4444-8444-444444444444";

/** The login of the account the env file keeps (server/auth/admin-account.mjs), as the server reads it. */
const envAdminLogin = () => process.env.ADMIN_LOGIN || "admin";

const count = async (client, table) => (await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const counts = async (client) => (await client.query(`SELECT (SELECT count(*) FROM users)::int AS users,
  (SELECT count(*) FROM saved_teams)::int AS saved_teams, (SELECT count(*) FROM season_entries)::int AS season_entries,
  (SELECT count(*) FROM seasons)::int AS seasons, (SELECT count(*) FROM sessions)::int AS sessions`)).rows[0];
const create = (token, body) => callApi("POST", "/api/admin/coaches", { token, body });
const coachPage = async (token, userId) => (await callApi("GET", `/api/admin/users/${userId}`, { token })).body;

/** The running season, made when there is none. */
async function activeSeason(client) {
  const { rows } = await client.query("SELECT id FROM seasons WHERE status = 'active'");
  if (rows[0]) return rows[0].id;
  return (await client.query("INSERT INTO seasons (name, status) VALUES ('Season 1', 'active') RETURNING id")).rows[0].id;
}

/** The team's entry in the running season, its coach's; withdrawn when asked. */
async function enterSeason(client, teamId, { withdrawn = false } = {}) {
  const season = await activeSeason(client);
  const { rows: [team] } = await client.query("SELECT user_id FROM saved_teams WHERE id = $1", [teamId]);
  return (await client.query(
    "INSERT INTO season_entries (season_id, user_id, saved_team_id, withdrawn_at) VALUES ($1, $2, $3, $4) RETURNING id",
    [season, team.user_id, teamId, withdrawn ? new Date() : null])).rows[0].id;
}

/** A round of the running season, started, and a pairing in it: `result` is `confirmed` or `pending`; no away entry is a bye. */
async function leaguePairing(client, { round, table, home, away = null, result = "confirmed" }) {
  await client.query(`INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id, result_status,
    home_touchdowns, away_touchdowns, home_casualties, away_casualties) VALUES ($1, $2, $3, $4, $5, 1, 0, 0, 0)`,
  [round, table, home, away, result]);
}

/** A friendly of two coaches' teams: confirmed 1–0, or still pending. */
async function friendly(client, table, [homeUser, homeTeam], [awayUser, awayTeam], result = "pending") {
  const scored = result === "confirmed";
  await client.query(`INSERT INTO season_pairings (match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, result_status, home_touchdowns, away_touchdowns, home_casualties, away_casualties)
    VALUES ('friendly', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [table, homeUser, awayUser, homeTeam, awayTeam, result, ...(scored ? [1, 0, 0, 0] : [null, null, null, null])]);
}

/** A session of `userId` that began `ago` and ends `in` (an interval; negative — it has ended), its start as stored. */
async function sessionAt(client, userId, ago, ends) {
  const { rows } = await client.query(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
     VALUES ($1, $2, now() - $3::interval, now() + $4::interval) RETURNING created_at`,
    [randomBytes(16).toString("hex"), userId, ago, ends]);
  return rows[0].created_at;
}

test("a coach with a season entry is not deleted: 409, not a 500", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc");
  await enterSeason(client, await seedTeam(client, coach.id));
  const answer = await callApi("DELETE", `/api/admin/users/${coach.id}`, { token: await sessionFor(client, admin.id) });
  assert.equal(answer.status, 409);
  assert.equal(answer.body.error.code, "USER_IN_SEASON");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [coach.id])).rows[0].n, 1);
}));

test("a season history is any entry, a withdrawn one too: refused, his team and entry kept; a coach with none is deleted with his teams", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), left = await seedCoach(client, "gone-orc"), fresh = await seedCoach(client, "fresh");
  const team = await seedTeam(client, left.id);
  await enterSeason(client, team, { withdrawn: true });
  await seedTeam(client, fresh.id, { stage: "draft" });
  const before = await counts(client);
  const refused = await callApi("DELETE", `/api/admin/users/${left.id}`, { token: admin.token });
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.message],
    [409, "USER_IN_SEASON", "This coach has a team with a season history and cannot be deleted."]);
  assert.deepEqual(await counts(client), before, "nothing deleted: the coach, his team, the entry");
  const deleted = await callApi("DELETE", `/api/admin/users/${fresh.id}`, { token: admin.token });
  assert.deepEqual([deleted.status, deleted.body], [200, { ok: true }]);
  assert.deepEqual([await count(client, "users"), await count(client, "saved_teams")], [before.users - 1, before.saved_teams - 1]);
}));

test("a coach with a team, at one stroke: the account with a temporary password, a draft team of 600k, the entry when asked", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true });
  const made = await create(admin.token, { login: " Mud Boss ", telegram: " @mud_boss ", teamName: " Mudfoot Boyz ", baseTeamSlug: "teams/chaos-chosen", enter: true });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const { user, team, password, entryId } = made.body;
  assert.match(password, /^[A-Za-z0-9_-]{16}$/, "16 characters of base64url");
  assert.deepEqual([user.login, user.telegram, user.isAdmin, user.savedTeamCount, user.draftTeamCount, user.managedByServer],
    ["Mud Boss", "@mud_boss", false, 1, 1, false]);
  assert.deepEqual([team.name, team.baseTeamSlug, team.stage, team.inActiveSeason, team.roster.treasury, team.roster.players],
    ["Mudfoot Boyz", "teams/chaos-chosen", "draft", true, 600, []]);
  // The builder's draft of the race (L22): named, its first league and its first favoured.
  const draft = newBuild(teamBySlug("teams/chaos-chosen"));
  assert.ok(draft.selectedLeague && draft.favouredChoice, "the race has both, or this test says nothing");
  assert.deepEqual([team.roster.teamName, team.roster.selectedLeague, team.roster.favouredChoice, team.roster.teamSlug],
    ["Mudfoot Boyz", draft.selectedLeague, draft.favouredChoice, "teams/chaos-chosen"]);
  const { rows: [entry] } = await client.query(
    "SELECT e.id, e.user_id, e.withdrawn_at, s.status FROM season_entries e JOIN seasons s ON s.id = e.season_id WHERE e.saved_team_id = $1", [team.id]);
  assert.deepEqual([entry.id, entry.user_id, entry.withdrawn_at, entry.status], [entryId, user.id, null, "active"]);
  const { rows: [stored] } = await client.query("SELECT password_hash, is_admin FROM users WHERE id = $1", [user.id]);
  assert.ok(stored.password_hash.startsWith("scrypt:") && !stored.password_hash.includes(password), "only its hash is kept");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [user.id])).rows[0].n, 0, "the coach is given no session");
  assert.equal((await callApi("GET", "/api/auth/me", { token: admin.token })).body.user.id, admin.id, "the admin's own session goes on");
  assert.equal((await callApi("POST", "/api/auth/login", { body: { login: "mud boss", password } })).status, 200, "the coach signs in with it");
  assert.doesNotMatch(JSON.stringify(await coachPage(admin.token, user.id)), new RegExp(password), "the password is in the creation's answer only");

  const quiet = await create(admin.token, { login: "lone_orc", telegram: "@lone_orc", teamName: "Lone Boyz", baseTeamSlug: "teams/orc", enter: false });
  assert.deepEqual([quiet.status, quiet.body.entryId, quiet.body.team.stage, quiet.body.team.inActiveSeason], [201, null, "draft", false]);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM season_entries WHERE saved_team_id = $1", [quiet.body.team.id])).rows[0].n, 0);
  assert.notEqual(quiet.body.password, password, "each coach his own");
}));

test("a login taken, a short one, no Telegram, no team name, an unknown race: refused, nothing written, no season made", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true });
  await seedCoach(client, "orc");
  const valid = { login: "warboss", telegram: "@warboss", teamName: "Grimtusk Raiders", baseTeamSlug: "teams/orc", enter: true };
  const before = await counts(client);
  for (const [change, status, code, params] of [
    [{ login: " ORC " }, 409, "LOGIN_ALREADY_REGISTERED", {}],
    [{ login: " ab " }, 400, "LOGIN_TOO_SHORT", {}],
    [{ telegram: "   " }, 400, "TELEGRAM_REQUIRED", {}],
    [{ teamName: "  " }, 400, "TEAM_NAME_REQUIRED", {}],
    [{ baseTeamSlug: "teams/nobody" }, 400, "FIELD_INVALID", { field: "baseTeamSlug" }],
    [{ baseTeamSlug: undefined }, 400, "FIELD_INVALID", { field: "baseTeamSlug" }],
    [{ baseTeamSlug: ["teams/orc"] }, 400, "FIELD_INVALID", { field: "baseTeamSlug" }],
  ]) {
    const answer = await create(admin.token, { ...valid, ...change });
    assert.deepEqual([answer.status, answer.body.error?.code, answer.body.error?.params], [status, code, params], JSON.stringify(change));
  }
  assert.deepEqual(await counts(client), before, "no coach, no team, no entry, no season");
}));

test("the coach's page says the last sign-in, why he cannot be deleted, each team's stage and history", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true });
  const orc = await seedCoach(client, "orc"), troll = await seedCoach(client, "troll"), elf = await seedCoach(client, "elf"), lone = await seedCoach(client, "lone");
  const raiders = await seedTeam(client, orc.id, { name: "Raiders" }), boyz = await seedTeam(client, orc.id, { name: "Boyz" });
  const fresh = await seedTeam(client, orc.id, { name: "Fresh", stage: "draft" });
  const trolls = await seedTeam(client, troll.id, { name: "Trolls" }), elves = await seedTeam(client, elf.id, { name: "Elves" });
  const [raidersEntry, trollsEntry] = [await enterSeason(client, raiders), await enterSeason(client, trolls)];
  const { rows: [{ id: round }] } = await client.query(
    "INSERT INTO season_rounds (season_id, round_number, status) VALUES ($1, 1, 'started') RETURNING id", [await activeSeason(client)]);
  await leaguePairing(client, { round, table: 1, home: raidersEntry, away: trollsEntry });
  await leaguePairing(client, { round, table: 2, home: raidersEntry, away: trollsEntry, result: "pending" });
  await leaguePairing(client, { round, table: 3, home: raidersEntry }); // a bye with its result: no match
  await friendly(client, 1, [orc.id, raiders], [troll.id, trolls], "confirmed");
  await friendly(client, 2, [orc.id, boyz], [elf.id, elves]);
  // His sign-ins: the seeded one long ago, one yesterday, and a later one that has ended (it says nothing true now).
  await client.query("UPDATE sessions SET created_at = now() - interval '5 days' WHERE user_id = $1", [orc.id]);
  const yesterday = await sessionAt(client, orc.id, "1 day", "29 days");
  await sessionAt(client, orc.id, "2 hours", "-1 hour");
  await client.query("DELETE FROM sessions WHERE user_id = $1", [lone.id]);
  await sessionAt(client, lone.id, "3 days", "-1 day");

  const page = await coachPage(admin.token, orc.id);
  assert.deepEqual([page.user.login, page.user.deleteBlock, page.user.managedByServer, page.user.savedTeamCount, page.user.draftTeamCount],
    ["orc", "season", false, 3, 1]);
  assert.equal(new Date(page.user.lastLoginAt).getTime(), yesterday.getTime(), "the newest live session");
  const teams = Object.fromEntries(page.teams.map((team) => [team.name, [team.stage, team.inActiveSeason, team.matches, team.friendlies, team.deleteBlock]]));
  assert.deepEqual(teams, {
    Raiders: ["active", true, 2, 1, "season"], // the league match and the friendly, confirmed; not the pending one, not the bye
    Boyz: ["active", false, 0, 1, "friendly"],
    Fresh: ["draft", false, 0, 0, null],
  });
  assert.equal(page.teams.find((team) => team.name === "Fresh").id, fresh);
  assert.equal(page.teams[0].logoData, null, "a summary, no logo");

  assert.equal((await coachPage(admin.token, elf.id)).user.deleteBlock, "friendly");
  const alone = (await coachPage(admin.token, lone.id)).user;
  assert.deepEqual([alone.deleteBlock, alone.lastLoginAt, alone.draftTeamCount], [null, null, 0], "no live session: no last sign-in");
  assert.deepEqual((await coachPage(admin.token, lone.id)).teams, []);
  assert.equal((await coachPage(admin.token, admin.id)).user.deleteBlock, "self", "the admin's own page");
  const missing = await callApi("GET", `/api/admin/users/${NOBODY}`, { token: admin.token });
  assert.deepEqual([missing.status, missing.body.error.code], [404, "USER_NOT_FOUND"]);
}));

test("the list counts each coach's draft teams and names the server's admin", db, () => withApiDatabase(async ({ client }) => {
  const server = await seedCoach(client, envAdminLogin(), { admin: true }), deputy = await seedCoach(client, "deputy", { admin: true });
  const coach = await seedCoach(client, "orc");
  await seedTeam(client, coach.id, { name: "One", stage: "draft" });
  await seedTeam(client, coach.id, { name: "Two", stage: "draft" });
  await seedTeam(client, coach.id, { name: "Three" });
  const { status, body } = await callApi("GET", "/api/admin/users", { token: deputy.token });
  assert.equal(status, 200);
  const rows = Object.fromEntries(body.users.map((user) => [user.id, [user.savedTeamCount, user.draftTeamCount, user.managedByServer]]));
  assert.deepEqual(rows, { [server.id]: [0, 0, true], [deputy.id]: [0, 0, false], [coach.id]: [3, 2, false] });
  // Another admin does not delete the server's: its page says why, and the delete is refused (every start writes it back).
  assert.equal((await coachPage(deputy.token, server.id)).user.deleteBlock, "server");
  const refused = await callApi("DELETE", `/api/admin/users/${server.id}`, { token: deputy.token });
  assert.deepEqual([refused.status, refused.body.error?.code], [409, "ADMIN_PROFILE_FROM_ENV"]);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [server.id])).rows[0].n, 1, "still there");
}));

test("an admin's team for a coach is a draft", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc");
  const body = { name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", roster: { teamSlug: "teams/orc", treasury: 600, players: [] } };
  const made = await callApi("POST", `/api/admin/users/${coach.id}/teams`, { token: admin.token, body });
  assert.deepEqual([made.status, made.body.team.stage, made.body.user.id], [201, "draft", coach.id]);
  assert.equal((await client.query("SELECT stage FROM saved_teams WHERE id = $1", [made.body.team.id])).rows[0].stage, "draft");
}));

test("a coach's public page says each team's stage, and nothing only the admin reads", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "orc"), reader = await seedCoach(client, "troll");
  await seedTeam(client, coach.id, { name: "Fresh", stage: "draft" });
  const { status, body } = await callApi("GET", `/api/players/${coach.id}`, { token: reader.token });
  assert.equal(status, 200);
  assert.deepEqual(body.teams.map((team) => [team.name, team.stage]), [["Fresh", "draft"]]);
  for (const field of ["draftTeamCount", "lastLoginAt", "managedByServer", "deleteBlock"]) assert.ok(!(field in body.user), field);
}));

test("every admin route refuses a coach and a guest", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "orc"), other = await seedCoach(client, "troll");
  const valid = { login: "warboss", telegram: "@warboss", teamName: "Grimtusk Raiders", baseTeamSlug: "teams/orc", enter: true };
  const before = await counts(client);
  for (const [method, path, body] of [
    ["GET", "/api/admin/users"], ["GET", `/api/admin/users/${other.id}`],
    ["POST", "/api/admin/coaches", valid], ["DELETE", `/api/admin/users/${other.id}`],
  ]) {
    const asCoach = await callApi(method, path, { token: coach.token, body });
    assert.deepEqual([asCoach.status, asCoach.body.error?.code], [403, "ADMIN_REQUIRED"], `${method} ${path} as a coach`);
    const asGuest = await callApi(method, path, { body });
    assert.deepEqual([asGuest.status, asGuest.body.error?.code], [401, "NOT_AUTHORIZED"], `${method} ${path} as a guest`);
  }
  assert.deepEqual(await counts(client), before);
}));

test("the season's coach routes of 2.x are gone", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc");
  const before = await counts(client);
  for (const [path, body] of [
    ["/api/season/admin/coaches", { login: "newcoach", password: "newcoach-pw", telegram: "@newcoach", name: "New", baseTeamSlug: "teams/orc", roster: {} }],
    ["/api/season/admin/create-team", { userId: coach.id, name: "New", baseTeamSlug: "teams/orc", roster: {} }],
  ]) {
    const answer = await callApi("POST", path, { token: admin.token, body });
    assert.deepEqual([answer.status, answer.body.error.code], [404, "ROUTE_NOT_FOUND"], path);
  }
  assert.deepEqual(await counts(client), before);
}));

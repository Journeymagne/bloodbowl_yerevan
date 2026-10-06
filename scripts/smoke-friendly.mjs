/** Local-only end-to-end API check. Removes only its own disposable fixtures. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, databaseUrl } from "../server/db/pool.mjs";
import { hashPassword } from "../server/auth/session.mjs";

const base = process.env.SMOKE_BASE_URL || "http://localhost:3003";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)
  || !["localhost", "127.0.0.1", "postgres"].includes(new URL(databaseUrl).hostname)) throw new Error("This check requires a local site and database.");
const tokens = {}, users = {}, teams = {}, challengeIds = [], gameIds = [];
let outsiderId, gameId, payload, seasonBefore;
const stamp = randomUUID();

async function request(side, path, body, method = "GET") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json",
    ...(tokens[side] ? { Authorization: `Bearer ${tokens[side]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}

async function error(side, path, body, code, status = 409, method = "POST") {
  const result = await request(side, path, body, method);
  assert.equal(result.status, status, JSON.stringify(result.data)); assert.equal(result.data.error.code, code);
}

async function createFixtures() {
  seasonBefore = (await request(null, "/api/season")).data;
  for (const side of ["home", "away"]) {
    const login = await request(null, "/api/auth/login", { login: `preview-${side}`, password: "preview2026" }, "POST");
    assert.equal(login.status, 200); tokens[side] = login.data.token; users[side] = login.data.user.id;
    const name = side === "home" ? "Yerevan Lions" : "Drunken Rune Guard";
    const source = (await pool.query("SELECT * FROM saved_teams WHERE user_id=$1 AND name=$2", [users[side], name])).rows[0];
    assert.ok(source, "Run npm run preview:seed first.");
    teams[side] = (await pool.query("INSERT INTO saved_teams(user_id,name,base_team_slug,roster) VALUES($1,$2,$3,$4) RETURNING id",
      [users[side], `Friendly smoke ${side} ${stamp}`, source.base_team_slug, JSON.stringify({ ...source.roster, treasury: 150 })])).rows[0].id;
  }
  const login = `friendly-smoke-${stamp}`;
  outsiderId = (await pool.query("INSERT INTO users(login,login_key,telegram,password_hash) VALUES($1,$1,$2,$3) RETURNING id",
    [login, "@friendly-smoke", hashPassword(stamp)])).rows[0].id;
  tokens.outsider = (await request(null, "/api/auth/login", { login, password: stamp }, "POST")).data.token;
}

async function invite(side = "home", opponent = "away") {
  const result = await request(side, "/api/challenges", { opponentId: users[opponent], teamId: teams[side] }, "POST");
  assert.equal(result.status, 201, JSON.stringify(result.data)); challengeIds.push(result.data.id); return result.data.id;
}

async function verifyChallenges() {
  assert.equal((await request(null, "/api/challenges")).status, 401);
  await error("home", "/api/challenges", { opponentId: users.home, teamId: teams.home }, "CHALLENGE_SELF", 400);
  await error("home", "/api/challenges", { opponentId: users.away, teamId: teams.away }, "TEAM_NOT_FOUND", 404);
  await error("home", "/api/challenges", { opponentId: outsiderId, teamId: teams.home }, "CHALLENGE_OPPONENT_UNAVAILABLE", 404);
  await error("home", "/api/challenges", { opponentId: "bad-id", teamId: teams.home }, "CHALLENGE_SELECTION_REQUIRED", 400);
  const id = await invite(), path = `/api/challenges/${id}`;
  await error("home", "/api/challenges", { opponentId: users.away, teamId: teams.home }, "CHALLENGE_ALREADY_SENT");
  for (const side of ["home", "away"]) assert.equal((await request(side, "/api/challenges")).data.challenges.find(c => c.id === id).status, "pending");
  assert.ok(!(await request("outsider", "/api/challenges")).data.challenges.some(c => c.id === id));
  for (const [side, action] of [["home", "accept"], ["home", "decline"], ["away", "cancel"], ["outsider", "accept"]]) {
    await error(side, `${path}/${action}`, { teamId: teams.away }, "CHALLENGE_NOT_YOURS", 403);
  }
  await error("away", `${path}/accept`, { teamId: teams.home }, "TEAM_NOT_FOUND", 404);
  const accepted = await Promise.all([1, 2].map(() => request("away", `${path}/accept`, { teamId: teams.away }, "POST")));
  assert.ok(accepted.every(r => r.status === 200), JSON.stringify(accepted));
  gameId = accepted[0].data.gameId; gameIds.push(gameId);
  assert.equal(accepted[1].data.gameId, gameId);
  assert.equal((await request("away", `${path}/accept`, {}, "POST")).data.gameId, gameId);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM friendly_challenges WHERE id=$1 AND pairing_id=$2", [id, gameId])).rows[0].n, 1);
  for (const [action, side] of [["decline", "away"], ["cancel", "home"]]) {
    const another = await invite();
    assert.equal((await request(side, `/api/challenges/${another}/${action}`, {}, "POST")).status, 200);
    await error("away", `/api/challenges/${another}/accept`, { teamId: teams.away }, "CHALLENGE_CLOSED");
  }
}

async function change(side, action) {
  const result = await request(side, `/api/games/${gameId}/preparation`, { revision: payload.preparation.revision, action }, "PATCH");
  assert.equal(result.status, 200, JSON.stringify(result.data)); payload = result.data;
}

async function prepareAndStart() {
  for (const side of ["home", "away"]) {
    const game = (await request(side, `/api/games/${gameId}`)).data.game;
    assert.equal(game.kind, "friendly"); assert.equal(game.season, null);
    assert.ok((await request(side, "/api/games")).data.games.some(g => g.id === gameId));
  }
  await error("outsider", `/api/games/${gameId}`, null, "GAME_NOT_FOUND", 404, "GET");
  await error("outsider", `/api/games/${gameId}/preparation`, null, "FIXTURE_NOT_YOURS", 403, "GET");
  await error("home", `/api/teams/${teams.home}`, null, "TEAM_IN_FRIENDLY_GAMES", 409, "DELETE");
  payload = (await request("home", `/api/games/${gameId}/preparation`)).data;
  assert.equal(payload.fixture.kind, "friendly"); assert.equal(payload.fixture.closed, false);
  await change("home", { type: "fans", value: 2 }); await change("away", { type: "fans", value: 2 });
  await change("home", { type: "weather", season: "Autumn", home: 3, away: 4 });
  for (let n = 0; n < 2; n++) await change("home", { type: "add-journeyman", rowIndex: 0 });
  await change("home", { type: "lock-roster" }); await change("away", { type: "lock-roster" });
  await change("away", { type: "basket", id: "bloodweiser-keg", quantity: 1 }); await change("away", { type: "lock-basket" });
  for (const id of ["star:griff-oberwald", "hired-wizard", "additional-training", "nuffles-prayers"]) await change("home", { type: "basket", id, quantity: 1 });
  await change("home", { type: "effects", effects: { prayers: [{ roll: 4, targets: [payload.preparation.home.players[0].id] }] } });
  await change("home", { type: "lock-basket" });
  await change("home", { type: "confirm" }); await change("away", { type: "confirm" });
  const starts = await Promise.all(["home", "away"].map(side => request(side, `/api/games/${gameId}/start`, { revision: payload.preparation.revision }, "POST")));
  assert.ok(starts.every(r => r.status === 200), JSON.stringify(starts));
  payload = starts[0].data;
  assert.deepEqual(starts[1].data.snapshots, payload.snapshots);
  assert.equal(payload.snapshots.home.players.length, 8); assert.equal(payload.snapshots.home.players[0].stats.ar, "10+");
  assert.equal(payload.snapshots.home.budget.treasuryUsed, 50); assert.equal(payload.snapshots.away.budget.treasuryUsed, 40);
  for (const side of ["home", "away"]) {
    const roster = (await pool.query("SELECT roster FROM saved_teams WHERE id=$1", [teams[side]])).rows[0].roster;
    assert.equal(roster.treasury, side === "home" ? 100 : 110); assert.equal(roster.players.length, side === "home" ? 7 : 9);
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM match_treasury_spends WHERE pairing_id=$1", [gameId])).rows[0].n, 2);
}

async function verifyResults() {
  const path = `/api/games/${gameId}`, result = { homeTouchdowns: 4, awayTouchdowns: 0, homeCasualties: 3, awayCasualties: 0 };
  assert.equal((await request("home", `${path}/propose`, result, "POST")).status, 200);
  await error("home", `${path}/confirm`, {}, "PROPOSER_CANNOT_CONFIRM");
  const confirmed = await request("away", `${path}/confirm`, {}, "POST");
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  const game = confirmed.data.game;
  assert.equal(game.resultStatus, "confirmed"); assert.equal(game.homePoints, 0); assert.equal(game.awayPoints, 0);
  assert.equal(game.homeTouchdowns, 4); assert.equal(game.homeCasualties, 3);
  await assert.rejects(pool.query("UPDATE season_pairings SET home_points=6 WHERE id=$1", [gameId]), { code: "23514" });
  assert.equal((await request("home", `${path}/preparation`)).data.fixture.closed, true);
  assert.deepEqual((await request(null, "/api/season")).data, seasonBefore, "Friendly games must not affect the league table or schedule.");
  console.log("Friendly API smoke passed: challenge permissions, decline/cancel, concurrent and repeat acceptance, shared checklist/start, treasury, result agreement, zero LP and unchanged season.");
}

try { await createFixtures(); await verifyChallenges(); await prepareAndStart(); await verifyResults(); }
finally {
  // A failed HTTP assertion after a commit can still leave a pairing: discover only this run's challenges.
  if (challengeIds.length) {
    const rows = (await pool.query("SELECT pairing_id FROM friendly_challenges WHERE id=ANY($1::uuid[]) AND pairing_id IS NOT NULL", [challengeIds])).rows;
    gameIds.push(...rows.map(row => row.pairing_id));
  }
  if (gameIds.length) await pool.query("DELETE FROM season_pairings WHERE id=ANY($1::uuid[])", [gameIds]);
  if (challengeIds.length) await pool.query("DELETE FROM friendly_challenges WHERE id=ANY($1::uuid[])", [challengeIds]);
  if (Object.values(teams).length) await pool.query("DELETE FROM saved_teams WHERE id=ANY($1::uuid[])", [Object.values(teams)]);
  for (const side of Object.keys(tokens)) await request(side, "/api/auth/logout", {}, "POST").catch(() => {});
  if (outsiderId) await pool.query("DELETE FROM users WHERE id=$1", [outsiderId]);
  await pool.end();
}

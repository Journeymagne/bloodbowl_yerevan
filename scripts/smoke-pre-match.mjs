/** Local-only integration exercise. Deletes only the fixtures it creates. */
import assert from "node:assert/strict";
import { pool, databaseUrl } from "../server/db/pool.mjs";

const base = process.env.SMOKE_BASE_URL || "http://localhost:3003";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)
  || !["localhost", "127.0.0.1", "postgres"].includes(new URL(databaseUrl).hostname)) throw new Error("This smoke test requires a local site and database.");
const tokens = {}, teams = [];
let seasonId, gameId, payload;

async function request(side, path, body, method = "GET") {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json",
    ...(tokens[side] ? { Authorization: `Bearer ${tokens[side]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}

async function expectError(side, action, code, status = 409, extra = {}) {
  const result = await request(side, `/api/games/${gameId}/preparation`, { revision: payload.preparation.revision, action, ...extra }, "PATCH");
  assert.equal(result.status, status); assert.equal(result.data.error.code, code);
}

async function change(side, action) {
  const result = await request(side, `/api/games/${gameId}/preparation`, { revision: payload.preparation.revision, action }, "PATCH");
  assert.equal(result.status, 200, JSON.stringify(result.data)); payload = result.data;
}

async function createFixture() {
  const season = await pool.query("INSERT INTO seasons (name,status,current_round) VALUES ('Pre-match smoke','preview-test',1) RETURNING id");
  seasonId = season.rows[0].id;
  const entries = {};
  for (const side of ["home", "away"]) {
    const login = await request(null, "/api/auth/login", { login: `preview-${side}`, password: "preview2026" }, "POST");
    assert.equal(login.status, 200); tokens[side] = login.data.token;
    const name = side === "home" ? "Yerevan Lions" : "Drunken Rune Guard";
    const source = (await pool.query("SELECT * FROM saved_teams WHERE user_id=$1 AND name=$2", [login.data.user.id, name])).rows[0];
    assert.ok(source, "Run scripts/seed-pre-match-preview.mjs first.");
    const roster = { ...structuredClone(source.roster), treasury: 150.5 };
    roster.players[0].purchased = true; roster.players[0].purchaseRefund = 50;
    const team = (await pool.query("INSERT INTO saved_teams (user_id,name,base_team_slug,roster) VALUES ($1,$2,$3,$4) RETURNING id",
      [source.user_id, `Smoke ${side} ${seasonId}`, source.base_team_slug, JSON.stringify(roster)])).rows[0];
    teams.push(team.id);
    entries[side] = (await pool.query("INSERT INTO season_entries (season_id,user_id,saved_team_id) VALUES ($1,$2,$3) RETURNING id", [seasonId, source.user_id, team.id])).rows[0].id;
  }
  const round = (await pool.query("INSERT INTO season_rounds (season_id,round_number,status) VALUES ($1,1,'started') RETURNING id", [seasonId])).rows[0].id;
  gameId = (await pool.query("INSERT INTO season_pairings (round_id,table_number,home_entry_id,away_entry_id) VALUES ($1,1,$2,$3) RETURNING id", [round, entries.home, entries.away])).rows[0].id;
  payload = (await request("home", `/api/games/${gameId}/preparation`)).data;
}

async function prepareMatch() {
  assert.equal((await request(null, `/api/games/${gameId}/preparation`)).status, 401);
  await expectError("home", { type: "fans", value: 2 }, "FIXTURE_NOT_YOURS", 403, { side: "away" });
  await expectError("home", { type: "basket", id: "bloodweiser-keg", quantity: 1 }, "MATCH_WAIT");
  const revision = payload.preparation.revision;
  const race = await Promise.all(["home", "away"].map(side => request(side, `/api/games/${gameId}/preparation`, { revision, action: { type: "fans", value: 2 } }, "PATCH")));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  assert.equal(race.find(result => result.status === 409).data.error.code, "MATCH_REVISION");
  payload = (await request("home", `/api/games/${gameId}/preparation`)).data;
  for (const side of ["home", "away"]) if (!payload.preparation[side].fansRoll) await change(side, { type: "fans", value: 2 });
  await change("home", { type: "weather", season: "Autumn", home: 3, away: 4 });
  await pool.query("UPDATE saved_teams SET revision=revision+1 WHERE id=$1", [teams[0]]);
  await expectError("home", { type: "lock-roster" }, "MATCH_ROSTER_CHANGED");
  payload = (await request("home", `/api/games/${gameId}/preparation`)).data;
  assert.equal(payload.preparation.home.fansRoll, 2); assert.equal(payload.preparation.weather.home, 3);
  await change("home", { type: "lock-roster" });
  assert.equal(payload.preparation.home.rosterLocked, true, "A short roster may be locked without journeymen.");
  await change("home", { type: "reopen" });
  for (let i = 0; i < 2; i++) await change("home", { type: "add-journeyman", rowIndex: 0 });
  await change("home", { type: "lock-roster" }); await change("away", { type: "lock-roster" });
  await expectError("home", { type: "basket", id: "bloodweiser-keg", quantity: 1 }, "MATCH_WAIT");
  await change("away", { type: "basket", id: "bloodweiser-keg", quantity: 2 }); await change("away", { type: "lock-basket" });
  for (const id of ["star:griff-oberwald", "hired-wizard", "additional-training", "nuffles-prayers"]) await change("home", { type: "basket", id, quantity: 1 });
  await expectError("home", { type: "lock-basket" }, "MATCH_EFFECTS");
  await change("home", { type: "effects", effects: { prayers: [{ roll: 4, targets: [payload.preparation.home.players[0].id] }] } });
  await change("home", { type: "lock-basket" });
  await expectError("home", { type: "rolloff", value: 6 }, "MATCH_ACTION");
}

async function verifyStart() {
  const path = `/api/games/${gameId}/start`;
  const premature = await request("home", path, { revision: payload.preparation.revision }, "POST");
  assert.equal(premature.data.error.code, "MATCH_WAIT");
  await change("home", { type: "confirm" }); await change("away", { type: "confirm" });
  const before = (await pool.query("SELECT id,revision,roster FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id", [teams])).rows;
  assert.ok(before.every(team => team.roster.treasury === 150.5), "Drafts and confirmations never spend treasury.");
  assert.ok(before.every(team => team.roster.players[0].purchaseRefund === 50), "Drafts retain cancellation rights.");
  const revision = payload.preparation.revision;
  const starts = await Promise.all(["home", "away"].map(side => request(side, path, { revision }, "POST")));
  assert.ok(starts.every(result => result.status === 200), JSON.stringify(starts));
  payload = starts[0].data;
  assert.equal(payload.preparation.status, "in_progress");
  assert.equal(payload.snapshots.home.players.length, 8);
  assert.equal(payload.snapshots.home.players[0].stats.ar, "10+");
  assert.equal(payload.snapshots.home.budget.treasuryUsed, 10);
  assert.equal(payload.snapshots.away.budget.treasuryUsed, 80);
  const saved = (await pool.query("SELECT id,roster FROM saved_teams WHERE id=ANY($1::uuid[])", [teams])).rows;
  assert.equal(saved.find(team => team.id === teams[0]).roster.treasury, 140.5);
  assert.equal(saved.find(team => team.id === teams[1]).roster.treasury, 70.5);
  assert.equal(saved.find(team => team.id === teams[0]).roster.players.length, 7);
  assert.ok(saved.every(team => team.roster.players.every(player => !Object.hasOwn(player, 'purchaseRefund'))), "Start seals player purchases.");
  const ledger = await pool.query("SELECT count(*)::int AS count FROM match_treasury_spends WHERE pairing_id=$1", [gameId]);
  assert.equal(ledger.rows[0].count, 2);
  const again = await request("home", path, { revision }, "POST");
  assert.equal(again.status, 200); assert.deepEqual(again.data.snapshots, payload.snapshots);
  const after = (await pool.query("SELECT id,revision,roster FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id", [teams])).rows;
  assert.ok(after.every(team => team.revision === before.find(item => item.id === team.id).revision + 1));
  assert.deepEqual((await pool.query("SELECT id,roster FROM saved_teams WHERE id=ANY($1::uuid[])", [teams])).rows, saved);
  await expectError("home", { type: "fans", value: 1 }, "MATCH_STARTED");
  console.log("Pre-match API smoke passed: authorization, revision conflicts, phase order, roster refresh, effects, snapshots, fractional balances, drafts without spending and atomic/idempotent treasury spending.");
}

try { await createFixture(); await prepareMatch(); await verifyStart(); }
finally {
  if (seasonId) await pool.query("DELETE FROM seasons WHERE id=$1", [seasonId]);
  if (teams.length) await pool.query("DELETE FROM saved_teams WHERE id=ANY($1::uuid[])", [teams]);
  for (const side of Object.keys(tokens)) await request(side, "/api/auth/logout", {}, "POST").catch(() => {});
  await pool.end();
}

import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { loadTeamReference, teamBySlug } from "../server/domain/roster.mjs";
import { tabletopTeam, createTeamSource } from "../server/play/teams.mjs";
import { createPlayHandler } from "../server/play/handler.mjs";
import { createMatch, onPitch } from "../src/play/model.mjs";
import { autoSetup } from "../src/play/lineup.mjs";
import { openingLineup } from "../src/play/squads.mjs";
import { applyCommand } from "../src/play/engine.mjs";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const rows = ids.map((id, side) => ({ id, name: side ? "Away <team>" : "Home team", coach: "Coach",
  base_team_slug: side ? "teams/orc" : "teams/human", revision: 3, secret: "must not escape",
  roster: { startingRerolls: side ? 0 : 1, teamRerolls: side ? 0 : 2,
    players: Array.from({ length: side ? 7 : 9 }, (_, i) => ({
      id: `player-${i}`, rowIndex: 0, number: String(20 + i), name: `Player ${i}`,
      statMods: i === 0 ? { ma: 1, ag: 1, ar: -1 } : {},
      injuryStatMods: i === 0 ? { ar: -1 } : {}, extraSkills: i === 0 ? ["Block"] : [],
      favouredSkills: i === 0 ? ["Guard"] : [], isCaptain: i === 1,
      skipNextGame: i === 8, spp: { touchdowns: 1, knockouts: 2 },
    })) } }));
const queries = [];
const source = createTeamSource({ async query(sql, parameters) {
  queries.push(sql);
  assert.match(sql, /^SELECT /);
  return { rows: parameters ? rows.filter(row => parameters[0].includes(row.id)) : rows };
} });
const handler = createPlayHandler({ teams: source,
  currentUser: async request => request.headers.authorization === "Bearer league-session" ? { id: "coach" } : null });
const server = http.createServer(async (request, response) => {
  if (!await handler(request, response, new URL(request.url, "http://localhost"))) { response.writeHead(404); response.end(); }
});
let base;
before(async () => {
  await loadTeamReference(process.cwd());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const selection = () => ({ teams: ids.map(id => ({ id })) });
async function request(path, body, auth = true) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer league-session" } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

test("league catalogue requires the existing session and exposes only tabletop fields", async () => {
  assert.equal((await request("/api/play/teams", undefined, false)).status, 401);
  const result = await request("/api/play/teams");
  assert.equal(result.status, 200);
  assert.equal(result.body.teams.length, 2);
  assert.equal(JSON.stringify(result.body).includes("must not escape"), false);
  assert.equal(result.body.teams[0].rerolls, 3);
  assert.equal(result.body.teams[0].players[8].available, false);
});

test("player conversion preserves jersey, upgrades, injuries, captain and favoured skills, SPP and missing PA", () => {
  // Verify against the real league reference rather than assuming a rules edition's stat line.
  const team = tabletopTeam(rows[0]), player = team.players[0];
  const rookie = tabletopTeam({ ...rows[0], roster: { players: [{ id: "rookie", rowIndex: 0 }] } }).players[0];
  assert.equal(player.ma, rookie.ma + 1);
  assert.equal(player.ag, rookie.ag - 1);
  assert.equal(player.av, rookie.av - 1); // injury already in statMods; must not be subtracted twice
  assert.equal(player.number, "20");
  assert.ok(player.skills.includes("Block") && player.skills.includes("Guard"));
  assert.ok(team.players[1].skills.includes("Pro"));
  assert.equal(player.spp, 5);
  const reference = structuredClone(teamBySlug("teams/human"));
  reference.team.roster[0].pa = "-";
  assert.equal(tabletopTeam(rows[0], reference).players[0].pa, null);
});

test("match creation reads canonical players, rejects invalid lineups, and never writes league data", async () => {
  const before = JSON.stringify(rows);
  assert.equal((await request("/api/play/matches", selection(), false)).status, 401);
  const body = selection();
  body.teams[0].players = [{ ma: 99 }];
  body.teams[0].rerolls = 99;
  body.state = { score: [10, 0] };
  const result = await request("/api/play/matches", body);
  assert.equal(result.status, 201);
  const s = result.body.state;
  assert.deepEqual(s.rerolls, [3, 0]);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.phase, "pregame");
  assert.equal(s.players.filter(onPitch).length, 0);
  assert.equal(s.players.filter(p => p.status === "reserve").length, 15);
  assert.equal(new Set(s.players.map(p => p.id)).size, s.players.length);
  assert.equal(s.players[0].number, "20");
  for (const lineup of [[], ["player-0", "player-0"], ["player-8"], ["unknown"], Array.from({ length: 8 }, (_, i) => `player-${i}`)]) {
    const invalid = selection(); invalid.teams[0].lineup = lineup;
    assert.equal((await request("/api/play/matches", invalid)).status, 400);
  }
  assert.equal(JSON.stringify(rows), before);
  assert.ok(queries.every(sql => sql.startsWith("SELECT ")));
});

test("empty, short and mirror rosters are explicit; arbitrary jersey numbers survive reset and drives", async () => {
  const empty = structuredClone(rows[0]); empty.roster.players = [];
  const emptyTeam = tabletopTeam(empty);
  assert.deepEqual(emptyTeam.players, []);
  const body = { teams: [{ id: ids[0], lineup: ["player-2", "player-4"] }, { id: ids[0] }] };
  let s = (await request("/api/play/matches", body)).body.state;
  assert.equal(s.players.filter(onPitch).length, 0);
  assert.equal(new Set(s.players.map(p => p.id)).size, 18);
  const first = s.players[0]; first.status = "casualty";
  autoSetup(s, 0);
  assert.equal(s.players.filter(p => p.team === 0 && onPitch(p)).length, 7);
  assert.equal(first.status, "casualty");
  const reset = applyCommand(s, { type: "reset" });
  assert.equal(reset.players.filter(onPitch).length, 0);
  assert.equal(reset.pending.type, "pregame");
  assert.deepEqual(reset.rerolls, [3, 3]);
});

test("opening and replacement formations keep four specialists maximum; halftime restores imported rerolls", async () => {
  const team = tabletopTeam(rows[0]);
  team.players.forEach((player, i) => { player.specialist = i < 5; player.lineman = !player.specialist; });
  team.lineup = openingLineup(team.players);
  assert.equal(team.lineup.filter(id => team.players.find(p => p.id === id).specialist).length, 4);
  let s = createMatch([team, team]);
  autoSetup(s, 0); autoSetup(s, 1);
  s.players.find(p => onPitch(p) && !p.specialist).status = "casualty";
  autoSetup(s, 0);
  assert.equal(s.players.filter(p => p.team === 0 && onPitch(p) && p.specialist).length, 4);
  s.active = 1; s.turn = [6, 6]; s.rerolls = [0, 0]; s.phase = "play"; s.pending = null; s.firstReceiver = 0;
  s = applyCommand(s, { type: "endTurn" });
  for (let i = 0; s.pending?.type === "roll" && i < 20; i++) {
    s = applyCommand(s, { type: s.pending.stage === "ready" ? "confirmRoll" : "acceptRoll" }, () => .5);
  }
  assert.equal(s.half, 2);
  assert.deepEqual(s.rerolls, [3, 3]);
});

test("database rooms preserve the chosen teams for both coaches and require league sign-in to join", async () => {
  const host = await request("/api/play/rooms", selection());
  assert.equal(host.status, 201);
  assert.equal(host.body.state.teams[1].name, "Away <team>");
  const path = `/api/play/rooms/${host.body.code}/join`;
  assert.equal((await request(path, {}, false)).status, 401);
  const guest = await request(path, {});
  assert.equal(guest.status, 200);
  assert.deepEqual(guest.body.state, host.body.state);
  assert.notEqual(guest.body.token, host.body.token);
  assert.equal((await request("/api/play/rooms", {}, false)).status, 201); // standalone practice still works
});

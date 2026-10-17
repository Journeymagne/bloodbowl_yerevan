import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch } from "../server/season/post-match.mjs";
import { statisticsFromEvents } from "../src/domain/post-match/events.mjs";
import { addJourneyman, createMatchSide } from "../src/domain/match/roster.mjs";
import { matchReference } from "../server/domain/match-reference.mjs";
import { callApi, recording, seedCoach, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { G, act, coaches, homeScores, id, spp, startedFriendly, teams, toPlayersStep, toReady } from "./helpers/match-db.mjs";
import { lockRow, raceInOrder, scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const events = (team) => `/api/teams/${team}/events`;
const tap = (token, playerId, counter = "touchdowns", delta = 1, extra = {}) =>
  callApi("POST", events(teams.home), { token, body: { pairingId: G, playerId, counter, delta, ...extra } });
const count = async (client) => (await client.query("SELECT count(*)::int AS n FROM match_events")).rows[0].n;
/** A touchdown tapped for `team` in the match, `body` laid over it. */
const tapOn = (team, token, body) => callApi("POST", events(team), { token, body: { pairingId: G, counter: "touchdowns", delta: 1, ...body } });

test("a tap in a live match is a row of that match: listed in order, and the post-match starts from it", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const first = await tap(token, "home-0");
  assert.equal(first.status, 201);
  const { id: eventId, createdAt, ...event } = first.body.event;
  assert.ok(eventId && Date.parse(createdAt));
  assert.deepEqual(event, { pairingId: G, playerId: "home-0", counter: "touchdowns", delta: 1, injury: null, settledAt: null });
  await tap(token, "home-1", "injury", 1, { injury: { code: "lasting", stat: "ag" } });
  const listed = await callApi("GET", `${events(teams.home)}?pairing=${G}`, { token });
  assert.deepEqual(listed.body.events.map((row) => [row.playerId, row.counter]), [["home-0", "touchdowns"], ["home-1", "injury"]]);
  const open = await callApi("GET", events(teams.home), { token });
  assert.deepEqual([open.body.events.length, open.body.revision], [2, 1]);
  const post = (await accessPostMatch(G, coaches.home)).postMatch;
  assert.equal(post.home.statistics["home-0"].touchdowns, 1);
  assert.deepEqual(post.home.injuries["home-1"], { code: "lasting", stat: "ag", retire: false });
}));

test("a tap is refused outside the live match, for a team or a player not in it, for another coach, or malformed — and writes nothing", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  const stranger = await tap(home, "away-0");
  assert.deepEqual([stranger.status, stranger.body.error.code], [422, "POST_PLAYER"]);
  assert.equal((await tap(away, "home-0")).body.error.code, "TEAM_NOT_FOUND", "the team is not his: as if it were not there");
  for (const [body, field] of [[{ counter: "mvps" }, "counter"], [{ delta: 2 }, "delta"], [{ counter: "injury" }, "injury"],
    [{ counter: "injury", injury: { code: "none" } }, "injury"], [{ injury: { code: "dead" } }, "injury"], [{ pairingId: "x" }, "pairingId"],
    [{ delta: "1" }, "delta"], [{ playerId: "" }, "playerId"], [{ playerId: "p".repeat(201) }, "playerId"], [{ playerId: 7 }, "playerId"]]) {
    const refused = await callApi("POST", events(teams.home), { token: home, body: { pairingId: G, playerId: "home-0", counter: "touchdowns", delta: 1, ...body } });
    assert.deepEqual([refused.status, refused.body.error.params.field], [400, field], JSON.stringify(body));
  }
  await client.query("UPDATE season_pairings SET preparation_status = 'not_started' WHERE id = $1", [G]);
  assert.equal((await tap(home, "home-0")).body.error.code, "MATCH_NOT_LIVE");
  assert.equal((await tapOn(teams.home, home, { pairingId: undefined, playerId: "home-0" })).body.error.code, "MATCH_NOT_LIVE", "no pairing, no match");
  assert.equal(await count(client), 0);
}));

test("a tap is for the side's match roster, not the blob: a player who sits the match out is refused, a journeyman only the match has is taken", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  // As a start leaves it: home-0 misses the match, and a journeyman makes the seven up.
  await client.query(`UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0,skipNextGame}', 'true') WHERE id = $1`, [teams.home]);
  const { rows: [{ roster }] } = await client.query("SELECT roster FROM saved_teams WHERE id = $1", [teams.home]);
  const side = createMatchSide({ user: { id: coaches.home.id, login: "home" }, team: { id: teams.home, name: "home", revision: 1, baseTeamSlug: "teams/human", roster } }, await matchReference());
  const journeyman = addJourneyman(side, 0);
  const players = [...side.players.filter((player) => !player.skipNextGame), journeyman];
  await client.query("UPDATE match_roster_snapshots SET snapshot = jsonb_set(snapshot, '{players}', $2::jsonb) WHERE pairing_id = $1 AND side = 'home'", [G, JSON.stringify(players)]);
  const skipped = await tap(token, "home-0");
  assert.deepEqual([skipped.status, skipped.body.error.code], [422, "POST_PLAYER"], "on the roster, but not in the match");
  const hired = await tap(token, journeyman.id);
  assert.deepEqual([hired.status, hired.body.event?.playerId], [201, journeyman.id], "in the match, on no roster");
  assert.equal(await count(client), 1);
}));

test("a tap in a live league match is taken as in a friendly: the coaches and teams come from the season's entries", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const L = id(44), token = await sessionFor(client, coaches.home.id);
  await client.query("UPDATE season_pairings SET preparation_status = 'not_started' WHERE id = $1", [G]); // only the league match is on
  await client.query("INSERT INTO seasons (id, current_round, status) VALUES ($1, 1, 'active')", [id(61)]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [id(62), id(61)]);
  for (const [entry, name] of [[id(63), "home"], [id(64), "away"]]) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4)", [entry, id(61), coaches[name].id, teams[name]]);
  }
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, preparation_status)
    VALUES ($1, $2, 1, $3, $4, 'in_progress')`, [L, id(62), id(63), id(64)]);
  await client.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) SELECT $2, side, saved_team_id, snapshot FROM match_roster_snapshots WHERE pairing_id = $1", [G, L]);
  const tapped = await tapOn(teams.home, token, { pairingId: L, playerId: "home-0" });
  assert.deepEqual([tapped.status, tapped.body.event?.pairingId], [201, L]);
  assert.equal((await tapOn(teams.home, token, { pairingId: G, playerId: "home-0" })).body.error.code, "MATCH_NOT_LIVE", "the friendly is not on");
  const away = await tapOn(teams.away, await sessionFor(client, coaches.away.id), { pairingId: L, playerId: "away-0" });
  assert.equal(away.status, 201, "and for the other side, by its own entry");
}));

/** Two more coaches with a friendly of their own going on, and a bye for the home team in a league round. */
async function otherPairings(client) {
  for (const [user, team, login] of [[id(3), id(14), "third"], [id(4), id(15), "fourth"]]) {
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, $2, $2, '@c', 'x')", [user, login]);
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, $3, 'teams/human', '{}')", [team, user, login]);
  }
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, preparation_status) VALUES ($1, 'friendly', 2, $2, $3, $4, $5, 'in_progress')`, [id(42), id(3), id(4), id(14), id(15)]);
  await client.query("INSERT INTO seasons (id, current_round) VALUES ($1, 1)", [id(51)]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [id(52), id(51)]);
  await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4)", [id(53), id(51), coaches.home.id, teams.home]);
  await client.query("INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, preparation_status) VALUES ($1, $2, 1, $3, 'in_progress')", [id(43), id(52), id(53)]);
}

test("for the coach's own team anything but its own live match, on its own side, is no match to tap in", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await otherPairings(client);
  const token = await sessionFor(client, coaches.home.id), spare = id(13);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, 'spare', 'teams/human', '{}')", [spare, coaches.home.id]);
  const cases = [["a team of his that does not play the match", spare, G], ["a pairing that is not there", teams.home, id(99)],
    ["a match of two other coaches", teams.home, id(42)], ["a bye", teams.home, id(43)]];
  for (const [label, team, pairingId] of cases) {
    const refused = await tapOn(team, token, { pairingId, playerId: "home-0" });
    assert.deepEqual([refused.status, refused.body.error.code], [409, "MATCH_NOT_LIVE"], label);
  }
  // His team, on a side the pairing gives to the other coach.
  await client.query("UPDATE season_pairings SET friendly_home_user_id = $2, friendly_away_user_id = $3 WHERE id = $1", [G, coaches.away.id, coaches.home.id]);
  assert.equal((await tap(token, "home-0")).body.error.code, "MATCH_NOT_LIVE", "a side that is not his");
  assert.equal(await count(client), 0);
}));

test("a side that saved its Players step, or a post-match begun in 2.x, takes no tap; reset, it follows the taps again", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  let state = await toPlayersStep();
  state = await act("home", state, { type: "statistics", statistics: { ...state.home.statistics, "home-0": { ...state.home.statistics["home-0"], touchdowns: 1 } }, mvps: ["home-6"] });
  const locked = await tap(token, "home-0");
  assert.deepEqual([locked.status, locked.body.error.code], [409, "EVENT_SIDE_LOCKED"]);
  state = await act("home", state, { type: "reset-side" });
  assert.equal((await tap(token, "home-0")).status, 201);
  await client.query("UPDATE match_post_games SET state = state #- '{home,followsEvents}' WHERE pairing_id = $1", [G]);
  assert.equal((await tap(token, "home-0")).body.error.code, "EVENT_SIDE_LOCKED");
}));

test("a side past its Players step that never saved it — the loser of a technical win locks it as it stands — takes no tap either; reopened, it follows them again", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.away.id);
  const awayTap = () => tapOn(teams.away, token, { playerId: "away-0", counter: "completions" });
  let state = (await accessPostMatch(G, coaches.home)).postMatch;
  state = await act("home", state, { type: "result", mode: "technical", winner: "home" });
  state = await act("away", state, { type: "agree-result" });
  state = await act("away", state, { type: "fans", roll: 3 });
  state = await act("away", state, { type: "lock-players" });
  assert.deepEqual([state.away.stage, state.away.followsEvents], [3, true], "the flag alone would let the tap in");
  const locked = await awayTap();
  assert.deepEqual([locked.status, locked.body.error.code], [409, "EVENT_SIDE_LOCKED"]);
  state = await act("away", state, { type: "reopen" });
  assert.equal((await awayTap()).status, 201);
  assert.equal((await accessPostMatch(G, coaches.away)).postMatch.away.statistics["away-0"].completions, 1);
}));

test("a step down in a match takes back one of the match's own: at zero it is refused and writes nothing — the blob and the edits outside the match are not the match's — and an injury is no count", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await client.query(`UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0,spp}', '{"touchdowns": 3}') WHERE id = $1`, [teams.home]);
  const refused = await tap(token, "home-0", "touchdowns", -1);
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.params], [409, "EVENT_BELOW_ZERO", { playerId: "home-0", counter: "touchdowns" }]);
  assert.equal(await count(client), 0);
  assert.equal((await tapOn(teams.home, token, { pairingId: undefined, playerId: "home-0" })).status, 201, "an edit outside the match");
  assert.equal((await tap(token, "home-0", "touchdowns", -1)).body.error?.code, "EVENT_BELOW_ZERO", "is not the match's to take back");
  assert.equal((await tap(token, "home-0")).status, 201);
  assert.equal((await tap(token, "home-1", "touchdowns", -1)).body.error?.code, "EVENT_BELOW_ZERO", "another player's count");
  assert.equal((await tap(token, "home-0", "completions", -1)).body.error?.code, "EVENT_BELOW_ZERO", "another counter");
  assert.equal((await tap(token, "home-0", "touchdowns", -1)).status, 201, "the match's own touchdown");
  assert.equal((await tap(token, "home-0", "touchdowns", -1)).body.error?.code, "EVENT_BELOW_ZERO", "and no more");
  assert.equal((await tap(token, "home-1", "injury", -1, { injury: { code: "miss" } })).status, 201, "an injury taken back is not a count");
  assert.equal(await count(client), 4);
}));

test("a started match whose score was confirmed without a post-match is no match on: a tap and an edit outside it are refused, until a post-match is opened for it", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const outsideEdit = () => tapOn(teams.home, token, { pairingId: undefined, playerId: "home-0" });
  // Confirmed around the post-match, as 2.x let a coach and his opponent (or the admin) do: the runbook's «started, post-match open» says no.
  await client.query("UPDATE season_pairings SET result_status = 'confirmed' WHERE id = $1", [G]);
  for (const [label, refused] of [["a tap", await tap(token, "home-0")], ["an edit outside the match", await outsideEdit()]]) {
    assert.deepEqual([refused.status, refused.body.error.code], [409, "MATCH_NOT_LIVE"], label);
  }
  assert.equal(await count(client), 0);
  await accessPostMatch(G, coaches.home); // its post-match opened: a match with a post-match row that is not completed is on again
  assert.equal((await tap(token, "home-0")).status, 201);
  assert.equal((await outsideEdit()).status, 201);
}));

test("a finished match takes no tap", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [G, { status: "completed", home: {}, away: {} }]);
  assert.equal((await tap(token, "home-0")).body.error.code, "MATCH_NOT_LIVE");
}));

// Both sides of each race queue on the pairing's lock, the first lock a tap and the post-match take.
const PAIRING = lockRow("season_pairings", G);

for (const tapFirst of [true, false]) {
  test(`a tap racing the Players step, ${tapFirst ? "the tap" : "the step"} first: exactly one of them lands, and the events still add up to what the post-match holds`, db, () => withApiDatabase(async (database) => {
    const { client } = database;
    await startedFriendly(client);
    const token = await sessionFor(client, coaches.home.id);
    const state = await toPlayersStep();
    const step = { type: "statistics", statistics: state.home.statistics, mvps: ["home-6"] };
    const tapping = () => tap(token, "home-0"), saving = () => act("home", state, step);
    const answers = await raceInOrder(database, PAIRING, ...(tapFirst ? [tapping, saving] : [saving, tapping]));
    const [tapped, saved] = tapFirst ? answers : answers.reverse();
    const outcome = [tapped.value.status === 201 ? "tap" : tapped.value.body.error.code, saved.status === "fulfilled" ? "step" : saved.reason.code];
    assert.deepEqual(outcome, tapFirst ? ["tap", "POST_REVISION"] : ["EVENT_SIDE_LOCKED", "step"]);
    const after = (await accessPostMatch(G, coaches.home)).postMatch;
    const rows = (await callApi("GET", `${events(teams.home)}?pairing=${G}`, { token })).body.events;
    assert.equal(after.home.statistics["home-0"].touchdowns, tapFirst ? 1 : 0, "a tap that landed is in the post-match, one refused is not");
    assert.equal(statisticsFromEvents(after.home.snapshot, rows).statistics["home-0"].touchdowns, after.home.statistics["home-0"].touchdowns);
  }));

  test(`a tap racing the finish, ${tapFirst ? "the tap" : "the finish"} first: the tap is refused, and the finish applies exactly what the settled events say`, db, () => withApiDatabase(async (database) => {
    const { client } = database;
    await startedFriendly(client);
    const token = await sessionFor(client, coaches.home.id);
    const ready = await toReady(await toPlayersStep(), homeScores);
    const tapping = () => tap(token, "home-0"), finishing = () => act("home", ready, null, true);
    const answers = await raceInOrder(database, PAIRING, ...(tapFirst ? [tapping, finishing] : [finishing, tapping]));
    const [tapped, finished] = tapFirst ? answers : answers.reverse();
    if (finished.status === "rejected") throw finished.reason;
    assert.equal(finished.value.status, "completed");
    assert.equal(tapped.value.body.error?.code, tapFirst ? "EVENT_SIDE_LOCKED" : "MATCH_NOT_LIVE", JSON.stringify(tapped.value.body));
    const settled = (await callApi("GET", `${events(teams.home)}?pairing=${G}`, { token })).body.events;
    assert.ok(settled.length && settled.every((row) => row.settledAt), "every event of the match is settled");
    assert.deepEqual(statisticsFromEvents(finished.value.home.snapshot, settled).statistics, finished.value.home.statistics);
    assert.deepEqual((await callApi("GET", events(teams.home), { token })).body.events, [], "nothing is left open");
    assert.equal((await spp(client, "home", "home-0")).touchdowns, 1, "the touchdown reached the blob once");
  }));
}

test("a tap takes the post-match's locks in the post-match's order — the pairing, both teams, the post-match — and only then writes its one row", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await accessPostMatch(G, coaches.home); // the post-match is open: its row is there to be locked
  const { result, log } = await recording(() => tap(token, "home-0"));
  assert.equal(result.status, 201);
  const locks = log.filter((sql) => /FOR UPDATE/.test(sql));
  assert.equal(locks.length, 3, locks.join("\n"));
  assert.match(locks[0], /FROM match_pairing_context c JOIN season_pairings p .* FOR UPDATE OF p$/);
  assert.match(locks[1], /FROM saved_teams WHERE id=ANY\(.*\) ORDER BY id FOR UPDATE$/);
  assert.match(locks[2], /FROM match_post_games WHERE pairing_id = \$1 FOR UPDATE$/);
  const writes = log.filter((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql));
  assert.equal(writes.length, 1);
  assert.match(writes[0], /^INSERT INTO match_events .* clock_timestamp\(\)\) RETURNING \*$/);
  assert.ok(log.indexOf(writes[0]) > log.indexOf(locks[2]), "the row is written under every lock");
  assert.deepEqual([log[0], ...log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  const read = await recording(() => callApi("GET", `${events(teams.home)}?pairing=${G}`, { token }));
  assert.deepEqual([read.log[0], ...read.log.slice(-2)], ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", "release"], "the list and the revision are one snapshot");
  assert.ok(!read.log.some((sql) => /FOR UPDATE/.test(sql)));
}));

test("a team and a match named in capitals are the same team and the same match", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  // The same home team and match again, under ids with letters in them (the helper's are all digits).
  const team = "abcdef00-0000-4000-8000-0000000000aa", pairing = "abcdef00-0000-4000-8000-0000000000bb";
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) SELECT $1, user_id, 'again', base_team_slug, roster FROM saved_teams WHERE id = $2", [team, teams.home]);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, preparation_status) VALUES ($1, 'friendly', 2, $2, $3, $4, $5, 'in_progress')`, [pairing, coaches.home.id, coaches.away.id, team, teams.away]);
  await client.query(`INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot)
    SELECT $1, side, CASE side WHEN 'home' THEN $2::uuid ELSE saved_team_id END, snapshot FROM match_roster_snapshots WHERE pairing_id = $3`, [pairing, team, G]);
  const token = await sessionFor(client, coaches.home.id), upper = (value) => value.toUpperCase();
  const tapped = await callApi("POST", events(upper(team)), { token, body: { pairingId: upper(pairing), playerId: "home-0", counter: "touchdowns", delta: 1 } });
  assert.deepEqual([tapped.status, tapped.body.event.pairingId], [201, pairing]);
  const listed = await callApi("GET", `${events(upper(team))}?pairing=${upper(pairing)}`, { token });
  assert.deepEqual(listed.body.events.map((row) => row.id), [tapped.body.event.id]);
}));

test("a refused tap writes nothing: a bad body or a team not his opens no transaction, and a refusal under the locks rolls back", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  for (const [label, send, status] of [["a bad body", () => tap(home, "home-0", "mvps"), 400], ["a team that is not his", () => tap(away, "home-0"), 404]]) {
    const { result, log } = await recording(send);
    assert.equal(result.status, status, label);
    assert.deepEqual(log, [], `${label}: no transaction was opened`);
  }
  for (const [label, send, code] of [["a player of the other side", () => tap(home, "away-0"), "POST_PLAYER"],
    ["a pairing that is not there", () => tapOn(teams.home, home, { pairingId: id(99), playerId: "home-0" }), "MATCH_NOT_LIVE"]]) {
    const { result, log } = await recording(send);
    assert.equal(result.body.error.code, code, label);
    assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"], label);
    assert.ok(!log.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)), `${label}: nothing was written before it was refused`);
  }
  assert.equal(await count(client), 0);
}));

test("an empty ?pairing= names no match: the team's open events, as without it", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  assert.equal((await tap(token, "home-0")).status, 201);
  const without = await callApi("GET", events(teams.home), { token });
  const empty = await callApi("GET", `${events(teams.home)}?pairing=`, { token });
  assert.deepEqual([empty.status, empty.body], [200, without.body]);
  assert.equal(empty.body.events.length, 1);
  assert.equal((await callApi("GET", `${events(teams.home)}?pairing=%20`, { token })).body.error.params.field, "pairing", "a blank one is no UUID");
}));

test("the events of a team are its owner's and the admin's to read", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const away = await sessionFor(client, coaches.away.id), admin = await seedCoach(client, "boss", { admin: true });
  assert.equal((await callApi("GET", events(teams.home), { token: away })).body.error.code, "TEAM_NOT_FOUND");
  assert.equal((await callApi("GET", `${events(teams.away)}?pairing=bad`, { token: away })).body.error.params.field, "pairing");
  assert.equal((await callApi("GET", `${events(teams.home)}?pairing=bad`, { token: away })).body.error.code, "TEAM_NOT_FOUND", "a stranger hears 404 whatever the query");
  await client.query("UPDATE saved_teams SET revision = 3 WHERE id = $1", [teams.home]);
  const read = await callApi("GET", `${events(teams.home)}?pairing=${G}`, { token: admin.token });
  assert.deepEqual([read.status, read.body], [200, { events: [], revision: 3 }], "the revision is the team's own");
  assert.equal((await tap(admin.token, "home-0")).body.error.code, "TEAM_NOT_FOUND", "a tap is the owner's alone");
  assert.deepEqual([(await callApi("GET", events(teams.home))).status, (await tap(undefined, "home-0")).status], [401, 401]);
  assert.equal(await count(client), 0);
}));

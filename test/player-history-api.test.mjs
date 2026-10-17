import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch } from "../server/season/post-match.mjs";
import { normalizeSppCounters } from "../src/domain/roster/players.mjs";
import { callApi, recording, seedCoach, seedTeam, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { G, act, coaches, homeScores, id, spp, startedFriendly, teams, toPlayersStep, toReady } from "./helpers/match-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const OLD = id(42);
const SEASON = "5ea50000-0000-4000-8000-0000000000ab"; // letters in it, so that writing it in capitals is a different text
const history = (token, query = "") => callApi("GET", `/api/teams/${teams.home}/players/home-0/history${query}`, { token });
const historyOf = (team, player, token, query = "") => callApi("GET", `/api/teams/${team}/players/${player}/history${query}`, { token });
const tapHome = (token, body) => callApi("POST", `/api/teams/${teams.home}/events`, { token, body });
const keys = (value) => Object.keys(value).sort();
const COUNTERS = ["touchdowns", "casualties", "knockouts", "completions", "catches", "interceptions", "throws", "landings", "bonus"];

/** A friendly finished through the post-match before this one: 2-1, home-0 scored twice and was MVP, then a Niggling Injury. */
async function finishedEarlier(client) {
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id, friendly_home_team_id,
    friendly_away_team_id, result_status, result_type, home_touchdowns, away_touchdowns, home_casualties, away_casualties, created_at)
    VALUES ($1, 'friendly', 2, $2, $3, $4, $5, 'confirmed', 'played', 2, 1, 0, 0, now() - interval '1 day')`, [OLD, coaches.home.id, coaches.away.id, teams.home, teams.away]);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [OLD,
    { status: "completed", home: { gamesPlayed: 4, injuries: { "home-0": { code: "niggling", retire: false } } }, away: { gamesPlayed: 4, injuries: {} } }]);
  await client.query(`INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster) VALUES ($1, 'home', $2, $3, $4)`,
    [OLD, teams.home, { players: [{ id: "home-0", spp: { touchdowns: 1 } }] }, { players: [{ id: "home-0", spp: { touchdowns: 3, mvps: 1 } }] }]);
}

/** A season, its rounds 3 and 4, and a confirmed 1-3 of the two teams (home, then away) in round 3, made two days ago. */
async function leagueMatch(client) {
  await client.query("INSERT INTO seasons (id, name, status, current_round) VALUES ($1, 'Autumn', 'active', 3)", [SEASON]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 3, 'started'), ($3, $2, 4, 'started')", [id(52), SEASON, id(55)]);
  await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)",
    [id(53), SEASON, coaches.home.id, teams.home, id(54), coaches.away.id, teams.away]);
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, home_touchdowns, away_touchdowns, home_casualties,
    away_casualties, result_type, result_status, created_at) VALUES ($1, $2, 1, $3, $4, 1, 3, 0, 2, 'played', 'confirmed', now() - interval '2 days')`, [id(44), id(52), id(53), id(54)]);
}

test("the career by match: the finished match as applied, the live one from its taps with rookie protection, edits outside a match apart", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client);
  const token = await sessionFor(client, coaches.home.id);
  for (const delta of [1, 1, -1]) await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { pairingId: G, playerId: "home-0", counter: "touchdowns", delta } });
  await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { pairingId: G, playerId: "home-0", counter: "injury", delta: 1, injury: { code: "dead" } } });
  await client.query("INSERT INTO match_events (saved_team_id, player_id, counter, delta, settled_at) VALUES ($1, 'home-0', 'completions', 1, now())", [teams.home]);
  const { status, body } = await history(token);
  assert.equal(status, 200);
  const [earlier, live] = body.history.matches;
  assert.deepEqual([earlier.pairingId, earlier.source, earlier.counters.touchdowns, earlier.counters.mvps, earlier.injury, earlier.score, earlier.opponent.name],
    [OLD, "applied", 2, 1, { code: "niggling" }, { own: 2, opponent: 1 }, "away"]);
  assert.deepEqual([live.pairingId, live.source, live.counters.touchdowns, live.injury, live.played, live.pending, live.status],
    [G, "events", 1, { code: "badly-hurt" }, true, true, "in_progress"]);
  assert.equal(body.history.outside.completions, 1);
}));

test("the career is the owner's and the admin's to read, a season narrows it to that season's league matches, and a bad season is refused", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  assert.equal((await history(away)).body.error.code, "TEAM_NOT_FOUND");
  assert.deepEqual((await history(home, `?season=${id(77)}`)).body.history.matches, []);
  assert.equal((await history(home, "?season=last")).body.error.params.field, "season");
}));

test("who may ask: a coach for his own team, an admin for any, nobody without a session; a stranger is told the team is not there whatever else the request says", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  const boss = await seedCoach(client, "boss", { admin: true });
  const answers = async (token) => (await Promise.all([history(token), history(token, "?season=nonsense"), history(token, `?season=${id(51)}`)])).map(({ status, body }) => [status, body.error?.code]);
  const gone = [404, "TEAM_NOT_FOUND"];
  assert.deepEqual(await answers(away), [gone, gone, gone], "a bad season is not told to a stranger: the team comes first");
  assert.deepEqual(await answers(undefined), Array(3).fill([401, "NOT_AUTHORIZED"]));
  assert.deepEqual((await answers(home)).map(([status]) => status), [200, 400, 200]);
  const asAdmin = await history(boss.token);
  assert.deepEqual([asAdmin.status, asAdmin.body.history.matches.map((row) => row.pairingId)], [200, [OLD, G]], "an admin reads a team that is not his");
  assert.equal((await history(boss.token, "?season=nonsense")).body.error.params.field, "season");
  assert.equal((await historyOf(id(99), "home-0", home)).body.error.code, "TEAM_NOT_FOUND", "a team that is not there");
  assert.equal((await historyOf(teams.home.toUpperCase(), "home-0", home)).status, 200, "an id may be written in capitals");
  const written = await historyOf(teams.home, "HOME-0", home);
  assert.deepEqual([written.status, written.body.history.playerId, written.body.history.matches.map((row) => row.source)], [200, "HOME-0", ["none", "none"]], "a player's id is kept as it is written");
}));

test("only a GET of a team's player, with a path that is a player's id, is a route", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), team = await seedTeam(client, coach.id);
  const base = `/api/teams/${team}/players`;
  const notRoutes = [["POST", `${base}/p0/history`], ["PUT", `${base}/p0/history`], ["PATCH", `${base}/p0/history`], ["DELETE", `${base}/p0/history`],
    ["GET", `${base}//history`], ["GET", `${base}/p0/history/`], ["GET", `${base}/p0/history/x`], ["GET", `${base}/p%200/history`], ["GET", `${base}/p0%2Fx/history`],
    ["GET", `${base}/${"x".repeat(201)}/history`], ["GET", `${base}/p0`], ["GET", "/api/teams/p0/players/p0/history"], ["GET", `/api/teams/${team}0/players/p0/history`]];
  for (const [method, path] of notRoutes) {
    const answer = await callApi(method, path, { token: coach.token, body: method === "GET" ? undefined : {} });
    assert.deepEqual([answer.status, answer.body.error.code], [404, "ROUTE_NOT_FOUND"], `${method} ${path}`);
  }
  for (const player of ["7f4c2a3e-0b1d-4c55-9a77-5d3e8b1f2a60", "home-0", "player.1_a-B", "z".repeat(200)]) {
    assert.equal((await historyOf(team, player, coach.token)).status, 200, player);
  }
}));

test("a season narrows the career to that season's league matches, an empty season is no season, and a row says what the match was from the team's own side", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client);
  await leagueMatch(client);
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, result_type, result_status, home_touchdowns, away_touchdowns, home_casualties,
    away_casualties) VALUES ($1, $2, 1, $3, 'played', 'confirmed', 2, 0, 0, 0)`, [id(45), id(55), id(53)]); // a bye with a result: no opponent, no match
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  const ids = async (query) => (await history(home, query)).body.history.matches.map((row) => row.pairingId);
  assert.deepEqual(await ids(""), [id(44), OLD, G], "every match of the team in the order they were made, and not the bye");
  assert.deepEqual(await ids("?season="), [id(44), OLD, G], "an empty season is none");
  assert.deepEqual(await ids(`?season=${SEASON}`), [id(44)], "friendlies belong to no season");
  assert.deepEqual(await ids(`?season=${SEASON.toUpperCase()}`), [id(44)], "in capitals as well");
  assert.deepEqual(await ids(`?season=${id(77)}`), []);
  for (const season of ["last", "1", `${SEASON}0`, SEASON.slice(1), "%20", "null", "%27%3B%20DROP%20TABLE%20seasons%3B--"]) {
    const refused = await history(home, `?season=${season}`);
    assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.params], [400, "FIELD_INVALID", { field: "season" }], season);
  }
  const [league, friendly, live] = (await history(home)).body.history.matches;
  assert.deepEqual([league.kind, league.seasonId, league.roundNumber, league.status, league.score, league.opponent],
    ["league", SEASON, 3, "confirmed", { own: 1, opponent: 3 }, { teamId: teams.away, name: "away" }]);
  assert.deepEqual([friendly.kind, friendly.seasonId, friendly.roundNumber, friendly.status], ["friendly", null, null, "confirmed"]);
  assert.deepEqual([live.kind, live.status, live.score], ["friendly", "in_progress", null], "a match under way has no score yet");
  const [leagueAway, friendlyAway, liveAway] = (await historyOf(teams.away, "away-0", away)).body.history.matches;
  assert.deepEqual([leagueAway.score, leagueAway.opponent, friendlyAway.score, friendlyAway.opponent, liveAway.played],
    [{ own: 3, opponent: 1 }, { teamId: teams.home, name: "home" }, { own: 1, opponent: 2 }, { teamId: teams.home, name: "home" }, true], "the same matches from the other side");
}));

test("a team id written in capitals gives the same career as in lower case: the side it played, the score and the games before a match do not depend on the case", db, () => withApiDatabase(async ({ client }) => {
  const lion = await seedCoach(client, "lion"), wolf = await seedCoach(client, "wolf");
  const MINE = "abcdef00-0000-4000-8000-00000000000a", THEIRS = "fedcba00-0000-4000-8000-00000000000b", owners = { [MINE]: lion.id, [THEIRS]: wolf.id };
  for (const [team, owner, name] of [[MINE, lion, "Lions"], [THEIRS, wolf, "Wolves"]]) {
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, $3, 'teams/human', '{}')", [team, owner.id, name]);
  }
  // 3-1 for the home side every time; the last match is on, with its touchdowns already entered but not confirmed.
  const play = (n, home, away, live = false) => client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, result_status, result_type, home_touchdowns, away_touchdowns, home_casualties, away_casualties, preparation_status, created_at)
    VALUES ($1, 'friendly', $2, $3, $4, $5, $6, $7, 'played', 3, 1, $8, $8, $9, now() - make_interval(days => 10 - $2::int))`,
  [id(n), n, owners[home], owners[away], home, away, live ? "pending" : "confirmed", live ? null : 0, live ? "in_progress" : "not_started"]);
  await play(1, MINE, THEIRS);
  await play(2, THEIRS, MINE);
  await play(3, MINE, THEIRS);
  await play(4, THEIRS, MINE, true);
  await client.query("INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury) VALUES ($1, $2, 'a', 'injury', 1, '{\"code\": \"dead\"}')", [MINE, id(4)]);
  const lower = await historyOf(MINE, "a", lion.token), upper = await historyOf(MINE.toUpperCase(), "a", lion.token);
  assert.equal(lower.status, 200);
  assert.deepEqual(upper.body, lower.body);
  assert.deepEqual(lower.body.history.matches.map((row) => [row.pairingId, row.status, row.score, row.opponent.teamId]), [
    [id(1), "confirmed", { own: 3, opponent: 1 }, THEIRS], [id(2), "confirmed", { own: 1, opponent: 3 }, THEIRS],
    [id(3), "confirmed", { own: 3, opponent: 1 }, THEIRS], [id(4), "in_progress", null, THEIRS]], "the team's own side of each, and no score for a match that is not confirmed");
  assert.deepEqual(lower.body.history.matches[3].injury, { code: "dead" }, "three games before it: no rookie protection");
}));

test("a player who is nowhere gets every match of the team without details, and zeros outside", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client);
  const token = await sessionFor(client, coaches.home.id);
  await tapHome(token, { pairingId: G, playerId: "home-0", counter: "touchdowns", delta: 1 });
  const { status, body } = await historyOf(teams.home, "nobody-here", token);
  assert.equal(status, 200);
  assert.equal(body.history.playerId, "nobody-here");
  assert.deepEqual(body.history.matches.map((row) => [row.pairingId, row.source, row.counters, row.injury, row.played, row.pending, row.status]),
    [[OLD, "none", null, null, null, false, "confirmed"], [G, "none", null, null, false, false, "in_progress"]]);
  assert.deepEqual(body.history.outside, Object.fromEntries(COUNTERS.map((counter) => [counter, 0])), "no edit outside a match is a zero on every counter, not a missing one");
}));

test("a row carries what the history says and nothing of the users or of the post-match behind it", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client);
  await leagueMatch(client);
  for (const name of ["home", "away"]) await client.query("UPDATE users SET login = $2, telegram = $3 WHERE id = $1", [coaches[name].id, `secret-login-${name}`, `@secret-tg-${name}`]);
  const token = await sessionFor(client, coaches.home.id);
  await tapHome(token, { pairingId: G, playerId: "home-0", counter: "injury", delta: 1, injury: { code: "lasting", stat: "ag" } });
  const { body } = await history(token);
  assert.deepEqual(keys(body), ["history"]);
  assert.deepEqual(keys(body.history), ["matches", "outside", "playerId"]);
  assert.equal(body.history.matches.length, 3);
  for (const row of body.history.matches) {
    assert.deepEqual(keys(row), ["counters", "injury", "kind", "opponent", "pairingId", "pending", "played", "roundNumber", "score", "seasonId", "source", "status"], row.pairingId);
    assert.deepEqual(keys(row.opponent), ["name", "teamId"]);
    assert.deepEqual(row.score && keys(row.score), row.status === "confirmed" ? ["opponent", "own"] : null);
    assert.deepEqual(row.counters && keys(row.counters), row.source === "none" ? null : keys(normalizeSppCounters()), "the counters of a roster, and no crowd or foul casualties");
  }
  assert.deepEqual(body.history.matches.map((row) => row.injury), [null, { code: "niggling" }, { code: "badly-hurt" }], "an injury is a code, and a characteristic when it has one");
  assert.deepEqual(keys(body.history.outside), [...COUNTERS].sort());
  const text = JSON.stringify(body);
  for (const secret of [coaches.home.id, coaches.away.id, "secret-login", "secret-tg", "injuries", "gamesPlayed", "treasury", "before", "after", "roster", "snapshot", "retire"]) {
    assert.ok(!text.includes(secret), `${secret} is not for the client`);
  }
}));

test("the whole answer is one snapshot that takes no lock and writes nothing, and a refusal leaves it after the team, before any match is read", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  const { result, log } = await recording(() => history(home));
  assert.equal(result.status, 200);
  assert.deepEqual([log[0], ...log.slice(-2)], ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", "release"]);
  assert.equal(log.filter((sql) => /^BEGIN\b/.test(sql)).length, 1, "one transaction");
  assert.equal(log.filter((sql) => sql === "release").length, 1, "one connection");
  assert.match(log[1], /^SELECT id, base_team_slug, roster, revision FROM saved_teams WHERE id = \$1 /, "the team is the snapshot's first read");
  assert.ok(log.length > 6, "the matches, their records and the player's events were read in it");
  assert.ok(!log.some((sql) => /\bFOR (UPDATE|NO KEY UPDATE|SHARE|KEY SHARE)\b/.test(sql)), log.join("\n"));
  assert.ok(!log.some((sql) => /^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/.test(sql)), "nothing is written");
  for (const [label, token, query] of [["a stranger", away, ""], ["a bad season", home, "?season=nonsense"]]) {
    const refused = await recording(() => history(token, query));
    assert.equal(refused.result.status, label === "a stranger" ? 404 : 400, label);
    assert.equal(refused.log.length, 4, `${label}: ${refused.log.join(" | ")}`);
    assert.deepEqual([refused.log[0], refused.log[2], refused.log[3]], ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "ROLLBACK", "release"], label);
    assert.match(refused.log[1], /^SELECT id, base_team_slug, roster, revision FROM saved_teams/, label);
  }
}));

test("each team reads its own side of a match: its own post-match side, its own application and its own roster, never the opponent's", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await finishedEarlier(client); // the application is the home team's: home-0 +2 TD, MVP
  await client.query(`UPDATE match_post_games SET state = jsonb_set(state, '{away,injuries}', '{"away-0": {"code": "lasting", "stat": "st", "retire": false}}') WHERE pairing_id = $1`, [OLD]);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  const row = async (team, player, token) => (await historyOf(team, player, token)).body.history.matches.find((match) => match.pairingId === OLD);
  assert.deepEqual((await row(teams.away, "away-0", away)).injury, { code: "lasting", stat: "st" }, "the away team's own side of the post-match");
  assert.deepEqual((await row(teams.home, "home-0", home)).injury, { code: "niggling" }, "and the home team's");
  const asked = await row(teams.away, "home-0", away);
  assert.deepEqual([asked.source, asked.counters, asked.injury], ["none", null, null], "the home team's application is not the away team's, whoever a player is called");
  assert.deepEqual([(await row(teams.home, "away-0", home)).injury, (await row(teams.home, "away-0", home)).source], [null, "none"]);
}));

test("a player who died is no longer in the blob, and still has his career: the taps of the match he died in, and that he played it", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const DIED = id(46);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id, friendly_home_team_id, friendly_away_team_id,
    result_status, result_type, home_touchdowns, away_touchdowns, home_casualties, away_casualties, created_at)
    VALUES ($1, 'friendly', 3, $2, $3, $4, $5, 'confirmed', 'played', 0, 1, 1, 0, now() - interval '1 day')`, [DIED, coaches.home.id, coaches.away.id, teams.home, teams.away]);
  await client.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) VALUES ($1, 'home', $2, $3)", [DIED, teams.home, { players: [{ id: "gone-1" }, { id: "home-0" }] }]);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [DIED, { status: "completed", home: { gamesPlayed: 4, injuries: { "gone-1": { code: "dead", retire: false } } }, away: { gamesPlayed: 4, injuries: {} } }]);
  await client.query(`INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster) VALUES ($1, 'home', $2, $3, $4)`,
    [DIED, teams.home, { players: [{ id: "gone-1", spp: { casualties: 2 } }, { id: "home-0", spp: {} }] }, { players: [{ id: "home-0", spp: {} }] }]);
  await client.query(`INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, settled_at) VALUES
    ($1, $2, 'gone-1', 'casualties', 1, NULL, now()), ($1, $2, 'gone-1', 'injury', 1, '{"code": "dead"}', now())`, [teams.home, DIED]);
  assert.ok(!(await client.query("SELECT roster FROM saved_teams WHERE id = $1", [teams.home])).rows[0].roster.players.some((player) => player.id === "gone-1"), "he is not on the roster");
  const token = await sessionFor(client, coaches.home.id);
  const { status, body } = await historyOf(teams.home, "gone-1", token);
  assert.equal(status, 200);
  const [died, live] = body.history.matches;
  assert.deepEqual([died.pairingId, died.source, died.counters.casualties, died.injury, died.played, died.pending, died.status], [DIED, "events", 1, { code: "dead" }, true, false, "confirmed"]);
  assert.deepEqual([live.pairingId, live.source, live.played], [G, "none", false]);
}));

test("a live match with no post-match yet is protected by the games the team played before it, a technical result not counted", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const earlier = (n, type = "played") => client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, result_status, result_type, home_touchdowns, away_touchdowns, home_casualties, away_casualties)
    VALUES ($1, 'friendly', $2, $3, $4, $5, $6, 'confirmed', $7, 2, 0, 0, 0)`, [id(n), n, coaches.home.id, coaches.away.id, teams.home, teams.away, type]);
  const injury = async () => (await history(token)).body.history.matches.find((row) => row.pairingId === G).injury;
  await tapHome(token, { pairingId: G, playerId: "home-0", counter: "injury", delta: 1, injury: { code: "dead" } });
  assert.deepEqual(await injury(), { code: "badly-hurt" }, "no games before it");
  await earlier(61);
  await earlier(62, "technical");
  await earlier(63);
  assert.deepEqual(await injury(), { code: "badly-hurt" }, "two games before it: the technical one was not played");
  await earlier(64);
  assert.deepEqual(await injury(), { code: "dead" }, "three games: no protection any more");
}));

test("a live match whose post-match is open reads its injury from the taps still, with the side's own games; the Players step saved, the side's own injuries and the same games", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await toPlayersStep(); // the post-match is open, and its sides follow the taps
  await client.query("UPDATE match_post_games SET state = jsonb_set(state, '{home,gamesPlayed}', '5') WHERE pairing_id = $1", [G]);
  await tapHome(token, { pairingId: G, playerId: "home-0", counter: "injury", delta: 1, injury: { code: "dead" } }); // after the post-match last looked
  const stored = (await client.query("SELECT state #> '{home,injuries}' AS injuries FROM match_post_games WHERE pairing_id = $1", [G])).rows[0].injuries;
  assert.deepEqual(stored, {}, "the stored post-match has not seen the tap");
  const row = async () => (await history(token)).body.history.matches[0];
  assert.deepEqual([(await row()).injury, (await row()).source], [{ code: "dead" }, "events"], "the tap is in, and five games leave no rookie protection");
  const reread = (await accessPostMatch(G, coaches.home)).postMatch;
  const saved = await act("home", reread, { type: "statistics", statistics: reread.home.statistics, mvps: ["home-6"], injuries: { "home-0": { code: "miss" } } });
  assert.equal(saved.home.followsEvents, false, "the Players step is saved: the side keeps what it holds");
  assert.deepEqual((await row()).injury, { code: "miss" }, "the games are the side's five, not the none that confirmed matches give");
}));

test("after a real finish every row adds up to the blob: the match as applied (MVP too), the edit made during it carried in apart", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  assert.equal((await tapHome(token, { playerId: "home-0", counter: "completions", delta: 1 })).status, 201, "an edit outside the match, waiting for it to end");
  assert.equal((await tapHome(token, { pairingId: G, playerId: "home-0", counter: "touchdowns", delta: 1 })).status, 201);
  const ready = await toReady(await toPlayersStep(), homeScores);
  assert.equal((await act("home", ready, null, true)).status, "completed");
  for (const player of ["home-0", "home-6", "home-3"]) {
    const { body: { history: career } } = await historyOf(teams.home, player, token);
    const blob = normalizeSppCounters(await spp(client, "home", player));
    const added = Object.fromEntries(Object.keys(blob).map((counter) => [counter,
      career.matches.reduce((sum, row) => sum + (row.counters?.[counter] ?? 0), career.outside[counter] ?? 0)]));
    assert.deepEqual(added, blob, `${player}: the rows are his career`);
  }
  const { body: { history: scorer } } = await historyOf(teams.home, "home-0", token);
  assert.deepEqual(scorer.matches.map((row) => [row.source, row.counters.touchdowns, row.counters.completions, row.pending, row.played, row.status, row.score]),
    [["applied", 1, 0, false, true, "confirmed", { own: 1, opponent: 0 }]], "the match as it was applied: the edit outside it came into the blob after");
  assert.equal(scorer.outside.completions, 1, "and is its own sum, settled now");
  const { body: { history: mvp } } = await historyOf(teams.home, "home-6", token);
  assert.deepEqual([mvp.matches[0].source, mvp.matches[0].counters.mvps], ["applied", 1]);
}));

test("a roster save that changes SPP is a sum of its own outside any match", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), team = await seedTeam(client, coach.id, { roster: { players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 1 } }] } });
  const save = (revision, spp) => callApi("PATCH", `/api/teams/${team}`, { token: coach.token,
    body: { name: "Lions", baseTeamSlug: "teams/human", revision, roster: { teamSlug: "teams/human", treasury: 100, players: [{ id: "a", rowIndex: 0, spp }] } } });
  assert.equal((await save(1, { touchdowns: 3, casualties: 1, mvps: 1 })).status, 200);
  assert.equal((await save(2, { touchdowns: 2, casualties: 1, mvps: 1 })).status, 200);
  const { body: { history: career } } = await historyOf(team, "a", coach.token);
  assert.deepEqual(career.matches, []);
  assert.deepEqual(career.outside, { ...Object.fromEntries(COUNTERS.map((counter) => [counter, 0])), touchdowns: 1, casualties: 1 }, "+2 and -1 on touchdowns; the MVP is no row");
}));

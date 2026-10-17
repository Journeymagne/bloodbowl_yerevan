import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch, gamesPlayedBefore } from "../server/season/post-match.mjs";
import { withApiDatabase } from "./helpers/api-db.mjs";
import { G, coaches, id, startedFriendly, teams } from "./helpers/match-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const THIRD = { user: id(3), team: id(13) };

/** A friendly of the two teams, or of the ones given, as the site leaves it. */
async function friendly(client, n, { status = "confirmed", type = "played", home = teams.home, away = teams.away, awayUser = coaches.away.id } = {}) {
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id, friendly_home_team_id,
    friendly_away_team_id, result_status, result_type, home_touchdowns, away_touchdowns, home_casualties, away_casualties)
    VALUES ($1, 'friendly', $2, $3, $4, $5, $6, $7, $8, 2, 0, 0, 0)`, [id(n), n, coaches.home.id, awayUser, home, away, status, type]);
}

/**
 * The live match G, and around it, for the home team 3 games, for the away team 2 and for a third team 1, so that no
 * side's count can stand in for the other's: a confirmed match of the two teams, a technical one, a pending one, and two
 * of the home team against the third, the away side of one of them played by the away team.
 */
async function seeded(client) {
  await startedFriendly(client);
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'third', 'third', '@c', 'x')", [THIRD.user]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, 'third', 'teams/human', '{}')", [THIRD.team, THIRD.user]);
  await friendly(client, 61);
  await friendly(client, 62, { type: "technical" });
  await friendly(client, 63, { status: "pending" });
  await friendly(client, 65, { away: THIRD.team, awayUser: THIRD.user });
  // Its away side was played by the away team, whatever the pairing says now: the snapshot names who played.
  await client.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) VALUES ($1, 'away', $2, '{}')", [id(65), teams.away]);
  await friendly(client, 66, { away: THIRD.team, awayUser: THIRD.user }); // and one the third team did play
}

test("the games a team has played are its confirmed matches that were not a technical result, the match asked about left out; a team with none has 0", db, () => withApiDatabase(async ({ client }) => {
  await seeded(client);
  assert.deepEqual(await gamesPlayedBefore(client, [teams.home, teams.away, THIRD.team], G), { [teams.home]: 3, [teams.away]: 2, [THIRD.team]: 1 },
    "not the technical, the pending and the live one; the side's snapshot decides whose game it was, the pairing's team where there is none");
  assert.deepEqual(await gamesPlayedBefore(client, [teams.away, teams.home], G), { [teams.away]: 2, [teams.home]: 3 }, "each team's own count, whatever the order asked in");
  assert.deepEqual(await gamesPlayedBefore(client, [teams.home], id(61)), { [teams.home]: 2 }, "a confirmed match is not a game before itself");
  assert.deepEqual(await gamesPlayedBefore(client, [teams.home, THIRD.team], id(66)), { [teams.home]: 2, [THIRD.team]: 0 }, "a team whose only game it is has none before it");
  assert.deepEqual(await gamesPlayedBefore(client, [id(99)], G), { [id(99)]: 0 }, "a team that was never there has none");
  assert.deepEqual(await gamesPlayedBefore(client, [], G), {});
}));

test("a post-match counts the games of each of its teams, home and away, the way gamesPlayedBefore does", db, () => withApiDatabase(async ({ client }) => {
  await seeded(client);
  const { postMatch } = await accessPostMatch(G, coaches.home);
  assert.deepEqual([postMatch.home.gamesPlayed, postMatch.away.gamesPlayed], [3, 2], "the home team's three, the away team's two: neither stands in for the other");
}));

/**
 * A friendly that has started, and the coaches who play it through the post-match, for the tests
 * that run on a scratch database (test/helpers/scratch-db.mjs). Moved out of
 * test/post-match-events-db.test.mjs, unchanged, so the API tests can use the same match.
 */
import assert from "node:assert/strict";

import { accessPostMatch } from "../../server/season/post-match.mjs";
import { matchReference } from "../../server/domain/match-reference.mjs";
import { createMatchSide } from "../../src/domain/match/roster.mjs";

export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const G = id(41), SIDES = ["home", "away"];
export const coaches = { home: { id: id(1), is_admin: false }, away: { id: id(2), is_admin: false } };
export const teams = { home: id(11), away: id(12) };
const roster = (name) => ({ treasury: 150, players: Array.from({ length: 7 }, (_, i) =>
  ({ id: `${name}-${i}`, rowIndex: 0, number: String(i + 1), name: `Player ${i + 1}` })) });

/** A friendly that has started: two Human teams, the pairing and both snapshots, as startPreparedMatch leaves them. */
export async function startedFriendly(client) {
  const data = await matchReference();
  for (const name of SIDES) {
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, $2, $2, '@c', 'x')", [coaches[name].id, name]);
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, $3, 'teams/human', $4)",
      [teams[name], coaches[name].id, name, JSON.stringify(roster(name))]);
  }
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, preparation_status) VALUES ($1, 'friendly', 1, $2, $3, $4, $5, 'in_progress')`,
  [G, coaches.home.id, coaches.away.id, teams.home, teams.away]);
  for (const name of SIDES) {
    const source = { user: { id: coaches[name].id, login: name }, gamesPlayed: 0,
      team: { id: teams[name], name, revision: 1, baseTeamSlug: "teams/human", roster: roster(name) } };
    await client.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) VALUES ($1, $2, $3, $4)",
      [G, name, teams[name], JSON.stringify({ ...createMatchSide(source, data), fanFactor: 2, effects: {} })]);
  }
}

export const totals = async (client, team) => (await client.query(`SELECT player_id, counter, sum(delta)::int AS total, count(*)::int AS rows,
    bool_and(settled_at IS NOT NULL) AS settled FROM match_events WHERE pairing_id = $1 AND saved_team_id = $2
  GROUP BY player_id, counter ORDER BY player_id, counter`, [G, team])).rows;
export const spp = async (client, name, playerId) => (await client.query("SELECT roster FROM saved_teams WHERE id = $1", [teams[name]]))
  .rows[0].roster.players.find((player) => player.id === playerId).spp;

/** One coach's step, through the server function the route calls. */
export const act = async (name, state, action, finish = false) =>
  (await accessPostMatch(G, coaches[name], { revision: state.revision, ...(finish ? {} : { action }) }, finish)).postMatch;

/** A 1-0 agreed and the fans rolled: both sides on the Players step. */
export async function toPlayersStep() {
  let state = (await accessPostMatch(G, coaches.home)).postMatch;
  state = await act("home", state, { type: "result", home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
  state = await act("away", state, { type: "agree-result" });
  for (const name of SIDES) state = await act(name, state, { type: "fans", roll: 3 });
  return state;
}

/** The Players step with `statistics(name, side)`, then every later step, up to ready. */
export async function toReady(state, statistics) {
  for (const name of SIDES) state = await act(name, state, { type: "statistics", statistics: statistics(name, state[name]), mvps: [`${name}-6`] });
  for (const type of ["lock-players", "lock-roster"]) for (const name of SIDES) state = await act(name, state, { type });
  for (const name of SIDES) state = await act(name, state, { type: "finance", deposit: 0, mistake: { roll: 6 } });
  for (const name of SIDES) state = await act(name, state, { type: "next", captain: `${name}-0` });
  for (const name of SIDES) state = await act(name, state, { type: "confirm" });
  assert.equal(state.status, "ready");
  return state;
}

export const homeScores = (name, side) => name === "home"
  ? { ...side.statistics, "home-0": { ...side.statistics["home-0"], touchdowns: 1 } } : side.statistics;

import { httpError } from "../http/errors.mjs";
import { createPreparation, resetChangedRosters, upgradePreparation } from "../../src/domain/match/preparation.mjs";
import { matchError, SIDES } from "../../src/domain/match/rules.mjs";

export async function loadPreparationFixture(client, pairingId, user) {
  const result = await client.query(`SELECT c.*, c.season_current_round AS current_round,
    c.home_user_login AS home_login,c.away_user_login AS away_login
    FROM match_pairing_context c JOIN season_pairings p ON p.id=c.id
    WHERE p.id=$1 FOR UPDATE OF p`, [pairingId]);
  const fixture = result.rows[0];
  if (!fixture) throw httpError(404, "GAME_NOT_FOUND");
  if (!user.is_admin && ![fixture.home_user_id, fixture.away_user_id].includes(user.id)) throw httpError(403, "FIXTURE_NOT_YOURS");
  if (!fixture.home_team_id || !fixture.away_team_id) throw httpError(409, "BYE_NEEDS_NO_CONFIRMATION");
  return fixture;
}

export async function loadPreparationSources(client, fixture) {
  const teams = (await client.query("SELECT * FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
    [[fixture.home_team_id, fixture.away_team_id]])).rows;
  return Object.fromEntries(SIDES.map(side => {
    const row = teams.find(team => team.id === fixture[`${side}_team_id`]);
    if (!row) throw httpError(404, "TEAM_NOT_FOUND");
    return [side, { user: { id: fixture[`${side}_user_id`], login: fixture[`${side}_login`] },
      team: { id: row.id, name: row.name, baseTeamSlug: row.base_team_slug, revision: row.revision, roster: row.roster } }];
  }));
}

export function sourcesChanged(state, sources) {
  return SIDES.some(side => state[side].team.id !== sources[side].team.id || state[side].team.revision !== sources[side].team.revision);
}

export async function loadPreparationState(client, fixture, sources, data, reading) {
  const row = (await client.query("SELECT state FROM match_preparations WHERE pairing_id=$1 FOR UPDATE", [fixture.id])).rows[0];
  let state = row?.state || createPreparation(sources, data);
  if (state.status !== "in_progress" && sourcesChanged(state, sources)) {
    if (!reading) throw matchError("MATCH_ROSTER_CHANGED");
    state = resetChangedRosters(state, sources, data);
  }
  state = upgradePreparation(state);
  if (!row || reading) await savePreparationState(client, fixture.id, state);
  return state;
}

export async function savePreparationState(client, pairingId, state) {
  await client.query(`INSERT INTO match_preparations (pairing_id,state) VALUES ($1,$2)
    ON CONFLICT (pairing_id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()`, [pairingId, JSON.stringify(state)]);
  await client.query("UPDATE season_pairings SET preparation_status=$2 WHERE id=$1", [pairingId, state.status]);
}

export function checkPreparationWrite(fixture, state, body, user) {
  if (fixture.match_kind !== "friendly" && (fixture.round_status !== "started" || Number(fixture.round_number) !== Number(fixture.current_round))) throw httpError(409, "ROUND_CLOSED_FOR_PLAYERS");
  if (fixture.result_status === "confirmed") throw httpError(409, "RESULT_ALREADY_CONFIRMED");
  if (Number(body.revision) !== state.revision) throw matchError("MATCH_REVISION");
  const side = body.side || (fixture.home_user_id === user.id ? "home" : "away");
  if (!SIDES.includes(side) || (!user.is_admin && fixture[`${side}_user_id`] !== user.id)) throw httpError(403, "FIXTURE_NOT_YOURS");
  return side;
}

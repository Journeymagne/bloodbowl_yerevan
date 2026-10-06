import { pool } from "../db/pool.mjs";
import { matchReference } from "../domain/match-reference.mjs";
import { applyPreparationAction } from "../../src/domain/match/preparation.mjs";
import { createMatchSnapshots } from "../../src/domain/match/snapshot.mjs";
import { SIDES } from "../../src/domain/match/rules.mjs";
import { loadPreparationFixture, loadPreparationSources, loadPreparationState, savePreparationState, checkPreparationWrite } from "./preparation-store.mjs";
import { applyPreMatchTreasury } from "./finance-store.mjs";

async function startPreparedMatch(client, fixture, state, data) {
  const snapshots = createMatchSnapshots(state, data);
  for (const side of SIDES) {
    const snapshot = snapshots[side], team = state[side].team;
    await applyPreMatchTreasury(client, fixture.id, side, snapshot);
    await client.query(`INSERT INTO match_roster_snapshots (pairing_id,side,saved_team_id,snapshot) VALUES ($1,$2,$3,$4)`,
      [fixture.id, side, team.id, JSON.stringify(snapshot)]);
  }
  state.status = "in_progress"; state.startedAt = new Date().toISOString(); state.revision++;
  return state;
}

async function preparationResponse(client, fixture, state, user) {
  const snapshots = (await client.query("SELECT side,snapshot FROM match_roster_snapshots WHERE pairing_id=$1", [fixture.id])).rows;
  return { preparation: state, snapshots: Object.fromEntries(snapshots.map(row => [row.side, row.snapshot])),
    viewerSide: fixture.home_user_id === user.id ? "home" : "away", isAdmin: Boolean(user.is_admin),
    fixture: { id: fixture.id, kind: fixture.match_kind, seasonName: fixture.season_name, roundNumber: fixture.round_number, tableNumber: fixture.table_number,
      closed: fixture.result_status === "confirmed" || (fixture.match_kind !== "friendly" && (fixture.round_status !== "started" || Number(fixture.round_number) !== Number(fixture.current_round))) } };
}

export async function accessPreparation(pairingId, user, body = null, start = false) {
  const data = await matchReference(), client = await pool.connect();
  try {
    await client.query("BEGIN");
    const fixture = await loadPreparationFixture(client, pairingId, user);
    const sources = await loadPreparationSources(client, fixture);
    let state = await loadPreparationState(client, fixture, sources, data, !body);
    if (body && !(start && state.status === "in_progress")) {
      const side = checkPreparationWrite(fixture, state, body, user);
      state = start ? await startPreparedMatch(client, fixture, state, data)
        : applyPreparationAction(state, side, body.action, data, user.id);
      await savePreparationState(client, fixture.id, state);
    }
    const response = await preparationResponse(client, fixture, state, user);
    await client.query("COMMIT");
    return response;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

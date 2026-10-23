import test from "node:test";
import assert from "node:assert/strict";
import { callApi, seedCoach, seedTeam, withApiDatabase } from "./helpers/api-db.mjs";
import { id } from "./helpers/match-db.mjs";
import { lockRow, raceInOrder, scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const season = id(601), oldRound = id(602), currentRound = id(603), draftRound = id(604);
const played = id(611), pending = id(612), draft = id(613);
const home = id(621), away = id(622), replacement = id(623);
const row = async (client, pairingId) => (await client.query("SELECT * FROM season_pairings WHERE id=$1", [pairingId])).rows[0];
const pairs = async (client) => (await client.query("SELECT * FROM season_pairings ORDER BY id")).rows;
const api = (method, path, token, body) => callApi(method, path, { token, body });
const patch = (pairingId, token, body) => api("PATCH", `/api/season/admin/pairings/${pairingId}`, token, body);
const remove = (pairingId, token) => api("DELETE", `/api/season/admin/pairings/${pairingId}`, token);
const refusal = (answer, code = "MATCH_HISTORY_PROTECTED") => assert.deepEqual([answer.status, answer.body.error?.code], [409, code]);

async function setup(client) {
  const admin = await seedCoach(client, "history-admin", { admin: true });
  const other = await seedCoach(client, "history-other");
  const spare = await seedCoach(client, "history-spare");
  const teams = await Promise.all([seedTeam(client, admin.id, { name: "Original" }), seedTeam(client, other.id), seedTeam(client, spare.id)]);
  await client.query("INSERT INTO seasons (id, name, current_round) VALUES ($1, 'History', 2)", [season]);
  for (const [entry, user, team] of [[home, admin.id, teams[0]], [away, other.id, teams[1]], [replacement, spare.id, teams[2]]]) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1,$2,$3,$4)", [entry, season, user, team]);
  }
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1,$4,1,'completed'),($2,$4,2,'started'),($3,$4,3,'draft')",
    [oldRound, currentRound, draftRound, season]);
  for (const [pairing, round] of [[played, oldRound], [pending, currentRound], [draft, draftRound]]) {
    await client.query("INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id) VALUES ($1,$2,1,$3,$4)", [pairing, round, home, away]);
  }
  await client.query("UPDATE season_pairings SET home_touchdowns=1,away_touchdowns=0,home_casualties=3,away_casualties=1,home_points=5,away_points=0,result_status='confirmed',confirmed_at=now() WHERE id=$1", [played]);
  return { token: admin.token, owner: admin.id, teams };
}

test("withdrawal and a replacement team preserve old results and both opponents' standings", db, () => withApiDatabase(async ({ client }) => {
  const { token, owner } = await setup(client);
  const before = await pairs(client);
  const original = (await api("GET", "/api/season", token)).body;
  assert.equal((await api("DELETE", `/api/season/admin/entries/${home}`, token)).status, 200);
  const newTeam = await seedTeam(client, owner, { name: "Replacement" });
  const answer = await api("POST", "/api/season/admin/entries", token, { teamId: newTeam });
  assert.equal(answer.status, 201);
  assert.deepEqual(await pairs(client), before);
  const fresh = answer.body.entries.find(entry => entry.team.id === newTeam);
  assert.ok(fresh && fresh.id !== home);
  assert.equal(answer.body.historicalEntries.find(entry => entry.id === home).team.name, "Original");
  const strip = ({ rank, withdrawnAt, ...standing }) => standing;
  for (const entryId of [home, away]) {
    assert.deepEqual(strip(answer.body.standings.find(item => item.entryId === entryId)), strip(original.standings.find(item => item.entryId === entryId)));
  }
  assert.equal(answer.body.standings.find(item => item.entryId === fresh.id).games, 0);
}));

test("played participants cannot be replaced or removed through either result route; score corrections still work", db, () => withApiDatabase(async ({ client }) => {
  const { token } = await setup(client);
  const before = await row(client, played);
  for (const path of [`/api/season/admin/pairings/${played}`, `/api/games/${played}`]) {
    for (const body of [{ homeEntryId: replacement }, { awayEntryId: null }, { homeEntryId: "", awayEntryId: "" },
      { homeEntryId: replacement, homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null }]) {
      refusal(await api("PATCH", path, token, body));
      assert.deepEqual(await row(client, played), before);
    }
  }
  refusal(await remove(played, token));
  refusal(await api("DELETE", `/api/season/admin/rounds/${oldRound}`, token), "ROUND_IS_LOCKED");
  assert.deepEqual(await row(client, played), before);
  assert.equal((await patch(played, token, { homeTouchdowns: 2 })).status, 200);
  const corrected = await row(client, played);
  assert.deepEqual([corrected.home_entry_id, corrected.away_entry_id, corrected.home_touchdowns, corrected.home_casualties], [home, away, 2, 3]);
}));

test("unplayed pairs can change one side or be deleted without touching previous matches", db, () => withApiDatabase(async ({ client }) => {
  const { token } = await setup(client);
  const history = await row(client, played);
  assert.equal((await patch(pending, token, { homeEntryId: replacement })).status, 200);
  assert.deepEqual([(await row(client, pending)).home_entry_id, (await row(client, pending)).away_entry_id], [replacement, away], "an omitted side stays as it was");
  assert.equal((await patch(pending, token, { homeEntryId: null })).status, 200);
  assert.equal((await remove(pending, token)).status, 200);
  assert.equal((await api("DELETE", `/api/season/admin/rounds/${draftRound}`, token)).status, 200);
  assert.deepEqual(await row(client, played), history);
  assert.equal(await row(client, pending), undefined);
  assert.equal(await row(client, draft), undefined);
}));

test("proposals, partial scores and match preparation also prevent destructive edits", db, () => withApiDatabase(async ({ client }) => {
  const { token } = await setup(client);
  const states = [
    "result_status='awaiting_confirmation', proposed_at=now()",
    "result_status='rejected', proposed_at=now()",
    "home_touchdowns=0",
    "preparation_status='in_progress'",
  ];
  for (const fields of states) {
    await client.query(`UPDATE season_pairings SET result_status='pending',proposed_at=NULL,home_touchdowns=NULL,preparation_status='not_started' WHERE id=$1`, [pending]);
    await client.query(`UPDATE season_pairings SET ${fields} WHERE id=$1`, [pending]);
    const before = await row(client, pending);
    refusal(await remove(pending, token));
    refusal(await patch(pending, token, { awayEntryId: replacement }));
    assert.deepEqual(await row(client, pending), before);
  }
  // Separate preparation records must protect a pair even if the cached status is stale.
  await client.query("INSERT INTO match_preparations (pairing_id, state) VALUES ($1, '{}')", [draft]);
  refusal(await remove(draft, token));
  refusal(await patch(draft, token, { homeEntryId: replacement }));
  refusal(await api("DELETE", `/api/season/admin/rounds/${draftRound}`, token));
  assert.equal((await client.query("SELECT count(*)::int AS n FROM match_preparations WHERE pairing_id=$1", [draft])).rows[0].n, 1);
}));

test("physical entry deletion cannot cascade into either side of match history", db, () => withApiDatabase(async ({ client }) => {
  await setup(client);
  const before = await pairs(client);
  for (const entryId of [home, away]) {
    await assert.rejects(client.query("DELETE FROM season_entries WHERE id=$1", [entryId]), { code: "23503" });
    assert.deepEqual(await pairs(client), before);
  }
}));

for (const action of ["delete", "replace"]) {
  test(`a result saved while ${action} waits on its lock keeps its history`, db, () => withApiDatabase(async (database) => {
    const { client } = database;
    const { token } = await setup(client);
    const [saved, changed] = await raceInOrder(database, lockRow("season_pairings", pending),
      () => patch(pending, token, { homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 }),
      () => action === "delete" ? remove(pending, token) : patch(pending, token, { homeEntryId: replacement }));
    assert.equal(saved.status, "fulfilled");
    assert.equal(saved.value.status, 200);
    assert.equal(changed.status, "fulfilled");
    refusal(changed.value);
    const result = await row(client, pending);
    assert.deepEqual([result.home_entry_id, result.away_entry_id, result.home_touchdowns, result.away_touchdowns, result.result_status],
      [home, away, 1, 0, "confirmed"]);
  }));
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pool } from "../server/db/pool.mjs";
import { loadSeasonBundle } from "../server/season/store.mjs";
import { generateSwissRound } from "../server/season/rounds.mjs";
import { computeSeasonStandings } from "../server/season/scoring.mjs";
import { handleSeasonRoutes } from "../server/routes/season.mjs";
import { pairingEntry } from "../src/screens/season/season-links.mjs";
import { leagueTableMarkup } from "../src/screens/season/table.mjs";
import { seasonTable } from "../src/data/season-table.mjs";
import { renderSeasonRounds } from "../src/screens/season/schedule.mjs";
import { state } from "../src/core/state.mjs";
import { setDictionaries } from "../src/core/i18n.mjs";

const removedId = "11111111-1111-4111-8111-111111111111";
const entry = (id, withdrawn = false) => ({ id, season_id: "season", user_id: id + "-coach", user_login: id,
  user_telegram: "@private", saved_team_id: id + "-team", team_name: id + " Team", base_team_slug: "teams/gnome",
  withdrawn_at: withdrawn ? "2026-10-13T00:00:00Z" : null });
const match = { id: "played", round_id: "round", round_number: 1, round_status: "completed", table_number: 1,
  home_entry_id: removedId, away_entry_id: "opponent", home_points: 4, away_points: 1,
  home_touchdowns: 2, away_touchdowns: 2, home_casualties: 3, away_casualties: 1, result_status: "confirmed" };
const round = { id: "round", season_id: "season", round_number: 1, status: "completed" };

async function fixture(run, { withdrawn = true, rounds = [round] } = {}) {
  const entries = [entry(removedId, withdrawn), entry("opponent"), entry("other")];
  const pairings = [structuredClone(match)], created = [], writes = [];
  const originalQuery = pool.query, originalConnect = pool.connect;
  const admin = { id: "admin", login: "admin", is_admin: true };
  const query = async (sql, values = []) => {
    writes.push(sql);
    if (sql.includes("FROM sessions")) return { rows: [admin] };
    if (sql.includes("SELECT * FROM seasons")) return { rows: [{ id: "season", name: "Season 1", status: "active" }] };
    if (sql.includes("UPDATE season_entries")) { entries.find(item => item.id === values[0]).withdrawn_at = "2026-10-13T00:00:00Z"; return { rows: [] }; }
    if (sql.includes("FROM season_entries se")) return { rows: entries };
    if (sql.includes("FROM season_pairings")) return { rows: pairings };
    if (sql.includes("FROM season_rounds")) return { rows: rounds };
    if (sql.includes("FROM saved_teams")) return { rows: [] };
    if (sql.includes("SELECT * FROM users")) return { rows: [admin] };
    if (sql.includes("INSERT INTO season_rounds")) return { rows: [{ id: "next-round", round_number: values[1] }] };
    if (sql.includes("INSERT INTO season_pairings")) created.push(values.slice(2, 4));
    else if (!["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) && !sql.includes("UPDATE seasons")) assert.fail("Unexpected query: " + sql);
    return { rows: [] };
  };
  pool.query = query;
  pool.connect = async () => ({ query, release() {} });
  try { await run({ entries, pairings, created, writes }); }
  finally { pool.query = originalQuery; pool.connect = originalConnect; }
}

test("withdrawal preserves both participants' scores and does not turn a played match into a bye", () => {
  const entries = [entry(removedId), entry("opponent")];
  const before = computeSeasonStandings(entries, [match], { includeContacts: false });
  entries[0].withdrawn_at = "2026-10-13T00:00:00Z";
  const after = computeSeasonStandings(entries, [match], { includeContacts: false });
  assert.deepEqual(after.map(({ withdrawnAt, ...result }) => result), before.map(({ withdrawnAt, ...result }) => result));
  assert.equal(after.find(row => row.entryId === removedId).withdrawnAt, entries[0].withdrawn_at);
  assert.equal(after.find(row => row.entryId === "opponent").byes, 0);
  assert.ok(after.every(row => !Object.hasOwn(row.user, "telegram")));
});

test("withdrawn entries remain in standings and match labels but leave registration and personal fixtures", async () => {
  await fixture(async () => {
    const publicData = await loadSeasonBundle();
    assert.deepEqual(publicData.entries.map(item => item.id), ["opponent", "other"]);
    assert.deepEqual(publicData.historicalEntries.map(item => item.id), [removedId]);
    assert.equal(publicData.standings.length, 3);
    assert.equal(publicData.standings.find(item => item.entryId === removedId).games, 1);
    assert.equal(pairingEntry(publicData, removedId).team.name, removedId + " Team");
    assert.ok(!Object.hasOwn(publicData.historicalEntries[0].user, "telegram"));
    const personal = await loadSeasonBundle({ id: removedId + "-coach" });
    assert.equal(personal.myEntry, null);
    assert.equal(personal.currentFixture, null);
  });
});

test("admin withdrawal keeps historical matches and scores after another season load", async () => {
  await fixture(async ({ pairings, writes }) => {
    const before = await loadSeasonBundle();
    const response = { writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } };
    await handleSeasonRoutes({ method: "DELETE", headers: { authorization: "Bearer admin" } }, response,
      new URL("http://localhost/api/season/admin/entries/" + removedId));
    assert.equal(response.status, 200);
    assert.ok(response.payload.entries.every(item => item.id !== removedId));
    const after = await loadSeasonBundle();
    assert.deepEqual(after.standings.map(({ withdrawnAt, ...item }) => item), before.standings.map(({ withdrawnAt, ...item }) => item));
    assert.deepEqual(pairings, [match]);
    assert.ok(writes.every(sql => !/DELETE FROM season_(entries|pairings)/.test(sql)));
  }, { withdrawn: false });
});

for (const firstRound of [true, false]) {
  test(`withdrawn participants stay out of the ${firstRound ? "first" : "next"} round draw`, async () => {
    await fixture(async ({ created, pairings }) => {
      const history = structuredClone(pairings);
      await generateSwissRound({ id: "season" });
      assert.deepEqual(new Set(created.flat()), new Set(["opponent", "other"]));
      assert.deepEqual(pairings, history);
    }, { rounds: firstRound ? [] : [round] });
  });
}

test("historical participants render in results and only their existing selector, not new pairings", async () => {
  state.data = { teams: [] };
  setDictionaries({ en: JSON.parse(await readFile(new URL("../src/i18n/en.json", import.meta.url), "utf8")) });
  await fixture(async () => {
    const data = await loadSeasonBundle();
    const table = leagueTableMarkup({ rows: seasonTable(data), phone: false, viewerId: "opponent-coach", signedIn: true, labelledBy: "t" });
    const withdrawnRow = table.split('role="row"').find((row) => row.includes(removedId + " Team"));
    assert.match(withdrawnRow, /g-table__withdrawn">entry withdrawn/);
    assert.doesNotMatch(withdrawnRow, /g-table__link/, "a withdrawn entry leads nowhere");
    assert.equal(seasonTable(data).find((row) => row.entryId === removedId).rank, data.standings.find((row) => row.entryId === removedId).rank,
      "the server's place is kept");
    assert.match(renderSeasonRounds(data), new RegExp(removedId + " Team"));
    const html = renderSeasonRounds(data, true);
    const selectors = [...html.matchAll(/<select[^>]*data-(home|away)[^>]*>([\s\S]*?)<\/select>/g)];
    assert.equal(selectors.length, 2);
    assert.match(selectors.find(item => item[1] === "home")[2], new RegExp('value="' + removedId + '" selected'));
    assert.doesNotMatch(selectors.find(item => item[1] === "away")[2], new RegExp(removedId));
  });
});

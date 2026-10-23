import test from "node:test";
import assert from "node:assert/strict";
import { callApi, seedCoach, seedTeam, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

test("season and coach lists expose current logo references; replacing or removing a logo refreshes all lists", { skip: scratchSkip }, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "logos");
  const id = await seedTeam(client, coach.id);
  const png = "data:image/png;base64,dGVzdA==";
  await client.query("UPDATE saved_teams SET logo_data = $2 WHERE id = $1", [id, png]);
  const season = (await client.query("INSERT INTO seasons (name, status) VALUES ('Logos', 'active') RETURNING id")).rows[0].id;
  await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3)", [season, coach.id, id]);
  async function readTeams() {
    const [guest, own, profile] = await Promise.all([
      callApi("GET", "/api/season"), callApi("GET", "/api/season", { token: coach.token }),
      callApi("GET", `/api/players/${coach.id}`, { token: coach.token }),
    ]);
    for (const response of [guest, own, profile]) assert.equal(response.status, 200);
    return [guest.body.entries[0].team, guest.body.standings[0].team, own.body.myTeams[0], profile.body.teams[0]];
  }
  const initial = await readTeams();
  for (const team of initial) {
    assert.match(team.logoUrl, new RegExp(`^/api/team-logos/${id}\\?v=`));
    assert.equal(team.logoData, null);
    assert.equal(JSON.stringify(team).includes(png), false);
    const image = await callApi("GET", team.logoUrl);
    assert.equal(image.status, 200); assert.equal(image.body.toString(), "test");
  }
  await client.query("UPDATE saved_teams SET logo_data = $2, updated_at = updated_at + interval '1 second' WHERE id = $1", [id, "data:image/png;base64,bmV3"]);
  const changed = await readTeams();
  for (let i = 0; i < changed.length; i++) {
    assert.notEqual(changed[i].logoUrl, initial[i].logoUrl);
    assert.equal((await callApi("GET", changed[i].logoUrl)).body.toString(), "new");
  }
  await client.query("UPDATE saved_teams SET logo_data = NULL WHERE id = $1", [id]);
  for (const team of await readTeams()) assert.equal(team.logoUrl, undefined);
  assert.equal((await callApi("GET", initial[0].logoUrl)).status, 404);
}));

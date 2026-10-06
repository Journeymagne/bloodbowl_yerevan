/** Creates an isolated local preview season without changing existing coaches. */
import { pool, databaseUrl } from "../server/db/pool.mjs";
import { hashPassword } from "../server/auth/session.mjs";
import { matchReference } from "../server/domain/match-reference.mjs";
import { createPreparation } from "../src/domain/match/preparation.mjs";

const databaseHost = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "postgres"].includes(databaseHost)) throw new Error("Preview fixtures may only be created in a local database.");
const data = await matchReference();
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const sources = {};
  for (const [index, side] of ["home", "away"].entries()) {
    const login = `preview-${side}`, baseTeamSlug = index ? "teams/dwarf" : "teams/human";
    const user = (await client.query(`INSERT INTO users (login,login_key,telegram,password_hash) VALUES ($1,$1,$2,$3)
      ON CONFLICT (login_key) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING *`, [login, `@${login}`, hashPassword("preview2026")])).rows[0];
    const reference = data.teams.find(team => team.slug === baseTeamSlug);
    const players = Array.from({ length: index ? 9 : 7 }, (_, number) => ({ id: `preview-${side}-${number}`, number: String(number + 1), name: `${index ? "Rune Guard" : "Lion"} ${number + 1}`,
      rowIndex: [0, 0, 0, 0, 0, 1, 2, 3, 3][number], statMods: {}, extraSkills: [], favouredSkills: [], spp: {}, isCaptain: number === 0, skipNextGame: !index && number > 4 }));
    const roster = { players, teamSlug: baseTeamSlug, teamName: index ? "Drunken Rune Guard" : "Yerevan Lions", treasury: 150,
      dedicatedFans: 2, startingRerolls: index ? 3 : 1, selectedLeague: index ? "Worlds Edge Superleague" : "Old World Classic" };
    let team = (await client.query("SELECT * FROM saved_teams WHERE user_id=$1 AND name=$2", [user.id, roster.teamName])).rows[0];
    if (!team) team = (await client.query("INSERT INTO saved_teams (user_id,name,base_team_slug,roster) VALUES ($1,$2,$3,$4) RETURNING *", [user.id, roster.teamName, baseTeamSlug, JSON.stringify(roster)])).rows[0];
    sources[side] = { user: { id: user.id, login }, team: { id: team.id, name: team.name, revision: team.revision, baseTeamSlug, roster: team.roster } };
  }
  let season = (await client.query("SELECT * FROM seasons WHERE name='Pre-match preview' AND status='preview'")).rows[0];
  if (!season) season = (await client.query("INSERT INTO seasons (name,status,current_round) VALUES ('Pre-match preview','preview',1) RETURNING *")).rows[0];
  const entries = {};
  for (const side of ["home", "away"]) entries[side] = (await client.query(`INSERT INTO season_entries (season_id,user_id,saved_team_id) VALUES ($1,$2,$3)
    ON CONFLICT (season_id,user_id) DO UPDATE SET saved_team_id=EXCLUDED.saved_team_id RETURNING id`, [season.id, sources[side].user.id, sources[side].team.id])).rows[0].id;
  const round = (await client.query(`INSERT INTO season_rounds (season_id,round_number,status) VALUES ($1,1,'started') ON CONFLICT (season_id,round_number) DO UPDATE SET status='started' RETURNING id`, [season.id])).rows[0].id;
  const fixture = (await client.query(`INSERT INTO season_pairings (round_id,table_number,home_entry_id,away_entry_id) VALUES ($1,1,$2,$3)
    ON CONFLICT (round_id,table_number) DO UPDATE SET home_entry_id=EXCLUDED.home_entry_id RETURNING *`, [round, entries.home, entries.away])).rows[0];
  const preparation = createPreparation(sources, data);
  await client.query("INSERT INTO match_preparations (pairing_id,state) VALUES ($1,$2) ON CONFLICT (pairing_id) DO NOTHING", [fixture.id, JSON.stringify(preparation)]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ url: `http://localhost:${process.env.APP_PORT || 3002}/#/games/${fixture.id}/pre-match`, gameId: fixture.id, accounts: ["preview-home", "preview-away"], password: "preview2026" }, null, 2));
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }

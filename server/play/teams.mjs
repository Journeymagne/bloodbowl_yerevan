import { normalizeDraft, teamBySlug } from "../domain/roster.mjs";
import { ensureDraftPlayers, selectedRosterPlayers } from "../../src/domain/roster/players.mjs";
import { playerProfile, isLineman } from "../../src/domain/match/roster.mjs";
import { openingLineup } from "../../src/play/squads.mjs";
import { playerSppTotal } from "../../src/domain/roster/progression.mjs";
import { createMatch } from "../../src/play/model.mjs";

const invalid = message => Object.assign(new Error(message), { status: 400 });
const statNumber = value => /^\d+\+?$/.test(String(value)) ? Number.parseInt(value, 10) : null;

/** A deliberately small read-only view; no account contacts, logos or financial history. */
export function tabletopTeam(row, reference = teamBySlug(row.base_team_slug)) {
  if (!reference) return { id: row.id, name: row.name, race: row.base_team_slug,
    coach: row.coach, players: [], rerolls: 0, unavailable: "Team rules are unavailable." };
  const draft = normalizeDraft(row.roster);
  ensureDraftPlayers(reference, draft);
  const players = selectedRosterPlayers(reference, draft).map(player => {
    const profile = playerProfile(player);
    return { id: player.id, number: player.number, name: player.name, role: player.row.position,
      skills: profile.skills, ma: statNumber(profile.stats.ma), st: statNumber(profile.stats.st),
      ag: statNumber(profile.stats.ag), pa: statNumber(profile.stats.pa), av: statNumber(profile.stats.ar),
      spp: playerSppTotal(reference, player), specialist: !isLineman(player.row), lineman: isLineman(player.row), available: !player.skipNextGame,
      absence: player.temporarilyRetired ? "Retired" : player.skipNextGame ? "Miss next game" : "" };
  });
  return { id: row.id, name: row.name, race: reference.title, baseTeamSlug: row.base_team_slug,
    coach: row.coach, revision: row.revision, players,
    rerolls: Number(draft.startingRerolls) + Number(draft.teamRerolls),
    assistantCoaches: Number(draft.assistantCoaches), cheerleaders: Number(draft.cheerleaders), bribes: Number(draft.bribes) };
}

export function createTeamSource(pool) {
  const select = `SELECT t.id, t.name, t.base_team_slug, t.roster, t.revision, u.login AS coach
    FROM saved_teams t JOIN users u ON u.id = t.user_id`;
  return {
    async catalog() {
      const result = await pool.query(`${select} ORDER BY lower(t.name), t.id`);
      return result.rows.map(row => tabletopTeam(row));
    },
    async start(body) {
      if (!Array.isArray(body?.teams) || body.teams.length !== 2) throw invalid("Choose two league teams.");
      const ids = body.teams.map(team => team?.id);
      if (ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw invalid("Invalid team ID.");
      const result = await pool.query(`${select} WHERE t.id = ANY($1::uuid[])`, [ids]);
      const teams = body.teams.map(selection => {
        const row = result.rows.find(item => item.id === selection.id);
        if (!row) throw invalid("A selected team no longer exists. Refresh the team list.");
        const team = tabletopTeam(row);
        const available = team.players.filter(player => player.available);
        const lineup = selection.lineup ?? openingLineup(available);
        if (!Array.isArray(lineup) || !lineup.length || lineup.length > 7 || new Set(lineup).size !== lineup.length
          || lineup.some(id => !available.some(player => player.id === id))) {
          throw invalid(`${team.name}: choose 1–7 available players. Refresh if the roster has changed.`);
        }
        if (available.filter(player => lineup.includes(player.id) && player.specialist).length > 4) {
          throw invalid(`${team.name}: GATA Sevens allows at most four specialists per drive.`);
        }
        return { ...team, lineup };
      });
      return createMatch(teams);
    },
  };
}

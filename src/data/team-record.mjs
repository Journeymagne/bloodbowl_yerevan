/**
 * What a team's figures are, read from what the server already sends: no
 * endpoint of its own (design spec 3.0 §4). The record, the place, the squares
 * of the season, the last results come from `/api/games` and `/api/season`;
 * the value and the leaders from the saved team and its race.
 *
 * Functions only, no DOM and no `t()`: the screens that show a team (its
 * overview, the list of teams) say these in their own words.
 *
 * A game is read from the side of the team asked about, home or away. A
 * result counts only when the score is confirmed (`isGameResultSubmitted`),
 * and a bye, a match with no opponent, counts in no record.
 */
import { isGameResultSubmitted } from "./games.mjs";
import { ensureDraftPlayers, selectedRosterPlayers } from "../domain/roster/players.mjs";
import { calculateRosterCosts } from "../domain/roster/costs.mjs";
import { playerSppTotal } from "../domain/roster/progression.mjs";
import { normalizeDraft } from "../domain/roster/schema.mjs";

/**
 * The side of `game` that is the team's, and the other one; null when the team
 * is not in the game or has no opponent (a bye).
 *
 * @param {object} game one of the games `/api/games` sends
 * @param {string} teamId
 * @returns {{own: "home"|"away", other: "home"|"away"}|null}
 */
export function gameSides(game, teamId) {
  if (!game || !teamId) return null;
  if (game.home?.team?.id === teamId && game.away) return { own: "home", other: "away" };
  if (game.away?.team?.id === teamId && game.home) return { own: "away", other: "home" };
  return null;
}

/** A side's touchdowns or casualties as a number. */
const count = (game, side, what) => Number(game[`${side}${what}`]);

/**
 * How the game ended for the team, by touchdowns scored on each side; null
 * while the score is not confirmed, and for a bye.
 *
 * @returns {"w"|"d"|"l"|null}
 */
export function gameOutcome(game, teamId) {
  const sides = gameSides(game, teamId);
  if (!sides || !isGameResultSubmitted(game)) return null;
  const own = count(game, sides.own, "Touchdowns");
  const other = count(game, sides.other, "Touchdowns");
  if (own === other) return "d";
  return own > other ? "w" : "l";
}

/** Like `gameOutcome`, but a finished friendly is "t": it is no win or loss of the season. */
export function resultKind(game, teamId) {
  const outcome = gameOutcome(game, teamId);
  return outcome && game.kind === "friendly" ? "t" : outcome;
}

/** The team's league games of this season, with an opponent. */
function seasonGames(games, teamId, seasonId) {
  return games.filter((game) => game.kind === "league" && game.season?.id === seasonId && gameSides(game, teamId));
}

/**
 * Wins, draws and losses in the season's league games: not friendlies, not
 * another season's, not a score nobody confirmed.
 */
export function seasonRecord(games, teamId, seasonId) {
  const record = { wins: 0, draws: 0, losses: 0 };
  const field = { w: "wins", d: "draws", l: "losses" };
  for (const game of seasonGames(games, teamId, seasonId)) {
    const outcome = gameOutcome(game, teamId);
    if (outcome) record[field[outcome]] += 1;
  }
  return record;
}

/**
 * The team's row of the season's table: its place, its points, and how many
 * rows the table has. The count is the table's length, withdrawn rows too: they
 * keep their rank on the server, so a team below one is "3 of 3", not "3 of 2".
 * A team with no row, or one that withdrew, has no place.
 *
 * @param {{standings?: object[]}|null} seasonData the answer of `/api/season`
 * @returns {{rank: number, points: number, of: number}|null}
 */
export function standingOf(seasonData, teamId) {
  const standings = seasonData?.standings;
  if (!Array.isArray(standings)) return null;
  const row = standings.find((standing) => standing.team?.id === teamId && !standing.withdrawnAt);
  return row ? { rank: row.rank, points: row.points, of: standings.length } : null;
}

/**
 * One square for every league match of the season the team has an opponent
 * in, round by round: its result, or none while it is not played; `current`
 * marks the match the page is about.
 *
 * @param {string|null} [currentGameId]
 * @returns {{gameId: string, round: number, result: "w"|"d"|"l"|null, current: boolean}[]}
 */
export function seasonPager(games, teamId, seasonData, currentGameId = null) {
  const seasonId = seasonData?.season?.id;
  if (!seasonId) return [];
  return seasonGames(games, teamId, seasonId)
    .sort((first, second) => first.roundNumber - second.roundNumber)
    .map((game) => ({ gameId: game.id, round: game.roundNumber, result: gameOutcome(game, teamId), current: game.id === currentGameId }));
}

/** When a game was settled, as a number to sort by; a stamp that cannot be read is the oldest. */
const settledAt = (game) => Date.parse(game.confirmedAt ?? game.updatedAt) || 0;

/** "2–1": the team's figure first. */
const pairOf = (game, sides, what) => `${count(game, sides.own, what)}–${count(game, sides.other, what)}`;

/**
 * The team's last finished matches, the newest first, at most `limit`:
 * league and friendly alike (a friendly is marked, and has no round).
 *
 * @returns {{gameId: string, result: "w"|"d"|"l"|"t", opponent: string, round: number|null, friendly: boolean, score: string, cas: string}[]}
 */
export function recentResults(games, teamId, limit) {
  return games
    .filter((game) => resultKind(game, teamId))
    .sort((first, second) => settledAt(second) - settledAt(first))
    .slice(0, limit)
    .map((game) => {
      const sides = gameSides(game, teamId);
      const friendly = game.kind === "friendly";
      return {
        gameId: game.id,
        result: resultKind(game, teamId),
        opponent: game[sides.other].team?.name ?? "",
        round: friendly ? null : game.roundNumber,
        friendly,
        score: pairOf(game, sides, "Touchdowns"),
        cas: pairOf(game, sides, "Casualties"),
      };
    });
}

/**
 * A saved team's roster as a draft the domain can count, read into a copy.
 * `normalizeSavedRoster` (data/roster-draft.mjs) does the same but then puts
 * the draft in the team's `roster`; a screen that only looks at a team must
 * leave the blob as the server sent it.
 */
function rosterOf(savedTeam, raceTeam) {
  const draft = normalizeDraft(savedTeam?.roster ?? {});
  ensureDraftPlayers(raceTeam, draft);
  return draft;
}

/**
 * The team's value: what its roster costs, without the dedicated fans. Null
 * when the race is not known.
 *
 * @param {object} savedTeam a team as `/api/teams` sends it
 * @param {object|null} raceTeam the race's page in the reference data
 * @returns {number|null}
 */
export function teamValue(savedTeam, raceTeam) {
  if (!raceTeam) return null;
  return calculateRosterCosts(raceTeam, rosterOf(savedTeam, raceTeam)).total;
}

/** The counters a leader is picked by, in the order the overview lists them. */
const LEADER_COUNTERS = [
  ["spp", (raceTeam, player) => playerSppTotal(raceTeam, player)],
  ["td", (_raceTeam, player) => player.spp.touchdowns],
  ["cas", (_raceTeam, player) => player.spp.casualties],
  ["comp", (_raceTeam, player) => player.spp.completions],
];

/**
 * The player ahead in each counter: the total of star player points, touchdowns,
 * casualties, completions. A tie goes to the first in the roster; a counter
 * nobody has a point in is left out.
 *
 * @returns {{key: "spp"|"td"|"cas"|"comp", name: string, number: string, position: string, value: number}[]}
 */
export function teamLeaders(savedTeam, raceTeam) {
  if (!raceTeam) return [];
  const players = selectedRosterPlayers(raceTeam, rosterOf(savedTeam, raceTeam));
  const leaders = [];
  for (const [key, read] of LEADER_COUNTERS) {
    let best = null;
    let bestValue = 0;
    for (const player of players) {
      const value = read(raceTeam, player);
      if (value > bestValue) [best, bestValue] = [player, value];
    }
    if (best) leaders.push({ key, name: best.name, number: best.number, position: best.row.position, value: bestValue });
  }
  return leaders;
}

/** The first letters of the first two words, capitals: "Ashgrove Wardens" is "AW". A name with no letters is "?". */
export function teamInitials(name) {
  const initials = String(name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0].toUpperCase());
  return initials.join("") || "?";
}

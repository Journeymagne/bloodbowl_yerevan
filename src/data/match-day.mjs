/**
 * What the matches page and the board read beyond the games: the opponent's team, from its public page (spec 3.0
 * §4: the matches tab is built on the client), and the team's match records.
 *
 * An opponent read is remembered for the coach who read it, the game as it stands (`updatedAt`) and the side read
 * (one game, seen from either team, has two opponents), so a page drawn again asks once; a new start or score
 * reads again. What is remembered lasts a visit (pre-flight L11): a screen calls `forgetOpponents()` as it is
 * entered, since a hire or an injury marked on the opponent's roster does not move the game's `updatedAt`. A
 * refusal is never remembered: the next ask reads again.
 */
import { refusalText } from "../core/api.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { gameSides } from "./team-record.mjs";

/** `coach:game:updatedAt:opponent` → the read, on its way or answered with a team. */
const opponents = new Map();

/** Forget every opponent read: a screen calls it as a visit begins (and a test between its cases). */
export function forgetOpponents() {
  opponents.clear();
}

async function readTeamPage(user, team) {
  try {
    const answer = await apiRequest(`/api/players/${encodeURIComponent(user.id)}/teams/${encodeURIComponent(team.id)}`);
    return answer?.team && typeof answer.team === "object" ? { team: answer.team } : { error: t("request.noAnswer") };
  } catch (error) {
    return { error: refusalText(error) };
  }
}

/**
 * The team the game puts against `teamId`, as its coach's public page has it.
 *
 * @param {object|null} game one of the games `/api/games` sends
 * @param {string} teamId
 * @returns {Promise<{team: object}|{error: string}|null>} null when the game has no opponent for the team (a bye,
 *   another team's game); a refusal or an answer with no team in the words the page says it with
 */
export function readOpponentTeam(game, teamId) {
  const sides = gameSides(game, teamId);
  if (!sides) return Promise.resolve(null);
  const other = game[sides.other];
  const key = `${state.auth.currentUser?.id ?? ""}:${game.id}:${game.updatedAt ?? ""}:${other.team.id}`;
  if (opponents.has(key)) return opponents.get(key);
  const read = readTeamPage(other.user, other.team).then((answer) => {
    if (answer.error && opponents.get(key) === read) opponents.delete(key);
    return answer;
  });
  opponents.set(key, read);
  return read;
}

/**
 * The team's records not settled yet and the revision they were read at (`GET /api/teams/:id/events`), for a live
 * match's «Match records · N».
 *
 * @param {string} teamId
 * @returns {Promise<{events: object[], revision: number}|{error: string}>}
 */
export async function readTeamRecords(teamId) {
  try {
    const { events, revision } = (await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/events`)) ?? {};
    return Array.isArray(events) ? { events, revision } : { error: t("request.noAnswer") };
  } catch (error) {
    return { error: refusalText(error) };
  }
}

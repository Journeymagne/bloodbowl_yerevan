/**
 * The public pages of the league's coaches: a coach and his teams, one team with the skills its site rolls came up with.
 *
 * Each read answers what it found or why not: a refusal in the words the page says it with (`refusalText`) and the
 * server's code, which tells a coach the league does not have (`PLAYER_NOT_FOUND`) from a read that failed
 * (pre-flight L8, L9). An answer without what it should hold is a server that did not answer. The opponents a match
 * card reads are data/match-day.mjs's (stage 09a): one read for each game as it stands, the team alone.
 */
import { refusalText } from "../core/api.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";

/** A refusal as the page says it, with the server's code ("" for none: no answer, no connection). */
const refused = (error) => ({ error: refusalText(error), code: error?.code ?? "" });

/** An answer without what it should hold. */
const unanswered = () => ({ error: t("request.noAnswer"), code: "" });

/**
 * A coach's team as anyone signed in sees it (`GET /api/players/:uid/teams/:tid`): the coach, the team, and its used
 * random-skill rolls, their dice' skills alone (stage 10, Task 1). Rolls that are not a list are none.
 *
 * @param {string} userId @param {string} teamId
 * @returns {Promise<{user: object, team: object, rolls: object[]}|{error: string, code: string}>}
 */
export async function readCoachTeam(userId, teamId) {
  try {
    const answer = await apiRequest(`/api/players/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}`);
    if (!answer?.team || typeof answer.team !== "object" || !answer.user || typeof answer.user !== "object") return unanswered();
    return { user: answer.user, team: answer.team, rolls: Array.isArray(answer.rolls) ? answer.rolls : [] };
  } catch (error) {
    return refused(error);
  }
}

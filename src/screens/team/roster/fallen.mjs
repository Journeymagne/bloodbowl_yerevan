/**
 * A team's fallen on the server (stage 03's routes): who died, a death a coach marks, and its undo. Neither is a save of
 * the roster: a death goes on the revision the roster's queue stands on, an undo names its record, and the screen sends
 * either only when the queue has nothing waiting. An answer that does not come is never a reason to send again — the
 * screen reads the roster back; a second press is safe anyway, since a death on an old revision meets 409 and an undo of
 * a record already gone meets 404.
 *
 * One write at a time per team, the death and the undo alike: a press while one is on its way sends nothing
 * (`ignored`), where a tap of the match waits its turn (taps.mjs), since a tap is a step of a counter and a death is
 * a decision the coach took on the roster they saw.
 */
import { ApiError, refusalText } from "../../../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../../../core/api-client.mjs";
import { t } from "../../../core/i18n.mjs";
import { refusalWithRules, unanswered } from "../../../data/teams.mjs";

/** The teams a write of the fallen is on its way for. */
const writing = new Set();

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** A record of a death as every line of the fallen reads it: an object with its `id` (the key of its line, the one an undo names). */
const isRecord = (value) => isObject(value) && typeof value.id === "string";

/** The team as the queue and the list take it from an answer: its `id`, and the whole `revision` the next write stands on. */
const isTeam = (value) => isObject(value) && typeof value.id === "string" && Number.isInteger(value.revision);

/** It is not known whether the server wrote it: the screen reads the roster again, and the write is not sent again. */
const lost = () => ({ refusal: t("teamRoster.fallen.lost"), code: null, lost: true });

/** The server's words for a refusal and the rules it names; a body that is not the list the server sends still has its code's words. */
function wordsOf(error) {
  try {
    return refusalWithRules(error);
  } catch {
    return refusalText(error);
  }
}

/**
 * What a failed request comes to. Only the server's own refusal is told in its words; no answer, and anything that is
 * not an `ApiError` (a body that could not be built: a bug is no reason to show the reader a JS message), is a write
 * whose fate is not known. `refused` may add to the words of a refusal.
 */
function failure(error, refused) {
  if (!(error instanceof ApiError) || unanswered(error)) return lost();
  const refusal = { refusal: wordsOf(error), code: error.code ?? null };
  return refused ? refused(error, refusal) : refusal;
}

/**
 * One write of a team's fallen, whatever comes of it: never throws, and the team is free to write again once its
 * answer is known (before the caller is told). The request is built inside `send`, so whatever cannot be built (an id
 * that cannot be a path) comes back as a write whose fate is not known, not as a throw.
 * @param {string} teamId
 * @param {Function} send the request (it resolves with the answer's body); asked only after the token and the team's turn are
 * @param {(answer: object) => object|null} take what the answer comes to; null where it holds no word of the server's
 * @param {(error: ApiError, refusal: object) => object} [refused] what is added to the words of a refusal
 */
async function write(teamId, send, take, refused) {
  if (writing.has(teamId)) return { ignored: true };
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab"), code: null };
  writing.add(teamId);
  try {
    // A 2xx whose team or record cannot be used (none, or without the id and revision they are read by: a proxy's page,
    // which api.mjs reads as `{}`) is not the server's word that it was written.
    return take(await send()) ?? lost();
  } catch (error) {
    return failure(error, refused);
  } finally {
    writing.delete(teamId);
  }
}

/** Whether a write of the team's fallen (a death or an undo) is on its way. */
export function fallenWriting(teamId) {
  return writing.has(teamId);
}

/**
 * The team's deaths, newest first, as `GET …/fallen` sends them. An answer whose `fallen` is not a list of records
 * (each an object with a text `id`) is a read that failed, not a team with no dead: the screen would draw from it.
 * @param {string} teamId
 * @returns {Promise<{fallen: object[]} | {error: string}>}
 */
export async function readFallen(teamId) {
  try {
    const answer = await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/fallen`);
    const fallen = answer?.fallen;
    if (!Array.isArray(fallen) || !fallen.every(isRecord)) return { error: t("request.noAnswer") };
    return { fallen };
  } catch (error) {
    return { error: refusalText(error) };
  }
}

/**
 * A player's death outside a match (`POST …/players/:pid/death`): he leaves the roster and is kept with the cause. It
 * goes on the revision the roster is on; another device's save since is a 409, which comes back with the server's team.
 * @param {string} teamId @param {string} playerId
 * @param {{cause: string, revision: number}} death
 * @returns {Promise<{team: object, fallen: object} | {refusal: string, code: string|null, conflict?: object|null, lost?: true} | {ignored: true}>}
 *   the team as it is now and the record of his death; or why not: the refusal in words and its code (`code` null where
 *   the server said none: another tab's coach, a lost answer), `conflict` the server's team where it was saved
 *   elsewhere (null when the 409 carried none), `lost` where it is not known whether he died (read the roster again);
 *   or `ignored` where a write of the team's fallen is on its way and nothing was sent
 */
export function markDeath(teamId, playerId, death) {
  return write(
    teamId,
    () => {
      const path = `/api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}/death`;
      return apiRequest(path, { method: "POST", body: JSON.stringify({ cause: death.cause, revision: death.revision }) });
    },
    (answer) => (isTeam(answer?.team) && isRecord(answer.fallen) ? { team: answer.team, fallen: answer.fallen } : null),
    (error, refusal) => (error.code === "TEAM_SAVED_ELSEWHERE" ? { ...refusal, conflict: isObject(error.payload?.team) ? error.payload.team : null } : refusal),
  );
}

/**
 * A death undone (`DELETE …/fallen/:fid`): the player is back on the roster and the record is forgotten. It names its
 * record and no revision, so there is no conflict to settle: a record already gone is a 404.
 * @param {string} teamId @param {string} fallenId
 * @returns {Promise<{team: object} | {refusal: string, code: string|null, lost?: true} | {ignored: true}>}
 */
export function undoDeath(teamId, fallenId) {
  return write(
    teamId,
    () => apiRequest(`/api/teams/${encodeURIComponent(teamId)}/fallen/${encodeURIComponent(fallenId)}`, { method: "DELETE" }),
    (answer) => (isTeam(answer?.team) ? { team: answer.team } : null),
  );
}

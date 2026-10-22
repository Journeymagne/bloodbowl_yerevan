/**
 * The coach's friendly challenges (stage 09c): the one read and the two writes of `/api/challenges`.
 *
 * - `readChallenges` reads the challenges both ways and the coaches who can be challenged, each with his teams'
 *   names and races (stage 09c, Task 1). The coach's own teams the answer carries too are not handed on: the page
 *   takes them from `state.myTeams`, as every 3.0 screen does.
 * - `sendChallenge` sends one to a coach with one of the coach's teams; `answerChallenge` accepts one with a team
 *   (the server makes the friendly and names it), declines one sent to the coach, or cancels one the coach sent.
 *
 * Each call answers what it found or why not: a refusal in the words the page says it with (`refusalText`) and the
 * server's code. A write's refusal also says whether it is `lost`: no answer came to stand behind it — the
 * connection dropped, it took too long, the server failed, a proxy answered with none of the server's words
 * (`unanswered`) — so it may have been done all the same. The screen never sends it again by itself: it reads
 * the list and says what came of it. An answer without what it should hold is a server that did not answer; for a
 * write, that is a lost one too.
 */
import { refusalText } from "../core/api.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { unanswered } from "./teams.mjs";

/** What a coach may do with a challenge, as the server's paths name it. */
const ACTIONS = new Set(["accept", "decline", "cancel"]);

/** A read refused, in the page's words, with the server's code ("" for none: no answer, no connection). */
const refusedRead = (error) => ({ error: refusalText(error), code: error?.code ?? "" });

/** A write refused, and whether it is lost: no answer came, so it may have been done. */
const refusedWrite = (error) => ({ ...refusedRead(error), lost: unanswered(error) });

/** An answer without what it should hold: the server did not answer. */
const noAnswer = () => ({ error: t("request.noAnswer"), code: "" });

/** A write's answer without what it should hold: lost, as a write no answer came to. */
const lostAnswer = () => ({ ...noAnswer(), lost: true });

/** A string that names something, or "" for anything else. */
const idOf = (value) => (typeof value === "string" ? value : "");

/** POST a write's body as JSON. */
const post = (path, body) => apiRequest(path, { method: "POST", body: JSON.stringify(body) });

/**
 * The coach's challenges (the newest hundred, both ways) and the coaches he can challenge: `GET /api/challenges`.
 *
 * @returns {Promise<{challenges: object[], opponents: object[]}|{error: string, code: string}>}
 */
export async function readChallenges() {
  try {
    const answer = await apiRequest("/api/challenges");
    if (!Array.isArray(answer?.challenges) || !Array.isArray(answer?.opponents)) return noAnswer();
    return { challenges: answer.challenges, opponents: answer.opponents };
  } catch (error) {
    return refusedRead(error);
  }
}

/**
 * Challenge a coach with one of the coach's teams: `POST /api/challenges`. The server refuses a second one
 * waiting from the same team to the same coach (409 `CHALLENGE_ALREADY_SENT`), a coach with no team (404
 * `CHALLENGE_OPPONENT_UNAVAILABLE`) and a team not the coach's (404 `TEAM_NOT_FOUND`).
 *
 * @param {{opponentId: string, teamId: string}} challenge
 * @returns {Promise<{id: string}|{error: string, code: string, lost: boolean}>}
 */
export async function sendChallenge({ opponentId, teamId }) {
  try {
    const id = idOf((await post("/api/challenges", { opponentId, teamId }))?.id);
    return id ? { id } : lostAnswer();
  } catch (error) {
    return refusedWrite(error);
  }
}

/**
 * Answer a challenge: `POST /api/challenges/:id/<accept|decline|cancel>`. An accept names the team to play
 * and is answered with the friendly the server made (`gameId`; the same one again for an accept repeated); an
 * accept that names no match is lost. A decline and a cancel send nothing and are answered with none. A
 * challenge no longer waiting is refused 409 `CHALLENGE_CLOSED`.
 *
 * @param {string} id @param {"accept"|"decline"|"cancel"} action @param {string} [teamId] the team to play, for an accept
 * @returns {Promise<{gameId: string|null}|{error: string, code: string, lost: boolean}>}
 */
export async function answerChallenge(id, action, teamId = "") {
  if (!ACTIONS.has(action)) throw new Error(`unknown challenge action: ${action}`);
  try {
    const answer = await post(`/api/challenges/${encodeURIComponent(id)}/${action}`, action === "accept" ? { teamId } : {});
    const gameId = idOf(answer?.gameId) || null;
    return action === "accept" && !gameId ? lostAnswer() : { gameId };
  } catch (error) {
    return refusedWrite(error);
  }
}

/**
 * The administration's data (stage 12): what its screens read, and the one way every one of them writes.
 *
 * A write of the administration keeps three rules, here and nowhere else (decision 21; Review Focus 1):
 *
 * 1. Whose token. It asks `sessionTokenHolds()` before anything else: when another tab has signed in or out since the
 *    page read its session, nothing is sent (stage 05, R12), since the request would go out as whoever that tab
 *    signed in, under the admin this page shows.
 * 2. One on its way. While a write is out, another sends nothing (`{ignored: true}`): a second press, or another
 *    button of the screen. The screen's busy state says so; this makes sure of it. A season write's way ends when the
 *    season it changed is in place, read again if need be.
 * 3. A lost answer is not sent again. No connection, a timeout, a server that failed (a 5xx: its write may have
 *    committed before it did) or a proxy's answer without the server's words may each mean the write was applied: the
 *    write says so (`unknown`, `administration.mayHaveWritten`) and the screen reads again and shows what the server
 *    holds. A season write reads the season itself.
 *
 * A refusal is the server's own words (`refusalText`), with its code, which some screens tell apart (a login taken, a
 * coach not there). Reads go out whatever the token and whatever is on its way: a read writes nothing. Each answers
 * what it found or why not; an answer without what it should hold is a server that did not answer.
 */
import { refusalText } from "../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { loadSeason, replaceSeasonData } from "../screens/season/season-data.mjs";
import { unanswered } from "./teams.mjs";

/** The write on its way, or null: one at a time for the page, so for the screen on it. */
let writing = null;

/** An answer without what it should hold. */
const empty = () => ({ error: t("request.noAnswer"), code: "" });

/** What a write that did not go through says: that it may have been written, or the server's refusal. */
function refused(error) {
  if (unanswered(error)) return { refusal: t("administration.mayHaveWritten"), code: error?.code ?? "", unknown: true };
  return { refusal: refusalText(error), code: error?.code ?? "", unknown: false };
}

/** A read: the answer, or why not in the words the page says it with and the server's code ("" for none: no answer, no connection). */
async function read(path) {
  try {
    return { answer: await apiRequest(path) };
  } catch (error) {
    return { refusal: refusalText(error), code: error?.code ?? "", unknown: false };
  }
}

/**
 * One write, by the three rules above. `settle(outcome)` is what follows the answer before the way is free again: the
 * season put in place, or read again.
 * @returns {Promise<{answer: object}|{refusal: string, code: string, unknown: boolean}|{ignored: true}>}
 */
async function write(path, { method, body }, settle = async () => {}) {
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab"), code: "OTHER_TAB", unknown: false };
  if (writing) return { ignored: true };
  const mine = {};
  writing = mine;
  try {
    let outcome;
    try {
      outcome = { answer: await apiRequest(path, { method, body: JSON.stringify(body ?? {}) }) };
    } catch (error) {
      outcome = refused(error);
    }
    await settle(outcome);
    return outcome;
  } finally {
    if (writing === mine) writing = null;
  }
}

/**
 * Ask the administration's API. A GET is a read: it goes, and answers or says why not. Anything else is a write,
 * kept by the three rules above: another tab's token sends nothing (`code: "OTHER_TAB"`); a write already on its way
 * sends nothing either (`{ignored: true}`, and the screen draws nothing new); an answer that does not come back is
 * `unknown`, never sent again. `body` goes as JSON. Never throws on a refusal.
 * @param {string} path
 * @param {{method?: string, body?: object}} [options]
 * @returns {Promise<{answer: object}|{refusal: string, code: string, unknown: boolean}|{ignored: true}>}
 */
export function adminRequest(path, { method = "GET", body } = {}) {
  return method === "GET" ? read(path) : write(path, { method, body });
}

/**
 * The season as the server holds it now, for whoever is signed in. A read already on its way may have gone before the
 * write did: it is waited for, and one more is sent.
 */
async function readSeasonAgain() {
  if (state.season.loading) await loadSeason();
  await loadSeason(true);
}

/**
 * A write that changes the season (a round, a pairing, a result, an entry, the playoff places). An answer that is the
 * season (`/api/season`'s shape) is put in `state.season` as it came, for the admin who sent it; any other answer (a
 * game's), and one that did not come back, have the season read again, so the screen patches from what the server
 * holds. A read of the season already on its way (a screen's refresh, the session's change) may have gone before the
 * write did: the answer waits for it to land, and is put in place after it, so the older season never stands over the
 * write's. The way is free once the season is in place: a press while it is read, or while that read is waited for,
 * sends nothing.
 * @param {string} path @param {{method?: string, body?: object}} [options] a POST unless said
 * @returns {Promise<{answer: object}|{refusal: string, code: string, unknown: boolean}|{ignored: true}>} as adminRequest's
 */
export function seasonWrite(path, { method = "POST", body } = {}) {
  const userId = state.auth.currentUser?.id;
  const sender = () => state.auth.currentUser?.id === userId;
  return write(path, { method, body }, async ({ answer, unknown }) => {
    if (answer?.season && sender()) {
      if (state.season.loading) await loadSeason();
      // Signed out or in as someone else while that read landed: the answer is not theirs; read theirs instead.
      if (sender()) return replaceSeasonData(answer);
    }
    if (answer || unknown) await readSeasonAgain();
  });
}

/**
 * The league's coaches (`GET /api/admin/users`), each with the count of the teams and the latest change to one.
 * @returns {Promise<{users: object[]}|{error: string, code: string}>}
 */
export async function readAdminUsers() {
  const { answer, refusal, code } = await read("/api/admin/users");
  if (refusal !== undefined) return { error: refusal, code };
  return Array.isArray(answer?.users) ? { users: answer.users } : empty();
}

/**
 * One coach (`GET /api/admin/users/:id`): the account and the teams. Teams that are not a list are none; a coach the
 * league does not have is the server's 404 (`USER_NOT_FOUND`).
 * @param {string} userId
 * @returns {Promise<{user: object, teams: object[]}|{error: string, code: string}>}
 */
export async function readAdminUser(userId) {
  const { answer, refusal, code } = await read(`/api/admin/users/${encodeURIComponent(userId)}`);
  if (refusal !== undefined) return { error: refusal, code };
  if (!answer?.user || typeof answer.user !== "object") return empty();
  return { user: answer.user, teams: Array.isArray(answer.teams) ? answer.teams : [] };
}

/**
 * Every score that waits for a confirmation (`GET /api/admin/awaiting`): the season's league games of any round, and
 * the friendlies.
 * @returns {Promise<{games: object[]}|{error: string, code: string}>}
 */
export async function readAwaiting() {
  const { answer, refusal, code } = await read("/api/admin/awaiting");
  if (refusal !== undefined) return { error: refusal, code };
  return Array.isArray(answer?.games) ? { games: answer.games } : empty();
}

/**
 * The signed-in coach's settings, as the server keeps them (`user.preferences`).
 *
 * They arrive with `/me` (data/session.mjs) and are written here, by the key:
 * `PATCH /api/auth/preferences` merges what it is sent into what is stored.
 * Nothing in this module throws or draws; a refused or lost write is `null`, and
 * the screen that asked decides whether to say so.
 *
 * The theme is the first setting to travel. The cache in this browser
 * (`gata-league-palette`) paints the page before anything loads, and the account
 * decides what that cache says once the coach is known — so the same palette
 * follows the coach to the next device. Two rules keep that from going wrong:
 * a palette the account holds always wins, and a browser that never chose one
 * has nothing to give, so it does not write its default over another device's
 * choice. A palette the account itself applied here is not this browser's choice
 * either (`setThemeChoice(…, {fromAccount})`), or it would follow the coach who
 * signs out to the next coach's account.
 */
import { apiRequest } from "../core/api-client.mjs";
import { state } from "../core/state.mjs";
import { choiceFromPreferences, isThemeChosen, setThemeChoice, themeChoice, themePreferences } from "../core/theme.mjs";

/**
 * Change the keys named in `patch` and keep the rest, for the coach who is signed in.
 * @param {object} patch `{themeMode?, lightPalette?, darkPalette?, activeTeamId?, locale?}`
 * @returns {Promise<object|null>} the settings the server now holds, which are also
 *   `state.auth.currentUser.preferences`; null for a guest, a refusal (400, a team that
 *   is not theirs: 404), a lost connection, or a coach who left while it was on its way
 */
export async function savePreferences(patch) {
  const user = state.auth.currentUser;
  if (!user) return null;
  try {
    const answer = await apiRequest("/api/auth/preferences", { method: "PATCH", body: JSON.stringify(patch) });
    const saved = answer?.preferences;
    // Whoever is signed in now, if anyone, is not the coach this was for.
    if (!saved || typeof saved !== "object" || state.auth.currentUser?.id !== user.id) return null;
    state.auth.currentUser.preferences = saved;
    return saved;
  } catch {
    return null;
  }
}

/**
 * The theme's writes to the account: one request on its way, and at most one more behind it.
 * `sending` and `waiting` are `{userId, body, done, finish}`; `done` is what `saveTheme` hands back.
 */
let sending = null;
let waiting = null;

const isCoach = (userId) => state.auth.currentUser?.id === userId;
const sameBody = (one, other) => one.themeMode === other.themeMode && one.lightPalette === other.lightPalette && one.darkPalette === other.darkPalette;

/** What came of one request: its answer, unless the coach it was for is no longer the one signed in. */
async function attempt({ userId, body }) {
  if (!isCoach(userId)) return "gone";
  const saved = await savePreferences(body);
  if (!isCoach(userId)) return "gone";
  return saved ? "saved" : "failed";
}

/**
 * Send one write, then the one that waited behind it, if any. An answer with a newer pick behind it is
 * not the final word, saved or not: it is "superseded", and only the last write reports.
 * The queue never stays stuck: whatever `attempt` does, the next write goes.
 */
async function transmit(write) {
  sending = write;
  let result = await attempt(write).catch(() => "failed");
  sending = null;
  const next = waiting;
  waiting = null;
  if (next) {
    if (result !== "gone" && next.userId === write.userId) result = "superseded";
    transmit(next);
  }
  write.finish(result);
}

function queued(userId, body) {
  const write = { userId, body };
  write.done = new Promise((finish) => { write.finish = finish; });
  return write;
}

/**
 * Write the theme to the signed-in coach's account, one request at a time and the latest pick last:
 * a pick made while one is on its way waits for it, and a newer pick takes the place of the one
 * waiting. The same choice as the one on its way is that request, so it is not sent twice. The coach is
 * looked at before a request goes out and again when it comes back, so nothing is written for, or said
 * to, a coach who left meanwhile.
 *
 * Settings and the sync after sign-in both write here, so the two never race.
 * @param {import("../core/theme.mjs").ThemeChoice} choice
 * @returns {Promise<"saved"|"failed"|"superseded"|"gone">} the account took it; it did not (a refusal, a lost
 *   connection) and nothing newer has been asked; a newer pick took its place; the coach left (or there was none).
 *   Never rejects.
 */
export function saveTheme(choice) {
  const userId = state.auth.currentUser?.id;
  if (userId === undefined) return Promise.resolve("gone");
  const body = themePreferences(choice);
  if (sending?.userId === userId && sameBody(sending.body, body)) {
    // What is on its way already says this, so whatever waited behind it is not the latest any more.
    waiting?.finish("superseded");
    waiting = null;
    return sending.done;
  }
  const write = queued(userId, body);
  if (!sending) {
    transmit(write);
    return write.done;
  }
  waiting?.finish("superseded");
  waiting = write;
  return write.done;
}

/**
 * Settle the theme between this browser and the coach's account, now that the coach is known.
 *
 * A palette in the account is applied (the page repaints before this returns to its
 * caller), as the account's and not as this browser's choice; a field it lacks is this
 * browser's. An account with no palette is given this browser's choice, all three keys at
 * once, but only a choice the reader actually made — never the default, or a coach who
 * signs in first on a new device would wipe the palette they picked on another, and never
 * another coach's palette that happens to be on the page. Two syncs for the same coach
 * before the write is answered make one write.
 * @returns {Promise<void>} resolves once the account is written; never rejects
 */
export async function syncThemeWithAccount() {
  const user = state.auth.currentUser;
  if (!user) return;
  const accountChoice = choiceFromPreferences(user.preferences, themeChoice());
  if (accountChoice) {
    setThemeChoice(accountChoice, { fromAccount: true });
    return;
  }
  if (isThemeChosen()) await saveTheme(themeChoice());
}

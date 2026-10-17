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

/** The theme write a sync has on its way, and whose it is: a second sync for the same coach joins it. */
let inFlight = null;

function writeTheme(user) {
  if (inFlight?.userId === user.id) return inFlight.done;
  const write = { userId: user.id };
  write.done = savePreferences(themePreferences(themeChoice())).finally(() => {
    if (inFlight === write) inFlight = null;
  });
  inFlight = write;
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
  if (isThemeChosen()) await writeTheme(user);
}

/**
 * The session: who is signed in, and the one place the app hears it change.
 *
 * Only a 401 means there is no session; a token survives an offline start; the
 * login answer carries no preferences, so /me always follows.
 *
 * A dead token is not a 401 everywhere. `GET /api/auth/me` answers it with 200
 * `{user: null}` (server/routes/auth.mjs); `GET /api/teams` is the one of the
 * pair that answers 401. And the api-client's 401 hook stays quiet while no one
 * is signed in, which at start is always. So `loadSession` reads either answer
 * as "no session" and wipes the token itself.
 *
 * Every change ends in one notice to the `onSessionChange` listeners; the app
 * draws from there, so no caller here renders anything.
 *
 * The token is the browser's, and every tab of it shares one. A tab that signs
 * out, or in as someone else, changes it under the others: each page follows
 * the token it finds (`followSessionAcrossTabs`), and the writes to an account
 * ask first whether it is still the one the session was read with
 * (`sessionTokenHolds`, core/api-client.mjs).
 */
import { API_ERROR, errorText } from "../core/api.mjs";
import { apiRequest, authToken, rememberSessionToken, setAuthToken, setOnTokenMoved, tokenMoved } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { setReturn } from "../core/return-to.mjs";
import { state } from "../core/state.mjs";
import { isThemeChosen, setThemeChoice, themeChoice } from "../core/theme.mjs";
import { clearActiveTeamCache, resetActiveTeam } from "./active-team.mjs";
import { setMyTeams, setMyTeamsUnread } from "./teams.mjs";

const listeners = new Set();

/** @param {() => void} listener @returns {() => void} what removes it again */
export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tell every listener, each on its own: the first screen is drawn by one, and
 * a screen that throws must not stop the rest, nor the caller (at start, the
 * frame's wiring comes after `loadSession`).
 */
function announce() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

/** Everything the coach loaded as themselves, back to nothing loaded (as signing out did in 2.x). */
function resetCoachSlices() {
  state.myTeams = { items: [], loaded: false, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  state.admin = { users: [], loaded: false, loading: false, error: "", editingTeams: new Map() };
  state.season = { data: null, loaded: false, loading: false, error: "" };
  // Last, and through active-team.mjs: its listeners (the header) hear it, with the rest already gone.
  resetActiveTeam();
}

/**
 * The coach this page showed has left it (signed out, signed out by a 401, or replaced by the coach another
 * tab signed in). A palette on the page now is theirs: their account gave it, or was given it by the sync
 * after they signed in, or by their own pick in Settings. So it is marked as the account's, and is not this
 * browser's to give the next coach's empty account (R11, revising R6's edge). A guest's own pick, made
 * before anyone signed in, stays this browser's and goes to the account it signs into.
 * @param {object|null} user who was signed in
 */
function coachLeft(user) {
  if (user && isThemeChosen()) setThemeChoice(themeChoice(), { fromAccount: true });
}

const refusedAs = (answer, kind) => answer.status === "rejected" && answer.reason?.kind === kind;

/**
 * What `/me` and `/api/teams`, settled, say together. Only the server saying
 * no one (a 401 on either, or `user: null`) makes a guest; a 403 on `/me`, a
 * lost answer or one with no `user` at all (an unreadable body comes back as
 * `{}`) is "offline". The session is `/me`'s: a coach it names is signed in
 * whatever became of the list, which is then not read (`setMyTeamsUnread`).
 */
function statusOf(me, teams) {
  if (refusedAs(me, API_ERROR.UNAUTHORIZED) || refusedAs(teams, API_ERROR.UNAUTHORIZED)) return "guest";
  if (me.status === "fulfilled" && me.value?.user === null) return "guest";
  if (me.status === "rejected" || !me.value?.user) return "offline";
  return "signed-in";
}

/** What kept the last load from reading the session: the first failure of the pair, or null (none, or an answer with no coach in it). */
let failure = null;

/**
 * What to tell a coach whose session the last load could not read. A lost or a slow
 * connection is said as such, and so is maintenance; anything else (a 500, a 503 that is
 * not maintenance, a 403, an answer with no coach in it) is the server's: "no connection"
 * would send the coach to check a network that works.
 */
export function sessionFailureText() {
  const kind = failure?.kind;
  if (kind === API_ERROR.OFFLINE || kind === API_ERROR.TIMEOUT || kind === API_ERROR.MAINTENANCE) return errorText(failure);
  return t("request.noAnswer");
}

/**
 * A refused request as a sentence, for the forms that sign in or change a password:
 * errorText's, with two exceptions. Too many tries say when to try again: the 429 carries
 * `retryAfterSeconds`, and the window is a quarter of an hour, so the wait is said in
 * minutes, and in seconds only for its last minute; without the number, "shortly" is all
 * there is to say. And an answer without a code (a proxy's 502 while the server restarts)
 * says the server did not answer instead of "Request failed with 502".
 * @param {unknown} error
 */
export function refusalText(error) {
  if (error?.kind === API_ERROR.HTTP && !error.code) return t("request.noAnswer");
  const seconds = Math.ceil(Number(error?.payload?.retryAfterSeconds));
  if (error?.code !== "TOO_MANY_LOGIN_ATTEMPTS" || !(seconds > 0)) return errorText(error);
  return seconds < 60 ? t("auth.tooManySeconds", { seconds }) : t("auth.tooManyMinutes", { minutes: Math.ceil(seconds / 60) });
}

/** Reads of the session started, and the promise of the newest: a read that a newer one overtook says nothing of its own. */
let reads = 0;
let newestRead = null;

/**
 * Who the stored token belongs to, with their settings and their teams.
 *
 * No one is signed in while it asks, so the api-client's 401 hook stays quiet
 * and the one notice is this function's. Another tab may store another token
 * while it asks; the read that follows it is then the one that counts, and
 * this one hands its caller that read's answer.
 *
 * @returns {Promise<"guest"|"signed-in"|"offline">} "offline" is any failure
 *   but a 401: the token stays for the next load, and no one is signed in now
 */
export function loadSession() {
  newestRead = readSession(++reads);
  return newestRead;
}

async function readSession(read) {
  let status = "guest";
  coachLeft(state.auth.currentUser);
  state.auth.currentUser = null;
  failure = null;
  const token = authToken();
  rememberSessionToken(token);
  if (token) {
    const [me, teams] = await Promise.allSettled([apiRequest("/api/auth/me"), apiRequest("/api/teams")]);
    if (read !== reads) return newestRead;
    status = statusOf(me, teams);
    if (status === "offline") failure = [me, teams].find((answer) => answer.status === "rejected")?.reason ?? null;
    if (status === "guest") {
      setAuthToken("");
      rememberSessionToken("");
    }
    if (status === "signed-in") {
      state.auth.currentUser = me.value.user;
      if (teams.status === "fulfilled") setMyTeams(teams.value.teams ?? []);
      else setMyTeamsUnread(teams.reason);
    }
  }
  announce();
  return status;
}

/**
 * Take the server's newer copy of the signed-in coach in place of ours, as a profile
 * save answers with one. That copy is `publicUser`, which lacks the two fields only
 * `/me` adds: `preferences` and `managedByServer` (the account the server's settings
 * keep). The same coach's are kept unless the copy brings its own (`null` brings none;
 * `false` is an answer). Replacing the user outright would make an account that has a
 * theme look like one that has none, and the next sync would write this browser's
 * palette over it; or make the account the server keeps look like any other, and offer
 * the coach a password it would refuse. A copy of anyone else gets none of ours.
 *
 * Not a change of session, since no one signed in or out: nobody is told.
 * @param {object} user
 */
export function mergeCurrentUser(user) {
  const current = state.auth.currentUser;
  const same = current?.id === user.id;
  const { preferences: ownPreferences, managedByServer: ownManaged, ...rest } = user;
  const preferences = ownPreferences ?? (same ? current.preferences : undefined);
  const managedByServer = ownManaged ?? (same ? current.managedByServer : undefined);
  state.auth.currentUser = {
    ...rest,
    ...(preferences ? { preferences } : {}),
    ...(managedByServer === undefined ? {} : { managedByServer }),
  };
}

/**
 * Sign in or register, then ask /me: a refusal is thrown to the screen with nothing changed.
 *
 * @returns {Promise<"signed-in"|"offline"|"guest">} what /me said. "offline" is a sign-in
 *   that went through while the account could not be read: the token stays, so the next
 *   load signs the coach in, and `sessionFailureText` says why not now
 */
async function startSession(path, body) {
  const payload = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
  setAuthToken(payload.token);
  // A guest may have loaded the season already; the coach's copy has their own part in it.
  resetCoachSlices();
  return loadSession();
}

/** @param {{login: string, password: string}} credentials @returns {ReturnType<typeof startSession>} */
export function signIn({ login, password }) {
  return startSession("/api/auth/login", { login, password });
}

/** @param {{login: string, password: string, telegram: string}} account @returns {ReturnType<typeof startSession>} */
export function register({ login, password, telegram }) {
  return startSession("/api/auth/register", { login, password, telegram });
}

/**
 * The 401 handler (`setOnUnauthorized`): the session died under us, so the coach's state goes with it.
 * @param {object|null} [user] the coach whose session it was: the api-client has already let go of them
 *   when it calls this; signing out and a token another tab took away leave them in the state till here
 */
export function sessionEnded(user = state.auth.currentUser) {
  coachLeft(user);
  setAuthToken("");
  rememberSessionToken("");
  state.auth.currentUser = null;
  resetCoachSlices();
  announce();
}

/**
 * Sign out here whatever the server says: a logout that cannot reach it still forgets the
 * coach, and this browser forgets the team it last showed them. Never throws.
 */
export async function signOut() {
  clearActiveTeamCache();
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Signing out locally is the part that matters.
  }
  // Again: a list that answered while the logout was out, the coach still signed in, wrote it back.
  clearActiveTeamCache();
  // Nor is the page signed out on where the next sign-in lands. A 401 keeps it: the router remembers that page.
  setReturn("");
  sessionEnded();
}

/** A token another tab stored or took away: the session is read again with the one there now, or ends with none. */
function followStoredToken() {
  if (authToken()) void loadSession();
  else sessionEnded();
}

/**
 * Keep the page's session the stored token's. A tab that signs out, or in as someone else, changes the
 * token, and the browser tells every other tab with `storage`; until a page follows, it shows one coach
 * while its requests go out as another. A write to an account that finds the token moved before the event
 * came follows it the same way (`sessionTokenHolds`). Once, at startup.
 * @param {EventTarget} [target] the window
 */
export function followSessionAcrossTabs(target = globalThis) {
  setOnTokenMoved(followStoredToken);
  target.addEventListener("storage", () => {
    if (tokenMoved()) followStoredToken();
  });
}

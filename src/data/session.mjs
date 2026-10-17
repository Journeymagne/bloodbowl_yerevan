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
 */
import { API_ERROR } from "../core/api.mjs";
import { apiRequest, authToken, setAuthToken } from "../core/api-client.mjs";
import { state } from "../core/state.mjs";
import { clearActiveTeamCache, resetActiveTeam } from "./active-team.mjs";
import { setMyTeams } from "./teams.mjs";

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

const refusedAs = (answer, kind) => answer.status === "rejected" && answer.reason?.kind === kind;

/**
 * What `/me` and `/api/teams`, settled, say together. Only the server saying
 * no one (a 401, or `user: null`) makes a guest; a 403, a lost answer or one
 * with no `user` at all (an unreadable body comes back as `{}`) is "offline".
 */
function statusOf(me, teams) {
  if (refusedAs(me, API_ERROR.UNAUTHORIZED) || refusedAs(teams, API_ERROR.UNAUTHORIZED)) return "guest";
  if (me.status === "fulfilled" && me.value?.user === null) return "guest";
  if (me.status === "rejected" || teams.status === "rejected" || !me.value?.user) return "offline";
  return "signed-in";
}

/**
 * Who the stored token belongs to, with their settings and their teams.
 *
 * No one is signed in while it asks, so the api-client's 401 hook stays quiet
 * and the one notice is this function's.
 *
 * @returns {Promise<"guest"|"signed-in"|"offline">} "offline" is any failure
 *   but a 401: the token stays for the next load, and no one is signed in now
 */
export async function loadSession() {
  let status = "guest";
  state.auth.currentUser = null;
  if (authToken()) {
    const [me, teams] = await Promise.allSettled([apiRequest("/api/auth/me"), apiRequest("/api/teams")]);
    status = statusOf(me, teams);
    if (status === "guest") setAuthToken("");
    if (status === "signed-in") {
      state.auth.currentUser = me.value.user;
      setMyTeams(teams.value.teams ?? []);
    }
  }
  announce();
  return status;
}

/**
 * Take the server's newer copy of the signed-in coach in place of ours, as a profile
 * save answers with one. That copy is `publicUser`, which has no `preferences`: those
 * are only in `/me`, so the same coach's are kept unless the copy brings its own
 * (`null` brings none). Replacing the user outright would make an account that has a
 * theme look like one that has none, and the next sync would write this browser's
 * palette over it. A copy of anyone else gets none of ours.
 *
 * Not a change of session, since no one signed in or out: nobody is told.
 * @param {object} user
 */
export function mergeCurrentUser(user) {
  const current = state.auth.currentUser;
  const { preferences: own, ...rest } = user;
  const preferences = own ?? (current?.id === user.id ? current.preferences : undefined);
  state.auth.currentUser = preferences ? { ...rest, preferences } : rest;
}

/** Sign in or register, then ask /me: a refusal is thrown to the screen with nothing changed. */
async function startSession(path, body) {
  const payload = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
  setAuthToken(payload.token);
  // A guest may have loaded the season already; the coach's copy has their own part in it.
  resetCoachSlices();
  await loadSession();
}

/** @param {{login: string, password: string}} credentials */
export function signIn({ login, password }) {
  return startSession("/api/auth/login", { login, password });
}

/** @param {{login: string, password: string, telegram: string}} account */
export function register({ login, password, telegram }) {
  return startSession("/api/auth/register", { login, password, telegram });
}

/** The 401 handler (`setOnUnauthorized`): the session died under us, so the coach's state goes with it. */
export function sessionEnded() {
  setAuthToken("");
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
  sessionEnded();
}

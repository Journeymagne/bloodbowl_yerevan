/**
 * The signed-in coach's active team: the one the header names, `#/` opens and
 * `#/my-games` shows (plan stage 05, decision 7).
 *
 * Several places can name it, and the first that is one of the coach's own teams
 * wins: the team in the address (`#/t/:id/…`), the team already active on this
 * page, the team the account keeps (`preferences.activeTeamId`; the server has
 * already dropped a foreign or a deleted one from `/me`), the team this browser
 * last showed that coach (`gata-league-active-team`, `{userId, teamId}`, so
 * another coach on the same browser never inherits it), and else the first of
 * the list.
 *
 * The team already active comes before the account because a reload of the list
 * has no route: on `#/t/t2/roster` the router makes t2 active and sends it to the
 * account, then the roster screen reloads the list, and until that write is
 * answered the account still names the team before — which would win, and the
 * page's own team would flip back.
 *
 * For the same reason, a reload of the list that a team's address waits on
 * (prepareTeamRoute) settles on that address's team: settled without it, a coach
 * with no team active yet would get the first of the list, written to the
 * account, a moment before the router wrote the right one.
 *
 * The account is written only when the result is a team and differs from what
 * the account holds, in the background and one write at a time. No team is never
 * written: `/me` already hides a dead id, and a list that came back empty must not
 * erase the team the account keeps. A list that could not be read at all decides
 * nothing. Signing out wipes the cache and tells the listeners there is no team
 * (data/session.mjs).
 */
import { state } from "../core/state.mjs";
import { STORAGE_KEYS, storage } from "../core/storage.mjs";
import { savePreferences } from "./preferences.mjs";

/**
 * The first candidate that is one of the coach's teams, else the first team, else null.
 * @param {{teamIds: string[], routeTeamId?: string|null, currentTeamId?: string|null, preferenceTeamId?: string|null, cachedTeamId?: string|null}} candidates
 * @returns {string|null}
 */
export function resolveActiveTeamId({ teamIds, routeTeamId = null, currentTeamId = null, preferenceTeamId = null, cachedTeamId = null }) {
  const own = new Set(teamIds);
  return [routeTeamId, currentTeamId, preferenceTeamId, cachedTeamId].find((id) => own.has(id)) ?? teamIds[0] ?? null;
}

/** The team this browser last showed `userId`; another coach's entry, or anything unreadable, is none. */
export function readActiveTeamCache(store, userId) {
  const cached = store.getJson(STORAGE_KEYS.activeTeam);
  if (!userId || !cached || typeof cached !== "object" || cached.userId !== userId) return null;
  return typeof cached.teamId === "string" ? cached.teamId : null;
}

/** Forget the team this browser last showed, whoever it was for. */
export function clearActiveTeamCache(store = storage) {
  store.remove(STORAGE_KEYS.activeTeam);
}

/** Remember `teamId` for `userId` in this browser; `null` forgets whatever is there. */
export function writeActiveTeamCache(store, userId, teamId) {
  if (teamId === null) clearActiveTeamCache(store);
  else store.setJson(STORAGE_KEYS.activeTeam, { userId, teamId });
}

const listeners = new Set();

/** @param {(teamId: string|null) => void} listener @returns {() => void} what removes it again */
export function onActiveTeamChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Make `teamId` the active team, and tell each listener on its own — only if it is a change. */
function setActiveTeamId(teamId) {
  if (state.activeTeamId === teamId) return;
  state.activeTeamId = teamId;
  for (const listener of listeners) {
    try {
      listener(teamId);
    } catch (error) {
      console.error(error);
    }
  }
}

/** No team, and the listeners hear it: the session calls this when the coach signs in, out, or is signed out. */
export function resetActiveTeam() {
  setActiveTeamId(null);
}

const accountTeamId = (user) => user?.preferences?.activeTeamId ?? null;

/** The coach's account write on its way: the next one waits for it, so the account ends with the last team shown. */
let writing = null;

/**
 * Tell the account `teamId` is the coach's active team, once any write before it is
 * answered. By then the coach may have moved to another team or left, or the account may
 * already say so (a reload of the list asks again while the route's write is out): then
 * nothing is sent. Never throws.
 */
function writeAccount(userId, teamId) {
  const before = writing?.userId === userId ? writing.done : null;
  const write = { userId };
  write.done = (async () => {
    await before;
    const user = state.auth.currentUser;
    if (user?.id !== userId || state.activeTeamId !== teamId || accountTeamId(user) === teamId) return;
    await savePreferences({ activeTeamId: teamId });
  })().finally(() => {
    if (writing === write) writing = null;
  });
  writing = write;
}

/** The team address waiting on a reload of the list (prepareTeamRoute), whose sync is that address's. */
let routeInWait = null;

/**
 * Settle the active team from the coach's list (`state.myTeams.items`), their account
 * and this browser, and keep all three in step: the cache now names it, and an account
 * that names another (or none) is given it in the background — unless there is none to
 * give. A guest has none.
 * @param {{routeTeamId?: string|null, store?: object}} [options]
 * @returns {string|null} the active team's id
 */
export function syncActiveTeam({ routeTeamId = null, store = storage } = {}) {
  const user = state.auth.currentUser;
  if (!user) {
    setActiveTeamId(null);
    return null;
  }
  // A list that was never read (it failed at sign-in) says nothing of which team is the coach's: the team
  // already active, else the account's (which /me has checked), and nothing is written to either store.
  if (!state.myTeams.loaded && !state.myTeams.items.length) {
    setActiveTeamId(state.activeTeamId ?? accountTeamId(user));
    return state.activeTeamId;
  }
  const teamId = resolveActiveTeamId({
    teamIds: state.myTeams.items.map((item) => item.id),
    routeTeamId: routeTeamId ?? routeInWait?.teamId ?? null,
    currentTeamId: state.activeTeamId,
    preferenceTeamId: accountTeamId(user),
    cachedTeamId: readActiveTeamCache(store, user.id),
  });
  writeActiveTeamCache(store, user.id, teamId);
  setActiveTeamId(teamId);
  if (teamId !== null && teamId !== accountTeamId(user)) writeAccount(user.id, teamId);
  return teamId;
}

/** The active team itself, as the list holds it. */
export function activeTeam() {
  return state.myTeams.items.find((item) => item.id === state.activeTeamId) ?? null;
}

/**
 * Whether `teamId` is one of the coach's teams. One missing from the list may be the
 * one the builder saved a moment ago, so the list is read once more before the answer
 * is no — and a sync on the way settles on `teamId` if it is there.
 * @param {string} teamId
 * @param {{reload: function(): Promise<void>}} options
 * @returns {Promise<boolean>}
 */
export async function prepareTeamRoute(teamId, { reload }) {
  const known = () => state.myTeams.items.some((item) => item.id === teamId);
  if (known()) return true;
  const wait = { teamId };
  routeInWait = wait;
  try {
    await reload();
  } finally {
    // A later address may be waiting by now; only this one's own wait ends here.
    if (routeInWait === wait) routeInWait = null;
  }
  return known();
}

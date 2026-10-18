/**
 * The signed-in coach's own teams, `state.myTeams`.
 *
 * `loadMyTeams` moved here from screens/my-teams.mjs, because the session
 * (data/session.mjs) now brings the list in together with `/me` and may not
 * import a screen; my-teams.mjs and saved-roster.mjs reload it from here. A
 * list that loaded settles the active team again: the active one may have
 * been deleted elsewhere.
 */
import { errorText } from "../core/api.mjs";
import { state } from "../core/state.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { syncActiveTeam } from "./active-team.mjs";

const listeners = new Set();

/**
 * Hear every write of `state.myTeams`: an answer, a failure, a list a session brought. The frame listens
 * (shell/shell.mjs): a list that comes in after the frame was drawn, read again on a team's page once it
 * failed at sign-in, changes the header and the SideNav though the active team does not change.
 * @param {() => void} listener @returns {() => void} what removes it again
 */
export function onMyTeamsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every listener hears it, each on its own: one that throws does not stop the rest. */
function myTeamsChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

/** Reads of the list sent, and the promise of the newest: only the last one sent is written. */
let reads = 0;
let newestRead = null;

/**
 * Read the coach's list into `state.myTeams`, and settle the active team from it. A read that a newer one
 * overtook writes nothing, and its caller waits for the newer list, which is the one it will read. A list
 * that comes back for a coach who is no longer the one signed in (signed out, or another signed in while it
 * was on its way) is not written either: it would be the next coach's list, and their active team.
 */
export async function loadMyTeams(force = false) {
  const user = state.auth.currentUser;
  if (!user) {
    state.myTeams = { items: [], loaded: true, loading: false, error: "" };
    myTeamsChanged();
    return;
  }
  if (state.myTeams.loaded && !force) return;
  newestRead = readMyTeams(++reads, user.id);
  return newestRead;
}

async function readMyTeams(read, userId) {
  state.myTeams.loading = true;
  state.myTeams.error = "";
  let payload = null;
  let failure = null;
  try {
    payload = await apiRequest("/api/teams");
  } catch (error) {
    failure = error;
  }
  if (read !== reads) return newestRead;
  if (state.auth.currentUser?.id !== userId) return;
  state.myTeams.loading = false;
  if (failure) {
    state.myTeams.error = errorText(failure);
  } else {
    state.myTeams.items = payload.teams ?? [];
    state.myTeams.loaded = true;
    syncActiveTeam();
  }
  myTeamsChanged();
}

/** The list as an answer already brought it: loaded, nothing in flight. */
export function setMyTeams(items) {
  state.myTeams = { items, loaded: true, loading: false, error: "" };
  myTeamsChanged();
}

/**
 * The list as a request that failed left it: not read, so no team is known (not "no team"), and why
 * (`error`). The session is signed in all the same; the overview offers to read the list again.
 */
export function setMyTeamsUnread(error) {
  state.myTeams = { items: [], loaded: false, loading: false, error: errorText(error) };
  myTeamsChanged();
}

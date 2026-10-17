/**
 * The signed-in coach's own teams, `state.myTeams`.
 *
 * `loadMyTeams` moved here unchanged from screens/my-teams.mjs, because the
 * session (data/session.mjs) now brings the list in together with `/me` and
 * may not import a screen; my-teams.mjs and saved-roster.mjs reload it from
 * here. A list that loaded settles the active team again: the active one may
 * have been deleted elsewhere.
 */
import { errorText } from "../core/api.mjs";
import { state } from "../core/state.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { syncActiveTeam } from "./active-team.mjs";

export async function loadMyTeams(force = false) {
  if (!state.auth.currentUser) {
    state.myTeams = { items: [], loaded: true, loading: false, error: "" };
    return;
  }
  if (state.myTeams.loaded && !force) return;
  state.myTeams.loading = true;
  state.myTeams.error = "";
  try {
    const payload = await apiRequest("/api/teams");
    state.myTeams.items = payload.teams ?? [];
    state.myTeams.loaded = true;
    syncActiveTeam();
  } catch (error) {
    state.myTeams.error = errorText(error);
  } finally {
    state.myTeams.loading = false;
  }
}

/** The list as an answer already brought it: loaded, nothing in flight. */
export function setMyTeams(items) {
  state.myTeams = { items, loaded: true, loading: false, error: "" };
}

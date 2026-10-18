/**
 * The signed-in coach's own teams, `state.myTeams`.
 *
 * `loadMyTeams` moved here from screens/my-teams.mjs, because the session
 * (data/session.mjs) now brings the list in together with `/me` and may not
 * import a screen; my-teams.mjs and saved-roster.mjs reload it from here. A
 * list that loaded settles the active team again: the active one may have
 * been deleted elsewhere.
 *
 * Creating and deleting a team are writes to the account: they ask whose token it is first and, when
 * another tab has moved it, send nothing (stage 05, R12).
 */
import { API_ERROR, errorText, refusalText } from "../core/api.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { apiRequest, sessionTokenHolds } from "../core/api-client.mjs";
import { syncActiveTeam } from "./active-team.mjs";
import { invalidateGames } from "./games.mjs";

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

/** A team the server made, first on the list, in place of the one it was if the list had it: no reload needed. */
export function addMyTeam(team) {
  state.myTeams = { ...state.myTeams, items: [team, ...state.myTeams.items.filter((item) => item.id !== team.id)], loaded: true, error: "" };
  myTeamsChanged();
}

/** The request got no answer from the server: no connection, too slow, or a proxy's 502 with none of the server's words in it. */
function unanswered(error) {
  return error?.kind === API_ERROR.OFFLINE || error?.kind === API_ERROR.TIMEOUT || (error?.kind === API_ERROR.HTTP && !error.code);
}

/** The refusal, and with it each rule a roster breaks (422), worded as the roster editor words them. */
function createRefusal(error) {
  const rules = error?.code === "ROSTER_BREAKS_THE_RULES" ? error.violations ?? [] : [];
  return [refusalText(error), ...rules.map(({ code, params }) => t(`validation.${code}`, params))].join(" ");
}

const madeAt = (item) => Date.parse(item.createdAt) || 0;

/**
 * The team the server made from `body`, among the list read after the answer was lost: one with the name (the
 * server trims it) and the race of the build, whose id the list did not hold before it was sent. Its time
 * is no proof: `createdAt` is the server's clock and `startedAt` the coach's, which may run ahead. So time
 * only chooses where the id cannot: between several new teams alike (another tab made one) it is the latest;
 * and a list that was never read (`known` null) cannot say which team is new, so a team made since the
 * build began is the only one taken.
 * @param {object} body @param {Set<string>|null} known @param {number} startedAt @returns {object|null}
 */
function findMade(body, known, startedAt) {
  const name = body.name.trim();
  const fresh = state.myTeams.items.filter((item) => item.name === name && item.baseTeamSlug === body.baseTeamSlug
    && (known ? !known.has(item.id) : madeAt(item) >= startedAt));
  return fresh.sort((a, b) => madeAt(b) - madeAt(a))[0] ?? null;
}

/** A build that got no answer may still have made the team: read the list, and take it if it is there. */
async function recoverMade(error, body, { known, userId, startedAt }) {
  if (unanswered(error)) {
    await loadMyTeams(true);
    // A list for another coach (signed in while this was out) is not the one the team was made on.
    const team = state.auth.currentUser?.id === userId ? findMade(body, known, startedAt) : null;
    if (team) return { team, recovered: true };
  }
  return { refusal: createRefusal(error) };
}

/**
 * Make a team on the server and put it first on the coach's list. Sent once: an answer that does not come
 * (a dropped connection, a timeout) may mean the team was made, so it is looked for rather than made again, and
 * handed back with `recovered`. Never throws.
 * @param {{name: string, baseTeamSlug: string, logoData: string|null, roster: object}} body
 * @param {{startedAt: number}} options when the build began (`Date.now()`): a team made before it is not this build's
 *   where the list cannot say otherwise (`findMade`)
 * @returns {Promise<{team: object, recovered?: true}|{refusal: string}>}
 */
export async function createTeam(body, { startedAt }) {
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  const userId = state.auth.currentUser?.id;
  const known = state.myTeams.loaded ? new Set(state.myTeams.items.map((item) => item.id)) : null;
  let team;
  try {
    ({ team } = await apiRequest("/api/teams", { method: "POST", body: JSON.stringify(body) }));
  } catch (error) {
    return recoverMade(error, body, { known, userId, startedAt });
  }
  // Another coach's list (signed in while this was out) is not given the team. Nor is a list that was never
  // read: with this one team on it, it would call itself complete, so it is read again instead.
  if (state.auth.currentUser?.id === userId) {
    if (known) addMyTeam(team);
    else await loadMyTeams(true);
  }
  return { team };
}

/**
 * Delete a team on the server, then read the list again (which settles the active team, a deleted one
 * included) and the games (the SideNav's match card). `endpoint` is where an admin deletes another coach's.
 * @param {string} teamId @param {{endpoint?: string}} [options] @returns {Promise<{refusal?: string}>}
 */
export async function deleteTeam(teamId, { endpoint = "" } = {}) {
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  try {
    await apiRequest(endpoint || `/api/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" });
  } catch (error) {
    return { refusal: refusalText(error) };
  }
  await loadMyTeams(true);
  void invalidateGames();
  return {};
}

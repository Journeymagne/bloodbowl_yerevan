/**
 * The signed-in coach's own teams, `state.myTeams`.
 *
 * `loadMyTeams` moved here from the 2.x My Teams screen, because the session
 * (data/session.mjs) now brings the list in together with `/me` and may not
 * import a screen; the teams screen and the roster's saves reload it from here. A
 * list that loaded settles the active team again: the active one may have
 * been deleted elsewhere.
 *
 * Creating and deleting a team are writes to the account: they ask whose token it is first and, when
 * another tab has moved it, send nothing (stage 05, R12).
 *
 * The reference lookups a team needs live here too: `raceTeamOf` finds the race's page by the slug a team is
 * based on, `raceTitleOf` its name; the shell, the teams screens and the overview all ask them.
 */
import { API_ERROR, ApiError, errorText, refusalText } from "../core/api.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { apiRequest, sessionTokenHolds, tokenMoved } from "../core/api-client.mjs";
import { syncActiveTeam } from "./active-team.mjs";
import { invalidateGames } from "./games.mjs";

/** The race's page in the reference by the slug a team is based on; null while the data has not come, or when the slug names none. */
export function raceTeamOf(slug) {
  return state.data?.teams?.find((item) => item.slug === slug) ?? null;
}

/** The race the reference calls a base team; "" when the data has not come. */
export function raceTitleOf(slug) {
  return raceTeamOf(slug)?.title ?? "";
}

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

/**
 * The request got no answer to stand behind: the connection was lost, it took too long, a proxy answered with none of
 * the server's words in it, or the server failed (a 5xx: its INSERT may have committed before `readPublicTeam` did).
 * The team may exist all the same. The treasury's writes ask it too (data/treasury.mjs): a line may be written.
 */
export function unanswered(error) {
  return error?.kind === API_ERROR.OFFLINE || error?.kind === API_ERROR.TIMEOUT || error?.status >= 500
    || (error?.kind === API_ERROR.HTTP && !error.code);
}

/**
 * A rule of the domain's, `{ code, params }`, in the dictionary's words (`validation.<CODE>`): «Ogre: maximum is 1.» The
 * one wording of a refusal — the cart's + and its «Buy» (hire-sheet.mjs, market.mjs), a roster save's (save.mjs), and
 * each rule a 422 names (`refusalWithRules`).
 * @param {{code: string, params?: object}} refusal
 */
export function refusalWords({ code, params = {} }) {
  return t(`validation.${code}`, params);
}

/** A rule a 422 names, as far as it can be worded: an object with a code. */
const wordedRule = (rule) => typeof rule?.code === "string" && rule.code !== "";

/**
 * The refusal, and with it each rule a roster breaks (422), worded as the roster editor words them. A build, an
 * entry in the treasury and a roster save are refused the same way (data/treasury.mjs words its writes with it).
 * What the body calls its rules is read with care (07b): rules that are not a list, and a rule without a code, are
 * left out rather than said as a raw key, or thrown over.
 */
export function refusalWithRules(error) {
  const rules = error?.code === "ROSTER_BREAKS_THE_RULES" && Array.isArray(error.violations) ? error.violations.filter(wordedRule) : [];
  return [refusalText(error), ...rules.map(refusalWords)].join(" ");
}

const madeAt = (item) => Date.parse(item.createdAt) || 0;

/**
 * The team an attempt made, among the list read after its answer was lost: one with the name (the server
 * trims it) and the race of the build, whose id the list did not hold before it was sent. Its time is no
 * proof: `createdAt` is the server's clock and `startedAt` the coach's, which may run ahead. So time only
 * chooses where the id cannot: between several new teams alike (another tab made one) it is the latest;
 * and a list that was never read (`known` null) cannot say which team is new, so a team made since the
 * build began is the only one taken.
 * @param {{name: string, baseTeamSlug: string, known: Set<string>|null, startedAt: number}} attempt @returns {object|null}
 */
function findMade({ name, baseTeamSlug, known, startedAt }) {
  const fresh = state.myTeams.items.filter((item) => item.name === name && item.baseTeamSlug === baseTeamSlug
    && (known ? !known.has(item.id) : madeAt(item) >= startedAt));
  return fresh.sort((a, b) => madeAt(b) - madeAt(a))[0] ?? null;
}

/**
 * The attempt whose fate is not known: its answer was lost and the list could not be read, or was read and
 * the team was not there (yet: a request that timed out may still be running). `createTeam` looks for it
 * before it sends that coach's next build of that name and race, with the ids the list held before the first
 * send; a retry that sent at once would make the team twice. One at a time; another coach forgets it.
 * @type {{userId: string|undefined, name: string, baseTeamSlug: string, known: Set<string>|null, startedAt: number, error: Error|null}|null}
 */
let pending = null;

/**
 * Read the list again and look in it for what an attempt made.
 * @returns {Promise<{team: object, recovered: true}|{refusal: string}|null>} a refusal where the list cannot be
 *   trusted (not read, another coach's, or read under a token another tab has moved); null where it is not there
 */
async function lookForMade(attempt) {
  await loadMyTeams(true);
  // The request went out under the token it found, which another tab may have changed since the page last read it.
  if (tokenMoved()) return { refusal: t("auth.otherTab") };
  const read = state.auth.currentUser?.id === attempt.userId && state.myTeams.loaded && !state.myTeams.error;
  if (!read) return { refusal: refusalText(attempt.error) };
  const team = findMade(attempt);
  return team ? { team, recovered: true } : null;
}

/** A build that got no answer may still have made the team: look for it, and remember that it is not known. */
async function recoverMade(error, attempt) {
  if (!unanswered(error)) return { refusal: refusalWithRules(error) };
  attempt.error = error;
  const found = await lookForMade(attempt);
  if (found?.team) return found;
  pending = attempt;
  return found ?? { refusal: refusalText(error) };
}

/**
 * Make a team on the server and put it first on the coach's list. Sent once: an answer that does not come (a
 * dropped connection, a timeout, a server that failed) may mean the team was made, so it is looked for rather
 * than made again, and handed back with `recovered`; and when that cannot be told either, the next call for
 * the same coach, name and race looks again before it sends anything (`pending`). Never throws.
 * @param {{name: string, baseTeamSlug: string, logoData: string|null, roster: object}} body
 * @param {{startedAt?: number}} [options] when the build began (`Date.now()`, the default): a team made before it
 *   is not this build's where the list cannot say otherwise (`findMade`)
 * @returns {Promise<{team: object, recovered?: true}|{refusal: string}>}
 */
export async function createTeam(body, { startedAt = Date.now() } = {}) {
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  const userId = state.auth.currentUser?.id;
  const attempt = { userId, name: String(body?.name ?? "").trim(), baseTeamSlug: body?.baseTeamSlug, known: null, startedAt, error: null };
  if (pending && pending.userId !== userId) pending = null;
  if (pending && pending.name === attempt.name && pending.baseTeamSlug === attempt.baseTeamSlug) {
    const found = await lookForMade(pending);
    if (found?.team) pending = null;
    if (found) return found;
    pending = null;
  }
  // The ids the list holds before the build is sent: the team the server makes is the one that is not here yet.
  if (!state.myTeams.loaded) await loadMyTeams(true);
  if (state.myTeams.loaded) attempt.known = new Set(state.myTeams.items.map((item) => item.id));
  // The reads above took time: the token or the coach may have changed meanwhile.
  if (!sessionTokenHolds() || state.auth.currentUser?.id !== userId) return { refusal: t("auth.otherTab") };
  let answer;
  try {
    answer = await apiRequest("/api/teams", { method: "POST", body: JSON.stringify(body) });
    // A 2xx with no team in it is no answer to stand behind: the team may be made.
    if (!answer?.team?.id) throw new ApiError(API_ERROR.HTTP, { status: 200 });
  } catch (error) {
    return recoverMade(error, attempt);
  }
  // Another coach's list (signed in while this was out) is not given the team. Nor is a list that was never
  // read (with this one team on it it would call itself complete), or one being read (its answer may be from
  // before the team was made, and would overwrite it): those are read again instead.
  if (state.auth.currentUser?.id === userId) {
    if (attempt.known && !state.myTeams.loading) {
      addMyTeam(answer.team);
      // A first team has no active one to wait on, and the coach may have left the builder before this answer came,
      // so no route will make it active: the header, `#/` and the SideNav need one. A coach who has an active team keeps it.
      syncActiveTeam();
    } else {
      await loadMyTeams(true);
    }
  }
  return { team: answer.team };
}

/**
 * A team the server has deleted is off the list at once, and the active team is settled without it: the read that
 * follows may fail, and a row left would offer a team that is gone (and a header still naming it). Another coach's
 * list (signed in while the request was out), and a team the list does not hold (an admin's delete of someone
 * else's), are left alone.
 */
function forgetTeam(teamId, userId) {
  if (state.auth.currentUser?.id !== userId || !state.myTeams.items.some((item) => item.id === teamId)) return;
  setMyTeams(state.myTeams.items.filter((item) => item.id !== teamId));
  syncActiveTeam();
}

/**
 * Delete a team on the server, take it off the list, then read the list again (which settles the active team
 * once more) and the games (the SideNav's match card). `endpoint` is where an admin deletes another coach's.
 * @param {string} teamId @param {{endpoint?: string}} [options] @returns {Promise<{refusal?: string}>}
 */
export async function deleteTeam(teamId, { endpoint = "" } = {}) {
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  const userId = state.auth.currentUser?.id;
  try {
    await apiRequest(endpoint || `/api/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" });
  } catch (error) {
    return { refusal: refusalText(error) };
  }
  state.season.loaded = false;
  forgetTeam(teamId, userId);
  await loadMyTeams(true);
  void invalidateGames();
  return {};
}

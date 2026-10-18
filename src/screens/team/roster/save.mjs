/**
 * The roster's own save queue (the 2.x autosave path, createRosterStore): outside a match a tap is one PATCH of
 * the whole team, the stored counter ± 1 — never the career the screen shows (spec 3.0 §3.7; master plan, 07a:
 * "the editor saves the blob's SPP from GET"). A 409 that holds what was sent is that very save, whose answer
 * was lost.
 *
 * The store (data/roster-store.mjs) keeps one request in the air per team and the taps behind it in order, and
 * builds each request when the one before has answered, so a second tap goes out on the revision the first
 * came back with. What is added here: the request's body, a count of the steps no answer has confirmed (`waiting`:
 * what the leaving-the-page question and the screen's "not saved" read), and the answer to a conflict that is not one.
 *
 * During a match a tap is not a save of the roster: it is an event (`POST …/events`), and the server holds the blob.
 */
import { API_ERROR, ApiError } from "../../../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../../../core/api-client.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { normalizeSavedRoster, rosterForStorage } from "../../../data/roster-draft.mjs";
import { SAVE_STATUS, createRosterStore } from "../../../data/roster-store.mjs";
import { onSessionChange } from "../../../data/session.mjs";
import { refusalWithRules, setMyTeams } from "../../../data/teams.mjs";
import { sameValues } from "../../../domain/post-match/events.mjs";
import { normalizeSppCounters, storedPlayerId } from "../../../domain/roster/players.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { MAX_SPP_COUNTER } from "../../../domain/roster/validate.mjs";

/** The steps taken and not yet confirmed by an answer, by team. */
const waiting = new Map();
const waitingFor = (teamId) => waiting.get(teamId) ?? 0;

/** An answer stood behind one step. */
function confirmStep(teamId) {
  if (waitingFor(teamId) > 1) waiting.set(teamId, waitingFor(teamId) - 1);
  else waiting.delete(teamId);
}

/**
 * What a save refused for another tab's coach throws, and the `code` the screen reads it by. The text is not in
 * the error: it is said when it is read (`stateOf`), in the language the page is in then.
 */
const OTHER_TAB = "OTHER_TAB";

/**
 * The team as the server last said it takes its place in the coach's list, where it stands: the switcher and
 * `#/teams` follow the list's order, and a save is no reason to move a team up it. A list that does not hold the
 * team is left as it is, since writing it would make it claim it is read.
 */
function putInPlace(team) {
  if (!state.myTeams.items.some((item) => item.id === team?.id)) return;
  setMyTeams(state.myTeams.items.map((item) => (item.id === team.id ? team : item)));
}

/**
 * The team a 409 shows, when it is what the request carried: the same name, race and roster. The save has
 * landed and only its answer was lost (the request is sent again against a revision it has moved), so this is its success.
 * A 409 that carries anything else is another device's save.
 * @returns {object|null}
 */
function landedTeam(error, request) {
  const team = error?.kind === API_ERROR.CONFLICT ? error.payload?.team : null;
  const ours = team && team.name === request.name && team.baseTeamSlug === request.baseTeamSlug
    && sameValues(normalizeDraft(team.roster), normalizeDraft(request.roster));
  return ours ? team : null;
}

async function patchTeam(endpoint, request) {
  try {
    return await apiRequest(endpoint, { method: "PATCH", body: JSON.stringify(request) });
  } catch (error) {
    const team = landedTeam(error, request);
    if (!team) throw error;
    return { team };
  }
}

const transport = {
  async save(teamId, request, { endpoint }) {
    // A step queued behind another, or one that waited for the network, leaves later than the tap that made it.
    if (!sessionTokenHolds()) throw new ApiError(API_ERROR.FORBIDDEN, { payload: { error: { code: OTHER_TAB } } });
    const userId = state.auth.currentUser?.id;
    const answer = await patchTeam(endpoint, request);
    confirmStep(teamId);
    if (state.auth.currentUser?.id === userId) putInPlace(answer?.team);
    return answer;
  },
};

const newStore = () => createRosterStore({ transport, debounceMs: 0 });
let store = newStore();

/** The coach whose steps the queue holds: the session that is not theirs takes the queue with it. */
let owner;
let watchingSession = false;

/**
 * A session that ends takes the queue with it, and so does another coach's: a step left waiting would be one that
 * can never go, and the unload guard would go on asking about it. A session read again for the same coach (another
 * tab moved the token) keeps it. Heard from the first team tracked on, for as long as the page lives.
 */
function watchSession() {
  if (watchingSession) return;
  watchingSession = true;
  onSessionChange(() => {
    if (state.auth.currentUser?.id === owner) return;
    store = newStore();
    waiting.clear();
    owner = undefined;
  });
}

/**
 * What the store is told of a team: its draft, and `meta`, which the server's answers move (its revision)
 * and the next request is built from. The body is the blob as GET gave it and as the steps changed it — never the career.
 */
function tracking(meta, draft) {
  return {
    draft,
    meta,
    endpoint: `/api/teams/${encodeURIComponent(meta.id)}`,
    buildRequest: (snapshot) => ({
      name: meta.name,
      baseTeamSlug: meta.baseTeamSlug,
      logoData: meta.logoData ?? "",
      roster: rosterForStorage(snapshot),
      revision: meta.revision,
    }),
  };
}

/**
 * Hand a team, as `readRoster` read it, to the queue; the draft to draw comes back, a copy that the steps change.
 * Steps still waiting keep their draft, and the revision they were taken on: a team read again meanwhile may
 * have been saved by another device, and the steps laid on its revision would overwrite that. They meet the
 * server's 409 instead, which is the coach's to settle (`takeServerTeam`).
 * @param {object} team GET's shape
 */
export function trackRoster(team) {
  guardUnload();
  watchSession();
  owner = state.auth.currentUser?.id;
  if (waitingFor(team.id) > 0) return store.getDraft(team.id);
  const meta = structuredClone(team);
  return store.track(meta.id, tracking(meta, normalizeSavedRoster(meta)));
}

/**
 * One step of one SPP counter of one player, saved as it is taken. Nothing is sent when the player is not on
 * the roster, the counter would leave 0…999 (the server refuses anything else), or the queue is waiting for the
 * coach to settle a conflict.
 * @param {string} teamId @param {string} playerId his id in the roster @param {string} counter @param {number} delta
 * @returns {{ok: true} | {ok: false} | {refusal: string}}
 */
export function stepSpp(teamId, playerId, counter, delta) {
  const player = playerId ? store.getDraft(teamId)?.players.find((candidate) => storedPlayerId(candidate) === playerId) : null;
  if (!player || store.statusOf(teamId) === SAVE_STATUS.CONFLICT) return { ok: false };
  const value = normalizeSppCounters(player.spp)[counter] + delta;
  if (!Number.isInteger(value) || value < 0 || value > MAX_SPP_COUNTER) return { ok: false };
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  player.spp = { ...player.spp, [counter]: value };
  waiting.set(teamId, waitingFor(teamId) + 1);
  store.saveChange(teamId);
  return { ok: true };
}

const refusalOf = (error) => (error.code === OTHER_TAB ? t("auth.otherTab") : refusalWithRules(error));

const stateOf = (teamId, { status, error }) => ({
  status,
  waiting: waitingFor(teamId),
  refusal: error ? refusalOf(error) : "",
  kind: error?.kind ?? "",
  code: error?.code ?? "",
});

/**
 * Where the queue stands: its status (`SAVE_STATUS`), the steps no answer has confirmed, and the last
 * refusal in words (with the rules a 422 names, and in the language of the moment it is read), and what kind
 * of failure it was, for the screen to act on: `kind` is the `API_ERROR` of the last error ("invalid" for a 422,
 * which is for `takeServerTeam`; "offline"; "http" for a 404 or a 5xx, told by `code`), `code` the server's
 * ("ROSTER_BREAKS_THE_RULES"…) or `OTHER_TAB` for a coach another tab has changed. Both are "" without an error.
 * @returns {{status: string, waiting: number, refusal: string, kind: string, code: string}}
 */
export function saveState(teamId) {
  let seen = { status: SAVE_STATUS.IDLE, error: null };
  if (store.getDraft(teamId)) store.subscribe(teamId, (snapshot) => { seen = snapshot; })();
  return stateOf(teamId, seen);
}

/**
 * Hear every change of `saveState`, the present one at once. A team the queue does not hold has none to hear: the
 * listener gets the state of rest and nothing after it, so subscribe once `trackRoster` has been called.
 * @param {(now: ReturnType<typeof saveState>) => void} listener @returns {() => void} what stops it
 */
export function onSaveState(teamId, listener) {
  if (!store.getDraft(teamId)) {
    listener(saveState(teamId));
    return () => {};
  }
  return store.subscribe(teamId, (snapshot) => listener(stateOf(teamId, snapshot)));
}

/**
 * The server's team in place of the draft, after a conflict or a refused save: the queue gives up its steps,
 * and the next one is taken on the server's roster and sent on its revision.
 *
 * Not while a request is in the air: its answer may be a refusal, which puts its step back in the queue, and
 * that step, sent on the revision taken here, would be laid over the very roster that was just taken. So the
 * team is not taken then, and `null` says so; the screen asks again when `onSaveState` next speaks (the answer
 * is a state of its own: saved, offline, conflict, error).
 * @param {object} team GET's shape @returns {object|null} the draft to draw; null while a request is in the air
 */
export function takeServerTeam(team) {
  if (store.statusOf(team.id) === SAVE_STATUS.SAVING) return null;
  const meta = structuredClone(team);
  const draft = normalizeSavedRoster(meta);
  waiting.delete(meta.id);
  store.adoptServerRoster(meta.id, draft);
  return store.track(meta.id, tracking(meta, draft));
}

/**
 * Send what waits now (the network is back, the coach asks); the status it comes to. Not after a conflict: a 409
 * is the coach's to settle (`takeServerTeam`), and the step that met it would be refused again, or, once the
 * server's team is taken, laid over it.
 */
export async function retrySaves(teamId) {
  if (store.statusOf(teamId) === SAVE_STATUS.CONFLICT) return SAVE_STATUS.CONFLICT;
  return (await store.flush(teamId)) ?? SAVE_STATUS.IDLE;
}

const guards = new WeakMap();

/**
 * Ask before the tab closes while a step of any team waits for an answer. One guard to a target: asked
 * again, it hands back the first one's remover.
 * @param {EventTarget} [target] the page
 * @returns {() => void} what takes the guard off
 */
export function guardUnload(target = globalThis) {
  if (typeof target?.addEventListener !== "function") return () => {};
  if (guards.has(target)) return guards.get(target);
  const ask = (event) => {
    if (![...waiting.values()].some((count) => count > 0)) return;
    event.preventDefault();
    // What browsers asked for before preventDefault was enough; an event without a setter for it is left as it is.
    Reflect.set(event, "returnValue", "");
  };
  target.addEventListener("beforeunload", ask);
  const release = () => {
    target.removeEventListener("beforeunload", ask);
    guards.delete(target);
  };
  guards.set(target, release);
  return release;
}

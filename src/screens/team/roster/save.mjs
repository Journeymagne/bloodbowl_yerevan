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
 *
 * A missed-match mark and back on the roster are the same kind of step (stage 07b): one player's fields changed in the
 * draft, the whole roster saved. A death and its undo are not the queue's (fallen.mjs); their answer is taken here, the
 * queue first, so that the list's revision is never ahead of the queue's for a write of the queue's own screen — only
 * for the roster's visit that sent it, while it is on the screen: another visit draws the queue's draft, and reads the
 * team again once the list is ahead of it (`takeAnswerTeam`). Not while a step of the coach's waits or is in the air:
 * taken then, the answer would give that step up without a word (K7). The list alone has it then, and the screen leaves
 * the queue alone — a read taken by `takeServerTeam` would give the step up all the same — and sends no death or undo
 * while a step waits (stage 07b, Task 8, locks that). Nor is an answer older than what the queue or the list holds
 * taken: it would take back a write that came after it.
 *
 * A purchase and a sale are steps of the queue too (stage 07c): the draft changed as a whole — players hired or let go,
 * the treasury moved — and the whole roster saved, one step one PATCH, so that the server journals exactly that step
 * (`classifyTreasuryChange`). The players a purchase makes are the server's shape, which is what lets a lost answer's 409
 * be known as this very purchase.
 *
 * A player's edit, a fix by hand, an advancement, its undo, a roll put on a table advancement and a god's bonus are steps
 * of the queue too (stage 07d): one player's fields changed in the draft and the whole roster saved, checked first on a
 * copy of him by the rules the server stores them by. An advancement names its site roll by id, and a lost answer's
 * resend names the same one: the server uses a roll once.
 */
import { API_ERROR, ApiError } from "../../../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../../../core/api-client.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { normalizeSavedRoster, rosterForStorage } from "../../../data/roster-draft.mjs";
import { SAVE_STATUS, createRosterStore } from "../../../data/roster-store.mjs";
import { onSessionChange } from "../../../data/session.mjs";
import { loadMyTeams, refusalWithRules, setMyTeams } from "../../../data/teams.mjs";
import { sameValues } from "../../../domain/post-match/events.mjs";
import { clearAbsence, markAbsence, sitsOut } from "../../../domain/roster/absence.mjs";
import { playerCurrentCost } from "../../../domain/roster/costs.mjs";
import { rollRefusal, siteRollReferences, tableAdvancementFor } from "../../../domain/roster/dice.mjs";
import { addFavouredSkill, applyFix, editPlayer } from "../../../domain/roster/edits.mjs";
import { normalizePlayerAdvancements, normalizeSppCounters, storedPlayerId } from "../../../domain/roster/players.mjs";
import { playerAdvancementLevel, takeAdvancement, undoLastAdvancement } from "../../../domain/roster/progression.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { hirePlayers, hireQuote, playerRemoval, removeLeaguePlayer } from "../../../domain/roster/transfers.mjs";
import { MAX_SPP_COUNTER } from "../../../domain/roster/validate.mjs";
import { rowsForTeam } from "../../../domain/roster/values.mjs";

/** The steps taken and not yet confirmed by an answer, by team, in order, the first in the air: each its `space` (`refusalOf`). */
const waiting = new Map();
const waitingFor = (teamId) => waiting.get(teamId)?.length ?? 0;
/** The team the store saves on, by team: the object it was handed, whose revision each answer moves (`mergeServerTeam`). */
const tracked = new Map();

/** An answer stood behind one step: the first. */
function confirmStep(teamId) {
  const rest = waiting.get(teamId)?.slice(1) ?? [];
  if (rest.length) waiting.set(teamId, rest);
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
 * team is left as it is, since writing it would make it claim it is read. A read of the list on its way was asked
 * before this answer and would bring the old revision back over it: it is asked again, and the older answer is
 * dropped (`loadMyTeams`; as the treasury's `adopt` does, data/treasury.mjs).
 */
function putInPlace(team) {
  const reading = state.myTeams.loading;
  if (state.myTeams.items.some((item) => item.id === team?.id)) {
    setMyTeams(state.myTeams.items.map((item) => (item.id === team.id ? team : item)));
  }
  if (reading) void loadMyTeams(true);
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
    if (team) return { team };
    // K8: a roll given back out of its turn is a 409 without the team, no other device's save: refused as a 422 is.
    if (error?.code !== "DICE_ROLL_USED") throw error;
    throw new ApiError(API_ERROR.INVALID, { status: error.status, message: error.message, payload: error.payload });
  }
}

const transport = {
  async save(teamId, request, { endpoint }) {
    // A step queued behind another, or one that waited for the network, leaves later than the tap that made it.
    if (!sessionTokenHolds()) throw new ApiError(API_ERROR.FORBIDDEN, { payload: { error: { code: OTHER_TAB } } });
    const userId = state.auth.currentUser?.id;
    const answer = await patchTeam(endpoint, request);
    // A 2xx without the team (a proxy's page, which api.mjs reads as `{}`) says nothing of the save: it is an answer
    // that did not come, and the step waits as it does for the network. If it landed, its retry is a 409 that holds it.
    if (!answer?.team) throw new ApiError(API_ERROR.OFFLINE, { message: "The save's answer holds no team" });
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
    tracked.clear();
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
  tracked.set(meta.id, meta);
  return store.track(meta.id, tracking(meta, normalizeSavedRoster(meta)));
}

/**
 * The revision the team's next save is sent on: the one it was read or taken on, moved by each answer of the queue's
 * own saves; null for a team the queue does not hold. A write made elsewhere on the page (the treasury strip, stage
 * 08) leaves the coach's list ahead of it; the queue's own saves put their answer in the list and here alike.
 * @param {string} teamId @returns {number|null}
 */
export function savedRevision(teamId) {
  return tracked.get(teamId)?.revision ?? null;
}

/**
 * One step on the whole draft, saved as it is taken: `plan(draft)` says what the step does — null when it has nothing
 * to do, `{refusal}` when the rules refuse it (in words), else `{apply}`, which changes the draft and hands back what
 * the caller is told beside `ok`, if anything. Nothing is sent either for a team the queue does not hold, or while the
 * queue waits for the coach to settle a conflict — or for the server's roster after a 422: the refused step heads the
 * queue, and a step would send it again (`takeServerTeam` gives it up), so it gets the refusal's words instead. Another
 * tab's coach is told, and nothing is changed. `closed`, asked first, is why the screen sends nothing just now, at the
 * press (K15: a match begun before it was drawn again); `space`, the step's words for a refusal of its roll (`refusalOf`).
 * @param {string} teamId @param {(draft: object) => null | {refusal: string} | {apply: () => object|void}} plan
 * @param {{closed?: () => string, space?: string}} [options]
 * @returns {{ok: true} | {ok: false, refusal?: string} | {refusal: string}} with what `apply` handed back when `ok`
 */
function stepRoster(teamId, plan, { closed, space = "" } = {}) {
  const reason = closed?.() ?? "";
  if (reason) return { ok: false, refusal: reason };
  const draft = store.getDraft(teamId);
  if (!draft || store.statusOf(teamId) === SAVE_STATUS.CONFLICT) return { ok: false };
  const failed = store.statusOf(teamId) === SAVE_STATUS.ERROR ? saveState(teamId) : null;
  if (failed?.kind === API_ERROR.INVALID) return { ok: false, refusal: failed.refusal };
  const step = plan(draft);
  if (!step) return { ok: false };
  if (step.refusal) return { ok: false, refusal: step.refusal };
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  const applied = step.apply();
  waiting.set(teamId, [...(waiting.get(teamId) ?? []), space]);
  store.saveChange(teamId);
  return { ok: true, ...applied };
}

/** The player of the draft the id names, by his id as text (`storedPlayerId`), or null. */
const playerIn = (draft, id) => (id ? draft?.players.find((player) => storedPlayerId(player) === String(id)) : null) ?? null;

/**
 * One step on one player of the draft (`stepRoster`): `fieldsOf(player)` says what his fields become, or null when the
 * step has nothing to change. Nothing is sent for a player who is not on the roster.
 * @param {string} teamId @param {string} playerId his id in the roster @param {(player: object) => object|null} fieldsOf
 * @returns {{ok: true} | {ok: false, refusal?: string} | {refusal: string}}
 */
function stepOn(teamId, playerId, fieldsOf) {
  const player = playerIn(store.getDraft(teamId), playerId);
  if (!player) return { ok: false };
  return stepRoster(teamId, () => {
    const fields = fieldsOf(player);
    return fields ? { apply: () => { Object.assign(player, fields); return {}; } } : null;
  });
}

/**
 * One step of one SPP counter of one player (`stepOn`). Nothing is sent when the counter would leave 0…999: the
 * server refuses anything else.
 * @param {string} teamId @param {string} playerId his id in the roster @param {string} counter @param {number} delta
 * @returns {{ok: true} | {ok: false, refusal?: string} | {refusal: string}}
 */
export function stepSpp(teamId, playerId, counter, delta) {
  return stepOn(teamId, playerId, (player) => {
    const value = normalizeSppCounters(player.spp)[counter] + delta;
    if (!Number.isInteger(value) || value < 0 || value > MAX_SPP_COUNTER) return null;
    return { spp: { ...player.spp, [counter]: value } };
  });
}

/**
 * A coach's missed-match mark (`markAbsence`): the reason, the missed match, and what the injury does, one step of the
 * queue (`stepOn`). Nothing is sent for a player who misses it already: a second mark would lay its injury over the first.
 * @param {string} teamId @param {string} playerId his id in the roster
 * @param {{code: string, stat?: string, note?: string}} mark as `markAbsence` takes it, whole (the screen checks first)
 * @returns {{ok: true} | {ok: false, refusal?: string} | {refusal: string}}
 */
export function markSkip(teamId, playerId, mark) {
  return stepOn(teamId, playerId, (player) => (sitsOut(player) ? null : markAbsence(player, mark)));
}

/**
 * Back on the roster (`clearAbsence`): the missed match and its reason are over, one step of the queue (`stepOn`).
 * Nothing is sent for a player who misses nothing, or one retired for the season, which back on the roster does not end.
 * @param {string} teamId @param {string} playerId his id in the roster
 * @returns {{ok: true} | {ok: false, refusal?: string} | {refusal: string}}
 */
export function unmarkSkip(teamId, playerId) {
  return stepOn(teamId, playerId, (player) => (player.skipNextGame && !player.temporarilyRetired ? clearAbsence(player) : null));
}

/** A hire or a sale the rules refuse, in the words the domain's code names (`TRANSFER_REFUSALS`). */
const refusedFor = ({ code, params = {} }) => ({ refusal: t(`validation.${code}`, params) });

/**
 * A purchase (`hirePlayers`): the cart's players on the next free numbers, each with his price recorded, the treasury
 * paying for them — one step of the queue (`stepRoster`). The cart is asked again, as a whole, on the queue's draft at
 * the press (`hireQuote`): one the draft no longer pays for, or that breaks a limit, is refused in words; an empty one
 * sends nothing.
 * @param {string} teamId @param {object} race the team's race @param {import("../../../domain/roster/transfers.mjs").HireCart} cart
 * @returns {{ok: true, hired: {number: string, position: string}[], treasury: number} | {ok: false, refusal?: string} | {refusal: string}}
 */
export function buyPlayers(teamId, race, cart) {
  return stepRoster(teamId, (draft) => {
    const quote = hireQuote(race, draft, cart);
    if (!quote.count) return null;
    if (quote.refusal) return refusedFor(quote.refusal);
    return {
      apply: () => {
        const rows = rowsForTeam(race);
        const { hired } = hirePlayers(race, draft, cart);
        return { hired: hired.map((player) => ({ number: player.number, position: rows[player.rowIndex].position })), treasury: draft.treasury };
      },
    };
  });
}

/**
 * A player let go (`removeLeaguePlayer`): sold for his sale value, or his purchase cancelled for what was paid — one
 * step of the queue (`stepRoster`). `type` is what the sheet offered; the draft at the press decides (`playerRemoval`).
 * A purchase that is no longer one to cancel (a match sealed it) is refused in words, and so is a sale that would leave
 * fewer than seven; a sale offered for a purchase the draft says is to cancel sends nothing, nor does a player the
 * roster has not.
 * @param {string} teamId @param {object} race the team's race @param {string} playerId his id in the roster
 * @param {"sell"|"cancel-purchase"} type
 * @returns {{ok: true, amount: number, treasury: number} | {ok: false, refusal?: string} | {refusal: string}}
 */
export function removePlayer(teamId, race, playerId, type) {
  return stepRoster(teamId, (draft) => {
    const player = playerIn(draft, playerId);
    if (!player) return null;
    const removal = playerRemoval(race, draft, player);
    if (removal.type !== type) return type === "cancel-purchase" ? refusedFor({ code: "PLAYER_PURCHASE_CLOSED" }) : null;
    if (removal.blocked) return refusedFor({ code: "PLAYER_SALE_MIN" });
    return {
      apply: () => {
        // The plan asked the same rules: a removal not applied means the two drifted, and must not go as a step (T4-1).
        // The error carries the domain's reason in words (`refusal`), for the sheet to say it (market.mjs).
        const { applied, reason, amount } = removeLeaguePlayer(race, draft, playerId, type);
        if (!applied) {
          const drifted = new Error(`A removal the plan allowed was not applied (${reason}): the two checks drifted`);
          throw Object.assign(drifted, refusedFor({ code: reason }));
        }
        return { amount, treasury: draft.treasury };
      },
    };
  });
}

/**
 * A refusal `{code, params}` of a player's step in words (stage 07d): `${space}.refusal.${code}` (`teamPlayer`, `teamAdvance`),
 * a characteristic by its name (`stats.*`); a player the roster has not, as the server says it. The sheets word theirs so.
 */
export function refusalWordsOf(space, { code, params = {} }) {
  if (code === "PLAYER_NOT_FOUND") return t("validation.PLAYER_NOT_FOUND");
  return t(`${space}.refusal.${code}`, params.stat ? { ...params, stat: t(`stats.${params.stat}`) } : params);
}

/**
 * One step on one player (`stepRoster`, stage 07d): `plan(draft, player, row)`, `row` his position in `race` when given;
 * a player the roster (or his position the race) has not is refused in words. `options.closed` is required (K15): the
 * queue cannot know a match is on, so a step without it throws and sends nothing. Each step below tries itself on a copy
 * first; it answers `{ok: true, …what it says}`, `{ok: false, refusal?}` or `{refusal}` (another tab).
 */
function stepPlayer(teamId, { playerId, race, space, closed }, plan) {
  if (typeof closed !== "function") throw new TypeError("A player's step asks why the screen is closed: options.closed (K15)");
  return stepRoster(teamId, (draft) => {
    const player = playerIn(draft, playerId), row = player && race ? rowsForTeam(race)[Number(player.rowIndex)] : null;
    // No position for his `rowIndex` is a broken roster rather than a missing player: rare enough to share the words.
    return player && (row || !race) ? plan(draft, player, row) : refusedFor({ code: "PLAYER_NOT_FOUND" });
  }, { closed, space });
}

/** A domain step tried on a copy (`attempt(true)`), then made (`attempt(false)`): refused in words, none if it changes nothing. */
function tried(space, attempt, said = () => undefined) {
  const answer = attempt(true);
  if (!answer.applied) return { refusal: refusalWordsOf(space, answer) };
  return answer.changed === false ? null : { apply: () => said(attempt(false)) };
}

/** A player's number, name and captaincy (`editPlayer`), tried on a copy of the draft, where the armband moves. */
export function amendPlayer(teamId, playerId, edit, options) {
  return stepPlayer(teamId, { ...options, playerId, space: "teamPlayer" }, (draft) =>
    tried("teamPlayer", (copy) => editPlayer(copy ? structuredClone(draft) : draft, playerId, edit)));
}

/** A fix by hand (`applyFix`), saying `value`: the player's after it, in thousands. */
export function fixPlayer(teamId, race, playerId, fix, options) {
  return stepPlayer(teamId, { ...options, playerId, race, space: "teamPlayer" }, (draft, player, row) => tried("teamPlayer",
    (copy) => applyFix(race, copy ? structuredClone(draft) : draft, playerId, fix), () => ({ value: playerCurrentCost(row, player) })));
}

/**
 * An advancement (`takeAdvancement`), saying `cost`, `value` and `level` after it. A site roll's data (`choice.siteRoll`,
 * which no body carries) asks whether the player can take it (`rollRefusal`); a roll the draft names already sends nothing.
 */
export function advancePlayer(teamId, race, playerId, choice, skillGroups, options) {
  const { siteRoll, ...taken } = choice ?? {}, site = taken.roll?.via === "site";
  return stepPlayer(teamId, { ...options, playerId, race, space: "" }, (draft, player, row) => {
    if (site && siteRollReferences(draft).some(({ id }) => id === taken.roll.id)) return null;
    const stale = site && siteRoll ? rollRefusal(siteRoll, row, player) : null;
    if (stale) return { refusal: refusalWordsOf("teamAdvance", stale) };
    return tried("teamAdvance", (copy) => takeAdvancement(race, row, copy ? structuredClone(player) : player, taken, skillGroups),
      ({ cost, value }) => ({ cost, value, level: playerAdvancementLevel(player) }));
  });
}

/** The last advancement undone (`undoLastAdvancement`), saying its `cost`, `type`, `grants` and `roll`, which the save frees. */
export function undoAdvancement(teamId, playerId, options) {
  const said = ({ cost, type, grants, roll }) => ({ cost, type, grants, roll });
  return stepPlayer(teamId, { ...options, playerId, space: "teamPlayer" }, (draft, player) =>
    (undoLastAdvancement(structuredClone(player)).removed ? { apply: () => said(undoLastAdvancement(player)) } : null));
}

/** A waiting site roll named by the table advancement that gave its skill (`tableAdvancementFor`). */
export function bindRoll(teamId, playerId, roll, options) {
  return stepPlayer(teamId, { ...options, playerId, space: "" }, (draft, player) => {
    const index = tableAdvancementFor(roll, player), id = typeof roll?.id === "string" ? roll.id : "";
    const named = (advancement, at) => (at === index ? { ...advancement, roll: { id, via: "site" } } : advancement);
    return index >= 0 && id ? { apply: () => { player.advancements = normalizePlayerAdvancements(player.advancements).map(named); } } : null;
  });
}

/** A god's bonus skill among the player's favoured (`addFavouredSkill`); one he holds, or off the list, is refused in words. */
export function addFavoured(teamId, race, playerId, skill, options) {
  return stepPlayer(teamId, { ...options, playerId, race, space: "teamPlayer" }, (draft, player, row) => {
    const answer = addFavouredSkill(race, draft, row, structuredClone(player), skill);
    if (!answer.applied) return { refusal: t(`teamPlayer.favoured.${answer.code === "FAVOURED_SKILL_HELD" ? "held" : "unknown"}`) };
    return { apply: () => void addFavouredSkill(race, draft, row, player, skill) };
  });
}

/**
 * A failed save in words: a roll given back out of its turn says which undo goes first (K8); a skill a used roll was
 * rerolled against, in an edit's words (K16, `space` of the first that waits), else the server's — an advancement's too.
 */
function refusalOf(error, space) {
  if (error.code === OTHER_TAB) return t("auth.otherTab");
  if (error.code === "DICE_ROLL_USED") return t("teamAdvance.refusal.DICE_ROLL_USED");
  return error.code === "DICE_ROLL_MISMATCH" && space ? t(`${space}.refusal.DICE_ROLL_MISMATCH`) : refusalWithRules(error);
}

const stateOf = (teamId, { status, error }) => ({
  status,
  waiting: waitingFor(teamId),
  refusal: error ? refusalOf(error, waiting.get(teamId)?.[0]) : "",
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
  // Before the store is told: the state it announces is heard with the revision taken here.
  tracked.set(meta.id, meta);
  store.adoptServerRoster(meta.id, draft);
  return store.track(meta.id, tracking(meta, draft));
}

/**
 * A revision the queue or the coach's list already holds for the team above the answer's: a write that landed after
 * it, which taking the answer would take back (a revision only goes up). The same revision is the same team.
 */
function behind(team) {
  const listed = state.myTeams.items.find((item) => item.id === team.id)?.revision;
  return [savedRevision(team.id), listed].some((known) => Number.isInteger(known) && Number.isInteger(team.revision) && known > team.revision);
}

/**
 * The team a death or its undo was answered with (fallen.mjs): to the queue first (`takeServerTeam`), when `queue` says
 * so and it holds the team and has nothing of the coach's to send — no step waiting, none in the air — and then to its
 * place in the coach's list, whose listeners so read the queue's revision as the list's.
 *
 * `queue` is for the roster's visit that sent the write, while it is still on the screen: the draft it draws is the
 * queue's, and the one `takeServerTeam` hands back is drawn in its place. Any other caller — a visit that has left, the
 * fallen player's profile — leaves the queue as it is (final review, I1): a later visit of the roster draws the queue's
 * draft, and a draft swapped under it would draw a dead player still on the roster and steps saved but never drawn.
 * That visit sees the list ahead of its queue and reads the team again (index.mjs, `followList`); one opened later
 * reads it on entry.
 *
 * Null when the queue did not take it. Not asked to, or a team the queue does not hold: the list alone has it. A step
 * of the coach's waits or is in the air: the list alone has it, and the screen leaves the queue alone (K7) —
 * `takeServerTeam`, or a read taken by it, would give the step up without a word; the step meets the answer's
 * revision as a 409 the coach settles. That is why no death or undo is sent while a step waits (stage 07b, Task 8,
 * locks that). An answer older than what the queue or the list holds (`behind`): neither is touched, and a read
 * brings the newest.
 * @param {object} team GET's shape @param {{queue?: boolean}} [options]
 * @returns {object|null} the draft to draw; null when the queue did not take the team
 */
export function takeAnswerTeam(team, { queue = false } = {}) {
  if (behind(team)) return null;
  const free = queue && savedRevision(team.id) !== null && waitingFor(team.id) === 0;
  const draft = free ? takeServerTeam(team) : null;
  putInPlace(team);
  return draft;
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
    if (![...waiting.values()].some((steps) => steps.length > 0)) return;
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

/**
 * A team's treasury on the server: the history, a page at a time, and the two writes that move money — an
 * entry by hand (POST …/treasury) and a roster save (PATCH). A write is one at a time per team and asks whose
 * token it is first (stage 05, R12); its answer replaces the team in the coach's list, never edits the object
 * a screen may still hold (the 2.x roster store does).
 *
 * The history is kept here, not in `state`: a cache per team and per coach, `ledgerOf`, replaced whole on every
 * change so a screen that holds one keeps what it drew; `onLedgerChange` tells whoever draws from it. Reads are
 * numbered per team and only the newest one's answer is written, so a read asked before a write, which cannot
 * know of its line, is sent again by the write and its own answer is dropped.
 */
import { errorText } from "../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { rosterForStorage } from "../domain/roster/schema.mjs";
import { loadMyTeams, refusalWithRules, setMyTeams, unanswered } from "./teams.mjs";

/** The lines a page of the history holds (the server's usual page). */
export const LEDGER_PAGE = 20;

/**
 * What is kept of a team's history is kept for the coach who read it: another coach signed in on this page is
 * shown none of it, and an answer asked for one is never written for the other. The same coach signed out and in
 * again finds the cache as they left it (it is keyed by who read it, not by the session).
 */
const slotOf = (userId, teamId) => `${userId}:${teamId}`;
const mySlot = (teamId) => slotOf(state.auth.currentUser?.id, teamId);

/** slot → the history as the page holds it. */
const ledgers = new Map();
/** slot → the number of the newest read sent, and the kind of the one on its way (`{more}`, null when none). */
const reads = new Map();
/** The teams a write is on its way for. */
const writing = new Set();
const listeners = new Set();

const emptyLedger = () => ({ entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "" });
const heldAt = (slot) => ledgers.get(slot) ?? emptyLedger();

/**
 * What the page holds of a team's history: `entries` newest first, `next` the cursor of the page after them
 * (null at the end), `since` when the history is kept from, `total` how many lines there are. `loaded` is false
 * until a read has answered, so a team that has a history is not shown as having none while it is still coming.
 * @param {string} teamId @returns {{entries: object[], next: string|null, since: string|null, total: number, loaded: boolean, loading: boolean, error: string}}
 */
export function ledgerOf(teamId) {
  return heldAt(mySlot(teamId));
}

/** @param {() => void} listener @returns {() => void} what removes it again */
export function onLedgerChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every listener hears it, each on its own: one that throws does not stop the rest. */
function ledgerChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

function setLedger(slot, changes) {
  ledgers.set(slot, { ...heldAt(slot), ...changes });
  ledgerChanged();
}

function readerOf(slot) {
  if (!reads.has(slot)) reads.set(slot, { ticket: 0, flying: null });
  return reads.get(slot);
}

const textOrNone = (value) => value === null || value === undefined || typeof value === "string";

/**
 * Whether an answer is a page of the history as everything that draws one reads it: its lines (objects, in an
 * array), how many there are (a whole number), the cursor and the date each a text or none. A page that is not
 * would make every draw of the history throw, so it is not kept.
 */
function isLedgerPage(page) {
  return Array.isArray(page?.entries) && page.entries.every((entry) => entry !== null && typeof entry === "object")
    && Number.isInteger(page.total) && page.total >= 0 && textOrNone(page.next) && textOrNone(page.since);
}

/**
 * Read the history: its first page, which replaces what the page holds, or with `more` the page after the
 * lines it holds, which is added at the end (and nothing is sent where there is no page after). A failure keeps
 * the lines and says why in `error`; so does an answer that is not a page (`isLedgerPage`), which is a failed read
 * and not an empty history. The answer of a read that a newer one overtook, or of a coach who is no
 * longer the one signed in, is not written.
 * @param {string} teamId @param {{more?: boolean}} [options] @returns {Promise<void>}
 */
export async function readLedger(teamId, { more = false } = {}) {
  const userId = state.auth.currentUser?.id;
  const slot = slotOf(userId, teamId);
  const { next } = heldAt(slot);
  if (more && !next) return;
  const reader = readerOf(slot);
  const ticket = ++reader.ticket;
  reader.flying = { more };
  const query = more ? `before=${encodeURIComponent(next)}&limit=${LEDGER_PAGE}` : `limit=${LEDGER_PAGE}`;
  setLedger(slot, { loading: true, error: "" });
  let page = null;
  let failure = null;
  try {
    page = await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/ledger?${query}`);
  } catch (error) {
    failure = error;
  }
  if (ticket !== reader.ticket) return;
  reader.flying = null;
  if (state.auth.currentUser?.id !== userId) {
    setLedger(slot, { loading: false });
    return;
  }
  if (failure || !isLedgerPage(page)) {
    setLedger(slot, { loading: false, error: failure ? errorText(failure) : t("treasury.history.unreadable") });
    return;
  }
  const entries = more ? [...heldAt(slot).entries, ...page.entries] : page.entries;
  setLedger(slot, { entries, next: page.next ?? null, since: page.since ?? null, total: page.total, loaded: true, loading: false });
}

/**
 * The team's own copy in the coach's list is replaced by the one an answer brought, in its place; false where the
 * coach is no longer the one who wrote. A read of the list on its way was asked before the write and would bring
 * the old revision back over the new one: it is asked again, and the older answer is dropped (`loadMyTeams`).
 */
function adopt(team, userId) {
  if (state.auth.currentUser?.id !== userId) return false;
  const reading = state.myTeams.loading;
  setMyTeams(state.myTeams.items.map((item) => (item.id === team.id ? team : item)));
  if (reading) void loadMyTeams(true);
  return true;
}

/**
 * An entry the server wrote heads the history the page holds, and counts, unless a read has brought it already (a
 * first page asked while the entry was on its way, and answered after the server wrote it). A read asked before the
 * entry and still on its way cannot know of it: it is sent again, and the new one takes the next number, so the old
 * answer is dropped. So is a read sent while the entry was on its way, answered before its answer came: its count
 * may hold the line where its lines do not, or the other way about, so the first page is read once more.
 * @param {number} ticket the number of the newest read when the entry was sent
 */
function addLine(teamId, entry, ticket) {
  const slot = mySlot(teamId);
  const reader = readerOf(slot);
  const ledger = heldAt(slot);
  if (ledger.loaded && !ledger.entries.some((line) => line.id === entry.id)) {
    setLedger(slot, { entries: [entry, ...ledger.entries], total: ledger.total + 1 });
  }
  if (reader.ticket !== ticket) void readLedger(teamId);
  else if (reader.flying) void readLedger(teamId, reader.flying);
}

/** Whether a write is on its way for the team: a screen disables what would send another. */
export function isWriting(teamId) {
  return writing.has(teamId);
}

/**
 * A write refused. The team a 409 brings is taken as it is (the write may have been applied, its answer lost):
 * `changed`. A request that got no answer to stand behind may have been applied as well: `unknown`, and the team and
 * its history are read again, so the page shows what the server holds (one or the other alone would show them
 * disagreeing, and the next write would meet a revision the list does not have). Both say so in words that send the
 * coach to the history before another try; any other refusal is the server's own.
 */
function refusal(teamId, error, userId) {
  if (error?.code === "TEAM_SAVED_ELSEWHERE" && error.payload?.team) {
    if (adopt(error.payload.team, userId)) void readLedger(teamId);
    return { refusal: t("treasury.changedElsewhere"), changed: true };
  }
  if (unanswered(error)) {
    if (state.auth.currentUser?.id === userId) {
      void readLedger(teamId);
      void loadMyTeams(true);
    }
    return { refusal: t("treasury.mayHaveWritten"), unknown: true };
  }
  return { refusal: refusalWithRules(error) };
}

/**
 * One write for a team, one at a time. `send(team)` is the request, made with the team as the list holds it
 * (its revision); `done(answer, userId, ticket)` is what a success changes and what it returns, with the number of
 * the newest read of the history when the request was sent. Never throws on a refusal. The flag is lowered before
 * the answer is used, so what redraws on the new list sees no write on its way.
 */
async function write(teamId, send, done) {
  if (writing.has(teamId)) return { ignored: true };
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  const team = state.myTeams.items.find((item) => item.id === teamId);
  if (!team) return { refusal: t("error.TEAM_NOT_FOUND") };
  const userId = state.auth.currentUser?.id;
  const ticket = readerOf(slotOf(userId, teamId)).ticket;
  writing.add(teamId);
  let answer = null;
  let failure = null;
  try {
    answer = await send(team);
  } catch (error) {
    failure = error;
  }
  writing.delete(teamId);
  return failure ? refusal(teamId, failure, userId) : done(answer, userId, ticket);
}

/**
 * Add a line to the treasury by hand. The answer's team replaces the team in the list and its line heads the
 * history. Sent once: an answer that does not come may mean the line was written, and the retry then meets the
 * revision (409) and takes the team as it is instead of paying twice.
 * @param {string} teamId @param {{delta: number, reason: string, note?: string}} entry
 * @returns {Promise<{entry: object}|{refusal: string, changed?: true, unknown?: true}|{ignored: true}>} `changed`: the
 *   team was changed elsewhere (a 409, perhaps by this very entry whose answer was lost) and is taken as it stands;
 *   `unknown`: no answer came, the entry may have been written, and the team and its history are being read again.
 *   The sheet that sent it starts over on either.
 */
export function addTreasuryEntry(teamId, { delta, reason, note }) {
  const send = (team) => apiRequest(`/api/teams/${encodeURIComponent(teamId)}/treasury`, {
    method: "POST",
    body: JSON.stringify({ delta, reason, note: note || null, revision: team.revision }),
  });
  return write(teamId, send, (answer, userId, ticket) => {
    if (adopt(answer.team, userId)) addLine(teamId, answer.entry, ticket);
    return { entry: answer.entry };
  });
}

/**
 * Save a roster draft (the stored shape, `normalizeDraft`'s) as the team's roster. The name, the race and the
 * logo go as the team has them: the logo is not re-encoded and not lost. The server writes the lines this page
 * does not have (a purchase, a sale), so the history is read again.
 * @param {string} teamId @param {object} draft
 * @returns {Promise<{team: object}|{refusal: string, changed?: true, unknown?: true}|{ignored: true}>} `changed` and
 *   `unknown` as for `addTreasuryEntry`.
 */
export function saveTeamRoster(teamId, draft) {
  const send = (team) => apiRequest(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: team.name,
      baseTeamSlug: team.baseTeamSlug,
      logoData: team.logoData ?? null,
      roster: rosterForStorage({ ...draft, teamSlug: team.baseTeamSlug, teamName: team.name }),
      revision: team.revision,
    }),
  });
  return write(teamId, send, (answer, userId) => {
    if (adopt(answer.team, userId)) void readLedger(teamId);
    return { team: answer.team };
  });
}

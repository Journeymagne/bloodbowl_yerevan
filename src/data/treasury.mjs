/**
 * A team's treasury on the server: the history, a page at a time, and the two writes that move money — an
 * entry by hand (POST …/treasury) and a roster save (PATCH). A write is one at a time per team and asks whose
 * token it is first (stage 05, R12); its answer replaces the team in the coach's list, never edits the object
 * a screen may still hold (the 2.x roster store does).
 *
 * The history is kept here, not in `state`: a cache per team, `ledgerOf`, replaced whole on every change so a
 * screen that holds one keeps what it drew; `onLedgerChange` tells whoever draws from it. Reads are numbered
 * per team and only the newest one's answer is written, so a read asked before a write, which cannot know of its
 * line, is sent again by the write and its own answer is dropped.
 */
import { errorText } from "../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../core/api-client.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { rosterForStorage } from "../domain/roster/schema.mjs";
import { refusalWithRules, setMyTeams } from "./teams.mjs";

/** The lines a page of the history holds (the server's usual page). */
export const LEDGER_PAGE = 20;

/** teamId → the history as the page holds it. */
const ledgers = new Map();
/** teamId → the number of the newest read sent, and the kind of the one on its way (`{more}`, null when none). */
const reads = new Map();
/** The teams a write is on its way for. */
const writing = new Set();
const listeners = new Set();

const emptyLedger = () => ({ entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "" });

/**
 * What the page holds of a team's history: `entries` newest first, `next` the cursor of the page after them
 * (null at the end), `since` when the history is kept from, `total` how many lines there are. `loaded` is false
 * until a read has answered, so a team that has a history is not shown as having none while it is still coming.
 * @param {string} teamId @returns {{entries: object[], next: string|null, since: string|null, total: number, loaded: boolean, loading: boolean, error: string}}
 */
export function ledgerOf(teamId) {
  return ledgers.get(teamId) ?? emptyLedger();
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

function setLedger(teamId, changes) {
  ledgers.set(teamId, { ...ledgerOf(teamId), ...changes });
  ledgerChanged();
}

function readerOf(teamId) {
  if (!reads.has(teamId)) reads.set(teamId, { ticket: 0, flying: null });
  return reads.get(teamId);
}

/**
 * Read the history: its first page, which replaces what the page holds, or with `more` the page after the
 * lines it holds, which is added at the end (and nothing is sent where there is no page after). A failure keeps
 * the lines and says why in `error`. The answer of a read that a newer one overtook, or of a coach who is no
 * longer the one signed in, is not written.
 * @param {string} teamId @param {{more?: boolean}} [options] @returns {Promise<void>}
 */
export async function readLedger(teamId, { more = false } = {}) {
  const { next } = ledgerOf(teamId);
  if (more && !next) return;
  const reader = readerOf(teamId);
  const ticket = ++reader.ticket;
  reader.flying = { more };
  const userId = state.auth.currentUser?.id;
  const query = more ? `before=${encodeURIComponent(next)}&limit=${LEDGER_PAGE}` : `limit=${LEDGER_PAGE}`;
  setLedger(teamId, { loading: true, error: "" });
  let page = null;
  let failure = null;
  try {
    page = await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/ledger?${query}`);
  } catch (error) {
    failure = error;
  }
  if (ticket !== reader.ticket || state.auth.currentUser?.id !== userId) return;
  reader.flying = null;
  if (failure) {
    setLedger(teamId, { loading: false, error: errorText(failure) });
    return;
  }
  const entries = more ? [...ledgerOf(teamId).entries, ...page.entries] : page.entries;
  setLedger(teamId, { entries, next: page.next ?? null, since: page.since ?? null, total: page.total, loaded: true, loading: false });
}

/** The team's own copy in the coach's list is replaced by the one an answer brought, in its place; false where the coach is no longer the one who wrote. */
function adopt(team, userId) {
  if (state.auth.currentUser?.id !== userId) return false;
  setMyTeams(state.myTeams.items.map((item) => (item.id === team.id ? team : item)));
  return true;
}

/**
 * An entry the server wrote heads the history the page holds, and counts. A read on its way was asked before the
 * entry and cannot know of it: it is sent again, and the new one takes the next number, so the old answer is dropped.
 */
function addLine(teamId, entry) {
  const { flying } = readerOf(teamId);
  const ledger = ledgerOf(teamId);
  if (ledger.loaded) setLedger(teamId, { entries: [entry, ...ledger.entries], total: ledger.total + 1 });
  if (flying) void readLedger(teamId, flying);
}

/** Whether a write is on its way for the team: a screen disables what would send another. */
export function isWriting(teamId) {
  return writing.has(teamId);
}

/** A write refused: the team the 409 brings is taken as it is (the write may have been applied, its answer lost), and said so. */
function refusal(teamId, error, userId) {
  if (error?.code === "TEAM_SAVED_ELSEWHERE" && error.payload?.team) {
    if (adopt(error.payload.team, userId)) void readLedger(teamId);
    return { refusal: t("treasury.changedElsewhere") };
  }
  return { refusal: refusalWithRules(error) };
}

/**
 * One write for a team, one at a time. `send(team)` is the request, made with the team as the list holds it
 * (its revision); `done(answer, userId)` is what a success changes and what it returns. Never throws on a
 * refusal. The flag is lowered before the answer is used, so what redraws on the new list sees no write on its way.
 */
async function write(teamId, send, done) {
  if (writing.has(teamId)) return { ignored: true };
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  const team = state.myTeams.items.find((item) => item.id === teamId);
  if (!team) return { refusal: t("error.TEAM_NOT_FOUND") };
  const userId = state.auth.currentUser?.id;
  writing.add(teamId);
  let answer = null;
  let failure = null;
  try {
    answer = await send(team);
  } catch (error) {
    failure = error;
  }
  writing.delete(teamId);
  return failure ? refusal(teamId, failure, userId) : done(answer, userId);
}

/**
 * Add a line to the treasury by hand. The answer's team replaces the team in the list and its line heads the
 * history. Sent once: an answer that does not come may mean the line was written, and the retry then meets the
 * revision (409) and takes the team as it is instead of paying twice.
 * @param {string} teamId @param {{delta: number, reason: string, note?: string}} entry
 * @returns {Promise<{entry: object}|{refusal: string}|{ignored: true}>}
 */
export function addTreasuryEntry(teamId, { delta, reason, note }) {
  const send = (team) => apiRequest(`/api/teams/${encodeURIComponent(teamId)}/treasury`, {
    method: "POST",
    body: JSON.stringify({ delta, reason, note: note || null, revision: team.revision }),
  });
  return write(teamId, send, (answer, userId) => {
    if (adopt(answer.team, userId)) addLine(teamId, answer.entry);
    return { entry: answer.entry };
  });
}

/**
 * Save a roster draft (the stored shape, `normalizeDraft`'s) as the team's roster. The name, the race and the
 * logo go as the team has them: the logo is not re-encoded and not lost. The server writes the lines this page
 * does not have (a purchase, a sale), so the history is read again.
 * @param {string} teamId @param {object} draft @returns {Promise<{team: object}|{refusal: string}|{ignored: true}>}
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

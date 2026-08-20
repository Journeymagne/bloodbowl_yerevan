/**
 * The one owner of roster drafts and of everything that writes them back.
 *
 * ## Why this exists
 *
 * The editor used to save like this: mutate a draft object, debounce, PATCH the
 * whole thing, then `Object.assign(savedTeam, result.team)` when the server
 * answered. That last step replaced `savedTeam.roster` with a freshly parsed
 * copy while the open screen kept mutating the old object. From then on the two
 * were different objects, and the next save serialised the server's copy —
 * silently dropping every edit made after the previous save finished. Typing a
 * player's name, changing a number, entering SPP: none of those re-render, so
 * they were exactly the edits that vanished.
 *
 * The rule here is therefore: **the draft object a screen holds is never
 * replaced.** The server's answer updates the team's metadata (id, timestamps,
 * name) and nothing else. If the roster itself has to be replaced — after a
 * conflict, say — that is an explicit `adoptServerRoster()` call and the screen
 * re-renders around the new object.
 *
 * ## What else it does
 *
 * - one in-flight request per team, later edits queue behind it, so writes
 *   cannot land out of order;
 * - a save that has not been written yet survives a reload (it is mirrored into
 *   storage and cleared once the server has it);
 * - status is a state, not a sentence, so the interface can translate it;
 * - `hasPendingChanges()` is what the beforeunload guard asks.
 *
 * Everything is injectable so the whole thing can be tested without a browser
 * or a database — see test/roster-store.test.mjs, which reproduces the exact
 * interleavings that used to lose edits.
 */

export const SAVE_STATUS = Object.freeze({
  IDLE: "idle",
  DIRTY: "dirty",
  SAVING: "saving",
  SAVED: "saved",
  OFFLINE: "offline",
  ERROR: "error",
  CONFLICT: "conflict",
});

const PENDING_PREFIX = "pending-roster:";

const pendingKey = (teamId) => `${PENDING_PREFIX}${teamId}`;

function snapshotOf(entry) {
  return {
    status: entry.status,
    error: entry.error ?? null,
    savedAt: entry.savedAt ?? null,
    pending: entry.dirty || entry.inFlight,
  };
}

function notify(entry) {
  const snapshot = snapshotOf(entry);
  for (const listener of entry.listeners) listener(snapshot);
}

function setStatus(entry, status, error = null) {
  // While a request is in the air the indicator stays on "saving" even if new
  // edits have already queued behind it: flickering saving → dirty → saving on
  // every keystroke tells the user nothing useful. The `pending` flag in the
  // snapshot is what says whether anything is still unsaved.
  entry.status = entry.inFlight && status === SAVE_STATUS.DIRTY ? SAVE_STATUS.SAVING : status;
  entry.error = error;
  notify(entry);
}

function rememberPending(deps, entry) {
  if (!deps.storage) return;
  try {
    deps.storage.setJson(pendingKey(entry.teamId), {
      savedAt: deps.now(),
      request: entry.buildRequest(entry.draft),
    });
  } catch {
    // Mirroring is best effort: a draft we cannot serialise yet is still safe
    // in memory, and the real save will report any problem with it.
  }
}

function forgetPending(deps, entry) {
  deps.storage?.remove(pendingKey(entry.teamId));
}

function scheduleSave(deps, entry) {
  if (entry.timer) deps.clearTimeoutFn(entry.timer);
  const waited = deps.now() - entry.firstDirtyAt;
  const delay = Math.max(0, Math.min(deps.debounceMs, deps.maxDelayMs - waited));
  entry.timer = deps.setTimeoutFn(() => {
    entry.timer = null;
    void runSave(deps, entry);
  }, delay);
}

/** Apply the fields the server owns without ever touching the live draft. */
function mergeServerTeam(entry, serverTeam) {
  if (!entry.meta || !serverTeam) return;
  for (const [key, value] of Object.entries(serverTeam)) {
    if (key === "roster") continue;
    entry.meta[key] = value;
  }
}

/** Kinds worth keeping the edit for and trying again — see src/core/api.mjs. */
const RETRYABLE_KINDS = new Set(["offline", "timeout"]);

function failSave(deps, entry, error) {
  entry.inFlight = false;
  entry.dirty = true;
  rememberPending(deps, entry);
  if (RETRYABLE_KINDS.has(error?.kind)) setStatus(entry, SAVE_STATUS.OFFLINE, error);
  else if (error?.kind === "conflict") setStatus(entry, SAVE_STATUS.CONFLICT, error);
  else setStatus(entry, SAVE_STATUS.ERROR, error);
  return entry.status;
}

async function runSave(deps, entry, { force = false } = {}) {
  if (entry.inFlight) {
    // Someone edited while a request was in the air; runSave() is called again
    // when it settles, so the newest draft is what finally lands.
    entry.dirty = true;
    return entry.status;
  }
  if (!entry.dirty && !force) return entry.status;

  entry.inFlight = true;
  entry.dirty = false;
  setStatus(entry, SAVE_STATUS.SAVING);

  let request;
  try {
    request = await entry.buildRequest(entry.draft);
  } catch (error) {
    return failSave(deps, entry, error);
  }

  try {
    const result = await deps.transport.save(entry.teamId, request, { endpoint: entry.endpoint });
    entry.inFlight = false;
    mergeServerTeam(entry, result?.team);

    if (entry.dirty) {
      // More edits arrived while we were saving: keep them queued and do not
      // claim success yet.
      rememberPending(deps, entry);
      setStatus(entry, SAVE_STATUS.DIRTY);
      return runSave(deps, entry);
    }

    entry.firstDirtyAt = null;
    entry.savedAt = deps.now();
    forgetPending(deps, entry);
    setStatus(entry, SAVE_STATUS.SAVED);
    return entry.status;
  } catch (error) {
    return failSave(deps, entry, error);
  }
}

function makeEntry(teamId, { draft, buildRequest, endpoint, meta }) {
  return {
    teamId,
    draft,
    buildRequest,
    endpoint: endpoint ?? `/api/teams/${teamId}`,
    meta: meta ?? null,
    status: SAVE_STATUS.IDLE,
    error: null,
    savedAt: null,
    dirty: false,
    inFlight: false,
    timer: null,
    firstDirtyAt: null,
    listeners: new Set(),
  };
}

function entryFinder(entries) {
  return (teamId) => {
    const entry = entries.get(teamId);
    if (!entry) throw new Error(`roster-store: team ${teamId} is not tracked`);
    return entry;
  };
}

/** Registering drafts and listening to them. */
function trackingApi(deps, entries) {
  const entryFor = entryFinder(entries);
  return {
    /**
     * Start managing a draft.
     *
     * @param {string} teamId
     * @param {{draft: object, buildRequest: (draft: object) => object, endpoint?: string, meta?: object}} options
     * @returns {object} the draft to render — the existing one if it has unsaved edits
     */
    track(teamId, options = {}) {
      if (!teamId) throw new Error("roster-store: teamId is required");
      if (!options.draft) throw new Error("roster-store: draft is required");
      if (typeof options.buildRequest !== "function") throw new Error("roster-store: buildRequest is required");

      const existing = entries.get(teamId);
      if (!existing) {
        entries.set(teamId, makeEntry(teamId, options));
        return options.draft;
      }

      // Re-entering the same screen: adopt the new callbacks, but never swap a
      // draft that still holds unsaved edits for a copy from the server.
      existing.buildRequest = options.buildRequest;
      existing.endpoint = options.endpoint ?? existing.endpoint;
      existing.meta = options.meta ?? existing.meta;
      if (!existing.dirty && !existing.inFlight && options.draft !== existing.draft) {
        existing.draft = options.draft;
      }
      return existing.draft;
    },

    untrack(teamId) {
      const entry = entries.get(teamId);
      if (!entry) return;
      if (entry.timer) deps.clearTimeoutFn(entry.timer);
      entries.delete(teamId);
    },

    getDraft(teamId) {
      return entries.get(teamId)?.draft ?? null;
    },

    subscribe(teamId, listener) {
      const entry = entryFor(teamId);
      entry.listeners.add(listener);
      listener(snapshotOf(entry));
      return () => entry.listeners.delete(listener);
    },

    statusOf(teamId) {
      return entries.get(teamId)?.status ?? SAVE_STATUS.IDLE;
    },

    hasPendingChanges() {
      for (const entry of entries.values()) {
        if (entry.dirty || entry.inFlight) return true;
      }
      return false;
    },
  };
}

/** Writing drafts back, and what to do when that fails. */
function savingApi(deps, entries) {
  const entryFor = entryFinder(entries);
  return {
    /** An edit happened. Debounced, but never delayed past maxDelayMs. */
    markDirty(teamId) {
      const entry = entryFor(teamId);
      entry.dirty = true;
      if (entry.firstDirtyAt === null) entry.firstDirtyAt = deps.now();
      rememberPending(deps, entry);
      setStatus(entry, SAVE_STATUS.DIRTY);
      scheduleSave(deps, entry);
    },

    /** Save now and wait for it — the save button and the unload guard use this. */
    async flush(teamId) {
      const entry = entries.get(teamId);
      if (!entry) return null;
      if (entry.timer) {
        deps.clearTimeoutFn(entry.timer);
        entry.timer = null;
      }
      if (!entry.dirty && !entry.inFlight) return entry.status;
      return runSave(deps, entry, { force: true });
    },

    /**
     * Take the server's version after a conflict. The only place the draft is
     * ever replaced; the caller has to re-render around the new object.
     */
    adoptServerRoster(teamId, roster) {
      const entry = entryFor(teamId);
      entry.draft = roster;
      entry.dirty = false;
      entry.firstDirtyAt = null;
      forgetPending(deps, entry);
      setStatus(entry, SAVE_STATUS.IDLE);
      return entry.draft;
    },

    /** Unsaved edits mirrored to storage, if any survived a reload. */
    readPending(teamId) {
      return deps.storage?.getJson(pendingKey(teamId), null) ?? null;
    },

    /**
     * Put the edits that survived a reload back into the editor and queue them
     * for saving. Returns the restored draft, or null if there was nothing.
     */
    restorePending(teamId) {
      const entry = entryFor(teamId);
      const roster = deps.storage?.getJson(pendingKey(teamId), null)?.request?.roster;
      if (!roster) return null;
      entry.draft = roster;
      entry.dirty = true;
      entry.firstDirtyAt = deps.now();
      setStatus(entry, SAVE_STATUS.DIRTY);
      scheduleSave(deps, entry);
      return entry.draft;
    },

    discardPending(teamId) {
      deps.storage?.remove(pendingKey(teamId));
    },
  };
}

export function createRosterStore({
  transport,
  storage,
  // Bound, not the bare reference: `deps.setTimeoutFn(...)` below calls this as
  // a method of `deps`, and native setTimeout/clearTimeout throw "Illegal
  // invocation" in a browser unless `this` is the window they came from.
  setTimeoutFn = setTimeout.bind(globalThis),
  clearTimeoutFn = clearTimeout.bind(globalThis),
  debounceMs = 450,
  /** Never let edits sit unsaved longer than this while someone keeps typing. */
  maxDelayMs = 5000,
  now = () => Date.now(),
} = {}) {
  if (!transport?.save) throw new Error("roster-store needs a transport with save()");

  const deps = { transport, storage, setTimeoutFn, clearTimeoutFn, debounceMs, maxDelayMs, now };
  /** @type {Map<string, object>} */
  const entries = new Map();

  return {
    ...trackingApi(deps, entries),
    ...savingApi(deps, entries),
    /** Test seam: how many teams are being managed right now. */
    get size() {
      return entries.size;
    },
  };
}

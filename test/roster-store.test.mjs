import test from "node:test";
import assert from "node:assert/strict";

import { SAVE_STATUS, createRosterStore } from "../src/data/roster-store.mjs";
import { createStorage } from "../src/core/storage.mjs";

// ---------------------------------------------------------------------------
// Harness: a transport whose responses we can hold open, and manual timers, so
// the exact interleavings that used to lose edits can be reproduced.
// ---------------------------------------------------------------------------

function createHarness({ autoResolve = true, debounceMs = 0 } = {}) {
  const calls = [];
  const inflight = [];
  let clock = 0;
  const timers = [];

  const transport = {
    save(teamId, request) {
      calls.push({ teamId, request: JSON.parse(JSON.stringify(request)) });
      if (autoResolve) {
        return Promise.resolve({ team: serverTeamFor(teamId, request) });
      }
      return new Promise((resolve, reject) => {
        inflight.push({
          teamId,
          request,
          resolve: (team) => resolve({ team: team ?? serverTeamFor(teamId, request) }),
          reject,
        });
      });
    },
  };

  function serverTeamFor(teamId, request) {
    return {
      id: teamId,
      name: request.name,
      updatedAt: `stamp-${calls.length}`,
      // The server always answers with its own parsed copy of the roster. This
      // is what used to get spliced over the live draft.
      roster: JSON.parse(JSON.stringify(request.roster)),
    };
  }

  const store = createRosterStore({
    transport,
    debounceMs,
    now: () => clock,
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, at: clock + delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => { if (timer) timer.cancelled = true; },
  });

  /** Fire every timer that is due, like advancing a real clock would. */
  async function tick(ms = 500) {
    clock += ms;
    const due = timers.filter((timer) => !timer.cancelled && timer.at <= clock);
    for (const timer of due) {
      timer.cancelled = true;
      timer.fn();
    }
    await flushMicrotasks();
  }

  async function settleAll() {
    while (inflight.length) inflight.shift().resolve();
    await flushMicrotasks();
  }

  return { store, transport, calls, inflight, tick, settleAll, advance: (ms) => { clock += ms; } };
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function trackTeam(store, { teamId = "team-1", draft } = {}) {
  const live = draft ?? { teamName: "Team", players: [{ id: "p1", name: "A" }] };
  const meta = { id: teamId, name: "Team", roster: live };
  const tracked = store.track(teamId, {
    draft: live,
    meta,
    buildRequest: (current) => ({ name: current.teamName, roster: current }),
  });
  return { draft: tracked, meta };
}

// ---------------------------------------------------------------------------

test("the draft a screen holds is never swapped for the server's copy", async () => {
  const harness = createHarness();
  const { draft, meta } = trackTeam(harness.store);

  draft.players[0].name = "First edit";
  harness.store.markDirty("team-1");
  await harness.tick();

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.store.getDraft("team-1"), draft, "identity must survive a save");
  assert.equal(meta.roster, draft, "the team record still points at the live draft");
  assert.equal(meta.updatedAt, "stamp-1", "server metadata is merged");
});

test("an edit is queued for saving without a debounce delay", async () => {
  const harness = createHarness();
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Save immediately";
  harness.store.markDirty("team-1");
  await harness.tick(0);

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].request.roster.teamName, "Save immediately");
});

test("an edit made right after a save still reaches the server", async () => {
  // This is the regression that motivated the store: type a name, wait for
  // "saved", type again without anything re-rendering, reload — the second edit
  // used to be gone because the next request serialised the server's copy.
  const harness = createHarness();
  const { draft } = trackTeam(harness.store);

  draft.players[0].name = "First edit";
  harness.store.markDirty("team-1");
  await harness.tick();
  assert.equal(harness.calls[0].request.roster.players[0].name, "First edit");

  draft.players[0].name = "Second edit";
  harness.store.markDirty("team-1");
  await harness.tick();

  assert.equal(harness.calls.length, 2);
  assert.equal(harness.calls[1].request.roster.players[0].name, "Second edit");
});

test("edits made while a request is in the air are not lost and do not overtake it", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);

  draft.players[0].name = "one";
  harness.store.markDirty("team-1");
  await harness.tick();
  assert.equal(harness.inflight.length, 1, "exactly one request in the air");

  draft.players[0].name = "two";
  harness.store.markDirty("team-1");
  await harness.tick();
  assert.equal(harness.inflight.length, 1, "the second edit waits its turn");
  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.SAVING);

  harness.inflight.shift().resolve();
  await flushMicrotasks();

  assert.equal(harness.calls.length, 2, "the queued edit went out after the first landed");
  assert.equal(harness.calls[1].request.roster.players[0].name, "two");

  await harness.settleAll();
  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.SAVED);
});

test("status walks from dirty through saving to saved", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);
  const seen = [];
  harness.store.subscribe("team-1", (snapshot) => seen.push(snapshot.status));

  draft.teamName = "Renamed";
  harness.store.markDirty("team-1");
  await harness.tick();
  await harness.settleAll();

  assert.deepEqual(seen, [SAVE_STATUS.IDLE, SAVE_STATUS.DIRTY, SAVE_STATUS.SAVING, SAVE_STATUS.SAVED]);
});

test("a failed save keeps the edit, reports offline, and retries successfully", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Offline edit";
  harness.store.markDirty("team-1");
  await harness.tick();

  const offline = Object.assign(new Error("network down"), { kind: "offline" });
  harness.inflight.shift().reject(offline);
  await flushMicrotasks();

  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.OFFLINE);
  assert.equal(harness.store.hasPendingChanges(), true);

  harness.store.markDirty("team-1");
  await harness.tick();
  harness.inflight.shift().resolve();
  await flushMicrotasks();

  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.SAVED);
  assert.equal(harness.store.hasPendingChanges(), false);
  assert.equal(harness.calls.at(-1).request.roster.teamName, "Offline edit");
});

test("a conflict is reported as such and the draft is left alone", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Mine";
  harness.store.markDirty("team-1");
  await harness.tick();

  const conflict = Object.assign(new Error("newer version on the server"), { kind: "conflict" });
  harness.inflight.shift().reject(conflict);
  await flushMicrotasks();

  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.CONFLICT);
  assert.equal(harness.store.getDraft("team-1"), draft);
  assert.equal(draft.teamName, "Mine", "my edit is still here to be re-applied or dropped");

  const serverCopy = { teamName: "Theirs", players: [] };
  const adopted = harness.store.adoptServerRoster("team-1", serverCopy);
  assert.equal(adopted, serverCopy);
  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.IDLE);
});

test("continuous typing is saved at least every maxDelayMs", async () => {
  const harness = createHarness({ debounceMs: 450 });
  const { draft } = trackTeam(harness.store);

  // Type every 200 ms for 5.4 s without ever pausing long enough to debounce.
  for (let index = 0; index < 27; index += 1) {
    draft.teamName = `Name ${index}`;
    harness.store.markDirty("team-1");
    await harness.tick(200);
  }

  assert.ok(harness.calls.length >= 1, "the debounce cap forced a save mid-typing");
  // The very last keystroke is of course still pending — it just happened.
  assert.equal(harness.store.hasPendingChanges(), true);
  await harness.tick(1000);
  assert.equal(harness.store.hasPendingChanges(), false, "and it lands once typing stops");
});

test("flush saves immediately without waiting for the debounce", async () => {
  const harness = createHarness();
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Save me now";
  harness.store.markDirty("team-1");
  assert.equal(harness.calls.length, 0, "nothing has gone out yet");

  await harness.store.flush("team-1");
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].request.roster.teamName, "Save me now");
  assert.equal(harness.store.hasPendingChanges(), false);
});

test("re-tracking the same team keeps unsaved edits instead of adopting a fresh draft", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Unsaved";
  harness.store.markDirty("team-1");

  const replacement = { teamName: "Stale reload", players: [] };
  const kept = harness.store.track("team-1", {
    draft: replacement,
    meta: { id: "team-1" },
    buildRequest: (current) => ({ name: current.teamName, roster: current }),
  });

  assert.equal(kept, draft, "the draft with unsaved edits wins");
  assert.equal(kept.teamName, "Unsaved");
});

test("hasPendingChanges covers every tracked team", async () => {
  const harness = createHarness({ autoResolve: false });
  trackTeam(harness.store, { teamId: "team-1" });
  const second = trackTeam(harness.store, { teamId: "team-2", draft: { teamName: "Second", players: [] } });

  assert.equal(harness.store.hasPendingChanges(), false);
  second.draft.teamName = "Edited";
  harness.store.markDirty("team-2");
  assert.equal(harness.store.hasPendingChanges(), true);

  await harness.tick();
  await harness.settleAll();
  assert.equal(harness.store.hasPendingChanges(), false);
});

test("untrack cancels a pending timer", async () => {
  const harness = createHarness();
  const { draft } = trackTeam(harness.store);
  draft.teamName = "Never saved";
  harness.store.markDirty("team-1");
  harness.store.untrack("team-1");

  await harness.tick();
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.store.size, 0);
});

// ---------------------------------------------------------------------------
// storage wrapper
// ---------------------------------------------------------------------------

test("storage keeps working when the browser refuses to persist", () => {
  const hostile = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("blocked"); },
  };
  const store = createStorage(hostile);
  assert.equal(store.set("theme", "dark-gata"), false, "reports that it could not persist");
  assert.equal(store.get("theme"), "dark-gata", "but the session still remembers");
  store.remove("theme");
  assert.equal(store.get("theme"), null);
});

test("storage round-trips JSON and survives corrupt values", () => {
  const backing = new Map();
  const store = createStorage({
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, value),
    removeItem: (key) => backing.delete(key),
  });

  store.setJson("builder-draft", { players: [1, 2, 3] });
  assert.deepEqual(store.getJson("builder-draft"), { players: [1, 2, 3] });
  assert.ok([...backing.keys()][0].startsWith("gata-league-"), "keys are namespaced");

  backing.set("gata-league-builder-draft", "{not json");
  assert.deepEqual(store.getJson("builder-draft", "fallback"), "fallback");
});

test("a timeout is treated like being offline: keep the edit and retry", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Slow network";
  harness.store.markDirty("team-1");
  await harness.tick();

  harness.inflight.shift().reject(Object.assign(new Error("aborted"), { kind: "timeout" }));
  await flushMicrotasks();

  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.OFFLINE);
  assert.equal(harness.store.hasPendingChanges(), true);
});

test("an unexpected failure is an error, not a silent success", async () => {
  const harness = createHarness({ autoResolve: false });
  const { draft } = trackTeam(harness.store);

  draft.teamName = "Rejected";
  harness.store.markDirty("team-1");
  await harness.tick();

  harness.inflight.shift().reject(Object.assign(new Error("boom"), { kind: "http", status: 500 }));
  await flushMicrotasks();

  assert.equal(harness.store.statusOf("team-1"), SAVE_STATUS.ERROR);
  assert.equal(harness.store.hasPendingChanges(), true, "the edit is still queued");
});

test("a draft that cannot be serialised reports an error instead of hanging", async () => {
  const harness = createHarness();
  const draft = { teamName: "Cyclic", players: [] };
  harness.store.track("team-9", {
    draft,
    meta: { id: "team-9" },
    buildRequest: () => { throw new Error("cannot serialise"); },
  });

  harness.store.markDirty("team-9");
  await harness.tick();

  assert.equal(harness.store.statusOf("team-9"), SAVE_STATUS.ERROR);
  assert.equal(harness.calls.length, 0);
});

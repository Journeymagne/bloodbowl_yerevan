import test from "node:test";
import assert from "node:assert/strict";

import { createBuilderDraftStore, isEmptyBuilderDraft } from "../src/data/builder-draft.mjs";
import { createStorage } from "../src/core/storage.mjs";

function harness() {
  const backing = new Map();
  const storage = createStorage({
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, value),
    removeItem: (key) => backing.delete(key),
  });
  let clock = 0;
  const timers = [];
  const store = createBuilderDraftStore({
    storage,
    now: () => clock,
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, at: clock + delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => { if (timer) timer.cancelled = true; },
  });
  const tick = (ms = 500) => {
    clock += ms;
    for (const timer of timers.filter((item) => !item.cancelled && item.at <= clock)) {
      timer.cancelled = true;
      timer.fn();
    }
  };
  return { store, storage, backing, tick };
}

const draftWithPlayer = () => ({
  teamSlug: "teams/amazon",
  teamName: "Work in progress",
  players: [{ id: "p1", rowIndex: 0, name: "Linewoman 1" }],
});

test("a draft with players survives a reload", () => {
  const { store, tick } = harness();
  const draft = draftWithPlayer();

  store.save(draft);
  assert.equal(store.read(), null, "nothing is written until the debounce fires");

  tick();
  const restored = store.read();
  assert.equal(restored.teamName, "Work in progress");
  assert.equal(restored.players.length, 1);
});

test("an empty draft is not worth restoring", () => {
  const { store, tick } = harness();
  store.save({ teamSlug: "teams/amazon", teamName: "Amazon", players: [] });
  tick();
  assert.equal(store.read(), null);

  assert.equal(isEmptyBuilderDraft({ players: [] }), true);
  assert.equal(isEmptyBuilderDraft({ players: [], teamRerolls: 0 }), true);
  assert.equal(isEmptyBuilderDraft(null), true);
  // Bought staff counts as work in progress even with no players yet.
  assert.equal(isEmptyBuilderDraft({ players: [], teamRerolls: 1 }), false);
  assert.equal(isEmptyBuilderDraft({ players: [], logoData: "data:image/png;base64,x" }), false);
});

test("saving an emptied draft removes what was stored", () => {
  const { store, tick } = harness();
  store.save(draftWithPlayer());
  tick();
  assert.ok(store.read());

  store.save({ teamSlug: "teams/amazon", players: [] });
  tick();
  assert.equal(store.read(), null);
});

test("a draft for a race that no longer exists is discarded", () => {
  const { store, tick } = harness();
  store.save({ ...draftWithPlayer(), teamSlug: "teams/atlantis" });
  tick();

  const known = (slug) => slug === "teams/amazon";
  assert.equal(store.read(known), null);
  assert.equal(store.read(), null, "and it is not offered again");
});

test("clear throws away the draft and any pending write", () => {
  const { store, tick } = harness();
  store.save(draftWithPlayer());
  store.clear();
  tick();
  assert.equal(store.read(), null);
});

test("saveNow skips the debounce", () => {
  const { store } = harness();
  store.saveNow(draftWithPlayer());
  assert.ok(store.read(), "written immediately");
});

test("a corrupt stored value does not break the builder", () => {
  const { store, backing } = harness();
  backing.set("gata-league-builder-draft", "{ not json");
  assert.equal(store.read(), null);
});

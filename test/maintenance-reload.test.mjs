import test from "node:test";
import assert from "node:assert/strict";

import { MIN_RELOAD_GAP_MS, reloadForMaintenance } from "../src/core/maintenance-reload.mjs";

function memorySession() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function countingLocation() {
  return { reloads: 0, reload() { this.reloads += 1; } };
}

test("the first maintenance answer reloads the page", () => {
  const location = countingLocation();
  assert.equal(reloadForMaintenance({ session: memorySession(), location, now: 1_000_000 }), true);
  assert.equal(location.reloads, 1);
});

test("a second one inside the gap does not, so a page cannot loop", () => {
  const session = memorySession();
  const location = countingLocation();
  reloadForMaintenance({ session, location, now: 1_000_000 });
  assert.equal(reloadForMaintenance({ session, location, now: 1_000_000 + MIN_RELOAD_GAP_MS - 1 }), false);
  assert.equal(reloadForMaintenance({ session, location, now: 1_000_000 + MIN_RELOAD_GAP_MS }), true);
  assert.equal(location.reloads, 2);
});

test("blocked session storage still reloads, once per page", () => {
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const location = countingLocation();
  assert.equal(reloadForMaintenance({ session: blocked, location, now: 5 }), true);
  assert.equal(location.reloads, 1);
});

test("a refused sessionStorage property still reloads, once", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  try {
    const location = countingLocation();
    assert.equal(reloadForMaintenance({ location, now: 5 }), true);
    assert.equal(location.reloads, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete globalThis.sessionStorage;
  }
});

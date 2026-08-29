import assert from "node:assert/strict";
import test from "node:test";

import { createDocument, el } from "./helpers/fake-dom.mjs";
import { wireConflictBanner } from "../src/components/roster-notices.mjs";

const CONFLICT = "conflict";

/** A store that replays its current status to each new subscriber, as the real one does. */
function fakeStore(initial = "idle") {
  let status = initial;
  const listeners = new Set();
  return {
    subscribe(_teamId, fn) {
      listeners.add(fn);
      fn({ status });
      return () => listeners.delete(fn);
    },
    emit(next) {
      status = next;
      for (const fn of [...listeners]) fn({ status });
    },
  };
}

function screen(document, { withBanner = false } = {}) {
  const children = withBanner ? [el(document, "div", { "data-roster-conflict": "" })] : [];
  const root = el(document, "section", {}, ...children);
  document.body.appendChild(root);
  return root;
}

test("a conflict arriving between renders asks for one", () => {
  const document = createDocument();
  const root = screen(document);
  const store = fakeStore();
  let renders = 0;

  wireConflictBanner(root, store, "team-1", CONFLICT, () => { renders += 1; });
  assert.equal(renders, 0, "an idle team needs no render");

  store.emit(CONFLICT);
  assert.equal(renders, 1);
});

test("a conflict already on screen does not render again", () => {
  const document = createDocument();
  const root = screen(document, { withBanner: true });
  const store = fakeStore(CONFLICT);
  let renders = 0;

  // This is the loop the guard exists for: subscribe() replays the conflict,
  // and the render that would follow subscribes again.
  wireConflictBanner(root, store, "team-1", CONFLICT, () => { renders += 1; });
  store.emit(CONFLICT);
  assert.equal(renders, 0, "the banner is already there; rendering again would never stop");
});

test("other statuses are left alone", () => {
  const document = createDocument();
  const root = screen(document);
  const store = fakeStore();
  let renders = 0;

  wireConflictBanner(root, store, "team-1", CONFLICT, () => { renders += 1; });
  for (const status of ["dirty", "saving", "saved", "offline", "error"]) store.emit(status);
  assert.equal(renders, 0);
});

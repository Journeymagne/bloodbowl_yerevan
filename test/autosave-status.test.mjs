import assert from "node:assert/strict";
import test from "node:test";

import { createDocument, el } from "./helpers/fake-dom.mjs";
import { wireAutosaveStatus } from "../src/components/roster-editor/autosave-status.mjs";
import { setDictionaries } from "../src/core/i18n.mjs";
import { SAVE_STATUS } from "../src/data/roster-store.mjs";

const messages = {
  "roster.autosaveDefaultMessage": "Changes save on their own.",
  "roster.unsavedStatus": "Unsaved changes.",
  "roster.savingStatus": "Saving...",
  "roster.autosavedStatus": "Saved.",
  "roster.offlineStatus": "No connection; the changes are kept.",
  "roster.conflictStatus": "Saved somewhere else.",
  "roster.autosaveFailedStatus": "Could not save.",
};

// One document for the file: components/live-region.mjs keeps its region in
// module state, the way it does in a browser, so a second document would be
// talking to a region the module no longer holds.
const document = createDocument();
globalThis.document = document;
setDictionaries({ en: messages, ru: messages });

/** A store that only does what wireAutosaveStatus asks of it. */
function fakeStore() {
  let listener = null;
  return {
    subscribe(_teamId, fn) { listener = fn; return () => { listener = null; }; },
    emit(status) { listener?.({ status }); },
    get listening() { return Boolean(listener); },
  };
}

/** A screen with a status line in it, and a way to read what was announced. */
function screen() {
  const line = el(document, "p", { "data-autosave-status": "" });
  const root = el(document, "section", {}, line);
  document.body.appendChild(root);
  const region = () => document.body.querySelector("[role]");
  if (region()) region().textContent = "";
  return {
    root,
    line,
    // announce() writes on a timeout, so a caller has to let one pass.
    settle: () => new Promise((resolve) => { setTimeout(resolve, 0); }),
    spoken: () => region()?.textContent ?? null,
  };
}

test("the status line follows the store", async () => {
  const { root, line, settle } = screen();
  const store = fakeStore();
  const unsubscribe = wireAutosaveStatus(root, store, "team-1");

  store.emit(SAVE_STATUS.SAVING);
  assert.equal(line.textContent, "Saving...");
  assert.equal(line.getAttribute("data-status"), "saving");

  store.emit(SAVE_STATUS.SAVED);
  assert.equal(line.textContent, "Saved.");

  unsubscribe();
  assert.equal(store.listening, false, "the caller must be able to unsubscribe");
  // Let this test's announcement land before the next one reads the region.
  await settle();
});

test("only outcomes are announced, and each one once", async () => {
  const { root, settle, spoken } = screen();
  const store = fakeStore();
  wireAutosaveStatus(root, store, "team-1");

  // Typing: the line changes, nothing is said.
  store.emit(SAVE_STATUS.DIRTY);
  store.emit(SAVE_STATUS.SAVING);
  await settle();
  assert.equal(spoken(), "", "a keystroke must not interrupt a screen reader");

  store.emit(SAVE_STATUS.SAVED);
  await settle();
  assert.equal(spoken(), "Saved.");

  // The store replays its status on every render; that is not a new event.
  store.emit(SAVE_STATUS.SAVED);
  assert.equal(spoken(), "Saved.", "a replayed status is not announced again");

  store.emit(SAVE_STATUS.CONFLICT);
  await settle();
  assert.equal(spoken(), "Saved somewhere else.");

  // Saving again after that is heard, because the status did change.
  store.emit(SAVE_STATUS.SAVED);
  await settle();
  assert.equal(spoken(), "Saved.");
});

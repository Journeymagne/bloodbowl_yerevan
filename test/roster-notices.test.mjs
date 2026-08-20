import test from "node:test";
import assert from "node:assert/strict";

import { isPendingNewer, renderRosterNotices } from "../src/components/roster-notices.mjs";

const t = (key) => key;

test("mirrored edits are offered only when they are newer than the server's copy", () => {
  const server = "2026-08-19T12:00:00.000Z";
  const serverStamp = Date.parse(server);

  assert.equal(isPendingNewer({ savedAt: serverStamp + 1000 }, server), true);
  assert.equal(isPendingNewer({ savedAt: serverStamp - 1000 }, server), false,
    "a leftover mirror from a save that did land must not nag");
  assert.equal(isPendingNewer({ savedAt: serverStamp }, server), false);
});

test("a team the server has never saved still gets the offer", () => {
  assert.equal(isPendingNewer({ savedAt: 1 }, null), true);
  assert.equal(isPendingNewer({ savedAt: 1 }, "not a date"), true);
});

test("nothing mirrored, nothing offered", () => {
  assert.equal(isPendingNewer(null, "2026-08-19T12:00:00.000Z"), false);
  assert.equal(isPendingNewer({}, "2026-08-19T12:00:00.000Z"), false);
  assert.equal(isPendingNewer({ savedAt: "nonsense" }, null), false);
  assert.equal(isPendingNewer({ savedAt: 0 }, null), false);
});

test("the restore banner appears with both actions", () => {
  const html = renderRosterNotices({
    pending: { savedAt: Date.now() },
    serverUpdatedAt: "2026-08-19T12:00:00.000Z",
    conflict: false,
    t,
  });
  assert.match(html, /data-roster-pending/);
  assert.match(html, /data-roster-restore-pending/);
  assert.match(html, /data-roster-discard-pending/);
  assert.doesNotMatch(html, /data-roster-conflict/);
});

test("the conflict banner appears on its own", () => {
  const html = renderRosterNotices({ pending: null, serverUpdatedAt: null, conflict: true, t });
  assert.match(html, /data-roster-conflict/);
  assert.match(html, /data-roster-reload-server/);
  assert.doesNotMatch(html, /data-roster-pending/);
});

test("both can show at once, and neither shows when there is nothing to say", () => {
  const both = renderRosterNotices({ pending: { savedAt: Date.now() }, serverUpdatedAt: 0, conflict: true, t });
  assert.match(both, /data-roster-pending/);
  assert.match(both, /data-roster-conflict/);

  assert.equal(renderRosterNotices({ pending: null, serverUpdatedAt: null, conflict: false, t }), "");
});

test("every string the banners use goes through the translator", () => {
  const asked = [];
  const spy = (key) => { asked.push(key); return key; };
  renderRosterNotices({ pending: { savedAt: Date.now() }, serverUpdatedAt: 0, conflict: true, t: spy });
  assert.deepEqual(asked.sort(), [
    "roster.conflictBody",
    "roster.conflictReloadAction",
    "roster.conflictStatus",
    "roster.pendingDiscardAction",
    "roster.pendingRestoreAction",
    "roster.pendingRestoreBody",
    "roster.pendingRestoreHeading",
  ]);
});

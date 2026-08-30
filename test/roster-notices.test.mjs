import test from "node:test";
import assert from "node:assert/strict";

import { renderRosterNotices } from "../src/components/roster-notices.mjs";

const t = (key) => key;

test("the conflict banner offers to reload the server version", () => {
  const html = renderRosterNotices({ conflict: true, t });
  assert.match(html, /data-roster-conflict/);
  assert.match(html, /data-roster-reload-server/);
});

test("nothing is rendered when there is no conflict", () => {
  assert.equal(renderRosterNotices({ conflict: false, t }), "");
});

test("every string the conflict banner uses goes through the translator", () => {
  const asked = [];
  const spy = (key) => { asked.push(key); return key; };
  renderRosterNotices({ conflict: true, t: spy });
  assert.deepEqual(asked.sort(), [
    "roster.conflictBody",
    "roster.conflictReloadAction",
    "roster.conflictStatus",
  ]);
});

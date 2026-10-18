import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { bootPage } from "./helpers/boot-page.mjs";

// R13-M7: the frame is mounted before the session is read, so the first change of session draws it with the
// first screen. A guest opens `#/`, which is drawn where it is (no redirect).
const api = installFakeApi();
const { document } = bootPage(api, { hash: "#/" });
api.reply("GET /api/season", 200, {});

const session = await import("../src/data/session.mjs");
await import("../src/app.js");
const atFirstChange = [];
session.onSessionChange(() => {
  atFirstChange.push({
    shell: document.querySelector("#app-frame").getAttribute("data-shell"),
    header: document.querySelector("#app-header").textContent.trim() !== "",
    screen: Boolean(document.querySelector("#app-view .g-guest h1")),
  });
});
const turns = async (count = 20) => { for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

test("a guest's first screen is drawn with its frame, by the first change of session", async () => {
  await turns();
  assert.deepEqual(atFirstChange, [{ shell: "guest", header: true, screen: true }]);
  assert.equal(api.calls.some((call) => call.key.startsWith("GET /api/auth/")), false, "no token, no session asked for");
  api.assertAnswered();
});

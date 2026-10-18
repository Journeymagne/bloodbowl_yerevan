import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = { hash: "#/t/t1/roster", replace() {} };
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { renderSavedRoster } = await import("../src/screens/saved-roster.mjs");
const { renderStaffControl } = await import("../src/components/roster-editor/staff-control.mjs");
const { LEAGUE_MODE } = await import("../src/components/roster-editor/modes.mjs");

state.data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const settle = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const plus = (key) => view.querySelector(`[data-roster-staff="${key}"][data-roster-staff-step="1"]`);
const patches = () => api.calls.filter((call) => call.key.startsWith("PATCH"));
const toasts = () => document.querySelectorAll("output");
function teamIn(stage) {
  return { id: "t1", name: "Wardens", baseTeamSlug: "teams/human", stage, revision: 1, logoData: null,
    roster: { treasury: 500, startingRerolls: 1, teamRerolls: 1, players: [] } };
}
function coachWith(stage, user = { id: "u1", login: "coach" }) {
  api.reset();
  for (const node of toasts()) node.parentNode.removeChild(node);
  state.auth.currentUser = user;
  state.myTeams = { items: [teamIn(stage)], loaded: true, loading: false, error: "" };
}

test("an active team's Starting rerolls refuse «+» with the stage's reason and send nothing; its Team Rerolls still save (08, urgent)", async () => {
  coachWith("active");
  await renderSavedRoster("t1", false);
  assert.equal(plus("startingRerolls").getAttribute("aria-disabled"), "true");
  assert.equal(plus("startingRerolls").getAttribute("title"), "Starting rerolls are bought only while the team is being built");
  await withoutTimers(async () => { fireEvent(plus("startingRerolls"), "click"); });
  await settle();
  assert.deepEqual(patches(), [], "a refused step is no save");
  const refusal = toasts().map((node) => ({ tone: node.className, text: node.textContent }));
  assert.equal(refusal.length, 1);
  assert.match(refusal[0].tone, /toast-error/);
  assert.match(refusal[0].text, /only while the team is being built/);
  api.reply("PATCH /api/teams/t1", 200, { team: { ...teamIn("active"), revision: 2 } });
  fireEvent(plus("teamRerolls"), "click");
  await settle();
  const [save] = patches();
  assert.deepEqual([save.body.roster.startingRerolls, save.body.roster.teamRerolls], [1, 2], "the next edit is saved, not stuck behind a refused one");
});

test("a team in the build: Team Rerolls refuse «+», Starting rerolls are bought", async () => {
  coachWith("draft");
  await renderSavedRoster("t1", false);
  assert.equal(plus("teamRerolls").getAttribute("title"), "Team Rerolls open once the team leaves the build");
  assert.equal(plus("startingRerolls").hasAttribute("aria-disabled"), false);
});

test("an administrator editing a coach's team is held to no stage, as the admin route is not", async () => {
  coachWith("active", { id: "a1", login: "admin", isAdmin: true });
  api.reply("GET /api/admin/teams/t1", 200, { team: teamIn("active"), owner: { id: "u2", login: "coach" } });
  await renderSavedRoster("t1", true, { adminOwnerId: "u2" });
  assert.equal(plus("startingRerolls").hasAttribute("aria-disabled"), false);
});

test("only growth is refused: «−» on a locked re-roll still steps (stage.mjs)", () => {
  const html = renderStaffControl({ key: "startingRerolls", title: "Starting rerolls", value: 2, mode: LEAGUE_MODE, stage: "active" });
  assert.match(html, /data-roster-staff-step="-1"(?![^>]*disabled)/);
  assert.match(html, /data-roster-staff-step="1"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(renderStaffControl({ key: "cheerleaders", title: "Cheerleaders", value: 1, mode: LEAGUE_MODE, stage: "active" }), /aria-disabled/);
});

test("both stage locks are in both dictionaries", () => {
  for (const key of ["startingRerolls", "teamRerolls"]) {
    for (const locale of ["en", "ru"]) assert.ok(dictionary(locale)[`treasury.lock.${key}`], `${locale} ${key}`);
  }
});

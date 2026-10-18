import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

// R14 (N1): the frame follows the coach's list of teams as it follows the games: a list that comes in late
// (read again on a team's page after it failed at sign-in) redraws the header and the SideNav itself.
const api = installFakeApi();
document.body.appendChild(el(document, "div", { id: "app-frame" },
  el(document, "aside", { id: "side-nav" }), el(document, "header", { id: "app-header" }),
  el(document, "div", { id: "ref-search", hidden: "" }), el(document, "section", { id: "app-view" }), el(document, "footer", { id: "site-footer" })));
const { mountShell, refreshShell } = await import("../src/shell/shell.mjs");
const { loadMyTeams, onMyTeamsChange } = await import("../src/data/teams.mjs");
const { syncActiveTeam } = await import("../src/data/active-team.mjs");
const session = await import("../src/data/session.mjs");
const { state } = await import("../src/core/state.mjs");

mountShell({ document, scroller: { addEventListener() {}, document } });
// As app.js wires it: every change of session settles the active team.
session.onSessionChange(() => syncActiveTeam());

const ME = { user: { id: "u1", login: "felstell", isAdmin: false, preferences: { activeTeamId: "t2" } } };
const TEAMS = { teams: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "human" }, { id: "t2", name: "Grimtusk Raiders", baseTeamSlug: "orc" }] };
const header = () => document.querySelector("#app-header .g-appbar__label")?.textContent ?? null;
const sideName = () => document.querySelector("#side-nav .g-sidenav__name")?.textContent ?? null;
const tabs = () => document.querySelectorAll("#app-header .g-tab").map((tab) => tab.getAttribute("href"));

async function signedInWithAnUnreadList() {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.data = { teams: [{ slug: "human", title: "Human" }, { slug: "orc", title: "Orc" }], generatedAt: "2026-10-07T10:00:00Z" };
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
  assert.equal(await session.loadSession(), "signed-in");
  // The router draws the frame for #/t/t2 before the team's screen reads the list again (router.mjs).
  refreshShell({ name: "team", params: { teamId: "t2" } });
}

test("while the list is unread the frame names the league, not 'no team yet · create a team'", async () => {
  await signedInWithAnUnreadList();
  assert.equal(state.activeTeamId, "t2");
  assert.equal(header(), "Gata League");
  assert.equal(sideName(), "Gata League");
  assert.equal(document.querySelector("#app-header").textContent.includes("Create a team"), false);
  api.assertAnswered();
});

test("the list read again redraws the header and the SideNav with the team, with no navigation and no refreshShell from outside", async () => {
  await signedInWithAnUnreadList();
  api.reply("GET /api/teams", 200, TEAMS);
  await loadMyTeams(true);
  assert.equal(header(), "Grimtusk Raiders");
  assert.equal(sideName(), "Grimtusk Raiders");
  assert.ok(tabs().includes("#/t/t2/roster"), "the team's own tabs");
  api.assertAnswered();
});

test("every write of the list is heard, a failure too, each listener on its own", async () => {
  await signedInWithAnUnreadList();
  const heard = [];
  const errors = [];
  const logged = console.error;
  console.error = (error) => errors.push(error.message);
  const stops = [onMyTeamsChange(() => { throw new Error("a listener broke"); }), onMyTeamsChange(() => heard.push(state.myTeams.loaded))];
  try {
    api.reply("GET /api/teams", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
    await loadMyTeams(true);
    api.reply("GET /api/teams", 200, TEAMS);
    await loadMyTeams(true);
  } finally {
    console.error = logged;
    stops.forEach((stop) => stop());
  }
  assert.deepEqual(heard, [false, true]);
  assert.deepEqual(errors, ["a listener broke", "a listener broke"]);
  api.assertAnswered();
});

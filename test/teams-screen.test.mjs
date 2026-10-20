import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = { hash: "#/teams", replace() {} };
const { renderTeams, teamsMarkup } = await import("../src/screens/teams/index.mjs");
const { deleteSavedTeam, wireTeamDeleteButtons } = await import("../src/components/team-delete.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { setMyTeams } = await import("../src/data/teams.mjs");
const { syncActiveTeam } = await import("../src/data/active-team.mjs");

const SEASON = { season: { id: "s1" }, standings: [{ team: { id: "t1" }, rank: 2, points: 13 }] };
const TEAMS = [
  { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true },
  { id: "t2", name: "Anji Magritta", baseTeamSlug: "teams/orc", stage: "active", inActiveSeason: false },
  { id: "t3", name: "Fresh Meat", baseTeamSlug: "teams/orc", stage: "draft", inActiveSeason: false },
];
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const refusal = (code) => ({ error: { code, params: {}, message: "x" } });
const hrefs = () => view.querySelectorAll("a.g-teams__open").map((link) => link.getAttribute("href"));

/** toast() keeps a timer that a fake page cannot end. */
async function withoutTimers(run) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    return await run();
  } finally {
    globalThis.setTimeout = real;
  }
}
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);

/** A coach signed in on a page that has read the list, the table and the games; the screen before is left. */
function coach({ active = "t1", items = TEAMS, loaded = true, error = "" } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: active } };
  state.myTeams = { items, loaded, loading: false, error };
  state.activeTeamId = active;
  state.data = { teams: [{ slug: "teams/human", title: "Human" }, { slug: "teams/orc", title: "Orc" }] };
  state.season = { data: SEASON, loaded: true, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  state.admin = { users: [], loaded: true, loading: false, error: "", editingTeams: new Map() };
  // The screen reads the list again on entry (a list that loaded); unless a test says otherwise, it gets the list it has.
  api.reply("GET /api/teams", 200, { teams: items });
}

/** What is still on its way when a test ends (the list read on entry) is let finish before the next test starts over. */
afterEach(async () => {
  await settle();
  await settle();
});

test("the coach's teams, the active one marked, each opening its overview", () => {
  coach();
  renderTeams();
  assert.equal(view.querySelector("h1").textContent, "My teams");
  assert.deepEqual(view.querySelectorAll("a.g-teams__open").map((link) => link.getAttribute("href")), ["#/t/t1", "#/t/t2", "#/t/t3"]);
  assert.ok(view.querySelector('a[href="#/t/t1"]').closest(".g-teams__item").querySelector(".g-sr-only"), "the current one says so");
  const add = view.querySelector("button.g-btn--primary[data-new-team]");
  assert.deepEqual([add.textContent.trim(), add.getAttribute("aria-haspopup")], ["New team", "dialog"], "a button that opens the sheet, not a link to a page");
  assert.equal(view.querySelector('a[href="#/teams/new"]'), null);
  assertCspSafe(view);
  assertStyled(view, "src/screens/teams/teams.css", "src/shell/team-switcher.css", "page-head.css", "button.css", "status-chip.css");
  assertDictionaryCovers("src/screens/teams/index.mjs");
});

test("«New team» opens the sheet over «My teams», with no change of address", () => {
  coach();
  renderTeams();
  const sheet = () => document.querySelector("dialog#new-team-sheet");
  const add = view.querySelector("[data-new-team]");
  add.focus();
  fireEvent(add, "click");
  assert.ok(sheet().matches(":modal"));
  assert.ok(sheet().closest('[data-sheet-host="new-team"]'), "in its own host on the body, out of the list's redraws");
  assert.equal(location.hash, "#/teams");
  assert.equal(view.querySelector("h1").textContent, "My teams", "the list stays under it");
  assert.equal(sheet().querySelectorAll("[data-race]").length, 2, "the races from the data");
  setMyTeams(TEAMS.slice(0, 2));
  assert.ok(sheet()?.matches(":modal"), "the list drawn again leaves it open");
  fireEvent(sheet(), "keydown", { key: "Escape" });
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, view.querySelector("[data-new-team]"), "the focus is back on the button");
  // A coach with no team: «Create a team» of the empty overview opens it too.
  coach({ items: [] });
  renderTeams();
  fireEvent(view.querySelector("[data-new-team]"), "click");
  assert.ok(sheet().matches(":modal"));
  fireEvent(sheet(), "keydown", { key: "Escape" });
  releaseCurrentScreen();
  fireEvent(view.querySelector("[data-new-team]"), "click");
  assert.equal(sheet(), null, "a screen left hears no button");
});

test("each team is drawn as the switcher draws it: its tile, its name, where it stands, and a draft says so", () => {
  coach();
  renderTeams();
  assert.deepEqual(view.querySelectorAll(".g-teamface__tile").map((tile) => tile.textContent), ["AW", "AM", "FM"]);
  assert.deepEqual(view.querySelectorAll(".g-teamface__line").map((line) => line.textContent), ["Human · #2 · 0-0-0", "Orc", "Orc"]);
  assert.equal(view.querySelector('a[href="#/t/t3"] .g-status').textContent, "Draft");
  assert.equal(view.querySelectorAll(".g-teams__item .g-sr-only").length, 1, "only the active team says it is current");
});

test("a team in the season cannot be deleted and says why; the others have a delete button named for the team", () => {
  coach();
  renderTeams();
  assert.equal(view.querySelector('[data-delete-team="t1"]'), null);
  assert.equal(view.querySelector('a[href="#/t/t1"]').closest(".g-teams__item").querySelector(".g-status").textContent, "In the season");
  assert.equal(view.querySelector('[data-delete-team="t2"]').getAttribute("aria-label"), "Delete Anji Magritta");
  assert.match(view.querySelector(".g-teams__note").textContent, /cannot be deleted/);
});

test("deleting asks first, in a sheet with one red button naming the team; closing it changes nothing and gives the focus back", () => {
  coach();
  renderTeams();
  const trash = view.querySelector('[data-delete-team="t2"]');
  fireEvent(trash, "click");
  const sheet = view.querySelector("dialog#team-delete");
  assert.ok(sheet.matches(":modal"));
  assert.equal(sheet.querySelectorAll(".g-btn--danger").length, 1);
  assert.equal(sheet.querySelector(".g-btn--danger").textContent.trim(), "Delete Anji Magritta");
  // The owner's answer after 07c: button.css's bright fill (--danger-fill, #C4352A) with white words; no sheet here recolours it.
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn--danger", "background"), ["var(--danger-fill)"]);
  assertReadable("src/ui/button.css", ".g-btn--danger", "color", ["--danger-fill"], 4.5);
  for (const file of ["src/screens/teams/teams.css", "src/shell/team-switcher.css", "src/ui/sheet.css"]) assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /btn--danger\b/, file);
  assert.equal(sheet.querySelector(".g-sheet__title").textContent, "Delete the team?");
  assert.equal(sheet.querySelector(".g-sheet__body").textContent.trim(), "Anji Magritta and its roster are deleted for good.");
  assertCspSafe(view);
  assertStyled(view, "src/screens/teams/teams.css", "src/shell/team-switcher.css", "page-head.css", "button.css", "status-chip.css", "sheet.css", "callout.css");
  fireEvent(sheet.querySelector("[data-sheet-close]"), "click");
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.equal(document.activeElement?.getAttribute("data-delete-team"), "t2");
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams"], "the list is read again on entry, and nothing is deleted");
});

test("Escape and the backdrop close the sheet the same way, and the focus is back on that team's bin", () => {
  coach();
  renderTeams();
  fireEvent(view.querySelector('[data-delete-team="t3"]'), "click");
  fireEvent(view.querySelector("dialog#team-delete"), "keydown", { key: "Escape" });
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.equal(document.activeElement?.getAttribute("data-delete-team"), "t3");
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("dialog#team-delete"), "click");
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.equal(document.activeElement?.getAttribute("data-delete-team"), "t2");
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams"]);
});

test("a refusal is said in the sheet and the list stays", async () => {
  coach();
  api.reply("DELETE /api/teams/t2", 409, { error: { code: "TEAM_IN_FRIENDLY_GAMES", params: {}, message: "x" } });
  renderTeams();
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  await settle();
  assert.equal(api.calls.filter((call) => call.key === "DELETE /api/teams/t2").length, 1, "a second press while it is on its way sends nothing");
  assert.match(view.querySelector('#team-delete [role="alert"] .g-callout__title').textContent, /friendly/);
  assert.equal(view.querySelectorAll("a.g-teams__open").length, 3);
});

test("while it is on its way the button says so; a refusal gives the button back, and a second try is sent", async () => {
  coach();
  api.reply("DELETE /api/teams/t2", 409, refusal("TEAM_IN_FRIENDLY_GAMES"));
  const gate = api.hold("DELETE /api/teams/t2");
  renderTeams();
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  assert.equal(view.querySelector("[data-delete-confirm]").textContent.trim(), "Deleting…");
  assert.equal(view.querySelector("#team-delete [role=\"alert\"]"), null);
  gate.release();
  await settle();
  assert.equal(view.querySelector("[data-delete-confirm]").textContent.trim(), "Delete Anji Magritta");
  assert.ok(view.querySelector("#team-delete [role=\"alert\"]"));
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  assert.equal(api.calls.filter((call) => call.key === "DELETE /api/teams/t2").length, 2);
  await settle();
});

test("a deleted team leaves the list, and the header moves to another one", async () => {
  coach({ active: "t2" });
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/games", 200, { games: [] });
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t1" } });
  renderTeams();
  await settle(); // the list read on entry comes first, with the three teams
  api.reply("GET /api/teams", 200, { teams: [TEAMS[0], TEAMS[2]] });
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  await withoutTimers(async () => {
    await settle();
    await settle();
  });
  assert.deepEqual(view.querySelectorAll("a.g-teams__open").map((link) => link.getAttribute("href")), ["#/t/t1", "#/t/t3"]);
  assert.equal(state.activeTeamId, "t1");
  assert.ok(api.calls.every((call) => call.body?.activeTeamId !== "t2"), "no dead id written to the account");
  assert.equal(api.calls.filter((call) => call.key === "PATCH /api/auth/preferences" && call.body?.activeTeamId === "t1").length, 1, "the account is told the team that is left, once");
  api.assertAnswered();
});

test("a deleted team: the sheet closes, the coach is told, and the focus goes to the page's title", async () => {
  coach();
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/games", 200, { games: [] });
  renderTeams();
  await settle();
  api.reply("GET /api/teams", 200, { teams: [TEAMS[0], TEAMS[2]] });
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  await withoutTimers(async () => {
    await settle();
    await settle();
  });
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.deepEqual(toasts(), ["Anji Magritta is deleted"]);
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(view.querySelector("h1").getAttribute("tabindex"), "-1");
  assert.equal(state.season.loaded, false, "the table is read again: the team may have been in it");
});

test("the last team deleted leaves the way to a first one, with the focus on its title", async () => {
  coach({ items: [TEAMS[1]], active: "t2" });
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/games", 200, { games: [] });
  renderTeams();
  await settle();
  api.reply("GET /api/teams", 200, { teams: [] });
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  await withoutTimers(async () => {
    await settle();
    await settle();
  });
  assert.equal(view.querySelector("h1").textContent, "Create your first team");
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.equal(document.activeElement, view.querySelector("h1"));
});

test("a sheet closed while the delete is on its way: the answer is said as a message, and the list is the screen's", async () => {
  coach();
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/games", 200, { games: [] });
  const gate = api.hold("DELETE /api/teams/t2");
  renderTeams();
  await settle();
  api.reply("GET /api/teams", 200, { teams: [TEAMS[0], TEAMS[2]] });
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  fireEvent(view.querySelector("[data-sheet-close]"), "click");
  assert.equal(view.querySelector("dialog#team-delete"), null);
  await withoutTimers(async () => {
    gate.release();
    await settle();
    await settle();
  });
  assert.deepEqual(toasts(), ["Anji Magritta is deleted"]);
  assert.deepEqual(hrefs(), ["#/t/t1", "#/t/t3"]);
});

test("a refusal that comes after the sheet was closed is a message, not a sheet that opens again", async () => {
  coach();
  api.reply("DELETE /api/teams/t2", 409, refusal("TEAM_IN_FRIENDLY_GAMES"));
  const gate = api.hold("DELETE /api/teams/t2");
  renderTeams();
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  fireEvent(view.querySelector("[data-sheet-close]"), "click");
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.equal(toasts().length, 1);
  assert.match(toasts()[0], /friendly/);
});

test("a delete answered after the coach left says so in a message and touches nothing of the screen that is there now", async () => {
  coach();
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/games", 200, { games: [] });
  const gate = api.hold("DELETE /api/teams/t2");
  renderTeams();
  await settle();
  api.reply("GET /api/teams", 200, { teams: [TEAMS[0], TEAMS[2]] });
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  releaseCurrentScreen();
  view.innerHTML = '<h1 tabindex="-1">The next screen</h1>';
  await withoutTimers(async () => {
    gate.release();
    await settle();
    await settle();
  });
  assert.deepEqual(view.querySelectorAll("h1").map((title) => title.textContent), ["The next screen"], "nothing was drawn over it");
  assert.notEqual(document.activeElement, view.querySelector("h1"), "the focus is the next screen's to place");
  assert.deepEqual(toasts(), ["Anji Magritta is deleted"]);
});

test("another tab's token: nothing is sent, and the sheet says so", async () => {
  coach();
  api.items.set("gata-league-auth-token", "someone else");
  renderTeams();
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  await settle();
  assert.equal(api.calls.some((call) => call.key.startsWith("DELETE")), false);
  assert.equal(view.querySelector('#team-delete [role="alert"] .g-callout__title').textContent, "Someone signed in or out in another tab, so nothing was saved here.");
});

test("no team: the empty overview's way forward; a list that did not load: the reason and a retry", () => {
  coach({ items: [] });
  renderTeams();
  assert.equal(view.querySelector("h1").textContent, "Create your first team");
  coach({ items: [], loaded: false, error: "The server did not answer." });
  renderTeams();
  assert.ok(view.querySelector("button[data-teams-retry]"));
});

test("a list that did not load is read again here, and the screen is the list once it comes", async () => {
  coach({ items: [], loaded: false, error: "The server did not answer." });
  api.reply("GET /api/teams", 500, refusal("SERVER_ERROR"));
  renderTeams();
  assert.equal(api.calls.length, 0, "a list that never loaded has its retry; a read begun behind it would clear its reason");
  assert.equal(view.querySelector(".g-team-empty__text").textContent, "The server did not answer.");
  fireEvent(view.querySelector("button[data-teams-retry]"), "click");
  assert.equal(view.querySelector(".loading").textContent, "Loading teams...");
  await settle();
  assert.ok(view.querySelector("button[data-teams-retry]"), "it failed again, and says so again");
  api.reply("GET /api/teams", 200, { teams: TEAMS });
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t1" } });
  fireEvent(view.querySelector("button[data-teams-retry]"), "click");
  await settle();
  await settle();
  assert.deepEqual(hrefs(), ["#/t/t1", "#/t/t2", "#/t/t3"]);
  assert.equal(view.querySelector("h1").textContent, "My teams");
});

test("an answer that comes after the coach left draws nothing over the next screen", async () => {
  coach({ items: [], loaded: false, error: "The server did not answer." });
  api.reply("GET /api/teams", 200, { teams: TEAMS });
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t1" } });
  const gate = api.hold("GET /api/teams");
  renderTeams();
  fireEvent(view.querySelector("button[data-teams-retry]"), "click");
  releaseCurrentScreen();
  view.innerHTML = "<p>the next screen</p>";
  gate.release();
  await settle();
  await settle();
  assert.equal(view.querySelector("p").textContent, "the next screen");
  assert.equal(view.querySelector("h1"), null);
});

test("the list follows the coach's teams and the active team, and stops when the screen is left", () => {
  coach();
  renderTeams();
  assert.equal(view.querySelector(".g-teams__item .g-sr-only").closest(".g-teams__item").querySelector("a").getAttribute("href"), "#/t/t1");
  state.myTeams.items = TEAMS;
  syncActiveTeam({ routeTeamId: "t3" });
  assert.equal(view.querySelector(".g-teams__item .g-sr-only").closest(".g-teams__item").querySelector("a").getAttribute("href"), "#/t/t3", "the tick moved with the active team");
  setMyTeams([TEAMS[0], TEAMS[2]]);
  assert.deepEqual(hrefs(), ["#/t/t1", "#/t/t3"]);
  releaseCurrentScreen();
  view.innerHTML = "<p>the next screen</p>";
  setMyTeams(TEAMS);
  syncActiveTeam({ routeTeamId: "t1" });
  assert.equal(view.querySelector("p").textContent, "the next screen", "a screen left listens to nothing");
});

test("a page that has not read the games and the table yet reads them, and draws the places once they are in", async () => {
  coach();
  state.season = { data: null, loaded: false, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  api.reply("GET /api/season", 200, SEASON);
  api.reply("GET /api/games", 200, { games: [] });
  renderTeams();
  assert.equal(view.querySelector("a[href=\"#/t/t1\"] .g-teamface__line").textContent, "Human");
  await settle();
  await settle();
  assert.equal(view.querySelector("a[href=\"#/t/t1\"] .g-teamface__line").textContent, "Human · #2 · 0-0-0");
  api.assertAnswered();
});

test("the list is read again on every visit, after the first draw; a team registered since shows its chip where the bin was", async () => {
  coach();
  api.reply("GET /api/teams", 200, { teams: TEAMS.map((team) => (team.id === "t2" ? { ...team, inActiveSeason: true } : team)) });
  renderTeams();
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams"], "sent on entry");
  assert.ok(view.querySelector('[data-delete-team="t2"]'), "the first draw is the list as it stood: nothing waits for the read");
  await settle();
  await settle();
  assert.equal(view.querySelector('[data-delete-team="t2"]'), null);
  assert.equal(view.querySelector('a[href="#/t/t2"]').closest(".g-teams__item").querySelector(".g-status").textContent, "In the season");
  assert.equal(api.calls.length, 1);
});

test("a list that cannot be read again on entry stays as it was, with no screen of its own for the failure", async () => {
  coach();
  api.reply("GET /api/teams", 500, refusal("SERVER_ERROR"));
  renderTeams();
  await settle();
  await settle();
  assert.deepEqual(hrefs(), ["#/t/t1", "#/t/t2", "#/t/t3"]);
  assert.equal(view.querySelector("button[data-teams-retry]"), null);
});

test("a delete that went through is gone from the list even when the list cannot be read again", async () => {
  coach({ active: "t2" });
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/games", 200, { games: [] });
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t1" } });
  renderTeams();
  await settle();
  api.reply("GET /api/teams", 500, refusal("SERVER_ERROR"));
  fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
  fireEvent(view.querySelector("[data-delete-confirm]"), "click");
  await withoutTimers(async () => {
    await settle();
    await settle();
  });
  assert.deepEqual(hrefs(), ["#/t/t1", "#/t/t3"]);
  assert.equal(view.querySelector("dialog#team-delete"), null);
  assert.equal(state.activeTeamId, "t1", "the header names a team that is there");
  assert.deepEqual(toasts(), ["Anji Magritta is deleted"]);
});

test("a team named with markup is a name, in the list, the bin's label and the sheet", () => {
  coach({ items: [{ ...TEAMS[1], name: HOSTILE }] });
  renderTeams();
  assert.equal(view.querySelector("img"), null);
  assert.equal(view.querySelector(".g-teamface__name").textContent, HOSTILE);
  assert.equal(view.querySelector("[data-delete-team]").getAttribute("aria-label"), `Delete ${HOSTILE}`);
  fireEvent(view.querySelector("[data-delete-team]"), "click");
  assert.equal(view.querySelector("img"), null);
  assert.equal(view.querySelector(".g-btn--danger").textContent.trim(), `Delete ${HOSTILE}`);
  assertCspSafe(view);
});

test("in Russian: the title, the quoted name on the bin and the sheet's red button", () => {
  initLocale("ru");
  try {
    coach();
    renderTeams();
    assert.equal(view.querySelector("h1").textContent, "Мои команды");
    assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Команды вашего аккаунта");
    assert.equal(view.querySelector('a[href="#/t/t1"]').closest(".g-teams__item").querySelector(".g-status").textContent, "В сезоне");
    assert.equal(view.querySelector('[data-delete-team="t2"]').getAttribute("aria-label"), "Удалить «Anji Magritta»");
    assert.equal(view.querySelector("button.g-btn--primary[data-new-team]").textContent.trim(), "Новая команда");
    fireEvent(view.querySelector('[data-delete-team="t2"]'), "click");
    assert.equal(view.querySelector(".g-sheet__title").textContent, "Удалить команду?");
    assert.equal(view.querySelector(".g-sheet__body").textContent.trim(), "Команда «Anji Magritta» и её состав удаляются навсегда.");
  } finally {
    initLocale("en");
  }
});

test("a team's row is a link of 44px at least beside its bin, and its words are readable in every palette", () => {
  const CSS = "src/screens/teams/teams.css";
  assert.deepEqual(valuesOf(CSS, ".g-teams__item", "min-height"), ["64px"]);
  assert.deepEqual(valuesOf(CSS, ".g-teams__open", "min-width"), ["0"], "the link may shrink below its words, so a long name is cut and the bin stays");
  assert.deepEqual(valuesOf(CSS, ".g-teams", "gap"), ["var(--space-8)"]);
  assertReadable(CSS, ".g-teams__note", "color", ["--page", "--desk"], 4.5);
  assertReadable(CSS, ".g-teams__open .g-icon", "color", ["--surface", "--accent-tint"], 3);
  assert.deepEqual(valuesOf(CSS, ".g-teams__note", "font"), ["400 13px/1.4 var(--font-body)"]);
});

test("on a desk «New team» is as wide as its words, not the whole content", () => {
  const css = readFileSync(new URL("../src/screens/teams/teams.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 901px\)\s*\{[^@]*\.g-teams-page \.g-btn--primary\s*\{[^}]*width: auto/);
});

test("the screen's stylesheet reaches the page", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.ok(styles.includes('@import url("screens/teams/teams.css");'));
});

test("the screen is drawn from rows; nothing in a row is trusted as markup", () => {
  const markup = teamsMarkup({ rows: [{ id: "x1", name: HOSTILE, initials: "X", line: HOSTILE, current: true, draft: false, inSeason: false }] });
  assert.ok(!markup.includes("<img"));
  assert.equal(teamsMarkup({ rows: [] }).includes("<li"), false);
});

// The helpers the 2.x screens still use (the roster editor's delete, the admin's user page).
const confirmWith = (answer) => {
  const asked = [];
  globalThis.confirm = (message) => { asked.push(message); return answer; };
  return asked;
};
const ADMIN = { id: "a1", login: "admin", isAdmin: true, preferences: {} };

test("an admin deleting another coach's team goes to the admin endpoint, and the admin's lists are read again", async () => {
  coach();
  state.auth.currentUser = ADMIN;
  state.admin.editingTeams.set("t9", { draft: true });
  state.admin.editingTeams.set("t8", { draft: true });
  api.reply("DELETE /api/admin/teams/t9", 200, { ok: true });
  api.reply("GET /api/teams", 200, { teams: [] });
  api.reply("GET /api/games", 200, { games: [] });
  const asked = confirmWith(true);
  assert.equal(await deleteSavedTeam("t9", { ownerId: "u2", teamName: "Gone" }), true);
  assert.equal(asked.length, 1);
  assert.match(asked[0], /"Gone"\?$/);
  assert.equal(api.calls[0].key, "DELETE /api/admin/teams/t9");
  assert.equal(api.calls.some((call) => call.key === "DELETE /api/teams/t9"), false);
  assert.equal(state.admin.loaded, false, "the admin screens read their users again");
  assert.deepEqual([...state.admin.editingTeams.keys()], ["t8"], "the deleted team is no longer being edited");
});

test("a coach's own team, or an admin's own, goes to the coach's endpoint; an endpoint given wins", async () => {
  coach();
  state.auth.currentUser = ADMIN;
  confirmWith(true);
  api.reply("DELETE /api/teams/t7", 200, { ok: true });
  api.reply("DELETE /api/custom/t6", 200, { ok: true });
  api.reply("GET /api/teams", 200, { teams: [] });
  api.reply("GET /api/games", 200, { games: [] });
  assert.equal(await deleteSavedTeam("t7", { ownerId: ADMIN.id }), true);
  assert.equal(await deleteSavedTeam("t6", { ownerId: "u2", endpoint: "/api/custom/t6" }), true);
  assert.deepEqual(api.calls.filter((call) => call.key.startsWith("DELETE")).map((call) => call.key), ["DELETE /api/teams/t7", "DELETE /api/custom/t6"]);
  coach();
  state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false, preferences: {} };
  api.reply("DELETE /api/teams/t5", 200, { ok: true });
  api.reply("GET /api/teams", 200, { teams: [] });
  api.reply("GET /api/games", 200, { games: [] });
  assert.equal(await deleteSavedTeam("t5", { ownerId: "u2" }), true, "a coach is not an admin: the owner given changes nothing");
  assert.equal(api.calls[0].key, "DELETE /api/teams/t5");
});

test("a delete the coach declines, or the server refuses, deletes nothing and resets nothing", async () => {
  coach();
  state.admin.editingTeams.set("t9", { draft: true });
  assert.equal(await deleteSavedTeam(""), false);
  confirmWith(false);
  assert.equal(await deleteSavedTeam("t9"), false);
  assert.equal(api.calls.length, 0);
  confirmWith(true);
  api.reply("DELETE /api/teams/t9", 409, refusal("TEAM_IN_FRIENDLY_GAMES"));
  await withoutTimers(async () => {
    assert.equal(await deleteSavedTeam("t9"), false);
  });
  assert.match(toasts().at(-1), /friendly/);
  assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/, "said as an error");
  assert.equal(state.admin.loaded, true);
  assert.ok(state.admin.editingTeams.has("t9"));
});

test("the 2.x delete buttons carry their owner, name and endpoint to the delete, and the screen is told once it is done", async () => {
  coach();
  state.auth.currentUser = ADMIN;
  view.innerHTML = '<button type="button" data-delete-team="t9" data-delete-team-owner="u2" data-delete-team-name="Gone" data-delete-team-endpoint="/api/admin/teams/t9"></button>';
  api.reply("DELETE /api/admin/teams/t9", 200, { ok: true });
  api.reply("GET /api/teams", 200, { teams: [] });
  api.reply("GET /api/games", 200, { games: [] });
  const asked = confirmWith(true);
  const after = [];
  wireTeamDeleteButtons((button) => after.push(button.dataset.deleteTeam));
  fireEvent(view.querySelector("[data-delete-team]"), "click");
  await settle();
  await settle();
  assert.match(asked[0], /"Gone"\?$/);
  assert.deepEqual(after, ["t9"]);
  assert.equal(api.calls[0].key, "DELETE /api/admin/teams/t9");
  confirmWith(false);
  fireEvent(view.querySelector("[data-delete-team]"), "click");
  await settle();
  assert.deepEqual(after, ["t9"], "a delete that was not confirmed is not followed");
});

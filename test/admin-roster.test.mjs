import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  JOE, PIKE, PLAYERS, STYLES, api, aside, coach, died, openRow, releaseCurrentScreen, renderTeamRoster, save, settle, state, team, text, toggle, view, words,
} from "./helpers/roster-page.mjs";

// A file read by the logo picker: the reader answers with what the "file" carries (as test/team-settings.test.mjs reads one).
globalThis.FileReader = class {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  readAsDataURL(file) {
    this.result = file.dataUrl;
    queueMicrotask(() => (file.failure ? this.listeners.get("error")?.(file.failure) : this.listeners.get("load")?.()));
  }
};

const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const { adminOf, openRosterAs, teamSavePath } = await import("../src/screens/team/roster/source.mjs");
const { renderAdminTeam } = await import("../src/screens/admin/team.mjs");
const { logoUploadMaxBytes } = await import("../src/core/logo-upload.mjs");

// Stage 12, Task 14 (decision 23; Review Focus 4): any coach's team in the administration is the same roster 3.0 as its
// coach's, in the admin's mode — read and saved through the admin's routes (`GET`/`PATCH /api/admin/teams/:id`), its
// deaths and their undos the admin's (`/api/admin/teams/:id/…`), a death a match recorded undone too (pre-flight L10), no
// roll on the site, its players' addresses in the administration. The coach's own visit stays the coach's. The admin
// signed in here has a team of his own (t1, roster-page's); the games he reads are his and none is t9's.

const ADMIN = { id: "u1", login: "boss", isAdmin: true, preferences: { activeTeamId: "t1" } };
const OWNER = { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, createdAt: "2025-02-03T10:00:00Z" };
const T9 = (over = {}) => team({ id: "t9", name: "Grimtusk Raiders", ...over });
const withPlayers9 = (players, over = {}) => T9({ roster: { players }, ...over });

const ADMIN_READ = "GET /api/admin/teams/t9";
const ADMIN_PATCH = "PATCH /api/admin/teams/t9";
const COACH_READ = "GET /api/teams/t9";
const COACH_PATCH = "PATCH /api/teams/t9";
const sent = (key) => api.calls.filter((call) => call.key === key);
const adminCalls = () => api.calls.filter(({ key }) => key.includes("/api/admin/"));
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const markText = (sheet) => sheet.querySelector("#mark-text");

/** What an admin's visit is styled by: the roster's sheets, the administration's, the admin's block's — its cards' fields and counters (stage 12). */
const ADMIN_STYLES = [...STYLES, "src/screens/admin/admin.css", "src/screens/admin/team.css", "text-field.css", "resource-counter.css"];

const NO_SITE_ROLL = "An admin marks the advancement «at the table»";
const ADMIN_FROM_MATCH = "A death the post-match recorded: the player comes back with the advancements, and the match's rolls stay used.";
const COACH_FROM_MATCH = "A death the post-match recorded is not undone here: the league administrator corrects it.";

/**
 * The admin on a page that has read his own teams and the reference (roster-page's coach, then the admin in his place);
 * the server answers t9 on the admin's route with its owner, its records and its fallen on the coach's routes, which an
 * admin may read, the admin's games, each player's career and the team's rolls. `open` is the player chosen from the
 * first draw: his row open on a phone, him in the panel on a desk.
 */
function admin({ teamAnswer = T9(), fallen = [], open = null, owner = OWNER, inMatch = false } = {}) {
  coach();
  if (save.saveState("t9").status !== "idle") save.takeServerTeam(T9());
  Object.assign(rosterMemory("t9"), { sort: null, selected: open, outside: null, scroll: null, wayBack: null, fromPlayer: false, query: "" });
  state.auth.currentUser = ADMIN;
  api.reply(ADMIN_READ, 200, { owner, team: teamAnswer, inMatch, matches: [] });
  api.reply("GET /api/teams/t9/events", 200, { events: [], revision: teamAnswer.revision });
  api.reply("GET /api/teams/t9/fallen", 200, { fallen });
  api.reply("GET /api/teams/t9/rolls", 200, { rolls: [] });
  for (const id of [...PLAYERS.map((player) => player.id), "d1", "d2"]) {
    api.reply(`GET /api/teams/t9/players/${id}/history`, 200, { history: { playerId: id, matches: [], outside: {} } });
  }
}

/** The admin's visit, as the router draws `#/administration/users/u2/teams/t9/edit[/:pid]`. */
async function visit(playerId = "") {
  await renderAdminTeam({ ownerId: "u2", teamId: "t9", playerId });
  await settle();
}

/** A counter's «+» in the open row of a phone (D3: a desk taps no counter outside a match). */
const plus = (counter) => openRow().querySelectorAll("[data-action-key]").find((cell) => cell.getAttribute("data-action-key") === counter)
  .querySelector('[data-action-step="1"]');

test("an admin's visit reads and saves through the admin's routes; the owner's next visit through the owner's", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      admin({ open: "p1#0" });
      await visit();
      assert.equal(sent(ADMIN_READ).length, 1, "the team is read on the admin's route");
      assert.equal(sent(COACH_READ).length, 0, "never on the coach's");
      assert.equal(sent("GET /api/teams/t9/events").length, 1);
      assert.equal(sent("GET /api/teams/t9/fallen").length, 1);
      assert.deepEqual(adminOf("t9"), { ownerId: "u2" });
      assert.equal(state.activeTeamId, "t1", "the admin's route makes no team the active one");
      api.reply(ADMIN_PATCH, 200, { team: withPlayers9(PLAYERS.map((player) => (player.id === "p1" ? { ...player, spp: { touchdowns: 1 } } : player)), { revision: 5 }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 1, "the step goes on the admin's route");
      assert.equal(sent(COACH_PATCH).length, 0);
      assert.equal(sent(ADMIN_PATCH)[0].body.revision, 4);
      assert.equal(sent(ADMIN_PATCH)[0].body.roster.players.find((player) => player.id === "p1").spp.touchdowns, 1);
      assert.equal(save.savedRevision("t9"), 5);
      api.assertAnswered();
      // The owner's next visit is the coach's: the team read and saved on the coach's routes, the queue's route changed with it.
      openRosterAs("t9");
      assert.equal(teamSavePath("t9"), "/api/teams/t9");
      releaseCurrentScreen();
      state.auth.currentUser = { ...OWNER, preferences: { activeTeamId: "t9" } };
      state.myTeams = { items: [T9({ revision: 5 })], loaded: true, loading: false, error: "" };
      api.reply(COACH_READ, 200, { team: T9({ revision: 5 }) });
      api.reply("GET /api/teams/t9/events", 200, { events: [], revision: 5 });
      api.reply(COACH_PATCH, 200, { team: T9({ revision: 6 }) });
      Object.assign(rosterMemory("t9"), { selected: "p1#0" });
      await renderTeamRoster("t9");
      await settle();
      assert.equal(adminOf("t9"), null);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(sent(COACH_PATCH).length, 1, "the owner's step goes on the owner's route");
      assert.equal(sent(COACH_PATCH)[0].body.revision, 5);
      assert.equal(sent(ADMIN_PATCH).length, 1, "nothing more on the admin's");
      assert.equal(view.querySelector(".g-adminteam__identity"), null, "the owner's roster has no admin's card: the coach's name and logo are «Team settings»");
    });
  });
});

test("a death and its undo go the admin's way", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin({ open: "p1#0", fallen: [PIKE] });
      await visit();
      fireEvent(aside().querySelector("[data-roster-mark]"), "click");
      const sheet = () => view.querySelector("dialog#roster-mark");
      fireEvent(sheet().querySelectorAll('.g-option[role="radio"]').find((card) => card.getAttribute("data-option-value") === "dead"), "click");
      const field = markText(sheet());
      field.value = "Foul";
      fireEvent(field, "input");
      const DEATH = "POST /api/admin/teams/t9/players/p1/death";
      const annFell = died("f9", { ...PLAYERS[0] }, { cause: "Foul", diedAt: "2026-10-19T10:00:00Z" });
      api.reply(DEATH, 201, { team: withPlayers9(PLAYERS.filter((player) => player.id !== "p1"), { revision: 5 }), fallen: annFell });
      fireEvent(sheet().querySelector("[data-mark-send]"), "click");
      await settle();
      assert.equal(sent(DEATH).length, 1);
      assert.deepEqual(sent(DEATH)[0].body, { cause: "Foul", revision: 4 });
      assert.equal(sent("POST /api/teams/t9/players/p1/death").length, 0);
      assert.equal(save.savedRevision("t9"), 5, "the queue takes the answer's team");
      // Pike's death, marked by hand, undone: the admin's DELETE.
      const UNDO = "DELETE /api/admin/teams/t9/fallen/f1";
      api.reply(UNDO, 200, { team: withPlayers9([...PLAYERS.filter((player) => player.id !== "p1"), PIKE.player], { revision: 6 }) });
      fireEvent(toggle("fallen-f1"), "click");
      fireEvent(aside().querySelector("[data-roster-undo]"), "click");
      fireEvent(view.querySelector("dialog#roster-undo [data-undo-send]"), "click");
      await settle();
      assert.equal(sent(UNDO).length, 1);
      assert.equal(sent("DELETE /api/teams/t9/fallen/f1").length, 0);
      assert.equal(toasts().at(-1), "Pike is on the roster again");
      api.assertAnswered();
    });
  });
});

// Pre-flight L10 (the hand-off of 07b): a death a match recorded is the administrator's to undo; the coach's screen offers none.
test("the admin undoes a death a match recorded, and is told what the undo keeps", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin({ fallen: [PIKE, JOE] });
      await visit();
      fireEvent(toggle("fallen-f2"), "click");
      const undo = aside().querySelector("[data-roster-undo]");
      assert.ok(undo, "Joe died in a match: the admin undoes it");
      assert.ok(!undo.hasAttribute("aria-disabled"));
      assert.ok(words(aside()).includes(ADMIN_FROM_MATCH));
      assert.ok(!words(aside()).includes(COACH_FROM_MATCH), "not the coach's words");
      fireEvent(undo, "click");
      const sheet = view.querySelector("dialog#roster-undo");
      assert.ok(sheet?.isModal);
      assert.ok(words(sheet).includes(ADMIN_FROM_MATCH));
      assert.ok(!words(sheet).includes(COACH_FROM_MATCH));
      const UNDO = "DELETE /api/admin/teams/t9/fallen/f2";
      api.reply(UNDO, 200, { team: withPlayers9([...PLAYERS, JOE.player], { revision: 5 }) });
      fireEvent(sheet.querySelector("[data-undo-send]"), "click");
      await settle();
      assert.equal(sent(UNDO).length, 1);
      assert.equal(toasts().at(-1), "Joe is on the roster again");
      // A death marked by hand keeps the coach's hint; its sheet has no word of a match.
      fireEvent(toggle("fallen-f1"), "click");
      assert.ok(words(aside()).includes("Marked by mistake? The player comes back to the roster and into TV."));
      fireEvent(aside().querySelector("[data-roster-undo]"), "click");
      assert.ok(!words(view.querySelector("dialog#roster-undo")).some((line) => line === ADMIN_FROM_MATCH || line === COACH_FROM_MATCH));
      assertCspSafe(view);
      assertStyled(view, ...ADMIN_STYLES);
    });
  });
  // On a phone the row of a death from a match leads to the profile, where it is undone.
  await withWindow({ phone: true }, async () => {
    admin({ fallen: [JOE] });
    await visit();
    fireEvent(toggle("fallen-f2"), "click");
    assert.ok(words(openRow()).includes("The mark can be undone in the profile"));
    assert.ok(!words(openRow()).includes(COACH_FROM_MATCH));
  });
  // A record the roster cannot read has no undo for the admin either, and says so in the admin's words.
  await withWindow({ phone: false }, async () => {
    admin({ fallen: [died("f4", { id: "d4", name: "Far Row", rowIndex: 99, number: "4" }, { fromMatch: true })] });
    await visit();
    fireEvent(toggle("fallen-f4"), "click");
    assert.ok(!aside().querySelector("[data-roster-undo]"));
    assert.ok(words(aside()).includes("The roster cannot read this record: the player cannot come back to the roster."));
  });
});

test("the admin rolls nothing on the site: the sheet opens at the table, «Roll on the site» closed with why; the advancement goes on the admin's route", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      const ann = { ...PLAYERS[0], spp: { touchdowns: 10 } };
      admin({ open: "p1#0", teamAnswer: withPlayers9([ann, ...PLAYERS.slice(1)]) });
      await visit();
      fireEvent(view.querySelector("[data-player-advance]"), "click");
      const sheet = () => view.querySelector("dialog#player-advance");
      fireEvent(sheet().querySelector('.g-options [data-option-value="random"]'), "click");
      fireEvent(sheet().querySelector('[data-advance-category="General"]'), "click");
      const way = (value) => sheet().querySelector(`[data-seg-group="advance-via"] [data-seg-value="${value}"]`);
      assert.equal(way("table").getAttribute("aria-checked"), "true", "the table is the admin's way from the start");
      assert.equal(way("site").getAttribute("aria-disabled"), "true");
      assert.equal(way("site").getAttribute("title"), NO_SITE_ROLL, "the site's segment says why");
      assert.equal(sheet().querySelector("[data-advance-roll]"), null, "no «Roll two D16» to press");
      fireEvent(way("site"), "click");
      await settle();
      assert.equal(way("table").getAttribute("aria-checked"), "true", "the site is not taken");
      assert.equal(api.calls.filter(({ key }) => key.endsWith("/rolls") && key.startsWith("POST")).length, 0, "no roll asked");
      // At the table: two faces marked, one taken — one step of the queue, on the admin's route.
      assert.notEqual(way("table").getAttribute("aria-disabled"), "true");
      fireEvent(sheet().querySelector('[data-advance-face="3"]'), "click");
      fireEvent(sheet().querySelector('[data-advance-face="5"]'), "click");
      fireEvent(sheet().querySelector('[data-advance-pick="Fend"]'), "click");
      const taken = { type: "random", grants: { skill: "Fend" }, roll: { via: "table" } };
      api.reply(ADMIN_PATCH, 200, { team: withPlayers9([{ ...ann, extraSkills: [{ name: "Fend", access: "primary" }], advancements: [taken] }, ...PLAYERS.slice(1)], { revision: 5 }) });
      fireEvent(sheet().querySelector("[data-advance-take]"), "click");
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 1);
      assert.deepEqual(sent(ADMIN_PATCH)[0].body.roster.players.find((player) => player.id === "p1").advancements, [taken]);
      assert.equal(sent(COACH_PATCH).length, 0);
    });
  });
});

test("a player's links stay in the administration", async () => {
  const EDIT = "#/administration/users/u2/teams/t9/edit";
  await withWindow({ phone: true }, async () => {
    admin({ open: "p1#0", fallen: [PIKE] });
    await visit();
    assert.equal(openRow().querySelector("a.g-btn--dark").getAttribute("href"), `${EDIT}/p1`, "his profile");
    fireEvent(toggle("fallen-f1"), "click");
    assert.equal(openRow().querySelector("a.g-btn--dark").getAttribute("href"), `${EDIT}/d1`, "a fallen player's profile");
    // His page: «‹ Roster» back to the admin's roster; a fallen player's page too; an id the roster holds nowhere too.
    for (const id of ["p1", "d1", "zz"]) {
      admin({ fallen: [PIKE] });
      await visit(id);
      assert.equal(view.querySelector("[data-screen]").getAttribute("data-screen"), "team-player", id);
      assert.equal(view.querySelector(".g-profile__back").getAttribute("href"), EDIT, id);
    }
    assert.equal(view.querySelector(".g-roster__calloutlink").getAttribute("href"), EDIT, "«To the roster» of an id it holds nowhere");
  });
  await withWindow({ phone: false }, async () => {
    admin();
    await visit("zz");
    assert.equal(view.querySelector(".g-roster__calloutlink").getAttribute("href"), EDIT, "a desk says it over the table");
  });
});

test("the admin's head names the team and its coach: «Coach's team», the path to them", async () => {
  await withWindow({ phone: false }, async () => {
    admin();
    await visit();
    assert.equal(view.querySelector("h1").textContent, "Coach's team");
    assert.equal(document.activeElement, view.querySelector("h1"), "the title takes the focus");
    const crumbs = view.querySelector(".g-admin__head .g-admin__crumbs");
    assert.equal(crumbs.textContent, "Administration → orc_boss → Grimtusk Raiders");
    assert.deepEqual(crumbs.querySelectorAll("a").map((link) => [link.textContent, link.getAttribute("href")]),
      [["Administration", "#/administration"], ["orc_boss", "#/administration/users/u2"]]);
    assert.ok(view.querySelector(".g-admin__head .g-roster__search"), "the desk's search stays in the band");
    assert.equal(view.querySelector(".g-roster__strip"), null, "no treasury strip of the coach's");
    assertCspSafe(view);
    assertStyled(view, ...ADMIN_STYLES);
  });
  // A phone draws the head as a title: the shell's header names the admin's own team.
  await withWindow({ phone: true }, async () => {
    admin();
    await visit();
    assert.ok(view.querySelector(".g-pagehead--phone h1"));
    assert.equal(view.querySelector(".g-admin__crumbs").textContent, "Administration → orc_boss → Grimtusk Raiders");
  });
  // Names are text.
  await withWindow({ phone: false }, async () => {
    admin({ teamAnswer: T9({ name: HOSTILE }), owner: { ...OWNER, login: HOSTILE } });
    await visit();
    assert.equal(view.querySelector(".g-admin__crumbs").textContent, `Administration → ${HOSTILE} → ${HOSTILE}`);
    assert.equal(view.querySelector("img"), null);
    assertCspSafe(view);
  });
});

test("a coach who is no admin is told the section is the admin's, and nothing is read", async () => {
  coach();
  state.auth.currentUser = { id: "u3", login: "coach", isAdmin: false };
  await renderAdminTeam({ ownerId: "u2", teamId: "t9" });
  await settle();
  assert.equal(api.calls.length, 0, "no request at all");
  assert.equal(adminCalls().length, 0);
  assert.equal(view.querySelector("h1").textContent, "Administration");
  assert.ok(words(view).includes("This section is for the administrator only"));
  assert.equal(view.querySelector("table"), null);
});

test("every key of the admin's roster is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/admin/team.mjs", "src/screens/team/roster/source.mjs", "src/screens/team/roster/view.mjs", "src/screens/team/roster/admin-identity.mjs",
    "src/screens/team/roster/fallen-view.mjs", "src/screens/team/roster/advance.mjs");
});

// Stage 12, Task 14 review (the owner's answer, binding over plan decision 25): the admin edits a team's name and its logo,
// never its race. The 2.x editor did it on this address; the roster 3.0 in the admin's mode does it in a card where the
// coach's treasury strip stands (Task 15's admin block takes it into its grid). Each change is one step of the roster's
// queue — the team's name or logo in the body, the race and the roster as they are — on the admin's route.
const LOGO = "data:image/png;base64,iVBORw0KGgo=";
const card = () => view.querySelector(".g-adminteam__identity");
const nameField = () => view.querySelector("input#admin-team-name");
const typeName = (value) => {
  const field = nameField();
  field.value = value;
  fireEvent(field, "input");
};
const pressName = () => fireEvent(card().querySelector("[data-identity-save]"), "click");
const pickLogo = (file) => fireEvent(Object.assign(view.querySelector("input#admin-team-logo"), { files: [file], value: "C:\\fakepath\\logo.png" }), "change");
const bodyOf = (index) => sent(ADMIN_PATCH)[index].body;
const WAIT_QUEUE = "Wait for the roster to be saved first";

test("the admin renames the team and changes its logo: each one save on the admin's route, the race and the roster as they are", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin();
      await visit();
      assert.ok(card(), "the admin's visit has the card in the treasury strip's place");
      assert.equal(card().querySelector("h2").textContent, "Name and logo");
      assert.equal(nameField().value, "Grimtusk Raiders");
      assert.ok(words(card()).includes("Race: Human. A team's race is not changed."), "the race is shown, with nothing to change it");
      api.reply(ADMIN_PATCH, 200, { team: T9({ name: "Grimtusk Reavers", revision: 5 }) });
      typeName("  Grimtusk Reavers ");
      pressName();
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 1, "one save");
      assert.deepEqual([bodyOf(0).name, bodyOf(0).baseTeamSlug, bodyOf(0).logoData, bodyOf(0).revision], ["Grimtusk Reavers", "teams/human", "", 4]);
      assert.deepEqual(bodyOf(0).roster.players.map((player) => player.id), PLAYERS.map((player) => player.id), "the roster as it is");
      assert.equal(sent(COACH_PATCH).length, 0, "never the coach's route");
      assert.equal(nameField().value, "Grimtusk Reavers");
      assert.equal(view.querySelector(".g-admin__crumbs").textContent, "Administration → orc_boss → Grimtusk Reavers", "the path names the team as it is now");
      // A logo: one save of it, with the name the team has now.
      assert.ok(card().querySelector(".g-adminteam__picture svg"), "no logo: the picture's glyph");
      assert.equal(card().querySelector("[data-identity-logo-remove]"), null);
      api.reply(ADMIN_PATCH, 200, { team: T9({ name: "Grimtusk Reavers", logoData: LOGO, revision: 6 }) });
      pickLogo({ name: "logo.png", size: 100, dataUrl: LOGO });
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 2);
      assert.deepEqual([bodyOf(1).name, bodyOf(1).baseTeamSlug, bodyOf(1).logoData, bodyOf(1).revision], ["Grimtusk Reavers", "teams/human", LOGO, 5]);
      assert.equal(view.querySelector("input#admin-team-logo").value, "", "emptied: the same file may be picked again");
      assert.equal(card().querySelector(".g-adminteam__picture img").getAttribute("src"), LOGO);
      // «Remove»: an empty logo; the button that had the focus goes, the file field takes it.
      api.reply(ADMIN_PATCH, 200, { team: T9({ name: "Grimtusk Reavers", logoData: null, revision: 7 }) });
      const remove = card().querySelector("[data-identity-logo-remove]");
      remove.focus();
      fireEvent(remove, "click");
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 3);
      assert.deepEqual([bodyOf(2).name, bodyOf(2).logoData, bodyOf(2).revision], ["Grimtusk Reavers", "", 6]);
      assert.equal(card().querySelector("img"), null);
      assert.equal(document.activeElement, view.querySelector("input#admin-team-logo"));
      assert.equal(sent(COACH_PATCH).length, 0);
      api.assertAnswered();
      assertCspSafe(view);
      assertStyled(view, ...ADMIN_STYLES);
    });
  });
});

test("the name and the logo wait for the roster's queue and say so; an empty name, the same name, a file too large or no picture send nothing", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      admin({ open: "p1#0" });
      await visit();
      assert.ok(card(), "a phone has the card too");
      pressName();
      assert.equal(toasts().at(-1), "The name is the same");
      typeName("   ");
      pressName();
      assert.equal(toasts().at(-1), "The name cannot be empty");
      assert.equal(sent(ADMIN_PATCH).length, 0);
      // A step of the roster's in the air: the name and the logo wait for it, and what was typed stays.
      const scored = PLAYERS.map((player) => (player.id === "p1" ? { ...player, spp: { touchdowns: 1 } } : player));
      const gate = api.hold(ADMIN_PATCH);
      api.reply(ADMIN_PATCH, 200, { team: withPlayers9(scored, { revision: 5 }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 1);
      typeName("Grimtusk Reavers");
      pressName();
      assert.equal(toasts().at(-1), WAIT_QUEUE);
      pickLogo({ name: "logo.png", size: 100, dataUrl: LOGO });
      await settle();
      assert.equal(toasts().at(-1), WAIT_QUEUE);
      assert.equal(sent(ADMIN_PATCH).length, 1, "nothing more is sent");
      assert.equal(nameField().value, "Grimtusk Reavers", "what was typed stays through the draws");
      gate.release();
      await settle();
      api.reply(ADMIN_PATCH, 200, { team: withPlayers9(scored, { name: "Grimtusk Reavers", revision: 6 }) });
      pressName();
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 2);
      assert.deepEqual([bodyOf(1).name, bodyOf(1).revision], ["Grimtusk Reavers", 5], "on the revision the step before came back with");
      assert.equal(bodyOf(1).roster.players.find((player) => player.id === "p1").spp.touchdowns, 1, "with the roster that step saved");
      pickLogo({ name: "big.png", size: logoUploadMaxBytes + 1, dataUrl: LOGO });
      await settle();
      assert.equal(toasts().at(-1), "Logo must be 2 MB or smaller.");
      pickLogo({ name: "paper.pdf", size: 100, dataUrl: "data:application/pdf;base64,JVBERi0=" });
      await settle();
      assert.equal(toasts().at(-1), "The logo could not be read: choose a PNG or JPG picture.");
      assert.equal(sent(ADMIN_PATCH).length, 2, "neither is sent");
      api.assertAnswered();
    });
  });
});

test("the name and logo card: the prototype's card, a 48px field and button, 40px buttons on a desk and 44px on a phone; nothing cut", () => {
  const CSS = "src/screens/admin/team.css";
  const px = (value) => Number.parseFloat(value);
  assert.doesNotMatch(text(CSS), /ellipsis|nowrap|@media \((?!max-width: 900px|min-width: 901px)/);
  assert.match(text("src/styles.css"), /@import url\("screens\/admin\/team\.css"\);\s*$/, "imported last");
  assert.deepEqual(valuesOf(CSS, ".g-adminteam .g-admin__grid", "grid-template-columns"), ["repeat(auto-fit, minmax(min(340px, 100%), 1fr))"],
    "the prototype's 340px cards, never wider than the roster's column beside a desk's panel");
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-adminteam__btn", "min-height"), ["40px"]);
  assert.ok(px(inMedia(CSS, "max-width: 900px", ".g-adminteam__btn", "min-height")[0]) >= 44);
  assert.deepEqual(valuesOf(CSS, ".g-adminteam__identity .g-btn--primary", "height"), ["48px"]);
  assert.ok(valuesOf(CSS, ".g-adminteam__logotext", "overflow-wrap").includes("anywhere"), "a long note wraps");
  assertReadable(CSS, ".g-adminteam__logoname", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminteam__picture", "color", ["--surface-2"], 3);
});

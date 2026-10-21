import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { PLAYERS, PIKE, STYLES, api, coach, died, openRow, releaseCurrentScreen, renderTeamRoster, save, settle, state, team, text, view, words } from "./helpers/roster-page.mjs";

const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const { renderAdminTeam } = await import("../src/screens/admin/team.mjs");
const { ADMIN_STAFF } = await import("../src/screens/team/roster/admin-block.mjs");
const { raceTeamOf } = await import("../src/data/teams.mjs");
const { rowsForTeam } = await import("../src/domain/roster/values.mjs");
const { classifyTreasuryChange } = await import("../src/domain/roster/ledger.mjs");
const { normalizeDraft } = await import("../src/domain/roster/schema.mjs");

// Stage 12, Task 15 (decisions 24, 28; Review Focus 4): in the coach's treasury strip's place the admin's visit of a team's
// roster has the admin's block (DeskAdminTeamEdit.html) — the yellow banner naming the coach with the way back to him, then
// the cards: the treasury set with its reason (one POST, only when the roster's queue is empty, its answer the queue's),
// the staff counted without money (eight re-rolls together at most, no ledger line), a fallen player added afterwards, and
// the team's name and logo (Task 14's card). The 2.x roster editor is gone with its sheet and its question before unload.

const ADMIN = { id: "u1", login: "boss", isAdmin: true, preferences: { activeTeamId: "t1" } };
const OWNER = { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, createdAt: "2025-02-03T10:00:00Z" };
const STAFFED = { treasury: 95, startingRerolls: 4, teamRerolls: 3, dedicatedFans: 2, assistantCoaches: 1, cheerleaders: 0, apothecary: 1, purchasedStaff: { teamRerolls: 3 } };
const T9 = (over = {}) => team({ id: "t9", name: "Grimtusk Raiders", ...over, roster: { players: PLAYERS, ...STAFFED, ...over.roster } });
const MATCHES = [
  { id: "g6", kind: "league", roundNumber: 6, opponent: "Silverbrook Rangers", score: [2, 1], confirmedAt: "2026-10-12T10:00:00Z" },
  { id: "g4", kind: "friendly", roundNumber: null, opponent: "Ashgrove Wardens", score: [0, 3], confirmedAt: "2026-10-01T10:00:00Z" },
];

const ADMIN_READ = "GET /api/admin/teams/t9";
const ADMIN_PATCH = "PATCH /api/admin/teams/t9";
const TREASURY = "POST /api/admin/teams/t9/treasury";
const FALLEN_ADD = "POST /api/admin/teams/t9/fallen";
const FALLEN_READ = "GET /api/teams/t9/fallen";
const sent = (key) => api.calls.filter((call) => call.key === key);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const CSS = "src/screens/admin/team.css";
const ADMIN_STYLES = [...STYLES, "src/screens/admin/admin.css", CSS, "text-field.css", "resource-counter.css"];

/** The admin on a page that has read his own teams and the reference; t9 is orc_boss's, read on the admin's route. */
function admin({ teamAnswer = T9(), fallen = [], open = null, owner = OWNER, inMatch = false, matches = MATCHES } = {}) {
  coach();
  if (save.saveState("t9").status !== "idle") save.takeServerTeam(T9());
  Object.assign(rosterMemory("t9"), { sort: null, selected: open, outside: null, scroll: null, wayBack: null, fromPlayer: false, query: "" });
  state.auth.currentUser = ADMIN;
  api.reply(ADMIN_READ, 200, { owner, team: teamAnswer, inMatch, matches });
  api.reply("GET /api/teams/t9/events", 200, { events: [], revision: teamAnswer.revision });
  api.reply(FALLEN_READ, 200, { fallen });
  api.reply("GET /api/teams/t9/rolls", 200, { rolls: [] });
  for (const id of [...PLAYERS.map((player) => player.id), "d1", "n1"]) {
    api.reply(`GET /api/teams/t9/players/${id}/history`, 200, { history: { playerId: id, matches: [], outside: {} } });
  }
}

async function visit() {
  await renderAdminTeam({ ownerId: "u2", teamId: "t9" });
  await settle();
}

const block = () => view.querySelector(".g-adminteam");
const card = (name) => view.querySelector(`.g-adminteam__${name}`);
const field = (id) => view.querySelector(`#${id}`);
const type = (id, value) => {
  const input = field(id);
  input.value = value;
  fireEvent(input, "input");
};
const choose = (id, value) => {
  const select = field(id);
  select.value = value;
  fireEvent(select, "change");
};
const pressSave = () => fireEvent(card("treasury").querySelector("[data-admin-treasury]"), "click");
const counter = (key) => card("staff").querySelectorAll("[data-resource-key]").find((row) => row.getAttribute("data-resource-key") === `staff:${key}`);
const step = (key, delta) => counter(key)?.querySelector(`[data-resource-step="${delta}"]`);
const plus = (counterKey) => openRow().querySelectorAll("[data-action-key]").find((cell) => cell.getAttribute("data-action-key") === counterKey)
  .querySelector('[data-action-step="1"]');
const sheet = () => view.querySelector("dialog#admin-fallen");
const localDay = (date = new Date()) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, at) => String(part).padStart(at ? 2 : 4, "0")).join("-");

test("the admin's block in place of the treasury strip: the banner with the coach, the way back, the three cards", async () => {
  await withWindow({ phone: false }, async () => {
    admin();
    await visit();
    const banner = block().querySelector('[role="status"]');
    assert.ok(banner, "a banner a screen reader hears");
    assert.ok(words(banner).includes("You are editing orc_boss's team"));
    assert.ok(words(banner).includes("Changes are saved at once. A treasury fix goes into the history as «admin»."));
    const back = banner.querySelector("a");
    assert.deepEqual([back.textContent, back.getAttribute("href")], ["Back to the coach", "#/administration/users/u2"]);
    assert.equal(view.querySelector(".g-roster__strip"), null, "no treasury strip of the coach's");
    assert.deepEqual(block().querySelectorAll(".g-admin__grid .g-admin__card h2").map((title) => title.textContent),
      ["Treasury", "Staff", "Fallen, added afterwards", "Name and logo"]);
    assert.ok(!words(block()).some((line) => line.startsWith("The team is playing a match")), "no match: no word of one");
    // The block stands over the roster, across its width, as the prototype's band of cards.
    const siblings = [...block().parentNode.childNodes].filter((node) => node.nodeType === 1);
    assert.equal(siblings[siblings.indexOf(block()) + 1], view.querySelector(".g-roster__layout"));
    assert.equal(field("admin-team-treasury").value, "95", "the treasury the team holds, in thousands");
    assert.ok(words(card("treasury")).includes("A fix by hand · the reason is required"));
    assert.ok(words(card("staff")).includes("The treasury does not change: money is fixed in «Treasury»"));
    assert.ok(words(card("fallen")).includes("A player taken off the roster before 3.0 without a post-match."));
    assertCspSafe(view);
    assertStyled(view, ...ADMIN_STYLES);
  });
  // A phone has the block too, over the roster; the coach's own visit has none.
  await withWindow({ phone: true }, async () => {
    admin();
    await visit();
    assert.ok(block().querySelector('[role="status"]'));
    assert.ok(card("treasury") && card("staff") && card("fallen"));
    releaseCurrentScreen();
    state.auth.currentUser = { ...OWNER, preferences: { activeTeamId: "t9" } };
    state.myTeams = { items: [T9()], loaded: true, loading: false, error: "" };
    api.reply("GET /api/teams/t9", 200, { team: T9() });
    await renderTeamRoster("t9");
    await settle();
    assert.equal(block(), null, "the coach's roster has no admin's block");
  });
});

test("the treasury's fix waits for the queue and goes once", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      admin({ open: "p1#0" });
      await visit();
      // A step of the roster's in the air: the fix waits for it, and nothing is sent.
      const scored = PLAYERS.map((player) => (player.id === "p1" ? { ...player, spp: { touchdowns: 1 } } : player));
      const gate = api.hold(ADMIN_PATCH);
      api.reply(ADMIN_PATCH, 200, { team: T9({ revision: 5, roster: { players: scored } }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      type("admin-team-treasury", "120");
      type("admin-team-note", "Fix after round 6");
      pressSave();
      await settle();
      assert.equal(toasts().at(-1), "Wait for the roster to be saved first");
      assert.equal(sent(TREASURY).length, 0);
      assert.equal(field("admin-team-treasury").value, "120", "what was typed stays through the draws");
      gate.release();
      await settle();
      // The queue empty: two presses, one POST on the revision the step came back with.
      const held = api.hold(TREASURY);
      api.reply(TREASURY, 200, { team: T9({ revision: 6, roster: { players: scored, treasury: 120 } }), entry: { kind: "admin", delta: 25, note: "Fix after round 6" } });
      pressSave();
      pressSave();
      await settle();
      assert.equal(sent(TREASURY).length, 1, "one POST however many presses");
      assert.deepEqual(sent(TREASURY)[0].body, { treasury: 120, note: "Fix after round 6", revision: 5 });
      // While it is on its way no step of the roster goes: its answer moves the revision.
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 1, "the counter waits for the treasury's answer");
      assert.equal(toasts().at(-1), "Saving the treasury fix…");
      held.release();
      await settle();
      assert.equal(save.savedRevision("t9"), 6, "the queue takes the answer's team");
      assert.equal(field("admin-team-treasury").value, "120");
      assert.equal(field("admin-team-note").value, "", "the reason is emptied once it is in the history");
      assert.equal(toasts().at(-1), "The treasury is 120k now");
      assert.equal(sent(ADMIN_READ).length, 1, "the answer is enough: nothing is read again");
      api.assertAnswered();
    });
  });
});

test("the treasury's fix says what it waits for: a sum, a reason, a change", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin();
      await visit();
      pressSave();
      assert.equal(toasts().at(-1), "Give the reason");
      type("admin-team-note", "Fix");
      pressSave();
      assert.equal(toasts().at(-1), "The sum is the same");
      for (const typed of ["abc", "", "-5", "1.25"]) {
        type("admin-team-treasury", typed);
        pressSave();
        assert.equal(toasts().at(-1), "Enter the sum", JSON.stringify(typed));
      }
      type("admin-team-treasury", "95,0");
      pressSave();
      assert.equal(toasts().at(-1), "The sum is the same", "a comma reads as a dot");
      type("admin-team-note", "   ");
      type("admin-team-treasury", "100");
      pressSave();
      assert.equal(toasts().at(-1), "Give the reason", "blanks are no reason");
      await settle();
      assert.equal(sent(TREASURY).length, 0);
    });
  });
});

test("a lost answer of the fix is not sent again: the team is read again; another device's save is said", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin();
      await visit();
      api.reply(TREASURY, 503, { error: { code: "SERVICE_UNAVAILABLE" } });
      api.reply(ADMIN_READ, 200, { owner: OWNER, team: T9({ revision: 5, roster: { treasury: 120 } }), inMatch: false, matches: MATCHES });
      api.reply("GET /api/teams/t9/events", 200, { events: [], revision: 5 });
      type("admin-team-treasury", "120");
      type("admin-team-note", "Fix");
      pressSave();
      await settle();
      assert.equal(sent(TREASURY).length, 1);
      assert.equal(toasts().at(-1), "No answer came: the site is reading the data again — check whether it was saved.");
      assert.equal(sent(ADMIN_READ).length, 2, "read again, never sent again");
      assert.equal(field("admin-team-treasury").value, "120", "what the server holds");
      assert.equal(save.savedRevision("t9"), 5);
      // Another device's save: its words, and the server's team read.
      api.reply(TREASURY, 409, { error: { code: "TEAM_SAVED_ELSEWHERE" }, team: T9({ revision: 7 }) });
      api.reply(ADMIN_READ, 200, { owner: OWNER, team: T9({ revision: 7, roster: { treasury: 80 } }), inMatch: false, matches: MATCHES });
      api.reply("GET /api/teams/t9/events", 200, { events: [], revision: 7 });
      type("admin-team-treasury", "150");
      type("admin-team-note", "Fix");
      pressSave();
      await settle();
      assert.equal(sent(TREASURY).length, 2);
      assert.equal(toasts().at(-1), "The team was changed elsewhere — perhaps by this very change, if its answer was lost. Check the history before you make it again.");
      assert.equal(sent(ADMIN_READ).length, 3);
      assert.equal(save.savedRevision("t9"), 7);
      assert.equal(field("admin-team-treasury").value, "80", "what the server holds, for the admin to check before making it again");
      assert.equal(field("admin-team-note").value, "");
      api.assertAnswered();
    });
  });
});

test("the staff counts without money, eight re-rolls together at most", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin();
      await visit();
      const race = raceTeamOf("teams/human");
      assert.deepEqual(card("staff").querySelectorAll("[data-resource-key]").map((row) => row.getAttribute("data-resource-key")),
        ["staff:startingRerolls", "staff:teamRerolls", "staff:dedicatedFans", "staff:assistantCoaches", "staff:cheerleaders", "staff:apothecary"],
        "the Team page's order; no bribes for a race without Bribery and Corruption; the race's medics");
      assert.equal(counter("teamRerolls").querySelector(".g-resource__value").textContent, "3");
      assert.ok(step("cheerleaders", -1).hasAttribute("disabled"), "none to take off");
      api.reply(ADMIN_PATCH, 200, { team: T9({ revision: 5, roster: { teamRerolls: 4 } }) });
      fireEvent(step("teamRerolls", 1), "click");
      await settle();
      assert.equal(sent(ADMIN_PATCH).length, 1, "a step of the queue, on the admin's route");
      const { roster } = sent(ADMIN_PATCH)[0].body;
      assert.deepEqual([roster.teamRerolls, roster.startingRerolls, roster.treasury], [4, 4, 95], "the count alone; the treasury as it is");
      assert.deepEqual(roster.purchasedStaff, normalizeDraft(T9().roster).purchasedStaff, "no purchase on record");
      assert.deepEqual(classifyTreasuryChange(race, normalizeDraft(T9().roster), normalizeDraft(roster), { admin: true }), [], "a staff step writes no ledger line");
      assert.equal(sent("PATCH /api/teams/t9").length, 0);
      // 4 + 4: «+» of either says the joint maximum, and sends nothing.
      const full = step("teamRerolls", 1);
      assert.equal(full.getAttribute("aria-disabled"), "true");
      assert.equal(full.getAttribute("title"), "Starting Re-rolls + Team Re-rolls: maximum is 8.");
      assert.equal(step("startingRerolls", 1).getAttribute("title"), "Starting Re-rolls + Team Re-rolls: maximum is 8.");
      fireEvent(full, "click");
      await settle();
      assert.equal(toasts().at(-1), "Starting Re-rolls + Team Re-rolls: maximum is 8.");
      assert.equal(sent(ADMIN_PATCH).length, 1);
      // An apothecary is one at most; a step down takes nothing back into the treasury either.
      assert.equal(step("apothecary", 1).getAttribute("title"), "Apothecary: maximum is 1.");
      api.reply(ADMIN_PATCH, 200, { team: T9({ revision: 6, roster: { teamRerolls: 4, apothecary: 0 } }) });
      fireEvent(step("apothecary", -1), "click");
      await settle();
      assert.deepEqual([sent(ADMIN_PATCH)[1].body.roster.apothecary, sent(ADMIN_PATCH)[1].body.roster.treasury], [0, 95]);
      api.assertAnswered();
    });
  });
  // A race with Bribery and Corruption has its bribes; a race's own medic is its own.
  await withWindow({ phone: false }, async () => {
    admin({ teamAnswer: T9({ baseTeamSlug: "teams/goblin", roster: { players: [] } }) });
    await visit();
    assert.ok(counter("bribes"), "a goblin team bribes");
    admin({ teamAnswer: T9({ baseTeamSlug: "teams/nurgle", roster: { players: [] } }) });
    await visit();
    assert.deepEqual([Boolean(counter("plagueDoctor")), Boolean(counter("apothecary")), Boolean(counter("bribes"))], [true, false, false]);
  });
});

// Pre-flight L18: a step moves the count alone, never `purchasedStaff`, so the server's diff (`classifyTreasuryChange`, which
// it journals on every write of the roster) finds neither a purchase nor a refund — and no remainder, the treasury as it was.
test("a staff step writes no ledger line", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      // A team stored before purchases were recorded: its Team Re-rolls count as bought (`normalizePurchasedStaff`).
      const legacy = { players: PLAYERS, treasury: 95, startingRerolls: 1, teamRerolls: 3, dedicatedFans: 2, cheerleaders: 2 };
      const stored = { ...T9(), roster: legacy };
      admin({ teamAnswer: stored });
      await visit();
      const race = raceTeamOf("teams/human");
      const steps = [["teamRerolls", -1], ["startingRerolls", 1], ["cheerleaders", -1], ["dedicatedFans", 1], ["apothecary", 1]];
      let current = { ...legacy, apothecary: 0 };
      for (const [index, [key, delta]] of steps.entries()) {
        current = { ...current, [key]: current[key] + delta };
        api.reply(ADMIN_PATCH, 200, { team: { ...stored, revision: 5 + index, roster: current } });
        fireEvent(step(key, delta), "click");
        await settle();
      }
      assert.equal(sent(ADMIN_PATCH).length, steps.length, "one save a step");
      let before = legacy;
      for (const { body } of sent(ADMIN_PATCH)) {
        assert.deepEqual(classifyTreasuryChange(race, before, body.roster, { admin: true }), [], JSON.stringify(body.roster.purchasedStaff));
        assert.equal(body.roster.treasury, 95);
        before = body.roster;
      }
      const last = sent(ADMIN_PATCH).at(-1).body.roster;
      assert.deepEqual([last.teamRerolls, last.startingRerolls, last.cheerleaders, last.dedicatedFans, last.apothecary], [2, 2, 1, 3, 1]);
      assert.deepEqual(last.purchasedStaff, normalizeDraft(legacy).purchasedStaff, "what was bought stays as it was");
    });
  });
});

test("a fallen player added afterwards: the race's positions, the team's matches; added once, the fallen read again", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: false }, async () => {
      admin({ fallen: [PIKE] });
      await visit();
      const add = card("fallen").querySelector("[data-admin-fallen]");
      assert.equal(add.textContent, "+ Add a fallen player afterwards");
      assert.equal(add.getAttribute("aria-haspopup"), "dialog");
      fireEvent(add, "click");
      assert.ok(sheet()?.isModal, "the sheet is open");
      assert.equal(sheet().querySelector("h2").textContent, "A fallen player, afterwards");
      const positions = rowsForTeam(raceTeamOf("teams/human")).map((row) => row.position);
      assert.deepEqual(field("admin-fallen-position").querySelectorAll("option").map((option) => option.getAttribute("value")), positions);
      assert.deepEqual(field("admin-fallen-match").querySelectorAll("option").map((option) => [option.getAttribute("value"), option.textContent]), [
        ["", "— no match —"], ["g6", "Round 6 · against Silverbrook Rangers · 2–1"], ["g4", "Friendly · against Ashgrove Wardens · 0–3"],
      ]);
      assert.equal(field("admin-fallen-date").getAttribute("type"), "date");
      assert.equal(field("admin-fallen-date").getAttribute("value"), localDay(), "today, unless said");
      assert.equal(field("admin-fallen-date").getAttribute("max"), localDay());
      // What is missing is said in the sheet, and nothing goes.
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      assert.equal(sheet().querySelector('[role="alert"]').textContent, "Enter the name");
      type("admin-fallen-name", "  Grot  ");
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      assert.equal(sheet().querySelector('[role="alert"]').textContent, "Give the cause");
      type("admin-fallen-cause", "Fell off the stands");
      type("admin-fallen-number", "100");
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      assert.equal(sheet().querySelector('[role="alert"]').textContent, "A number is from 1 to 99");
      type("admin-fallen-number", "12");
      choose("admin-fallen-date", "2999-01-01");
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      assert.equal(sheet().querySelector('[role="alert"]').textContent, "The day of death is today or earlier");
      await settle();
      assert.equal(sent(FALLEN_ADD).length, 0);
      // Whole: one POST however many presses; the fallen read again; the sheet closed, the focus back on the button.
      choose("admin-fallen-position", "Blitzer");
      choose("admin-fallen-match", "g6");
      choose("admin-fallen-date", "2026-10-12");
      const grot = died("f9", { id: "n1", rowIndex: 3, number: "12", name: "Grot" }, { cause: "Fell off the stands", pairingId: "g6", roundNumber: 6, fromMatch: true });
      api.reply(FALLEN_ADD, 201, { fallen: grot });
      api.reply(FALLEN_READ, 200, { fallen: [grot, PIKE] });
      const gate = api.hold(FALLEN_ADD);
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      await settle();
      assert.equal(sheet().querySelector("[data-admin-fallen-send]").getAttribute("aria-busy"), "true");
      gate.release();
      await settle();
      assert.equal(sent(FALLEN_ADD).length, 1);
      assert.deepEqual(sent(FALLEN_ADD)[0].body, { player: { name: "Grot", position: "Blitzer", number: 12 }, cause: "Fell off the stands", pairingId: "g6", diedAt: "2026-10-12" });
      assert.equal(sent(FALLEN_READ).length, 2, "the fallen read again");
      assert.equal(sheet(), null);
      assert.equal(document.activeElement, card("fallen").querySelector("[data-admin-fallen]"));
      assert.equal(toasts().at(-1), "Grot is among the fallen");
      assert.ok(view.querySelectorAll(".g-rtable__name").some((name) => name.textContent.includes("Grot")), "drawn among the fallen");
      assert.equal(sent(ADMIN_PATCH).length, 0, "the roster is not written");
      api.assertAnswered();
    });
  });
  // The server's refusal is said in the sheet, which stays; with no match and no number, none is sent.
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      admin({ matches: [] });
      await visit();
      fireEvent(card("fallen").querySelector("[data-admin-fallen]"), "click");
      assert.deepEqual(field("admin-fallen-match").querySelectorAll("option").map((option) => option.textContent), ["— no match —"]);
      type("admin-fallen-name", "Grot");
      type("admin-fallen-cause", "Old wounds");
      api.reply(FALLEN_ADD, 400, { error: { code: "FIELD_INVALID", field: "name" } });
      fireEvent(sheet().querySelector("[data-admin-fallen-send]"), "click");
      await settle();
      const [body] = sent(FALLEN_ADD).map((call) => call.body);
      assert.deepEqual(body, { player: { name: "Grot", position: rowsForTeam(raceTeamOf("teams/human"))[0].position }, cause: "Old wounds", pairingId: null, diedAt: localDay() });
      assert.ok(sheet()?.isModal, "the sheet stays");
      assert.ok(sheet().querySelector('[role="alert"]').textContent.length > 0, "the server's words");
      assert.equal(field("admin-fallen-name").value, "Grot");
    });
  });
});

test("a team in a match says the post-match will start over", async () => {
  await withWindow({ phone: false }, async () => {
    admin({ inMatch: true });
    await visit();
    assert.ok(words(block()).includes("The team is playing a match: an admin's fix makes its post-match start over — the coaches will have to «Start over with the current roster»."));
    // The repair path: the admin's steps still go during a match.
    assert.equal(step("cheerleaders", 1).hasAttribute("aria-disabled"), false);
  });
});

test("the 2.x editor is gone", () => {
  for (const file of ["src/screens/saved-roster.mjs", "src/components/roster-editor", "src/components/roster-editor-shared.mjs", "src/components/roster-notices.mjs"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
  const app = text("src/app.js");
  assert.ok(app.split("\n").length <= 120, "src/app.js stays within its budget");
  assert.doesNotMatch(app, /rosterStore|saved-roster|beforeunload/, "3.0 asks before unload with its own guard (save.mjs)");
  const files = readdirSync(new URL("../src", import.meta.url), { recursive: true }).filter((file) => /\.(mjs|js)$/.test(file));
  for (const file of files) assert.doesNotMatch(text(`src/${file}`), /from "[^"]*(saved-roster|roster-editor|roster-notices)[^"]*"/, `src/${file}`);
  assert.doesNotMatch(text("scripts/check-budgets.json"), /saved-roster/);
});

test("names are text; no inline style; styled; every key in both dictionaries, the staff's by ADMIN_STAFF", async () => {
  await withWindow({ phone: false }, async () => {
    admin({ owner: { ...OWNER, login: HOSTILE }, matches: [{ ...MATCHES[0], opponent: HOSTILE }] });
    await visit();
    assert.ok(words(block()).includes(`You are editing ${HOSTILE}'s team`));
    fireEvent(card("fallen").querySelector("[data-admin-fallen]"), "click");
    assert.equal(field("admin-fallen-match").querySelectorAll("option")[1].textContent, `Round 6 · against ${HOSTILE} · 2–1`);
    assert.equal(view.querySelector("img"), null);
    assertCspSafe(view);
    assertStyled(view, ...ADMIN_STYLES);
  });
  assertDictionaryCovers("src/screens/team/roster/admin-block.mjs", "src/screens/admin/team-sheets.mjs", "src/screens/team/roster/screen.mjs");
  const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
  for (const locale of ["en", "ru"]) {
    for (const key of ADMIN_STAFF) assert.ok(dictionary(locale)[`adminTeam.staff.${key}`], `${locale} adminTeam.staff.${key}`);
  }
});

test("the block keeps the prototype's measures: 48px fields and button, 40px on a desk and 44px on a phone; readable; nothing cut", () => {
  const px = (value) => Number.parseFloat(value);
  assert.doesNotMatch(text(CSS), /ellipsis|nowrap|@media \((?!max-width: 900px|min-width: 901px)/);
  assert.deepEqual(valuesOf(CSS, ".g-adminteam__treasury .g-btn--primary", "height"), ["48px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-adminteam__btn", "min-height"), ["40px"]);
  assert.ok(px(inMedia(CSS, "max-width: 900px", ".g-adminteam__btn", "min-height")[0]) >= 44);
  assert.deepEqual(valuesOf(CSS, ".g-adminteam__banner", "padding"), ["14px 16px"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminteam__banner", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminteam__banner", "background"), ["var(--warn-tint)"]);
  assertReadable(CSS, ".g-adminteam__banner", "color", ["--warn-tint"], 4.5);
  assertReadable(CSS, ".g-adminteam__match", "color", ["--warn-tint"], 4.5);
  assertReadable(CSS, ".g-adminteam__back", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminteam__refusal", "color", ["--surface"], 4.5);
  for (const selector of [".g-adminteam__bannertext", ".g-adminteam__match"]) assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
});

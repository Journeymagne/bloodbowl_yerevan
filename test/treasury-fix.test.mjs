import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { fileURLToPath } from "node:url";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { assertReadable } from "./helpers/contrast.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { sumMoney } = await import("../src/domain/money.mjs");
const { classifyTreasuryChange } = await import("../src/domain/roster/ledger.mjs");
const { ensureDraftPlayers } = await import("../src/domain/roster/players.mjs");
const { normalizeDraft } = await import("../src/domain/roster/schema.mjs");
const { checkRoster, loadTeamReference, teamBySlug } = await import("../server/domain/roster.mjs");
const { FIX_SHEET_ID, fixSheetMarkup, wireFixSheet } = await import("../src/screens/team/manage/fix-sheet.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(read(`src/i18n/${locale}.json`)));
const CASES = JSON.parse(read("test/fixtures/roster-cases.json"));
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CSS = "src/screens/team/manage/manage.css";
const TOKEN = "gata-league-auth-token";
const PATCH = "PATCH /api/teams/t1";
const FIRST_PAGE = "GET /api/teams/t1/ledger?limit=20";
const HOST = '[data-sheet-host="treasury-fix"]';
const TEAM = {
  id: "t1", name: "Wardens", baseTeamSlug: "teams/human", logoData: null, revision: 3, stage: "active",
  roster: { treasury: 70, coachesSafe: 20, startingRerolls: 2, teamRerolls: 1, assistantCoaches: 1, players: [] },
};
const LIVE = { id: "g1", home: { team: { id: "t1" } }, away: { team: { id: "r1" } }, preparationStatus: "in_progress", postMatchStatus: "draft" };
const ELSEWHERE = { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" } };
const VIOLATION = { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "TREASURY_INVALID", params: {} }] };
const ENTRY = { id: "l9", kind: "manual", delta: 15.5, balanceAfter: 85.5, reason: null, note: null, pairingId: null, createdAt: "2026-10-18T12:00:00Z" };

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const toasts = () => document.querySelectorAll("output").map((node) => ({ text: node.textContent, tone: node.className }));
const saved = (changes) => ({ team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, ...changes } } });

/** A coach signed in with Human `t1` (70k, a safe of 20k, revision 3) and the games given; the toasts of the test before are gone. */
function coach({ team = TEAM, games = [] } = {}) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  state.auth.currentUser = { id: "u1", login: "coach" };
  state.myTeams = { items: [structuredClone(team)], loaded: true, loading: false, error: "" };
  state.games.items = games;
}

// What a screen holds while it is up: a container with the button that opens the sheet, wired, taken away at the end of the test.
let root = null;
let unwire = () => {};
function takeAway() {
  unwire();
  unwire = () => {};
  if (root?.parentNode) root.parentNode.removeChild(root);
  root = null;
}
afterEach(() => {
  takeAway();
  initLocale("en");
});

/** The screen's button, as stage 08's page draws it (a shut one gives its reason as the strip's does), and the wiring. */
function stand({ shut = false } = {}) {
  root = el(document, "div");
  document.body.appendChild(root);
  const closed = shut ? ` aria-disabled="true" title="${en["treasury.lockedLive"]}"` : "";
  root.innerHTML = `<button type="button" class="g-manage__fix" data-treasury-fix="t1"${closed}>${en["treasury.fix.open"]}</button>`;
  unwire = wireFixSheet(root);
  return root.querySelector("[data-treasury-fix]");
}
const $ = (selector) => document.querySelector(`${HOST} ${selector}`);
const type = (selector, value) => {
  const field = $(selector);
  Object.assign(field, { value });
  fireEvent(field, "input");
};
const click = (selector) => fireEvent($(selector), "click");
const save = () => $("[data-fix-save]");
const label = () => save().textContent.trim();
const errors = () => document.querySelectorAll(`${HOST} .g-field__error`).map((node) => node.textContent);
const opened = () => {
  const button = stand();
  fireEvent(button, "click");
  return button;
};

test("the sheet opens on the treasury and the safe as they are, and waits for a change", () => {
  coach();
  stand();
  fireEvent(root.querySelector('[data-treasury-fix="t1"]'), "click");
  assert.ok($(`dialog#${FIX_SHEET_ID}`).matches(":modal"));
  assert.equal(FIX_SHEET_ID, "treasury-fix");
  assert.equal($(".g-sheet__title").textContent, "Correct by hand");
  assert.equal($(".g-sheet__sub").textContent, "A change of the treasury goes into the history as a correction by hand");
  assert.deepEqual(document.querySelectorAll(`${HOST} .g-field__label`).map((node) => node.textContent), ["Treasury, k", "Coach's Safe, k"]);
  assert.deepEqual([$("#fix-treasury").value, $("#fix-safe").value], ["70", "20"]);
  assert.equal($("#fix-treasury").getAttribute("inputmode"), "decimal");
  assert.equal($("#fix-safe").getAttribute("inputmode"), "decimal");
  assert.equal($(".g-fix__preview").textContent, "Treasury: 70k → 70k");
  assert.equal(label(), "Nothing changed");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.deepEqual(errors(), []);
  click("[data-fix-save]");
  assert.equal(api.calls.length, 0);
});

test("a new treasury typed with a comma is previewed and saved by one PATCH; the safe goes with it", async () => {
  coach();
  const opener = stand();
  opener.focus();
  fireEvent(opener, "click");
  type("#fix-treasury", "85,5");
  assert.equal($(".g-fix__preview").textContent, "Treasury: 70k → 85.5k");
  assert.equal(label(), "Save");
  assert.equal(save().hasAttribute("disabled"), false);
  type("#fix-safe", "30");
  api.reply(PATCH, 200, saved({ treasury: 85.5, coachesSafe: 30 }));
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  const gate = api.hold(PATCH);
  await withoutTimers(async () => {
    click("[data-fix-save]");
    assert.equal(label(), "Saving…");
    assert.equal(save().hasAttribute("disabled"), false, "a focused button that is disabled drops the focus");
    assert.deepEqual([save().getAttribute("aria-busy"), save().getAttribute("aria-disabled")], ["true", "true"]);
    click("[data-fix-save]");
    gate.release();
    await settle();
  });
  const sent = api.calls.filter((call) => call.key === PATCH);
  assert.equal(sent.length, 1, "one press, one PATCH");
  assert.equal(sent[0].body.revision, 3);
  assert.equal(sent[0].body.roster.treasury, 85.5);
  assert.equal(sent[0].body.roster.coachesSafe, 30);
  assert.deepEqual([sent[0].body.name, sent[0].body.baseTeamSlug], ["Wardens", "teams/human"]);
  assert.deepEqual(
    [sent[0].body.roster.startingRerolls, sent[0].body.roster.teamRerolls, sent[0].body.roster.assistantCoaches, sent[0].body.roster.players],
    [2, 1, 1, []],
    "everything else of the roster goes as the team has it",
  );
  assert.equal($("dialog"), null);
  assert.deepEqual(toasts().map((toast) => toast.text), ["The treasury is corrected"]);
  assert.equal(document.activeElement, opener);
  assert.deepEqual([state.myTeams.items[0].roster.treasury, state.myTeams.items[0].revision], [85.5, 4]);
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read again: the server wrote the line");
});

test("the roster goes as the 2.x editor reads one: a count kept under the first builder's name is read, and every purchase is there", async () => {
  coach({ team: { ...TEAM, roster: { treasury: 70, coachesSafe: 20, rerolls: 3, teamRerolls: 2, players: [] } } });
  opened();
  const held = state.myTeams.items[0].roster;
  type("#fix-treasury", "75");
  api.reply(PATCH, 200, saved({ treasury: 75 }));
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  await withoutTimers(async () => {
    click("[data-fix-save]");
    await settle();
  });
  const [{ body }] = api.calls.filter((call) => call.key === PATCH);
  assert.equal(body.roster.startingRerolls, 3);
  assert.equal("rerolls" in body.roster, false);
  assert.deepEqual(body.roster.purchasedStaff, { teamRerolls: 2, startingRerolls: 0, bribes: 0, assistantCoaches: 0, cheerleaders: 0, apothecary: 0, mortuaryAssistant: 0, plagueDoctor: 0 });
  assert.equal("logoData" in body.roster, false, "the logo is the team's column, not part of the roster");
  assert.deepEqual(held, { treasury: 70, coachesSafe: 20, rerolls: 3, teamRerolls: 2, players: [] }, "the roster the list held is not touched");
});

test("the safe alone is a correction too, and the treasury goes as it was", async () => {
  coach();
  opened();
  type("#fix-safe", "30,5");
  assert.equal(label(), "Save");
  assert.equal($(".g-fix__preview").textContent, "Treasury: 70k → 70k");
  api.reply(PATCH, 200, saved({ coachesSafe: 30.5 }));
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  await withoutTimers(async () => {
    click("[data-fix-save]");
    await settle();
  });
  const [sent] = api.calls.filter((call) => call.key === PATCH);
  assert.deepEqual([sent.body.roster.treasury, sent.body.roster.coachesSafe], [70, 30.5]);
  assert.equal($("dialog"), null);
  assert.deepEqual(toasts().map((toast) => toast.text), ["The treasury is corrected"]);
});

test("a value typed back to what it was is no change, however it is written", () => {
  coach();
  opened();
  type("#fix-treasury", "70.0");
  type("#fix-safe", " 20,0 ");
  assert.equal(label(), "Nothing changed");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.deepEqual(errors(), []);
});

test("a value that is no amount is said at its field and nothing is sent", () => {
  coach();
  opened();
  type("#fix-treasury", "-5");
  assert.deepEqual(errors(), ["Treasury must be a nonnegative amount in whole gold pieces."]);
  assert.equal($("#fix-treasury").getAttribute("aria-invalid"), "true");
  assert.match($("#fix-treasury").getAttribute("aria-describedby"), /fix-treasury-error/);
  assert.equal($("#fix-safe").hasAttribute("aria-invalid"), false);
  assert.equal(label(), "Save");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.equal($(".g-fix__preview").textContent, "Treasury: 70k → 70k", "a treasury that is no amount is not previewed");
  click("[data-fix-save]");
  assert.equal(api.calls.length, 0);
  // Each field is judged on its own, and says which of them it is.
  type("#fix-safe", "12.34");
  assert.deepEqual(errors(), ["Treasury must be a nonnegative amount in whole gold pieces.", "Safe must contain a nonnegative amount in whole gold pieces."]);
  type("#fix-treasury", "");
  assert.equal(errors().length, 2, "an empty field is no amount");
  type("#fix-treasury", "90");
  type("#fix-safe", "1e3");
  assert.deepEqual(errors(), ["Safe must contain a nonnegative amount in whole gold pieces."]);
  assert.equal(save().hasAttribute("disabled"), true, "one field right does not make the other one so");
  type("#fix-safe", "99999999999999999999");
  assert.equal(errors().length, 1, "an amount the server cannot count in gold is no amount");
  type("#fix-safe", "25");
  assert.deepEqual(errors(), []);
  assert.equal(save().hasAttribute("disabled"), false);
  assert.equal(api.calls.length, 0);
});

test("what is typed in a field stays text, and the field keeps its focus and its caret through the redraw", () => {
  coach();
  opened();
  const field = $("#fix-treasury");
  field.focus();
  field.setSelectionRange(1, 2);
  type("#fix-treasury", HOSTILE);
  assert.equal($("#fix-treasury"), field, "the same node: a field that is replaced loses what the coach was doing in it");
  assert.equal(document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [1, 2]);
  assert.equal(document.querySelector(`${HOST} img`), null);
  assert.equal(field.getAttribute("value"), HOSTILE);
  assertCspSafe(document.querySelector(HOST));
});

test("a live match: the button that opens the sheet is shut, and pressing it says why", async () => {
  coach({ games: [LIVE] });
  const opener = stand({ shut: true });
  await withoutTimers(async () => {
    fireEvent(opener, "click");
    await settle();
  });
  assert.equal($("dialog"), null);
  const [said] = toasts();
  assert.equal(said.text, "After the match's post-match");
  assert.match(said.tone, /toast-error/);
  assert.equal(api.calls.length, 0);
});

test("a shut button that gives no reason is shut by the match, which is the one reason there is", async () => {
  coach({ games: [LIVE] });
  const opener = stand({ shut: true });
  opener.removeAttribute("title");
  await withoutTimers(async () => {
    fireEvent(opener, "click");
    await settle();
  });
  assert.equal($("dialog"), null);
  assert.equal(toasts()[0].text, "After the match's post-match");
});

test("a sheet opened on a button the page drew before the match began says so at once, and nothing is sent", () => {
  coach({ games: [LIVE] });
  opened();
  type("#fix-treasury", "85");
  assert.equal(label(), "After the match's post-match");
  assert.equal(save().hasAttribute("disabled"), true);
  click("[data-fix-save]");
  assert.equal(api.calls.length, 0);
});

test("a match that went live while the sheet was open: the button says why and nothing is sent", () => {
  coach();
  opened();
  type("#fix-treasury", "85");
  assert.equal(label(), "Save");
  state.games.items = [LIVE];
  save().focus();
  click("[data-fix-save]");
  assert.equal(api.calls.length, 0);
  assert.equal(label(), "After the match's post-match");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.equal(document.activeElement, $("#fix-treasury"), "the button that had the focus is disabled now: the focus goes to the field");
});

test("a refusal is said in the sheet, which stays open, with what was typed kept for another try", async () => {
  coach();
  opened();
  type("#fix-treasury", "85");
  api.reply(PATCH, 422, VIOLATION);
  click("[data-fix-save]");
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, `${en["error.ROSTER_BREAKS_THE_RULES"]} ${en["validation.TREASURY_INVALID"]}`);
  assert.match($('[role="alert"] .g-callout').getAttribute("class"), /g-callout--danger/);
  assert.ok($("dialog#treasury-fix").matches(":modal"));
  assert.equal($("#fix-treasury").value, "85");
  assert.equal(label(), "Save");
  assert.equal(save().hasAttribute("disabled"), false, "an ordinary refusal says nothing was written: it may be tried again");
  assert.equal(save().hasAttribute("aria-busy"), false);
  type("#fix-treasury", "80");
  api.reply(PATCH, 200, saved({ treasury: 80 }));
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  await withoutTimers(async () => {
    click("[data-fix-save]");
    await settle();
  });
  assert.equal($("dialog"), null);
  assert.equal(api.calls.filter((call) => call.key === PATCH).length, 2);
});

test("a team changed elsewhere: said, the fields are the team as it stands now, and the next correction is a new, deliberate one", async () => {
  coach();
  opened();
  type("#fix-treasury", "85");
  type("#fix-safe", "30");
  // The write may have landed and only its answer been lost, or another tab changed the team: the 409 brings it as it is.
  api.reply(PATCH, 409, { ...ELSEWHERE, team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90, coachesSafe: 25 } } });
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  save().focus();
  click("[data-fix-save]");
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.changedElsewhere"]);
  assert.ok($("dialog#treasury-fix").matches(":modal"));
  assert.deepEqual([$("#fix-treasury").value, $("#fix-safe").value], ["90", "25"], "never the typed 85 and 30 over a team that has moved on");
  assert.equal($(".g-fix__preview").textContent, "Treasury: 90k → 90k");
  assert.equal(label(), "Nothing changed");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.equal(document.activeElement, $("#fix-treasury"), "the button that had the focus is disabled now: the focus goes to the field");
  click("[data-fix-save]");
  assert.equal(api.calls.filter((call) => call.key === PATCH).length, 1, "the same press does not write again");
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read at once");
  // A new correction is typed again, and meets the revision the list holds now.
  type("#fix-treasury", "100");
  assert.equal(label(), "Save");
  api.reply(PATCH, 200, { team: { ...TEAM, revision: 5, roster: { ...TEAM.roster, treasury: 100, coachesSafe: 25 } } });
  await withoutTimers(async () => {
    click("[data-fix-save]");
    await settle();
  });
  assert.deepEqual(api.calls.filter((call) => call.key === PATCH).map((call) => call.body.revision), [3, 4]);
  assert.equal(api.calls.filter((call) => call.key === PATCH)[1].body.roster.coachesSafe, 25);
  assert.equal($("dialog"), null);
});

test("a correction whose answer never came: said, disarmed, the history and the team read to see whether it went through; the fields follow what they find", async () => {
  coach();
  opened();
  type("#fix-treasury", "85,5");
  type("#fix-safe", "30");
  api.fail(PATCH);
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  // The server wrote it and only the answer was lost.
  api.reply("GET /api/teams", 200, { teams: [{ ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 85.5, coachesSafe: 30 } }] });
  save().focus();
  click("[data-fix-save]");
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.mayHaveWritten"]);
  assert.ok($("dialog#treasury-fix").matches(":modal"));
  assert.equal(label(), "Nothing changed");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.equal(save().hasAttribute("aria-busy"), false);
  assert.equal(document.activeElement, $("#fix-treasury"));
  click("[data-fix-save]");
  assert.equal(api.calls.filter((call) => call.key === PATCH).length, 1, "no second try on the same press");
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read at once");
  await settle();
  assert.equal(api.calls.filter((call) => call.key === "GET /api/teams").length, 1);
  assert.deepEqual([$("#fix-treasury").value, $("#fix-safe").value], ["85.5", "30"], "what the server holds, not what was typed or what the list held");
  assert.equal(label(), "Nothing changed");
  assert.equal(save().hasAttribute("disabled"), true);
  assert.equal(api.calls.filter((call) => call.key === PATCH).length, 1);
});

test("a write that throws is a write whose fate is not known: said as such, disarmed, never stuck on «Saving…»", async () => {
  coach();
  opened();
  type("#fix-treasury", "85");
  // An answer with no team in it: the write is made, and what follows it throws.
  api.reply(PATCH, 200, {});
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  api.reply("GET /api/teams", 200, { teams: [structuredClone(TEAM)] });
  save().focus();
  click("[data-fix-save]");
  assert.equal(label(), "Saving…");
  await settle();
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.mayHaveWritten"]);
  assert.equal(label(), "Nothing changed");
  assert.equal(save().hasAttribute("aria-busy"), false);
  assert.equal($("#fix-treasury").value, "70");
  assert.equal(document.activeElement, $("#fix-treasury"));
  click("[data-fix-save]");
  assert.equal(api.calls.filter((call) => call.key === PATCH).length, 1);
});

test("a sheet opened again while the correction of the one before is on its way: one PATCH goes out, the press is answered", async () => {
  coach();
  const opener = opened();
  type("#fix-treasury", "85");
  api.reply(PATCH, 200, saved({ treasury: 85 }));
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  const gate = api.hold(PATCH);
  click("[data-fix-save]");
  click("[data-sheet-close]");
  fireEvent(opener, "click");
  type("#fix-treasury", "90");
  click("[data-fix-save]");
  await settle();
  assert.equal(api.calls.filter((call) => call.key === PATCH).length, 1, "the second press sends nothing while the first is on its way");
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.writing"], "and it is not met with silence");
  assert.equal(label(), "Save", "nor left on «Saving…»");
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.ok($("dialog#treasury-fix").matches(":modal"), "the first correction landing does not close the sheet opened since");
  assert.equal($(".g-fix__preview").textContent, "Treasury: 85k → 90k", "the preview is read again from the team the write brought");
  assert.deepEqual(toasts().map((toast) => toast.text), ["The treasury is corrected"], "the first correction is still said");
});

test("closing by the cross or Escape forgets what was typed, and gives the focus back to the button", () => {
  coach();
  const opener = stand();
  opener.focus();
  fireEvent(opener, "click");
  type("#fix-treasury", "85");
  type("#fix-safe", "30");
  click("[data-sheet-close]");
  assert.equal($("dialog"), null);
  assert.equal(document.activeElement, opener);
  fireEvent(opener, "click");
  assert.deepEqual([$("#fix-treasury").value, $("#fix-safe").value], ["70", "20"]);
  assert.equal(label(), "Nothing changed");
  fireEvent($("dialog"), "keydown", { key: "Escape" });
  assert.equal($("dialog"), null);
  assert.equal(document.activeElement, opener);
  assert.equal(api.calls.length, 0);
});

test("a sheet closed while its correction is on its way: the correction is still said, a refusal too, and the sheet stays closed", async () => {
  coach();
  const opener = opened();
  type("#fix-treasury", "85");
  api.reply(PATCH, 200, saved({ treasury: 85 }));
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  const gate = api.hold(PATCH);
  click("[data-fix-save]");
  click("[data-sheet-close]");
  assert.equal(document.activeElement, opener);
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal($("dialog"), null);
  assert.deepEqual(toasts().map((toast) => toast.text), ["The treasury is corrected"]);
  // And the other way: a refusal that would otherwise be lost.
  coach();
  fireEvent(opener, "click");
  type("#fix-treasury", "85");
  api.reply(PATCH, 422, VIOLATION);
  const refused = api.hold(PATCH);
  click("[data-fix-save]");
  click("[data-sheet-close]");
  await withoutTimers(async () => {
    refused.release();
    await settle();
  });
  assert.equal($("dialog"), null);
  const [shown] = toasts();
  assert.equal(shown.text, `${en["error.ROSTER_BREAKS_THE_RULES"]} ${en["validation.TREASURY_INVALID"]}`);
  assert.match(shown.tone, /toast-error/);
});

test("the wiring is the screen's: its host stands at the end of the body, and what the release returns takes it, and the sheet in it, away", async () => {
  coach();
  const opener = stand();
  const host = document.querySelector(HOST);
  assert.equal(document.body.childNodes.at(-1), host);
  fireEvent(opener, "click");
  const dialog = host.querySelector("dialog");
  assert.ok(dialog.matches(":modal"));
  type("#fix-treasury", "85");
  api.reply(PATCH, 422, VIOLATION);
  const gate = api.hold(PATCH);
  click("[data-fix-save]");
  unwire();
  assert.equal(dialog.open, false);
  assert.equal(document.querySelector(HOST), null);
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal(dialog.open, false, "nothing is drawn into a host that has gone");
  assert.match(toasts()[0].tone, /toast-error/, "a screen left while a correction is on its way still hears its refusal");
  // Wired no more: the button opens nothing.
  fireEvent(opener, "click");
  assert.equal(document.querySelector("dialog"), null);
  unwire = () => {};
});

test("only the buttons under the root open it, and a button of a team the list does not hold opens nothing but an error", async () => {
  coach();
  const opener = stand();
  opener.setAttribute("data-treasury-fix", "gone");
  await withoutTimers(async () => {
    fireEvent(opener, "click");
    await settle();
  });
  assert.equal($("dialog"), null);
  assert.equal(toasts()[0].text, en["error.TEAM_NOT_FOUND"]);
  const outside = document.body.appendChild(el(document, "button"));
  outside.setAttribute("data-treasury-fix", "t1");
  fireEvent(outside, "click");
  assert.equal($("dialog"), null);
  document.body.removeChild(outside);
});

test("the body the sheet sends is read by the server as one correction by hand: the treasury's difference as a manual line, the safe as none", async () => {
  await loadTeamReference(ROOT);
  const data = expandCollections(JSON.parse(read("public/data.en.json")));
  for (const item of CASES) {
    const race = data.teams.find((team) => team.slug === item.team);
    // The team as the server holds it: read the way it reads it (`writeSavedTeam`), every player with an id.
    const stored = normalizeDraft(item.draft);
    ensureDraftPlayers(race, stored);
    const treasury = sumMoney(stored.treasury, 7.5);
    for (const [typedTreasury, typedSafe, expected] of [
      [String(treasury), String(stored.coachesSafe), [{ kind: "manual", delta: 7.5 }]],
      [String(stored.treasury), String(sumMoney(stored.coachesSafe, 5)), []],
      [String(treasury), String(sumMoney(stored.coachesSafe, 5)), [{ kind: "manual", delta: 7.5 }]],
    ]) {
      coach({ team: { ...TEAM, baseTeamSlug: item.team, roster: structuredClone(stored) } });
      opened();
      type("#fix-treasury", typedTreasury);
      type("#fix-safe", typedSafe);
      api.reply(PATCH, 200, saved({ treasury: Number(typedTreasury) }));
      api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
      await withoutTimers(async () => {
        click("[data-fix-save]");
        await settle();
      });
      const [call] = api.calls.filter((entry) => entry.key === PATCH);
      const { roster, violations } = checkRoster(item.team, call.body.roster);
      // The fixtures are the ledger's, not the league's (a squad may be over its position limits); what matters is that the balances are no violation.
      assert.deepEqual(violations.filter(({ code }) => code === "TREASURY_INVALID" || code === "SAFE_INVALID"), [], item.team);
      assert.deepEqual(classifyTreasuryChange(teamBySlug(item.team), normalizeDraft(stored), roster), expected, `${item.team}: ${typedTreasury}/${typedSafe}`);
      assert.equal(roster.treasury, Number(typedTreasury));
      assert.equal(roster.coachesSafe, Number(typedSafe));
      // Nothing but the two balances moves: the players, the staff and the purchases come back as they went out
      // (the name and the logo are the team's own, which `saveTeamRoster` sets and the server keeps in columns).
      assert.deepEqual({ ...roster, treasury: stored.treasury, coachesSafe: stored.coachesSafe, teamName: stored.teamName }, { ...stored, logoData: roster.logoData }, item.team);
      takeAway();
    }
  }
});

test("the sheet reads in Russian, and every word of it, the fields' errors and the refusals' too, is in both dictionaries", () => {
  coach();
  initLocale("ru");
  opened();
  assert.equal($(".g-sheet__title").textContent, "Исправить вручную");
  assert.equal($(".g-sheet__sub").textContent, "Изменение казны попадёт в историю как ручная правка");
  assert.deepEqual(document.querySelectorAll(`${HOST} .g-field__label`).map((node) => node.textContent), ["Казна, k", "Coach's Safe, k"]);
  assert.equal(label(), "Ничего не изменено");
  type("#fix-treasury", "-1");
  assert.deepEqual(errors(), [ru["validation.TREASURY_INVALID"]]);
  initLocale("en");
  assertStyled(document.querySelector(HOST), CSS, "sheet.css", "text-field.css", "button.css", "callout.css");
  assertDictionaryCovers("src/screens/team/manage/fix-sheet.mjs", "src/screens/team/manage/sheet-host.mjs");
  for (const key of Object.keys(en).filter((name) => name.startsWith("treasury.fix."))) assert.ok(ru[key], `ru ${key}`);
  assert.deepEqual(Object.keys(en).filter((name) => name.startsWith("treasury.fix.")).sort(), [
    "treasury.fix.done", "treasury.fix.open", "treasury.fix.safe", "treasury.fix.sub", "treasury.fix.title", "treasury.fix.treasury", "treasury.fix.unchanged",
  ]);
  assert.equal(ru["treasury.fix.safe"], en["treasury.fix.safe"], "Coach's Safe stays English in both languages");
  assert.equal(ru["treasury.fix.open"], "Исправить казну вручную");
  assert.equal(ru["treasury.fix.done"], "Казна исправлена");
});

test("the markup alone: a refusal is in an alert, a team with no safe has 0 in it, and the sheet draws closed for patchWithModal to open", () => {
  coach();
  const markup = fixSheetMarkup({
    form: { teamId: "t1", treasuryText: null, safeText: null, pending: false, refusal: "Nope" },
    before: { treasury: 70, safe: 0 },
    locked: false,
  });
  const fragment = document.createElement("div");
  fragment.innerHTML = markup;
  assert.equal(fragment.querySelector("dialog").hasAttribute("open"), false);
  assert.equal(fragment.querySelector('[role="alert"] .g-callout__title').textContent, "Nope");
  assert.equal(fragment.querySelector("#fix-safe").value, "0");
  const quiet = document.createElement("div");
  quiet.innerHTML = fixSheetMarkup({ form: { teamId: "t1", treasuryText: "5", safeText: "0", pending: false, refusal: "" }, before: { treasury: 70, safe: 0 }, locked: false });
  assert.equal(quiet.querySelector('[role="alert"]').childNodes.length, 0, "the alert is on the page before it speaks");
  assert.equal(quiet.querySelector(".g-fix__preview").textContent, "Treasury: 70k → 5k");
});

test("the preview is readable on its ground, in every palette", () => {
  assertReadable(CSS, ".g-fix__preview", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-fix__preview > :last-child", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-fix__preview--short > :last-child", "color", ["--surface-2"], 4.5);
});

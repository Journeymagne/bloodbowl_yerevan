import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach, beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { assertReadable } from "./helpers/contrast.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { state } = await import("../src/core/state.mjs");
const { MANUAL_REASONS } = await import("../src/domain/roster/ledger.mjs");
const { mountSheetHost, unmountSheetHost } = await import("../src/screens/team/manage/sheet-host.mjs");
const sheet = await import("../src/screens/team/manage/money-sheet.mjs");

const read = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const [en, ru] = [read("en"), read("ru")];
const CSS = "src/screens/team/manage/manage.css";
const TOKEN = "gata-league-auth-token";
const POST = "POST /api/teams/t1/treasury";
const FIRST_PAGE = "GET /api/teams/t1/ledger?limit=20";
const TEAM = { id: "t1", name: "Wardens", baseTeamSlug: "teams/human", logoData: null, revision: 3, stage: "active", roster: { treasury: 70, players: [] } };
const ENTRY = { id: "l9", kind: "manual", delta: 20, balanceAfter: 90, reason: "friendly", note: null, pairingId: null, createdAt: "2026-10-18T12:00:00Z" };
const LIVE = { id: "g1", home: { team: { id: "t1" } }, away: { team: { id: "r1" } }, preparationStatus: "in_progress", postMatchStatus: "draft" };
const VIOLATION = { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "TREASURY_INVALID", params: {} }] };
const ELSEWHERE = { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" } };

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
// A host of its own for each test, taken away at its end: nothing a test leaves open or wired reaches the next.
let host = null;
let unwire = () => {};
beforeEach(() => {
  host = mountSheetHost("treasury-money");
  unwire = sheet.wireMoneySheet(host);
});
afterEach(() => {
  unwire();
  unmountSheetHost(host);
});
const $ = (selector) => host.querySelector(selector);
const type = (selector, value) => {
  const field = $(selector);
  Object.assign(field, { value });
  fireEvent(field, "input");
};
const click = (selector) => fireEvent($(selector), "click");
const apply = () => $("[data-money-apply]");
const label = () => apply().textContent.trim();
const toasts = () => document.querySelectorAll("output").map((node) => ({ text: node.textContent, tone: node.className }));

/** A coach signed in with Human `t1` (70k, revision 3) and the games given; the toasts of the test before are gone. */
function coach({ treasury = 70, games = [] } = {}) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  state.auth.currentUser = { id: "u1", login: "coach" };
  state.myTeams = { items: [{ ...structuredClone(TEAM), roster: { ...TEAM.roster, treasury } }], loaded: true, loading: false, error: "" };
  state.games.items = games;
}

/** The sheet, open on `reason` (20k, as it opens), with the entry's POST held at the gate. */
function openOn(reason, { sign = 1, opener = null } = {}) {
  sheet.openMoneySheet(host, { teamId: "t1", sign, opener });
  click(`[data-money-reason="${reason}"]`);
}

test("the sheet opens on the sign it was asked for, with 20k and no reason yet, and says what it waits for (TeamManageMoney)", () => {
  coach();
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1 });
  assert.ok($("dialog#treasury-money").matches(":modal"));
  assert.equal($(".g-sheet__title").textContent, "Add to the treasury");
  assert.equal($('[data-seg-value="in"]').getAttribute("aria-checked"), "true");
  assert.equal($('[data-money-preset="20"]').getAttribute("aria-pressed"), "true");
  assert.equal(host.querySelectorAll('[data-money-reason][aria-checked="true"]').length, 0);
  assert.equal($('[data-money-reason="friendly"]').getAttribute("tabindex"), "0", "a group nobody chose is still entered by Tab");
  assert.equal(label(), "Choose what it is for");
  assert.equal(apply().hasAttribute("disabled"), true);
});

test("a reason, then an amount typed with a comma: the preview and the button follow, and the caret stays in the field", () => {
  coach();
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1 });
  fireEvent($('[data-money-reason="friendly"]'), "click");
  const field = $("#money-amount");
  field.focus();
  // The coach is typing in the middle of the text: the redraw must leave the field, its focus and its caret as they are.
  field.setSelectionRange(1, 3);
  type("#money-amount", "42,5");
  assert.equal($("#money-amount"), field, "the same node: a field that is replaced loses what the coach was doing in it");
  assert.equal(document.activeElement, field);
  assert.deepEqual([field.selectionStart, field.selectionEnd], [1, 3]);
  assert.equal($(".g-money__preview").textContent, "Treasury: 70k → 112.5k");
  assert.equal(label(), "Add 42.5k");
  assert.equal(host.querySelectorAll('[data-money-preset][aria-pressed="true"]').length, 0);
  assert.equal($('[data-money-reason="friendly"]').getAttribute("aria-checked"), "true");
  assert.equal($('[data-money-reason="sponsor"]').getAttribute("tabindex"), "-1", "the reason chosen is the one in the tab order");
});

test("the sign turns the sheet round: its title, its button, and a debit's preview", () => {
  coach();
  openOn("fine");
  click('[data-seg-value="out"]');
  assert.equal($(".g-sheet__title").textContent, "Take from the treasury");
  assert.equal($('[data-seg-value="out"]').getAttribute("aria-checked"), "true");
  assert.equal(label(), "Take 20k");
  assert.equal($(".g-money__preview").textContent, "Treasury: 70k → 50k");
});

test("taking more than there is says by how much and sends nothing", () => {
  coach();
  sheet.openMoneySheet(host, { teamId: "t1", sign: -1 });
  fireEvent($('[data-money-reason="fine"]'), "click");
  fireEvent($('[data-money-preset="100"]'), "click");
  assert.equal(label(), "The treasury is 30k short");
  assert.equal($(".g-money__preview").textContent, "Treasury: 70k → -30k");
  assert.match($(".g-money__preview").getAttribute("class"), /g-money__preview--short/);
  fireEvent(apply(), "click");
  assert.equal(api.calls.length, 0);
});

test("what the button waits for, in the order the check puts it; an amount with a second decimal is no amount, and the hint says so", () => {
  coach();
  openOn("other");
  type("#money-amount", "");
  assert.equal(label(), "Enter an amount");
  type("#money-amount", "12.34");
  assert.equal(label(), "Enter an amount");
  assert.equal($("#money-amount").getAttribute("aria-invalid"), "true");
  assert.equal($(".g-field__help").textContent, "In thousands, with at most one decimal: 42.5");
  type("#money-amount", "100001");
  assert.equal(label(), "At most 100,000k at a time");
  type("#money-amount", "5");
  assert.equal($("#money-amount").hasAttribute("aria-invalid"), false);
  type("#money-note", "x".repeat(201));
  assert.equal(label(), "The comment is longer than 200 characters");
  type("#money-note", "x".repeat(200));
  assert.equal(label(), "Add 5k");
});

test("one press sends one entry; the sheet closes, says it, and gives the focus back", async () => {
  coach();
  const opener = document.body.appendChild(el(document, "button"));
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1, opener });
  fireEvent($('[data-money-reason="sponsor"]'), "click");
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } }, entry: ENTRY });
  const gate = api.hold("POST /api/teams/t1/treasury");
  await withoutTimers(async () => {
    fireEvent(apply(), "click");
    assert.equal(label(), "Saving…");
    assert.equal(apply().hasAttribute("disabled"), false, "a focused button that is disabled drops the focus");
    assert.deepEqual([apply().getAttribute("aria-busy"), apply().getAttribute("aria-disabled")], ["true", "true"]);
    fireEvent(apply(), "click");
    gate.release();
    await settle();
  });
  assert.equal(api.calls.filter((call) => call.key === "POST /api/teams/t1/treasury").length, 1);
  assert.deepEqual(api.calls[0].body, { delta: 20, reason: "sponsor", note: null, revision: 3 });
  assert.equal($("dialog"), null);
  assert.deepEqual(toasts().map((toast) => toast.text), ["Added 20k"]);
  assert.equal(document.activeElement, opener);
  assert.equal(state.myTeams.items[0].roster.treasury, 90);
});

test("a debit goes out negative, with its comment trimmed", async () => {
  coach();
  openOn("fine", { sign: -1 });
  type("#money-note", "  late for the draft  ");
  api.reply(POST, 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 50 } }, entry: { ...ENTRY, delta: -20 } });
  await withoutTimers(async () => {
    click("[data-money-apply]");
    await settle();
  });
  assert.deepEqual(api.calls[0].body, { delta: -20, reason: "fine", note: "late for the draft", revision: 3 });
  assert.deepEqual(toasts().map((toast) => toast.text), ["Taken 20k"]);
});

test("a refusal is said in the sheet, which stays open, and is scrolled to where the coach is looking", async () => {
  coach();
  openOn("fine");
  api.reply(POST, 422, VIOLATION);
  // A fake element has no scrolling; a sheet taller than the window does, and the button pressed is not in what scrolls.
  const scrolled = [];
  const prototype = Object.getPrototypeOf($(".g-money"));
  prototype.scrollIntoView = function scrollIntoView(options) { scrolled.push([this.getAttribute("role"), options]); };
  try {
    click("[data-money-apply]");
    await settle();
  } finally {
    delete prototype.scrollIntoView;
  }
  assert.deepEqual(scrolled, [["alert", { block: "nearest" }]]);
  assert.equal($('[role="alert"] .g-callout__title').textContent, `${en["error.ROSTER_BREAKS_THE_RULES"]} ${en["validation.TREASURY_INVALID"]}`);
  assert.ok($("dialog#treasury-money").matches(":modal"));
  assert.equal(label(), "Add 20k");
  assert.equal(apply().hasAttribute("disabled"), false, "an ordinary refusal leaves the entry as it was: it may be tried again");
});

test("a team changed elsewhere: said, the amount put back, the treasury the new one; the next entry is a new one, with the new revision", async () => {
  coach();
  openOn("friendly");
  api.reply(POST, 409, { ...ELSEWHERE, team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } } });
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  apply().focus();
  click("[data-money-apply]");
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.changedElsewhere"]);
  assert.ok($("dialog#treasury-money").matches(":modal"));
  assert.equal(label(), "Enter an amount");
  assert.equal(apply().hasAttribute("disabled"), true);
  assert.equal(document.activeElement, $("#money-amount"), "the button that had the focus is disabled now: the focus goes to the amount");
  assert.equal($("#money-amount").value, "");
  assert.equal($(".g-money__preview").textContent, "Treasury: 90k → 90k");
  click("[data-money-apply]");
  assert.equal(api.calls.filter((call) => call.key === POST).length, 1, "the same press does not charge again");
  // A new entry is a deliberate one: the amount is chosen again, and it meets the revision the list holds now.
  api.reply(POST, 201, { team: { ...TEAM, revision: 5, roster: { ...TEAM.roster, treasury: 110 } }, entry: { ...ENTRY, id: "l10" } });
  click('[data-money-preset="20"]');
  assert.equal(label(), "Add 20k");
  await withoutTimers(async () => {
    click("[data-money-apply]");
    await settle();
  });
  assert.deepEqual(api.calls.filter((call) => call.key === POST).map((call) => call.body.revision), [3, 4]);
  assert.equal($("dialog"), null);
});

test("an entry whose answer never came: said, the amount put back, and the history read to see whether it went through", async () => {
  coach();
  openOn("friendly");
  api.fail(POST);
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  apply().focus();
  click("[data-money-apply]");
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.mayHaveWritten"]);
  assert.ok($("dialog#treasury-money").matches(":modal"));
  assert.equal(label(), "Enter an amount");
  assert.equal(apply().hasAttribute("disabled"), true);
  assert.equal(document.activeElement, $("#money-amount"));
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read at once");
  click("[data-money-apply]");
  assert.equal(api.calls.filter((call) => call.key === POST).length, 1, "no second try on the same press");
});

test("a write that throws is a write whose fate is not known: said as such, disarmed, the history read, never stuck on «Saving…»", async () => {
  coach();
  openOn("friendly");
  // An answer with no team in it: the write is made, and what follows it throws.
  api.reply(POST, 201, {});
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  apply().focus();
  click("[data-money-apply]");
  assert.equal(label(), "Saving…");
  await settle();
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.mayHaveWritten"]);
  assert.ok($("dialog#treasury-money").matches(":modal"));
  assert.equal(label(), "Enter an amount");
  assert.equal(apply().hasAttribute("aria-busy"), false);
  assert.equal(document.activeElement, $("#money-amount"));
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read at once");
  click("[data-money-apply]");
  assert.equal(api.calls.filter((call) => call.key === POST).length, 1);
});

test("a sheet opened again while the entry of the one before is on its way: one entry goes out, the press is answered, and the preview is current once it lands", async () => {
  coach();
  openOn("sponsor");
  api.reply(POST, 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } }, entry: ENTRY });
  const gate = api.hold(POST);
  click("[data-money-apply]");
  click("[data-sheet-close]");
  openOn("friendly");
  click("[data-money-apply]");
  await settle();
  assert.equal(api.calls.filter((call) => call.key === POST).length, 1, "the second press sends nothing while the first is on its way");
  assert.equal($('[role="alert"] .g-callout__title').textContent, en["treasury.writing"], "and it is not met with silence");
  assert.equal(label(), "Add 20k", "nor left on «Saving…»");
  assert.equal($(".g-money__preview").textContent, "Treasury: 70k → 90k");
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.ok($("dialog#treasury-money").matches(":modal"), "the first entry landing does not close the sheet opened since");
  assert.equal($(".g-money__preview").textContent, "Treasury: 90k → 110k", "the preview is read again from the team the write brought");
  assert.deepEqual(toasts().map((toast) => toast.text), ["Added 20k"], "the first entry is still said");
  assert.equal(api.calls.filter((call) => call.key === POST).length, 1);
});

test("a match that went live while the sheet was open: the button says why and nothing is sent", () => {
  coach();
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1 });
  fireEvent($('[data-money-reason="friendly"]'), "click");
  state.games.items = [LIVE];
  apply().focus();
  fireEvent(apply(), "click");
  assert.equal(api.calls.length, 0);
  assert.equal(label(), "After the match's post-match");
  assert.equal(apply().hasAttribute("disabled"), true);
  assert.equal(document.activeElement, $("#money-amount"), "the button that had the focus is disabled now: the focus goes to the amount");
});

test("a sheet opened while a match is on says so at once", () => {
  coach({ games: [LIVE] });
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1 });
  assert.equal(label(), "After the match's post-match");
});

test("closing by the cross or Escape forgets the form: the next opening has no reason, 20k and no comment", () => {
  coach();
  const opener = document.body.appendChild(el(document, "button"));
  sheet.openMoneySheet(host, { teamId: "t1", sign: -1, opener });
  click('[data-money-reason="fine"]');
  type("#money-amount", "35");
  type("#money-note", "late");
  click("[data-sheet-close]");
  assert.equal($("dialog"), null);
  assert.equal(document.activeElement, opener);
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1 });
  assert.equal($("#money-amount").value, "20");
  assert.equal($("#money-note").value, "");
  assert.equal(host.querySelectorAll('[data-money-reason][aria-checked="true"]').length, 0);
  fireEvent($("dialog"), "keydown", { key: "Escape" });
  assert.equal($("dialog"), null);
});

test("a sheet closed while its entry is on its way: the entry is still said, and the sheet stays closed", async () => {
  coach();
  const opener = document.body.appendChild(el(document, "button"));
  openOn("sponsor", { opener });
  api.reply(POST, 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } }, entry: ENTRY });
  const gate = api.hold(POST);
  click("[data-money-apply]");
  click("[data-sheet-close]");
  assert.equal($("dialog"), null);
  assert.equal(document.activeElement, opener);
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal($("dialog"), null);
  assert.deepEqual(toasts().map((toast) => toast.text), ["Added 20k"]);
});

test("a sheet closed while its entry is on its way and then refused: the refusal is a toast, not lost", async () => {
  coach();
  openOn("fine");
  api.reply(POST, 422, VIOLATION);
  const gate = api.hold(POST);
  click("[data-money-apply]");
  click("[data-sheet-close]");
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal($("dialog"), null);
  const [shown] = toasts();
  assert.equal(shown.text, `${en["error.ROSTER_BREAKS_THE_RULES"]} ${en["validation.TREASURY_INVALID"]}`);
  assert.match(shown.tone, /toast-error/);
});

test("a host takes the sheet with it: at the end of the body, closing what is open in it, and a screen left while an entry is on its way gets a toast", async () => {
  coach();
  const own = mountSheetHost("treasury-gone");
  const unwire = sheet.wireMoneySheet(own);
  assert.equal(document.body.childNodes.at(-1), own);
  assert.equal(own.getAttribute("data-sheet-host"), "treasury-gone");
  sheet.openMoneySheet(own, { teamId: "t1", sign: 1 });
  const dialog = own.querySelector("dialog#treasury-money");
  assert.ok(dialog.matches(":modal"));
  fireEvent(own.querySelector('[data-money-reason="fine"]'), "click");
  api.reply(POST, 422, VIOLATION);
  const gate = api.hold(POST);
  fireEvent(own.querySelector("[data-money-apply]"), "click");
  unmountSheetHost(own);
  assert.equal(dialog.open, false);
  assert.equal(document.querySelector('[data-sheet-host="treasury-gone"]'), null);
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal(dialog.open, false, "nothing is drawn into a host that has gone");
  assert.match(toasts()[0].tone, /toast-error/);
  unwire();
});

test("every word of the sheet is in both dictionaries, the reasons too; a comment typed stays text", () => {
  coach();
  sheet.openMoneySheet(host, { teamId: "t1", sign: 1 });
  type("#money-note", HOSTILE);
  assert.equal(host.querySelector("img"), null);
  assert.equal($("#money-note").getAttribute("value"), HOSTILE);
  assertCspSafe(host);
  assertStyled(host, CSS, "sheet.css", "segmented-control.css", "text-field.css", "button.css", "callout.css");
  assertDictionaryCovers("src/screens/team/manage/money-sheet.mjs", "src/screens/team/manage/sheet-host.mjs");
  for (const reason of MANUAL_REASONS) assert.ok(en[`treasury.reason.${reason}`] && ru[`treasury.reason.${reason}`], reason);
  for (const key of Object.keys(en).filter((name) => name.startsWith("treasury."))) assert.ok(ru[key], `ru ${key}`);
});

test("the hint names the one decimal in both languages, and the refusal copy speaks of a change, not of an entry: a roster save shares it", () => {
  assert.match(en["treasury.money.amountHelp"], /one decimal/);
  assert.match(ru["treasury.money.amountHelp"], /42,5/);
  for (const key of ["treasury.changedElsewhere", "treasury.mayHaveWritten"]) {
    assert.doesNotMatch(en[key], /\bentry\b/, key);
    assert.match(ru[key], /изменени/, key);
  }
});

test("the chips and the preview are readable on their grounds, in every palette", () => {
  assertReadable(CSS, ".g-money__preset", "color", ["--surface"], 4.5);
  assertReadable(CSS, '.g-money__preset[aria-pressed="true"]', "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-money__label", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-money__preview", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-money__preview > :last-child", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-money__preview--short > :last-child", "color", ["--surface-2"], 4.5);
});

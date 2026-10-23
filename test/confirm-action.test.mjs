import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, blocks, inMedia, read, valuesOf } from "./helpers/contrast.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

/*
 * A question before something that cannot be taken back (`confirmAction`, stage 13 Task 9b, ruling L7): the 3.0 window
 * on renderSheet — DeskAdminReset's from 901px, 110 from the top; PlayerDeadConfirm's sheet up to 900px — with the
 * caller's words, «Cancel» in its ring and in the focus, the action primary or red. Escape, the backdrop, the cross and
 * «Cancel» answer no, and nothing is sent; the focus goes back to the button that asked.
 */

// The API is installed before anything that asks it is imported: the client takes `fetch` when it loads.
const api = installFakeApi();
// fake-dom's <dialog> opens, closes and is modal as a browser's does; with this the window is built, not the browser's prompt.
globalThis.HTMLDialogElement = class HTMLDialogElement {};
const prompted = [];
globalThis.confirm = (message) => {
  prompted.push(message);
  return false;
};

const { confirmAction } = await import("../src/ui/sheet.mjs");
const { enterCallMarkup, seasonEnterVisit } = await import("../src/screens/season/enter.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { state } = await import("../src/core/state.mjs");
const { t } = await import("../src/core/i18n.mjs");

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let turn = 0; turn < 12; turn += 1) await settle();
};
const SHEET = "src/ui/sheet.css";
const LEGACY = ["app-dialog", "app-dialog-form", "app-dialog-title", "app-dialog-message", "app-dialog-actions", "primary-button", "filter-button", "danger-action"];

const windowOf = () => document.querySelector("dialog.g-confirm");
const cancelOf = () => windowOf()?.querySelector('[data-confirm="no"]') ?? null;
const actionOf = () => windowOf()?.querySelector('[data-confirm="yes"]') ?? null;
const kindsOf = (button) => (button.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

/** A page with one button that opens the question, focused as a press leaves it. */
function opener() {
  const fragment = mount('<main><h1 tabindex="-1">Page</h1><button type="button" id="opener">Ask</button></main>');
  const button = fragment.querySelector("#opener");
  button.focus();
  return button;
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

test("the question is a 3.0 window: a modal sheet, the caller's words, «Cancel» in its ring and in the focus, the action primary", async () => {
  const button = opener();
  const answer = confirmAction({ message: `Enter ${HOSTILE} in the season?`, confirmLabel: "Enter the season" });
  const dialog = windowOf();
  assert.ok(dialog, "the window is on the page");
  assert.equal(dialog.tagName, "DIALOG");
  assert.ok(dialog.classList.contains("g-sheet"), "renderSheet's sheet");
  assert.equal(dialog.isModal, true, "shown modally: the page under it takes no press");
  assert.deepEqual(kindsOf(dialog).filter((name) => name.startsWith("g-sheet--")), [], "no `at`: 110 from the top, as DeskAdminReset");
  assert.equal(dialog.parentNode.parentNode, document.body, "it stands in a host of its own at the end of <body>, under no screen's markup");

  // The caller's words: the action names the window and its button; the message is what it asks.
  const title = dialog.querySelector(".g-sheet__title");
  assert.equal(dialog.getAttribute("aria-labelledby"), title.id);
  assert.equal(title.textContent, "Enter the season");
  const text = dialog.querySelector(".g-confirm__text");
  assert.equal(text.textContent, `Enter ${HOSTILE} in the season?`, "escaped, word for word");
  assert.equal(dialog.getAttribute("aria-describedby"), text.id, "a screen reader hears the question with the window's name");

  // «Cancel» first, in the base ring (outline), and in the focus; the action is the primary.
  const buttons = dialog.querySelectorAll(".g-sheet__foot button");
  assert.deepEqual(buttons.map((item) => item.textContent.trim()), ["Cancel", "Enter the season"]);
  assert.deepEqual(kindsOf(cancelOf()), ["g-btn"], "outline: the base look");
  assert.deepEqual(kindsOf(actionOf()), ["g-btn", "g-btn--primary"]);
  assert.ok(buttons.every((item) => item.getAttribute("type") === "button"), "nothing submits a form");
  assert.equal(document.activeElement, cancelOf(), "Enter on the window lands on the safe answer");

  // Nothing of 2.x is drawn.
  for (const node of dialog.parentNode.walk()) {
    if (node.nodeType !== 1) continue;
    for (const name of LEGACY) assert.ok(!kindsOf(node).includes(name), `.${name} is 2.x`);
  }
  assertCspSafe(dialog.parentNode);
  assertStyled(dialog.parentNode, "sheet.css", "button.css");

  fireEvent(cancelOf(), "click");
  assert.equal(await answer, false);
  assert.equal(windowOf(), null, "the window and its host are gone");
  assert.equal(document.querySelector("[data-confirm-host]"), null);
  assert.equal(document.activeElement, button, "the focus is back on the button that asked");
  assert.deepEqual(prompted, [], "the browser's own prompt is not asked where a <dialog> can be built");
});

test("an irreversible action is red; a question with no labels is «Cancel» and «Confirm»; a title given names the window", async () => {
  opener();
  const red = confirmAction({ message: "Delete the pair at table 3?", confirmLabel: t("common.delete"), destructive: true });
  assert.deepEqual(kindsOf(actionOf()), ["g-btn", "g-btn--danger"]);
  assert.equal(actionOf().textContent.trim(), "Delete");
  assert.equal(windowOf().querySelector(".g-sheet__title").textContent, "Delete");
  fireEvent(actionOf(), "click");
  assert.equal(await red, true, "the action answers yes");
  assert.equal(windowOf(), null);

  opener();
  const plain = confirmAction({ message: "A new score starts the post-match over for both teams." });
  assert.deepEqual(kindsOf(actionOf()), ["g-btn", "g-btn--primary"]);
  assert.deepEqual([cancelOf().textContent.trim(), actionOf().textContent.trim()], [t("common.cancel"), t("common.confirm")]);
  assert.equal(windowOf().querySelector(".g-sheet__title").textContent, t("common.confirm"));
  fireEvent(cancelOf(), "click");
  assert.equal(await plain, false);

  opener();
  const titled = confirmAction({ message: "m", title: "Reset", confirmLabel: "Go", cancelLabel: "Keep" });
  assert.equal(windowOf().querySelector(".g-sheet__title").textContent, "Reset");
  assert.deepEqual([cancelOf().textContent.trim(), actionOf().textContent.trim()], ["Keep", "Go"]);
  fireEvent(actionOf(), "click");
  assert.equal(await titled, true);
});

test("each question is a window of its own, and one answer is all it gives", async () => {
  opener();
  const first = confirmAction({ message: "one" });
  const firstId = windowOf().id;
  fireEvent(actionOf(), "click");
  fireEvent(actionOf() ?? document.body, "click");
  assert.equal(await first, true);
  opener();
  const second = confirmAction({ message: "two" });
  assert.notEqual(windowOf().id, firstId, "ids are not reused: the title's id and the selectors stay unique");
  const dialog = windowOf();
  fireEvent(cancelOf(), "click");
  fireEvent(dialog, "keydown", { key: "Escape" });
  dialog.close();
  assert.equal(await second, false, "what comes after the answer changes nothing");
});

test("a dialog closed some other way answers no", async () => {
  opener();
  const answer = confirmAction({ message: "m", destructive: true });
  windowOf().close();
  assert.equal(await answer, false);
  assert.equal(windowOf(), null);
});

test("without <dialog> the browser's own question is asked, with the message", async () => {
  const kept = globalThis.HTMLDialogElement;
  delete globalThis.HTMLDialogElement;
  try {
    prompted.length = 0;
    assert.equal(await confirmAction({ message: "Delete?" }), false);
    assert.deepEqual(prompted, ["Delete?"]);
    assert.equal(windowOf(), null, "no window is built");
  } finally {
    globalThis.HTMLDialogElement = kept;
  }
});

// ---------------------------------------------------------------------------
// A caller: «Enter the season» (screens/season/enter.mjs)
// ---------------------------------------------------------------------------

const TOKEN = "gata-league-auth-token";
const TEAMS = [{ id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/orc", stage: "draft", inActiveSeason: false, revision: 1, roster: { treasury: 600 } }];
const RIVAL = { id: "e-r1", withdrawnAt: null, user: { id: "u-r1", login: "rival" }, team: { id: "r1", name: "Rival Team", baseTeamSlug: "teams/dwarf" } };
const OURS = { id: "e-t4", withdrawnAt: null, user: { id: "u1", login: "coach" }, team: { id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/orc" } };
const seasonWith = (entries, mine = null) => ({
  season: { id: "s1", name: "Mock Season", status: "active", currentRound: 0, playoffPlaces: null },
  entries, historicalEntries: [], rounds: [], myEntry: mine, currentFixture: null, myTeams: [], standings: [],
});
const posts = () => api.calls.filter(({ key }) => key === "POST /api/season/commit");

/** The call «Not entered in the season» on a page of its own, wired as the overview wires it. */
function enterPage() {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false, preferences: { activeTeamId: "t4" } };
  state.myTeams = { items: TEAMS, loaded: true, loading: false, error: "" };
  state.activeTeamId = "t4";
  state.season = { data: seasonWith([RIVAL]), loaded: true, loading: false, error: "" };
  const fragment = mount(`<main><h1 tabindex="-1">Fresh Meat</h1>${enterCallMarkup({ kind: "enter", draft: true })}</main>`);
  const root = fragment.querySelector("main");
  const visit = seasonEnterVisit({ root, teamId: "t4", here: () => true, draw: () => {} });
  return { root, visit, button: () => root.querySelector("[data-season-enter]") };
}

/** A press of «Enter the season» as a pointer leaves it: the button focused, then clicked. */
async function ask(button) {
  button.focus();
  fireEvent(button, "click");
  await flush();
  assert.ok(windowOf(), "the question is up");
}

test("cancel takes the focus, Escape and the backdrop resolve false, nothing is sent", () => withoutTimers(async () => {
  const page = enterPage();
  const question = t("teamOverview.enterConfirm", { team: "Fresh Meat", season: "Mock Season" });
  const ways = [
    ["Escape", () => fireEvent(document.activeElement, "keydown", { key: "Escape" })],
    ["the backdrop", () => fireEvent(windowOf(), "click")],
    ["the cross", () => fireEvent(windowOf().querySelector("[data-sheet-close]"), "click")],
    ["«Cancel»", () => fireEvent(cancelOf(), "click")],
    ["a close request with no key (the Android back gesture)", () => fireEvent(windowOf(), "cancel", { bubbles: false })],
  ];
  for (const [way, answer] of ways) {
    await ask(page.button());
    assert.equal(document.activeElement, cancelOf(), `${way}: «Cancel» has the focus`);
    assert.equal(windowOf().querySelector(".g-confirm__text").textContent, question, "the caller's words");
    assert.equal(actionOf().textContent.trim(), t("teamOverview.enter"));
    assert.deepEqual(kindsOf(actionOf()), ["g-btn", "g-btn--primary"], "entering destroys nothing: the action is the primary");
    answer();
    await flush();
    assert.equal(windowOf(), null, `${way}: the window is gone`);
    assert.deepEqual(posts(), [], `${way}: nothing is sent`);
    assert.equal(page.visit.busy, false);
    assert.equal(document.activeElement, page.button(), `${way}: the focus is back on «Enter the season»`);
  }

  // A press that began in the window and was let go over the backdrop (a text selection dragged out) closes nothing.
  await ask(page.button());
  fireEvent(windowOf().querySelector(".g-confirm__text"), "pointerdown");
  fireEvent(windowOf(), "click");
  assert.ok(windowOf(), "still asking");
  // The action: one entry.
  api.reply("POST /api/season/commit", 201, seasonWith([RIVAL, OURS], OURS));
  api.reply("GET /api/teams", 200, { teams: [{ ...TEAMS[0], inActiveSeason: true }] });
  fireEvent(actionOf(), "click");
  await flush();
  assert.equal(windowOf(), null);
  assert.equal(posts().length, 1);
  assert.deepEqual(posts()[0].body, { teamId: "t4" });
  api.assertAnswered();
}));

// ---------------------------------------------------------------------------
// Its sizes
// ---------------------------------------------------------------------------

test("up to 900px the question is PlayerDeadConfirm's sheet: the words 15/1.5, «Cancel» and the action in halves, 48px", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-confirm__text", "font"), ["400 15px/1.5 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-confirm__text", "color"), ["var(--ink-2)"]);
  assertReadable(SHEET, ".g-confirm__text", "color", ["--surface"], 4.5);
  const own = blocks(read(SHEET)).filter((block) => block.selectors.some((selector) => selector.includes("g-confirm")));
  assert.ok(own.length > 0);
  assert.ok(own.every((block) => !/nowrap|text-overflow/.test(block.body)), "a long question or label wraps");
  const phone = (selector, property) => inMedia(SHEET, "max-width: 900px", selector, property);
  assert.deepEqual(phone(".g-confirm .g-sheet__body", "padding"), ["var(--space-10) var(--space-16) var(--space-12)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-confirm .g-sheet__body", "gap"), ["var(--space-14)"], "14 between the words and what follows, at every width");
  assert.deepEqual(phone(".g-confirm .g-sheet__foot", "display"), ["grid"]);
  assert.deepEqual(phone(".g-confirm .g-sheet__foot", "grid-template-columns"), ["minmax(0, 1fr) minmax(0, 1fr)"]);
  assert.deepEqual(phone(".g-confirm .g-sheet__foot", "gap"), ["var(--space-8)"]);
  assert.deepEqual(phone(".g-confirm .g-sheet__foot .g-btn", "width"), ["100%"]);
  assert.deepEqual(phone(".g-confirm .g-sheet__foot .g-btn", "padding"), ["0 var(--space-10)"]);
  // Both widths: 48px, 12 round, 15px bold. The colours are button.css's own: no fill or label of the primary or the
  // red button is redrawn here (teams-screen and ui-controls pin the red fill to button.css); «Cancel» in --ink.
  assert.deepEqual(valuesOf(SHEET, ".g-confirm .g-sheet__foot .g-btn", "min-height"), ["48px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-confirm .g-sheet__foot .g-btn", "height"), ["auto"]);
  assert.deepEqual(valuesOf(SHEET, ".g-confirm .g-sheet__foot .g-btn", "border-radius"), ["var(--radius-lg)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-confirm .g-sheet__foot .g-btn", "font"), ["700 15px/1.2 var(--font-body)"]);
  for (const property of ["background", "border", "border-color", "box-shadow", "color"]) {
    assert.deepEqual(valuesOf(SHEET, ".g-confirm .g-sheet__foot .g-btn", property), [], `the buttons keep button.css's ${property}`);
  }
  assert.ok(own.every((block) => block.selectors.every((selector) => !/g-btn--/.test(selector))), "no kind of button is restyled");
  assert.deepEqual(valuesOf(SHEET, '.g-confirm .g-sheet__foot .g-btn[data-confirm="no"]', "color"), ["var(--ink)"]);
  // 15px bold is no large text: «Cancel» reads 4.5:1 on the outline's --surface in every palette (the primary's and the
  // red button's labels are button.css's, tested there).
  assertReadable(SHEET, '.g-confirm .g-sheet__foot .g-btn[data-confirm="no"]', "color", ["--surface"], 4.5);
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn", "background"), ["var(--surface)"], "the outline is white in its ring");
});

test("from 901px the question is DeskAdminReset's window: 520 wide, 20 round, 110 from the top; «Cancel» and the action at the right", () => {
  const desk = (selector, property) => inMedia(SHEET, "min-width: 901px", selector, property);
  assert.deepEqual(desk("dialog.g-sheet.g-confirm", "width"), ["min(520px, calc(100% - 32px))"]);
  assert.deepEqual(desk("dialog.g-sheet.g-confirm", "border-radius"), ["20px"]);
  assert.deepEqual(desk("dialog.g-sheet.g-confirm", "margin"), [], "110 from the top is the sheet's own");
  assert.deepEqual(desk("dialog.g-sheet", "margin"), ["110px auto auto"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__head", "padding"), ["18px var(--space-20) 18px var(--space-24)"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__title", "font-size"), ["28px"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__head .g-icon-btn", "width"), ["40px"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__body", "padding"), ["var(--space-16) var(--space-24)"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__foot", "justify-content"), ["flex-end"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__foot", "gap"), ["var(--space-8)"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__foot", "padding"), ["var(--space-12) var(--space-24) var(--space-20)"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__foot .g-btn", "width"), ["auto"]);
  assert.deepEqual(desk(".g-confirm .g-sheet__foot .g-btn", "padding"), ["0 var(--space-16)"]);
});

test("the question and patchWithModal live with the sheet, and a screen's patch leaves the question alone", async () => {
  const { patchWithModal } = await import("../src/ui/sheet.mjs");
  // components/dialog.mjs is gone: the window it drew is a sheet (Task 9b), and both its exports live with the sheet (Task 23).
  assert.equal(existsSync(new URL("../src/components/dialog.mjs", import.meta.url)), false);
  // A page that is only a button: the window is the only dialog, and patchWithModal on the page does not touch it.
  const page = el(document, "section", {});
  document.body.appendChild(page);
  const answer = confirmAction({ message: "m" });
  patchWithModal(page, "<p>x</p>");
  assert.ok(windowOf()?.isModal, "the window is under no screen's root");
  fireEvent(cancelOf(), "click");
  assert.equal(await answer, false);
});

test("a change of the route answers no and sends nothing: the screen that asked is gone (review of Task 9b)", () => withoutTimers(async () => {
  // The page's window, where the router hears hashchange: an EventTarget of its own here.
  const page = new EventTarget();
  const [add, remove] = [globalThis.addEventListener, globalThis.removeEventListener];
  globalThis.addEventListener = page.addEventListener.bind(page);
  globalThis.removeEventListener = page.removeEventListener.bind(page);
  try {
    const screen = enterPage();
    await ask(screen.button());
    page.dispatchEvent(new Event("hashchange"));
    await flush();
    assert.equal(windowOf(), null, "the window is gone");
    assert.deepEqual(posts(), [], "nothing is sent");
    assert.equal(screen.visit.busy, false);
    // Answered, the question hears no more routes: a later one changes nothing.
    opener();
    const answer = confirmAction({ message: "m" });
    fireEvent(actionOf(), "click");
    assert.equal(await answer, true);
    page.dispatchEvent(new Event("hashchange"));
    await flush();
    assert.equal(windowOf(), null);
  } finally {
    globalThis.addEventListener = add;
    globalThis.removeEventListener = remove;
  }
}));

test("an Enter or a Space held down presses nothing in the window: the question stays until a fresh press (review of Task 9b)", async () => {
  opener();
  const answer = confirmAction({ message: "Delete the pair?", confirmLabel: "Delete", destructive: true });
  for (const key of ["Enter", " "]) {
    const held = fireEvent(cancelOf(), "keydown", { key, repeat: true });
    assert.equal(held.defaultPrevented, true, `${JSON.stringify(key)} held: its repeat activates nothing`);
    assert.ok(windowOf(), "still asking");
  }
  const fresh = fireEvent(cancelOf(), "keydown", { key: "Enter" });
  assert.equal(fresh.defaultPrevented, false, "a fresh press is the button's");
  fireEvent(cancelOf(), "click");
  assert.equal(await answer, false);
});

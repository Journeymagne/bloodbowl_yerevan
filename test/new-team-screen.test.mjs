import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

/*
 * Node has no window events: the builder and the sheet ask the page before a reload, the sheet hears the address change;
 * the test is the page. Nor has Node's EventTarget a browser's order at the target, where the listeners added with
 * `capture` are heard before the others (DOM): the page keeps them apart, and is told of a change of address in that order.
 */
const page = new EventTarget();
const capturing = new EventTarget();
const targetOf = (options) => (options === true || options?.capture ? capturing : page);
globalThis.addEventListener = (type, listener, options) => targetOf(options).addEventListener(type, listener, options);
globalThis.removeEventListener = (type, listener, options) => targetOf(options).removeEventListener(type, listener, options);

/*
 * The router hears the address from the start (src/app.js), with no capture: on one hashchange the sheet, which listens
 * with it from its first opening on, is heard first. `routes` is what a test lets it draw: an address and the screen drawn
 * there. On a change of session the router is heard first (src/app.js listens from the start): `sessionRoute` is what it draws then.
 */
let routes = {};
page.addEventListener("hashchange", () => routes[location.hash]?.());
let sessionRoute = null;

/** The address bar: what was assigned and what was replaced, in order. A replace() changes the hash at once; the hashchange after it is the test's to send. */
function address(hash) {
  return {
    current: hash,
    assigned: [],
    replaced: [],
    get hash() { return this.current; },
    set hash(value) { this.assigned.push(value); this.current = value; },
    replace(url) { this.replaced.push(url); this.current = url; },
  };
}

/** The page hears a change of address: the sheet first (it listens with capture), then the router. */
const hashChanged = () => {
  capturing.dispatchEvent(new Event("hashchange"));
  page.dispatchEvent(new Event("hashchange"));
};
function go(hash) {
  location.hash = hash;
  hashChanged();
}

// A file read by the logo picker: the reader answers with what the "file" carries, or fails as its `failure` says.
globalThis.FileReader = class {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  readAsDataURL(file) {
    this.result = file.dataUrl;
    queueMicrotask(() => (file.failure ? this.listeners.get("error")?.(file.failure) : this.listeners.get("load")?.()));
  }
};

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = address("#/teams");
const { renderNewTeam } = await import("../src/screens/teams/new.mjs");
const { NEW_TEAM_SHEET_ID, newTeamSheetMarkup, openAskedNewTeamSheet, openNewTeamSheet } = await import("../src/screens/teams/new-sheet.mjs");
const { renderTeams } = await import("../src/screens/teams/index.mjs");
const { buildOf, endBuild, onBuildStarted } = await import("../src/screens/teams/new-flow.mjs");
const { authToken, rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { logoUploadMaxBytes } = await import("../src/core/logo-upload.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { storage } = await import("../src/core/storage.mjs");
const { view } = await import("../src/core/view.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { loadSession, onSessionChange, sessionEnded } = await import("../src/data/session.mjs");
onSessionChange(() => sessionRoute?.());
const shell = await import("../src/shell/shell.mjs");
const { builderStaffMaximums } = await import("../src/domain/league-rules.mjs");
const { rowsForTeam } = await import("../src/domain/roster/values.mjs");

const NEW_CSS = "src/screens/teams/new.css";
const read = (locale) => expandCollections(JSON.parse(readFileSync(new URL(`../public/data.${locale}.json`, import.meta.url), "utf8")));
const data = { en: read("en"), ru: read("ru") };
const raceOf = (slug) => data.en.teams.find((race) => race.slug === slug);
const rowOf = (slug, position) => rowsForTeam(raceOf(slug)).findIndex((row) => row.position === position);

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);

const host = () => document.querySelector('[data-sheet-host="new-team"]');
const sheet = () => document.querySelector(`dialog#${NEW_TEAM_SHEET_ID}`);
/** Whether the sheet is on the page (a boolean: a failed comparison of a fake element would print the whole page). */
const isOpen = () => sheet() !== null;
const field = () => document.querySelector("#new-team-name");
const create = () => document.querySelector("[data-new-team-create]");
const save = () => view.querySelector("[data-new-team-save]");
const click = (target) => fireEvent(typeof target === "string" ? document.querySelector(target) : target, "click");
const escape = () => fireEvent(sheet(), "keydown", { key: "Escape" });
const type = (selector, value) => {
  const input = document.querySelector(selector);
  input.value = value;
  fireEvent(input, "input");
};
const unload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  page.dispatchEvent(event);
  return event.defaultPrevented;
};

/** One coach per test: the build lives in the module, and a coach that is not the one it belongs to starts from nothing. */
let coaches = 0;
const signIn = (id = `coach-${coaches}`) => {
  state.auth.currentUser = { id, login: id, preferences: {} };
};

/** A coach signed in on «My teams» of a page that has read the list and the season; nothing open, nothing drawn. */
function start({ loaded = true } = {}) {
  coaches += 1;
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  routes = {};
  if (sheet()) escape();
  if (!view.isConnected) document.body.appendChild(view);
  view.innerHTML = "";
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  signIn();
  state.myTeams = { items: [], loaded, loading: false, error: "" };
  state.activeTeamId = null;
  state.data = data.en;
  state.season = { data: { season: { id: "s1", name: "Mock Season" }, standings: [] }, loaded: true, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  globalThis.location = address("#/teams");
}

/**
 * The sheet's whole step: a name, a race and «Create». Over another screen «Create» sends the coach to the builder's
 * address, which the router draws (here, the test); over the builder the builder draws itself.
 */
function pick(name, slug) {
  if (!sheet()) openNewTeamSheet(null);
  const moved = location.assigned.length;
  type("#new-team-name", name);
  click(`[data-race="${slug}"]`);
  click(create());
  if (location.assigned.length > moved) renderNewTeam();
}

/** A coach on the builder of a new team: the sheet opened over «My teams», the name and the race, «Create», and `#/teams/new` drawn. */
function open({ name = "Iron Rooks", race = "teams/human", loaded = true } = {}) {
  start({ loaded });
  pick(name, race);
}

/** Back to the sheet over the builder, and into another race's builder. */
function restartAndBuild(name, slug) {
  click("[data-new-team-restart]");
  pick(name, slug);
}

function hire(slug, position, times = 1) {
  for (let count = 0; count < times; count += 1) click(`[data-hire-key="${rowOf(slug, position)}"] [data-hire-step="1"]`);
}
const staff = (key, delta = 1) => click(`[data-resource-key="${key}"] [data-resource-step="${delta}"]`);

/** Builder.html: Iron Rooks, Human, 5 linemen, a thrower, a catcher, a blitzer, a start re-roll and a fan: 555k, 45k left. */
function fillLegal(options) {
  open(options);
  hire("teams/human", "Human Lineman", 5);
  for (const position of ["Thrower", "Catcher", "Blitzer"]) hire("teams/human", position);
  staff("startingRerolls");
  staff("dedicatedFans");
}

const count = (row = 0) => view.querySelector(`[data-hire-key="${row}"] .g-hire__count`).textContent;

/** A page under the sheet: its title and the button the sheet was opened from. */
function drawPage() {
  view.innerHTML = '<section><h1 tabindex="-1">My teams</h1><button type="button" data-opener>New team</button></section>';
  return view.querySelector("[data-opener]");
}

afterEach(async () => {
  await settle();
  await settle();
});

// ---------------------------------------------------------------------------
// The sheet (TeamNew, DeskTeamNew)
// ---------------------------------------------------------------------------

test("«New team» is a sheet over the page it is opened on (TeamNew), a window on a desk (DeskTeamNew): the title, the season's name, the name, the races as one radio group, the way to their rules, «Create» saying what is missing", () => {
  start();
  const opener = drawPage();
  opener.focus();
  openNewTeamSheet(opener);
  const dialog = sheet();
  assert.ok(dialog.matches(":modal"));
  assert.ok(host() && !view.contains(dialog), "in a host of its own on the body: the screen under it patches its own markup");
  assert.equal(view.querySelector("h1").textContent, "My teams", "the page stays under it");
  assert.deepEqual([location.hash, location.assigned, location.replaced], ["#/teams", [], []], "and so does the address");
  assert.ok(dialog.classList.contains("g-new-sheet"));
  assert.equal(dialog.getAttribute("aria-labelledby"), `${NEW_TEAM_SHEET_ID}-title`);
  assert.equal(dialog.querySelector(".g-sheet__title").textContent, "New team");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "Mock Season");
  assert.ok(document.activeElement === field(), "the name is where the keyboard starts");
  assert.deepEqual([dialog.querySelector('label[for="new-team-name"]').textContent, field().getAttribute("placeholder"), field().getAttribute("autocomplete")], ["Name", "What the team will be called", "off"]);
  const label = dialog.querySelector(".g-new__label");
  assert.deepEqual([label.textContent, label.getAttribute("aria-hidden")], ["Race", "true"], "the group is named by its aria-label: the word over it is for the eye");
  const group = dialog.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "Race");
  assert.equal(group.querySelectorAll('[role="radio"]').length, data.en.teams.length, "the races from the data");
  const rules = dialog.querySelector("a.g-new__ref");
  assert.deepEqual([rules.getAttribute("href"), rules.textContent.trim()], ["#/ref/teams", "Race rules and the starting budget are in the reference →"]);
  assert.equal(create().textContent.trim(), "Enter a name");
  assert.equal(create().hasAttribute("disabled"), true);
  assert.ok(create().closest(".g-sheet__foot").classList.contains("g-sheet__foot"));
  assert.ok(create().classList.contains("g-btn--primary"));
  assert.equal(dialog.querySelector("[data-sheet-back]") === null, true, "no way back but the cross: there is nowhere to go back to");
  assert.ok(dialog.querySelector(".g-sheet__head .g-sheet__spacer"), "the title stays in the middle of a phone's head");
  assert.equal(dialog.querySelector(".g-sheet__foot-start") === null, true);
  assert.equal(dialog.querySelector(".g-races__resets") === null, true, "no squad yet: nothing to lose");
  assertCspSafe(host());
  assertStyled(host(), NEW_CSS, "sheet.css", "text-field.css", "button.css");
  assertDictionaryCovers("src/screens/teams/new.mjs", "src/screens/teams/new-sheet.mjs");
});

test("a name of blanks or no race keeps «Create» shut, saying what is missing; typing keeps the caret", () => {
  start();
  openNewTeamSheet(null);
  const input = field();
  input.focus();
  input.value = "  Iron Rooks  ";
  input.selectionStart = 5;
  input.selectionEnd = 5;
  fireEvent(input, "input");
  assert.ok(field() === input, "the field is the same node: the sheet is patched around it");
  assert.ok(document.activeElement === input);
  assert.deepEqual([input.selectionStart, input.selectionEnd], [5, 5], "and the caret stays where it was");
  assert.equal(input.value, "  Iron Rooks  ", "the field is not rewritten under the coach's fingers");
  assert.deepEqual([create().textContent.trim(), create().hasAttribute("disabled")], ["Choose a race", true]);
  click('[data-race="teams/human"]');
  assert.deepEqual([create().textContent.trim(), create().hasAttribute("disabled")], ["Create «Iron Rooks»", false], "the name is trimmed where it is used");
  type("#new-team-name", "   ");
  assert.deepEqual([create().textContent.trim(), create().hasAttribute("disabled")], ["Enter a name", true], "a name of spaces is no name");
  let started = 0;
  const stop = onBuildStarted(() => { started += 1; });
  click(create());
  stop();
  assert.ok(isOpen(), "pressed anyway (a fake page lets a disabled button be clicked), the sheet stays");
  assert.deepEqual([started, location.assigned], [0, []], "and nothing begins");
});

test("the races are one radio group: the arrows move along it, and choosing does not redraw it away from the focus (05–13)", () => {
  start();
  openNewTeamSheet(null);
  const first = document.querySelector("[data-race]");
  first.focus();
  fireEvent(first, "keydown", { key: "ArrowRight" });
  const second = document.querySelectorAll("[data-race]")[1];
  assert.ok(document.activeElement === second);
  assert.equal(second.getAttribute("aria-checked"), "true");
  assert.equal(create().textContent.trim(), "Enter a name", "the race is held; the name is still missing");
});

test("«Create» opens the builder of that race with the name, the sheet gone and the focus on the builder's title", () => {
  start();
  const seen = [];
  const stop = onBuildStarted(() => seen.push(sheet() !== null));
  openNewTeamSheet(drawPage());
  type("#new-team-name", "Iron Rooks");
  click('[data-race="teams/human"]');
  click(create());
  assert.deepEqual(seen, [false], "the build begins with the sheet already gone: a modal dialog keeps the focus from the builder's title (L2)");
  assert.equal(isOpen(), false);
  assert.deepEqual(location.assigned, ["#/teams/new"], "over «My teams» the builder's address draws it");
  renderNewTeam();
  assert.equal(view.querySelector("h1").textContent, "Iron Rooks");
  assert.equal(view.querySelector(".g-build__sub").textContent, "Human · new team");
  assert.ok(document.activeElement === view.querySelector("h1"));
  // Over the builder the address stays, and the builder takes the focus as the build begins again.
  click("[data-new-team-restart]");
  type("#new-team-name", "Iron Rooks II");
  click(create());
  stop();
  assert.deepEqual(seen, [false, false]);
  assert.equal(isOpen(), false);
  assert.deepEqual(location.assigned, ["#/teams/new"], "no second change of address");
  assert.equal(view.querySelector("h1").textContent, "Iron Rooks II");
  assert.ok(document.activeElement === view.querySelector("h1"));
});

test("a second press on «Create» makes nothing more: one build, one change of address", () => {
  start();
  let started = 0;
  const stop = onBuildStarted(() => { started += 1; });
  openNewTeamSheet(null);
  type("#new-team-name", "Iron Rooks");
  click('[data-race="teams/human"]');
  const button = create();
  click(button);
  click(button);
  assert.equal(isOpen(), false, "the first press took the sheet away at once");
  assert.equal(started, 1);
  assert.deepEqual(location.assigned, ["#/teams/new"]);
  renderNewTeam();
  hire("teams/human", "Thrower");
  click("[data-new-team-restart]");
  const again = create();
  click(again);
  click(again);
  stop();
  assert.equal(started, 2, "over the builder too: one more build for one more press");
  assert.equal(count(rowOf("teams/human", "Thrower")), "1", "and the squad of the same race is the one it was");
  assert.deepEqual(location.assigned, ["#/teams/new"]);
});

test("«Change the race or the name» opens the sheet over the builder with what was picked; another race says the squad starts again; «Create» goes back to the builder, the same race keeping the squad", () => {
  open();
  const restart = () => view.querySelector("[data-new-team-restart]");
  assert.equal(restart().getAttribute("aria-haspopup"), "dialog");
  restart().focus();
  click(restart());
  assert.ok(sheet().matches(":modal"));
  assert.equal(view.querySelector("h1").textContent, "Iron Rooks", "the builder stays under the sheet");
  assert.equal(field().value, "Iron Rooks");
  assert.ok(document.activeElement === field());
  assert.deepEqual([field().selectionStart, field().selectionEnd], [10, 10], "the caret after the name, where a change of it goes on");
  assert.equal(document.querySelector('[data-race="teams/human"]').getAttribute("aria-checked"), "true");
  assert.equal(document.querySelector(".g-races__resets") === null, true, "nobody is hired: nothing goes");
  assert.equal(create().textContent.trim(), "Create «Iron Rooks»");
  escape();
  assert.equal(isOpen(), false);
  assert.ok(document.activeElement === restart(), "closed, the focus is back on the button that opened it");
  hire("teams/human", "Thrower");
  staff("cheerleaders");
  click(restart());
  assert.match(document.querySelector(".g-races__resets").textContent, /starts the squad again/);
  type("#new-team-name", "Iron Rooks II");
  click(create());
  assert.equal(view.querySelector("h1").textContent, "Iron Rooks II");
  assert.equal(count(rowOf("teams/human", "Thrower")), "1", "same race: the picks stay");
  click(restart());
  click('[data-race="teams/orc"]');
  assert.ok(document.querySelector(".g-races__resets"), "another race: still said, the squad is the human one");
  assert.equal(create().textContent.trim(), "Create «Iron Rooks II»");
  click(create());
  assert.equal(view.querySelector(".g-build__sub").textContent, "Orc · new team");
  assert.equal(view.querySelectorAll(".g-hire__count").map((cell) => cell.textContent).join(""), "0".repeat(view.querySelectorAll(".g-hire").length), "the squad starts again");
  assert.equal(view.querySelector('[data-resource-key="cheerleaders"] .g-resource__value').textContent, "0", "and the staff with it");
  assert.deepEqual(location.assigned, ["#/teams/new"], "the address never left the builder's");
});

test("only the staff counts as something to lose too, and the same race keeps the staff", () => {
  open();
  staff("assistantCoaches");
  click("[data-new-team-restart]");
  assert.ok(document.querySelector(".g-races__resets"));
  click(create());
  assert.equal(view.querySelector('[data-resource-key="assistantCoaches"] .g-resource__value').textContent, "1");
});

test("#/teams/new with no build is «My teams» with the sheet open over it; with a build, the builder", async () => {
  start();
  const teams = [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: false }];
  state.myTeams = { items: teams, loaded: true, loading: false, error: "" };
  api.reply("GET /api/teams", 200, { teams });
  routes = {
    "#/teams/new": () => { releaseCurrentScreen(); renderNewTeam(); },
    "#/teams": () => { releaseCurrentScreen(); renderTeams(); },
  };
  // A sheet opened and closed before: its listener is on the page now, heard before the router's (L1).
  openNewTeamSheet(null);
  click(sheet().querySelector("[data-sheet-close]"));
  go("#/teams/new");
  assert.deepEqual(location.replaced, ["#/teams"], "no build: «My teams», the address replaced (typed, reloaded, 2.x, a guest who signed in)");
  assert.equal(isOpen(), false, "nothing over the page before it is drawn");
  hashChanged();
  assert.equal(view.querySelector("h1").textContent, "My teams");
  assert.ok(sheet()?.matches(":modal"), "the sheet is open over it: the sheet heard the change before the router drew «My teams» and opened it there, and it stays");
  assert.ok(document.activeElement === field());
  escape();
  assert.ok(document.activeElement === view.querySelector("[data-new-team]"), "closed, the focus is on the page's own way to a new team");
  renderTeams();
  assert.equal(isOpen(), false, "asked once, opened once");
  // With a build the address is the builder's.
  click("[data-new-team]");
  type("#new-team-name", "Iron Rooks");
  click('[data-race="teams/human"]');
  click(create());
  assert.deepEqual(location.assigned, ["#/teams/new", "#/teams/new"], "typed, then «Create»");
  hashChanged();
  assert.equal(view.querySelector("h1").textContent, "Iron Rooks");
  assert.equal(isOpen(), false);
  go("#/teams/new");
  assert.deepEqual(location.replaced, ["#/teams"], "drawn again, the builder stays the builder");
  assert.equal(view.querySelector(".g-build__sub").textContent, "Human · new team");
  routes = {};
  await settle();
});

test("#/teams/new for a coach with no team: «My teams» is the empty overview with the sheet open over it; closed, the focus is on «Create a team»", async () => {
  start();
  api.reply("GET /api/teams", 200, { teams: [] });
  routes = {
    "#/teams/new": () => { releaseCurrentScreen(); renderNewTeam(); },
    "#/teams": () => { releaseCurrentScreen(); renderTeams(); },
  };
  go("#/teams/new");
  assert.deepEqual(location.replaced, ["#/teams"]);
  hashChanged();
  assert.equal(view.querySelector("h1").textContent, "Create your first team");
  assert.ok(sheet()?.matches(":modal"));
  escape();
  const button = view.querySelector(".g-team-empty [data-new-team]");
  assert.ok(button && document.activeElement === button, "the focus goes to the page's own way to a first team");
  routes = {};
  await settle();
});

test("a guest on #/teams/new signs in first, and comes back to «My teams» with the sheet open over it (decision 63)", async () => {
  await withoutTimers(async () => {
    const { renderRoute } = await import("../src/core/router.mjs");
    start();
    const coach = state.auth.currentUser;
    const teams = [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: false }];
    state.myTeams = { items: teams, loaded: true, loading: false, error: "" };
    api.reply("GET /api/teams", 200, { teams });
    state.auth.currentUser = null;
    globalThis.location = address("#/teams/new");
    routes = { "#/teams/new": renderRoute, "#/teams": renderRoute };
    renderRoute();
    assert.deepEqual(location.replaced, ["#/login"], "a guest signs in first, the address remembered");
    // Signed in on the sign-in screen: the session's change draws the route again (src/app.js), which goes back where it was sent from.
    state.auth.currentUser = coach;
    renderRoute();
    assert.deepEqual(location.replaced, ["#/login", "#/teams/new"]);
    hashChanged();
    assert.deepEqual(location.replaced, ["#/login", "#/teams/new", "#/teams"], "no build: «My teams»");
    assert.equal(isOpen(), false);
    hashChanged();
    assert.equal(view.querySelector("h1").textContent, "My teams");
    assert.ok(sheet()?.matches(":modal"), "with the sheet open over it");
    assert.ok(document.activeElement === field());
    escape();
    assert.ok(document.activeElement === view.querySelector("[data-new-team]"));
    routes = {};
    releaseCurrentScreen();
    await settle();
  });
});

test("the cross, the backdrop and Escape close it with the focus back where it was; a link in it, and a change of address, close it", () => {
  start();
  const ways = {
    cross: () => click(sheet().querySelector("[data-sheet-close]")),
    backdrop: () => fireEvent(sheet(), "click"),
    escape,
  };
  for (const [way, shut] of Object.entries(ways)) {
    const opener = drawPage();
    openNewTeamSheet(opener);
    shut();
    assert.equal(isOpen(), false, way);
    assert.ok(document.activeElement === opener, `${way}: the focus is back on the button`);
  }
  // What was typed is there at the next opening.
  openNewTeamSheet(drawPage());
  type("#new-team-name", "Iron Rooks");
  escape();
  openNewTeamSheet(view.querySelector("[data-opener]"));
  assert.equal(field().value, "Iron Rooks");
  // The button went with a redraw while the sheet was open: the page's title takes the focus.
  view.innerHTML = '<section><h1 tabindex="-1">My teams</h1></section>';
  escape();
  assert.ok(document.activeElement === view.querySelector("h1"));
  // A link opened elsewhere (a new tab or window, the middle button): the page stays, and so does the sheet.
  openNewTeamSheet(drawPage());
  for (const modified of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const opened = fireEvent(document.querySelector("a.g-new__ref"), "click", modified);
    assert.ok(isOpen(), `${JSON.stringify(modified)}: the link opens elsewhere, and the sheet stays`);
    assert.equal(opened.defaultPrevented, false, "and the browser opens it as it would");
  }
  // A plain click on a link in it: the sheet goes, and the link is followed.
  const event = click(document.querySelector("a.g-new__ref"));
  assert.equal(isOpen(), false);
  assert.equal(event.defaultPrevented, false);
  // A change of address takes it away; one that comes back to where it was opened (a hop the router replaced) leaves it.
  openNewTeamSheet(drawPage());
  hashChanged();
  assert.ok(isOpen(), "the address is the one it was opened on");
  go("#/season");
  assert.equal(isOpen(), false, "«Back» of the browser, or any other change of address");
});

// Final review m1: a screen the router draws while the modal sheet stands over the page cannot take the focus (it is inert).
test("a change of address closes the sheet before the router draws the screen there, which can take the focus then", () => {
  fillLegal();
  const overview = '<section><h1 tabindex="-1">Ashgrove Wardens</h1><button type="button" data-opener>Ashgrove Wardens</button></section>';
  const drawn = [];
  routes = {
    "#/t/t1": () => { releaseCurrentScreen(); view.innerHTML = overview; },
    "#/teams/new": () => { drawn.push(isOpen()); releaseCurrentScreen(); renderNewTeam(); },
  };
  go("#/t/t1");
  openNewTeamSheet(view.querySelector("[data-opener]"));
  // «Back» of the browser: the builder, which is drawn at once and gives its title the focus.
  go("#/teams/new");
  assert.deepEqual(drawn, [false], "the sheet was gone when the builder was drawn");
  assert.equal(isOpen(), false);
  assert.ok(document.activeElement === view.querySelector("h1") && view.querySelector("h1").textContent === "Iron Rooks");
  routes = {};
});

test("a change of session drawn under the sheet first: the sheet goes, and the focus it held goes to the screen's title", () => {
  start();
  openNewTeamSheet(drawPage());
  try {
    // The router draws the route again before the sheet hears of it (src/app.js); the modal sheet keeps the title from the focus.
    sessionRoute = () => { view.innerHTML = '<section><h1 tabindex="-1">Sign in</h1><a href="#/login" data-opener>Sign in</a></section>'; };
    sessionEnded();
  } finally {
    sessionRoute = null;
  }
  assert.equal(isOpen(), false);
  assert.ok(document.activeElement === view.querySelector("h1"), "not the body, nor the name field gone with the sheet");
});

test("closed by the coach, the sheet gives the focus to the title when the width has hidden what it was opened from", () => {
  start();
  const opener = drawPage();
  openNewTeamSheet(opener);
  // A phone's team block on a desk (app-header.css hides the header from 901px): still in the page, drawing no box.
  opener.getClientRects = () => [];
  escape();
  assert.ok(document.activeElement === view.querySelector("h1"));
  openNewTeamSheet(opener);
  opener.getClientRects = () => [{ width: 200, height: 44 }];
  escape();
  assert.ok(document.activeElement === opener, "shown, it takes the focus back");
});

test("a change of session closes it: a session that ends, the same coach read again; a press on a sheet whose build has gone begins nothing", async () => {
  start();
  const coach = state.auth.currentUser;
  openNewTeamSheet(null);
  type("#new-team-name", "Iron Rooks");
  sessionEnded();
  assert.equal(isOpen(), false, "the session ended: the build went with it, and so does the sheet");
  state.auth.currentUser = coach;
  openNewTeamSheet(null);
  assert.equal(field().value, "", "the same coach signed in again starts from nothing (K6a)");
  type("#new-team-name", "Rooks Again");
  // The coach signs back in: the token is the browser's again, and the session is read with it.
  api.items.set("gata-league-auth-token", "tok");
  api.reply("GET /api/auth/me", 200, { user: { id: coach.id, login: coach.login, preferences: {} } });
  api.reply("GET /api/teams", 200, { teams: [] });
  assert.equal(await loadSession(), "signed-in");
  assert.equal(isOpen(), false, "any change of session closes it, the same coach's read again included");
  openNewTeamSheet(null);
  assert.equal(field().value, "Rooks Again", "the build is still the coach's");
  click('[data-race="teams/human"]');
  // The team is made while the sheet is open (the builder's save, answered under it): a press has nothing to change.
  let started = 0;
  const stop = onBuildStarted(() => { started += 1; });
  endBuild(buildOf());
  click(create());
  stop();
  assert.equal(isOpen(), false);
  assert.deepEqual([started, location.assigned], [0, []]);
  openNewTeamSheet(null);
  assert.equal(field().value, "", "a new build for the next team");
  escape();
});

test("the switcher's way back: «‹» in a phone's head and «← My teams» in a desk's foot close it and go back", () => {
  start();
  const heard = [];
  const back = () => heard.push(sheet() !== null);
  openNewTeamSheet(null, { back });
  const dialog = sheet();
  assert.equal(dialog.querySelector(".g-sheet__head [data-sheet-back]").getAttribute("aria-label"), "Back");
  const button = dialog.querySelector(".g-sheet__foot-start [data-new-team-back]");
  assert.equal(button.textContent.trim(), "My teams");
  assert.ok(button.querySelector("svg"), "with the arrow");
  assertCspSafe(host());
  assertStyled(host(), NEW_CSS, "sheet.css", "text-field.css", "button.css");
  click(dialog.querySelector("[data-sheet-back]"));
  assert.deepEqual(heard, [false], "the sheet goes first, then the way back");
  openNewTeamSheet(null, { back });
  click("[data-new-team-back]");
  assert.deepEqual(heard, [false, false]);
  openNewTeamSheet(null);
  assert.equal(sheet().querySelector("[data-new-team-back]") === null, true, "opened from elsewhere, it has none");
  escape();
});

test("opened from the switcher, «‹» on a phone and «← My teams» on a desk go back to it; the cross gives the focus to the team block", () => {
  start();
  const block = drawPage();
  const switcher = [];
  // The shell's way back: the sheet is gone by the time the switcher opens, one modal dialog at a time.
  const back = () => switcher.push(isOpen() ? "sheet still open" : "switcher");
  openNewTeamSheet(block, { back });
  assert.ok(sheet().querySelector(".g-sheet__head [data-sheet-back]") && sheet().querySelector(".g-sheet__foot-start [data-new-team-back]"), "both ways back are drawn: new.css shows each at its width");
  type("#new-team-name", "Iron Rooks");
  click(sheet().querySelector("[data-sheet-back]"));
  assert.deepEqual(switcher, ["switcher"], "«‹» of the phone's head: the sheet goes, and the switcher takes over");
  openNewTeamSheet(block, { back });
  assert.equal(field().value, "Iron Rooks", "what was typed stays with the build: the switcher's «New team» again finds it");
  click("[data-new-team-back]");
  assert.deepEqual(switcher, ["switcher", "switcher"], "«← My teams» of the desk's foot does the same");
  assert.equal(isOpen(), false);
  // The cross, the backdrop and Escape are no way back: the coach leaves the switcher altogether, onto the block.
  const ways = {
    cross: () => click(sheet().querySelector("[data-sheet-close]")),
    backdrop: () => fireEvent(sheet(), "click"),
    escape,
  };
  for (const [way, shut] of Object.entries(ways)) {
    document.querySelector("#app-view").focus?.();
    openNewTeamSheet(block, { back });
    shut();
    assert.equal(isOpen(), false, way);
    assert.ok(document.activeElement === block, `${way}: the focus is on the team block that opened the switcher`);
  }
  assert.equal(switcher.length, 2, "and none of them went back");
  // «Create» from it is the builder, as from anywhere: the switcher is not asked for.
  openNewTeamSheet(block, { back });
  click('[data-race="teams/human"]');
  click(create());
  assert.deepEqual([isOpen(), switcher.length, location.assigned], [false, 2, ["#/teams/new"]]);
});

test("a reload while the sheet is open asks first when a squad is begun, over any screen; closed, it asks nothing (L3)", () => {
  fillLegal();
  releaseCurrentScreen();
  drawPage();
  assert.equal(unload(), false, "the builder is left");
  openNewTeamSheet(null);
  assert.ok(document.querySelector(".g-races__resets"), "the sheet keeps the squad of the same race, and says so");
  assert.equal(unload(), true, "a reload would lose it");
  escape();
  assert.equal(unload(), false, "closed, nothing asks");
  start();
  openNewTeamSheet(null);
  type("#new-team-name", "Iron Rooks");
  click('[data-race="teams/orc"]');
  assert.equal(unload(), false, "a name and a race are nothing a reload would lose");
  escape();
  // Over the builder, closing the sheet leaves the builder's own question.
  fillLegal();
  click("[data-new-team-restart]");
  assert.equal(unload(), true);
  escape();
  assert.equal(unload(), true, "the builder still asks");
});

test("a sheet opened before the season was read takes its name once it is in", async () => {
  start();
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.reply("GET /api/season", 200, { season: { id: "s2", name: "Season 2" }, standings: [] });
  openNewTeamSheet(null);
  assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Gata League", "no season read yet: the league");
  await settle();
  assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Season 2");
  assert.equal(api.calls.filter((call) => call.key === "GET /api/season").length, 1);
  escape();
});

test("a season that comes in after the sheet was closed draws nothing; one without a name is the league's", async () => {
  start();
  state.season = { data: null, loaded: false, loading: false, error: "" };
  const gate = api.hold("GET /api/season");
  openNewTeamSheet(null);
  escape();
  gate.release({ status: 200, body: { season: { id: "s2", name: "Season 2" }, standings: [] } });
  await settle();
  assert.equal(isOpen(), false);
  start();
  state.season = { data: { season: { id: "s2" }, standings: [] }, loaded: true, loading: false, error: "" };
  openNewTeamSheet(null);
  assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Gata League");
  escape();
});

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

test("saving sends one POST with the build and opens the new team's overview in place of the builder's address", async () => {
  await withoutTimers(async () => {
    fillLegal(); // Iron Rooks, Human, 555k
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    fireEvent(save(), "click");
    fireEvent(save(), "click");
    assert.equal(save().textContent.trim(), "Saving…");
    gate.release();
    await settle();
    assert.equal(api.calls.filter((call) => call.key === "POST /api/teams").length, 1, "a second press while the save is on its way sends nothing");
    assert.equal(api.calls[0].body.roster.treasury, 45);
    assert.equal(location.hash, "#/t/t9");
    assert.deepEqual([location.assigned, location.replaced], [["#/teams/new"], ["#/t/t9"]], "replaced: «Back» from the overview does not open the sheet again (L12)");
    assert.equal(state.myTeams.items[0].id, "t9");
    assert.ok(toasts().includes("Iron Rooks is created"));
  });
});

test("the button stays on while the save is on its way, and says it is busy; a keyboard keeps its place on it (R8)", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    save().focus();
    click(save());
    assert.equal(save().hasAttribute("disabled"), false, "a disabled button that holds the focus loses it");
    assert.equal(save().getAttribute("aria-busy"), "true");
    assert.ok(document.activeElement === save());
    gate.release();
    await settle();
  });
});

test("the request is the build: the name, the race, the roster with its treasury, and no logo until one is picked", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    click(save());
    await settle();
    const { body } = api.calls.find((call) => call.key === "POST /api/teams");
    assert.deepEqual([body.name, body.baseTeamSlug, body.logoData], ["Iron Rooks", "teams/human", null]);
    assert.equal(body.roster.players.length, 8);
    assert.equal(body.roster.startingRerolls, 1);
    assert.equal(body.roster.dedicatedFans, 1);
  });
});

test("a refusal is said by the button, and the build stays", async () => {
  fillLegal();
  api.reply("POST /api/teams", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [] });
  fireEvent(save(), "click");
  await settle();
  assert.ok(view.querySelector('.g-build__cta [role="alert"]'));
  assert.equal(save().hasAttribute("disabled"), false);
  assert.equal(view.querySelector('[data-hire-key="0"] .g-hire__count').textContent, "5");
});

test("a refusal that comes while the sheet is open is said in the sheet, where the coach is: no toast behind it, and once after it closes", async () => {
  await withoutTimers(async () => {
    const refused = { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [] };
    fillLegal();
    api.reply("POST /api/teams", 422, refused);
    let gate = api.hold("POST /api/teams");
    click(save());
    click("[data-new-team-restart]");
    const [input, races] = [field(), sheet().querySelector(".g-races")];
    gate.release();
    await settle();
    const alert = () => sheet()?.querySelector('[role="alert"]') ?? null;
    assert.ok(alert(), "in the sheet: the page under a modal sheet is inert, its toast and its line neither seen nor heard");
    assert.ok(field() === input && sheet().querySelector(".g-races") === races, "the alert is put in front of the name and the races, which stay the same nodes (T39 N1)");
    const said = alert().textContent.trim();
    assert.ok(said.length > 0);
    assert.deepEqual(toasts(), [], "no toast behind the backdrop");
    type("#new-team-name", "Iron Rooks II");
    assert.equal(alert()?.textContent.trim(), said, "it stays while the coach goes on in the sheet");
    escape();
    const alerts = document.querySelectorAll('[role="alert"]');
    assert.equal(alerts.length, 1, "closed, it is said once: by the button, where it stays");
    assert.ok(alerts[0].closest(".g-build__cta") && alerts[0].textContent.includes(said));
    assert.deepEqual(toasts(), []);
    click("[data-new-team-restart]");
    assert.equal(alert() === null, true, "opened again, the sheet does not say an old refusal over again");
    escape();
    // The coach has gone on to «My teams» and opened the sheet there: it says the refusal, and nothing else does.
    gate = api.hold("POST /api/teams");
    click(save());
    releaseCurrentScreen();
    drawPage();
    openNewTeamSheet(null);
    gate.release();
    await settle();
    assert.equal(alert()?.textContent.trim(), said);
    assert.deepEqual(toasts(), []);
    escape();
    assert.equal(document.querySelectorAll('[role="alert"]').length, 0, "closed, nothing says it again");
    assert.deepEqual(toasts(), []);
  });
});

// Final review m2: the coach left the builder while its save was on its way, and opened «New team» over another screen.
test("a save that goes through under the sheet showing its build: the sheet takes the next build, empty, says the team is made, and «Create» works", async () => {
  await withoutTimers(async () => {
    fillLegal(); // Iron Rooks, Human, 555k
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    releaseCurrentScreen();
    go("#/teams");
    openNewTeamSheet(drawPage());
    assert.deepEqual([field().value, Boolean(document.querySelector(".g-races__resets"))], ["Iron Rooks", true], "the build on its way");
    const input = field();
    gate.release();
    await settle();
    assert.ok(isOpen(), "the sheet stays where the coach is");
    assert.equal(sheet().querySelector('[role="status"]')?.textContent.trim(), "Iron Rooks is created", "and says it: the page under it is inert");
    assert.deepEqual(toasts(), [], "no toast behind the backdrop");
    assert.ok(field() === input && field().value === "", "the next build, empty, drawn in place");
    assert.equal(document.querySelector(".g-races__resets"), null, "with no squad to lose");
    assert.equal(location.hash, "#/teams", "the coach stays on the screen they went to");
    type("#new-team-name", "Second Rooks");
    click('[data-race="teams/human"]');
    click(create());
    assert.equal(isOpen(), false);
    assert.deepEqual([location.hash, location.assigned.at(-1)], ["#/teams/new", "#/teams/new"], "«Create» begins the next build");
    routes = { "#/teams/new": () => { releaseCurrentScreen(); renderNewTeam(); } };
    hashChanged();
    assert.deepEqual([view.querySelector("h1").textContent, count()], ["Second Rooks", "0"]);
    routes = {};
  });
});

test("after a refusal the button is given back: pressing again sends the build again", async () => {
  fillLegal();
  api.reply("POST /api/teams", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [] });
  click(save());
  await settle();
  assert.equal(save().textContent.trim(), "Save team · 555k");
  assert.equal(save().hasAttribute("aria-busy"), false);
  click(save());
  await settle();
  assert.equal(api.calls.filter((call) => call.key === "POST /api/teams").length, 2);
});

test("an answer lost on the way finds the team the server made instead of making another", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.fail("POST /api/teams");
    api.reply("GET /api/teams", 200, { teams: [{ id: "t9", name: "Iron Rooks", baseTeamSlug: "teams/human", createdAt: new Date(Date.now() + 1000).toISOString() }] });
    fireEvent(save(), "click");
    await settle();
    await settle();
    assert.equal(location.hash, "#/t/t9");
    assert.equal(api.calls.filter((call) => call.key === "POST /api/teams").length, 1);
  });
});

test("a lost answer is looked for from the moment the build began, not from the moment it was saved (T3)", async () => {
  const realNow = Date.now;
  try {
    await withoutTimers(async () => {
      Date.now = () => 1_000_000;
      fillLegal({ loaded: false });
      Date.now = () => 2_000_000;
      // The list cannot be read before the save, so only a team made since the build began can be taken for its own.
      const gate = api.hold("GET /api/teams");
      api.reply("GET /api/teams", 200, { teams: [{ id: "t9", name: "Iron Rooks", baseTeamSlug: "teams/human", createdAt: new Date(1_500_000).toISOString() }] });
      api.fail("POST /api/teams");
      click(save());
      gate.release({ status: 500, body: { error: { code: "SERVER_ERROR", params: {}, message: "x" } } });
      await settle();
      await settle();
      await settle();
      assert.equal(location.hash, "#/t/t9", "the team made while the coach was building is found");
      assert.equal(api.calls.filter((call) => call.key === "POST /api/teams").length, 1);
    });
  } finally {
    Date.now = realNow;
  }
});

test("a build that was changed back to a build of the same race in the sheet keeps the moment it began", async () => {
  const realNow = Date.now;
  try {
    await withoutTimers(async () => {
      Date.now = () => 1_000_000;
      open({ loaded: false });
      hire("teams/human", "Human Lineman", 7);
      Date.now = () => 3_000_000;
      click("[data-new-team-restart]");
      type("#new-team-name", "Iron Rooks II");
      click(create());
      Date.now = () => 4_000_000;
      const gate = api.hold("GET /api/teams");
      api.reply("GET /api/teams", 200, { teams: [{ id: "t9", name: "Iron Rooks II", baseTeamSlug: "teams/human", createdAt: new Date(2_000_000).toISOString() }] });
      api.fail("POST /api/teams");
      click(save());
      gate.release({ status: 500, body: { error: { code: "SERVER_ERROR", params: {}, message: "x" } } });
      await settle();
      await settle();
      await settle();
      assert.equal(location.hash, "#/t/t9", "the picks stayed, so did the start");
    });
  } finally {
    Date.now = realNow;
  }
});

test("a squad that cannot be saved sends nothing, whatever presses the button", async () => {
  open();
  assert.equal(save().hasAttribute("disabled"), true);
  click(save());
  hire("teams/human", "Human Lineman", 3);
  click(save());
  await settle();
  assert.equal(api.calls.length, 0, "a disabled button takes no click in a browser; the fake page sends one, and the screen asks again");
});

test("the build waits in memory while the coach looks elsewhere, and a reload asks first", () => {
  fillLegal();
  assert.equal(unload(), true);
  releaseCurrentScreen();
  assert.equal(unload(), false, "nothing asks once the builder is left");
  renderNewTeam();
  assert.equal(view.querySelector('[data-hire-key="0"] .g-hire__count').textContent, "5");
});

test("a reload asks only for a build with something in it, in the builder and in its sheet", () => {
  start();
  assert.equal(unload(), false, "before any build");
  pick("Iron Rooks", "teams/human");
  assert.equal(unload(), false, "a build with nobody and nothing bought");
  hire("teams/human", "Thrower");
  assert.equal(unload(), true, "a player");
  click(`[data-hire-key="${rowOf("teams/human", "Thrower")}"] [data-hire-step="-1"]`);
  assert.equal(unload(), false, "the player let go again");
  staff("cheerleaders");
  assert.equal(unload(), true, "staff alone");
  click("[data-new-team-restart]");
  assert.ok(document.querySelector(".g-races__resets"), "the sheet says the squad is kept");
  assert.equal(unload(), true, "in the sheet the squad is kept, so a reload would lose it");
  click(create());
  staff("cheerleaders", -1);
  click("[data-new-team-restart]");
  assert.equal(unload(), false, "the sheet again, and the draft holds nothing");
  click(create());
  staff("cheerleaders");
  click("[data-new-team-restart]");
  assert.equal(unload(), true);
  go("#/season");
  releaseCurrentScreen();
  assert.equal(unload(), false, "nothing asks once the address has moved on: the sheet goes with it, and the builder is left");
});

test("coming back to the builder twice draws it once: the first visit's listeners are gone", () => {
  open();
  renderNewTeam();
  hire("teams/human", "Thrower");
  assert.equal(count(rowOf("teams/human", "Thrower")), "1", "one click, one hire");
});

test("the page wipes the 2.x builder's draft where it opens, and starts from nothing instead of importing it (stage 06)", () => {
  start();
  storage.setJson("builder-draft", { draft: { teamName: "Old Rooks", teamSlug: "teams/human", logoData: "data:image/png;base64,AAAA" } });
  renderNewTeam();
  assert.equal(storage.get("builder-draft"), null, "the key and the logo in it are gone");
  assert.deepEqual(location.replaced, ["#/teams"]);
  assert.equal(openAskedNewTeamSheet(null), true, "«My teams» opens the sheet it was asked for");
  assert.equal(field().value, "", "nothing of the draft is offered back");
  escape();
});

test("another coach on this browser starts from nothing", () => {
  fillLegal();
  state.auth.currentUser = { id: "u2", login: "other", preferences: {} };
  releaseCurrentScreen();
  renderNewTeam();
  assert.deepEqual(location.replaced, ["#/teams"], "no build of theirs: «My teams», with the sheet");
  assert.equal(openAskedNewTeamSheet(null), true);
  assert.equal(field().value, "");
  escape();
});

test("a session that ends drops the build: the same coach signing back in starts from nothing (K6a)", () => {
  fillLegal();
  const coach = state.auth.currentUser;
  sessionEnded();
  assert.equal(state.auth.currentUser, null);
  state.auth.currentUser = coach;
  state.season = { data: { season: { id: "s1", name: "Mock Season" }, standings: [] }, loaded: true, loading: false, error: "" };
  releaseCurrentScreen();
  renderNewTeam();
  assert.deepEqual(location.replaced, ["#/teams"]);
  assert.equal(openAskedNewTeamSheet(null), true);
  assert.equal(field().value, "");
  escape();
});

test("a session that stays, or changes to the same coach's again, keeps the build", () => {
  fillLegal();
  releaseCurrentScreen();
  renderNewTeam();
  assert.equal(count(), "5");
});

test("the build's memory is one module's: buildOf, hasBuild, pickOf, setPick, startBuild — a session that ends starts from nothing", async () => {
  // Imported here, not at the top: the first test that names the module must fail alone when it is missing, not the whole file.
  const memory = await import("../src/screens/teams/new-flow.mjs");
  releaseCurrentScreen(); // the visit the test before left open hears no build begun here
  coaches += 1;
  state.data = data.en;
  signIn();
  assert.equal(memory.hasBuild(), false, "a coach with no build begun");
  const build = memory.buildOf();
  const heard = [];
  const stop = memory.onBuildStarted(() => heard.push(memory.buildOf().draft?.teamSlug));
  try { // a failure here must not leave the listener on for the tests after it
    assert.equal(build.userId, state.auth.currentUser.id);
    assert.equal(build.draft, null);
    assert.equal(Object.hasOwn(build, "step"), false, "the first step is a sheet now, not a step of the build");
    assert.equal(memory.buildOf(), build, "the same build, however often it is asked for");
    assert.ok(memory.isCurrentBuild(build));
    assert.deepEqual(memory.pickOf(), { name: "", raceSlug: "", resets: false });
    assert.equal(memory.startBuild(), false, "no name and no race, no build");
    memory.setPick({ name: "  Iron Rooks  " });
    assert.equal(memory.startBuild(), false, "a name and no race, no build");
    memory.setPick({ raceSlug: "teams/human" });
    assert.deepEqual(memory.pickOf(), { name: "  Iron Rooks  ", raceSlug: "teams/human", resets: false }, "setPick changes the fields it is given and no others");
    const realNow = Date.now;
    try {
      Date.now = () => 1_000_000;
      assert.equal(memory.startBuild(), true);
      assert.equal(memory.hasBuild(), true);
      assert.equal(build.draft.teamName, "Iron Rooks", "the name is trimmed where it is used");
      assert.equal(build.draft.teamSlug, "teams/human");
      assert.equal(build.startedAt, 1_000_000);
      assert.deepEqual(heard, ["teams/human"], "the listener is told once, with the draft already there");
      const draft = build.draft;
      build.draft.players.push({ id: "p1" });
      assert.equal(memory.pickOf().resets, true, "a squad that was begun is what going on to another race would lose");
      assert.equal(memory.holdsPicks(null), false);
      Date.now = () => 2_000_000;
      memory.setPick({ name: "Rooks Reborn" });
      assert.equal(memory.startBuild(), true);
      assert.equal(build.draft, draft, "the same race keeps the draft");
      assert.equal(build.draft.teamName, "Rooks Reborn", "and only renames it");
      assert.equal(build.startedAt, 1_000_000, "and the moment it began");
      Object.assign(build, { rosterOpen: true, choice: "league", refusal: "not this" });
      Date.now = () => 3_000_000;
      memory.setPick({ raceSlug: "teams/norse" });
      assert.equal(memory.startBuild(), true);
      assert.notEqual(build.draft, draft, "another race starts the draft again");
      assert.equal(build.draft.teamSlug, "teams/norse");
      assert.equal(build.draft.players.length, 0);
      assert.equal(build.startedAt, 3_000_000, "from a new moment");
      assert.deepEqual([build.rosterOpen, build.choice, build.refusal], [false, null, ""], "with the list shut, no sheet open and nothing refused");
    } finally {
      Date.now = realNow;
    }
    assert.equal(memory.pickOf().resets, false);
    assert.deepEqual(heard, ["teams/human", "teams/human", "teams/norse"]);
  } finally {
    stop();
  }
  assert.equal(memory.startBuild(), true);
  assert.equal(heard.length, 3, "a listener taken off hears no more");
  // While a session is read again nobody is signed in and nothing has been announced: the coach's build is still theirs.
  const coach = state.auth.currentUser;
  state.auth.currentUser = null;
  assert.equal(memory.hasBuild(), true, "asked while the session is read again, the build held is the coach's still");
  assert.ok(memory.isCurrentBuild(build), "and asking puts no empty build in its place");
  memory.setPick({ name: "Rooks Again" });
  assert.equal(memory.pickOf().name, "Rooks Again", "typing reaches the build that was held, not an empty one");
  assert.ok(memory.isCurrentBuild(build));
  assert.equal(memory.startBuild(), true);
  assert.equal(build.draft.teamName, "Rooks Again");
  state.auth.currentUser = coach;
  assert.equal(memory.buildOf(), build, "the same coach is back to the build they left");
  // A session that ends takes the build, the same coach's next one included; another coach's starts from nothing too.
  sessionEnded();
  assert.equal(memory.isCurrentBuild(build), false);
  memory.setPick({ name: "Nobody's", raceSlug: "teams/human" });
  assert.deepEqual(memory.pickOf(), { name: "", raceSlug: "", resets: false }, "with no build there is nothing to change, and nothing to show");
  assert.equal(memory.startBuild(), false, "and nothing to begin");
  state.auth.currentUser = coach;
  assert.equal(memory.hasBuild(), false, "the coach signed in again has none");
  const next = memory.buildOf();
  assert.notEqual(next, build);
  assert.equal(next.draft, null);
  assert.equal(next.name, "");
  memory.endBuild(build);
  assert.ok(memory.isCurrentBuild(next), "a build that is no longer the coach's is not the one to forget");
  state.auth.currentUser = { id: "coach-other", login: "other", preferences: {} };
  const other = memory.buildOf();
  assert.notEqual(other, next);
  assert.equal(other.userId, "coach-other");
  memory.endBuild(other);
  assert.equal(memory.isCurrentBuild(other), false, "a team that was made forgets the build");
  assert.notEqual(memory.buildOf(), other);
});

test("another tab moves the token: while the session is read again nobody is signed in, and the build the coach held stays theirs (stage 06, I1)", () => {
  fillLegal();
  click("[data-new-team-restart]");
  const coach = state.auth.currentUser;
  // `readSession` empties the user first and announces only when the answers are in.
  state.auth.currentUser = null;
  type("#new-team-name", "Rooks Reborn");
  assert.equal(field().value, "Rooks Reborn");
  assert.ok(document.querySelector(".g-races__resets"), "the sheet still says the squad is kept");
  assert.equal(unload(), true, "and a reload still asks");
  click(create());
  assert.equal(count(), "5", "«Create» goes back to the squad that was held");
  assert.equal(view.querySelector("h1").textContent, "Rooks Reborn");
  assert.equal(unload(), true);
  view.querySelector("[data-new-team-restart]").focus();
  click("[data-new-team-restart]");
  assert.equal(isOpen(), false, "nobody signed in: a sheet opened now would put an empty build in place of the coach's");
  // The builder's address drawn while nobody is signed in asks for no build either (T39 N2): the announce draws it again.
  releaseCurrentScreen();
  view.innerHTML = "";
  const moves = [location.assigned.length, location.replaced.length];
  renderNewTeam();
  assert.equal(view.querySelector("h1"), null, "it draws nothing");
  assert.deepEqual([location.assigned.length, location.replaced.length], moves, "and goes nowhere");
  state.auth.currentUser = coach;
  releaseCurrentScreen();
  renderNewTeam();
  assert.equal(count(), "5", "the same coach is back to the build they left");
  assert.deepEqual([location.assigned.length, location.replaced.length], moves, "on the builder's address");
});

test("the league and the alignment are chosen from a sheet, and the focus goes back to the button that opened it (K6b)", () => {
  open({ name: "Hobbits", race: "teams/halfling" });
  const opener = () => view.querySelector('[data-new-team-choice="league"]');
  const focused = () => document.activeElement?.getAttribute("data-new-team-choice");
  click(opener());
  assert.ok(view.querySelector("dialog#new-team-choice").matches(":modal"));
  click(view.querySelector("dialog#new-team-choice [data-sheet-close]"));
  assert.equal(view.querySelector("dialog#new-team-choice"), null);
  assert.equal(focused(), "league", "closed with the cross");
  click(opener());
  fireEvent(view.querySelector("dialog#new-team-choice"), "keydown", { key: "Escape" });
  assert.equal(view.querySelector("dialog#new-team-choice"), null);
  assert.equal(focused(), "league", "closed with Escape");
  click(opener());
  click('[data-option-value="Woodland League"]');
  assert.equal(view.querySelector("dialog#new-team-choice"), null, "a choice closes the sheet");
  assert.equal(focused(), "league", "chosen");
  assert.match(view.querySelector(".g-build__team").textContent, /Woodland League/);
  assert.equal(view.querySelector("dialog"), null);

  restartAndBuild("Chosen", "teams/chaos-chosen");
  click('[data-new-team-choice="favoured"]');
  click('[data-option-value="Khorne"]');
  assert.equal(focused(), "favoured", "the other kind of choice gives it back to its own button");
  assert.match(view.querySelector(".g-build__team").textContent, /Khorne/);
});

test("the league and the alignment chosen are what the server is sent", async () => {
  await withoutTimers(async () => {
    open({ name: "Hobbits", race: "teams/halfling" });
    click('[data-new-team-choice="league"]');
    click('[data-option-value="Woodland League"]');
    hire("teams/halfling", "Halfling Hopeful Lineman", 7);
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Hobbits" } });
    click(save());
    await settle();
    assert.equal(api.calls.find((call) => call.key === "POST /api/teams").body.roster.selectedLeague, "Woodland League");
  });
});

test("positions and staff change the build and what is left of the budget; a switch is bought once", () => {
  open();
  hire("teams/human", "Human Lineman", 2);
  assert.equal(count(0), "2");
  click('[data-hire-key="0"] [data-hire-step="-1"]');
  assert.equal(count(0), "1", "the row is a number: a string would count no player");
  assert.match(view.querySelector(".g-build__left").textContent, /550k/);
  staff("cheerleaders");
  staff("cheerleaders");
  assert.equal(view.querySelector('[data-resource-key="cheerleaders"] .g-resource__value').textContent, "2");
  staff("cheerleaders", -1);
  assert.equal(view.querySelector('[data-resource-key="cheerleaders"] .g-resource__value').textContent, "1");
  click('[data-toggle-key="apothecary"]');
  assert.equal(view.querySelector('[data-toggle-key="apothecary"]').getAttribute("aria-checked"), "true");
  assert.match(view.querySelector(".g-build__left").textContent, /\b4[0-9]{2}k/, "the price of the staff is spent");
  click('[data-toggle-key="apothecary"]');
  assert.equal(view.querySelector('[data-toggle-key="apothecary"]').getAttribute("aria-checked"), "false");
});

test("a «+» the rule refuses is said in words with the staff's name, not the code's key (T6)", async () => {
  await withoutTimers(async () => {
    open();
    for (let index = 0; index < builderStaffMaximums.cheerleaders; index += 1) staff("cheerleaders");
    const refused = view.querySelector('[data-resource-key="cheerleaders"] [data-resource-step="1"]');
    assert.equal(refused.getAttribute("aria-disabled"), "true");
    click(refused);
    assert.ok(toasts().includes(`Cheerleaders: maximum is ${builderStaffMaximums.cheerleaders}.`), toasts().join("|"));
    assert.equal(toasts().some((text) => text.includes("{title}")), false);
    hire("teams/human", "Ogre");
    click(`[data-hire-key="${rowOf("teams/human", "Ogre")}"] [data-hire-step="1"]`);
    assert.ok(toasts().includes("Ogre: maximum is 1."));
    click('[data-resource-key="bribes"] [data-resource-step="1"]');
    assert.ok(toasts().includes("Only for teams with Bribery and Corruption"), "a locked counter says why");
  });
});

test("the numbers, the names and the captain are the coach's, and reach the server", async () => {
  await withoutTimers(async () => {
    fillLegal();
    assert.equal(view.querySelector("[data-roster-toggle]").getAttribute("aria-expanded"), "false");
    click("[data-roster-toggle]");
    assert.equal(view.querySelector("[data-roster-toggle]").getAttribute("aria-expanded"), "true");
    const rows = view.querySelectorAll(".g-roster-row");
    assert.equal(rows.length, 8);
    type("[data-player-number]", "7");
    type("[data-player-name]", "Brandt");
    const second = rows[1].querySelector("[data-captain]");
    click(second);
    assert.equal(second.getAttribute("aria-checked"), "true");
    assert.equal(view.querySelector("[data-player-name]").value, "Brandt", "typing redraws nothing away");
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    click(save());
    await settle();
    const { players } = api.calls.find((call) => call.key === "POST /api/teams").body.roster;
    assert.deepEqual([players[0].number, players[0].name], ["7", "Brandt"]);
    assert.deepEqual(players.map((player) => Boolean(player.isCaptain)), [false, true, false, false, false, false, false, false]);
    assert.equal(players[1].id, second.getAttribute("data-captain"));
  });
});

test("with no logo the builder's frame draws Builder.html's picture glyph, not a shield", () => {
  open();
  const svg = view.querySelector(".g-build__logo svg.g-icon");
  assert.equal(svg.getAttribute("width"), "18");
  assert.deepEqual(svg.querySelectorAll("rect").map((rect) => ["x", "y", "width", "height", "rx"].map((name) => rect.getAttribute(name))), [["3", "5", "18", "14", "2"]]);
  assert.deepEqual(svg.querySelectorAll("path").map((path) => path.getAttribute("d")), ["M3 15l5-5 4 4 3-3 6 6"]);
});

test("a logo of up to 2 MB is shown and sent; a larger one is refused in words; taking it away gives the focus to the file field", async () => {
  await withoutTimers(async () => {
    fillLegal();
    const pickFile = (file) => fireEvent(Object.assign(view.querySelector("input#new-team-logo"), { files: [file], value: "C:\\fakepath\\logo.png" }), "change");
    pickFile({ name: "big.png", size: logoUploadMaxBytes + 1, dataUrl: "data:image/png;base64,BBBB" });
    await settle();
    assert.ok(toasts().includes("Logo must be 2 MB or smaller."));
    assert.equal(view.querySelector(".g-build__team img"), null);
    assert.equal(view.querySelector("input#new-team-logo").value, "");
    pickFile({ name: "logo.png", size: 100, dataUrl: "data:image/png;base64,AAAA" });
    await settle();
    assert.equal(view.querySelector(".g-build__team img").getAttribute("src"), "data:image/png;base64,AAAA");
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    click(save());
    await settle();
    assert.equal(api.calls.find((call) => call.key === "POST /api/teams").body.logoData, "data:image/png;base64,AAAA");
  });
});

test("a file that cannot be read, or is no picture, leaves the logo as it was and says so", async () => {
  await withoutTimers(async () => {
    fillLegal();
    const pickFile = (file) => fireEvent(Object.assign(view.querySelector("input#new-team-logo"), { files: [file], value: "C:\\fakepath\\logo" }), "change");
    const logo = () => view.querySelector(".g-build__team img")?.getAttribute("src") ?? null;
    const unreadable = "The logo could not be read: choose a PNG or JPG picture.";
    pickFile({ name: "logo.png", size: 100, dataUrl: "data:image/png;base64,AAAA" });
    await settle();
    assert.equal(logo(), "data:image/png;base64,AAAA");
    assert.deepEqual(toasts(), []);
    for (const file of [
      { name: "broken.png", size: 100, failure: new Error("the file went away") },
      { name: "paper.pdf", size: 100, dataUrl: "data:application/pdf;base64,JVBERi0=" },
      { name: "moving.gif", size: 100, dataUrl: "data:image/gif;base64,R0lGOD" },
      { name: "plain.png", size: 100, dataUrl: "" },
    ]) {
      pickFile(file);
      await settle();
      assert.equal(logo(), "data:image/png;base64,AAAA", `${file.name}: the old logo stays`);
      assert.equal(toasts().at(-1), unreadable, `${file.name}: and the coach is told`);
      assert.equal(view.querySelector("[data-new-team-logo-remove]").textContent.trim(), "Remove logo");
    }
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    click(save());
    await settle();
    assert.equal(api.calls.find((call) => call.key === "POST /api/teams").body.logoData, "data:image/png;base64,AAAA", "what is sent is a picture");
  });
});

test("a picture the builder can show is taken in each of its three kinds; a build with no logo sends none when one was refused", async () => {
  await withoutTimers(async () => {
    fillLegal();
    const pickFile = (dataUrl) => fireEvent(Object.assign(view.querySelector("input#new-team-logo"), { files: [{ name: "logo", size: 100, dataUrl }] }), "change");
    for (const kind of ["png", "jpeg", "webp"]) {
      pickFile(`data:image/${kind};base64,AAAA`);
      await settle();
      assert.equal(view.querySelector(".g-build__team img").getAttribute("src"), `data:image/${kind};base64,AAAA`);
    }
    click("[data-new-team-logo-remove]");
    pickFile("data:application/pdf;base64,JVBERi0=");
    await settle();
    assert.equal(view.querySelector(".g-build__team img"), null);
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    click(save());
    await settle();
    assert.equal(api.calls.find((call) => call.key === "POST /api/teams").body.logoData, null);
  });
});

test("taking the logo away leaves the focus on the file field: the button that held it is gone", async () => {
  fillLegal();
  fireEvent(Object.assign(view.querySelector("input#new-team-logo"), { files: [{ name: "logo.png", size: 100, dataUrl: "data:image/png;base64,AAAA" }] }), "change");
  await settle();
  const remove = view.querySelector("[data-new-team-logo-remove]");
  remove.focus();
  click(remove);
  assert.equal(view.querySelector(".g-build__team img"), null);
  assert.equal(view.querySelector("[data-new-team-logo-remove]"), null);
  assert.equal(document.activeElement.id, "new-team-logo");
});

test("a logo is put on the build it was picked for: not on the next race's, not on another coach's", async () => {
  fillLegal();
  const pickFile = () => fireEvent(Object.assign(view.querySelector("input#new-team-logo"), { files: [{ name: "logo.png", size: 100, dataUrl: "data:image/png;base64,AAAA" }] }), "change");
  pickFile();
  restartAndBuild("Gobbos", "teams/orc");
  await settle();
  assert.equal(view.querySelector(".g-build__team img"), null, "the picture was read while the coach chose another race");
  pickFile();
  state.auth.currentUser = { id: "u2", login: "other", preferences: {} };
  releaseCurrentScreen();
  renderNewTeam();
  await settle();
  assert.deepEqual(location.replaced, ["#/teams"], "the other coach has no build: «My teams», with the sheet");
  assert.equal(openAskedNewTeamSheet(null), true);
  pick("Another", "teams/orc");
  assert.equal(view.querySelector(".g-build__team img"), null);
});

test("an answer that comes after the coach left is told in a toast, and does not pull them back to the new team", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    releaseCurrentScreen();
    location.hash = "#/season";
    gate.release();
    await settle();
    assert.equal(location.hash, "#/season");
    assert.deepEqual(location.replaced, []);
    assert.ok(toasts().includes("Iron Rooks is created"));
    assert.equal(state.myTeams.items[0].id, "t9");
    assert.equal(state.activeTeamId, "t9", "a first team is the active one though the coach was elsewhere: the header names it");
    renderNewTeam();
    assert.deepEqual(location.replaced, ["#/teams"], "the team is made: the build is not kept for another");
    assert.equal(openAskedNewTeamSheet(null), true);
    assert.equal(field().value, "");
    escape();
  });
});

test("a build whose session ended while the request was out is not told of, and nobody is taken anywhere (the guard on `flow`)", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    sessionEnded();
    gate.release();
    await settle();
    assert.equal(location.hash, "#/teams/new");
    assert.deepEqual(location.replaced, []);
    assert.deepEqual(toasts(), []);
  });
});

test("another coach who took the screen while the request was out is not taken to the first coach's team, and keeps what they began", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    state.auth.currentUser = { id: "coach-b", login: "b", preferences: {} };
    releaseCurrentScreen();
    renderNewTeam();
    assert.equal(openAskedNewTeamSheet(null), true);
    type("#new-team-name", "Second Wind");
    gate.release();
    await settle();
    assert.deepEqual(location.replaced, ["#/teams"], "only the hop to «My teams»: not to the first coach's team");
    assert.deepEqual(toasts(), []);
    assert.equal(field().value, "Second Wind", "the other coach's build is theirs, not dropped with the first one's");
    escape();
    openNewTeamSheet(null);
    assert.equal(field().value, "Second Wind");
    escape();
  });
});

test("a token another tab moved while the request was out: the team is neither told of nor opened for whoever is signed in now", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    api.items.set("gata-league-auth-token", "another-coach-token");
    assert.notEqual(authToken(), "tok");
    gate.release();
    await settle();
    assert.equal(location.hash, "#/teams/new");
    assert.deepEqual(toasts(), []);
    assert.equal(state.myTeams.items[0].id, "t9", "the team is made all the same, and on the list");
  });
});

test("a token that did not move leaves the answer as it was: told, and opened", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    assert.equal(authToken(), "tok");
    gate.release();
    await settle();
    assert.equal(location.hash, "#/t/t9");
    assert.deepEqual(toasts(), ["Iron Rooks is created"]);
  });
});

test("a refusal that comes after the coach left is told in a toast, and the build is still there", async () => {
  await withoutTimers(async () => {
    fillLegal();
    api.reply("POST /api/teams", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [] });
    const gate = api.hold("POST /api/teams");
    click(save());
    releaseCurrentScreen();
    gate.release();
    await settle();
    assert.equal(toasts().length, 1);
    renderNewTeam();
    assert.equal(count(), "5");
    assert.equal(save().hasAttribute("aria-busy"), false, "the button is given back");
  });
});

test("it speaks Russian when the site does, and leaves no placeholder, no undefined and no key", async () => {
  await withoutTimers(async () => {
    initLocale("ru");
    try {
      start();
      state.data = data.ru;
      openNewTeamSheet(null, { back: () => {} });
      assert.equal(sheet().querySelector(".g-sheet__title").textContent, "Новая команда");
      assert.equal(create().textContent.trim(), "Введите название");
      type("#new-team-name", "Iron Rooks");
      assert.equal(create().textContent.trim(), "Выберите расу");
      click('[data-race="teams/human"]');
      assert.equal(create().textContent.trim(), "Создать «Iron Rooks»");
      assert.equal(sheet().querySelector('[role="radiogroup"]').getAttribute("aria-label"), "Раса");
      assert.equal(sheet().querySelector('label[for="new-team-name"]').textContent, "Название");
      assert.equal(document.querySelector("a.g-new__ref").textContent.trim(), "Правила рас и стартовый бюджет — в справочнике →");
      assert.match(document.querySelector("[data-new-team-back]").textContent, /Мои команды/);
      assert.equal(document.querySelector("[data-sheet-back]").getAttribute("aria-label"), "Назад", "the arrow is the way back, not the list's name");
      assert.equal(document.querySelector("[data-sheet-close]").getAttribute("aria-label"), "Закрыть");
      assert.doesNotMatch(sheet().textContent, /[{}]|undefined|NaN|newTeam\.|teams\./);
      click(create());
      renderNewTeam();
      hire("teams/human", "Thrower");
      click("[data-new-team-restart]");
      assert.equal(document.querySelector(".g-races__resets").textContent, "Другая раса начнёт состав заново: набранные игроки пропадут.");
      click(create());
      fillRest();
      api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
      click(save());
      await settle();
      assert.ok(toasts().includes("Команда «Iron Rooks» создана"), toasts().join("|"));
    } finally {
      initLocale("en");
    }
  });
});

/** The rest of a legal Human squad, after a thrower: 6 linemen, a catcher and a blitzer, with a start re-roll. */
function fillRest() {
  hire("teams/human", "Human Lineman", 5);
  hire("teams/human", "Catcher");
  hire("teams/human", "Blitzer");
  staff("startingRerolls");
}

// ---------------------------------------------------------------------------
// The markup and the look
// ---------------------------------------------------------------------------

/** The values a property of one selector has inside the blocks of one media query (the file's media blocks stand at its end). */
function inMedia(css, query, selector, property) {
  const declaration = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "g");
  return css.split("@media").filter((chunk) => chunk.trimStart().startsWith(`(${query})`))
    .flatMap((chunk) => [...chunk.matchAll(/([^{}]+)\{([^{}]*)\}/g)])
    .filter(([, selectors]) => selectors.split(",").map((part) => part.trim().replace(/\s+/g, " ")).includes(selector))
    .flatMap(([, , body]) => [...body.matchAll(declaration)].map(([, value]) => value.trim()));
}

test("the look: TeamNew's and DeskTeamNew's values; D2; readable; no inline widths; breakpoints only 900/901", () => {
  const css = readFileSync(new URL(`../${NEW_CSS}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /\bstyle\s*=/);
  assert.doesNotMatch(css, /\.g-new(?:__card|__head|__titles|__title|__sub|__body|__foot)?\b(?!__label|__ref|-sheet)/, "the rules of the page that was are gone");
  assert.doesNotMatch(css, /text-overflow|white-space:\s*nowrap/);
  const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  assert.ok(queries.length >= 2 && queries.every((query) => query === "(max-width: 900px)" || query === "(min-width: 901px)"), `only the stage's two breakpoints: ${queries}`);
  // The races: 44px, 10 round, 0 12 in, 14px 500 on --surface in the ring; the chosen one on --accent-tint-soft in the 2px ring, 700.
  assert.deepEqual(valuesOf(NEW_CSS, ".g-races__item", "min-height"), ["44px"]);
  assert.deepEqual(["border", "border-radius", "padding", "background", "box-shadow", "font"].map((property) => valuesOf(NEW_CSS, ".g-races__item", property)),
    [["0"], ["var(--radius-md)"], ["0 var(--space-12)"], ["var(--surface)"], ["var(--ring)"], ["500 14px/1.25 var(--font-body)"]]);
  assert.deepEqual(["background", "box-shadow", "font-weight"].map((property) => valuesOf(NEW_CSS, '.g-races__item[aria-checked="true"]', property)),
    [["var(--accent-tint-soft)"], ["var(--ring-selected)"], ["700"]]);
  assert.deepEqual([valuesOf(NEW_CSS, ".g-races", "grid-template-columns"), valuesOf(NEW_CSS, ".g-races", "gap")], [["repeat(2, minmax(0, 1fr))"], ["var(--space-6)"]]);
  assert.deepEqual(valuesOf(NEW_CSS, ".g-new__ref", "font"), ["600 13px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(NEW_CSS, ".g-new__label", "font"), ["600 13px/1.35 var(--font-body)"]);
  // The field: 48px (text-field.css), 12 round, on --surface-2 with no ring, 16px.
  assert.deepEqual([valuesOf(NEW_CSS, ".g-new-sheet .g-field__input", "background"), valuesOf(NEW_CSS, ".g-new-sheet .g-field__input", "box-shadow")], [["var(--surface-2)"], ["none"]]);
  assert.deepEqual([valuesOf("src/ui/text-field.css", ".g-field__input", "height"), valuesOf("src/ui/text-field.css", ".g-field__input", "border-radius")], [["48px"], ["var(--radius-lg)"]]);
  // A phone (TeamNew): the body 12 16, 14 apart; no foot-start (its way back is the head's «‹»); «Create» 52px, the whole width.
  const phone = (selector, property) => inMedia(css, "max-width: 900px", selector, property);
  assert.deepEqual([phone(".g-new-sheet .g-sheet__body", "gap"), phone(".g-new-sheet .g-sheet__body", "padding")], [["var(--space-14)"], ["var(--space-12) var(--space-16)"]]);
  assert.deepEqual(phone(".g-new-sheet .g-sheet__foot-start", "display"), ["none"]);
  assert.deepEqual([phone(".g-new-sheet .g-sheet__foot .g-btn--primary", "height"), phone(".g-new-sheet .g-sheet__foot .g-btn--primary", "width")], [["52px"], ["100%"]]);
  assert.deepEqual(phone(".g-new__ref", "min-height"), ["var(--size-touch)"], "D2: the link is 44px tall on a phone");
  assert.deepEqual(phone("dialog.g-sheet.g-new-sheet", "max-height"), ["90dvh"], "TeamNew's sheet takes up to 90% of the screen");
  // Both widths: the season's line 2px under the title, as both prototypes draw it.
  assert.deepEqual(["display", "flex-direction", "gap"].map((property) => valuesOf(NEW_CSS, ".g-new-sheet .g-sheet__titles", property)), [["flex"], ["column"], ["2px"]]);
  // A desk (DeskTeamNew): a window of 760px, 64px from the top, 20px round; the head 20 24, the title 28px/1 over a 14px line.
  const desk = (selector, property) => inMedia(css, "min-width: 901px", selector, property);
  assert.deepEqual(["width", "margin", "border-radius", "max-height"].map((property) => desk("dialog.g-sheet.g-new-sheet", property)),
    [["min(760px, calc(100% - 32px))"], ["64px auto auto"], ["20px"], ["min(86dvh, calc(100dvh - 96px))"]]);
  assert.deepEqual([phone(".g-new-sheet .g-sheet__titles", "gap"), desk(".g-new-sheet .g-sheet__titles", "gap")], [[], []], "one rule for both widths");
  assert.deepEqual(desk("dialog.g-sheet.g-new-sheet", "box-shadow"), ["var(--shadow-window)"], "DeskTeamNew's window stands over the page on its shadow");
  assert.deepEqual(valuesOf("src/styles/tokens.css", ":root", "--shadow-window"), ["0 12px 32px rgba(20, 32, 26, 0.28)"], "the prototype's 0 12px 32px rgba(20, 32, 26, .28), a token as the thumb's shadow is");
  assert.deepEqual(desk(".g-new-sheet .g-sheet__head [data-sheet-back]", "display"), ["none"], "the desk's way back is the foot's");
  assert.deepEqual([desk(".g-new-sheet .g-sheet__head", "padding"), desk(".g-new-sheet .g-sheet__head", "gap")], [["var(--space-20) var(--space-24)"], ["var(--space-16)"]]);
  assert.deepEqual([desk(".g-new-sheet .g-sheet__title", "font-size"), desk(".g-new-sheet .g-sheet__title", "line-height"), desk(".g-new-sheet .g-sheet__sub", "font-size")], [["28px"], ["1"], ["14px"]]);
  assert.deepEqual([desk(".g-new-sheet .g-sheet__body", "padding"), desk(".g-new-sheet .g-sheet__body", "gap"), desk(".g-new-sheet .g-field", "gap")], [["var(--space-20) var(--space-24)"], ["18px"], ["var(--space-8)"]]);
  assert.deepEqual(desk(".g-new-sheet .g-races", "grid-template-columns"), ["repeat(auto-fill, minmax(160px, 1fr))"]);
  assert.deepEqual(desk(".g-new__ref", "min-height"), ["24px"], "D2 on a desk: the prototype's line, not under 24px");
  assert.deepEqual(["padding", "border-top", "background"].map((property) => desk(".g-new-sheet .g-sheet__foot", property)), [["var(--space-16) var(--space-24)"], ["1px solid var(--line)"], ["var(--surface-2)"]]);
  assert.deepEqual(desk(".g-new-sheet .g-sheet__foot", "justify-content"), [], "sheet.css puts «Create» at the right, alone or with the way back (L10)");
  assert.deepEqual(["min-height", "padding", "border-radius", "background", "box-shadow", "color", "font"].map((property) => desk(".g-new-sheet .g-sheet__foot-start .g-btn", property)),
    [["48px"], ["0 18px"], ["var(--radius-lg)"], ["var(--surface)"], ["inset 0 0 0 1px var(--control-border)"], ["var(--ink-2)"], ["600 15px/1.2 var(--font-body)"]]);
  assert.deepEqual(["height", "min-width", "padding", "border-radius", "font-size"].map((property) => desk(".g-new-sheet .g-sheet__foot .g-btn--primary", property)),
    [["48px"], ["240px"], ["0 var(--space-20)"], ["var(--radius-lg)"], ["16px"]]);
  // Readable on what each sits on, in every palette.
  assertReadable(NEW_CSS, ".g-new__label", "color", ["--surface"], 4.5);
  assertReadable(NEW_CSS, ".g-new__ref", "color", ["--surface"], 4.5);
  assertReadable(NEW_CSS, ".g-races__item", "color", ["--surface", "--accent-tint-soft"], 4.5);
  assertReadable(NEW_CSS, ".g-races__resets", "color", ["--warn-tint"], 4.5);
  assertReadable("src/ui/text-field.css", ".g-field__input", "color", ["--surface-2"], 4.5);
  assertReadable("src/ui/text-field.css", ".g-field__input::placeholder", "color", ["--surface-2"], 4.5);
  assertReadable(NEW_CSS, ".g-new-sheet .g-sheet__foot-start .g-btn", "color", ["--surface"], 4.5);
  assertReadable("src/ui/sheet.css", ".g-sheet__sub", "color", ["--surface"], 4.5);
});

test("the markup of the sheet: the group is named and enters at one race, a name is only text", () => {
  state.data = data.en;
  const races = data.en.teams.map((race) => ({ slug: race.slug, title: race.title }));
  const fresh = mount(newTeamSheetMarkup({ name: "", raceSlug: "", races, seasonName: "", resets: false, back: false }));
  const group = fresh.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "Race");
  assert.deepEqual(fresh.querySelectorAll('[role="radio"]').map((radio) => radio.getAttribute("tabindex")), ["0", ...Array(races.length - 1).fill("-1")], "Tab enters at the first when none is chosen");
  assert.equal(fresh.querySelectorAll('[aria-checked="true"]').length, 0);
  assert.equal(fresh.querySelector(".g-races__resets"), null);
  assert.equal(fresh.querySelector(".g-sheet__sub").textContent, "Gata League", "a season without a name: the league's");
  assert.equal(fresh.querySelector("dialog").hasAttribute("open"), false, "drawn closed: patchWithModal opens it");
  assert.equal(fresh.querySelector('[role="alert"]') === null, true, "no refusal, no alert");
  const chosen = mount(newTeamSheetMarkup({ name: HOSTILE, raceSlug: "teams/norse", races, seasonName: HOSTILE, resets: true, back: true, refusal: HOSTILE }));
  assert.equal(chosen.querySelector('[data-race="teams/norse"]').getAttribute("aria-checked"), "true");
  assert.equal(chosen.querySelector('[data-race="teams/norse"]').getAttribute("tabindex"), "0");
  assert.equal(chosen.querySelectorAll('[tabindex="0"][role="radio"]').length, 1);
  assert.equal(chosen.querySelector("img"), null, "a name that is markup is text");
  assert.equal(chosen.querySelector("#new-team-name").value, HOSTILE);
  assert.equal(chosen.querySelector(".g-sheet__sub").textContent, HOSTILE);
  assert.ok(chosen.querySelector(".g-races__resets"));
  assert.ok(chosen.querySelector("[data-sheet-back]") && chosen.querySelector("[data-new-team-back]"));
  assert.equal(chosen.querySelector("[data-new-team-create]").textContent.trim(), `Create «${HOSTILE}»`);
  const said = chosen.querySelector('.g-sheet__body [role="alert"]');
  assert.ok(said.parentNode.classList.contains("g-sheet__body") && said.parentNode.childNodes[0] === said, "a refusal of the save is an alert at the top of the body");
  assert.equal(said.textContent.trim(), HOSTILE, "and only text");
  assertCspSafe(chosen);
  assertStyled(chosen, NEW_CSS, "sheet.css", "text-field.css", "button.css", "callout.css");
  // The page as it was for whatever runs after.
  for (const child of [...document.body.childNodes]) document.body.removeChild(child);
  document.body.appendChild(view);
});

test("with the app's own shell: the team block opens the switcher, «New team» closes it and opens the sheet, «‹» comes back to it, the cross gives the focus to the block", () => {
  const { mountShell, refreshShell } = shell;
  const frame = el(document, "div", { id: "app-frame", "data-shell": "coach" },
    el(document, "aside", { id: "side-nav" }), el(document, "header", { id: "app-header" }), el(document, "footer", { id: "site-footer" }));
  document.body.appendChild(frame);
  start();
  const before = { myTeams: state.myTeams, activeTeamId: state.activeTeamId };
  try {
    state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true }], loaded: true, loading: false, error: "" };
    state.activeTeamId = "t1";
    mountShell({ document, scroller: { addEventListener() {}, document }, onNewTeam: openNewTeamSheet });
    refreshShell({ name: "team", params: { teamId: "t1" } });
    const switcher = () => document.querySelector("dialog#team-switcher");
    const press = (selector) => click(document.querySelector(selector));
    for (const where of ["#side-nav", "#app-header"]) {
      const block = document.querySelector(`${where} [data-team-switcher]`);
      press(`${where} [data-team-switcher]`);
      assert.ok(switcher() !== null && !isOpen(), `${where}: the switcher is open`);
      press("[data-switcher-new]");
      assert.deepEqual([switcher() === null, isOpen()], [true, true], "«New team»: the switcher is gone and the sheet stands over the screen, one modal dialog at a time");
      assert.ok(sheet().querySelector("[data-sheet-back]") && sheet().querySelector("[data-new-team-back]"), "with the way back, which only the switcher's sheet has");
      click("[data-new-team-back]");
      assert.deepEqual([switcher() !== null, isOpen()], [true, false], "the way back: the switcher again, the sheet gone");
      press("[data-switcher-new]");
      type("#new-team-name", "Iron Rooks");
      click(sheet().querySelector("[data-sheet-back]"));
      assert.deepEqual([switcher() !== null, isOpen()], [true, false]);
      press("[data-switcher-new]");
      assert.equal(field().value, "Iron Rooks");
      click(sheet().querySelector("[data-sheet-close]"));
      assert.deepEqual([switcher() === null, isOpen()], [true, false], "the cross leaves both");
      assert.ok(document.activeElement === block, `${where}: the focus is on the team block`);
    }
    // Escape over the sheet, too.
    press("#app-header [data-team-switcher]");
    press("[data-switcher-new]");
    escape();
    assert.ok(document.activeElement === document.querySelector("#app-header [data-team-switcher]"));
    assert.deepEqual([switcher() === null, isOpen()], [true, false]);
    // «Create» goes to the builder; a coach who goes elsewhere (the address changes) is not brought back to the switcher.
    press("#side-nav [data-team-switcher]");
    press("[data-switcher-new]");
    type("#new-team-name", "Iron Rooks");
    click('[data-race="teams/human"]');
    click(create());
    assert.deepEqual([switcher() === null, isOpen(), location.assigned], [true, false, ["#/teams/new"]]);
  } finally {
    // What the test changed goes back, however it ended: the frame drawn bare and taken away, the coach's teams as `start`
    // left them. The shell's listeners stay (mountShell gives none back): over a bare frame they draw no header.
    refreshShell({ name: "login", params: {} });
    frame.parentNode?.removeChild(frame);
    Object.assign(state, before);
  }
});

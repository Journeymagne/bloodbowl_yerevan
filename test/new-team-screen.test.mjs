import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

// Node has no window events: the builder asks the page before a reload, and the test is the page.
const page = new EventTarget();
globalThis.addEventListener = page.addEventListener.bind(page);
globalThis.removeEventListener = page.removeEventListener.bind(page);

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
globalThis.location = { hash: "#/teams/new", replace() {} };
const { renderNewTeam, pickMarkup } = await import("../src/screens/teams/new.mjs");
const { authToken, rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { logoUploadMaxBytes } = await import("../src/core/logo-upload.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { storage } = await import("../src/core/storage.mjs");
const { view } = await import("../src/core/view.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { sessionEnded } = await import("../src/data/session.mjs");
const { builderStaffMaximums } = await import("../src/domain/league-rules.mjs");
const { rowsForTeam } = await import("../src/domain/roster/values.mjs");

const NEW_CSS = "src/screens/teams/new.css";
const read = (locale) => expandCollections(JSON.parse(readFileSync(new URL(`../public/data.${locale}.json`, import.meta.url), "utf8")));
const data = { en: read("en"), ru: read("ru") };
const raceOf = (slug) => data.en.teams.find((race) => race.slug === slug);
const rowOf = (slug, position) => rowsForTeam(raceOf(slug)).findIndex((row) => row.position === position);

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);

/** One coach per test: the build lives in the module, and a coach that is not the one it belongs to starts from nothing. */
let coaches = 0;
const signIn = (id = `coach-${coaches}`) => {
  state.auth.currentUser = { id, login: id, preferences: {} };
};

/** A coach signed in on a page that has read the list, on the first step of a new team. */
function open({ loaded = true } = {}) {
  coaches += 1;
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  view.innerHTML = "";
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  signIn();
  state.myTeams = { items: [], loaded, loading: false, error: "" };
  state.activeTeamId = null;
  state.data = data.en;
  state.season = { data: { season: { id: "s1", name: "Mock Season" }, standings: [] }, loaded: true, loading: false, error: "" };
  globalThis.location = { hash: "#/teams/new", replace() {} };
  renderNewTeam();
}

const type = (selector, value) => {
  const input = view.querySelector(selector);
  input.value = value;
  fireEvent(input, "input");
};
const create = () => view.querySelector("[data-new-team-create]");
const save = () => view.querySelector("[data-new-team-save]");
const click = (target) => fireEvent(typeof target === "string" ? view.querySelector(target) : target, "click");

/** The first step, done: a name and a race, and «Create» pressed. */
function pick(name, slug) {
  type("#new-team-name", name);
  click(`[data-race="${slug}"]`);
  click(create());
}

function hire(slug, position, times = 1) {
  for (let count = 0; count < times; count += 1) click(`[data-hire-key="${rowOf(slug, position)}"] [data-hire-step="1"]`);
}
const staff = (key, delta = 1) => click(`[data-resource-key="${key}"] [data-resource-step="${delta}"]`);

/** Builder.html: Iron Rooks, Human, 5 linemen, a thrower, a catcher, a blitzer, a start re-roll and a fan: 555k, 45k left. */
function fillLegal() {
  pick("Iron Rooks", "teams/human");
  hire("teams/human", "Human Lineman", 5);
  for (const position of ["Thrower", "Catcher", "Blitzer"]) hire("teams/human", position);
  staff("startingRerolls");
  staff("dedicatedFans");
}

const count = (row = 0) => view.querySelector(`[data-hire-key="${row}"] .g-hire__count`).textContent;

afterEach(async () => {
  await settle();
  await settle();
});

test("step one asks for a name and a race; the button says what is missing", () => {
  open();
  const button = () => view.querySelector("[data-new-team-create]");
  assert.equal(view.querySelector("h1").textContent, "New team");
  assert.equal(button().textContent.trim(), "Enter a name");
  type("#new-team-name", "Erebuni Ravens");
  assert.equal(button().textContent.trim(), "Choose a race");
  fireEvent(view.querySelector('[data-race="teams/norse"]'), "click");
  assert.equal(button().textContent.trim(), "Create «Erebuni Ravens»");
  assert.equal(button().hasAttribute("disabled"), false);
  assert.equal(view.querySelector("a[href=\"#/ref/teams\"]").textContent.trim(), "Race rules and the starting budget are in the reference →");
  assertCspSafe(view);
  assertStyled(view, NEW_CSS, "text-field.css", "button.css");
  assertDictionaryCovers("src/screens/teams/new.mjs");
});

test("the races are one radio group: the arrows move along it, and choosing does not redraw it away from the focus (05–13)", () => {
  open();
  const first = view.querySelector("[data-race]");
  first.focus();
  fireEvent(first, "keydown", { key: "ArrowRight" });
  const second = view.querySelectorAll("[data-race]")[1];
  assert.equal(document.activeElement, second);
  assert.equal(second.getAttribute("aria-checked"), "true");
});

test("the name is kept as it is typed and trimmed where it is used; a name of spaces is no name", () => {
  open();
  type("#new-team-name", "  Iron Rooks  ");
  click('[data-race="teams/human"]');
  assert.equal(view.querySelector("#new-team-name").value, "  Iron Rooks  ", "the field is not rewritten under the coach's fingers");
  assert.equal(create().textContent.trim(), "Create «Iron Rooks»");
  type("#new-team-name", "   ");
  assert.equal(create().textContent.trim(), "Enter a name");
  assert.equal(create().hasAttribute("disabled"), true);
  click(create());
  assert.equal(view.querySelector("h1").textContent, "New team", "pressed anyway, nothing opens");
});

test("creating opens the builder of that race with the name; going back keeps the picks unless the race changes, and says so", () => {
  open();
  pick("Iron Rooks", "teams/human");
  assert.equal(view.querySelector("h1").textContent, "Iron Rooks");
  fireEvent(view.querySelector('[data-hire-key="0"] [data-hire-step="1"]'), "click");
  fireEvent(view.querySelector("[data-new-team-restart]"), "click");
  assert.match(view.querySelector(".g-races__resets").textContent, /starts the squad again/);
  type("#new-team-name", "Iron Rooks II");
  fireEvent(view.querySelector("[data-new-team-create]"), "click");
  assert.equal(view.querySelector('[data-hire-key="0"] .g-hire__count').textContent, "1", "same race: the picks stay");
});

test("going back shows what was picked, says nothing while there is nothing to lose, and another race starts the squad again", () => {
  open();
  pick("Iron Rooks", "teams/human");
  click("[data-new-team-restart]");
  assert.equal(view.querySelector("h1").textContent, "New team");
  assert.equal(view.querySelector("#new-team-name").value, "Iron Rooks");
  assert.equal(view.querySelector('[data-race="teams/human"]').getAttribute("aria-checked"), "true");
  assert.equal(view.querySelector(".g-races__resets"), null, "nobody is hired: nothing goes");
  click(create());
  hire("teams/human", "Thrower");
  staff("cheerleaders");
  click("[data-new-team-restart]");
  assert.ok(view.querySelector(".g-races__resets"));
  click('[data-race="teams/orc"]');
  assert.equal(create().textContent.trim(), "Create «Iron Rooks»");
  click(create());
  assert.equal(view.querySelector(".g-build__sub").textContent, "Orc · new team");
  assert.equal(view.querySelectorAll(".g-hire__count").map((cell) => cell.textContent).join(""), "0".repeat(view.querySelectorAll(".g-hire").length), "the squad starts again");
  assert.equal(view.querySelector('[data-resource-key="cheerleaders"] .g-resource__value').textContent, "0", "and the staff with it");
});

test("only the staff counts as something to lose too, and the same race keeps the staff", () => {
  open();
  pick("Iron Rooks", "teams/human");
  staff("assistantCoaches");
  click("[data-new-team-restart]");
  assert.ok(view.querySelector(".g-races__resets"));
  click(create());
  assert.equal(view.querySelector('[data-resource-key="assistantCoaches"] .g-resource__value').textContent, "1");
});

test("saving sends one POST with the build and opens the new team's overview", async () => {
  await withoutTimers(async () => {
    open();
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
    assert.equal(state.myTeams.items[0].id, "t9");
    assert.ok(toasts().includes("Iron Rooks is created"));
  });
});

test("the button stays on while the save is on its way, and says it is busy; a keyboard keeps its place on it (R8)", async () => {
  await withoutTimers(async () => {
    open();
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    save().focus();
    click(save());
    assert.equal(save().hasAttribute("disabled"), false, "a disabled button that holds the focus loses it");
    assert.equal(save().getAttribute("aria-busy"), "true");
    assert.equal(document.activeElement, save());
    gate.release();
    await settle();
  });
});

test("the request is the build: the name, the race, the roster with its treasury, and no logo until one is picked", async () => {
  await withoutTimers(async () => {
    open();
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
  open();
  fillLegal();
  api.reply("POST /api/teams", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [] });
  fireEvent(save(), "click");
  await settle();
  assert.ok(view.querySelector('.g-build__cta [role="alert"]'));
  assert.equal(save().hasAttribute("disabled"), false);
  assert.equal(view.querySelector('[data-hire-key="0"] .g-hire__count').textContent, "5");
});

test("after a refusal the button is given back: pressing again sends the build again", async () => {
  open();
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
    open();
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
      open({ loaded: false });
      Date.now = () => 1_000_000;
      fillLegal();
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

test("a build that was changed back to a build of the same race keeps the moment it began", async () => {
  const realNow = Date.now;
  try {
    await withoutTimers(async () => {
      open({ loaded: false });
      Date.now = () => 1_000_000;
      pick("Iron Rooks", "teams/human");
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
  pick("Iron Rooks", "teams/human");
  assert.equal(save().hasAttribute("disabled"), true);
  click(save());
  hire("teams/human", "Human Lineman", 3);
  click(save());
  await settle();
  assert.equal(api.calls.length, 0, "a disabled button takes no click in a browser; the fake page sends one, and the screen asks again");
});

test("the build waits in memory while the coach looks elsewhere, and a reload asks first", () => {
  open();
  fillLegal();
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    page.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(unload(), true);
  releaseCurrentScreen();
  assert.equal(unload(), false, "nothing asks once the builder is left");
  renderNewTeam();
  assert.equal(view.querySelector('[data-hire-key="0"] .g-hire__count').textContent, "5");
});

test("a reload asks only for a build with something in it, and the first step has nothing to lose", () => {
  open();
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    page.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(unload(), false, "the first step");
  pick("Iron Rooks", "teams/human");
  assert.equal(unload(), false, "a build with nobody and nothing bought");
  hire("teams/human", "Thrower");
  assert.equal(unload(), true, "a player");
  click(`[data-hire-key="${rowOf("teams/human", "Thrower")}"] [data-hire-step="-1"]`);
  assert.equal(unload(), false, "the player let go again");
  staff("cheerleaders");
  assert.equal(unload(), true, "staff alone");
  click("[data-new-team-restart]");
  assert.equal(unload(), false, "on the first step again, whatever the build holds");
});

test("coming back to the builder twice draws it once: the first visit's listeners are gone", () => {
  open();
  pick("Iron Rooks", "teams/human");
  renderNewTeam();
  hire("teams/human", "Thrower");
  assert.equal(count(rowOf("teams/human", "Thrower")), "1", "one click, one hire");
});

test("the page wipes the 2.x builder's draft where it opens, and starts from nothing instead of importing it (stage 06)", () => {
  open();
  storage.setJson("builder-draft", { draft: { teamName: "Old Rooks", teamSlug: "teams/human", logoData: "data:image/png;base64,AAAA" } });
  renderNewTeam();
  assert.equal(storage.get("builder-draft"), null, "the key and the logo in it are gone");
  assert.equal(view.querySelector("#new-team-name").value, "", "nothing of the draft is offered back");
  assert.equal(view.querySelector("h1").textContent, "New team");
});

test("another coach on this browser starts from nothing", () => {
  open();
  fillLegal();
  state.auth.currentUser = { id: "u2", login: "other", preferences: {} };
  renderNewTeam();
  assert.equal(view.querySelector("h1").textContent, "New team");
});

test("a session that ends drops the build: the same coach signing back in starts from nothing (K6a)", () => {
  open();
  fillLegal();
  const coach = state.auth.currentUser;
  sessionEnded();
  assert.equal(state.auth.currentUser, null);
  state.auth.currentUser = coach;
  releaseCurrentScreen();
  renderNewTeam();
  assert.equal(view.querySelector("h1").textContent, "New team");
  assert.equal(view.querySelector("#new-team-name").value, "");
});

test("a session that stays, or changes to the same coach's again, keeps the build", () => {
  open();
  fillLegal();
  releaseCurrentScreen();
  renderNewTeam();
  assert.equal(count(), "5");
});

test("the league and the alignment are chosen from a sheet, and the focus goes back to the button that opened it (K6b)", () => {
  open();
  pick("Hobbits", "teams/halfling");
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

/** Back to the first step and into another race's builder. */
function restartAndBuild(name, slug) {
  click("[data-new-team-restart]");
  type("#new-team-name", name);
  click(`[data-race="${slug}"]`);
  click(create());
}

test("the league and the alignment chosen are what the server is sent", async () => {
  await withoutTimers(async () => {
    open();
    pick("Hobbits", "teams/halfling");
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
  pick("Iron Rooks", "teams/human");
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
    pick("Iron Rooks", "teams/human");
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
    open();
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

test("a logo of up to 2 MB is shown and sent; a larger one is refused in words; taking it away gives the focus to the file field", async () => {
  await withoutTimers(async () => {
    open();
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
    open();
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
    open();
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
  open();
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
  open();
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
  assert.equal(view.querySelector("h1").textContent, "New team");
  pick("Another", "teams/orc");
  assert.equal(view.querySelector(".g-build__team img"), null);
});

test("an answer that comes after the coach left is told in a toast, and does not pull them back to the new team", async () => {
  await withoutTimers(async () => {
    open();
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    releaseCurrentScreen();
    location.hash = "#/season";
    gate.release();
    await settle();
    assert.equal(location.hash, "#/season");
    assert.ok(toasts().includes("Iron Rooks is created"));
    assert.equal(state.myTeams.items[0].id, "t9");
    renderNewTeam();
    assert.equal(view.querySelector("h1").textContent, "New team", "the team is made: the build is not kept for another");
  });
});

test("a build whose session ended while the request was out is not told of, and nobody is taken anywhere (the guard on `flow`)", async () => {
  await withoutTimers(async () => {
    open();
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    sessionEnded();
    gate.release();
    await settle();
    assert.equal(location.hash, "#/teams/new");
    assert.deepEqual(toasts(), []);
  });
});

test("another coach who took the screen while the request was out is not taken to the first coach's team, and keeps what they began", async () => {
  await withoutTimers(async () => {
    open();
    fillLegal();
    api.reply("POST /api/teams", 201, { team: { id: "t9", name: "Iron Rooks" } });
    const gate = api.hold("POST /api/teams");
    click(save());
    state.auth.currentUser = { id: "coach-b", login: "b", preferences: {} };
    releaseCurrentScreen();
    renderNewTeam();
    type("#new-team-name", "Second Wind");
    gate.release();
    await settle();
    assert.equal(location.hash, "#/teams/new");
    assert.deepEqual(toasts(), []);
    assert.equal(view.querySelector("#new-team-name").value, "Second Wind", "the other coach's build is theirs, not dropped with the first one's");
    releaseCurrentScreen();
    renderNewTeam();
    assert.equal(view.querySelector("#new-team-name").value, "Second Wind");
  });
});

test("a token another tab moved while the request was out: the team is neither told of nor opened for whoever is signed in now", async () => {
  await withoutTimers(async () => {
    open();
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
    open();
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
    open();
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

test("the first step is the page of the address: a way back to the list, the season's name, the races from the data", () => {
  open();
  const back = view.querySelector(".g-new__head a.g-icon-btn");
  assert.deepEqual([back.getAttribute("href"), back.hasAttribute("data-history-back"), back.getAttribute("data-history-fallback")], ["#/teams", true, "#/teams"]);
  assert.equal(view.querySelector(".g-new__sub").textContent, "Mock Season");
  assert.equal(view.querySelector("h1").getAttribute("tabindex"), "-1");
  assert.equal(view.querySelectorAll("[data-race]").length, data.en.teams.length);
  assert.equal(view.querySelector(".g-new__foot a.g-btn").getAttribute("href"), "#/teams");
  assert.match(view.querySelector(".g-new__foot a.g-btn").textContent, /My teams/);
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.reply("GET /api/season", 200, { season: { id: "s2" }, standings: [] });
  renderNewTeam();
  assert.equal(view.querySelector(".g-new__sub").textContent, "Gata League", "no season read yet, or one without a name: the league");
});

test("a page opened on this address reads the season, and the line under the title takes its name once it is in", async () => {
  open();
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.reply("GET /api/season", 200, { season: { id: "s2", name: "Season 2" }, standings: [] });
  renderNewTeam();
  assert.equal(view.querySelector(".g-new__sub").textContent, "Gata League");
  await settle();
  assert.equal(view.querySelector(".g-new__sub").textContent, "Season 2");
  assert.equal(api.calls.filter((call) => call.key === "GET /api/season").length, 1);
});

test("a season that comes in after the coach left draws nothing", async () => {
  open();
  state.season = { data: null, loaded: false, loading: false, error: "" };
  const gate = api.hold("GET /api/season");
  renderNewTeam();
  releaseCurrentScreen();
  view.innerHTML = "";
  gate.release({ status: 200, body: { season: { id: "s2", name: "Season 2" }, standings: [] } });
  await settle();
  assert.equal(view.querySelector(".g-new"), null);
});

test("the markup of the first step: the group is named and enters at one race, a name is only text", () => {
  state.data = data.en;
  const races = data.en.teams.map((race) => ({ slug: race.slug, title: race.title }));
  const fresh = mount(pickMarkup({ name: "", raceSlug: "", races, seasonName: "", resets: false }));
  const group = fresh.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "Race");
  assert.deepEqual(fresh.querySelectorAll('[role="radio"]').map((radio) => radio.getAttribute("tabindex")), ["0", ...Array(races.length - 1).fill("-1")], "Tab enters at the first when none is chosen");
  assert.equal(fresh.querySelectorAll('[aria-checked="true"]').length, 0);
  assert.equal(fresh.querySelector(".g-races__resets"), null);
  const chosen = mount(pickMarkup({ name: HOSTILE, raceSlug: "teams/norse", races, seasonName: HOSTILE, resets: true }));
  assert.equal(chosen.querySelector('[data-race="teams/norse"]').getAttribute("aria-checked"), "true");
  assert.equal(chosen.querySelector('[data-race="teams/norse"]').getAttribute("tabindex"), "0");
  assert.equal(chosen.querySelectorAll('[tabindex="0"][role="radio"]').length, 1);
  assert.equal(chosen.querySelector("img"), null, "a name that is markup is text");
  assert.equal(chosen.querySelector("#new-team-name").value, HOSTILE);
  assert.equal(chosen.querySelector(".g-new__sub").textContent, HOSTILE);
  assert.ok(chosen.querySelector(".g-races__resets"));
  assert.equal(chosen.querySelector("[data-new-team-create]").textContent.trim(), `Create «${HOSTILE}»`);
  assertCspSafe(chosen);
  assertStyled(chosen, NEW_CSS, "text-field.css", "button.css");
});

test("the first step speaks Russian when the site does, and leaves no placeholder, no undefined and no key", async () => {
  await withoutTimers(async () => {
    initLocale("ru");
    try {
      open();
      state.data = data.ru;
      renderNewTeam();
      assert.equal(view.querySelector("h1").textContent, "Новая команда");
      assert.equal(create().textContent.trim(), "Введите название");
      type("#new-team-name", "Iron Rooks");
      assert.equal(create().textContent.trim(), "Выберите расу");
      click('[data-race="teams/human"]');
      assert.equal(create().textContent.trim(), "Создать «Iron Rooks»");
      assert.equal(view.querySelector('[role="radiogroup"]').getAttribute("aria-label"), "Раса");
      assert.equal(view.querySelector("a[href=\"#/ref/teams\"]").textContent.trim(), "Правила рас и стартовый бюджет — в справочнике →");
      assert.match(view.querySelector(".g-new__foot a.g-btn").textContent, /Мои команды/);
      assert.doesNotMatch(view.textContent, /[{}]|undefined|NaN|newTeam\.|teams\./);
      click(create());
      hire("teams/human", "Thrower");
      click("[data-new-team-restart]");
      assert.equal(view.querySelector(".g-races__resets").textContent, "Другая раса начнёт состав заново: набранные игроки пропадут.");
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

test("the look: the pick step stays inside the stage's two breakpoints, with no inline widths and readable text", () => {
  const css = readFileSync(new URL(`../${NEW_CSS}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /\bstyle\s*=/);
  const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  assert.ok(queries.length >= 2 && queries.every((query) => query === "(max-width: 900px)" || query === "(min-width: 901px)"), `only the stage's two breakpoints: ${queries}`);
  assertReadable(NEW_CSS, ".g-new__title", "color", ["--page", "--surface"], 4.5);
  assertReadable(NEW_CSS, ".g-new__sub", "color", ["--page", "--surface"], 4.5);
  // The chosen race is the same text on the tint.
  assertReadable(NEW_CSS, ".g-races__item", "color", ["--surface", "--page", "--accent-tint"], 4.5);
  assertReadable(NEW_CSS, ".g-races__resets", "color", ["--warn-tint"], 4.5);
  assertReadable(NEW_CSS, ".g-new__ref", "color", ["--page", "--surface"], 4.5);
  assert.deepEqual(valuesOf(NEW_CSS, ".g-races__item", "min-height"), ["48px"]);
  assert.deepEqual(valuesOf(NEW_CSS, '.g-races__item[aria-checked="true"]', "background"), ["var(--accent-tint)"]);
  // A phone's button is at the foot of the screen; a desk's card is 760px, four races to a row.
  assert.match(css, /@media \(max-width: 900px\)\s*\{[^@]*\.g-new__foot\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/);
  assert.match(css, /@media \(min-width: 901px\)\s*\{[^@]*\.g-new__card\s*\{[^}]*max-width:\s*760px/);
  assert.match(css, /@media \(min-width: 901px\)\s*\{[^@]*\.g-races\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
});

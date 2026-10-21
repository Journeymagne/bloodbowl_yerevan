import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

// A file read by the logo picker: the reader answers with what the "file" carries, or fails as its `failure` says
// (as test/new-team-screen.test.mjs reads one).
globalThis.FileReader = class {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  readAsDataURL(file) {
    this.result = file.dataUrl;
    queueMicrotask(() => (file.failure ? this.listeners.get("error")?.(file.failure) : this.listeners.get("load")?.()));
  }
};

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t1/team", replace() {} };
const { manageMarkup, manageModel, renderTeamManage } = await import("../src/screens/team/manage/index.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { logoUploadMaxBytes } = await import("../src/core/logo-upload.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { SETTINGS_KINDS } = await import("../src/screens/team/manage/settings-sheet.mjs");
const save = await import("../src/screens/team/roster/save.mjs");
const { renderAppHeader } = await import("../src/shell/app-header.mjs");
const { shellModel } = await import("../src/shell/navigation.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(read(`src/i18n/${locale}.json`)));
const RACES = expandCollections(JSON.parse(read("public/data.en.json"))).teams;
const SETTINGS = "src/screens/team/manage/settings.css";
const TOKEN = "gata-league-auth-token";
const PATCH = "PATCH /api/teams/t1";
const LIST = "GET /api/teams";
const FIRST_PAGE = "GET /api/teams/t1/ledger?limit=20";
const HOST = '[data-sheet-host="team-settings"]';
const LOGO = "data:image/png;base64,AAAA";
const HUMAN = "teams/human";
const CHOSEN = "teams/chaos-chosen";
const DAY = "2026-10-18T12:00:00Z";
const SEASON = { season: { id: "s1", name: "Mock Season", currentRound: 7 }, standings: [] };
/** What a live match holds the settings with (fix round 1, M-3). */
const LIVE = "A match is on — the settings wait for its post-match";
/** What a save of the settings resets during a preparation, the steps as the pre-match names them (final review I1). */
const PREP_WORDS = "Any save of the settings resets the steps «Roster», «Inducements» and «Start». Fans and weather stay.";

/** Eleven Humans, a legal roster, numbered out of order: six Linemen, a Thrower, two Catchers, two Blitzers; №7 first. */
const NUMBERS = ["7", "1", "2", "3", "4", "5", "6", "8", "9", "10", "11"];
const SQUAD = [0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3].map((rowIndex, at) => ({ id: `p${at + 1}`, rowIndex, number: NUMBERS[at], name: `Warden ${at + 1}` }));
/** t1, Human, out of the season, with an apothecary; t2, Chaos Chosen of Undivided, with a logo and Rotter's two favoured skills. */
const TEAMS = [
  {
    id: "t1", name: "Ashgrove Wardens", baseTeamSlug: HUMAN, logoData: null, revision: 3, stage: "active", inActiveSeason: false,
    roster: { teamSlug: HUMAN, teamName: "Ashgrove Wardens", treasury: 70, coachesSafe: 20, dedicatedFans: 3, apothecary: 1, selectedLeague: "Old World Classic", players: SQUAD },
  },
  {
    id: "t2", name: "Rotten Hosts", baseTeamSlug: CHOSEN, logoData: LOGO, revision: 5, stage: "active", inActiveSeason: false,
    roster: {
      teamSlug: CHOSEN, teamName: "Rotten Hosts", treasury: 40, favouredChoice: "Undivided", selectedLeague: "Chaos Clash",
      players: [{ id: "c1", rowIndex: 0, number: "1", name: "Rotter", favouredSkills: ["Prehensile Tail", "Extra Arms"] }],
    },
  },
  { id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/norse", logoData: null, revision: 1, stage: "draft", inActiveSeason: false, roster: { treasury: 1000, players: [] } },
];
const t1With = (changes, roster = {}) => ({ ...structuredClone(TEAMS[0]), revision: 4, ...changes, roster: { ...structuredClone(TEAMS[0].roster), ...roster } });

/** A league match of round 7 of `teamId`, as the games list sends it. */
const game = (teamId, over) => ({
  id: "g1", kind: "league", roundNumber: 7, roundStatus: "started", season: SEASON.season,
  resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started", updatedAt: DAY,
  home: { user: { id: "u1", login: "coach" }, team: { id: teamId, name: "Ours", baseTeamSlug: HUMAN } },
  away: { user: { id: "u9", login: "rival" }, team: { id: "r1", name: "Rival", baseTeamSlug: "teams/dwarf" } },
  ...over,
});
const liveGame = (teamId) => game(teamId, { preparationStatus: "in_progress", postMatchStatus: "draft" });
const preparingGame = (teamId) => game(teamId, { preparationStatus: "preparing" });

const raceOf = (team) => RACES.find((race) => race.slug === team.baseTeamSlug) ?? null;
const held = () => ({ entries: [], next: null, since: null, total: 0, loaded: true, loading: false, error: "" });
/** The page's model of a team: the games given, the roster's queue at rest unless it is given; a desk's team page unless it is said. */
function model(team, { games = [], queue, phone = false, screen = "page", gamesUnknown = false } = {}) {
  return manageModel({ team, race: raceOf(team), seasonData: SEASON, games, ledger: held(), queue, phone, screen, gamesUnknown });
}

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
async function settled(times = 6) {
  for (let turn = 0; turn < times; turn += 1) await settle();
}
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const calls = (key) => api.calls.filter((call) => call.key === key);
const $ = (selector) => document.querySelector(`${HOST} ${selector}`);
const sheetOpen = () => Boolean($("dialog#team-settings-sheet")?.matches(":modal"));
const rowOf = (kind, root = view) => root.querySelector(`[data-settings-row="${kind}"]`);
/** A row as one reads it: its name, its value, its buttons. */
const rowText = (kind, root = view) => rowOf(kind, root)
  ?.querySelectorAll(".g-team-settings__label, .g-team-settings__logo-name, .g-team-settings__value b, .g-team-settings__btn")
  .map((node) => node.textContent.trim()).join(" · ") ?? null;
const press = (selector) => fireEvent(view.querySelector(selector), "click");
const openRow = (kind) => press(`[data-settings-open="${kind}"]`);
function type(value) {
  const field = $("#team-settings-name");
  field.value = value;
  fireEvent(field, "input");
}
const alertText = () => $(".g-team-settings__alert")?.textContent ?? null;

/** Wait until `count` requests are held at the gate. */
async function waitHeld(gate, count = 1) {
  for (let spins = 0; gate.count < count; spins += 1) {
    assert.ok(spins < 50, `${count} request(s) were to be held`);
    await settle();
  }
}

/**
 * A coach signed in on a page that has read the list, the table and the games; the screen before is left and its
 * toasts are gone. `userId` keeps the history cache of one test from another's.
 */
function coach({ games = [], userId = "u1", teams = TEAMS, active = "t1" } = {}) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  state.auth.currentUser = { id: userId, login: "coach", preferences: { activeTeamId: active } };
  state.myTeams = { items: structuredClone(teams), loaded: true, loading: false, error: "" };
  state.activeTeamId = active;
  state.data = { teams: RACES };
  state.season = { data: SEASON, loaded: true, loading: false, error: "" };
  state.games = { items: games, currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  api.reply(`GET /api/teams/${active}/ledger?limit=20`, 200, { entries: [], next: null, since: null, total: 0 });
  // A step a test before left in the roster's queue is given up: it would hold every page after it.
  if (save.saveState("t1").waiting > 0) save.takeServerTeam(structuredClone(TEAMS[0]));
}

/** The server answering the games again: the list as it is now (the page follows it). */
async function notifyGames(games) {
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  await invalidateGames();
}

/** The team page of `teamId`, drawn and read; with `settings`, its settings' address. */
async function page(teamId = "t1", { settings = false, ...options } = {}) {
  coach({ ...options, active: teamId });
  await renderTeamManage(teamId, { settings });
}

/**
 * A window of a phone's width (`phone`) or a desk's for the length of `run`, whose width crosses 900px when `cross`
 * says so, as a window narrowed or a tablet turned (test/team-player-profile.test.mjs has its like).
 */
async function atWidth(phone, run) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  const cross = (next) => {
    media.matches = next;
    for (const listener of [...listeners]) listener();
  };
  try {
    return await run({ cross, listeners });
  } finally {
    delete globalThis.matchMedia;
  }
}
const screenOf = () => view.querySelector('[data-screen="team-settings"]');
const titles = (root) => root.querySelectorAll(".g-callout__title").map((node) => node.textContent);

test("the settings are the rows of the builder's team card (Builder)", () => {
  const fragment = mount(manageMarkup(model(TEAMS[0])));
  const section = fragment.querySelector("section.g-team-settings");
  assert.equal(section.getAttribute("aria-labelledby"), "team-settings-title");
  assert.equal(fragment.querySelector("h2#team-settings-title").textContent, "Team settings");
  assert.equal(rowText("name", fragment), "Name · Ashgrove Wardens · Change");
  assert.equal(rowText("race", fragment), "Race · Human · Tier 1", "read only: no button");
  assert.equal(rowText("league", fragment), "League · Old World Classic", "one league: nothing to change it to");
  assert.equal(rowOf("favoured", fragment), null, "Humans have no god");
  assert.equal(rowText("logo", fragment), "Logo · Upload");
  assert.equal(rowOf("logo", fragment).querySelector(".g-team-settings__note").textContent, "PNG or JPG up to 2 MB · optional");
  assert.equal(rowText("fans", fragment), "Dedicated Fans · 3 · Correct");
  assert.equal(rowOf("fans", fragment).querySelector(".g-team-settings__note").textContent, "A correction moves no money");
  assert.equal(rowText("order", fragment), "Roster order · By number");
  assert.equal(rowOf("order", fragment).querySelector(".g-team-settings__note").textContent, "Players in the order of their numbers");
  assert.deepEqual(fragment.querySelectorAll(".g-team-settings__row").map((row) => row.getAttribute("data-settings-row")), ["name", "race", "league", "logo", "fans", "order"]);
  assert.ok(!fragment.querySelector(".g-team-settings__check"), "a legal roster breaks nothing");
  assert.ok(!fragment.querySelector(".g-team-settings .g-callout"), "nothing holds the settings");
  const opens = fragment.querySelectorAll("[data-settings-open]");
  assert.deepEqual(opens.map((button) => button.getAttribute("data-settings-open")), ["name", "fans"]);
  assert.ok(opens.every((button) => button.getAttribute("aria-haspopup") === "dialog" && button.getAttribute("type") === "button" && !button.hasAttribute("aria-disabled")));
  assert.equal(opens[0].getAttribute("aria-describedby"), "team-settings-name-label");
  assert.equal(fragment.querySelector("#team-settings-name-label").textContent, "Name");
  const file = fragment.querySelector("input#team-settings-logo");
  assert.deepEqual([file.getAttribute("type"), file.getAttribute("accept"), file.getAttribute("class"), file.hasAttribute("disabled")], ["file", "image/png,image/jpeg", "g-sr-only g-team-settings__file", false]);
  assert.equal(fragment.querySelector('label[for="team-settings-logo"]').getAttribute("class"), "g-btn g-team-settings__btn");
  assert.ok(rowOf("logo", fragment).querySelector(".g-team-settings__logo svg"), "no logo: the picture's glyph");
  assert.ok(!fragment.querySelector("[data-settings-logo-remove]"));

  // A god of two or more, a league of two or more, a logo.
  const chosen = mount(manageMarkup(model(TEAMS[1])));
  assert.equal(rowText("favoured", chosen), "Favoured of… · Undivided · Change");
  assert.equal(rowText("league", chosen), "League · Chaos Clash");
  assert.equal(rowOf("logo", chosen).querySelector(".g-team-settings__logo img").getAttribute("src"), LOGO);
  assert.equal(rowText("logo", chosen), "Logo · Upload · Remove");
  const norse = mount(manageMarkup(model(TEAMS[2])));
  assert.equal(rowText("league", norse), "League · Chaos Clash · Change", "two leagues, none stored: the first, as the 2.x editor read it");
  assert.equal(rowText("favoured", norse), "Favoured of… · Khorne", "one god: nothing to change it to");
});

// Owner, 2026-10-20 (decisions 56–58): «отдельный экран на мобилке, справа на десктопе, есть кнопка назад в мобильной версии».
test("a phone's team page has no settings section but a row «Team settings» last, after the history, leading to #/t/t1/settings", async () => {
  const fragment = mount(manageMarkup(model(TEAMS[0], { phone: true })));
  assert.ok(!fragment.querySelector(".g-team-settings"), "no section on the phone's page");
  const entry = fragment.querySelector("div.g-team-settings-entry");
  const blocks = fragment.querySelector(".g-manage").childNodes.filter((node) => node.nodeType === 1);
  assert.ok(blocks.at(-1) === entry, "the page's last block");
  assert.ok(blocks.at(-2) === fragment.querySelector(".g-manage__cols"), "after the columns");
  assert.ok(fragment.querySelector(".g-manage__cols").childNodes.filter((node) => node.nodeType === 1).at(-1) === fragment.querySelector(".g-manage__history"), "whose last is the history");
  const link = entry.querySelector("a.g-list-row");
  assert.deepEqual([link.getAttribute("href"), link.querySelector(".g-list-row__title").textContent, link.querySelector(".g-list-row__desc").textContent],
    ["#/t/t1/settings", "Team settings", "Name, league, logo, Dedicated Fans, roster order"]);
  assert.ok(link.querySelector("svg.g-icon"), "the chevron");
  assert.equal(entry.querySelectorAll("a").length, 1);
  // Drawn on a phone's screen: the same row, the page's title taking the focus.
  await atWidth(true, async () => {
    await page();
    assert.ok(!view.querySelector(".g-team-settings"));
    assert.equal(view.querySelector(".g-team-settings-entry a").getAttribute("href"), "#/t/t1/settings");
    assert.ok(document.activeElement === view.querySelector("h1"), "the page's title");
  });
  initLocale("ru");
  try {
    const russian = mount(manageMarkup(model(TEAMS[0], { phone: true })));
    assert.equal(russian.querySelector(".g-list-row__title").textContent, "Настройки команды");
    assert.equal(russian.querySelector(".g-list-row__desc").textContent, "Название, лига, логотип, Dedicated Fans, порядок в составе");
  } finally {
    initLocale("en");
  }
});

test("#/t/t1/settings on a phone is a screen of its own (Builder.html's head): «‹» back to the team page, «Team settings» and «Ashgrove Wardens · Human», the rows under it; neither the treasury, the resources nor the history", async () => {
  await atWidth(true, async () => {
    await page("t1", { settings: true });
    const screen = screenOf();
    assert.equal(screen.getAttribute("class"), "g-team-settings-screen");
    const inView = view.childNodes.filter((node) => node.nodeType === 1);
    assert.ok(inView.length === 1 && inView[0] === screen, "the view's one block");
    const head = screen.querySelector("header.g-team-settings-screen__head");
    assert.ok(head.parentNode === screen, "the screen's own head");
    const back = head.querySelector("a.g-team-settings-screen__back");
    assert.deepEqual([back.getAttribute("href"), back.getAttribute("aria-label"), back.textContent.trim()], ["#/t/t1/team", "Back to the team page", ""], "a round link: the chevron alone");
    assert.ok(back.querySelector("svg.g-icon"), "the chevron");
    const title = head.querySelector(".g-team-settings-screen__titles h1#team-settings-title");
    assert.deepEqual([title.textContent, title.getAttribute("tabindex"), title.getAttribute("class")], ["Team settings", "-1", "g-team-settings-screen__title"]);
    assert.equal(head.querySelector(".g-team-settings-screen__titles p.g-team-settings-screen__sub").textContent, "Ashgrove Wardens · Human");
    assert.ok(document.activeElement === title, "the screen's title takes the focus");
    const body = screen.querySelector(".g-team-settings-screen__body");
    const section = body.querySelector("section.g-team-settings");
    const parts = screen.childNodes.filter((node) => node.nodeType === 1);
    assert.ok(parts.length === 2 && parts[0] === head && parts[1] === body, "the head, then the body");
    assert.ok(section.parentNode === body);
    assert.equal(section.getAttribute("aria-labelledby"), "team-settings-title", "named by the screen's h1");
    assert.ok(!section.querySelector("h2"), "no h2: the head names it (decision 59)");
    assert.equal(view.querySelectorAll("#team-settings-title").length, 1);
    assert.deepEqual(section.querySelectorAll(".g-team-settings__row").map((row) => row.getAttribute("data-settings-row")), ["name", "race", "league", "logo", "fans", "order"]);
    assert.equal(rowText("name"), "Name · Ashgrove Wardens · Change");
    for (const selector of [".g-manage", ".g-pagehead", ".g-funds", ".g-manage__card", ".g-manage__safe", ".g-manage__fix", ".g-manage__resources", ".g-manage__history", ".g-team-settings-entry"]) {
      assert.ok(!view.querySelector(selector), selector);
    }
    assert.equal(view.querySelectorAll("h1").length, 1);
    assert.ok(!document.querySelector('[data-sheet-host="treasury-money"] dialog:modal'));
  });
  // A team with no race known yet says its name alone; a name is text.
  const named = mount(manageMarkup(manageModel({ team: { ...TEAMS[0], name: HOSTILE }, race: null, seasonData: SEASON, games: [], ledger: held(), phone: true, screen: "settings" })));
  assert.equal(named.querySelector(".g-team-settings-screen__sub").textContent, HOSTILE);
  assertCspSafe(named);
  initLocale("ru");
  try {
    const russian = mount(manageMarkup(model(TEAMS[0], { phone: true, screen: "settings" })));
    assert.equal(russian.querySelector(".g-team-settings-screen__back").getAttribute("aria-label"), "Назад на страницу «Команда»");
    assert.equal(russian.querySelector("h1").textContent, "Настройки команды");
  } finally {
    initLocale("en");
  }
});

test("a sheet opened on the phone's screen works as on the page: one PATCH, the focus back on the row's button", async () => {
  await atWidth(true, async () => {
    await page("t1", { settings: true });
    const opener = view.querySelector('[data-settings-open="fans"]');
    opener.focus();
    openRow("fans");
    assert.ok(sheetOpen());
    fireEvent($('[data-resource-step="1"]'), "click");
    assert.equal($(".g-resource__value").textContent, "4");
    api.reply(PATCH, 200, { team: t1With({}, { dedicatedFans: 4 }) });
    await withoutTimers(async () => {
      fireEvent($("[data-settings-save]"), "click");
      fireEvent($("[data-settings-save]"), "click");
      await settled();
    });
    assert.equal(calls(PATCH).length, 1, "one press, one save");
    assert.equal(calls(PATCH)[0].body.roster.dedicatedFans, 4);
    assert.equal(sheetOpen(), false);
    assert.deepEqual(toasts(), ["Saved"]);
    assert.ok(document.activeElement === opener, "the focus is back on the row's button");
    assert.equal(rowText("fans"), "Dedicated Fans · 4 · Correct");
    assert.ok(screenOf(), "still the screen");
  });
});

// Review Focus 3, and L4 of the round's preflight: the page's quiet «games not read» goes to the screen with the settings.
test("held on its own screen as on the page: a match on, the roster's queue, a preparation's words; «‹» still leads back (Review Focus 3)", async () => {
  const back = () => view.querySelector(".g-team-settings-screen__back").getAttribute("href");
  const shut = (reason) => view.querySelectorAll(".g-team-settings__btn").every((button) => button.getAttribute("aria-disabled") === "true" && button.getAttribute("title") === reason);
  await atWidth(true, async () => {
    // A match on: said, every button shut with its reason, a press says it, and nothing goes.
    await page("t1", { settings: true, games: [liveGame("t1")] });
    assert.deepEqual(titles(screenOf()), [LIVE]);
    assert.ok(view.querySelectorAll(".g-team-settings__btn").length >= 4 && shut(LIVE));
    assert.equal(view.querySelector("input#team-settings-logo").getAttribute("aria-disabled"), "true");
    let before = api.calls.length;
    await withoutTimers(async () => {
      openRow("name");
      press("[data-settings-order]");
    });
    assert.equal(sheetOpen(), false);
    assert.deepEqual(toasts(), [LIVE, LIVE]);
    assert.equal(api.calls.length, before, "nothing is sent");
    assert.equal(back(), "#/t/t1/team");

    // The roster's queue holds a step: said, with the way to the roster.
    coach({ userId: "u-screen-queue" });
    save.trackRoster(structuredClone(TEAMS[0]));
    api.fail(PATCH);
    assert.equal(save.stepSpp("t1", "p1", "touchdowns", 1).ok, true);
    for (let spins = 0; save.saveState("t1").status !== "offline"; spins += 1) {
      assert.ok(spins < 50, "the step waits for the network");
      await settle();
    }
    await renderTeamManage("t1", { settings: true });
    const waits = "Wait until the roster's edits are saved";
    assert.deepEqual(titles(screenOf()), [waits]);
    const link = screenOf().querySelector(".g-callout a");
    assert.deepEqual([link.getAttribute("href"), link.textContent], ["#/t/t1/roster", "To the roster"]);
    assert.ok(shut(waits));
    before = api.calls.length;
    await withoutTimers(async () => openRow("fans"));
    assert.deepEqual([sheetOpen(), toasts(), api.calls.length], [false, [waits], before]);
    assert.equal(back(), "#/t/t1/team");

    // A preparation: what a save resets, nothing held.
    await page("t1", { settings: true, games: [preparingGame("t1")] });
    assert.deepEqual(titles(screenOf()), [PREP_WORDS]);
    assert.ok(view.querySelectorAll(".g-team-settings__btn").every((button) => !button.hasAttribute("aria-disabled")));
    assert.equal(back(), "#/t/t1/team");

    // The games could not be read: the page's quiet warning, said on the screen too (L4); the rows stay open.
    coach({ games: [preparingGame("t1")] });
    api.fail("GET /api/games");
    await renderTeamManage("t1", { settings: true });
    assert.deepEqual(titles(screenOf()), [en["treasury.gamesUnknown"], PREP_WORDS], "over the rows, before what holds them");
    const blocks = screenOf().querySelector(".g-team-settings-screen__body").childNodes.filter((node) => node.nodeType === 1);
    assert.deepEqual(blocks.map((node) => node.getAttribute("class")), ["g-callout g-callout--warn", "g-team-settings"]);
    assert.ok(view.querySelectorAll(".g-team-settings__btn").every((button) => !button.hasAttribute("aria-disabled")));
    await notifyGames([]);
    assert.deepEqual(titles(screenOf()), [], "a read that comes takes it away");
  });
  // As the page: a match on says only that, in the settings' words.
  assert.deepEqual(titles(mount(manageMarkup(model(TEAMS[0], { phone: true, screen: "settings", games: [liveGame("t1")], gamesUnknown: true })))), [LIVE]);
  assert.deepEqual(titles(mount(manageMarkup(model(TEAMS[0], { phone: true, screen: "settings", gamesUnknown: true })))), [en["treasury.gamesUnknown"]]);
});

test("on a desk the settings are a card in the right column, under the history; the resources keep the left (DeskBuilder, DeskRosterFunds)", () => {
  const fragment = mount(manageMarkup(model(TEAMS[0])));
  const cols = fragment.querySelector(".g-manage__cols").childNodes.filter((node) => node.nodeType === 1);
  assert.ok(cols.at(-1) === fragment.querySelector("section.g-team-settings"), "the columns' last");
  assert.ok(cols.at(-2) === fragment.querySelector(".g-manage__history"), "after the history");
  assert.ok(fragment.querySelector(".g-manage").childNodes.filter((node) => node.nodeType === 1).at(-1) === fragment.querySelector(".g-manage__cols"), "nothing across the page under the columns");
  assert.ok(!fragment.querySelector(".g-team-settings-entry"), "no row: the card is on the page");
  assert.equal(fragment.querySelector("h2#team-settings-title").getAttribute("tabindex"), "-1", "the address of the settings puts the focus there");
  const MANAGE = "src/screens/team/manage/manage.css";
  assert.deepEqual(valuesOf(MANAGE, ".g-manage__cols", "grid-template-areas"), ['"resources side" "resources history" "resources settings"']);
  assert.deepEqual(valuesOf(MANAGE, ".g-manage__cols", "grid-template-rows"), ["auto auto 1fr"]);
  assert.deepEqual(valuesOf(MANAGE, ".g-manage__cols", "align-items"), ["start"], "the 1fr row stretches neither the history nor the card");
  assert.deepEqual(valuesOf(MANAGE, ".g-manage__resources", "grid-area"), ["resources"]);
  // The card's area is the settings' own sheet's; from 901px, as the columns are.
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = css.slice(css.indexOf("@media (min-width: 901px) {"));
  assert.match(desk, /\.g-manage__cols > \.g-team-settings \{ grid-area: settings; \}/);
  assert.deepEqual(valuesOf(SETTINGS, ".g-manage__cols > .g-team-settings", "grid-area"), ["settings"]);
});

// DeskBuilder.html's «Команда» card: `padding: 4px 24px 20px`, a radius of 16, `inset 0 0 0 1px #DCE3DF`, which is the
// kit's ring in --line-strong (the plan's token map, L9); its heading `padding: 18px 0 4px`, Oswald 700 22px. Builder.html
// draws the same rows with no frame, in the screen's body.
test("on a desk the card is DeskBuilder's team card: 24px at its sides, 4px over the heading's 18, a radius of 16 in the kit's ring", () => {
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = css.slice(css.indexOf("@media (min-width: 901px) {"));
  const rule = desk.match(/\n {2}\.g-team-settings \{([^}]*)\}/)?.[1] ?? "";
  const valueIn = (property) => rule.match(new RegExp(`(?:^|\\s)${property}: ([^;]+);`))?.[1];
  assert.deepEqual(["padding", "border-radius", "background", "box-shadow"].map(valueIn), ["var(--space-4) var(--space-24) var(--space-20)", "var(--radius-2xl)", "var(--surface)", "var(--ring)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings", "padding"), ["0", "var(--space-4) var(--space-24) var(--space-20)"], "no frame up to 900px (Builder.html)");
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings", "box-shadow"), ["var(--ring)"], "the ring is the desk's alone");
  const tokens = read("src/styles/tokens.css");
  const token = (name) => tokens.match(new RegExp(`${name}: ([^;]+);`))[1];
  assert.deepEqual(["--space-4", "--space-24", "--space-20", "--radius-2xl"].map(token), ["4px", "24px", "20px", "16px"]);
  assert.deepEqual([token("--ring"), token("--line-strong")], ["inset 0 0 0 1px var(--line-strong)", "#DCE3DF"], "the prototype's #DCE3DF ring");
  // The heading: 18px over it inside the card's 4px, 4px under; Oswald 22px on the font's own line. Only the desk's card draws it.
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__title", "padding"), ["18px 0 var(--space-4)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__title", "font"), ["700 22px/normal var(--font-display)"]);
  assert.equal(mount(manageMarkup(model(TEAMS[0], { phone: true, screen: "settings" }))).querySelector("h2"), null, "the phone's screen: its h1 names the rows");
});

test("the logo's frame shows the picture, or the image glyph Builder draws", () => {
  const frameOf = (options, team = TEAMS[0]) => rowOf("logo", mount(manageMarkup(model(team, options)))).querySelector(".g-team-settings__logo");
  for (const options of [{}, { phone: true, screen: "settings" }]) {
    const svg = frameOf(options).querySelector("svg.g-icon");
    assert.ok(svg, "no logo: a glyph");
    assert.equal(svg.getAttribute("width"), "18");
    assert.deepEqual(svg.querySelectorAll("rect").map((rect) => ["x", "y", "width", "height", "rx"].map((name) => rect.getAttribute(name))), [["3", "5", "18", "14", "2"]]);
    assert.deepEqual(svg.querySelectorAll("path").map((path) => path.getAttribute("d")), ["M3 15l5-5 4 4 3-3 6 6"], "Builder's picture, not a shield");
    const picture = frameOf(options, TEAMS[1]);
    assert.equal(picture.querySelector("img").getAttribute("src"), LOGO);
    assert.equal(picture.querySelector("svg"), null, "a logo: the picture alone");
  }
  // The frame: 40×40, a radius of 10, --surface-2 in the kit's ring, the glyph in --muted (the prototype's #8A948F, 07a/07b).
  const frame = (property) => valuesOf(SETTINGS, ".g-team-settings__logo", property);
  assert.deepEqual(["width", "height", "border-radius", "background", "box-shadow", "color"].map(frame), [["40px"], ["40px"], ["var(--radius-md)"], ["var(--surface-2)"], ["var(--ring)"], ["var(--muted)"]]);
});

// The rows the builder's card does not have (the name, Favoured of…, Dedicated Fans, the order, the check) are its lines too.
test("every line of the card is the builder's: 53px over its rule, the label 14px --muted; the check is one more such line", () => {
  const section = mount(manageMarkup(model(TEAMS[1]))).querySelector(".g-team-settings");
  assert.deepEqual(section.querySelectorAll(".g-team-settings__row").map((row) => row.getAttribute("data-settings-row")), ["name", "race", "league", "favoured", "logo", "fans", "order"]);
  assert.ok(section.querySelector(".g-team-settings__check .g-team-settings__label"), "a roster of one breaks the rules: the check, labelled as a row is");
  const check = (property) => valuesOf(SETTINGS, ".g-team-settings__check", property);
  assert.deepEqual([check("box-sizing"), check("min-height"), check("border-bottom")], [["border-box"], ["53px"], ["1px solid var(--line)"]]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__row", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__row", "gap"), ["var(--space-10)"]);
});

test("#/t/t1/settings on a desk is the team page, the focus on the card's title", async () => {
  await page("t1", { settings: true });
  assert.ok(view.querySelector('[data-screen="team-manage"]'), "the team page");
  assert.ok(!screenOf());
  const title = view.querySelector(".g-manage__cols section.g-team-settings h2#team-settings-title");
  assert.ok(title && document.activeElement === title, "the card's title, which the focus scrolls into view");
  // Its own address: the page's title.
  await page("t1");
  assert.ok(document.activeElement === view.querySelector("h1"));
});

// Review Focus 2, and L22 of the round's preflight: a node the other width does not draw takes the focus with it.
test("the settings' address follows the width: a phone turned desk draws the page with the card, and back (Review Focus 2)", async () => {
  await atWidth(true, async ({ cross, listeners }) => {
    await page("t1", { settings: true });
    assert.ok(screenOf());
    // The focus on «‹», which a desk does not draw: the card's title takes it, not the body.
    view.querySelector(".g-team-settings-screen__back").focus();
    cross(false);
    assert.ok(!screenOf());
    assert.ok(view.querySelector('[data-screen="team-manage"] .g-manage__cols section.g-team-settings'));
    assert.ok(document.activeElement === view.querySelector("h2#team-settings-title"), "the card's title");
    // A desk turned phone with the focus on a row's button: the screen's title.
    view.querySelector('[data-settings-open="name"]').focus();
    cross(true);
    assert.ok(screenOf());
    assert.ok(document.activeElement === view.querySelector("h1#team-settings-title"), "the screen's title");
    // The title itself is the same place on both widths.
    cross(false);
    assert.ok(document.activeElement === view.querySelector("h2#team-settings-title"));
    // A focus outside the screen stays where it is: a width that changes moves nothing of the coach's.
    const outside = el(document, "button", { type: "button" });
    document.body.appendChild(outside);
    outside.focus();
    cross(true);
    assert.ok(screenOf());
    assert.ok(document.activeElement === outside);
    outside.parentNode.removeChild(outside);
    // The team page's address: the row on a phone, the card on a desk, each the other's place for the focus.
    await page("t1");
    view.querySelector(".g-team-settings-entry a").focus();
    cross(false);
    assert.ok(!view.querySelector(".g-team-settings-entry"));
    assert.ok(document.activeElement === view.querySelector("h2#team-settings-title"), "the row's place: the card");
    view.querySelector('[data-settings-open="fans"]').focus();
    cross(true);
    assert.ok(!view.querySelector(".g-team-settings"));
    assert.ok(document.activeElement === view.querySelector(".g-team-settings-entry a"), "the card's place: the row");
    releaseCurrentScreen();
    assert.equal(listeners.size, 0, "a screen left listens no more");
  });
});

// T36 review m1: a sheet stands over the screen in a host of its own, and the rows under it may be drawn anew meanwhile.
test("a sheet left open across 900px gives the focus back to its row's button as the other width draws it, or to the row that leads to the settings", async () => {
  await atWidth(true, async ({ cross }) => {
    // The phone's screen turned desk, the sheet closed by its cross: the card's button in the place of the screen's.
    await page("t1", { settings: true });
    const before = view.querySelector('[data-settings-open="fans"]');
    before.focus();
    openRow("fans");
    // As a browser's showModal does, the focus is in the sheet.
    $("[data-sheet-close]").focus();
    cross(false);
    assert.ok(!screenOf() && sheetOpen(), "the page with the card; the sheet stays over it");
    fireEvent($("[data-sheet-close]"), "click");
    assert.equal(sheetOpen(), false);
    const card = view.querySelector('.g-manage__cols [data-settings-open="fans"]');
    assert.ok(card && card !== before, "the desk drew the row anew");
    assert.ok(document.activeElement === card, "the button the desk drew in its place, not the body");

    // The desk's team page turned phone, and the sheet saved there: no card, and the row that leads to the settings takes it.
    await page("t1");
    view.querySelector('[data-settings-open="fans"]').focus();
    openRow("fans");
    $('[data-resource-step="1"]').focus();
    cross(true);
    assert.ok(view.querySelector(".g-team-settings-entry") && !view.querySelector(".g-team-settings") && sheetOpen());
    fireEvent($('[data-resource-step="1"]'), "click");
    api.reply(PATCH, 200, { team: t1With({}, { dedicatedFans: 4 }) });
    await withoutTimers(async () => {
      fireEvent($("[data-settings-save]"), "click");
      await settled();
    });
    assert.deepEqual([calls(PATCH).length, sheetOpen(), toasts()], [1, false, ["Saved"]]);
    assert.ok(document.activeElement === view.querySelector(".g-team-settings-entry a"), "the row that leads to the settings");

    // A sheet closed with its button where it was: that button, as before (sheet-host.mjs).
    await page("t1", { settings: true });
    const opener = view.querySelector('[data-settings-open="name"]');
    opener.focus();
    openRow("name");
    $("#team-settings-name").focus();
    fireEvent($("[data-sheet-close]"), "click");
    assert.ok(document.activeElement === opener);
  });
});

// T36 review m4, as the overview's fix round 1: a node the patch keeps and the width's stylesheet hides drops the focus too.
test("the team page across 900px: a focus on what the other width's stylesheet hides goes to the page's title; from the settings, to the settings' place", async () => {
  await atWidth(false, async ({ cross }) => {
    await page("t1");
    // The desk's strip stays in the page on a phone, hidden (strip.css): its pencil is no place for the focus.
    const edit = view.querySelector(".g-funds__edit");
    edit.focus();
    edit.getClientRects = () => [];
    cross(true);
    assert.ok(edit.isConnected && view.querySelector(".g-funds__edit") === edit, "the same button, still in the page");
    assert.ok(document.activeElement === view.querySelector(".g-manage h1"), "the page's title, a place the keyboard goes on from");
    // And back: the phone's card's «+ Add», hidden from 901px (manage.css).
    const add = view.querySelector(".g-manage__in");
    add.focus();
    add.getClientRects = () => [];
    cross(false);
    assert.ok(add.isConnected && document.activeElement === view.querySelector(".g-manage h1"));
    // From the settings the settings' place, as before: the card on a desk, the row on a phone.
    view.querySelector('[data-settings-open="fans"]').focus();
    cross(true);
    assert.ok(document.activeElement === view.querySelector(".g-team-settings-entry a"));
    // A focus the width keeps and shows stays where it is.
    const fix = view.querySelector(".g-manage__fix");
    fix.focus();
    fix.getClientRects = () => [{ width: 200, height: 44 }];
    cross(false);
    assert.ok(document.activeElement === fix && fix.isConnected, "the correction's button is the same on both widths");
  });
});

// T37 review m4: the money sheet's openers stay in the page on both widths, each hidden on one (strip.css, manage.css).
test("a money sheet closed after the width crossed gives the focus to a button the width shows that opens it, else the page's title, never the body", async () => {
  await atWidth(false, async ({ cross }) => {
    await page("t1");
    const host = () => document.querySelector('[data-sheet-host="treasury-money"]');
    const openFrom = (button) => {
      button.focus();
      fireEvent(button, "click");
      assert.ok(host().querySelector("dialog#treasury-money").matches(":modal"));
    };
    const closeIt = () => fireEvent(host().querySelector("[data-sheet-close]"), "click");
    const hide = (...buttons) => { for (const button of buttons) button.getClientRects = () => []; };
    const show = (...buttons) => { for (const button of buttons) button.getClientRects = () => [{ width: 44, height: 44 }]; };
    const [edit, add, take] = [".g-funds__edit", ".g-manage__in", ".g-manage__out"].map((selector) => view.querySelector(selector));
    hide(add, take);
    openFrom(edit);
    hide(edit);
    show(add, take);
    cross(true);
    closeIt();
    assert.ok(document.activeElement === add, "the desk's pencil is hidden on a phone: the card's «+ Add» opens the same sheet");
    openFrom(take);
    hide(add, take);
    show(edit);
    cross(false);
    closeIt();
    assert.ok(document.activeElement === edit, "«− Take» is hidden on a desk: the strip's pencil");
    openFrom(edit);
    hide(edit);
    closeIt();
    assert.ok(document.activeElement === view.querySelector(".g-manage h1"), "none shown: the page's title");
  });
});

// T36 review m3: the reads draw the history, and perhaps a callout, over the desk's card after the first focus put it in view.
test("on a desk the settings' address puts the card in view again once the reads have drawn what stands over it", async () => {
  const arrive = async (settings, { moveFocus = false } = {}) => {
    coach({ userId: `u-scroll-${settings}-${moveFocus}` });
    const gate = api.hold(FIRST_PAGE);
    const drawn = renderTeamManage("t1", { settings });
    await waitHeld(gate);
    const title = view.querySelector("#team-settings-title");
    const scrolled = [];
    title.scrollIntoView = (options) => scrolled.push(options);
    if (moveFocus) view.querySelector('[data-settings-open="name"]').focus();
    gate.release();
    await drawn;
    assert.ok(view.querySelector("#team-settings-title") === title, "the same heading, patched");
    return scrolled;
  };
  assert.deepEqual(await arrive(true), [{ block: "nearest" }], "once, after the last draw");
  assert.ok(document.activeElement === view.querySelector("h2#team-settings-title"));
  assert.deepEqual(await arrive(true, { moveFocus: true }), [], "the coach has gone on: nothing is scrolled");
  assert.deepEqual(await arrive(false), [], "the team page's own address: its h1 has the focus");
  await atWidth(true, async () => {
    assert.deepEqual(await arrive(true), [], "a phone's settings are a screen of their own: nothing stands over its title");
    assert.ok(document.activeElement === view.querySelector("h1#team-settings-title"));
  });
});

test("D2: «‹» 44px; the row 44px or more; the head as Builder.html's", () => {
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = css.slice(css.indexOf("@media (max-width: 900px) {"), css.indexOf("@media (min-width: 901px) {"));
  for (const selector of [".g-team-settings-screen", ".g-team-settings-screen__head", ".g-team-settings-screen__back", ".g-team-settings-screen__title", ".g-team-settings-screen__body"]) {
    assert.ok(phone.includes(`${selector} {`), `${selector}: a phone's alone`);
  }
  const back = (property) => valuesOf(SETTINGS, ".g-team-settings-screen__back", property);
  assert.deepEqual([back("width"), back("height"), back("border-radius")], [["44px"], ["44px"], ["22px"]], "Builder.html's 40px circle, a thumb's 44px (D2)");
  assert.deepEqual(back("background"), ["color-mix(in srgb, var(--header-ink) 12%, transparent)"], "as the builder's «‹» (.g-build__head > .g-icon-btn)");
  assert.deepEqual([back("color"), back("text-decoration")], [["var(--header-ink)"], ["none"]]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-screen__head :focus-visible", "outline-color"), ["var(--header-ink)"]);
  assert.ok(Number.parseInt(valuesOf("src/ui/list-row.css", ".g-list-row", "min-height")[0], 10) >= 44, "the settings' row");
  const head = (property) => valuesOf(SETTINGS, ".g-team-settings-screen__head", property);
  assert.deepEqual([head("position"), head("top"), head("z-index")], [["sticky"], ["0"], ["3"]], "it sticks, as the profile's head");
  assert.deepEqual([head("padding"), head("background"), head("align-items"), head("gap")], [["var(--space-10) var(--space-16) var(--space-14)"], ["var(--header)"], ["center"], ["var(--space-10)"]]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-screen__title", "font"), ["600 22px/1.15 var(--font-display)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-screen__title", "overflow-wrap"), ["anywhere"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-screen__title:focus", "outline"), ["none"], "a place the keyboard starts from, not a control");
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-screen__sub", "font"), ["400 13px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-screen__body", "padding"), ["var(--space-4) var(--space-16) 28px"]);
  assertReadable(SETTINGS, ".g-team-settings-screen__title", "color", ["--header"], 4.5);
  assertReadable(SETTINGS, ".g-team-settings-screen__sub", "color", ["--header"], 4.5);
  assertReadable(SETTINGS, ".g-team-settings-screen__back", "color", ["--header"], 4.5);
  // The page reaches the screen's edges, the head sticking in a main that does not scroll (K3), as the profile's.
  assert.deepEqual(valuesOf(SETTINGS, ".g-frame #app-view:has(> .g-team-settings-screen)", "padding"), ["0"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-main:has(.g-team-settings-screen)", "overflow-x"), ["clip"]);
  // The row of the phone's page is framed as the history's card is.
  const entry = (property) => valuesOf(SETTINGS, ".g-team-settings-entry", property);
  assert.deepEqual([entry("padding"), entry("border"), entry("border-radius"), entry("background")], [["0 var(--space-16)"], ["1px solid var(--line)"], ["var(--radius-lg)"], ["var(--surface)"]]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings-entry .g-list-row", "border-bottom"), ["0"]);
});

test("the name: one PATCH with the new name and the roster, the race and the logo as the list holds them; the sheet closes, the shell's header says the new name (TeamNew)", async () => {
  await page();
  const opener = view.querySelector('[data-settings-open="name"]');
  opener.focus();
  openRow("name");
  assert.ok(sheetOpen());
  assert.equal($(".g-sheet__title").textContent, "Name", "the sheet is named as its row is (K18)");
  assert.equal($("label.g-field__label").textContent, "Name");
  assert.deepEqual([$("#team-settings-name").value, $("#team-settings-name").getAttribute("autocomplete")], ["Ashgrove Wardens", "off"]);
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), true, "nothing changed yet");
  assert.equal($("[data-settings-save]").textContent.trim(), "Save");
  type("   ");
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), true);
  assert.equal($(".g-field__error").textContent, "The name cannot be empty");
  assert.equal($("#team-settings-name").getAttribute("aria-invalid"), "true");
  type(" Rooks ");
  assert.equal($(".g-field__error"), null);
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), false);
  api.reply(PATCH, 200, { team: t1With({ name: "Rooks" }, { teamName: "Rooks" }) });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1);
  const { body } = calls(PATCH)[0];
  assert.deepEqual([body.name, body.baseTeamSlug, body.logoData, body.revision], ["Rooks", HUMAN, null, 3]);
  assert.equal(body.roster.teamName, "Rooks");
  assert.deepEqual(body.roster.players.map((player) => player.id), SQUAD.map((player) => player.id), "the roster as it was");
  assert.equal(body.roster.treasury, 70);
  assert.equal(sheetOpen(), false);
  assert.deepEqual(toasts(), ["Saved"]);
  assert.ok(document.activeElement === opener, "the focus is back on the row's button");
  assert.equal(rowText("name"), "Name · Rooks · Change");
  const header = mount(renderAppHeader(shellModel({ route: { name: "teamManage", params: { teamId: "t1" } }, user: { id: "u1", isAdmin: false }, team: state.myTeams.items[0], raceTitle: "Human" })));
  assert.equal(header.querySelector(".g-appbar__label").textContent, "Rooks", "the header draws the list's name");
});

test("the logo: a file sent at once; one too large or unreadable is said and nothing is sent; «Remove» sends an empty one", async () => {
  await page();
  const pick = (file) => fireEvent(Object.assign(view.querySelector("input#team-settings-logo"), { files: [file], value: "C:\\fakepath\\logo.png" }), "change");
  await withoutTimers(async () => {
    pick({ name: "big.png", size: logoUploadMaxBytes + 1, dataUrl: LOGO });
    await settled();
    assert.deepEqual(toasts(), ["Logo must be 2 MB or smaller."]);
    pick({ name: "paper.pdf", size: 100, dataUrl: "data:application/pdf;base64,JVBERi0=" });
    await settled();
    pick({ name: "broken.png", size: 100, failure: new Error("the file went away") });
    await settled();
    assert.equal(toasts().at(-1), "The logo could not be read: choose a PNG or JPG picture.");
    assert.equal(calls(PATCH).length, 0, "nothing is sent");
    api.reply(PATCH, 200, { team: t1With({ logoData: LOGO }) });
    pick({ name: "logo.png", size: 100, dataUrl: LOGO });
    await settled();
  });
  assert.equal(view.querySelector("input#team-settings-logo").value, "", "emptied: the same file may be picked again");
  assert.equal(calls(PATCH).length, 1);
  const { body } = calls(PATCH)[0];
  assert.deepEqual([body.name, body.baseTeamSlug, body.logoData, body.revision], ["Ashgrove Wardens", HUMAN, LOGO, 3]);
  assert.equal(body.roster.logoData, undefined, "the logo goes in its column once");
  assert.equal(toasts().at(-1), "Saved");
  assert.equal(rowOf("logo").querySelector(".g-team-settings__logo img").getAttribute("src"), LOGO);
  assert.equal(rowText("logo"), "Logo · Upload · Remove");
  api.reply(PATCH, 200, { team: t1With({ logoData: null, revision: 5 }) });
  await withoutTimers(async () => {
    press("[data-settings-logo-remove]");
    await settled();
  });
  assert.equal(calls(PATCH).length, 2);
  assert.deepEqual([calls(PATCH)[1].body.logoData, calls(PATCH)[1].body.revision], ["", 4]);
  assert.ok(!rowOf("logo").querySelector("img"));
  assert.ok(document.activeElement === view.querySelector("input#team-settings-logo"), "the button that held the focus is gone: the file field has it");
});

test("a god changed: the favoured skills that come off are named before «Save»; one PATCH", async () => {
  await page("t2");
  openRow("favoured");
  assert.equal($(".g-sheet__title").textContent, "Favoured of…", "K18");
  const list = $(".g-options");
  assert.equal(list.getAttribute("aria-label"), "Favoured of…");
  assert.deepEqual($(".g-options").querySelectorAll("[data-option-value]").map((card) => card.getAttribute("data-option-value")), ["Undivided", "Hashut", "Slaanesh", "Nurgle", "Khorne", "Tzeentch"]);
  assert.equal($('[data-option-value="Undivided"]').getAttribute("aria-checked"), "true");
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), true, "the god the team has");
  assert.equal($(".g-team-settings__drops"), null);
  fireEvent($('[data-option-value="Slaanesh"]'), "click");
  assert.equal($(".g-team-settings__drops").textContent, "These favoured skills come off: Rotter: Prehensile Tail");
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), false);
  fireEvent($('[data-option-value="Nurgle"]'), "click");
  assert.equal($(".g-team-settings__drops").textContent, "These favoured skills come off: Rotter: Prehensile Tail, Extra Arms");
  api.reply("PATCH /api/teams/t2", 200, { team: { ...structuredClone(TEAMS[1]), revision: 6 } });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls("PATCH /api/teams/t2").length, 1);
  const { body } = calls("PATCH /api/teams/t2")[0];
  assert.deepEqual([body.roster.favouredChoice, body.baseTeamSlug, body.logoData, body.revision], ["Nurgle", CHOSEN, LOGO, 5]);
  assert.deepEqual(body.roster.players[0].favouredSkills, [], "what Nurgle does not grant comes off");
  assert.equal(sheetOpen(), false);
});

test("a league changed: one of the race's own, one PATCH", async () => {
  await page("t4");
  openRow("league");
  assert.equal($(".g-sheet__title").textContent, "League");
  assert.equal($(".g-options").getAttribute("aria-label"), "League");
  fireEvent($('[data-option-value="Old World Classic"]'), "click");
  api.reply("PATCH /api/teams/t4", 200, { team: { ...structuredClone(TEAMS[2]), revision: 2, roster: { ...TEAMS[2].roster, selectedLeague: "Old World Classic" } } });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls("PATCH /api/teams/t4").length, 1);
  assert.equal(calls("PATCH /api/teams/t4")[0].body.roster.selectedLeague, "Old World Classic");
  assert.equal(rowText("league"), "League · Old World Classic · Change");
});

test("fans corrected: one PATCH with the count, the treasury untouched; at 6 «+» says why", async () => {
  await page();
  openRow("fans");
  assert.equal($(".g-sheet__title").textContent, "Dedicated Fans");
  assert.equal($(".g-resource__name").textContent, "Dedicated Fans");
  assert.equal($(".g-resource__note").textContent, "A correction moves no money");
  assert.equal($(".g-resource__value").textContent, "3");
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), true);
  const plus = () => $('[data-resource-step="1"]');
  for (let step = 0; step < 3; step += 1) fireEvent(plus(), "click");
  assert.equal($(".g-resource__value").textContent, "6");
  assert.deepEqual([plus().getAttribute("aria-disabled"), plus().getAttribute("title")], ["true", "Dedicated Fans: from 0 to 6"]);
  await withoutTimers(async () => fireEvent(plus(), "click"));
  assert.equal($(".g-resource__value").textContent, "6");
  assert.deepEqual(toasts(), ["Dedicated Fans: from 0 to 6"]);
  fireEvent($('[data-resource-step="-1"]'), "click");
  assert.equal($(".g-resource__value").textContent, "5");
  api.reply(PATCH, 200, { team: t1With({}, { dedicatedFans: 5 }) });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1);
  const { roster } = calls(PATCH)[0].body;
  assert.deepEqual([roster.dedicatedFans, roster.treasury, roster.coachesSafe], [5, 70, 20], "the fans alone; no money moves");
  assert.equal(rowText("fans"), "Dedicated Fans · 5 · Correct");
});

test("by number: one PATCH with the players in number order; in order already — said, and nothing sent", async () => {
  await page();
  const sorted = ["p2", "p3", "p4", "p5", "p6", "p7", "p1", "p8", "p9", "p10", "p11"];
  const inOrder = sorted.map((id) => SQUAD.find((player) => player.id === id));
  api.reply(PATCH, 200, { team: t1With({}, { players: inOrder }) });
  await withoutTimers(async () => {
    press("[data-settings-order]");
    press("[data-settings-order]");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1, "a second press while the first is on its way sends nothing");
  assert.deepEqual(calls(PATCH)[0].body.roster.players.map((player) => player.id), sorted);
  assert.deepEqual(toasts(), ["A save of the team is on its way", "Saved"]);
  await withoutTimers(async () => {
    press("[data-settings-order]");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1);
  assert.equal(toasts().at(-1), "The roster is in number order already");
});

// Owner, 2026-10-20: a coach does not change a team's race, and the page shows it and nothing more (Review Focus 5).
test("the race is read only on every width and in every state: «Race · Human · Tier 1», no button, no note — in the season or out of it, during a preparation, during a match", async () => {
  const states = [
    ["out of the season", {}, TEAMS[0]],
    ["in the season", {}, { ...TEAMS[0], inActiveSeason: true }],
    ["a match being prepared", { games: [preparingGame("t1")] }, TEAMS[0]],
    ["a match on", { games: [liveGame("t1")] }, TEAMS[0]],
  ];
  for (const [name, options, team] of states) {
    await page("t1", { ...options, teams: [team, ...TEAMS.slice(1)] });
    const rows = view.querySelectorAll('[data-settings-row="race"]');
    assert.equal(rows.length, 1, `${name}: one row for every width`);
    assert.equal(rowText("race"), "Race · Human · Tier 1", name);
    assert.deepEqual([rows[0].querySelectorAll("button, a, input, label").length, rows[0].querySelectorAll(".g-team-settings__note").length], [0, 0], `${name}: no button, no note`);
    assert.equal(view.querySelector('[data-settings-open="race"]'), null, name);
  }
  initLocale("ru");
  try {
    await page("t1");
    assert.equal(rowText("race"), "Раса · Human · Tier 1");
  } finally {
    initLocale("en");
  }
  // Nothing of the race is styled by the settings: no button, no list of races, no foot for a red button.
  const css = read(SETTINGS);
  assert.ok(!/\.g-races|data-race|g-sheet__foot|settings-race/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "no rule of the race's sheet is left");
});

test("no sheet of the settings lists the races", async () => {
  assert.deepEqual(SETTINGS_KINDS, ["name", "league", "favoured", "fans"]);
  for (const [teamId, kinds] of [["t1", ["name", "fans"]], ["t2", ["name", "favoured", "fans"]], ["t4", ["name", "league", "fans"]]]) {
    await page(teamId);
    assert.deepEqual(view.querySelectorAll("[data-settings-open]").map((button) => button.getAttribute("data-settings-open")), kinds, teamId);
    assert.equal(view.querySelector('[data-settings-open="race"]'), null, teamId);
    for (const kind of kinds) {
      openRow(kind);
      assert.ok(sheetOpen(), `${teamId}: ${kind}`);
      assert.deepEqual([$(".g-races"), $("[data-race]"), $("[data-settings-race]")], [null, null, null], `${teamId}: ${kind} lists no race`);
      fireEvent($("[data-sheet-close]"), "click");
    }
  }
});

// A preparation closes nothing of the settings (decision 20, final review I1): the section says what a save resets,
// and every opener stays as it is.
test("a preparation leaves every setting open and says what a save resets", async () => {
  for (const [teamId, kinds] of [["t1", ["name", "fans"]], ["t2", ["name", "favoured", "fans"]], ["t4", ["name", "league", "fans"]]]) {
    const team = TEAMS.find((item) => item.id === teamId);
    await page(teamId, { games: [preparingGame(teamId)] });
    const openers = view.querySelectorAll("[data-settings-open]");
    assert.deepEqual(openers.map((button) => button.getAttribute("data-settings-open")), kinds, teamId);
    assert.ok(openers.every((button) => !button.hasAttribute("aria-disabled") && !button.hasAttribute("title")), `${teamId}: every opener open`);
    assert.deepEqual(view.querySelectorAll(".g-team-settings .g-callout__title").map((title) => title.textContent), [PREP_WORDS], `${teamId}: what a save resets, nothing held`);
    assert.equal(model(team, { games: [preparingGame(teamId)] }).settings.held, "", `${teamId}: a preparation holds nothing`);
    for (const kind of kinds) {
      openRow(kind);
      assert.ok(sheetOpen(), `${teamId}: ${kind} opens`);
      assert.deepEqual(toasts(), [], `${teamId}: ${kind} says nothing of being held`);
      fireEvent($("[data-sheet-close]"), "click");
    }
  }
});

// Final review I1: every PATCH of the team moves its revision, and a preparation not yet in progress is built again
// from scratch on its next read, for both teams. Decision 20: nothing closes; the words say it before a save.
test("a preparation: the section and every sheet say what a save resets, before it goes; the page's warning names the settings (I1)", async () => {
  const prep = () => $(".g-team-settings__prep")?.textContent ?? null;
  await page("t1", { games: [preparingGame("t1")] });
  const section = view.querySelector(".g-team-settings");
  const callout = section.querySelector(".g-callout");
  assert.equal(callout.querySelector(".g-callout__title").textContent, PREP_WORDS);
  assert.match(callout.getAttribute("class"), /g-callout--warn/);
  const all = [...section.walk()];
  assert.ok(all.indexOf(callout) < all.indexOf(rowOf("logo")) && all.indexOf(callout) < all.indexOf(rowOf("order")), "said over the logo and «By number», which save at the press");
  for (const selector of ["[data-settings-order]", '[data-settings-open="name"]', '[data-settings-open="fans"]', "#team-settings-logo"]) {
    assert.equal(view.querySelector(selector).hasAttribute("aria-disabled"), false, `${selector} stays open`);
  }
  const warning = view.querySelector(".g-callout__sub").textContent;
  assert.equal(warning, "A purchase, a change of the treasury or of the team's settings resets the steps «Roster», «Inducements» and «Start». Fans and weather stay.");
  for (const [teamId, kind] of [["t1", "name"], ["t1", "fans"], ["t2", "favoured"], ["t4", "league"]]) {
    await page(teamId, { games: [preparingGame(teamId)] });
    openRow(kind);
    assert.ok(sheetOpen(), kind);
    assert.equal(prep(), PREP_WORDS, `${kind}: as every roster sheet says it (decision 20)`);
    const body = $(".g-team-settings__sheet").childNodes.filter((node) => node.nodeType === 1);
    assert.ok(body.at(-2) === $(".g-team-settings__prep"), `${kind}: under what is chosen, over the refusal`);
    assertStyled(document.querySelector(HOST), SETTINGS, "sheet.css", "button.css", "text-field.css", "option-card.css", "resource-counter.css", "callout.css");
  }
  assertReadable(SETTINGS, ".g-team-settings__prep", "color", ["--surface"], 4.5);
  // A save goes as it would: the preparation starts over on the server, as the words said.
  await page("t1", { games: [preparingGame("t1")] });
  openRow("name");
  type("Ashgrove Rooks");
  api.reply(PATCH, 200, { team: t1With({ name: "Ashgrove Rooks" }) });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1);
  // No preparation, no words: neither over the rows nor in a sheet.
  await page("t1");
  assert.ok(!view.querySelector(".g-team-settings .g-callout"));
  openRow("name");
  assert.equal(prep(), null);
  initLocale("ru");
  try {
    await page("t1", { games: [preparingGame("t1")] });
    const words = "Любая правка настроек сбросит шаги «Состав», «Индьюсменты» и «Старт». Фанаты и погода сохранятся.";
    assert.equal(view.querySelector(".g-team-settings .g-callout__title").textContent, words);
    assert.match(view.querySelector(".g-callout__sub").textContent, /^Покупка, правка казны или настроек команды сбросят шаги/);
    openRow("fans");
    assert.equal(prep(), words);
  } finally {
    initLocale("en");
  }
});

test("settings wait for the roster's queue: a step waiting closes every save of them, saying so, with the way to the roster (Review Focus 2)", async () => {
  coach({ userId: "u-queue" });
  // The roster's visit: the team read and tracked, and a step taken while the network is down.
  save.trackRoster(structuredClone(TEAMS[0]));
  api.fail(PATCH);
  assert.equal(save.stepSpp("t1", "p1", "touchdowns", 1).ok, true);
  for (let spins = 0; save.saveState("t1").status !== "offline"; spins += 1) {
    assert.ok(spins < 50, "the step waits for the network");
    await settle();
  }
  assert.equal(save.saveState("t1").waiting, 1);
  await renderTeamManage("t1");
  const callout = view.querySelector(".g-team-settings .g-callout");
  assert.equal(callout.querySelector(".g-callout__title").textContent, "Wait until the roster's edits are saved");
  assert.match(callout.getAttribute("class"), /g-callout--warn/);
  const link = callout.querySelector("a");
  assert.deepEqual([link.getAttribute("href"), link.textContent], ["#/t/t1/roster", "To the roster"]);
  const shut = view.querySelectorAll(".g-team-settings .g-team-settings__btn");
  assert.ok(shut.length >= 4 && shut.every((button) => button.getAttribute("aria-disabled") === "true" && button.getAttribute("title") === "Wait until the roster's edits are saved"));
  const file = view.querySelector("input#team-settings-logo");
  assert.deepEqual([file.hasAttribute("disabled"), file.getAttribute("aria-disabled"), file.getAttribute("title")], [false, "true", "Wait until the roster's edits are saved"]);
  const before = api.calls.length;
  await withoutTimers(async () => {
    openRow("name");
    press("[data-settings-order]");
    press('label[for="team-settings-logo"]');
  });
  assert.equal(sheetOpen(), false);
  assert.deepEqual(toasts(), Array(3).fill("Wait until the roster's edits are saved"), "each press says it");
  assert.equal(api.calls.length, before, "nothing is sent");
  // The queue saves its step: the settings open.
  api.reply(PATCH, 200, { team: t1With({}, { players: SQUAD.map((player, at) => (at ? player : { ...player, spp: { touchdowns: 1 } })) }) });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.ok(!view.querySelector(".g-team-settings .g-callout"));
  assert.ok(view.querySelectorAll(".g-team-settings .g-team-settings__btn").every((button) => !button.hasAttribute("aria-disabled")));
  assert.equal(view.querySelector("input#team-settings-logo").hasAttribute("aria-disabled"), false);
  openRow("name");
  assert.ok(sheetOpen());
});

test("the model says what holds the settings, in order: a match on, the roster's queue, a save on its way", () => {
  const live = model(TEAMS[0], { games: [liveGame("t1")], queue: { status: "offline", waiting: 1 } }).settings;
  assert.deepEqual([live.held, live.waitsRoster], [LIVE, false]);
  for (const queue of [{ status: "offline", waiting: 1 }, { status: "saving", waiting: 0 }, { status: "dirty", waiting: 0 }, { status: "conflict", waiting: 0 }, { status: "error", waiting: 0 }]) {
    const settings = model(TEAMS[0], { queue }).settings;
    assert.deepEqual([settings.held, settings.waitsRoster], ["Wait until the roster's edits are saved", true], JSON.stringify(queue));
  }
  for (const queue of [{ status: "saved", waiting: 0 }, { status: "idle", waiting: 0 }, { status: "offline", waiting: 0 }]) {
    assert.equal(model(TEAMS[0], { queue }).settings.held, "", JSON.stringify(queue));
  }
  const busy = manageModel({ team: TEAMS[0], race: raceOf(TEAMS[0]), seasonData: SEASON, games: [], ledger: held(), busy: true }).settings;
  assert.deepEqual([busy.held, busy.waitsRoster], ["A save of the team is on its way", false]);
  const settings = model(TEAMS[0]).settings;
  assert.deepEqual(
    [settings.name, settings.raceTitle, settings.tier, settings.league, settings.leagues, settings.favoured, settings.alignments, settings.fans, settings.violations, settings.logoData],
    ["Ashgrove Wardens", "Human", "Tier 1", "Old World Classic", ["Old World Classic"], "", [], 3, [], ""],
  );
  // The race is shown and never changed: nothing of the model is for a change of it.
  assert.deepEqual(["raceSlug", "inSeason", "players", "raceHeld"].filter((key) => key in settings), []);
});

// Review Focus 2, on the name's sheet (07d's second review took the race's, which this test was first written on).
test("a second press on «Save» sends nothing more; a lost answer reads the team again and sends nothing (Review Focus 2)", async () => {
  await page("t1", { userId: "u-lost" });
  openRow("name");
  type("Rooks");
  const gate = api.hold(PATCH);
  const save = () => $("[data-settings-save]");
  await withoutTimers(async () => {
    fireEvent(save(), "click");
    fireEvent(save(), "click");
    await waitHeld(gate);
    fireEvent(save(), "click");
    await settled(2);
    assert.equal(calls(PATCH).length, 1, "one PATCH");
    // Said by nothing but the button: a press that is refused is no «another save is on its way».
    assert.deepEqual([save().getAttribute("aria-busy"), save().textContent.trim(), save().hasAttribute("disabled"), alertText()], ["true", "Saving…", false, ""]);
    // The answer is lost: the server holds the list and the history as they were.
    api.reply(LIST, 200, { teams: structuredClone(TEAMS) });
    const sent = api.calls.length;
    gate.release({ error: new TypeError("Failed to fetch") });
    await settled();
    const after = api.calls.slice(sent).map((call) => call.key);
    assert.deepEqual([after.filter((key) => key === LIST).length, after.filter((key) => key === FIRST_PAGE).length], [1, 1], "the team and its history read again, once each");
  });
  assert.equal(calls(PATCH).length, 1, "never sent again by itself");
  assert.equal(alertText(), "No answer came: the site is reading the team again — check whether it was saved");
  assert.ok(sheetOpen(), "the sheet stays, to look");
  assert.equal($("#team-settings-name").value, "Ashgrove Wardens", "the choice starts over from the team as it is");
  assert.deepEqual([save().hasAttribute("disabled"), save().hasAttribute("aria-busy")], [true, false]);
  assert.ok(document.activeElement === $("#team-settings-name"), "the focus is on the field, not on a button gone dead");
});

// A write whose own code throws is a write of unknown fate (sheet-host's `submit`): the sheet leaves «Saving…» and the
// team and its history are read again, once each; nothing is sent.
test("a save whose own code throws leaves «Saving…», says nothing is known, and reads the team and its history again once each", async () => {
  await page("t1", { userId: "u-threw" });
  openRow("name");
  type("Rooks");
  // A roster that cannot be copied: the step throws before a request is made.
  state.myTeams.items[0].roster.uncopyable = () => {};
  api.reply(LIST, 200, { teams: structuredClone(TEAMS) });
  const sent = api.calls.length;
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  const after = api.calls.slice(sent).map((call) => call.key);
  assert.deepEqual([after.includes(PATCH), after.filter((key) => key === LIST).length, after.filter((key) => key === FIRST_PAGE).length], [false, 1, 1]);
  assert.equal(alertText(), en["treasury.mayHaveWritten"]);
  assert.ok(sheetOpen(), "the sheet stays, to look");
  assert.deepEqual([$("[data-settings-save]").hasAttribute("aria-busy"), $("#team-settings-name").value], [false, "Ashgrove Wardens"], "not on «Saving…»; the field starts over");
});

test("held, the file field stays in the tab order and says why; the focus on it is not dropped when a match goes live (M-4)", async () => {
  await page();
  const file = view.querySelector("input#team-settings-logo");
  file.focus();
  await notifyGames([liveGame("t1")]);
  assert.ok(view.querySelector(".g-team-settings .g-callout"), "the match holds the settings");
  assert.ok(view.querySelector("input#team-settings-logo") === file, "the same field: the section and its rows are keyed");
  assert.ok(document.activeElement === file, "the focus stays on the field");
  assert.deepEqual([file.hasAttribute("disabled"), file.getAttribute("aria-disabled"), file.getAttribute("title")], [false, "true", LIVE]);
  await withoutTimers(async () => {
    assert.equal(fireEvent(file, "click").defaultPrevented, true, "the picker does not open");
    fireEvent(Object.assign(file, { files: [{ name: "logo.png", size: 100, dataUrl: LOGO }] }), "change");
    await settled();
  });
  assert.deepEqual(toasts(), [LIVE, LIVE], "the press and the pick each say why");
  assert.equal(calls(PATCH).length, 0);
  // Not held, a press of the field opens the picker.
  await page();
  assert.equal(fireEvent(view.querySelector("input#team-settings-logo"), "click").defaultPrevented, false);
});

test("a logo the server refuses as too large is said in its words (M-6)", async () => {
  await page();
  api.reply(PATCH, 400, { error: { code: "LOGO_TOO_LARGE", params: {}, message: "x" } });
  await withoutTimers(async () => {
    fireEvent(Object.assign(view.querySelector("input#team-settings-logo"), { files: [{ name: "logo.png", size: 100, dataUrl: LOGO }] }), "change");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1);
  assert.equal(toasts().at(-1), en["error.LOGO_TOO_LARGE"]);
  assert.ok(!rowOf("logo").querySelector("img"), "the logo is as it was");
});

// Final review M2: the server holds a favoured skill a roll on the site was rerolled against (`checkKeptRerolls`); the
// god's change that takes it off is refused, and it is no advancement's to word.
test("a god's change the server refuses for a roll on the site is said in the settings' words, not the advancement's (M2)", async () => {
  await page("t2");
  openRow("favoured");
  fireEvent($('[data-option-value="Slaanesh"]'), "click");
  api.reply("PATCH /api/teams/t2", 422, { error: { code: "DICE_ROLL_MISMATCH", params: {}, message: "x" } });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls("PATCH /api/teams/t2").length, 1);
  assert.equal(alertText(), "A roll on the site was rerolled against a favoured skill this change takes off: that skill stays, so nothing was saved.");
  assert.ok(!alertText().includes(en["error.DICE_ROLL_MISMATCH"]));
  assert.ok(sheetOpen(), "the sheet stays, with the god chosen");
  assert.equal($('[data-option-value="Slaanesh"]').getAttribute("aria-checked"), "true");
  assert.equal(ru["teamSettings.refusal.DICE_ROLL_MISMATCH"], "Против навыка Favoured, который снимает эта правка, переброшен бросок с сайта: навык остаётся, поэтому ничего не сохранено.");
  // Any other refusal of the server's own is said as every save says it.
  api.reply("PATCH /api/teams/t2", 422, { error: { code: "STAGE_PURCHASE_LOCKED", params: {}, message: "x" } });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(alertText(), en["error.STAGE_PURCHASE_LOCKED"]);
});

// Final review M3: the server never forced a roster's `teamSlug` to its column. A team stored so — an old import, a
// content rename — saves as it did before stage 07d, under the column's race: nothing throws.
test("a team whose stored roster names another race than its column still saves: a resource of stage 08, a setting (M3)", async () => {
  const legacy = t1With({ revision: 3 }, { teamSlug: "teams/humans" });
  await page("t1", { teams: [legacy, ...TEAMS.slice(1)] });
  const roster = (call) => [call.body.baseTeamSlug, call.body.roster.teamSlug];
  api.reply(PATCH, 200, { team: t1With({ revision: 4 }, { teamSlug: HUMAN, cheerleaders: 1, treasury: 60 }) });
  await withoutTimers(async () => {
    fireEvent(view.querySelector('[data-resource-key="cheerleaders"] [data-resource-step="1"]'), "click");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1, "the resource's save goes, as before 07d");
  assert.deepEqual(roster(calls(PATCH)[0]), [HUMAN, HUMAN], "under the team's race, as every save of the team page writes it");
  assert.equal(calls(PATCH)[0].body.roster.cheerleaders, 1);
  assert.ok(!toasts().some((said) => said.includes("saveTeamRoster")), "no developer's words");
  await page("t1", { teams: [legacy, ...TEAMS.slice(1)] });
  api.reply(PATCH, 200, { team: t1With({ name: "Ashgrove Rooks", revision: 4 }) });
  openRow("name");
  type("Ashgrove Rooks");
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1, "a setting's save goes too");
  assert.equal(calls(PATCH)[0].body.name, "Ashgrove Rooks");
});

test("a 409: the team as the server holds it, and the words to look and save again", async () => {
  await page();
  openRow("name");
  type("Rooks");
  const elsewhere = t1With({ name: "Iron Wardens", revision: 9 }, { teamName: "Iron Wardens" });
  api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: elsewhere });
  await withoutTimers(async () => {
    fireEvent($("[data-settings-save]"), "click");
    await settled();
  });
  assert.equal(calls(PATCH).length, 1);
  assert.equal(alertText(), "The team was changed on another device: look at it and save again");
  assert.ok(sheetOpen());
  assert.equal(state.myTeams.items[0].revision, 9);
  assert.equal($("#team-settings-name").value, "Iron Wardens", "the field shows the team as it is now");
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), true);
  assert.equal(rowText("name"), "Name · Iron Wardens · Change");
  assert.equal(calls(FIRST_PAGE).length, 2, "the history is read again with it");
});

test("a match on closes them, saying why; another tab's coach sends nothing", async () => {
  await page("t1", { games: [liveGame("t1")] });
  const callout = view.querySelector(".g-team-settings .g-callout");
  assert.equal(callout.querySelector(".g-callout__title").textContent, LIVE);
  assert.ok(!callout.querySelector("a"), "the page's own callout says where the match is");
  const buttons = view.querySelectorAll(".g-team-settings .g-team-settings__btn");
  assert.ok(buttons.length >= 4 && buttons.every((button) => button.getAttribute("aria-disabled") === "true" && button.getAttribute("title") === LIVE));
  const file = view.querySelector("input#team-settings-logo");
  assert.deepEqual([file.hasAttribute("disabled"), file.getAttribute("aria-disabled"), file.getAttribute("title")], [false, "true", LIVE], "in the tab order, with its reason (M-4)");
  const before = api.calls.length;
  await withoutTimers(async () => {
    openRow("name");
    openRow("fans");
    press("[data-settings-order]");
  });
  assert.equal(sheetOpen(), false);
  assert.deepEqual(toasts(), Array(3).fill(LIVE), "each press says why");
  assert.equal(api.calls.length, before);

  // A sheet open when the match goes live: its button is shut, and a press sends nothing.
  await page();
  openRow("name");
  type("Rooks");
  state.games.items = [liveGame("t1")];
  fireEvent($("[data-settings-save]"), "click");
  await settled();
  assert.equal(calls(PATCH).length, 0);
  assert.equal($(".g-team-settings__sheet .g-callout__title").textContent, LIVE);
  assert.equal($("[data-settings-save]").hasAttribute("disabled"), true);

  // Another tab signed in or out: nothing goes.
  await page();
  openRow("name");
  type("Rooks");
  api.items.set(TOKEN, "other-tab");
  fireEvent($("[data-settings-save]"), "click");
  await settled();
  assert.equal(alertText(), en["auth.otherTab"]);
  assert.equal(calls(PATCH).length, 0);
});

test("the roster's violations are listed when there are any", () => {
  const blitzers = [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3].map((rowIndex, at) => ({ id: `b${at + 1}`, rowIndex, number: String(at + 1), name: `B${at + 1}` }));
  const team = { ...TEAMS[0], roster: { ...TEAMS[0].roster, players: blitzers } };
  const fragment = mount(manageMarkup(model(team)));
  const check = fragment.querySelector(".g-team-settings__check");
  assert.equal(check.querySelector(".g-team-settings__label").textContent, "Roster check");
  assert.deepEqual(check.querySelectorAll(".g-team-settings__violation").map((line) => line.textContent), ["Blitzer: maximum is 2."]);
  const empty = mount(manageMarkup(model(TEAMS[2])));
  assert.deepEqual(empty.querySelectorAll(".g-team-settings__violation").map((line) => line.textContent), [en["validation.ROSTER_MIN_PLAYERS"].replace("{min}", "7").replace("{count}", "0")]);
});

test("names are text", async () => {
  const team = { ...TEAMS[0], name: HOSTILE, logoData: HOSTILE };
  const fragment = mount(manageMarkup(model(team)));
  assert.ok(!fragment.querySelector(".g-team-settings img"), "a logo that is no picture is not drawn");
  assert.equal(rowOf("name", fragment).querySelector("b").textContent, HOSTILE);
  assertCspSafe(fragment);
  await page("t1", { teams: [team, ...TEAMS.slice(1)] });
  openRow("name");
  assert.equal($("#team-settings-name").value, HOSTILE);
  assert.ok(!document.querySelector(HOST).querySelector("img"));
  assertCspSafe(document.querySelector(HOST));
});

test("every key in both dictionaries, with the same placeholders; Russian words", () => {
  assertDictionaryCovers("src/screens/team/manage/settings.mjs", "src/screens/team/manage/settings-sheet.mjs", "src/screens/team/manage/settings-screen.mjs");
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  const keys = Object.keys(en).filter((key) => key.startsWith("teamSettings."));
  assert.ok(keys.length >= 30, String(keys.length));
  for (const key of keys) {
    assert.ok(ru[key], `ru ${key}`);
    assert.deepEqual(placeholders(ru[key]), placeholders(en[key]), key);
  }
  assert.deepEqual(Object.keys(ru).filter((key) => key.startsWith("teamSettings.")).sort(), [...keys].sort());
  assert.deepEqual([en["teamSettings.entryDesc"], ru["teamSettings.entryDesc"]], ["Name, league, logo, Dedicated Fans, roster order", "Название, лига, логотип, Dedicated Fans, порядок в составе"]);
  assert.deepEqual([en["teamSettings.backLabel"], ru["teamSettings.backLabel"]], ["Back to the team page", "Назад на страницу «Команда»"]);
  assert.equal(en["teamSettings.favoured"], "Favoured of…");
  assert.equal(ru["teamSettings.favoured"], "Favoured of…");
  initLocale("ru");
  try {
    const fragment = mount(manageMarkup(model(TEAMS[0])));
    assert.equal(fragment.querySelector("#team-settings-title").textContent, "Настройки команды");
    assert.equal(rowText("name", fragment), "Название · Ashgrove Wardens · Изменить");
    assert.equal(rowText("order", fragment), "Порядок в составе · По номерам");
    assert.equal(rowText("fans", fragment), "Dedicated Fans · 3 · Исправить");
  } finally {
    initLocale("en");
  }
});

test("styled: the section, its callout, and every sheet; nothing the CSP refuses", async () => {
  const section = (team, options) => mount(manageMarkup(model(team, options))).querySelector(".g-team-settings");
  const sheets = [SETTINGS, "button.css", "callout.css"];
  assertStyled(section(TEAMS[0]), ...sheets);
  assertStyled(section(TEAMS[1], { queue: { status: "offline", waiting: 1 } }), ...sheets);
  assertStyled(section(TEAMS[2]), ...sheets);
  assertCspSafe(section(TEAMS[1]));
  // The phone's screen and the phone's row: the screen's head, its body, the row's frame.
  const screen = mount(manageMarkup(model(TEAMS[1], { phone: true, screen: "settings", gamesUnknown: true, queue: { status: "offline", waiting: 1 } })));
  assertStyled(screen, ...sheets);
  assertCspSafe(screen);
  const entry = mount(manageMarkup(model(TEAMS[0], { phone: true }))).querySelector(".g-team-settings-entry");
  assertStyled(entry, SETTINGS, "list-row.css");
  for (const [teamId, kind] of [["t1", "name"], ["t1", "fans"], ["t2", "favoured"], ["t4", "league"]]) {
    await page(teamId);
    openRow(kind);
    if (kind === "favoured") fireEvent($('[data-option-value="Slaanesh"]'), "click");
    const host = document.querySelector(HOST);
    assertStyled(host, SETTINGS, "sheet.css", "src/screens/teams/new.css", "button.css", "text-field.css", "option-card.css", "resource-counter.css", "callout.css");
    assertCspSafe(host);
  }
});

test("readable: the labels and notes in --muted, the violations in --danger, the buttons in --ink-2, the drops on the warning's tint", () => {
  for (const selector of [".g-team-settings__label", ".g-team-settings__note"]) assertReadable(SETTINGS, selector, "color", ["--surface", "--page"], 4.5);
  assertReadable(SETTINGS, ".g-team-settings__violation", "color", ["--surface", "--page"], 4.5);
  assertReadable(SETTINGS, ".g-team-settings__btn", "color", ["--surface"], 4.5);
  assertReadable(SETTINGS, ".g-team-settings__value", "color", ["--surface", "--page"], 4.5);
  assertReadable("src/screens/teams/new.css", ".g-races__resets", "color", ["--warn-tint"], 4.5);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__label", "font"), ["400 14px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__value", "font"), ["700 15px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__title", "font"), ["700 22px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__violation", "font"), ["400 14px/1.4 var(--font-body)"]);
  // Builder's 52px and 60px are content-box, over a 1px rule: 53px and 61px as drawn.
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__row", "min-height"), ["53px"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__row", "box-sizing"), ["border-box"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__row--logo", "min-height"), ["61px"]);
  assert.deepEqual([valuesOf(SETTINGS, ".g-team-settings__logo", "width"), valuesOf(SETTINGS, ".g-team-settings__logo", "height"), valuesOf(SETTINGS, ".g-team-settings__logo", "border-radius")], [["40px"], ["40px"], ["var(--radius-md)"]]);
  // The logo's frame rings as the builder's does, the prototype's #DCE3DF (fix round 1, M-1).
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__logo", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf("src/screens/teams/builder.css", ".g-build__logo", "box-shadow"), ["var(--ring)"]);
  assert.ok(!read(SETTINGS).includes("--danger-fill"), "the red fill is the danger button's alone (button.css)");
  assert.ok(!read(SETTINGS).includes("--focus-ring"), "the focus ring is base.css's");
});

// Builder's «Загрузить»: `min-height: 36px; padding: 0 12px; border: 0; border-radius: 10px; background: #FFFFFF;
// box-shadow: inset 0 0 0 1px #C9D3CE`, 14/600 #3E4A44. D2: a finger's 44px up to 900px.
test("a row's button is Builder's «Upload»: the ring inside it, 14/600 --ink-2; 36px at a desk, 44px up to 900px", () => {
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf("@media (min-width: 901px) {");
  const [phone, desk] = [css.slice(0, start), css.slice(start)];
  const heightIn = (text) => text.match(/\.g-team-settings__btn \{[^}]*min-height: ([^;]+);/)?.[1];
  const tokens = read("src/styles/tokens.css");
  const token = (name) => tokens.match(new RegExp(`${name}: ([^;]+);`))[1];
  assert.equal(heightIn(phone), "var(--size-touch)");
  assert.equal(token("--size-touch"), "44px");
  assert.ok(Number.parseInt(heightIn(desk), 10) >= 24, heightIn(desk));
  assert.equal(heightIn(desk), "36px");
  const button = (property) => valuesOf(SETTINGS, ".g-team-settings__btn", property);
  assert.deepEqual([button("border"), button("box-shadow")], [["0"], ["inset 0 0 0 1px var(--control-border)"]], "a ring inside it on both widths, not a border");
  assert.equal(token("--control-border"), "#C9D3CE");
  assert.deepEqual(["padding", "border-radius", "background", "color", "font"].map(button), [["0 var(--space-12)"], ["var(--radius-md)"], ["var(--surface)"], ["var(--ink-2)"], ["600 14px/1.2 var(--font-body)"]]);
  assert.deepEqual([token("--space-12"), token("--radius-md")], ["12px", "10px"]);
  // A desk changes its height only.
  assert.deepEqual([...desk.matchAll(/\.g-team-settings__btn \{([^}]*)\}/g)].map(([, body]) => body.trim()), ["min-height: 36px;"]);
});

test("a long team name wraps; nothing is cut with «…»; breakpoints only 900/901; settings.css comes after fix.css (K5)", () => {
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/text-overflow:\s*ellipsis/.test(css));
  assert.ok(!/white-space:\s*nowrap/.test(css));
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__value b", "overflow-wrap"), ["anywhere"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__violation", "overflow-wrap"), ["anywhere"]);
  // At 320px with a logo the buttons wrap before «Logo» runs into them (fix round 1, M-2): the buttons may shrink and
  // wrap; the logo's side takes what they leave and never shrinks under its longest word.
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__actions", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__actions", "flex"), ["0 1 auto"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__row > .g-team-settings__logo-line", "flex"), ["1 1 0"]);
  assert.deepEqual(valuesOf(SETTINGS, ".g-team-settings__logo-line", "min-width"), []);
  for (const query of [...css.matchAll(/@media[^{]+/g)].map(([found]) => found.trim())) {
    assert.match(query, /^@media \((max-width: 900px|min-width: 901px)\)$/);
  }
  const styles = read("src/styles.css");
  const at = (path) => styles.indexOf(`@import url("${path}");`);
  assert.ok(at("screens/team/roster/fix.css") >= 0 && at("screens/team/manage/settings.css") > at("screens/team/roster/fix.css"));
  // The block is the team's settings' own: the account's settings screen is `.g-settings` (src/screens/settings/settings.css).
  const others = [...styles.matchAll(/@import url\("([^"]+)"\);/g)].map(([, path]) => `src/${path}`).filter((path) => path !== SETTINGS);
  assert.ok(others.every((path) => !read(path).includes(".g-team-settings")), "no other stylesheet styles the team's settings");
  assert.ok(!css.includes(".g-settings"), "nor do they style the account's settings");
});

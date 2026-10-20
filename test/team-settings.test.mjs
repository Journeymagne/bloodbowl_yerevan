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
const PREP_WORDS = "Any save of the settings resets the steps «Roster», «Inducements» and «Kick / receive». Fans and weather stay.";

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
/** The page's model of a team: the games given, the roster's queue at rest unless it is given. */
function model(team, { games = [], queue } = {}) {
  return manageModel({ team, race: raceOf(team), seasonData: SEASON, games, ledger: held(), queue });
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

/** The team page of `teamId`, drawn and read. */
async function page(teamId = "t1", options = {}) {
  coach({ ...options, active: teamId });
  await renderTeamManage(teamId);
}

test("the team page ends with the team's settings, as the builder's team card draws them (Builder)", () => {
  const fragment = mount(manageMarkup(model(TEAMS[0])));
  const section = fragment.querySelector("section.g-team-settings");
  assert.equal(section.getAttribute("aria-labelledby"), "team-settings-title");
  assert.equal(fragment.querySelector("h2#team-settings-title").textContent, "Team settings");
  const all = [...fragment.walk()].filter((node) => node.nodeType === 1);
  assert.ok(all.indexOf(section) > all.indexOf(fragment.querySelector(".g-manage__cols")), "after the columns");
  const blocks = fragment.querySelector(".g-manage").childNodes.filter((node) => node.nodeType === 1);
  assert.ok(blocks.at(-1) === section, "the page's last block");
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
  assert.ok(rowOf("logo", fragment).querySelector(".g-team-settings__logo svg"), "no logo: the shield");
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
  assert.equal(warning, "A purchase, a change of the treasury or of the team's settings resets the steps «Roster», «Inducements» and «Kick / receive». Fans and weather stay.");
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
    const words = "Любая правка настроек сбросит шаги «Состав», «Индусменты» и «Удар / приём». Фанаты и погода сохранятся.";
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

test("on a desk the settings are a card across the page under the columns (DeskRosterFunds)", () => {
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = css.slice(css.indexOf("@media (min-width: 901px) {"));
  assert.ok(desk.length > 30, "a desk's block");
  const rule = desk.match(/\n {2}\.g-team-settings \{([^}]*)\}/)?.[1] ?? "";
  for (const [property, value] of [["padding", "var(--space-20)"], ["border-radius", "var(--radius-2xl)"], ["background", "var(--surface)"], ["box-shadow", "inset 0 0 0 1px var(--line)"]]) {
    assert.match(rule, new RegExp(`${property}: ${value.replace(/[()]/g, "\\$&")};`), property);
  }
  // A block after the columns of a column of blocks spans the page: the section is not one of the columns' grid areas.
  assert.deepEqual(valuesOf("src/screens/team/manage/manage.css", ".g-manage", "flex-direction"), ["column"]);
  assert.ok(!mount(manageMarkup(model(TEAMS[0]))).querySelector(".g-manage__cols .g-team-settings"));
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
  assertDictionaryCovers("src/screens/team/manage/settings.mjs", "src/screens/team/manage/settings-sheet.mjs");
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  const keys = Object.keys(en).filter((key) => key.startsWith("teamSettings."));
  assert.ok(keys.length >= 30, String(keys.length));
  for (const key of keys) {
    assert.ok(ru[key], `ru ${key}`);
    assert.deepEqual(placeholders(ru[key]), placeholders(en[key]), key);
  }
  assert.deepEqual(Object.keys(ru).filter((key) => key.startsWith("teamSettings.")).sort(), [...keys].sort());
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

test("D2: the settings' buttons 44px up to 900px, 24px or more from 901px (36px, as the builder's)", () => {
  const css = read(SETTINGS).replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf("@media (min-width: 901px) {");
  const [phone, desk] = [css.slice(0, start), css.slice(start)];
  const heightIn = (text) => text.match(/\.g-team-settings__btn \{[^}]*min-height: ([^;]+);/)?.[1];
  assert.equal(heightIn(phone), "var(--size-touch)");
  assert.equal(read("src/styles/tokens.css").match(/--size-touch: (\d+)px;/)[1], "44");
  assert.ok(Number.parseInt(heightIn(desk), 10) >= 24, heightIn(desk));
  assert.equal(heightIn(desk), "36px");
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t1/team", replace() {} };
const { manageMarkup, manageModel, renderTeamManage } = await import("../src/screens/team/manage/index.mjs");
const { renderTeamOverview } = await import("../src/screens/team/overview.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { setMyTeams } = await import("../src/data/teams.mjs");
const { readLedger } = await import("../src/data/treasury.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(read(`src/i18n/${locale}.json`)));
const RACES = expandCollections(JSON.parse(read("public/data.en.json"))).teams;
const CSS = "src/screens/team/manage/manage.css";
const TOKEN = "gata-league-auth-token";
const FIRST_PAGE = "GET /api/teams/t1/ledger?limit=20";
const DAY = "2026-10-18T12:00:00Z";
const SINCE = "2026-10-01T12:00:00Z";

// Round 7 is on; t1 is in the table.
const SEASON = { season: { id: "s1", name: "Mock Season", currentRound: 7 }, standings: [{ team: { id: "t1" }, rank: 1, points: 9 }] };
const TEAMS = [
  {
    id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", logoData: null, revision: 3, stage: "active", inActiveSeason: true,
    roster: { treasury: 70, coachesSafe: 20, startingRerolls: 2, teamRerolls: 1, assistantCoaches: 1, players: [] },
  },
  { id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/norse", logoData: null, revision: 1, stage: "draft", inActiveSeason: false, roster: { treasury: 1000, players: [] } },
  { id: "t5", name: "Stone Delvers", baseTeamSlug: "teams/dwarf", logoData: null, revision: 2, stage: "active", inActiveSeason: false, roster: { treasury: 120, players: [] } },
];

/** A line of the history as the server writes it. */
const line = (id, extra = {}) => ({ id, kind: "match_income", delta: 60, balanceAfter: 130, reason: null, note: null, pairingId: null, createdAt: DAY, ...extra });
/** Four lines, newest first; the deposit to the safe is the fourth, past the three the history shows folded. */
const LINES = [line("l4"), line("l3", { kind: "manual", reason: "sponsor", delta: 10 }), line("l2", { kind: "staff", delta: -50 }), line("l1", { kind: "safe", delta: -20 })];
/** What `ledgerOf` holds once the history is read. */
const held = (entries = LINES) => ({ entries, next: null, since: SINCE, total: entries.length, loaded: true, loading: false, error: "" });
const pageOf = (entries = LINES) => ({ entries, next: null, since: SINCE, total: entries.length });

/** A league match of round 7, t1 at home: as the games list sends it. */
const game = (teamId, over) => ({
  id: "g1", kind: "league", roundNumber: 7, roundStatus: "started", season: { id: "s1", name: "Mock Season", currentRound: 7 },
  resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started", updatedAt: DAY,
  home: { user: { id: "u1", login: "coach" }, team: { id: teamId, name: "Ours", baseTeamSlug: "teams/human" } },
  away: { user: { id: "u9", login: "rival" }, team: { id: "r1", name: "Rival", baseTeamSlug: "teams/dwarf" } },
  ...over,
});
const liveGame = (teamId) => game(teamId, { preparationStatus: "in_progress", postMatchStatus: "draft" });
const preparingGame = (teamId) => game(teamId, { preparationStatus: "preparing" });

const raceOf = (team) => RACES.find((race) => race.slug === team.baseTeamSlug) ?? null;
/** What the screen gives the model for a team of the fixtures: the games given (none by default), its history read; a desk unless `phone`. */
function model(id, { games = [], ledger = held(), expanded = false, busy = false, gamesUnknown = false, phone = false } = {}) {
  const team = TEAMS.find((item) => item.id === id);
  return manageModel({ team, race: raceOf(team), seasonData: SEASON, games, ledger, expanded, busy, gamesUnknown, phone });
}

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const toasts = () => document.querySelectorAll("output").map((node) => ({ text: node.textContent, tone: node.className }));
const hosts = (name) => document.querySelectorAll(`[data-sheet-host="${name}"]`).length;
/** The team t1 as a write's answer brings it: the roster changed as given, the next revision. */
const t1With = (changes) => ({ ...structuredClone(TEAMS[0]), revision: 4, roster: { ...TEAMS[0].roster, ...changes } });

/**
 * A coach signed in on a page that has read the list, the table and the games; the screen before is left and its
 * toasts are gone. `userId` keeps the history cache of one test from another's (it is kept per coach and team).
 */
function coach({ games = [], userId = "u1" } = {}) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  state.auth.currentUser = { id: userId, login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: structuredClone(TEAMS), loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = { teams: RACES };
  state.season = { data: SEASON, loaded: true, loading: false, error: "" };
  state.games = { items: games, currentItems: [], loaded: true, loading: false, error: "" };
  // The page reads the games again on entry (final I-2): the server answers the same list unless a test says otherwise.
  api.reply("GET /api/games", 200, { games, currentGames: [] });
}

/** The server answering the games again: the list as it is now. */
async function notifyGames(games) {
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  await invalidateGames();
}

test("a team in the season: the head with the round, the phone's card, the desk strip, the safe, the resources and the history (TeamManage, DeskRosterFunds)", () => {
  const fragment = mount(manageMarkup(model("t1")));
  assert.equal(fragment.querySelector("h1").textContent, "Treasury and resources");
  assert.equal(fragment.querySelector(".g-pagehead--phone .g-pagehead__meta .g-status").textContent, "Season on · round 7");
  assert.match(fragment.querySelector(".g-pagehead__sub").textContent, /^TV \d/);
  assert.equal(fragment.querySelector('.g-manage__card [data-treasury-sign="1"]').getAttribute("data-treasury-money"), "t1");
  assert.ok(fragment.querySelector('[data-treasury-strip="t1"]'));
  assert.ok(fragment.querySelector(".g-manage__safe"));
  assert.ok(fragment.querySelector('[data-resource-key="teamRerolls"]'));
  assert.ok(fragment.querySelector(".g-manage__history"));
  assert.equal(fragment.querySelectorAll("h1").length, 1);
  assert.equal(fragment.querySelector('[data-screen="team-manage"]').getAttribute("class"), "g-manage");
});

test("the phone's card: the treasury, the team's value, «+ Add» and «− Take» that open the strip's sheet; the safe and its correction", () => {
  const page = model("t1");
  assert.deepEqual([page.treasury, page.safe, page.teamId, page.team.id], [70, 20, "t1", "t1"]);
  assert.equal(typeof page.worth, "number");
  const fragment = mount(manageMarkup(page));
  const card = fragment.querySelector("section.g-manage__card");
  assert.equal(card.getAttribute("aria-labelledby"), "manage-card-title");
  assert.equal(fragment.querySelector("#manage-card-title").textContent, "Treasury");
  assert.equal(card.querySelector(".g-manage__card-sum").textContent, "70k");
  assert.equal(card.querySelector(".g-manage__card-tv").textContent, fragment.querySelector(".g-pagehead__sub").textContent, "the value the desk's head says");
  const [add, take] = card.querySelectorAll("button");
  assert.deepEqual([add.getAttribute("class"), add.getAttribute("type"), add.getAttribute("data-treasury-sign"), add.textContent], ["g-manage__in", "button", "1", "+ Add"]);
  assert.deepEqual([take.getAttribute("class"), take.getAttribute("data-treasury-money"), take.getAttribute("data-treasury-sign"), take.textContent], ["g-manage__out", "t1", "-1", "− Take"]);
  assert.ok([add, take].every((button) => !button.hasAttribute("aria-disabled") && !button.hasAttribute("title")));
  assert.equal(fragment.querySelector(".g-manage__safe-amount").textContent, "20k");
  const fix = fragment.querySelector("button.g-manage__fix");
  assert.deepEqual([fix.getAttribute("data-treasury-fix"), fix.textContent, fix.hasAttribute("aria-disabled")], ["t1", "Correct the treasury by hand", false]);
});

test("the DOM is in the phone's order: the head, the card, the safe and its correction, the resources, the history (decision 19)", () => {
  const fragment = mount(manageMarkup(model("t1", { games: [preparingGame("t1")] })));
  const order = [".g-pagehead", ".g-callout", ".g-funds", ".g-manage__card", ".g-manage__safe", ".g-manage__fix", ".g-manage__resources", ".g-manage__history"];
  const all = [...fragment.walk()].filter((node) => node.nodeType === 1);
  const at = order.map((selector) => all.indexOf(fragment.querySelector(selector)));
  assert.ok(at.every((index) => index >= 0), String(at));
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "in the order the phone shows them");
  assert.ok(fragment.querySelector(".g-manage__side .g-manage__safe") && fragment.querySelector(".g-manage__side .g-manage__fix"));
  assert.equal(fragment.querySelector(".g-manage__side .g-manage__history"), null, "the history follows the resources, as on a phone");
});

// Stage 07d, owner's second review (decision 57): the settings are a screen of their own on a phone, and the page leads there.
test("the phone's page keeps stage 08's order — the card, the safe, the correction, the resources, the history — and then the settings' row", () => {
  const fragment = mount(manageMarkup(model("t1", { games: [preparingGame("t1")], phone: true })));
  const order = [".g-pagehead", ".g-callout", ".g-funds", ".g-manage__card", ".g-manage__safe", ".g-manage__fix", ".g-manage__resources", ".g-manage__history", ".g-team-settings-entry"];
  const all = [...fragment.walk()].filter((node) => node.nodeType === 1);
  const at = order.map((selector) => all.indexOf(fragment.querySelector(selector)));
  assert.ok(at.every((index) => index >= 0), String(at));
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "in the order the phone shows them");
  assert.ok(fragment.querySelector(".g-manage").childNodes.filter((node) => node.nodeType === 1).at(-1) === fragment.querySelector(".g-team-settings-entry"), "the page's last");
  assert.ok(!fragment.querySelector(".g-team-settings"), "the settings themselves are on their own screen");
  assert.equal(fragment.querySelector(".g-team-settings-entry a").getAttribute("href"), "#/t/t1/settings");
  // The page's own callouts are the page's alone: nothing of the settings says anything here.
  assert.deepEqual(fragment.querySelectorAll(".g-callout__title").map((node) => node.textContent), ["Match preparation is on"]);
  // A desk: no row, the card in the right column.
  const desk = mount(manageMarkup(model("t1")));
  assert.ok(!desk.querySelector(".g-team-settings-entry"));
  assert.ok(desk.querySelector(".g-manage__cols .g-team-settings"));
});

test("a team in the build: Starting rerolls on sale, Team Rerolls closed, the chip says it is building (TeamManagePre, DeskRosterPreseason)", () => {
  const fragment = mount(manageMarkup(model("t4", { ledger: held([]) })));
  assert.equal(fragment.querySelector(".g-pagehead__meta .g-status").textContent, "Building the team");
  assert.match(fragment.querySelector(".g-pagehead__meta .g-status").getAttribute("class"), /g-status--wait/);
  assert.ok(fragment.querySelector('[data-resource-key="teamRerolls"].g-resource--locked'));
  assert.equal(fragment.querySelector('[data-resource-key="startingRerolls"]').classList.contains("g-resource--locked"), false);
  assert.equal(fragment.querySelector(".g-ledger__state").textContent, "No operations yet.");
});

test("a team outside the season says so, and a team with Bribery and Corruption may buy bribes", () => {
  const fragment = mount(manageMarkup(model("t5")));
  assert.equal(fragment.querySelector(".g-pagehead__meta .g-status").textContent, "Not in the season");
  assert.equal(fragment.querySelector(".g-pagehead__meta .g-status").getAttribute("class"), "g-status");
  assert.equal(fragment.querySelector('[data-resource-key="bribes"]').classList.contains("g-resource--locked"), false);
  assert.ok(mount(manageMarkup(model("t1"))).querySelector('[data-resource-key="bribes"].g-resource--locked'), "Humans have none to buy");
});

test("a season whose first round has not begun is on, without a number; the chip of a season is the live tone", () => {
  const team = TEAMS[0];
  const page = manageModel({ team, race: raceOf(team), seasonData: { season: { currentRound: null } }, games: [], ledger: held() });
  const fragment = mount(manageMarkup(page));
  assert.equal(fragment.querySelector(".g-pagehead__meta .g-status").textContent, "Season on");
  assert.match(fragment.querySelector(".g-pagehead__meta .g-status").getAttribute("class"), /g-status--live/);
});

test("a live match locks the treasury and the resources and says where to go", () => {
  const fragment = mount(manageMarkup(model("t1", { games: [liveGame("t1")] })));
  assert.equal(fragment.querySelector("a.g-callout").getAttribute("href"), "#/games/g1/post-match");
  assert.equal(fragment.querySelector(".g-callout__title").textContent, "A match is on");
  assert.match(fragment.querySelector("a.g-callout").getAttribute("class"), /g-callout--warn/);
  assert.ok([...fragment.querySelectorAll(".g-resource")].every((row) => row.classList.contains("g-resource--locked")));
  assert.ok(fragment.querySelectorAll(".g-toggle").every((toggle) => toggle.hasAttribute("disabled")), "the medics too");
  for (const selector of ["[data-treasury-money]", "[data-treasury-fix]"]) {
    const buttons = [...fragment.querySelectorAll(selector)];
    assert.ok(buttons.length && buttons.every((button) => button.getAttribute("aria-disabled") === "true"), selector);
    assert.ok(buttons.every((button) => button.getAttribute("title") === "After the match's post-match"), `${selector} says why`);
  }
  assert.equal(fragment.querySelectorAll("[data-treasury-money]").length, 3, "the strip's button and the card's two");
});

test("a preparation warns and locks nothing", () => {
  const fragment = mount(manageMarkup(model("t1", { games: [preparingGame("t1")] })));
  assert.equal(fragment.querySelector("a.g-callout").getAttribute("href"), "#/games/g1/pre-match");
  assert.equal(fragment.querySelector(".g-callout__title").textContent, "Match preparation is on");
  // The steps are named as the pre-match names them (final Minor 6): the server's reset keeps only fans and weather.
  assert.equal(fragment.querySelector(".g-callout__sub").textContent,
    "A purchase, a change of the treasury or of the team's settings resets the steps «Roster», «Inducements» and «Start». Fans and weather stay.");
  assert.equal(fragment.querySelector("[data-treasury-money]").hasAttribute("aria-disabled"), false);
  assert.equal(fragment.querySelector("[data-treasury-fix]").hasAttribute("aria-disabled"), false);
  assert.equal(fragment.querySelector(".g-resource--locked .g-resource__name").textContent.includes("Team Rerolls"), false);
  assert.equal(mount(manageMarkup(model("t1"))).querySelector(".g-callout"), null, "no match, no callout");
});

test("games that could not be read say the match state is unknown, quietly, and leave the writes open (final Minor 1)", () => {
  const fragment = mount(manageMarkup(model("t1", { gamesUnknown: true })));
  const callout = fragment.querySelector(".g-callout");
  assert.equal(callout.querySelector(".g-callout__title").textContent, "Could not check whether a match is on: a change now may keep a post-match from finishing.");
  assert.match(callout.getAttribute("class"), /g-callout--warn/);
  assert.equal(callout.tagName === "A", false, "nowhere to go: no link");
  for (const selector of ["[data-treasury-money]", "[data-treasury-fix]"]) {
    assert.ok(fragment.querySelectorAll(selector).every((button) => !button.hasAttribute("aria-disabled")), selector);
  }
  assert.equal(fragment.querySelector(".g-resource--locked .g-resource__name").textContent.includes("Team Rerolls"), false);
  assert.equal(mount(manageMarkup(model("t1"))).querySelector(".g-callout"), null, "games read: nothing to say");
  const live = mount(manageMarkup(model("t1", { games: [liveGame("t1")], gamesUnknown: true })));
  // The team's settings' card says what holds them in its own words (stage 07d, test/team-settings.test.mjs).
  const said = live.querySelectorAll(".g-callout__title").filter((title) => !title.closest(".g-team-settings"));
  assert.deepEqual(said.map((title) => title.textContent), ["A match is on"], "a page shut by a match says only that");
});

test("the safe says the last deposit from the whole history, not the three lines shown; the history folds them (T8 carry)", () => {
  const folded = mount(manageMarkup(model("t1")));
  assert.equal(folded.querySelectorAll(".g-ledger__row").length, 3);
  assert.match(folded.querySelector(".g-manage__safe-last").textContent, /^Last deposit: 20k/);
  assert.equal(folded.querySelector("[data-ledger-all]").textContent, "All history · 4");
  const unfolded = mount(manageMarkup(model("t1", { expanded: true })));
  assert.equal(unfolded.querySelectorAll(".g-ledger__row").length, 4);
  assert.equal(mount(manageMarkup(model("t1", { busy: true }))).querySelector(".g-manage__resources").getAttribute("aria-busy"), "true");
});

test("a team's name and a coach's comment are text", () => {
  const ledger = held([line("l9", { kind: "manual", reason: "other", note: HOSTILE })]);
  const team = { ...TEAMS[0], id: HOSTILE };
  const fragment = mount(manageMarkup(manageModel({ team, race: raceOf(team), seasonData: SEASON, games: [], ledger })));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-ledger__note").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-manage__in").getAttribute("data-treasury-money"), HOSTILE);
  assert.equal(fragment.querySelector(".g-manage__fix").getAttribute("data-treasury-fix"), HOSTILE);
  assertCspSafe(fragment);
});

test("the Russian page: the head, the chip, the card and the callout", () => {
  initLocale("ru");
  try {
    const fragment = mount(manageMarkup(model("t1", { games: [liveGame("t1")] })));
    assert.equal(fragment.querySelector("h1").textContent, "Казна и ресурсы");
    assert.equal(fragment.querySelector(".g-pagehead__meta .g-status").textContent, "Сезон идёт · тур 7");
    assert.deepEqual(fragment.querySelectorAll(".g-manage__card button").map((button) => button.textContent), ["+ Зачислить", "− Списать"]);
    assert.equal(fragment.querySelector(".g-callout__title").textContent, "Идёт матч");
    assert.equal(mount(manageMarkup(model("t4"))).querySelector(".g-pagehead__meta .g-status").textContent, "Набор команды");
    const steps = mount(manageMarkup(model("t1", { games: [preparingGame("t1")] }))).querySelector(".g-callout__sub").textContent;
    assert.ok(steps.includes("«Старт»") && steps.includes("«Индьюсменты»") && steps.includes("«Состав»"), steps);
    assert.equal(mount(manageMarkup(model("t1", { gamesUnknown: true }))).querySelector(".g-callout__title").textContent,
      "Не удалось проверить, идёт ли матч: правка сейчас может помешать завершить итоги.");
  } finally {
    initLocale("en");
  }
});

test("it draws at once from what the page holds, the history loading until it is read, and again when it comes (K7)", async () => {
  coach({ userId: "u-k7" });
  api.reply(FIRST_PAGE, 200, pageOf());
  const gate = api.hold(FIRST_PAGE);
  const drawing = renderTeamManage("t1");
  assert.ok(view.querySelector('[data-screen="team-manage"] h1'), "drawn before anything is awaited");
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(view.querySelector(".g-ledger__state").textContent, "Loading the history…");
  assert.equal(view.querySelector(".g-manage__safe-last"), null);
  gate.release();
  await drawing;
  assert.equal(view.querySelector(".g-ledger__state"), null);
  assert.equal(view.querySelectorAll(".g-ledger__row").length, 3);
  assert.match(view.querySelector(".g-manage__safe-last").textContent, /^Last deposit: 20k/);
  assert.equal(document.activeElement, view.querySelector("h1"), "the title is not given the focus again");
  fireEvent(view.querySelector("[data-ledger-all]"), "click");
  assert.equal(view.querySelectorAll(".g-ledger__row").length, 4, "«All history» draws the page again, unfolded");
  fireEvent(view.querySelector("[data-ledger-all]"), "click");
  api.assertAnswered();
});

test("the page follows the team, the games and the history while it is on screen, and nothing of it is left after", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, pageOf([]));
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  api.reply("GET /api/season", 200, SEASON);
  await renderTeamManage("t1");
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.deepEqual([hosts("treasury-money"), hosts("treasury-fix")], [1, 1], "one host for each sheet: the strip's wiring holds the money sheet's");
  setMyTeams(state.myTeams.items.map((team) => (team.id === "t1" ? { ...team, roster: { ...team.roster, treasury: 95 } } : team)));
  assert.match(view.querySelector(".g-manage__card").textContent, /95k/);
  assert.match(view.querySelector(".g-funds__cell--money").textContent, /95k/, "the strip follows too");
  assert.equal(view.querySelector(".g-ledger__state").textContent, "No operations yet.");
  api.reply(FIRST_PAGE, 200, pageOf());
  await readLedger("t1");
  assert.equal(view.querySelectorAll(".g-ledger__row").length, 3, "a history read elsewhere is drawn");
  await notifyGames([liveGame("t1")]);
  assert.ok(view.querySelector(".g-callout"));
  await withoutTimers(() => fireEvent(view.querySelector('.g-manage__card [data-treasury-sign="-1"]'), "click"));
  assert.equal(document.body.querySelector("dialog#treasury-money"), null, "a refused button opens nothing");
  await withoutTimers(() => fireEvent(view.querySelector("[data-treasury-fix]"), "click"));
  assert.equal(document.body.querySelector("dialog#treasury-fix"), null);
  assert.deepEqual(toasts().map(({ text }) => text), ["After the match's post-match", "After the match's post-match"], "each press says why");
  assert.ok(toasts().every(({ tone }) => /toast-error/.test(tone)));
  releaseCurrentScreen();
  view.innerHTML = "<p>next</p>";
  setMyTeams(state.myTeams.items);
  await notifyGames([]);
  assert.equal(view.querySelector("p").textContent, "next");
  assert.equal(document.body.querySelector("[data-sheet-host]"), null, "the sheets' hosts go with the screen");
});

test("a history that fails to load says why and offers to read it again; the rest of the page stands (K7, M-1)", async () => {
  coach({ userId: "u-500" });
  api.reply(FIRST_PAGE, 500, { error: { code: "INTERNAL_ERROR", params: {}, message: "Internal server error" } });
  await renderTeamManage("t1");
  assert.match(view.querySelector(".g-ledger__state").textContent, /^The history did not load: ./);
  assert.equal(view.querySelector("[data-ledger-retry]").textContent, "Try again");
  assert.equal(view.querySelector(".g-ledger"), null, "no lines are made up");
  assert.equal(view.querySelector(".g-manage__card-sum").textContent, "70k");
  assert.ok(view.querySelector('[data-resource-key="teamRerolls"]'));
  api.reply(FIRST_PAGE, 200, pageOf());
  fireEvent(view.querySelector("[data-ledger-retry]"), "click");
  await settle();
  assert.equal(view.querySelectorAll(".g-ledger__row").length, 3, "«Try again» reads it, and the page draws what came");
  assert.equal(view.querySelector("[data-ledger-retry]"), null);
});

test("a history answer that is not a page is a failed read: the page says so, offers it again, and still follows the team and the games (I-1)", async () => {
  coach({ userId: "u-bad" });
  api.reply(FIRST_PAGE, 200, {});
  await renderTeamManage("t1");
  assert.equal(view.querySelector(".g-ledger__state").textContent, "The history did not load: The server's answer could not be read.");
  assert.ok(view.querySelector("[data-ledger-retry]"));
  assert.equal(view.querySelector(".g-manage__safe-last"), null);
  // A second visit draws, over the screen before it.
  releaseCurrentScreen();
  view.innerHTML = "<p>the screen before</p>";
  await renderTeamManage("t1");
  assert.ok(!view.textContent.includes("the screen before"));
  assert.ok(view.querySelector('[data-screen="team-manage"] [data-ledger-retry]'));
  // The page still follows the team and the games: a match that goes live locks it.
  setMyTeams(state.myTeams.items.map((team) => (team.id === "t1" ? { ...team, roster: { ...team.roster, treasury: 85 } } : team)));
  assert.equal(view.querySelector(".g-manage__card-sum").textContent, "85k");
  await notifyGames([liveGame("t1")]);
  assert.equal(view.querySelector("a.g-callout").getAttribute("href"), "#/games/g1/post-match");
  assert.ok(view.querySelectorAll("[data-treasury-money], [data-treasury-fix]").every((button) => button.getAttribute("aria-disabled") === "true"));
  // «Try again» with a good answer: the history is drawn.
  api.reply(FIRST_PAGE, 200, pageOf());
  fireEvent(view.querySelector("[data-ledger-retry]"), "click");
  await settle();
  assert.equal(view.querySelectorAll(".g-ledger__row").length, 3);
  assert.equal(view.querySelector("[data-ledger-retry]"), null);
  assert.match(view.querySelector(".g-manage__safe-last").textContent, /^Last deposit: 20k/);
});

test("a screen left before its reads came draws nothing over the next one", async () => {
  coach({ userId: "u-left" });
  api.reply(FIRST_PAGE, 200, pageOf());
  const gate = api.hold(FIRST_PAGE);
  const drawing = renderTeamManage("t1");
  await settle();
  releaseCurrentScreen();
  view.innerHTML = "<p>next</p>";
  gate.release();
  await drawing;
  assert.equal(view.querySelector("p").textContent, "next");
  assert.equal(view.querySelector(".g-manage"), null);
});

test("a team that is not on the list draws nothing and reads nothing, as the overview", async () => {
  coach();
  view.innerHTML = "<p>before</p>";
  await renderTeamManage("t9");
  assert.equal(view.querySelector("p").textContent, "before");
  assert.equal(document.body.querySelector("[data-sheet-host]"), null);
  assert.deepEqual(api.calls, []);
});

test("an entry made on the page is the treasury the overview shows next (T9 carry)", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, pageOf([]));
  await renderTeamManage("t1");
  fireEvent(view.querySelector('.g-manage__card [data-treasury-sign="1"]'), "click");
  const sheet = document.querySelector('[data-sheet-host="treasury-money"]');
  assert.ok(sheet.querySelector("dialog#treasury-money").matches(":modal"), "the card's button opens the strip's sheet");
  fireEvent(sheet.querySelector('[data-money-reason="sponsor"]'), "click");
  const entry = line("l5", { kind: "manual", reason: "sponsor", delta: 20, balanceAfter: 90 });
  api.reply("POST /api/teams/t1/treasury", 200, { team: t1With({ treasury: 90 }), entry });
  await withoutTimers(async () => {
    fireEvent(sheet.querySelector("[data-money-apply]"), "click");
    await settle();
  });
  assert.equal(view.querySelector(".g-manage__card-sum").textContent, "90k");
  assert.equal(view.querySelector(".g-ledger__title").textContent, "Sponsor or prize", "the line heads the history");
  releaseCurrentScreen();
  await renderTeamOverview("t1");
  assert.equal(view.querySelector('a.g-kpi[href="#/t/t1/team"] .g-kpi__v').textContent, "90k");
});

test("a correction made on the page is the treasury the overview shows next (T9 carry)", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, pageOf([]));
  await renderTeamManage("t1");
  fireEvent(view.querySelector(".g-manage__fix"), "click");
  const sheet = document.querySelector('[data-sheet-host="treasury-fix"]');
  const field = sheet.querySelector("#fix-treasury");
  field.value = "95";
  fireEvent(field, "input");
  api.reply("PATCH /api/teams/t1", 200, { team: t1With({ treasury: 95 }) });
  await withoutTimers(async () => {
    fireEvent(sheet.querySelector("[data-fix-save]"), "click");
    await settle();
  });
  assert.equal(api.calls.filter((call) => call.key === "PATCH /api/teams/t1").length, 1);
  assert.equal(view.querySelector(".g-manage__card-sum").textContent, "95k");
  releaseCurrentScreen();
  await renderTeamOverview("t1");
  assert.equal(view.querySelector('a.g-kpi[href="#/t/t1/team"] .g-kpi__v').textContent, "95k");
});

test("a step of a resource on the page is drawn from the team the answer brings", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, pageOf([]));
  await renderTeamManage("t1");
  api.reply("PATCH /api/teams/t1", 200, { team: t1With({ treasury: 60, assistantCoaches: 2 }) });
  fireEvent(view.querySelector('[data-resource-key="assistantCoaches"] [data-resource-step="1"]'), "click");
  await settle();
  assert.equal(view.querySelector('[data-resource-key="assistantCoaches"] .g-resource__value').textContent, "2");
  assert.equal(view.querySelector(".g-manage__card-sum").textContent, "60k");
});

test("entering the page reads the games again, though they were read before: a match that went live since locks it (final I-2)", async () => {
  coach({ userId: "u-fresh" });
  assert.equal(state.games.loaded, true);
  api.reply(FIRST_PAGE, 200, pageOf([]));
  api.reply("GET /api/games", 200, { games: [liveGame("t1")], currentGames: [] });
  await renderTeamManage("t1");
  assert.equal(api.calls.filter((call) => call.key === "GET /api/games").length, 1);
  assert.equal(view.querySelector("a.g-callout").getAttribute("href"), "#/games/g1/post-match");
  assert.ok(view.querySelectorAll("[data-treasury-money], [data-treasury-fix]").every((button) => button.getAttribute("aria-disabled") === "true"));
  assert.ok(view.querySelectorAll(".g-resource").every((row) => row.classList.contains("g-resource--locked")));
});

test("a preparation known from games read before, and games that could not be read now: both are said, since the match may have gone live", () => {
  const fragment = mount(manageMarkup(model("t1", { games: [preparingGame("t1")], gamesUnknown: true })));
  // The team's settings' card says what its own saves reset (stage 07d, test/team-settings.test.mjs).
  const titles = fragment.querySelectorAll(".g-callout__title").filter((title) => !title.closest(".g-team-settings")).map((node) => node.textContent);
  assert.deepEqual(titles, ["Match preparation is on", en["treasury.gamesUnknown"]]);
  assert.equal(fragment.querySelector("[data-treasury-money]").hasAttribute("aria-disabled"), false);
});

test("a games read that fails says the match state is unknown and leaves the page open; a read that comes takes it away (final Minor 1)", async () => {
  coach({ userId: "u-games" });
  api.reply(FIRST_PAGE, 200, pageOf([]));
  api.fail("GET /api/games");
  await renderTeamManage("t1");
  assert.equal(view.querySelector(".g-callout__title").textContent, en["treasury.gamesUnknown"]);
  assert.ok(view.querySelectorAll("[data-treasury-money], [data-treasury-fix]").every((button) => !button.hasAttribute("aria-disabled")), "the writes stay open");
  await notifyGames([]);
  assert.equal(view.querySelector(".g-callout"), null);
});

test("an entry whose answer was lost reads the team and the history again, once each: the card, the strip and the history agree (final I-1)", async () => {
  coach({ userId: "u-lost" });
  api.reply(FIRST_PAGE, 200, pageOf([]));
  await renderTeamManage("t1");
  fireEvent(view.querySelector('.g-manage__card [data-treasury-sign="1"]'), "click");
  const sheet = document.querySelector('[data-sheet-host="treasury-money"]');
  fireEvent(sheet.querySelector('[data-money-reason="sponsor"]'), "click");
  const gate = api.hold("POST /api/teams/t1/treasury");
  fireEvent(sheet.querySelector("[data-money-apply]"), "click");
  // The server wrote it; only its answer is lost.
  const entry = line("l5", { kind: "manual", reason: "sponsor", delta: 20, balanceAfter: 90 });
  api.reply(FIRST_PAGE, 200, pageOf([entry]));
  api.reply("GET /api/teams", 200, { teams: [t1With({ treasury: 90 }), ...structuredClone(TEAMS.slice(1))] });
  const sent = api.calls.length;
  gate.release({ error: new TypeError("Failed to fetch") });
  await settle();
  await settle();
  const after = api.calls.slice(sent).map((call) => call.key);
  assert.equal(after.filter((key) => key === FIRST_PAGE).length, 1, "the history once");
  assert.equal(after.filter((key) => key === "GET /api/teams").length, 1, "the team once");
  assert.equal(view.querySelector(".g-manage__card-sum").textContent, "90k");
  assert.match(view.querySelector(".g-funds__cell--money").textContent, /90k/);
  assert.equal(view.querySelector(".g-ledger__title").textContent, "Sponsor or prize");
  assert.equal(sheet.querySelector(".g-money__preview").textContent, "Treasury: 90k → 90k", "the sheet's preview too");
  assert.equal(state.myTeams.items[0].revision, 4, "the next write meets the revision the server holds");
});

test("a write that lands after the coach went to another team says whose it was (final Minor 10)", async () => {
  coach({ userId: "u-late" });
  api.reply(FIRST_PAGE, 200, pageOf([]));
  await renderTeamManage("t1");
  const away = async () => {
    releaseCurrentScreen();
    state.activeTeamId = "t5";
    api.reply("GET /api/teams/t5/ledger?limit=20", 200, pageOf([]));
    await renderTeamManage("t5");
  };
  // An entry of the money sheet, answered once the coach is on t5's page.
  fireEvent(view.querySelector('.g-manage__card [data-treasury-sign="1"]'), "click");
  fireEvent(document.querySelector('[data-money-reason="sponsor"]'), "click");
  api.reply("POST /api/teams/t1/treasury", 201, { team: t1With({ treasury: 90 }), entry: line("l5", { kind: "manual", reason: "sponsor", delta: 20 }) });
  const entry = api.hold("POST /api/teams/t1/treasury");
  fireEvent(document.querySelector("[data-money-apply]"), "click");
  await away();
  await withoutTimers(async () => {
    entry.release();
    await settle();
  });
  assert.deepEqual(toasts().map(({ text }) => text), ["Ashgrove Wardens: Added 20k"]);
  // A step of a resource, refused once the coach is on t5's page.
  state.activeTeamId = "t1";
  releaseCurrentScreen();
  await renderTeamManage("t1");
  const step = api.hold("PATCH /api/teams/t1");
  fireEvent(view.querySelector('[data-resource-key="assistantCoaches"] [data-resource-step="1"]'), "click");
  await away();
  await withoutTimers(async () => {
    step.release({ status: 422, body: { error: { code: "STAGE_PURCHASE_LOCKED", params: {}, message: "x" } } });
    await settle();
  });
  assert.equal(toasts().at(-1).text, `Ashgrove Wardens: ${en["error.STAGE_PURCHASE_LOCKED"]}`);
  assert.match(toasts().at(-1).tone, /toast-error/);
});

test("every word of the page is in both dictionaries, the phases too; nothing unstyled, nothing the CSP refuses", () => {
  assertDictionaryCovers("src/screens/team/manage/index.mjs");
  for (const phase of ["draft", "season", "seasonNoRound", "out"]) assert.ok(en[`treasury.phase.${phase}`] && ru[`treasury.phase.${phase}`], phase);
  for (const key of ["treasury.tv", "treasury.phase.season", "treasury.prepSub", "treasury.otherTeam"]) {
    assert.deepEqual([...en[key].matchAll(/\{(\w+)\}/g)].map(([, name]) => name), [...ru[key].matchAll(/\{(\w+)\}/g)].map(([, name]) => name), key);
  }
  const fragment = mount(manageMarkup(model("t1", { games: [preparingGame("t1")] })));
  assertCspSafe(fragment);
  // The team's settings are a card in the desk's right column, a row on the phone's page (stage 07d): settings.css styles both.
  const settings = "src/screens/team/manage/settings.css";
  assertStyled(fragment, "src/screens/team/manage/manage.css", "src/screens/team/manage/strip.css", "page-head.css", "status-chip.css", "callout.css", "resource-counter.css", "toggle.css", "button.css", settings);
  assertStyled(mount(manageMarkup(model("t4", { ledger: held([]) }))), CSS, "src/screens/team/manage/strip.css", "page-head.css", "status-chip.css", "resource-counter.css", "toggle.css", "button.css", settings);
  assertStyled(mount(manageMarkup(model("t1", { phone: true }))), CSS, "src/screens/team/manage/strip.css", "page-head.css", "status-chip.css", "resource-counter.css", "toggle.css", "button.css", "list-row.css", settings);
});

test("the phone has the card and no strip, the desk the strip and two columns; the card's buttons are 44px and ringed in the header's ink", () => {
  const sheet = CSS;
  const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(valuesOf(sheet, ".g-manage__card", "display").includes("none"), "from 901px the strip says the treasury");
  assert.match(css, /@media \(min-width: 901px\)\s*\{[^@]*\.g-manage__card \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 900px\)\s*\{\s*\.g-manage \.g-pagehead__sub \{ display: none; \}/, "on a phone the value is in the card");
  assert.ok(valuesOf(sheet, ".g-manage__cols", "grid-template-areas").length > 0);
  assert.deepEqual(valuesOf(sheet, ".g-manage__cols", "grid-template-areas"), ['"resources side" "resources history" "resources settings"']);
  for (const [selector, area] of [[".g-manage__resources", "resources"], [".g-manage__side", "side"], [".g-manage__history", "history"]]) {
    assert.deepEqual(valuesOf(sheet, selector, "grid-area"), [area], selector);
  }
  for (const selector of [".g-manage__in", ".g-manage__out", ".g-manage__fix"]) {
    assert.ok(valuesOf(sheet, selector, "min-height").includes("var(--size-touch)"), selector);
  }
  assert.ok(valuesOf(sheet, ".g-manage__card :focus-visible", "outline-color").includes("var(--header-ink)"));
  assert.ok(!read(sheet).includes("--focus-ring"));
  assertReadable(sheet, ".g-manage__card", "color", ["--header"], 4.5);
  assertReadable(sheet, ".g-manage__card-title", "color", ["--header"], 4.5);
  assertReadable(sheet, ".g-manage__card-tv", "color", ["--header"], 4.5);
  assertReadable(sheet, ".g-manage__out", "color", ["--header"], 4.5);
  assertReadable(sheet, ".g-manage__in", "color", ["--header-ink"], 4.5);
  assertReadable(sheet, ".g-manage__fix", "color", ["--page", "--desk"], 4.5);
  assertContrast("--header-ink", ["--header"], 3, { what: "«+ Add» on the card" });
  assertContrast("--header-muted", ["--header"], 3, { what: "the outline of «− Take»" });
  assert.ok(read("src/styles.css").includes('@import url("screens/team/manage/manage.css");'));
});

/**
 * The page the roster screen's own tests stand on — test/team-roster.test.mjs and its parts team-roster-match,
 * team-roster-strip and team-roster-look (stage 13, Task 26: one file of 2717 lines became four). The window's events,
 * the fake API before the screen's modules are imported, the view; a coach of Ashgrove Wardens (Human) whose captain
 * alone has SPP, with the games of a preparation and of a match; the queries the tests read the screen by, the injury
 * sheet's among them.
 *
 * Imported before any module of src/ that talks to the API: the client picks up `fetch` when it loads (fake-api.mjs).
 * Stage 07b's roster tests stand on test/helpers/roster-page.mjs, a team of other players.
 */
import { readFileSync } from "node:fs";

import { document } from "./ui.mjs";
import { installFakeApi } from "./fake-api.mjs";
import { mountView, withWindow } from "./ref-screen.mjs";
import { expandCollections } from "../../src/data/reference.mjs";

// The window's own events, for every test on this page: the save queue's unload guard and the screen's `online` listen on it.
export const page = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[name] = page[name].bind(page);

// The view is found once, when core/view.mjs loads, and the API client picks up `fetch` the same way: both come first.
export const api = installFakeApi();
mountView();
globalThis.location = { hash: "#/t/t1/roster", replace() {} };
export const { renderTeamRoster } = await import("../../src/screens/team/roster/index.mjs");
const { rosterMemory } = await import("../../src/screens/team/roster/memory.mjs");
export const save = await import("../../src/screens/team/roster/save.mjs");
const { rememberSessionToken } = await import("../../src/core/api-client.mjs");
export const { releaseCurrentScreen } = await import("../../src/core/screen-lifecycle.mjs");
export const { teamPlayerUrl } = await import("../../src/core/routes.mjs");
export const { state } = await import("../../src/core/state.mjs");
export const { view } = await import("../../src/core/view.mjs");
export const { invalidateGames, loadGames } = await import("../../src/data/games.mjs");
export const { SPP_EVENT_COUNTERS } = await import("../../src/domain/post-match/events.mjs");
export const { INJURIES } = await import("../../src/domain/post-match/rules.mjs");
export const { renderTreasuryStrip } = await import("../../src/screens/team/manage/strip.mjs");

export const text = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
export const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
export const settle = async (turns = 6) => { for (let turn = 0; turn < turns; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

// Human's rows: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 5 Ogre. Only the captain has SPP: 3, a random skill's worth at the first rank.
export const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann" },
  { id: "p2", rowIndex: 3, number: "2", name: "Bors", isCaptain: true, extraSkills: [{ name: "Mighty Blow", access: "primary" }], spp: { touchdowns: 1 } },
  { id: "p3", rowIndex: 2, number: "3", name: "Cade", statMods: { ag: 1 } },
  { id: "p4", rowIndex: 0, number: "4", name: "Dell", skipNextGame: true },
  { id: "p5", rowIndex: 1, number: "5", name: "Edda" },
  { id: "p6", rowIndex: 0, number: "6", name: "Finn" },
  { id: "p7", rowIndex: 5, number: "7", name: "Grom" },
];
export const KEYS = PLAYERS.map(({ id }) => `${id}#0`);
export const NAMES = PLAYERS.map(({ name }) => name);
export const team = (over = {}) => ({ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 4, roster: { players: PLAYERS }, ...over });

/** The row `onPhone` opens: Ann's, the roster's first. */
let opened = null;

/**
 * Outside a match only a phone has SPP counters (owner's D3, 2026-10-19: a desk's panel has none then, DeskRoster.html).
 * A test that taps one, or follows a match into its end, runs here: on a phone, Ann's row open from the first draw.
 */
export async function onPhone(run) {
  opened = "p1#0";
  try {
    return await withWindow({ phone: true }, run);
  } finally {
    opened = null;
  }
}

/**
 * A coach on a page that has read his teams and the reference; the server answers the roster, its events and the games.
 * What a test before left in the save queue is given up, and the messages it left are taken away. Under `onPhone`
 * Ann's row is open.
 */
export function coach({ teamAnswer = team(), events = [] } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  view.innerHTML = "";
  if (save.saveState("t1").status !== "idle") save.takeServerTeam(team());
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  // The memory lives as long as the page, which is one test file: each test starts from the roster's order, no choice and taps of the match.
  Object.assign(rosterMemory("t1"), { sort: null, selected: opened, outside: null });
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [team()], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/teams/t1", 200, { team: teamAnswer });
  api.reply("GET /api/teams/t1/events", 200, { events, revision: teamAnswer.revision });
  api.reply("GET /api/teams/t1/fallen", 200, { fallen: [] });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
}

export const PATCH = "PATCH /api/teams/t1";
export const patches = () => api.calls.filter(({ key }) => key === PATCH);
// The fallen are read with the roster (stage 07b) and are not what these tests count.
export const callKeys = () => api.calls.map(({ key }) => key).filter((key) => key !== "GET /api/teams/t1/fallen");
export const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
/** Whether the browser would ask before the tab closes. */
export const leaving = () => {
  const event = new Event("beforeunload", { cancelable: true });
  page.dispatchEvent(event);
  return event.defaultPrevented;
};
/** t1 with one player's counters as the server holds them. */
export const withSpp = (id, spp, over = {}) => team({ roster: { players: PLAYERS.map((player) => (player.id === id ? { ...player, spp } : player)) }, ...over });
export const conflictOf = (elsewhere) => ({ error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: elsewhere });
export const refusalOf = (violations) => ({ error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations });
// A league match of round 3 that t1 plays now: begun, its post-match not done (isMatchLive).
export const LIVE_GAME = {
  id: "g2", kind: "league", roundStatus: "started", roundNumber: 3, season: { currentRound: 3 }, resultStatus: "pending", preparationStatus: "in_progress",
  postMatchStatus: "draft", updatedAt: "2026-10-10T10:00:00Z", home: { user: { id: "u1" }, team: { id: "t1" } }, away: { user: { id: "u9" }, team: { id: "r1" } },
};
// The same round's match of t1 before its start: the preparation is under way.
export const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
export const EVENTS = "POST /api/teams/t1/events";
export const posts = () => api.calls.filter(({ key }) => key === EVENTS);
/** A row as POST …/events answers it: by default the match's +1 TD of Ann. */
export const rowOf = (over = {}) => ({ id: "e1", pairingId: "g2", playerId: "p1", counter: "touchdowns", delta: 1, injury: null, settledAt: null, ...over });
export const refused = (code) => ({ error: { code, params: {}, message: "x" } });
/** The games the server answers with from now on. */
export const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
/** The banner of a preparation or a match, the first of the notices. */
export const banner = () => view.querySelector(".g-roster__notices .g-callout");
export const titleOf = (callout) => callout.querySelector(".g-callout__title").textContent;
export const subOf = (callout) => callout.querySelector(".g-callout__sub").textContent;
export const outsideSwitch = () => view.querySelector('[role="switch"]');
/** The «+N» a count shows for the match: in a counter, or in the table's cell. */
export const deltaOf = (counter, root) => stepper(counter, root).querySelector(".g-stepper__delta")?.textContent ?? null;
export const SIDE_LOCKED = "This match's statistics are already saved in your post-match. Change them on its Players step.";
export const READING = "Reading the records…";
export const UNSURE = "The records could not be read: whether the injury was recorded is not known.";
export const AFTER_POST = "Advancement — after the post-match";

export const bodies = () => view.querySelectorAll("tbody.g-rtable__player");
export const order = () => bodies().map((body) => body.querySelector(".g-rtable__name").textContent);
export const toggle = (key) => view.querySelector(`[data-row-key="${key}"]`);
export const bodyOf = (key) => bodies().find((body) => body.getAttribute("data-key") === key);
export const aside = () => view.querySelector(".g-roster__aside");
/** The chips of a skill under a player's name in the table (the desk's copy) or in the panel. */
export const chipIn = (root, name) => root.querySelectorAll("[data-skill]").find((chip) => chip.getAttribute("data-skill") === name);
export const sheet = () => view.querySelector("dialog#roster-skill");
export const openRow = () => view.querySelector(".g-rtable__panelrow");
/** Where the counters are: the desk panel's in a match, else the open row's (D3). */
const counterRoot = () => (aside()?.querySelector("[data-action-key]") ? aside() : openRow());
/** A counter's cell: the desk panel's in a match, the phone's open row's otherwise, or `root`'s. */
const stepper = (counter, root = counterRoot()) => root.querySelectorAll("[data-action-key]").find((cell) => cell.getAttribute("data-action-key") === counter);
export const plus = (counter, root) => stepper(counter, root).querySelector('[data-action-step="1"]');
export const minus = (counter, root) => stepper(counter, root).querySelector('[data-action-step="-1"]');
export const countOf = (counter, root) => stepper(counter, root).querySelector(".g-stepper__value").textContent;
export const labelOf = (cell) => cell.querySelector(".g-stepper__label").textContent;
export const stepButtons = () => view.querySelectorAll("[data-action-step]");
/** The save's status at the right of «Active roster». */
export const status = () => view.querySelector(".g-roster__status").textContent;
/** The SPP line: what it is about, and the SPP since the screen opened. */
export const sppLine = (root) => root.querySelector(".g-roster__sppline").childNodes.filter((part) => part.nodeType === 1).map((part) => part.textContent);
export const notice = (tone) => view.querySelector(`.g-roster__notices .g-callout--${tone}`);

// The injury sheet (Task 12): team-roster-match records in it, and team-roster-look's fidelity pass reads the injury in the pair.
export const injurySheet = () => view.querySelector("dialog#roster-injury");
/** «Injury in the match…»: the desk panel's by default, or the open row's. */
export const injuryButton = (root = aside()) => root.querySelector("[data-roster-injury]");
export const injuryOptions = () => injurySheet().querySelectorAll('.g-option[role="radio"]');
export const optionFor = (code) => injuryOptions().find((card) => card.getAttribute("data-option-value") === code);
export const statChips = () => injurySheet().querySelectorAll('[data-chip-group="injury-stat"] .g-chip');
export const chipFor = (stat) => statChips().find((chip) => chip.getAttribute("data-chip-value") === stat);
export const recordButton = () => injurySheet().querySelector('[data-injury-step="1"]');
export const removeButton = () => injurySheet().querySelector('[data-injury-step="-1"]');
/** The line under a player's name in the table. */
export const subLine = (key) => bodyOf(key).querySelector(".g-rtable__sub");
/** An injury row of the match as POST …/events answers it: Ann's. */
export const injuryRow = (injury, over = {}) => rowOf({ counter: "injury", injury, ...over });

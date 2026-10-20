/**
 * The page stage 07b's roster tests stand on (test/team-roster-skips.test.mjs, test/team-roster-fallen-undo.test.mjs),
 * set up as test/team-roster.test.mjs sets it up (lines 1–80): the window's events, the fake API before the screen's
 * modules are imported, the view. Then a coach whose team has three who play, four who miss the next match and two
 * fallen, and the queries the tests read the screen by; the player's address as the router draws it (stage 07d).
 *
 * Imported before any module of src/ that talks to the API: the client picks up `fetch` when it loads (fake-api.mjs).
 */
import { readFileSync } from "node:fs";

import { installFakeApi } from "./fake-api.mjs";
import { mountView } from "./ref-screen.mjs";
import { document } from "./ui.mjs";
import { expandCollections } from "../../src/data/reference.mjs";

/** The window's events: «online» and the like are dispatched on it. */
export const page = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[name] = page[name].bind(page);

export const api = installFakeApi();
mountView();
globalThis.location = { hash: "#/t/t1/roster", replace() {} };
export const { renderTeamRoster } = await import("../../src/screens/team/roster/index.mjs");
const { rosterMemory } = await import("../../src/screens/team/roster/memory.mjs");
export const save = await import("../../src/screens/team/roster/save.mjs");
const { rememberSessionToken } = await import("../../src/core/api-client.mjs");
export const { releaseCurrentScreen } = await import("../../src/core/screen-lifecycle.mjs");
export const { teamPlayerUrl } = await import("../../src/core/routes.mjs");
export const { formatDay } = await import("../../src/core/format.mjs");
export const { state } = await import("../../src/core/state.mjs");
export const { view } = await import("../../src/core/view.mjs");
export const { invalidateGames, loadGames } = await import("../../src/data/games.mjs");

/** A file of the repository as text. */
export const text = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
export const settle = async (turns = 6) => { for (let turn = 0; turn < turns; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

// Human's rows: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 5 Ogre. Three play the next match, four miss it, each for his reason.
export const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann" },
  { id: "p2", rowIndex: 3, number: "2", name: "Bors", isCaptain: true },
  { id: "p3", rowIndex: 2, number: "3", name: "Cade" },
  { id: "p4", rowIndex: 0, number: "4", name: "Dell", skipNextGame: true, absence: { code: "lasting", stat: "ma" }, statMods: { ma: -1 } },
  { id: "p5", rowIndex: 1, number: "5", name: "Edda", skipNextGame: true },
  { id: "p6", rowIndex: 0, number: "6", name: "Finn", skipNextGame: true, temporarilyRetired: true },
  { id: "p7", rowIndex: 5, number: "7", name: "Grom", skipNextGame: true, absence: { code: "other", note: "Suspended" } },
];
export const team = (over = {}) => ({ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 4, roster: { players: PLAYERS }, ...over });
export const withPlayers = (players, over = {}) => team({ roster: { players }, ...over });

/** A record as GET /api/teams/:id/fallen sends it. */
export const died = (id, player, over = {}) => ({ id, player, cause: null, pairingId: null, roundNumber: null, diedAt: "2026-10-18T10:00:00Z", fromMatch: false, ...over });
// A Blitzer a coach marked dead by hand, with a cause; a Lineman the post-match of round 2 recorded, with none.
export const PIKE = died("f1", { id: "d1", rowIndex: 3, number: "8", name: "Pike", spp: { touchdowns: 2 } }, { cause: "Foul by the Raiders" });
export const JOE = died("f2", { id: "d2", rowIndex: 0, number: "9", name: "Joe" }, { pairingId: "g7", roundNumber: 2, diedAt: "2026-10-12T10:00:00Z", fromMatch: true });
export const FALLEN = [PIKE, JOE];

/**
 * A coach on a page that has read his teams and the reference; the server answers the roster, its events, its fallen and
 * the games. `open` is the player chosen from the first draw: his row open on a phone, him in the panel on a desk.
 */
export function coach({ teamAnswer = team(), fallen = FALLEN, open = null } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  view.innerHTML = "";
  if (save.saveState("t1").status !== "idle") save.takeServerTeam(team());
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  Object.assign(rosterMemory("t1"), { sort: null, selected: open, outside: null, scroll: null, wayBack: null, fromPlayer: false });
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [team()], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/teams/t1", 200, { team: teamAnswer });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: teamAnswer.revision });
  api.reply("GET /api/teams/t1/fallen", 200, { fallen });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
}

export const callKeys = () => api.calls.map(({ key }) => key);
export const headingText = (id) => view.querySelector(`#${id}`)?.textContent ?? null;
export const tables = () => view.querySelectorAll("table.g-rtable");
export const namesIn = (root) => root.querySelectorAll("tbody.g-rtable__player").map((body) => body.querySelector(".g-rtable__name").textContent);
export const bodyOf = (key) => view.querySelectorAll("tbody.g-rtable__player").find((body) => body.getAttribute("data-key") === key);
export const toggle = (key) => view.querySelector(`[data-row-key="${key}"]`);
export const subOf = (key) => bodyOf(key).querySelector(".g-rtable__sub");
export const aside = () => view.querySelector(".g-roster__aside");
export const openRow = () => view.querySelector(".g-rtable__panelrow");
export const nextLine = () => aside().querySelector(".g-roster__next").textContent;
export const words = (root) => root.querySelectorAll("p, span, h2, h3, a, small, dd, dt").map((node) => node.textContent);
export const READING = "Reading the records…";
export const LIVE_GAME = {
  id: "g2", kind: "league", roundStatus: "started", roundNumber: 3, season: { currentRound: 3 }, resultStatus: "pending", preparationStatus: "in_progress",
  postMatchStatus: "draft", updatedAt: "2026-10-10T10:00:00Z", home: { user: { id: "u1" }, team: { id: "t1" } }, away: { user: { id: "u9" }, team: { id: "r1" } },
};
export const STYLES = ["src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css",
  "src/screens/team/roster/market.css", "src/screens/team/roster/profile.css", "src/screens/team/roster/player-sheets.css", "src/screens/team/roster/advance.css",
  "src/screens/team/roster/rolls.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css",
  "stat-strip.css", "progress-dots.css", "button.css", "callout.css", "sheet.css", "src/screens/ref/prose.css", "action-stepper.css", "status-chip.css",
  "src/screens/team/manage/strip.css"];

/** The player's address as the router draws a player of the roster (stage 07d): the roster's player mode. */
export const playerPage = (playerId) => renderTeamRoster("t1", { playerId });
/** Cade with ten touchdowns and a random skill rolled on the site, Frenzy, for his first advancement: 27 SPP to spend. */
export const ADVANCED = {
  ...PLAYERS[2], spp: { touchdowns: 10 }, extraSkills: [{ name: "Frenzy", access: "primary" }],
  advancements: [{ type: "random", grants: { skill: "Frenzy" }, roll: { id: "r1", via: "site" } }],
};

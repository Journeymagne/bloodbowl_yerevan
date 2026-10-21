import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

// The API is installed before anything that asks it is imported: the client takes `fetch` when it loads.
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/administration/season", replace() {} };
// confirmAction asks the browser's own question where there is no <dialog> to build one: the answer is the test's.
const asked = [];
let answer = true;
globalThis.confirm = (message) => {
  asked.push(message);
  return answer;
};

const { renderAdminSeason } = await import("../src/screens/admin/season.mjs");
const { PAIRING_STATUSES, seasonRoundsModel } = await import("../src/screens/admin/season-rounds.mjs");
const { resultBody, resultDraft, resultSheetModel } = await import("../src/screens/admin/result-sheet.mjs");
const { TECHNICAL_REASONS, matchPoints } = await import("../src/domain/league-rules.mjs");
const { adminSeasonUrl, matchRoute, resolveRedirect, routeFromHash } = await import("../src/core/routes.mjs");
const { shellModel } = await import("../src/shell/navigation.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { pendingScreenCleanupCount, releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let turn = 0; turn < 12; turn += 1) await settle();
};
const CSS = "src/screens/admin/season.css";
const TOKEN = "gata-league-auth-token";

const ADMIN = { id: "u1", login: "admin", isAdmin: true };
const COACH = { id: "u2", login: "orc_boss", isAdmin: false };
const TEAMS = [
  ["e1", "u2", "orc_boss", "Grimtusk Raiders"], ["e2", "u3", "thalion", "Silverbrook Rangers"], ["e3", "u4", "felstell", "Ashgrove Wardens"],
  ["e4", "u5", "cinder", "Cinderpeak Ash"], ["e5", "u6", "dusk", "Duskspire Knives"], ["e6", "u7", "gnaw", "Ratwharf Gnawers"],
  ["e7", "u8", "newbie_coach", "Mudfoot Boyz"], ["e8", "u9", "teeth", "Iron Teeth"],
];
const ENTRIES = TEAMS.map(([id, userId, login, name]) => ({
  id, seasonId: "s1", withdrawnAt: null, user: { id: userId, login, isAdmin: false }, team: { id: `t-${id}`, name, baseTeamSlug: "teams/orc" },
}));

/** A pairing as `/api/season` sends it (`publicSeasonPairing`, with stage 12's `resultType` and `technicalReason`). */
const pairing = (round, table, home, away, over = {}) => ({
  id: `r${round}p${table}`, roundId: `r${round}`, roundNumber: round, roundStatus: "completed", tableNumber: table, homeEntryId: home, awayEntryId: away,
  homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null, homePoints: null, awayPoints: null,
  resultStatus: "pending", resultType: "played", technicalReason: null, preparationStatus: "not_started", postMatchStatus: "not_started",
  proposedByUserId: null, proposedHomeTouchdowns: null, proposedAwayTouchdowns: null, proposedHomeCasualties: null, proposedAwayCasualties: null,
  proposedAt: null, confirmedAt: null, ...over,
});
const played = ([home, away], [cas = 0, casAway = 0] = []) => ({
  homeTouchdowns: home, awayTouchdowns: away, homeCasualties: cas, awayCasualties: casAway, resultStatus: "confirmed", confirmedAt: "2026-10-01T10:00:00Z",
  homePoints: matchPoints({ touchdownsFor: home, touchdownsAgainst: away, casualtiesFor: cas }),
  awayPoints: matchPoints({ touchdownsFor: away, touchdownsAgainst: home, casualtiesFor: casAway }),
});
const sent = (by, [home, away], [cas, casAway]) => ({
  resultStatus: "awaiting_confirmation", proposedByUserId: by, proposedHomeTouchdowns: home, proposedAwayTouchdowns: away,
  proposedHomeCasualties: cas, proposedAwayCasualties: casAway, proposedAt: "2026-10-02T10:00:00Z",
});
const round = (number, status, pairings) => ({ id: `r${number}`, seasonId: "s1", roundNumber: number, status, pairings });

// Rounds 1–6 are over, four matches each; round 3's last score was sent before 3.0 and never answered.
const PAST = [1, 2, 3, 4, 5, 6].map((number) => round(number, "completed", [[1, "e1", "e2"], [2, "e3", "e4"], [3, "e5", "e6"], [4, "e7", "e8"]]
  .map(([table, home, away]) => pairing(number, table, home, away, number === 3 && table === 4 ? sent("u9", [2, 1], [1, 0]) : played([1, 0])))));
// Round 7 is on (DeskAdminSeason.html): a confirmed pair, a score sent, one not played, a bye.
const live = (table, home, away, over = {}) => pairing(7, table, home, away, { roundStatus: "started", ...over });
const ROUND_7 = round(7, "started", [
  live(1, "e3", "e2", played([2, 1], [3, 1])),
  live(2, "e4", "e1", sent("u5", [1, 1], [2, 2])),
  live(3, "e5", "e6"),
  live(4, "e7", null),
]);
const seasonWith = (rounds, over = {}) => ({
  season: { id: "s1", name: "Season 1", status: "active", currentRound: 7 }, entries: ENTRIES, historicalEntries: [], standings: [], rounds,
  myEntry: null, currentFixture: null, myTeams: [], admin: { users: [ADMIN], savedTeams: [] }, ...over,
});
const SEASON = seasonWith([...PAST, ROUND_7]);

/** A score awaiting as `GET /api/admin/awaiting` sends it (`publicGame`). */
function game(pair) {
  const side = (entryId) => {
    const entry = ENTRIES.find((item) => item.id === entryId);
    return { user: { id: entry.user.id, login: entry.user.login }, team: { id: entry.team.id, name: entry.team.name, baseTeamSlug: "teams/orc", logoUrl: null } };
  };
  return { ...pair, kind: "league", season: { id: "s1", name: "Season 1", status: "active", currentRound: 7 }, home: side(pair.homeEntryId), away: side(pair.awayEntryId),
    viewerIsHome: false, viewerIsProposer: false };
}
const AWAITING = [game(PAST[2].pairings[3]), game(ROUND_7.pairings[1])];

/** The phone's media query, and the width crossing 900px. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return (next) => {
    media.matches = next;
    listeners.forEach((listener) => listener());
  };
}

function signIn(user = ADMIN) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = user;
  state.season = { data: null, loaded: false, loading: false, error: "" };
}

/** The admin on the season's administration, the season and the scores awaiting read. */
async function visit({ season = SEASON, awaiting = AWAITING, tab = "", phone = false, user = ADMIN } = {}) {
  const cross = width(phone);
  signIn(user);
  api.reply("GET /api/season", 200, season);
  api.reply("GET /api/admin/awaiting", 200, { games: awaiting });
  await renderAdminSeason(tab);
  await flush();
  return cross;
}

const keys = () => api.calls.map(({ key }) => key);
const writes = () => api.calls.filter(({ key }) => !key.startsWith("GET "));
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const words = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? "";
const resultOf = (id, from = "round") => view.querySelector(`[data-season-result="${id}"][data-season-from="${from}"]`);
const sheet = () => view.querySelector("dialog#admin-result");
const segment = (group, value) => view.querySelector(`[data-seg-group="${group}"] [data-seg-value="${value}"]`);
const option = (value) => view.querySelector(`#admin-result [data-option-value="${value}"]`);
const stepOf = (key, delta) => view.querySelector(`#admin-result [data-resource-key="${key}"] [data-resource-step="${delta}"]`);
const press = async (element) => {
  assert.ok(element, "the control is on the page");
  fireEvent(element, "click");
  await flush();
};
/** A test with toasts, whose timers a fake page cannot end. */
const it = (name, body) => test(name, () => withoutTimers(body));

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

test("the model: the round on, the rounds before, the pairs' statuses and scores, the generation's reason", () => {
  assert.deepEqual(PAIRING_STATUSES, ["confirmed", "awaiting", "pending", "bye", "post"]);
  const model = seasonRoundsModel({ seasonData: SEASON, awaiting: AWAITING });
  assert.equal(model.current.number, 7);
  assert.equal(model.draft, null);
  assert.deepEqual(model.past.map((one) => one.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(model.nextNumber, 8);
  assert.equal(model.canGenerate, "Pairs left: 2", "the pair with a score sent and the one not played; a bye has no opponent to wait for");
  assert.deepEqual(model.current.lines.map(({ table, status, score }) => [table, status, score]), [
    [1, "confirmed", "2–1 · CAS 3:1"], [2, "awaiting", "1–1 · CAS 2:2"], [3, "pending", "—"], [4, "bye", "tech. +2"],
  ]);
  assert.deepEqual(model.current.lines[1].proposal, { home: 1, away: 1, homeCas: 2, awayCas: 2, by: "cinder" });
  assert.deepEqual([model.current.lines[3].home.team, model.current.lines[3].away, model.current.lines[3].bye], ["Mudfoot Boyz", null, true]);
  assert.deepEqual(model.awaiting.map(({ id, round: number, friendly }) => [id, number, friendly]), [["r3p4", 3, false], ["r7p2", 7, false]]);
  assert.equal(model.awaiting[0].proposal.by, "teeth");

  // A technical result: «2–0 · tech.», its winner and reason; one stored before stage 12 has none and is «another reason».
  const technical = seasonWith([round(7, "started", [live(1, "e1", "e2", { ...played([0, 2]), resultType: "technical", technicalReason: "no_team", homePoints: 0, awayPoints: 4 }),
    live(2, "e3", "e4", { ...played([2, 0]), resultType: "technical", technicalReason: null, homePoints: 2, awayPoints: 0 })])]);
  const lines = seasonRoundsModel({ seasonData: technical }).current.lines;
  assert.deepEqual(lines.map(({ score, technical: result }) => [score, result]), [["0–2 · tech.", { winner: "away", reason: "no_team" }], ["2–0 · tech.", { winner: "home", reason: "other" }]]);
  assert.equal(seasonRoundsModel({ seasonData: technical }).canGenerate, "", "every pair of round 7 has its points");
  // A bye the server gave points to says them; a draft round closes the generation first.
  const scoredBye = seasonWith([round(7, "started", [live(1, "e7", null, { homeTouchdowns: 2, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0, homePoints: 4, awayPoints: 0, resultStatus: "confirmed" })])]);
  assert.equal(seasonRoundsModel({ seasonData: scoredBye }).current.lines[0].score, "tech. +4");
  const drafted = seasonRoundsModel({ seasonData: seasonWith([...PAST, round(7, "draft", [])]) });
  assert.deepEqual([drafted.current, drafted.draft.number, drafted.canGenerate, drafted.nextNumber], [null, 7, "First start or delete round 7", 8]);
  // A pair its post-match keeps says so until the post-match confirms it.
  const kept = seasonRoundsModel({ seasonData: seasonWith([round(7, "started", [live(1, "e1", "e2", { postMatchStatus: "draft" })])]) });
  assert.deepEqual([kept.current.lines[0].status, kept.current.lines[0].post], ["post", true]);
});

test("the sheet's model: the kind by the pair, a technical result's points, what each saves", () => {
  const model = seasonRoundsModel({ seasonData: SEASON, awaiting: AWAITING });
  const [confirmed, awaiting, pending, bye] = model.current.lines;
  assert.equal(resultSheetModel(pending).kind, "result");
  assert.equal(resultSheetModel(pending, { phase: "draft" }).kind, "pair", "a draft round's pairs are set, not scored");
  assert.equal(resultSheetModel({ ...pending, post: true }).kind, "post");
  assert.deepEqual(resultDraft(confirmed), { mode: "played", winner: "home", reason: "", home: { touchdowns: 2, casualties: 3 }, away: { touchdowns: 1, casualties: 1 },
    homeEntryId: "e3", awayEntryId: "e2" });
  assert.deepEqual(resultDraft(awaiting).home, { touchdowns: 1, casualties: 2 }, "the score sent is where the manual result starts");
  const draft = { ...resultDraft(pending), mode: "technical", winner: "away", reason: "no_team" };
  assert.equal(resultSheetModel(pending, { draft }).points, 4);
  assert.equal(resultSheetModel(pending, { draft: { ...draft, reason: "other" } }).points, 2);
  assert.deepEqual(resultBody(pending, draft), { mode: "technical", winner: "away", technicalReason: "no_team" });
  assert.deepEqual(resultBody(pending, { ...draft, mode: "played", home: { touchdowns: 2, casualties: 1 }, away: { touchdowns: 1, casualties: 0 } }),
    { mode: "played", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 1, awayCasualties: 0 });
  // A bye: its one team's counters, never a technical result (it has no opponent); the side with no team counts nothing.
  const byeModel = resultSheetModel(bye);
  assert.deepEqual([byeModel.sides, byeModel.modes], [["home"], false]);
  assert.deepEqual(resultBody(bye, { ...resultDraft(bye), mode: "technical", home: { touchdowns: 1, casualties: 2 } }),
    { mode: "played", homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 2, awayCasualties: 0 });
});

// ---------------------------------------------------------------------------
// The round under way
// ---------------------------------------------------------------------------

it("the round under way: its pairs in the prototype's columns, the generation closed while two are not confirmed", async () => {
  await visit();
  assert.equal(view.querySelector("h1").textContent, "Season 1");
  assert.ok(document.activeElement === view.querySelector("h1"));
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Administration → Season · Swiss system");
  assert.deepEqual(view.querySelectorAll(".g-admin__switch a").map((link) => link.getAttribute("aria-current")), [null, "page"], "the season's section");
  assert.deepEqual(view.querySelectorAll(".g-adminseason__tabs a").map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")]),
    [["Rounds and pairs", "#/administration/season", "page"], ["Entries", "#/administration/season/entries", null]]);
  assert.equal(view.querySelector(".g-adminseason__round h2").textContent, "Round 7 · on");
  const rows = view.querySelectorAll('.g-adminseason__round [role="row"]');
  assert.equal(rows.length, 1 + 4);
  const cells = (row) => row.querySelectorAll('[role="cell"], [role="columnheader"]').map(words);
  assert.deepEqual(cells(rows[0]), ["Table", "Home", "Away", "Score", "Status", "Result"]);
  assert.deepEqual(rows.slice(1).map(cells), [
    ["1", "Ashgrove Wardens", "Silverbrook Rangers", "2–1 · CAS 3:1", "Confirmed", "Result… · table 1"],
    ["2", "Cinderpeak Ash", "Grimtusk Raiders", "1–1 · CAS 2:2", "Awaiting confirmation", "Result… · table 2"],
    ["3", "Duskspire Knives", "Ratwharf Gnawers", "—", "Not played", "Result… · table 3"],
    ["4", "Mudfoot Boyz", "— BYE —", "tech. +2", "Bye", "Result… · table 4"],
  ]);
  assert.deepEqual(rows.slice(1).map((row) => row.querySelector(".g-adminseason__status").getAttribute("class").split(" ").at(-1)),
    ["g-adminseason__status--confirmed", "g-adminseason__status--awaiting", "g-adminseason__status--pending", "g-adminseason__status--bye"]);
  assert.match(words(view.querySelector(".g-adminseason__round .g-admin__note")),
    /^A new round can be generated once every result of round 7 is confirmed\. Pairs left: 2\. The Swiss system avoids rematches/);
  const generate = view.querySelector("[data-season-generate]");
  assert.equal(generate.textContent, "Generate round 8 · Swiss");
  assert.equal(generate.getAttribute("aria-disabled"), "true");
  assert.match(generate.getAttribute("title"), /Pairs left: 2/);
  await press(generate);
  assert.equal(toasts().at(-1), "Pairs left: 2", "a press says why");
  assert.deepEqual(keys(), ["GET /api/season", "GET /api/admin/awaiting"], "and sends nothing");

  // The scores awaiting: round 3's, sent before 3.0 in a round long over, and round 7's.
  const waiting = view.querySelector(".g-adminseason__awaiting");
  assert.equal(waiting.querySelector("h2").textContent, "Awaiting confirmation · 2");
  assert.deepEqual(waiting.querySelectorAll(".g-adminseason__waittext").map(words),
    ["Round 3 · Mudfoot Boyz — Iron Teeth · sent 2–1", "Round 7 · Cinderpeak Ash — Grimtusk Raiders · sent 1–1"]);
  assert.ok(resultOf("r3p4", "awaiting"));
  // The rounds before are folded.
  assert.equal(view.querySelector(".g-adminseason__past").hasAttribute("hidden"), true);
  assertCspSafe(view);
});

it("a technical result: the winner, the reason, the points it is worth; saved once", async () => {
  await visit();
  await press(resultOf("r7p3"));
  assert.ok(sheet()?.isModal, "the sheet opens");
  assert.equal(sheet().querySelector(".g-sheet__title").textContent, "Round 7 · table 3");
  assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Duskspire Knives — Ratwharf Gnawers");
  await press(segment("result-mode", "technical"));
  assert.equal(view.querySelector("#admin-result [data-resource-key]"), null, "no counters: the server writes 2–0");
  assert.deepEqual(view.querySelectorAll('[data-seg-group="result-winner"] [data-seg-value]').map((item) => item.textContent), ["Duskspire Knives", "Ratwharf Gnawers"]);
  segment("result-winner", "away").focus();
  await press(segment("result-winner", "away"));
  assert.ok(document.activeElement === segment("result-winner", "away"), "the choice keeps the focus: the sheet is patched");
  const save = () => view.querySelector("[data-result-save]");
  assert.equal(save().getAttribute("aria-disabled"), "true");
  await press(save());
  assert.equal(toasts().at(-1), "Choose the reason");
  assert.equal(writes().length, 0);
  assert.equal(option("no_team").querySelector(".g-option__sub").textContent, "+2 points");
  await press(option("other"));
  assert.equal(view.querySelector(".g-resultsheet__points").textContent, "To the winner: 2 points");
  await press(option("no_team"));
  assert.equal(view.querySelector(".g-resultsheet__points").textContent, "To the winner: 4 points");

  api.reply("PATCH /api/games/r7p3", 200, { game: { id: "r7p3" } });
  const gate = api.hold("PATCH /api/games/r7p3");
  fireEvent(save(), "click");
  await flush();
  assert.equal(save().getAttribute("aria-busy"), "true");
  fireEvent(save(), "click");
  await flush();
  gate.release();
  await flush();
  assert.deepEqual(keys().slice(2), ["PATCH /api/games/r7p3", "GET /api/season", "GET /api/admin/awaiting"], "one PATCH however many presses; the season and the scores read again");
  assert.deepEqual(api.calls[2].body, { mode: "technical", winner: "away", technicalReason: "no_team" });
  assert.equal(sheet(), null, "the sheet closes");
  assert.ok(document.activeElement === resultOf("r7p3"), "the focus back on the row's «Result…»");
  api.assertAnswered();
});

it("a played result is the four counters; a bye's is one side", async () => {
  await visit();
  await press(resultOf("r7p3"));
  assert.equal(segment("result-mode", "played").getAttribute("aria-checked"), "true");
  assert.deepEqual(view.querySelectorAll("#admin-result [data-resource-key]").map((row) => [row.getAttribute("data-resource-key"), words(row.querySelector(".g-resource__name"))]), [
    ["home-touchdowns", "Duskspire Knives · TD"], ["home-casualties", "Duskspire Knives · CAS"], ["away-touchdowns", "Ratwharf Gnawers · TD"], ["away-casualties", "Ratwharf Gnawers · CAS"],
  ]);
  for (const [key, delta] of [["home-touchdowns", 1], ["home-touchdowns", 1], ["away-touchdowns", 1], ["home-casualties", 1], ["away-casualties", 1], ["away-casualties", -1]]) {
    await press(stepOf(key, delta));
  }
  assert.equal(words(view.querySelector('#admin-result [data-resource-key="home-touchdowns"] .g-resource__value')), "2");
  api.reply("PATCH /api/games/r7p3", 200, { game: { id: "r7p3" } });
  await press(view.querySelector("[data-result-save]"));
  assert.deepEqual(writes().map(({ key, body }) => [key, body]), [["PATCH /api/games/r7p3", { mode: "played", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 1, awayCasualties: 0 }]]);

  // The bye: no modes, its one team's TD and CAS; the side with no team counts nothing.
  await press(resultOf("r7p4"));
  assert.equal(view.querySelector('[data-seg-group="result-mode"]'), null);
  assert.equal(words(sheet().querySelector(".g-sheet__sub")), "Mudfoot Boyz — — BYE —");
  assert.deepEqual(view.querySelectorAll("#admin-result [data-resource-key]").map((row) => row.getAttribute("data-resource-key")), ["home-touchdowns", "home-casualties"]);
  assert.ok(words(sheet()).includes(t("adminSeason.byeNote")));
  await press(stepOf("home-touchdowns", 1));
  api.reply("PATCH /api/games/r7p4", 200, { game: { id: "r7p4" } });
  await press(view.querySelector("[data-result-save]"));
  assert.deepEqual(writes().at(-1).body, { mode: "played", homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 });
  api.assertAnswered();
});

it("a score proposed before 3.0: confirm or reject it, or enter another", async () => {
  await visit();
  await press(resultOf("r3p4", "awaiting"));
  assert.equal(sheet().querySelector(".g-sheet__title").textContent, "Round 3 · table 4");
  assert.equal(words(sheet().querySelector(".g-resultsheet__sent")), "Score sent: 2–1 · CAS 1:0 · teeth");
  assert.equal(words(sheet().querySelector('[data-resource-key="home-touchdowns"] .g-resource__value')), "2", "another result starts from the one sent");
  assert.ok(sheet().querySelector("[data-result-save]"), "a manual result under it");
  api.reply("POST /api/games/r3p4/confirm", 200, { game: { id: "r3p4" } });
  api.reply("GET /api/admin/awaiting", 200, { games: [AWAITING[1]] });
  const gate = api.hold("POST /api/games/r3p4/confirm");
  fireEvent(view.querySelector("[data-result-confirm]"), "click");
  await flush();
  fireEvent(view.querySelector("[data-result-confirm]"), "click");
  gate.release();
  await flush();
  assert.deepEqual(keys().slice(2), ["POST /api/games/r3p4/confirm", "GET /api/season", "GET /api/admin/awaiting"], "confirmed once, then read again");
  assert.equal(sheet(), null);
  assert.equal(view.querySelector(".g-adminseason__awaiting h2").textContent, "Awaiting confirmation · 1");
  // The opener is gone with its row, and round 3 is folded: the focus goes to the card's title.
  assert.ok(document.activeElement === view.querySelector(".g-adminseason__awaiting h2"));

  await press(resultOf("r7p2"));
  api.reply("POST /api/games/r7p2/reject", 200, { game: { id: "r7p2" } });
  await press(view.querySelector("[data-result-reject]"));
  assert.deepEqual(writes().map(({ key }) => key), ["POST /api/games/r3p4/confirm", "POST /api/games/r7p2/reject"]);
  api.assertAnswered();
});

it("a pair the post-match keeps leads to it; a confirmed technical one's reason is changed alone", async () => {
  const kept = seasonWith([...PAST, round(7, "started", [
    live(1, "e3", "e2", { ...played([2, 0]), resultType: "technical", technicalReason: null, homePoints: 2, awayPoints: 0, postMatchStatus: "completed" }),
    live(2, "e4", "e1", { postMatchStatus: "draft" }),
  ])]);
  await visit({ season: kept, awaiting: [] });
  const rows = view.querySelectorAll('.g-adminseason__round [role="row"]').slice(1);
  assert.deepEqual(rows.map((row) => row.querySelectorAll('[role="cell"]').slice(3, 5).map(words)), [["2–0 · tech.", "Confirmed"], ["—", "Post-match"]]);

  await press(resultOf("r7p2"));
  assert.equal(sheet().querySelector("a[data-result-post]").getAttribute("href"), "#/games/r7p2/post-match");
  assert.ok(words(sheet()).includes("The post-match keeps this result."));
  assert.equal(sheet().querySelector("[data-resource-key], [data-result-save], [data-result-reason-save]"), null, "no manual result for a pair the post-match keeps");
  await press(sheet().querySelector("[data-sheet-close]"));
  assert.ok(document.activeElement === resultOf("r7p2"));

  await press(resultOf("r7p1"));
  assert.equal(option("other").getAttribute("aria-checked"), "true", "a technical result before stage 12 reads as another reason");
  const save = () => view.querySelector("[data-result-reason-save]");
  assert.equal(save().getAttribute("title"), "The reason is the same");
  await press(save());
  assert.equal(writes().length, 0);
  await press(option("no_team"));
  api.reply("PATCH /api/season/admin/pairings/r7p1/technical-reason", 200, kept);
  await press(save());
  assert.deepEqual(writes().map(({ key, body }) => [key, body]), [["PATCH /api/season/admin/pairings/r7p1/technical-reason", { technicalReason: "no_team" }]]);
  assert.deepEqual(keys().slice(2), ["PATCH /api/season/admin/pairings/r7p1/technical-reason"], "the answer is the season: nothing read again");
  assert.equal(sheet(), null);
  api.assertAnswered();
});

it("a draft round: start it, delete it, add a pair, set its sides", async () => {
  const drafted = seasonWith([...PAST, round(7, "started", [live(1, "e3", "e2", played([2, 1]))]),
    round(8, "draft", [pairing(8, 1, "e1", "e2", { roundStatus: "draft" }), pairing(8, 2, null, null, { roundStatus: "draft" })])]);
  await visit({ season: drafted, awaiting: [] });
  assert.equal(view.querySelector("[data-season-generate]").getAttribute("title"), "First start or delete round 8");
  const card = view.querySelector(".g-adminseason__draft");
  assert.equal(card.querySelector("h2").textContent, "Round 8 · draft");
  assert.deepEqual(card.querySelectorAll("[data-season-result]").map((button) => words(button)), ["Pair… · table 1", "Pair… · table 2"]);

  api.reply("POST /api/season/admin/rounds/r8/start", 200, drafted);
  await press(card.querySelector("[data-season-start]"));
  api.reply("POST /api/season/admin/rounds/r8/pairings", 201, drafted);
  await press(view.querySelector('.g-adminseason__draft [data-season-add-pair="r8"]'));
  answer = false;
  await press(view.querySelector("[data-season-delete-round]"));
  assert.equal(asked.at(-1), "Delete round 8 and its pairs?");
  answer = true;
  api.reply("DELETE /api/season/admin/rounds/r8", 200, drafted);
  await press(view.querySelector("[data-season-delete-round]"));
  assert.deepEqual(writes().map(({ key, body }) => [key, body]), [
    ["POST /api/season/admin/rounds/r8/start", {}],
    ["POST /api/season/admin/rounds/r8/pairings", { homeEntryId: "", awayEntryId: "" }],
    ["DELETE /api/season/admin/rounds/r8", {}],
  ], "the delete only after the question was answered yes");

  // The empty pair's sides: chosen among the entries no other pair of the round holds.
  await press(resultOf("r8p2"));
  const select = (side) => sheet().querySelector(`[data-pair-side="${side}"]`);
  assert.deepEqual(select("home").querySelectorAll("option").map((item) => item.getAttribute("value")), ["", "e3", "e4", "e5", "e6", "e7", "e8"]);
  assert.equal(select("home").querySelector("option").textContent, "— no team —");
  for (const [side, value] of [["home", "e3"], ["away", "e3"]]) {
    select(side).value = value;
    fireEvent(select(side), "change");
    await flush();
  }
  const save = () => view.querySelector("[data-pair-save]");
  assert.equal(save().getAttribute("title"), "A team cannot play itself.");
  select("away").value = "e4";
  fireEvent(select("away"), "change");
  await flush();
  api.reply("PATCH /api/season/admin/pairings/r8p2", 200, drafted);
  await press(save());
  assert.deepEqual(writes().at(-1).body, { homeEntryId: "e3", awayEntryId: "e4" });
  await press(resultOf("r8p1"));
  api.reply("DELETE /api/season/admin/pairings/r8p1", 200, drafted);
  await press(sheet().querySelector("[data-pair-delete]"));
  assert.equal(asked.at(-1), "Delete the pair at table 1?");
  assert.equal(writes().at(-1).key, "DELETE /api/season/admin/pairings/r8p1");
  api.assertAnswered();
});

it("past rounds are folded, and open", async () => {
  await visit();
  const card = view.querySelector(".g-adminseason__pastcard");
  assert.deepEqual([words(card.querySelector(".g-adminseason__pastname")), words(card.querySelector(".g-adminseason__pastline"))], ["Rounds 1–6", "over · matches: 24"]);
  const toggle = card.querySelector("[data-season-past]");
  assert.deepEqual([toggle.textContent, toggle.getAttribute("aria-expanded")], ["Show", "false"]);
  toggle.focus();
  await press(toggle);
  assert.equal(view.querySelectorAll('.g-adminseason__past [role="table"]').length, 6);
  assert.deepEqual(view.querySelectorAll(".g-adminseason__pasttitle").map(words).slice(0, 2), ["Round 1 · over", "Round 2 · over"]);
  assert.deepEqual([view.querySelector("[data-season-past]").textContent, view.querySelector("[data-season-past]").getAttribute("aria-expanded")], ["Hide", "true"]);
  assert.ok(document.activeElement === view.querySelector("[data-season-past]"), "the toggle keeps the focus");
  await press(view.querySelector("[data-season-past]"));
  assert.equal(view.querySelectorAll('.g-adminseason__past [role="table"]').length, 0);
});

it("no rounds yet: the first one generated, or an empty one", async () => {
  await visit({ season: seasonWith([]), awaiting: [] });
  assert.equal(view.querySelector(".g-adminseason__next h2").textContent, "No rounds yet");
  assert.equal(view.querySelector(".g-adminseason__awaiting"), null, "nothing awaits: no card");
  const generate = view.querySelector("[data-season-generate]");
  assert.deepEqual([generate.textContent, generate.getAttribute("aria-disabled")], ["Generate round 1 · Swiss", null]);
  api.reply("POST /api/season/admin/rounds/generate", 201, seasonWith([round(1, "draft", [])]));
  await press(generate);
  assert.equal(view.querySelector(".g-adminseason__draft h2").textContent, "Round 1 · draft");
  assert.ok(words(view.querySelector(".g-adminseason__draft")).includes("No pairs yet"));
  api.reply("DELETE /api/season/admin/rounds/r1", 200, seasonWith([]));
  await press(view.querySelector("[data-season-delete-round]"));
  api.reply("POST /api/season/admin/rounds", 201, seasonWith([]));
  await press(view.querySelector("[data-season-empty-round]"));
  assert.deepEqual(writes().map(({ key }) => key), ["POST /api/season/admin/rounds/generate", "DELETE /api/season/admin/rounds/r1", "POST /api/season/admin/rounds"]);
  assert.ok(view.contains(document.activeElement) && document.activeElement !== document.body, "the focus stays in the screen");
});

it("a refusal is the server's words; a lost answer reads the season again and sends nothing twice", async () => {
  await visit({ season: seasonWith([]), awaiting: [] });
  api.reply("POST /api/season/admin/rounds/generate", 400, { error: { code: "NEED_A_COMMITTED_TEAM" } });
  await press(view.querySelector("[data-season-generate]"));
  assert.equal(words(view.querySelector('.g-adminseason__alert[role="alert"]')), t("error.NEED_A_COMMITTED_TEAM"));

  // A refusal of the sheet's write stays in the sheet, the draft kept.
  await visit();
  await press(resultOf("r7p3"));
  await press(stepOf("home-touchdowns", 1));
  api.reply("PATCH /api/games/r7p3", 409, { error: { code: "POST_RESULT_LOCKED" } });
  await press(view.querySelector("[data-result-save]"));
  assert.ok(sheet()?.isModal, "the sheet stays open");
  assert.equal(words(sheet().querySelector('.g-resultsheet__alert[role="alert"]')), t("error.POST_RESULT_LOCKED"));
  assert.equal(words(sheet().querySelector('[data-resource-key="home-touchdowns"] .g-resource__value')), "1");
  assert.deepEqual(keys().slice(2), ["PATCH /api/games/r7p3"], "a refusal changed nothing: nothing read again");

  // A lost answer: never sent again; the season and the scores read again, the sheet closed, the screen says to check.
  await visit();
  await press(resultOf("r7p3"));
  api.fail("PATCH /api/games/r7p3");
  await press(view.querySelector("[data-result-save]"));
  assert.deepEqual(keys().slice(2), ["PATCH /api/games/r7p3", "GET /api/season", "GET /api/admin/awaiting"]);
  assert.equal(sheet(), null);
  assert.equal(words(view.querySelector('.g-adminseason__alert[role="alert"]')), t("administration.mayHaveWritten"));
  assert.ok(document.activeElement === resultOf("r7p3"));

  // Another tab's token: nothing sent, its words said.
  await press(resultOf("r7p3"));
  api.items.set(TOKEN, "another");
  await press(view.querySelector("[data-result-save]"));
  assert.equal(words(sheet().querySelector('.g-resultsheet__alert[role="alert"]')), t("auth.otherTab"));
  assert.deepEqual(writes().map(({ key }) => key), ["PATCH /api/games/r7p3"]);
});

it("the entries until their task: the tab, the card, the way to the league's table", async () => {
  await visit({ tab: "entries" });
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Administration → Season · entries");
  assert.deepEqual(view.querySelectorAll(".g-adminseason__tabs a").map((link) => link.getAttribute("aria-current")), [null, "page"]);
  assert.equal(view.querySelector(".g-admin__card h2").textContent, "Entries");
  assert.equal(view.querySelector(".g-admin__card a").getAttribute("href"), "#/season");
  assert.deepEqual(keys(), ["GET /api/season"], "the scores awaiting are the rounds'");
});

it("a coach who is no admin is told the section is the admin's, and nothing is read", async () => {
  await visit({ user: COACH });
  assert.equal(view.querySelector("h1").textContent, "Administration");
  assert.equal(view.querySelector(".g-callout__title").textContent, t("administration.only"));
  assert.equal(view.querySelector(".g-adminseason__tabs"), null);
  assert.deepEqual(api.calls, []);
});

// ---------------------------------------------------------------------------
// The addresses
// ---------------------------------------------------------------------------

test("the old address of the season's administration leads here", () => {
  assert.deepEqual(matchRoute("administration/season"), { name: "adminSeason", params: { tab: "" } });
  assert.deepEqual(matchRoute("administration/season/entries"), { name: "adminSeason", params: { tab: "entries" } });
  assert.equal(matchRoute("administration/season/other").name, "page");
  assert.deepEqual(resolveRedirect("season/administration", { signedIn: true }), { target: "#/administration/season", returnTo: "" });
  // A guest: there, then to sign in, and back there after.
  const first = resolveRedirect("season/administration", { signedIn: false });
  assert.equal(first.target, adminSeasonUrl());
  assert.deepEqual(resolveRedirect(routeFromHash(first.target), { signedIn: false, hash: first.target }), { target: "#/login", returnTo: "#/administration/season" });
  assert.equal(resolveRedirect("administration/season/entries", { signedIn: false }).target, "#/login");
  const model = shellModel({ route: matchRoute("administration/season"), user: ADMIN, team: null });
  assert.deepEqual(model.side.filter((item) => item.current).map((item) => item.key), ["administration"]);
});

// ---------------------------------------------------------------------------
// The width, leaving, and the rules every screen owes
// ---------------------------------------------------------------------------

it("crossing 900px draws the other form, the focus kept or on the title", async () => {
  const cross = await visit({ phone: true });
  assert.ok(view.querySelector(".g-admin__head .g-pagehead--phone"), "a phone's title stands");
  view.querySelector("[data-season-past]").focus();
  cross(false);
  assert.equal(view.querySelector(".g-admin__head .g-pagehead--phone"), null);
  assert.ok(document.activeElement === view.querySelector("[data-season-past]"), "the focus kept");
  assert.equal(api.calls.length, 2, "nothing read again");
});

it("leaving stops listening", async () => {
  const cross = await visit();
  assert.equal(pendingScreenCleanupCount(), 1);
  releaseCurrentScreen();
  assert.equal(pendingScreenCleanupCount(), 0);
  const before = view.querySelector("h1");
  cross(true);
  assert.equal(view.querySelector("h1"), before, "a width that crosses draws nothing");
  fireEvent(view.querySelector("[data-season-result]"), "click");
  await flush();
  assert.equal(view.querySelector("dialog#admin-result"), null, "a press opens nothing");
});

it("names are text; no inline style; styled", async () => {
  const hostile = ENTRIES.map((entry) => ({ ...entry, user: { ...entry.user, login: HOSTILE }, team: { ...entry.team, name: HOSTILE } }));
  const season = { ...SEASON, entries: hostile, season: { ...SEASON.season, name: HOSTILE } };
  const games = AWAITING.map((one) => ({ ...one, home: { user: { id: "u4", login: HOSTILE }, team: { id: "t", name: HOSTILE } }, away: { user: { id: "u9", login: HOSTILE }, team: { id: "x", name: HOSTILE } } }));
  for (const phone of [true, false]) {
    await visit({ season, awaiting: games, phone });
    await press(view.querySelector("[data-season-past]"));
    await press(resultOf("r3p4", "awaiting"));
    assert.equal(view.querySelector("img"), null);
    assert.equal(view.querySelector("h1").textContent, HOSTILE);
    assert.ok(words(view.querySelectorAll('.g-adminseason__round [role="row"]')[1]).includes(HOSTILE));
    assert.equal(sheet().querySelector(".g-sheet__sub").textContent, `${HOSTILE} — ${HOSTILE}`);
    assertCspSafe(view);
    assertStyled(view, CSS, "src/screens/admin/admin.css", "page-head.css", "segmented-control.css", "sheet.css", "resource-counter.css", "button.css", "callout.css");
  }
  // The draft round's sheet and the technical mode, drawn too.
  const drafted = seasonWith([round(7, "started", [live(1, "e3", "e2")]), round(8, "draft", [pairing(8, 1, null, null, { roundStatus: "draft" })])]);
  await visit({ season: drafted, awaiting: [] });
  await press(resultOf("r8p1"));
  assertCspSafe(view);
  assertStyled(view, CSS, "src/screens/admin/admin.css", "page-head.css", "segmented-control.css", "sheet.css", "button.css", "callout.css");
  await press(sheet().querySelector("[data-sheet-close]"));
  await press(resultOf("r7p1"));
  await press(segment("result-mode", "technical"));
  assertStyled(view, CSS, "src/screens/admin/admin.css", "page-head.css", "segmented-control.css", "sheet.css", "option-card.css", "button.css", "callout.css");
  const styles = text("src/styles.css");
  assert.ok(styles.indexOf('@import url("screens/admin/season.css");') > styles.indexOf('@import url("screens/admin/admin.css");'), "after the frame's sheet");
});

test("every key in both dictionaries: the reasons by TECHNICAL_REASONS, the statuses by PAIRING_STATUSES", () => {
  assertDictionaryCovers("src/screens/admin/season.mjs", "src/screens/admin/season-rounds.mjs", "src/screens/admin/result-sheet.mjs");
  const [en, ru] = ["en", "ru"].map(dictionary);
  for (const reason of TECHNICAL_REASONS) assert.ok(en[`adminSeason.reason.${reason}`] && ru[`adminSeason.reason.${reason}`], reason);
  for (const status of PAIRING_STATUSES) assert.ok(en[`adminSeason.status.${status}`] && ru[`adminSeason.status.${status}`], status);
  for (const key of ["col.table", "col.home", "col.away", "col.score", "col.status", "col.action", "mode.played", "mode.technical"]) {
    assert.ok(en[`adminSeason.${key}`] && ru[`adminSeason.${key}`], key);
  }
  const own = Object.keys(en).filter((key) => key.startsWith("adminSeason."));
  assert.deepEqual(Object.keys(ru).filter((key) => key.startsWith("adminSeason.")), own, "the same keys in the same order");
  // The plan's words (decisions 17–19): the Russian a coach of the league reads.
  assert.deepEqual(["roundOn", "addPair", "generate", "pairsLeft", "draftFirst", "status.confirmed", "status.awaiting", "status.pending", "status.post", "reason.no_team", "reason.other",
    "reasonBonus", "winnerPoints", "save", "byPost", "saveReason", "savePair", "deletePair", "awaiting", "pastMany", "pastLine", "show", "emptyRound", "start", "deleteRound", "result"]
    .map((key) => ru[`adminSeason.${key}`]), ["Тур {round} · идёт", "+ Пара вручную", "Сгенерировать тур {round} · швейцарка", "Осталось пар: {count}", "Сначала начните или удалите тур {round}",
    "Подтверждён", "Ждёт подтверждения", "Не сыгран", "Итоги матча", "Соперник не смог выставить команду", "Другая причина", "+{points} к очкам", "Победителю: {points} очка",
    "Сохранить результат", "Результат ведут итоги матча.", "Сохранить причину", "Сохранить пару", "Удалить пару", "Ждут подтверждения · {count}", "Туры {first}–{last}",
    "завершены · матчей: {count}", "Показать", "Пустой тур", "Начать тур", "Удалить тур", "Результат…"]);
});

test("readable: the statuses and the words on the cards, in every palette", () => {
  assertReadable(CSS, ".g-adminseason__status--confirmed", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__status--awaiting", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__status--pending", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__status--bye", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__status--post", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__row--head", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__no", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__pastline", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__btn", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__btn--go", "color", ["--accent"], 4.5);
  assertReadable(CSS, ".g-adminseason__btn--danger", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminseason__result", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-resultsheet__sent", "color", ["--warn-tint"], 4.5);
  assertReadable(CSS, ".g-resultsheet__label", "color", ["--surface"], 4.5);
});

test("nothing is cut with «…»; long lines wrap; the 900/901 breakpoints only", () => {
  assert.doesNotMatch(text(CSS), /ellipsis|nowrap|@media \((?!max-width: 900px|min-width: 901px)/);
  for (const selector of [".g-adminseason__cell", ".g-adminseason__waittext", ".g-adminseason__title", ".g-resultsheet__sent"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
});

test("the prototype's measures: the six columns, the head in capitals, the rows, «Result…», the segments", () => {
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row", "grid-template-columns").slice(0, 1),
    ["40px minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.2fr) 120px"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row", "min-height").slice(0, 1), ["56px"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row--head", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row--head", "letter-spacing"), ["0.04em"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row--head", "font"), ["700 12px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__row--head", "border-bottom"), ["1px solid var(--line-strong)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__result", "min-height").slice(0, 1), ["36px"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__result", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__btn", "min-height").slice(0, 1), ["40px"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminseason__title", "font"), ["700 24px/1.2 var(--font-display)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-adminseason__tabs", "max-width"), ["420px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-adminseason__tabs .g-seg__item", "min-height"), ["38px"]);
});

test("D2: «Result…», the segments, «+ Pair» — 44 on a phone, 24 and more from 901px", () => {
  const px = (value) => (value === "var(--size-touch)" ? 44 : Number(String(value).replace("px", "")));
  for (const selector of [".g-adminseason__btn", ".g-adminseason__result", ".g-resultsheet__select", ".g-adminseason__tabs .g-seg__item", ".g-resultsheet .g-seg__item"]) {
    const phone = inMedia(CSS, "max-width: 900px", selector, "min-height");
    assert.ok(phone.length && px(phone[0]) >= 44, `${selector} on a phone`);
  }
  for (const selector of [".g-adminseason__btn", ".g-adminseason__result", ".g-resultsheet__select"]) {
    assert.ok(px(valuesOf(CSS, selector, "min-height")[0]) >= 24, `${selector} on a desk`);
  }
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-adminseason__tabs .g-seg__item", "min-height")[0]) >= 24);
});

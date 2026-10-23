import assert from "node:assert/strict";
import test from "node:test";

import { assertCspSafe, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

/*
 * Advancing in the post-match (stage 09b, Task 10; decisions 13, 21, 22): «Advance» on the Players step opens the
 * roster's own sheet (07d: Adv1Type…Adv4Done, Adv3Random, DeskRosterAdv) for the player as the post-match holds him, and
 * lends it the post-match's take (`advance`, an action of the post-match), its dice (`POST …/post-match/rolls`) and its
 * bind (the roster's, after the post-match). A roster «Favoured of…» marks the god's D8 with every advancement (the
 * owner, 2026-10-21). The domain applies the actions (test/helpers/post-cases.mjs): every payload the fake server sends
 * is one the server could.
 */

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.location = { hash: "", replaced: "", replace(target) { this.replaced = target; } };
let clock = Date.parse("2026-10-21T10:00:00Z");
Date.now = () => clock;

const { renderPostMatch } = await import("../src/screens/matches/post.mjs");
const { postMatchUrl } = await import("../src/core/routes.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");
const { postPlayers } = await import("../src/domain/post-match/roster.mjs");
const { playerAvailableSpp } = await import("../src/domain/roster/progression.mjs");
const { postAdvanceKey, postAdvanceWhere } = await import("../src/screens/matches/post-advance.mjs");
const { AWAY, HOME, act, agreed, begin, data, payloadOf, players, reach } = await import("./helpers/post-cases.mjs");

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let round = 0; round < 8; round += 1) await settle();
};

const READ = "GET /api/games/g1/post-match";
const WRITE = "PATCH /api/games/g1/post-match";
const ROLLS = "POST /api/games/g1/post-match/rolls";
const COACH = { id: "u-home", login: "home" };
const json = (value) => JSON.parse(JSON.stringify(value));
const payload = (post, over = {}) => json(payloadOf(post, over));

/** Mock Team with 30 SPP of L. Ashby's (h3, a Catcher: Agility and General) from the matches before: his to spend. */
const SEASONED = HOME.map((player) => (player.id === "h3" ? { ...player, spp: { touchdowns: 10 } } : player));
/** Both sides on the Players step, the home side's records saved with L. Ashby the MVP. */
function onPlayers(home = {}, away = {}) {
  const post = reach(agreed(begin({ home: { roster: SEASONED, ...home }, away })), { home: 2, away: 2 });
  return act(post, "home", { type: "statistics", statistics: post.home.statistics, injuries: post.home.injuries, mvps: [post.home.snapshot.players[2].id], departures: {} });
}

const GENERAL = ["Block", "Dauntless", "Fend", "Frenzy", "Kick", "Pro", "Steady Footing", "Strip Ball", "Sure Hands", "Tackle", "Taunt", "Wrestle",
  "Offensive", "Elvenball", "Shadowing", "Thick Skull"];
const rollId = (n) => `8f6c1d1e-0000-4000-8000-00000000000${n}`;
/** L. Ashby's two D16 as the server answers them (`publicRoll`): Frenzy and Strip Ball. */
const pairRoll = (n = 1, playerId = "h3") => ({
  id: rollId(n), playerId, purpose: "random_skill", params: { category: "General", candidates: GENERAL, sides: 16, captain: false },
  result: { dice: [{ attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }, { attempts: [{ roll: 8, skill: "Strip Ball", duplicate: false }], skill: "Strip Ball" }] },
  usedAt: null, createdAt: "2026-10-21T10:00:00Z",
});
/** His D8: a 5 — MA or PA. */
const D8 = { id: rollId(3), playerId: "h3", purpose: "stat", params: { sides: 8 }, result: { roll: 5, stats: ["ma", "pa"] }, usedAt: null, createdAt: "2026-10-21T10:00:00Z" };

/** A coach on the post-match of g1 at `post`, on a phone unless told otherwise. */
async function visit(post, { phone = true, over = {}, user = COACH } = {}) {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = "";
  document.hidden = false;
  location.hash = postMatchUrl("g1", "players");
  state.auth.currentUser = user;
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  api.reply("GET /api/teams", 200, { teams: [] });
  api.reply(READ, 200, payload(post, over));
  globalThis.matchMedia = (query) => ({ matches: query === "(max-width: 900px)" ? phone : false, addEventListener() {}, removeEventListener() {} });
  await renderPostMatch("g1", "players");
  await flush();
  clock += 1000;
}

const calls = (key) => api.calls.filter((call) => call.key === key);
const writes = () => calls(WRITE).map(({ body }) => body);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const sheet = () => view.querySelector("dialog#player-advance");
const advanceOf = (id) => view.querySelector(`[data-player-advance="${id}#0"]`);
const typeCard = (type) => sheet().querySelector(`.g-options [data-option-value="${type}"]`);
const next = () => sheet().querySelector("[data-advance-next]");
const category = (name) => sheet().querySelector(`[data-advance-category="${name}"]`);
const take = () => sheet().querySelector("[data-advance-take]");
const rollButton = () => sheet().querySelector("[data-advance-roll]");
const pick = (name) => sheet().querySelector(`[data-advance-pick="${name}"]`);
const way = (value) => sheet().querySelector(`[data-seg-group="advance-via"] [data-seg-value="${value}"]`);
const face = (n) => sheet().querySelector(`[data-advance-face="${n}"]`);
const stat = (key) => sheet().querySelector(`[data-advance-stat="${key}"]`);
const refusal = () => sheet().querySelector(".g-advance__lines .g-player-sheet__refusal")?.textContent ?? null;
const tiles = () => sheet().querySelectorAll(".g-advance__tile dd").map((tile) => tile.textContent);
const status = () => sheet().querySelector(".g-advance__status")?.textContent ?? null;
const press = async (element) => {
  assert.ok(element, "the control is on the page");
  fireEvent(element, "click");
  await flush();
};
/** On a phone: «Random primary skill», «Next», the category, «Next». */
async function toRandom(name = "General") {
  await press(typeCard("random"));
  await press(next());
  await press(category(name));
  await press(next());
}
/** The write the server answers with the domain's own state after `action`. */
const answers = (post, action) => api.reply(WRITE, 200, payload(act(post, "home", action)));
const it = (name, body) => test(name, () => withoutTimers(body));

it("«Advance» opens the roster's sheet for the player as the post-match holds him", async () => {
  const post = onPlayers();
  await visit(post);
  const where = postAdvanceWhere({ payload: payload(post), sideName: "home", ui: { busy: false, playersWaiting: false, drafts: { players: null } } });
  assert.equal(postAdvanceKey({ payload: payload(post), sideName: "home", ui: { busy: false, playersWaiting: false, drafts: { players: null } } }, "h3"), "h3#0",
    "the card's key is the sheet's line's (pre-flight L17)");
  assert.equal(where.lines.some(({ id }) => id === "h9"), false, "J. Corr missed the match: no advancement here (L16)");
  await press(advanceOf("h3"));
  assert.ok(sheet(), "the roster's sheet, over the step");
  // His SPP of the post-match: 30 before, TD 3 + COMP 1 and the MVP's.
  const ashby = postPlayers(post, "home", data).find(({ id }) => id === "h3");
  const spp = playerAvailableSpp(post.home.reference, ashby);
  assert.ok(spp > 34, "the MVP's are in");
  assert.equal(sheet().querySelector(".g-sheet__sub").textContent, t("teamAdvance.sub", { spp, next: 1 }));
  assert.ok(typeCard("random") && typeCard("primary") && typeCard("stat"));
  assertCspSafe(view);
  // A phone's «Back» walks the steps back, as on the roster.
  await press(typeCard("random"));
  await press(next());
  assert.ok(category("General"));
  await press(sheet().querySelector("[data-sheet-back]"));
  assert.ok(typeCard("random") && !category("General"), "the types again");
  // «Cancel» on a desk, «‹» on a phone's first step closes it: the focus back on «Advance».
  await press(sheet().querySelector("[data-sheet-close]"));
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, advanceOf("h3"));
  assert.equal(writes().length, 0);
  api.assertAnswered();
});

it("a random skill is two dice on the site, asked of the post-match; the coach takes one", async () => {
  const post = onPlayers();
  await visit(post);
  await press(advanceOf("h3"));
  await toRandom();
  assert.equal(rollButton().textContent, t("teamAdvance.rollD16"));
  api.reply(ROLLS, 200, { roll: pairRoll(1) });
  await press(rollButton());
  assert.deepEqual(calls(ROLLS).map(({ body }) => body), [{ side: "home", playerId: "h3", purpose: "random_skill", category: "General" }]);
  assert.ok(pick("Frenzy") && pick("Strip Ball"), "the pair");
  await press(pick("Strip Ball"));
  assert.equal(take().textContent, t("teamAdvance.accept", { skill: "Strip Ball" }));
  const action = { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { id: rollId(1), via: "site" } };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
  assert.equal(writes()[0].side, "home");
  assert.equal(writes()[0].revision, post.revision);
  assert.ok(sheet().querySelector(".g-advance__done"));
  assert.equal(tiles()[0], "−3");
  assert.equal(status(), "Saved in the post-match: on the roster once it is finished", "the post-match's draft, not the roster (Task 10 review)");
  assert.equal(document.activeElement, sheet().querySelector("[data-advance-done]"));
  assert.equal(sheet().querySelector("[data-advance-done]").textContent, t("teamAdvance.finish"), "back to the step, not to a player's page");
  // The step drawn from the answer: the advancement on his card, with «Undo».
  await press(sheet().querySelector("[data-advance-done]"));
  assert.equal(sheet(), null);
  assert.ok(view.querySelector('[data-after-untake="h3"]'));
  // A second advancement of his asks a fresh roll of the post-match (pre-flight L1).
  const taken = act(post, "home", action);
  await visit(taken);
  await press(advanceOf("h3"));
  await toRandom();
  api.reply(ROLLS, 200, { roll: pairRoll(2) });
  await press(rollButton());
  await press(pick("Frenzy"));
  const second = { ...action, grant: { skill: "Frenzy" }, roll: { id: rollId(2), via: "site" } };
  answers(taken, second);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [second]);
  assert.equal(tiles()[2], t("teamAdvance.doneLevelOf", { level: 2 }));
  api.assertAnswered();
});

it("a characteristic's D8 the same way, a skill in its place too", async () => {
  const post = onPlayers();
  await visit(post);
  await press(advanceOf("h3"));
  await press(typeCard("stat"));
  await press(next());
  api.reply(ROLLS, 200, { roll: D8 });
  await press(rollButton());
  assert.deepEqual(calls(ROLLS).map(({ body }) => body), [{ side: "home", playerId: "h3", purpose: "stat" }]);
  await press(stat("ma"));
  const action = { type: "advance", playerId: "h3", advancementType: "stat", grant: { stat: "ma" }, roll: { id: rollId(3), via: "site" } };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
  assert.ok(sheet().querySelector(".g-advance__done"));
  // A skill in place of the characteristic, on the same D8.
  await visit(post);
  await press(advanceOf("h3"));
  await press(typeCard("stat"));
  await press(next());
  api.reply(ROLLS, 200, { roll: D8 });
  await press(rollButton());
  await press(sheet().querySelector("[data-advance-instead]"));
  await press(category("General"));
  await press(next());
  await press(sheet().querySelector('[data-advance-skill="Block"]'));
  const instead = { type: "advance", playerId: "h3", advancementType: "stat", grant: { skill: "Block" }, roll: { id: rollId(3), via: "site" } };
  answers(post, instead);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [instead]);
  assert.ok(sheet().querySelector(".g-advance__done"));
  api.assertAnswered();
});

it("at the table the advancement names a table roll", async () => {
  const post = onPlayers();
  await visit(post);
  await press(advanceOf("h3"));
  await toRandom();
  await press(way("table"));
  await press(face(4));
  await press(face(8));
  await press(pick("Strip Ball"));
  const action = { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { via: "table" } };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
  assert.equal(calls(ROLLS).length, 0, "nothing rolled on the site");
  api.assertAnswered();
});

// Task 10 review: the done step of a desk's window (DeskRosterAdv) says where the advancement is — in the post-match, not
// in the player's profile, which the roster's window says: it reaches the roster only once the post-match is finished.
it("on a desk the done step says the advancement is in the post-match, on the roster once it is finished", async () => {
  const post = onPlayers();
  await visit(post, { phone: false });
  await press(advanceOf("h3"));
  await press(typeCard("random"));
  await press(category("General"));
  await press(way("table"));
  await press(face(4));
  await press(face(8));
  await press(pick("Strip Ball"));
  const action = { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { via: "table" } };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
  assert.ok(sheet().querySelector(".g-advance__done"));
  const summary = sheet().querySelector(".g-advance__summary");
  assert.equal(summary.getAttribute("role"), "status");
  assert.equal(summary.textContent, "Saved in the post-match: on the roster once it is finished");
  assert.notEqual(summary.textContent, t("teamAdvance.savedDesk"), "not the roster's «Saved in the player's profile»");
  api.assertAnswered();
});

it("a journeyman's advancement is the table's; the site says why", async () => {
  // Six of Mock Team play (Gata is sevens): a Lineman journeyman with a touchdown of his own.
  const six = SEASONED.slice(0, 6);
  const begun = reach(agreed(begin({ home: { roster: six, journeymen: [0] } })), { home: 2, away: 2 });
  const statistics = { ...begun.home.statistics, "journeyman-7": { ...begun.home.statistics["journeyman-7"], touchdowns: 1 } };
  const post = act(begun, "home", { type: "statistics", statistics, injuries: begun.home.injuries, mvps: ["h3"], departures: {} });
  await visit(post);
  await press(advanceOf("journeyman-7"));
  await toRandom();
  await press(rollButton());
  assert.equal(refusal(), t("after.rollJourneyman"));
  assert.equal(calls(ROLLS).length, 0, "nothing asked");
  // At the table it is his.
  await press(way("table"));
  await press(face(4));
  await press(face(8));
  await press(pick("Frenzy"));
  const action = { type: "advance", playerId: "journeyman-7", advancementType: "random", grant: { skill: "Frenzy" }, roll: { via: "table" } };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
});

it("the admin rolls nothing on the site", async () => {
  const away = players("a", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { 0: { spp: { touchdowns: 10 } } });
  const post = onPlayers({}, { roster: away });
  await visit(post, { user: { id: "u-admin", login: "admin" }, over: { isAdmin: true, viewerSide: "away" } });
  await press(advanceOf("a1"));
  await toRandom();
  await press(rollButton());
  assert.equal(refusal(), t("after.rollAdmin"));
  assert.equal(calls(ROLLS).length, 0);
  assert.equal(AWAY.length, 11);
});

it("a take pressed twice while its write is on its way sends one", async () => {
  const post = onPlayers();
  await visit(post);
  await press(advanceOf("h3"));
  await toRandom();
  await press(way("table"));
  await press(face(4));
  await press(face(8));
  await press(pick("Strip Ball"));
  const action = { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { via: "table" } };
  answers(post, action);
  const gate = api.hold(WRITE);
  fireEvent(take(), "click");
  await flush();
  assert.equal(take().getAttribute("aria-busy"), "true", "busy while it goes");
  fireEvent(take(), "click");
  await flush();
  assert.equal(calls(WRITE).length, 1);
  assert.deepEqual(toasts().filter((words) => words === t("after.passed")), [], "a busy «Take» is no closed control of the page's");
  gate.release();
  await flush();
  assert.equal(calls(WRITE).length, 1);
  assert.ok(sheet().querySelector(".g-advance__done"));
});

// Task 10 lens review: a press in the sheet while the post-match's take is on its way does not change what done says.
it("a press while the take is on its way leaves done saying what was taken", async () => {
  const post = onPlayers();
  await visit(post, { phone: false });
  await press(advanceOf("h3"));
  await press(typeCard("random"));
  await press(category("General"));
  await press(way("table"));
  await press(face(4));
  await press(face(8));
  await press(pick("Strip Ball"));
  answers(post, { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { via: "table" } });
  const gate = api.hold(WRITE);
  fireEvent(take(), "click");
  await flush();
  await press(category("Agility"));
  gate.release();
  await flush();
  assert.match(sheet().querySelector(".g-advance__donetitle").textContent, /Strip Ball/);
  assert.match(sheet().querySelector(".g-advance__how").textContent, /General/);
  assert.doesNotMatch(sheet().querySelector(".g-advance__how").textContent, /Agility/);
});

// Task 10 lens review: «Done» after the player's last affordable advancement has no «Advance» to go back to — the focus
// goes to what the sheet made, his card's «Undo», never to the footer's «Next».
it("«Done» after his last affordable advancement gives the focus to his card's «Undo», not to «Next»", async () => {
  const post = onPlayers();
  await visit(post);
  await press(advanceOf("h4")); // R. Pike: a touchdown, 3 SPP — one random skill
  await toRandom();
  await press(way("table"));
  await press(face(4));
  await press(face(8));
  await press(pick("Strip Ball"));
  const action = { type: "advance", playerId: "h4", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { via: "table" } };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
  await press(sheet().querySelector("[data-advance-done]"));
  assert.equal(sheet(), null);
  assert.equal(advanceOf("h4"), null, "no advancement left for him");
  const focused = document.activeElement;
  assert.ok(focused === view.querySelector('[data-after-untake="h4"]'), `the focus on his «Undo», not on ${focused?.getAttribute?.("class") ?? focused?.tagName}`);
  api.assertAnswered();
});

it("while the Players step is written the advancement waits, and says so", async () => {
  const post = onPlayers();
  await visit(post);
  const gate = api.hold(WRITE);
  fireEvent(view.querySelector('.g-after__mvp [data-after-mvp="h4"]'), "click");
  await flush();
  assert.equal(calls(WRITE).length, 1, "the MVP's statistics on their way");
  fireEvent(advanceOf("h3"), "click");
  await flush();
  assert.equal(toasts().at(-1), t("teamRoster.mark.waitSave"));
  assert.equal(sheet(), null);
  gate.release({ status: 200, body: payload(act(post, "home", { type: "statistics", statistics: post.home.statistics, injuries: post.home.injuries, mvps: ["h4"], departures: {} })) });
  await flush();
  await press(advanceOf("h3"));
  assert.ok(sheet(), "open once the write has landed");
});

it("a refused take is said in the sheet, which stays", async () => {
  const post = onPlayers();
  await visit(post);
  await press(advanceOf("h3"));
  await toRandom();
  api.reply(ROLLS, 200, { roll: pairRoll(1) });
  await press(rollButton());
  await press(pick("Strip Ball"));
  api.reply(WRITE, 422, { error: { code: "DICE_ROLL_MISMATCH", params: { playerId: "h3" }, message: "x" } });
  await press(take());
  assert.equal(calls(WRITE).length, 1);
  assert.equal(refusal(), t("error.DICE_ROLL_MISMATCH"));
  assert.ok(!sheet().querySelector(".g-advance__done"), "the sheet stays on its choice");
  assert.ok(pick("Strip Ball"));
  // A lost answer reads the post-match again: one that landed is taken as taken.
  const action = { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { id: rollId(1), via: "site" } };
  api.fail(WRITE);
  api.reply(READ, 200, payload(act(post, "home", action)));
  await press(take());
  assert.ok(sheet().querySelector(".g-advance__done"), "the read shows it landed");
  assert.equal(calls(WRITE).length, 2, "nothing sent again");
});

it("a Favoured roster's advancement carries the god's D8; on his face the bonus skill", async () => {
  const khorne = players("h", [0, 0, 0, 0, 0, 0, 0], { 2: { name: "L. Ashby", spp: { touchdowns: 10 } } });
  const post = onPlayers({ roster: khorne, slug: "teams/khorne", more: { favouredChoice: "Khorne" } });
  await visit(post);
  await press(advanceOf("h3"));
  await press(typeCard("primary"));
  await press(next());
  await press(category("General"));
  await press(next());
  await press(sheet().querySelector('[data-advance-skill="Block"]'));
  const god = sheet().querySelector(".g-favoured");
  assert.equal(god.querySelector(".g-favoured__title").textContent, t("teamPlayer.favoured.title", { alignment: "Khorne" }));
  assert.equal(take().textContent, t("teamPlayer.favoured.rollFirst"));
  assert.ok(take().hasAttribute("disabled"));
  await press(sheet().querySelector('[data-favoured-d8="8"]'));
  await press(sheet().querySelector('[data-favoured-skill="Horns"]'));
  assert.equal(take().textContent, t("teamAdvance.take", { skill: "Block" }));
  const action = { type: "advance", playerId: "h3", advancementType: "primary", grant: { skill: "Block" }, favouredRoll: 8, favouredSkill: "Horns" };
  answers(post, action);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [action]);
  assert.deepEqual([...sheet().querySelectorAll(".g-favoured__line")].map((line) => line.textContent), [t("teamPlayer.favoured.gained", { face: 8, skill: "Horns", cost: 20 })]);
  assert.match(sheet().querySelector(".g-favoured__line").textContent, /^D8 8: Horns, \+20k to the value$/, "a skill's price to the value: Mutation is among his primary categories");
  // A miss carries its D8 too.
  await visit(post);
  await press(advanceOf("h3"));
  await press(typeCard("primary"));
  await press(next());
  await press(category("General"));
  await press(next());
  await press(sheet().querySelector('[data-advance-skill="Block"]'));
  await press(sheet().querySelector('[data-favoured-d8="2"]'));
  const missed = { type: "advance", playerId: "h3", advancementType: "primary", grant: { skill: "Block" }, favouredRoll: 2, favouredSkill: "" };
  answers(post, missed);
  await press(take());
  assert.deepEqual(writes().map(({ action: sent }) => sent), [missed]);
  assert.ok(toasts().every((words) => !words.includes("POST_DICE")));
});

it("undo takes the advancement off", async () => {
  const post = onPlayers();
  const taken = act(post, "home", { type: "advance", playerId: "h3", advancementType: "random", grant: { skill: "Strip Ball" }, roll: { via: "table" } });
  await visit(taken);
  answers(taken, { type: "undo-advance", playerId: "h3" });
  await press(view.querySelector('[data-after-untake="h3"]'));
  assert.deepEqual(writes().map(({ action: sent }) => sent), [{ type: "undo-advance", playerId: "h3" }]);
  assert.equal(view.querySelector('[data-after-untake="h3"]'), null);
  api.assertAnswered();
});

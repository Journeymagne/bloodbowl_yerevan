import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";

/*
 * `#/games/:id` in 3.0 (stage 13, Task 5; the owner's answer 1): a side's coach is sent where the match is now — its
 * preparation, its post-match, the summary of a finished one —, and everyone else reads a short match page: the card of
 * the match, and for the coach a score sent before 3.0 waits on, «Confirm the score» and «Reject», each sent once. The
 * 2.x game page and its panels are gone.
 */

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/games/g", replaced: [], replace(target) { this.replaced.push(target); } };
const { GAME_PAGE_PHASES, gameDestination, gamePageModel, placeholderBack } = await import("../src/screens/matches/game-model.mjs");
const { renderGame } = await import("../src/screens/matches/game.mjs");
const { prepModel } = await import("../src/screens/matches/prep-model.mjs");
const { createPreparation } = await import("../src/domain/match/preparation.mjs");
const { expandCollections } = await import("../src/data/reference.mjs");
const { gameUrl, playerTeamUrl, postMatchUrl, preMatchUrl, resolveRedirect, routeFromHash, teamUrl } = await import("../src/core/routes.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const CSS = "src/screens/matches/game.css";
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let round = 0; round < 8; round += 1) await settle();
};

const side = (id, user, name) => ({ user: { id: user, login: `${user}-login` }, team: { id, name, baseTeamSlug: "teams/human", logoUrl: null } });
/** A league match of round 3, the round that is on, as `GET /api/games/:id` sends it: u1's Ashgrove at home against u2's Silverbrook. */
const game = (over = {}) => ({
  id: "g", kind: "league", roundNumber: 3, roundStatus: "started", season: { id: "s1", name: "Mock Season", status: "active", currentRound: 3 },
  resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started", resultType: "played",
  homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  proposedByUserId: null, proposedHomeTouchdowns: null, proposedAwayTouchdowns: null, proposedHomeCasualties: null, proposedAwayCasualties: null,
  home: side("t1", "u1", "Ashgrove Wardens"), away: side("t2", "u2", "Silverbrook Rangers"), viewerIsHome: true, viewerIsProposer: false,
  ...over,
});
/** u2 sent 2–1, casualties 1–0, before 3.0: u1 is the one to confirm it. */
const SENT = { resultStatus: "awaiting_confirmation", proposedByUserId: "u2",
  proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1, proposedHomeCasualties: 1, proposedAwayCasualties: 0 };
/** The same score, confirmed. */
const CONFIRMED = { ...SENT, resultStatus: "confirmed", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 1, awayCasualties: 0 };

const COACH = { id: "u1", login: "u1-login", isAdmin: false };
const RIVAL = { id: "u2", login: "u2-login", isAdmin: false };
const STRANGER = { id: "u3", login: "u3-login", isAdmin: false };
const ADMIN = { id: "admin", login: "admin", isAdmin: true };

/** `user` opens `#/games/g`, which the server answers with `shown` (or with `status` and `body`). */
async function visit(shown, user = COACH, { status = 200, body, activeTeamId = user.isAdmin ? null : "t1" } = {}) {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = "";
  location.replaced = [];
  state.auth.currentUser = user;
  state.activeTeamId = activeTeamId;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games/g", status, body ?? { game: shown });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  await renderGame("g");
  await flush();
}
const sent = (key) => api.calls.filter((call) => call.key === key);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const words = (selector) => view.querySelectorAll(selector).map((node) => node.textContent.trim());
const button = (action) => view.querySelector(`[data-game-action="${action}"]`);

/**
 * A team's name that leads to its team (`link` in `file`) keeps the lines match-card.css gives it — no height, margin or
 * padding of its own, so a name in two lines pushes the login under it down — and reaches a thumb's 44 through a box drawn
 * over it (`::after`), its line plus the inset above and below, as wide as the name.
 */
function assertNameTarget(file, link) {
  for (const property of ["min-height", "height", "margin", "padding"]) assert.deepEqual(valuesOf(file, link, property), [], `${link} ${property}`);
  assert.deepEqual(valuesOf(file, link, "position"), ["relative"], link);
  const over = `${link}::after`;
  assert.deepEqual([valuesOf(file, over, "content"), valuesOf(file, over, "position")], [['""'], ["absolute"]], over);
  const [inset = ""] = valuesOf(file, over, "inset");
  const [above, across = above] = inset.split(/\s+/);
  assert.equal(across, "0", `${over}: as wide as the name`);
  const [, size, leading] = valuesOf("src/ui/match-card.css", ".g-match__name", "font")[0].match(/(\d+)px\/([\d.]+)/);
  const line = Number(size) * Number(leading);
  assert.ok(Math.round(line - 2 * parseFloat(above)) >= 44, `${over}: a ${line}px line and ${above} above and below`);
}

test("a side's coach is sent where the match is: its preparation, its post-match, the summary of a finished one", async () => {
  const side = { home: { user: { id: "u1" }, team: { id: "t1" } }, away: { user: { id: "u2" }, team: { id: "t2" } }, kind: "friendly" };
  assert.equal(gameDestination({ ...side, id: "g", preparationStatus: "not_started", postMatchStatus: "not_started", resultStatus: null }, "u1"), "#/games/g/pre-match");
  assert.equal(gameDestination({ ...side, id: "g", preparationStatus: "in_progress", postMatchStatus: "in_progress", resultStatus: null }, "u1"), "#/games/g/post-match");
  assert.equal(gameDestination({ ...side, id: "g", preparationStatus: "in_progress", postMatchStatus: "completed", resultStatus: "confirmed" }, "u1"), "#/games/g/post-match/review");
  assert.equal(gameDestination({ ...side, id: "g", preparationStatus: "not_started", postMatchStatus: "not_started", resultStatus: "awaiting_confirmation" }, "u1"), "");
  // The away side the same; a match in play whose post-match is not opened yet is the post-match's.
  assert.equal(gameDestination(game({ preparationStatus: "in_progress" }), "u2"), postMatchUrl("g"));
  assert.equal(gameDestination(game({ preparationStatus: "preparing" }), "u2"), preMatchUrl("g"));
  // A result in, a round closed, a score waiting: nothing to send the coach to.
  assert.equal(gameDestination(game(CONFIRMED), "u1"), "");
  assert.equal(gameDestination(game({ roundStatus: "completed" }), "u1"), "");
  assert.equal(gameDestination(game({ season: { id: "s1", name: "Mock Season", currentRound: 4 } }), "u1"), "");
  // The page sends the coach on in the address's place, drawing no page of its own.
  await visit(game({ preparationStatus: "in_progress", postMatchStatus: "completed", resultStatus: "confirmed" }));
  assert.deepEqual(location.replaced, [postMatchUrl("g", "review")]);
  assert.equal(view.querySelector(".g-match"), null);
  await visit(game(), RIVAL);
  assert.deepEqual(location.replaced, [preMatchUrl("g")]);
  api.assertAnswered();
});

test("an admin and a coach of neither side get the match page, never sent away; a guest is sent to sign in by the router", async () => {
  const live = game({ preparationStatus: "in_progress", postMatchStatus: "draft" });
  assert.equal(gameDestination(live, "admin"), "");
  assert.equal(gameDestination(live, "u3"), "");
  assert.equal(gameDestination(live, ""), "");
  await visit(live, ADMIN);
  assert.deepEqual(location.replaced, [], "the admin is sent nowhere");
  assert.equal(view.querySelector("h1").textContent, "Match");
  assert.equal(document.activeElement, view.querySelector("h1"), "the title takes the focus");
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Mock Season · Round 3");
  assert.deepEqual(words(".g-game__links a"), ["Match preparation", "Post-match"]);
  assert.deepEqual(view.querySelectorAll(".g-game__links a").map((link) => link.getAttribute("href")), [preMatchUrl("g"), postMatchUrl("g")]);
  // Both teams lead to their coach's page; the admin confirms nothing here (the administration's season does).
  assert.deepEqual(view.querySelectorAll("a.g-match__name").map((link) => link.getAttribute("href")), [playerTeamUrl("u1", "t1"), playerTeamUrl("u2", "t2")]);
  assert.deepEqual(words(".g-match__sub"), ["u1-login", "u2-login"]);
  await visit(game(SENT), ADMIN);
  assert.equal(button("confirm"), null);
  assert.equal(button("reject"), null);
  // A finished post-match is read at its summary.
  await visit(game({ ...CONFIRMED, preparationStatus: "in_progress", postMatchStatus: "completed" }), ADMIN);
  assert.deepEqual(view.querySelectorAll(".g-game__links a").map((link) => link.getAttribute("href")), [preMatchUrl("g"), postMatchUrl("g", "review")]);
  // A coach of another pair: the server knows no such match for him (404), and the page says so with the way back.
  await visit(null, STRANGER, { status: 404, body: { error: { code: "GAME_NOT_FOUND", message: "Game not found" } }, activeTeamId: "t9" });
  assert.deepEqual(location.replaced, []);
  assert.equal(view.querySelector('[role="alert"] .g-callout__title').textContent, "Match not found");
  assert.equal(view.querySelector("a.g-game__back").getAttribute("href"), teamUrl("t9", "matches"));
  assert.equal(view.querySelector("a.g-game__back").textContent, "Matches");
  // A guest never gets here: the router sends the address to the sign-in, as before.
  assert.equal(resolveRedirect(routeFromHash("#/games/g"), { signedIn: false, hash: "#/games/g" }).target, "#/login");
  api.assertAnswered();
});

test("the admin's way back from a preparation is the match page, which sends nobody back", () => {
  const data = expandCollections(JSON.parse(text("public/data.en.json")));
  const source = (id, name) => ({ user: { id: `u-${id}`, login: id }, team: { id, name, baseTeamSlug: "teams/human", revision: 1,
    roster: { players: [0, 0, 0, 0, 0, 0, 0].map((rowIndex, index) => ({ id: `${id}-${index}`, rowIndex, number: String(index + 1), name: `${id} ${index}` })), treasury: 70, dedicatedFans: 3 } } });
  const preparation = createPreparation({ home: source("t1", "Ashgrove Wardens"), away: source("r1", "Silverbrook Rangers") }, data);
  const fixture = { id: "g", kind: "league", seasonName: "Mock Season", roundNumber: 3, tableNumber: 1, closed: false };
  const admin = prepModel({ preparation, snapshots: {}, viewerSide: "home", isAdmin: true, fixture }, "home", "", { data, userId: "admin" });
  assert.equal(admin.back, gameUrl("g"));
  // An administrator who plays home, looking at the away side: the match page would send him straight back into the
  // preparation (he is its coach), so «‹» is his own team's matches, whichever side is shown.
  const playing = { preparation, snapshots: {}, viewerSide: "home", isAdmin: true, fixture };
  assert.equal(prepModel(playing, "away", "", { data, userId: "u-t1" }).back, teamUrl("t1", "matches"));
  assert.equal(prepModel(playing, "home", "", { data, userId: "u-t1" }).back, teamUrl("t1", "matches"));
  assert.equal(prepModel({ ...playing, isAdmin: false }, "home", "", { data, userId: "u-t1" }).back, teamUrl("t1", "matches"));
  const shown = game({ home: side("t1", "u-t1", "Ashgrove Wardens"), away: side("r1", "u-r1", "Silverbrook Rangers"), preparationStatus: "preparing" });
  assert.equal(gameDestination(shown, "admin"), "", "the match page sends the admin nowhere: no way round");
  // The page a preparation or a post-match shows while it is read, or when it could not be: «‹» is the side's matches,
  // never the game, which would send the coach straight back (pre-flight L11); an administrator's is the match page.
  assert.equal(placeholderBack("g", { viewer: COACH, activeTeamId: "t1", games: [] }), teamUrl("t1", "matches"));
  assert.equal(placeholderBack("g", { viewer: COACH, activeTeamId: null, games: [] }), "#/season");
  assert.equal(placeholderBack("g", { viewer: COACH, activeTeamId: "t1", games: [game({ away: side("t5", "u1", "Second Team"), home: side("t2", "u2", "Silverbrook Rangers") })] }),
    teamUrl("t5", "matches"), "the coach's side of the game, when the games are read");
  assert.equal(placeholderBack("g", { viewer: ADMIN, activeTeamId: null, games: [] }), gameUrl("g"));
  assert.equal(placeholderBack("g", { viewer: { ...COACH, isAdmin: true }, activeTeamId: "t1", games: [game()] }), teamUrl("t1", "matches"),
    "an administrator who plays the match is its coach");
});

test("a score sent before 3.0: the receiving coach confirms it once, however often pressed; the proposer reads who confirms", async () => {
  await visit(game(SENT));
  assert.deepEqual(location.replaced, [], "the coach who confirms stays on the page");
  assert.equal(view.querySelector(".g-match__mid--score").textContent, "2 : 1", "the score sent, as the matches' card writes it");
  assert.equal(view.querySelector(".g-status").textContent, "Awaiting confirmation");
  assert.equal(button("confirm").textContent.trim(), "Confirm the score");
  assert.equal(button("reject").textContent.trim(), "Reject");
  assert.ok(button("confirm").classList.contains("g-btn--primary"));
  assert.ok(button("reject").classList.contains("g-btn--danger-quiet"));
  // Two presses while the first is on its way: one request.
  api.reply("POST /api/games/g/confirm", 200, { game: game(CONFIRMED) });
  const gate = api.hold("POST /api/games/g/confirm");
  fireEvent(button("confirm"), "click");
  await settle();
  assert.equal(button("confirm").getAttribute("aria-busy"), "true", "the press is on its way, and says so");
  assert.equal(button("reject").getAttribute("aria-disabled"), "true");
  fireEvent(button("confirm"), "click");
  fireEvent(button("reject"), "click");
  await settle();
  assert.equal(sent("POST /api/games/g/confirm").length, 1);
  assert.equal(sent("POST /api/games/g/reject").length, 0);
  api.reply("GET /api/games/g", 200, { game: game(CONFIRMED) });
  gate.release();
  await flush();
  assert.deepEqual(sent("POST /api/games/g/confirm").map((call) => call.body), [{}]);
  assert.equal(sent("GET /api/games/g").length, 2, "the game is read again");
  assert.equal(sent("GET /api/games").length, 1, "and the coach's games, for the frame's card");
  assert.equal(view.querySelector(".g-status").textContent, "Played");
  assert.equal(button("confirm"), null);
  assert.equal(document.activeElement, view.querySelector("h1"), "the pressed button gone, the focus is the title's");
  api.assertAnswered();
  // The coach who sent it reads who confirms it, and has nothing to press.
  await visit(game({ ...SENT, proposedByUserId: "u1", viewerIsProposer: true }));
  assert.equal(view.querySelector(".g-game__note").textContent, "Silverbrook Rangers confirms the score");
  assert.equal(button("confirm"), null);
  assert.equal(button("reject"), null);
  // «Reject», once: said in a toast, then the coach goes where the match is now — its preparation.
  await withoutTimers(async () => {
    await visit(game(SENT));
    api.reply("POST /api/games/g/reject", 200, { game: game({ ...SENT, resultStatus: "rejected" }) });
    api.reply("GET /api/games/g", 200, { game: game({ ...SENT, resultStatus: "rejected" }) });
    fireEvent(button("reject"), "click");
    fireEvent(button("reject"), "click");
    await flush();
  });
  assert.equal(sent("POST /api/games/g/reject").length, 1);
  assert.equal(toasts().at(-1), "Score rejected");
  assert.deepEqual(location.replaced, [preMatchUrl("g")]);
  api.assertAnswered();
});

test("a refused confirmation says the server's words; a match the server does not know says them and leads back", async () => {
  await visit(game(SENT));
  api.reply("POST /api/games/g/confirm", 409, { error: { code: "NO_RESULT_AWAITING_CONFIRMATION", message: "There is no result awaiting confirmation." } });
  fireEvent(button("confirm"), "click");
  await flush();
  assert.equal(view.querySelector('[role="alert"] .g-callout__title').textContent, t("error.NO_RESULT_AWAITING_CONFIRMATION"));
  assert.equal(sent("GET /api/games/g").length, 2, "a 409 reads the match again: it has changed");
  assert.equal(button("confirm").getAttribute("aria-busy"), null, "the buttons are free again");
  assertStyled(view, CSS, "src/ui/match-card.css", "src/ui/page-head.css", "src/ui/status-chip.css", "src/ui/button.css", "src/ui/callout.css");
  api.assertAnswered();
  // A match the server does not know: its words and the way back; an admin with no team goes to the league.
  await visit(null, ADMIN, { status: 404, body: { error: { code: "GAME_NOT_FOUND", message: "Game not found" } } });
  assert.equal(view.querySelector('[role="alert"] .g-callout__title').textContent, "Match not found");
  assert.equal(view.querySelector("a.g-game__back").getAttribute("href"), "#/season");
  assert.equal(document.activeElement, view.querySelector("h1"));
  assertStyled(view, CSS, "src/ui/page-head.css", "src/ui/callout.css");
  assertCspSafe(view);
  // Any other failure is said in the server's words.
  await visit(null, COACH, { status: 500, body: { error: { code: "SERVER_STUMBLED", message: "The server stumbled." } } });
  assert.equal(view.querySelector('[role="alert"] .g-callout__title').textContent, "The server stumbled.");
  assert.equal(view.querySelector("a.g-game__back").getAttribute("href"), teamUrl("t1", "matches"));
  api.assertAnswered();
});

test("a round closed for players: no buttons, the line says so", async () => {
  const closed = { roundStatus: "completed" };
  await visit(game({ ...SENT, ...closed }));
  assert.deepEqual(location.replaced, []);
  assert.equal(button("confirm"), null);
  assert.equal(button("reject"), null);
  assert.equal(view.querySelector(".g-game__note").textContent, "The round is closed");
  // The coach who sent it is told the same, not that the opponent confirms it.
  await visit(game({ ...SENT, ...closed, proposedByUserId: "u1", viewerIsProposer: true }));
  assert.equal(view.querySelector(".g-game__note").textContent, "The round is closed");
  // The model, alone: one that started a round behind the season's is closed too.
  const behind = gamePageModel({ game: game({ ...SENT, season: { id: "s1", name: "Mock Season", currentRound: 4 } }), viewer: COACH });
  assert.equal(behind.confirm, false);
  assert.equal(behind.roundClosed, true);
  api.assertAnswered();
});

test("the match card: the score or «vs», CAS, the phase, each team leading to its page, an empty side a dash", () => {
  const model = (shown, viewer = COACH) => gamePageModel({ game: shown, viewer });
  const played = model(game({ ...CONFIRMED, homeTouchdowns: 3, awayTouchdowns: 0, homeCasualties: 2, awayCasualties: 2 }));
  assert.equal(played.phase, "played");
  assert.equal(played.score, "3–0");
  assert.equal(played.cas, "2–2");
  assert.deepEqual(played.home, { name: "Ashgrove Wardens", sub: "u1-login", href: teamUrl("t1") });
  assert.deepEqual(played.away, { name: "Silverbrook Rangers", sub: "u2-login", href: playerTeamUrl("u2", "t2") });
  const waiting = model(game(SENT));
  assert.deepEqual([waiting.phase, waiting.chipTone, waiting.score, waiting.cas, waiting.confirm, waiting.waitingFor], ["sent", "wait", "2 : 1", "1–0", true, ""]);
  assert.deepEqual([model(game()).phase, model(game()).score, model(game()).cas], ["open", "", ""]);
  assert.equal(model(game({ roundStatus: "completed" })).phase, "closed");
  assert.equal(model(game({ kind: "friendly", season: null })).line, "Friendly");
  assert.equal(model(game()).line, "Mock Season · Round 3");
  assert.equal(model(game()).title, "Match");
  const empty = model(game({ away: null }), ADMIN);
  assert.deepEqual(empty.away, { name: "—" });
  assert.deepEqual(model(game(SENT), ADMIN).links, []);
  for (const phase of GAME_PAGE_PHASES) assert.ok(["sent", "played", "technical", "closed", "open"].includes(phase));
});

test("a begun preparation is linked from the match page: preparing, ready or in play; not before it begins", () => {
  for (const status of ["preparing", "ready", "in_progress"]) {
    const { links } = gamePageModel({ game: game({ preparationStatus: status }), viewer: ADMIN });
    assert.deepEqual(links.map(({ label, href }) => [label, href]), [["Match preparation", preMatchUrl("g")]], status);
  }
  assert.deepEqual(gamePageModel({ game: game(), viewer: ADMIN }).links, [], "a preparation not begun: no link");
});

test("a technical result says why, as the league's page does, with no casualties: it was not played", async () => {
  const technical = { ...CONFIRMED, resultType: "technical", technicalReason: "no_team", homeTouchdowns: 2, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 };
  const model = gamePageModel({ game: game(technical), viewer: ADMIN });
  assert.deepEqual([model.phase, model.chipTone, model.score, model.cas], ["technical", "neutral", "2–0", ""]);
  assert.equal(model.technical, "Technical win · the opponent could not field a team");
  assert.equal(gamePageModel({ game: game({ ...technical, technicalReason: null }), viewer: ADMIN }).technical, "Technical win", "stored before stage 12: «other»");
  assert.equal(gamePageModel({ game: game(CONFIRMED), viewer: ADMIN }).technical, "", "a played result has none");
  await visit(game(technical), ADMIN);
  assert.equal(view.querySelector(".g-status").textContent, "Technical result");
  assert.equal(view.querySelector(".g-game__note").textContent, "Technical win · the opponent could not field a team");
  assert.doesNotMatch(view.querySelector(".g-match").textContent, /CAS/);
  // A side's coach of a technical result reads the page too: there is no post-match to send him to.
  await visit(game(technical));
  assert.deepEqual(location.replaced, []);
  assert.equal(view.querySelector(".g-status").textContent, "Technical result");
  api.assertAnswered();
});

test("a refused press whose re-read sends the coach on is said in a toast first; the games are read again after any answer", async () => {
  await withoutTimers(async () => {
    await visit(game(SENT));
    api.reply("POST /api/games/g/confirm", 409, { error: { code: "NO_RESULT_AWAITING_CONFIRMATION", message: "There is no result awaiting confirmation." } });
    api.reply("GET /api/games/g", 200, { game: game({ ...SENT, resultStatus: "rejected" }) });
    fireEvent(button("confirm"), "click");
    await flush();
  });
  assert.equal(toasts().at(-1), t("error.NO_RESULT_AWAITING_CONFIRMATION"), "the refusal is said before the coach goes");
  assert.ok(document.querySelectorAll("output").at(-1).className.includes("g-toast--error"));
  assert.deepEqual(location.replaced, [preMatchUrl("g")]);
  assert.equal(sent("GET /api/games").length, 1, "after a 409 the coach's games are read again: the frame's card follows");
  api.assertAnswered();
  // The coach leaves while the answer is on its way: the games are read again all the same, the visit is not.
  await visit(game(SENT));
  api.reply("POST /api/games/g/confirm", 200, { game: game(CONFIRMED) });
  const gate = api.hold("POST /api/games/g/confirm");
  fireEvent(button("confirm"), "click");
  await settle();
  releaseCurrentScreen();
  gate.release();
  await flush();
  assert.equal(sent("GET /api/games").length, 1, "the server's state changed: the frame no longer offers «Confirm the score»");
  assert.equal(sent("GET /api/games/g").length, 1, "the page gone, the match is not read again");
  api.assertAnswered();
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/matches/game.mjs", "src/screens/matches/game-model.mjs");
  const en = dictionary("en");
  const ru = dictionary("ru");
  for (const phase of GAME_PAGE_PHASES) {
    assert.ok(en[`gamePage.status.${phase}`], `en gamePage.status.${phase}`);
    assert.ok(ru[`gamePage.status.${phase}`], `ru gamePage.status.${phase}`);
  }
  const plan = { "gamePage.title": ["Match", "Матч"], "gamePage.confirm": ["Confirm the score", "Подтвердить счёт"], "gamePage.reject": ["Reject", "Отклонить"],
    "gamePage.waiting": ["{team} confirms the score", "Счёт подтверждает {team}"], "gamePage.back": ["Matches", "Матчи"],
    "gamePage.round": ["{season} · Round {round}", "{season} · Тур {round}"], "gamePage.rejected": ["Score rejected", "Счёт отклонён"],
    "gamePage.roundClosed": ["The round is closed", "Тур закрыт"], "gamePage.notFound": ["Match not found", "Матч не найден"] };
  for (const [key, [english, russian]] of Object.entries(plan)) {
    assert.equal(en[key], english, key);
    assert.equal(ru[key], russian, key);
  }
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  for (const key of Object.keys(en).filter((name) => name.startsWith("gamePage."))) {
    assert.ok(ru[key], `ru ${key}`);
    assert.deepEqual(placeholders(ru[key]), placeholders(en[key]), key);
  }
});

test("names wrap, nothing is cut with «…»; the 900/901 breakpoints only; buttons 44px on a phone, at least 24 on a desk", async () => {
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|nowrap|line-clamp|--focus-ring/);
  assertBreakpoints(CSS);
  for (const selector of [".g-game__note", ".g-game__back"]) {
    assert.deepEqual(valuesOf(CSS, selector, "overflow-wrap"), ["anywhere"], selector);
    for (const property of ["font", "letter-spacing", "text-transform", "border", "background"]) assert.equal(valuesOf(CSS, selector, property).length, 1, `${selector} ${property}`);
  }
  // A thumb's 44px on a phone; the main button the prototypes' 52 (Matches.html), 48 on a desk.
  assert.deepEqual(valuesOf(CSS, ".g-game__back", "min-height"), ["44px"]);
  // A team's name, a link, is a thumb's height without taking it from the lines around it: «Silverbrook Rangers» in two
  // lines at 390px no longer runs under its coach's login (review of Task 5).
  assertNameTarget(CSS, ".g-game a.g-match__name");
  assert.deepEqual(valuesOf(CSS, ".g-game a.g-match__name", "text-decoration"), ["none"], "as Matches.html's: no underline");
  assertReadable(CSS, ".g-game .g-match__mid", "color", ["--surface"], 3);
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf("src/ui/button.css", ".g-btn--primary", "height"), ["var(--size-cta)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-game .g-btn--primary", "height"), ["48px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-game__main", "max-width"), ["640px"]);
  assertReadable(CSS, ".g-game__note", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-game__note--wait", "color", ["--warn-tint"], 4.5);
  assertReadable(CSS, ".g-game__back", "color", ["--page", "--surface"], 4.5);
  // The markup: names escaped and wrapping in the card (match-card.css), nothing the CSP refuses, every class styled.
  await visit(game({ ...SENT, home: side("t1", "u1", HOSTILE), away: side("t2", "u2", `${HOSTILE} ${"Longname".repeat(8)}`) }));
  assert.equal(view.querySelector(".g-match__name").textContent, HOSTILE);
  assertCspSafe(view);
  assertStyled(view, CSS, "src/ui/match-card.css", "src/ui/page-head.css", "src/ui/status-chip.css", "src/ui/button.css");
  assert.deepEqual(valuesOf("src/ui/match-card.css", ".g-match__name", "overflow-wrap"), ["anywhere"]);
  await visit(game({ ...SENT, proposedByUserId: "u1", viewerIsProposer: true, away: side("t2", "u2", HOSTILE) }));
  assert.equal(view.querySelector(".g-game__note").textContent, `${HOSTILE} confirms the score`);
  assertStyled(view, CSS, "src/ui/match-card.css", "src/ui/page-head.css", "src/ui/status-chip.css");
  api.assertAnswered();
});

test("the 2.x game page and its panels are gone", () => {
  for (const file of ["src/screens/games/game.mjs", "src/components/pre-match/game-panel.mjs", "src/components/pre-match/shared.mjs",
    "src/components/post-match/game-panel.mjs", "test/game-page.test.mjs"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
  const router = text("src/core/router.mjs");
  assert.doesNotMatch(router, /screens\/games\/game\.mjs|renderGamePage/);
  assert.match(router, /import \{ renderGame \} from "\.\.\/screens\/matches\/game\.mjs";/);
  assert.match(router, /game: \(\{ gameId \}\) => renderGame\(gameId\),/);
  const styles = text("src/styles.css").trim().split("\n");
  assert.equal(styles.at(-1), '@import url("screens/matches/game.css");', "the page's sheet comes last");
});

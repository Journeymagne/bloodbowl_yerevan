import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { currentMatch, isMatchLive, matchActions, renderNavMatch, sentCasualties, sentScore } from "../src/shell/current-match.mjs";

const side = (teamId, name) => ({ user: { id: `u-${teamId}`, login: "x" }, team: { id: teamId, name } });
const game = (id, over = {}) => ({
  id, kind: "league", roundStatus: "started", roundNumber: 7, season: { currentRound: 7 }, resultStatus: "pending",
  preparationStatus: "not_started", postMatchStatus: "not_started", viewerIsHome: true, updatedAt: "2026-10-10T10:00:00Z",
  home: side("t1", "Ashgrove Wardens"), away: side("r1", "Grimtusk Raiders"), ...over,
});
const LIVE = game("g-live", { preparationStatus: "in_progress", postMatchStatus: "draft" });
const NEXT = game("g-next");
const SENT = game("g-sent", { resultStatus: "awaiting_confirmation", viewerIsHome: false, home: side("r1", "Grimtusk Raiders"), away: side("t1", "Ashgrove Wardens"),
  proposedHomeTouchdowns: 1, proposedAwayTouchdowns: 2, proposedHomeCasualties: 0, proposedAwayCasualties: 1 });

test("a started match beats the next one, and the next one beats a result waiting for the opponent", () => {
  assert.deepEqual([currentMatch([SENT, NEXT, LIVE], "t1").phase, currentMatch([SENT, NEXT], "t1").phase, currentMatch([SENT], "t1").phase], ["live", "idle", "sent"]);
});

test("only the active team's matches count, and a bye, a finished match or an earlier round is none", () => {
  assert.equal(currentMatch([NEXT], "t9"), null);
  assert.equal(currentMatch([game("bye", { away: null })], "t1"), null);
  assert.equal(currentMatch([game("done", { resultStatus: "confirmed", homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 })], "t1"), null);
  assert.equal(currentMatch([game("old", { roundNumber: 6 })], "t1"), null);
});

test("the next match: opponent, round and venue, one way into preparation", () => {
  const fragment = mount(renderNavMatch(currentMatch([NEXT], "t1"), "t1"));
  assert.equal(fragment.querySelector(".g-navmatch__label").textContent, "Next match");
  assert.equal(fragment.querySelector(".g-navmatch__opp").textContent, "Grimtusk Raiders");
  assert.equal(fragment.querySelector(".g-navmatch__sub").textContent, "Round 7 · home");
  assert.deepEqual(fragment.querySelectorAll("a").map((link) => [link.textContent, link.getAttribute("href")]), [["Match preparation", "#/games/g-next/pre-match"]]);
  assertCspSafe(fragment);
  assertStyled(fragment, "src/shell/side-nav.css");
});

test("a match in play: a live dot, its records and the post-match", () => {
  const fragment = mount(renderNavMatch(currentMatch([LIVE], "t1"), "t1"));
  assert.ok(fragment.querySelector(".g-navmatch--live .g-navmatch__dot[aria-hidden=\"true\"]"));
  assert.deepEqual(fragment.querySelectorAll("a").map((link) => link.getAttribute("href")), ["#/t/t1/roster", "#/games/g-live/post-match"]);
});

test("a result sent: waiting for confirmation, the score from our side", () => {
  const fragment = mount(renderNavMatch(currentMatch([SENT], "t1"), "t1"));
  assert.equal(fragment.querySelector(".g-navmatch__label").textContent, "Awaiting confirmation");
  assert.equal(fragment.querySelector(".g-navmatch__result").textContent, "Win 2–1 · CAS 1–0");
  assert.equal(fragment.querySelector("a"), null);
});

test("the score sent is read one way for the card and the board", () => {
  // SENT: the guests (t1) proposed 2–1 for themselves; the hosts read it from their side.
  assert.equal(sentScore(SENT, { own: "away", other: "home" }), "2–1");
  assert.equal(sentScore(SENT, { own: "home", other: "away" }), "1–2");
  assert.equal(sentScore(SENT, { own: "away", other: "home" }, ":"), "2:1", "the board's way of writing it");
  assert.equal(sentCasualties(SENT, { own: "away", other: "home" }), "1–0");
  assert.equal(sentScore(NEXT, { own: "home", other: "away" }), "");
  assert.equal(sentScore({ ...SENT, proposedHomeTouchdowns: null }, { own: "away", other: "home" }), "");
  assert.equal(sentScore({ ...SENT, proposedHomeTouchdowns: 0, proposedAwayTouchdowns: 0 }, { own: "home", other: "away" }), "0–0", "a goalless score is a score");
  assert.equal(sentCasualties({ ...SENT, proposedAwayCasualties: undefined }, { own: "away", other: "home" }), "");
  assert.equal(mount(renderNavMatch(currentMatch([SENT], "t1"), "t1")).querySelector(".g-navmatch__result").textContent, "Win 2–1 · CAS 1–0");
  assert.equal(mount(renderNavMatch(currentMatch([{ ...SENT, proposedAwayCasualties: null }], "t1"), "t1")).querySelector(".g-navmatch__result"), null, "a line with a number missing is none");
});

test("a friendly says so instead of a round, and names are escaped", () => {
  const fragment = mount(renderNavMatch(currentMatch([game("f", { kind: "friendly", season: null, away: side("r1", HOSTILE) })], "t1"), "t1"));
  assert.equal(fragment.querySelector(".g-navmatch__sub").textContent, "Friendly match");
  assert.equal(fragment.querySelector("img"), null);
  assertDictionaryCovers("src/shell/current-match.mjs");
});

// Beyond the brief's table: the server's own idea of a live match (K8), and what the card shows around the three phases.

const SCORED = { homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 0, awayCasualties: 1 };
const started = (over) => game("g-started", { preparationStatus: "in_progress", ...over });

test("a match is live as the server counts it: started, its post-match not completed, and a post-match row or a score nobody confirmed (K8)", () => {
  assert.equal(isMatchLive(started({ postMatchStatus: "draft" })), true, "a post-match open");
  assert.equal(isMatchLive(started({ postMatchStatus: "not_started", resultStatus: "pending" })), true, "no post-match yet, no score");
  assert.equal(isMatchLive(started({ postMatchStatus: "not_started", resultStatus: "awaiting_confirmation" })), true, "no post-match yet, a score proposed");
  assert.equal(isMatchLive(started({ postMatchStatus: "draft", resultStatus: "confirmed", ...SCORED })), true, "a confirmed score, then its post-match opened");
  assert.equal(isMatchLive(started({ postMatchStatus: "completed", resultStatus: "confirmed", ...SCORED })), false, "its post-match completed");
  assert.equal(isMatchLive(game("g", { postMatchStatus: "draft" })), false, "never started");
  assert.equal(isMatchLive(started({})), true, "a payload with no post-match status is a match with no post-match");
  assert.equal(isMatchLive(started({ postMatchStatus: undefined, resultStatus: "confirmed", ...SCORED })), false);
});

test("a started match whose score was confirmed around the post-match is not live: no card, so no tap that answers 409 MATCH_NOT_LIVE (K8)", () => {
  const around = started({ postMatchStatus: "not_started", resultStatus: "confirmed", ...SCORED });
  assert.equal(currentMatch([around], "t1"), null);
  assert.equal(renderNavMatch(currentMatch([around], "t1"), "t1"), "");
  // It does not take a live match's place either: the next match is still the card.
  assert.deepEqual([currentMatch([around, NEXT], "t1").game.id, currentMatch([around, NEXT], "t1").phase], ["g-next", "idle"]);
  const text = mount(renderNavMatch(currentMatch([around, NEXT], "t1"), "t1")).textContent;
  assert.doesNotMatch(text, /Match in play|Match records|Post-match/);
});

test("a result waiting in a round that is over is no card: nobody can confirm it any more", () => {
  assert.equal(currentMatch([{ ...SENT, roundNumber: 6 }], "t1"), null);
  assert.equal(currentMatch([{ ...SENT, roundStatus: "completed" }], "t1"), null);
  assert.equal(currentMatch([{ ...SENT, kind: "friendly", season: null, roundNumber: 0, roundStatus: "draft" }], "t1").phase, "sent", "a friendly has no round to be over");
});

test("within a phase the freshest match is the card; the phase still beats the date", () => {
  const older = game("g-older", { updatedAt: "2026-10-01T10:00:00Z" });
  const newer = game("g-newer", { updatedAt: "2026-10-12T10:00:00Z" });
  assert.equal(currentMatch([older, newer], "t1").game.id, "g-newer");
  assert.equal(currentMatch([newer, older], "t1").game.id, "g-newer");
  assert.equal(currentMatch([game("g-undated", { updatedAt: undefined }), older], "t1").game.id, "g-older", "no date is the oldest");
  assert.equal(currentMatch([newer, { ...LIVE, updatedAt: "2026-09-01T10:00:00Z" }], "t1").game.id, "g-live");
});

test("a league match comes before a friendly of the same phase, then the freshest; a later phase still beats both", () => {
  const friendly = (id, over = {}) => game(id, { kind: "friendly", season: null, roundNumber: 0, roundStatus: "draft", ...over });
  const league = game("g-league", { updatedAt: "2026-10-01T10:00:00Z" });
  const accepted = friendly("g-friendly", { updatedAt: "2026-10-15T10:00:00Z" });
  assert.equal(currentMatch([accepted, league], "t1").game.id, "g-league", "a friendly accepted later does not hide this round's match");
  assert.equal(currentMatch([league, accepted], "t1").game.id, "g-league");
  assert.equal(currentMatch([accepted, friendly("g-friendly-2", { updatedAt: "2026-10-16T10:00:00Z" })], "t1").game.id, "g-friendly-2", "friendlies go by date");
  const playing = (over) => ({ preparationStatus: "in_progress", postMatchStatus: "draft", ...over });
  assert.equal(currentMatch([friendly("g-f-live", playing({ updatedAt: "2026-10-15T10:00:00Z" })), game("g-l-live", playing({ updatedAt: "2026-10-01T10:00:00Z" }))], "t1").game.id, "g-l-live", "in every phase");
  assert.equal(currentMatch([friendly("g-f-live", playing()), league], "t1").game.id, "g-f-live", "a friendly in play beats a league match still to prepare");
});

test("two teams: the card is the active team's, and switching teams switches the card", () => {
  const other = game("g-t2", { home: side("t2", "Ironmaw Brawlers"), away: side("r2", "Dunmere Mudlarks") });
  const games = [NEXT, other];
  assert.deepEqual([currentMatch(games, "t1").game.id, currentMatch(games, "t2").game.id], ["g-next", "g-t2"]);
  assert.equal(mount(renderNavMatch(currentMatch(games, "t2"), "t2")).querySelector(".g-navmatch__opp").textContent, "Dunmere Mudlarks");
  assert.equal(mount(renderNavMatch(currentMatch(games, "t1"), "t1")).querySelector(".g-navmatch__opp").textContent, "Grimtusk Raiders");
  assert.equal(currentMatch([NEXT, { ...LIVE, home: side("t2", "Ironmaw Brawlers") }], "t1").phase, "idle", "another team's match in play is not this team's");
});

test("a score the opponent proposed is the coach's to confirm: the card says so and opens the game", () => {
  const theirs = mount(renderNavMatch(currentMatch([{ ...SENT, viewerIsProposer: false }], "t1"), "t1"));
  assert.deepEqual(theirs.querySelectorAll("a").map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("class")]), [["Confirm the score", "#/games/g-sent", "g-navmatch__cta"]]);
  assert.equal(theirs.querySelector(".g-navmatch__result").textContent, "Win 2–1 · CAS 1–0", "the score they proposed is still in front of the coach");
  assert.deepEqual(theirs.querySelector("section").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class")).slice(-2), ["g-navmatch__result", "g-navmatch__cta"]);
  assertCspSafe(theirs);
  assertStyled(theirs, "src/shell/side-nav.css");
  assert.equal(mount(renderNavMatch(currentMatch([{ ...SENT, viewerIsProposer: true }], "t1"), "t1")).querySelector("a"), null, "the coach's own proposal waits for the opponent");
  initLocale("ru");
  try {
    assert.equal(mount(renderNavMatch(currentMatch([{ ...SENT, viewerIsProposer: false }], "t1"), "t1")).querySelector("a").textContent, "Подтвердить счёт");
  } finally {
    initLocale("en");
  }
});

test("the card is the team's own: its opponent is the other side, whichever side the team plays", () => {
  const away = game("g-away", { viewerIsHome: false, home: side("r1", "Grimtusk Raiders"), away: side("t1", "Ashgrove Wardens") });
  const fragment = mount(renderNavMatch(currentMatch([away], "t1"), "t1"));
  assert.equal(fragment.querySelector(".g-navmatch__opp").textContent, "Grimtusk Raiders");
  assert.equal(fragment.querySelector(".g-navmatch__sub").textContent, "Round 7 · away");
  assert.equal(currentMatch([], "t1"), null);
  assert.equal(currentMatch([NEXT], null), null);
  assert.equal(renderNavMatch(null, "t1"), "");
});

test("a result sent says a draw and a loss as well, and says nothing it does not have", () => {
  const sent = (over) => mount(renderNavMatch(currentMatch([{ ...SENT, ...over }], "t1"), "t1"));
  assert.equal(sent({ proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 2 }).querySelector(".g-navmatch__result").textContent, "Draw 2–2 · CAS 1–0");
  assert.equal(sent({ proposedHomeTouchdowns: 3, proposedAwayTouchdowns: 2, proposedHomeCasualties: 2, proposedAwayCasualties: 0 }).querySelector(".g-navmatch__result").textContent, "Loss 2–3 · CAS 0–2");
  const home = mount(renderNavMatch(currentMatch([{ ...SENT, viewerIsHome: true, home: side("t1", "Ashgrove Wardens"), away: side("r1", "Grimtusk Raiders") }], "t1"), "t1"));
  assert.equal(home.querySelector(".g-navmatch__result").textContent, "Loss 1–2 · CAS 0–1", "from the home side the proposal reads the other way round");
  assert.equal(sent({ proposedHomeTouchdowns: null }).querySelector(".g-navmatch__result"), null);
  assert.equal(sent({ proposedAwayCasualties: undefined }).querySelector(".g-navmatch__label").textContent, "Awaiting confirmation");
});

test("the card reads in Russian: the dictionary's words, the venue and the round in their order", () => {
  initLocale("ru");
  try {
    const next = mount(renderNavMatch(currentMatch([NEXT], "t1"), "t1"));
    assert.equal(next.querySelector("section").getAttribute("aria-label"), "Текущий матч");
    assert.equal(next.querySelector(".g-navmatch__label").textContent, "Следующий матч");
    assert.equal(next.querySelector(".g-navmatch__sub").textContent, "Тур 7 · дома");
    assert.equal(next.querySelector("a").textContent, "Подготовка к матчу");
    const live = mount(renderNavMatch(currentMatch([LIVE], "t1"), "t1"));
    assert.equal(live.querySelector(".g-navmatch__label").textContent, "Идёт игра");
    assert.deepEqual(live.querySelectorAll("a").map((link) => link.textContent), ["Записи матча", "Итоги матча"]);
    assert.equal(mount(renderNavMatch(currentMatch([SENT], "t1"), "t1")).querySelector(".g-navmatch__result").textContent, "Победа 2–1 · CAS 1–0");
    assert.equal(mount(renderNavMatch(currentMatch([SENT], "t1"), "t1")).querySelector(".g-navmatch__label").textContent, "Ждёт подтверждения");
  } finally {
    initLocale("en");
  }
});

test("a name that is markup stays text in every phase", () => {
  for (const phase of [{ ...LIVE, away: side("r1", HOSTILE) }, { ...NEXT, away: side("r1", HOSTILE) }, { ...SENT, home: side("r1", HOSTILE) }]) {
    const fragment = mount(renderNavMatch(currentMatch([phase], "t1"), "t1"));
    assert.equal(fragment.querySelector("img"), null);
    assert.equal(fragment.querySelector(".g-navmatch__opp").textContent, HOSTILE);
    assertCspSafe(fragment);
  }
});

const SIDE_CSS = "src/shell/side-nav.css";

test("everything pressable in the card is a 44px target; the records link is a text link with a 44px hit area (K10a)", () => {
  assert.equal(tokensOf("grass")["--size-touch"], "44px");
  for (const selector of [".g-navmatch__cta", ".g-navmatch__link"]) {
    assert.deepEqual(valuesOf(SIDE_CSS, selector, "min-height"), ["var(--size-touch)"], `${selector} min-height`);
  }
  // The text link paints nothing of its own: its look is the words, and the 44px is the box the finger finds.
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__link", "background"), ["transparent"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__link", "display"), ["flex"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__link", "align-items"), ["center"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__link:hover", "text-decoration"), ["underline"]);
  const fragment = mount(renderNavMatch(currentMatch([LIVE], "t1"), "t1"));
  assert.deepEqual(fragment.querySelectorAll("a").map((link) => link.getAttribute("class")), ["g-navmatch__link", "g-navmatch__cta g-navmatch__cta--light"]);
  assertStyled(fragment, SIDE_CSS);
});

test("the card's text and buttons read on it in every palette", () => {
  const card = "color-mix(in srgb, var(--header-ink) 8%, var(--header))";
  for (const [selector, minimum] of [[".g-navmatch__label", 4.5], [".g-navmatch__sub", 4.5], [".g-navmatch__opp", 4.5], [".g-navmatch__link", 4.5], [".g-navmatch__result", 4.5], [".g-navmatch__dot", 3]]) {
    assertReadable(SIDE_CSS, selector, selector === ".g-navmatch__dot" ? "background" : "color", [card], minimum);
  }
  assertReadable(SIDE_CSS, ".g-navmatch__cta", "color", ["--accent", "--accent-ink"], 4.5);
  assertReadable(SIDE_CSS, ".g-navmatch__cta--light", "color", ["--header-ink", "color-mix(in srgb, var(--header-ink) 88%, var(--header))"], 4.5);
  // The accent fill itself is 1.2–2.9:1 against the card in the eight palettes (the prototype's own design): the button is known by its
  // words, which hold 4.5:1 on the fill above, not by its edge. The live dot, which has no words of its own, is held to 3:1 above.
});

test("the card is drawn as the brief says: a washed 14px panel, 12px caps, an 8px dot, a 16px opponent", () => {
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch", "background"), ["color-mix(in srgb, var(--header-ink) 8%, transparent)"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch", "padding"), ["14px"]);
  assert.match(valuesOf(SIDE_CSS, ".g-navmatch__label", "font")[0], /^600 12px\//);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__label", "letter-spacing"), [".06em"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__label", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__label", "color"), ["var(--header-tab)"]);
  assert.deepEqual([valuesOf(SIDE_CSS, ".g-navmatch__dot", "width"), valuesOf(SIDE_CSS, ".g-navmatch__dot", "height"), valuesOf(SIDE_CSS, ".g-navmatch__dot", "background")], [["8px"], ["8px"], ["var(--live)"]]);
  assert.match(valuesOf(SIDE_CSS, ".g-navmatch__opp", "font")[0], /^600 16px\//);
  assert.match(valuesOf(SIDE_CSS, ".g-navmatch__sub", "font")[0], /^400 13px\//);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__sub", "color"), ["var(--header-muted)"]);
  assert.deepEqual([valuesOf(SIDE_CSS, ".g-navmatch__cta", "background"), valuesOf(SIDE_CSS, ".g-navmatch__cta", "color"), valuesOf(SIDE_CSS, ".g-navmatch__cta", "border-radius")], [["var(--accent)"], ["var(--on-accent)"], ["var(--radius-md)"]]);
  assert.deepEqual([valuesOf(SIDE_CSS, ".g-navmatch__cta--light", "background"), valuesOf(SIDE_CSS, ".g-navmatch__cta--light", "color")], [["var(--header-ink)"], ["var(--header)"]]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__link", "color"), ["var(--header-ink)"]);
});

test("the card's label stays on one line: «Awaiting confirmation» in its caps is a fraction of a pixel wider than the card leaves it", () => {
  // Measured in Chrome at 1440: 172.4px of text in a 172px box broke it into two lines (screenshot C4).
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-navmatch__label", "white-space"), ["nowrap"]);
});

test("the sheet names no hex colour: the card's colours are the header's tokens", () => {
  assert.doesNotMatch(readFileSync(new URL(`../${SIDE_CSS}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b/i);
});

// One description of what a match offers, for the card and for the overview's board (plan stage 05, decision 12; stage 06, task 10).

const G1 = game("g1");
const G2 = game("g2", { preparationStatus: "in_progress", postMatchStatus: "draft", home: side("t2", "Ironmaw Brawlers") });
const G3 = game("g3", { resultStatus: "awaiting_confirmation", viewerIsHome: false, home: side("r1", "Grimtusk Raiders"), away: side("t3", "Dunmere Mudlarks"),
  proposedHomeTouchdowns: 1, proposedAwayTouchdowns: 2, proposedHomeCasualties: 0, proposedAwayCasualties: 1 });

test("the card and the overview's board offer the same actions: one description of each phase", () => {
  const idle = matchActions({ game: G1, phase: "idle" }, "t1");
  assert.deepEqual(idle.links.map(({ kind, href }) => [kind, href]), [["primary", "#/games/g1/pre-match"]]);
  const live = matchActions({ game: G2, phase: "live" }, "t2");
  assert.deepEqual(live.links.map(({ kind }) => kind), ["text", "light"]);
  const sent = matchActions({ game: G3, phase: "sent" }, "t3");
  assert.match(sent.sentLine, /2–1/);
  assert.deepEqual(matchActions(null, "t1"), { links: [], sentLine: "" });
});

test("each phase's actions in full: the words, the way, and which kind of button each is", () => {
  assert.deepEqual(matchActions({ game: G1, phase: "idle" }, "t1"), { links: [{ label: "Match preparation", href: "#/games/g1/pre-match", kind: "primary" }], sentLine: "" });
  assert.deepEqual(matchActions({ game: G2, phase: "live" }, "t2"), { sentLine: "", links: [
    { label: "Match records", href: "#/t/t2/roster", kind: "text" }, { label: "Post-match", href: "#/games/g2/post-match", kind: "light" }] });
  assert.deepEqual(matchActions({ game: G3, phase: "sent" }, "t3"), { links: [], sentLine: "Win 2–1 · CAS 1–0" }, "the coach's own proposal waits: a line, no button");
  assert.deepEqual(matchActions({ game: { ...G3, viewerIsProposer: false }, phase: "sent" }, "t3"), {
    links: [{ label: "Confirm the score", href: "#/games/g3", kind: "primary" }], sentLine: "Win 2–1 · CAS 1–0" }, "the opponent's proposal is the coach's to confirm");
});

test("the actions are plain text and words in the language of the page: the renderers escape and wrap", () => {
  const sent = matchActions({ game: { ...G3, viewerIsProposer: false }, phase: "sent" }, "t3");
  assert.equal(sent.sentLine.includes("<"), false, "no markup in the line");
  initLocale("ru");
  try {
    assert.deepEqual(matchActions({ game: G2, phase: "live" }, "t2").links.map(({ label }) => label), ["Записи матча", "Итоги матча"]);
    assert.equal(matchActions({ game: G3, phase: "sent" }, "t3").sentLine, "Победа 2–1 · CAS 1–0");
  } finally {
    initLocale("en");
  }
});

test("there are no actions for a team the match is not about, a phase it does not know, or a score with a number missing", () => {
  assert.deepEqual(matchActions({ game: G1, phase: "idle" }, "t9"), { links: [], sentLine: "" });
  assert.deepEqual(matchActions({ game: G1, phase: "idle" }, null), { links: [], sentLine: "" });
  assert.deepEqual(matchActions({ game: { ...G1, away: null }, phase: "idle" }, "t1"), { links: [], sentLine: "" }, "a bye");
  assert.deepEqual(matchActions({ game: G1, phase: "over" }, "t1"), { links: [], sentLine: "" });
  assert.equal(matchActions({ game: { ...G3, proposedHomeTouchdowns: null }, phase: "sent" }, "t3").sentLine, "");
});

test("the card is drawn from the same actions: a link of each kind, the class that kind has on the card", () => {
  const classes = (current, teamId) => mount(renderNavMatch(current, teamId)).querySelectorAll("a").map((link) => link.getAttribute("class"));
  assert.deepEqual(classes({ game: G1, phase: "idle" }, "t1"), ["g-navmatch__cta"]);
  assert.deepEqual(classes({ game: G2, phase: "live" }, "t2"), ["g-navmatch__link", "g-navmatch__cta g-navmatch__cta--light"]);
  assert.deepEqual(classes({ game: { ...G3, viewerIsProposer: false }, phase: "sent" }, "t3"), ["g-navmatch__cta"]);
});

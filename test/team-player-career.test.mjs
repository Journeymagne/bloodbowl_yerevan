import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import {
  LIVE_GAME, PLAYERS, STYLES, api, callKeys, coach, playerPage, releaseCurrentScreen, renderTeamRoster, save, settle, state, text, view, withPlayers,
} from "./helpers/roster-page.mjs";
import { CADE, FRIENDLY, HISTORY, ROUND_1, ROUND_2, ROUND_3, ROWS, TAPS, coachCade, counters, human, match, rowWordsIn, withCade } from "./helpers/career.mjs";

const { askCareer, careerRows, gamesPlayed } = await import("../src/screens/team/roster/career.mjs");
const { EXTRA_COUNTERS, MAIN_COUNTERS } = await import("../src/screens/team/roster/model.mjs");

// Stage 07d, owner's review (2026-10-20), Task 24: a player's career on a phone's profile, right after «Skills»
// (PlayerCareer.html). The totals stand from the roster's line at once; GP and the matches are read once a visit from
// GET /api/teams/:id/players/:pid/history, and drawn on a press of the heading's button, newest first, the edits outside
// a match last. A desk's career is test/team-roster-career.test.mjs's (stage 07e, DeskRosterCareer.html).
// Stage 07e: the reads are the player's, and made again when the server has moved on — a match ended or begun, a save
// landed, a tap heard (decision 5); the rows read before stand until the new answer.

const CAREER = "src/screens/team/roster/career.css";
const HISTORY_READ = "GET /api/teams/t1/players/p3/history";
const TEAM_READ = "GET /api/teams/t1";
// Stage 07e, decision 9: the footnote no longer promises that a line waiting for the post-match stands as it is.
const NOTE = "Actions are recorded by taps on the roster and in the post-match. A line that waits for the post-match is in the career already; "
  + "the post-match may still change it. Edits outside a match are a line of their own. Matches before the site's records are not listed.";
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const callsTo = (key) => callKeys().filter((each) => each === key).length;
const career = () => view.querySelector(".g-career");
const careerToggle = () => view.querySelector("[data-player-career]");
const list = () => view.querySelector("#player-career-list");
const press = () => fireEvent(careerToggle(), "click");
const totals = () => career().querySelectorAll(".g-career__total").map((cell) => [cell.querySelector("dt").textContent, cell.querySelector("dd").textContent]);
const rowWords = () => rowWordsIn(list());

/** Cade's profile on a phone, the server holding `history` for him. */
async function openCade(history = HISTORY, cade = {}) {
  coachCade(cade);
  api.reply(HISTORY_READ, 200, { history });
  await playerPage("p3");
  await settle();
}

test("the career stands right after the skills: «Career», «N SPP · by match», the totals GP TD CAS COMP KO INT MVP", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    const gate = api.hold(HISTORY_READ);
    await playerPage("p3");
    await settle();
    const body = view.querySelector(".g-profile__body");
    const blocks = body.childNodes.map((node) => node.getAttribute("class").split(" ")[0]);
    assert.deepEqual(blocks.slice(-3), ["g-profile__skills", "g-career", "g-profile__injuries"], "PlayerCareer.html: after «Skills», before «Injuries»");
    assert.equal(career().tagName, "SECTION");
    assert.equal(career().querySelector(".g-career__title").textContent, "Career");
    assert.equal(career().querySelector(".g-career__sub").textContent, "18 SPP · by match");
    assert.ok(careerToggle().querySelector("svg.g-icon"), "the chevron");
    // The totals from the roster's line at once; GP waits for the history (Review Focus 4).
    assert.deepEqual(totals(), [["GP", "–"], ["TD", "4"], ["CAS", "0"], ["COMP", "1"], ["KO", "0"], ["INT", "0"], ["MVP", "1"]]);
    gate.release();
    await settle();
    assert.deepEqual(totals(), [["GP", "1"], ["TD", "4"], ["CAS", "0"], ["COMP", "1"], ["KO", "0"], ["INT", "0"], ["MVP", "1"]], "the one confirmed match the site knows he played");
    const quiet = career().querySelectorAll(".g-career__value").map((value) => value.classList.contains("g-career__zero"));
    assert.deepEqual(quiet, [false, false, true, false, true, true, false], "a nought is quiet");
    assert.equal(careerToggle().tagName, "BUTTON");
    assert.equal(careerToggle().getAttribute("type"), "button");
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.ok(!careerToggle().hasAttribute("aria-controls"), "nothing to name while the list is closed (K14)");
    assert.ok(!list(), "the list closed");
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("the list opens on a press: newest first — the round, the opponent, the result, what the player did, the SPP; a match on waits for its post-match; a missed one; one without details; the edits outside a match last", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade();
    press();
    assert.equal(careerToggle().getAttribute("aria-expanded"), "true");
    assert.equal(careerToggle().getAttribute("aria-controls"), "player-career-list");
    assert.ok(list().closest(".g-career"), "in the section");
    assert.deepEqual(list().querySelector(".g-career__listhead").childNodes.map((node) => node.textContent), ["All matches · 4", "SPP"]);
    assert.deepEqual(rowWords(), ROWS, "18 SPP, and the rows add up to it: no «Before the site's records»");
    assert.equal(list().querySelector(".g-career__rows").tagName, "UL");
    const results = list().querySelectorAll(".g-career__result").map((result) => result.getAttribute("class"));
    assert.deepEqual(results, ["g-career__result g-career__result--lost", "g-career__result g-career__result--drawn", "g-career__result g-career__result--won"]);
    const quiet = list().querySelectorAll(".g-career__row").map((row) => row.querySelector(".g-career__events").classList.contains("g-career__quiet"));
    assert.deepEqual(quiet, [false, true, true, false, false], "a missed match and one without details are quiet");
    // Fidelity E2 (PlayerCareer.html's #FFFBF2): the row that waits for its post-match has the warning's soft fill.
    const waiting = list().querySelectorAll(".g-career__row").map((row) => row.classList.contains("g-career__row--pending"));
    assert.deepEqual(waiting, [true, false, false, false, false], "only the match on");
    assert.equal(list().querySelector(".g-career__note").textContent, NOTE);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    // Closed again: the totals stay, the list goes.
    press();
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.ok(!list());
    assert.ok(!careerToggle().hasAttribute("aria-controls"));
    api.assertAnswered();
  });
});

test("matches before the first one the site knows the player in are not listed", async () => {
  const before = [
    match({ pairingId: "g0", roundNumber: 1, played: false, source: "none", counters: null, opponent: { teamId: "r9", name: "Tombway Kings" } }),
    match({ pairingId: "g00", kind: "friendly", roundNumber: null, played: null, source: "none", counters: null, opponent: { teamId: "r8", name: "Karak Hold Hammers" } }),
  ];
  await withWindow({ phone: true }, async () => {
    await openCade({ ...HISTORY, matches: [...before, ...HISTORY.matches] });
    press();
    assert.deepEqual(rowWords(), ROWS);
    assert.equal(list().querySelector(".g-career__listhead").childNodes[0].textContent, "All matches · 4");
    // A player with no SPP the site knows in no match yet, nothing outside one: «No matches yet», and the footnote under it (ruling on I1).
    await openCade({ playerId: "p3", matches: before, outside: counters() }, { player: PLAYERS[2], events: [] });
    press();
    assert.equal(list().querySelector(".g-career__state").textContent, "No matches yet");
    assert.ok(!list().querySelector(".g-career__rows"));
    assert.equal(list().querySelector(".g-career__note").textContent, NOTE);
    assert.deepEqual(totals()[0], ["GP", "0"]);
    assertStyled(view, ...STYLES);
  });
});

test("the history is read once a visit, after the roster; another draw reads nothing more; another visit reads again", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    const team = api.hold(TEAM_READ);
    const drawing = playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 0, "nothing while the roster is read");
    team.release();
    await drawing;
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.ok(callKeys().indexOf(HISTORY_READ) > callKeys().indexOf(TEAM_READ), "after the roster");
    press();
    press();
    press();
    // A draw of the queue's or of the games' reads nothing more.
    api.reply("GET /api/games", 200, { games: [], currentGames: [] });
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(rowWords(), ROWS, "open, as the coach left it");
    // Another visit: read again, and the list closed.
    releaseCurrentScreen();
    await playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    assert.ok(!list());
    api.assertAnswered();
  });
});

test("a read that failed: the totals stand, GP «–», the list says why; opening it again reads again", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals(), [["GP", "–"], ["TD", "4"], ["CAS", "0"], ["COMP", "1"], ["KO", "0"], ["INT", "0"], ["MVP", "1"]]);
    assert.ok(career().querySelector(".g-career__value").classList.contains("g-career__zero"), "«–» is quiet");
    // Opened: read again, «Reading the matches…» meanwhile (K14: a career let go is drawn as read).
    press();
    assert.equal(callsTo(HISTORY_READ), 2);
    const reading = list().querySelector(".g-career__state");
    assert.equal(reading.textContent, "Reading the matches…");
    assert.equal(reading.getAttribute("role"), "status");
    await settle();
    const failed = list().querySelector(".g-career__state");
    assert.match(failed.textContent, /^The matches did not load: ./);
    assert.equal(failed.getAttribute("role"), "alert");
    assert.ok(failed.classList.contains("g-career__state--bad"));
    assert.deepEqual(totals()[0], ["GP", "–"]);
    assertStyled(view, ...STYLES);
    // Closed: nothing read. Opened again: read again, and drawn.
    press();
    assert.equal(callsTo(HISTORY_READ), 2);
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    press();
    assert.equal(callsTo(HISTORY_READ), 3);
    await settle();
    assert.deepEqual(rowWords(), ROWS);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    // A body without the matches is no answer.
    coachCade();
    api.reply(HISTORY_READ, 200, { history: { playerId: "p3" } });
    await playerPage("p3");
    await settle();
    press();
    await settle();
    assert.match(list().querySelector(".g-career__state").textContent, /^The matches did not load: ./);
  });
});

test("an answer after the coach left draws nothing", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    const gate = api.hold(HISTORY_READ);
    await playerPage("p3");
    await settle();
    press();
    assert.equal(list().querySelector(".g-career__state").textContent, "Reading the matches…");
    // «‹ Roster»: the router leaves the profile for the roster.
    releaseCurrentScreen();
    await renderTeamRoster("t1");
    await settle();
    const before = view.textContent;
    gate.release({ status: 200, body: { history: HISTORY } });
    await settle();
    assert.equal(view.textContent, before, "the roster as it was");
    assert.ok(view.querySelector('[data-screen="team-roster"]'));
    assert.ok(!career());
    assert.equal(callsTo(HISTORY_READ), 1, "the roster reads no history");
  });
});

// Ruling on review I1: «N SPP · by match» is the roster's career, which holds SPP the history cannot put in a match (matches
// before the site's records, a player who came with SPP): the rest is a last, quiet row, so the rows add up to the heading.
test("a veteran with 28 SPP and no match the site knows: «Before the site's records · +28», under the head and over the footnote", async () => {
  const veteran = { ...PLAYERS[2], spp: { touchdowns: 7, completions: 2, mvps: 1 } };
  const unknown = match({ played: null, source: "none", counters: null });
  await withWindow({ phone: true }, async () => {
    await openCade({ playerId: "p3", matches: [unknown], outside: counters() }, { player: veteran, events: [] });
    assert.equal(career().querySelector(".g-career__sub").textContent, "28 SPP · by match");
    assert.deepEqual(totals()[0], ["GP", "0"]);
    press();
    assert.deepEqual(list().querySelector(".g-career__listhead").childNodes.map((node) => node.textContent), ["All matches · 0", "SPP"]);
    assert.deepEqual(rowWords(), [["Before the site's records", "", "", "+28", ""]], "no match's details: its title and its SPP alone");
    const row = list().querySelector(".g-career__row");
    assert.ok(!row.querySelector(".g-career__events"));
    assert.ok(row.querySelector(".g-career__spp").classList.contains("g-career__quiet"), "quiet");
    assert.ok(!list().querySelector(".g-career__state"), "not «No matches yet»: there is a row to add up");
    assert.equal(list().querySelector(".g-career__note").textContent, NOTE);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
  });
});

test("a phone's profile whose roster read failed reads no history; «Try again» that brings the roster reads it once", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(TEAM_READ, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await playerPage("p3");
    await settle();
    assert.ok(view.querySelector(".g-roster__failed [data-roster-retry]"));
    assert.equal(callsTo(HISTORY_READ), 0);
    api.reply(TEAM_READ, 200, { team: withCade() });
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    fireEvent(view.querySelector("[data-roster-retry]"), "click");
    await settle();
    assert.ok(career());
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals()[0], ["GP", "1"]);
  });
});

test("the width crossing 900px: the phone's read stands for the desk's panel", async () => {
  await withWindow({ phone: true }, async () => {
    const listeners = new Set();
    const media = { matches: true, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
    globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
    const cross = async (phone) => {
      media.matches = phone;
      listeners.forEach((listener) => listener());
      await settle();
    };
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    await playerPage("p3");
    await settle();
    assert.ok(career() && !career().classList.contains("g-career--desk"), "the phone's profile");
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    // A desk (stage 07e, DeskRosterCareer.html): the roster with him in the panel, his career closed; nothing read.
    await cross(false);
    assert.ok(view.querySelector(".g-roster__aside .g-career--desk"));
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.equal(callsTo(HISTORY_READ), 1);
    // Opened: the phone's read stands for it.
    press();
    assert.deepEqual(rowWords(), ROWS);
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1, "the visit's read stands");
    await cross(true);
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    assert.deepEqual(rowWords(), ROWS, "open on the phone too: one state of the visit's");
    api.assertAnswered();
  });
});

test("a desk draws its career closed and reads none; a fallen player's page reads his; an id the roster holds nowhere, none", async () => {
  // A desk: the address is the roster with him in the panel, the desk's career closed under it (stage 07e, DeskRosterCareer.html).
  coachCade();
  await playerPage("p3");
  await settle();
  assert.ok(view.querySelector(".g-roster__aside"));
  assert.ok(career().classList.contains("g-career--desk"));
  assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
  assert.equal(callsTo(HISTORY_READ), 0);
  api.assertAnswered();
  await withWindow({ phone: true }, async () => {
    // A fallen player's page reads his (stage 07e, test/team-fallen-career.test.mjs).
    coach();
    await playerPage("d1");
    await settle();
    assert.equal(view.querySelector("h1").textContent, "Pike");
    assert.ok(career());
    assert.deepEqual(callKeys().filter((key) => key.endsWith("/history")), ["GET /api/teams/t1/players/d1/history"]);
    // An id the roster holds nowhere: the way back, and nothing read.
    coach();
    await playerPage("zz");
    await settle();
    assert.ok(!career());
    assert.ok(!callKeys().some((key) => key.endsWith("/history")));
    api.assertAnswered();
  });
});

test("the toggle keeps the focus; its heading is the section's", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade();
    const heading = careerToggle().parentNode;
    assert.equal(heading.tagName, "H2", "a heading's navigation finds it, as «Skills»");
    assert.ok(heading.classList.contains("g-career__head"));
    assert.ok(heading.parentNode === career());
    careerToggle().focus();
    press();
    assert.ok(document.activeElement === careerToggle(), "on the button, open");
    const open = view.querySelector('button[aria-controls="player-career-list"][aria-expanded="true"]');
    assert.ok(open === careerToggle() && open.parentNode.tagName === "H2", "the open list named by the heading's button");
    press();
    assert.ok(document.activeElement === careerToggle(), "and closed");
  });
});

test("an opponent's name and the words are text", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade({ ...HISTORY, matches: [match({ opponent: { teamId: "r1", name: HOSTILE } })] });
    press();
    assert.equal(list().querySelector(".g-career__name").textContent, `Round 1 · ${HOSTILE}`);
    assert.ok(!view.querySelector("img"));
    assert.ok(!view.querySelector("[onerror]"));
    assertCspSafe(view);
  });
});

test("every key in both dictionaries; styled; D2; wrapping", () => {
  assertDictionaryCovers("src/screens/team/roster/career.mjs");
  // The counters a row names, each by the roster's own short words.
  for (const counter of [...MAIN_COUNTERS, ...EXTRA_COUNTERS, "catches"]) {
    for (const locale of ["en", "ru"]) assert.ok(dictionary(locale)[`teamRoster.counter.${counter}`], `${locale} ${counter}`);
  }
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const career = (words) => Object.keys(words).filter((key) => key.startsWith("teamPlayer.career."));
  assert.deepEqual(career(ru), career(en));
  for (const key of career(en)) assert.deepEqual(ru[key].match(/\{\w+\}/g), en[key].match(/\{\w+\}/g), key);
  assert.equal(ru["teamPlayer.career.listHead"], "Все матчи · {count}");
  assert.equal(ru["teamPlayer.career.out"], "пропуск матча", "neutral words: no «не играл»");
  assert.equal(ru["teamPlayer.career.note"], "Действия записываются тапами в «Составе» и в итогах матча. Строка «ждёт итогов» уже входит в карьеру; "
    + "итоги матча могут её изменить. Правки вне матча — отдельной строкой. Матчи до записей на сайте не показываются.");
  // Stage 07e: a block of its own, in a sheet of its own with no width — the form is a class.
  const uncommented = (file) => text(file).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/g-career|g-profile__career/.test(uncommented("src/screens/team/roster/profile.css")), "the profile's sheet holds no career rule");
  assert.ok(!/@media/.test(uncommented(CAREER)), "no width: the form is a class (a fallen player's page on a desk draws the phone's block, stage 07e)");
  // PlayerCareer.html's #DCE3DF is --line-strong: the totals' two rules and the list's ring; a row's #E6EBE8 rule is --line.
  assert.deepEqual(valuesOf(CAREER, ".g-career__totals", "border"), ["1px solid var(--line-strong)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__totals", "border-width"), ["1px 0"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__rows", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__row", "border-bottom"), ["1px solid var(--line)"]);
  // D2: the heading's button is a thumb tall.
  assert.deepEqual(valuesOf(CAREER, ".g-career__toggle", "min-height"), ["var(--size-touch)"]);
  // PlayerCareer.html, as it draws (content-box): a row is 56px of content, 8px over and under and a 1px rule — 73px.
  assert.deepEqual(valuesOf(CAREER, ".g-career__row", "min-height"), ["73px"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__row", "padding"), ["var(--space-8) var(--space-12)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__row", "grid-template-columns"), ["minmax(0, 1fr) auto"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__totals", "grid-template-columns"), ["repeat(7, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__totals", "padding"), ["var(--space-8) 0"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__rows", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__pending", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__toggle .g-icon", "transform"), ["rotate(90deg)"], "the chevron points down while closed");
  assert.deepEqual(valuesOf(CAREER, '.g-career__toggle[aria-expanded="true"] .g-icon', "transform"), ["rotate(-90deg)"], "and turns 180° open");
  // Readable on the page and on the plate, in every palette.
  for (const selector of [".g-career__sub", ".g-career__key", ".g-career__value", ".g-career__zero", ".g-career__listhead",
    ".g-career__name", ".g-career__result--won", ".g-career__result--drawn", ".g-career__result--lost", ".g-career__events",
    ".g-career__spp", ".g-career__quiet", ".g-career__note", ".g-career__state", ".g-career__state--bad"]) {
    assertReadable(CAREER, selector, "color", ["--surface"], 4.5);
  }
  assertReadable(CAREER, ".g-career__pending", "color", ["--warn-tint"], 4.5);
  // Fidelity E1 (PlayerCareer.html, PlayerDead.html): a nought of the totals is grey, each other number the ink. The
  // prototype's #8A948F is 3.1:1, too little for 17px/600: the grey is --muted, which holds 4.5:1 (as 07a/07b decided).
  assert.deepEqual(valuesOf(CAREER, ".g-career__value", "color"), ["var(--ink)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career__zero", "color"), ["var(--muted)"]);
  assert.ok(!text(CAREER).replace(/\/\*[\s\S]*?\*\//g, "").includes("--faint"), "nothing in the career is faint");
  // Fidelity E2 (PlayerCareer.html, DeskRosterCareer.html: #FFFBF2): the row that waits for its post-match has the
  // warning's tint a third over the page's fill — no token holds #FFFBF2, the mix follows every palette — and whatever
  // such a row says is readable on it.
  const PENDING_FILL = "color-mix(in srgb, var(--warn-tint) 35%, var(--surface))";
  assert.deepEqual(valuesOf(CAREER, ".g-career__row--pending", "background"), [PENDING_FILL]);
  for (const selector of [".g-career__name", ".g-career__result--won", ".g-career__result--drawn", ".g-career__result--lost",
    ".g-career__events", ".g-career__spp", ".g-career__quiet"]) {
    assertReadable(CAREER, selector, "color", [PENDING_FILL], 4.5);
  }
  // A long opponent and a long line of actions wrap; nothing is cut with «…».
  const css = text(CAREER).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/text-overflow\s*:\s*ellipsis/.test(css));
  for (const selector of [".g-career__name", ".g-career__events"]) assert.deepEqual(valuesOf(CAREER, selector, "overflow-wrap"), ["anywhere"], selector);
});

// Stage 13 (07e's hand-off, N2): a nought's cell carries both classes, and the two rules weigh the same (one class each):
// the grey wins by its place in the file alone, so it is pinned to stand after the value's rule.
test("the grey zero wins by its place: after the value rule", () => {
  const css = text(CAREER).replace(/\/\*[\s\S]*?\*\//g, "");
  const rulesOf = (selector) => [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
    .filter((match) => match[2].split(",").map((part) => part.trim()).includes(selector))
    .map((match) => match.index + match[0].length);
  const [value, zero] = [rulesOf(".g-career__value"), rulesOf(".g-career__zero")];
  assert.equal(value.length, 1, "one rule for the value");
  assert.equal(zero.length, 1, "one rule for the nought");
  assert.ok(zero[0] > value[0], "the nought's rule stands after the value's");
  assert.doesNotMatch(css, /@media[^{]*\{[^@]*\.g-career__(value|zero)/, "neither is set again under a width");
  assert.doesNotMatch(css, /[^\s,{}]\.g-career__(value|zero)|\.g-career__(value|zero)[^\s,{]/, "neither is weighed by another selector");
  // The markup gives a nought both, so the order is what paints it.
  assert.deepEqual(valuesOf(CAREER, ".g-career__zero", "color"), ["var(--muted)"]);
});

test("the rows: an MVP is «MVP», two are «MVP 2»; a match's injury; a negative edit outside a match; GP counts no match on", () => {
  coach();
  const race = human();
  const rows = careerRows({
    matches: [
      match({ counters: counters({ mvps: 1, touchdowns: 1 }) }),
      match({ pairingId: "g2", roundNumber: 2, counters: counters({ mvps: 2, casualties: 1, throws: 1, catches: 1 }), injury: { code: "badly-hurt" } }),
      match({ pairingId: "g3", roundNumber: 3, injury: { code: "lasting", stat: "ag" } }),
      match({ pairingId: "g4", roundNumber: 4 }),
      // K15: a match on where the player has no tap yet waits for its post-match; it is no match «without details».
      match({ pairingId: "g5", roundNumber: 5, status: "in_progress", score: null, source: "none", counters: null, pending: false }),
    ],
    outside: counters({ touchdowns: -1 }),
  }, race);
  assert.deepEqual(rows.map(({ key, title, result, outcome, events, spp, quiet, pending }) => [key, title, result, outcome, events, spp, quiet, pending]), [
    ["g5", "Round 5 · Grimtusk Raiders", "", "", "no actions", "—", true, true],
    ["g4", "Round 4 · Grimtusk Raiders", "W 2–1", "won", "no actions", "0", true, false],
    ["g3", "Round 3 · Grimtusk Raiders", "W 2–1", "won", "Lasting Injury (AG)", "0", false, false],
    ["g2", "Round 2 · Grimtusk Raiders", "W 2–1", "won", "CAS 1 · MVP 2 · TTM 1 · CATCH 1 · Badly Hurt", "+13", false, false],
    ["g1", "Round 1 · Grimtusk Raiders", "W 2–1", "won", "TD 1 · MVP", "+8", false, false],
    ["outside", "Edits outside a match", "", "", "TD −1", "−3", false, false],
  ]);
  // Nothing outside a match: no line for it.
  assert.deepEqual(careerRows({ matches: [], outside: counters() }, race), []);
  assert.equal(gamesPlayed({ matches: [ROUND_1, FRIENDLY, ROUND_2, ROUND_3, match({ pairingId: "g9", played: true, status: "confirmed" })] }), 2,
    "confirmed and played: not the match on, not one missed, not one the site has no roster for");
});

test("the rows add up to the heading: what they lack is «Before the site's records»; none when they hold it all, or more", () => {
  coach();
  const race = human();
  // 12 earned; the rows hold 7 (+4, +3): the rest, +5, last and quiet.
  const seven = { matches: [match({ counters: counters({ touchdowns: 1, completions: 1 }) }), match({ pairingId: "g2", roundNumber: 2, counters: counters({ touchdowns: 1 }) })], outside: counters() };
  const rows = careerRows(seven, race, { earned: 12 });
  assert.deepEqual(rows.map(({ key, spp, points, quiet }) => [key, spp, points, quiet]), [["g2", "+3", 3, false], ["g1", "+4", 4, false], ["before", "+5", 5, true]]);
  assert.deepEqual(rows.at(-1), { key: "before", title: "Before the site's records", result: "", outcome: "", events: "", spp: "+5", points: 5, quiet: true, pending: false });
  assert.equal(rows.reduce((sum, row) => sum + row.points, 0), 12);
  // After the edits outside a match, which count too; a missed match and one without details count nothing.
  const edits = careerRows({ ...seven, matches: [...seven.matches, match({ pairingId: "g3", played: false })], outside: counters({ bonus: 2 }) }, race, { earned: 12 });
  assert.deepEqual(edits.map(({ key, spp }) => [key, spp]), [["g3", "—"], ["g2", "+3"], ["g1", "+4"], ["outside", "+2"], ["before", "+3"]]);
  // The rows hold it all, or more (a counter the roster holds at nought): no such row.
  assert.ok(!careerRows(seven, race, { earned: 7 }).some(({ key }) => key === "before"));
  assert.ok(!careerRows(seven, race, { earned: 5 }).some(({ key }) => key === "before"));
  // A veteran the site knows in no match: the one row.
  assert.deepEqual(careerRows({ matches: [], outside: counters() }, race, { earned: 28 }).map(({ title, spp }) => [title, spp]), [["Before the site's records", "+28"]]);
  assert.deepEqual(careerRows({ matches: [], outside: counters() }, race, { earned: 0 }), []);
});

/** A row as the tests of `careerRows` read it. */
const fields = ({ key, title, result, outcome, events, spp, quiet, pending }) => [key, title, result, outcome, events, spp, quiet, pending];

// Stage 07e, decision 7 (the rollout plan, from 03: a journeyman kept starts his history again under his new id). The
// match he was hired in is on the snapshot under his old id, so it reads `played: false`; the post-match applied what he
// did there to the new one.
test("a journeyman kept: the match he played under his old id says what he did, and GP counts it", () => {
  coach();
  const race = human();
  const kept = { matches: [match({ played: false, source: "applied", counters: counters({ touchdowns: 1 }) })], outside: counters() };
  assert.deepEqual(careerRows(kept, race).map(fields), [["g1", "Round 1 · Grimtusk Raiders", "W 2–1", "won", "TD 1", "+3", false, false]]);
  assert.equal(gamesPlayed(kept), 1);
  // One bought in the post-match: on no roster of the match and nothing done there — a match missed, as before.
  const bought = { matches: [match({ played: false, source: "applied", counters: counters() })], outside: counters() };
  assert.deepEqual(careerRows(bought, race).map(fields), [["g1", "Round 1 · Grimtusk Raiders", "W 2–1", "won", "missed the match", "—", true, false]]);
  assert.equal(gamesPlayed(bought), 0);
});

// Decision 8: a player killed in a match with no tap of his is on no roster the post-match left, so the history has no
// counters for him, and has the injury from the post-match's side.
test("a match the site has no counters of but an injury: the injury is said", () => {
  coach();
  const race = human();
  const [death] = careerRows({ matches: [match({ source: "none", counters: null, injury: { code: "dead" } })], outside: counters() }, race);
  assert.deepEqual([death.events, death.spp, death.quiet, death.points], ["Dead", "—", false, 0]);
  // A match missed, after one the site knows him in, says so still.
  const [missed] = careerRows({ matches: [ROUND_1, match({ pairingId: "g2", roundNumber: 2, played: false, source: "none", counters: null })], outside: counters() }, race);
  assert.deepEqual([missed.key, missed.events, missed.spp, missed.quiet], ["g2", "missed the match", "—", true]);
  // Without the injury, as before: no details.
  const [bare] = careerRows({ matches: [match({ source: "none", counters: null })], outside: counters() }, race);
  assert.deepEqual([bare.events, bare.spp, bare.quiet], ["no details", "—", true]);
});

test("«—» is quiet whatever the row", async () => {
  const death = match({ pairingId: "g5", roundNumber: 2, source: "none", counters: null, injury: { code: "dead" }, opponent: { teamId: "r5", name: "Ironjaw Reavers" } });
  await withWindow({ phone: true }, async () => {
    await openCade({ ...HISTORY, matches: [ROUND_1, death] });
    press();
    const row = list().querySelectorAll(".g-career__row").find((each) => each.querySelector(".g-career__name").textContent === "Round 2 · Ironjaw Reavers");
    assert.equal(row.querySelector(".g-career__events").textContent, "Dead");
    assert.ok(!row.querySelector(".g-career__events").classList.contains("g-career__quiet"), "the death is said aloud");
    assert.equal(row.querySelector(".g-career__spp").textContent, "—");
    assert.ok(row.querySelector(".g-career__spp").classList.contains("g-career__quiet"), "its «—» is quiet");
    assertStyled(view, ...STYLES);
  });
});

// Pre-flight L6 (controller's ruling, default): the history has every match of the team's, so after a death each match the
// team plays has him on no roster — «missed the match» for ever. A fallen player's rows end at the last match the site
// knows him in, as they begin at the first; a living player's tail is a match on he misses, and stays.
test("a fallen player's rows end at the last match the site knows him in: the matches after the death add no row", () => {
  coach();
  const race = human();
  const after = [
    match({ pairingId: "g8", roundNumber: 3, played: false, source: "none", counters: null, opponent: { teamId: "r8", name: "Karak Hold Hammers" } }),
    match({ pairingId: "g9", roundNumber: 4, played: false, source: "none", counters: null, opponent: { teamId: "r9", name: "Tombway Kings" } }),
  ];
  const joe = { matches: [match({ pairingId: "g7", roundNumber: 2, source: "none", counters: null, injury: { code: "dead" } }), ...after], outside: counters() };
  const rows = careerRows(joe, race, { earned: 0, fallen: true });
  assert.deepEqual(rows.map(({ key, events }) => [key, events]), [["g7", "Dead"]], "one match: «All matches · 1»");
  assert.equal(gamesPlayed(joe), 1);
  // A living player keeps them: the matches he misses.
  assert.deepEqual(careerRows(joe, race, { earned: 0 }).map(({ key }) => key), ["g9", "g8", "g7"]);
  // A death by hand after matches missed: those before it stay (`applied`), the ones after go; no row he is known in, none.
  const byHand = { matches: [match({ played: false, source: "applied", counters: counters() }), match({ pairingId: "g2", roundNumber: 2, counters: counters({ touchdowns: 1 }) }), ...after], outside: counters() };
  assert.deepEqual(careerRows(byHand, race, { fallen: true }).map(({ key }) => key), ["g2", "g1"]);
  assert.deepEqual(careerRows({ matches: after, outside: counters() }, race, { fallen: true }), []);
});

/** The games the server answers: a match on, or none. */
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const PATCH = "PATCH /api/teams/t1";
/** Round 3 as the match on, LIVE_GAME, has it, and Cade's taps in it. */
const LIVE_ROUND = { ...ROUND_3, pairingId: LIVE_GAME.id };
const LIVE_TAPS = TAPS.map((tap) => ({ ...tap, pairingId: LIVE_GAME.id }));
/** The history while LIVE_GAME is on: HISTORY's rows, round 3 its match (the friendly another pairing's). */
const IN_MATCH = { ...HISTORY, matches: [ROUND_1, { ...FRIENDLY, pairingId: "g5" }, ROUND_2, LIVE_ROUND] };
/** Before round 3 began: rounds 1 and 2 and the friendly; 14 SPP, which they add up to with the edit outside a match. */
const BEFORE_ROUND_3 = { ...IN_MATCH, matches: IN_MATCH.matches.slice(0, 3) };
/** The roster holding Cade as `player`, at `revision`. */
const rosterWith = (player, revision) => withPlayers(PLAYERS.map((each) => (each.id === "p3" ? player : each)), { revision });

// Review Focus 1: the match ends elsewhere while his profile is open; «Состав» reads the team again (07a), then the history.
test("a match that ends while the profile is open: the roster read again, then the history; the rows stand meanwhile, then the match is confirmed and GP counts it", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade({ events: LIVE_TAPS });
    gamesAre([LIVE_GAME]);
    api.reply(HISTORY_READ, 200, { history: IN_MATCH });
    await playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1, "a profile opened in a match reads once: after the games (pre-flight L1)");
    press();
    assert.deepEqual(rowWords(), ROWS);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    // Both coaches finish it: the games say none is on. The post-match put round 3's TD and COMP on the roster and
    // settled the records — the same 18 SPP — and the history has the match confirmed, 1–0.
    gamesAre([]);
    const ended = { ...LIVE_ROUND, status: "confirmed", pending: false, source: "applied", score: { own: 1, opponent: 0 } };
    api.reply(TEAM_READ, 200, { team: rosterWith({ ...CADE, spp: { touchdowns: 4, completions: 1, mvps: 1 } }, 5) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    api.reply(HISTORY_READ, 200, { history: { ...IN_MATCH, matches: [...BEFORE_ROUND_3.matches, ended] } });
    const team = api.hold(TEAM_READ);
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(team.count, 1, "the roster read again");
    assert.equal(callsTo(HISTORY_READ), 1, "nothing while the roster's read is in the air");
    assert.deepEqual(rowWords(), ROWS, "the rows read before stand");
    assert.ok(!list().querySelector(".g-career__state"), "no «Reading the matches…»");
    const history = api.hold(HISTORY_READ);
    team.release();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    assert.ok(callKeys().lastIndexOf(HISTORY_READ) > callKeys().lastIndexOf(TEAM_READ), "after the roster");
    assert.deepEqual(rowWords(), ROWS, "the rows stand while the new read is in the air");
    assert.deepEqual(totals()[0], ["GP", "1"]);
    assert.ok(!list().querySelector(".g-career__state"));
    history.release();
    await settle();
    assert.deepEqual(rowWords(), [["Round 3 · Silverbrook Rangers", "W 1–0", "TD 1 · COMP 1", "+4", ""], ...ROWS.slice(1)], "no «Before the site's records»");
    assert.deepEqual(totals()[0], ["GP", "2"]);
    assert.equal(callsTo(HISTORY_READ), 2);
    api.assertAnswered();
  });
});

test("a match begun while the profile is open reads it again: its row waits for the post-match", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade(BEFORE_ROUND_3, { events: [] });
    press();
    assert.deepEqual(rowWords(), ROWS.slice(1));
    assert.equal(callsTo(HISTORY_READ), 1);
    // The coaches start round 3; no tap of his in it yet.
    gamesAre([LIVE_GAME]);
    api.reply(HISTORY_READ, 200, { history: { ...BEFORE_ROUND_3, matches: [...BEFORE_ROUND_3.matches, { ...LIVE_ROUND, source: "none", counters: null, pending: false }] } });
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    assert.deepEqual(rowWords(), [["Round 3 · Silverbrook Rangers", "", "no actions", "—", "waits for the post-match"], ...ROWS.slice(1)]);
    assert.equal(list().querySelector(".g-career__listhead").childNodes[0].textContent, "All matches · 4");
    api.assertAnswered();
  });
});

test("a save of the queue that lands reads it again once; a draw that moves nothing reads nothing", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade();
    press();
    assert.equal(callsTo(HISTORY_READ), 1);
    // A touchdown outside a match: the save lands on revision 5, and the server has it as an edit outside a match.
    api.reply(PATCH, 200, { team: rosterWith({ ...CADE, spp: { touchdowns: 4, mvps: 1 } }, 5) });
    api.reply(HISTORY_READ, 200, { history: { ...HISTORY, outside: counters({ touchdowns: 2 }) } });
    assert.deepEqual(save.stepSpp("t1", "p3", "touchdowns", 1), { ok: true });
    await settle();
    assert.equal(callsTo(PATCH), 1);
    assert.equal(callsTo(HISTORY_READ), 2, "the save landed: read again, once");
    assert.equal(career().querySelector(".g-career__sub").textContent, "21 SPP · by match");
    assert.deepEqual(rowWords().at(-1), ["Edits outside a match", "", "TD 2", "+6", ""], "the rows add up to 21: no «Before the site's records»");
    // Draws that move nothing — the games read again and the same, the list closed and opened — read nothing.
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    press();
    press();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    api.assertAnswered();
  });
});

test("nothing is asked while the roster's read is in the air", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade({ events: LIVE_TAPS });
    gamesAre([LIVE_GAME]);
    api.reply(HISTORY_READ, 200, { history: IN_MATCH });
    await playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    // The match ends: the roster is read again, and held; whatever is drawn meanwhile reads no history.
    gamesAre([]);
    const team = api.hold(TEAM_READ);
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    press();
    press();
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    team.release();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2, "once it has answered");
  });
});

test("a read that fails after one that answered: the list says why, GP «–»; opening it again reads again", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade(BEFORE_ROUND_3, { events: [] });
    press();
    assert.deepEqual(totals()[0], ["GP", "1"]);
    gamesAre([LIVE_GAME]);
    api.reply(HISTORY_READ, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    const failed = list().querySelector(".g-career__state");
    assert.match(failed.textContent, /^The matches did not load: ./);
    assert.equal(failed.getAttribute("role"), "alert");
    assert.ok(!list().querySelector(".g-career__rows"), "not the rows of the read before");
    assert.deepEqual(totals()[0], ["GP", "–"]);
    // Closed: nothing read. Opened again: read again, and drawn.
    api.reply(HISTORY_READ, 200, { history: BEFORE_ROUND_3 });
    press();
    assert.equal(callsTo(HISTORY_READ), 2);
    press();
    assert.equal(callsTo(HISTORY_READ), 3);
    assert.equal(list().querySelector(".g-career__state").textContent, "Reading the matches…");
    await settle();
    assert.deepEqual(rowWords(), ROWS.slice(1));
    assert.deepEqual(totals()[0], ["GP", "1"]);
    api.assertAnswered();
  });
});

// Decision 5's rule, on the read itself: what holds it back, what lets it go, and an answer the visit no longer asks for.
test("a read waits for a tap and a roster's read in the air, the games, his read on its way; the server moved on, it is asked again from the SPP of that moment", async () => {
  coach();
  api.reply(HISTORY_READ, 200, { history: HISTORY });
  const visit = { here: true, reads: 1, answered: 1, pending: [], heard: [], match: null, careers: new Map() };
  let draws = 0;
  const reading = { teamId: "t1", visit, draw: () => { draws += 1; } };
  const cade = { id: "p3", earned: 18 };
  askCareer(reading, null);
  askCareer(reading, { id: null, earned: 0 });
  visit.pending = [{ pairingId: "g2", playerId: "p3", counter: "touchdowns", delta: 1 }];
  askCareer(reading, cade);
  visit.pending = [];
  visit.reads = 2;
  askCareer(reading, cade);
  visit.answered = 2;
  state.games.loading = true;
  askCareer(reading, cade);
  state.games.loading = false;
  assert.equal(callsTo(HISTORY_READ), 0, "no line, a tap in the air, a read of the roster in the air, the games read");
  askCareer(reading, cade);
  assert.equal(callsTo(HISTORY_READ), 1);
  assert.equal(visit.careers.get("p3").loading, true);
  askCareer(reading, cade);
  assert.equal(callsTo(HISTORY_READ), 1, "his read on its way");
  await settle();
  assert.equal(draws, 1);
  const first = visit.careers.get("p3");
  assert.deepEqual(first, { stamp: first.stamp, loading: false, history: { matches: HISTORY.matches, outside: HISTORY.outside }, basis: 18, error: "" });
  askCareer(reading, cade);
  assert.equal(callsTo(HISTORY_READ), 1, "the server where it was");
  // A tap heard: asked again, the rows read before kept meanwhile, the rest then counted from the SPP of the new moment.
  visit.heard = [{ id: "e3", pairingId: "g2", playerId: "p3", counter: "touchdowns", delta: 1, injury: null, settledAt: null }];
  askCareer(reading, { id: "p3", earned: 21 });
  assert.equal(callsTo(HISTORY_READ), 2);
  assert.notEqual(visit.careers.get("p3").stamp, first.stamp);
  assert.deepEqual([visit.careers.get("p3").loading, visit.careers.get("p3").history, visit.careers.get("p3").basis], [true, first.history, 18]);
  await settle();
  assert.equal(visit.careers.get("p3").basis, 21);
  // An answer after the coach left is taken nowhere.
  visit.match = "g2";
  askCareer(reading, cade);
  const asked = visit.careers.get("p3");
  visit.here = false;
  await settle();
  assert.equal(draws, 2);
  assert.equal(visit.careers.get("p3"), asked);
  api.assertAnswered();
});

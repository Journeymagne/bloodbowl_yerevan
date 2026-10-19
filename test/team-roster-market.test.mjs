import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PLAYERS, STYLES, api, aside, coach, died, headingText, loadGames, namesIn, openRow, page, renderTeamRoster, save, settle, tables, team, text, toggle, view,
  withPlayers, words,
} from "./helpers/roster-page.mjs";

const { prepResetWords } = await import("../src/screens/team/roster/panel.mjs");

// Stage 07c, Task 5: the «+» beside «Player» in the active roster's header (StatsHire.html, DeskRosterHire.html) and the
// cart it opens: the race's positions with their limits, the treasury and what the cart leaves of it, and «Buy», one
// step of the roster's save queue. The page, the coach and his team are helpers/roster-page.mjs's: seven of Human's
// (Lineman — Ann, Dell, Finn; Thrower — Edda; Catcher — Cade; Blitzer — Bors; Ogre — Grom), here with 120k in the treasury.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const DEATH = "POST /api/teams/t1/players/p1/death";
const patches = () => api.calls.filter(({ key }) => key === PATCH);
const teamReads = () => api.calls.filter(({ key }) => key === TEAM_READ).length;
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const status = () => view.querySelector(".g-roster__status").textContent;
/** The team with 120k to spend. */
const rich = (over = {}) => team({ roster: { players: PLAYERS, treasury: 120 }, ...over });
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
const CLOSED = "Hiring and selling — after the post-match";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";
const OGRE_MAX = "Ogre: maximum is 1.";
const MARKET = "src/screens/team/roster/market.css";

const hireButton = () => view.querySelector("[data-roster-hire]");
const hireSheet = () => view.querySelector("dialog#roster-hire");
const cards = () => hireSheet().querySelectorAll(".g-market__row");
/** The card of the race's line `rowIndex` (0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 4 Halfling Hopeful, 5 Ogre). */
const card = (rowIndex) => cards().find((item) => item.getAttribute("data-hire-key") === String(rowIndex));
const plusOf = (rowIndex) => card(rowIndex).querySelector('[data-hire-step="1"]');
const minusOf = (rowIndex) => card(rowIndex).querySelector('[data-hire-step="-1"]');
const countOf = (rowIndex) => card(rowIndex).querySelector(".g-market__count")?.textContent ?? null;
const tiles = () => hireSheet().querySelectorAll(".g-market__tile");
const tileValues = () => tiles().map((tile) => tile.querySelector("dd").textContent);
const buyButton = () => hireSheet().querySelector("[data-hire-buy]");
const keepButton = () => hireSheet().querySelector("[data-hire-keep]");
const refusalLine = () => hireSheet().querySelector(".g-market__refusal");
const numbersLine = () => hireSheet().querySelector(".g-market__numbers").textContent;
const cartLines = () => hireSheet().querySelectorAll(".g-market__lines li").map((line) => line.childNodes.filter((node) => node.nodeType === 1).map((node) => node.textContent));
/** The cart open, `rows` pressed in turn (one + each). */
const openCart = (...rows) => {
  fireEvent(hireButton(), "click");
  for (const rowIndex of rows) fireEvent(plusOf(rowIndex), "click");
};
/** «Back on the roster» for Edda from the desk's panel: a step of the roster's queue, then Ann in the panel again. */
const stepOfTheRoster = () => {
  fireEvent(toggle("p5#0"), "click");
  fireEvent(aside().querySelector("[data-roster-return]"), "click");
  fireEvent(toggle("p1#0"), "click");
};
/** The parts of `file` inside its `@media (<query>)` block. */
const mediaBlock = (file, query) => {
  const css = text(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf(`@media (${query}) {`);
  assert.ok(start >= 0, `${file} has no @media (${query})`);
  return css.slice(start, css.indexOf("\n}", start));
};

test("the «+» stands right after «Player» in the active roster's header, on a phone and on a desk; the other tables have none", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        coach();
        await renderTeamRoster("t1");
        const [active, ...others] = tables();
        const who = active.querySelector("thead th.g-rtable__h--who");
        const [sort, plus, ...rest] = who.childNodes.filter((node) => node.nodeType === 1);
        assert.equal(rest.length, 0);
        assert.ok(sort.classList.contains("g-sort"), "«Player» first");
        assert.equal(sort.getAttribute("data-sort-key"), "player");
        assert.equal(plus.getAttribute("data-roster-hire"), "hire", "the «+» after it");
        assert.equal(plus.tagName, "BUTTON");
        assert.equal(plus.getAttribute("type"), "button");
        assert.ok(plus.classList.contains("g-roster__hire"));
        assert.equal(plus.getAttribute("aria-haspopup"), "dialog");
        assert.equal(plus.getAttribute("aria-label"), "Hire players");
        assert.equal(plus.getAttribute("title"), "Add players", "the prototypes' title (the T5 review's carry)");
        assert.ok(!plus.hasAttribute("aria-disabled"));
        assert.ok(plus.querySelector("svg.g-icon"), "a plus, named by its label");
        assert.equal(others.length, 2, phone ? "a phone" : "a desk");
        for (const table of others) assert.ok(!table.querySelector("[data-roster-hire]"));
        assert.equal(view.querySelectorAll("[data-roster-hire]").length, 1);
        assert.ok(!active.querySelector("tfoot [data-roster-hire]"), "the foot repeats the labels, not the «+»");
      });
    }
  });
});

test("a roster with nobody who plays the next match still hires: the button under the words", async () => {
  await withoutTimers(async () => {
    for (const [players, words] of [[PLAYERS.map((player) => ({ ...player, skipNextGame: true })), "Everyone on the roster misses the next match."], [[], "No players on the roster yet."]]) {
      coach({ teamAnswer: withPlayers(players), fallen: [] });
      await renderTeamRoster("t1");
      const empty = view.querySelector(".g-roster__empty");
      assert.equal(empty.textContent, words);
      const bar = view.querySelector(".g-market__hirebar");
      const section = empty.parentNode;
      assert.ok(section.childNodes.indexOf(bar) === section.childNodes.indexOf(empty) + 1, "right under the words");
      const button = bar.querySelector("[data-roster-hire]");
      assert.equal(button.textContent, "Hire players");
      assert.ok(button.classList.contains("g-btn--primary"));
      assert.ok(button.classList.contains("g-btn--block"));
      assert.equal(view.querySelectorAll("[data-roster-hire]").length, 1);
      button.focus();
      fireEvent(button, "click");
      assert.ok(hireSheet()?.isModal, words);
      fireEvent(keepButton(), "click");
      assert.ok(!hireSheet());
      assert.ok(document.activeElement === view.querySelector("[data-roster-hire]"), "the focus back on it");
    }
  });
});

test("in a match the «+» says why and opens nothing", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        coach();
        gamesAre([LIVE_GAME]);
        await renderTeamRoster("t1");
        const plus = hireButton();
        assert.equal(plus.getAttribute("aria-disabled"), "true");
        assert.equal(plus.getAttribute("title"), CLOSED);
        assert.equal(plus.getAttribute("aria-label"), "Hire players");
        assert.ok(plus.classList.contains("g-roster__hire"));
        assert.ok(plus.classList.contains("g-roster__closed"));
        assert.ok(plus.querySelector("svg.g-icon"));
        fireEvent(plus, "click");
        assert.equal(toasts().at(-1), CLOSED);
        assert.ok(!hireSheet());
        assert.equal(patches().length, 0);
      });
    }
    // With nobody to play it, the block button is closed the same way.
    coach({ teamAnswer: withPlayers([]), fallen: [] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const block = view.querySelector(".g-market__hirebar [data-roster-hire]");
    assert.equal(block.getAttribute("title"), CLOSED);
    assert.equal(block.textContent, "Hire players");
    fireEvent(block, "click");
    assert.equal(toasts().at(-1), CLOSED);
    assert.ok(!hireSheet());
  });
});

test("closed while the games are unread, the roster is read, or a death is on its way", async () => {
  await withoutTimers(async () => {
    coach();
    const games = api.hold("GET /api/games");
    const drawing = renderTeamRoster("t1");
    await settle();
    assert.equal(hireButton().getAttribute("aria-disabled"), "true");
    assert.equal(hireButton().getAttribute("title"), "Loading the matches…");
    fireEvent(hireButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!hireSheet());
    games.release();
    await drawing;
    await settle();
    assert.ok(!hireButton().hasAttribute("aria-disabled"));
    // A death on its way (stage 07b, Task 8): the roster's revision moves under it, so nothing is bought meanwhile.
    fireEvent(aside().querySelector("[data-roster-mark]"), "click");
    const mark = view.querySelector("dialog#roster-mark");
    fireEvent(mark.querySelectorAll('.g-option[role="radio"]').find((option) => option.getAttribute("data-option-value") === "dead"), "click");
    const cause = mark.querySelector("#mark-text");
    cause.focus();
    cause.value = "Foul";
    fireEvent(cause, "input");
    const death = api.hold(DEATH);
    fireEvent(mark.querySelector("[data-mark-send]"), "click");
    await settle();
    fireEvent(view.querySelector("dialog#roster-mark"), "keydown", { key: "Escape" });
    assert.equal(hireButton().getAttribute("title"), "Saving the mark…");
    fireEvent(hireButton(), "click");
    assert.equal(toasts().at(-1), "Saving the mark…");
    assert.ok(!hireSheet());
    death.release({ status: 201, body: { team: withPlayers(PLAYERS.filter((player) => player.id !== "p1"), { revision: 5 }), fallen: died("f9", { ...PLAYERS[0] }, { cause: "Foul" }) } });
    await settle();
    assert.ok(!hireButton().hasAttribute("aria-disabled"), "open again once it has answered");
    assert.equal(patches().length, 0);
  });
});

test("the cart: the race and the places, the treasury, what it costs and what is left; every position with its price, its characteristics, its skills and how many the team has", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    hireButton().focus();
    fireEvent(hireButton(), "click");
    const dialog = hireSheet();
    assert.ok(dialog?.isModal, "the sheet is open, modally");
    assert.ok(dialog.classList.contains("g-sheet--wide"), "640px on a desk (DeskRosterHire.html)");
    assert.equal(dialog.querySelector("h2").textContent, "Hire players");
    assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "Human · on the roster 7 of 14 · places left: 7");
    assert.equal(dialog.querySelector("dl.g-market__tiles").childNodes.filter((node) => node.nodeType === 1).length, 3);
    assert.deepEqual(tiles().map((tile) => [tile.querySelector("dt.g-market__label").textContent, tile.querySelector("dd.g-market__value").textContent]), [["Treasury", "120k"], ["Cart", "0"], ["Left", "120k"]]);
    assert.ok(tiles()[2].classList.contains("g-market__tile--left"));
    assert.ok(!tiles()[2].classList.contains("g-market__tile--short"));
    assert.deepEqual(cards().map((item) => item.getAttribute("data-hire-key")), ["0", "1", "2", "3", "4", "5"], "every line of Human's table");
    const lineman = card(0);
    assert.equal(lineman.querySelector(".g-market__name").textContent, "Human Lineman");
    assert.equal(lineman.querySelector(".g-market__price").textContent, "50k");
    assert.equal(lineman.querySelector(".g-market__stats").textContent, "MA 6 · ST 3 · AG 3+ · PA 4+ · AR 9+");
    assert.equal(lineman.querySelector(".g-market__meta").textContent, "no skills · in the team 3 of 16");
    const letter = lineman.querySelector(".g-market__letter");
    assert.equal(letter.textContent, "H");
    assert.ok(letter.classList.contains("g-market__letter--lineman"));
    assert.equal(letter.getAttribute("aria-hidden"), "true");
    assert.deepEqual(cards().map((item) => [item.querySelector(".g-market__price").textContent, item.querySelector(".g-market__meta").textContent]), [
      ["50k", "no skills · in the team 3 of 16"],
      ["80k", "Pass, Sure Hands · in the team 1 of 2"],
      ["75k", "Catch, Dodge · in the team 1 of 2"],
      ["80k", "Block, Tackle · in the team 1 of 2"],
      ["30k", "Dodge, Evasive, Stunty, Right Stuff · in the team 0 of 3"],
      ["140k", "Bone Head, Thick Skull, Mighty Blow, Loner (3+), Throw Team-mate · in the team 1 of 1"],
    ]);
    assert.deepEqual(cards().map((item) => item.querySelector(".g-market__letter").getAttribute("class").split(" ").find((name) => name.startsWith("g-market__letter--"))),
      ["g-market__letter--lineman", "g-market__letter--thrower", "g-market__letter--catcher", "g-market__letter--blitzer", "g-market__letter--lineman", "g-market__letter--big"]);
    for (const item of cards()) {
      const add = item.querySelector(".g-market__add");
      assert.ok(add, item.getAttribute("data-hire-key"));
      assert.equal(add.tagName, "BUTTON");
      assert.equal(add.getAttribute("data-hire-step"), "1");
      assert.equal(add.querySelector(".g-market__addword").textContent, "To the cart");
      assert.ok(!item.querySelector(".g-market__stepper"));
      assert.ok(!item.classList.contains("g-market__row--in"));
    }
    assert.equal(card(0).querySelector(".g-market__add").getAttribute("aria-label"), "Add to the cart: Human Lineman");
    assert.equal(keepButton().textContent, "Cancel");
    assert.ok(keepButton().closest(".g-sheet__foot-start"), "beside the button, in the foot");
    assert.equal(buyButton().textContent, "The cart is empty");
    assert.ok(buyButton().hasAttribute("disabled"));
    assert.ok(buyButton().classList.contains("g-btn--primary"));
    assert.equal(numbersLine(), "Add players to the cart");
    assert.ok(!hireSheet().querySelector(".g-market__lines"), "no lines while the cart is empty");
    assert.ok(!refusalLine());
    assert.ok(!hireSheet().querySelector(".g-market__prep"));
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    fireEvent(keepButton(), "click");
    assert.ok(!hireSheet(), "«Cancel» closes it");
    assert.ok(document.activeElement === hireButton(), "the focus back on the «+»");
    fireEvent(hireButton(), "click");
    fireEvent(plusOf(0), "click");
    fireEvent(hireSheet(), "keydown", { key: "Escape" });
    assert.ok(!hireSheet());
    fireEvent(hireButton(), "click");
    assert.equal(countOf(0), null, "opened again, the cart starts empty");
    assert.equal(patches().length, 0);
  });
});

test("+ adds to the cart, − takes out; the card, the totals, the numbers the new players get and the button follow", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    fireEvent(hireButton(), "click");
    const add = plusOf(0);
    add.focus();
    fireEvent(add, "click");
    assert.ok(card(0).querySelector(".g-market__stepper"), "in the cart: the stepper in place of «+ To the cart»");
    assert.ok(!card(0).querySelector(".g-market__add"));
    assert.ok(document.activeElement === plusOf(0), "K14: the focus on the stepper's +, not the sheet's cross");
    fireEvent(plusOf(0), "click");
    assert.ok(card(0).classList.contains("g-market__row--in"));
    assert.equal(countOf(0), "2");
    assert.equal(minusOf(0).getAttribute("aria-label"), "Take out of the cart: Human Lineman");
    assert.equal(plusOf(0).getAttribute("aria-label"), "Add to the cart: Human Lineman");
    assert.deepEqual(tileValues(), ["120k", "−100k", "20k"]);
    assert.deepEqual(cartLines(), [["2 × Human Lineman", "100k"]]);
    assert.equal(numbersLine(), "Numbers of the new players: 8, 9 — change them in the player's profile");
    assert.equal(buyButton().textContent, "Buy for 100k · players: 2");
    assert.ok(!buyButton().hasAttribute("disabled"));
    assert.equal(hireSheet().querySelector(".g-sheet__sub").textContent, "Human · on the roster 7 of 14 · places left: 5");
    assert.equal(card(0).querySelector(".g-market__meta").textContent, "no skills · in the team 3 of 16", "the team's, not the cart's");
    fireEvent(plusOf(1), "click");
    assert.deepEqual(cartLines(), [["2 × Human Lineman", "100k"], ["1 × Thrower", "80k"]]);
    assert.equal(buyButton().textContent, "Not enough: 60k");
    fireEvent(minusOf(1), "click");
    assert.deepEqual(cartLines(), [["2 × Human Lineman", "100k"]]);
    const minus = minusOf(0);
    minus.focus();
    fireEvent(minus, "click");
    assert.equal(countOf(0), "1");
    assert.ok(document.activeElement === minusOf(0), "the − stays where the coach pressed it");
    assert.equal(buyButton().textContent, "Buy for 50k · players: 1");
    assert.equal(numbersLine(), "Numbers of the new players: 8 — change them in the player's profile");
    fireEvent(minusOf(0), "click");
    assert.equal(countOf(0), null);
    assert.ok(!card(0).classList.contains("g-market__row--in"));
    assert.equal(card(0).querySelector(".g-market__add .g-market__addword").textContent, "To the cart", "back to «+ To the cart»");
    assert.ok(document.activeElement === plusOf(0), "K14: the focus on «+ To the cart»");
    // An empty cart costs «0», as StatsHire.html and DeskRosterHire.html write it, not «0k».
    assert.deepEqual(tileValues(), ["120k", "0", "120k"]);
    assert.equal(buyButton().textContent, "The cart is empty");
    assert.ok(hireSheet()?.isModal);
    assert.equal(patches().length, 0);
  });
});

test("a position at its maximum, and a full roster, refuse the + and say why; money does not", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    fireEvent(hireButton(), "click");
    const ogre = plusOf(5);
    assert.equal(ogre.getAttribute("aria-disabled"), "true");
    assert.equal(ogre.getAttribute("title"), OGRE_MAX);
    assert.ok(!ogre.hasAttribute("disabled"), "in reach, to say why");
    fireEvent(ogre, "click");
    assert.equal(toasts().at(-1), OGRE_MAX);
    assert.equal(countOf(5), null, "nothing in the cart");
    assert.equal(buyButton().textContent, "The cart is empty");
    // Money stops no +: the button says what is missing.
    for (const rowIndex of [3, 1, 2]) fireEvent(plusOf(rowIndex), "click");
    assert.deepEqual(tileValues(), ["120k", "−235k", "-115k"]);
    assert.equal(buyButton().textContent, "Not enough: 115k");
    assert.ok(buyButton().hasAttribute("disabled"));
    assert.ok(tiles()[2].classList.contains("g-market__tile--short"));
    assert.ok(!plusOf(0).hasAttribute("aria-disabled"), "a Lineman is still offered");
    // A position at its maximum with those in the cart: Bors and one more Blitzer are two of two.
    assert.equal(plusOf(3).getAttribute("aria-disabled"), "true");
    assert.equal(plusOf(3).getAttribute("title"), "Blitzer: maximum is 2.");
    fireEvent(plusOf(3), "click");
    assert.equal(countOf(3), "1");
    assert.equal(toasts().at(-1), "Blitzer: maximum is 2.");
    assert.ok(!refusalLine(), "a cart over the treasury is the button's to say");
    fireEvent(buyButton(), "click");
    await settle();
    assert.equal(patches().length, 0);
    // Fourteen on the roster, those who miss the match too (owner's Q2): every + is refused, the Ogre's for his maximum.
    const more = Array.from({ length: 7 }, (_, index) => ({ id: `n${index}`, rowIndex: 0, number: String(8 + index), name: `New ${index}` }));
    coach({ teamAnswer: team({ roster: { players: [...PLAYERS, ...more], treasury: 500 } }) });
    await renderTeamRoster("t1");
    fireEvent(hireButton(), "click");
    assert.equal(hireSheet().querySelector(".g-sheet__sub").textContent, "Human · on the roster 14 of 14 · places left: 0");
    for (const rowIndex of [0, 1, 2, 3, 4]) {
      assert.equal(plusOf(rowIndex).getAttribute("aria-disabled"), "true", rowIndex);
      assert.equal(plusOf(rowIndex).getAttribute("title"), "A Sevens roster should not exceed 14 players (currently 14).");
    }
    assert.equal(plusOf(5).getAttribute("title"), OGRE_MAX);
    fireEvent(plusOf(4), "click");
    assert.equal(toasts().at(-1), "A Sevens roster should not exceed 14 players (currently 14).");
    assert.equal(countOf(4), null);
  });
});

// The T2 review's carry: a roster saved before the rules were checked can already break a limit with nothing in the cart.
test("a roster that already breaks a position's limit says so once, and «Buy» stays shut", async () => {
  await withoutTimers(async () => {
    const twoOgres = [...PLAYERS, { id: "p8", rowIndex: 5, number: "8", name: "Brok" }];
    coach({ teamAnswer: team({ roster: { players: twoOgres, treasury: 300 } }) });
    await renderTeamRoster("t1");
    fireEvent(hireButton(), "click");
    assert.equal(refusalLine().textContent, OGRE_MAX);
    assert.equal(refusalLine().getAttribute("role"), "alert");
    assert.equal(hireSheet().querySelectorAll(".g-market__refusal").length, 1);
    assert.equal(buyButton().textContent, "The cart is empty");
    assert.ok(buyButton().hasAttribute("disabled"));
    fireEvent(plusOf(0), "click");
    assert.equal(buyButton().textContent, "Buy for 50k · players: 1", "the cart's sum, shut");
    assert.ok(buyButton().hasAttribute("disabled"));
    assert.equal(hireSheet().querySelectorAll(".g-market__refusal").length, 1, "said once");
    assert.equal(refusalLine().textContent, OGRE_MAX);
    fireEvent(buyButton(), "click");
    await settle();
    assert.equal(patches().length, 0, "the server would refuse it (POSITION_MAX blocks)");
    assert.ok(hireSheet()?.isModal);
  });
});

test("bought: one PATCH of the whole roster — the players with the next free numbers, the purchase recorded, the treasury spent — on the revision as read; the sheet closes, the coach is told, the focus on the «+»", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    assert.match(headingText("roster-heading"), /^Active roster 3$/);
    hireButton().focus();
    openCart(0, 0);
    api.reply(PATCH, 200, { team: rich({ revision: 5 }) });
    fireEvent(buyButton(), "click");
    assert.ok(!hireSheet(), "closed at once: the purchase is a step of the queue");
    assert.equal(toasts().at(-1), "Hired: Human Lineman #8, Human Lineman #9 · treasury 20k");
    assert.match(headingText("roster-heading"), /^Active roster 5$/, "drawn at once from the queue's draft");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Human Lineman 4", "Human Lineman 5"]);
    assert.ok(document.activeElement === hireButton(), "the focus on the «+»");
    await settle();
    assert.equal(patches().length, 1);
    const { body } = patches()[0];
    assert.equal(body.revision, 4);
    assert.equal(body.roster.players.length, 9);
    assert.equal(body.roster.treasury, 20);
    assert.deepEqual(body.roster.players.slice(0, 7).map((player) => player.id), PLAYERS.map((player) => player.id), "the roster as it was, then the new players");
    const hired = body.roster.players.slice(7);
    assert.deepEqual(hired.map((player) => [player.rowIndex, String(player.number), player.purchased, player.purchaseRefund]), [[0, "8", true, 50], [0, "9", true, 50]]);
    assert.ok(hired.every((player) => typeof player.id === "string" && player.id), "each with an id of his own");
    assert.notEqual(hired[0].id, hired[1].id);
    assert.equal(status(), "Saved");
    assert.equal(save.saveState("t1").waiting, 0);
    // Opened again, the cart counts the new players.
    fireEvent(hireButton(), "click");
    assert.equal(hireSheet().querySelector(".g-sheet__sub").textContent, "Human · on the roster 9 of 14 · places left: 5");
    assert.deepEqual(tileValues(), ["20k", "0", "20k"]);
    assert.equal(card(0).querySelector(".g-market__meta").textContent, "no skills · in the team 5 of 16");
    api.assertAnswered();
  });
});

// Review Focus 3 and the T4 review's carry: the queue cannot tell a second «Buy» with the same cart from a new purchase.
test("a second press on «Buy» sends nothing more", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    openCart(0);
    const buy = buyButton();
    api.reply(PATCH, 200, { team: rich({ revision: 5 }) });
    fireEvent(buy, "click");
    fireEvent(buy, "click");
    // A press the screen still hears after the sheet closed (a dialog a browser has not taken down yet) finds no sheet.
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-hire-buy", "true");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.roster.players.length, 8, "one Lineman, hired once");
    assert.match(headingText("roster-heading"), /^Active roster 4$/);
    assert.equal(toasts().filter((said) => said.startsWith("Hired:")).length, 1);
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

test("a purchase offline waits like a step: «Waiting for the network · edits: 1»", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    api.fail(PATCH);
    openCart(0);
    fireEvent(buyButton(), "click");
    await settle();
    assert.ok(!hireSheet());
    assert.equal(status(), "Waiting for the network · edits: 1");
    assert.match(headingText("roster-heading"), /^Active roster 4$/, "the purchase stays on the screen");
    assert.equal(save.saveState("t1").waiting, 1);
    api.reply(PATCH, 200, { team: rich({ revision: 5 }) });
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(status(), "Saved");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 2);
    assert.deepEqual(patches()[1].body, patches()[0].body, "the same purchase sent again: the same new player, the same id");
  });
});

test("during a preparation the sheet says what a change of the roster resets", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    gamesAre([PREP_GAME]);
    await renderTeamRoster("t1");
    openCart(0);
    const prep = hireSheet().querySelector(".g-market__prep");
    assert.equal(prep.textContent, prepResetWords());
    assert.ok(words(hireSheet()).includes("Any save of the roster, SPP included, resets the steps «Roster», «Inducements» and «Kick / receive». Fans and weather stay."));
    assert.ok(!buyButton().hasAttribute("aria-disabled"), "nothing is closed: a purchase only sends the coach back to those steps");
    assertStyled(view, ...STYLES);
  });
});

test("another tab's coach: nothing is bought, and the coach is told", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    openCart(0);
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(buyButton(), "click");
    assert.equal(refusalLine().textContent, OTHER_TAB);
    assert.equal(refusalLine().getAttribute("role"), "alert");
    assert.ok(hireSheet()?.isModal, "the sheet stays, the cart in it");
    assert.equal(countOf(0), "1");
    assert.match(headingText("roster-heading"), /^Active roster 3$/, "nothing bought");
    await settle();
    assert.equal(patches().length, 0);
    assertStyled(view, ...STYLES);
    fireEvent(plusOf(0), "click");
    assert.ok(!refusalLine(), "a refusal goes with the cart it was said of");
  });
});

// 07a's c088324 and the T4 review's carry: after a 422 whose read of the server's roster failed, a press must not only say the rule again.
test("a purchase refused after a 422 whose read failed reads the roster again; once it is read, the purchase saves", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
    api.fail(TEAM_READ);
    stepOfTheRoster();
    await settle();
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"], "the read after the refusal failed");
    const before = teamReads();
    openCart(0);
    fireEvent(buyButton(), "click");
    assert.match(refusalLine().textContent, /Ann/, "the rule that refused the queue, in the sheet");
    assert.ok(hireSheet()?.isModal);
    await settle();
    assert.equal(teamReads(), before + 1, "and the roster is read again");
    assert.equal(patches().length, 1, "the refused step, and no purchase");
    // The network is back: the press reads the server's roster, and the next one buys on it.
    api.reply(TEAM_READ, 200, { team: rich({ revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    fireEvent(buyButton(), "click");
    await settle();
    assert.equal(teamReads(), before + 2);
    assert.equal(save.saveState("t1").status, "idle", "the server's roster taken");
    assert.ok(hireSheet()?.isModal, "the sheet stays for the coach to press again");
    api.reply(PATCH, 200, { team: rich({ revision: 6 }) });
    fireEvent(buyButton(), "click");
    await settle();
    assert.ok(!hireSheet());
    assert.equal(patches().length, 2);
    assert.equal(patches()[1].body.revision, 5);
    assert.equal(patches()[1].body.roster.players.length, 8);
    assert.equal(patches()[1].body.roster.treasury, 70);
  });
});

test("a match begun while the cart is open closes it, the focus back on the «+»", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    hireButton().focus();
    openCart(0);
    plusOf(0).focus();
    gamesAre([LIVE_GAME]);
    await loadGames(true);
    await settle();
    assert.ok(!hireSheet(), "R8: nothing is bought in a match");
    assert.ok(!view.querySelector("dialog:modal"));
    assert.ok(document.activeElement === hireButton(), "the «+», where the keyboard was");
    assert.equal(hireButton().getAttribute("aria-disabled"), "true", "closed now, saying why");
    assert.equal(hireButton().getAttribute("title"), CLOSED);
    assert.equal(patches().length, 0);
  });
});

test("on a phone: no «Cancel», the + alone, a 44px target", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      coach({ teamAnswer: rich() });
      await renderTeamRoster("t1");
      openCart(0);
      assert.ok(hireSheet()?.isModal, "the same sheet, from the bottom (sheet.css)");
      assert.ok(keepButton(), "the same markup: market.css hides «Cancel» up to 900px, the cross closes it");
      assert.ok(card(1).querySelector(".g-market__add .g-market__addword"));
      assert.ok(card(0).querySelector(".g-market__stepper"));
      assertStyled(view, ...STYLES);
    });
    const phone = mediaBlock(MARKET, "max-width: 900px");
    assert.match(phone, /:is\(#roster-hire, #roster-sell\) \.g-sheet__foot-start \{\s*display: none;\s*\}/, "no «Cancel» on a phone (K7)");
    assert.match(phone, /\.g-market__addword \{\s*display: none;\s*\}/, "the + alone");
    // A phone's targets are a thumb wide (D2): the «+» a 26px circle in its 44px.
    for (const selector of [".g-roster__hire", ".g-market__add", ".g-market__step"]) {
      assert.equal(valuesOf(MARKET, selector, "width")[0], "var(--size-touch)", selector);
      assert.equal(valuesOf(MARKET, selector, "height")[0], "var(--size-touch)", selector);
    }
    assert.deepEqual(valuesOf(MARKET, ".g-roster__hire", "padding"), ["calc((var(--size-touch) - 26px) / 2)", "0"], "a 26px circle in 44px, then 24px on a desk");
    assert.deepEqual(valuesOf(MARKET, ".g-roster__hire", "background-clip"), ["content-box"]);
  });
});

// Stage 07c, Task 6: «Sell» second in the pair of actions (StatsHire/StatsLive on a phone, DeskRosterPrep/DeskRosterLive on
// a desk), the sheet that asks first (StatsSell.html, DeskRosterSell.html) and a purchase cancelled. Hal is a Catcher
// (75k) with Block (+20k) and two touchdowns (6 SPP); Ivo a Lineman bought after the last match for 50k; 120k in the treasury.
const HAL = { id: "p8", rowIndex: 2, number: "8", name: "Hal", extraSkills: [{ name: "Block", access: "primary" }], spp: { touchdowns: 2 } };
const IVO = { id: "p9", rowIndex: 0, number: "9", name: "Ivo", purchased: true, purchaseRefund: 50 };
const SALE_PLAYERS = [...PLAYERS, HAL, IVO];
/** The team of nine with 120k (`players` in place of them), on revision 4 unless `over` says. */
const forSale = (players = SALE_PLAYERS, over = {}) => team({ roster: { players, treasury: 120 }, ...over });
const without = (id, players = SALE_PLAYERS) => players.filter((player) => player.id !== id);
const SALE_MIN = "A sale cannot leave fewer than seven players on the team.";
const NOTE = "The player leaves the team for good: SPP, skills and improvements are lost. Half the player's current value comes back. Nobody can be sold while the roster has 7 players or fewer.";

const { setMyTeams } = await import("../src/data/teams.mjs");
const sellSheet = () => view.querySelector("dialog#roster-sell");
const sellIn = (root) => root.querySelector("[data-roster-sell]");
const sendButton = () => sellSheet().querySelector("[data-sell-send]");
const keepSale = () => sellSheet().querySelector("[data-sell-keep]");
const facts = () => sellSheet().querySelectorAll(".g-market__fact").map((fact) => [fact.querySelector("dt.g-market__factkey").textContent, fact.querySelector("dd.g-market__factvalue").textContent]);
const factValue = (index) => sellSheet().querySelectorAll(".g-market__fact")[index].querySelector("dd");
const flow = () => sellSheet().querySelectorAll(".g-market__flowside").map((side) => [side.querySelector(".g-market__flowlabel").textContent, side.querySelector(".g-market__flownum").textContent]);
const notes = () => sellSheet().querySelectorAll(".g-market__note").map((note) => note.textContent);
const saleRefusal = () => sellSheet().querySelector(".g-market__refusal");
/** The buttons of the pair of actions under `root` (the open row on a phone, the panel on a desk). */
const pairOf = (root) => root.querySelector(".g-roster__actions").childNodes.filter((node) => node.nodeType === 1);
/** Where a player's actions stand: his open row on a phone, the panel on a desk. */
const placeOf = (phone) => (phone ? view.querySelector(".g-rtable__panelrow") : aside());
/** The roster drawn with `key` chosen: his row open on a phone, him in the panel on a desk. */
const drawFor = async (key, { teamAnswer = forSale(), games = [] } = {}) => {
  coach({ teamAnswer, open: key });
  gamesAre(games);
  await renderTeamRoster("t1");
};

test("the action pair: «Sell» second, beside «Miss a match…» or «Back on the roster»; a fresh purchase says «Cancel purchase»", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        for (const [key, first, second] of [["p1#0", "data-roster-mark", "Sell"], ["p4#0", "data-roster-return", "Sell"], ["p9#0", "data-roster-mark", "Cancel purchase"]]) {
          await drawFor(key);
          const [one, two, ...rest] = pairOf(placeOf(phone));
          assert.equal(rest.length, 0, key);
          assert.ok(one.hasAttribute(first), `${key}: ${first} first`);
          assert.equal(two.getAttribute("data-roster-sell"), key);
          assert.equal(two.textContent, second);
          assert.equal(two.tagName, "BUTTON");
          assert.ok(two.classList.contains("g-btn"));
          assert.equal(two.getAttribute("aria-haspopup"), "dialog");
          assert.equal(two.getAttribute("data-key"), "roster-sell", "kept apart from the first when the screen is patched");
          assert.ok(!two.hasAttribute("aria-disabled"));
          // A phone opens his row alone; a desk's table opens none (the panel is drawn on both, a phone's hidden by roster.css).
          assert.equal(view.querySelectorAll("table.g-rtable [data-roster-sell]").length, phone ? 1 : 0, "only in the chosen player's place");
        }
        assertStyled(view, ...STYLES);
      });
    }
    // On a phone under «Profile and advancement» (StatsHire.html), on a desk under «Next match» (DeskRosterPrep.html).
    await withWindow({ phone: true }, async () => {
      await drawFor("p8#0");
      const panel = view.querySelector(".g-roster__rowpanel").childNodes.filter((node) => node.nodeType === 1);
      assert.ok(panel.at(-1).classList.contains("g-roster__actions"));
      assert.ok(panel.at(-2).classList.contains("g-btn--dark"), "right under the way to his page");
    });
    await drawFor("p8#0");
    const block = aside().querySelector(".g-roster__nextblock");
    assert.ok(block.childNodes.indexOf(block.querySelector(".g-roster__actions")) > block.childNodes.indexOf(block.querySelector(".g-roster__next")));
  });
});

test("in a match «Sell» stands closed beside «Injury in the match…», and says why", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("p1#0", { games: [LIVE_GAME] });
        const [injury, sell, ...rest] = pairOf(placeOf(phone));
        assert.equal(rest.length, 0);
        assert.ok(injury.hasAttribute("data-roster-injury"));
        assert.equal(injury.textContent, "Injury in the match…");
        assert.equal(sell.textContent, "Sell");
        assert.equal(sell.getAttribute("data-roster-sell"), "p1#0");
        assert.equal(sell.getAttribute("aria-disabled"), "true");
        assert.equal(sell.getAttribute("title"), CLOSED);
        assert.ok(sell.classList.contains("g-roster__closed"));
        fireEvent(sell, "click");
        assert.equal(toasts().at(-1), CLOSED);
        assert.ok(!sellSheet());
        // A purchase is sealed by the match's start: «Sell», closed, as the prototypes have it.
        fireEvent(toggle("p9#0"), "click");
        assert.equal(sellIn(placeOf(phone)).textContent, "Sell");
        // One who sits the match out: one closed «Sell», and no injury.
        fireEvent(toggle("p4#0"), "click");
        const [alone, ...more] = pairOf(placeOf(phone));
        assert.equal(more.length, 0, "Dell sits it out");
        assert.equal(alone.textContent, "Sell");
        assert.equal(alone.getAttribute("title"), CLOSED);
        // «Edit outside the match» on (K2): no injury for anyone, the one shut «Sell».
        fireEvent(toggle("p1#0"), "click");
        fireEvent(view.querySelector('[role="switch"]'), "click");
        assert.deepEqual(pairOf(placeOf(phone)).map((button) => [button.textContent, button.getAttribute("aria-disabled")]), [["Sell", "true"]]);
        assert.equal(patches().length, 0);
        assertStyled(view, ...STYLES, "toggle.css");
      });
    }
  });
});

// T6-2: the prototypes always draw the pair's two places, so a lone shut «Sell» stands in the second, on both widths.
test("a lone shut «Sell» keeps the second place of the pair", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("p4#0", { games: [LIVE_GAME] });
        const [alone, ...more] = pairOf(placeOf(phone));
        assert.equal(more.length, 0, "Dell sits the match out: no injury beside it");
        assert.equal(alone.getAttribute("data-roster-sell"), "p4#0");
        assert.equal(alone.getAttribute("aria-disabled"), "true");
      });
    }
    const lone = ".g-roster__actions > [data-roster-sell]:only-child";
    assert.deepEqual(valuesOf(MARKET, lone, "grid-column"), ["-2 / -1"], "the last column: the second of two, the only one of one");
    for (const query of ["max-width: 900px", "min-width: 901px"]) assert.ok(!mediaBlock(MARKET, query).includes(lone), `not only ${query}`);
  });
});

test("at seven players «Sell» is closed and says why; «Cancel purchase» is not", async () => {
  await withoutTimers(async () => {
    await drawFor("p1#0", { teamAnswer: forSale([...PLAYERS, IVO]) });
    assert.ok(!sellIn(aside()).hasAttribute("aria-disabled"), "eight on the roster: Ann can go");
    await drawFor("p1#0", { teamAnswer: forSale([...without("p7", PLAYERS), IVO]) });
    const sell = sellIn(aside());
    assert.equal(sell.textContent, "Sell");
    assert.equal(sell.getAttribute("aria-disabled"), "true");
    assert.equal(sell.getAttribute("title"), SALE_MIN);
    fireEvent(sell, "click");
    assert.equal(toasts().at(-1), SALE_MIN);
    assert.ok(!sellSheet());
    // The owner's Q1: a purchase is cancelled at seven too — it puts the roster back as it was before it.
    fireEvent(toggle("p9#0"), "click");
    const cancel = sellIn(aside());
    assert.equal(cancel.textContent, "Cancel purchase");
    assert.ok(!cancel.hasAttribute("aria-disabled"));
    fireEvent(cancel, "click");
    assert.ok(sellSheet()?.isModal);
    assert.ok(!sendButton().hasAttribute("aria-disabled"));
  });
});

test("the sheet on a desk: who he is, what he cost, what he gained, what he is worth, the SPP that go, half back, the treasury now and after; «Cancel» and a red «Sell for 47.5k»", async () => {
  await withoutTimers(async () => {
    await drawFor("p8#0");
    const opener = sellIn(aside());
    opener.focus();
    fireEvent(opener, "click");
    const dialog = sellSheet();
    assert.ok(dialog?.isModal, "the sheet is open, modally");
    assert.ok(!dialog.classList.contains("g-sheet--wide"), "a sheet of its own width (DeskRosterSell.html: 520px)");
    assert.equal(dialog.querySelector("h2").textContent, "Sell the player");
    assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "Hal · #8 Catcher");
    assert.ok(dialog.querySelector("dl.g-market__rows"));
    assert.deepEqual(facts(), [
      ["Hire price Catcher", "75k"], ["Skills and improvements", "+20k"], ["Current value", "95k"], ["Career SPP", "6 · lost"], ["Back to the treasury · half", "+47.5k"],
    ]);
    assert.ok(factValue(2).classList.contains("g-market__factvalue--total"));
    assert.ok(factValue(3).classList.contains("g-market__lost"));
    assert.ok(factValue(4).classList.contains("g-market__back"));
    assert.deepEqual(flow(), [["Treasury now", "120k"], ["After the sale", "167.5k"]]);
    assert.ok(dialog.querySelector(".g-market__flow .g-market__arrow"), "the arrow between them");
    assert.deepEqual(notes(), [NOTE]);
    assert.ok(!dialog.querySelector(".g-market__prep"));
    assert.ok(!saleRefusal());
    const send = sendButton();
    assert.equal(send.textContent, "Sell for 47.5k");
    assert.ok(send.classList.contains("g-btn--danger"), "the screen's one red button: a sale cannot be undone");
    assert.ok(!send.hasAttribute("disabled"));
    assert.ok(!send.hasAttribute("aria-disabled"));
    assert.equal(keepSale().textContent, "Cancel");
    assert.ok(keepSale().closest(".g-sheet__foot-start"));
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    fireEvent(keepSale(), "click");
    assert.ok(!sellSheet(), "«Cancel» closes it");
    assert.ok(document.activeElement === sellIn(aside()), "the focus back on his «Sell»");
    assert.equal(sellIn(aside()).getAttribute("data-roster-sell"), "p8#0");
    fireEvent(sellIn(aside()), "click");
    fireEvent(sellSheet(), "keydown", { key: "Escape" });
    assert.ok(!sellSheet(), "Escape too");
    await settle();
    assert.equal(patches().length, 0);
  });
});

test("the sheet on a phone: his card, the same lines, one red button", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await drawFor("p8#0");
      fireEvent(sellIn(placeOf(true)), "click");
      assert.ok(sellSheet()?.isModal, "the same sheet, from the bottom (sheet.css)");
      const who = sellSheet().querySelector(".g-market__who");
      assert.equal(who.querySelector(".g-num .g-num__n").textContent, "8");
      assert.ok(who.querySelector(".g-num--catcher"), "his number on his position's colour");
      assert.equal(who.querySelector(".g-market__whoname").textContent, "Hal");
      // StatsSell.html: his position's skills and those he gained, as his row lists them.
      assert.equal(who.querySelector(".g-market__wholine").textContent, "Catcher · 6 SPP · Catch, Dodge, Block");
      assert.equal(facts().length, 5);
      assert.equal(sellSheet().querySelectorAll("[data-sell-send]").length, 1);
      assert.ok(sendButton().classList.contains("g-btn--danger"));
      assertStyled(view, ...STYLES);
    });
    const phone = mediaBlock(MARKET, "max-width: 900px");
    const desk = mediaBlock(MARKET, "min-width: 901px");
    assert.match(desk, /\.g-market__who \{\s*display: none;\s*\}/, "no card on a desk: the sub says who");
    assert.match(phone, /:is\(#roster-hire, #roster-sell\) \.g-sheet__foot-start \{\s*display: none;\s*\}/, "no «Cancel» on a phone: the cross");
    assert.match(phone, /#roster-sell \.g-sheet__sub \{\s*display: none;\s*\}/, "no sub on a phone: the card says who");
    // As big as the sheet's main button (D2): the whole width and 52px on a phone, 44px on a desk.
    const danger = "#roster-sell .g-sheet__foot .g-btn--danger";
    assert.deepEqual(valuesOf(MARKET, danger, "width"), ["100%", "auto"]);
    assert.deepEqual(valuesOf(MARKET, danger, "height"), ["var(--size-cta)", "44px"]);
    assert.deepEqual(valuesOf(MARKET, danger, "font"), ["700 17px/1.2 var(--font-body)"]);
  });
});

test("Architect of Fate: full value and the injuries back, said so", async () => {
  await withoutTimers(async () => {
    // Tzeentch: 0 Blue Horror 30k, 1 Pink Horror 75k. Eight on the roster, so one can be sold.
    const blues = Array.from({ length: 7 }, (_, n) => ({ id: `b${n + 1}`, rowIndex: 0, number: String(n + 1), name: `Blue ${n + 1}` }));
    const pink = { id: "pink", rowIndex: 1, number: "8", name: "Pinky", nigglingInjuries: 1 };
    coach({ teamAnswer: team({ baseTeamSlug: "teams/tzeentch", roster: { players: [...blues, pink], treasury: 50 } }), fallen: [], open: "pink#0" });
    await renderTeamRoster("t1");
    fireEvent(sellIn(aside()), "click");
    assert.deepEqual(facts().at(-1), ["Back to the treasury · full value and injuries", "+85k"]);
    assert.ok(factValue(4).classList.contains("g-market__back"));
    assert.deepEqual(flow().map(([, value]) => value), ["50k", "135k"]);
    assert.deepEqual(notes(), ["The player leaves the team for good: SPP, skills and improvements are lost. Architect of Fate: the player's full value comes back, and 10k for each injury. Nobody can be sold while the roster has 7 players or fewer."]);
    assert.equal(sendButton().textContent, "Sell for 85k");
  });
});

test("a cancelled purchase: what was paid comes back in full, and its button is not red", async () => {
  await withoutTimers(async () => {
    await drawFor("p9#0");
    fireEvent(sellIn(aside()), "click");
    assert.equal(sellSheet().querySelector("h2").textContent, "Cancel the purchase");
    assert.equal(sellSheet().querySelector(".g-sheet__sub").textContent, "Ivo · #9 Human Lineman");
    assert.deepEqual(facts(), [["Bought this time for", "50k"], ["Back to the treasury", "+50k"]]);
    assert.ok(factValue(1).classList.contains("g-market__back"));
    assert.deepEqual(flow(), [["Treasury now", "120k"], ["After the cancel", "170k"]]);
    assert.deepEqual(notes(), ["This player was bought after the last match, so the full price comes back. Once a match starts the purchase cannot be cancelled."]);
    const send = sendButton();
    assert.equal(send.textContent, "Cancel and get 50k back");
    assert.ok(send.classList.contains("g-btn--primary"), "a cancel can be bought again: the sheet's main button");
    assert.ok(!send.classList.contains("g-btn--danger"));
    assertStyled(view, ...STYLES);
  });
});

test("a captain sold: the sheet says the team is left without one", async () => {
  await withoutTimers(async () => {
    await drawFor("p2#0");
    fireEvent(sellIn(aside()), "click");
    assert.ok(notes().includes("Bors is the captain: the team has none until you name another in a player's profile."));
    fireEvent(keepSale(), "click");
    fireEvent(toggle("p8#0"), "click");
    fireEvent(sellIn(aside()), "click");
    assert.deepEqual(notes(), [NOTE], "not for one who is not");
  });
});

test("during a preparation the sale's sheet says what a change of the roster resets", async () => {
  await withoutTimers(async () => {
    await drawFor("p8#0", { games: [PREP_GAME] });
    assert.ok(!sellIn(aside()).hasAttribute("aria-disabled"), "nothing is closed in a preparation");
    fireEvent(sellIn(aside()), "click");
    assert.equal(sellSheet().querySelector(".g-market__prep").textContent, prepResetWords());
    assertStyled(view, ...STYLES);
  });
});

test("sold: one PATCH without him, the treasury up by the sale, on the revision as read; the sheet closes, the coach is told, the focus on the title", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("p8#0");
        assert.match(headingText("roster-heading"), /^Active roster 5$/);
        fireEvent(sellIn(placeOf(phone)), "click");
        api.reply(PATCH, 200, { team: team({ roster: { players: without("p8"), treasury: 167.5 }, revision: 5 }) });
        fireEvent(sendButton(), "click");
        assert.ok(!sellSheet(), "closed at once: the sale is a step of the queue");
        assert.equal(toasts().at(-1), "Sold: Hal · +47.5k · treasury 167.5k");
        assert.ok(document.activeElement === view.querySelector("h1"), "his row is gone: the title");
        assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Ivo"], "drawn at once from the queue's draft");
        if (!phone) assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "the panel takes the first player (DeskRosterSell.html)");
        await settle();
        assert.equal(patches().length, 1);
        const { body } = patches()[0];
        assert.equal(body.revision, 4);
        assert.equal(body.roster.treasury, 167.5);
        assert.deepEqual(body.roster.players.map((player) => player.id), without("p8").map((player) => player.id));
        assert.equal(status(), "Saved");
        assert.equal(save.saveState("t1").waiting, 0);
      });
    }
  });
});

test("a purchase cancelled: one PATCH without him, the full price back", async () => {
  await withoutTimers(async () => {
    await drawFor("p9#0");
    fireEvent(sellIn(aside()), "click");
    api.reply(PATCH, 200, { team: team({ roster: { players: without("p9"), treasury: 170 }, revision: 5 }) });
    fireEvent(sendButton(), "click");
    assert.ok(!sellSheet());
    assert.equal(toasts().at(-1), "Purchase cancelled: Ivo · +50k · treasury 170k");
    assert.ok(document.activeElement === view.querySelector("h1"));
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.roster.treasury, 170);
    assert.deepEqual(patches()[0].body.roster.players.map((player) => player.id), without("p9").map((player) => player.id));
  });
});

// Review Focus 3: the sale is one step; a second press finds no sheet to sell from.
test("a second press on «Sell» sends nothing more", async () => {
  await withoutTimers(async () => {
    await drawFor("p8#0");
    fireEvent(sellIn(aside()), "click");
    const send = sendButton();
    api.reply(PATCH, 200, { team: team({ roster: { players: without("p8"), treasury: 167.5 }, revision: 5 }) });
    fireEvent(send, "click");
    fireEvent(send, "click");
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-sell-send", "true");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.roster.players.length, 8, "Hal, sold once");
    assert.equal(patches()[0].body.roster.treasury, 167.5);
    assert.equal(toasts().filter((said) => said.startsWith("Sold:")).length, 1);
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

// Review Focus 4 and K5: R8 — nothing is sold in a match; the focus goes back to what opened the sheet, closed now.
test("a sheet whose match began closes, and the focus goes back to his «Sell», closed now", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("p8#0");
        fireEvent(sellIn(placeOf(phone)), "click");
        sendButton().focus();
        gamesAre([LIVE_GAME]);
        await loadGames(true);
        await settle();
        assert.ok(!sellSheet(), "R8");
        assert.ok(!view.querySelector("dialog:modal"));
        const sell = sellIn(placeOf(phone));
        assert.ok(document.activeElement === sell, "Hal's «Sell», where the keyboard was");
        assert.equal(sell.getAttribute("data-roster-sell"), "p8#0");
        assert.equal(sell.getAttribute("aria-disabled"), "true");
        assert.equal(sell.getAttribute("title"), CLOSED);
        assert.equal(patches().length, 0);
      });
    }
  });
});

/** The treasury strip's write elsewhere on the page moved the team on: the roster is read again, and Hal is not on it. */
const readWithoutHal = async () => {
  const read = forSale(without("p8"), { revision: 5 });
  api.reply(TEAM_READ, 200, { team: read });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
  setMyTeams([read]);
  await settle();
};

test("a player gone from the roster as read takes his sheet with him", async () => {
  await withoutTimers(async () => {
    await drawFor("p8#0");
    fireEvent(sellIn(aside()), "click");
    assert.ok(sellSheet()?.isModal);
    sendButton().focus();
    await readWithoutHal();
    assert.equal(teamReads(), 2, "read again");
    assert.ok(!sellSheet(), "his sheet went with him");
    assert.ok(!view.querySelector("dialog:modal"));
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Ivo"]);
    // T6-1: the panel's «Sell» is one element, patched for the first player: the focus must not land on Ann's «Sell».
    assert.equal(sellIn(aside()).getAttribute("data-roster-sell"), "p1#0");
    assert.ok(document.activeElement === view.querySelector("h1"), "Hal is drawn no more: the title");
    assert.equal(patches().length, 0);
  });
});

// T6-1, the same rule for stage 07b's marks: the panel's «Miss a match…» is patched for the next player as «Sell» is.
test("a mark's sheet whose player a read took away gives the focus to the title, not to the next player's button", async () => {
  await withoutTimers(async () => {
    await drawFor("p8#0");
    fireEvent(aside().querySelector("[data-roster-mark]"), "click");
    const mark = () => view.querySelector("dialog#roster-mark");
    assert.ok(mark()?.isModal);
    mark().querySelector("[data-sheet-close]").focus();
    await readWithoutHal();
    assert.ok(!mark(), "his sheet went with him");
    assert.equal(aside().querySelector("[data-roster-mark]").getAttribute("data-roster-mark"), "p1#0");
    assert.ok(document.activeElement === view.querySelector("h1"), "Hal is drawn no more: the title, not Ann's «Miss a match…»");
    assert.equal(patches().length, 0);
  });
});

// T6-4: a player the roster stores no id for cannot be named by a save — a dead end with its own words.
test("a player with no id in the roster: «Sell» closed, and says why", async () => {
  await withoutTimers(async () => {
    const NO_ID = "This player has no id in the roster and cannot be sold. Ask the league administrator to fix the roster.";
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("#0", { teamAnswer: forSale([...SALE_PLAYERS, { rowIndex: 0, number: "10", name: "Nobody" }]) });
        const sell = sellIn(placeOf(phone));
        assert.equal(sell.getAttribute("data-roster-sell"), "#0");
        assert.equal(sell.getAttribute("aria-disabled"), "true");
        assert.equal(sell.getAttribute("title"), NO_ID);
        fireEvent(sell, "click");
        assert.equal(toasts().at(-1), NO_ID);
        assert.ok(!sellSheet());
        assert.equal(patches().length, 0);
      });
    }
  });
});

// T6-4: the screen's lock shuts «Sell» as it shuts the «+», a guard of the money's path: the matches not read yet, a
// death on its way (its answer moves the revision), another device's save to settle.
test("«Sell» is shut by the screen's lock, and says why", async () => {
  await withoutTimers(async () => {
    const shut = (words) => {
      const sell = sellIn(aside());
      assert.equal(sell.getAttribute("aria-disabled"), "true", words);
      assert.equal(sell.getAttribute("title"), words);
      fireEvent(sell, "click");
      assert.equal(toasts().at(-1), words);
      assert.ok(!sellSheet(), words);
    };
    coach({ teamAnswer: forSale() });
    const games = api.hold("GET /api/games");
    const drawing = renderTeamRoster("t1");
    await settle();
    shut("Loading the matches…");
    games.release();
    await drawing;
    await settle();
    assert.ok(!sellIn(aside()).hasAttribute("aria-disabled"), "open once the matches are read");
    // Ann marked dead: until the death has answered, nobody is sold.
    fireEvent(aside().querySelector("[data-roster-mark]"), "click");
    const mark = view.querySelector("dialog#roster-mark");
    fireEvent(mark.querySelectorAll('.g-option[role="radio"]').find((option) => option.getAttribute("data-option-value") === "dead"), "click");
    const cause = mark.querySelector("#mark-text");
    cause.focus();
    cause.value = "Foul";
    fireEvent(cause, "input");
    const death = api.hold(DEATH);
    fireEvent(mark.querySelector("[data-mark-send]"), "click");
    await settle();
    fireEvent(view.querySelector("dialog#roster-mark"), "keydown", { key: "Escape" });
    shut("Saving the mark…");
    death.release({ status: 201, body: { team: forSale(without("p1"), { revision: 5 }), fallen: died("f9", { ...PLAYERS[0] }, { cause: "Foul" }) } });
    await settle();
    fireEvent(toggle("p8#0"), "click");
    assert.ok(!sellIn(aside()).hasAttribute("aria-disabled"), "open again once it has answered");
    // Another device saved the team: the coach settles it before anything is sold.
    api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: forSale(without("p1"), { revision: 6, roster: { players: without("p1"), treasury: 999 } }) });
    fireEvent(toggle("p5#0"), "click");
    fireEvent(aside().querySelector("[data-roster-return]"), "click");
    await settle();
    fireEvent(toggle("p8#0"), "click");
    shut("The roster was changed on another device");
    assert.equal(patches().length, 1, "only the step the other device's save refused");
  });
});

test("another tab's coach: nothing is sold, and the coach is told", async () => {
  await withoutTimers(async () => {
    await drawFor("p8#0");
    fireEvent(sellIn(aside()), "click");
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(sendButton(), "click");
    assert.equal(saleRefusal().textContent, OTHER_TAB);
    assert.equal(saleRefusal().getAttribute("role"), "alert");
    assert.ok(sellSheet()?.isModal, "the sheet stays");
    assert.match(headingText("roster-heading"), /^Active roster 5$/, "Hal is still there");
    await settle();
    assert.equal(patches().length, 0);
    assertStyled(view, ...STYLES);
  });
});

// T4-1, carried to the screen: should the plan and the domain's removal ever drift (no data reaches it today), the
// press says the domain's words in the sheet instead of throwing out of the click. The drift is made by hand: the
// queue's draft swapped for an equal one whose Ivo is sealed for `removeLeaguePlayer` alone, fresh for the plan.
test("a removal the domain did not apply is said in the sheet: it stays, nothing waits, nothing is sent", async () => {
  await withoutTimers(async () => {
    await drawFor("p9#0");
    fireEvent(sellIn(aside()), "click");
    const ivo = save.trackRoster(forSale()).players.find((player) => player.id === "p9");
    Object.defineProperty(ivo, "purchased", { enumerable: true, get: () => !new Error().stack.includes("removeLeaguePlayer") });
    fireEvent(sendButton(), "click");
    assert.equal(saleRefusal().textContent, "This purchase can no longer be cancelled. Use a sale under the league rules.");
    assert.equal(saleRefusal().getAttribute("role"), "alert");
    assert.ok(sellSheet()?.isModal, "the sheet stays");
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").waiting], ["idle", 0]);
    assert.ok(toggle("p9#0"), "Ivo is still there");
    await settle();
    assert.equal(patches().length, 0);
  });
});

// The T4 review's carry (07a's c088324): after a 422 whose read of the server's roster failed, a press must not only say the rule again.
test("a sale refused after a 422 whose read failed reads the roster again; once it is read, the sale saves", async () => {
  await withoutTimers(async () => {
    await drawFor(null);
    api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
    api.fail(TEAM_READ);
    fireEvent(toggle("p5#0"), "click");
    fireEvent(aside().querySelector("[data-roster-return]"), "click");
    await settle();
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"], "the read after the refusal failed");
    const before = teamReads();
    fireEvent(toggle("p8#0"), "click");
    fireEvent(sellIn(aside()), "click");
    fireEvent(sendButton(), "click");
    assert.match(saleRefusal().textContent, /Ann/, "the rule that refused the queue, in the sheet");
    assert.ok(sellSheet()?.isModal);
    await settle();
    assert.equal(teamReads(), before + 1, "and the roster is read again");
    assert.equal(patches().length, 1, "the refused step, and no sale");
    api.reply(TEAM_READ, 200, { team: forSale(SALE_PLAYERS, { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(teamReads(), before + 2);
    assert.equal(save.saveState("t1").status, "idle", "the server's roster taken");
    assert.ok(sellSheet()?.isModal, "the sheet stays for the coach to press again");
    api.reply(PATCH, 200, { team: team({ roster: { players: without("p8"), treasury: 167.5 }, revision: 6 }) });
    fireEvent(sendButton(), "click");
    await settle();
    assert.ok(!sellSheet());
    assert.equal(patches().length, 2);
    assert.equal(patches()[1].body.revision, 5);
    assert.deepEqual(patches()[1].body.roster.players.map((player) => player.id), without("p8").map((player) => player.id));
    assert.equal(patches()[1].body.roster.treasury, 167.5);
  });
});

test("a fallen player has no «Sell»", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("fallen-f1");
        const place = placeOf(phone);
        assert.ok(place, phone ? "his row open" : "him in the panel");
        assert.ok(!place.querySelector("[data-roster-sell]"));
        assert.ok(!view.querySelector("[data-roster-sell]"));
      });
    }
  });
});

// R8 for the market (Task 7): what waited for the network when a match began is given up with the server's roster, and said.
const MARKET_DROPPED = "A match has begun, so the hires and sales that were waiting were not saved. Make them again after the post-match.";
const SPP_DROPPED = "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.";
const MARKS_DROPPED = "A match has begun, so the missed-match marks that were waiting were not saved (1). Make them again after the post-match.";
const markSheet = () => view.querySelector("dialog#roster-mark");
const markOption = (code) => markSheet().querySelectorAll('.g-option[role="radio"]').find((card) => card.getAttribute("data-option-value") === code);
const markStat = (stat) => markSheet().querySelectorAll('[data-chip-group="mark-stat"] .g-chip').find((chip) => chip.getAttribute("data-chip-value") === stat);
const warnings = () => toasts().filter((said) => said.startsWith("A match has begun"));
/** A match begins on another device while the coach's steps wait: the games say so, and `server` is the roster the server holds. */
const matchBegins = async (server) => {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
};
/** Ann's «+» on touchdowns in her open row (a phone's: a desk has no counters outside a match). */
const stepForAnn = async () => {
  fireEvent(openRow().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]'), "click");
  await settle();
};

test("a hire and a sale that waited for the network are given up when a match begins, and the coach is told", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    api.fail(PATCH);
    openCart(0);
    fireEvent(buyButton(), "click");
    await settle();
    assert.equal(status(), "Waiting for the network · edits: 1");
    assert.equal(namesIn(tables()[0]).length, 4, "the new Lineman is drawn at once");
    await matchBegins(rich({ revision: 5 }));
    assert.equal(toasts().at(-1), MARKET_DROPPED);
    assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
    assert.deepEqual(warnings(), [MARKET_DROPPED], "neither SPP nor marks waited");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"], "the server's roster");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
    // A sale.
    await drawFor("p8#0");
    fireEvent(sellIn(aside()), "click");
    api.fail(PATCH);
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(status(), "Waiting for the network · edits: 1");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Ivo"], "Hal is gone from the screen");
    await matchBegins(forSale(SALE_PLAYERS, { revision: 5 }));
    assert.equal(toasts().at(-1), MARKET_DROPPED);
    assert.deepEqual(warnings(), [MARKET_DROPPED]);
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Hal", "Ivo"], "the server's roster: Hal is still his");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
  });
});

test("SPP, a mark and a hire given up together: each in its own words, SPP first", async () => {
  await withWindow({ phone: true }, async () => withoutTimers(async () => {
    coach({ teamAnswer: rich(), open: "p1#0" });
    await renderTeamRoster("t1");
    api.fail(PATCH);
    await stepForAnn();
    fireEvent(openRow().querySelector("[data-roster-mark]"), "click");
    fireEvent(markOption("lasting"), "click");
    fireEvent(markStat("ma"), "click");
    fireEvent(markSheet().querySelector("[data-mark-send]"), "click");
    await settle();
    openCart(0);
    fireEvent(buyButton(), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 3);
    const tried = patches().length;
    await matchBegins(rich({ revision: 5 }));
    assert.deepEqual(warnings(), [SPP_DROPPED, MARKS_DROPPED, MARKET_DROPPED]);
    assert.deepEqual(toasts().slice(-3), [SPP_DROPPED, MARKS_DROPPED, MARKET_DROPPED]);
    for (const output of document.querySelectorAll("output").slice(-3)) assert.match(output.className, /toast-error/);
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, tried, "the tries before the network went, and none in the match");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"], "the server's roster");
  }));
});

test("a match begun with no hire or sale waiting says nothing of them", async () => {
  await withWindow({ phone: true }, async () => withoutTimers(async () => {
    // Only a step of SPP waits; another device hired meanwhile, and that is not the coach's to be told of (the count never passes what waited).
    coach({ teamAnswer: rich(), open: "p1#0" });
    await renderTeamRoster("t1");
    api.fail(PATCH);
    await stepForAnn();
    assert.equal(save.saveState("t1").waiting, 1);
    await matchBegins(rich({ roster: { players: [...PLAYERS, IVO], treasury: 70 }, revision: 5 }));
    assert.deepEqual(warnings(), [SPP_DROPPED]);
    assert.equal(save.saveState("t1").waiting, 0);
    // Nothing waits at all: a match begins and nothing is said.
    coach({ teamAnswer: rich(), open: "p1#0" });
    await renderTeamRoster("t1");
    await matchBegins(rich({ roster: { players: [...PLAYERS, IVO], treasury: 70 }, revision: 5 }));
    assert.deepEqual(warnings(), []);
  }));
});

test("the name and the skills are text", async () => {
  await withoutTimers(async () => {
    const hostile = { ...HAL, name: HOSTILE, extraSkills: [{ name: HOSTILE, access: "primary" }] };
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await drawFor("p8#0", { teamAnswer: forSale([...PLAYERS, hostile, IVO]) });
        fireEvent(sellIn(placeOf(phone)), "click");
        assert.equal(sellSheet().querySelector(".g-sheet__sub").textContent, `${HOSTILE} · #8 Catcher`);
        assert.equal(sellSheet().querySelector(".g-market__whoname").textContent, HOSTILE);
        assert.match(sellSheet().querySelector(".g-market__wholine").textContent, /Catch, Dodge, <img src=x onerror="alert\(1\)"> & 'Grak'$/);
        assert.ok(!view.querySelector("img"));
        assert.ok(!view.querySelector("[onerror]"));
        assertCspSafe(view);
        api.reply(PATCH, 200, { team: team({ roster: { players: without("p8"), treasury: 167.5 }, revision: 5 }) });
        fireEvent(sendButton(), "click");
        assert.equal(toasts().at(-1), `Sold: ${HOSTILE} · +47.5k · treasury 167.5k`);
        assert.ok(!view.querySelector("img"));
        await settle();
      });
    }
  });
});

// K6: D2's compact sizes from 901px, as DeskRosterHire.html and DeskRosterSell.html draw them, never under 24px.
test("D2: the market's compact controls on a desk are the prototype's and 24px or more", () => {
  const desk = mediaBlock(MARKET, "min-width: 901px");
  const px = (value) => Number(String(value).replace(/px$/, ""));
  const sizes = [
    [/\.g-roster__hire \{[^}]*width: (\d+)px;[^}]*height: (\d+)px;/, [24, 24], "the «+»"],
    [/\.g-market__add \{[^}]*min-height: (\d+)px;/, [40], "«+ To the cart»"],
    [/\.g-market__step \{[^}]*width: (\d+)px;[^}]*height: (\d+)px;/, [36, 36], "the stepper's buttons"],
    [/:is\(#roster-hire, #roster-sell\) \.g-sheet__foot \.g-btn \{[^}]*min-height: (\d+)px;/, [44], "the foot's buttons"],
    [/#roster-sell \.g-sheet__foot \.g-btn--danger \{[^}]*height: (\d+)px;/, [44], "the sale's red button, as tall as «Cancel»"],
  ];
  for (const [rule, want, what] of sizes) {
    const found = desk.match(rule);
    assert.ok(found, what);
    assert.deepEqual(found.slice(1).map(px), want, what);
    for (const value of found.slice(1)) assert.ok(px(value) >= 24, `${what}: ${value}px`);
  }
});

test("every key the new files ask for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/team/roster/market.mjs", "src/screens/team/roster/hire-sheet.mjs", "src/screens/team/roster/sell-sheet.mjs", "src/screens/team/roster/panel.mjs");
});

// R1: whole races are women (Amazons), so the stage's words never say he or she of a player: «Продан: Linewoman Five» is not said.
test("the stage's words assume no player's gender, in either language", () => {
  const gendered = {
    en: /\b(he|him|his|she|her|hers)\b/i,
    ru: /(?<![а-яё])(он|она|его|её|ему|ей|продан|продана|куплен|куплена)(?![а-яё])/iu,
  };
  for (const [locale, pattern] of Object.entries(gendered)) {
    const words = JSON.parse(text(`src/i18n/${locale}.json`));
    const stage = Object.entries(words).filter(([key]) => /^teamRoster\.(hire|sell|market)\./.test(key));
    assert.ok(stage.length > 50, locale);
    assert.deepEqual(stage.filter(([, value]) => pattern.test(value)), [], locale);
  }
});

test("everything drawn is styled, and the cart's colours are readable", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: rich() });
    await renderTeamRoster("t1");
    openCart(0, 0, 5, 3, 3);
    assert.ok(hireSheet().querySelector(".g-market__lines"));
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    const css = text(MARKET);
    assert.doesNotMatch(css, /\bstyle\s*=/);
    assert.doesNotMatch(css, /--focus-ring/);
    const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
    assert.ok(queries.length >= 2 && queries.every((query) => query === "(max-width: 900px)" || query === "(min-width: 901px)"), `only the stage's two breakpoints: ${queries}`);
    // Each new block says its font, border, background, case, spacing and weight (the 2.x globals outlive it, stage 13).
    for (const selector of [".g-market__label", ".g-market__value", ".g-market__name", ".g-market__price", ".g-market__stats", ".g-market__meta", ".g-market__numbers", ".g-market__refusal", ".g-market__prep", ".g-market__lines"]) {
      for (const property of ["font", "letter-spacing", "text-transform"]) assert.equal(valuesOf(MARKET, selector, property).length, 1, `${selector} ${property}`);
    }
    assertReadable(MARKET, ".g-market__tile--short .g-market__value", "color", ["--danger-tint"], 4.5);
    assertReadable(MARKET, ".g-market__value", "color", ["--surface-2", "--accent-tint"], 4.5);
    assertReadable(MARKET, ".g-market__label", "color", ["--surface-2", "--accent-tint", "--danger-tint"], 4.5);
    assertReadable(MARKET, ".g-market__price", "color", ["--surface", "--accent-tint-soft"], 4.5);
    assertReadable(MARKET, ".g-market__meta", "color", ["--surface", "--accent-tint-soft"], 4.5);
    assertReadable(MARKET, ".g-market__stats", "color", ["--surface", "--accent-tint-soft"], 4.5);
    assertReadable(MARKET, ".g-market__name", "color", ["--surface", "--accent-tint-soft"], 4.5);
    assertReadable(MARKET, ".g-market__letter", "color", ["--pos-lineman", "--pos-big", "--pos-thrower", "--pos-catcher", "--pos-blitzer"], 4.5);
    assertReadable(MARKET, ".g-market__add", "color", ["--surface", "--accent-tint-soft"], 4.5);
    assertReadable(MARKET, ".g-market__count", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__lines", "color", ["--surface-2"], 4.5);
    assertReadable(MARKET, ".g-market__numbers", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__prep", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__refusal", "color", ["--surface"], 4.5);
    // 07c's market.css after the fidelity pass's frame.css (K3), last of all.
    assert.ok(text("src/styles.css").trimEnd().endsWith(['frame.css', 'market.css'].map((name) => `@import url("screens/team/roster/${name}");`).join("\n")));
  });
});

test("the sale's sheet is styled, and its colours are readable", async () => {
  await withoutTimers(async () => {
    await drawFor("p2#0", { games: [PREP_GAME] });
    fireEvent(sellIn(aside()), "click");
    assert.ok(sellSheet().querySelector(".g-market__prep"));
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    await withWindow({ phone: true }, async () => {
      await drawFor("p9#0");
      fireEvent(sellIn(placeOf(true)), "click");
      assertStyled(view, ...STYLES);
    });
    for (const selector of [".g-market__whoname", ".g-market__wholine", ".g-market__rows", ".g-market__factkey", ".g-market__factvalue", ".g-market__flow", ".g-market__flowlabel", ".g-market__flownum", ".g-market__note"]) {
      for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(MARKET, selector, property).length >= 1, `${selector} ${property}`);
    }
    assertReadable(MARKET, ".g-market__whoname", "color", ["--surface-2"], 4.5);
    assertReadable(MARKET, ".g-market__wholine", "color", ["--surface-2"], 4.5);
    assertReadable(MARKET, ".g-market__factkey", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__factvalue", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__lost", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__back", "color", ["--surface"], 4.5);
    assertReadable(MARKET, ".g-market__flow", "color", ["--accent-tint"], 4.5);
    assertReadable(MARKET, ".g-market__note", "color", ["--surface"], 4.5);
    // StatsSell.html and DeskRosterSell.html: the numbers of the flow 26px on a phone, 28px on a desk; the note 12px, then 13px.
    assert.deepEqual(valuesOf(MARKET, ".g-market__flownum", "font-size"), ["28px"]);
    assert.deepEqual(valuesOf(MARKET, ".g-market__flownum", "font"), ["700 26px/normal var(--font-display)"]);
    assert.deepEqual(valuesOf(MARKET, ".g-market__note", "font-size"), ["13px"]);
    assert.deepEqual(valuesOf(MARKET, ".g-market__note", "font"), ["400 12px/1.45 var(--font-body)"]);
  });
});

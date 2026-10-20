import assert from "node:assert/strict";
import test from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PLAYERS, STYLES, api, coach, loadGames, playerPage, renderTeamRoster, save, settle, state, text, view, withPlayers,
} from "./helpers/roster-page.mjs";

const { DICE_PURPOSES } = await import("../src/domain/roster/dice.mjs");

// Stage 07d, Task 10: the advancement's two rolled types. A random primary skill — on the category's column of the Skill
// Table — and a characteristic improvement — the D8 — are rolled on the site (`POST …/rolls`, asked once: asking again
// gives the same roll back) or at the table. Declared first, then rolled: once a roll is made on the site the type, the
// category and the way are fixed. A skill may be taken in place of the characteristic. Each take is one step of the save
// queue, naming the site roll as `roll: {id, via: "site"}`. The page, the coach and his team are helpers/roster-page.mjs's:
// Ann 1 (a Lineman: General primary), Cade 3 (a Catcher: Agility and General).
// Owner's review (2026-10-20), Task 21: a random skill is two D16s. On the site the pair — two cards, the die and its skill
// — of which the coach takes one; at the table the coach marks the two faces the dice showed, and the marked pair is the
// same two cards. No attempts are shown, and there is no die to roll once the pair is in.
// Prototypes: Adv3Random, Adv3Stat, Adv3StatTable on a phone; DeskRosterAdv, DeskRosterAdvStat on a desk; the pair's card
// is Adv3Stat's (the owner's answer: the prototypes show one result).

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const ROLLS = "src/screens/team/roster/rolls.css";
const ADVANCE = "src/screens/team/roster/advance.css";
const ROLL_STYLES = [...STYLES, "option-card.css", "die.css", "segmented-control.css"];
const ask = (id) => `POST /api/teams/t1/players/${id}/rolls`;

const GENERAL = ["Block", "Dauntless", "Fend", "Frenzy", "Kick", "Pro", "Steady Footing", "Strip Ball", "Sure Hands", "Tackle", "Taunt", "Wrestle",
  "Offensive", "Elvenball", "Shadowing", "Thick Skull"];
/**
 * Ann's random skill as the server answers it (two dice, Task 20): the first die came up Block — Ann has it — and was
 * rolled again, to Frenzy; the second came up Frenzy — the first die's — and was rolled again, to Strip Ball.
 */
const ROLL_SKILL = {
  id: "r1", playerId: "p1", purpose: "random_skill", params: { category: "General", candidates: GENERAL, sides: 16, captain: false },
  result: {
    dice: [
      { attempts: [{ roll: 1, skill: "Block", duplicate: true }, { roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" },
      { attempts: [{ roll: 4, skill: "Frenzy", duplicate: false, twin: true }, { roll: 8, skill: "Strip Ball", duplicate: false }], skill: "Strip Ball" },
    ],
  },
  usedAt: null,
};
/** The same two skills for Cade, rolled again past nothing. */
const CADE_ROLL = {
  ...ROLL_SKILL, playerId: "p3",
  result: { dice: [{ attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }, { attempts: [{ roll: 8, skill: "Strip Ball", duplicate: false }], skill: "Strip Ball" }] },
};
/** Ann's D8: a 3 — AR, MA or PA. */
const ROLL_D8 = { ...ROLL_SKILL, id: "r2", purpose: "stat", params: { sides: 8 }, result: { roll: 3, stats: ["ar", "ma", "pa"] } };
const BLOCK = { name: "Block", access: "primary" };
const FRENZY = { name: "Frenzy", access: "primary" };
const STRIP_BALL = { name: "Strip Ball", access: "primary" };
/** Ann with Block of her own (the roll was rolled again past it, and holds it) and 30 SPP. */
const ANN = { ...PLAYERS[0], spp: { touchdowns: 10 }, extraSkills: [BLOCK] };
const CADE = { ...PLAYERS[2], spp: { touchdowns: 10 } };
/** A random advancement Ann took at the table for Frenzy: one of the pair's skills is hers since. */
const AT_TABLE = { type: "random", grants: { skill: "Frenzy" }, roll: { via: "table" } };

const WORDS = {
  hint: "Two D16s on the league's Skill Table, each a skill the player lacks, and different: the coach takes one of the two. A blank face, a skill the player has and the first die's skill are rolled again.",
  site: "The site rolls both dice and keeps the result — no rerolling it",
  siteDie: "The site rolls the die and keeps the result — no rerolling it",
  table: "Mark the two skills the dice showed",
  tableOne: "Mark the skill the die showed",
  tableD8: "Choose what the D8 showed",
  rolledSite: "Rolled on the site · the result is kept and seen in the player's history",
  rolledTable: "Rolled at the table · the history will say «at the table»",
  kept: "The roll stays the player's: close this now, and the next advancement of this type takes the same roll",
  lost: "The roll's answer did not come: press again — the site gives the same roll back",
  waitingStat: "A D8 for a characteristic waits for this player: take «Characteristic improvement» first — the site gives that roll back",
  stale: "Came up: Frenzy, Strip Ball — the player has it all already: the roll cannot be taken. Take a skill off, or take this advancement at the table.",
  rerolled: "This roll was rolled again past Block, which the player has no more: give the skill back before taking the roll, or take this advancement at the table.",
  held: "has it already",
  pickPair: "Choose the skill to take",
  pickFace: "Mark what came up",
  marksFull: "Each die is marked — take a mark off first",
  waitSave: "Wait until your edits are saved",
  afterPost: "Advancement — after the post-match",
  d8Table: "1: AR · 2: AR/PA · 3–4: AR/MA/PA · 5: MA/PA · 6: AG/MA · 7: AG/ST · 8: any",
};

const patches = () => api.calls.filter(({ key }) => key === PATCH);
const asks = (id = "p1") => api.calls.filter(({ key }) => key === ask(id));
/** The advancements of `id` that each PATCH sent. */
const sentOf = (id) => patches().map((call) => call.body.roster.players.find((player) => player.id === id).advancements ?? []);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const sheet = () => view.querySelector("dialog#player-advance");
const advance = () => view.querySelector("[data-player-advance]");
const typeCard = (type) => sheet().querySelector(`.g-options [data-option-value="${type}"]`);
const types = () => sheet().querySelectorAll(".g-options [data-option-value]");
const categories = () => sheet().querySelectorAll("[data-advance-category]");
const category = (name) => sheet().querySelector(`[data-advance-category="${name}"]`);
const skill = (name) => sheet().querySelector(`[data-advance-skill="${name}"]`);
const next = () => sheet().querySelector("[data-advance-next]");
const take = () => sheet().querySelector("[data-advance-take]");
const rollButton = () => sheet().querySelector("[data-advance-roll]");
const title = () => sheet().querySelector("h2").textContent;
const sub = () => sheet().querySelector(".g-sheet__sub")?.textContent ?? null;
const dots = () => sheet().querySelector(".g-steps")?.getAttribute("aria-label") ?? null;
const back = () => sheet().querySelector("[data-sheet-back]");
/** The sheet's own last refusal, under the steps (advance-sheet.mjs's lines); the roll's lines are `lines()`. */
const refusal = () => sheet().querySelector(".g-advance__lines .g-player-sheet__refusal")?.textContent ?? null;
const done = () => sheet().querySelector(".g-advance__done");
const doneWords = () => [done().querySelector(".g-advance__donetitle").textContent, done().querySelector(".g-advance__how").textContent];
const tiles = () => done().querySelectorAll(".g-advance__tile dd").map((tile) => tile.textContent);
const summary = () => sheet().querySelector(".g-advance__summary").textContent;
const switchOf = () => sheet().querySelector('[data-seg-group="advance-via"]');
const way = (value) => switchOf().querySelector(`[data-seg-value="${value}"]`);
const ways = () => switchOf().querySelectorAll('[role="radio"]');
const note = () => sheet().querySelector(".g-advance__note").textContent;
const dieValue = () => sheet().querySelector(".g-die__value").textContent;
const result = () => sheet().querySelector(".g-advance__result").textContent;
const faces = () => sheet().querySelectorAll("[data-advance-face]");
const face = (number) => sheet().querySelector(`[data-advance-face="${number}"]`);
const faceName = (number) => face(number).querySelector(".g-advance__facename").textContent;
/** The faces the coach has marked at the table, in the column's order. */
const marked = () => faces().filter((item) => item.getAttribute("aria-pressed") === "true").map((item) => item.getAttribute("data-advance-face"));
/** The pair's cards (the owner's answer): a radio group, one card a die. */
const pairGroup = () => sheet().querySelector(".g-advance__pair");
const pair = () => sheet().querySelectorAll("[data-advance-pick]");
const pick = (name) => sheet().querySelector(`[data-advance-pick="${name}"]`);
/** What a part of a card shows: «—» of a die with no skill, read to a screen reader as «no skill». */
const shown = (node) => node.querySelector('[aria-hidden="true"]')?.textContent ?? node.textContent;
/** Each card as it reads: its die's face, its skill. */
const pairWords = () => pair().map((card) => [card.querySelector(".g-die__value").textContent, shown(card.querySelector(".g-advance__pickname"))]);
const picked = () => pair().filter((card) => card.getAttribute("aria-checked") === "true").map((card) => card.getAttribute("data-advance-pick"));
const d8 = (number) => sheet().querySelector(`[data-advance-d8="${number}"]`);
const stat = (key) => sheet().querySelector(`[data-advance-stat="${key}"]`);
const statWords = () => sheet().querySelectorAll("[data-advance-stat]").map((item) => [item.querySelector(".g-advance__statkey").textContent, item.querySelector(".g-advance__statchange").textContent]);
const instead = () => sheet().querySelector("[data-advance-instead]");
const bind = () => sheet().querySelector("[data-advance-bind]");
/** What the sheet says of the roll, in the player sheets' refusal line (T8; fix round 1, I3). */
const lines = () => sheet().querySelectorAll(".g-advance__roll .g-player-sheet__refusal").map((line) => line.textContent);
const columns = () => sheet().querySelectorAll(".g-advance__col");
const heads = () => columns().map((column) => column.querySelector(".g-advance__coltitle").textContent);
const closed = (element) => element.getAttribute("aria-disabled") === "true";
const isHeld = (element) => element.getAttribute("class").includes("g-advance__face--held");
const isHit = (element) => element.getAttribute("class").includes("g-advance__face--hit");
/** t1 on the server with one player in place of his own line. */
const withOne = (player, over = {}) => withPlayers(PLAYERS.map((each) => (each.id === player.id ? player : each)), over);
/** The answer to a 409 of the server, as api.mjs reads it. */
const refused = (code, params = {}) => ({ error: { code, params, message: code } });

/** The advancement open for `id`: on a phone from «Advancement» in his profile, on a desk from «Advance» in the panel. */
async function openAdvance(phone, { id = "p1", teamAnswer = withOne(ANN), games = [] } = {}) {
  coach({ teamAnswer, open: phone ? null : `${id}#0` });
  gamesAre(games);
  if (phone) await playerPage(id);
  else await renderTeamRoster("t1");
  fireEvent(advance(), "click");
}

const choose = (element) => fireEvent(element, "click");
const press = (element) => fireEvent(element, "click");

/** On a phone: «Random primary skill», «Next», the category, «Next». */
function toRandom(categoryName) {
  choose(typeCard("random"));
  press(next());
  choose(category(categoryName));
  press(next());
}

/** On a desk: «Random primary», the category — the roll in the third column. */
function toRandomDesk(categoryName) {
  choose(typeCard("random"));
  choose(category(categoryName));
}

/** On a phone: «Characteristic improvement», «Next». */
function toStat() {
  choose(typeCard("stat"));
  press(next());
}

/** «Roll two D16» or «Roll D8» pressed with the server's answer `answer`, and the answer taken. */
async function rollWith(id, status, body) {
  api.reply(ask(id), status, body);
  press(rollButton());
  await settle();
}

/** A match begins on another device: the games say so, and `server` is the roster the server holds. */
async function matchBegins(server) {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
}

// The owner's answer (2026-10-20, decisions 37 and 39): «two good ones, choose» — Adv3Random's die and result twice, in
// Adv3Stat's card; the sixteen faces stay under them, both that came up on the accent; no attempts anywhere.
test("a random skill on the site: declared, then two dice — two skills the player lacks, both faces on the table, no attempts; one of the two is taken", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      choose(typeCard("random"));
      press(next());
      assert.equal(sheet().querySelector(".g-advance__hint").textContent, WORDS.hint);
      choose(category("General"));
      press(next());
      // Declared: the type and the category; the way, the pair not rolled, the column of the category.
      assert.equal(title(), "Random skill");
      assert.equal(sub(), "General · 3 SPP");
      assert.equal(dots(), "Step 3 of 3");
      assert.ok(back(), "before the roll the way back is open");
      assert.equal(switchOf().getAttribute("role"), "radiogroup");
      assert.equal(switchOf().getAttribute("aria-label"), "How it is rolled");
      assert.deepEqual(ways().map((item) => [item.textContent, item.getAttribute("aria-checked")]), [["Roll on the site", "true"], ["Rolled at the table", "false"]]);
      assert.ok(ways().every((item) => !closed(item)));
      assert.equal(note(), WORDS.site);
      assert.deepEqual(pairWords(), [["?", "—"], ["?", "—"]], "two dice, not rolled");
      assert.ok(pair().every((card) => closed(card) && card.getAttribute("title") === WORDS.site), "nothing to choose before the roll");
      assert.ok(pair().every((card) => card.querySelector(".g-die__type").textContent === "D16"));
      // An empty card says to a screen reader that its die is not rolled yet, and the title why: no «no skill» (M5).
      assert.ok(pair().every((card) => card.querySelector(".g-die").getAttribute("aria-label") === "D16: not rolled yet" && !card.querySelector(".g-sr-only")));
      assert.equal(result(), "Two D16s on the category's table");
      assert.equal(faces().length, 16);
      assert.ok(faces().every((item) => item.tagName === "LI"), "on the site the faces only show");
      assert.equal(rollButton().textContent, "Roll two D16");
      assert.ok(!take(), "nothing to take before the roll");
      // Rolled: one ask, two dice.
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(asks().map(({ body }) => body), [{ purpose: "random_skill", category: "General" }]);
      assert.equal(pairGroup().getAttribute("role"), "radiogroup");
      assert.equal(pairGroup().getAttribute("aria-label"), "The skills rolled");
      assert.deepEqual(pairWords(), [["4", "Frenzy"], ["8", "Strip Ball"]]);
      assert.deepEqual(picked(), [], "neither chosen");
      assert.ok(pair().every((card) => !closed(card)));
      assert.equal(pick("Frenzy").getAttribute("tabindex"), "0");
      assert.equal(result(), WORDS.pickPair);
      assert.equal(take().textContent, WORDS.pickPair);
      assert.ok(take().hasAttribute("disabled"), "nothing to take until one is chosen");
      // The sixteen faces of General: Block hers and struck through, the faces the two dice came up on the accent.
      assert.equal(sheet().querySelector(".g-advance__faces").tagName, "UL");
      assert.deepEqual(faces().map((item) => item.querySelector(".g-advance__facenum").textContent), Array.from({ length: 16 }, (_, at) => String(at + 1)));
      assert.equal(faceName(1), "Block");
      assert.deepEqual(faces().filter(isHeld).map((item) => item.getAttribute("data-advance-face")), ["1"]);
      assert.deepEqual(faces().filter(isHit).map((item) => item.getAttribute("data-advance-face")), ["4", "8"]);
      assert.equal(face(1).querySelector(".g-sr-only").textContent, WORDS.held);
      assert.equal(face(8).querySelector(".g-sr-only").textContent, "rolled");
      // No attempts anywhere (the owner's answer).
      assert.ok(!sheet().querySelector("[data-advance-attempts]") && !sheet().querySelector(".g-advance__attemptlist"));
      assert.equal(note(), WORDS.rolledSite);
      // Fixed: the way, and no way back (decision 9); the roll stays hers, and the sheet says so; nothing left to roll.
      assert.ok(ways().every(closed));
      assert.ok(ways().every((item) => item.getAttribute("title") === WORDS.kept));
      assert.ok(!back());
      assert.equal(sheet().querySelector(".g-advance__kept").textContent, WORDS.kept);
      assert.ok(!rollButton());
      press(way("table"));
      assert.equal(toasts().at(-1), WORDS.kept);
      assert.equal(way("site").getAttribute("aria-checked"), "true");
      // One of the two.
      choose(pick("Strip Ball"));
      assert.deepEqual(picked(), ["Strip Ball"]);
      assert.equal(result(), "Strip Ball");
      assert.equal(take().textContent, "Take: Strip Ball");
      assert.ok(!take().hasAttribute("disabled") && !closed(take()));
      assertCspSafe(view);
      assertStyled(view, ...ROLL_STYLES);
      const taken = { type: "random", grants: { skill: "Strip Ball" }, roll: { id: "r1", via: "site" } };
      api.reply(PATCH, 200, { team: withOne({ ...ANN, extraSkills: [BLOCK, STRIP_BALL], advancements: [taken] }, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["Strip Ball", "Random primary skill · General · rolled on the site"]);
      assert.deepEqual(tiles(), ["−3", "+20k", "1 / 6"]);
      await settle();
      assert.deepEqual(sentOf("p1"), [[taken]], "one PATCH, the roll named by its id");
      assert.equal(asks().length, 1);
    });
  });
});

// DeskRosterAdv and the owner's answer (decision 37; plan 07d's decision 9 changed): the pair in the third column,
// «Roll two D16» under it until the roll, and none after it — nor at the table.
test("on a desk the pair stands in the third column; after the roll there is no «Roll two D16», nor at the table", async () => {
  await withoutTimers(async () => {
    await openAdvance(false);
    toRandomDesk("General");
    assert.deepEqual(heads(), ["1 · Type", "2 · Category", "3 · Skill roll"]);
    const third = columns()[2];
    assert.equal(third.querySelectorAll("[data-advance-pick]").length, 2);
    assert.equal(third.querySelector("[data-advance-roll]").textContent, "Roll two D16");
    // The result and the button under it, 6 apart as DeskRosterAdv's side column (M10).
    assert.deepEqual(third.querySelector(".g-advance__outcome").childNodes.map((child) => child.getAttribute("class")), ["g-advance__result", "g-btn g-btn--primary"]);
    assert.equal(take().textContent, "Roll first");
    assert.ok(take().hasAttribute("disabled"));
    rollButton().focus();
    await rollWith("p1", 200, { roll: ROLL_SKILL });
    assert.ok(!rollButton(), "no roll button once the pair is in");
    assert.ok(document.activeElement === pick("Frenzy"), "the focus on the card it enters on, not lost with the button (M1)");
    assert.deepEqual(pairWords(), [["4", "Frenzy"], ["8", "Strip Ball"]]);
    assert.ok(columns()[2].querySelector(".g-advance__pair"));
    assert.ok(!sheet().querySelector("[data-advance-attempts]"));
    // The type and the category are fixed, each saying why — kept, not refused (fidelity F2): each card marked so
    // (advance.css keeps the chosen one's look, and no sub line red), with its own sub line.
    assert.ok(types().every(closed), "every type closed once the roll is made");
    assert.equal(typeCard("random").getAttribute("aria-checked"), "true");
    assert.equal(typeCard("primary").getAttribute("title"), WORDS.kept);
    assert.ok(types().every((card) => card.hasAttribute("data-advance-kept") && card.hasAttribute("data-roster-closed")));
    assert.deepEqual(types().map((card) => card.querySelector(".g-option__sub").textContent),
      ["General · +20k", "General · +20k", "Agility, Strength, Devious · +40k", "D8 roll · +10–50k"]);
    assert.ok(categories().every(closed));
    assert.ok(ways().every(closed));
    press(typeCard("primary"));
    assert.equal(toasts().at(-1), WORDS.kept);
    assert.equal(typeCard("random").getAttribute("aria-checked"), "true", "nothing changed");
    assert.equal(summary(), "Random primary · General — 3 SPP");
    assert.equal(take().textContent, WORDS.pickPair);
    choose(pick("Frenzy"));
    assert.equal(summary(), "Random primary · General · Frenzy — 3 SPP", "the type short, as DeskRosterAdv's summary (fidelity F3)");
    assert.equal(take().textContent, "Take: Frenzy");
    assertStyled(view, ...ROLL_STYLES);
    // A desk's done line names the type short, as DeskRosterAdv's does, and how the roll was made (fidelity F3).
    const taken = { type: "random", grants: { skill: "Frenzy" }, roll: { id: "r1", via: "site" } };
    api.reply(PATCH, 200, { team: withOne({ ...ANN, extraSkills: [BLOCK, FRENZY], advancements: [taken] }, { revision: 5 }) });
    press(take());
    assert.deepEqual(doneWords(), ["Ann gets Frenzy", "Random primary · General · rolled on the site · −3 SPP · value +20k"]);
    await settle();
    assert.deepEqual(sentOf("p1"), [[taken]]);
    assert.equal(asks().length, 1);
    // At the table: no roll button at all.
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    toRandomDesk("Agility");
    assert.ok(rollButton());
    choose(way("table"));
    assert.ok(!rollButton(), "the dice are the table's");
    assert.equal(take().textContent, WORDS.pickFace);
    assert.ok(take().hasAttribute("disabled"));
    assertStyled(view, ...ROLL_STYLES);
  });
});

// T21 re-review N1 (the round's final wave): the focus goes to what came up only from where the press left it.
test("on a desk, a focus the coach moved while the roll was out stays where it was put", async () => {
  await withoutTimers(async () => {
    for (const [type, answer, entry] of [["random", { roll: ROLL_SKILL }, () => pick("Frenzy")], ["stat", { roll: ROLL_D8 }, () => stat("ar")]]) {
      await openAdvance(false);
      if (type === "random") toRandomDesk("General");
      else choose(typeCard("stat"));
      const gate = api.hold(ask("p1"));
      rollButton().focus();
      press(rollButton());
      await settle();
      typeCard("primary").focus();
      gate.release({ status: 200, body: answer });
      await settle();
      assert.ok(!rollButton() && entry(), `${type}: the roll is in`);
      assert.ok(document.activeElement === typeCard("primary"), `${type}: the focus where the coach put it, not pulled to what came up`);
    }
  });
});

// Review Focus 2.
test("a second press on «Roll two D16» sends nothing more; while it is out the button says it waits", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      const gate = api.hold(ask("p1"));
      press(rollButton());
      assert.equal(rollButton().getAttribute("aria-busy"), "true");
      press(rollButton());
      await settle();
      assert.equal(asks().length, 1, "one POST");
      assert.ok(!back(), "no way back while the roll is out");
      gate.release({ status: 200, body: { roll: ROLL_SKILL } });
      await settle();
      assert.deepEqual(pairWords(), [["4", "Frenzy"], ["8", "Strip Ball"]]);
      assert.equal(asks().length, 1);
    });
  });
});

// Review Focus 1 and 2.
test("a roll whose answer was lost is asked again on a press: the server gives the same one back", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      api.fail(ask("p1"));
      press(rollButton());
      await settle();
      assert.deepEqual(lines(), [WORDS.lost]);
      assert.deepEqual(pairWords(), [["?", "—"], ["?", "—"]]);
      assert.ok(!rollButton().hasAttribute("aria-busy") && !closed(rollButton()), "the button open again");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(lines(), []);
      assert.deepEqual(pairWords(), [["4", "Frenzy"], ["8", "Strip Ball"]], "the same two");
      assert.equal(asks().length, 2);
      assert.deepEqual(asks()[0].body, asks()[1].body, "the same ask, the same roll");
      choose(pick("Strip Ball"));
      api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
      press(take());
      assert.ok(!take(), "done: a second press finds nothing to take");
      await settle();
      assert.deepEqual(sentOf("p1"), [[{ type: "random", grants: { skill: "Strip Ball" }, roll: { id: "r1", via: "site" } }]], "one advancement, the roll by its id");
    });
  });
});

// Review Focus 3.
test("a roll of the other purpose waits: the sheet says which to take, and the type is closed", async () => {
  await withoutTimers(async () => {
    await openAdvance(false);
    toRandomDesk("General");
    await rollWith("p1", 409, refused("DICE_ROLL_WAITING", { purpose: "stat" }));
    assert.deepEqual(lines(), [WORDS.waitingStat]);
    const random = typeCard("random");
    assert.ok(closed(random));
    assert.equal(random.getAttribute("title"), WORDS.waitingStat);
    assert.equal(random.querySelector(".g-option__sub").textContent, WORDS.waitingStat, "the card says why, as a refused type does");
    assert.ok(closed(rollButton()));
    assert.equal(rollButton().getAttribute("title"), WORDS.waitingStat);
    assert.ok(!closed(typeCard("stat")), "the type whose roll waits is open");
    press(rollButton());
    await settle();
    assert.equal(asks().length, 1, "a closed «Roll two D16» asks nothing");
    // «Roll first», closed with the same words, says them on a press (fix round 1, M3).
    assert.equal(take().textContent, "Roll first");
    assert.equal(take().getAttribute("title"), WORDS.waitingStat);
    press(take());
    assert.equal(toasts().at(-1), WORDS.waitingStat);
    // The characteristic: the D8 that waits comes back.
    choose(typeCard("stat"));
    assert.deepEqual(lines(), [], "the words were for the other type");
    await rollWith("p1", 200, { roll: ROLL_D8 });
    assert.deepEqual(asks().at(-1).body, { purpose: "stat" });
    assert.equal(dieValue(), "3");
  });
});

// Review Focus 3.
test("a roll of another category than asked is the one he gets, and the sheet says so", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "p3", teamAnswer: withOne(CADE) });
      toRandom("Agility");
      await rollWith("p3", 200, { roll: CADE_ROLL });
      assert.deepEqual(asks("p3").map(({ body }) => body), [{ purpose: "random_skill", category: "Agility" }]);
      assert.deepEqual(lines(), ["The roll is made already — in General"]);
      assert.equal(sub(), "General · 3 SPP");
      assert.deepEqual([faceName(1), faceName(16)], ["Block", "Thick Skull"], "General's column");
      assert.deepEqual(pairWords(), [["4", "Frenzy"], ["8", "Strip Ball"]]);
      choose(pick("Frenzy"));
      assert.equal(take().textContent, "Take: Frenzy");
      assert.ok(!closed(take()));
    });
  });
});

// Review Focus 2 (decision 35), T1 review Minor 4, K15: one of the two skills come to be hers since the roll — taken at
// the table, added by hand — closes that die's card and the other is taken; both close the roll (`ROLL_STALE`): its
// words, the table open, and the roll put on the table advancement of either.
test("a die whose skill the player has come to hold is closed, the other taken; both held — the stale roll's words and the table open", async () => {
  const ann = { ...ANN, extraSkills: [BLOCK, FRENZY], advancements: [AT_TABLE] };
  // Both: Frenzy taken at the table, Strip Ball added by hand.
  const both = { ...ann, extraSkills: [BLOCK, FRENZY, STRIP_BALL] };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(ann) });
      toRandom("General");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(lines(), [], "the roll is good: Strip Ball is hers to take");
      assert.ok(closed(pick("Frenzy")));
      assert.equal(pick("Frenzy").getAttribute("title"), WORDS.held);
      assert.ok(pick("Frenzy").getAttribute("class").includes("g-advance__pick--held"));
      assert.ok(!closed(pick("Strip Ball")));
      assert.equal(pick("Strip Ball").getAttribute("tabindex"), "0", "Tab enters on the die that can be taken");
      press(pick("Frenzy"));
      assert.equal(toasts().at(-1), WORDS.held);
      assert.deepEqual(picked(), [], "nothing chosen");
      assert.equal(take().textContent, WORDS.pickPair);
      assert.ok(!bind(), "a roll that can be taken is bound to nothing (K9: as the plan)");
      choose(pick("Strip Ball"));
      assert.equal(take().textContent, "Take: Strip Ball");
      const taken = { type: "random", grants: { skill: "Strip Ball" }, roll: { id: "r1", via: "site" } };
      api.reply(PATCH, 200, { team: withOne({ ...both, advancements: [AT_TABLE, taken] }, { revision: 5 }) });
      press(take());
      await settle();
      assert.deepEqual(sentOf("p1"), [[AT_TABLE, taken]]);
    });
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(both) });
      toRandom("General");
      await rollWith("p1", 200, { roll: { ...ROLL_SKILL, stale: true } });
      assert.deepEqual(lines(), [WORDS.stale]);
      assert.ok(pair().every(closed), "both hers");
      assert.ok(closed(take()));
      assert.equal(take().getAttribute("title"), WORDS.stale);
      assert.ok(!closed(way("table")), "«Rolled at the table» open (decision 11)");
      assert.equal(bind().textContent, "Record this roll for the advancement «Frenzy» taken at the table");
      // A press on the closed «Take» says why, as its title does, once — not again in the sheet — and sends nothing (M3).
      press(take());
      assert.equal(toasts().at(-1), WORDS.stale);
      assert.deepEqual(lines(), [WORDS.stale]);
      assert.ok(!refusal());
      await settle();
      assert.equal(patches().length, 0);
      // K15: a match begun before the screen is drawn again — the press asks, and nothing goes.
      const games = state.games.items;
      state.games.items = [LIVE_GAME];
      press(bind());
      assert.equal(toasts().at(-1), WORDS.afterPost);
      state.games.items = games;
      await settle();
      assert.equal(patches().length, 0);
      // Bound: one PATCH, the table advancement naming the roll; the sheet closes, and the coach is told.
      const bound = { ...AT_TABLE, roll: { id: "r1", via: "site" } };
      api.reply(PATCH, 200, { team: withOne({ ...both, advancements: [bound] }, { revision: 5 }) });
      press(bind());
      assert.ok(!sheet());
      assert.equal(toasts().at(-1), "The roll is recorded for «Frenzy»");
      await settle();
      assert.deepEqual(sentOf("p1"), [[bound]]);
    });
    // The table advancement took the second die's skill (M4): the button and its words name it, not the first die's.
    await withWindow({ phone: true }, async () => {
      const second = { type: "random", grants: { skill: "Strip Ball" }, roll: { via: "table" } };
      await openAdvance(true, { teamAnswer: withOne({ ...both, advancements: [second] }) });
      toRandom("General");
      await rollWith("p1", 200, { roll: { ...ROLL_SKILL, stale: true } });
      assert.equal(bind().textContent, "Record this roll for the advancement «Strip Ball» taken at the table");
      const bound = { ...second, roll: { id: "r1", via: "site" } };
      api.reply(PATCH, 200, { team: withOne({ ...both, advancements: [bound] }, { revision: 5 }) });
      press(bind());
      assert.equal(toasts().at(-1), "The roll is recorded for «Strip Ball»");
      await settle();
      assert.deepEqual(sentOf("p1"), [[bound]]);
    });
    // The table instead: the way is open, and two faces with skills she lacks are marked.
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(both) });
      toRandom("General");
      await rollWith("p1", 200, { roll: { ...ROLL_SKILL, stale: true } });
      choose(way("table"));
      assert.equal(note(), WORDS.table);
      assert.deepEqual(lines(), []);
      assert.ok(!bind());
      assert.ok([1, 4, 8].every((number) => closed(face(number))), "her Block, Frenzy and Strip Ball");
      press(face(3));
      press(face(5));
      assert.deepEqual(pairWords(), [["3", "Fend"], ["5", "Kick"]]);
      choose(pick("Fend"));
      assert.equal(take().textContent, "Take: Fend");
      assert.ok(!closed(take()));
    });
  });
});

test("a player the server has not: the sheet says so, and the roster is read again", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      const reads = () => api.calls.filter(({ key }) => key === TEAM_READ).length;
      const before = reads();
      await rollWith("p1", 404, refused("PLAYER_NOT_FOUND"));
      assert.ok(refusal(), "the server's words in the sheet");
      assert.deepEqual(pairWords(), [["?", "—"], ["?", "—"]]);
      assert.equal(reads(), before + 1, "read again");
    });
  });
});

// Fix round 1, I2: its words say «or take this advancement at the table», and the table is open.
test("a roll rerolled past a skill he has no more cannot be taken, and says why; at the table it is taken without the roll", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne({ ...ANN, extraSkills: [] }) });
      toRandom("General");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(lines(), [WORDS.rerolled]);
      assert.ok(closed(take()), "closed before a die is chosen too");
      assert.equal(take().getAttribute("title"), WORDS.rerolled);
      choose(pick("Frenzy"));
      assert.equal(take().textContent, "Take: Frenzy");
      assert.ok(closed(take()));
      assert.ok(!bind(), "no table advancement gave Frenzy");
      press(take());
      assert.equal(toasts().at(-1), WORDS.rerolled);
      assert.ok(!refusal(), "said once");
      await settle();
      assert.equal(patches().length, 0);
      // The table, as the words say: the way open, the coach's pair taken, the site's roll left waiting.
      assert.ok(ways().every((item) => !closed(item)));
      choose(way("table"));
      assert.equal(note(), WORDS.table);
      assert.deepEqual(lines(), [], "the site's refusal is not the table's");
      assert.deepEqual(pairWords(), [["?", "—"], ["?", "—"]], "the site's pair is not the table's");
      press(face(3));
      press(face(1));
      assert.deepEqual(pairWords(), [["3", "Fend"], ["1", "Block"]], "in the order marked");
      choose(pick("Fend"));
      assert.equal(take().textContent, "Take: Fend");
      api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["Fend", "Random primary skill · General · rolled at the table"]);
      await settle();
      assert.deepEqual(sentOf("p1"), [[{ type: "random", grants: { skill: "Fend" }, roll: { via: "table" } }]], "no roll named");
      assert.equal(asks().length, 1);
    });
  });
});

// The owner's answer (decision 38): at the table the coach marks the two faces the dice showed — a blank face, a skill
// the player has and a third mark closed, each saying why — and the marked pair is the same two cards; one is taken.
test("at the table: the coach marks the two faces the dice showed, then takes one; a third mark is refused with words; a blank or held face cannot be marked; the advancement says «at the table»", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "p3", teamAnswer: withOne(CADE) });
      toRandom("Agility");
      choose(way("table"));
      assert.equal(way("table").getAttribute("aria-checked"), "true");
      assert.equal(note(), WORDS.table);
      assert.equal(take().textContent, WORDS.pickFace);
      assert.ok(take().hasAttribute("disabled"));
      assert.ok(!rollButton());
      const group = sheet().querySelector(".g-advance__faces");
      assert.equal(group.getAttribute("role"), "group");
      assert.equal(group.getAttribute("aria-label"), "Faces of the D16");
      assert.equal(faces().length, 16);
      assert.ok(faces().every((item) => item.tagName === "BUTTON" && item.getAttribute("aria-pressed") === "false"));
      // Agility has fourteen skills: 15 and 16 are blank, and closed; his Catch and Dodge struck through, closed.
      for (const number of [15, 16]) {
        assert.ok(closed(face(number)));
        assert.equal(face(number).getAttribute("title"), "no skill");
        assert.equal(face(number).querySelector('.g-advance__facename [aria-hidden="true"]').textContent, "—");
        assert.equal(face(number).querySelector(".g-sr-only").textContent, "no skill");
      }
      assert.ok(isHeld(face(1)) && closed(face(1)) && faceName(1) === "Catch");
      assert.ok(isHeld(face(4)) && closed(face(4)) && faceName(4) === "Dodge");
      assert.equal(face(4).getAttribute("title"), WORDS.held);
      assert.deepEqual(faces().filter((item) => !closed(item)).map((item) => item.getAttribute("data-advance-face")), ["2", "3", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
      assert.deepEqual(pairWords(), [["?", "—"], ["?", "—"]]);
      assert.ok(pair().every((card) => closed(card) && card.getAttribute("title") === WORDS.table), "the pair waits for the marks");
      // A blank face pressed: said, and nothing marked.
      press(face(15));
      assert.equal(toasts().at(-1), "no skill");
      assert.deepEqual(marked(), []);
      assert.ok(pair().every((card) => card.querySelector(".g-die").getAttribute("aria-label") === "D16: not marked yet"), "M5");
      press(face(2));
      assert.deepEqual(marked(), ["2"]);
      assert.deepEqual(pairWords(), [["2", "Diving Catch"], ["?", "—"]]);
      assert.equal(note(), WORDS.table, "one of two marked");
      // Half a pair: its marked card says why it cannot be chosen yet (M2).
      assert.ok(closed(pick("Diving Catch")));
      assert.equal(pick("Diving Catch").getAttribute("title"), WORDS.table);
      press(pick("Diving Catch"));
      assert.equal(toasts().at(-1), WORDS.table);
      assert.deepEqual(picked(), []);
      assert.equal(result(), "Two D16s on the category's table");
      assert.equal(take().textContent, WORDS.pickFace);
      press(face(3));
      assert.deepEqual(pairWords(), [["2", "Diving Catch"], ["3", "Diving Tackle"]]);
      assert.equal(note(), WORDS.rolledTable, "the pair is whole (K8)");
      assert.equal(result(), WORDS.pickPair);
      assert.equal(take().textContent, WORDS.pickPair);
      // A third mark: refused with words, the two marks kept.
      assert.ok(closed(face(5)));
      assert.equal(face(5).getAttribute("title"), WORDS.marksFull);
      press(face(5));
      assert.equal(toasts().at(-1), WORDS.marksFull);
      assert.deepEqual(marked(), ["2", "3"]);
      // A mark taken off, another made: the pair follows, in the order marked.
      press(face(3));
      assert.deepEqual(marked(), ["2"]);
      assert.ok(!closed(face(5)));
      press(face(5));
      assert.deepEqual(pairWords(), [["2", "Diving Catch"], ["5", "Defensive"]]);
      choose(pick("Diving Catch"));
      assert.equal(result(), "Diving Catch");
      assert.equal(take().textContent, "Take: Diving Catch");
      // The other mark taken off: the choice goes with its pair, and does not come back with the next mark (M2).
      press(face(5));
      assert.deepEqual(picked(), []);
      assert.ok(closed(pick("Diving Catch")));
      assert.equal(take().textContent, WORDS.pickFace);
      press(face(5));
      assert.deepEqual(picked(), []);
      assert.equal(take().textContent, WORDS.pickPair);
      // The mark of the skill chosen taken off: the choice goes with it.
      choose(pick("Diving Catch"));
      press(face(2));
      assert.deepEqual(picked(), []);
      assert.equal(take().textContent, WORDS.pickFace);
      press(face(2));
      assert.deepEqual(pairWords(), [["5", "Defensive"], ["2", "Diving Catch"]]);
      choose(pick("Diving Catch"));
      assertStyled(view, ...ROLL_STYLES);
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["Diving Catch", "Random primary skill · Agility · rolled at the table"]);
      await settle();
      assert.equal(asks("p3").length, 0, "no POST: the dice were the coach's");
      assert.deepEqual(sentOf("p3"), [[{ type: "random", grants: { skill: "Diving Catch" }, roll: { via: "table" } }]]);
    });
  });
});

// K8: a desk shows the categories beside the marks — another category takes the marks off, so that a mark made in one
// column never records a skill of the other.
test("the marks are taken off with a change of category: a desk never records another column's skill", async () => {
  await withoutTimers(async () => {
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    toRandomDesk("General");
    choose(way("table"));
    press(face(2));
    press(face(3));
    assert.deepEqual(pairWords(), [["2", "Dauntless"], ["3", "Fend"]]);
    choose(pick("Fend"));
    assert.equal(summary(), "Random primary · General · Fend — 3 SPP");
    choose(category("Agility"));
    assert.deepEqual(marked(), []);
    assert.deepEqual(pairWords(), [["?", "—"], ["?", "—"]]);
    assert.deepEqual(picked(), []);
    assert.equal(note(), WORDS.table);
    assert.equal(take().textContent, WORDS.pickFace);
    assert.equal(summary(), "Random primary · Agility — 3 SPP");
    press(face(2));
    press(face(3));
    assert.deepEqual(pairWords(), [["2", "Diving Catch"], ["3", "Diving Tackle"]]);
    choose(pick("Diving Tackle"));
    api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
    press(take());
    await settle();
    assert.deepEqual(sentOf("p3"), [[{ type: "random", grants: { skill: "Diving Tackle" }, roll: { via: "table" } }]]);
  });
});

// Decision 34: a column with one skill the player lacks throws one die — nothing to choose, on the site or at the table.
test("one skill left in the column: one die, taken without a choice", async () => {
  const oneDie = { ...ROLL_SKILL, result: { dice: [{ attempts: [{ roll: 16, skill: "Thick Skull", duplicate: false }], skill: "Thick Skull" }] } };
  // Ann with every General skill but Thick Skull.
  const all = { ...ANN, extraSkills: GENERAL.slice(0, 15).map((name) => ({ name, access: "primary" })) };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(all) });
      toRandom("General");
      assert.deepEqual(pairWords(), [["?", "—"]], "one die to roll");
      // A single die is said as one (M3).
      assert.equal(rollButton().textContent, "Roll D16");
      assert.equal(note(), WORDS.siteDie);
      assert.equal(pick("").getAttribute("title"), WORDS.siteDie);
      assert.equal(result(), "A D16 on the category's table");
      await rollWith("p1", 200, { roll: oneDie });
      assert.deepEqual(pairWords(), [["16", "Thick Skull"]]);
      assert.deepEqual(picked(), ["Thick Skull"], "chosen at once");
      assert.equal(take().textContent, "Take: Thick Skull");
      assert.ok(!take().hasAttribute("disabled") && !closed(take()));
      assertStyled(view, ...ROLL_STYLES);
      api.reply(PATCH, 200, { team: withOne(all, { revision: 5 }) });
      press(take());
      await settle();
      assert.deepEqual(sentOf("p1"), [[{ type: "random", grants: { skill: "Thick Skull" }, roll: { id: "r1", via: "site" } }]]);
    });
    // At the table: one mark is the whole pair.
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(all) });
      toRandom("General");
      choose(way("table"));
      assert.equal(pair().length, 1);
      assert.equal(note(), WORDS.tableOne);
      assert.equal(pick("").getAttribute("title"), WORDS.tableOne);
      assert.equal(take().textContent, WORDS.pickFace);
      assert.deepEqual(faces().filter((item) => !closed(item)).map((item) => item.getAttribute("data-advance-face")), ["16"]);
      press(face(16));
      assert.deepEqual(pairWords(), [["16", "Thick Skull"]]);
      assert.deepEqual(picked(), ["Thick Skull"]);
      assert.equal(note(), WORDS.rolledTable);
      assert.equal(take().textContent, "Take: Thick Skull");
      api.reply(PATCH, 200, { team: withOne(all, { revision: 5 }) });
      press(take());
      await settle();
      assert.deepEqual(sentOf("p1"), [[{ type: "random", grants: { skill: "Thick Skull" }, roll: { via: "table" } }]]);
    });
    // A desk's button says it too.
    await openAdvance(false, { teamAnswer: withOne(all) });
    toRandomDesk("General");
    assert.equal(rollButton().textContent, "Roll D16");
    assert.equal(result(), "A D16 on the category's table");
  });
});

test("a characteristic on the site: the D8, what it allows with before and after and its value, the one beyond the limits closed", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toStat();
      assert.equal(title(), "Characteristic");
      assert.equal(sub(), "14 SPP · D8 roll");
      assert.equal(dots(), "Step 2 of 2");
      assert.equal(note(), WORDS.siteDie);
      assert.equal(sheet().querySelector(".g-die__type").textContent, "D8");
      assert.equal(dieValue(), "?");
      assert.equal(result(), "The roll decides what may improve");
      assert.equal(sheet().querySelector(".g-advance__table").textContent, WORDS.d8Table);
      assert.ok(!sheet().querySelector("[data-advance-d8]"), "the faces are the table's");
      assert.equal(rollButton().textContent, "Roll D8");
      await rollWith("p1", 200, { roll: ROLL_D8 });
      assert.deepEqual(asks().map(({ body }) => body), [{ purpose: "stat" }]);
      assert.equal(dieValue(), "3");
      assert.equal(result(), "May improve: AR, MA, PA");
      assert.equal(sheet().querySelector(".g-advance__stats").getAttribute("aria-label"), "Characteristic");
      assert.deepEqual(statWords(), [["AR", "9+ → 10+ · +10k"], ["MA", "6 → 7 · +30k"], ["PA", "4+ → 3+ · +20k"]]);
      assert.equal(note(), WORDS.rolledSite);
      assert.ok(ways().every(closed));
      assert.ok(!back());
      assert.equal(take().textContent, "Choose a characteristic");
      assert.ok(take().hasAttribute("disabled"));
      choose(stat("ma"));
      assert.equal(stat("ma").getAttribute("aria-checked"), "true");
      assert.equal(take().textContent, "Improve MA");
      const taken = { type: "stat", grants: { stat: "ma" }, roll: { id: "r2", via: "site" } };
      api.reply(PATCH, 200, { team: withOne({ ...ANN, statMods: { ma: 1 }, advancements: [taken] }, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["MA 6 → 7", "Characteristic improvement · rolled on the site"]);
      assert.deepEqual(tiles(), ["−14", "+30k", "1 / 6"]);
      await settle();
      assert.deepEqual(sentOf("p1"), [[taken]]);
      assertStyled(view, ...ROLL_STYLES);
    });
    // A characteristic past its limit: closed, saying why; a press chooses nothing.
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "p3", teamAnswer: withOne({ ...CADE, statMods: { ma: 1 } }) });
      toStat();
      await rollWith("p3", 200, { roll: { ...ROLL_D8, playerId: "p3" } });
      assert.ok(closed(stat("ma")));
      assert.equal(stat("ma").getAttribute("title"), "MA is at its limit already");
      assert.equal(stat("ma").querySelector(".g-advance__statchange").textContent, "MA is at its limit already");
      press(stat("ma"));
      assert.equal(stat("ma").getAttribute("aria-checked"), "false");
      assert.equal(take().textContent, "Choose a characteristic");
    });
  });
});

test("a characteristic at the table: eight faces, then the same choice", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toStat();
      choose(way("table"));
      assert.equal(note(), WORDS.tableD8);
      assert.ok(!rollButton());
      assert.equal(take().textContent, "Choose the D8 result");
      assert.ok(take().hasAttribute("disabled"));
      const group = sheet().querySelector(".g-advance__d8");
      assert.equal(group.getAttribute("role"), "radiogroup");
      assert.equal(group.getAttribute("aria-label"), "D8 result at the table");
      assert.deepEqual(group.querySelectorAll("[data-advance-d8]").map((item) => item.textContent), ["1", "2", "3", "4", "5", "6", "7", "8"]);
      choose(d8(6));
      // The faces stay, the one pressed checked, so that another may be pressed (fix round 1, I1; Adv3StatTable hides them).
      assert.equal(sheet().querySelectorAll('.g-advance__d8 [aria-checked="true"]').map((item) => item.textContent).join(), "6");
      assert.equal(dieValue(), "6");
      assert.equal(result(), "May improve: AG, MA");
      assert.deepEqual(statWords(), [["AG", "3+ → 2+ · +40k"], ["MA", "6 → 7 · +30k"]]);
      assert.equal(note(), WORDS.rolledTable);
      assert.ok(!closed(way("site")), "at the table the way stays open");
      choose(stat("ag"));
      assert.equal(take().textContent, "Improve AG");
      api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["AG 3+ → 2+", "Characteristic improvement · rolled at the table"]);
      await settle();
      assert.equal(asks().length, 0);
      assert.deepEqual(sentOf("p1"), [[{ type: "stat", grants: { stat: "ag" }, roll: { via: "table" } }]]);
    });
    // DeskRosterAdvStat: the D8 at the table in column 2, the characteristics in column 3.
    await openAdvance(false);
    choose(typeCard("stat"));
    choose(way("table"));
    assert.deepEqual(heads(), ["1 · Type", "2 · D8 roll", "3 · Characteristic"]);
    assert.equal(columns()[2].querySelector(".g-advance__empty").textContent, "Roll the D8 — the characteristics it allows appear here");
    assert.equal(columns()[1].querySelectorAll("[data-advance-d8]").length, 8);
    assert.ok(!rollButton());
    choose(d8(6));
    assert.deepEqual(columns()[2].querySelectorAll("[data-advance-stat]").map((item) => item.getAttribute("data-advance-stat")), ["ag", "ma"]);
    assert.ok(columns()[2].querySelector("[data-advance-instead]"));
    assert.equal(take().textContent, "Choose a characteristic");
    assertStyled(view, ...ROLL_STYLES);
  });
});

// Fix round 1, I1: an arrow chooses a face, and the redraw keeps the group and the focus, so any face can be recorded.
test("the D8's faces at the table from the keyboard: the arrows walk all eight, the focus stays, any face is recorded", async () => {
  const key = (face, name) => fireEvent(d8(face), "keydown", { key: name });
  const checked = () => sheet().querySelector('.g-advance__d8 [aria-checked="true"]')?.textContent ?? null;
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone);
        if (phone) toStat();
        else choose(typeCard("stat"));
        choose(way("table"));
        assert.equal(d8(1).getAttribute("tabindex"), "0", "Tab enters on the first face");
        d8(1).focus();
        for (const face of [2, 3, 4, 5]) {
          key(face - 1, "ArrowRight");
          assert.equal(checked(), String(face));
          assert.ok(document.activeElement === d8(face), `the focus on face ${face}`);
          assert.equal(dieValue(), String(face));
        }
        assert.deepEqual(statWords().map(([stat]) => stat), ["MA", "PA"], "5: MA or PA");
        key(5, "End");
        assert.equal(checked(), "8");
        assert.deepEqual(statWords().map(([stat]) => stat), ["MA", "ST", "AG", "PA", "AR"], "8: any");
        key(8, "ArrowRight");
        assert.equal(checked(), "1", "the arrows wrap");
        assert.ok(document.activeElement === d8(1));
        key(1, "ArrowLeft");
        key(8, "ArrowLeft");
        assert.equal(checked(), "7");
        assert.ok(document.activeElement === d8(7));
        assert.deepEqual(statWords().map(([stat]) => stat), ["AG", "ST"]);
        // Recorded as it stands: 7, ST.
        choose(stat("st"));
        api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
        press(take());
        await settle();
        assert.deepEqual(sentOf("p1"), [[{ type: "stat", grants: { stat: "st" }, roll: { via: "table" } }]], phone ? "a phone" : "a desk");
      });
    }
  });
});

// The owner's answer (decision 38): the faces at the table are marks — toggle buttons, each in the tab order — not a
// radio group: two of them are pressed at once.
test("the faces at the table from the keyboard: each open face is a button in the tab order; Space marks it and again unmarks it; the focus stays", async () => {
  // A button's Space is the browser's click; nothing of the sheet's takes the key itself.
  const space = (element) => {
    fireEvent(element, "keydown", { key: " " });
    fireEvent(element, "click");
  };
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone, { id: "p3", teamAnswer: withOne(CADE) });
        if (phone) toRandom("Agility");
        else toRandomDesk("Agility");
        choose(way("table"));
        const open = faces().filter((item) => !closed(item));
        assert.deepEqual(open.map((item) => item.getAttribute("data-advance-face")), ["2", "3", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
        assert.ok(open.every((item) => item.tagName === "BUTTON" && item.getAttribute("type") === "button" && !item.hasAttribute("tabindex")), "each in the tab order");
        assert.ok(!faces().some((item) => item.hasAttribute("role")), "marks, not a radio group");
        face(2).focus();
        space(face(2));
        assert.deepEqual(marked(), ["2"]);
        assert.ok(document.activeElement === face(2), "the focus stays on face 2");
        space(face(2));
        assert.deepEqual(marked(), [], "again: unmarked");
        assert.ok(document.activeElement === face(2));
        space(face(2));
        face(5).focus();
        space(face(5));
        assert.deepEqual(marked(), ["2", "5"]);
        assert.ok(document.activeElement === face(5), "the focus stays on face 5");
        assert.deepEqual(pairWords(), [["2", "Diving Catch"], ["5", "Defensive"]]);
        // Recorded as it stands.
        choose(pick("Defensive"));
        api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
        press(take());
        await settle();
        assert.deepEqual(sentOf("p3").at(-1).at(-1), { type: "random", grants: { skill: "Defensive" }, roll: { via: "table" } }, phone ? "a phone" : "a desk");
      });
    }
  });
});

// The pair is the stage's radio group (radio-group.mjs, wireRadioGroups): a roving tabindex, the arrows choosing, a closed
// card passed, and the redraw keeping the focus on the card reached.
test("the pair from the keyboard: the arrows move between the two cards, the closed one passed, the focus stays", async () => {
  const key = (name, value) => fireEvent(pick(name), "keydown", { key: value });
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openAdvance(phone);
        if (phone) toRandom("General");
        else toRandomDesk("General");
        await rollWith("p1", 200, { roll: ROLL_SKILL });
        assert.equal(pick("Frenzy").getAttribute("tabindex"), "0", "Tab enters on the first card");
        assert.equal(pick("Strip Ball").getAttribute("tabindex"), "-1");
        pick("Frenzy").focus();
        key("Frenzy", "ArrowRight");
        assert.deepEqual(picked(), ["Strip Ball"]);
        assert.ok(document.activeElement === pick("Strip Ball"), "the focus on Strip Ball");
        assert.equal(take().textContent, "Take: Strip Ball");
        key("Strip Ball", "ArrowRight");
        assert.deepEqual(picked(), ["Frenzy"], "the arrows wrap");
        assert.ok(document.activeElement === pick("Frenzy"));
        key("Frenzy", "ArrowLeft");
        assert.deepEqual(picked(), ["Strip Ball"]);
        assert.ok(document.activeElement === pick("Strip Ball"));
      });
      // Frenzy hers since the roll: its card closed, and passed.
      await withWindow({ phone }, async () => {
        await openAdvance(phone, { teamAnswer: withOne({ ...ANN, extraSkills: [BLOCK, FRENZY], advancements: [AT_TABLE] }) });
        if (phone) toRandom("General");
        else toRandomDesk("General");
        await rollWith("p1", 200, { roll: ROLL_SKILL });
        assert.equal(pick("Strip Ball").getAttribute("tabindex"), "0");
        assert.equal(pick("Frenzy").getAttribute("tabindex"), "-1");
        pick("Strip Ball").focus();
        key("Strip Ball", "ArrowLeft");
        assert.deepEqual(picked(), ["Strip Ball"], "Frenzy passed");
        assert.ok(document.activeElement === pick("Strip Ball"));
        key("Strip Ball", "ArrowRight");
        assert.deepEqual(picked(), ["Strip Ball"]);
        assert.ok(document.activeElement === pick("Strip Ball"));
        assert.equal(take().textContent, "Take: Strip Ball");
        api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
        press(take());
        await settle();
        assert.deepEqual(sentOf("p1").at(-1).at(-1), { type: "random", grants: { skill: "Strip Ball" }, roll: { id: "r1", via: "site" } }, phone ? "a phone" : "a desk");
      });
    }
  });
});

test("a skill in place of the characteristic: primary or secondary at the characteristic's price, recorded as a characteristic advancement", async () => {
  const cases = [["General", "Fend", "+20k"], ["Strength", "Guard", "+40k"]];
  for (const [categoryName, skillName, value] of cases) {
    await withoutTimers(async () => {
      await withWindow({ phone: true }, async () => {
        await openAdvance(true);
        toStat();
        choose(way("table"));
        choose(d8(6));
        assert.equal(instead().querySelector(".g-advance__insteadtitle").textContent, "Take a skill in place of the characteristic");
        assert.equal(instead().querySelector(".g-advance__insteadsub").textContent, "A primary or secondary skill of your choice, at the characteristic's price · 14 SPP");
        press(instead());
        assert.equal(title(), "Skill category");
        assert.equal(sub(), "Skill in place of a characteristic · 14 SPP");
        assert.equal(dots(), "Step 2 of 3");
        assert.deepEqual(categories().map((item) => item.getAttribute("data-advance-category")), ["General", "Agility", "Strength", "Devious"], "primary, then secondary");
        // Back returns to the D8's choice, the face kept.
        press(back());
        assert.equal(title(), "Characteristic");
        assert.equal(dieValue(), "6");
        press(instead());
        choose(category(categoryName));
        press(next());
        assert.equal(sub(), `${categoryName} · 14 SPP`);
        choose(skill(skillName));
        assert.equal(take().textContent, `Take ${skillName}`);
        api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
        press(take());
        assert.deepEqual(doneWords(), [skillName, `Characteristic improvement · ${categoryName} · in place of a characteristic`]);
        assert.deepEqual(tiles(), ["−14", value, "1 / 6"]);
        await settle();
        assert.deepEqual(sentOf("p1"), [[{ type: "stat", grants: { skill: skillName }, roll: { via: "table" } }]], categoryName);
      });
    });
  }
});

// Fix round 1, M8: the skill in place of a characteristic takes the site's D8 by its id.
test("a skill in place of a characteristic rolled on the site names the D8 it took", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toStat();
      await rollWith("p1", 200, { roll: ROLL_D8 });
      press(instead());
      assert.equal(title(), "Skill category");
      choose(category("General"));
      press(next());
      choose(skill("Fend"));
      api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["Fend", "Characteristic improvement · General · in place of a characteristic"]);
      await settle();
      assert.deepEqual(sentOf("p1"), [[{ type: "stat", grants: { skill: "Fend" }, roll: { id: "r2", via: "site" } }]]);
      assert.equal(asks().length, 1);
    });
  });
});

// Fix round 1, M2: a desk's way back from a skill in place of the characteristic (DeskRosterAdvStat's is the type card).
test("on a desk a skill in place of the characteristic goes back to it, the face kept", async () => {
  await withoutTimers(async () => {
    await openAdvance(false);
    choose(typeCard("stat"));
    await rollWith("p1", 200, { roll: ROLL_D8 });
    press(instead());
    assert.deepEqual(heads(), ["1 · Type", "2 · Category", "3 · Skill"]);
    const way = sheet().querySelector("[data-advance-statback]");
    assert.equal(way.textContent, "‹ Back to the characteristic");
    assert.ok(columns()[1].contains(way), "at the top of the categories");
    choose(category("General"));
    choose(skill("Fend"));
    assert.equal(summary(), "Characteristic · General · Fend — 14 SPP");
    press(way);
    assert.deepEqual(heads(), ["1 · Type", "2 · D8 roll", "3 · Characteristic"]);
    assert.equal(dieValue(), "3", "the D8 kept");
    assert.ok(!sheet().querySelector("[data-advance-statback]"));
    assert.ok(document.activeElement === instead(), "the focus on «Take a skill in place…» again");
    assert.equal(summary(), "Characteristic — 14 SPP");
    choose(stat("ma"));
    assert.equal(take().textContent, "Improve MA");
    assertStyled(view, ...ROLL_STYLES);
  });
});

// Fix round 1, M8: what is fixed after a site roll is refused at the press too, not only drawn closed.
test("after a site roll a type or a category pressed anyway changes nothing; a phone has no way back to them", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.ok(!back(), "no «Back» to the category or the type");
      assert.ok(!sheet().querySelector(".g-options") && !sheet().querySelector(".g-advance__cats"), "neither is drawn");
      assert.equal(title(), "Random skill", "the step stays");
    });
    // A desk (Cade: Agility and General): a press that reaches the handler — as one drawn before the answer would — is refused there.
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    toRandomDesk("General");
    await rollWith("p3", 200, { roll: CADE_ROLL });
    choose(pick("Frenzy"));
    const primary = typeCard("primary");
    primary.removeAttribute("aria-disabled");
    press(primary);
    assert.equal(toasts().at(-1), WORDS.kept);
    assert.equal(typeCard("random").getAttribute("aria-checked"), "true");
    assert.deepEqual(pairWords(), [["4", "Frenzy"], ["8", "Strip Ball"]], "the roll stays");
    const agility = category("Agility");
    agility.removeAttribute("aria-disabled");
    press(agility);
    assert.equal(category("General").getAttribute("aria-checked"), "true");
    assert.equal(summary(), "Random primary · General · Frenzy — 3 SPP");
    await settle();
    assert.equal(asks("p3").length, 1);
  });
});

// Fidelity follow-up: after a site roll the category chosen keeps its look, as the type does (DeskRosterAdv's chosen
// category); the other is closed by the roll — kept, not refused.
test("on a desk a site roll keeps the category chosen: closed, marked kept, still the choice", async () => {
  await withoutTimers(async () => {
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    toRandomDesk("General");
    assert.ok(categories().every((item) => !item.hasAttribute("data-advance-kept")), "nothing kept before the roll");
    await rollWith("p3", 200, { roll: CADE_ROLL });
    assert.deepEqual(categories().map((item) => [item.getAttribute("data-advance-category"), item.getAttribute("aria-checked"), closed(item), item.hasAttribute("data-advance-kept")]),
      [["Agility", "false", true, true], ["General", "true", true, true]]);
    assert.equal(category("Agility").getAttribute("title"), WORDS.kept);
    assertStyled(view, ...ROLL_STYLES);
  });
});

// The owner's answer (decisions 37–38; plan 07d's fix round 1, M1, changed): at the table a desk has no roll button —
// the dice are the table's — and a mis-mark is taken off there.
test("on a desk the table has no roll button; a mis-mark is taken off at the table", async () => {
  await withoutTimers(async () => {
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    toRandomDesk("Agility");
    choose(way("table"));
    assert.ok(!rollButton());
    assert.equal(note(), WORDS.table);
    press(face(2));
    press(face(3));
    assert.ok(!rollButton());
    assert.equal(note(), WORDS.rolledTable);
    press(face(3));
    press(face(5));
    choose(pick("Defensive"));
    assert.equal(take().textContent, "Take: Defensive");
    assert.equal(summary(), "Random primary · Agility · Defensive — 3 SPP");
    await settle();
    assert.equal(asks("p3").length, 0);
  });
});

// Decision 10.
test("no roll while a step of the queue waits or is on its way: the button says so", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      // A player's edit waits for the network.
      api.fail(PATCH);
      assert.equal(save.amendPlayer("t1", "p1", { number: "11", name: "Ann", captain: false }, { closed: () => "" }).ok, true);
      await settle();
      assert.equal(save.saveState("t1").waiting, 1);
      assert.ok(closed(rollButton()));
      assert.equal(rollButton().getAttribute("title"), WORDS.waitSave);
      press(rollButton());
      assert.equal(toasts().at(-1), WORDS.waitSave);
      await settle();
      assert.equal(asks().length, 0);
    });
    // On its way.
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toStat();
      const gate = api.hold(PATCH);
      save.stepSpp("t1", "p1", "touchdowns", 1);
      assert.ok(closed(rollButton()));
      press(rollButton());
      await settle();
      assert.equal(asks().length, 0);
      gate.release({ status: 200, body: { team: withOne({ ...ANN, spp: { touchdowns: 11 } }, { revision: 5 }) } });
      await settle();
      assert.ok(!closed(rollButton()), "open again once the queue is at rest");
    });
  });
});

// Review Focus 4.
test("a match begun while a roll is out: the sheet closes, and the answer that comes after finds nothing to take", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      const gate = api.hold(ask("p1"));
      press(rollButton());
      await matchBegins(withOne(ANN, { revision: 4 }));
      assert.ok(!sheet(), "the sheet closes with the match");
      gate.release({ status: 200, body: { roll: ROLL_SKILL } });
      await settle();
      assert.ok(!sheet());
      assert.equal(patches().length, 0);
      // And a roll is never asked during one.
      press(advance());
      assert.ok(!sheet());
      assert.equal(asks().length, 1);
    });
  });
});

test("on a desk the roll stands in its columns", async () => {
  await withoutTimers(async () => {
    await openAdvance(false);
    choose(typeCard("stat"));
    assert.deepEqual(heads(), ["1 · Type", "2 · D8 roll", "3 · Characteristic"]);
    const [, second, third] = columns();
    assert.ok(second.querySelector('[data-seg-group="advance-via"]'));
    assert.ok(second.querySelector(".g-die"));
    assert.equal(second.querySelector("[data-advance-roll]").textContent, "Roll D8");
    assert.equal(second.querySelector(".g-advance__table").textContent, "1 AR · 2 AR/PA · 3–4 AR/MA/PA · 5 MA/PA · 6 AG/MA · 7 AG/ST · 8 any");
    assert.equal(third.querySelector(".g-advance__empty").textContent, "Roll the D8 — the characteristics it allows appear here");
    assert.equal(summary(), "Characteristic — 14 SPP");
    assert.equal(take().textContent, "Choose a characteristic");
    rollButton().focus();
    await rollWith("p1", 200, { roll: ROLL_D8 });
    assert.ok(!rollButton(), "no «Roll D8» once the face is in");
    assert.ok(document.activeElement === stat("ar"), "the focus on the first characteristic the face allows, not lost with the button (T21 re-review N2)");
    assert.deepEqual(columns()[2].querySelectorAll("[data-advance-stat]").map((item) => item.getAttribute("data-advance-stat")), ["ar", "ma", "pa"]);
    choose(stat("ma"));
    assert.equal(summary(), "Characteristic · MA — 14 SPP");
    assert.equal(take().textContent, "Improve MA");
    assertStyled(view, ...ROLL_STYLES);
    // A random skill: the roll in column 3 — the pair, its button under the result, the faces.
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    choose(typeCard("random"));
    assert.deepEqual(heads(), ["1 · Type", "2 · Category", "3 · Skill roll"]);
    assert.equal(columns()[2].querySelector(".g-advance__empty").textContent, "Choose a category");
    choose(category("Agility"));
    assert.equal(columns()[2].querySelectorAll("[data-advance-pick]").length, 2);
    assert.equal(columns()[2].querySelector("[data-advance-roll]").textContent, "Roll two D16");
    assert.equal(columns()[2].querySelectorAll("[data-advance-face]").length, 16);
    assert.ok(!columns()[2].querySelector(".g-advance__dierow"), "no die beside the button: the pair stands above it");
    assert.equal(take().textContent, "Roll first");
    assert.ok(take().hasAttribute("disabled"));
    assertCspSafe(view);
    assertStyled(view, ...ROLL_STYLES);
  });
});

test("every key in both dictionaries (the waiting words for each purpose); styled; readable; D2", () => {
  const dictionaries = { en: JSON.parse(text("src/i18n/en.json")), ru: JSON.parse(text("src/i18n/ru.json")) };
  for (const purpose of DICE_PURPOSES) {
    for (const [locale, words] of Object.entries(dictionaries)) assert.ok(words[`teamAdvance.waiting.${purpose}`], `${locale} teamAdvance.waiting.${purpose}`);
  }
  // The words of attempts no sheet shows any more are gone (the owner's answer; the skill's sheet says what the dice showed, Task 22).
  for (const [locale, words] of Object.entries(dictionaries)) {
    for (const key of ["teamAdvance.rerolled", "teamAdvance.note.siteD8", "teamAdvance.attempts", "teamAdvance.attempt.blank", "teamAdvance.attempt.held", "teamAdvance.attempt.kept"]) {
      assert.ok(!(key in words), `${locale} ${key}`);
    }
  }
  assertDictionaryCovers("src/screens/team/roster/roll-view.mjs", "src/screens/team/roster/advance.mjs", "src/screens/team/roster/advance-sheet.mjs");
  const css = text(ROLLS);
  assert.doesNotMatch(css, /--focus-ring/);
  assert.doesNotMatch(css, /g-advance__dierow|g-advance__dieside/, "no die beside the button: the pair stands above it");
  assert.doesNotMatch(css, /attempt/, "no attempts in the sheet: nothing to press, nothing to list");
  const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  assert.deepEqual(queries, ["(max-width: 900px)", "(min-width: 901px)"], "only the stage's two breakpoints");
  for (const selector of ["#player-advance .g-advance__note", "#player-advance .g-advance__result", "#player-advance .g-advance__face", "#player-advance .g-advance__facenum",
    "#player-advance .g-advance__d8face", "#player-advance .g-advance__stat", "#player-advance .g-advance__instead", "#player-advance .g-advance__pick",
    "#player-advance .g-advance__picktag", "#player-advance .g-advance__insteadtitle", "#player-advance .g-advance__insteadsub",
    "#player-advance .g-advance__back", "#player-advance .g-advance__kept", "#player-advance .g-seg__item"]) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(ROLLS, selector, property).length >= 1, `${selector} ${property}`);
  }
  // The D8's table shares advance.css's hint rule (fix round 1, M6); a desk's line height is the roll's own.
  for (const property of ["font", "letter-spacing", "text-transform", "overflow-wrap"]) {
    assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__table", property), valuesOf(ADVANCE, "#player-advance .g-advance__hint", property), property);
  }
  // The roll's lines are the player sheets' refusal line (T8; fix round 1, I3): rolls.css copies none of it.
  assert.doesNotMatch(css, /g-advance__alert/);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__info", "color"), ["var(--ink-2)"]);
  // Adv3Random, Adv3Stat, Adv3StatTable up to 900px; DeskRosterAdv and DeskRosterAdvStat from 901px.
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-seg__item", "font"), ["600 14px/normal var(--font-body)", "600 13px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__note", "font"), ["400 12px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__result", "font"), ["600 15px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__faces", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__faces", "column-gap"), ["var(--space-10)", "var(--space-8)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__faces--shown", "list-style"), ["none"], "the site's list, reset (K10)");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__faces--shown", "padding"), ["0"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__d8", "grid-template-columns"), ["repeat(8, minmax(0, 1fr))", "repeat(4, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__d8face", "font"), ["700 18px/normal var(--font-display)", "700 17px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-advance__table", "font"), ["400 13px/1.45 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__table", "font"), ["400 13px/1.6 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__stat", "min-height"), ["52px"]);
  assert.deepEqual(valuesOf(ROLLS, '#player-advance .g-advance__stat[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"]);
  assert.deepEqual(valuesOf(ROLLS, '#player-advance .g-advance__d8face[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"], "the face pressed (fix round 1, I1)");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__face--hit", "background"), ["var(--accent)"]);
  assert.deepEqual(valuesOf(ROLLS, '#player-advance .g-advance__face[aria-pressed="true"]', "background"), ["var(--accent)"], "a face marked at the table, as one that came up");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__face--held", "text-decoration"), ["line-through"]);
  // The pair (the owner's answer): two to a row, 10 apart (8 on a desk); Adv3Stat's card — 12 round, a 1px ring, the
  // chosen one on the soft tint in a 2px accent ring; the die Adv3Random's and DeskRosterAdv's.
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pair", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pair", "gap"), ["var(--space-10)", "var(--space-8)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick", "border-radius"), ["var(--radius-lg)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick", "box-shadow"), ["inset 0 0 0 1px var(--line)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick", "font"), ["600 15px/1.25 var(--font-body)", "600 14px/1.25 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick", "padding"), ["var(--space-12) var(--space-10)", "var(--space-10) var(--space-8)"]);
  assert.deepEqual(valuesOf(ROLLS, '#player-advance .g-advance__pick[aria-checked="true"]', "background"), ["var(--accent-tint-soft)"]);
  assert.deepEqual(valuesOf(ROLLS, '#player-advance .g-advance__pick[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"], "Adv3Stat's ringOn (M7)");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__outcome", "gap"), ["var(--space-6)"], "DeskRosterAdv's side column (M10)");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick--held .g-advance__pickname", "text-decoration"), ["line-through"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick .g-die", "width"), ["64px"], "a desk's die (DeskRosterAdv); a phone's is ui/die.css's 76");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick .g-die", "border-radius"), ["var(--radius-2xl)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick .g-die__type", "font-size"), ["11px"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__pick .g-die__value", "font-size"), ["30px"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__roll--d16 .g-btn--primary", "font"), ["700 14px/1.2 var(--font-body)"], "DeskRosterAdv's «Roll»");
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__roll--d16 .g-btn--primary", "padding"), ["0 var(--space-14)"]);
  assertReadable(ROLLS, "#player-advance .g-advance__note", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__result", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__face--hit", "color", ["--accent"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__face--held", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-seg__item", "color", ["--surface-3"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__pick", "color", ["--surface", "--accent-tint-soft"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__pick--held .g-advance__pickname", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__picktag", "color", ["--surface", "--accent-tint-soft"], 4.5);
  // The roll's lines in every palette, the dark ones too (fix round 1, M8): the refusal's --danger, the info's --ink-2.
  assertReadable("src/screens/team/roster/player-sheets.css", ".g-player-sheet .g-player-sheet__refusal", "color", ["--surface", "--surface-2"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__info", "color", ["--surface", "--surface-2"], 4.5);
  // D2: up to 900px what is pressed is 44px or more; from 901px as the prototypes, never under 24px.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (query) => bare.slice(bare.indexOf(`@media (${query}) {`), bare.indexOf("\n}", bare.indexOf(`@media (${query}) {`)));
  const height = (query, selector) => Number(block(query).match(new RegExp(`${selector.replace(/[.[\]"]/g, "\\$&")} \\{[^}]*min-height: (\\d+)px;`))?.[1]);
  for (const selector of ["#player-advance .g-advance__face", "#player-advance .g-seg__item", "#player-advance .g-advance__d8face"]) {
    assert.ok(height("max-width: 900px", selector) >= 44, `${selector} on a phone`);
  }
  assert.equal(height("min-width: 901px", "#player-advance .g-advance__face"), 28);
  assert.equal(height("min-width: 901px", "#player-advance .g-seg__item"), 36);
  assert.equal(height("min-width: 901px", "#player-advance .g-advance__d8face"), 40);
  for (const selector of ["#player-advance .g-advance__face", "#player-advance .g-seg__item", "#player-advance .g-advance__d8face"]) {
    assert.ok((height("min-width: 901px", selector) || 44) >= 24, `${selector} on a desk`);
  }
  const [phonePick, deskPick] = valuesOf(ROLLS, "#player-advance .g-advance__pick", "min-height").map((value) => Number.parseInt(value, 10));
  assert.ok(phonePick >= 44, "a card of the pair on a phone");
  assert.ok(deskPick >= 24, "a card of the pair on a desk");
  assert.ok(Number.parseInt(valuesOf(ROLLS, "#player-advance .g-advance__roll--d16 .g-btn--primary", "min-height")[0], 10) >= 24, "«Roll two D16» on a desk");
  // Imported after advance.css (K5: a relative order); the roster's chain stays in order (test/team-roster.test.mjs).
  const styles = text("src/styles.css");
  const at = (name) => styles.indexOf(`@import url("screens/team/roster/${name}");`);
  assert.ok(at("profile.css") >= 0 && at("player-sheets.css") > at("profile.css") && at("advance.css") > at("player-sheets.css") && at("rolls.css") > at("advance.css"));
});

// The owner's answer on wrapping: a long skill wraps on its card and its face; «…» hides nothing in 07d.
test("a long skill on a card or a face wraps; nothing is cut with «…»", () => {
  const css = text(ROLLS);
  assert.doesNotMatch(css, /text-overflow/);
  for (const selector of ["#player-advance .g-advance__facename", "#player-advance .g-advance__pick", "#player-advance .g-advance__note", "#player-advance .g-advance__result",
    "#player-advance .g-advance__statchange", "#player-advance .g-advance__insteadtitle", "#player-advance .g-advance__insteadsub",
    "#player-advance .g-advance__kept"]) {
    assert.deepEqual(valuesOf(ROLLS, selector, "overflow-wrap"), ["anywhere"], selector);
  }
});

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

// Stage 07d, Task 10: the advancement's two rolled types. A random primary skill — the D16 on the category's column of the
// Skill Table — and a characteristic improvement — the D8 — are rolled on the site (`POST …/rolls`, asked once: asking
// again gives the same roll back) or at the table (the coach presses the face). Declared first, then rolled: once a roll
// is made on the site the type, the category and the way are fixed. A skill may be taken in place of the characteristic.
// Each take is one step of the save queue, naming the site roll as `roll: {id, via: "site"}`. The page, the coach and his
// team are helpers/roster-page.mjs's: Ann 1 (a Lineman: General primary), Cade 3 (a Catcher: Agility and General).
// Prototypes: Adv3Random, Adv3Stat, Adv3StatTable on a phone; DeskRosterAdv, DeskRosterAdvStat on a desk.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const ROLLS = "src/screens/team/roster/rolls.css";
const ROLL_STYLES = [...STYLES, "option-card.css", "die.css", "segmented-control.css"];
const ask = (id) => `POST /api/teams/t1/players/${id}/rolls`;

const GENERAL = ["Block", "Dauntless", "Fend", "Frenzy", "Kick", "Pro", "Steady Footing", "Strip Ball", "Sure Hands", "Tackle", "Taunt", "Wrestle",
  "Offensive", "Elvenball", "Shadowing", "Thick Skull"];
/** Ann's random skill as the server answers it: Block came up first and was rolled again — Ann has it — then Frenzy. */
const ROLL_SKILL = {
  id: "r1", playerId: "p1", purpose: "random_skill", params: { category: "General", candidates: GENERAL, sides: 16, captain: false },
  result: { attempts: [{ roll: 1, skill: "Block", duplicate: true }, { roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }, usedAt: null,
};
/** Ann's D8: a 3 — AR, MA or PA. */
const ROLL_D8 = { ...ROLL_SKILL, id: "r2", purpose: "stat", params: { sides: 8 }, result: { roll: 3, stats: ["ar", "ma", "pa"] } };
const BLOCK = { name: "Block", access: "primary" };
/** Ann with Block of her own (the roll was rolled again past it, and holds it) and 30 SPP. */
const ANN = { ...PLAYERS[0], spp: { touchdowns: 10 }, extraSkills: [BLOCK] };
const CADE = { ...PLAYERS[2], spp: { touchdowns: 10 } };

const WORDS = {
  hint: "A D16 on the league's Skill Table decides the skill; a skill the player has, and a face with no skill, are rolled again.",
  site: "The site rolls the die and keeps the result — no rerolling it",
  table: "Press the skill the die showed",
  tableD8: "Choose what the D8 showed",
  rolledSite: "Rolled on the site · the result is kept and seen in the player's history",
  rolledTable: "Rolled at the table · the history will say «at the table»",
  kept: "The roll stays the player's: close this now, and the next advancement of this type takes the same roll",
  lost: "The roll's answer did not come: press again — the site gives the same roll back",
  waitingStat: "A D8 for a characteristic waits for this player: take «Characteristic improvement» first — the site gives that roll back",
  stale: "Frenzy came up, and the player has this skill already: the roll cannot be taken. Take the skill off, or take this advancement at the table.",
  rerolled: "This roll was rolled again past Block, which the player has no more: give the skill back before taking the roll, or take this advancement at the table.",
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
const refusal = () => sheet().querySelector(".g-player-sheet__refusal")?.textContent ?? null;
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
const d8 = (number) => sheet().querySelector(`[data-advance-d8="${number}"]`);
const stat = (key) => sheet().querySelector(`[data-advance-stat="${key}"]`);
const statWords = () => sheet().querySelectorAll("[data-advance-stat]").map((item) => [item.querySelector(".g-advance__statkey").textContent, item.querySelector(".g-advance__statchange").textContent]);
const attempts = () => sheet().querySelector("[data-advance-attempts]");
const instead = () => sheet().querySelector("[data-advance-instead]");
const bind = () => sheet().querySelector("[data-advance-bind]");
const lines = () => sheet().querySelectorAll(".g-advance__alert").map((line) => line.textContent);
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

/** On a phone: «Characteristic improvement», «Next». */
function toStat() {
  choose(typeCard("stat"));
  press(next());
}

/** «Roll D16» or «Roll D8» pressed with the server's answer `answer`, and the answer taken. */
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

test("a random skill on the site: declared, then rolled — the die, the skill, the attempts on a press, the table of sixteen faces with his skills struck through", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      choose(typeCard("random"));
      press(next());
      assert.equal(sheet().querySelector(".g-advance__hint").textContent, WORDS.hint);
      choose(category("General"));
      press(next());
      // Declared: the type and the category; the way, the die not rolled, the column of the category.
      assert.equal(title(), "Random skill");
      assert.equal(sub(), "General · 3 SPP");
      assert.equal(dots(), "Step 3 of 3");
      assert.ok(back(), "before the roll the way back is open");
      assert.equal(switchOf().getAttribute("role"), "radiogroup");
      assert.equal(switchOf().getAttribute("aria-label"), "How it is rolled");
      assert.deepEqual(ways().map((item) => [item.textContent, item.getAttribute("aria-checked")]), [["Roll on the site", "true"], ["Rolled at the table", "false"]]);
      assert.ok(ways().every((item) => !closed(item)));
      assert.equal(note(), WORDS.site);
      assert.equal(dieValue(), "?");
      assert.equal(sheet().querySelector(".g-die__type").textContent, "D16");
      assert.equal(result(), "A D16 on the category's table");
      assert.equal(faces().length, 16);
      assert.ok(faces().every(closed), "on the site the faces only show");
      assert.equal(rollButton().textContent, "Roll D16");
      assert.ok(!take(), "nothing to take before the roll");
      // Rolled.
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(asks().map(({ body }) => body), [{ purpose: "random_skill", category: "General" }]);
      assert.equal(dieValue(), "4");
      assert.equal(result(), "Frenzy · rolled again: 1");
      assert.equal(attempts().textContent, "Attempts: 2");
      assert.equal(attempts().getAttribute("aria-expanded"), "false");
      press(attempts());
      assert.equal(attempts().getAttribute("aria-expanded"), "true");
      assert.deepEqual(sheet().querySelectorAll(".g-advance__attempt").map((item) => item.textContent), ["1 — Block, held already, rolled again", "4 — Frenzy"]);
      // The sixteen faces of General: Block his and struck through, Frenzy the face it ended on.
      assert.equal(faces().length, 16);
      assert.deepEqual(faces().map((item) => item.querySelector(".g-advance__facenum").textContent), Array.from({ length: 16 }, (_, at) => String(at + 1)));
      assert.equal(faceName(1), "Block");
      assert.ok(isHeld(face(1)) && !isHit(face(1)));
      assert.ok(isHit(face(4)) && face(4).getAttribute("aria-checked") === "true");
      assert.deepEqual(faces().filter(isHeld).map((item) => item.getAttribute("data-advance-face")), ["1"]);
      assert.equal(sheet().querySelector(".g-advance__faces").getAttribute("aria-label"), "Faces of the D16");
      assert.equal(note(), WORDS.rolledSite);
      // Fixed: the way, and no way back (decision 9); the roll stays his, and the sheet says so.
      assert.ok(ways().every(closed));
      assert.ok(ways().every((item) => item.getAttribute("title") === WORDS.kept));
      assert.ok(!back());
      assert.ok(sheet().querySelector(".g-advance__kept").textContent === WORDS.kept);
      assert.ok(!rollButton());
      assert.equal(take().textContent, "Take: Frenzy");
      assert.ok(!take().hasAttribute("disabled") && !closed(take()));
      // A press on the closed switch says why, and changes nothing.
      press(way("table"));
      assert.equal(toasts().at(-1), WORDS.kept);
      assert.equal(way("site").getAttribute("aria-checked"), "true");
      assertCspSafe(view);
      assertStyled(view, ...ROLL_STYLES);
    });
    // A desk: the type and the category are fixed too, each saying why.
    await openAdvance(false);
    choose(typeCard("random"));
    choose(category("General"));
    await rollWith("p1", 200, { roll: ROLL_SKILL });
    assert.ok(types().every(closed), "every type closed once the roll is made");
    assert.equal(typeCard("random").getAttribute("aria-checked"), "true");
    assert.equal(typeCard("primary").getAttribute("title"), WORDS.kept);
    assert.ok(categories().every(closed));
    assert.ok(ways().every(closed));
    press(typeCard("primary"));
    assert.equal(toasts().at(-1), WORDS.kept);
    assert.equal(typeCard("random").getAttribute("aria-checked"), "true", "nothing changed");
    assert.equal(summary(), "Random primary skill · General · Frenzy — 3 SPP");
    assertStyled(view, ...ROLL_STYLES);
  });
});

test("taken: one PATCH naming the roll; done says how it came", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      const taken = { type: "random", grants: { skill: "Frenzy" }, roll: { id: "r1", via: "site" } };
      api.reply(PATCH, 200, { team: withOne({ ...ANN, extraSkills: [BLOCK, { name: "Frenzy", access: "primary" }], advancements: [taken] }, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["Frenzy", "Random primary skill · General · rolled on the site"]);
      assert.deepEqual(tiles(), ["−3", "+20k", "1 / 6"]);
      await settle();
      assert.deepEqual(sentOf("p1"), [[taken]], "one PATCH, the roll named by its id");
      assert.equal(asks().length, 1);
    });
  });
});

// Review Focus 2.
test("a second press on «Roll D16» sends nothing more; while it is out the button says it waits", async () => {
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
      assert.equal(dieValue(), "4");
      assert.equal(asks().length, 1);
    });
  });
});

// Review Focus 2.
test("a roll whose answer was lost is asked again on a press: the server gives the same one back", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true);
      toRandom("General");
      api.fail(ask("p1"));
      press(rollButton());
      await settle();
      assert.deepEqual(lines(), [WORDS.lost]);
      assert.equal(dieValue(), "?");
      assert.ok(!rollButton().hasAttribute("aria-busy") && !closed(rollButton()), "the button open again");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(lines(), []);
      assert.equal(result(), "Frenzy · rolled again: 1");
      assert.equal(asks().length, 2);
      assert.deepEqual(asks()[0].body, asks()[1].body, "the same ask, the same roll");
      api.reply(PATCH, 200, { team: withOne(ANN, { revision: 5 }) });
      press(take());
      assert.ok(!take(), "done: a second press finds nothing to take");
      await settle();
      assert.deepEqual(sentOf("p1").map((sent) => sent.length), [1], "one advancement");
    });
  });
});

// Review Focus 3.
test("a roll of the other purpose waits: the sheet says which to take, and the type is closed", async () => {
  await withoutTimers(async () => {
    await openAdvance(false);
    choose(typeCard("random"));
    choose(category("General"));
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
    assert.equal(asks().length, 1, "a closed «Roll D16» asks nothing");
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
      const general = { ...ROLL_SKILL, playerId: "p3", result: { attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" } };
      await rollWith("p3", 200, { roll: general });
      assert.deepEqual(asks("p3").map(({ body }) => body), [{ purpose: "random_skill", category: "Agility" }]);
      assert.deepEqual(lines(), ["The roll is made already — in General"]);
      assert.equal(sub(), "General · 3 SPP");
      assert.deepEqual([faceName(1), faceName(16)], ["Block", "Thick Skull"], "General's column");
      assert.equal(take().textContent, "Take: Frenzy");
      assert.ok(!closed(take()));
    });
  });
});

// Review Focus 3, T1 review Minor 4, K15.
test("a stale roll: why it cannot be taken, the table open, and the table advancement that gave the skill offered", async () => {
  const atTable = { type: "random", grants: { skill: "Frenzy" }, roll: { via: "table" } };
  const ann = { ...ANN, extraSkills: [BLOCK, { name: "Frenzy", access: "primary" }], advancements: [atTable] };
  const stale = { ...ROLL_SKILL, stale: true };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(ann) });
      toRandom("General");
      await rollWith("p1", 200, { roll: stale });
      assert.deepEqual(lines(), [WORDS.stale]);
      assert.equal(take().textContent, "Take: Frenzy");
      assert.ok(closed(take()));
      assert.equal(take().getAttribute("title"), WORDS.stale);
      assert.ok(!closed(way("table")), "«Rolled at the table» open (decision 11)");
      assert.equal(bind().textContent, "Record this roll for the advancement «Frenzy» taken at the table");
      // A press on the closed «Take» sends nothing.
      press(take());
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
      api.reply(PATCH, 200, { team: withOne({ ...ann, advancements: [{ ...atTable, roll: { id: "r1", via: "site" } }] }, { revision: 5 }) });
      press(bind());
      assert.ok(!sheet());
      assert.equal(toasts().at(-1), "The roll is recorded for «Frenzy»");
      await settle();
      assert.deepEqual(sentOf("p1"), [[{ ...atTable, roll: { id: "r1", via: "site" } }]]);
    });
    // The table instead: the way is open, and a face of a skill he lacks is taken at the table.
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne(ann) });
      toRandom("General");
      await rollWith("p1", 200, { roll: stale });
      choose(way("table"));
      assert.equal(note(), WORDS.table);
      assert.ok(!bind());
      assert.ok(closed(face(4)) && closed(face(1)), "his Frenzy and Block");
      choose(face(3));
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
      assert.equal(dieValue(), "?");
      assert.equal(reads(), before + 1, "read again");
    });
  });
});

test("a roll rerolled past a skill he has no more cannot be taken, and says why", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { teamAnswer: withOne({ ...ANN, extraSkills: [] }) });
      toRandom("General");
      await rollWith("p1", 200, { roll: ROLL_SKILL });
      assert.deepEqual(lines(), [WORDS.rerolled]);
      assert.ok(closed(take()));
      assert.equal(take().getAttribute("title"), WORDS.rerolled);
      assert.ok(!bind(), "no table advancement gave Frenzy");
      assert.ok(ways().every(closed), "only a stale roll leaves the way open");
      press(take());
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

test("rolled at the table: the coach presses the face; only a face with a skill he lacks; the advancement says «at the table»", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openAdvance(true, { id: "p3", teamAnswer: withOne(CADE) });
      toRandom("Agility");
      choose(way("table"));
      assert.equal(way("table").getAttribute("aria-checked"), "true");
      assert.equal(note(), WORDS.table);
      assert.equal(take().textContent, "Choose the skill rolled");
      assert.ok(take().hasAttribute("disabled"));
      assert.ok(!rollButton());
      assert.equal(faces().length, 16);
      // Agility has fourteen skills: 15 and 16 are blank, and closed; his Catch and Dodge struck through, closed.
      for (const number of [15, 16]) {
        assert.ok(closed(face(number)));
        assert.equal(face(number).querySelector('.g-advance__facename [aria-hidden="true"]').textContent, "—");
        assert.equal(face(number).querySelector(".g-sr-only").textContent, "no skill");
      }
      assert.ok(isHeld(face(1)) && closed(face(1)) && faceName(1) === "Catch");
      assert.ok(isHeld(face(4)) && closed(face(4)) && faceName(4) === "Dodge");
      assert.deepEqual(faces().filter((item) => !closed(item)).map((item) => item.getAttribute("data-advance-face")), ["2", "3", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
      // A blank face pressed: said, and nothing chosen.
      press(face(15));
      assert.equal(toasts().at(-1), "no skill");
      assert.equal(take().textContent, "Choose the skill rolled");
      choose(face(2));
      assert.equal(face(2).getAttribute("aria-checked"), "true");
      assert.ok(isHit(face(2)));
      assert.equal(dieValue(), "2");
      assert.equal(result(), "Diving Catch");
      assert.equal(note(), WORDS.rolledTable);
      assert.equal(take().textContent, "Take: Diving Catch");
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      press(take());
      assert.deepEqual(doneWords(), ["Diving Catch", "Random primary skill · Agility · rolled at the table"]);
      await settle();
      assert.equal(asks("p3").length, 0, "no POST: the die was the coach's");
      assert.deepEqual(sentOf("p3"), [[{ type: "random", grants: { skill: "Diving Catch" }, roll: { via: "table" } }]]);
    });
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
      assert.equal(note(), WORDS.site);
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
      assert.ok(!sheet().querySelector(".g-advance__d8"), "the faces go once one is pressed (Adv3StatTable)");
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
    assert.equal(summary(), "Characteristic improvement — 14 SPP");
    assert.equal(take().textContent, "Choose a characteristic");
    await rollWith("p1", 200, { roll: ROLL_D8 });
    assert.deepEqual(columns()[2].querySelectorAll("[data-advance-stat]").map((item) => item.getAttribute("data-advance-stat")), ["ar", "ma", "pa"]);
    choose(stat("ma"));
    assert.equal(summary(), "Characteristic improvement · MA — 14 SPP");
    assert.equal(take().textContent, "Improve MA");
    assertStyled(view, ...ROLL_STYLES);
    // A random skill: the roll in column 3, its button beside the die.
    await openAdvance(false, { teamAnswer: withOne(CADE), id: "p3" });
    choose(typeCard("random"));
    assert.deepEqual(heads(), ["1 · Type", "2 · Category", "3 · Skill roll"]);
    assert.equal(columns()[2].querySelector(".g-advance__empty").textContent, "Choose a category");
    choose(category("Agility"));
    assert.equal(columns()[2].querySelector("[data-advance-roll]").textContent, "Roll D16");
    assert.equal(columns()[2].querySelectorAll("[data-advance-face]").length, 16);
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
  assertDictionaryCovers("src/screens/team/roster/roll-view.mjs", "src/screens/team/roster/advance.mjs", "src/screens/team/roster/advance-sheet.mjs");
  const css = text(ROLLS);
  assert.doesNotMatch(css, /--focus-ring/);
  const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  assert.deepEqual(queries, ["(max-width: 900px)", "(min-width: 901px)"], "only the stage's two breakpoints");
  for (const selector of ["#player-advance .g-advance__note", "#player-advance .g-advance__result", "#player-advance .g-advance__face", "#player-advance .g-advance__facenum",
    "#player-advance .g-advance__d8face", "#player-advance .g-advance__stat", "#player-advance .g-advance__table", "#player-advance .g-advance__instead",
    "#player-advance .g-advance__insteadtitle", "#player-advance .g-advance__insteadsub", "#player-advance .g-advance__attempts", "#player-advance .g-advance__attemptlist",
    "#player-advance .g-advance__kept", "#player-advance .g-seg__item"]) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(ROLLS, selector, property).length >= 1, `${selector} ${property}`);
  }
  // Adv3Random, Adv3Stat, Adv3StatTable up to 900px; DeskRosterAdv and DeskRosterAdvStat from 901px.
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-seg__item", "font"), ["600 14px/normal var(--font-body)", "600 13px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__note", "font"), ["400 12px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__result", "font"), ["600 15px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__faces", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__faces", "column-gap"), ["var(--space-10)", "var(--space-8)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__d8", "grid-template-columns"), ["repeat(8, minmax(0, 1fr))", "repeat(4, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__d8face", "font"), ["700 18px/normal var(--font-display)", "700 17px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__table", "font"), ["400 13px/1.45 var(--font-body)", "400 13px/1.6 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__stat", "min-height"), ["52px"]);
  assert.deepEqual(valuesOf(ROLLS, '#player-advance .g-advance__stat[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__face--hit", "background"), ["var(--accent)"]);
  assert.deepEqual(valuesOf(ROLLS, "#player-advance .g-advance__face--held", "text-decoration"), ["line-through"]);
  assertReadable(ROLLS, "#player-advance .g-advance__note", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__result", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__face--hit", "color", ["--accent"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__face--held", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-seg__item", "color", ["--surface-3"], 4.5);
  assertReadable(ROLLS, "#player-advance .g-advance__attempts", "color", ["--surface"], 4.5);
  // D2: up to 900px what is pressed is 44px or more; from 901px as the prototypes, never under 24px.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (query) => bare.slice(bare.indexOf(`@media (${query}) {`), bare.indexOf("\n}", bare.indexOf(`@media (${query}) {`)));
  const height = (query, selector) => Number(block(query).match(new RegExp(`${selector.replace(/[.[\]"]/g, "\\$&")} \\{[^}]*min-height: (\\d+)px;`))?.[1]);
  for (const selector of ["#player-advance .g-advance__face", "#player-advance .g-seg__item", "#player-advance .g-advance__d8face", "#player-advance .g-advance__attempts"]) {
    assert.ok(height("max-width: 900px", selector) >= 44, `${selector} on a phone`);
  }
  assert.equal(height("min-width: 901px", "#player-advance .g-advance__face"), 28);
  assert.equal(height("min-width: 901px", "#player-advance .g-seg__item"), 36);
  assert.equal(height("min-width: 901px", "#player-advance .g-advance__d8face"), 40);
  for (const selector of ["#player-advance .g-advance__face", "#player-advance .g-seg__item", "#player-advance .g-advance__d8face", "#player-advance .g-advance__attempts"]) {
    assert.ok((height("min-width: 901px", selector) || 44) >= 24, `${selector} on a desk`);
  }
  // Imported after advance.css (K5: a relative order); the roster's chain stays in order (test/team-roster.test.mjs).
  const styles = text("src/styles.css");
  const at = (name) => styles.indexOf(`@import url("screens/team/roster/${name}");`);
  assert.ok(at("profile.css") >= 0 && at("player-sheets.css") > at("profile.css") && at("advance.css") > at("player-sheets.css") && at("rolls.css") > at("advance.css"));
});

// The owner's answer on wrapping: a long skill wraps on its face; «…» hides nothing in 07d.
test("a long skill on a face wraps; nothing is cut with «…»", () => {
  const css = text(ROLLS);
  assert.doesNotMatch(css, /text-overflow/);
  for (const selector of ["#player-advance .g-advance__facename", "#player-advance .g-advance__note", "#player-advance .g-advance__result", "#player-advance .g-advance__statchange",
    "#player-advance .g-advance__insteadtitle", "#player-advance .g-advance__insteadsub", "#player-advance .g-advance__attempt", "#player-advance .g-advance__kept"]) {
    assert.deepEqual(valuesOf(ROLLS, selector, "overflow-wrap"), ["anywhere"], selector);
  }
});

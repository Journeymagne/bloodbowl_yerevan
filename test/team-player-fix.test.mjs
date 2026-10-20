import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  ADVANCED, LIVE_GAME, PLAYERS, STYLES, api, aside, coach, loadGames, playerPage, renderTeamRoster, save, settle, state, team, text, toggle, view, withPlayers,
} from "./helpers/roster-page.mjs";

const { FIX_REFUSALS } = await import("../src/domain/roster/edits.mjs");
const { prepResetWords } = await import("../src/screens/team/roster/panel.mjs");

// Stage 07d, Task 13: «Edit the player» leads to the fix by hand — what only the 2.x editor could put right (decision
// 24): the Niggling Injuries as a count, a lasting injury marked by mistake, a characteristic, the extended contracts
// (+20k to the value each, owner's «в стоимости»), the favoured skills and a skill no advancement gave. No prototype: the
// frame is the edit's (PlayerEdit.html, DeskRosterEdit.html), the counters stage 08's «Ресурсы» (TeamManage.html), the
// skills chips. «Save» is one step of the roster's save queue. The page, the coach and his team are
// helpers/roster-page.mjs's: Ann 1, Bors 2, Cade 3 — a Catcher, here with Frenzy from his first advancement — and four
// who miss the next match.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const FIX = "src/screens/team/roster/fix.css";
const OPEN = "Fix by hand: injuries, characteristics, contract, skills, advancements";
const SAVE_FIRST = "Save or cancel the edit first";
const SUB = "What was settled at the table otherwise than the site recorded";
const HEAL_NOTE = "Take off only what was marked by mistake: «Back on the roster» keeps an injury's effects.";
const CLOSED = "Number, name and captain — after the post-match";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";
const MISMATCH = "A roll on the site was rerolled against this skill, so it stays.";
const CHANGED = "The player's data has changed — open the fix again";
const DROPPED = "A match has begun, so the player edits and advancements that were waiting were not saved. Make them again after the post-match.";
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
const FIX_STYLES = [...STYLES, "toggle.css", "text-field.css", "resource-counter.css"];

/** Dell: the lasting injury he misses the next match for (MA −1) and one Niggling Injury (stage 07b's hand-over). */
const DELL = { ...PLAYERS[3], injuryStatMods: { ma: -1 }, nigglingInjuries: 1 };
/** Ann with Block that no advancement gave: the 2.x editor added it by hand. */
const ANN = { ...PLAYERS[0], extraSkills: [{ name: "Block" }] };
// Nurgle's Rotter Lineman with a favoured skill of his own, and the Rotspawn, whose position has no PA (K22).
const ROT = { id: "n1", rowIndex: 0, number: "1", name: "Rot", favouredSkills: [{ name: "Bone Hook", access: "favoured" }] };
const SPAWN = { id: "n2", rowIndex: 3, number: "2", name: "Spawn" };
const nurgle = (players, over = {}) => team({ baseTeamSlug: "teams/nurgle", roster: { favouredChoice: "Nurgle", players }, ...over });

const patches = () => api.calls.filter(({ key }) => key === PATCH);
const teamReads = () => api.calls.filter(({ key }) => key === TEAM_READ).length;
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const elements = (parent) => parent.childNodes.filter((node) => node.nodeType === 1);
const status = () => view.querySelector(".g-roster__status").textContent;
const editSheet = () => view.querySelector("dialog#player-edit");
const fixSheet = () => view.querySelector("dialog#player-fix");
const pencil = () => view.querySelector("[data-player-edit]");
const entry = () => view.querySelector("[data-player-fix]");
const numberField = () => editSheet().querySelector("#player-edit-number");
const titles = () => fixSheet().querySelectorAll(".g-player-fix__block .g-player-fix__title").map((title) => title.textContent);
const blockOf = (title) => fixSheet().querySelectorAll(".g-player-fix__block").find((block) => block.querySelector(".g-player-fix__title")?.textContent === title);
const counter = (key) => fixSheet().querySelector(`[data-resource-key="${key}"]`);
const valueOf = (key) => counter(key).querySelector(".g-resource__value").textContent;
const noteOf = (key) => counter(key).querySelector(".g-resource__note")?.textContent ?? "";
const plus = (key) => counter(key).querySelector('[data-resource-step="1"]');
const minus = (key) => counter(key).querySelector('[data-resource-step="-1"]');
const toggleOf = (attribute, value) => fixSheet().querySelectorAll(`[${attribute}]`).find((button) => button.getAttribute(attribute) === value);
const nameBy = (toggle) => toggle.closest(".g-player-fix__row").querySelector(".g-player-fix__name").textContent;
const worth = () => fixSheet().querySelector(".g-player-fix__value").textContent;
const saveButton = () => fixSheet().querySelector("[data-fix-save]");
const cancelButton = () => fixSheet().querySelector("[data-fix-keep]");
const refusal = () => fixSheet().querySelector(".g-player-sheet__refusal");
const sentOf = (id, call = patches().at(-1)) => call.body.roster.players.find((player) => player.id === id);
/** t1 on the server with one player in place of his own line. */
const withOne = (player, over = {}) => withPlayers(PLAYERS.map((each) => (each.id === player.id ? player : each)), over);
/** What the coach types in a field: the caret where the typing left it, then the field's own `input`. */
const type = (field, value) => {
  field.focus();
  field.value = value;
  field.selectionStart = value.length;
  field.selectionEnd = value.length;
  fireEvent(field, "input");
};
/** `id`'s edit open — on a phone from his profile's pencil, on a desk from the panel's (him chosen); ADVANCED Cade by default. */
const openEdit = async (phone, { id = "p3", teamAnswer = withOne(ADVANCED), games = [] } = {}) => {
  coach({ teamAnswer, open: phone ? null : `${id}#0` });
  gamesAre(games);
  if (phone) await playerPage(id);
  else await renderTeamRoster("t1");
  fireEvent(pencil(), "click");
};
/** `id`'s fix open, from his edit. */
const openFix = async (phone, options = {}) => {
  await openEdit(phone, options);
  fireEvent(entry(), "click");
};
/** A match begins on another device: the games say so, and `server` is the roster the server holds. */
const matchBegins = async (server) => {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
};

test("the edit leads to the fix by hand; while the edit's fields are changed it says to save or cancel first", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openEdit(phone);
        const line = entry();
        assert.equal(line.tagName, "BUTTON");
        assert.equal(line.getAttribute("type"), "button");
        assert.equal(line.getAttribute("class"), "g-player-edit__fix");
        assert.equal(line.getAttribute("aria-haspopup"), "dialog");
        assert.equal(line.getAttribute("data-player-fix"), "p3#0");
        assert.equal(line.textContent, OPEN);
        assert.ok(line.querySelector("svg.g-icon"), "the chevron");
        assert.ok(elements(editSheet().querySelector(".g-sheet__body")).at(-1) === line, "the body's last line");
        assert.ok(!line.hasAttribute("aria-disabled"));
        // The number changed: the line says to save or cancel first (K7), and opens nothing.
        type(numberField(), "12");
        assert.equal(entry().getAttribute("aria-disabled"), "true");
        assert.equal(entry().getAttribute("title"), SAVE_FIRST);
        assert.ok(entry().hasAttribute("data-roster-closed"));
        fireEvent(entry(), "click");
        assert.equal(toasts().at(-1), SAVE_FIRST);
        assert.ok(editSheet()?.isModal && !fixSheet(), "the edit stays");
        type(numberField(), "3");
        assert.ok(!entry().hasAttribute("aria-disabled"), "back as it was");
        fireEvent(entry(), "click");
        assert.ok(!editSheet(), "the same draw closes the edit");
        const sheet = fixSheet();
        assert.ok(sheet?.isModal, "dialog#player-fix, open");
        assert.equal(sheet.getAttribute("class"), "g-sheet g-player-sheet", "in the frame a player's sheets share");
        assert.equal(sheet.querySelector("h2").textContent, "Fix by hand");
        assert.equal(sheet.querySelector(".g-sheet__sub").textContent, SUB);
        // Cade's Frenzy: the last block, «Advancements», holds the undo of it (Task 23; test/team-advance-undo.test.mjs).
        assert.deepEqual(titles(), ["Injuries", "Characteristics", "Advancements"], "no favour, no skill outside an advancement");
        // The contracts' block has no title of its own: its one row says it.
        assert.equal(fixSheet().querySelectorAll(".g-player-fix__block").length, 4);
        assert.ok(!counter("fix:contracts").closest(".g-player-fix__block").querySelector(".g-player-fix__title"));
        assert.equal(saveButton().textContent, "Save");
        assert.ok(saveButton().hasAttribute("disabled"), "nothing changed yet");
        assert.ok(saveButton().getAttribute("class").includes("g-btn--primary"));
        assert.equal(cancelButton().textContent, "Cancel");
        assertCspSafe(view);
        // «Cancel»: closed, the focus back on the pencil that opened the edit, nothing sent.
        fireEvent(cancelButton(), "click");
        assert.ok(!fixSheet() && !editSheet());
        assert.ok(document.activeElement === pencil());
        await settle();
        assert.equal(patches().length, 0);
      });
    }
  });
});

// Hand-over from 07b: «Back on the roster» keeps an injury's effects; a mistaken one is taken off here.
test("a mistaken injury taken off: one point of a lasting one; the Niggling Injuries set as a count", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone, { id: "p4", teamAnswer: withOne(DELL) });
        const injuries = blockOf("Injuries");
        assert.equal(counter("fix:niggling").querySelector(".g-resource__name").textContent, "Niggling Injury");
        assert.equal(valueOf("fix:niggling"), "1");
        const heal = toggleOf("data-fix-lasting", "ma");
        assert.equal(heal.tagName, "BUTTON");
        assert.equal(heal.getAttribute("type"), "button");
        assert.equal(heal.textContent, "Take one off");
        assert.equal(heal.getAttribute("aria-pressed"), "false");
        assert.equal(nameBy(heal), "Lasting Injury (MA) · −1");
        assert.equal(injuries.querySelector(".g-player-fix__note").textContent, HEAL_NOTE);
        assert.equal(valueOf("fix:stat:ma"), "5");
        heal.focus();
        fireEvent(heal, "click");
        assert.equal(toggleOf("data-fix-lasting", "ma").getAttribute("aria-pressed"), "true");
        assert.ok(document.activeElement === toggleOf("data-fix-lasting", "ma"), "the focus stays on it");
        assert.equal(valueOf("fix:stat:ma"), "6", "the point comes back");
        assert.equal(noteOf("fix:stat:ma"), "", "no correction of its own");
        fireEvent(minus("fix:niggling"), "click");
        assert.equal(valueOf("fix:niggling"), "0");
        assert.ok(minus("fix:niggling").hasAttribute("disabled"), "none below zero");
        assert.equal(worth(), "Player's value: 50k → 50k");
        assert.ok(!saveButton().hasAttribute("disabled"));
        api.reply(PATCH, 200, { team: withOne({ ...DELL, nigglingInjuries: 0, niglingInjury: false, statMods: {}, injuryStatMods: {} }, { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.equal(patches().length, 1);
        const sent = sentOf("p4");
        assert.equal(sent.nigglingInjuries, 0);
        assert.equal(sent.niglingInjury, false);
        assert.ok(!Object.hasOwn(sent.injuryStatMods ?? {}, "ma"), "the injury's own tally");
        assert.ok(!Object.hasOwn(sent.statMods ?? {}, "ma"), "and the characteristic");
        // No injuries: the block holds the Niggling Injuries alone, at 0.
        await openFix(phone);
        assert.deepEqual(elements(blockOf("Injuries")).map((node) => node.getAttribute("class")), ["g-player-fix__title", "g-resource"]);
        assert.equal(valueOf("fix:niggling"), "0");
      });
    }
  });
});

test("a characteristic put right: a point a press, its value and the player's value said; at the limit «+» says why", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        // ADVANCED Cade: a Catcher (75k) with Frenzy (20k).
        await openFix(phone);
        assert.deepEqual(blockOf("Characteristics").querySelectorAll(".g-resource__name").map((name) => name.textContent), ["MA", "ST", "AG", "PA", "AR"]);
        assert.equal(valueOf("fix:stat:ma"), "8");
        assert.equal(noteOf("fix:stat:ma"), "");
        assert.equal(worth(), "Player's value: 95k → 95k");
        fireEvent(plus("fix:stat:ma"), "click");
        assert.equal(valueOf("fix:stat:ma"), "9");
        assert.equal(noteOf("fix:stat:ma"), "+1");
        assert.equal(worth(), "Player's value: 95k → 125k");
        assert.equal(fixSheet().querySelector(".g-player-fix__value b").textContent, "125k", "the value after, bold");
        assert.ok(!saveButton().hasAttribute("disabled"));
        assert.equal(plus("fix:stat:ma").getAttribute("aria-disabled"), "true");
        assert.equal(plus("fix:stat:ma").getAttribute("title"), "MA cannot improve further");
        fireEvent(plus("fix:stat:ma"), "click");
        assert.equal(toasts().at(-1), "MA cannot improve further");
        assert.equal(valueOf("fix:stat:ma"), "9");
        fireEvent(minus("fix:stat:ma"), "click");
        fireEvent(minus("fix:stat:ma"), "click");
        assert.equal(valueOf("fix:stat:ma"), "7");
        assert.equal(noteOf("fix:stat:ma"), "−1");
        assert.equal(worth(), "Player's value: 95k → 95k", "a characteristic lowered costs nothing");
        // AG: the lower the target, the better.
        fireEvent(plus("fix:stat:ag"), "click");
        assert.equal(valueOf("fix:stat:ag"), "2+");
        assert.equal(noteOf("fix:stat:ag"), "+1");
        // A position without PA: the row closed, saying so.
        await openFix(phone, { id: "n2", teamAnswer: nurgle([ROT, SPAWN]) });
        assert.ok(counter("fix:stat:pa").getAttribute("class").includes("g-resource--locked"));
        assert.equal(noteOf("fix:stat:pa"), "PA: the position has none");
        assert.equal(valueOf("fix:stat:pa"), "–");
        assert.equal(plus("fix:stat:pa").getAttribute("title"), "PA: the position has none");
        fireEvent(plus("fix:stat:pa"), "click");
        assert.equal(toasts().at(-1), "PA: the position has none");
        assert.ok(saveButton().hasAttribute("disabled"));
      });
    }
  });
});

test("contracts: +20k to the value each, from 0 to 20", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone);
        assert.equal(counter("fix:contracts").querySelector(".g-resource__name").textContent, "Extended contracts");
        assert.equal(noteOf("fix:contracts"), "+20k to the value for each");
        assert.equal(valueOf("fix:contracts"), "0");
        assert.ok(minus("fix:contracts").hasAttribute("disabled"));
        fireEvent(plus("fix:contracts"), "click");
        fireEvent(plus("fix:contracts"), "click");
        assert.equal(valueOf("fix:contracts"), "2");
        assert.equal(worth(), "Player's value: 95k → 135k");
        api.reply(PATCH, 200, { team: withOne({ ...ADVANCED, extendedContracts: 2 }, { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.equal(patches().length, 1);
        assert.equal(sentOf("p3").extendedContracts, 2);
        // Twenty: the «+» says why.
        await openFix(phone, { teamAnswer: withOne({ ...ADVANCED, extendedContracts: 20 }) });
        assert.equal(valueOf("fix:contracts"), "20");
        assert.equal(plus("fix:contracts").getAttribute("aria-disabled"), "true");
        assert.equal(plus("fix:contracts").getAttribute("title"), "Extended contracts: from 0 to 20");
        fireEvent(plus("fix:contracts"), "click");
        assert.equal(toasts().at(-1), "Extended contracts: from 0 to 20");
        assert.equal(valueOf("fix:contracts"), "20");
      });
    }
  });
});

test("favoured skills: his own taken off, one from the list added; a team without a god has none of it", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone, { id: "n1", teamAnswer: nurgle([ROT, SPAWN]) });
        assert.deepEqual(titles(), ["Injuries", "Characteristics", "Favoured of Nurgle"]);
        const own = toggleOf("data-fix-favoured", "Bone Hook");
        assert.equal(own.textContent, "Take off");
        assert.equal(nameBy(own), "Bone Hook");
        assert.equal(own.getAttribute("aria-pressed"), "false");
        const chips = blockOf("Favoured of Nurgle").querySelectorAll(".g-player-fix__chips [data-fix-favoured]");
        assert.deepEqual(chips.map((chip) => chip.textContent), ["Add Tentacles", "Add Monstrous Mouth"], "the list's, his own Bone Hook not again");
        fireEvent(own, "click");
        fireEvent(toggleOf("data-fix-favoured", "Tentacles"), "click");
        assert.equal(toggleOf("data-fix-favoured", "Bone Hook").getAttribute("aria-pressed"), "true");
        assert.equal(toggleOf("data-fix-favoured", "Tentacles").getAttribute("aria-pressed"), "true");
        // A second press takes it back.
        fireEvent(toggleOf("data-fix-favoured", "Monstrous Mouth"), "click");
        fireEvent(toggleOf("data-fix-favoured", "Monstrous Mouth"), "click");
        assert.equal(toggleOf("data-fix-favoured", "Monstrous Mouth").getAttribute("aria-pressed"), "false");
        api.reply(PATCH, 200, { team: nurgle([{ ...ROT, favouredSkills: [{ name: "Tentacles", access: "favoured" }] }, SPAWN], { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.equal(patches().length, 1);
        assert.deepEqual(sentOf("n1").favouredSkills, [{ name: "Tentacles", access: "favoured" }]);
        // Humans have no god.
        await openFix(phone);
        assert.ok(!titles().some((title) => title.startsWith("Favoured")));
        assert.ok(!fixSheet().querySelector("[data-fix-favoured]"));
      });
    }
  });
});

// Fix round 1, M6: taking a favoured skill off needs no god; adding one does.
test("a roster that names no god still takes a player's own favoured skills off, and adds none", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        const favoured = { ...PLAYERS[0], favouredSkills: [{ name: "Tentacles", access: "favoured" }] };
        await openFix(phone, { id: "p1", teamAnswer: withOne(favoured) });
        assert.deepEqual(titles(), ["Injuries", "Characteristics", "Favoured skills"]);
        const own = toggleOf("data-fix-favoured", "Tentacles");
        assert.equal(own.textContent, "Take off");
        assert.equal(nameBy(own), "Tentacles");
        assert.ok(!fixSheet().querySelector(".g-player-fix__chips"), "nothing to add without a god");
        fireEvent(own, "click");
        assert.equal(toggleOf("data-fix-favoured", "Tentacles").getAttribute("aria-pressed"), "true");
        api.reply(PATCH, 200, { team: withOne({ ...favoured, favouredSkills: [] }, { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.equal(patches().length, 1);
        assert.deepEqual(sentOf("p1").favouredSkills, []);
      });
    }
  });
});

test("a skill no advancement gave can be taken off; one an advancement gave is not offered", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone, { id: "p1", teamAnswer: withOne(ANN) });
        assert.deepEqual(titles(), ["Injuries", "Characteristics", "Skills without an advancement"]);
        const drop = toggleOf("data-fix-drop", "Block");
        assert.equal(drop.textContent, "Take off");
        assert.equal(nameBy(drop), "Block");
        assert.equal(drop.getAttribute("aria-describedby"), drop.closest(".g-player-fix__row").querySelector(".g-player-fix__name").getAttribute("id"), "the button names its skill");
        fireEvent(drop, "click");
        assert.equal(toggleOf("data-fix-drop", "Block").getAttribute("aria-pressed"), "true");
        assert.equal(worth(), "Player's value: 70k → 50k");
        api.reply(PATCH, 200, { team: withOne({ ...ANN, extraSkills: [] }, { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.deepEqual(sentOf("p1").extraSkills, []);
        // Cade's Frenzy came with his advancement: undone there, not here.
        await openFix(phone);
        assert.ok(!titles().includes("Skills without an advancement"));
        assert.ok(!fixSheet().querySelector("[data-fix-drop]"));
      });
    }
  });
});

// K16: the server keeps a skill a used site roll was rerolled against; the fix's 422 is said in the player's words.
test("a skill the server keeps for a used roll: the refusal said, and the roster read again", async () => {
  await withoutTimers(async () => {
    await openFix(false, { id: "p1", teamAnswer: withOne(ANN) });
    fireEvent(toggleOf("data-fix-drop", "Block"), "click");
    const before = teamReads();
    api.reply(PATCH, 422, { error: { code: "DICE_ROLL_MISMATCH", params: { playerId: "p1" }, message: "x" } });
    fireEvent(saveButton(), "click");
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(toasts().at(-1), MISMATCH);
    assert.equal(teamReads(), before + 1, "the server's roster read again");
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

// Fix round 1, M2: K16's second case — a favoured skill taken off.
test("a favoured skill the server keeps for a used roll: the same words, and the roster read again", async () => {
  await withoutTimers(async () => {
    await openFix(false, { id: "n1", teamAnswer: nurgle([ROT, SPAWN]) });
    fireEvent(toggleOf("data-fix-favoured", "Bone Hook"), "click");
    const before = teamReads();
    api.reply(PATCH, 422, { error: { code: "DICE_ROLL_MISMATCH", params: { playerId: "n1" }, message: "x" } });
    fireEvent(saveButton(), "click");
    await settle();
    assert.equal(patches().length, 1);
    assert.deepEqual(sentOf("n1").favouredSkills, [], "Bone Hook was sent taken off");
    assert.equal(toasts().at(-1), MISMATCH);
    assert.equal(teamReads(), before + 1, "the server's roster read again");
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

/**
 * Cade's fix open on a desk, his contracts one more, while a step of the queue is refused by a 422 whose read of the
 * server's roster failed: the fix's «Save» is refused in turn, said in the sheet, and the server's roster read again —
 * as `server` says it.
 */
const refusedSave = async (server) => {
  coach({ teamAnswer: withOne(ADVANCED), open: "p5#0" });
  await renderTeamRoster("t1");
  api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
  api.fail(TEAM_READ);
  fireEvent(aside().querySelector("[data-roster-return]"), "click");
  await settle();
  assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"]);
  fireEvent(toggle("p3#0"), "click");
  fireEvent(pencil(), "click");
  fireEvent(entry(), "click");
  fireEvent(plus("fix:contracts"), "click");
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  saveButton().focus();
  fireEvent(saveButton(), "click");
  assert.match(refusal().textContent, /Ann/, "the rule that refused the queue, in the sheet");
  await settle();
};

// Fix round 1, M1: the form's counts are absolute; a read that changes the player under it must not be overwritten.
test("a read that changes the player under an open fix closes it, saying so, and sends nothing; one that does not keeps it", async () => {
  await withoutTimers(async () => {
    // Another device gave Cade three contracts: the form's one would put them back to one.
    await refusedSave(withOne({ ...ADVANCED, extendedContracts: 3 }, { revision: 6 }));
    assert.ok(!fixSheet(), "closed");
    assert.ok(!view.querySelector("dialog:modal"));
    assert.equal(toasts().at(-1), CHANGED);
    assert.ok(document.activeElement === pencil(), "the focus on the pencil");
    assert.equal(patches().length, 1, "the refused step alone");
    // The server's roster with Cade as he was: the fix stays, with what was chosen, and saves.
    await refusedSave(withOne(ADVANCED, { revision: 6 }));
    assert.ok(fixSheet()?.isModal, "kept");
    assert.equal(valueOf("fix:contracts"), "1");
    assert.ok(!toasts().includes(CHANGED));
    fireEvent(minus("fix:contracts"), "click");
    fireEvent(plus("fix:contracts"), "click");
    api.reply(PATCH, 200, { team: withOne({ ...ADVANCED, extendedContracts: 1 }, { revision: 7 }) });
    fireEvent(saveButton(), "click");
    assert.ok(!fixSheet());
    await settle();
    assert.equal(patches().length, 2);
    assert.equal(sentOf("p3").extendedContracts, 1);
  });
});

// Fix round 2: what the fix's seed leaves out — the player's SPP and name are no part of a fix, and a read that changes
// only them keeps it open.
test("a read that changes only the player's SPP or name keeps the fix open, with what was chosen", async () => {
  await withoutTimers(async () => {
    await refusedSave(withOne({ ...ADVANCED, name: "Cady", spp: { touchdowns: 12 } }, { revision: 6 }));
    assert.ok(fixSheet()?.isModal, "kept");
    assert.ok(!toasts().includes(CHANGED));
    assert.equal(valueOf("fix:contracts"), "1");
    assert.equal(aside().querySelector(".g-roster__pname").textContent, "Cady", "the read is drawn behind it");
    fireEvent(minus("fix:contracts"), "click");
    fireEvent(plus("fix:contracts"), "click");
    api.reply(PATCH, 200, { team: withOne({ ...ADVANCED, name: "Cady", spp: { touchdowns: 12 }, extendedContracts: 1 }, { revision: 7 }) });
    fireEvent(saveButton(), "click");
    assert.ok(!fixSheet());
    await settle();
    assert.equal(patches().length, 2);
    assert.deepEqual([sentOf("p3").name, sentOf("p3").spp, sentOf("p3").extendedContracts], ["Cady", { touchdowns: 12 }, 1], "the read's name and SPP kept");
  });
});

test("saved: one PATCH of the whole roster; the sheet closes, the focus on the pencil; the profile draws the change at once", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone);
        fireEvent(plus("fix:stat:ma"), "click");
        fireEvent(plus("fix:contracts"), "click");
        api.reply(PATCH, 200, { team: withOne({ ...ADVANCED, statMods: { ma: 1 }, extendedContracts: 1 }, { revision: 5 }) });
        fireEvent(saveButton(), "click");
        assert.ok(!fixSheet(), "closed at once: the fix is a step of the queue");
        assert.ok(!view.querySelector("dialog:modal"));
        assert.ok(document.activeElement === pencil(), "the focus on the pencil the edit was opened from");
        assert.ok(!toasts().includes(CHANGED), "its own step is no change made elsewhere");
        const stats = phone ? view.querySelector(".g-profile") : aside();
        assert.equal(stats.querySelector(".g-stat__v").textContent.trim().slice(0, 1), "9", "his MA, at once");
        await settle();
        assert.equal(patches().length, 1);
        const [call] = patches();
        assert.equal(call.body.revision, 4, "on the revision as read");
        assert.equal(call.body.roster.players.length, PLAYERS.length, "the whole roster");
        assert.deepEqual(sentOf("p3").statMods, { ma: 1 });
        assert.equal(sentOf("p3").extendedContracts, 1);
        assert.deepEqual(sentOf("p2"), PLAYERS[1], "the others as they were");
        assert.equal(status(), "Saved");
        assert.equal(save.saveState("t1").waiting, 0);
      });
    }
  });
});

test("on a desk the same fix in a window from the panel's edit", async () => {
  await withoutTimers(async () => {
    await openEdit(false);
    assert.ok(pencil().closest(".g-roster__aside"), "the panel's pencil");
    fireEvent(entry(), "click");
    assert.ok(fixSheet()?.isModal);
    assert.ok(!fixSheet().closest(".g-roster__aside"), "a window over the roster, not in the panel");
    assert.ok(view.querySelector(".g-rtable"), "the roster stays under it");
    fireEvent(fixSheet().querySelector("[data-sheet-close]"), "click");
    assert.ok(!fixSheet());
    assert.ok(document.activeElement === pencil());
  });
});

// Review Focus 4: R8 — nothing is written in a match.
test("closed, saying why: a match on, the screen's lock, no id; a match begun while it is open closes it, the focus on the closed pencil", async () => {
  await withoutTimers(async () => {
    // A match on: the edit is closed, so nothing leads here.
    coach({ teamAnswer: withOne(ADVANCED), open: "p3#0" });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(pencil().getAttribute("aria-disabled"), "true");
    fireEvent(pencil(), "click");
    assert.ok(!entry() && !fixSheet());
    // The screen's lock while the fix is open: «Save» says why, and sends nothing.
    await openFix(false);
    const games = api.hold("GET /api/games");
    const reading = loadGames(true);
    // The games read again: the next draw closes «Save».
    fireEvent(plus("fix:contracts"), "click");
    assert.ok(fixSheet()?.isModal, "a lock closes nothing");
    assert.equal(saveButton().getAttribute("aria-disabled"), "true");
    assert.equal(saveButton().getAttribute("title"), "Loading the matches…");
    fireEvent(saveButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    games.release();
    await reading;
    await settle();
    assert.ok(!saveButton().hasAttribute("aria-disabled"), "open once they have answered");
    // The lock as the press finds it, before the screen is drawn again.
    state.games.loading = true;
    fireEvent(saveButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(fixSheet()?.isModal);
    state.games.loading = false;
    await settle();
    assert.equal(patches().length, 0);
    // The lock in the edit: its line to the fix says why.
    await openEdit(false);
    const held = api.hold("GET /api/games");
    const again = loadGames(true);
    type(numberField(), "3");
    assert.equal(entry().getAttribute("aria-disabled"), "true");
    assert.equal(entry().getAttribute("title"), "Loading the matches…");
    fireEvent(entry(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!fixSheet());
    held.release();
    await again;
    // No id: no edit, and no fix.
    coach({ teamAnswer: team({ roster: { players: [{ rowIndex: 0, number: "1", name: "Nobody" }] } }) });
    await renderTeamRoster("t1");
    fireEvent(pencil(), "click");
    assert.ok(!entry() && !fixSheet());
    // A match begun while it is open closes it; the keyboard finds the closed pencil.
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone);
        plus("fix:contracts").focus();
        fireEvent(plus("fix:contracts"), "click");
        assert.ok(document.activeElement === plus("fix:contracts"), "the keyboard in the sheet");
        gamesAre([LIVE_GAME]);
        await loadGames(true);
        await settle();
        assert.ok(!fixSheet(), "R8");
        assert.ok(!view.querySelector("dialog:modal"));
        assert.ok(document.activeElement === pencil(), "his pencil, where the keyboard was");
        assert.equal(pencil().getAttribute("aria-disabled"), "true");
        assert.equal(pencil().getAttribute("title"), CLOSED);
        assert.equal(patches().length, 0);
      });
    }
  });
});

// Review Focus 4: a fix that waited is a step of the queue, given up with the others when a match begins.
test("a fix that waited for the network is given up when a match begins, and the coach is told", async () => {
  await withoutTimers(async () => {
    await openFix(false);
    api.fail(PATCH);
    fireEvent(plus("fix:contracts"), "click");
    fireEvent(saveButton(), "click");
    await settle();
    assert.equal(status(), "Waiting for the network · edits: 1");
    await matchBegins(withOne(ADVANCED, { revision: 5 }));
    assert.equal(toasts().at(-1), DROPPED);
    assert.deepEqual(toasts().filter((said) => said.startsWith("A match has begun")), [DROPPED], "no SPP, marks or market waited");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
  });
});

test("a refusal is said in the sheet, which stays; a second press on «Save» sends nothing more", async () => {
  await withoutTimers(async () => {
    // Another tab's coach.
    await openFix(false);
    fireEvent(plus("fix:contracts"), "click");
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(saveButton(), "click");
    assert.equal(refusal().textContent, OTHER_TAB);
    assert.equal(refusal().getAttribute("role"), "alert");
    assert.ok(fixSheet()?.isModal, "the sheet stays");
    assert.equal(valueOf("fix:contracts"), "1", "with what was chosen");
    await settle();
    assert.equal(patches().length, 0);
    assertStyled(view, ...FIX_STYLES);
    // A press again: the refusal was the last press's.
    fireEvent(plus("fix:contracts"), "click");
    assert.ok(!refusal());
    // Review Focus 3: the fix is one step; a second press finds no sheet to save from.
    await openFix(false);
    fireEvent(plus("fix:contracts"), "click");
    const send = saveButton();
    api.reply(PATCH, 200, { team: withOne({ ...ADVANCED, extendedContracts: 1 }, { revision: 5 }) });
    fireEvent(send, "click");
    fireEvent(send, "click");
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-fix-save", "true");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

test("names are text", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone, { id: "p1", teamAnswer: withOne({ ...PLAYERS[0], extraSkills: [{ name: HOSTILE }] }) });
        const drop = fixSheet().querySelector("[data-fix-drop]");
        assert.equal(drop.getAttribute("data-fix-drop"), HOSTILE);
        assert.equal(nameBy(drop), HOSTILE);
        fireEvent(drop, "click");
        assert.equal(toggleOf("data-fix-drop", HOSTILE).getAttribute("aria-pressed"), "true");
        assert.ok(!fixSheet().querySelector("img"));
        assertCspSafe(view);
      });
    }
  });
});

test("every key in both dictionaries, every refusal of a fix worded, and the words assume no player's gender", () => {
  assertDictionaryCovers("src/screens/team/roster/fix.mjs", "src/screens/team/roster/player-sheets.mjs");
  const dictionaries = Object.fromEntries(["en", "ru"].map((locale) => [locale, JSON.parse(text(`src/i18n/${locale}.json`))]));
  for (const code of FIX_REFUSALS) for (const words of Object.values(dictionaries)) assert.ok(words[`teamPlayer.refusal.${code}`], code);
  const gendered = {
    en: /\b(he|him|his|she|her|hers)\b/i,
    ru: /(?<![а-яё])(он|она|его|её|ему|ей|носил|носила|стал|стала)(?![а-яё])/iu,
  };
  for (const [locale, pattern] of Object.entries(gendered)) {
    const fix = Object.entries(dictionaries[locale]).filter(([key]) => key.startsWith("teamPlayer.fix."));
    assert.ok(fix.length >= 17, locale);
    assert.deepEqual(fix.filter(([, value]) => pattern.test(value)), [], locale);
  }
});

test("styled: the edit's frame, stage 08's counters, the toggles as chips; its colours readable", async () => {
  await withoutTimers(async () => {
    // Every block at once: Rot's injuries, his favour, a skill no advancement gave; a preparation's words.
    const rot = { ...ROT, extraSkills: [{ name: "Block" }], statMods: { ma: -1 }, injuryStatMods: { ma: -1 }, nigglingInjuries: 1 };
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone, { id: "n1", teamAnswer: nurgle([rot, SPAWN]), games: [PREP_GAME] });
        assert.equal(fixSheet().querySelector(".g-player-sheet__prep").textContent, prepResetWords());
        fireEvent(toggleOf("data-fix-lasting", "ma"), "click");
        fireEvent(toggleOf("data-fix-favoured", "Tentacles"), "click");
        fireEvent(toggleOf("data-fix-drop", "Block"), "click");
        assertCspSafe(view);
        assertStyled(view, ...FIX_STYLES);
      });
    }
    // The edit with its line to the fix, closed and not.
    await openEdit(false);
    assertStyled(view, ...FIX_STYLES);
    type(numberField(), "12");
    assertStyled(view, ...FIX_STYLES);
    const css = text(FIX);
    assert.doesNotMatch(css, /--focus-ring/);
    assert.doesNotMatch(css, /text-overflow/, "a long name wraps; nothing is cut with «…»");
    const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
    assert.deepEqual(queries, ["(max-width: 900px)", "(min-width: 901px)"], "only the stage's two breakpoints");
    for (const selector of [".g-player-fix__title", ".g-player-fix__name", ".g-player-fix__note", ".g-player-fix__toggle", ".g-player-fix__value", "#player-edit .g-player-edit__fix"]) {
      for (const property of ["font", "letter-spacing", "text-transform", "border", "background"]) {
        assert.ok(valuesOf(FIX, selector, property).length >= 1, `${selector} ${property}`);
      }
    }
    // The brief's values: a block under a rule, 14 0; its title 15/700; the note 12/1.4; the toggle 0 12, 10 round, on the
    // surface in a 1px ring, 14/600 — pressed on the tint in a 2px ring of the accent; the value 14px, the one after bold.
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__block", "border-top"), ["1px solid var(--line)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__block", "padding"), ["var(--space-14) 0"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__title", "font"), ["700 15px/normal var(--font-body)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__title", "padding"), ["0 0 2px"], "TeamManage.html's heading over its rows");
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__note", "font"), ["400 12px/1.4 var(--font-body)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__toggle", "padding"), ["0 var(--space-12)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__toggle", "border-radius"), ["var(--radius-md)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__toggle", "background"), ["var(--surface)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__toggle", "box-shadow"), ["inset 0 0 0 1px var(--line-strong)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__toggle", "font"), ["600 14px/normal var(--font-body)"]);
    assert.deepEqual(valuesOf(FIX, '.g-player-fix__toggle[aria-pressed="true"]', "box-shadow"), ["inset 0 0 0 2px var(--accent)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__value", "font"), ["400 14px/normal var(--font-body)"]);
    assert.deepEqual(valuesOf(FIX, ".g-player-fix__after", "font-weight"), ["700"]);
    assert.deepEqual(valuesOf(FIX, "#player-edit .g-player-edit__fix", "font"), ["600 15px/normal var(--font-body)"]);
    assert.deepEqual(valuesOf(FIX, "#player-edit .g-player-edit__fix", "border-top"), ["1px solid var(--line)"]);
    assert.deepEqual(valuesOf(FIX, '#player-edit .g-player-edit__fix[aria-disabled="true"]', "color"), ["var(--disabled)"]);
    assertReadable(FIX, ".g-player-fix__title", "color", ["--surface"], 4.5);
    assertReadable(FIX, ".g-player-fix__name", "color", ["--surface"], 4.5);
    assertReadable(FIX, ".g-player-fix__note", "color", ["--surface"], 4.5);
    assertReadable(FIX, ".g-player-fix__toggle", "color", ["--surface"], 4.5);
    assertReadable(FIX, '.g-player-fix__toggle[aria-pressed="true"]', "color", ["--accent-tint"], 4.5);
    assertReadable(FIX, ".g-player-fix__value", "color", ["--surface"], 4.5);
    assertReadable(FIX, "#player-edit .g-player-edit__fix", "color", ["--surface"], 4.5);
    // The frame and its lines are player-sheets.css's (T8): fix.css copies none of them.
    assert.doesNotMatch(css, /\.g-player-sheet__(prep|refusal)\s*\{[^}]*font/);
    assert.doesNotMatch(css, /\.g-player-sheet \.g-sheet__/);
    // Imported after rolls.css (K5).
    const styles = text("src/styles.css");
    const at = (name) => styles.indexOf(`@import url("screens/team/roster/${name}");`);
    assert.ok(at("rolls.css") >= 0 && at("fix.css") > at("rolls.css"));
  });
});

test("D2: up to 900px the toggles 44px and the line to the fix 52px; from 901px 32px and 44px", () => {
  const css = text(FIX).replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (query) => {
    const start = css.indexOf(`@media (${query}) {`);
    assert.ok(start >= 0, `fix.css has no @media (${query})`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const px = (found) => found.slice(1).map(Number);
  const phone = block("max-width: 900px");
  const desk = block("min-width: 901px");
  assert.deepEqual(px(phone.match(/\.g-player-fix__toggle \{[^}]*min-height: (\d+)px;/)), [44], "a phone's toggles");
  assert.deepEqual(px(phone.match(/#player-edit \.g-player-edit__fix \{[^}]*min-height: (\d+)px;/)), [52], "a phone's line");
  assert.deepEqual(px(desk.match(/\.g-player-fix__toggle \{[^}]*min-height: (\d+)px;/)), [32], "a desk's toggles, 24 or more");
  assert.deepEqual(px(desk.match(/#player-edit \.g-player-edit__fix \{[^}]*min-height: (\d+)px;/)), [44], "a desk's line");
  // The counters are stage 08's as they are: 44px buttons.
  assert.deepEqual(valuesOf("src/ui/resource-counter.css", ".g-resource__btn", "height"), ["var(--size-touch)"]);
});

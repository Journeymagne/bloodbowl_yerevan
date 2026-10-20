import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  ADVANCED, LIVE_GAME, PLAYERS, STYLES, api, aside, coach, loadGames, page, playerPage, renderTeamRoster, save, settle, state, team, text, view, withPlayers,
} from "./helpers/roster-page.mjs";

const { setMyTeams } = await import("../src/data/teams.mjs");

// Stage 07d, Task 11 (decisions 17–19; no prototypes — the look is the 07b/07c sheets', PlayerDeadConfirm.html's question
// and two buttons, StatsSkill.html's skill sheet). «Undo the last: …» under «Advancement» in the profile and under «Advance»
// in the desk's panel asks first, then the last advancement goes as one step of the save queue: what it gave goes, its SPP
// come back, and the server frees its site roll, which the next advancement of its type takes again. A roster «Favoured
// of…» is offered the god's bonus skill on the advancement's done step (owner's answer 3). A skill an advancement gave says
// how in its sheet, and for a site roll what its dice showed, read from the server once a visit. The page, the coach and his team are
// helpers/roster-page.mjs's; ADVANCED is Cade 3 (a Catcher) with Frenzy from a random skill rolled on the site.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const ROLLS_READ = "GET /api/teams/t1/rolls";
const ASK = "POST /api/teams/t1/players/p3/rolls";
const PROFILE = "src/screens/team/roster/profile.css";
const FRAME = "src/screens/team/roster/frame.css";
const SHEETS = "src/screens/team/roster/player-sheets.css";
const ADVANCE = "src/screens/team/roster/advance.css";
const ROLLS = "src/screens/team/roster/rolls.css";
const UNDO_STYLES = [...STYLES, "option-card.css", "die.css", "segmented-control.css"];
const AFTER_POST = "Advancement — after the post-match";
const DROPPED = "A match has begun, so the player edits and advancements that were waiting were not saved. Make them again after the post-match.";
const SITE = "The site's roll goes back to the player: the next «Random primary skill» takes the same roll; there is no new roll before that.";
const TABLE = "The advancement can be taken again at any time.";
const BARE = "This advancement does not say what it gave: only its SPP come back.";
const MISMATCH = "A roll on the site was rerolled against this skill, so it stays.";
const CHANGED = "The last advancement has changed — nothing was undone.";
const GENERAL = ["Block", "Dauntless", "Fend", "Frenzy", "Kick", "Pro", "Steady Footing", "Strip Ball", "Sure Hands", "Tackle", "Taunt", "Wrestle",
  "Offensive", "Elvenball", "Shadowing", "Thick Skull"];
/** ADVANCED's roll as the server keeps it: Block came up first and was rolled again, then Frenzy. */
const R1 = {
  id: "r1", playerId: "p3", purpose: "random_skill", params: { category: "General", candidates: GENERAL, sides: 16, captain: false },
  result: { attempts: [{ roll: 1, skill: "Block", duplicate: true }, { roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }, usedAt: "2026-10-18T10:00:00Z",
};
/** A random skill's roll of two dice (owner's review, 2026-10-20; Task 20), Cade's: Frenzy and Strip Ball, the pair he took Strip Ball from. */
const PAIR = {
  ...R1, id: "r4",
  result: { dice: [{ attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }, { attempts: [{ roll: 8, skill: "Strip Ball", duplicate: false }], skill: "Strip Ball" }] },
};
/** R1 as the server gives it back once the undo has freed it: Frenzy at the first attempt (Cade never held Block). */
const R1_FREED = { ...R1, usedAt: null, result: { attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" } };
/** Another player's roll in the team's list (GET …/rolls answers the team's). */
const R0 = { ...R1, id: "r0", playerId: "p1", result: { attempts: [{ roll: 2, skill: "Dauntless", duplicate: false }], skill: "Dauntless" } };
const CADE = { ...PLAYERS[2], spp: { touchdowns: 10 } };
/** Cade's advancements of each kind: a characteristic at the table, a chosen skill, one that does not say what it gave. */
const STAT = { ...CADE, statMods: { ma: 1 }, advancements: [{ type: "stat", grants: { stat: "ma" }, roll: { via: "table" } }] };
const CHOSEN = { ...CADE, extraSkills: [{ name: "Diving Catch", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Diving Catch" } }] };
const BARE_ONE = { ...CADE, advancements: [{ type: "random" }] };
/** Frenzy rolled at the table: a used site roll was rerolled against it, so the server keeps it (K16). */
const TABLE_FRENZY = { ...ADVANCED, advancements: [{ type: "random", grants: { skill: "Frenzy" }, roll: { via: "table" } }] };
/** R1's like for a second site advancement of Cade's, Sure Hands, which another device took after the visit read the rolls. */
const R2 = { ...R1, id: "r2", result: { attempts: [{ roll: 9, skill: "Sure Hands", duplicate: false }], skill: "Sure Hands" } };
/** ADVANCED once another device took his second advancement. */
const TWICE = {
  ...ADVANCED, extraSkills: [...ADVANCED.extraSkills, { name: "Diving Catch", access: "primary" }],
  advancements: [...ADVANCED.advancements, { type: "primary", grants: { skill: "Diving Catch" } }],
};
// Nurgle's Rotter Lineman (Mutation in his primary access: he chooses) and Rotspawn (Strength only: rolled for), the roster «Favoured of Nurgle».
const ROT = { id: "n1", rowIndex: 0, number: "1", name: "Rot", spp: { touchdowns: 10 } };
const SPAWN = { id: "n2", rowIndex: 3, number: "2", name: "Spawn", spp: { touchdowns: 10 } };
const nurgle = (players, over = {}) => team({ baseTeamSlug: "teams/nurgle", roster: { favouredChoice: "Nurgle", players }, ...over });

const patches = () => api.calls.filter(({ key }) => key === PATCH);
const callsTo = (key) => api.calls.filter((call) => call.key === key).length;
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
/** t1 on the server with one player in place of his own line. */
const withOne = (player, over = {}) => withPlayers(PLAYERS.map((each) => (each.id === player.id ? player : each)), over);
const sentOf = (id, call = patches().at(-1)) => call.body.roster.players.find((player) => player.id === id);
const sheet = () => view.querySelector("dialog#player-unadvance");
const undo = () => view.querySelector("[data-player-unadvance]");
const advance = () => view.querySelector("[data-player-advance]");
const rows = () => sheet().querySelectorAll(".g-unadvance__row").map((row) => [row.querySelector("dt").textContent, row.querySelector("dd").textContent]);
const note = () => sheet().querySelector(".g-unadvance__note").textContent;
const keep = () => sheet().querySelector("[data-unadvance-keep]");
const send = () => sheet().querySelector("[data-unadvance-send]");
const closed = (element) => element.getAttribute("aria-disabled") === "true";
const elements = (parent) => parent.childNodes.filter((node) => node.nodeType === 1);

/** His page on a phone, or the roster with him in the panel on a desk; the roster as `teamAnswer` says. */
async function openPlayer(phone, { id = "p3", teamAnswer = withOne(ADVANCED), games = [] } = {}) {
  coach({ teamAnswer, open: phone ? null : `${id}#0` });
  gamesAre(games);
  if (phone) await playerPage(id);
  else await renderTeamRoster("t1");
}

/** A match begins on another device: the games say so, and `server` is the roster the server holds. */
async function matchBegins(server) {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
}

// Decision 18.
test("«Undo the last» stands under «Advancement» while he has one, and asks first: what it gave, the SPP back, the value lost", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      const button = undo();
      assert.equal(button.tagName, "BUTTON");
      assert.equal(button.getAttribute("class"), "g-profile__undo");
      assert.equal(button.getAttribute("aria-haspopup"), "dialog");
      assert.equal(button.textContent, "Undo the last: Frenzy");
      // In his SPP card, the last thing in it: under «Advancement» and the line under it.
      const card = elements(view.querySelector(".g-profile__spp"));
      assert.ok(card.at(-1) === button && card.at(-2) === view.querySelector(".g-profile__hint") && card.at(-3) === advance());
      fireEvent(button, "click");
      assert.ok(sheet()?.isModal, "dialog#player-unadvance, open");
      assert.equal(sheet().getAttribute("class"), "g-sheet g-player-sheet", "in the frame a player's sheets share");
      assert.equal(sheet().querySelector("h2").textContent, "Undo the advancement?");
      assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Cade · advancement 1 of 6");
      assert.deepEqual(rows(), [["What it gave", "Frenzy · Random primary skill · rolled on the site"], ["SPP back", "+3"], ["The player's value", "−20k"]]);
      assert.equal(keep().textContent, "Keep");
      assert.equal(send().textContent, "Undo advancement", "short enough for half of a phone's foot (fix round 1)");
      assertCspSafe(view);
      assertStyled(view, ...UNDO_STYLES);
      // «Keep» changes nothing; the focus back on what opened it.
      fireEvent(keep(), "click");
      assert.ok(!sheet());
      assert.ok(document.activeElement === undo());
      await settle();
      assert.equal(patches().length, 0);
    });
    // No advancement, nothing to undo.
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne(CADE) });
      assert.ok(advance());
      assert.ok(!undo());
    });
    // A desk: under «Advance» and its line, in the panel.
    await openPlayer(false);
    const quiet = aside().querySelector("[data-player-unadvance]");
    assert.equal(quiet.getAttribute("class"), "g-roster__undo");
    assert.equal(quiet.textContent, "Undo the last: Frenzy");
    const spp = elements(aside().querySelector(".g-roster__spp"));
    assert.ok(spp.at(-1) === quiet && spp.at(-2) === aside().querySelector(".g-roster__cheapest"));
    fireEvent(quiet, "click");
    assert.ok(sheet()?.isModal);
    assert.deepEqual(rows(), [["What it gave", "Frenzy · Random primary skill · rolled on the site"], ["SPP back", "+3"], ["The player's value", "−20k"]]);
    assertCspSafe(view);
    assertStyled(view, ...UNDO_STYLES);
  });
});

// Review Focus 5.
test("undo of a site advancement: the sheet says the roll goes back to the player, one PATCH without it, the coach told", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      fireEvent(undo(), "click");
      assert.equal(note(), SITE);
      // Decision 18: an undo is no loss — the main button, never the red one.
      assert.match(send().getAttribute("class"), /\bg-btn--primary\b/);
      assert.doesNotMatch(send().getAttribute("class"), /danger/);
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      fireEvent(send(), "click");
      assert.ok(!sheet(), "closed in the same turn");
      assert.equal(toasts().at(-1), "Advancement undone: Frenzy · 3 SPP back");
      assert.ok(!toasts().includes(CHANGED), "its own step is no change under it");
      assert.ok(document.activeElement === advance(), "the focus on «Advancement»");
      assert.ok(!undo(), "nothing left to undo");
      assert.equal(view.querySelector(".g-profile__availn").textContent, "30", "his SPP back at once, from the draft");
      assert.ok(!view.querySelector(".g-profile__skills").textContent.includes("Frenzy"));
      await settle();
      assert.equal(patches().length, 1);
      assert.equal(patches()[0].body.revision, 4);
      const cade = sentOf("p3");
      assert.deepEqual(cade.advancements ?? [], [], "without the advancement, and so without its roll");
      assert.ok(!(cade.extraSkills ?? []).some(({ name }) => name === "Frenzy"));
      assert.equal(save.saveState("t1").waiting, 0);
      // The next random primary skill: the server gives the same roll back, and the advancement names it again.
      fireEvent(advance(), "click");
      const advancing = () => view.querySelector("dialog#player-advance");
      fireEvent(advancing().querySelector('.g-options [data-option-value="random"]'), "click");
      fireEvent(advancing().querySelector("[data-advance-next]"), "click");
      fireEvent(advancing().querySelector('[data-advance-category="General"]'), "click");
      fireEvent(advancing().querySelector("[data-advance-next]"), "click");
      api.reply(ASK, 200, { roll: R1_FREED });
      fireEvent(advancing().querySelector("[data-advance-roll]"), "click");
      await settle();
      api.reply(PATCH, 200, { team: withOne(ADVANCED, { revision: 6 }) });
      fireEvent(advancing().querySelector("[data-advance-take]"), "click");
      await settle();
      assert.equal(patches().length, 2);
      assert.deepEqual(sentOf("p3").advancements, ADVANCED.advancements, "the same roll, r1");
    });
  });
});

test("a table or chosen advancement can be taken again; one that does not say what it gave gives the SPP back only", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne(STAT) });
      assert.equal(undo().textContent, "Undo the last: MA +1");
      fireEvent(undo(), "click");
      assert.deepEqual(rows(), [["What it gave", "MA +1 · Characteristic improvement · rolled at the table"], ["SPP back", "+14"], ["The player's value", "−30k"]]);
      assert.equal(note(), TABLE);
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      fireEvent(send(), "click");
      assert.equal(toasts().at(-1), "Advancement undone: MA +1 · 14 SPP back");
      await settle();
      assert.deepEqual(sentOf("p3").advancements ?? [], []);
      assert.deepEqual(sentOf("p3").statMods ?? {}, {}, "the +1 goes with it");
    });
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne(CHOSEN) });
      fireEvent(undo(), "click");
      assert.deepEqual(rows(), [["What it gave", "Diving Catch · Chosen primary skill"], ["SPP back", "+6"], ["The player's value", "−20k"]]);
      assert.equal(note(), TABLE);
    });
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne(BARE_ONE) });
      assert.equal(undo().textContent, "Undo the last: Random primary skill");
      fireEvent(undo(), "click");
      assert.deepEqual(rows(), [["What it gave", "Random primary skill"], ["SPP back", "+3"], ["The player's value", "—"]]);
      assert.equal(note(), BARE);
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      fireEvent(send(), "click");
      assert.equal(toasts().at(-1), "Advancement undone: Random primary skill · 3 SPP back");
      await settle();
      assert.deepEqual(sentOf("p3").advancements ?? [], []);
    });
  });
});

test("only the last is undone; the sheet closes if the roster changed under it", async () => {
  await withoutTimers(async () => {
    await openPlayer(false);
    fireEvent(undo(), "click");
    assert.ok(sheet()?.isModal);
    send().focus();
    // Another device took his second advancement: the roster is read again, and the sheet named the first.
    const read = withOne(TWICE, { revision: 5 });
    api.reply(TEAM_READ, 200, { team: read });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    setMyTeams([read]);
    await settle();
    assert.equal(callsTo(TEAM_READ), 2, "read again");
    assert.ok(!sheet(), "the advancement it named is not his last any more");
    assert.ok(!view.querySelector("dialog:modal"));
    assert.equal(toasts().at(-1), CHANGED);
    assert.equal(undo().textContent, "Undo the last: Diving Catch");
    assert.ok(document.activeElement === undo(), "back on what opened it");
    assert.equal(patches().length, 0);
    // The last one goes, the first stays.
    fireEvent(undo(), "click");
    assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Cade · advancement 2 of 6");
    assert.deepEqual(rows(), [["What it gave", "Diving Catch · Chosen primary skill"], ["SPP back", "+8"], ["The player's value", "−20k"]]);
    api.reply(PATCH, 200, { team: withOne(ADVANCED, { revision: 6 }) });
    fireEvent(send(), "click");
    assert.ok(document.activeElement === advance(), "the focus on «Advance»");
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.revision, 5);
    assert.deepEqual(sentOf("p3").advancements, ADVANCED.advancements);
    assert.equal(undo().textContent, "Undo the last: Frenzy");
  });
});

// Fix round 1 (review Minor 8): the sheet stands on the advancement it showed, not on the count — a press never undoes
// what the coach did not see.
test("the same count with another last advancement closes the sheet, saying so; nothing is sent", async () => {
  await withoutTimers(async () => {
    await openPlayer(false, { teamAnswer: withOne(TWICE) });
    fireEvent(undo(), "click");
    assert.deepEqual(rows()[0], ["What it gave", "Diving Catch · Chosen primary skill"]);
    send().focus();
    // Another device undid Diving Catch and took Sure Hands: two advancements still, the last another one.
    const other = { ...ADVANCED, extraSkills: [...ADVANCED.extraSkills, { name: "Sure Hands", access: "primary" }],
      advancements: [...ADVANCED.advancements, { type: "primary", grants: { skill: "Sure Hands" } }] };
    const read = withOne(other, { revision: 6 });
    api.reply(TEAM_READ, 200, { team: read });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
    setMyTeams([read]);
    await settle();
    assert.equal(callsTo(TEAM_READ), 2, "read again");
    assert.ok(!sheet(), "the advancement it showed is no longer his last");
    assert.equal(toasts().at(-1), CHANGED);
    assert.equal(toasts().filter((said) => said === CHANGED).length, 1, "said once");
    assert.equal(undo().textContent, "Undo the last: Sure Hands");
    assert.ok(document.activeElement === undo(), "back on what opened it");
    // A late press of the sheet's button finds nothing to send.
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-unadvance-send", "true");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
    await settle();
    assert.equal(patches().length, 0);
  });
});

test("closed in a match, saying why; a second press sends nothing more", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openPlayer(phone);
        fireEvent(undo(), "click");
        send().focus();
        await matchBegins(withOne(ADVANCED, { revision: 4 }));
        assert.ok(!sheet(), "R8: the sheet closes with the match");
        assert.ok(document.activeElement === undo(), "the focus on «Undo the last», closed now");
        assert.ok(closed(undo()));
        assert.equal(undo().getAttribute("title"), AFTER_POST);
        assert.equal(undo().textContent, "Undo the last: Frenzy");
        fireEvent(undo(), "click");
        assert.equal(toasts().at(-1), AFTER_POST);
        assert.ok(!sheet());
        await settle();
        assert.equal(patches().length, 0);
      });
    }
    // Review Focus 2: one press, one step — a second press, or a late one, finds no sheet.
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      fireEvent(undo(), "click");
      const press = send();
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      fireEvent(press, "click");
      fireEvent(press, "click");
      const late = document.createElement("button");
      late.setAttribute("type", "button");
      late.setAttribute("data-unadvance-send", "true");
      view.appendChild(late);
      fireEvent(late, "click");
      view.removeChild(late);
      await settle();
      assert.equal(patches().length, 1);
      assert.equal(save.saveState("t1").waiting, 0);
    });
    // K15: a match begun before the screen is drawn again — the press asks, and nothing goes.
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      fireEvent(undo(), "click");
      const games = state.games.items;
      state.games.items = [LIVE_GAME];
      fireEvent(send(), "click");
      assert.equal(toasts().at(-1), AFTER_POST);
      state.games.items = games;
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

// Review Focus 4.
test("an undo that waited for the network is given up when a match begins, and the coach is told", async () => {
  await withoutTimers(async () => {
    await openPlayer(false);
    fireEvent(undo(), "click");
    api.fail(PATCH);
    fireEvent(send(), "click");
    await settle();
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "30", "drawn at once");
    assert.ok(!undo());
    await matchBegins(withOne(ADVANCED, { revision: 4 }));
    assert.equal(toasts().at(-1), DROPPED);
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "27", "the server's roster");
    assert.equal(undo().textContent, "Undo the last: Frenzy");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
  });
});

// The roster's invariant: a lost answer's step is the same roster sent again, its 409 known as that very save — never a second undo.
test("an undo whose answer was lost is sent again as the same roster, and its 409 is known as this very undo", async () => {
  await withoutTimers(async () => {
    await openPlayer(false, { teamAnswer: withOne(TWICE) });
    fireEvent(undo(), "click");
    api.fail(PATCH);
    fireEvent(send(), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    assert.equal(undo().textContent, "Undo the last: Frenzy", "Diving Catch undone in the draft");
    // The server has it: the revision is 5 and the roster is what was sent.
    const sent = patches()[0].body;
    api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: { ...withOne(ADVANCED, { revision: 5 }), roster: { ...sent.roster, logoData: undefined } } });
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(save.saveState("t1").status, "saved");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.ok(!view.querySelector(".g-roster__conflict"), "not another device's save");
    assert.equal(patches().length, 2);
    assert.deepEqual(patches()[1].body, sent, "the same roster sent again");
    assert.deepEqual(sentOf("p3").advancements, ADVANCED.advancements, "Frenzy stays: one undo, not two");
    assert.equal(undo().textContent, "Undo the last: Frenzy");
  });
});

// K16: the server keeps a skill a used site roll was rerolled against; the undo's 422 is said in the player's words.
test("an undo the server refuses for a used roll is said, and the roster read again", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne(TABLE_FRENZY) });
      fireEvent(undo(), "click");
      assert.equal(note(), TABLE);
      api.reply(PATCH, 422, { error: { code: "DICE_ROLL_MISMATCH", params: {}, message: "x" } });
      fireEvent(send(), "click");
      await settle();
      assert.equal(patches().length, 1);
      assert.equal(toasts().at(-1), MISMATCH);
      assert.equal(callsTo(TEAM_READ), 2, "the server's roster read again");
      assert.equal(undo().textContent, "Undo the last: Frenzy", "it stays");
      assert.equal(view.querySelector(".g-profile__availn").textContent, "27");
    });
  });
});

// Decision 17, owner's answer 3.
test("Favoured of Nurgle: done offers the bonus skill, his own closed; added as one PATCH", async () => {
  const favoured = () => view.querySelector("dialog#player-advance .g-favoured");
  const items = () => favoured().querySelectorAll("[data-favoured-skill]");
  const item = (name) => items().find((each) => each.getAttribute("data-favoured-skill") === name);
  const add = () => favoured().querySelector("[data-favoured-add]");
  const take = (category, skill) => {
    const advancing = view.querySelector("dialog#player-advance");
    fireEvent(advancing.querySelector('.g-options [data-option-value="primary"]'), "click");
    fireEvent(advancing.querySelector("[data-advance-next]"), "click");
    fireEvent(advancing.querySelector(`[data-advance-category="${category}"]`), "click");
    fireEvent(advancing.querySelector("[data-advance-next]"), "click");
    fireEvent(advancing.querySelector(`[data-advance-skill="${skill}"]`), "click");
    fireEvent(advancing.querySelector("[data-advance-take]"), "click");
  };
  const mouth = { ...ROT, extraSkills: [{ name: "Monstrous Mouth", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Monstrous Mouth" } }] };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n1", teamAnswer: nurgle([ROT]) });
      fireEvent(advance(), "click");
      api.reply(PATCH, 200, { team: nurgle([mouth], { revision: 5 }) });
      take("Mutation", "Monstrous Mouth");
      await settle();
      assert.ok(view.querySelector(".g-advance__done"));
      assert.equal(favoured().tagName, "SECTION");
      assert.equal(favoured().querySelector(".g-favoured__title").textContent, "Nurgle: a bonus skill");
      assert.deepEqual(favoured().querySelectorAll(".g-favoured__line").map((line) => line.textContent),
        ["Roll a D8 at the table: on a 7 the player gains one of these skills, at no cost to the value."], "Mutation in his primary access: he chooses");
      const group = favoured().querySelector(".g-favoured__skills");
      assert.equal(group.getAttribute("role"), "radiogroup");
      assert.equal(group.getAttribute("aria-label"), "Bonus skill");
      assert.deepEqual(items().map((each) => [each.getAttribute("data-favoured-skill"), each.getAttribute("role"), each.getAttribute("aria-checked"), closed(each)]),
        [["Tentacles", "radio", "false", false], ["Monstrous Mouth", "radio", "false", true], ["Bone Hook", "radio", "false", false]]);
      assert.equal(item("Monstrous Mouth").getAttribute("title"), "The player has this skill already.");
      assert.deepEqual(items().map((each) => each.getAttribute("tabindex")), ["0", "-1", "-1"], "a roving tabindex");
      assert.equal(add().textContent, "Choose the bonus skill");
      assert.ok(add().hasAttribute("disabled"));
      // His own says so on a press, and is not chosen.
      fireEvent(item("Monstrous Mouth"), "click");
      assert.equal(toasts().at(-1), "The player has this skill already.");
      assert.equal(item("Monstrous Mouth").getAttribute("aria-checked"), "false");
      fireEvent(item("Tentacles"), "click");
      assert.equal(item("Tentacles").getAttribute("aria-checked"), "true");
      assert.equal(add().textContent, "Add Tentacles");
      assert.ok(!add().hasAttribute("disabled"));
      assertCspSafe(view);
      assertStyled(view, ...UNDO_STYLES);
      // K15: a match begun before the screen is drawn again — the press asks, and nothing goes.
      const games = state.games.items;
      state.games.items = [LIVE_GAME];
      const reads = callsTo(TEAM_READ);
      fireEvent(add(), "click");
      assert.equal(toasts().at(-1), AFTER_POST);
      state.games.items = games;
      await settle();
      assert.equal(patches().length, 1, "the advancement's only");
      assert.equal(callsTo(TEAM_READ), reads, "no refusal of the queue's to read the roster again for (final wave, T11 N4)");
      // Added: one PATCH, the block gone, the coach told.
      const added = { ...mouth, favouredSkills: [{ name: "Tentacles", access: "favoured" }] };
      api.reply(PATCH, 200, { team: nurgle([added], { revision: 6 }) });
      fireEvent(add(), "click");
      assert.equal(toasts().at(-1), "Bonus skill: Tentacles");
      assert.ok(!favoured(), "the bonus is taken");
      assert.ok(view.querySelector(".g-advance__done"), "done stays");
      assert.ok(document.activeElement === view.querySelector("[data-advance-done]"));
      // Review Focus 2 (fix round 1, review Minor 2): a second press — a late «Add …» heard by the view — sends nothing more.
      const late = document.createElement("button");
      late.setAttribute("type", "button");
      late.setAttribute("data-favoured-add", "true");
      view.appendChild(late);
      const before = callsTo(TEAM_READ);
      fireEvent(late, "click");
      view.removeChild(late);
      assert.equal(toasts().filter((said) => said === "Bonus skill: Tentacles").length, 1);
      await settle();
      assert.equal(patches().length, 2, "the advancement's and the bonus's: one PATCH for the bonus");
      assert.equal(callsTo(TEAM_READ), before, "the late press read nothing either (final wave, T11 N4)");
      assert.equal(patches().filter(({ body }) => (body.roster.players[0].favouredSkills ?? []).length).length, 1);
      const rot = patches()[1].body.roster.players[0];
      assert.deepEqual(rot.favouredSkills, [{ name: "Tentacles", access: "favoured" }]);
      assert.deepEqual(rot.advancements, mouth.advancements, "no advancement with it");
      assert.equal(patches()[1].body.roster.favouredChoice, "Nurgle");
    });
    // A Rotspawn (no Mutation in his primary access): the skill is rolled for at the table too; his Tentacles closed.
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n2", teamAnswer: nurgle([SPAWN]) });
      fireEvent(advance(), "click");
      api.reply(PATCH, 200, { team: nurgle([{ ...SPAWN, extraSkills: [{ name: "Guard", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Guard" } }] }], { revision: 5 }) });
      take("Strength", "Guard");
      assert.deepEqual(favoured().querySelectorAll(".g-favoured__line").map((line) => line.textContent), [
        "Roll a D8 at the table: on a 7 the player gains one of these skills, at no cost to the value.",
        "Without Mutation in the primary access the skill is chosen at random — roll for it at the table too.",
      ]);
      assert.ok(closed(item("Tentacles")));
      await settle();
    });
    // On a desk, under done in the window.
    await openPlayer(false, { id: "n1", teamAnswer: nurgle([ROT]) });
    fireEvent(advance(), "click");
    const advancing = view.querySelector("dialog#player-advance");
    fireEvent(advancing.querySelector('.g-options [data-option-value="primary"]'), "click");
    fireEvent(advancing.querySelector('[data-advance-category="Mutation"]'), "click");
    fireEvent(advancing.querySelector('[data-advance-skill="Monstrous Mouth"]'), "click");
    api.reply(PATCH, 200, { team: nurgle([mouth], { revision: 5 }) });
    fireEvent(advancing.querySelector("[data-advance-take]"), "click");
    assert.equal(favoured().querySelector(".g-favoured__title").textContent, "Nurgle: a bonus skill");
    assertStyled(view, ...UNDO_STYLES);
    await settle();
    // No «Favoured of…», no block.
    await openPlayer(false, { teamAnswer: withOne(ADVANCED) });
    fireEvent(advance(), "click");
    const humans = view.querySelector("dialog#player-advance");
    fireEvent(humans.querySelector('.g-options [data-option-value="primary"]'), "click");
    fireEvent(humans.querySelector('[data-advance-category="Agility"]'), "click");
    fireEvent(humans.querySelector('[data-advance-skill="Diving Catch"]'), "click");
    api.reply(PATCH, 200, { team: withOne(TWICE, { revision: 5 }) });
    fireEvent(humans.querySelector("[data-advance-take]"), "click");
    assert.ok(view.querySelector(".g-advance__done"));
    assert.ok(!favoured());
    await settle();
  });
});

// Fix round 1 (review Minor 10): nothing the god offers left to take, no block.
test("a player holding every skill the god offers is offered no bonus", async () => {
  const held = { ...ROT, favouredSkills: [{ name: "Tentacles", access: "favoured" }, { name: "Bone Hook", access: "favoured" }] };
  const taken = { ...held, extraSkills: [{ name: "Monstrous Mouth", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Monstrous Mouth" } }] };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n1", teamAnswer: nurgle([held]) });
      fireEvent(advance(), "click");
      const advancing = view.querySelector("dialog#player-advance");
      fireEvent(advancing.querySelector('.g-options [data-option-value="primary"]'), "click");
      fireEvent(advancing.querySelector("[data-advance-next]"), "click");
      fireEvent(advancing.querySelector('[data-advance-category="Mutation"]'), "click");
      fireEvent(advancing.querySelector("[data-advance-next]"), "click");
      fireEvent(advancing.querySelector('[data-advance-skill="Monstrous Mouth"]'), "click");
      api.reply(PATCH, 200, { team: nurgle([taken], { revision: 5 }) });
      fireEvent(advancing.querySelector("[data-advance-take]"), "click");
      assert.ok(view.querySelector(".g-advance__done"));
      assert.ok(!view.querySelector(".g-favoured"), "Tentacles, Bone Hook and Monstrous Mouth are all his");
      await settle();
      assert.equal(patches().length, 1);
    });
  });
});

// Decision 19, 39 (owner's review, 2026-10-20): a site roll's two dice are said in the skill's sheet — «Rolled: A and B» — in
// place of the attempts, which no sheet shows any more; the team's rolls are read once a visit.
test("a skill an advancement gave says how in its sheet; a site roll gave it — what the two dice showed, read once", async () => {
  const skillSheet = () => view.querySelector("dialog#roster-skill");
  const chip = (name) => view.querySelectorAll("[data-skill]").find((each) => each.getAttribute("data-skill") === name);
  const line = () => skillSheet().querySelector(".g-roster__rollline").textContent;
  const rollState = () => skillSheet().querySelector(".g-roster__rollstate");
  const said = () => skillSheet().querySelector(".g-roster__rollpair");
  const close = () => fireEvent(skillSheet().querySelector("[data-sheet-close]"), "click");
  // Cade took Strip Ball from the pair r4 (Frenzy and Strip Ball), Sure Hands from r2, and chose Diving Catch.
  const took = { ...ADVANCED, extraSkills: [{ name: "Strip Ball", access: "primary" }, { name: "Sure Hands", access: "primary" }, { name: "Diving Catch", access: "primary" }, { name: HOSTILE, access: "primary" }],
    advancements: [{ type: "random", grants: { skill: "Strip Ball" }, roll: { id: "r4", via: "site" } }, { type: "random", grants: { skill: "Sure Hands" }, roll: { id: "r2", via: "site" } },
      { type: "primary", grants: { skill: "Diving Catch" } }] };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne(took) });
      const gate = api.hold(ROLLS_READ);
      fireEvent(chip("Strip Ball"), "click");
      assert.ok(skillSheet()?.isModal);
      assert.equal(line(), "Advancement 1 · Random primary skill · rolled on the site");
      assert.equal(rollState().textContent, "Reading the roll…");
      assert.equal(rollState().getAttribute("role"), "status");
      assert.ok(!said(), "nothing said of the dice before they are read");
      // Between the rule and whose skill it is (StatsSkill.html): the rolls' block holds the line and what the dice showed.
      const body = elements(skillSheet().querySelector(".g-sheet__body"));
      assert.deepEqual(body.map((node) => node.getAttribute("class")), ["g-prose", "g-roster__rollblock", "g-roster__from"]);
      assert.equal(callsTo(ROLLS_READ), 1);
      gate.release({ status: 200, body: { rolls: [R0, PAIR, R2] } });
      await settle();
      assert.ok(!rollState(), "read");
      assert.equal(said().textContent, "Rolled: Frenzy and Strip Ball");
      assert.equal(said().tagName, "P");
      assert.deepEqual(elements(skillSheet().querySelector(".g-roster__rollblock")).map((node) => node.getAttribute("class")), ["g-roster__rollline", "g-roster__rollpair"]);
      // Only said: no list, no button, nothing to press, nothing that opens or hides; the attempts are shown nowhere.
      assert.equal(skillSheet().querySelector(".g-roster__rollblock").querySelectorAll("button, [aria-expanded], ul, ol, li").length, 0);
      assert.ok(!skillSheet().querySelector(".g-advance__attemptlist") && !skillSheet().querySelector(".g-advance__attemptscaption") && !skillSheet().querySelector(".g-advance__attempt"));
      assert.doesNotMatch(skillSheet().textContent, /Attempts|rolled again|held already/);
      assertCspSafe(view);
      assertStyled(view, ...UNDO_STYLES);
      // Closed and opened again in the same visit: no second read.
      close();
      assert.ok(!skillSheet());
      fireEvent(chip("Strip Ball"), "click");
      assert.equal(said().textContent, "Rolled: Frenzy and Strip Ball", "said at once");
      assert.equal(callsTo(ROLLS_READ), 1);
      close();
      // A second chip of the same visit, its roll in that list: no new read.
      fireEvent(chip("Sure Hands"), "click");
      assert.equal(line(), "Advancement 2 · Random primary skill · rolled on the site");
      assert.equal(said().textContent, "Rolled: Sure Hands", "a roll of one die says its one skill");
      assert.equal(callsTo(ROLLS_READ), 1);
      close();
      // A chosen skill: how it came, and nothing read, nothing said of dice.
      fireEvent(chip("Diving Catch"), "click");
      assert.equal(line(), "Advancement 3 · Chosen primary skill");
      assert.ok(!rollState() && !said());
      close();
      // A skill no advancement gave (written by hand, 2.x): no block.
      fireEvent(chip(HOSTILE), "click");
      assert.ok(!skillSheet().querySelector(".g-roster__rollblock"));
      assertCspSafe(view);
      assert.equal(callsTo(ROLLS_READ), 1);
    });
    // The site has no such roll.
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      api.reply(ROLLS_READ, 200, { rolls: [R0] });
      fireEvent(chip("Frenzy"), "click");
      await settle();
      assert.equal(rollState().textContent, "The site has no such roll");
      assert.ok(!said());
    });
    // The read failed: said in the sheet, and read again on the next press.
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { teamAnswer: withOne({ ...took, advancements: [took.advancements[0]] }) });
      api.reply(ROLLS_READ, 500, { error: { code: "INTERNAL", message: "x" } });
      fireEvent(chip("Strip Ball"), "click");
      await settle();
      assert.match(rollState().textContent, /^The roll did not load: ./);
      assert.match(rollState().getAttribute("class"), /g-roster__rollstate--bad/);
      assert.ok(!said());
      close();
      api.reply(ROLLS_READ, 200, { rolls: [PAIR] });
      fireEvent(chip("Strip Ball"), "click");
      await settle();
      assert.equal(callsTo(ROLLS_READ), 2);
      assert.equal(said().textContent, "Rolled: Frenzy and Strip Ball");
    });
    // A desk's panel opens the same.
    await openPlayer(false, { teamAnswer: withOne({ ...took, advancements: [took.advancements[0]] }) });
    api.reply(ROLLS_READ, 200, { rolls: [PAIR] });
    fireEvent(aside().querySelectorAll("[data-skill]").find((each) => each.getAttribute("data-skill") === "Strip Ball"), "click");
    await settle();
    assert.equal(line(), "Advancement 1 · Random primary skill · rolled on the site");
    assert.equal(said().textContent, "Rolled: Frenzy and Strip Ball");
    assertStyled(view, ...UNDO_STYLES);
  });
});

// Decision 39, the old format: a roll kept with one die (stage 03: `result.skill`, `result.attempts`) says its one skill;
// a roll of the new format with one die (a column holding a single skill the player lacks) the same.
test("a roll kept with one die says its one skill", async () => {
  const skillSheet = () => view.querySelector("dialog#roster-skill");
  const chip = (name) => view.querySelectorAll("[data-skill]").find((each) => each.getAttribute("data-skill") === name);
  const said = () => skillSheet().querySelector(".g-roster__rollpair")?.textContent;
  const one = { ...R1, result: { dice: [{ attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }] } };
  await withoutTimers(async () => {
    for (const roll of [R1, one]) {
      await withWindow({ phone: true }, async () => {
        await openPlayer(true);
        api.reply(ROLLS_READ, 200, { rolls: [roll] });
        fireEvent(chip("Frenzy"), "click");
        await settle();
        assert.equal(said(), "Rolled: Frenzy");
        assertCspSafe(view);
      });
    }
    // The words of a hostile skill are text, in the pair as in the single die's line.
    await withWindow({ phone: true }, async () => {
      const hostile = { ...R1, result: { dice: [{ attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" }, { attempts: [{ roll: 9, skill: HOSTILE, duplicate: false }], skill: HOSTILE }] } };
      await openPlayer(true);
      api.reply(ROLLS_READ, 200, { rolls: [hostile] });
      fireEvent(chip("Frenzy"), "click");
      await settle();
      assert.equal(said(), `Rolled: Frenzy and ${HOSTILE}`);
      assert.equal(elements(skillSheet().querySelector(".g-roster__rollpair")).length, 0, "text only");
      assertCspSafe(view);
    });
  });
});

// Fix round 1 (review Minors 1, 6, 7).
test("a read of the rolls without a site roll the roster brought since is read again; a roll is his by id and player; a D8 reads nothing", async () => {
  const skillSheet = () => view.querySelector("dialog#roster-skill");
  const chip = (name) => view.querySelectorAll("[data-skill]").find((each) => each.getAttribute("data-skill") === name);
  const rollState = () => skillSheet().querySelector(".g-roster__rollstate");
  const said = () => skillSheet().querySelector(".g-roster__rollpair")?.textContent;
  const close = () => fireEvent(skillSheet().querySelector("[data-sheet-close]"), "click");
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      api.reply(ROLLS_READ, 200, { rolls: [R0, R1] });
      fireEvent(chip("Frenzy"), "click");
      await settle();
      assert.equal(callsTo(ROLLS_READ), 1);
      close();
      // Another device took a second site advancement, Sure Hands on r2, after that read; a read of the roster brings it.
      const twice = { ...ADVANCED, extraSkills: [...ADVANCED.extraSkills, { name: "Sure Hands", access: "primary" }],
        advancements: [...ADVANCED.advancements, { type: "random", grants: { skill: "Sure Hands" }, roll: { id: "r2", via: "site" } }] };
      const read = withOne(twice, { revision: 5 });
      api.reply(TEAM_READ, 200, { team: read });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      setMyTeams([read]);
      await settle();
      api.reply(ROLLS_READ, 200, { rolls: [R0, R1, R2] });
      const reading = api.hold(ROLLS_READ);
      fireEvent(chip("Sure Hands"), "click");
      assert.equal(rollState().textContent, "Reading the roll…", "the visit's read has no r2: read once more, not «no such roll»");
      // Final wave (T11 N5): while that read is on its way, Frenzy's roll — in the list read before — is shown, not «Reading…».
      close();
      fireEvent(chip("Frenzy"), "click");
      assert.ok(!rollState(), "no «Reading the roll…» over a roll the visit holds");
      assert.equal(said(), "Rolled: Frenzy");
      close();
      fireEvent(chip("Sure Hands"), "click");
      assert.equal(rollState().textContent, "Reading the roll…");
      reading.release();
      await settle();
      assert.equal(callsTo(ROLLS_READ), 2, "the one read again, however many chips asked meanwhile");
      assert.equal(said(), "Rolled: Sure Hands");
      close();
      // Frenzy's roll is in that read: no third.
      fireEvent(chip("Frenzy"), "click");
      assert.equal(said(), "Rolled: Frenzy");
      assert.equal(callsTo(ROLLS_READ), 2);
    });
    // A roll of another player's under the same id is not his (T3: the team's list holds every player's rolls).
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      api.reply(ROLLS_READ, 200, { rolls: [{ ...R1, playerId: "p1" }] });
      fireEvent(chip("Frenzy"), "click");
      await settle();
      assert.equal(rollState().textContent, "The site has no such roll");
    });
    // A skill in place of a characteristic rolled on the site: a D8 has no dice to say — nothing read, nothing said of a read.
    await withWindow({ phone: true }, async () => {
      const d8 = { ...CADE, extraSkills: [{ name: "Sure Hands", access: "primary" }], advancements: [{ type: "stat", grants: { skill: "Sure Hands" }, roll: { id: "r3", via: "site" } }] };
      await openPlayer(true, { teamAnswer: withOne(d8) });
      fireEvent(chip("Sure Hands"), "click");
      assert.equal(skillSheet().querySelector(".g-roster__rollline").textContent, "Advancement 1 · Characteristic improvement · rolled on the site");
      assert.ok(!rollState());
      await settle();
      assert.ok(!rollState());
      assert.equal(callsTo(ROLLS_READ), 0);
    });
  });
});

test("every key in both dictionaries; styled; D2", () => {
  assertDictionaryCovers("src/screens/team/roster/player.mjs", "src/screens/team/roster/player-sheets.mjs", "src/screens/team/roster/roll-view.mjs",
    "src/screens/team/roster/advance-sheet.mjs", "src/screens/team/roster/panel.mjs", "src/screens/team/roster/player-access.mjs");
  // The words name no player's gender (owner's answer on words).
  const gendered = { en: /\b(he|him|his|she|her|hers)\b/i, ru: /(?<![а-яё])(он|она|его|её|ему|ей|получил|получила|вернул|вернула)(?![а-яё])/iu };
  for (const [locale, pattern] of Object.entries(gendered)) {
    const words = Object.entries(JSON.parse(text(`src/i18n/${locale}.json`))).filter(([key]) => /^teamPlayer\.(undo|favoured|roll)\./.test(key));
    assert.ok(words.length >= 24, locale);
    assert.deepEqual(words.filter(([, value]) => pattern.test(value)), [], locale);
  }
  for (const file of [PROFILE, FRAME, SHEETS, ADVANCE, ROLLS]) {
    const css = text(file);
    assert.doesNotMatch(css, /--focus-ring/, file);
    assert.doesNotMatch(css, /text-overflow/, file);
    for (const [, query] of css.matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), `${file}: ${query}`);
  }
  // Every new rule sets what the 2.x globals would otherwise give: font, letter-spacing, text-transform.
  const own = [[PROFILE, ".g-profile__undo"], [FRAME, ".g-roster__aside .g-roster__undo"], [SHEETS, "#player-unadvance .g-unadvance__key"],
    [SHEETS, "#player-unadvance .g-unadvance__value"], [SHEETS, "#player-unadvance .g-unadvance__note"], [ADVANCE, "#player-advance .g-favoured__title"],
    [ADVANCE, "#player-advance .g-favoured__line"], [ROLLS, "#roster-skill .g-roster__rollline"], [ROLLS, "#roster-skill .g-roster__rollstate"],
    [ROLLS, "#roster-skill .g-roster__rollpair"]];
  for (const [file, selector] of own) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(file, selector, property).length >= 1, `${selector} ${property}`);
  }
  // «Undo the last» is quiet (decision 18): a line of words in the accent, no frame, no fill — never the danger's.
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__undo", "font"), ["600 14px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__undo", "color"), ["var(--accent-text)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__undo", "border"), ["0"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__undo", "background"), ["none"]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster__aside .g-roster__undo", "font"), ["600 14px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(FRAME, ".g-roster__aside .g-roster__undo", "color"), ["var(--accent-text)"]);
  for (const file of [PROFILE, FRAME, SHEETS]) assert.doesNotMatch(text(file).replace(/\/\*[\s\S]*?\*\//g, ""), /undo[^{]*\{[^}]*danger/, file);
  assertReadable(PROFILE, ".g-profile__undo", "color", ["--surface"], 4.5);
  assertReadable(FRAME, ".g-roster__aside .g-roster__undo", "color", ["--surface-2"], 4.5);
  // The undo's lines as the sale's (07c's `.g-market__rows`): from 44px over a rule, 15px/1.25; the words 15px/1.5 (PlayerDeadConfirm).
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-unadvance__row", "min-height"), ["44px"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-unadvance__row", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-unadvance__key", "font"), ["400 15px/1.25 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-unadvance__value", "font"), ["600 15px/1.25 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-unadvance__note", "font"), ["400 15px/1.5 var(--font-body)"]);
  assertReadable(SHEETS, "#player-unadvance .g-unadvance__key", "color", ["--surface"], 4.5);
  assertReadable(SHEETS, "#player-unadvance .g-unadvance__back", "color", ["--surface"], 4.5);
  assertReadable(SHEETS, "#player-unadvance .g-unadvance__note", "color", ["--surface"], 4.5);
  // PlayerDeadConfirm's foot on a phone: under a rule, 12 below the body; two halves, 48px, 0 10 in, 15/700, «Keep» white in its #C9D3CE ring.
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-sheet__foot", "border-top"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-sheet__body", "padding-bottom"), ["var(--space-12)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-sheet__foot", "grid-template-columns"), ["minmax(0, 1fr) minmax(0, 1fr)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-sheet__foot .g-btn", "height"), ["48px"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-sheet__foot-start .g-btn", "box-shadow"), ["inset 0 0 0 1px var(--control-border)"]);
  assert.deepEqual(valuesOf(SHEETS, "#player-unadvance .g-sheet__foot .g-btn", "padding"), ["0 var(--space-10)"]);
  // The god's bonus: on --surface-2, 14 round, 12 14 in, its title 15/700, its lines 13px/1.45; the skills the advancement's own.
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-favoured", "background"), ["var(--surface-2)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-favoured", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-favoured", "padding"), ["var(--space-12) var(--space-14)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-favoured__title", "font"), ["700 15px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-favoured__line", "font"), ["400 13px/1.45 var(--font-body)"]);
  assertReadable(ADVANCE, "#player-advance .g-favoured__line", "color", ["--surface-2"], 4.5);
  assertReadable(ADVANCE, "#player-advance .g-favoured__title", "color", ["--surface-2"], 4.5);
  // What the dice showed (decision 39): 13px/1.45 in --ink-2, no margin, wrapping; nothing of the attempts' rules is left.
  assert.deepEqual(valuesOf(ROLLS, "#roster-skill .g-roster__rollpair", "font"), ["400 13px/1.45 var(--font-body)"]);
  assert.deepEqual(valuesOf(ROLLS, "#roster-skill .g-roster__rollpair", "color"), ["var(--ink-2)"]);
  assert.deepEqual(valuesOf(ROLLS, "#roster-skill .g-roster__rollpair", "margin"), ["0"]);
  assert.deepEqual(valuesOf(ROLLS, "#roster-skill .g-roster__rollpair", "overflow-wrap"), ["anywhere"]);
  assert.doesNotMatch(text(ROLLS), /attempt/, "no attempts' rules in rolls.css");
  assert.doesNotMatch(text("src/screens/team/roster/roll-view.mjs"), /attemptsMarkup|attemptWords/, "no attempts' markup");
  for (const [locale, words] of [["en", JSON.parse(text("src/i18n/en.json"))], ["ru", JSON.parse(text("src/i18n/ru.json"))]]) {
    assert.deepEqual(Object.keys(words).filter((key) => /^teamAdvance\.(attempts|attempt\.|rerolled)/.test(key)), [], `${locale}: no words of attempts`);
    assert.ok(words["teamPlayer.roll.pair"] && words["teamPlayer.roll.one"], locale);
  }
  assert.equal(JSON.parse(text("src/i18n/en.json"))["teamPlayer.roll.pair"], "Rolled: {first} and {second}");
  assert.equal(JSON.parse(text("src/i18n/en.json"))["teamPlayer.roll.one"], "Rolled: {skill}");
  assert.equal(JSON.parse(text("src/i18n/ru.json"))["teamPlayer.roll.pair"], "Выпало: {first} и {second}");
  assert.equal(JSON.parse(text("src/i18n/ru.json"))["teamPlayer.roll.one"], "Выпало: {skill}");
  assertReadable(ROLLS, "#roster-skill .g-roster__rollpair", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#roster-skill .g-roster__rollline", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#roster-skill .g-roster__rollstate", "color", ["--surface"], 4.5);
  assertReadable(ROLLS, "#roster-skill .g-roster__rollstate--bad", "color", ["--surface"], 4.5);
  // D2: up to 900px what is pressed is 44px or more; from 901px never under 24px.
  const bare = (file) => text(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (file, query) => {
    const css = bare(file), start = css.indexOf(`@media (${query}) {`);
    return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
  };
  const height = (file, query, selector) => Number(block(file, query).match(new RegExp(`${selector.replace(/[.[\]"]/g, "\\$&")} \\{[^}]*min-height: (\\d+)px;`))?.[1]);
  assert.equal(height(PROFILE, "max-width: 900px", ".g-profile__undo"), 44);
  assert.equal(height(FRAME, "min-width: 901px", ".g-roster__aside .g-roster__undo"), 32);
  assert.ok(height(FRAME, "min-width: 901px", ".g-roster__aside .g-roster__undo") >= 24);
  assert.ok(height(ADVANCE, "max-width: 900px", "#player-advance .g-favoured .g-btn") >= 44);
  assert.ok(height(ADVANCE, "min-width: 901px", "#player-advance .g-favoured .g-btn") >= 24);
  // The profile's page holds the page only (T8): the sheets' rules live in their own files.
  assert.doesNotMatch(bare(PROFILE), /unadvance|g-favoured|roster-skill/);
});

test("a long skill or line wraps; nothing is cut with «…»", () => {
  for (const [file, selector] of [[SHEETS, "#player-unadvance .g-unadvance__value"], [SHEETS, "#player-unadvance .g-unadvance__note"], [PROFILE, ".g-profile__undo"],
    [FRAME, ".g-roster__aside .g-roster__undo"], [ADVANCE, "#player-advance .g-favoured__title"], [ADVANCE, "#player-advance .g-favoured__line"],
    [ROLLS, "#roster-skill .g-roster__rollline"], [ROLLS, "#roster-skill .g-roster__rollstate"], [ROLLS, "#roster-skill .g-roster__rollpair"]]) {
    assert.deepEqual(valuesOf(file, selector, "overflow-wrap"), ["anywhere"], selector);
  }
});

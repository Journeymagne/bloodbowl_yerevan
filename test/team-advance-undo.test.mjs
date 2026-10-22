import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints, mediaText } from "./helpers/css.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  ADVANCED, LIVE_GAME, PLAYERS, STYLES, api, aside, coach, loadGames, page, playerPage, renderTeamRoster, save, settle, state, team, text, view, withPlayers,
} from "./helpers/roster-page.mjs";

const { setMyTeams } = await import("../src/data/teams.mjs");

// Stage 07d, Task 11 (decisions 17–19; no prototypes — the look is the 07b/07c sheets', PlayerDeadConfirm.html's question
// and two buttons, StatsSkill.html's skill sheet). «Undo the last: …» asks first, then the last advancement goes as one step
// of the save queue: what it gave goes, its SPP come back, and the server frees its site roll, which the next advancement of
// its type takes again. Since Task 23 (owner, 2026-10-20; decision 40) it stands in the fix by hand alone — the last block,
// «Advancements» — and opens the question in the fix's place; the profile (Player.html) and the desk's panel (DeskRoster.html)
// have none, as their prototypes. A roster «Favoured of…» marks the god's D8 with every advancement, before «Take» (the
// owner, 2026-10-21, in place of answer 3's bonus on done). A skill an advancement gave says how in its sheet, and for a site roll what its dice showed, read from
// the server once a visit. The page, the coach and his team are helpers/roster-page.mjs's; ADVANCED is Cade 3 (a Catcher)
// with Frenzy from a random skill rolled on the site.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const ROLLS_READ = "GET /api/teams/t1/rolls";
const ASK = "POST /api/teams/t1/players/p3/rolls";
const PROFILE = "src/screens/team/roster/profile.css";
const FRAME = "src/screens/team/roster/frame.css";
const SHEETS = "src/screens/team/roster/player-sheets.css";
const ADVANCE = "src/screens/team/roster/advance.css";
const ROLLS = "src/screens/team/roster/rolls.css";
const FIX = "src/screens/team/roster/fix.css";
const UNDO_STYLES = [...STYLES, "option-card.css", "die.css", "segmented-control.css"];
const FIX_STYLES = [...UNDO_STYLES, "toggle.css", "text-field.css", "resource-counter.css"];
const SAVE_FIRST = "Save or cancel the edit first";
const EDIT_CLOSED = "Number, name and captain — after the post-match";
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
const pencil = () => view.querySelector("[data-player-edit]");
const fixSheet = () => view.querySelector("dialog#player-fix");
const fixBlocks = () => fixSheet().querySelectorAll(".g-player-fix__block");
const fixTitles = () => fixBlocks().map((block) => block.querySelector(".g-player-fix__title")?.textContent ?? "");
const skillsIn = (root) => root.querySelectorAll("[data-skill]").map((chip) => chip.getAttribute("data-skill"));
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

/** His fix by hand opened as the coach opens it, on the page as it stands: the pencil, then the edit's last line. */
function reopenFix() {
  fireEvent(pencil(), "click");
  fireEvent(view.querySelector("[data-player-fix]"), "click");
}

/** His page or the desk's panel, then his fix by hand (Task 23: the undo stands there alone). */
async function openFix(phone, options = {}) {
  await openPlayer(phone, options);
  reopenFix();
}

/** «Undo the last: …» pressed in his fix by hand: the undo's question open in the fix's place. */
async function openUndo(phone, options = {}) {
  await openFix(phone, options);
  fireEvent(undo(), "click");
}

/** A match begins on another device: the games say so, and `server` is the roster the server holds. */
async function matchBegins(server) {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
}

// Decision 40 (owner, 2026-10-20): Player.html's SPP card ends with the line under «Advancement», DeskRoster.html's with the
// line under «Advance» — no undo in either.
test("no «Undo the last» on the profile nor in the desk's panel (Player.html, DeskRoster.html)", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      assert.ok(!view.querySelector(".g-profile__spp [data-player-unadvance]"));
      assert.ok(!undo(), "nowhere on the page");
      const card = elements(view.querySelector(".g-profile__spp"));
      assert.ok(card.at(-1) === view.querySelector(".g-profile__hint") && card.at(-2) === advance(), "the card ends with the line under «Advancement»");
    });
    await openPlayer(false);
    assert.ok(!aside().querySelector("[data-player-unadvance]"));
    assert.ok(!undo(), "nowhere on the page");
    const spp = elements(aside().querySelector(".g-roster__spp"));
    assert.ok(spp.at(-1) === aside().querySelector(".g-roster__cheapest") && spp.at(-2) === aside().querySelector("[data-player-advance]"),
      "the panel's SPP ends with the line under «Advance»");
  });
});

// Decisions 18 and 40: the same question, the same step — opened from the fix by hand, in its place.
test("the fix by hand ends with «Advancements»: «Undo the last: Frenzy», which asks first as before", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone);
        assert.ok(fixSheet()?.isModal);
        assert.equal(fixTitles().at(-1), "Advancements", "the fix's last block");
        const block = fixBlocks().at(-1);
        assert.deepEqual(elements(block).map((node) => node.getAttribute("class")), ["g-player-fix__title", "g-player-fix__undo"]);
        const body = elements(fixSheet().querySelector(".g-sheet__body"));
        assert.equal(body.indexOf(fixSheet().querySelector(".g-player-fix__value")), body.indexOf(block) + 1, "after every block, before his value");
        const button = undo();
        assert.ok(block.contains(button));
        assert.equal(button.tagName, "BUTTON");
        assert.equal(button.getAttribute("type"), "button");
        assert.equal(button.getAttribute("class"), "g-player-fix__undo");
        assert.equal(button.getAttribute("aria-haspopup"), "dialog");
        assert.equal(button.getAttribute("data-player-unadvance"), "p3#0");
        assert.ok(!button.hasAttribute("aria-disabled"));
        assert.equal(button.textContent, "Undo the last: Frenzy");
        assertCspSafe(view);
        assertStyled(view, ...FIX_STYLES);
        fireEvent(button, "click");
        assert.ok(!fixSheet(), "the question takes the fix's place");
        assert.ok(sheet()?.isModal, "dialog#player-unadvance, open");
        assert.equal(view.querySelectorAll("dialog").filter((dialog) => dialog.isModal).length, 1, "one sheet at a time");
        assert.equal(sheet().getAttribute("class"), "g-sheet g-sheet--at-120 g-player-sheet", "in the frame a player's sheets share, 120 from the top on a desk (stage 13)");
        assert.equal(sheet().querySelector("h2").textContent, "Undo the advancement?");
        assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Cade · advancement 1 of 6");
        assert.deepEqual(rows(), [["What it gave", "Frenzy · Random primary skill · rolled on the site"], ["SPP back", "+3"], ["The player's value", "−20k"]]);
        assert.equal(keep().textContent, "Keep");
        assert.equal(send().textContent, "Undo advancement", "short enough for half of a phone's foot (fix round 1)");
        assertCspSafe(view);
        assertStyled(view, ...UNDO_STYLES);
        await settle();
        assert.equal(patches().length, 0, "asked, nothing sent");
      });
    }
  });
});

test("a player with no advancement has no «Advancements» block", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone, { teamAnswer: withOne(CADE) });
        assert.ok(fixSheet()?.isModal);
        assert.ok(!fixTitles().includes("Advancements"));
        assert.ok(!undo());
      });
    }
  });
});

// Review Focus 3: a changed form is saved or cancelled first — an undo opened over it would drop it unsaid.
test("the undo is closed while the fix's form is changed, saying so; nothing opens", async () => {
  const contracts = (step) => fixSheet().querySelector(`[data-resource-key="fix:contracts"] [data-resource-step="${step}"]`);
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openFix(phone);
        fireEvent(contracts(1), "click");
        assert.equal(fixSheet().querySelector('[data-resource-key="fix:contracts"] .g-resource__value').textContent, "1");
        assert.equal(undo().getAttribute("aria-disabled"), "true");
        assert.equal(undo().getAttribute("title"), SAVE_FIRST);
        assert.ok(undo().hasAttribute("data-roster-closed"));
        assert.match(undo().getAttribute("class"), /^g-player-fix__undo g-roster__closed$/);
        assert.equal(undo().textContent, "Undo the last: Frenzy", "it keeps its words");
        assert.ok(!undo().hasAttribute("aria-haspopup"), "it opens nothing");
        fireEvent(undo(), "click");
        assert.equal(toasts().at(-1), SAVE_FIRST);
        assert.ok(!sheet(), "nothing opens");
        assert.ok(fixSheet()?.isModal, "the fix stays, as it was");
        assert.equal(fixSheet().querySelector('[data-resource-key="fix:contracts"] .g-resource__value').textContent, "1");
        assertStyled(view, ...FIX_STYLES);
        // Back as it was: open again.
        fireEvent(contracts(-1), "click");
        assert.ok(!undo().hasAttribute("aria-disabled"));
        assert.equal(undo().getAttribute("aria-haspopup"), "dialog");
        await settle();
        assert.equal(patches().length, 0);
      });
    }
  });
});

// T23 review m2 (the round's final wave): the press asks again what the drawn button says — reached only by an open
// «Undo the last» the screen has not drawn again, as a late press is.
test("a late open «Undo the last» opens nothing with no fix of his open, nor over a changed form", async () => {
  const contracts = (step) => fixSheet().querySelector(`[data-resource-key="fix:contracts"] [data-resource-step="${step}"]`);
  /** An open «Undo the last» for Cade that the screen did not draw, pressed and taken away. */
  const lateUndo = () => {
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-player-unadvance", "p3#0");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
  };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      const said = toasts().length;
      lateUndo();
      assert.ok(!sheet() && !fixSheet(), "no fix of his open: nothing opens");
      assert.equal(toasts().length, said, "and nothing is said");
      reopenFix();
      fireEvent(contracts(1), "click");
      lateUndo();
      assert.equal(toasts().at(-1), SAVE_FIRST, "the form changed, asked at the press");
      assert.ok(!sheet(), "nothing opens");
      assert.ok(fixSheet()?.isModal, "the fix stays, as it was");
      assert.equal(fixSheet().querySelector('[data-resource-key="fix:contracts"] .g-resource__value').textContent, "1");
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

// K12 (preflight of the owner's review): changed is «not as it opened», refused or not — a read may leave a changed form
// one the roster refuses, and it is the coach's still.
test("a form a read has made one the roster refuses is changed still: the undo stays closed", async () => {
  const mouth = { ...ROT, extraSkills: [{ name: "Monstrous Mouth", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Monstrous Mouth" } }] };
  const { fixChanged } = await import("../src/screens/team/roster/fix.mjs");
  const { fixFormOf } = await import("../src/domain/roster/edits.mjs");
  const stored = { ...CADE, nigglingInjuries: 1 };
  const where = { draft: { players: [stored] } };
  assert.equal(fixChanged(where, { index: 0 }, fixFormOf(stored)), false, "as it opened");
  assert.equal(fixChanged(where, { index: 0 }, { ...fixFormOf(stored), contracts: 1 }), true);
  assert.equal(fixChanged(where, { index: 0 }, { ...fixFormOf(stored), niggling: 99 }), true, "refused (NIGGLING_RANGE), changed all the same");
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openFix(true, { id: "n1", teamAnswer: nurgle([mouth]) });
      fireEvent(fixSheet().querySelectorAll("[data-fix-favoured]").find((chip) => chip.getAttribute("data-fix-favoured") === "Tentacles"), "click");
      assert.equal(undo().getAttribute("title"), SAVE_FIRST);
      // Another device takes the roster's god away: Rot is as the fix was seeded from, so it stands — its «Add Tentacles» refused now.
      const read = team({ baseTeamSlug: "teams/nurgle", roster: { favouredChoice: null, players: [mouth] }, revision: 5 });
      api.reply(TEAM_READ, 200, { team: read });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      setMyTeams([read]);
      await settle();
      assert.equal(callsTo(TEAM_READ), 2, "read again");
      assert.ok(fixSheet()?.isModal, "the fix stands");
      assert.ok(fixSheet().querySelector(".g-player-sheet__refusal"), "the form is one the roster refuses");
      assert.equal(undo().getAttribute("aria-disabled"), "true");
      assert.equal(undo().getAttribute("title"), SAVE_FIRST);
      fireEvent(undo(), "click");
      assert.ok(!sheet() && fixSheet()?.isModal, "nothing opens, nothing is dropped");
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

// Review Focus 3, decision 40: as the fix's own «Cancel», the question gives the focus back to the pencil the fix was opened
// from; the fix is not opened again (no sheet of the roster's comes back).
test("«Keep» and a sent undo give the focus back to the pencil", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openUndo(phone);
        keep().focus();
        fireEvent(keep(), "click");
        assert.ok(!sheet() && !fixSheet() && !view.querySelector("dialog#player-edit"), "closed, and nothing opened again");
        assert.ok(document.activeElement === pencil(), "the pencil");
        await settle();
        assert.equal(patches().length, 0);
        reopenFix();
        fireEvent(undo(), "click");
        // Pressed as a browser presses it, the focus on it: the redraw gives it to what opened the question (`OPENERS`).
        send().focus();
        api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
        fireEvent(send(), "click");
        assert.ok(!sheet() && !fixSheet(), "closed in the same turn");
        assert.ok(document.activeElement === pencil(), "the pencil again");
        assert.equal(toasts().at(-1), "Advancement undone: Frenzy · 3 SPP back");
        await settle();
        assert.equal(patches().length, 1);
        // The question's own close (×, Esc) is a «Keep».
        await openUndo(phone, { teamAnswer: withOne(TWICE) });
        keep().focus();
        fireEvent(sheet().querySelector("[data-sheet-close]"), "click");
        assert.ok(!sheet());
        assert.ok(document.activeElement === pencil());
      });
    }
  });
});

// Review Focus 5.
test("undo of a site advancement: the sheet says the roll goes back to the player, one PATCH without it, the coach told", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openUndo(true);
      assert.equal(note(), SITE);
      // Decision 18: an undo is no loss — the main button, never the red one.
      assert.match(send().getAttribute("class"), /\bg-btn--primary\b/);
      assert.doesNotMatch(send().getAttribute("class"), /danger/);
      api.reply(PATCH, 200, { team: withOne(CADE, { revision: 5 }) });
      // Pressed with the focus elsewhere (a click that does not focus a button): the undo gives it to the pencil itself.
      fireEvent(send(), "click");
      assert.ok(!sheet(), "closed in the same turn");
      assert.equal(toasts().at(-1), "Advancement undone: Frenzy · 3 SPP back");
      assert.ok(!toasts().includes(CHANGED), "its own step is no change under it");
      assert.ok(document.activeElement === pencil(), "the focus on the pencil the fix was opened from");
      assert.equal(view.querySelector(".g-profile__availn").textContent, "30", "his SPP back at once, from the draft");
      assert.ok(!view.querySelector(".g-profile__skills").textContent.includes("Frenzy"));
      await settle();
      assert.equal(patches().length, 1);
      assert.equal(patches()[0].body.revision, 4);
      const cade = sentOf("p3");
      assert.deepEqual(cade.advancements ?? [], [], "without the advancement, and so without its roll");
      assert.ok(!(cade.extraSkills ?? []).some(({ name }) => name === "Frenzy"));
      assert.equal(save.saveState("t1").waiting, 0);
      // Nothing left to undo: the fix opened again has no «Advancements» (T23 review m1 — the fix itself closed with the undo).
      reopenFix();
      assert.ok(fixSheet()?.isModal, "the fix opens again");
      assert.ok(!fixTitles().includes("Advancements") && !undo(), "nothing left to undo");
      fireEvent(fixSheet().querySelector("[data-sheet-close]"), "click");
      assert.ok(!fixSheet());
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

// The round's final review m2 (Tasks 21 × 23): the pair an undo gives back is the whole pair again, nothing of the first
// choice left on the sheet — the other die's skill is taken on the same roll (preflight §5: accepted, as a change of choice).
test("on a desk: the second die taken, undone from the fix, the same pair given back whole, and the first die's skill taken on it", async () => {
  const advancing = () => view.querySelector("dialog#player-advance");
  const card = (name) => advancing().querySelector(`[data-advance-pick="${name}"]`);
  const cards = () => ["Frenzy", "Strip Ball"].map((name) => [name, card(name).getAttribute("aria-disabled"), card(name).getAttribute("aria-checked")]);
  const STRIP = { type: "random", grants: { skill: "Strip Ball" }, roll: { id: "r4", via: "site" } };
  const FRENZY = { type: "random", grants: { skill: "Frenzy" }, roll: { id: "r4", via: "site" } };
  /** «Advance» in the panel, «Random primary», General, and «Roll two D16», which the server answers with the pair, waiting. */
  async function rollPair() {
    fireEvent(advance(), "click");
    fireEvent(advancing().querySelector('.g-options [data-option-value="random"]'), "click");
    fireEvent(advancing().querySelector('[data-advance-category="General"]'), "click");
    api.reply(ASK, 200, { roll: { ...PAIR, usedAt: null } });
    fireEvent(advancing().querySelector("[data-advance-roll]"), "click");
    await settle();
  }
  await withoutTimers(async () => {
    await openPlayer(false, { teamAnswer: withOne(CADE) });
    await rollPair();
    assert.deepEqual(cards(), [["Frenzy", null, "false"], ["Strip Ball", null, "false"]]);
    fireEvent(card("Strip Ball"), "click");
    api.reply(PATCH, 200, { team: withOne({ ...CADE, extraSkills: [{ name: "Strip Ball", access: "primary" }], advancements: [STRIP] }, { revision: 5 }) });
    fireEvent(advancing().querySelector("[data-advance-take]"), "click");
    await settle();
    assert.deepEqual(sentOf("p3").advancements, [STRIP], "the second die's skill, on r4");
    fireEvent(advancing().querySelector("[data-sheet-close]"), "click");
    assert.ok(!advancing());
    // Undone from the fix by hand: one PATCH without it, and the server frees r4.
    reopenFix();
    assert.equal(undo().textContent, "Undo the last: Strip Ball");
    fireEvent(undo(), "click");
    api.reply(PATCH, 200, { team: withOne(CADE, { revision: 6 }) });
    fireEvent(send(), "click");
    assert.ok(document.activeElement === pencil(), "the focus on the pencil the fix was opened from");
    await settle();
    assert.equal(patches().length, 2);
    assert.deepEqual(sentOf("p3").advancements ?? [], [], "the PATCH after the undo: no advancement");
    assert.ok(!(sentOf("p3").extraSkills ?? []).some(({ name }) => name === "Strip Ball"));
    // Asked again: the same pair, both cards open and neither checked; the first die's skill is taken this time.
    await rollPair();
    assert.equal(callsTo(ASK), 2);
    assert.deepEqual(cards(), [["Frenzy", null, "false"], ["Strip Ball", null, "false"]], "the pair whole again: nothing kept of the first choice");
    fireEvent(card("Frenzy"), "click");
    assert.equal(advancing().querySelector("[data-advance-take]").textContent, "Take: Frenzy");
    api.reply(PATCH, 200, { team: withOne({ ...CADE, extraSkills: [{ name: "Frenzy", access: "primary" }], advancements: [FRENZY] }, { revision: 7 }) });
    fireEvent(advancing().querySelector("[data-advance-take]"), "click");
    await settle();
    assert.equal(patches().length, 3);
    assert.deepEqual(sentOf("p3").advancements, [FRENZY], "the first die's skill, on the same roll r4");
    assert.deepEqual((sentOf("p3").extraSkills ?? []).map(({ name }) => name), ["Frenzy"]);
  });
});

test("a table or chosen advancement can be taken again; one that does not say what it gave gives the SPP back only", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openFix(true, { teamAnswer: withOne(STAT) });
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
      await openUndo(true, { teamAnswer: withOne(CHOSEN) });
      assert.deepEqual(rows(), [["What it gave", "Diving Catch · Chosen primary skill"], ["SPP back", "+6"], ["The player's value", "−20k"]]);
      assert.equal(note(), TABLE);
    });
    await withWindow({ phone: true }, async () => {
      await openFix(true, { teamAnswer: withOne(BARE_ONE) });
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
    await openUndo(false);
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
    assert.ok(!fixSheet(), "the fix is not opened again");
    assert.ok(document.activeElement === pencil(), "back on the pencil the fix was opened from");
    assert.equal(patches().length, 0);
    // The last one goes, the first stays.
    reopenFix();
    assert.equal(undo().textContent, "Undo the last: Diving Catch");
    fireEvent(undo(), "click");
    assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "Cade · advancement 2 of 6");
    assert.deepEqual(rows(), [["What it gave", "Diving Catch · Chosen primary skill"], ["SPP back", "+8"], ["The player's value", "−20k"]]);
    api.reply(PATCH, 200, { team: withOne(ADVANCED, { revision: 6 }) });
    fireEvent(send(), "click");
    assert.ok(document.activeElement === pencil(), "the focus on the pencil");
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.revision, 5);
    assert.deepEqual(sentOf("p3").advancements, ADVANCED.advancements);
    reopenFix();
    assert.equal(undo().textContent, "Undo the last: Frenzy");
  });
});

// Fix round 1 (review Minor 8): the sheet stands on the advancement it showed, not on the count — a press never undoes
// what the coach did not see.
test("the same count with another last advancement closes the sheet, saying so; nothing is sent", async () => {
  await withoutTimers(async () => {
    await openUndo(false, { teamAnswer: withOne(TWICE) });
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
    assert.ok(document.activeElement === pencil(), "back on the pencil the fix was opened from");
    // A late press of the sheet's button finds nothing to send.
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-unadvance-send", "true");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
    await settle();
    assert.equal(patches().length, 0);
    reopenFix();
    assert.equal(undo().textContent, "Undo the last: Sure Hands");
  });
});

test("closed in a match: the fix and the question close with it, the focus on the pencil, closed now; a second press sends nothing more", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      // A match begun while the fix is open closes it, as it did (R8).
      await withWindow({ phone }, async () => {
        await openFix(phone);
        undo().focus();
        await matchBegins(withOne(ADVANCED, { revision: 4 }));
        assert.ok(!fixSheet(), "R8: the fix closes with the match");
        assert.ok(!undo(), "and its undo with it: none anywhere");
        assert.ok(document.activeElement === pencil(), "the focus on the pencil, closed now");
        assert.ok(closed(pencil()));
        assert.equal(pencil().getAttribute("title"), EDIT_CLOSED);
        fireEvent(pencil(), "click");
        assert.equal(toasts().at(-1), EDIT_CLOSED);
        assert.ok(!view.querySelector("dialog#player-edit") && !fixSheet() && !sheet(), "nothing opens");
        await settle();
        assert.equal(patches().length, 0);
      });
      // And while the question is open.
      await withWindow({ phone }, async () => {
        await openUndo(phone);
        send().focus();
        await matchBegins(withOne(ADVANCED, { revision: 4 }));
        assert.ok(!sheet(), "R8: the question closes with the match");
        assert.ok(document.activeElement === pencil(), "the focus on the pencil, closed now");
        assert.ok(closed(pencil()));
        await settle();
        assert.equal(patches().length, 0);
      });
    }
    // K15: a match begun before the screen is drawn again — «Undo the last» asks at the press, and nothing opens.
    await withWindow({ phone: true }, async () => {
      await openFix(true);
      const games = state.games.items;
      state.games.items = [LIVE_GAME];
      fireEvent(undo(), "click");
      assert.equal(toasts().at(-1), AFTER_POST);
      assert.ok(!sheet());
      state.games.items = games;
      await settle();
      assert.equal(patches().length, 0);
    });
    // Review Focus 2: one press, one step — a second press, or a late one, finds no sheet.
    await withWindow({ phone: true }, async () => {
      await openUndo(true);
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
      await openUndo(true);
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
    await openUndo(false);
    api.fail(PATCH);
    fireEvent(send(), "click");
    await settle();
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "30", "drawn at once");
    assert.ok(!skillsIn(aside()).includes("Frenzy"), "undone in the draft");
    await matchBegins(withOne(ADVANCED, { revision: 4 }));
    assert.equal(toasts().at(-1), DROPPED);
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "27", "the server's roster");
    assert.ok(skillsIn(aside()).includes("Frenzy"), "Frenzy back with it");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
  });
});

// The roster's invariant: a lost answer's step is the same roster sent again, its 409 known as that very save — never a second undo.
test("an undo whose answer was lost is sent again as the same roster, and its 409 is known as this very undo", async () => {
  await withoutTimers(async () => {
    await openUndo(false, { teamAnswer: withOne(TWICE) });
    api.fail(PATCH);
    fireEvent(send(), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    assert.deepEqual(skillsIn(aside()).filter((skill) => ["Frenzy", "Diving Catch"].includes(skill)), ["Frenzy"], "Diving Catch undone in the draft");
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
    reopenFix();
    assert.equal(undo().textContent, "Undo the last: Frenzy");
  });
});

// K16: the server keeps a skill a used site roll was rerolled against; the undo's 422 is said in the player's words.
test("an undo the server refuses for a used roll is said, and the roster read again", async () => {
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openUndo(true, { teamAnswer: withOne(TABLE_FRENZY) });
      assert.equal(note(), TABLE);
      api.reply(PATCH, 422, { error: { code: "DICE_ROLL_MISMATCH", params: {}, message: "x" } });
      fireEvent(send(), "click");
      await settle();
      assert.equal(patches().length, 1);
      assert.equal(toasts().at(-1), MISMATCH);
      assert.equal(callsTo(TEAM_READ), 2, "the server's roster read again");
      assert.ok(skillsIn(view.querySelector(".g-profile__skills")).includes("Frenzy"), "it stays");
      assert.equal(view.querySelector(".g-profile__availn").textContent, "27");
    });
  });
});

// The owner, 2026-10-21 (content «Team Management», «Favoured of…»: «Every time a player receives an advancement, roll a
// d8»), in place of decision 17's bonus after done: the god's D8 before «Take», with every advancement, the skill with it.
const godSheet = () => view.querySelector("dialog#player-advance");
const favoured = () => godSheet().querySelector(".g-favoured");
const godLines = () => favoured().querySelectorAll(".g-favoured__line").map((line) => line.textContent);
const godFace = (face) => favoured().querySelectorAll("[data-favoured-d8]").find((each) => each.getAttribute("data-favoured-d8") === String(face));
const godItem = (name) => favoured().querySelectorAll("[data-favoured-skill]").find((each) => each.getAttribute("data-favoured-skill") === name);
const godTake = () => godSheet().querySelector("[data-advance-take]");
const NURGLE_SUB = "Roll a D8 at the table with every advancement: on a 7 the player gains one of the god's skills, at no cost to the value.";
/** A chosen primary skill on a phone: the type, «Next», the category, «Next», the skill. */
function choosePrimary(category, skill) {
  fireEvent(godSheet().querySelector('.g-options [data-option-value="primary"]'), "click");
  fireEvent(godSheet().querySelector("[data-advance-next]"), "click");
  fireEvent(godSheet().querySelector(`[data-advance-category="${category}"]`), "click");
  fireEvent(godSheet().querySelector("[data-advance-next]"), "click");
  fireEvent(godSheet().querySelector(`[data-advance-skill="${skill}"]`), "click");
}

test("Favoured of Nurgle: the god's D8 before «Take», with every advancement; on his face a skill or none; one PATCH with both", async () => {
  const mouth = { ...ROT, extraSkills: [{ name: "Monstrous Mouth", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Monstrous Mouth" } }] };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n1", teamAnswer: nurgle([ROT]) });
      fireEvent(advance(), "click");
      fireEvent(godSheet().querySelector('.g-options [data-option-value="primary"]'), "click");
      assert.ok(!favoured(), "nothing to roll for before the advancement is whole");
      fireEvent(godSheet().querySelector("[data-advance-next]"), "click");
      fireEvent(godSheet().querySelector('[data-advance-category="Mutation"]'), "click");
      fireEvent(godSheet().querySelector("[data-advance-next]"), "click");
      assert.ok(!favoured());
      fireEvent(godSheet().querySelector('[data-advance-skill="Monstrous Mouth"]'), "click");
      assert.equal(favoured().tagName, "SECTION");
      assert.equal(favoured().querySelector(".g-favoured__title").textContent, "Nurgle: a bonus skill");
      assert.deepEqual(godLines(), [NURGLE_SUB], "Mutation in his primary access: he chooses");
      const faces = favoured().querySelector(".g-favoured__d8");
      assert.equal(faces.getAttribute("role"), "radiogroup");
      assert.equal(faces.getAttribute("aria-label"), "The god's D8");
      assert.deepEqual(faces.querySelectorAll("[data-favoured-d8]").map((face) => [face.textContent, face.getAttribute("role"), face.getAttribute("aria-checked")]),
        ["1", "2", "3", "4", "5", "6", "7", "8"].map((face) => [face, "radio", "false"]));
      assert.ok(!favoured().querySelector(".g-favoured__skills"), "no skills before the god's face");
      // «Take» waits for the D8: a press sends nothing.
      assert.equal(godTake().textContent, "Mark the god's D8");
      assert.ok(godTake().hasAttribute("disabled"));
      fireEvent(godTake(), "click");
      assert.ok(!view.querySelector(".g-advance__done"));
      // Another face: no bonus, «Take» open.
      fireEvent(godFace(3), "click");
      assert.equal(godFace(3).getAttribute("aria-checked"), "true");
      assert.deepEqual(godLines(), [NURGLE_SUB, "D8 3: no bonus."]);
      assert.ok(!favoured().querySelector(".g-favoured__skills"));
      assert.equal(godTake().textContent, "Take Monstrous Mouth");
      assert.ok(!godTake().hasAttribute("disabled"));
      // The god's face: his skills — the one this advancement gives closed, saying why — and «No bonus»; «Take» waits for a choice.
      fireEvent(godFace(7), "click");
      assert.deepEqual(godLines(), [NURGLE_SUB, "D8 7: the god's face — choose the bonus skill, or none."]);
      const group = favoured().querySelector(".g-favoured__skills");
      assert.equal(group.getAttribute("role"), "radiogroup");
      assert.equal(group.getAttribute("aria-label"), "Bonus skill");
      assert.deepEqual(group.querySelectorAll("[data-favoured-skill]").map((each) => [each.getAttribute("data-favoured-skill"), each.getAttribute("aria-checked"), closed(each)]),
        [["Tentacles", "false", false], ["Monstrous Mouth", "false", true], ["Bone Hook", "false", false], ["none", "false", false]]);
      assert.equal(godItem("Monstrous Mouth").getAttribute("title"), "This advancement gives the player this skill.");
      assert.equal(godItem("Monstrous Mouth").querySelector(".g-advance__tag").textContent, "with this advancement");
      assert.equal(godItem("none").textContent, "No bonus");
      assert.equal(godTake().textContent, "Choose the bonus skill");
      assert.ok(godTake().hasAttribute("disabled"));
      fireEvent(godItem("Monstrous Mouth"), "click");
      assert.equal(toasts().at(-1), "This advancement gives the player this skill.");
      assert.equal(godItem("Monstrous Mouth").getAttribute("aria-checked"), "false");
      fireEvent(godItem("Tentacles"), "click");
      assert.equal(godItem("Tentacles").getAttribute("aria-checked"), "true");
      assert.equal(godTake().textContent, "Take Monstrous Mouth");
      assertCspSafe(view);
      assertStyled(view, ...UNDO_STYLES);
      // Taken: one PATCH with the advancement and the god's skill; done says what the D8 gave, nothing more to press.
      const added = { ...mouth, favouredSkills: [{ name: "Tentacles", access: "favoured" }] };
      api.reply(PATCH, 200, { team: nurgle([added], { revision: 5 }) });
      fireEvent(godTake(), "click");
      assert.ok(view.querySelector(".g-advance__done"));
      assert.deepEqual(godLines(), ["D8 7: Tentacles, at no cost to the value"]);
      assert.ok(!favoured().querySelector("button"), "nothing to press under done");
      assert.ok(document.activeElement === view.querySelector("[data-advance-done]"));
      await settle();
      assert.equal(patches().length, 1, "the advancement and its bonus: one save");
      const rot = sentOf("n1");
      assert.deepEqual(rot.favouredSkills, [{ name: "Tentacles", access: "favoured" }]);
      assert.deepEqual(rot.advancements, [{ ...mouth.advancements[0], favoured: "Tentacles" }], "the god's skill tied to its advancement (Task 10 review)");
      assert.equal(patches()[0].body.roster.favouredChoice, "Nurgle");
    });
    // A Rotspawn (no Mutation in his primary access): the skill is rolled for at the table too; his own Tentacles closed; «No bonus».
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n2", teamAnswer: nurgle([SPAWN]) });
      fireEvent(advance(), "click");
      choosePrimary("Strength", "Guard");
      assert.deepEqual(godLines(), [NURGLE_SUB, "Without Mutation in the primary access the skill is chosen at random — roll for it at the table too."]);
      fireEvent(godFace(7), "click");
      assert.ok(closed(godItem("Tentacles")));
      assert.equal(godItem("Tentacles").getAttribute("title"), "The player has this skill already.");
      fireEvent(godItem("none"), "click");
      assert.equal(godTake().textContent, "Take Guard");
      const guard = { ...SPAWN, extraSkills: [{ name: "Guard", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Guard" } }] };
      api.reply(PATCH, 200, { team: nurgle([guard], { revision: 5 }) });
      fireEvent(godTake(), "click");
      assert.deepEqual(godLines(), ["D8 7: no bonus taken"]);
      await settle();
      assert.deepEqual(sentOf("n2").favouredSkills ?? [], [], "declined");
    });
    // On a desk, under the columns once the advancement is whole; done in the window says the D8 missed.
    await openPlayer(false, { id: "n1", teamAnswer: nurgle([ROT]) });
    fireEvent(advance(), "click");
    fireEvent(godSheet().querySelector('.g-options [data-option-value="primary"]'), "click");
    fireEvent(godSheet().querySelector('[data-advance-category="Mutation"]'), "click");
    assert.ok(!favoured());
    fireEvent(godSheet().querySelector('[data-advance-skill="Monstrous Mouth"]'), "click");
    assert.equal(favoured().querySelector(".g-favoured__title").textContent, "Nurgle: a bonus skill");
    assert.equal(godTake().textContent, "Mark the god's D8");
    fireEvent(godFace(4), "click");
    assertStyled(view, ...UNDO_STYLES);
    api.reply(PATCH, 200, { team: nurgle([mouth], { revision: 5 }) });
    fireEvent(godTake(), "click");
    assert.deepEqual(godLines(), ["D8 4: no bonus."]);
    await settle();
    assert.deepEqual(sentOf("n1").favouredSkills ?? [], []);
    // No «Favoured of…», no D8.
    await openPlayer(false, { teamAnswer: withOne(ADVANCED) });
    fireEvent(advance(), "click");
    const humans = godSheet();
    fireEvent(humans.querySelector('.g-options [data-option-value="primary"]'), "click");
    fireEvent(humans.querySelector('[data-advance-category="Agility"]'), "click");
    fireEvent(humans.querySelector('[data-advance-skill="Diving Catch"]'), "click");
    assert.ok(!view.querySelector(".g-favoured"));
    assert.equal(godTake().textContent, "Take Diving Catch");
    api.reply(PATCH, 200, { team: withOne(TWICE, { revision: 5 }) });
    fireEvent(humans.querySelector("[data-advance-take]"), "click");
    assert.ok(view.querySelector(".g-advance__done"));
    assert.ok(!view.querySelector(".g-favoured"));
    await settle();
  });
});

// The owner, 2026-10-21: no D8 when the god has nothing left to give — the advancement's own skill counted.
test("a player holding every skill the god offers rolls no D8: said so, «Take» open", async () => {
  const held = { ...ROT, favouredSkills: [{ name: "Tentacles", access: "favoured" }, { name: "Bone Hook", access: "favoured" }] };
  const taken = { ...held, extraSkills: [{ name: "Monstrous Mouth", access: "primary" }], advancements: [{ type: "primary", grants: { skill: "Monstrous Mouth" } }] };
  const SKIPPED = "The player holds every skill on the god's list: no D8 to roll.";
  await withoutTimers(async () => {
    // On a desk: another skill leaves Monstrous Mouth the god's to give, this one leaves nothing.
    await openPlayer(false, { id: "n1", teamAnswer: nurgle([held]) });
    fireEvent(advance(), "click");
    fireEvent(godSheet().querySelector('.g-options [data-option-value="primary"]'), "click");
    fireEvent(godSheet().querySelector('[data-advance-category="General"]'), "click");
    fireEvent(godSheet().querySelector('[data-advance-skill="Block"]'), "click");
    assert.ok(godFace(1), "Monstrous Mouth is still the god's to give");
    assert.equal(godTake().textContent, "Mark the god's D8");
    fireEvent(godSheet().querySelector('[data-advance-category="Mutation"]'), "click");
    fireEvent(godSheet().querySelector('[data-advance-skill="Monstrous Mouth"]'), "click");
    assert.deepEqual(godLines(), [SKIPPED]);
    assert.ok(!godFace(1));
    await settle();
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n1", teamAnswer: nurgle([held]) });
      fireEvent(advance(), "click");
      choosePrimary("Mutation", "Monstrous Mouth");
      assert.deepEqual(godLines(), [SKIPPED], "Tentacles, Bone Hook and Monstrous Mouth are all his");
      assert.equal(godTake().textContent, "Take Monstrous Mouth");
      api.reply(PATCH, 200, { team: nurgle([taken], { revision: 5 }) });
      fireEvent(godTake(), "click");
      assert.ok(view.querySelector(".g-advance__done"));
      assert.deepEqual(godLines(), [SKIPPED]);
      await settle();
      assert.equal(patches().length, 1);
      assert.deepEqual(sentOf("n1").favouredSkills, held.favouredSkills);
    });
  });
});

// Task 10 review (content «Team Management» :313 — one god's skill per advancement): the god's skill the D8 brought is tied
// to its advancement, and «Undo the last» takes it back with it, as the post-match's own undo does; a take again rolls the
// god's D8 for a clean player, never a second skill for one advancement.
test("Favoured of Nurgle: undoing an advancement takes back the god's skill its D8 brought; a take again asks a fresh D8", async () => {
  const BLOCK = { type: "primary", grants: { skill: "Block" } };
  const blessed = { ...ROT, extraSkills: [{ name: "Block", access: "primary" }], favouredSkills: [{ name: "Tentacles", access: "favoured" }],
    advancements: [{ ...BLOCK, favoured: "Tentacles" }] };
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openPlayer(true, { id: "n1", teamAnswer: nurgle([ROT]) });
      fireEvent(advance(), "click");
      choosePrimary("General", "Block");
      fireEvent(godFace(7), "click");
      fireEvent(godItem("Tentacles"), "click");
      api.reply(PATCH, 200, { team: nurgle([blessed], { revision: 5 }) });
      fireEvent(godTake(), "click");
      await settle();
      assert.deepEqual(sentOf("n1").advancements, [{ ...BLOCK, favoured: "Tentacles" }], "the god's skill tied to its advancement");
      fireEvent(godSheet().querySelector("[data-advance-done]"), "click");
      assert.ok(!godSheet());
      // «Undo the last: Block» says the god's skill goes with it.
      reopenFix();
      assert.equal(undo().textContent, "Undo the last: Block");
      fireEvent(undo(), "click");
      assert.deepEqual(rows(), [["What it gave", "Block · Chosen primary skill"], ["The god's skill", "Tentacles"], ["SPP back", "+6"], ["The player's value", "−20k"]]);
      assert.deepEqual(sheet().querySelectorAll(".g-unadvance__note").map((line) => line.textContent), [TABLE], "nothing loose to point at");
      api.reply(PATCH, 200, { team: nurgle([ROT], { revision: 6 }) });
      fireEvent(send(), "click");
      assert.equal(toasts().at(-1), "Advancement undone: Block and the god's Tentacles · 6 SPP back");
      await settle();
      assert.equal(patches().length, 2);
      assert.deepEqual(sentOf("n1").advancements ?? [], []);
      assert.deepEqual(sentOf("n1").favouredSkills ?? [], [], "the god's skill goes with its advancement");
      assert.ok(!(sentOf("n1").extraSkills ?? []).some(({ name }) => name === "Block"));
      // Taken again: the god's D8 for a clean player — Tentacles the god's to give again, not a second skill of one advancement.
      fireEvent(advance(), "click");
      choosePrimary("General", "Block");
      assert.equal(godTake().textContent, "Mark the god's D8");
      fireEvent(godFace(7), "click");
      assert.ok(!closed(godItem("Tentacles")), "Tentacles is no longer his");
    });
  });
});

// Task 10 review: an advancement saved before the tie (2.x's, or a post-match finished before it) says nothing of a god's
// skill; the undo names the god's skills no advancement names and points to taking one off by hand. Nothing else goes.
test("an advancement without a tie: the undo names the loose god's skills and points to the fix by hand; they stay", async () => {
  const legacy = { ...ROT, extraSkills: [{ name: "Block", access: "primary" }], favouredSkills: [{ name: "Tentacles", access: "favoured" }, { name: "Bone Hook", access: "favoured" }],
    advancements: [{ type: "primary", grants: { skill: "Block" } }] };
  const LOOSE = "The god's skills no advancement names (Tentacles, Bone Hook) stay: if this advancement brought one, take it off in «Fix by hand».";
  await withoutTimers(async () => {
    await withWindow({ phone: true }, async () => {
      await openUndo(true, { id: "n1", teamAnswer: nurgle([legacy]) });
      assert.deepEqual(rows(), [["What it gave", "Block · Chosen primary skill"], ["SPP back", "+6"], ["The player's value", "−20k"]]);
      assert.deepEqual(sheet().querySelectorAll(".g-unadvance__note").map((line) => line.textContent), [TABLE, LOOSE]);
      api.reply(PATCH, 200, { team: nurgle([{ ...ROT, favouredSkills: legacy.favouredSkills }], { revision: 5 }) });
      fireEvent(send(), "click");
      assert.equal(toasts().at(-1), "Advancement undone: Block · 6 SPP back");
      await settle();
      assert.deepEqual(sentOf("n1").favouredSkills, legacy.favouredSkills, "a god's skill no advancement names stays");
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
      assert.deepEqual(body.map((node) => node.getAttribute("class")), ["g-prose", "g-roster__rollblock", "g-roster__from g-roster__from--gained"]);
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
    // T22 review m1 (the round's final wave): a roll found that shows no skill says nothing of its dice — the line alone, no
    // empty «Rolled:» and no state line (no roll the server settled is one).
    await withWindow({ phone: true }, async () => {
      await openPlayer(true);
      api.reply(ROLLS_READ, 200, { rolls: [{ ...R1, result: {} }] });
      fireEvent(chip("Frenzy"), "click");
      await settle();
      assert.deepEqual(elements(skillSheet().querySelector(".g-roster__rollblock")).map((node) => node.getAttribute("class")), ["g-roster__rollline"]);
      assert.equal(skillSheet().querySelector(".g-roster__rollline").textContent, "Advancement 1 · Random primary skill · rolled on the site");
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
    "src/screens/team/roster/advance-sheet.mjs", "src/screens/team/roster/panel.mjs", "src/screens/team/roster/player-access.mjs", "src/screens/team/roster/fix.mjs");
  for (const locale of ["en", "ru"]) {
    const words = JSON.parse(text(`src/i18n/${locale}.json`));
    assert.deepEqual([words["teamPlayer.fix.advancements"], words["teamPlayer.fix.open"]], {
      en: ["Advancements", "Fix by hand: injuries, characteristics, contract, skills, advancements"],
      ru: ["Прокачки", "Исправить вручную: травмы, характеристики, контракт, навыки, прокачки"],
    }[locale], locale);
  }
  // The words name no player's gender (owner's answer on words).
  const gendered = { en: /\b(he|him|his|she|her|hers)\b/i, ru: /(?<![а-яё])(он|она|его|её|ему|ей|получил|получила|вернул|вернула)(?![а-яё])/iu };
  for (const [locale, pattern] of Object.entries(gendered)) {
    const words = Object.entries(JSON.parse(text(`src/i18n/${locale}.json`))).filter(([key]) => /^teamPlayer\.(undo|favoured|roll)\./.test(key));
    assert.ok(words.length >= 24, locale);
    assert.deepEqual(words.filter(([, value]) => pattern.test(value)), [], locale);
  }
  for (const file of [PROFILE, FRAME, SHEETS, ADVANCE, ROLLS, FIX]) {
    const css = text(file);
    assert.doesNotMatch(css, /--focus-ring/, file);
    assert.doesNotMatch(css, /text-overflow/, file);
    assertBreakpoints(file);
  }
  // Every new rule sets what the 2.x globals would otherwise give: font, letter-spacing, text-transform.
  const own = [[FIX, ".g-player-fix__undo"], [SHEETS, "#player-unadvance .g-unadvance__key"],
    [SHEETS, "#player-unadvance .g-unadvance__value"], [SHEETS, "#player-unadvance .g-unadvance__note"], [ADVANCE, "#player-advance .g-favoured__title"],
    [ADVANCE, "#player-advance .g-favoured__line"], [ROLLS, "#roster-skill .g-roster__rollline"], [ROLLS, "#roster-skill .g-roster__rollstate"],
    [ROLLS, "#roster-skill .g-roster__rollpair"]];
  for (const [file, selector] of own) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(file, selector, property).length >= 1, `${selector} ${property}`);
  }
  // «Undo the last» is quiet (decisions 18, 40): a line of words in the accent at the block's left, no frame, no fill — never
  // the danger's; closed, the roster's closed look (`.g-roster__closed`), its pointer too.
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "font"), ["600 14px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "color"), ["var(--accent-text)"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "border"), ["0"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "background"), ["none"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "padding"), ["0"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "justify-content"), ["flex-start"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo", "text-align"), ["left"]);
  assert.deepEqual(valuesOf(FIX, ".g-player-fix__undo.g-roster__closed", "cursor"), ["default"]);
  for (const file of [PROFILE, FRAME, SHEETS, FIX]) assert.doesNotMatch(text(file).replace(/\/\*[\s\S]*?\*\//g, ""), /undo[^{]*\{[^}]*danger/, file);
  assertReadable(FIX, ".g-player-fix__undo", "color", ["--surface"], 4.5);
  // Task 23 (K19 withdrawn): the profile's and the panel's undo are gone, and their rules with them.
  assert.doesNotMatch(text(PROFILE), /g-profile__undo/);
  assert.doesNotMatch(text(FRAME), /g-roster__undo/);
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
  const height = (file, query, selector) => Number(mediaText(file, query).match(new RegExp(`${selector.replace(/[.[\]"]/g, "\\$&")} \\{[^}]*min-height: (\\d+)px;`))?.[1]);
  assert.equal(height(FIX, "max-width: 900px", ".g-player-fix__undo"), 44);
  assert.equal(height(FIX, "min-width: 901px", ".g-player-fix__undo"), 32);
  assert.ok(height(FIX, "min-width: 901px", ".g-player-fix__undo") >= 24);
  // The god's D8 is the characteristic's faces (rolls.css), in a row of eight on a desk too; its skills the advancement's own.
  assert.ok(height(ROLLS, "max-width: 900px", "#player-advance .g-advance__d8face") >= 44);
  assert.ok(height(ROLLS, "min-width: 901px", "#player-advance .g-advance__d8face") >= 24);
  assert.deepEqual(valuesOf(ADVANCE, "#player-advance .g-favoured .g-favoured__d8", "grid-template-columns"), ["repeat(8, minmax(0, 1fr))"]);
  assert.doesNotMatch(bare(ADVANCE), /g-favoured \.g-btn/, "no «Add …» left");
  // The profile's page holds the page only (T8): the sheets' rules live in their own files.
  assert.doesNotMatch(bare(PROFILE), /unadvance|g-favoured|roster-skill/);
});

test("a long skill or line wraps; nothing is cut with «…»", () => {
  for (const [file, selector] of [[SHEETS, "#player-unadvance .g-unadvance__value"], [SHEETS, "#player-unadvance .g-unadvance__note"], [FIX, ".g-player-fix__undo"],
    [ADVANCE, "#player-advance .g-favoured__title"], [ADVANCE, "#player-advance .g-favoured__line"],
    [ROLLS, "#roster-skill .g-roster__rollline"], [ROLLS, "#roster-skill .g-roster__rollstate"], [ROLLS, "#roster-skill .g-roster__rollpair"]]) {
    assert.deepEqual(valuesOf(file, selector, "overflow-wrap"), ["anywhere"], selector);
  }
});

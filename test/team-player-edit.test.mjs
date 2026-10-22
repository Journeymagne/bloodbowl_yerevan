import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PLAYERS, STYLES, api, aside, bodyOf, coach, loadGames, playerPage, renderTeamRoster, save, settle, state, team, text, toggle, view, withPlayers,
} from "./helpers/roster-page.mjs";

const { prepResetWords } = await import("../src/screens/team/roster/panel.mjs");

// Stage 07d, Task 8: the pencil opens «Edit the player» — on a phone a sheet over his profile (PlayerEdit.html), on a
// desk a 480px window over the roster (DeskRosterEdit.html) — with his number, his name and the captaincy, and «Save»
// one step of the roster's save queue. The captain's switch says where the armband goes (PlayerCaptain.html,
// DeskRosterCaptain.html). On a desk, outside a match, the window carries his SPP counters under «Team captain» as
// DeskRosterLive.html's tiles (owner's D3, answer 2), each press a step of its own. The page, the coach and his team are
// helpers/roster-page.mjs's: Ann 1, Bors 2 (the captain), Cade 3 — a Catcher — and four who miss the next match.

const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const SHEETS = "src/screens/team/roster/player-sheets.css";
/** The frame every sheet of a player's wears (player-sheets.css). */
const FRAME = ".g-player-sheet";
const CLOSED = "Number, name and captain — after the post-match";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";
const NOTE = "Opponents see the number and the name in the roster and in the match report";
const NO_ID = "This player has no id in the roster, so nothing can be saved for this player. Ask the league administrator to fix the roster.";
const DROPPED = "A match has begun, so the player edits and advancements that were waiting were not saved. Make them again after the post-match.";
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
const EDIT_STYLES = [...STYLES, "toggle.css", "text-field.css"];
const CHANGED = "The player's number, name or captaincy has changed — open the edit again";

const patches = () => api.calls.filter(({ key }) => key === PATCH);
const teamReads = () => api.calls.filter(({ key }) => key === TEAM_READ).length;
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const status = () => view.querySelector(".g-roster__status").textContent;
const editSheet = () => view.querySelector("dialog#player-edit");
const pencil = () => view.querySelector("[data-player-edit]");
const numberField = () => editSheet().querySelector("#player-edit-number");
const nameField = () => editSheet().querySelector("#player-edit-name");
const captainSwitch = () => editSheet().querySelector('[data-toggle-key="player-captain"]');
const captionOf = () => captainSwitch().querySelector(".g-toggle__caption").textContent;
const note = () => editSheet().querySelector(".g-player-edit__note");
const saveButton = () => editSheet().querySelector("[data-edit-save]");
const cancelButton = () => editSheet().querySelector("[data-edit-keep]");
const refusal = () => editSheet().querySelector(".g-player-sheet__refusal");
const sppBlock = () => editSheet().querySelector(".g-player-edit__spp");
/** The players of a PATCH's roster, by id: number, name and the armband. */
const sentPlayers = (call) => Object.fromEntries(call.body.roster.players.map((player) => [player.id, [player.number, player.name, Boolean(player.isCaptain)]]));
/** t1 on the server with Cade (or another) in place of his own line. */
const withOne = (player, over = {}) => withPlayers(PLAYERS.map((each) => (each.id === player.id ? player : each)), over);
/** What the coach types in a field: the caret where the typing left it, then the field's own `input`. */
const type = (field, value) => {
  field.focus();
  field.value = value;
  field.selectionStart = value.length;
  field.selectionEnd = value.length;
  fireEvent(field, "input");
};
/**
 * Cade's edit open: on a phone from the pencil in his profile's head, on a desk from the pencil in the panel (him chosen).
 * `key`'s player instead; the roster as `teamAnswer` says, the games as `games` do.
 */
const openEdit = async (phone, { id = "p3", teamAnswer = team(), games = [] } = {}) => {
  coach({ teamAnswer, open: phone ? null : `${id}#0` });
  gamesAre(games);
  if (phone) await playerPage(id);
  else await renderTeamRoster("t1");
  fireEvent(pencil(), "click");
};
/** A match begins on another device: the games say so, and `server` is the roster the server holds. */
const matchBegins = async (server) => {
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  gamesAre([LIVE_GAME]);
  await loadGames(true);
  await settle();
};

test("the pencil opens the edit: on a phone a sheet from his profile, on a desk a window from the panel — the number, the name, the captain, opponents see them", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        coach({ open: phone ? null : "p3#0" });
        if (phone) await playerPage("p3");
        else await renderTeamRoster("t1");
        const button = pencil();
        assert.equal(button.tagName, "BUTTON", "a button that opens a dialog, not a link");
        assert.equal(button.getAttribute("type"), "button");
        assert.equal(button.getAttribute("aria-haspopup"), "dialog");
        assert.equal(button.getAttribute("data-player-edit"), "p3#0");
        assert.equal(button.getAttribute("aria-label"), phone ? "Edit the player" : "Edit Cade");
        if (!phone) assert.ok(button.closest(".g-roster__aside"), "the panel's pencil");
        fireEvent(button, "click");
        const sheet = editSheet();
        assert.ok(sheet?.isModal, "dialog#player-edit, open");
        assert.equal(sheet.getAttribute("class"), "g-sheet g-player-sheet", "in the frame a player's sheets share");
        assert.equal(sheet.querySelector("h2").textContent, "Edit the player");
        assert.equal(sheet.querySelector(".g-sheet__sub").textContent, "Catcher · Human");
        assert.equal(sheet.querySelector('label[for="player-edit-number"]').textContent, "Number");
        assert.equal(sheet.querySelector('label[for="player-edit-name"]').textContent, "Name");
        assert.equal(numberField().value, "3");
        assert.equal(numberField().getAttribute("type"), "text");
        assert.equal(numberField().getAttribute("inputmode"), "numeric");
        assert.equal(numberField().getAttribute("name"), "number");
        assert.equal(nameField().value, "Cade");
        assert.equal(nameField().getAttribute("autocomplete"), "off");
        assert.equal(nameField().getAttribute("name"), "name");
        assert.ok(numberField().closest(".g-player-edit__fields") && nameField().closest(".g-player-edit__fields"), "the two fields side by side");
        assert.equal(note().textContent, NOTE);
        assert.equal(note().getAttribute("role"), "status");
        assert.ok(!note().getAttribute("class").includes("--bad"));
        assert.equal(numberField().getAttribute("aria-describedby"), note().getAttribute("id"), "the line says what the fields are for");
        assert.equal(captainSwitch().getAttribute("role"), "switch");
        assert.equal(captainSwitch().getAttribute("aria-checked"), "false");
        assert.equal(captainSwitch().querySelector(".g-toggle__label").textContent, "Team captain");
        assert.equal(captionOf(), "The captain now — Bors");
        const mark = captainSwitch().querySelector(".g-player-edit__c");
        assert.equal(mark.textContent, "C");
        assert.equal(mark.getAttribute("aria-hidden"), "true");
        // The order of PlayerEdit.html and DeskRosterEdit.html: the fields, the line, the switch.
        const parts = sheet.querySelector(".g-sheet__body").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class"));
        assert.deepEqual(parts.slice(0, 3), ["g-player-edit__fields", "g-player-edit__note", "g-toggle"]);
        assert.equal(saveButton().textContent, "Save");
        assert.ok(saveButton().hasAttribute("disabled"), "nothing changed yet");
        assert.ok(saveButton().getAttribute("class").includes("g-btn--primary"));
        assert.equal(cancelButton().textContent, "Cancel");
        assert.ok(cancelButton().closest(".g-sheet__foot"), "«Cancel» beside «Save», on a phone too (PlayerEdit.html)");
        assertCspSafe(view);
        // «Cancel»: closed, the focus back on the pencil, nothing sent.
        fireEvent(cancelButton(), "click");
        assert.ok(!editSheet());
        assert.ok(document.activeElement === pencil());
        await settle();
        assert.equal(patches().length, 0);
      });
    }
  });
});

test("what is typed is checked as it is typed, and «Save» waits for a whole, changed form", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openEdit(phone);
        const field = numberField();
        type(field, "5");
        assert.equal(note().textContent, "Number 5 is Edda's already", "those who miss the next match wear theirs too");
        assert.ok(note().getAttribute("class").includes("g-player-edit__note--bad"));
        assert.equal(numberField().getAttribute("aria-invalid"), "true");
        assert.ok(!nameField().hasAttribute("aria-invalid"));
        assert.ok(saveButton().hasAttribute("disabled"));
        assert.ok(numberField() === field, "the field is kept through the redraw (a patch)");
        assert.ok(document.activeElement === field, "the focus stays in it");
        assert.equal(field.selectionStart, 1, "and the caret where the typing left it");
        type(field, "100");
        assert.equal(note().textContent, "The number is from 1 to 99");
        assert.ok(saveButton().hasAttribute("disabled"));
        type(field, "12");
        assert.equal(note().textContent, NOTE);
        assert.ok(!numberField().hasAttribute("aria-invalid"));
        assert.ok(!saveButton().hasAttribute("disabled"), "a whole, changed form");
        assert.equal(field.selectionStart, 2);
        const name = nameField();
        type(name, "  ");
        assert.equal(note().textContent, "The name cannot be empty");
        assert.equal(nameField().getAttribute("aria-invalid"), "true");
        assert.ok(!numberField().hasAttribute("aria-invalid"), "the field the refusal names, alone");
        assert.ok(saveButton().hasAttribute("disabled"));
        assert.ok(document.activeElement === name);
        // Back to what he wears: nothing to save. «03» is his 3, a name's blanks are none.
        type(name, " Cade ");
        type(field, "03");
        assert.equal(note().textContent, NOTE);
        assert.ok(saveButton().hasAttribute("disabled"), "nothing changed");
        type(name, "Cady");
        assert.ok(!saveButton().hasAttribute("disabled"));
        assertCspSafe(view);
      });
    }
  });
});

test("saved: one PATCH of the whole roster, the sheet closed, the focus on the pencil; his head and the table draw the new number and name at once", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openEdit(phone);
        type(numberField(), "12");
        type(nameField(), "Cady");
        api.reply(PATCH, 200, { team: withOne({ ...PLAYERS[2], number: "12", name: "Cady" }, { revision: 5 }) });
        fireEvent(saveButton(), "click");
        assert.ok(!editSheet(), "closed at once: the edit is a step of the queue");
        assert.ok(!view.querySelector("dialog:modal"));
        assert.ok(document.activeElement === pencil(), "the focus back on the pencil");
        if (phone) {
          assert.equal(view.querySelector(".g-profile__name").textContent, "Cady", "his head, at once");
          assert.equal(view.querySelector(".g-profile__head .g-num__n").textContent, "12");
        } else {
          assert.equal(aside().querySelector(".g-roster__pname").textContent, "Cady", "the panel, at once");
          assert.equal(bodyOf("p3#0").querySelector(".g-rtable__name").textContent, "Cady", "and the table's row");
          assert.equal(bodyOf("p3#0").querySelector(".g-num__n").textContent, "12");
          assert.equal(pencil().getAttribute("aria-label"), "Edit Cady");
        }
        await settle();
        assert.equal(patches().length, 1);
        const [call] = patches();
        assert.equal(call.body.revision, 4, "on the revision as read");
        assert.deepEqual(sentPlayers(call), {
          p1: ["1", "Ann", false], p2: ["2", "Bors", true], p3: ["12", "Cady", false], p4: ["4", "Dell", false],
          p5: ["5", "Edda", false], p6: ["6", "Finn", false], p7: ["7", "Grom", false],
        }, "the whole roster, his line changed");
        assert.equal(status(), "Saved");
        assert.equal(save.saveState("t1").waiting, 0);
      });
    }
  });
});

test("the captain switch moves the armband, or takes it off", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        // Cade takes it from Bors (PlayerCaptain.html's words).
        await openEdit(phone);
        const button = captainSwitch();
        fireEvent(button, "click");
        assert.equal(captainSwitch().getAttribute("aria-checked"), "true");
        assert.equal(captionOf(), "The armband passes from Bors");
        assert.ok(captainSwitch() === button, "the switch kept through the redraw");
        assert.ok(!saveButton().hasAttribute("disabled"));
        fireEvent(button, "click");
        assert.equal(captionOf(), "The captain now — Bors");
        assert.ok(saveButton().hasAttribute("disabled"), "back as it was");
        fireEvent(button, "click");
        api.reply(PATCH, 200, { team: withPlayers(PLAYERS.map((player) => ({ ...player, isCaptain: player.id === "p3" })), { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.equal(patches().length, 1);
        assert.deepEqual(Object.entries(sentPlayers(patches()[0])).filter(([, [, , captain]]) => captain).map(([id]) => id), ["p3"], "Cade's alone");
        // Bors, the captain, takes it off: the team has none.
        await openEdit(phone, { id: "p2" });
        assert.equal(captainSwitch().getAttribute("aria-checked"), "true");
        assert.equal(captionOf(), "Wears the captain's armband");
        fireEvent(captainSwitch(), "click");
        assert.equal(captionOf(), "The team has no captain");
        api.reply(PATCH, 200, { team: withPlayers(PLAYERS.map((player) => ({ ...player, isCaptain: false })), { revision: 5 }) });
        fireEvent(saveButton(), "click");
        await settle();
        assert.equal(patches().length, 1);
        assert.deepEqual(Object.values(sentPlayers(patches()[0])).filter(([, , captain]) => captain), [], "nobody's");
        // A team with no captain: nobody to name.
        await openEdit(phone, { teamAnswer: withPlayers(PLAYERS.map((player) => ({ ...player, isCaptain: false }))) });
        assert.equal(captionOf(), "The team has no captain");
        fireEvent(captainSwitch(), "click");
        assert.equal(captionOf(), "Wears the captain's armband");
      });
    }
  });
});

test("a desk's edit carries his SPP counters outside a match, under «Team captain»: each press saved at once, as a phone's open row", async () => {
  await withoutTimers(async () => {
    await openEdit(false);
    const block = sppBlock();
    assert.ok(block, "D3, the owner's answer 2");
    const parts = editSheet().querySelector(".g-sheet__body").childNodes.filter((node) => node.nodeType === 1);
    assert.ok(parts[parts.indexOf(captainSwitch()) + 1] === block, "right under «Team captain»");
    assert.equal(block.querySelector(".g-player-edit__spptitle").textContent, "SPP · manual edit");
    assert.equal(block.querySelector(".g-roster__sppdelta").textContent, "no changes yet");
    const tiles = block.querySelectorAll(".g-roster__tiles [data-action-key]");
    assert.equal(tiles.length, 9, "DeskRosterLive.html's nine tiles");
    assert.ok(tiles.every((tile) => tile.getAttribute("class").includes("g-stepper--tile")));
    assert.ok(tiles.every((tile) => tile.getAttribute("data-player") === "p3"));
    assert.equal(block.querySelector(".g-player-edit__sppnote").textContent, "Each press is saved at once.");
    api.reply(PATCH, 200, { team: withOne({ ...PLAYERS[2], spp: { touchdowns: 1 } }, { revision: 5 }) });
    const plus = block.querySelector('[data-action-key="touchdowns"] [data-action-step="1"]');
    plus.focus();
    fireEvent(plus, "click");
    assert.ok(editSheet()?.isModal, "the window stays");
    assert.equal(sppBlock().querySelector(".g-roster__sppdelta").textContent, "+3 SPP");
    assert.ok(document.activeElement === plus, "the focus on the tile's +");
    await settle();
    assert.equal(patches().length, 1, "one step, as a phone's open row");
    assert.deepEqual(patches()[0].body.roster.players.find((player) => player.id === "p3").spp, { touchdowns: 1 });
    // «Cancel» closes the window and takes nothing back: the press was saved.
    fireEvent(cancelButton(), "click");
    assert.ok(!editSheet());
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "3");
    // A phone has no such block: its counters are the open row's.
    await withWindow({ phone: true }, async () => {
      await openEdit(true);
      assert.ok(!sppBlock());
      assert.ok(!editSheet().querySelector("[data-action-step]"));
    });
  });
});

test("a refusal is said in the sheet, which stays; a refusal of the queue's 422 asks for the server's roster again", async () => {
  await withoutTimers(async () => {
    // Another tab's coach.
    await openEdit(false);
    type(numberField(), "12");
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(saveButton(), "click");
    assert.equal(refusal().textContent, OTHER_TAB);
    assert.equal(refusal().getAttribute("role"), "alert");
    assert.ok(editSheet()?.isModal, "the sheet stays");
    assert.equal(numberField().value, "12", "with what was typed");
    await settle();
    assert.equal(patches().length, 0);
    assertStyled(view, ...EDIT_STYLES);
    // Typing again: the refusal was the last press's.
    type(numberField(), "13");
    assert.ok(!refusal());
    // A 422 whose read of the server's roster failed: the press says the rule and asks for that roster again.
    coach({ open: "p5#0" });
    await renderTeamRoster("t1");
    api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
    api.fail(TEAM_READ);
    fireEvent(aside().querySelector("[data-roster-return]"), "click");
    await settle();
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"], "the read after the refusal failed");
    const before = teamReads();
    fireEvent(toggle("p3#0"), "click");
    fireEvent(pencil(), "click");
    type(numberField(), "12");
    fireEvent(saveButton(), "click");
    assert.match(refusal().textContent, /Ann/, "the rule that refused the queue, in the sheet");
    assert.ok(editSheet()?.isModal);
    await settle();
    assert.equal(teamReads(), before + 1, "and the roster is read again");
    assert.equal(patches().length, 1, "the refused step, and no edit");
  });
});

/**
 * Cade's edit open on a desk, his number typed, while a step of the queue is refused by a 422 whose read of the server's
 * roster failed: «Save» is refused in turn, said in the sheet, and the server's roster read again — as `server` says it.
 */
const refusedEdit = async (server) => {
  coach({ open: "p5#0" });
  await renderTeamRoster("t1");
  api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
  api.fail(TEAM_READ);
  fireEvent(aside().querySelector("[data-roster-return]"), "click");
  await settle();
  assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"]);
  fireEvent(toggle("p3#0"), "click");
  fireEvent(pencil(), "click");
  type(numberField(), "12");
  api.reply(TEAM_READ, 200, { team: server });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: server.revision });
  saveButton().focus();
  fireEvent(saveButton(), "click");
  assert.match(refusal().textContent, /Ann/, "the rule that refused the queue, in the sheet");
  await settle();
};

// Final review M1, as the fix by hand (Task 13 M1): the edit's number, name and armband are absolute values; a read that
// changes them under it must never be put back by its «Save».
test("a read that changes his number, name or captaincy under an open edit closes it, saying so, and sends nothing; one that does not keeps it", async () => {
  await withoutTimers(async () => {
    const others = PLAYERS.filter(({ id }) => id !== "p3");
    for (const [server, what] of [
      [withOne({ ...PLAYERS[2], name: "Cady" }, { revision: 6 }), "another device renamed him"],
      [withOne({ ...PLAYERS[2], number: "13" }, { revision: 6 }), "another device numbered him"],
      [withPlayers(PLAYERS.map((player) => ({ ...player, isCaptain: player.id === "p3" })), { revision: 6 }), "another device moved the armband to him"],
    ]) {
      await refusedEdit(server);
      assert.ok(!editSheet(), `closed: ${what}`);
      assert.ok(!view.querySelector("dialog:modal"));
      assert.equal(toasts().at(-1), CHANGED);
      assert.ok(document.activeElement === pencil(), "the focus on the pencil");
      assert.equal(patches().length, 1, "the refused step alone");
    }
    // What is not his number, name or armband — his SPP, another player — keeps it, with what was typed, and it saves.
    await refusedEdit(withPlayers([...others.map((player) => (player.id === "p1" ? { ...player, name: "Anne" } : player)), { ...PLAYERS[2], spp: { touchdowns: 3 } }], { revision: 6 }));
    assert.ok(editSheet()?.isModal, "kept");
    assert.ok(!toasts().includes(CHANGED));
    assert.equal(numberField().value, "12");
    type(numberField(), "12");
    api.reply(PATCH, 200, { team: withOne({ ...PLAYERS[2], number: "12" }, { revision: 7 }) });
    fireEvent(saveButton(), "click");
    assert.ok(!editSheet(), "its own «Save» closes it");
    assert.ok(!toasts().includes(CHANGED), "its own step is no change made elsewhere");
    await settle();
    assert.equal(patches().length, 2);
    assert.equal(sentPlayers(patches()[1]).p3[0], "12");
    assert.equal(sentPlayers(patches()[1]).p1[1], "Anne", "the read's change kept");
  });
});

test("closed, saying why: a match on, the screen's lock, no id", async () => {
  await withoutTimers(async () => {
    const closed = (title) => {
      assert.equal(pencil().tagName, "BUTTON");
      assert.equal(pencil().getAttribute("aria-disabled"), "true");
      assert.equal(pencil().getAttribute("title"), title);
      fireEvent(pencil(), "click");
      assert.equal(toasts().at(-1), title);
      assert.ok(!editSheet(), "no sheet");
    };
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        coach({ open: phone ? null : "p3#0" });
        gamesAre([LIVE_GAME]);
        if (phone) await playerPage("p3");
        else await renderTeamRoster("t1");
        closed(CLOSED);
        assert.equal(pencil().getAttribute("data-player-edit"), "p3#0", "it keeps his key, so the focus finds it again");
      });
    }
    // The screen's lock: the games read after the team.
    coach({ open: "p3#0" });
    const games = api.hold("GET /api/games");
    const drawing = renderTeamRoster("t1");
    await settle();
    closed("Loading the matches…");
    games.release();
    await drawing;
    assert.ok(!pencil().hasAttribute("aria-disabled"), "open once they have answered");
    // The lock as the press finds it, before the screen is drawn again: said, and nothing opens.
    state.games.loading = true;
    fireEvent(pencil(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!editSheet());
    state.games.loading = false;
    // No id to name him by.
    coach({ teamAnswer: team({ roster: { players: [{ rowIndex: 0, number: "1", name: "Nobody" }] } }) });
    await renderTeamRoster("t1");
    closed(NO_ID);
    await settle();
    assert.equal(patches().length, 0);
  });
});

// Review Focus 4: R8 — nothing is written in a match; the sheet closes, and the keyboard finds the closed pencil.
test("a match begun while the edit is open closes it; the focus on the closed pencil", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openEdit(phone);
        type(numberField(), "12");
        gamesAre([LIVE_GAME]);
        await loadGames(true);
        await settle();
        assert.ok(!editSheet(), "R8");
        assert.ok(!view.querySelector("dialog:modal"));
        assert.ok(document.activeElement === pencil(), "his pencil, where the keyboard was");
        assert.equal(pencil().getAttribute("aria-disabled"), "true");
        assert.equal(pencil().getAttribute("title"), CLOSED);
        assert.equal(patches().length, 0);
      });
    }
  });
});

// Review Focus 4: an edit that waited is a step of the queue, given up with the others when a match begins.
test("an edit that waited for the network is given up when a match begins, and the coach is told", async () => {
  await withoutTimers(async () => {
    await openEdit(false);
    api.fail(PATCH);
    type(numberField(), "12");
    fireEvent(saveButton(), "click");
    await settle();
    assert.equal(status(), "Waiting for the network · edits: 1");
    assert.equal(bodyOf("p3#0").querySelector(".g-num__n").textContent, "12", "drawn at once");
    await matchBegins(team({ revision: 5 }));
    assert.equal(toasts().at(-1), DROPPED);
    assert.match(document.querySelectorAll("output").at(-1).className, /g-toast--error/);
    assert.deepEqual(toasts().filter((said) => said.startsWith("A match has begun")), [DROPPED], "no SPP, marks or market waited");
    assert.equal(bodyOf("p3#0").querySelector(".g-num__n").textContent, "3", "the server's roster");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
  });
});

test("during a preparation the sheet says what a save resets", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openEdit(phone, { games: [PREP_GAME] });
        assert.ok(editSheet()?.isModal, "a preparation closes nothing");
        assert.equal(editSheet().querySelector(".g-player-sheet__prep").textContent, prepResetWords());
        assertStyled(view, ...EDIT_STYLES);
      });
    }
  });
});

// Review Focus 3: the edit is one step; a second press finds no sheet to save from.
test("a second press on «Save» sends nothing more", async () => {
  await withoutTimers(async () => {
    await openEdit(false);
    type(numberField(), "12");
    const send = saveButton();
    api.reply(PATCH, 200, { team: withOne({ ...PLAYERS[2], number: "12" }, { revision: 5 }) });
    fireEvent(send, "click");
    fireEvent(send, "click");
    const late = document.createElement("button");
    late.setAttribute("type", "button");
    late.setAttribute("data-edit-save", "true");
    view.appendChild(late);
    fireEvent(late, "click");
    view.removeChild(late);
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

test("the name is text", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        // A hostile captain's name in the caption, a hostile player's in the field.
        const players = PLAYERS.map((player) => (player.id === "p2" ? { ...player, name: HOSTILE } : player.id === "p3" ? { ...player, name: `${HOSTILE}2` } : player));
        await openEdit(phone, { teamAnswer: withPlayers(players) });
        assert.equal(nameField().value, `${HOSTILE}2`);
        assert.equal(captionOf(), `The captain now — ${HOSTILE}`);
        type(numberField(), "5");
        assert.equal(note().textContent, "Number 5 is Edda's already");
        assert.ok(!editSheet().querySelector("img"));
        assertCspSafe(view);
      });
    }
  });
});

test("every key in both dictionaries, and the words assume no player's gender", () => {
  assertDictionaryCovers("src/screens/team/roster/player.mjs", "src/screens/team/roster/player-sheets.mjs", "src/screens/team/roster/panel.mjs");
  const gendered = {
    en: /\b(he|him|his|she|her|hers)\b/i,
    ru: /(?<![а-яё])(он|она|его|её|ему|ей|носил|носила|стал|стала)(?![а-яё])/iu,
  };
  for (const [locale, pattern] of Object.entries(gendered)) {
    const words = JSON.parse(text(`src/i18n/${locale}.json`));
    const edit = Object.entries(words).filter(([key]) => key.startsWith("teamPlayer.edit."));
    assert.ok(edit.length >= 15, locale);
    assert.deepEqual(edit.filter(([, value]) => pattern.test(value)), [], locale);
  }
});

test("styled as PlayerEdit.html up to 900px and DeskRosterEdit.html from 901px, its colours readable", async () => {
  await withoutTimers(async () => {
    for (const phone of [true, false]) {
      await withWindow({ phone }, async () => {
        await openEdit(phone);
        type(numberField(), "5");
        fireEvent(captainSwitch(), "click");
        assertCspSafe(view);
        assertStyled(view, ...EDIT_STYLES);
      });
    }
    const css = text(SHEETS);
    assert.doesNotMatch(css, /--focus-ring/);
    assert.doesNotMatch(css, /text-overflow/, "nothing is cut with «…»");
    const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
    assert.deepEqual(queries, ["(max-width: 900px)", "(min-width: 901px)"], "only the stage's two breakpoints");
    // The shared frame on the class every player's sheet wears; the edit's own by its id (fix round 1, M4).
    for (const selector of [`${FRAME} .g-player-edit__note`, `${FRAME} .g-player-sheet__prep`, `${FRAME} .g-player-sheet__refusal`, `${FRAME} .g-toggle`, `${FRAME} .g-sheet__foot .g-btn`,
      "#player-edit .g-player-edit__c", "#player-edit .g-player-edit__spptitle", "#player-edit .g-player-edit__sppnote"]) {
      for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(valuesOf(SHEETS, selector, property).length >= 1, `${selector} ${property}`);
    }
    // PlayerEdit.html then DeskRosterEdit.html: the fields 96px | 1fr, 10 apart, then 100px, 12; the number Oswald 700 22px;
    // the switch from 64px, then 60px; the phone's foot 1fr | 2fr; the desk's window 20px round, its head 16 between title and cross.
    assert.deepEqual(valuesOf(SHEETS, "#player-edit .g-player-edit__fields", "grid-template-columns"), ["96px minmax(0, 1fr)", "100px minmax(0, 1fr)"]);
    assert.deepEqual(valuesOf(SHEETS, "#player-edit .g-player-edit__fields", "gap"), ["var(--space-10)", "var(--space-12)"]);
    assert.deepEqual(valuesOf(SHEETS, "#player-edit #player-edit-number", "font"), ["700 22px/normal var(--font-display)"]);
    assert.deepEqual(valuesOf(SHEETS, `${FRAME} .g-toggle`, "min-height"), ["64px", "60px"]);
    assert.deepEqual(valuesOf(SHEETS, `${FRAME} .g-sheet__foot`, "grid-template-columns"), ["minmax(0, 1fr) minmax(0, 2fr)"]);
    assert.deepEqual(valuesOf(SHEETS, `dialog.g-sheet${FRAME}`, "border-radius"), ["20px"], "DeskRosterEdit.html's window");
    assert.deepEqual(valuesOf(SHEETS, `${FRAME} .g-sheet__head`, "gap"), ["var(--space-16)"], "DeskRosterEdit.html's head (M1)");
    assert.deepEqual(valuesOf(SHEETS, "#player-edit .g-player-edit__sppnote", "font"), ["400 12px/1.4 var(--font-body)"], "DeskRosterLive.html's note under the tiles");
    // A long line wraps (owner's rule), as it did before the move into this sheet (final wave, T8 N1).
    for (const selector of ["#player-edit .g-player-edit__spptitle", "#player-edit .g-player-edit__sppnote"]) {
      assert.deepEqual(valuesOf(SHEETS, selector, "overflow-wrap"), ["anywhere"], selector);
    }
    // Line heights are the prototype's: `normal` where it gives none (Task 7's lesson).
    for (const selector of [`${FRAME} .g-player-edit__note`, `${FRAME} .g-toggle__label`, `${FRAME} .g-toggle__caption`, `${FRAME} .g-sheet__sub`, `${FRAME} .g-field__label`]) {
      assert.ok(valuesOf(SHEETS, selector, "line-height").concat(valuesOf(SHEETS, selector, "font")).some((value) => /(^|\/)normal\b/.test(value)), `${selector}: line height normal`);
    }
    assertReadable(SHEETS, `${FRAME} .g-player-edit__note`, "color", ["--surface"], 4.5);
    assertReadable(SHEETS, `${FRAME} .g-player-edit__note--bad`, "color", ["--surface"], 4.5);
    assertReadable(SHEETS, "#player-edit .g-player-edit__c", "color", ["--crest-gold"], 4.5);
    assertReadable(SHEETS, `${FRAME} .g-toggle__caption`, "color", ["--surface", "--accent-tint-soft"], 4.5);
    assertReadable(SHEETS, "#player-edit .g-player-edit__sppnote", "color", ["--surface"], 4.5);
    assertReadable(SHEETS, `${FRAME} .g-player-sheet__prep`, "color", ["--surface"], 4.5);
    assertReadable(SHEETS, `${FRAME} .g-player-sheet__refusal`, "color", ["--surface"], 4.5);
    // Imported right after the profile's page (fix round 1, I1).
    const styles = text("src/styles.css");
    const at = (name) => styles.indexOf(`@import url("screens/team/roster/${name}");`);
    assert.ok(at("profile.css") >= 0 && at("player-sheets.css") > at("profile.css"));
    assert.ok(!text("src/screens/team/roster/profile.css").includes("player-edit"), "the profile's page holds none of the edit's rules");
  });
});

test("D2: up to 900px the fields 48px and the buttons 52px; from 901px the fields and the buttons 44px, the SPP tiles' buttons 24px or more", () => {
  const css = text(SHEETS).replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (query) => {
    const start = css.indexOf(`@media (${query}) {`);
    assert.ok(start >= 0, `player-sheets.css has no @media (${query})`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const px = (found) => found.slice(1).map(Number);
  const phone = block("max-width: 900px");
  const desk = block("min-width: 901px");
  assert.deepEqual(px(phone.match(/\.g-player-sheet \.g-field__input \{[^}]*height: (\d+)px;/)), [48], "a phone's fields");
  assert.deepEqual(px(phone.match(/\.g-player-sheet \.g-sheet__foot \.g-btn \{[^}]*height: (\d+)px;/)), [52], "a phone's buttons");
  assert.deepEqual(px(desk.match(/\.g-player-sheet \.g-field__input \{[^}]*height: (\d+)px;/)), [44], "a desk's fields");
  assert.deepEqual(px(desk.match(/\.g-player-sheet \.g-sheet__foot \.g-btn \{[^}]*min-height: (\d+)px;/)), [44], "a desk's buttons");
  // The tiles are the panel's (action-stepper.css): 32px buttons that give way to 24px, never less.
  assert.deepEqual(valuesOf("src/ui/action-stepper.css", ".g-stepper--tile .g-stepper__btn", "min-width"), ["24px"]);
  assert.deepEqual(valuesOf("src/ui/action-stepper.css", ".g-stepper--tile .g-stepper__btn", "height"), ["32px"]);
});

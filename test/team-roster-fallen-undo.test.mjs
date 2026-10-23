import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  FALLEN, JOE, LIVE_GAME, PIKE, PLAYERS, STYLES, api, aside, coach, died, headingText, invalidateGames, namesIn, openRow, releaseCurrentScreen, renderTeamRoster,
  save, settle, state, tables, team, toggle, view, withPlayers, words,
} from "./helpers/roster-page.mjs";

// Stage 07b, Task 9: «Undo the mark» in the desk panel of a death a coach marked by hand, asked first in a sheet, sent
// once through stage 03's route (`DELETE …/fallen/:fid`): the player back on the roster. The same five guarantees as the
// death's (Task 8): nothing while a step of the roster waits, every step waits while it is on its way, its answer taken
// whatever became of the sheet (K8) and only for the coach who sent it, a lost one read back and never sent again (K15).
// A death from a match is the administrator's, and so is a record the roster cannot read (K11).

const UNDO = "DELETE /api/teams/t1/fallen/f1";
const PATCH = "PATCH /api/teams/t1";
const TEAM_READ = "GET /api/teams/t1";
const FALLEN_READ = "GET /api/teams/t1/fallen";
const undos = () => api.calls.filter(({ key }) => key === UNDO);
const patches = () => api.calls.filter(({ key }) => key === PATCH);
const teamReads = () => api.calls.filter(({ key }) => key === TEAM_READ).length;
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const lastToastIsError = () => /g-toast--error/.test(document.querySelectorAll("output").at(-1).className);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
/** «Undo the mark»: the desk panel's by default. */
const undoButton = (root = aside()) => root.querySelector("[data-roster-undo]");
const undoSheet = () => view.querySelector("dialog#roster-undo");
const keepButton = () => undoSheet().querySelector("[data-undo-keep]");
const restoreButton = () => undoSheet().querySelector("[data-undo-send]");
const refusal = () => undoSheet().querySelector(".g-roster__markrefusal");
/**
 * A step of the roster's queue from the desk's panel: Edda back on the roster (D3: a desk taps no counter outside a
 * match; «Back on the roster» is a save of the roster as a step was).
 */
const stepOfTheRoster = () => {
  fireEvent(toggle("p5#0"), "click");
  fireEvent(aside().querySelector("[data-roster-return]"), "click");
};
/** The team on the server once Pike is back: at the end of the roster, rev 5 by default. */
const withPike = (over = {}) => withPlayers([...PLAYERS, PIKE.player], { revision: 5, ...over });
/** His line's key on the roster he is back on: his id and his place in it. */
const PIKE_BACK = "d1#0";
/** The server holds `roster` and `fallen` when the screen reads them again. */
const serverHolds = (roster, fallen) => {
  api.reply(TEAM_READ, 200, { team: roster });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: roster.revision });
  api.reply(FALLEN_READ, 200, { fallen });
};
/** Pike chosen for the panel, and his undo asked. */
const askUndo = () => {
  fireEvent(toggle("fallen-f1"), "click");
  fireEvent(undoButton(), "click");
};
const BACK = "Pike is on the roster again";
const UNDO_LOST = "The mark is still on the server: undo it again.";
const UNKNOWN = "Could not tell what the server holds: look at the roster before you undo the mark again.";
const HINT = "Marked by mistake? The player comes back to the roster and into TV.";
const FROM_MATCH = "A death the post-match recorded is not undone here: the league administrator corrects it.";
const BARE = "The roster cannot read this record, so it is not undone here: the league administrator corrects it.";
const CLOSED = "Missed matches and deaths — after the post-match";
const WAIT_SAVE = "Wait until your edits are saved";
const WRITING = "Saving the mark…";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";
const CHANGED_ELSEWHERE = "The roster was changed on another device";
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
const SHEETS = [...STYLES, "option-card.css", "filter-chips.css", "text-field.css"];

test("a manual death has «Undo the mark» in the desk panel; a death from a match has the administrator's line instead", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(toggle("fallen-f1"), "click");
  const undo = undoButton();
  assert.ok(undo, "Pike's death was marked by hand");
  assert.equal(undo.getAttribute("data-roster-undo"), "fallen-f1");
  assert.equal(undo.tagName.toLowerCase(), "button");
  assert.equal(undo.textContent, "Undo the mark");
  assert.equal(undo.getAttribute("aria-haspopup"), "dialog");
  assert.ok(undo.classList.contains("g-btn--block"), "as wide as the card");
  assert.ok(!undo.classList.contains("g-btn--primary") && !undo.classList.contains("g-btn--danger"), "outlined: the undo is not the page's main action");
  assert.ok(!undo.hasAttribute("aria-disabled"));
  assert.ok(undo.closest(".g-fallen__card"), "under the cause, in the card of how he fell");
  assert.ok(words(aside()).includes(HINT));
  assert.ok(!words(aside()).includes(FROM_MATCH));
  fireEvent(toggle("fallen-f2"), "click");
  assert.ok(!undoButton(), "Joe died in a match");
  assert.ok(words(aside()).includes(FROM_MATCH));
  assert.ok(!words(aside()).includes(HINT));
  assertCspSafe(view);
  assertStyled(view, ...STYLES);
});

// K11 and the T6 review's carry: a record the roster cannot read — the server would refuse it (FALLEN_NOT_RESTORABLE).
test("a record the roster cannot read has no undo: the league administrator corrects it", async () => {
  const records = [
    died("f4", { id: "d4", name: "Far Row", rowIndex: 99, number: "4" }, { cause: "Old age" }),
    died("f5", { name: "Old Joe", position: "Lineman", number: 5 }),
    died("f6", null),
    // Marked by hand, but with no id: the roster could not name him back, nor a read find him there.
    died("f7", { rowIndex: 0, number: "5", name: "No Id" }, { cause: "Foul" }),
  ];
  await withWindow({ phone: false }, async () => {
    coach({ fallen: records });
    await renderTeamRoster("t1");
    for (const key of ["fallen-f4", "fallen-f5", "fallen-f6", "fallen-f7"]) {
      fireEvent(toggle(key), "click");
      assert.equal(aside().getAttribute("data-panel-player"), key);
      assert.ok(!undoButton(), key);
      assert.ok(words(aside()).includes(BARE), key);
      assert.ok(!words(aside()).includes(HINT), key);
      assert.ok(!aside().querySelector("[data-roster-closed]"), `${key}: no closed undo, with words about marking`);
    }
    assertStyled(view, ...STYLES);
  });
  // On a phone his row does not send the coach to a profile to undo it there.
  await withWindow({ phone: true }, async () => {
    coach({ fallen: records });
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f4"), "click");
    assert.ok(words(openRow()).includes(BARE));
    assert.ok(!words(openRow()).includes("The mark can be undone in the profile"));
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f1"), "click");
    assert.ok(words(openRow()).includes("The mark can be undone in the profile"), "a record the roster reads still says where");
    assert.ok(!words(openRow()).includes(BARE));
  });
});

test("the undo asks first: who comes back and to what, «Keep» and «Back on the roster»; «Keep» closes and gives the focus back", async () => {
  coach();
  await renderTeamRoster("t1");
  askUndo();
  const sheet = undoSheet();
  assert.ok(sheet?.isModal, "a sheet, open");
  assert.equal(sheet.querySelector("h2").textContent, "Undo the mark?");
  assert.ok(words(sheet).includes("Pike comes back to the roster: into TV again and onto the list of players for a match. The cause of death is removed."));
  assert.ok(!words(sheet).some((said) => said.startsWith("Any save of the roster")), "no preparation is on");
  assert.ok(!refusal());
  assert.equal(keepButton().textContent, "Keep");
  assert.ok(!keepButton().classList.contains("g-btn--primary"), "outlined");
  assert.ok(keepButton().closest(".g-sheet__foot-start"), "beside the main button");
  assert.equal(restoreButton().textContent, "Back on the roster");
  assert.ok(restoreButton().classList.contains("g-btn--primary"), "the main action, not a red one: an undo is undone by a new mark");
  assert.ok(!restoreButton().hasAttribute("disabled") && !restoreButton().hasAttribute("aria-disabled"));
  assertCspSafe(view);
  assertStyled(view, ...SHEETS);
  fireEvent(keepButton(), "click");
  assert.ok(!undoSheet(), "«Keep» closes it");
  assert.ok(document.activeElement === undoButton(), "the focus back on «Undo the mark»");
  // Escape is «Keep» too.
  fireEvent(undoButton(), "click");
  fireEvent(undoSheet(), "keydown", { key: "Escape" });
  assert.ok(!undoSheet());
  assert.ok(document.activeElement === undoButton());
  await settle();
  assert.equal(undos().length, 0);
  assert.match(headingText("roster-fallen-heading"), /^Fallen 2$/);
});

test("undone: one DELETE, he is back on the roster and stands in the panel; the coach is told", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.reply(UNDO, 200, { team: withPike() });
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(undos().length, 1);
    assert.equal(undos()[0].body, null, "the record is named in the path, and nothing else is sent");
    assert.ok(!undoSheet(), "the sheet closes");
    assert.deepEqual(tables().map(namesIn), [["Ann", "Bors", "Cade", "Pike"], ["Dell", "Edda", "Finn", "Grom"], ["Joe"]]);
    assert.match(headingText("roster-heading"), /^Active roster 4$/);
    assert.match(headingText("roster-fallen-heading"), /^Fallen 1$/);
    assert.equal(aside().getAttribute("data-panel-player"), PIKE_BACK, "the panel is his: back on the roster");
    assert.ok(aside().querySelector("[data-roster-mark]"), "a player of the roster again, with his row of actions");
    assert.ok(document.activeElement === toggle(PIKE_BACK), "the focus on his row");
    assert.equal(toasts().at(-1), BACK);
    assert.equal(state.myTeams.items[0].revision, 5, "the coach's list has the server's team");
    assert.equal(save.savedRevision("t1"), 5, "and so has the queue");
    assert.equal(teamReads(), 1, "the answer is taken as it is: nothing is read again");
    // The next step goes on the revision the undo came back with.
    api.reply(PATCH, 200, { team: withPike({ revision: 6 }) });
    stepOfTheRoster();
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.revision, 5);
    assert.ok(patches()[0].body.roster.players.some((player) => player.id === "d1"), "the roster with him");
    api.assertAnswered();
  });
});

// Review Focus 5.
test("an undo the rules refuse is said in the sheet, and nothing changes", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    const violations = [{ code: "ROSTER_MAX_PLAYERS", params: { max: 7, count: 8 } }];
    api.reply(UNDO, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations });
    const undo = api.hold(UNDO);
    restoreButton().focus();
    fireEvent(restoreButton(), "click");
    assert.equal(restoreButton().getAttribute("aria-busy"), "true", "busy with it");
    assert.ok(!restoreButton().hasAttribute("disabled"), "not disabled: a focused button that is drops the focus");
    assert.ok(document.activeElement === restoreButton(), "the focus stays on it while it waits");
    undo.release();
    await settle();
    assert.ok(undoSheet()?.isModal, "the sheet stays");
    assert.equal(refusal().getAttribute("role"), "alert");
    assert.match(refusal().textContent, /A team has at most 7 players \(now 8\)\./);
    assert.ok(!restoreButton().hasAttribute("aria-busy") && !restoreButton().hasAttribute("disabled"), "no longer busy");
    assert.ok(document.activeElement === restoreButton(), "the focus is where the coach left it, never on the page behind the sheet");
    api.reply(UNDO, 422, { error: { code: "FALLEN_NOT_RESTORABLE", params: {}, message: "x" } });
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(refusal().textContent, "This fallen player cannot be put back on this roster: the roster cannot read him as he was kept.");
    assert.equal(undos().length, 2);
    assert.deepEqual(namesIn(tables()[2]), ["Pike", "Joe"], "Pike is among the fallen");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"]);
    assert.equal(state.myTeams.items[0].revision, 4);
    assert.equal(teamReads(), 1, "a refusal reads nothing again");
    fireEvent(keepButton(), "click");
    assert.ok(!undoSheet());
  });
});

// The final review's R2 with the T10 words: what is said is what the read shows — never «not found» over him back.
test("an undo of a record the server no longer has reads the roster again, and says what the read shows", async () => {
  const NOT_FOUND = "Fallen player not found.";
  const GONE = { status: 404, body: { error: { code: "FALLEN_NOT_FOUND", params: {}, message: "x" } } };
  // Another device has undone it meanwhile: he is back, as if the undo were this one.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.reply(UNDO, GONE.status, GONE.body);
    serverHolds(withPike(), [JOE]);
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 2, "read again");
    assert.ok(!undoSheet(), "the read took the record away, and the sheet with it");
    assert.equal(toasts().at(-1), BACK);
    assert.ok(!toasts().includes(NOT_FOUND), "nothing says he is not found");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Pike"]);
    assert.equal(aside().getAttribute("data-panel-player"), PIKE_BACK, "the panel takes him, as the sheet's own undo does");
    assert.ok(document.activeElement === toggle(PIKE_BACK));
    assert.equal(undos().length, 1);
  });
  // Gone from the fallen and not on the roster either: the server's words, in a message once the sheet has gone.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.reply(UNDO, GONE.status, GONE.body);
    serverHolds(team(), [JOE]);
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.ok(!undoSheet());
    assert.equal(toasts().at(-1), NOT_FOUND);
    assert.ok(lastToastIsError());
    assert.ok(!toasts().includes(BACK));
  });
  // The sheet closed while the undo was on its way: nothing is said before the read, and then only what it shows.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    fireEvent(undoSheet(), "keydown", { key: "Escape" });
    serverHolds(withPike(), [JOE]);
    undo.release(GONE);
    await settle(12);
    assert.equal(toasts().at(-1), BACK);
    assert.ok(!toasts().includes(NOT_FOUND));
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Pike"]);
  });
});

// Review Focus 1, the T3 review's carry (e), K15.
test("an undo whose answer was lost is not sent again: the roster is read back and the coach told", async () => {
  const cases = [
    ["landed", { fail: true }, withPike(), [JOE], BACK],
    ["not landed", { fail: true }, team(), FALLEN, UNDO_LOST],
    ["a 2xx without the team", { body: {} }, withPike(), [JOE], BACK],
  ];
  for (const [label, answer, roster, fallen, said] of cases) {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      askUndo();
      if (answer.fail) api.fail(UNDO);
      else api.reply(UNDO, 200, answer.body);
      serverHolds(roster, fallen);
      fireEvent(restoreButton(), "click");
      await settle(12);
      assert.ok(!undoSheet(), label);
      assert.equal(undos().length, 1, `${label}: never sent twice`);
      assert.equal(teamReads(), 2, `${label}: read back once`);
      assert.equal(toasts().at(-1), said, label);
      if (said === UNDO_LOST) {
        assert.ok(lastToastIsError(), label);
        assert.deepEqual(namesIn(tables()[2]), ["Pike", "Joe"], label);
      } else {
        assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Pike"], label);
        assert.equal(aside().getAttribute("data-panel-player"), PIKE_BACK, label);
        assert.ok(document.activeElement === toggle(PIKE_BACK), label);
      }
      api.assertAnswered();
    });
  }
});

test("a lost undo whose read is split is read once more; still split, or a read that fails, the coach is told the server could not be told", async () => {
  // He is back on the roster, the fallen read before the undo landed: read again, and the second read agrees.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.fail(UNDO);
    serverHolds(withPike(), [JOE]);
    const first = api.hold(FALLEN_READ);
    fireEvent(restoreButton(), "click");
    await settle();
    first.release({ status: 200, body: { fallen: FALLEN } });
    await settle(12);
    assert.equal(teamReads(), 3, "read twice");
    assert.equal(toasts().at(-1), BACK);
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Pike"]);
  });
  // Split twice: no verdict the reads cannot give.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.fail(UNDO);
    serverHolds(team(), [JOE]);
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 3);
    assert.equal(undos().length, 1);
    assert.equal(toasts().at(-1), UNKNOWN);
    assert.ok(lastToastIsError());
  });
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.fail(UNDO);
    api.fail(TEAM_READ);
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 2);
    assert.equal(toasts().at(-1), UNKNOWN);
    assert.equal(undos().length, 1);
  });
});

// Review Focus 2 and the T3 review's carry (a).
test("in a match, while steps wait, or before the games are read, the undo says why and sends nothing", async () => {
  // A match on: the button says why; a sheet open when it began stays, and says it too.
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f1"), "click");
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), CLOSED);
    assert.ok(words(aside()).includes(HINT), "the hint stays under it");
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), CLOSED);
    assert.ok(!undoSheet());
    coach();
    await renderTeamRoster("t1");
    askUndo();
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    assert.ok(undoSheet()?.isModal, "open, saying why");
    assert.equal(restoreButton().getAttribute("aria-disabled"), "true");
    assert.equal(restoreButton().getAttribute("title"), CLOSED);
    assert.ok(!restoreButton().hasAttribute("disabled"), "in reach, to say why");
    fireEvent(restoreButton(), "click");
    assert.equal(toasts().at(-1), CLOSED);
    await settle();
    assert.equal(undos().length, 0);
  });
  // A step of the roster in the air, then one waiting for the network.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const step = api.hold(PATCH);
    stepOfTheRoster();
    await settle();
    assert.equal(step.count, 1, "a step in the air");
    fireEvent(toggle("fallen-f1"), "click");
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), WAIT_SAVE);
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), WAIT_SAVE);
    assert.ok(!undoSheet());
    step.release({ status: 200, body: { team: team({ revision: 5 }) } });
    await settle();
    assert.ok(!undoButton().hasAttribute("aria-disabled"), "saved: the undo may go");
    fireEvent(undoButton(), "click");
    api.fail(PATCH);
    assert.deepEqual(save.stepSpp("t1", "p2", "touchdowns", 1), { ok: true });
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    assert.equal(restoreButton().getAttribute("aria-disabled"), "true");
    assert.equal(restoreButton().getAttribute("title"), WAIT_SAVE);
    fireEvent(restoreButton(), "click");
    assert.equal(toasts().at(-1), WAIT_SAVE);
    await settle();
    assert.equal(undos().length, 0);
  });
  // The games not read yet.
  await withoutTimers(async () => {
    coach();
    const games = api.hold("GET /api/games");
    const drawing = renderTeamRoster("t1");
    await settle();
    fireEvent(toggle("fallen-f1"), "click");
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), "Loading the matches…");
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!undoSheet());
    games.release();
    await drawing;
    await settle();
    assert.equal(undos().length, 0);
    // The lock is asked again at the press: the games may have begun to be read since the button was drawn.
    assert.ok(!undoButton().hasAttribute("aria-disabled"));
    state.games.loading = true;
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!undoSheet());
    state.games.loading = false;
  });
  // The queue waits for the server's roster after a 422 whose read failed: a press asks for it again.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
    api.fail(TEAM_READ);
    assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
    await settle();
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"]);
    const before = teamReads();
    assert.equal(restoreButton().getAttribute("title"), WAIT_SAVE);
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(undos().length, 0);
    assert.equal(teamReads(), before + 1, "the press asks for the server's roster again, as a death's does");
  });
});

// The T3 review's carry (b) and K8.
test("while an undo is on its way every step and mark waits, and a second press sends nothing; the sheet closed meanwhile, its answer is still taken", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(undo.count, 1, "one DELETE");
    assert.equal(restoreButton().getAttribute("aria-busy"), "true", "busy with it");
    assert.ok(!restoreButton().hasAttribute("disabled"));
    fireEvent(undoSheet(), "keydown", { key: "Escape" });
    assert.ok(!undoSheet(), "the coach may close the sheet");
    assert.equal(undoButton().getAttribute("title"), WRITING);
    // A desk's panel taps no counter outside a match (D3): its mark says it, and its press is told why.
    fireEvent(toggle("p1#0"), "click");
    assert.equal(aside().querySelector("[data-roster-mark]").getAttribute("title"), WRITING);
    fireEvent(aside().querySelector("[data-roster-mark]"), "click");
    assert.equal(toasts().at(-1), WRITING);
    await settle();
    assert.equal(patches().length, 0);
    undo.release({ status: 200, body: { team: withPike() } });
    await settle();
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Pike"], "taken though the sheet was closed");
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(save.savedRevision("t1"), 5);
    assert.equal(toasts().at(-1), BACK, "told in a message, the sheet being gone");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "the panel stays where the coach put it");
    assert.ok(!aside().querySelector("[data-roster-mark]").hasAttribute("aria-disabled"), "open again once it has answered");
    assert.equal(undos().length, 1);
  });
  // The coach left the roster: the list takes the answer all the same; the queue, which no visit draws now, is left as
  // it was (final review, I1), and the next visit reads the team.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    releaseCurrentScreen();
    undo.release({ status: 200, body: { team: withPike() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(save.savedRevision("t1"), 4, "the queue is left as it was");
    assert.ok(!toasts().includes(BACK));
    serverHolds(withPike(), [JOE]);
    await renderTeamRoster("t1");
    assert.equal(save.savedRevision("t1"), 5, "the next visit reads the team");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade", "Pike"]);
  });
});

test("during a preparation the sheet says what a change of the roster resets", async () => {
  coach();
  gamesAre([PREP_GAME]);
  await renderTeamRoster("t1");
  askUndo();
  const prep = "Any save of the roster, SPP included, resets the steps «Roster», «Inducements» and «Start». Fans and weather stay.";
  assert.ok(words(undoSheet()).includes(prep));
  assert.ok(!restoreButton().hasAttribute("aria-disabled"), "nothing is closed: the undo only sends the coach back to those steps");
  assertStyled(view, ...SHEETS);
});

test("another tab's coach: no undo is sent", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(refusal().textContent, OTHER_TAB);
    assert.ok(undoSheet()?.isModal);
    assert.equal(undos().length, 0);
    assert.deepEqual(namesIn(tables()[2]), ["Pike", "Joe"]);
  });
  // The T4 review's carry: an answer that comes when another coach is signed in is not his to take.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    state.auth.currentUser = { id: "u2", login: "another", preferences: {} };
    undo.release({ status: 200, body: { team: withPike() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 4);
    assert.equal(save.savedRevision("t1"), 4);
    assert.ok(!toasts().includes(BACK));
  });
});

test("another device's save closes the undo until the coach settles it, and says so", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    askUndo();
    const step = api.hold(PATCH);
    assert.deepEqual(save.stepSpp("t1", "p2", "touchdowns", 1), { ok: true });
    await settle();
    step.release({ status: 409, body: { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: team({ revision: 6 }) } });
    await settle();
    assert.equal(save.saveState("t1").status, "conflict");
    assert.ok(undoSheet()?.isModal, "the sheet stays, saying why");
    assert.equal(restoreButton().getAttribute("aria-disabled"), "true");
    assert.equal(restoreButton().getAttribute("title"), CHANGED_ELSEWHERE);
    fireEvent(restoreButton(), "click");
    assert.equal(toasts().at(-1), CHANGED_ELSEWHERE);
    fireEvent(keepButton(), "click");
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), CHANGED_ELSEWHERE);
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), CHANGED_ELSEWHERE);
    assert.ok(!undoSheet());
    await settle();
    assert.equal(undos().length, 0);
  });
});

test("the name in the undo's sheet is text", async () => {
  coach({ fallen: [{ ...PIKE, player: { ...PIKE.player, name: HOSTILE } }, JOE] });
  await renderTeamRoster("t1");
  askUndo();
  assert.ok(words(undoSheet()).includes(`${HOSTILE} comes back to the roster: into TV again and onto the list of players for a match. The cause of death is removed.`));
  assert.ok(!view.querySelector("img"));
  assert.ok(!view.querySelector("[onerror]"));
  assertCspSafe(view);
});

test("the undo's words are readable: who comes back, and what a preparation resets", () => {
  const sheet = "src/screens/team/roster/marks.css";
  for (const selector of [".g-fallen__undotext", ".g-fallen__undoprep"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background"), valuesOf(sheet, selector, "text-transform")], [["0"], ["none"], ["none"]], selector);
    assert.equal(valuesOf(sheet, selector, "font").length, 1, selector);
    assert.deepEqual(valuesOf(sheet, selector, "letter-spacing"), ["0"], selector);
    assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  }
});

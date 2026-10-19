import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  FALLEN, JOE, LIVE_GAME, PIKE, PLAYERS, STYLES, api, aside, coach, died, formatDay, invalidateGames, namesIn, releaseCurrentScreen, renderTeamRoster, save,
  settle, state, tables, team, text, toggle, view, withPlayers, words,
} from "./helpers/roster-page.mjs";

const { renderTeamPlayer } = await import("../src/screens/team/player/index.mjs");

// Stage 07b, Task 10: the player's own address (`#/t/:id/roster/:playerId`). A player of the roster still gets the 2.x
// editor until stage 07d; a fallen player of the team gets his profile, with «Undo the mark» for a death a coach marked
// — the desk's undo (marks.mjs): asked first, one DELETE, its answer always taken and only by the coach who sent it, a
// lost one read back and never sent again; never while the roster's own edits wait (K14), nor in a match. An id that is
// neither is the 2.x editor's, as it was.

const UNDO = "DELETE /api/teams/t1/fallen/f1";
const PATCH = "PATCH /api/teams/t1";
const FALLEN_READ = "GET /api/teams/t1/fallen";
const LIST_READ = "GET /api/teams";
const callsTo = (key) => api.calls.filter((call) => call.key === key);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const lastToastIsError = () => /toast-error/.test(document.querySelectorAll("output").at(-1).className);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const screen = () => view.querySelector('[data-screen="team-player"]');
const title = () => view.querySelector("h1");
const undoButton = () => view.querySelector("[data-roster-undo]");
const undoSheet = () => view.querySelector("dialog#roster-undo");
const keepButton = () => undoSheet().querySelector("[data-undo-keep]");
const restoreButton = () => undoSheet().querySelector("[data-undo-send]");
const callout = (tone = "") => view.querySelector(`.g-callout${tone ? `.g-callout--${tone}` : ""}`);
const calloutTitle = (tone) => callout(tone)?.querySelector(".g-callout__title").textContent ?? null;
/** The way back to the roster in the page's banners: the roster's own banner link. */
const rosterLink = () => view.querySelector("a.g-roster__calloutlink");
/** The team on the server once Pike is back: at the end of the roster, rev 5 by default. */
const withPike = (over = {}) => withPlayers([...PLAYERS, PIKE.player], { revision: 5, ...over });
/** The server holds `teams` (the coach's list) and `fallen` when the page reads them again. */
const serverHolds = (teams, fallen) => {
  api.reply(LIST_READ, 200, { teams });
  api.reply(FALLEN_READ, 200, { fallen });
};
const askUndo = () => fireEvent(undoButton(), "click");
/** The 2.x editor: its wait, then its page. */
const editorWaits = () => view.querySelector(".loading");
const editor = () => view.querySelector(".matchday-editor");
const BACK = "Pike is on the roster again";
const UNDO_LOST = "The mark is still on the server: undo it again.";
const UNKNOWN = "Could not tell what the server holds: look at the roster before you undo the mark again.";
const FROM_MATCH = "A death the post-match recorded is not undone here: the league administrator corrects it.";
const BARE = "The roster cannot read this record, so it is not undone here: the league administrator corrects it.";
const HINT = "Marked by mistake? He comes back to the roster and into TV.";
const CLOSED = "Missed matches and deaths — after the post-match";
const WAIT_ROSTER = "The roster has edits not saved yet: open it to save them, then undo the mark.";
const WRITING = "Saving the mark…";
const SHEETS = [...STYLES, "option-card.css", "filter-chips.css", "text-field.css"];

test("a player of the roster: the 2.x editor, as before, without reading the fallen", async () => {
  coach();
  api.reply(LIST_READ, 200, { teams: [team()] });
  const drawing = renderTeamPlayer("t1", "p1");
  assert.ok(editorWaits(), "the 2.x editor's wait, at once");
  assert.ok(!screen());
  await drawing;
  await settle();
  assert.ok(editor(), "the 2.x editor");
  assert.ok(!screen());
  assert.equal(callsTo(FALLEN_READ).length, 0, "the fallen are not read");
  api.assertAnswered();
});

test("a fallen player's address draws his profile: grey number, name, position · race · fallen, characteristics, how and when, the cause, «Undo the mark», career, skills, the rules line", async () => {
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach();
      const drawing = renderTeamPlayer("t1", "d1");
      assert.equal(view.querySelector('[data-screen="team-player"].g-fallen-page .g-roster__loading').textContent, "Loading the player…");
      assert.equal(view.querySelector(".g-roster__loading").getAttribute("role"), "status");
      await drawing;
      const page = screen();
      assert.ok(page?.classList.contains("g-fallen-page"));
      assert.equal(title().textContent, "Pike");
      assert.ok(title().closest(".g-pagehead--phone"), "the name is drawn on a phone too: it is the page's own");
      assert.ok(document.activeElement === title(), "the name takes the focus");
      assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Blitzer · Human · fallen");
      const badge = view.querySelector(".g-pagehead .g-num--fallen.g-num--lg");
      assert.ok(badge, "his number, grey and large, at the head");
      assert.equal(badge.textContent, "8");
      assert.deepEqual(page.querySelectorAll(".g-fallen__stats .g-stat__v").map((value) => value.textContent), ["7", "3", "3+", "4+", "9+"]);
      assert.equal(page.querySelector(".g-fallen__state .g-status").textContent, "Fallen");
      assert.equal(page.querySelector(".g-fallen__when").textContent, `marked by hand · ${formatDay(PIKE.diedAt)}`);
      assert.equal(page.querySelector(".g-fallen__cause").textContent, "Foul by the Raiders");
      assert.equal(undoButton().textContent, "Undo the mark");
      assert.equal(undoButton().getAttribute("aria-haspopup"), "dialog");
      assert.ok(!undoButton().hasAttribute("aria-disabled"));
      assert.ok(undoButton().closest(".g-fallen__card"));
      assert.ok(words(page).includes(HINT));
      assert.ok(words(page).includes("Career: 6 SPP"));
      assert.deepEqual(page.querySelectorAll(".g-skill--card").map((card) => card.getAttribute("data-skill")), ["Block", "Tackle"]);
      assert.ok(words(page).includes("A fallen player plays no matches, takes no advancements and is not in TV."));
      assert.ok(!page.querySelector("[data-action-key]"), "no counters");
      assert.ok(!callout(), "nothing waits, nothing to say");
      assert.deepEqual(callsTo(FALLEN_READ).length, 1);
      assert.equal(callsTo("GET /api/teams/t1").length, 0, "the roster is the list's: it is not read");
      assertCspSafe(view);
      assertStyled(view, ...STYLES);
      api.assertAnswered();
    });
  }
});

test("a skill of his opens its rule, and the sheet gives the focus back to the card", async () => {
  coach();
  await renderTeamPlayer("t1", "d1");
  const card = view.querySelector('.g-skill--card[data-skill="Block"]');
  fireEvent(card, "click");
  const sheet = view.querySelector("dialog#roster-skill");
  assert.ok(sheet?.isModal);
  assert.equal(sheet.querySelector("h2").textContent, "Block");
  fireEvent(sheet, "keydown", { key: "Escape" });
  assert.ok(!view.querySelector("dialog#roster-skill"));
  assert.ok(document.activeElement === view.querySelector('.g-skill--card[data-skill="Block"]'));
});

test("a death from a match: no undo, the administrator's line", async () => {
  coach();
  await renderTeamPlayer("t1", "d2");
  assert.equal(title().textContent, "Joe");
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Human Lineman · Human · fallen", "the race's own words for his position");
  assert.equal(view.querySelector(".g-fallen__when").textContent, `in a match · round 2 · ${formatDay(JOE.diedAt)}`);
  assert.equal(view.querySelector(".g-fallen__cause").textContent, "No cause was recorded.");
  assert.ok(!undoButton());
  assert.ok(words(screen()).includes(FROM_MATCH));
  assert.ok(!words(screen()).includes(HINT));
  // K11: a record the roster cannot read is the administrator's too, even one a coach marked.
  coach({ fallen: [died("f5", { id: "d5", name: "Old Joe", position: "Lineman", number: 5 }, { cause: "Old age" })] });
  await renderTeamPlayer("t1", "d5");
  assert.equal(title().textContent, "Old Joe");
  assert.ok(!undoButton());
  assert.ok(!view.querySelector("[data-roster-closed]"));
  assert.ok(words(screen()).includes(BARE));
  assertStyled(view, ...STYLES);
});

test("undo from the profile: the sheet, one DELETE, «Pike is on the roster again» and «To the roster»; the list takes the team", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    assert.ok(undoSheet()?.isModal, "asked first");
    assert.equal(undoSheet().querySelector("h2").textContent, "Undo the mark?");
    assert.ok(words(undoSheet()).includes("Pike comes back to the roster: into TV again and onto the list of players for a match. The cause of death is removed."));
    assertStyled(view, ...SHEETS);
    fireEvent(keepButton(), "click");
    assert.ok(!undoSheet(), "«Keep» closes it");
    assert.ok(document.activeElement === undoButton(), "the focus back on «Undo the mark»");
    askUndo();
    api.reply(UNDO, 200, { team: withPike() });
    fireEvent(restoreButton(), "click");
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(callsTo(UNDO).length, 1, "one DELETE");
    assert.equal(callsTo(UNDO)[0].body, null);
    assert.ok(!undoSheet(), "the sheet closes");
    assert.equal(title().textContent, "Pike", "the page is still his");
    assert.ok(!view.querySelector(".g-fallen"), "no longer a fallen player's profile");
    assert.ok(!view.querySelector(".g-pagehead__sub"), "nor «fallen» under his name");
    assert.equal(calloutTitle(), BACK);
    assert.equal(rosterLink().textContent, "To the roster");
    assert.equal(rosterLink().getAttribute("href"), "#/t/t1/roster");
    assert.ok(rosterLink().closest(".g-callout__action"));
    assert.ok(document.activeElement === rosterLink(), "the focus on the way back to the roster");
    assert.ok(!toasts().includes(BACK), "the page says it: no message over it");
    assert.equal(state.myTeams.items[0].revision, 5, "the coach's list has the server's team");
    assert.ok(state.myTeams.items[0].roster.players.some((player) => player.id === "d1"));
    assert.equal(save.savedRevision("t1"), null, "a queue that does not hold the team is not given it");
    assert.equal(callsTo(FALLEN_READ).length, 1, "the answer is taken as it is: nothing is read again");
    assert.equal(callsTo(LIST_READ).length, 0);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
  // A queue that holds the team (the roster was open before) is left as it was: only the roster's own visit takes an
  // answer into it (final review, I1), and the roster reads the team on its next visit.
  await withoutTimers(async () => {
    coach();
    save.trackRoster(team());
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.reply(UNDO, 200, { team: withPike() });
    restoreButton().focus();
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(save.savedRevision("t1"), 4, "the queue is left as it was");
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(calloutTitle(), BACK);
    assert.ok(document.activeElement === rosterLink(), "the focus on the way back to the roster");
  });
});

// The final review's Important 1, from the profile: an undo sent there lands while the roster is open again. The list
// takes it, and the roster, which the list is now ahead of, reads the team again; its queue is never swapped under it.
test("an undo sent from the profile that lands while the roster is open: the roster reads the team again, and draws what it saves", async () => {
  const tdValue = () => aside().querySelector('[data-action-key="touchdowns"] .g-stepper__value').textContent;
  const plusTd = () => aside().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]');
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    releaseCurrentScreen();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    releaseCurrentScreen();
    await renderTeamRoster("t1");
    assert.deepEqual(namesIn(tables()[2]), ["Pike", "Joe"], "read before the undo landed");
    api.reply("GET /api/teams/t1", 200, { team: withPike() });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    api.reply(FALLEN_READ, 200, { fallen: [JOE] });
    undo.release({ status: 200, body: { team: withPike() } });
    await settle(12);
    assert.equal(callsTo("GET /api/teams/t1").length, 3, "the roster reads the team again");
    assert.deepEqual(tables().map(namesIn), [["Ann", "Bors", "Cade", "Pike"], ["Dell", "Edda", "Finn", "Grom"], ["Joe"]]);
    assert.equal(save.savedRevision("t1"), 5);
    fireEvent(toggle("d1#7"), "click");
    api.reply(PATCH, 200, { team: withPike({ revision: 6 }) });
    fireEvent(plusTd(), "click");
    await settle();
    assert.equal(tdValue(), "3", "the step is drawn: Pike had two");
    assert.equal(callsTo(PATCH).at(-1).body.revision, 5);
    api.assertAnswered();
  });
});

test("an id that is neither on the roster nor among the fallen: the 2.x editor", async () => {
  coach();
  api.reply(LIST_READ, 200, { teams: [team()] });
  await renderTeamPlayer("t1", "zz");
  await settle();
  assert.equal(callsTo(FALLEN_READ).length, 1);
  assert.ok(editor(), "the 2.x editor, as it was");
  assert.ok(!screen());
  // The profile left nothing behind: the games changing draw no profile over the editor.
  await invalidateGames();
  await settle();
  assert.ok(editor());
  assert.ok(!screen());
  api.assertAnswered();
});

test("a list of the fallen that cannot be read says so and reads again on «Try again»", async () => {
  coach();
  api.reply(FALLEN_READ, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
  await renderTeamPlayer("t1", "d1");
  const failed = view.querySelector(".g-roster__failed");
  assert.equal(failed.getAttribute("role"), "alert");
  assert.ok(failed.querySelector(".g-callout--danger"));
  const retry = failed.querySelector("[data-player-retry]");
  assert.equal(retry.textContent, "Try again");
  assert.ok(!undoButton());
  assert.ok(!editor(), "not the 2.x editor: the read failed, not the player");
  assertStyled(view, ...STYLES);
  api.reply(FALLEN_READ, 200, { fallen: FALLEN });
  fireEvent(retry, "click");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the player…");
  await settle();
  assert.equal(callsTo(FALLEN_READ).length, 2);
  assert.equal(title().textContent, "Pike");
  assert.ok(document.activeElement === title());
  assert.ok(!view.querySelector(".g-roster__failed"));
});

test("in a match the undo says why; the page follows the games", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    assert.ok(!undoButton().hasAttribute("aria-disabled"));
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), CLOSED);
    assert.ok(words(screen()).includes(HINT), "the hint stays under it");
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), CLOSED);
    assert.ok(!undoSheet());
    // A sheet open when the match began stays, and says why.
    gamesAre([]);
    await invalidateGames();
    await settle();
    askUndo();
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    assert.ok(undoSheet()?.isModal);
    assert.equal(restoreButton().getAttribute("aria-disabled"), "true");
    assert.equal(restoreButton().getAttribute("title"), CLOSED);
    fireEvent(restoreButton(), "click");
    assert.equal(toasts().at(-1), CLOSED);
    await settle();
    assert.equal(callsTo(UNDO).length, 0);
  });
  // Before the games are read, the undo waits for them.
  await withoutTimers(async () => {
    coach();
    const games = api.hold("GET /api/games");
    const drawing = renderTeamPlayer("t1", "d1");
    await settle();
    assert.equal(undoButton().getAttribute("title"), "Loading the matches…");
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!undoSheet());
    games.release();
    await drawing;
    assert.ok(!undoButton().hasAttribute("aria-disabled"), "open once they are");
  });
});

// K14: the roster's queue sends what waits only from the roster's screen: here the coach is told to go there.
test("while the roster's own edits wait, the undo says so and leads to the roster", async () => {
  await withoutTimers(async () => {
    coach();
    save.trackRoster(team());
    api.fail(PATCH);
    assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    await renderTeamPlayer("t1", "d1");
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), WAIT_ROSTER);
    assert.equal(calloutTitle("warn"), WAIT_ROSTER);
    assert.equal(rosterLink().textContent, "To the roster");
    assert.equal(rosterLink().getAttribute("href"), "#/t/t1/roster");
    fireEvent(undoButton(), "click");
    assert.equal(toasts().at(-1), WAIT_ROSTER);
    assert.ok(!undoSheet());
    await settle();
    assert.equal(callsTo(UNDO).length, 0);
    assertStyled(view, ...STYLES);
  });
  // Another device's save, which the coach settles on the roster.
  await withoutTimers(async () => {
    coach();
    save.trackRoster(team());
    api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: team({ revision: 6 }) });
    assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
    await settle();
    assert.equal(save.saveState("t1").status, "conflict");
    await renderTeamPlayer("t1", "d1");
    assert.equal(undoButton().getAttribute("title"), WAIT_ROSTER);
    assert.equal(calloutTitle("warn"), WAIT_ROSTER);
  });
  // A step in the air answers by itself: the page hears the queue, and the undo opens once it has.
  await withoutTimers(async () => {
    coach();
    save.trackRoster(team());
    const step = api.hold(PATCH);
    assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
    await settle();
    await renderTeamPlayer("t1", "d1");
    assert.equal(undoButton().getAttribute("title"), WAIT_ROSTER);
    step.release({ status: 200, body: { team: team({ revision: 5 }) } });
    await settle();
    assert.ok(!undoButton().hasAttribute("aria-disabled"));
    assert.ok(!callout());
  });
});

test("an undo whose answer was lost on the profile is read back and told", async () => {
  const cases = [
    ["landed", [withPike()], [JOE]],
    ["not landed", [team()], FALLEN],
  ];
  for (const [label, teams, fallen] of cases) {
    await withoutTimers(async () => {
      coach();
      await renderTeamPlayer("t1", "d1");
      askUndo();
      api.fail(UNDO);
      serverHolds(teams, fallen);
      fireEvent(restoreButton(), "click");
      await settle(12);
      assert.ok(!undoSheet(), label);
      assert.equal(callsTo(UNDO).length, 1, `${label}: never sent twice`);
      assert.equal(callsTo(FALLEN_READ).length, 2, `${label}: the fallen read back once`);
      assert.equal(callsTo(LIST_READ).length, 1, `${label}: and the coach's list with them`);
      if (label === "landed") {
        assert.equal(calloutTitle(), BACK, label);
        assert.ok(document.activeElement === rosterLink(), label);
        assert.equal(state.myTeams.items[0].revision, 5, label);
      } else {
        assert.equal(toasts().at(-1), UNDO_LOST, label);
        assert.ok(lastToastIsError(), label);
        assert.ok(undoButton(), `${label}: still his profile`);
        assert.ok(!undoButton().hasAttribute("aria-disabled"), label);
      }
      api.assertAnswered();
    });
  }
  // A read caught half done (the record kept, he on the roster) is read once more; still split, the coach is told.
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.fail(UNDO);
    serverHolds([withPike()], FALLEN);
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(callsTo(FALLEN_READ).length, 3);
    assert.equal(callsTo(UNDO).length, 1);
    assert.equal(toasts().at(-1), UNKNOWN);
    assert.ok(lastToastIsError());
  });
  // A read back that fails takes nothing: his profile stays, and the coach is told the server could not be told.
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.fail(UNDO);
    api.fail(LIST_READ);
    api.reply(FALLEN_READ, 200, { fallen: [JOE] });
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(callsTo(LIST_READ).length, 1);
    assert.equal(toasts().at(-1), UNKNOWN);
    assert.ok(state.myTeams.error);
    assert.equal(toasts().at(-2), state.myTeams.error, "the read's own failure is said before it");
    assert.ok(undoButton(), "still his profile: a read that failed is not taken");
    assert.ok(!calloutTitle());
    assert.equal(callsTo(UNDO).length, 1);
  });
  // While the read is in the air the undo waits for it.
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.fail(UNDO);
    serverHolds([team()], FALLEN);
    const read = api.hold(FALLEN_READ);
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(undoButton().getAttribute("title"), "Loading the player…");
    fireEvent(undoButton(), "click");
    assert.ok(!undoSheet());
    read.release();
    await settle(12);
    assert.equal(callsTo(UNDO).length, 1);
  });
});

// The final review's R2 with the T10 words: the page says what the read shows — never «not found» over him back.
test("an undo of a record the server no longer has reads again: another device put him back", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.reply(UNDO, 404, { error: { code: "FALLEN_NOT_FOUND", params: {}, message: "x" } });
    serverHolds([withPike()], [JOE]);
    restoreButton().focus();
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(callsTo(FALLEN_READ).length, 2, "read again");
    assert.ok(!undoSheet());
    assert.ok(!toasts().includes("Fallen player not found."), "no «not found» over a page that says he is back");
    assert.equal(calloutTitle(), BACK, "the roster has him");
    assert.ok(document.activeElement === rosterLink(), "the sheet it stood in is gone: the focus goes to the way back");
    assert.equal(callsTo(UNDO).length, 1);
  });
  // The sheet closed while the undo was on its way: nothing is said before the read, and then the page says he is back.
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    fireEvent(undoSheet(), "keydown", { key: "Escape" });
    serverHolds([withPike()], [JOE]);
    undo.release({ status: 404, body: { error: { code: "FALLEN_NOT_FOUND", params: {}, message: "x" } } });
    await settle(12);
    assert.ok(!toasts().includes("Fallen player not found."));
    assert.equal(calloutTitle(), BACK);
  });
  // Gone from the fallen and not on the roster either: the page says it is not found.
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.reply(UNDO, 404, { error: { code: "FALLEN_NOT_FOUND", params: {}, message: "x" } });
    serverHolds([team()], [JOE]);
    fireEvent(restoreButton(), "click");
    await settle(12);
    assert.equal(calloutTitle("danger"), "Fallen player not found.");
    assert.equal(rosterLink().getAttribute("href"), "#/t/t1/roster");
  });
});

// K8 and the T4 review's carry.
test("an undo's answer is taken whatever became of the sheet, and only for the coach who sent it", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(restoreButton().getAttribute("aria-busy"), "true");
    fireEvent(undoSheet(), "keydown", { key: "Escape" });
    assert.ok(!undoSheet(), "the coach may close the sheet");
    assert.equal(undoButton().getAttribute("title"), WRITING);
    undo.release({ status: 200, body: { team: withPike() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(calloutTitle(), BACK);
    assert.ok(document.activeElement === rosterLink(), "the undo it stood on is gone: the focus goes to the way back, not the page's body");
  });
  // The coach left the page: the list takes it all the same, and the roster's queue is left as it was.
  await withoutTimers(async () => {
    coach();
    save.trackRoster(team());
    await renderTeamPlayer("t1", "d1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    releaseCurrentScreen();
    undo.release({ status: 200, body: { team: withPike() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(save.savedRevision("t1"), 4);
  });
  // Another coach signed in meanwhile: not his to take.
  await withoutTimers(async () => {
    coach();
    await renderTeamPlayer("t1", "d1");
    askUndo();
    const undo = api.hold(UNDO);
    fireEvent(restoreButton(), "click");
    await settle();
    state.auth.currentUser = { id: "u2", login: "another", preferences: {} };
    undo.release({ status: 200, body: { team: withPike() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 4);
    assert.ok(!calloutTitle());
  });
});

test("a visit left before the fallen are read draws nothing", async () => {
  // His profile, and an id the fallen do not hold, which would go to the 2.x editor.
  for (const playerId of ["d1", "zz"]) {
    coach();
    api.reply(LIST_READ, 200, { teams: [team()] });
    const read = api.hold(FALLEN_READ);
    const drawing = renderTeamPlayer("t1", playerId);
    await settle();
    assert.ok(view.querySelector(".g-roster__loading"), playerId);
    releaseCurrentScreen();
    view.innerHTML = '<p id="elsewhere">Elsewhere</p>';
    read.release();
    await drawing;
    await settle();
    assert.ok(view.querySelector("#elsewhere"), `${playerId}: the screen after it is left as it is`);
    assert.ok(!screen(), playerId);
    assert.ok(!editor(), `${playerId}: nor handed to the 2.x editor`);
    assert.equal(callsTo(LIST_READ).length, 0, playerId);
  }
});

// The T6 carry, the review's Important 1: a post-match finished in this tab marks the list to be read again and keeps the
// roster from before the match, which still holds the player who died in it.
test("a list marked to be read again is read before it says whose the id is", async () => {
  // He died in the match: the list read again does not hold him, and his profile opens.
  coach();
  state.myTeams = { items: [withPike()], loaded: false, loading: false, error: "" };
  api.reply(LIST_READ, 200, { teams: [team()] });
  const drawing = renderTeamPlayer("t1", "d1");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the player…", "the wait, while the list is read");
  assert.ok(!editorWaits());
  await drawing;
  assert.ok(screen(), "his profile, not the 2.x editor");
  assert.equal(title().textContent, "Pike");
  assert.ok(undoButton());
  assert.ok(!editor());
  assert.equal(callsTo(LIST_READ).length, 1);
  assert.ok(callsTo(LIST_READ)[0] && api.calls.indexOf(callsTo(LIST_READ)[0]) < api.calls.indexOf(callsTo(FALLEN_READ)[0]), "the list first");
  api.assertAnswered();
  // A player the list read again still holds: the 2.x editor, and the fallen are not read.
  coach();
  state.myTeams = { items: [team()], loaded: false, loading: false, error: "" };
  api.reply(LIST_READ, 200, { teams: [team()] });
  await renderTeamPlayer("t1", "p1");
  await settle();
  assert.ok(editor());
  assert.ok(!screen());
  assert.equal(callsTo(FALLEN_READ).length, 0);
  // A list read from a list read, untouched: the editor at once, nothing read first.
  coach();
  api.reply(LIST_READ, 200, { teams: [team()] });
  renderTeamPlayer("t1", "p1");
  assert.ok(editorWaits(), "at once");
  await settle();
  // The visit left while the list is read: nothing is drawn, nothing handed over.
  coach();
  state.myTeams = { items: [withPike()], loaded: false, loading: false, error: "" };
  api.reply(LIST_READ, 200, { teams: [team()] });
  const list = api.hold(LIST_READ);
  const left = renderTeamPlayer("t1", "d1");
  await settle();
  releaseCurrentScreen();
  view.innerHTML = '<p id="elsewhere">Elsewhere</p>';
  list.release();
  await left;
  await settle();
  assert.ok(view.querySelector("#elsewhere"));
  assert.equal(callsTo(FALLEN_READ).length, 0);
});

// The review's Important 2 (R8): nothing else reads the games, and the server does not refuse an undo in a match (K20).
test("the games are read again when the tab is seen again; a match begun meanwhile closes the undo", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  const gameReads = () => callsTo("GET /api/games").length;
  try {
    await withoutTimers(async () => {
      coach();
      await renderTeamPlayer("t1", "d1");
      assert.equal(gameReads(), 1, "on entry");
      assert.ok(!undoButton().hasAttribute("aria-disabled"));
      gamesAre([LIVE_GAME]);
      document.visibilityState = "hidden";
      events.dispatchEvent(new Event("visibilitychange"));
      assert.equal(gameReads(), 1, "a tab put away reads nothing");
      document.visibilityState = "visible";
      events.dispatchEvent(new Event("visibilitychange"));
      assert.equal(undoButton().getAttribute("title"), "Loading the matches…", "the undo waits for them");
      await settle();
      assert.equal(gameReads(), 2);
      assert.equal(undoButton().getAttribute("aria-disabled"), "true");
      assert.equal(undoButton().getAttribute("title"), CLOSED);
      fireEvent(undoButton(), "click");
      assert.ok(!undoSheet());
      releaseCurrentScreen();
      events.dispatchEvent(new Event("visibilitychange"));
      await settle();
      assert.equal(gameReads(), 2, "a page left reads nothing");
      assert.equal(callsTo(UNDO).length, 0);
    });
  } finally {
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("games that cannot be read close the undo and offer to read them again", async () => {
  await withoutTimers(async () => {
    coach();
    api.reply("GET /api/games", 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await renderTeamPlayer("t1", "d1");
    const error = state.games.error;
    assert.ok(error);
    assert.equal(undoButton().getAttribute("aria-disabled"), "true");
    assert.equal(undoButton().getAttribute("title"), error);
    assert.equal(calloutTitle("danger"), error);
    const again = view.querySelector("[data-player-games]");
    assert.equal(again.textContent, "Try again");
    gamesAre([]);
    fireEvent(again, "click");
    assert.equal(undoButton().getAttribute("title"), "Loading the matches…");
    assert.ok(!view.querySelector("[data-player-games]"), "no second press while they are read");
    await settle();
    assert.ok(!undoButton().hasAttribute("aria-disabled"), "read: the undo is open");
    assert.ok(!callout());
    // A death the page does not undo has nothing to wait for: no banner.
    coach();
    api.reply("GET /api/games", 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await renderTeamPlayer("t1", "d2");
    assert.ok(!callout());
  });
});

test("a 2.x player's numeric id: the address carries it as text", async () => {
  const LIVING = { id: 5, rowIndex: 0, number: "5", name: "Numa" };
  coach();
  state.myTeams = { items: [withPlayers([...PLAYERS, LIVING])], loaded: true, loading: false, error: "" };
  api.reply(LIST_READ, 200, { teams: [withPlayers([...PLAYERS, LIVING])] });
  renderTeamPlayer("t1", "5");
  assert.ok(editorWaits(), "a player of the roster: the 2.x editor");
  await settle();
  assert.equal(callsTo(FALLEN_READ).length, 0);
  coach({ fallen: [died("f9", { id: 9, rowIndex: 3, number: "9", name: "Nine" }, { cause: "Foul" })] });
  await renderTeamPlayer("t1", "9");
  assert.equal(title().textContent, "Nine");
  assert.ok(undoButton(), "his death undone by its record, as any other");
});

test("a fallen record's position and cause are text", async () => {
  coach({ fallen: [died("f8", { id: "d8", name: "Grim", position: HOSTILE, number: "12" }, { cause: HOSTILE })] });
  await renderTeamPlayer("t1", "d8");
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, `${HOSTILE} · Human · fallen`);
  assert.equal(view.querySelector(".g-fallen__cause").textContent, HOSTILE);
  assert.ok(!view.querySelector("img"));
  assert.ok(!view.querySelector("[onerror]"));
  assertCspSafe(view);
});

test("his name is text on the page and in the sheet", async () => {
  coach({ fallen: [{ ...PIKE, player: { ...PIKE.player, name: HOSTILE } }] });
  await renderTeamPlayer("t1", "d1");
  assert.equal(title().textContent, HOSTILE);
  askUndo();
  assert.ok(words(undoSheet()).includes(`${HOSTILE} comes back to the roster: into TV again and onto the list of players for a match. The cause of death is removed.`));
  assert.ok(!view.querySelector("img"));
  assert.ok(!view.querySelector("[onerror]"));
  assertCspSafe(view);
});

test("the page is a column; its ways back to the roster are the roster's banner link, a thumb tall and in the banner's ink", () => {
  const sheet = "src/screens/team/roster/marks.css";
  assert.deepEqual(valuesOf(sheet, ".g-fallen-page__body", "max-width"), ["640px"]);
  assert.deepEqual(valuesOf(sheet, ".g-fallen-page__body", "gap"), ["var(--space-16)"]);
  const selector = ".g-fallen-page";
  assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background"), valuesOf(sheet, selector, "text-transform")], [["0"], ["none"], ["none"]]);
  assert.equal(valuesOf(sheet, selector, "font").length, 1);
  assert.deepEqual(valuesOf(sheet, selector, "letter-spacing"), ["0"]);
  assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  // K14: the link is the roster's own, styled for any banner (roster.css), not a copy of it.
  assert.deepEqual(valuesOf("src/screens/team/roster/roster.css", ".g-roster__calloutlink", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf("src/screens/team/roster/roster.css", ".g-roster__calloutlink", "color"), ["inherit"]);
  assert.ok(!/\.g-fallen-page__link/.test(text("src/screens/team/roster/marks.css")), "no second set of rules for it");
});

import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  FALLEN, JOE, LIVE_GAME, PIKE, PLAYERS, STYLES, api, coach, died, formatDay, invalidateGames, releaseCurrentScreen, save, settle, state, team, view, withPlayers,
  words,
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
const rosterLink = () => view.querySelector("a.g-fallen-page__link");
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
  // A queue that holds the team (the roster was open before) takes it too.
  await withoutTimers(async () => {
    coach();
    save.trackRoster(team());
    await renderTeamPlayer("t1", "d1");
    askUndo();
    api.reply(UNDO, 200, { team: withPike() });
    fireEvent(restoreButton(), "click");
    await settle();
    assert.equal(save.savedRevision("t1"), 5);
    assert.equal(state.myTeams.items[0].revision, 5);
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
    assert.equal(toasts().at(-1), "Fallen player not found.");
    assert.equal(calloutTitle(), BACK, "the roster has him");
    assert.ok(document.activeElement === rosterLink(), "the sheet it stood in is gone: the focus goes to the way back");
    assert.equal(callsTo(UNDO).length, 1);
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
  // The coach left the page: the list takes it all the same.
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
    assert.equal(save.savedRevision("t1"), 5);
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

test("the page is a column; its ways back to the roster are a thumb tall and readable on their banner", () => {
  const sheet = "src/screens/team/roster/marks.css";
  assert.deepEqual(valuesOf(sheet, ".g-fallen-page__body", "max-width"), ["640px"]);
  assert.deepEqual(valuesOf(sheet, ".g-fallen-page__body", "gap"), ["var(--space-16)"]);
  assert.deepEqual(valuesOf(sheet, ".g-fallen-page__link", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(sheet, ".g-fallen-page__link", "color"), ["inherit"], "the banner's own ink");
  for (const selector of [".g-fallen-page", ".g-fallen-page__link"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background"), valuesOf(sheet, selector, "text-transform")], [["0"], ["none"], ["none"]], selector);
    assert.equal(valuesOf(sheet, selector, "font").length, 1, selector);
    assert.deepEqual(valuesOf(sheet, selector, "letter-spacing"), ["0"], selector);
  }
  assertReadable(sheet, ".g-fallen-page", "color", ["--surface"], 4.5);
});

import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  FALLEN, JOE, LIVE_GAME, PIKE, PLAYERS, READING, STYLES, api, aside, bodyOf, callKeys, coach, died, formatDay, headingText, invalidateGames, loadGames,
  namesIn, nextLine, openRow, page, releaseCurrentScreen, renderTeamRoster, save, settle, state, subOf, tables, team, teamPlayerUrl, text, toggle, view,
  withPlayers, words,
} from "./helpers/roster-page.mjs";

// Stage 07b, Task 6: the roster's sections «Missing the match» and «Fallen», a fallen player's row and his profile in the
// desk panel. The page, the coach and his team are helpers/roster-page.mjs's, which test/team-roster-fallen-undo.test.mjs
// stands on too.

test("the roster in three: those who play, those who miss the next match with why, and the fallen; the counts are the roster's", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.match(headingText("roster-heading"), /^Active roster 3$/);
  assert.match(headingText("roster-skips-heading"), /^Missing the match 4$/);
  assert.match(headingText("roster-fallen-heading"), /^Fallen 2$/);
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "On the roster: 7 · missing a match: 4 · can advance: 0", "the dead are not on the roster");
  const sections = view.querySelectorAll("section.g-roster__section");
  assert.deepEqual(sections.map((section) => section.getAttribute("aria-labelledby")), ["roster-heading", "roster-skips-heading", "roster-fallen-heading"]);
  assert.ok(sections[2].classList.contains("g-roster__section--fallen"));
  assert.ok(!sections[0].classList.contains("g-roster__section--fallen"));
  assert.ok(sections[0].querySelector(".g-roster__status"), "the save's status stands by «Active roster»");
  assert.equal(view.querySelectorAll(".g-roster__status").length, 1);
  assert.deepEqual(tables().map((table) => table.getAttribute("aria-label")),
    ["Players of Ashgrove Wardens", "Players of Ashgrove Wardens who miss the next match", "The fallen of Ashgrove Wardens"]);
  assert.deepEqual(tables().map(namesIn), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  assert.deepEqual(tables()[2].querySelectorAll("tbody").map((body) => body.getAttribute("data-key")), ["fallen-f1", "fallen-f2"]);
  assert.ok(callKeys().includes("GET /api/teams/t1/fallen"), "the fallen are read with the roster");
  api.assertAnswered();
});

test("one sort for the three tables: on a phone a header of any of them sorts all three; a desk shows and sorts the labels once, at the top", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(tables()[2].querySelector('[data-sort-key="ma"]'), "click");
    // MA: Cade 8, Bors 7, Ann 6 · Edda 6, Finn 6, Dell 5 (lowered), Grom 5 · Pike 7, Joe 6.
    assert.deepEqual(tables().map(namesIn), [["Cade", "Bors", "Ann"], ["Edda", "Finn", "Dell", "Grom"], ["Pike", "Joe"]]);
    for (const table of tables()) assert.equal(table.querySelector('[data-sort-key="ma"]').closest("th").getAttribute("aria-sort"), "descending");
    fireEvent(tables()[0].querySelector('[data-sort-key="player"]'), "click");
    assert.deepEqual(tables().map(namesIn), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  });
  // DeskRosterInjured.html: one card, the labels once. The other tables keep their column headers for a screen reader,
  // with no button and no over-heads: the first table's sort orders all three.
  coach();
  await renderTeamRoster("t1");
  assert.equal(tables()[0].querySelectorAll("thead .g-sort").length, 14);
  for (const table of tables().slice(1)) {
    assert.equal(table.querySelector("thead .g-sort"), null);
    assert.equal(table.querySelector("thead .g-rtable__groups"), null);
    const heads = table.querySelectorAll('thead th[scope="col"]');
    assert.equal(heads.length, 14);
    assert.ok(heads.every((head) => head.querySelector(".g-sr-only")), "said, not drawn");
    assert.ok(table.querySelector("thead tr").classList.contains("g-rtable__quiet"));
  }
  fireEvent(tables()[0].querySelector('[data-sort-key="ma"]'), "click");
  assert.deepEqual(tables().map(namesIn), [["Cade", "Bors", "Ann"], ["Edda", "Finn", "Dell", "Grom"], ["Pike", "Joe"]]);
});

test("a reason in words under a name: an injury, another reason, the season's retirement, none from 2.x", async () => {
  coach();
  await renderTeamRoster("t1");
  const subs = ["p4#0", "p5#0", "p6#0", "p7#0"].map(subOf);
  assert.deepEqual(subs.map((sub) => sub.textContent), ["Lasting Injury (MA)", "Misses the next match", "Temporarily retired for the season", "Suspended"]);
  for (const sub of subs) assert.ok(sub.classList.contains("g-rtable__sub--alert"));
  assert.deepEqual(["p1#0", "p2#0", "p3#0"].map((key) => [subOf(key).textContent, subOf(key).classList.contains("g-rtable__sub--alert")]),
    [["Human Lineman", false], ["Blitzer", false], ["Catcher", false]]);
  // The other injuries, and another reason with no words written (K10): the 2.x line, never an empty red one.
  coach({
    teamAnswer: withPlayers([
      { id: "q1", rowIndex: 0, number: "1", name: "Hal", skipNextGame: true, absence: { code: "miss" } },
      { id: "q2", rowIndex: 0, number: "2", name: "Ida", skipNextGame: true, absence: { code: "niggling" } },
      { id: "q3", rowIndex: 0, number: "3", name: "Jon", skipNextGame: true, absence: { code: "other" } },
      { id: "q4", rowIndex: 0, number: "4", name: "Kai", skipNextGame: true, absence: { code: "other", note: "   " } },
      { id: "q5", rowIndex: 0, number: "5", name: "Lev", skipNextGame: true, absence: { code: "lasting" } },
    ]),
    fallen: [],
  });
  await renderTeamRoster("t1");
  assert.deepEqual(["q1#0", "q2#0", "q3#0", "q4#0", "q5#0"].map((key) => subOf(key).textContent),
    ["Seriously Hurt", "Serious Injury", "Misses the next match", "Misses the next match", "Lasting Injury"]);
});

test("the labels repeat once, at the end of the list", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(view.querySelectorAll("tfoot").length, 1);
  assert.ok(tables()[2].querySelector("tfoot"), "under the last table");
  coach({ fallen: [] });
  await renderTeamRoster("t1");
  assert.equal(tables().length, 2, "no section for nobody");
  assert.ok(!headingText("roster-fallen-heading"));
  assert.equal(view.querySelectorAll("tfoot").length, 1);
  assert.ok(tables()[1].querySelector("tfoot"));
  coach({ teamAnswer: withPlayers(PLAYERS.map((player) => ({ ...player, skipNextGame: false, temporarilyRetired: false, absence: null }))), fallen: [] });
  await renderTeamRoster("t1");
  assert.equal(tables().length, 1);
  assert.ok(!headingText("roster-skips-heading"));
  assert.ok(tables()[0].querySelector("tfoot"), "one table keeps its foot");
});

test("a fallen row: a grey number, grey numbers and «Fallen · cause»; open on a phone it says why, when, and leads to his profile", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    const pike = bodyOf("fallen-f1");
    assert.ok(pike.querySelector(".g-num--fallen"));
    assert.ok(!pike.querySelector(".g-num--blitzer"), "no position's colour");
    assert.equal(subOf("fallen-f1").textContent, "Fallen · Foul by the Raiders");
    assert.ok(subOf("fallen-f1").classList.contains("g-rtable__sub--alert"), "red, as every absence (StatsInjured.html)");
    assert.deepEqual(pike.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["7", "3", "3+", "4+", "9+"]);
    assert.ok(!pike.querySelector(".g-rtable__delta"));
    fireEvent(toggle("fallen-f1"), "click");
    const row = openRow();
    assert.ok(row, "his row opens");
    assert.ok(bodyOf("fallen-f1").classList.contains("is-expanded"));
    assert.ok(words(row).includes("Cause of death"));
    assert.ok(words(row).includes("Foul by the Raiders"));
    assert.ok(words(row).includes(`Career: 6 SPP · marked by hand · ${formatDay(PIKE.diedAt)}`));
    const profile = row.querySelector("a.g-btn");
    assert.equal(profile.textContent, "Player's profile");
    assert.equal(profile.getAttribute("href"), teamPlayerUrl("t1", "d1"));
    assert.ok(words(row).includes("The mark can be undone in the profile"));
    assert.ok(!row.querySelector("[data-action-key]"), "no counters for the dead");
    assert.ok(!pike.querySelector("[data-action-key]"));
    assert.ok(!words(row).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
  });
});

test("a death the post-match recorded says the administrator corrects it, and offers no undo", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(subOf("fallen-f2").textContent, "Fallen", "no cause, the state alone");
    fireEvent(toggle("fallen-f2"), "click");
    const row = openRow();
    assert.ok(words(row).includes("No cause was recorded."));
    assert.ok(words(row).includes(`Career: 0 SPP · in a match · round 2 · ${formatDay(JOE.diedAt)}`));
    assert.ok(words(row).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
    assert.ok(!words(row).includes("The mark can be undone in the profile"));
    assert.equal(row.querySelector("a.g-btn").getAttribute("href"), teamPlayerUrl("t1", "d2"));
  });
  // A friendly has no round: «in a match · <date>».
  await withWindow({ phone: false }, async () => {
    coach({ fallen: [{ ...JOE, roundNumber: null }] });
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f2"), "click");
    assert.equal(aside().querySelector(".g-fallen__when").textContent, `in a match · ${formatDay(JOE.diedAt)}`);
    assert.ok(words(aside()).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
    assert.ok(!aside().querySelector("[data-roster-undo]"));
  });
});

test("on a desk a fallen player chosen stands in the panel as his profile", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "the first who plays, by default");
    assert.equal(toggle("fallen-f1").getAttribute("aria-controls"), "roster-aside");
    fireEvent(toggle("fallen-f1"), "click");
    const panel = view.querySelector('.g-roster__aside[data-panel-player="fallen-f1"]');
    assert.ok(panel);
    assert.ok(bodyOf("fallen-f1").classList.contains("is-selected"));
    assert.ok(panel.querySelector(".g-num--fallen.g-num--lg"));
    assert.equal(panel.querySelector("h2.g-roster__pname").textContent, "Pike");
    assert.equal(panel.querySelector(".g-roster__pline").textContent, "Blitzer · Human · fallen");
    assert.ok(panel.querySelector(".g-fallen__stats dl.g-stats"));
    assert.deepEqual(panel.querySelectorAll(".g-stat__v").map((value) => value.textContent), ["7", "3", "3+", "4+", "9+"]);
    assert.equal(panel.querySelector(".g-fallen__state .g-status").textContent, "Fallen");
    assert.equal(panel.querySelector(".g-fallen__when").textContent, `marked by hand · ${formatDay(PIKE.diedAt)}`);
    assert.ok(words(panel).includes("Cause of death"));
    assert.equal(panel.querySelector(".g-fallen__cause").textContent, "Foul by the Raiders");
    // Stage 07e: his career by match, the desk's block, in place of «Career: 6 SPP» (test/team-fallen-career.test.mjs).
    assert.ok(panel.querySelector(".g-career"));
    assert.ok(!panel.querySelector(".g-fallen__career"));
    assert.deepEqual(panel.querySelectorAll(".g-skill--card").map((card) => card.getAttribute("data-skill")), ["Block", "Tackle"]);
    assert.ok(words(panel).includes("A fallen player plays no matches, takes no advancements and is not in TV."));
    assert.ok(!panel.querySelector("[data-action-key]"), "no counters");
    assert.ok(!panel.querySelector(".g-roster__edit"), "no pencil");
    assert.ok(!panel.querySelector(".g-roster__next"), "no next match");
    assert.ok(!words(panel).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
  });
});

test("the default in the panel: the first who plays, else the first who misses the match, else the first of the fallen", async () => {
  await withWindow({ phone: false }, async () => {
    coach({ teamAnswer: withPlayers(PLAYERS.filter(({ skipNextGame }) => skipNextGame)) });
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p4#0");
    assert.match(headingText("roster-heading"), /^Active roster 0$/);
    assert.equal(view.querySelector(".g-roster__section .g-roster__empty").textContent, "Everyone on the roster misses the next match.");
    assert.ok(view.querySelector("section.g-roster__section .g-roster__status"), "the status keeps its place");
    assert.deepEqual(tables().map(namesIn), [["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
    coach({ teamAnswer: withPlayers([]) });
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "fallen-f1");
    assert.equal(view.querySelector(".g-roster__empty").textContent, "No players on the roster yet.");
    assert.deepEqual(tables().map(namesIn), [["Pike", "Joe"]]);
    coach({ teamAnswer: withPlayers([]), fallen: [] });
    await renderTeamRoster("t1");
    assert.ok(!aside());
    assert.equal(tables().length, 0);
    assert.equal(view.querySelector(".g-roster__empty").textContent, "No players on the roster yet.");
  });
});

test("a skipper's panel says why he sits the next match out", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p4#0"), "click");
    assert.equal(nextLine(), "Next match: Lasting Injury (MA) · sits it out");
    fireEvent(toggle("p6#0"), "click");
    assert.equal(nextLine(), "Next match: Temporarily retired for the season · sits it out");
    fireEvent(toggle("p7#0"), "click");
    assert.equal(nextLine(), "Next match: Suspended · sits it out");
    // A 2.x skip says no why, and the line does not say it twice (K3).
    fireEvent(toggle("p5#0"), "click");
    assert.equal(nextLine(), "Next match: Sits it out");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(nextLine(), "Next match: Plays");
  });
});

test("the fallen are read with the roster; a list that cannot be read fails the read with words and «Try again»", async () => {
  await withoutTimers(async () => {
    coach();
    api.fail("GET /api/teams/t1/fallen");
    await renderTeamRoster("t1");
    const callout = view.querySelector(".g-roster__failed .g-callout--danger");
    assert.ok(callout);
    assert.ok(callout.querySelector(".g-callout__title").textContent.length > 0);
    assert.equal(tables().length, 0);
    const retry = view.querySelector("[data-roster-retry]");
    assert.equal(retry.textContent, "Try again");
    api.reply("GET /api/teams/t1/fallen", 200, { fallen: FALLEN });
    fireEvent(retry, "click");
    await settle();
    assert.deepEqual(view.querySelectorAll("section.g-roster__section").map((section) => section.getAttribute("aria-labelledby")),
      ["roster-heading", "roster-skips-heading", "roster-fallen-heading"]);
    // A list that is not one is no answer, as an unreadable roster is not.
    coach({ fallen: "nobody" });
    await renderTeamRoster("t1");
    assert.ok(view.querySelector(".g-roster__failed"));
  });
});

test("every read of the team reads the fallen with it: a match that ends brings its dead, and the counters wait for both", async () => {
  // On a phone, Bors's row open: the counters are drawn in a match and after it (D3: a desk's panel has them in a match only).
  await withWindow({ phone: true }, async () => withoutTimers(async () => {
    coach({ fallen: [], open: "p2#0" });
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    await renderTeamRoster("t1");
    assert.equal(tables().length, 2);
    api.calls.length = 0;
    // The post-match was finished on another device: Ann died in it.
    api.reply("GET /api/games", 200, { games: [{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }], currentGames: [] });
    api.reply("GET /api/teams/t1", 200, { team: withPlayers(PLAYERS.slice(1), { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    api.reply("GET /api/teams/t1/fallen", 200, { fallen: [died("f9", PLAYERS[0], { cause: "Crowd", pairingId: "g2", roundNumber: 3, fromMatch: true })] });
    const fallenRead = api.hold("GET /api/teams/t1/fallen");
    await invalidateGames();
    await settle();
    assert.ok(callKeys().includes("GET /api/teams/t1/fallen"));
    const plus = view.querySelector('[data-action-key="touchdowns"] [data-action-step="1"]');
    assert.equal(plus.getAttribute("title"), READING, "closed while the fallen are read");
    fallenRead.release();
    await settle();
    assert.deepEqual(tables().map(namesIn), [["Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Ann"]]);
    assert.equal(subOf("fallen-f9").textContent, "Fallen · Crowd");
    assert.ok(!view.querySelector('[data-action-key="touchdowns"] [data-action-step="1"]').hasAttribute("aria-disabled"));
  }));
});

test("a fallen player on the roster as read is drawn once", async () => {
  coach({ fallen: [...FALLEN, died("f3", { id: "p1", rowIndex: 0, number: "1", name: "Ann" })] });
  await renderTeamRoster("t1");
  assert.match(headingText("roster-fallen-heading"), /^Fallen 2$/);
  assert.ok(!bodyOf("fallen-f3"));
  assert.equal(view.querySelectorAll(".g-rtable__name").filter((name) => name.textContent === "Ann").length, 1);
});

test("a fallen record the roster cannot read is drawn with dashes, and the screen stands", async () => {
  await withWindow({ phone: true }, async () => {
    coach({ fallen: [died("f4", { name: "Old Joe", position: "Lineman", number: 5 }, { cause: "Old age" }), died("f5", null)] });
    await renderTeamRoster("t1");
    assert.equal(view.querySelector("h1").textContent, "Roster");
    const old = bodyOf("fallen-f4");
    assert.equal(old.querySelector(".g-rtable__name").textContent, "Old Joe");
    assert.equal(old.querySelector(".g-num").textContent, "5");
    assert.deepEqual(old.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["–", "–", "–", "–", "–"]);
    fireEvent(toggle("fallen-f4"), "click");
    assert.ok(words(openRow()).includes("Old age"));
    assert.ok(!openRow().querySelector("a"), "no id, no profile to lead to");
    assert.ok(bodyOf("fallen-f5"), "a record with no player at all is a row too");
    assert.ok(!view.textContent.includes("undefined"));
    assert.ok(![...view.walk()].some((node) => node.nodeType === 1 && (node.getAttribute("class") ?? "").includes("undefined")));
  });
});

// The final review's T6 carry: a record with no player data still has a name for the panel's head and the row's button,
// and the line under it says no position it does not have.
test("a fallen record with no player data is named «Fallen» in its row and its panel, with no empty position", async () => {
  await withWindow({ phone: false }, async () => {
    coach({ fallen: [died("f4", { name: "Old Joe", position: "Lineman", number: 5 }), died("f5", null), died("f6", { name: "  ", position: "", number: "" })] });
    await renderTeamRoster("t1");
    const head = () => [aside().querySelector(".g-roster__pname").textContent, aside().querySelector(".g-roster__pline").textContent];
    fireEvent(toggle("fallen-f4"), "click");
    assert.deepEqual(head(), ["Old Joe", "Lineman · Human · fallen"]);
    for (const key of ["fallen-f5", "fallen-f6"]) {
      fireEvent(toggle(key), "click");
      assert.equal(aside().getAttribute("data-panel-player"), key);
      assert.deepEqual(head(), ["Fallen", "Human · fallen"], key);
      assert.equal(bodyOf(key).querySelector(".g-rtable__name").textContent, "Fallen", `${key}: the row's button has a name`);
    }
  });
});

test("a skill chip of a fallen player opens its rule, in his row and in the panel", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    const chip = bodyOf("fallen-f1").querySelectorAll("[data-skill]").find((item) => item.getAttribute("data-skill") === "Block");
    fireEvent(chip, "click");
    const sheet = view.querySelector("dialog#roster-skill");
    assert.ok(sheet);
    assert.equal(sheet.querySelector("h2").textContent, "Block");
    assert.equal(sheet.querySelector(".g-roster__from").textContent, "Pike · starting");
    fireEvent(sheet, "keydown", { key: "Escape" });
    assert.ok(!view.querySelector("dialog#roster-skill"));
    fireEvent(toggle("fallen-f1"), "click");
    fireEvent(aside().querySelectorAll(".g-skill--card").find((card) => card.getAttribute("data-skill") === "Tackle"), "click");
    assert.equal(view.querySelector("dialog#roster-skill h2").textContent, "Tackle");
  });
});

test("a dead captain wears no «C» and no captain's Pro", async () => {
  await withWindow({ phone: false }, async () => {
    coach({ fallen: [died("f6", { id: "d6", rowIndex: 3, number: "11", name: "Vex", isCaptain: true })] });
    await renderTeamRoster("t1");
    assert.ok(!bodyOf("fallen-f6").querySelector(".g-num__captain"));
    fireEvent(toggle("fallen-f6"), "click");
    assert.deepEqual(aside().querySelectorAll(".g-skill--card").map((card) => card.getAttribute("data-skill")), ["Block", "Tackle"]);
    assert.ok(!aside().querySelector(".g-num__captain"));
  });
});

test("the cause and the note are text", async () => {
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach({
        teamAnswer: withPlayers(PLAYERS.map((player) => (player.id === "p7" ? { ...player, absence: { code: "other", note: HOSTILE } } : player))),
        fallen: [{ ...PIKE, cause: HOSTILE }],
      });
      await renderTeamRoster("t1");
      assert.equal(subOf("p7#0").textContent, HOSTILE);
      assert.equal(subOf("fallen-f1").textContent, `Fallen · ${HOSTILE}`);
      fireEvent(toggle("fallen-f1"), "click");
      const where = phone ? openRow() : aside();
      assert.ok(words(where).includes(HOSTILE));
      if (!phone) {
        fireEvent(toggle("p7#0"), "click");
        assert.equal(nextLine(), `Next match: ${HOSTILE} · sits it out`);
      }
      assert.ok(!view.querySelector("img"));
      assert.ok(!view.querySelector("[onerror]"));
      assertCspSafe(view);
    });
  }
});

test("every key the new files ask for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/team/roster/fallen-view.mjs", "src/screens/team/roster/panel.mjs", "src/screens/team/roster/view.mjs");
});

test("everything drawn is styled: the three sections, a skipper's row, a fallen row open and a fallen player in the panel", async () => {
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      for (const key of ["fallen-f1", "fallen-f2", "p4#0"]) {
        coach();
        await renderTeamRoster("t1");
        fireEvent(toggle(key), "click");
        assertCspSafe(view);
        assertStyled(view, ...STYLES);
      }
      coach({ teamAnswer: withPlayers(PLAYERS.filter(({ skipNextGame }) => skipNextGame)) });
      await renderTeamRoster("t1");
      assertStyled(view, ...STYLES);
    });
  }
  assert.ok(text("src/styles.css").includes('@import url("screens/team/roster/marks.css");'));
});

test("a section stands 18px under the table before it, as in StatsInjured and DeskRosterInjured: its margin and the column's gap", () => {
  const tokens = tokensOf("grass");
  const px = ([value]) => Number(tokens[value.match(/^var\((--[\w-]+)\)$/)[1]].replace(/px$/, ""));
  const margin = px(valuesOf("src/screens/team/roster/marks.css", ".g-roster__section", "margin-top"));
  const gap = px(valuesOf("src/screens/team/roster/roster.css", ".g-roster__sections", "gap"));
  assert.equal(margin + gap, 18);
  assert.deepEqual(valuesOf("src/screens/team/roster/marks.css", ".g-roster__section:first-child", "margin-top"), ["0"], "the first stays at the top");
  // A desk's one card (DeskRosterInjured.html): the sections touch, the other two led by their band.
  const frame = "src/screens/team/roster/frame.css";
  assert.deepEqual([valuesOf(frame, ".g-roster__sections .g-roster__section", "margin-top"), valuesOf(frame, ".g-roster__sections .g-roster__section", "gap")], [["0"], ["0"]]);
  assert.deepEqual(valuesOf(frame, ".g-roster__sections .g-roster__bar", "padding"), ["18px var(--space-16) var(--space-8)"]);
  assert.deepEqual(valuesOf(frame, ".g-roster__sections .g-roster__heading", "font"), ["700 20px/1.1 var(--font-display)"]);
});

test("the fallen are grey and readable: their cells, the line under the name and the characteristics of the profile", () => {
  const sheet = "src/screens/team/roster/marks.css";
  assert.deepEqual(valuesOf(sheet, ".g-roster__section--fallen .g-rtable__c", "color"), ["var(--muted)"]);
  assertReadable(sheet, ".g-roster__section--fallen .g-rtable__c", "color", ["--surface", "--surface-2", "--page"], 4.5);
  // The line under a fallen name is red, as every absence's (StatsInjured.html): roster-table.css's alert.
  assert.deepEqual(valuesOf(sheet, ".g-roster__section--fallen .g-rtable__sub", "color"), []);
  assertReadable("src/ui/roster-table.css", ".g-rtable__sub--alert", "color", ["--surface", "--surface-2", "--page"], 4.5);
  assertReadable(sheet, ".g-fallen__stats .g-stat__v", "color", ["--surface-2"], 4.5);
  for (const selector of [".g-fallen__when", ".g-fallen__label", ".g-fallen__note", ".g-fallen__rules", ".g-fallen__career", ".g-fallen__rowpanel .g-fallen__career", ".g-fallen__cause--none"]) {
    assertReadable(sheet, selector, "color", ["--surface", "--surface-2"], 4.5);
  }
  assertReadable(sheet, ".g-fallen__cause", "color", ["--surface", "--surface-2"], 4.5);
});

// Stage 07b, Task 7: «Miss a match…» and its sheet of reasons, saved as a step of the roster's queue; «Back on the roster».
const PATCH = "PATCH /api/teams/t1";
const patches = () => api.calls.filter(({ key }) => key === PATCH);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const status = () => view.querySelector(".g-roster__status").textContent;
const markSheet = () => view.querySelector("dialog#roster-mark");
/**
 * A step of the roster's queue from the desk's panel, `who` back on the roster — Edda by default (D3: a desk taps no
 * counter outside a match; «Back on the roster» is a save of the roster as a step was) — then `then` in the panel
 * again for what follows, Ann by default.
 */
const stepOfTheRoster = (then = "p1#0", who = "p5#0") => {
  fireEvent(toggle(who), "click");
  fireEvent(returnButton(), "click");
  if (then) fireEvent(toggle(then), "click");
};
/** «Miss a match…» and «Back on the roster»: the desk panel's by default, or the open row's. */
const markButton = (root = aside()) => root.querySelector("[data-roster-mark]");
const returnButton = (root = aside()) => root.querySelector("[data-roster-return]");
const markOptions = () => markSheet().querySelectorAll('.g-option[role="radio"]');
const markOption = (code) => markOptions().find((card) => card.getAttribute("data-option-value") === code);
const markChips = () => markSheet().querySelectorAll('[data-chip-group="mark-stat"] .g-chip');
const markChip = (stat) => markChips().find((chip) => chip.getAttribute("data-chip-value") === stat);
const markText = () => markSheet().querySelector("#mark-text");
const sendButton = () => markSheet().querySelector("[data-mark-send]");
const effectLine = () => markSheet().querySelector(".g-roster__markeffect");
/** The coach types `value` into the reason's field. */
const typeNote = (value) => {
  const field = markText();
  field.focus();
  field.value = value;
  fireEvent(field, "input");
};
/** Ann's line on the server once her mark has landed. */
const annMarked = (fields) => withPlayers(PLAYERS.map((player) => (player.id === "p1" ? { ...player, skipNextGame: true, ...fields } : player)), { revision: 5 });
const EFFECTS_STAY = "The injury's effect stays: «Back on the roster» only ends the missed match.";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";
const MATCH_DROPPED_MARKS = "A match has begun, so the missed-match marks that were waiting were not saved (1). Make them again after the post-match.";
const MARK_SHEETS = [...STYLES, "option-card.css", "filter-chips.css", "text-field.css"];

test("a playing player's row has «Miss a match…», a skipper's «Back on the roster»; a match draws neither", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    const panel = openRow().querySelector(".g-roster__rowpanel");
    const actions = panel.querySelector(".g-roster__actions");
    assert.ok(actions, "a row of actions in the open row");
    assert.ok(panel.childNodes.indexOf(actions) > panel.childNodes.indexOf(panel.querySelector("a.g-btn")), "under «Profile and advancement»");
    const mark = markButton(openRow());
    assert.equal(mark.textContent, "Miss a match…");
    assert.equal(mark.getAttribute("data-roster-mark"), "p1#0");
    assert.equal(mark.getAttribute("aria-haspopup"), "dialog");
    assert.ok(!mark.hasAttribute("aria-disabled"));
    assert.ok(!returnButton(openRow()));
    fireEvent(toggle("p4#0"), "click");
    const back = returnButton(openRow());
    assert.equal(back.textContent, "Back on the roster");
    assert.equal(back.getAttribute("data-roster-return"), "p4#0");
    assert.ok(!back.hasAttribute("aria-disabled"));
    assert.ok(!markButton(openRow()), "no second mark over the first: he is brought back first");
    assertStyled(view, ...STYLES);
  });
  coach();
  await renderTeamRoster("t1");
  const block = aside().querySelector(".g-roster__nextblock");
  const next = block.querySelector(".g-roster__next");
  const actions = block.querySelector(".g-roster__actions");
  assert.ok(block.childNodes.indexOf(actions) > block.childNodes.indexOf(next), "on a desk under «Next match», in the same block");
  assert.equal(markButton().textContent, "Miss a match…");
  fireEvent(toggle("p7#0"), "click");
  assert.equal(returnButton().textContent, "Back on the roster");
  assert.ok(!markButton());
  // A match on: their place is the match's injury.
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      for (const key of ["p1#0", "p4#0"]) {
        fireEvent(toggle(key), "click");
        assert.ok(!view.querySelector("[data-roster-mark]"));
        assert.ok(!view.querySelector("[data-roster-return]"));
      }
      // The pair holds «Injury in the match…» for one who plays it (StatsLive.html), beside stage 07c's closed «Sell»; for one
      // who sits it out, the closed «Sell» alone (K2).
      const pair = () => view.querySelector(".g-roster__actions").childNodes.filter((node) => node.nodeType === 1).map((button) => button.textContent);
      assert.deepEqual(pair(), ["Sell"], "Dell sits it out");
      fireEvent(toggle("p1#0"), "click");
      assert.deepEqual(pair(), ["Injury in the match…", "Sell"]);
    });
  }
});

test("the sheet: who, the reasons with what each does, and a button that says what it waits for", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(markButton(), "click");
  const dialog = markSheet();
  assert.ok(dialog?.isModal, "the sheet is open, modally");
  assert.equal(dialog.querySelector("h2").textContent, "Missing the next match");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "#1 Ann · Human Lineman");
  assert.equal(dialog.querySelector('[role="radiogroup"]').getAttribute("aria-label"), "Reason");
  assert.deepEqual(markOptions().map((card) => [card.querySelector(".g-option__title").textContent, card.querySelector(".g-option__sub").textContent, card.getAttribute("aria-checked")]), [
    ["Seriously Hurt", "misses the next match", "false"],
    ["Serious Injury", "a Niggling Injury and a missed match", "false"],
    ["Lasting Injury", "−1 to a characteristic and a missed match", "false"],
    ["Dead", "the player leaves the roster", "false"],
    ["Another reason", "The league's or the coach's decision", "false"],
  ]);
  assert.equal(sendButton().textContent, "Choose a reason");
  assert.ok(sendButton().classList.contains("g-btn--primary"));
  assert.ok(sendButton().hasAttribute("disabled"));
  assert.equal(markChips().length, 0);
  assert.ok(!markText());
  fireEvent(markOption("lasting"), "click");
  assert.equal(markSheet().querySelector(".g-roster__injurylabel").textContent, "Which characteristic goes down");
  assert.equal(markSheet().querySelector('[data-chip-group="mark-stat"]').getAttribute("aria-label"), "Which characteristic goes down");
  assert.deepEqual(markChips().map((chip) => [chip.textContent, chip.getAttribute("aria-checked")]), [["MA", "false"], ["ST", "false"], ["AG", "false"], ["PA", "false"], ["AR", "false"]]);
  assert.equal(sendButton().textContent, "Choose a characteristic");
  assert.ok(sendButton().hasAttribute("disabled"));
  fireEvent(markChip("ag"), "click");
  assert.equal(sendButton().textContent, "Mark the missed match");
  assert.equal(sendButton().hasAttribute("disabled"), false);
  fireEvent(markOption("other"), "click");
  assert.equal(markChips().length, 0, "the characteristic is a lasting injury's");
  const field = markText();
  assert.equal(field.getAttribute("name"), "mark-text");
  assert.equal(markSheet().querySelector('label[for="mark-text"]').textContent, "Reason");
  assert.equal(sendButton().textContent, "Write the reason");
  assert.ok(sendButton().hasAttribute("disabled"));
  typeNote("   ");
  assert.equal(sendButton().textContent, "Write the reason");
  typeNote("x".repeat(501));
  assert.equal(sendButton().textContent, "No longer than 500 characters");
  assert.ok(sendButton().hasAttribute("disabled"));
  typeNote(` ${"x".repeat(500)} `);
  assert.equal(sendButton().textContent, "Mark the missed match", "counted as the server counts it: trimmed");
  // K9: a NUL the database refuses would hang the queue; it is no reason, nor is half of an emoji.
  for (const broken of ["Wed\u0000ding", "Wedding \ud83d"]) {
    typeNote(broken);
    assert.equal(sendButton().textContent, "Write the reason", JSON.stringify(broken));
    assert.ok(sendButton().hasAttribute("disabled"));
  }
  typeNote("Wedding 💍");
  assert.equal(sendButton().textContent, "Mark the missed match", "a whole emoji is words like any");
  typeNote("Wedding");
  assert.equal(sendButton().textContent, "Mark the missed match");
  assert.ok(markText() === field, "the field the coach types in is kept through the redraws");
  assert.ok(document.activeElement === field);
  assert.ok(markSheet()?.isModal);
  assertCspSafe(view);
  assertStyled(view, ...MARK_SHEETS);
  fireEvent(markOption("lasting"), "click");
  assert.equal(markChip("ag").getAttribute("aria-checked"), "true", "the choice is kept while the sheet is open");
  fireEvent(markSheet(), "keydown", { key: "Escape" });
  assert.ok(!markSheet());
  assert.ok(document.activeElement === markButton(), "closed, the focus is back on «Miss a match…»");
  assert.equal(patches().length, 0);
  fireEvent(markButton(), "click");
  assert.equal(markOption("lasting").getAttribute("aria-checked"), "false", "opened again, it starts afresh");
});

test("a missed match marked: one PATCH, the sheet closes, he moves to «Missing the match» with his reason, the focus on his row's button", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    markButton().focus();
    fireEvent(markButton(), "click");
    fireEvent(markOption("lasting"), "click");
    fireEvent(markChip("ag"), "click");
    api.reply(PATCH, 200, { team: annMarked({ absence: { code: "lasting", stat: "ag" }, statMods: { ag: -1 }, injuryStatMods: { ag: -1 } }) });
    fireEvent(sendButton(), "click");
    assert.ok(!markSheet(), "closed at once: the step is the queue's");
    assert.equal(subOf("p1#0").textContent, "Lasting Injury (AG)", "drawn at once from the queue's draft");
    assert.ok(document.activeElement === toggle("p1#0"), "the focus on his row's button");
    await settle();
    assert.equal(patches().length, 1);
    const { body } = patches()[0];
    assert.equal(body.revision, 4);
    const ann = body.roster.players.find((player) => player.id === "p1");
    assert.equal(ann.skipNextGame, true);
    assert.deepEqual(ann.absence, { code: "lasting", stat: "ag" });
    assert.equal(ann.statMods.ag, -1);
    assert.match(headingText("roster-heading"), /^Active roster 2$/);
    assert.match(headingText("roster-skips-heading"), /^Missing the match 5$/);
    assert.deepEqual(tables().map(namesIn).slice(0, 2), [["Bors", "Cade"], ["Ann", "Dell", "Edda", "Finn", "Grom"]]);
    assert.equal(subOf("p1#0").textContent, "Lasting Injury (AG)");
    assert.ok(subOf("p1#0").classList.contains("g-rtable__sub--alert"));
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "the panel keeps him");
    assert.equal(nextLine(), "Next match: Lasting Injury (AG) · sits it out");
    assert.equal(returnButton().textContent, "Back on the roster");
    assert.equal(status(), "Saved");
    api.assertAnswered();
  });
});

test("the injury's effect is said before it is done", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(markButton(), "click");
  assert.ok(!effectLine());
  for (const [code, said] of [["miss", false], ["niggling", true], ["lasting", true], ["other", false]]) {
    fireEvent(markOption(code), "click");
    assert.equal(effectLine()?.textContent ?? null, said ? EFFECTS_STAY : null, code);
  }
});

test("back on the roster: one PATCH, he plays the next match again", async () => {
  await withWindow({ phone: true }, async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      fireEvent(toggle("p4#0"), "click");
      const back = returnButton(openRow());
      back.focus();
      api.reply(PATCH, 200, { team: withPlayers(PLAYERS.map((player) => (player.id === "p4" ? { ...player, skipNextGame: false, absence: null } : player)), { revision: 5 }) });
      fireEvent(back, "click");
      assert.deepEqual(tables().map(namesIn).slice(0, 2), [["Ann", "Bors", "Cade", "Dell"], ["Edda", "Finn", "Grom"]], "drawn at once");
      assert.equal(subOf("p4#0").textContent, "Human Lineman");
      assert.ok(document.activeElement === toggle("p4#0"), "the focus on his row's button, in its new place");
      assert.equal(markButton(openRow()).textContent, "Miss a match…", "his row stays open, with the mark");
      await settle();
      assert.equal(patches().length, 1);
      const dell = patches()[0].body.roster.players.find((player) => player.id === "p4");
      assert.deepEqual([dell.skipNextGame, dell.absence], [false, null]);
      assert.equal(dell.statMods.ma, -1, "what the injury did stays");
      assert.match(headingText("roster-heading"), /^Active roster 4$/);
      assert.match(headingText("roster-skips-heading"), /^Missing the match 3$/);
      api.assertAnswered();
    });
  });
});

test("a player retired for the season cannot be brought back here, and says why", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p6#0"), "click");
    const back = returnButton();
    assert.equal(back.textContent, "Back on the roster");
    assert.equal(back.getAttribute("aria-disabled"), "true");
    assert.equal(back.getAttribute("title"), "Retired for the season: he cannot be brought back here.");
    assert.ok(back.classList.contains("g-roster__closed"));
    assert.ok(!markButton(), "nor is a mark laid over his");
    fireEvent(back, "click");
    assert.equal(toasts().at(-1), "Retired for the season: he cannot be brought back here.");
    assert.equal(toasts().filter((said) => said === "Retired for the season: he cannot be brought back here.").length, 1, "said once");
    await settle();
    assert.equal(patches().length, 0);
    assert.match(headingText("roster-skips-heading"), /^Missing the match 4$/);
  });
});

test("closed while the games are unread, the roster is read or a conflict waits", async () => {
  await withoutTimers(async () => {
    coach();
    const games = api.hold("GET /api/games");
    const drawing = renderTeamRoster("t1");
    await settle();
    assert.equal(markButton().getAttribute("aria-disabled"), "true");
    assert.equal(markButton().getAttribute("title"), "Loading the matches…");
    fireEvent(markButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    assert.ok(!markSheet());
    fireEvent(toggle("p4#0"), "click");
    assert.equal(returnButton().getAttribute("aria-disabled"), "true");
    assert.equal(returnButton().getAttribute("title"), "Loading the matches…");
    fireEvent(returnButton(), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    games.release();
    await drawing;
    await settle();
    assert.equal(patches().length, 0);
    // A conflict lands while the sheet is open: its button says so, and a press sends nothing.
    const step = api.hold(PATCH);
    stepOfTheRoster();
    await settle();
    assert.equal(step.count, 1);
    fireEvent(markButton(), "click");
    fireEvent(markOption("miss"), "click");
    assert.equal(sendButton().hasAttribute("disabled"), false);
    step.release({ status: 409, body: { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: team({ revision: 6 }) } });
    await settle();
    assert.ok(markSheet()?.isModal, "the sheet stays: the coach settles the conflict");
    assert.equal(sendButton().getAttribute("aria-disabled"), "true");
    assert.equal(sendButton().getAttribute("title"), "The roster was changed on another device");
    assert.equal(sendButton().hasAttribute("disabled"), false, "in reach, to say why");
    fireEvent(sendButton(), "click");
    assert.equal(toasts().at(-1), "The roster was changed on another device");
    fireEvent(markSheet().querySelector("[data-sheet-close]"), "click");
    assert.ok(!markSheet());
    assert.equal(markButton().getAttribute("title"), "The roster was changed on another device");
    await settle();
    assert.equal(patches().length, 1, "the step that met the conflict, and no mark");
  });
  // A match ended elsewhere: until the roster it left is read, nothing is marked.
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    const read = api.hold("GET /api/teams/t1");
    await invalidateGames();
    await settle();
    assert.equal(markButton().getAttribute("aria-disabled"), "true");
    assert.equal(markButton().getAttribute("title"), "Reading the records…");
    fireEvent(markButton(), "click");
    assert.equal(toasts().at(-1), "Reading the records…");
    assert.ok(!markSheet());
    read.release();
    await settle();
    assert.ok(!markButton().hasAttribute("aria-disabled"));
    assert.equal(patches().length, 0);
  });
  // A player the roster stores no id for: no write can name him.
  coach({ teamAnswer: withPlayers([{ rowIndex: 0, number: "1", name: "Nobody" }]), fallen: [] });
  await renderTeamRoster("t1");
  assert.equal(markButton().getAttribute("aria-disabled"), "true");
  assert.equal(markButton().getAttribute("title"), "This player has no id in the roster, so nothing can be marked. Ask the league administrator to fix the roster.");
});

test("another tab's coach: no mark is sent, and the coach is told", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(markButton(), "click");
    fireEvent(markOption("miss"), "click");
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(sendButton(), "click");
    const refusal = markSheet().querySelector(".g-roster__markrefusal");
    assert.equal(refusal.textContent, OTHER_TAB);
    assert.equal(refusal.getAttribute("role"), "alert");
    assert.ok(markSheet()?.isModal, "the sheet stays, the choice in it");
    assert.equal(markOption("miss").getAttribute("aria-checked"), "true");
    assert.equal(subOf("p1#0").textContent, "Human Lineman", "nothing marked");
    fireEvent(markOption("niggling"), "click");
    assert.ok(!markSheet().querySelector(".g-roster__markrefusal"), "a refusal goes with the choice it was said of");
    fireEvent(markSheet().querySelector("[data-sheet-close]"), "click");
    fireEvent(toggle("p4#0"), "click");
    fireEvent(returnButton(), "click");
    assert.equal(toasts().at(-1), OTHER_TAB);
    await settle();
    assert.equal(patches().length, 0);
    assert.equal(subOf("p4#0").textContent, "Lasting Injury (MA)");
  });
});

test("one press, one save: «Mark the missed match» and «Back on the roster» pressed twice send one PATCH each", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(markButton(), "click");
    fireEvent(markOption("miss"), "click");
    const send = sendButton();
    api.reply(PATCH, 200, { team: annMarked({ absence: { code: "miss" } }) });
    fireEvent(send, "click");
    fireEvent(send, "click");
    await settle();
    assert.equal(patches().length, 1);
    fireEvent(toggle("p4#0"), "click");
    const back = returnButton();
    api.reply(PATCH, 200, { team: annMarked({ absence: { code: "miss" } }) });
    fireEvent(back, "click");
    fireEvent(back, "click");
    await settle();
    assert.equal(patches().length, 2);
    assert.deepEqual(patches()[1].body.roster.players.find((player) => player.id === "p4").skipNextGame, false);
    assert.ok(!markSheet(), "the second press is not taken for «Miss a match…» drawn where «Back on the roster» was");
    assert.equal(markButton().textContent, "Miss a match…");
  });
});

// 07a's c088324: after a 422 whose read of the server's roster failed, a press must not only say the rule again.
test("a mark or a return refused after a 422 whose read failed reads the roster again; once it is read, the mark saves", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
    api.fail("GET /api/teams/t1");
    stepOfTheRoster();
    await settle();
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"], "the read after the refusal failed");
    const reads = () => api.calls.filter(({ key }) => key === "GET /api/teams/t1").length;
    const before = reads();
    fireEvent(toggle("p4#0"), "click");
    fireEvent(returnButton(), "click");
    assert.match(toasts().at(-1), /Ann/, "the rule that refused the queue");
    await settle();
    assert.equal(reads(), before + 1, "and the roster is read again");
    fireEvent(toggle("p1#0"), "click");
    fireEvent(markButton(), "click");
    fireEvent(markOption("miss"), "click");
    fireEvent(sendButton(), "click");
    const refusal = markSheet().querySelector(".g-roster__markrefusal");
    assert.match(refusal.textContent, /Ann/, "said in the sheet");
    assert.equal(refusal.getAttribute("role"), "alert");
    await settle();
    assert.equal(reads(), before + 2, "a mark's press reads it again too");
    assert.equal(patches().length, 1, "the refused step, and no mark");
    // The network is back: the press reads the server's roster, and the next one saves on it.
    api.reply("GET /api/teams/t1", 200, { team: team({ revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(reads(), before + 3);
    assert.equal(save.saveState("t1").status, "idle", "the server's roster taken");
    assert.ok(markSheet()?.isModal, "the sheet stays for the coach to press again");
    api.reply(PATCH, 200, { team: annMarked({ absence: { code: "miss" } }) });
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(patches().length, 2);
    assert.equal(patches()[1].body.revision, 5);
    assert.deepEqual(patches()[1].body.roster.players.find((player) => player.id === "p1").absence, { code: "miss" });
    assert.ok(!markSheet());
  });
});

test("a sheet whose match began closes, and the focus goes back to the row", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    markButton().focus();
    fireEvent(markButton(), "click");
    fireEvent(markOption("miss"), "click");
    markOption("miss").focus();
    gamesAre([LIVE_GAME]);
    await loadGames(true);
    await settle();
    assert.ok(!markSheet(), "a mark's place in a match is the match's injury");
    assert.ok(!view.querySelector("dialog:modal"));
    assert.ok(document.activeElement === toggle("p1#0"), "his row's button, where the keyboard was");
    assert.equal(patches().length, 0);
  });
});

test("a mark offline waits like a step: «Waiting for the network · edits: 1»", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(markButton(), "click");
    fireEvent(markOption("other"), "click");
    typeNote("Wedding");
    fireEvent(sendButton(), "click");
    await settle();
    assert.ok(!markSheet());
    assert.equal(status(), "Waiting for the network · edits: 1");
    assert.equal(subOf("p1#0").textContent, "Wedding", "the mark stays on the screen");
    assert.equal(save.saveState("t1").waiting, 1);
    assert.deepEqual(patches()[0].body.roster.players.find((player) => player.id === "p1").absence, { code: "other", note: "Wedding" });
    api.reply(PATCH, 200, { team: annMarked({ absence: { code: "other", note: "Wedding" } }) });
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(status(), "Saved");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(subOf("p1#0").textContent, "Wedding");
  });
});

test("a mark that waited for the network is given up when a match begins, and the coach is told how many", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(markButton(), "click");
    fireEvent(markOption("niggling"), "click");
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    api.reply("GET /api/teams/t1", 200, { team: team({ revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    assert.equal(toasts().at(-1), MATCH_DROPPED_MARKS);
    assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
    assert.ok(!toasts().some((said) => said.startsWith("A match has begun, so the edits")), "no SPP step was given up");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(patches().length, 1, "the one try before the network went");
    assert.deepEqual(tables()[0] && namesIn(tables()[0]), ["Ann", "Bors", "Cade"], "the server's roster: Ann plays");
    assert.equal(subOf("p1#0").textContent, "Human Lineman");
  });
  // A step of SPP and a mark waited: each is counted in its own words. A phone's open row has both (D3).
  await withWindow({ phone: true }, async () => withoutTimers(async () => {
    coach({ open: "p1#0" });
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(openRow().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]'), "click");
    await settle();
    fireEvent(markButton(openRow()), "click");
    fireEvent(markOption("miss"), "click");
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 2);
    api.reply("GET /api/teams/t1", 200, { team: team({ revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    assert.deepEqual(toasts().slice(-2), ["A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.", MATCH_DROPPED_MARKS]);
    assert.equal(save.saveState("t1").waiting, 0);
  }));
});

test("the option lists of two sheets do not answer for each other", async () => {
  await withoutTimers(async () => {
    // The injury's sheet in a match still takes its injury and its characteristic.
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(aside().querySelector("[data-roster-injury]"), "click");
    const injury = () => view.querySelector("dialog#roster-injury");
    const injuryOption = (code) => injury().querySelectorAll(".g-option").find((card) => card.getAttribute("data-option-value") === code);
    fireEvent(injuryOption("lasting"), "click");
    assert.equal(injuryOption("lasting").getAttribute("aria-checked"), "true");
    const chip = injury().querySelectorAll('[data-chip-group="injury-stat"] .g-chip').find((item) => item.getAttribute("data-chip-value") === "st");
    fireEvent(chip, "click");
    assert.equal(injury().querySelector('[data-injury-step="1"]').hasAttribute("disabled"), false, "a whole injury chosen");
    assert.ok(!markSheet());
    // The mark's sheet outside one takes its own.
    coach();
    await renderTeamRoster("t1");
    fireEvent(markButton(), "click");
    fireEvent(markOption("lasting"), "click");
    fireEvent(markChip("pa"), "click");
    assert.equal(markOption("lasting").getAttribute("aria-checked"), "true");
    assert.equal(sendButton().textContent, "Mark the missed match");
    api.reply(PATCH, 200, { team: annMarked({ absence: { code: "lasting", stat: "pa" } }) });
    fireEvent(sendButton(), "click");
    await settle();
    assert.deepEqual(patches()[0].body.roster.players.find((player) => player.id === "p1").absence, { code: "lasting", stat: "pa" });
  });
});

test("every key the marks ask for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/team/roster/mark-sheet.mjs", "src/screens/team/roster/marks.mjs", "src/screens/team/roster/panel.mjs", "src/screens/team/roster/sheets.mjs");
});

test("the pair of actions: two columns, the second stage 07c's «Sell»; a thumb tall on a phone, 40px on a desk (D2); the sheet's refusal and the injury's effect readable", () => {
  const sheet = "src/screens/team/roster/marks.css";
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions", "display"), ["grid"]);
  // Two columns while a half holds an action on one line, one in a narrower place; auto-fill keeps «Sell»'s empty column.
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions", "grid-template-columns"), ["repeat(auto-fill, minmax(max(150px, calc((100% - var(--space-8)) / 2)), 1fr))"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions", "gap"), ["var(--space-8)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions > .g-btn", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf("src/screens/team/roster/frame.css", ".g-roster__actions > .g-btn", "min-height"), ["40px"]);
  // A label too long for its half (the owner's «Injury in the match…» beside «Sell» at 390 and 360px) wraps to two
  // balanced lines, centred (button.css), 4px clear of the edges, in a button that keeps its 44px; the grid stretches
  // both halves to the taller one, so the pair stays level. Nothing holds it on one line.
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions", "align-items"), ["stretch"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions > .g-btn", "padding"), ["var(--space-4) var(--space-10)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__actions > .g-btn", "text-wrap"), ["balance"]);
  assert.deepEqual([valuesOf("src/ui/button.css", ".g-btn", "text-align"), valuesOf("src/ui/button.css", ".g-btn", "justify-content")], [["center"], ["center"]]);
  for (const property of ["white-space", "text-overflow", "overflow"]) {
    for (const file of [sheet, "src/screens/team/roster/frame.css", "src/screens/team/roster/market.css", "src/ui/button.css"]) {
      for (const selector of [".g-roster__actions", ".g-roster__actions > .g-btn", ".g-btn"]) assert.deepEqual(valuesOf(file, selector, property), [], `${file} ${selector} ${property}`);
    }
  }
  assert.deepEqual([valuesOf(sheet, ".g-roster__actions", "font"), valuesOf(sheet, ".g-roster__actions", "letter-spacing"), valuesOf(sheet, ".g-roster__actions", "text-transform")],
    [["600 14px/1.2 var(--font-body)"], ["0"], ["none"]]);
  for (const selector of [".g-roster__markrefusal", ".g-roster__markeffect"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background"), valuesOf(sheet, selector, "text-transform")], [["0"], ["none"], ["none"]], selector);
    assert.equal(valuesOf(sheet, selector, "font").length, 1, selector);
    assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  }
});

// Stage 07b, Task 8: «Dead» in the mark's sheet, with its cause, sent once through stage 03's route (`POST …/death`); its
// answer taken into the queue and the coach's list without ever giving up a step of the roster that waits (K7, K8).
const DEATH = "POST /api/teams/t1/players/p1/death";
const TEAM_READ = "GET /api/teams/t1";
const FALLEN_READ = "GET /api/teams/t1/fallen";
const deaths = () => api.calls.filter(({ key }) => key === DEATH);
const teamReads = () => api.calls.filter(({ key }) => key === TEAM_READ).length;
/** The team on the server once Ann has died: rev 5 by default, without her. */
const withoutAnn = (over = {}) => withPlayers(PLAYERS.filter((player) => player.id !== "p1"), { revision: 5, ...over });
/** The record of Ann's death as the server answers it and reads it back. */
const annFell = () => died("f9", { ...PLAYERS[0] }, { cause: "Foul", diedAt: "2026-10-19T10:00:00Z" });
/** The server holds `roster` and `fallen` when the screen reads them again. */
const serverHolds = (roster, fallen) => {
  api.reply(TEAM_READ, 200, { team: roster });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: roster.revision });
  api.reply(FALLEN_READ, 200, { fallen });
};
/** Ann's sheet open, «Dead» chosen, `cause` written. */
const chooseDeath = (cause = "Foul") => {
  fireEvent(markButton(), "click");
  fireEvent(markOption("dead"), "click");
  typeNote(cause);
};
const DEAD_DONE = "Ann: the death is marked";
const DEAD_LOST = "The death is not on the server: mark it again.";
const UNKNOWN = "Could not tell what the server holds: look at the roster before you mark the death again.";
const CHANGED = "The roster was changed on another device and has been read again. The death was not marked: press again.";
const WAIT_SAVE = "Wait until your edits are saved";
const WRITING = "Saving the mark…";

test("«Dead» asks for a cause; the button waits for it, then says «Mark the death»", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(markButton(), "click");
  assert.deepEqual(markOptions().map((card) => [card.getAttribute("data-option-value"), card.querySelector(".g-option__title").textContent, card.querySelector(".g-option__sub").textContent]), [
    ["miss", "Seriously Hurt", "misses the next match"],
    ["niggling", "Serious Injury", "a Niggling Injury and a missed match"],
    ["lasting", "Lasting Injury", "−1 to a characteristic and a missed match"],
    ["dead", "Dead", "the player leaves the roster"],
    ["other", "Another reason", "The league's or the coach's decision"],
  ]);
  fireEvent(markOption("dead"), "click");
  const field = markText();
  assert.ok(field, "a field for the cause");
  assert.equal(field.getAttribute("name"), "mark-text");
  assert.equal(markSheet().querySelector('label[for="mark-text"]').textContent, "Cause of death");
  assert.equal(markSheet().querySelector("#mark-text-help").textContent, "Seen on the roster and in the team's history. The player moves to «Fallen».");
  assert.equal(field.getAttribute("aria-describedby"), "mark-text-help");
  assert.ok(!effectLine(), "a death has no injury's effect to stay");
  assert.equal(markChips().length, 0);
  assert.equal(sendButton().textContent, "Write the cause of death");
  assert.ok(sendButton().hasAttribute("disabled"));
  typeNote("   ");
  assert.equal(sendButton().textContent, "Write the cause of death");
  typeNote("x".repeat(501));
  assert.equal(sendButton().textContent, "No longer than 500 characters");
  assert.ok(sendButton().hasAttribute("disabled"));
  typeNote(` ${"x".repeat(500)} `);
  assert.equal(sendButton().textContent, "Mark the death", "counted as the server counts a cause: trimmed");
  // The server refuses a NUL in a cause (checkCause); half of an emoji is no words either.
  for (const broken of ["Fo\u0000ul", "Foul \ud83d"]) {
    typeNote(broken);
    assert.equal(sendButton().textContent, "Write the cause of death", JSON.stringify(broken));
    assert.ok(sendButton().hasAttribute("disabled"));
  }
  typeNote("Foul");
  assert.equal(sendButton().textContent, "Mark the death");
  assert.equal(sendButton().hasAttribute("disabled"), false);
  assert.ok(markText() === field, "the field is kept through the redraws");
  assertCspSafe(view);
  assertStyled(view, ...MARK_SHEETS);
  // The words are the reason's too, as typed: «Another reason» asks for them under its own label.
  fireEvent(markOption("other"), "click");
  assert.equal(markSheet().querySelector('label[for="mark-text"]').textContent, "Reason");
  assert.equal(sendButton().textContent, "Mark the missed match");
  fireEvent(markOption("dead"), "click");
  assert.equal(sendButton().textContent, "Mark the death");
  assert.equal(deaths().length, 0);
  assert.equal(patches().length, 0);
});

test("a death marked: one POST with the cause and the revision; he moves to «Fallen», the panel and the list take the server's team; the coach is told", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    chooseDeath("  Foul  ");
    api.reply(DEATH, 201, { team: withoutAnn(), fallen: annFell() });
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(deaths().length, 1);
    assert.deepEqual(deaths()[0].body, { cause: "Foul", revision: 4 });
    assert.ok(!markSheet(), "the sheet closes");
    assert.deepEqual(tables().map(namesIn), [["Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Ann", "Pike", "Joe"]]);
    assert.match(headingText("roster-heading"), /^Active roster 2$/);
    assert.match(headingText("roster-fallen-heading"), /^Fallen 3$/);
    assert.equal(subOf("fallen-f9").textContent, "Fallen · Foul");
    assert.ok(view.querySelector('.g-roster__aside[data-panel-player="fallen-f9"]'), "the panel is his profile now");
    assert.equal(state.myTeams.items[0].revision, 5, "the coach's list has the server's team");
    assert.equal(save.savedRevision("t1"), 5, "and so has the queue");
    assert.equal(toasts().at(-1), DEAD_DONE);
    assert.ok(document.activeElement === toggle("fallen-f9"), "the focus on his row in «Fallen»");
    assert.equal(teamReads(), 1, "the answer is taken as it is: nothing is read again");
    // The next step goes on the revision the death came back with.
    api.reply(PATCH, 200, { team: withoutAnn({ revision: 6 }) });
    stepOfTheRoster(null);
    await settle();
    assert.equal(patches().length, 1);
    assert.equal(patches()[0].body.revision, 5);
    assert.ok(!patches()[0].body.roster.players.some((player) => player.id === "p1"), "the roster without her");
    api.assertAnswered();
  });
});

// Review Focus 2 and the T3 review's carry (a): a death moves the revision under a step that waits.
test("while steps of the roster wait or one is in the air, no death is sent and the button says why", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const step = api.hold(PATCH);
    stepOfTheRoster();
    await settle();
    assert.equal(step.count, 1, "a step in the air");
    chooseDeath();
    assert.equal(sendButton().textContent, "Mark the death");
    assert.equal(sendButton().getAttribute("aria-disabled"), "true");
    assert.equal(sendButton().getAttribute("title"), WAIT_SAVE);
    assert.equal(sendButton().hasAttribute("disabled"), false, "in reach, to say why");
    fireEvent(sendButton(), "click");
    assert.equal(toasts().at(-1), WAIT_SAVE);
    fireEvent(markOption("miss"), "click");
    assert.ok(!sendButton().hasAttribute("aria-disabled"), "a missed match is a step of the queue: it waits its turn");
    fireEvent(markOption("dead"), "click");
    step.release({ status: 200, body: { team: team({ revision: 5 }) } });
    await settle();
    assert.ok(!sendButton().hasAttribute("aria-disabled"), "saved: the death may go");
    fireEvent(markSheet().querySelector("[data-sheet-close]"), "click");
    // A step that waits for the network: Grom back on the roster.
    api.fail(PATCH);
    stepOfTheRoster("p1#0", "p7#0");
    await settle();
    assert.equal(status(), "Waiting for the network · edits: 1");
    chooseDeath();
    assert.equal(sendButton().getAttribute("aria-disabled"), "true");
    assert.equal(sendButton().getAttribute("title"), WAIT_SAVE);
    fireEvent(sendButton(), "click");
    assert.equal(toasts().at(-1), WAIT_SAVE);
    await settle();
    assert.equal(deaths().length, 0);
  });
  // The queue waits for the coach to settle another device's save, or for the server's roster after a 422.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const step = api.hold(PATCH);
    stepOfTheRoster();
    await settle();
    chooseDeath();
    step.release({ status: 409, body: { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: team({ revision: 6 }) } });
    await settle();
    assert.ok(markSheet()?.isModal);
    assert.equal(sendButton().getAttribute("title"), "The roster was changed on another device");
    fireEvent(sendButton(), "click");
    assert.equal(toasts().at(-1), "The roster was changed on another device");
    await settle();
    assert.equal(deaths().length, 0);
    coach();
    await renderTeamRoster("t1");
    api.reply(PATCH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }] });
    api.fail(TEAM_READ);
    stepOfTheRoster();
    await settle();
    assert.deepEqual([save.saveState("t1").status, save.saveState("t1").kind], ["error", "invalid"]);
    const before = teamReads();
    chooseDeath();
    assert.equal(sendButton().getAttribute("title"), WAIT_SAVE);
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(deaths().length, 0);
    assert.equal(teamReads(), before + 1, "the press asks for the server's roster again, as a mark's does (07a, c088324)");
  });
});

// The T3 review's carry (b) and K8: nothing of the roster's is written while a death is on its way, and its answer is
// taken whatever has become of the sheet.
test("while a death is on its way every step and mark waits, and a second press sends nothing; the sheet closed meanwhile, its answer is still taken", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(death.count, 1, "one POST");
    assert.equal(sendButton().getAttribute("aria-busy"), "true", "busy with it");
    assert.ok(!sendButton().hasAttribute("disabled"), "not disabled: a focused button that is drops the focus");
    assert.equal(markText().hasAttribute("readonly"), true, "the cause is not typed over while it goes");
    fireEvent(markOption("miss"), "click");
    assert.equal(markOption("dead").getAttribute("aria-checked"), "true", "nor is the reason changed");
    assert.equal(markOption("miss").getAttribute("aria-checked"), "false");
    fireEvent(markSheet(), "keydown", { key: "Escape" });
    assert.ok(!markSheet(), "the coach may close the sheet");
    // A desk's panel taps no counter outside a match (D3): its mark and its return say it.
    assert.equal(markButton().getAttribute("title"), WRITING);
    fireEvent(markButton(), "click");
    assert.ok(!markSheet());
    fireEvent(toggle("p4#0"), "click");
    assert.equal(returnButton().getAttribute("title"), WRITING);
    fireEvent(returnButton(), "click");
    assert.equal(toasts().at(-1), WRITING);
    await settle();
    assert.equal(patches().length, 0);
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell() } });
    await settle();
    assert.deepEqual(namesIn(tables()[2]), ["Ann", "Pike", "Joe"], "taken though the sheet was closed");
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(save.savedRevision("t1"), 5);
    assert.equal(toasts().at(-1), DEAD_DONE, "told in a message, the sheet being gone");
    assert.notEqual(aside().getAttribute("data-panel-player"), "fallen-f9", "the panel is not taken from where the coach put it");
    assert.ok(!returnButton().hasAttribute("aria-disabled"), "open again once it has answered");
    assert.equal(deaths().length, 1);
  });
  // The coach left the roster: the list takes the answer all the same; the queue, which no visit draws now, is left as
  // it was (final review, I1), and the next visit reads the team, the death in it.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    releaseCurrentScreen();
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 5);
    assert.equal(save.savedRevision("t1"), 4, "the queue is left as it was");
    assert.ok(!toasts().includes(DEAD_DONE));
    serverHolds(withoutAnn(), [annFell(), ...FALLEN]);
    await renderTeamRoster("t1");
    assert.equal(save.savedRevision("t1"), 5, "the next visit reads the team");
    assert.deepEqual(tables().map(namesIn), [["Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Ann", "Pike", "Joe"]]);
  });
});

// The final review's Important 1: the answer lands after the coach has left the roster and opened it again (a language
// switch draws it again too). The visit that sent it is gone, so the list alone takes the answer; the visit on the
// screen draws the queue's draft and reads the team again once the list is ahead of what the queue saves on (`followList`).
test("a death's answer that lands under another visit of the roster: the visit draws what it saves, and reads the team again when the list is ahead", async () => {
  const eddaPlays = () => namesIn(tables()[0]).includes("Edda");
  const leaveAndDie = async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    releaseCurrentScreen();
    return death;
  };
  // The new visit read the team after the death landed: the answer moves nothing, and a step is drawn as it is saved.
  await withoutTimers(async () => {
    const death = await leaveAndDie();
    serverHolds(withoutAnn(), [annFell(), ...FALLEN]);
    await renderTeamRoster("t1");
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell() } });
    await settle();
    assert.deepEqual([save.savedRevision("t1"), state.myTeams.items[0].revision], [5, 5]);
    assert.equal(eddaPlays(), false);
    api.reply(PATCH, 200, { team: withoutAnn({ revision: 6 }) });
    stepOfTheRoster(null);
    assert.equal(eddaPlays(), true, "the step is drawn: the screen draws the draft the queue saves");
    await settle();
    assert.equal(patches().at(-1).body.revision, 5);
    assert.equal(patches().at(-1).body.roster.players.find((player) => player.id === "p5").skipNextGame, false);
    assert.equal(teamReads(), 2, "nothing is read again: the visit has the death");
  });
  // The new visit read the team before the death landed: the answer puts the list ahead of the queue, the team is read
  // again, and Ann is among the fallen — never a dead player drawn with counters and «Miss a match…».
  await withoutTimers(async () => {
    const death = await leaveAndDie();
    await renderTeamRoster("t1");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"]);
    serverHolds(withoutAnn(), [annFell(), ...FALLEN]);
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell() } });
    await settle(12);
    assert.equal(teamReads(), 3, "read again");
    assert.deepEqual(tables().map(namesIn), [["Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Ann", "Pike", "Joe"]]);
    assert.equal(save.savedRevision("t1"), 5);
    api.reply(PATCH, 200, { team: withoutAnn({ revision: 6 }) });
    stepOfTheRoster(null);
    assert.equal(eddaPlays(), true);
    await settle();
    assert.equal(patches().at(-1).body.revision, 5);
    api.assertAnswered();
  });
});

// The final review's row keys (T8): a line's key is his id and how many before him share it, not his place — a death,
// which takes a place out of the roster, re-keys nobody after it.
test("a death re-keys nobody: the players after her keep their keys, the open row its player and his «+N SPP»", async () => {
  const keysOf = (table) => table.querySelectorAll("tbody.g-rtable__player").map((body) => body.getAttribute("data-key"));
  const delta = () => openRow().querySelector(".g-roster__sppdelta").textContent;
  const withCade = (players) => players.map((player) => (player.id === "p3" ? { ...player, spp: { touchdowns: 1 } } : player));
  // On a phone: Cade's row has his counters and his «+N SPP» outside a match (D3: a desk's panel has none then).
  await withWindow({ phone: true }, async () => withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const [annKey, , cadeKey] = keysOf(tables()[0]);
    const later = [...keysOf(tables()[0]).slice(1), ...keysOf(tables()[1])];
    fireEvent(toggle(cadeKey), "click");
    api.reply(PATCH, 200, { team: withPlayers(withCade(PLAYERS), { revision: 5 }) });
    fireEvent(openRow().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]'), "click");
    await settle();
    assert.equal(delta(), "+3 SPP");
    fireEvent(toggle(annKey), "click");
    fireEvent(markButton(openRow()), "click");
    fireEvent(markOption("dead"), "click");
    typeNote("Foul");
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    fireEvent(markSheet(), "keydown", { key: "Escape" });
    fireEvent(toggle(cadeKey), "click");
    death.release({ status: 201, body: { team: withPlayers(withCade(PLAYERS.filter((player) => player.id !== "p1")), { revision: 6 }), fallen: annFell() } });
    await settle();
    assert.deepEqual(namesIn(tables()[2]), ["Ann", "Pike", "Joe"]);
    assert.deepEqual([...keysOf(tables()[0]), ...keysOf(tables()[1])], later, "the players after her keep their keys");
    assert.ok(bodyOf(cadeKey).classList.contains("is-expanded"), "the open row stays Cade's");
    assert.equal(delta(), "+3 SPP", "and his SPP since the screen opened");
  }));
});

// The T3 review's carry (c) and (d): a step no screen press can make now (K7), but the queue can hold one.
test("a death's answer that meets a step of the roster waiting keeps the step: the list takes the team, the queue keeps its draft", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    api.fail(PATCH);
    assert.deepEqual(save.stepSpp("t1", "p2", "touchdowns", 1), { ok: true });
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    const reads = teamReads();
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell() } });
    await settle();
    assert.equal(save.saveState("t1").waiting, 1, "the step still waits");
    assert.equal(save.savedRevision("t1"), 4, "on the revision it was taken on");
    assert.equal(state.myTeams.items[0].revision, 5, "the list has the answer");
    assert.equal(teamReads(), reads, "no read whose taking would give the step up");
    // The step meets the death as another device's save, which the coach settles.
    api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: withoutAnn() });
    page.dispatchEvent(new Event("online"));
    await settle();
    const sent = patches().at(-1).body;
    assert.equal(sent.revision, 4);
    assert.equal(sent.roster.players.find((player) => player.id === "p2").spp.touchdowns, 1, "the step went, as it was taken");
    assert.equal(save.saveState("t1").status, "conflict");
    assert.equal(status(), "Not saved");
  });
});

// Review Focus 1, the T3 review's carry (e), K15.
test("a death whose answer was lost: the sheet closes, the roster and the fallen are read, and the coach is told what the server holds", async () => {
  const cases = [
    ["landed", { fail: true }, withoutAnn(), [annFell(), ...FALLEN], DEAD_DONE],
    ["not landed", { fail: true }, team(), FALLEN, DEAD_LOST],
    ["a 2xx without the team", { body: {} }, withoutAnn(), [annFell(), ...FALLEN], DEAD_DONE],
  ];
  for (const [label, answer, roster, fallen, said] of cases) {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      chooseDeath();
      if (answer.fail) api.fail(DEATH);
      else api.reply(DEATH, 201, answer.body);
      serverHolds(roster, fallen);
      fireEvent(sendButton(), "click");
      await settle(12);
      assert.ok(!markSheet(), label);
      assert.equal(deaths().length, 1, `${label}: never sent twice`);
      assert.equal(teamReads(), 2, `${label}: read back once`);
      assert.equal(toasts().at(-1), said, label);
      if (said === DEAD_LOST) {
        assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
        assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"], label);
      } else {
        assert.deepEqual(namesIn(tables()[2]), ["Ann", "Pike", "Joe"], label);
        assert.ok(view.querySelector('.g-roster__aside[data-panel-player="fallen-f9"]'), label);
        assert.ok(document.activeElement === toggle("fallen-f9"), label);
      }
      api.assertAnswered();
    });
  }
});

test("a lost death whose read is split is read once more; still split, the coach is told the server could not be told", async () => {
  // The roster read without her, the fallen read before the death landed: read again, and the second read agrees.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.fail(DEATH);
    serverHolds(withoutAnn(), [annFell(), ...FALLEN]);
    const first = api.hold(FALLEN_READ);
    fireEvent(sendButton(), "click");
    await settle();
    first.release({ status: 200, body: { fallen: FALLEN } });
    await settle(12);
    assert.equal(teamReads(), 3, "read twice");
    assert.equal(toasts().at(-1), DEAD_DONE);
    assert.deepEqual(namesIn(tables()[2]), ["Ann", "Pike", "Joe"]);
  });
  // Split twice: no verdict the reads cannot give.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.fail(DEATH);
    serverHolds(withoutAnn(), FALLEN);
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 3);
    assert.equal(deaths().length, 1);
    assert.equal(toasts().at(-1), UNKNOWN);
    assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
  });
  // A read that fails says why, and that the death's fate is not known.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.fail(DEATH);
    api.fail(TEAM_READ);
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 2);
    assert.equal(toasts().at(-1), UNKNOWN);
    assert.equal(deaths().length, 1);
  });
});

test("another device's save: the roster is read again and the sheet stays open, saying so; the next press goes on the new revision", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.reply(DEATH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: team({ revision: 6 }) });
    serverHolds(team({ revision: 6 }), FALLEN);
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 2, "read again");
    assert.ok(markSheet()?.isModal, "the sheet stays: he is still on the roster");
    const refusal = markSheet().querySelector(".g-roster__markrefusal");
    assert.equal(refusal.getAttribute("role"), "alert");
    assert.equal(refusal.textContent, CHANGED);
    assert.equal(markOption("dead").getAttribute("aria-checked"), "true", "the choice is kept");
    assert.equal(markText().value, "Foul");
    assert.equal(sendButton().hasAttribute("disabled"), false);
    assert.ok(!sendButton().hasAttribute("aria-disabled"));
    assert.equal(save.savedRevision("t1"), 6);
    api.reply(DEATH, 201, { team: withoutAnn({ revision: 7 }), fallen: annFell() });
    fireEvent(sendButton(), "click");
    await settle();
    assert.equal(deaths().length, 2);
    assert.equal(deaths()[1].body.revision, 6);
    assert.ok(!markSheet());
    assert.equal(toasts().at(-1), DEAD_DONE);
  });
});

test("a refusal is said in the sheet and nothing changes", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.reply(DEATH, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }] });
    fireEvent(sendButton(), "click");
    await settle();
    const refusal = () => markSheet().querySelector(".g-roster__markrefusal");
    assert.ok(markSheet()?.isModal, "the sheet stays");
    assert.match(refusal().textContent, /Ann, Bo/);
    assert.equal(refusal().getAttribute("role"), "alert");
    assert.ok(!sendButton().hasAttribute("aria-busy") && !sendButton().hasAttribute("disabled"), "no longer busy");
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"], "Ann is on the roster");
    assert.equal(state.myTeams.items[0].revision, 4);
    assert.equal(teamReads(), 1);
    // He is no longer on the server's roster: said, and the roster read again.
    api.reply(DEATH, 404, { error: { code: "PLAYER_NOT_FOUND", params: {}, message: "x" } });
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.equal(refusal().textContent, "Player not found.");
    assert.equal(teamReads(), 2, "read again");
    assert.equal(deaths().length, 2);
  });
});

// The final review's Minor 1 and R2: a refusal whose read takes the sheet away goes on in a message, and words said
// where no sheet is left to press in never ask to press again.
test("a death's refusal whose sheet is gone is said in a message, never with «press again»", async () => {
  const CHANGED_CLOSED = "The roster was changed on another device and has been read again. The death was not marked.";
  const elsewhere = (roster) => ({ error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: roster });
  // She is no longer on the server's roster: the read takes her away, and the sheet with her.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.reply(DEATH, 404, { error: { code: "PLAYER_NOT_FOUND", params: {}, message: "x" } });
    serverHolds(withoutAnn(), FALLEN);
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.equal(teamReads(), 2, "read again");
    assert.ok(!markSheet(), "the read took her away, and the sheet with her");
    assert.equal(toasts().at(-1), "Player not found.", "the words stay with the coach");
    assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
  });
  // Another device's save without her: the read takes the sheet away too.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.reply(DEATH, 409, elsewhere(withoutAnn({ revision: 6 })));
    serverHolds(withoutAnn({ revision: 6 }), FALLEN);
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.ok(!markSheet());
    assert.equal(toasts().at(-1), CHANGED_CLOSED);
  });
  // The coach closed the sheet while the death was on its way: the conflict is said in a message, which has no button.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    fireEvent(markSheet(), "keydown", { key: "Escape" });
    serverHolds(team({ revision: 6 }), FALLEN);
    death.release({ status: 409, body: elsewhere(team({ revision: 6 })) });
    await settle(12);
    assert.ok(!markSheet());
    assert.equal(toasts().at(-1), CHANGED_CLOSED);
    assert.ok(!toasts().some((said) => said.includes("press again")));
    assert.equal(save.savedRevision("t1"), 6, "the roster was read again");
  });
});

// The Task 12 copy pass: another device's save that is this very death says it is marked, not that it was not.
test("another device marked the same death first: read again she is among the fallen, and the coach is told it is marked", async () => {
  const MARKED = "The roster was changed on another device and has been read again. Ann: the death is already marked.";
  const elsewhere = (roster) => ({ error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: roster });
  const told = () => {
    assert.equal(toasts().at(-1), MARKED);
    assert.ok(!toasts().some((said) => said.includes("not marked")), "no words that she was not marked");
    assert.doesNotMatch(document.querySelectorAll("output").at(-1).className, /toast-error/);
    assert.ok(namesIn(tables().at(-1)).includes("Ann"), "she stands among the fallen");
  };
  // The sheet open: the read takes her into «Fallen», and the sheet with her.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.reply(DEATH, 409, elsewhere(withoutAnn({ revision: 6 })));
    serverHolds(withoutAnn({ revision: 6 }), [annFell(), ...FALLEN]);
    fireEvent(sendButton(), "click");
    await settle(12);
    assert.ok(!markSheet());
    told();
  });
  // The sheet closed while the death was on its way: nothing is said before the read is in, then the same.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    fireEvent(markSheet(), "keydown", { key: "Escape" });
    serverHolds(withoutAnn({ revision: 6 }), [annFell(), ...FALLEN]);
    death.release({ status: 409, body: elsewhere(withoutAnn({ revision: 6 })) });
    await settle(12);
    assert.equal(teamReads(), 2, "read again");
    told();
    assert.equal(toasts().filter((said) => said.startsWith("The roster was changed")).length, 1, "said once");
  });
});

test("another tab's coach: no death is sent", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    api.items.set("gata-league-auth-token", "another-tab");
    fireEvent(sendButton(), "click");
    await settle();
    const refusal = markSheet().querySelector(".g-roster__markrefusal");
    assert.equal(refusal.textContent, OTHER_TAB);
    assert.ok(markSheet()?.isModal);
    assert.equal(deaths().length, 0);
    assert.deepEqual(namesIn(tables()[0]), ["Ann", "Bors", "Cade"]);
  });
  // The T4 review's carry: an answer that comes when another coach is signed in is not his to take.
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    chooseDeath();
    const death = api.hold(DEATH);
    fireEvent(sendButton(), "click");
    await settle();
    state.auth.currentUser = { id: "u2", login: "another", preferences: {} };
    death.release({ status: 201, body: { team: withoutAnn(), fallen: annFell() } });
    await settle();
    assert.equal(state.myTeams.items[0].revision, 4);
    assert.equal(save.savedRevision("t1"), 4);
    assert.ok(!toasts().includes(DEAD_DONE));
  });
});

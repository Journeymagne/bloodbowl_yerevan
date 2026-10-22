import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { useLocale, withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  AFTER_POST, EVENTS, INJURIES, LIVE_GAME, PATCH, PREP_GAME, READING, SIDE_LOCKED, UNSURE, api, aside, banner, bodyOf,
  callKeys, chipFor, coach, conflictOf, countOf, deltaOf, dictionary, gamesAre, injuryButton, injuryOptions, injuryRow,
  injurySheet, invalidateGames, minus, notice, onPhone, openRow, optionFor, outsideSwitch, patches, plus, posts,
  recordButton, refusalOf, refused, releaseCurrentScreen, removeButton, renderTeamRoster, rowOf, save, settle, sppLine,
  statChips, status, subLine, subOf, team, teamPlayerUrl, titleOf, toasts, toggle, view, withSpp,
} from "./helpers/roster-screen.mjs";

// The roster screen during a preparation and a match (stage 07a, Tasks 11 and 12): the banners, the taps of the match
// and the switch that makes them edits outside it, the match that ends, and an injury recorded in the match. The page
// is test/helpers/roster-screen.mjs; the other parts of the roster's tests are named there.

// ---------------------------------------------------------------------------
// A preparation and a match (Task 11)
// ---------------------------------------------------------------------------

test("a preparation that is on: a yellow banner, the round, what any save resets, and the way to it; the counters still write the roster", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      gamesAre([PREP_GAME]);
      await renderTeamRoster("t1");
      const callout = notice("warn");
      assert.ok(callout && callout === banner(), "the first banner");
      assert.equal(titleOf(callout), "Preparation for round 3 is on");
      // StatsPrep.html's words, with a phone's SPP edits (they save the roster too); R12: the steps as the pre-match names them.
      assert.equal(subOf(callout), "Hiring, selling, missed matches and SPP edits reset the steps «Roster», «Inducements» and «Start». Fans and weather stay.");
      const link = callout.querySelector(".g-callout__action .g-roster__calloutlink");
      assert.equal(link.getAttribute("href"), "#/games/g1/pre-match");
      assert.equal(link.textContent, "To the preparation →");
      assert.equal(outsideSwitch(), null, "nothing is a match's yet");
      api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.deepEqual([patches().length, posts().length], [1, 0], "a save of the roster, as outside a match");
      // Stage 07d, Task 9: «Advance» is a button that opens the advancement's window, not a link.
      assert.equal(aside().querySelector("[data-player-advance]").textContent, "Advance", "a preparation closes nothing");
      // A friendly has no round.
      coach();
      gamesAre([{ ...PREP_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null }]);
      await renderTeamRoster("t1");
      assert.equal(titleOf(notice("warn")), "Preparation for a friendly is on");
      // The steps in Russian are the pre-match's own words.
      coach();
      gamesAre([PREP_GAME]);
      useLocale("ru");
      try {
        await renderTeamRoster("t1");
        assert.equal(titleOf(notice("warn")), "Идёт подготовка к туру 3");
        assert.match(subOf(notice("warn")), /«Индьюсменты» и «Старт»/);
      } finally {
        useLocale("en");
      }
    });
  });
});

test("a match on: a green banner with the round and the records, the switch and the post-match; a tap is a record of the match, and the count shows «+1» for it in the table and in the counter", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const callout = banner();
    assert.equal(callout.getAttribute("class"), "g-callout", "the accent tone, the banner's base look");
    assert.equal(titleOf(callout), "Match on · round 3 · records: 0");
    // DeskRosterLive.html's words: a desk's counters stand on the right, and the table's green index is theirs.
    assert.equal(subOf(callout), "The counters of the player on the right write records into round 3: they show in the career at once (the green index in the table) and fill in the post-match by themselves. Hiring, selling, advancement and the treasury — after the post-match.");
    // K9: the action is the switch and the link; the switch's caption is what describes it, not a part of its name.
    const action = callout.querySelector(".g-callout__action");
    assert.deepEqual(action.querySelectorAll("button, a").map((node) => node.tagName), ["BUTTON", "A"]);
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "false");
    assert.equal(outsideSwitch().textContent, "Edit outside the match");
    const described = view.querySelector(`#${outsideSwitch().getAttribute("aria-describedby")}`);
    assert.equal(described.textContent, "fix an old mistake without touching round 3");
    assert.ok(described.hasAttribute("hidden"), "read to a screen reader as the switch's description, not drawn in the banner");
    const link = action.querySelector("a.g-roster__calloutlink");
    assert.deepEqual([link.getAttribute("href"), link.textContent], ["#/games/g2/post-match", "Post-match →"]);
    api.reply(EVENTS, 201, { event: rowOf() });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: "g2", playerId: "p1", counter: "touchdowns", delta: 1 }]);
    assert.equal(patches().length, 0, "no save of the roster during a match (R8)");
    const cell = bodyOf("p1#0").querySelectorAll(".g-rtable__row td")[5];
    assert.equal(cell.querySelector("sup.g-rtable__delta").textContent, ", this match +1");
    assert.equal(cell.childNodes[0].textContent, "1", "the career counts it at once");
    assert.equal(deltaOf("touchdowns"), "+1");
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 1");
    // The panel's block is the match's records, worth +3 SPP; the MVP and the advancements wait for the post-match.
    const block = aside().querySelector(".g-roster__manual");
    assert.deepEqual(sppLine(block), ["Match records · round 3", "+3 SPP in the match"]);
    assert.equal(block.querySelector(".g-roster__matchnote").textContent, "MVP — in the post-match. Advancement and sales — after it.");
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "3", "SPP available at once");
    assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css", "src/screens/team/roster/market.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
      "progress-dots.css", "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css", "src/screens/team/manage/strip.css", "src/screens/team/roster/career.css");
    api.assertAnswered();
  });
});

test("on a phone the open row of a match says what the match has given him: «SPP 3 · round 3 · counts at once» and its SPP", async () => {
  await withWindow({ phone: true }, async () => {
    coach({ events: [rowOf()] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · round 3 · counts at once", "+3 SPP"]);
    assert.equal(deltaOf("touchdowns", openRow()), "+1");
    // A friendly is named so.
    coach({ events: [] });
    gamesAre([{ ...LIVE_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null }]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.deepEqual(sppLine(openRow()), ["SPP 0 · friendly · counts at once", "no changes yet"]);
    assert.equal(titleOf(banner()), "Match on · friendly · records: 0");
  });
});

test("the MVP is no tap of the match: its plus says why; with the switch on it is an edit outside the match", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(plus("mvps").getAttribute("aria-disabled"), "true");
    assert.equal(plus("mvps").getAttribute("title"), "The MVP is picked in the post-match");
    fireEvent(plus("mvps"), "click");
    assert.equal(toasts().at(-1), "The MVP is picked in the post-match");
    await settle();
    assert.deepEqual([posts().length, patches().length], [0, 0]);
    fireEvent(outsideSwitch(), "click");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "true");
    assert.equal(plus("mvps").hasAttribute("aria-disabled"), false);
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: null, counter: "mvps" }) });
    fireEvent(plus("mvps"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: null, playerId: "p1", counter: "mvps", delta: 1 }]);
    assert.equal(patches().length, 0);
  });
});

test("a player who sits the match out takes no tap of it, and says why; with the switch on he does", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p4#0"), "click");
    const steps = aside().querySelectorAll("[data-action-step]");
    assert.equal(steps.length, 18);
    for (const button of steps) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), "Not playing this match");
    }
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), "Not playing this match");
    await settle();
    assert.equal(posts().length, 0);
    fireEvent(outsideSwitch(), "click");
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: null, playerId: "p4" }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: null, playerId: "p4", counter: "touchdowns", delta: 1 }]);
  });
});

// Review Focus 4: the minus of an edit outside the match stops where the roster and the edits waiting add up to nothing.
test("with the switch on a tap is an edit outside the match: no pairing, the banner turns yellow, the minus stops at the roster and the edits waiting", async () => {
  await withoutTimers(async () => {
    coach({ events: [rowOf({ id: "e0" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(countOf("touchdowns").startsWith("1"), true);
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "a tap of the match takes back the match's record");
    // A record of the match made on this visit is no manual edit (fix round 1, Minor 4).
    api.reply(EVENTS, 201, { event: rowOf({ id: "e9", counter: "casualties" }) });
    fireEvent(plus("casualties"), "click");
    await settle();
    fireEvent(outsideSwitch(), "click");
    const callout = notice("warn");
    assert.ok(callout && callout === banner(), "the first banner");
    assert.equal(titleOf(callout), "Edit outside the match · records: 2", "DeskRosterLive.html: the title says the switch is on");
    assert.equal(subOf(callout), "Edits change the career but will not go into round 3.");
    assert.ok(minus("touchdowns").hasAttribute("disabled"), "the roster's 0 and no edit waiting: an edit has nothing to take back");
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["Edit outside the match · Ann", "no changes yet"], "the casualty of the match is not counted");
    api.reply(EVENTS, 201, { event: rowOf({ id: "e1", pairingId: null }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.pairingId), ["g2", null]);
    assert.equal(patches().length, 0);
    assert.equal(countOf("touchdowns").startsWith("2"), true, "the career counts the edit");
    assert.equal(deltaOf("touchdowns"), "+1", "the match's own: the edit is not one of its records");
    assert.equal(titleOf(banner()), "Edit outside the match · records: 2");
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "the edit waiting can be taken back");
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["Edit outside the match · Ann", "+3 SPP"], "the edit's touchdown alone");
    await withWindow({ phone: true }, async () => {
      fireEvent(toggle("p1#0"), "click");
      assert.deepEqual(sppLine(openRow()), ["SPP 8 · manual edit", "+3 SPP"]);
    });
    // Off again: the match's rule.
    fireEvent(outsideSwitch(), "click");
    assert.equal(banner().getAttribute("class"), "g-callout");
  });
});

test("advancement waits for the post-match: «Advance» and the pencil say so; «Profile and advancement» stays open (K20)", async () => {
  await withoutTimers(async () => {
    const check = (control, title = AFTER_POST) => {
      assert.equal(control.tagName, "BUTTON");
      assert.equal(control.hasAttribute("href"), false);
      assert.equal(control.getAttribute("aria-disabled"), "true");
      assert.equal(control.getAttribute("title"), title);
      fireEvent(control, "click");
      assert.equal(toasts().at(-1), title);
    };
    await withWindow({ phone: true }, async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      fireEvent(toggle("p2#0"), "click");
      // Stage 07d, K20: the profile reads in a match (his injuries, his skills) and closes its own writes, saying why.
      const profile = openRow().querySelector("a.g-btn--dark");
      assert.equal(profile.textContent, "Profile and advancement");
      assert.equal(profile.getAttribute("href"), teamPlayerUrl("t1", "p2"));
      assert.ok(!openRow().querySelector(".g-btn--dark.g-roster__closed"));
      assertCspSafe(view);
      assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css", "src/screens/team/roster/market.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
        "progress-dots.css", "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css", "src/screens/team/manage/strip.css");
    });
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
    const [pencil, advance] = aside().querySelectorAll(".g-roster__closed");
    assert.equal(pencil.getAttribute("aria-label"), "Edit Bors");
    // Stage 07d, Task 8: the pencil edits his number, name and captaincy, and says so.
    check(pencil, "Number, name and captain — after the post-match");
    assert.equal(advance.textContent, "Advance");
    // Stage 07d, Task 9: a button that names him, so the focus finds it when his advancement closes.
    assert.equal(advance.getAttribute("data-player-advance"), "p2#0");
    check(advance);
    assert.equal(aside().querySelector(".g-roster__cheapest").textContent, AFTER_POST);
    assert.equal(aside().querySelector("a"), null);
    // The switch edits the career, not the roster's advancements: they stay closed, and stage 07c's «Sell» with them (K2).
    fireEvent(outsideSwitch(), "click");
    assert.equal(aside().querySelectorAll(".g-roster__closed").length, 3);
  });
});

// Review Focus 1: a step down in the match waits for the step up it takes back, and is open as soon as the plus is taken.
test("a minus right after a plus counts the plus still on its way", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    const held = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "open at once: the plus on its way counts");
    assert.equal(deltaOf("touchdowns"), "+1");
    fireEvent(minus("touchdowns"), "click");
    assert.equal(deltaOf("touchdowns"), null);
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    await settle();
    assert.deepEqual([held.count, posts().length], [1, 1], "the minus waits for the plus");
    api.reply(EVENTS, 201, { event: rowOf({ id: "e2", delta: -1 }) });
    held.release({ status: 201, body: { event: rowOf({ id: "e1" }) } });
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.delta), [1, -1]);
    assert.equal(countOf("touchdowns"), "0");
    assert.equal(deltaOf("touchdowns"), null);
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    assert.equal(bodyOf("p1#0").querySelectorAll(".g-rtable__row td")[5].textContent, "0");
    api.assertAnswered();
  });
});

// Review Focus 2: a match that ended (or never began) as the server counts it.
test("a match that ended elsewhere: the tap is refused, the screen reads the games and the records again and leaves the match mode", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      api.calls.length = 0;
      api.reply(EVENTS, 409, refused("MATCH_NOT_LIVE"));
      gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
      const reading = api.hold("GET /api/teams/t1");
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(toasts().at(-1), "There is no match in progress to record this in.");
      // The roster and its records are read again, and the games once they have answered (final review, Minor 1); the
      // roster read during the match is no roster to save until the read answers (fix round 2, N2).
      assert.equal(reading.count, 1);
      assert.ok(!callKeys().includes("GET /api/games"), "the games after the roster");
      assert.equal(plus("touchdowns").getAttribute("title"), READING);
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), READING);
      await settle();
      assert.equal(patches().length, 0, "nothing saved on the roster read during the match");
      reading.release();
      await settle();
      // The games read after the roster say the match the screen had on is over: the roster may have been read on its
      // other side, so it is read once more, and that read, on games that say the same, is taken (stage 13, Task 10).
      const read = ["GET /api/teams/t1", "GET /api/teams/t1/events", "GET /api/games"];
      assert.deepEqual(callKeys(), [EVENTS, ...read, ...read]);
      assert.ok(!view.querySelector(".g-roster__notices"), "no banner of a match");
      assert.equal(countOf("touchdowns"), "0", "the refused step is gone");
      api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.deepEqual([posts().length, patches().length], [1, 1], "a save of the roster now");
    });
  });
});

test("a side that saved its Players step: the refusal is said, and the match's steppers say it before the next tap; the switch still works", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.reply(EVENTS, 409, refused("EVENT_SIDE_LOCKED"));
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), SIDE_LOCKED);
    assert.equal(posts().length, 1);
    for (const button of aside().querySelectorAll("[data-action-step]")) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), SIDE_LOCKED);
    }
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(posts().length, 1, "said, not sent");
    fireEvent(outsideSwitch(), "click");
    assert.equal(plus("casualties").hasAttribute("aria-disabled"), false, "an edit outside the match is no step of the post-match");
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: null, counter: "casualties" }) });
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.pairingId), ["g2", null]);
    // Off again, the match's steppers still say it: nothing has been read since.
    fireEvent(outsideSwitch(), "click");
    assert.equal(plus("touchdowns").getAttribute("title"), SIDE_LOCKED);
    // The records read again (an edit whose answer was lost), the next tap of the match asks the server again.
    fireEvent(outsideSwitch(), "click");
    api.fail(EVENTS);
    api.calls.length = 0;
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.ok(callKeys().includes("GET /api/teams/t1/events"));
    fireEvent(outsideSwitch(), "click");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
  });
});

test("a tap whose answer was lost: the records are read again, not the tap sent again — once for the taps behind it, which are not sent", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    const held = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    assert.deepEqual([deltaOf("touchdowns"), deltaOf("casualties")], ["+1", "+1"]);
    await settle();
    // The touchdown was written after all; its answer never came.
    const reading = api.hold("GET /api/teams/t1/events");
    held.release({ error: new TypeError("Failed to fetch") });
    await settle();
    // While the records are read again no tap is taken: what they hold is not known (fix round 1, Minor 1).
    for (const button of aside().querySelectorAll("[data-action-step]")) assert.equal(button.getAttribute("title"), READING);
    fireEvent(plus("knockouts"), "click");
    assert.equal(toasts().at(-1), READING);
    reading.release({ status: 200, body: { events: [rowOf()], revision: 4 } });
    await settle();
    assert.equal(plus("knockouts").hasAttribute("aria-disabled"), false, "open once they are read");
    assert.equal(posts().length, 1, "neither sent again nor the casualty sent, nor the knockout tapped meanwhile");
    assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1/events").length, 1, "read once for both");
    assert.deepEqual(toasts().filter((text) => text.startsWith("The answer") || text.startsWith("Not sent")),
      ["The answer to the record did not arrive: the records are read again to see whether it was written."]);
    assert.deepEqual([deltaOf("touchdowns"), deltaOf("casualties")], ["+1", null], "what the server has");
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 1");
  });
});

// Fix round 1, Important 1: leaving the match by a change of the games reads the roster and the records again (Carry T10).
test("a match that ends while the screen is open: the roster and its records are read again with the games, the counters wait for them, and the next tap saves the roster the finish left", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      api.calls.length = 0;
      // The post-match was finished on another device: the finish wrote the roster (revision 5) and settled the records.
      gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
      api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      const reading = api.hold("GET /api/teams/t1/events");
      await invalidateGames();
      await settle();
      assert.equal(view.querySelector(".g-roster__notices"), null, "no banner of a match");
      assert.ok(callKeys().includes("GET /api/teams/t1") && callKeys().includes("GET /api/teams/t1/events"));
      assert.equal(plus("touchdowns").getAttribute("title"), READING);
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), READING);
      await settle();
      assert.equal(patches().length, 0, "nothing on the roster read during the match");
      reading.release();
      await settle();
      assert.equal(countOf("touchdowns"), "1", "the roster the finish wrote");
      api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 2 }, { revision: 6 }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[5, 2]]);
      // Read afresh, the roster is the coach's again: a later read of it (a refusal's) closes nothing (Task 10).
      api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
      const again = api.hold("GET /api/teams/t1");
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(again.count, 1);
      assert.equal(plus("casualties").hasAttribute("aria-disabled"), false);
      again.release();
      await settle();
    });
  });
});

test("a read of the records that fails says why and opens the counters again", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.fail(EVENTS);
    api.fail("GET /api/teams/t1/events");
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), "No connection to the server. Check the internet and try again.");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false, "what the screen has is all it has: the counters work on it");
  });
});

// Fix round 1, Minor 1: a read that lands with a tap still in the air may hold its row already.
test("a read that lands while a tap is in the air is not taken: the counters stay closed until the tap has answered and the records are read again, and nothing is sent meanwhile", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      const sending = api.hold(EVENTS);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      // The match is finished elsewhere meanwhile; the roster the finish wrote already has the touchdown.
      gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
      api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      await invalidateGames();
      await settle();
      assert.equal(countOf("touchdowns"), "1", "the tap on its way, not the tap twice");
      assert.equal(minus("touchdowns").getAttribute("title"), READING);
      fireEvent(minus("touchdowns"), "click");
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), READING);
      await settle();
      assert.deepEqual([posts().length, patches().length], [1, 0], "nothing sent");
      api.calls.length = 0;
      sending.release({ status: 201, body: { event: rowOf() } });
      await settle();
      assert.deepEqual(callKeys().filter((key) => key.startsWith("GET /api/teams/")).sort(), ["GET /api/teams/t1", "GET /api/teams/t1/events"], "read again once it has answered");
      assert.equal(countOf("touchdowns"), "1", "the finish's roster; its record is settled");
      assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false);
    });
  });
});

// Fix round 2, N1: a read made while a tap was in the air is not trusted, though the tap has answered before it lands.
test("a read made while a tap was in the air is made again once it has answered: a finish between them has the tap in the roster, not twice", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      const sending = api.hold(EVENTS);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      // The match is finished elsewhere: the touchdown is in the roster the finish wrote, its record settled.
      gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
      api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      const reading = api.hold("GET /api/teams/t1/events");
      await invalidateGames();
      await settle();
      // The tap's answer comes first, as it was before the finish: a record not settled yet.
      sending.release({ status: 201, body: { event: rowOf() } });
      await settle();
      api.calls.length = 0;
      reading.release();
      const again = api.hold("GET /api/teams/t1/events");
      await settle();
      // Taken, the first read's roster (the touchdown in it) and the tap's row (added on top) would show 2.
      assert.equal(countOf("touchdowns"), "1", "the first read is not taken");
      assert.equal(again.count, 1, "read again: the first read may or may not have the tap");
      assert.equal(minus("touchdowns").getAttribute("title"), READING);
      fireEvent(minus("touchdowns"), "click");
      assert.equal(toasts().at(-1), READING);
      await settle();
      assert.equal(patches().length, 0, "no save lowers the roster meanwhile");
      again.release();
      await settle();
      assert.equal(countOf("touchdowns"), "1", "the server's one touchdown, not the roster's and the record's");
      assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false);
      assert.equal(patches().length, 0);
    });
  });
});

// Fix round 2, N3: the read that replaces one made while a tap was in the air does what the first was asked to.
test("«Load the new one» pressed while a tap is in the air takes the server's roster once the tap has answered", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      // A save of the roster is on its way when the match begins; a record of it follows.
      const saving = api.hold(PATCH);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      gamesAre([LIVE_GAME]);
      await invalidateGames();
      await settle();
      const sending = api.hold(EVENTS);
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(sending.count, 1);
      // The match ends elsewhere; the save meets another device's roster.
      gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
      const elsewhere = withSpp("p1", { touchdowns: 4 }, { revision: 6 });
      api.reply("GET /api/teams/t1", 200, { team: elsewhere });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
      await invalidateGames();
      await settle();
      saving.release({ status: 409, body: conflictOf(elsewhere) });
      await settle();
      assert.ok(notice("danger"));
      fireEvent(view.querySelector("[data-roster-reload]"), "click");
      await settle();
      assert.ok(notice("danger"), "not taken while the record is in the air");
      sending.release({ status: 409, body: refused("MATCH_NOT_LIVE") });
      await settle();
      assert.ok(!notice("danger"), "the server's roster, as «Load the new one» asked");
      assert.equal(countOf("touchdowns"), "4");
      assert.equal(save.saveState("t1").waiting, 0);
    });
  });
});

test("a minus with nothing to take back on the server: said, and the records read again once", async () => {
  await withoutTimers(async () => {
    coach({ events: [rowOf({ id: "e0" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    // Another device of the coach took the touchdown back meanwhile.
    api.reply(EVENTS, 409, refused("EVENT_BELOW_ZERO"));
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 4 });
    fireEvent(minus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), "This counter is already at zero, there is nothing to take back.");
    assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events", EVENTS]);
    assert.equal(countOf("touchdowns"), "0");
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
  });
});

test("a refusal the records cannot answer is said once and nothing is read; the taps behind it are given up unsent", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    const held = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    await settle();
    const before = toasts().length;
    held.release({ status: 422, body: refused("POST_PLAYER") });
    await settle();
    assert.deepEqual(toasts().slice(before), ["This player is unavailable for this action."]);
    assert.deepEqual(callKeys(), [EVENTS], "one tap sent, nothing read");
    assert.deepEqual([deltaOf("touchdowns"), deltaOf("casualties")], [null, null]);
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
  });
});

test("the switch is kept per team while the page lives", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME, { ...LIVE_GAME, id: "g3", home: { user: { id: "u1" }, team: { id: "t2" } } }]);
    await renderTeamRoster("t1");
    fireEvent(outsideSwitch(), "click");
    releaseCurrentScreen();
    view.innerHTML = "<p>elsewhere</p>";
    await renderTeamRoster("t1");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "true");
    assert.ok(notice("warn"));
    api.reply("GET /api/teams/t2", 200, { team: team({ id: "t2", name: "Grimtusk Raiders" }) });
    api.reply("GET /api/teams/t2/events", 200, { events: [], revision: 4 });
    api.reply("GET /api/teams/t2/fallen", 200, { fallen: [] });
    releaseCurrentScreen();
    await renderTeamRoster("t2");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "false");
    assert.equal(banner().getAttribute("class"), "g-callout");
  });
});

// R13: a switch left on in one match does not send the next match's taps outside it.
test("the switch is kept per match too: the same team's next match starts with it off", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(outsideSwitch(), "click");
    releaseCurrentScreen();
    view.innerHTML = "<p>elsewhere</p>";
    // Round 4's match is on now.
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }, { ...LIVE_GAME, id: "g7", roundNumber: 4, season: { currentRound: 4 } }]);
    await renderTeamRoster("t1");
    assert.equal(titleOf(banner()), "Match on · round 4 · records: 0");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "false");
    assert.equal(banner().getAttribute("class"), "g-callout");
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: "g7" }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.pairingId), ["g7"]);
  });
});

// ---------------------------------------------------------------------------
// An injury in the match (Task 12)
// ---------------------------------------------------------------------------

const INJURY_SHEETS = ["src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css", "src/screens/team/roster/market.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css", "progress-dots.css",
  "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css", "sheet.css", "option-card.css", "filter-chips.css",
  "src/screens/team/manage/strip.css", "src/screens/team/roster/career.css"];

test("«Injury in the match…» opens a sheet of five injuries; a lasting one asks for the characteristic; «Record in the match» sends one injury row", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const opener = injuryButton();
    assert.equal(opener.textContent, "Injury in the match…");
    assert.equal(opener.getAttribute("data-roster-injury"), "p1#0");
    assert.equal(opener.getAttribute("aria-haspopup"), "dialog");
    opener.focus();
    fireEvent(opener, "click");
    const dialog = injurySheet();
    assert.ok(dialog?.isModal, "the sheet is open, modally");
    assert.equal(dialog.querySelector("h2").textContent, "Injury in the match");
    assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "#1 Ann · Human Lineman");
    assert.equal(dialog.querySelector('[role="radiogroup"]').getAttribute("aria-label"), "Injury");
    assert.deepEqual(injuryOptions().map((card) => [card.querySelector(".g-option__title").textContent, card.querySelector(".g-option__sub").textContent, card.getAttribute("aria-checked")]), [
      ["Badly Hurt", "no lasting effect after the match", "false"],
      ["Seriously Hurt", "misses the next match", "false"],
      ["Serious Injury", "a Niggling Injury and a missed match", "false"],
      ["Lasting Injury", "−1 to a characteristic and a missed match", "false"],
      ["Dead", "the player died", "false"],
    ]);
    assert.equal(dialog.querySelector(".g-roster__injurynote").textContent,
      "It is recorded in this match (round 3) and fills in the post-match's Players step, where the injury is applied to the roster. While the team has played fewer than 3 matches, any injury becomes Badly Hurt.");
    assert.equal(recordButton().textContent, "Record in the match");
    assert.ok(recordButton().classList.contains("g-btn--primary"));
    assert.ok(recordButton().hasAttribute("disabled"), "nothing chosen yet");
    assert.ok(!removeButton(), "no injury stands to take back");
    assert.equal(statChips().length, 0, "no characteristic but for a lasting injury");
    fireEvent(optionFor("lasting"), "click");
    assert.equal(dialog.querySelector(".g-roster__injurylabel").textContent, "Which characteristic");
    assert.equal(dialog.querySelector('[data-chip-group="injury-stat"]').getAttribute("aria-label"), "Which characteristic");
    assert.deepEqual(statChips().map((chip) => [chip.textContent, chip.getAttribute("aria-checked")]), [["MA", "false"], ["ST", "false"], ["AG", "false"], ["PA", "false"], ["AR", "false"]]);
    assert.ok(recordButton().hasAttribute("disabled"), "a lasting injury needs its characteristic");
    fireEvent(chipFor("ag"), "click");
    assert.equal(recordButton().hasAttribute("disabled"), false);
    assertCspSafe(view);
    assertStyled(view, ...INJURY_SHEETS);
    api.reply(EVENTS, 201, { event: injuryRow({ code: "lasting", stat: "ag" }) });
    fireEvent(recordButton(), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: "g2", playerId: "p1", counter: "injury", delta: 1, injury: { code: "lasting", stat: "ag" } }]);
    assert.equal(patches().length, 0);
    assert.ok(!injurySheet(), "closed once written");
    assert.ok(document.activeElement === injuryButton(), "the focus back on the button that opened it");
    assert.equal(subLine("p1#0").textContent, "Lasting Injury (AG) · round 3");
    assert.ok(subLine("p1#0").classList.contains("g-rtable__sub--alert"));
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 1");
    api.assertAnswered();
  });
});

test("a standing injury can be taken back by its own −1", async () => {
  await withoutTimers(async () => {
    coach({ events: [injuryRow({ code: "miss" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(subLine("p1#0").textContent, "Seriously Hurt · round 3");
    fireEvent(injuryButton(), "click");
    assert.equal(removeButton().textContent, "Remove the record");
    assert.ok(removeButton().classList.contains("g-btn--danger-quiet"));
    assert.ok(removeButton().closest(".g-sheet__foot-start"), "the quiet control beside the sheet's button");
    assert.ok(recordButton().hasAttribute("disabled"), "a new one is still to be chosen");
    api.reply(EVENTS, 201, { event: injuryRow({ code: "miss" }, { id: "e2", delta: -1 }) });
    fireEvent(removeButton(), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: "g2", playerId: "p1", counter: "injury", delta: -1, injury: { code: "miss" } }]);
    assert.ok(!injurySheet());
    assert.equal(subLine("p1#0").textContent, "Human Lineman");
    assert.equal(subLine("p1#0").classList.contains("g-rtable__sub--alert"), false);
    // A friendly names itself in the line.
    coach({ events: [injuryRow({ code: "dead" })] });
    gamesAre([{ ...LIVE_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null }]);
    await renderTeamRoster("t1");
    assert.equal(subLine("p1#0").textContent, "Dead · friendly");
  });
});

// Final review, Minor 4: a friendly's {match} is the adjective «товарищеский», so the Russian sentences name the match around it.
test("in Russian a friendly keeps its noun: the banner and the switch's description say «товарищеский матч», the injury's note «этот матч (товарищеский)»", async () => {
  const FRIENDLY = { ...LIVE_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null };
  const described = () => view.querySelector(`#${outsideSwitch().getAttribute("aria-describedby")}`).textContent;
  try {
    for (const [game, match, target] of [[FRIENDLY, "товарищеский", "товарищеский матч"], [LIVE_GAME, "тур 3", "тур 3"]]) {
      coach();
      gamesAre([game]);
      useLocale("ru");
      await renderTeamRoster("t1");
      assert.equal(described(), `исправить старую ошибку, не трогая ${target}`, "StatsLive.html: «не трогая тур 7»");
      assert.ok(subOf(banner()).startsWith(`Счётчики игрока справа пишут записи в ${target}: сразу видны в карьере (зелёный индекс в таблице)`));
      fireEvent(injuryButton(), "click");
      assert.ok(injurySheet().querySelector(".g-roster__injurynote").textContent.startsWith(`Запишется в этот матч (${match}) и подставится в итоги`));
    }
  } finally {
    useLocale("en");
  }
});

test("the choice keeps the focus on the card it moved to", async () => {
  coach();
  gamesAre([LIVE_GAME]);
  await renderTeamRoster("t1");
  fireEvent(injuryButton(), "click");
  const cards = injuryOptions();
  assert.deepEqual(cards.map((card) => card.getAttribute("tabindex")), ["0", "-1", "-1", "-1", "-1"], "Tab enters the group at the first");
  cards[0].focus();
  fireEvent(cards[0], "keydown", { key: "ArrowDown" });
  assert.ok(document.activeElement === cards[1], "the next card");
  assert.ok(injuryOptions()[1] === cards[1], "the same node after the redraw");
  assert.equal(cards[1].getAttribute("aria-checked"), "true");
  assert.equal(recordButton().hasAttribute("disabled"), false);
  fireEvent(cards[1], "keydown", { key: "ArrowDown" });
  fireEvent(cards[2], "keydown", { key: "ArrowDown" });
  assert.ok(document.activeElement === cards[3] && injuryOptions()[3] === cards[3], "a lasting injury's characteristics drawn under it, the focus kept");
  assert.equal(statChips().length, 5);
  assert.ok(recordButton().hasAttribute("disabled"));
  assert.ok(injurySheet()?.isModal);
});

test("a refused record says why and the sheet stays open", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("dead"), "click");
    api.reply(EVENTS, 409, refused("EVENT_SIDE_LOCKED"));
    fireEvent(recordButton(), "click");
    await settle();
    assert.equal(toasts().at(-1), SIDE_LOCKED);
    assert.ok(injurySheet()?.isModal, "open, the choice still in it");
    assert.equal(optionFor("dead").getAttribute("aria-checked"), "true");
    assert.equal(subLine("p1#0").textContent, "Human Lineman", "nothing written");
    // The button says it before the next press, as the match's steppers behind the sheet do; it stays in reach to say why.
    assert.equal(recordButton().getAttribute("aria-disabled"), "true");
    assert.equal(recordButton().getAttribute("title"), SIDE_LOCKED);
    assert.equal(recordButton().hasAttribute("disabled"), false);
    assert.ok(recordButton().classList.contains("g-roster__closed"));
    // Pressed again it says why, and sends nothing: the side is locked until the records are read again.
    for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
    fireEvent(recordButton(), "click");
    assert.equal(toasts().at(-1), SIDE_LOCKED);
    await settle();
    assert.equal(posts().length, 1);
    fireEvent(injurySheet().querySelector("[data-sheet-close]"), "click");
    assert.ok(!injurySheet());
    assert.ok(document.activeElement === injuryButton());
    assert.equal(injuryButton().getAttribute("aria-disabled"), "true");
    assert.equal(injuryButton().getAttribute("title"), SIDE_LOCKED);
    fireEvent(injuryButton(), "click");
    assert.ok(!injurySheet(), "a locked side opens no sheet");
    assert.equal(toasts().at(-1), SIDE_LOCKED);
  });
});

test("no injury for a player who sits the match out, nor with the switch on, nor outside a match", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(injuryButton(openRow()).textContent, "Injury in the match…", "in the open row on a phone");
    fireEvent(toggle("p4#0"), "click");
    assert.ok(!injuryButton(openRow()), "Dell sits it out");
    fireEvent(toggle("p1#0"), "click");
    fireEvent(outsideSwitch(), "click");
    assert.ok(!injuryButton(openRow()), "an edit outside the match deals no injury");
    assertStyled(view, ...INJURY_SHEETS);
  });
  coach();
  await renderTeamRoster("t1");
  assert.ok(!view.querySelector("[data-roster-injury]"), "no match, no injury");
});

test("every injury the table knows has its words in both languages", () => {
  const codes = INJURIES.filter((code) => code !== "none");
  assert.equal(codes.length, 5);
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const code of codes) {
      assert.ok(words[`teamRoster.injury.${code}`], `${locale} teamRoster.injury.${code}`);
      assert.ok(words[`teamRoster.injuryCaption.${code}`], `${locale} teamRoster.injuryCaption.${code}`);
    }
  }
  // The vault's Casualties page names them so; Badly Hurt stays English (docs/i18n-glossary.md).
  assert.deepEqual(codes.map((code) => dictionary("ru")[`teamRoster.injury.${code}`]), ["Badly Hurt", "Серьёзная травма", "Тяжёлое повреждение", "Стойкая травма", "Смерть"]);
});

// R14: the injury is a tap of the match, and its answer is heard as every tap's is (Task 11).
test("an injury in the air keeps the sheet busy: a second press sends nothing", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("miss"), "click");
    const held = api.hold(EVENTS);
    recordButton().focus();
    fireEvent(recordButton(), "click");
    assert.equal(recordButton().getAttribute("aria-busy"), "true", "busy while it is in the air");
    assert.ok(!recordButton().hasAttribute("disabled"), "not disabled: a focused button that is drops the focus (button.mjs)");
    // «Remove the record» is drawn before it now (the injury on its way is counted), so the button is drawn anew.
    assert.ok(document.activeElement === optionFor("miss"), "the focus stays in the sheet, on the choice");
    assert.equal(subLine("p1#0").textContent, "Seriously Hurt · round 3", "counted at once, as every tap on its way");
    assert.equal(removeButton().getAttribute("aria-busy"), "true", "nothing taken back while it is in the air either");
    fireEvent(removeButton(), "click");
    fireEvent(recordButton(), "click");
    await settle();
    assert.deepEqual([held.count, posts().length], [1, 1]);
    held.release({ status: 201, body: { event: injuryRow({ code: "miss" }) } });
    await settle();
    assert.equal(posts().length, 1);
    assert.ok(!injurySheet());
    assert.equal(subLine("p1#0").textContent, "Seriously Hurt · round 3");
  });
});

test("an injury whose answer was lost: the sheet closes and the records are read again before another can be recorded", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("dead"), "click");
    api.fail(EVENTS);
    // It was written after all; its answer never came.
    const reading = api.hold("GET /api/teams/t1/events");
    fireEvent(recordButton(), "click");
    await settle();
    assert.ok(!injurySheet(), "closed: whether it was written is not known");
    assert.equal(toasts().at(-1), "The answer to the record did not arrive: the records are read again to see whether it was written.");
    assert.ok(document.activeElement === injuryButton());
    assert.equal(injuryButton().getAttribute("aria-disabled"), "true");
    assert.equal(injuryButton().getAttribute("title"), READING);
    assert.ok(!notice("danger"), "nothing to read again while the read is in the air");
    fireEvent(injuryButton(), "click");
    assert.ok(!injurySheet(), "no second injury before the read says whether the first was written");
    assert.equal(toasts().at(-1), READING);
    reading.release({ status: 200, body: { events: [injuryRow({ code: "dead" })], revision: 4 } });
    await settle();
    assert.equal(posts().length, 1, "not sent again");
    assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1/events").length, 1, "read once");
    assert.equal(subLine("p1#0").textContent, "Dead · round 3", "what the server has");
    assert.equal(injuryButton().hasAttribute("aria-disabled"), false);
  });
});

test("while the records are read the sheet's buttons say so, and a press sends nothing", async () => {
  await withoutTimers(async () => {
    coach({ events: [injuryRow({ code: "miss" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("badly-hurt"), "click");
    // The server has the match over before the games say so: the refusal reads the records again, and the sheet stays.
    api.reply(EVENTS, 409, refused("MATCH_NOT_LIVE"));
    const reading = api.hold("GET /api/teams/t1/events");
    fireEvent(recordButton(), "click");
    await settle();
    assert.ok(injurySheet()?.isModal, "a refusal leaves it open");
    for (const button of [recordButton(), removeButton()]) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), READING);
      assert.equal(button.hasAttribute("disabled"), false, "in reach, to say why");
    }
    fireEvent(removeButton(), "click");
    assert.equal(toasts().at(-1), READING);
    await settle();
    assert.equal(posts().length, 1, "nothing taken back while the records are read");
    reading.release();
    await settle();
    assert.ok(injurySheet()?.isModal);
    for (const button of [recordButton(), removeButton()]) assert.equal(button.hasAttribute("aria-disabled") || button.hasAttribute("disabled"), false);
  });
});

// R14: «never a second injury before the read says whether the first was written» — a read that fails says nothing.
test("an injury whose answer was lost, and whose read then failed, stays closed until a read succeeds; «Try again» reads", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("dead"), "click");
    api.fail(EVENTS);
    api.fail("GET /api/teams/t1/events");
    fireEvent(recordButton(), "click");
    await settle();
    assert.ok(!injurySheet());
    assert.equal(toasts().at(-1), "No connection to the server. Check the internet and try again.");
    assert.equal(injuryButton().getAttribute("aria-disabled"), "true");
    assert.equal(injuryButton().getAttribute("title"), UNSURE);
    fireEvent(injuryButton(), "click");
    assert.ok(!injurySheet(), "no second injury while it is not known whether the first was written");
    assert.equal(toasts().at(-1), UNSURE);
    const callout = notice("danger");
    assert.equal(titleOf(callout), UNSURE);
    const again = callout.querySelector("[data-roster-reread]");
    assert.equal(again.textContent, "Try again");
    // The match's other taps keep Task 11's rule: a read that failed opens them.
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
    // Read again while the network is still gone: still closed.
    fireEvent(again, "click");
    await settle();
    assert.equal(injuryButton().getAttribute("title"), UNSURE);
    api.reply("GET /api/teams/t1/events", 200, { events: [injuryRow({ code: "dead" })], revision: 4 });
    fireEvent(notice("danger").querySelector("[data-roster-reread]"), "click");
    await settle();
    assert.ok(!notice("danger"));
    assert.equal(injuryButton().hasAttribute("aria-disabled"), false);
    assert.equal(subLine("p1#0").textContent, "Dead · round 3", "what the server has");
    assert.equal(posts().length, 1);
  });
});

test("an open injury sheet is its match's: another match on, or none, closes it, the focus back on its button or on the title", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("miss"), "click");
    optionFor("miss").focus();
    // Round 3's post-match was finished elsewhere, and round 4's match has begun.
    const ended = { ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" };
    const next = { ...LIVE_GAME, id: "g7", roundNumber: 4, season: { currentRound: 4 } };
    gamesAre([ended, next]);
    await invalidateGames();
    await settle();
    assert.ok(!injurySheet(), "not a sheet of round 4's match");
    assert.equal(titleOf(banner()), "Match on · round 4 · records: 0");
    assert.ok(document.activeElement === injuryButton(), "back on the button that opened it");
    // Opened for round 4, which then ends: no button to go back to, and the title takes the focus.
    fireEvent(injuryButton(), "click");
    assert.match(injurySheet().querySelector(".g-roster__injurynote").textContent, /^It is recorded in this match \(round 4\)/);
    optionFor("dead").focus();
    gamesAre([ended, { ...next, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    await invalidateGames();
    await settle();
    assert.ok(!injurySheet());
    assert.ok(!view.querySelector("[data-roster-injury]"));
    assert.ok(document.activeElement === view.querySelector("h1"), "the title, not the body");
  });
});

test("an injury refused because the match is over: said, and the sheet goes with the match", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("badly-hurt"), "click");
    api.reply(EVENTS, 409, refused("MATCH_NOT_LIVE"));
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    fireEvent(recordButton(), "click");
    await settle();
    assert.equal(toasts().at(-1), "There is no match in progress to record this in.");
    assert.ok(!injurySheet(), "no match to record it in");
    assert.ok(!view.querySelector("[data-roster-injury]"));
    assert.equal(posts().length, 1);
  });
});

test("the sheet's player is text", async () => {
  coach({ teamAnswer: team({ roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: HOSTILE }] } }) });
  gamesAre([LIVE_GAME]);
  await renderTeamRoster("t1");
  fireEvent(injuryButton(), "click");
  assert.equal(injurySheet().querySelector(".g-sheet__sub").textContent, `#1 ${HOSTILE} · Human Lineman`);
  assert.ok(!view.querySelector("img"));
  assertCspSafe(view);
});

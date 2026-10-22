import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints, mediaText } from "./helpers/css.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PATCH, PLAYERS, PREP_GAME, SPP_EVENT_COUNTERS, api, aside, banner, bodyOf, chipIn, coach, conflictOf,
  dictionary, gamesAre, injuryButton, injuryRow, onPhone, openRow, outsideSwitch, page, plus, releaseCurrentScreen,
  renderTeamRoster, rowOf, settle, state, subOf, team, text, titleOf, toggle, view, withSpp,
} from "./helpers/roster-screen.mjs";

// The roster screen's look: every class it draws is styled, every word is in both dictionaries, its stylesheets'
// widths, sizes and colours, and the owner's fidelity pass against the prototypes. The page is
// test/helpers/roster-screen.mjs; the other parts of the roster's tests are named there.

test("every class the screen draws is styled and nothing the CSP refuses is on it, on a phone and on a desk, with a sheet open", async () => {
  const sheets = ["src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css", "src/screens/team/roster/market.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
    "progress-dots.css", "button.css", "callout.css", "sheet.css", "src/screens/ref/prose.css", "action-stepper.css", "status-chip.css",
    "src/screens/team/manage/strip.css", "src/screens/team/roster/career.css"];
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach();
      await renderTeamRoster("t1");
      fireEvent(toggle("p2#0"), "click");
      fireEvent(chipIn(bodyOf("p2#0"), "Block"), "click");
      assertCspSafe(view);
      assertStyled(view, ...sheets);
    });
  }
  coach({ teamAnswer: team({ baseTeamSlug: "teams/unknown" }) });
  await renderTeamRoster("t1");
  assertStyled(view, ...sheets);
});

test("every key the screen asks for is in both dictionaries; the counters' and the sources' are walked", () => {
  const dir = "src/screens/team/roster/";
  assertDictionaryCovers(...readdirSync(new URL(`../${dir}`, import.meta.url)).filter((name) => name.endsWith(".mjs")).map((name) => `${dir}${name}`));
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const counter of SPP_EVENT_COUNTERS) {
      assert.ok(words[`teamRoster.counter.${counter}`], `${locale} teamRoster.counter.${counter}`);
      assert.ok(words[`teamRoster.counterName.${counter}`], `${locale} teamRoster.counterName.${counter}`);
    }
    for (const source of ["base", "primary", "secondary", "favoured", "captain"]) assert.ok(words[`teamRoster.source.${source}`], `${locale} teamRoster.source.${source}`);
  }
  // The counters' abbreviations are English in both languages, as TD and CAS are in the glossary.
  for (const counter of SPP_EVENT_COUNTERS) assert.equal(dictionary("ru")[`teamRoster.counter.${counter}`] === dictionary("en")[`teamRoster.counter.${counter}`], !["landings", "bonus"].includes(counter), counter);
});

test("on a phone the open row, on a desk the panel beside the table", () => {
  const sheet = "src/screens/team/roster/roster.css";
  assert.ok(valuesOf(sheet, ".g-roster__aside", "display").includes("none"));
  // DeskRoster.html's panel: 380px (340 and its padding) where there is room; never under 340px, where a match's tile
  // still holds «− 12+1 +» between two 24px buttons (fix round 1); 20px from the column.
  assert.deepEqual(valuesOf(sheet, ".g-roster__layout", "grid-template-columns"), ["minmax(0, 1fr) clamp(340px, 34%, 380px)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__layout", "gap"), ["var(--space-16)", "var(--space-20)"], "a phone's column, then a desk's 20px");
  assert.ok(valuesOf(sheet, ".g-roster__aside", "position").includes("sticky"));
  assert.deepEqual([valuesOf(sheet, ".g-roster__aside", "padding"), valuesOf(sheet, ".g-roster__aside", "border-radius")], [["var(--space-20)"], ["var(--radius-2xl)"]]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__heading", "font"), ["700 26px/1.1 var(--font-display)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__heading", "text-transform"), ["none"]);
  // Stats.html's and StatsMngDead.html's open row: its words 16px from the screen's edge, which is the frame's padding
  // here, so the panel pads none of its own; its band is the screen's width, carried over that padding (roster-table.css).
  for (const [file, selector] of [[sheet, ".g-roster__rowpanel"], ["src/screens/team/roster/marks.css", ".g-fallen__rowpanel"]]) {
    assert.deepEqual(valuesOf(file, selector, "padding"), ["var(--space-4) 0 var(--space-14)"], selector);
  }
  // The band rides on the open row's cells, never on its <tbody>: WebKit (a coach's iPhone) paints no row group's shadow.
  const table = "src/ui/roster-table.css";
  const open = ".g-rtable__player.is-expanded > tr >";
  const lastShown = ":nth-last-child(1 of :not(.g-rtable__c--desk))";
  assert.deepEqual(valuesOf(table, ".g-rtable__player.is-expanded", "box-shadow"), []);
  assert.deepEqual(valuesOf(table, `${open} :first-child`, "box-shadow"), ["calc(-1 * var(--view-side)) 0 var(--surface-2)"]);
  assert.deepEqual(valuesOf(table, `${open} ${lastShown}`, "box-shadow"), ["var(--view-side) 0 var(--surface-2)"]);
  assert.deepEqual(valuesOf(table, `${open} :first-child${lastShown}`, "box-shadow"), ["calc(-1 * var(--view-side)) 0 var(--surface-2), var(--view-side) 0 var(--surface-2)"]);
  for (const file of [sheet, "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css"]) assert.ok(assertBreakpoints(file).length > 0, file);
  // The roster chain in this order (K5): its own sheet, 07b's marks.css, its sheets' and its frame's, 07c's market.css after
  // the fidelity pass's frame.css, then 07d's sheets in the order of their tasks — those there yet; others may follow them.
  const styles = text("src/styles.css");
  const chain = ["roster.css", "marks.css", "sheets.css", "frame.css", "market.css", "profile.css", "player-sheets.css", "advance.css", "rolls.css", "fix.css", "career.css"]
    .map((name) => styles.indexOf(`@import url("screens/team/roster/${name}");`));
  assert.ok(chain.every((at) => at >= 0), "07a to 07c's, 07d's profile.css, player-sheets.css, advance.css, rolls.css and fix.css, and 07e's career.css reach the page");
  const present = chain.filter((at) => at >= 0);
  assert.deepEqual(present, [...present].sort((a, b) => a - b));
});

test("the counters: six two to a row (one where two do not fit), the narrow ones as many to a row as leave each button a thumb's width; the SPP line quiet, its sum in the accent", () => {
  const sheet = "src/screens/team/roster/roster.css";
  // Two to a row, or one where two do not fit (under about 312px): never more than two.
  assert.deepEqual(valuesOf(sheet, ".g-roster__counters", "grid-template-columns"), ["repeat(auto-fit, minmax(max(var(--roster-full), calc((100% - var(--space-8)) / 2)), 1fr))"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster", "--roster-full"), ["calc(2 * var(--size-touch) + 48px)"]);
  // A phone's narrow tile is two 44px buttons, their gap, the cell's padding and border: three of them fit from about 342px.
  assert.deepEqual(valuesOf(sheet, ".g-roster__extra", "grid-template-columns"), ["repeat(auto-fit, minmax(var(--roster-tile), 1fr))"]);
  // D1: a desk's nine, three by three (DeskRosterLive.html), 6px apart.
  assert.deepEqual([valuesOf(sheet, ".g-roster__tiles", "grid-template-columns"), valuesOf(sheet, ".g-roster__tiles", "gap")], [["repeat(3, minmax(0, 1fr))"], ["var(--space-6)"]]);
  assert.deepEqual(valuesOf(sheet, ".g-roster", "--roster-tile"), ["calc(2 * var(--size-touch) + 10px)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__sppline", "font"), ["400 13px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__sppline", "color"), ["var(--muted)"]);
  assert.deepEqual([valuesOf(sheet, ".g-roster__sppdelta", "font-weight"), valuesOf(sheet, ".g-roster__sppdelta", "color")], [["600"], ["var(--accent-text)"]]);
  // Carry T9: text the 2.x globals could reach says what it is in full.
  for (const selector of [".g-roster__avail", ".g-roster__availn", ".g-roster__availl", ".g-roster__ledger", ".g-roster__cheapest", ".g-roster__access", ".g-roster__next",
    ".g-roster__sppline", ".g-roster__manualtitle"]) {
    assert.deepEqual(valuesOf(sheet, selector, "text-transform"), ["none"], selector);
  }
  for (const selector of [".g-roster__from", ".g-roster__nopage"]) assert.deepEqual(valuesOf("src/screens/team/roster/sheets.css", selector, "text-transform"), ["none"], selector);
  for (const selector of [".g-roster__avail", ".g-roster__ledger", ".g-roster__cheapest", ".g-roster__access"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background")], [["0"], ["none"]], selector);
  }
  assert.deepEqual([valuesOf("src/screens/team/roster/sheets.css", ".g-roster__nopage", "border"), valuesOf("src/screens/team/roster/sheets.css", ".g-roster__nopage", "background")], [["0"], ["none"]]);
});

test("a skill card in the panel opens the rule, so it is a finger's 44px high: its padding and two lines alone make 43", () => {
  const sheet = "src/screens/team/roster/roster.css";
  assert.deepEqual(valuesOf(sheet, ".g-roster__pblock .g-skill--card", "min-height"), ["var(--size-touch)"]);
});

test("the words of the screen are readable in every palette, on the page, the panel and its SPP block", () => {
  const sheet = "src/screens/team/roster/roster.css";
  for (const selector of [".g-roster__count", ".g-roster__loading"]) assertReadable(sheet, selector, "color", ["--page"], 4.5);
  for (const selector of [".g-roster__pline", ".g-roster__access", ".g-roster__next"]) assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  for (const selector of [".g-roster__ledger", ".g-roster__cheapest", ".g-roster__availl"]) assertReadable(sheet, selector, "color", ["--surface-2"], 4.5);
  // 40px bold: large text, 3:1.
  assertReadable(sheet, ".g-roster__availn", "color", ["--surface-2"], 3);
  // The SPP line and its sum stand on the open row's tint and on the panel's block, the sheet's lines on the sheet.
  for (const selector of [".g-roster__sppline", ".g-roster__sppdelta", ".g-roster__sppdelta--none", ".g-roster__manualtitle"]) assertReadable(sheet, selector, "color", ["--surface-2"], 4.5);
  // The skill sheet's owner line in its box (StatsSkill.html), and a skill with no page, on the sheet.
  assertReadable("src/screens/team/roster/sheets.css", ".g-roster__from", "color", ["--surface-2"], 4.5);
  // A gained skill's box is on the accent's tint with its own ink, as StatsSkill.html's #E4F0E9 and #163A28; the grey box is not repainted.
  assert.deepEqual([valuesOf("src/screens/team/roster/sheets.css", ".g-roster__from--gained", "background"), valuesOf("src/screens/team/roster/sheets.css", ".g-roster__from--gained", "color")],
    [["var(--accent-tint)"], ["var(--on-accent-tint)"]]);
  assertReadable("src/screens/team/roster/sheets.css", ".g-roster__from--gained", "color", ["--accent-tint"], 4.5);
  assertReadable("src/screens/team/roster/sheets.css", ".g-roster__nopage", "color", ["--surface"], 4.5);
  // The bold parts of the panel's lines and the state of the next match, in red when he will not play.
  assertReadable(sheet, ".g-roster__next b", "color", ["--surface"], 4.5);
  assertReadable(sheet, ".g-roster__next .g-roster__nextstate--alert", "color", ["--surface"], 4.5);
  assertReadable(sheet, ".g-roster__sppctx b", "color", ["--surface-2"], 4.5);
  // The save's status as a dot and words on the page: readable without the capsule it had.
  assertReadable(sheet, ".g-roster__status .g-status--live", "color", ["--page"], 4.5);
  // The match's note under the panel's tiles, on its block.
  assertReadable(sheet, ".g-roster__matchnote", "color", ["--surface-2"], 4.5);
});

test("the banner's action: up to 900px a line of its own whose switch and link may wrap; the link one line and a thumb tall (K9)", () => {
  const sheet = "src/screens/team/roster/roster.css";
  const phone = mediaText(sheet, "max-width: 900px");
  assert.match(phone, /\.g-roster__notices \.g-callout__action \{[^}]*white-space: normal;[^}]*flex-basis: 100%;/);
  assert.deepEqual(valuesOf(sheet, ".g-roster__notices .g-callout__action", "white-space"), ["normal"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__notices .g-callout__action", "flex-basis"), ["100%"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutactions", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutlink", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutlink", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutlink", "color"), ["inherit"], "the banner's own ink, readable on its tint");
  // A closed «Advance» keeps its resting look under the pointer: button.css lights a primary that is not :disabled.
  assert.deepEqual(valuesOf(sheet, '.g-btn--primary.g-roster__closed[aria-disabled="true"]:hover', "background"), ["var(--disabled)"]);
  for (const selector of [".g-roster__calloutlink", ".g-roster__matchnote"]) assert.deepEqual(valuesOf(sheet, selector, "text-transform"), ["none"], selector);
});

test("the injury's sheet: the characteristic's caption over its five chips in one row, the note quiet and readable", () => {
  const sheet = "src/screens/team/roster/sheets.css";
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurystat .g-chips", "grid-template-columns"), ["repeat(5, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurystat .g-chip", "justify-content"), ["center"]);
  // StatsLiveInjury.html, StatsMng.html: rounded squares on --surface-3, no ring, the chosen one on the accent.
  assert.deepEqual([valuesOf(sheet, ".g-roster__injurystat .g-chip", "border-radius"), valuesOf(sheet, ".g-roster__injurystat .g-chip", "box-shadow")], [["var(--radius-md)"], ["none"]]);
  assert.deepEqual(valuesOf(sheet, '.g-roster__injurystat .g-chip[aria-checked="true"]', "background"), ["var(--accent)"]);
  assertReadable(sheet, '.g-roster__injurystat .g-chip[aria-checked="true"]', "color", ["--accent"], 4.5);
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurylabel", "text-transform"), ["uppercase"]);
  // A missed match's caption is a sentence.
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurylabel--plain", "text-transform"), ["none"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurynote", "text-transform"), ["none"]);
  for (const selector of [".g-roster__injurylabel", ".g-roster__injurynote"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background")], [["0"], ["none"]], selector);
    assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  }
});

// The owner's fidelity pass (2026-10-19): what the prototypes draw that the roster drew otherwise.
test("under the tables a line on how to read them: a desk's columns and click; a phone's tap and what each action is worth to the race", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(view.querySelector(".g-roster__main .g-roster__caption").textContent,
    "SPP: «Total» — earned in the career, «Avail.» — available to advance. In green — skills gained and characteristics raised. A click on a row opens the player on the right.");
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(view.querySelector(".g-roster__caption").textContent,
      "Tap a player for his SPP counters, his profile and a missed match. In green — characteristics raised and skills gained. SPP: TD 3 · CAS 2 · COMP 1 · KO 1 · INT 2 · MVP 5.");
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.match(view.querySelector(".g-roster__caption").textContent, /^Tap a player for the match's counters, his profile and an injury in the match\./);
  });
});

test("what he may spend is green only when it buys an advancement: he plays and has the cheapest one's SPP (DeskRoster.html)", async () => {
  const avail = (key) => bodyOf(key).querySelectorAll(".g-rtable__row td").at(-1);
  coach({ teamAnswer: team({ roster: { players: PLAYERS.map((player) => (player.id === "p4" ? { ...player, spp: { touchdowns: 1 } } : player)) } }) });
  await renderTeamRoster("t1");
  assert.ok(avail("p2#0").classList.contains("g-rtable__c--strong"), "Bors: 3 SPP, the cheapest is 3");
  assert.ok(avail("p1#0").classList.contains("g-rtable__c--quiet"), "Ann: none");
  assert.ok(avail("p4#0").classList.contains("g-rtable__c--quiet"), "Dell has 3 but misses the match");
});

test("a match's banner: a dot, the match and its records on one line on a desk; on a phone the records at the right and the switch says what it is for", async () => {
  await withoutTimers(async () => {
    coach({ events: [rowOf({ id: "e0" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const title = banner().querySelector(".g-callout__title");
    assert.equal(title.textContent, "Match on · round 3 · records: 1");
    assert.ok(title.querySelector(".g-roster__livedot"));
    assert.equal(title.querySelector(".g-roster__livecount").textContent, "records: 1");
    assert.equal(outsideSwitch().querySelector(".g-toggle__caption"), null, "a desk: the caption is the switch's description");
    assert.equal(view.querySelector(`#${outsideSwitch().getAttribute("aria-describedby")}`).textContent, "fix an old mistake without touching round 3");
    await withWindow({ phone: true }, async () => {
      coach({ events: [rowOf({ id: "e0" })] });
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      assert.equal(titleOf(banner()), "Match on · round 3 · records: 1", "the same words");
      assert.equal(outsideSwitch().querySelector(".g-toggle__caption").textContent, "fix an old mistake without touching round 3");
      assert.equal(outsideSwitch().hasAttribute("aria-describedby"), false, "said once, in the switch");
    });
    const frame = "src/screens/team/roster/frame.css";
    assert.deepEqual(valuesOf(frame, ".g-roster__livesep", "display"), ["none"], "a phone drops the separator, the records go right");
    assert.deepEqual(valuesOf(frame, ".g-roster__livecount", "margin-left"), ["auto"]);
  });
});

test("another device's save: the banner has no sign, and «Load the new one» stands under the words (SaveConflict.html)", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.reply(PATCH, 409, conflictOf(withSpp("p1", { touchdowns: 4 }, { revision: 5 })));
      fireEvent(plus("touchdowns"), "click");
      await settle();
      const conflict = view.querySelector(".g-roster__notices .g-roster__conflict");
      assert.ok(conflict.querySelector(".g-callout--danger [data-roster-reload]"));
      assert.ok(view.querySelector(".g-roster__status .g-status--danger"), "the status beside «Active roster»: a dot and its words");
    });
  });
  const frame = "src/screens/team/roster/frame.css";
  assert.deepEqual(valuesOf(frame, ".g-roster__conflict .g-callout__icon", "display"), ["none"]);
  assert.deepEqual(valuesOf(frame, ".g-roster__conflict .g-callout__action", "flex-basis"), ["100%"]);
  assert.deepEqual(valuesOf(frame, ".g-roster__conflict .g-btn--primary", "min-height"), ["var(--size-touch)", "40px"], "a thumb on a phone, 40px on a desk (D2)");
  // The status is a dot and its words, no capsule.
  assert.deepEqual([valuesOf("src/screens/team/roster/roster.css", ".g-roster__status .g-status", "background"), valuesOf("src/screens/team/roster/roster.css", ".g-roster__status .g-status", "padding")], [["transparent"], ["0"]]);
});

// Fix round 1 of the fidelity pass.
test("an injury recorded in the match names itself: «Injury: Seriously Hurt» in the pair, and the next match says it in red", async () => {
  await withoutTimers(async () => {
    coach({ events: [injuryRow({ code: "miss" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(injuryButton().textContent, "Injury: Seriously Hurt", "the pair's first place (DeskRosterLive.html)");
    assert.ok(injuryButton().closest(".g-roster__actions"));
    const next = aside().querySelector(".g-roster__next");
    assert.equal(next.textContent, "Next match: injury in the match: Seriously Hurt");
    assert.ok(next.querySelector("b").classList.contains("g-roster__nextstate--alert"));
    // A lasting one with its characteristic; one with none recorded keeps «Injury in the match…».
    coach({ events: [injuryRow({ code: "lasting", stat: "ag" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(injuryButton().textContent, "Injury: Lasting Injury (AG)");
    assert.equal(aside().querySelector(".g-roster__next").textContent, "Next match: injury in the match: Lasting Injury (AG)");
    fireEvent(toggle("p2#0"), "click");
    assert.equal(injuryButton().textContent, "Injury in the match…");
    assert.equal(aside().querySelector(".g-roster__next").textContent, "Next match: Plays");
    await withWindow({ phone: true }, async () => {
      coach({ events: [injuryRow({ code: "miss" })] });
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      fireEvent(toggle("p1#0"), "click");
      assert.equal(injuryButton(openRow()).textContent, "Injury: Seriously Hurt", "the phone's pair too (Stats.html)");
    });
  });
});

test("bold words keep a coach's «$&» and «$<» as he wrote them: they are no replacement patterns", async () => {
  const { boldWords } = await import("../src/screens/team/roster/panel.mjs");
  assert.equal(boldWords("teamRoster.nextMatch", { state: "Paid $& twice $<x> $' $1" }, ["state"]), "Next match: <b>Paid $&amp; twice $&lt;x&gt; $&#39; $1</b>");
  coach({ teamAnswer: team({ roster: { players: PLAYERS.map((player) => (player.id === "p4" ? { ...player, absence: { code: "other", note: "Paid $& twice" } } : player)) } }) });
  await renderTeamRoster("t1");
  fireEvent(toggle("p4#0"), "click");
  assert.equal(aside().querySelector(".g-roster__next").textContent, "Next match: Paid $& twice · sits it out");
});

test("the way to a player's page is checked as every link is: a javascript: address throws", async () => {
  const { profileLinkMarkup } = await import("../src/screens/team/roster/panel.mjs");
  assert.match(profileLinkMarkup("Profile", "#/t/t1/roster/p1"), /^<a class="g-btn g-btn--dark g-btn--block" href="#\/t\/t1\/roster\/p1">Profile<svg/);
  assert.throws(() => profileLinkMarkup("Profile", " javascript:alert(1)"), /javascript/);
});

test("the banners say their prototype's words: a desk's preparation (DeskRosterPrep), a phone's match with the switch on (StatsLive)", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([PREP_GAME]);
    await renderTeamRoster("t1");
    assert.equal(subOf(banner()), "Hiring, selling and missed matches reset the steps «Roster», «Inducements» and «Start». Fans and weather stay.",
      "a desk saves the roster by hiring, selling and marks only (D3)");
    await withWindow({ phone: true }, async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      assert.equal(subOf(banner()), "Taps are recorded in round 3: they show in the career at once and fill in the post-match by themselves. Hiring, selling, advancement and the treasury — after the post-match.");
      fireEvent(outsideSwitch(), "click");
      assert.equal(titleOf(banner()), "Edit outside the match · records: 0");
      assert.equal(subOf(banner()), "Taps change the career but will not go into round 3 or its post-match. Switch it off to record the match again.");
    });
  });
  // At 901 to about 1100px the column is narrow: the banner's action gives way and wraps under the words.
  const frame = "src/screens/team/roster/frame.css";
  assert.deepEqual([valuesOf(frame, ".g-roster__notices .g-callout__action", "flex"), valuesOf(frame, ".g-roster__notices .g-callout__action", "white-space"),
    valuesOf(frame, ".g-roster__notices .g-callout__action", "min-width")], [["0 1 auto"], ["normal"], ["0"]]);
});

test("D2: every compact control a desk's roster draws is 24px or more", () => {
  const px = (value) => Number(String(value).replace(/px$/, ""));
  const desk = (file) => mediaText(file, "min-width: 901px");
  const sizes = [
    ["src/screens/team/roster/frame.css", /\.g-roster__aside \.g-roster__edit \{[^}]*width: (\d+)px;[^}]*height: (\d+)px;/, "the pencil"],
    ["src/screens/team/roster/frame.css", /\.g-roster__aside \.g-roster__spp \.g-btn--primary \{[^}]*height: (\d+)px;/, "«Advance»"],
    ["src/screens/team/roster/frame.css", /\.g-roster__actions > \.g-btn \{ min-height: (\d+)px; \}/, "the pair of actions"],
    ["src/screens/team/roster/sheets.css", /\.g-roster__injurystat \.g-chip \{ min-height: (\d+)px; \}/, "a modal sheet's characteristic chip"],
  ];
  for (const [file, rule, what] of sizes) {
    const found = desk(file).match(rule);
    assert.ok(found, `${what}: ${file}`);
    for (const value of found.slice(1)) assert.ok(px(value) >= 24, `${what}: ${value}px`);
  }
});

// Fix round 2: the desk panel shows the whole of itself, as DeskRosterLive.html's, and the page scrolls.
test("the desk panel sticks only while the whole of it fits the window; taller, it goes with the page; it never scrolls in itself", async () => {
  const { STICKY_TOP, TALL, fitsWindow } = await import("../src/screens/team/roster/aside-fit.mjs");
  assert.equal(STICKY_TOP, 24, "roster.css's top: var(--space-24)");
  assert.equal(fitsWindow(876, 900), true, "876 + 24 = the window's 900");
  assert.equal(fitsWindow(877, 900), false);
  let height = 600;
  const sized = () => {
    aside().getBoundingClientRect = () => ({ top: 0, bottom: height, left: 0, right: 380, width: 380, height });
  };
  globalThis.innerHeight = 900;
  try {
    coach();
    await renderTeamRoster("t1");
    sized();
    page.dispatchEvent(new Event("resize"));
    assert.equal(aside().classList.contains(TALL), false, "it fits: it sticks");
    height = 1200;
    page.dispatchEvent(new Event("resize"));
    assert.equal(aside().classList.contains(TALL), true, "taller than the window: it goes with the page");
    // A draw measures it again, with no resize: the class follows the panel's height, not the markup's.
    fireEvent(toggle("p2#0"), "click");
    sized();
    fireEvent(toggle("p3#0"), "click");
    assert.ok(!text("src/screens/team/roster/view.mjs").includes("aside--tall"), "the markup never carries it: only the measure does");
    assert.equal(aside().classList.contains(TALL), true, "re-measured after the draw");
    height = 500;
    page.dispatchEvent(new Event("resize"));
    assert.equal(aside().classList.contains(TALL), false, "it fits again: it sticks again");
    // Left, the screen measures nothing more.
    releaseCurrentScreen();
    height = 1300;
    page.dispatchEvent(new Event("resize"));
    assert.equal(aside().classList.contains(TALL), false, "the window's resize is no longer heard");
  } finally {
    delete globalThis.innerHeight;
  }
  // No scroll box of its own on a desk; sticky unless tall.
  const sheet = "src/screens/team/roster/roster.css";
  for (const property of ["overflow", "overflow-y", "max-height"]) {
    assert.deepEqual(valuesOf(sheet, ".g-roster__aside", property), [], `.g-roster__aside sets no ${property}`);
    assert.deepEqual(valuesOf("src/screens/team/roster/frame.css", ".g-roster__aside", property), [], `frame.css: no ${property}`);
  }
  assert.deepEqual(valuesOf(sheet, ".g-roster__aside", "position"), ["sticky"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__aside", "top"), ["var(--space-24)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__aside--tall", "position"), ["static"]);
  assert.ok(!/style=/.test(text("src/screens/team/roster/aside-fit.mjs").replace(/\/\*[\s\S]*?\*\//g, "")), "a class, never an inline style");
});

test("the player's address: a fallen player's profile, else the 2.x editor until stage 07d", () => {
  const router = text("src/core/router.mjs");
  assert.ok(router.includes("teamRoster: ({ teamId }) => renderTeamRoster(teamId),"));
  assert.ok(router.includes("teamPlayer: ({ teamId, playerId }) => renderTeamPlayer(teamId, playerId),"));
});

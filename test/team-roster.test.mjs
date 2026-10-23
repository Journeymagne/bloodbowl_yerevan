import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  EVENTS, KEYS, LIVE_GAME, NAMES, PATCH, PLAYERS, api, aside, bodies, bodyOf, callKeys, chipIn, coach, conflictOf,
  countOf, deltaOf, gamesAre, invalidateGames, labelOf, leaving, loadGames, minus, notice, onPhone, openRow, order,
  page, patches, plus, posts, refusalOf, releaseCurrentScreen, renderTeamRoster, rowOf, save, settle, sheet, sppLine,
  status, stepButtons, team, teamPlayerUrl, toasts, toggle, view, withSpp,
} from "./helpers/roster-screen.mjs";

// The roster screen (stage 07a and on): its rows, the desk's panel and the phone's open row, the sort, the skills' rules,
// the counters and the saves they make, another device's save, the network, a refusal, the focus after a redraw, and a
// roster that cannot be drawn. The page it stands on is test/helpers/roster-screen.mjs; a preparation and a match are in
// team-roster-match, the treasury strip in team-roster-strip, the stylesheets, words and prototypes in team-roster-look.

test("the roster of a team: a band «Roster» with its counts, «Active roster» with the number, a row per player in the roster's order", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(view.querySelector("h1").textContent, "Roster");
  assert.equal(document.activeElement, view.querySelector("h1"), "the title takes the focus");
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "On the roster: 7 · missing a match: 1 · can advance: 1");
  assert.match(view.querySelector("#roster-heading").textContent, /^Active roster 6$/);
  assert.equal(view.querySelector("[data-screen]").getAttribute("data-screen"), "team-roster");
  assert.equal(view.querySelector("table.g-rtable").getAttribute("aria-label"), "Players of Ashgrove Wardens");
  // Dell misses the next match: he is in «Missing the match», under the others (stage 07b).
  const last = (list) => [...list.slice(0, 3), ...list.slice(4), list[3]];
  assert.deepEqual(order(), last(NAMES));
  assert.deepEqual(bodies().map((body) => body.getAttribute("data-key")), last(KEYS));
  assert.deepEqual(view.querySelector("table.g-rtable").querySelectorAll(".g-rtable__groups .g-rtable__g").map((cell) => cell.textContent), ["", "Characteristics", "Career", "SPP"]);
  api.assertAnswered();
});

test("before the roster comes the screen says it is loading it", async () => {
  coach();
  const held = api.hold("GET /api/teams/t1");
  const drawing = renderTeamRoster("t1");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the roster…");
  assert.equal(view.querySelector("table"), null);
  assert.equal(view.querySelector(".g-pagehead__sub"), null, "no counts before there is a roster to count");
  held.release();
  await drawing;
  assert.equal(view.querySelector(".g-roster__loading"), null);
  assert.equal(bodies().length, 7);
});

test("a row: the number on the position's colour, the captain's «C», the name, the position and the five characteristics; a changed one says so; one who misses the match says that instead", async () => {
  coach();
  await renderTeamRoster("t1");
  const captain = bodyOf("p2#0");
  assert.ok(captain.querySelector(".g-num--blitzer .g-num__captain"));
  assert.equal(captain.querySelector(".g-rtable__sub").textContent, "Blitzer");
  assert.deepEqual(captain.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["7", "3", "3+", "4+", "9+"]);
  const agility = bodyOf("p3#0").querySelectorAll(".g-rtable__row td")[2];
  assert.ok(agility.classList.contains("g-rtable__c--up"));
  assert.equal(agility.textContent, "2+ improved");
  const skipping = bodyOf("p4#0").querySelector(".g-rtable__sub");
  assert.ok(skipping.classList.contains("g-rtable__sub--alert"));
  assert.equal(skipping.textContent, "Misses the next match");
  // The career and the SPP: a zero is quiet, what he may spend is strong.
  const cells = captain.querySelectorAll(".g-rtable__row td");
  assert.equal(cells[5].textContent, "1");
  assert.ok(cells[6].classList.contains("g-rtable__c--zero"));
  assert.deepEqual([cells[11].textContent, cells[12].textContent], ["3", "3"]);
  assert.ok(cells[12].classList.contains("g-rtable__c--strong"));
});

test("on a desk the first player stands in the panel; a press on another moves him there and marks his row, and a second press keeps him", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    assert.ok(bodyOf("p1#0").classList.contains("is-selected"));
    fireEvent(toggle("p2#0"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p2#0");
    assert.ok(bodyOf("p2#0").classList.contains("is-selected"));
    assert.equal(bodyOf("p1#0").classList.contains("is-selected"), false);
    fireEvent(toggle("p2#0"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p2#0", "a second press keeps him");
    assert.equal(view.querySelector(".g-rtable__panelrow"), null, "a desk opens no row");
  });
});

test("on a desk a player's button chooses him for the panel: it names the panel and marks the one in it, and says nothing of opening (R11)", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("id"), "roster-aside");
    assert.equal(aside().getAttribute("aria-label"), "The player");
    for (const key of KEYS) {
      assert.equal(toggle(key).getAttribute("aria-controls"), "roster-aside");
      assert.equal(toggle(key).hasAttribute("aria-expanded"), false);
    }
    assert.deepEqual(KEYS.filter((key) => toggle(key).getAttribute("aria-current") === "true"), ["p1#0"]);
  });
});

test("on a phone a press opens the player's row and the next press closes it; one row is open at a time", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    const open = () => bodies().filter((body) => body.querySelector(".g-rtable__panelrow")).map((body) => body.getAttribute("data-key"));
    assert.deepEqual(open(), [], "nothing is open at first");
    assert.equal(toggle("p1#0").getAttribute("aria-expanded"), "false");
    assert.equal(toggle("p1#0").hasAttribute("aria-current"), false, "a phone marks no player for a panel it does not show");
    fireEvent(toggle("p2#0"), "click");
    assert.deepEqual(open(), ["p2#0"]);
    assert.equal(toggle("p2#0").getAttribute("aria-expanded"), "true");
    assert.equal(toggle("p2#0").getAttribute("aria-controls"), view.querySelector(".g-rtable__panelrow").getAttribute("id"));
    fireEvent(toggle("p3#0"), "click");
    assert.deepEqual(open(), ["p3#0"]);
    assert.equal(toggle("p2#0").getAttribute("aria-expanded"), "false");
    fireEvent(toggle("p3#0"), "click");
    assert.deepEqual(open(), []);
  });
});

test("the row's button follows the width: crossing 900px draws the screen again, and a screen left listens no more (R11)", async () => {
  const listeners = new Set();
  const media = { matches: false, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  try {
    coach();
    await renderTeamRoster("t1");
    assert.equal(listeners.size, 1);
    fireEvent(toggle("p2#0"), "click");
    assert.equal(toggle("p2#0").getAttribute("aria-current"), "true");
    media.matches = true;
    listeners.forEach((listener) => listener());
    assert.equal(toggle("p2#0").getAttribute("aria-expanded"), "true", "the player chosen on the desk is the row open on the phone");
    assert.ok(bodyOf("p2#0").querySelector(".g-rtable__panelrow"));
    releaseCurrentScreen();
    assert.equal(listeners.size, 0);
  } finally {
    delete globalThis.matchMedia;
  }
});

test("another team's roster starts at the top of the page; the same team's drawn again stays where the coach was", async () => {
  await withWindow({ phone: false }, async ({ scrolls, scrollPage }) => {
    coach();
    await renderTeamRoster("t1");
    scrollPage(600);
    scrolls.length = 0;
    // The same roster drawn again (a language switch) keeps the place.
    releaseCurrentScreen();
    await renderTeamRoster("t1");
    assert.deepEqual(scrolls, []);
    // The switcher opens the other team's roster from this one: a page of its own.
    api.reply("GET /api/teams/t2", 200, { team: team({ id: "t2", name: "Grimtusk Raiders" }) });
    api.reply("GET /api/teams/t2/events", 200, { events: [], revision: 4 });
    api.reply("GET /api/teams/t2/fallen", 200, { fallen: [] });
    releaseCurrentScreen();
    await renderTeamRoster("t2");
    assert.deepEqual(scrolls.at(-1), [0, 0]);
    assert.equal(view.querySelector("table").getAttribute("aria-label"), "Players of Grimtusk Raiders");
  });
});

test("a header sorts the table, the next press turns it round, and the order stays when the screen is drawn again and after a visit elsewhere", async () => {
  coach();
  await renderTeamRoster("t1");
  const head = () => view.querySelector('[data-sort-key="ma"]').closest("th");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  // Dell, who misses the next match, is sorted in his own table under the others (stage 07b).
  assert.deepEqual(order(), ["Cade", "Bors", "Ann", "Edda", "Finn", "Grom", "Dell"]);
  assert.equal(head().getAttribute("aria-sort"), "descending");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  assert.deepEqual(order(), ["Grom", "Ann", "Edda", "Finn", "Bors", "Cade", "Dell"]);
  assert.equal(head().getAttribute("aria-sort"), "ascending");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  await renderTeamRoster("t1");
  assert.deepEqual(order(), ["Grom", "Ann", "Edda", "Finn", "Bors", "Cade", "Dell"]);
  assert.equal(head().getAttribute("aria-sort"), "ascending");
  // The player's column puts them back by their numbers, the lowest first.
  fireEvent(view.querySelector('[data-sort-key="player"]'), "click");
  assert.deepEqual(order(), ["Ann", "Bors", "Cade", "Edda", "Finn", "Grom", "Dell"]);
});

test("a skill chip opens its rule: the name as written, its category and type, the rule, the player and where the skill came from; closed, the focus is back on the chip", async () => {
  coach();
  await renderTeamRoster("t1");
  const chip = chipIn(bodyOf("p2#0").querySelector(".g-rtable__skills--desk"), "Mighty Blow");
  fireEvent(chip, "click");
  const dialog = sheet();
  assert.ok(dialog?.isModal, "the sheet is open, modally");
  assert.equal(dialog.querySelector("h2").textContent, "Mighty Blow");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "Strength · Active");
  assert.ok(dialog.querySelector(".g-sheet__body .g-prose").textContent.length > 20, "the rule from the reference");
  assert.equal(dialog.querySelector(".g-roster__from").textContent, "Bors · primary");
  fireEvent(dialog.querySelector("[data-sheet-close]"), "click");
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, chip);
});

test("the sheet's box says whose skill it is: a skill an advancement gave, by the advancement and on the accent's tint; a starting one in 07a's words on the grey (fidelity F8, StatsSkill.html)", async () => {
  const bors = { ...PLAYERS[1], extraSkills: [{ name: "Dodge", access: "primary" }, { name: "Mighty Blow", access: "primary" }],
    advancements: [{ type: "random", grants: { skill: "Dodge" } }, { type: "primary", grants: { skill: "Mighty Blow" } }] };
  coach({ teamAnswer: team({ roster: { players: [bors] } }) });
  await renderTeamRoster("t1");
  const boxOf = (name) => {
    fireEvent(chipIn(bodyOf("p2#0").querySelector(".g-rtable__skills--desk"), name), "click");
    const box = sheet().querySelector(".g-roster__from");
    const said = [box.textContent, box.getAttribute("class")];
    fireEvent(sheet().querySelector("[data-sheet-close]"), "click");
    return said;
  };
  assert.deepEqual(boxOf("Dodge"), ["Bors · Random primary", "g-roster__from g-roster__from--gained"]);
  assert.deepEqual(boxOf("Mighty Blow"), ["Bors · Chosen primary", "g-roster__from g-roster__from--gained"]);
  assert.deepEqual(boxOf("Block"), ["Bors · starting", "g-roster__from"]);
});

test("a chip in the panel opens the same rule; a skill with a number in it opens its template's rule under the name the player has", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(toggle("p7#0"), "click");
  const loner = chipIn(aside(), "Loner (3+)");
  assert.ok(loner.classList.contains("g-skill--card"));
  fireEvent(loner, "click");
  assert.equal(sheet().querySelector("h2").textContent, "Loner (3+)");
  assert.equal(sheet().querySelector(".g-roster__from").textContent, "Grom · starting");
  assert.ok(sheet().querySelector(".g-prose"), "Loner (X+)'s rule");
  // A redraw while it is open (the games came again) keeps it open.
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  const { invalidateGames, loadGames } = await import("../src/data/games.mjs");
  await invalidateGames();
  assert.ok(sheet()?.isModal);
  fireEvent(sheet(), "keydown", { key: "Escape" });
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, loner);
});

test("a skill the reference has no page for opens all the same and says so", async () => {
  coach({ teamAnswer: team({ roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: "Ann", extraSkills: [{ name: "No Such Skill" }] }] } }) });
  await renderTeamRoster("t1");
  fireEvent(chipIn(bodyOf("p1#0"), "No Such Skill"), "click");
  assert.equal(sheet().querySelector("h2").textContent, "No Such Skill");
  assert.equal(sheet().querySelector(".g-roster__nopage").textContent, "The reference has no page for this skill.");
  assert.equal(sheet().querySelector(".g-sheet__sub"), null);
  assert.equal(sheet().querySelector(".g-roster__from").textContent, "Ann · primary");
});

test("«Profile and advancement» on a phone leads to the player's address (the roster's player mode, stage 07d); on a desk «Advance» opens his advancement and the pencil his edit", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
    const profile = view.querySelector(".g-rtable__panelrow a.g-btn--dark");
    assert.equal(profile.textContent, "Profile and advancement");
    assert.equal(profile.getAttribute("href"), teamPlayerUrl("t1", "p2"));
  });
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
    // Stage 07d, Task 9: «Advance» is a button that opens the advancement's window (DeskRosterAdv.html), not a link.
    const advance = aside().querySelector('button.g-btn--primary[data-player-advance="p2#0"]');
    assert.equal(advance.textContent, "Advance");
    assert.equal(advance.getAttribute("aria-haspopup"), "dialog");
    assert.equal(aside().querySelector("a"), null, "no link to his page in the panel");
    // Stage 07d, Task 8: the pencil is a button that opens the edit of his number, name and captaincy, not a link.
    assert.ok(!aside().querySelector("a.g-roster__edit"), "no link");
    const pencil = aside().querySelector('button.g-roster__edit[data-player-edit="p2#0"]');
    assert.equal(pencil.getAttribute("aria-label"), "Edit Bors");
    assert.equal(pencil.getAttribute("aria-haspopup"), "dialog");
    assert.equal(pencil.hasAttribute("href"), false);
  });
});

test("a player the roster stores no id for has no way to a page: an empty id would make the roster's own address", async () => {
  const players = [{ rowIndex: 0, number: "1", name: "Nobody" }];
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: team({ roster: { players } }) });
    await renderTeamRoster("t1");
    fireEvent(toggle("#0"), "click");
    assert.ok(view.querySelector(".g-roster__rowpanel"));
    assert.equal(view.querySelector(".g-rtable__panelrow a"), null);
    // Nor can a save name him: his counters are closed, and say why.
    const steps = openRow().querySelectorAll("[data-action-step]");
    assert.equal(steps.length, 18);
    for (const button of steps) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), "This player has no id in the roster, so the counters cannot be saved. Ask the league administrator to fix the roster.");
    }
  });
  coach({ teamAnswer: team({ roster: { players } }) });
  await renderTeamRoster("t1");
  assert.equal(aside().querySelector("a"), null, "neither «Advance» nor the pencil");
  assert.ok(aside().querySelector(".g-roster__cheapest"));
  assert.equal(aside().querySelector("[data-action-step]"), null, "a desk's panel has no counters outside a match (D3)");
});

test("the desk panel: badge, name, position and value, the characteristics, SPP available, earned and spent, the advancements, the cheapest one, the skills as cards with their source, the access, the next match", async () => {
  coach();
  await renderTeamRoster("t1");
  const panel = aside();
  assert.equal(panel.getAttribute("data-panel-player"), "p1#0");
  assert.ok(panel.querySelector(".g-num--lg.g-num--lineman"));
  assert.equal(panel.querySelector(".g-roster__pname").textContent, "Ann");
  assert.equal(panel.querySelector(".g-roster__pline").textContent, "Human Lineman · 50k");
  assert.deepEqual(panel.querySelectorAll("dl.g-stats .g-stat__v").map((value) => value.textContent), ["6", "3", "3+", "4+", "9+"]);
  assert.deepEqual([panel.querySelector(".g-roster__availn").textContent, panel.querySelector(".g-roster__availl").textContent], ["0", "SPP available"]);
  assert.deepEqual(panel.querySelectorAll(".g-roster__ledgerline").map((line) => line.textContent), ["earned 0", "spent 0"]);
  assert.equal(panel.querySelector(".g-progress__caption").textContent, "Advancements: 0 of 6");
  // Decision 21 (stage 07d): Ann's 0 SPP buy nothing, and the line under «Advance» says what she is short of.
  assert.equal(panel.querySelector(".g-roster__cheapest").textContent, "3 more SPP needed");
  assert.equal(panel.querySelector(".g-skills-none").textContent, "no skills");
  assert.equal(panel.querySelector(".g-roster__access").textContent, "Primary: General · Secondary: Agility, Strength, Devious");
  assert.deepEqual(panel.querySelectorAll(".g-roster__access b").map((part) => part.textContent), ["General", "Agility, Strength, Devious"], "the categories in bold");
  assert.equal(panel.querySelector(".g-roster__next").textContent, "Next match: Plays");
  assert.equal(panel.querySelector(".g-roster__next b").textContent, "Plays");
  assert.ok(panel.querySelector(".g-roster__nextblock .g-roster__actions"), "the next match and the pair of actions under one rule");
  // The captain: his skills as cards, each with where it came from; the one who sits out says so.
  fireEvent(toggle("p2#0"), "click");
  assert.deepEqual(aside().querySelectorAll(".g-skill--card").map((card) => [card.getAttribute("data-skill"), card.querySelector(".g-skill__source").textContent]),
    [["Block", "starting"], ["Tackle", "starting"], ["Mighty Blow", "primary"], ["Pro", "the captain's"]]);
  assert.ok(aside().querySelector('.g-skill--card.g-skill--gained[data-skill="Mighty Blow"]'));
  assert.equal(aside().querySelector(".g-roster__availn").textContent, "3");
  fireEvent(toggle("p4#0"), "click");
  assert.equal(aside().querySelector(".g-roster__next").textContent, "Next match: Sits it out");
  assert.ok(aside().querySelector(".g-roster__next b").classList.contains("g-roster__nextstate--alert"), "in red when he will not play");
});

test("the open row has its nine counters two to a row, each in full with its worth; a team whose catches earn SPP has a tenth", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
    // One look for all (the owner, 2026-10-23): TTM, landings and the bonus are no narrow row of three under the others.
    const cells = openRow().querySelectorAll(".g-roster__counters .g-stepper");
    assert.deepEqual(cells.map(labelOf), ["TD +3", "CAS +2", "COMP +1", "KO +1", "INT +2", "MVP +5", "TTM +1", "Landing +1", "Bonus +1"]);
    assert.ok(cells.every((cell) => !cell.classList.contains("g-stepper--compact")), "all of them in full");
    assert.equal(openRow().querySelector(".g-roster__extra"), null);
    assert.deepEqual([countOf("touchdowns", openRow()), countOf("casualties", openRow())], ["1", "0"], "the career's counts");
    assert.equal(plus("touchdowns", openRow()).getAttribute("aria-label"), "Add: touchdown, Bors");
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "no changes yet"]);
    coach({ teamAnswer: team({ baseTeamSlug: "teams/wood-elves", roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: "Ann" }] } }) });
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    const all = openRow().querySelectorAll(".g-roster__counters .g-stepper");
    assert.equal(all.length, 10, "Passing Virtuosos: catches earn SPP, five rows of two");
    assert.equal(labelOf(all.at(-1)), "CATCH +1");
    assert.equal(labelOf(all[0]), "TD +2");
  });
});

test("a tap on «+» writes the roster at once: the count, the row's SPP and «+3 SPP» since the screen opened change; the status says saving, then saved", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(status(), "", "nothing to say before a step");
    assert.deepEqual(sppLine(openRow()), ["SPP 0 · manual edit", "no changes yet"]);
    const held = api.hold(PATCH);
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    fireEvent(plus("touchdowns", openRow()), "click");
    assert.equal(countOf("touchdowns", openRow()), "1");
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "+3 SPP"]);
    assert.equal(status(), "Saving…");
    assert.ok(view.querySelector(".g-roster__status .g-status--wait"));
    await settle();
    assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 1]], "one PATCH: the stored counter plus one");
    held.release();
    await settle();
    assert.equal(status(), "Saved");
    assert.ok(view.querySelector(".g-roster__status .g-status--live"));
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "+3 SPP"], "still since the screen opened");
    // A step down takes it back; the screen counts from the same start.
    api.reply(PATCH, 200, { team: team({ revision: 6 }) });
    fireEvent(minus("touchdowns", openRow()), "click");
    await settle();
    assert.deepEqual(sppLine(openRow()), ["SPP 0 · manual edit", "no changes yet"]);
    assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 1], [5, 0]]);
  });
});

// Review Focus 4: the count is the career, the minus is the roster's.
test("the minus stops at the stored zero though the career says more", async () => {
  await onPhone(async () => {
    coach({ events: [{ playerId: "p1", counter: "touchdowns", delta: 1, pairingId: null, settledAt: null, injury: null }] });
    await renderTeamRoster("t1");
    assert.equal(countOf("touchdowns"), "1", "an edit outside a match waiting for its finish");
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false, "a plain stop, not a refusal to explain");
    fireEvent(minus("touchdowns"), "click");
    await settle();
    assert.equal(patches().length, 0);
  });
});

test("a desk's panel has no SPP counters outside a match (D3); in a match nine tiles, three by three, «− count +» under the label (D1)", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(aside().querySelector(".g-roster__manual"), null, "DeskRoster.html: no block of counters");
  assert.equal(aside().querySelector("[data-action-key]"), null, "no counter, so no save of the roster starts from the panel");
  assert.ok(aside().querySelector(".g-roster__spp") && aside().querySelector("[data-roster-mark]"), "his SPP and his actions stay");
  await withoutTimers(async () => {
    coach({ events: [rowOf({ id: "e0" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const block = aside().querySelector(".g-roster__manual");
    assert.equal(block.querySelector("h3").textContent, "Match records · round 3");
    const tiles = block.querySelectorAll(".g-roster__tiles .g-stepper");
    assert.deepEqual(tiles.map(labelOf), ["TD +3", "CAS +2", "COMP +1", "KO +1", "INT +2", "MVP +5", "TTM +1", "Landing +1", "Bonus +1"]);
    assert.ok(tiles.every((tile) => tile.classList.contains("g-stepper--tile") && !tile.classList.contains("g-stepper--compact")));
    // One line under the label: the minus, the count with the match's «+1», the plus.
    const line = tiles[0].querySelector(".g-stepper__line");
    assert.deepEqual(line.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class")),
      ["g-stepper__btn", "g-stepper__value", "g-stepper__btn g-stepper__btn--inc"]);
    assert.equal(deltaOf("touchdowns"), "+1");
    api.reply(EVENTS, 201, { event: rowOf({ id: "e1", counter: "casualties" }) });
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => [body.pairingId, body.counter]), [["g2", "casualties"]]);
    assert.equal(patches().length, 0, "a record of the match, no save of the roster");
  });
});

test("another device: a red banner and «Load the new one», which reads the team and its records again; the edit is not sent again", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      const elsewhere = withSpp("p1", { touchdowns: 4 }, { revision: 5 });
      api.reply(PATCH, 409, conflictOf(elsewhere));
      fireEvent(plus("touchdowns"), "click");
      await settle();
      const callout = notice("danger");
      assert.equal(callout.querySelector(".g-callout__title").textContent, "The roster was changed on another device");
      assert.equal(callout.querySelector(".g-callout__sub").textContent, "Your last edit was not saved: the server has a newer version. Load it and make the edit again.");
      assert.equal(status(), "Not saved");
      assert.ok(view.querySelector(".g-roster__status .g-status--danger"));
      assert.ok(stepButtons().length > 0);
      for (const button of stepButtons()) {
        assert.equal(button.getAttribute("aria-disabled"), "true");
        assert.equal(button.getAttribute("title"), "The roster was changed on another device");
      }
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), "The roster was changed on another device", "a tap while it stands is told why it is not taken");
      assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "src/screens/team/roster/sheets.css", "src/screens/team/roster/frame.css", "src/screens/team/roster/market.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
        "progress-dots.css", "button.css", "callout.css", "action-stepper.css", "status-chip.css", "src/screens/team/manage/strip.css");
      api.calls.length = 0;
      api.reply("GET /api/teams/t1", 200, { team: elsewhere });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      const reload = view.querySelector("[data-roster-reload]");
      assert.equal(reload.textContent, "Load the new one");
      fireEvent(reload, "click");
      await settle();
      assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "the games with the team: it is not taken on games older than it");
      assert.equal(countOf("touchdowns"), "4", "the server's");
      assert.equal(view.querySelector(".g-callout--danger"), null);
      assert.equal(status(), "");
      assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
      assert.deepEqual(sppLine(openRow()), ["SPP 12 · manual edit", "no changes yet"], "the coach's edit was given up, another's is not his");
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

test("no network: a yellow banner with the edits waiting, the status at the heading; the browser asks before the tab closes; back online, they go", async () => {
  await onPhone(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    const callout = notice("warn");
    assert.equal(callout.querySelector(".g-callout__title").textContent, "No network");
    assert.equal(callout.querySelector(".g-callout__sub").textContent, "Edits waiting: 1. They go once the connection is back. Do not close the page.");
    assert.equal(status(), "Waiting for the network · edits: 1");
    assert.equal(countOf("touchdowns"), "1", "the step stays on the screen");
    assert.equal(leaving(), true);
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    api.calls.length = 0;
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(status(), "Saved");
    assert.equal(view.querySelector(".g-roster__notices .g-callout"), null);
    assert.equal(leaving(), false);
    assert.deepEqual(callKeys(), ["GET /api/games", PATCH], "the games are read first: no step goes into a match begun meanwhile (R8)");
  });
});

test("a refusal names the rule, and the roster is read again", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.calls.length = 0;
      api.reply(PATCH, 422, refusalOf([{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }]));
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.match(toasts().at(-1), /Ann/);
      assert.match(document.querySelectorAll("output").at(-1).className, /g-toast--error/);
      assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1").length, 1);
      assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1/events").length, 1);
      assert.equal(countOf("touchdowns"), "0", "the server's roster");
      assert.equal(status(), "");
      assert.equal(save.saveState("t1").waiting, 0);
    });
  });
});

// Review Focus 2: the server takes a PATCH during a match, and it would break the match's finish.
test("while the games are unread no tap writes the roster", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      const held = api.hold("GET /api/games");
      const drawing = renderTeamRoster("t1");
      await settle();
      assert.ok(stepButtons().length > 0);
      for (const button of stepButtons()) {
        assert.equal(button.getAttribute("aria-disabled"), "true");
        assert.equal(button.getAttribute("title"), "Loading the matches…");
      }
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), "Loading the matches…");
      await settle();
      assert.equal(patches().length, 0);
      held.release();
      await drawing;
      assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
      // A counter drawn open while the games are read again (the tab seen again) is asked again when it is tapped.
      const again = api.hold("GET /api/games");
      const reading = loadGames(true);
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), "Loading the matches…");
      await settle();
      assert.equal(patches().length, 0);
      again.release();
      await reading;
      // Games that could not be read say why.
      coach();
      api.fail("GET /api/games");
      await renderTeamRoster("t1");
      assert.equal(plus("touchdowns").getAttribute("title"), "No connection to the server. Check the internet and try again.");
      assert.equal(minus("touchdowns").getAttribute("aria-disabled"), "true");
    });
  });
});

// Final review, Minor 1: a team is never taken on games older than it, so the games are asked for once the roster has answered.
test("the games are read after the roster has answered — on entry, on «Try again» and on a read again — and the counters wait for both", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      /** A tap is told to wait for the games, and sends nothing. */
      const waits = () => {
        const said = toasts().length;
        fireEvent(plus("casualties"), "click");
        assert.deepEqual(toasts().slice(said), ["Loading the matches…"]);
      };
      /**
       * `act` reads the roster: no games are asked for until it has answered, and a tap waits for both. A roster drawn
       * by the read (`drawn`: the first, or the one «Try again» brings) has its counters drawn closed until the games answer.
       */
      const gamesAfterRoster = async (act, { during = () => {}, drawn = false } = {}) => {
        api.calls.length = 0;
        const roster = api.hold("GET /api/teams/t1");
        const acting = act();
        await settle();
        assert.equal(roster.count, 1);
        assert.ok(!callKeys().includes("GET /api/games"), "no games while the roster is read");
        during();
        const games = api.hold("GET /api/games");
        roster.release();
        await settle();
        assert.equal(games.count, 1, "the games once the roster has answered");
        if (drawn) assert.equal(plus("casualties").getAttribute("title"), "Loading the matches…", "the counters drawn closed");
        waits();
        games.release();
        await acting;
        await settle();
        assert.equal(plus("casualties").hasAttribute("aria-disabled"), false);
        assert.equal(patches().filter(({ body }) => body.roster.players[0].spp?.casualties).length, 0, "no tap was sent");
      };
      coach();
      await gamesAfterRoster(() => renderTeamRoster("t1"), { drawn: true });
      // A read again, here a refusal's.
      api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
      await gamesAfterRoster(() => fireEvent(plus("touchdowns"), "click"), { during: waits });
      assert.equal(patches().length, 1, "the refused step, and nothing after it");
      // «Try again» after a read that failed.
      coach();
      api.fail("GET /api/teams/t1");
      await renderTeamRoster("t1");
      api.reply("GET /api/teams/t1", 200, { team: team() });
      await gamesAfterRoster(() => fireEvent(view.querySelector("[data-roster-retry]"), "click"), { drawn: true });
      api.assertAnswered();
    });
  });
});

// R8: no step of the roster's queue leaves during a match.
// Carry T7 (d) and its correction: takeServerTeam says null while a request is in the air, and the take that had to wait
// is made on the state the request comes to (final review, T10). A tap while the roster is read sends nothing (Minor 1,
// Minor 5), so the request in the air here is the refused step, which the queue is asked to send again.
test("the server's roster is not taken over a step in the air: it is read and taken again once the step has answered, and not at all if it was saved", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      for (const saved of [false, true]) {
        coach();
        await renderTeamRoster("t1");
        api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
        const reading = api.hold("GET /api/teams/t1");
        fireEvent(plus("touchdowns"), "click");
        await settle();
        assert.equal(reading.count, 1, "the refusal reads the roster again");
        const sending = api.hold(PATCH);
        const retrying = save.retrySaves("t1");
        await settle();
        assert.equal(sending.count, 1, "the refused step is in the air when the read comes");
        reading.release();
        await settle();
        assert.equal(countOf("touchdowns"), "1", "the roster is not swapped under the step in the air");
        api.calls.length = 0;
        if (saved) api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
        sending.release(saved ? undefined : { error: new TypeError("Failed to fetch") });
        await retrying;
        await settle();
        const reads = callKeys().filter((key) => key.startsWith("GET /api/teams/")).sort();
        if (saved) {
          assert.deepEqual(reads, [], "a save that landed makes the take needless: an older roster would be laid over it");
          assert.deepEqual([status(), countOf("touchdowns")], ["Saved", "1"]);
        } else {
          assert.deepEqual(reads, ["GET /api/teams/t1", "GET /api/teams/t1/events"], "read again, not the copy from before the step");
          assert.deepEqual([status(), countOf("touchdowns"), save.saveState("t1").waiting], ["", "0", 0]);
        }
      }
    });
  });
});

test("a match that began while the network was gone: back online, the edits that wait are not sent but given up, and the coach is told", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.fail(PATCH);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(save.saveState("t1").waiting, 1);
      // The match began on another device meanwhile; a server that would take the step answers it.
      api.calls.length = 0;
      api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
      api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
      api.reply("GET /api/teams/t1", 200, { team: team({ revision: 5 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      page.dispatchEvent(new Event("online"));
      await settle();
      assert.equal(patches().length, 0, "no step leaves during a match");
      assert.equal(callKeys()[0], "GET /api/games", "the games first");
      assert.deepEqual(callKeys().slice(1).sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "then the server's roster, the games with it");
      assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
      assert.equal(save.saveState("t1").waiting, 0);
      assert.equal(leaving(), false, "nothing waits: nothing to ask about");
      assert.equal(countOf("touchdowns"), "0", "the server's count");
      assert.equal(status(), "");
      assert.ok(!view.querySelector(".g-roster__offline"), "no network is no longer the news");
    });
  });
});

test("a match learned of on the screen gives up the edits that wait as well; the network back during it sends nothing (R8)", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.fail(PATCH);
      fireEvent(plus("touchdowns"), "click");
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(save.saveState("t1").waiting, 2);
      api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
      api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
      await invalidateGames();
      await settle();
      assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (2). Make them again as an edit outside the match.");
      page.dispatchEvent(new Event("online"));
      await settle();
      assert.equal(patches().length, 1, "the one try before the network went: the second step waited behind it, and neither went again");
      assert.equal(save.saveState("t1").waiting, 0);
    });
  });
});

test("a step in the air when a match is learned of is let be; what still waits once it has answered is given up (R8)", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      const held = api.hold(PATCH);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(held.count, 1);
      api.calls.length = 0;
      api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
      await invalidateGames();
      await settle();
      assert.deepEqual(callKeys(), ["GET /api/games"], "nothing is read nor taken while the step is in the air");
      held.release({ error: new TypeError("Failed to fetch") });
      await settle();
      assert.match(toasts().at(-1), /^A match has begun/);
      assert.deepEqual([save.saveState("t1").waiting, patches().length], [0, 0]);
      assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"]);
    });
  });
});

// Fix round 1, Important 1: a 409 is often how the coach learns that a match has begun. The final review's Minor 3: so a
// fresh conflict reads the games, and a match they name settles the step R8's way, without the coach pressing first.
test("another device's save that was a match's start: the 409 reads the games, the server's roster is taken with the match's words and no press, and the next tap saves nothing (R8)", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      // Ann has a touchdown in the blob: outside a match her minus would take it back (Minor 7).
      coach({ teamAnswer: withSpp("p1", { touchdowns: 1 }) });
      await renderTeamRoster("t1");
      assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "outside a match the stored touchdown can be taken back");
      // The match began elsewhere: the start moved the team's revision, and the games now say so.
      const started = withSpp("p1", { touchdowns: 1 }, { revision: 5 });
      api.reply(PATCH, 409, conflictOf(started));
      api.reply("GET /api/teams/t1", 200, { team: started });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      gamesAre([LIVE_GAME]);
      api.calls.length = 0;
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.deepEqual(callKeys(), [PATCH, "GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events", "GET /api/games"],
        "the conflict reads the games; they name a match, so the roster is read, and the games after it");
      assert.ok(!view.querySelector("[data-roster-reload]"), "nothing is left for the coach to press");
      assert.equal(view.querySelector(".g-callout--danger"), null);
      assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
      assert.ok(minus("touchdowns").hasAttribute("disabled"), "the match's own rule: its records for him add up to nothing");
      api.reply(EVENTS, 201, { event: rowOf() });
      fireEvent(plus("touchdowns"), "click");
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(patches().length, 1, "the step that met the 409: no save of the roster during the match");
      assert.deepEqual(posts().map(({ body }) => [body.pairingId, body.counter]), [["g2", "touchdowns"], ["g2", "casualties"]], "records of the match instead");
    });
  });
});

// Fix round 1, Important 2: a step whose answer was lost may be on the server; it is not counted lost.
test("the edits a match gives up are counted against the server's roster: a step that landed with its answer lost is not one of them", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.fail(PATCH);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(save.saveState("t1").waiting, 2);
      // The server has the touchdown (its answer was lost), not the casualty; then the match begins.
      api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
      api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
      await invalidateGames();
      await settle();
      assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
      assert.deepEqual([countOf("touchdowns"), countOf("casualties")], ["1", "0"]);
      assert.equal(save.saveState("t1").waiting, 0);
    });
  });
});

// Final review, Minor 2: the server's roster may hold another device's SPP changes too; they are no steps of the coach's.
test("the edits a match gives up are never counted above the steps that waited: another device's SPP change is not one of them", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.fail(PATCH);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(save.saveState("t1").waiting, 1);
      // Another device gave Bors two casualties; then the match begins.
      const elsewhere = PLAYERS.map((player) => (player.id === "p2" ? { ...player, spp: { touchdowns: 1, casualties: 2 } } : player));
      api.reply("GET /api/teams/t1", 200, { team: team({ revision: 6, roster: { players: elsewhere } }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
      gamesAre([LIVE_GAME]);
      await invalidateGames();
      await settle();
      assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
      assert.equal(save.saveState("t1").waiting, 0);
    });
  });
});

// Fix round 1, Minor 4: after a refusal the server holds the coach's saved steps as they were.
test("a refusal takes the server's roster but keeps what the coach's saved edits have moved since the screen opened", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "+3 SPP"]);
      api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
      api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.deepEqual([countOf("touchdowns"), countOf("casualties")], ["1", "0"], "the server's roster");
      assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "+3 SPP"], "his saved touchdown still counts");
    });
  });
});

// Final wave re-review: a 422 whose re-read failed left no way forward on the screen.
test("a step refused for a 422 whose re-read failed: the next tap reads the roster again, so the coach is never stuck", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach();
      await renderTeamRoster("t1");
      api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
      api.fail("GET /api/teams/t1");
      fireEvent(plus("touchdowns"), "click");
      await settle();
      api.calls.length = 0;
      api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", {}, { revision: 5 }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(patches().length, 0, "the refused step is not sent again");
      assert.ok(callKeys().includes("GET /api/teams/t1"), "the roster is read again");
      api.reply(PATCH, 200, { team: withSpp("p1", { casualties: 1 }, { revision: 6 }) });
      fireEvent(plus("casualties"), "click");
      await settle();
      assert.equal(patches().length, 1, "on the server's roster the next tap saves");
    });
  });
});

test("edits that wait when the roster is entered again go once the games say no match is on (R8)", async () => {
  await onPhone(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    releaseCurrentScreen();
    view.innerHTML = "<p>elsewhere</p>";
    api.calls.length = 0;
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    await renderTeamRoster("t1");
    await settle();
    assert.equal(patches().length, 1, "no online event came: the screen sends them itself");
    assert.ok(callKeys().indexOf("GET /api/games") < callKeys().indexOf(PATCH), "once the games are read");
    assert.equal(status(), "Saved");
    assert.equal(countOf("touchdowns"), "1", "the step drawn while it waited");
  });
});

test("a counter at the most a roster takes says why its plus is refused, without a request", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach({ teamAnswer: withSpp("p1", { touchdowns: 999 }) });
      await renderTeamRoster("t1");
      const refusal = "Ann: SPP counter TD must be a whole number from 0 to 999.";
      assert.equal(plus("touchdowns").getAttribute("aria-disabled"), "true");
      assert.equal(plus("touchdowns").getAttribute("title"), refusal);
      assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false);
      fireEvent(plus("touchdowns"), "click");
      assert.equal(toasts().at(-1), refusal);
      await settle();
      assert.equal(patches().length, 0);
    });
  });
});

// Carry T9 (a): a redraw that takes the focused element away puts the focus somewhere sensible, never on the body.
test("a redraw that takes the focused button away: the minus stopped at zero gives it to its plus; a sheet whose player has gone, to the title", async () => {
  await onPhone(async () => {
    await withoutTimers(async () => {
      coach({ teamAnswer: withSpp("p1", { touchdowns: 1 }) });
      await renderTeamRoster("t1");
      api.reply(PATCH, 200, { team: team({ revision: 5 }) });
      minus("touchdowns").focus();
      fireEvent(minus("touchdowns"), "click");
      assert.ok(minus("touchdowns").hasAttribute("disabled"));
      // Compared by identity: a failed deepEqual of two fake elements would print the whole page.
      assert.ok(document.activeElement === plus("touchdowns"), "the plus beside it");
      await settle();
      // Bors's sheet is open when the roster is read again without him (a refusal reads it).
      fireEvent(toggle("p2#0"), "click");
      const held = api.hold(PATCH);
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(held.count, 1, "his step is in the air");
      fireEvent(chipIn(aside(), "Block"), "click");
      sheet().querySelector("[data-sheet-close]").focus();
      api.reply("GET /api/teams/t1", 200, { team: team({ revision: 6, roster: { players: PLAYERS.filter(({ id }) => id !== "p2") } }) });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
      held.release({ status: 422, body: refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]) });
      await settle();
      assert.equal(sheet(), null);
      assert.equal(toggle("p2#0"), null, "he has left the roster");
      assert.ok(document.activeElement === view.querySelector("h1"), "the title, not the body");
    });
  });
});

// N1 of the final wave's re-review: a focus on a node a stylesheet hides is lost too (`focusLost`), though the node stays.
test("a redraw that leaves the focus on a node the stylesheet hides: outside a row, to the title", async () => {
  coach();
  await renderTeamRoster("t1");
  const sort = view.querySelector('[data-sort-key="ma"]');
  sort.focus();
  // `display: none` from a stylesheet: the fake page reads none, and is told the header draws no box.
  sort.getClientRects = () => [];
  gamesAre([]);
  await invalidateGames();
  await settle();
  assert.ok(view.querySelector('[data-sort-key="ma"]') === sort, "the same header, still in the page");
  assert.ok(document.activeElement === view.querySelector("h1"), "the title, not a box nobody sees");
});

test("a team whose race the reference does not know: a line that says so, and no table", async () => {
  coach({ teamAnswer: team({ baseTeamSlug: "teams/unknown" }) });
  await renderTeamRoster("t1");
  const callout = view.querySelector(".g-callout--danger");
  assert.equal(callout.querySelector(".g-callout__title").textContent, "The reference does not know this team's race (teams/unknown): the roster cannot be drawn.");
  assert.equal(view.querySelector("table"), null);
  assert.equal(view.querySelector(".g-roster__aside"), null);
  assert.equal(view.querySelector("[data-roster-retry]"), null, "reading again would not teach the reference the race");
});

test("a roster that could not be read says why, and reads again on «Try again»", async () => {
  coach();
  api.fail("GET /api/teams/t1");
  await renderTeamRoster("t1");
  const callout = view.querySelector(".g-roster__failed .g-callout--danger");
  assert.ok(callout.querySelector(".g-callout__title").textContent.length > 0);
  assert.equal(view.querySelector("table"), null);
  const retry = view.querySelector("[data-roster-retry]");
  assert.equal(retry.textContent, "Try again");
  api.reply("GET /api/teams/t1", 200, { team: team() });
  retry.focus();
  api.calls.length = 0;
  fireEvent(retry, "click");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the roster…");
  assert.equal(document.activeElement, view.querySelector("h1"), "the button is gone: the focus is on the title");
  await settle();
  assert.equal(view.querySelector(".g-callout--danger"), null);
  assert.equal(bodies().length, 7);
  assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "the games with the team (R8)");
});

test("a screen left before the roster came draws nothing", async () => {
  coach();
  const held = api.hold("GET /api/teams/t1");
  const drawing = renderTeamRoster("t1");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  held.release();
  await drawing;
  assert.equal(view.querySelector("table"), null);
  assert.equal(view.querySelector("p").textContent, "elsewhere");
});

test("the games are read on entry and when the tab is seen again; a change in them draws the screen again", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  try {
    coach();
    await renderTeamRoster("t1");
    const reads = () => api.calls.filter(({ key }) => key === "GET /api/games").length;
    assert.equal(reads(), 1, "on entry, however fresh the list the page has");
    document.visibilityState = "hidden";
    events.dispatchEvent(new Event("visibilitychange"));
    assert.equal(reads(), 1, "a tab put away reads nothing");
    document.visibilityState = "visible";
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(reads(), 2);
    releaseCurrentScreen();
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(reads(), 2, "a screen left reads nothing");
  } finally {
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("a player's and a skill's name are text", async () => {
  coach({ teamAnswer: team({ name: HOSTILE, roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: HOSTILE, extraSkills: [{ name: HOSTILE }] }] } }) });
  await renderTeamRoster("t1");
  assert.equal(bodyOf("p1#0").querySelector(".g-rtable__name").textContent, HOSTILE);
  assert.equal(aside().querySelector(".g-roster__pname").textContent, HOSTILE);
  fireEvent(chipIn(bodyOf("p1#0"), HOSTILE), "click");
  assert.equal(sheet().querySelector("h2").textContent, HOSTILE);
  assert.equal(view.querySelector("img"), null);
  assert.equal(view.querySelector("[onerror]"), null);
  assertCspSafe(view);
});

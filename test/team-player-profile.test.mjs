import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  ADVANCED, FALLEN, LIVE_GAME, PIKE, PLAYERS, STYLES, api, aside, coach, died, invalidateGames, playerPage, releaseCurrentScreen, renderTeamRoster, save,
  settle, state, team, text, toggle, view, withPlayers,
} from "./helpers/roster-page.mjs";

// Stage 07d, Task 7: the player's address (`#/t/:id/roster/:playerId`) is the roster's player mode. On a phone it is a
// screen of its own, drilled into (owner's answer 1): no header of the shell and no tabs, the player's dark head with
// «‹ Roster» (Player.html, PlayerCaptain.html, PlayerDead.html); on a desk it is the roster with him in the panel
// (DeskRoster.html, DeskRosterCaptain.html).

// The shell's frame, before the shell is imported: it finds its parts once, when it is mounted.
const frame = el(document, "div", { id: "app-frame", class: "g-frame" },
  el(document, "aside", { id: "side-nav" }), el(document, "header", { id: "app-header", class: "g-appbar" }), el(document, "footer", { id: "site-footer" }));
document.body.appendChild(frame);
const { mountShell, refreshShell } = await import("../src/shell/shell.mjs");
mountShell({ document, scroller: { addEventListener() {}, document } });
const { renderTeamPlayer } = await import("../src/screens/team/player/index.mjs");
const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const { ADVANCEMENT_TYPES } = await import("../src/domain/roster/progression.mjs");

const PROFILE = "src/screens/team/roster/profile.css";
const PATCH = "PATCH /api/teams/t1";
const FALLEN_READ = "GET /api/teams/t1/fallen";
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
const NO_ID = "This player has no id in the roster, so nothing can be saved for this player. Ask the league administrator to fix the roster.";
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const header = () => document.querySelector("#app-header");
const profile = () => view.querySelector('[data-screen="team-player"].g-profile');
const head = () => view.querySelector(".g-profile__head");
const advance = () => view.querySelector("[data-player-advance]");
const pencil = () => view.querySelector("[data-player-edit]");
const hint = () => view.querySelector(".g-profile__hint")?.textContent ?? null;
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const callsTo = (key) => api.calls.filter((call) => call.key === key);
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const route = (name, params = {}) => ({ name, params: { teamId: "t1", ...params } });
/** t1 on the server with one player of the roster in place of his own. */
const withOne = (player) => withPlayers(PLAYERS.map((each) => (each.id === player.id ? player : each)));
/** The phone's media query, which the test answers and changes: what the screen listens to when the width crosses 900px. */
function crossingWindow() {
  const listeners = new Set();
  const media = { matches: true, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { listeners, cross: (phone) => { media.matches = phone; listeners.forEach((listener) => listener()); } };
}

test("a player's address on a phone is a screen of its own: no team header and no tabs, «‹ Roster» in its dark head", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    refreshShell(route("teamPlayer", { playerId: "p3" }));
    await playerPage("p3");
    assert.equal(header().childNodes.length, 0, "the shell's header draws nothing");
    assert.ok(frame.hasAttribute("data-drill"));
    assert.ok(!document.querySelector(".g-tabs"), "no tabs");
    assert.ok(!header().querySelector("[data-team-switcher]"), "no team switcher");
    assert.deepEqual(valuesOf("src/shell/frame.css", ".g-frame[data-drill] .g-appbar", "display"), ["none"]);
    const back = head().querySelector(".g-profile__back");
    assert.equal(back.getAttribute("href"), "#/t/t1/roster");
    assert.equal(back.getAttribute("aria-label"), "Back to the roster");
    assert.equal(back.textContent, "Roster");
    assert.ok(back.querySelector("svg.g-icon"), "the chevron before the word");
    // The roster again: the shell's header is back, the frame no longer drilled into.
    refreshShell(route("teamRoster"));
    assert.ok(header().querySelector("nav.g-tabs"));
    assert.ok(header().querySelector("[data-team-switcher]"));
    assert.ok(!frame.hasAttribute("data-drill"));
  });
});

test("on a desk the address keeps the SideNav, the roster's item lit", async () => {
  coach();
  refreshShell(route("teamPlayer", { playerId: "p3" }));
  const lit = document.querySelector("#side-nav").querySelectorAll('.g-sidenav__link[aria-current="page"]');
  assert.deepEqual(lit.map((link) => link.textContent), ["Roster"]);
  assert.ok(document.querySelector("#side-nav [data-team-switcher]"), "the SideNav's team block is as it was");
  refreshShell(route("teamRoster"));
});

test("back on the roster from a player's page: the row that was open, the page where it was", async () => {
  await withWindow({ phone: true }, async ({ scrolls, scrollPage }) => {
    await withoutTimers(async () => {
      coach({ open: "p3#0" });
      await renderTeamRoster("t1");
      scrollPage(640);
      releaseCurrentScreen();
      await playerPage("p3");
      assert.ok(profile());
      // «‹ Roster»: the router leaves the profile for the roster.
      releaseCurrentScreen();
      scrolls.length = 0;
      const read = api.hold("GET /api/teams/t1");
      const drawing = renderTeamRoster("t1");
      await settle();
      assert.ok(!scrolls.some(([, y]) => y === 640), "not before the team has answered: the wait is a short page");
      read.release();
      await drawing;
      assert.deepEqual(scrolls.at(-1), [0, 640], "the lines drawn, the page where the coach left it (K4)");
      assert.equal(toggle("p3#0").getAttribute("aria-expanded"), "true", "his row open");
      assert.ok(document.activeElement === toggle("p3#0"), "the focus on his open row, not on the title at the top (M5)");
      // Once: the roster drawn again (a language switch) is not put back.
      scrollPage(200);
      scrolls.length = 0;
      releaseCurrentScreen();
      await renderTeamRoster("t1");
      assert.deepEqual(scrolls, []);
      // Not from a player's address: the roster starts at its top.
      releaseCurrentScreen();
      view.innerHTML = '<p id="elsewhere">Elsewhere</p>';
      await renderTeamRoster("t1");
      assert.deepEqual(scrolls, [[0, 0]]);
      // A page between them (the profile, the overview, the roster) forgets where it stood (K4).
      scrollPage(300);
      releaseCurrentScreen();
      await playerPage("p3");
      releaseCurrentScreen();
      view.innerHTML = '<p id="overview">Overview</p>';
      releaseCurrentScreen();
      scrolls.length = 0;
      await renderTeamRoster("t1");
      assert.deepEqual(scrolls, [[0, 0]], "the overview's hop puts nothing back");
      // The roster left for another page first, the player's page reached from there: nothing of the roster's to go back to (I1).
      scrollPage(640);
      releaseCurrentScreen();
      view.innerHTML = '<p id="overview">Overview</p>';
      releaseCurrentScreen();
      await playerPage("p3");
      releaseCurrentScreen();
      scrolls.length = 0;
      await renderTeamRoster("t1");
      assert.ok(!scrolls.some(([, y]) => y === 640), "a scroll of a roster that did not lead to his page is not put back");
      assert.deepEqual(scrolls, [[0, 0]]);
    });
  });
});

test("no row open, the way back leaves the focus where the page put it (M5)", async () => {
  await withWindow({ phone: true }, async ({ scrolls, scrollPage }) => {
    coach();
    await renderTeamRoster("t1");
    scrollPage(400);
    releaseCurrentScreen();
    await playerPage("p3");
    // His row was closed meanwhile (another device's roster, say): the way back puts the page back, the focus stays.
    rosterMemory("t1").selected = null;
    releaseCurrentScreen();
    await renderTeamRoster("t1");
    assert.deepEqual(scrolls.at(-1), [0, 400]);
    assert.ok(!view.querySelector('[aria-expanded="true"]'));
    assert.ok(document.activeElement === view.querySelector("h1"), "the title, as any first draw of the roster");
  });
});

test("the way back from a fallen player's own page finds the roster as it was left (M3)", async () => {
  await withWindow({ phone: true }, async ({ scrolls, scrollPage }) => {
    coach({ open: "fallen-f1" });
    await renderTeamRoster("t1");
    scrollPage(900);
    releaseCurrentScreen();
    // His row's «Profile» leads to his own page: the coach's list does not hold him.
    await renderTeamPlayer("t1", "d1");
    assert.ok(view.querySelector('[data-screen="team-player"].g-fallen-page.g-profile'));
    releaseCurrentScreen();
    scrolls.length = 0;
    await renderTeamRoster("t1");
    assert.deepEqual(scrolls.at(-1), [0, 900], "the page where the coach left it");
    assert.equal(toggle("fallen-f1").getAttribute("aria-expanded"), "true", "his row open");
    assert.ok(document.activeElement === toggle("fallen-f1"));
  });
});

test("on a desk the player mode is the roster: going on to the roster keeps the page where it is (M4)", async () => {
  await withWindow({ phone: false }, async ({ scrolls, scrollPage }) => {
    coach();
    await renderTeamRoster("t1");
    scrollPage(300);
    releaseCurrentScreen();
    // «Advance» in the panel leads to the address: the roster with him in the panel, where the coach scrolls and chooses.
    await playerPage("p3");
    scrollPage(1200);
    fireEvent(toggle("p1#0"), "click");
    // The SideNav's «Roster»: the same page, where it stands.
    releaseCurrentScreen();
    scrolls.length = 0;
    await renderTeamRoster("t1");
    assert.deepEqual(scrolls, [], "no jump back to where the roster stood before the address");
    assert.equal(globalThis.scrollY, 1200);
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "the coach's choice");
  });
});

test("the drill into the profile and back keeps the session's SPP count; any other visit starts it again (M7)", async () => {
  await withWindow({ phone: true }, async () => {
    await withoutTimers(async () => {
      const sum = () => view.querySelector(".g-rtable__panelrow .g-roster__sppdelta").textContent;
      coach({ open: "p1#0" });
      await renderTeamRoster("t1");
      assert.equal(sum(), "no changes yet");
      const scored = withOne({ ...PLAYERS[0], spp: { touchdowns: 1 } });
      api.reply(PATCH, 200, { team: { ...scored, revision: 5 } });
      const touchdowns = view.querySelectorAll("[data-action-key]").find((cell) => cell.getAttribute("data-action-key") === "touchdowns");
      fireEvent(touchdowns.querySelector('[data-action-step="1"]'), "click");
      await settle();
      assert.equal(sum(), "+3 SPP");
      api.reply("GET /api/teams/t1", 200, { team: { ...scored, revision: 5 } });
      api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
      // Ann's «Profile and advancement», then «‹ Roster».
      releaseCurrentScreen();
      await playerPage("p1");
      assert.equal(view.querySelector(".g-profile__name").textContent, "Ann");
      releaseCurrentScreen();
      await renderTeamRoster("t1");
      assert.equal(sum(), "+3 SPP", "the count as it was left");
      // Any other visit (from another page) starts it again (07a, decision 11).
      releaseCurrentScreen();
      view.innerHTML = '<p id="overview">Overview</p>';
      releaseCurrentScreen();
      await renderTeamRoster("t1");
      assert.equal(sum(), "no changes yet");
      api.assertAnswered();
    });
  });
});

test("one h1 in every state of the address: waiting, a read that failed, gone, fallen, the player", async () => {
  const one = (label) => {
    assert.equal(view.querySelectorAll("h1").length, 1, label);
    assert.ok(head().querySelector(".g-profile__back"), `${label}: the way back`);
  };
  await withWindow({ phone: true }, async () => {
    coach();
    const read = api.hold("GET /api/teams/t1");
    const drawing = playerPage("p3");
    await settle();
    one("waiting");
    assert.ok(view.querySelector("h1").classList.contains("g-sr-only"));
    assert.equal(view.querySelector("h1").textContent, "Player");
    assert.equal(view.querySelector(".g-roster__loading").getAttribute("role"), "status");
    read.release();
    await drawing;
    one("the player");
    assert.equal(view.querySelector("h1").textContent, "Cade");
    coach();
    api.reply("GET /api/teams/t1", 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await playerPage("p3");
    one("a read that failed");
    assert.ok(view.querySelector(".g-roster__failed [data-roster-retry]"));
    coach();
    await playerPage("zz");
    one("gone");
    coach();
    await playerPage("d1");
    one("fallen");
    assert.equal(view.querySelector("h1").textContent, "Pike");
    assertStyled(view, ...STYLES);
  });
});

test("the head stays at the top while the page scrolls, as the prototype's", () => {
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__head", "position"), ["sticky"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__head", "top"), ["0"]);
  // K3: the shell's .g-main hides what goes past its sides, which makes it a scroll box the head would stick in: clip it instead.
  assert.deepEqual(valuesOf(PROFILE, ".g-main:has(.g-profile)", "overflow-x"), ["clip"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "overflow-x"), ["hidden"]);
  // The view's 2.x padding gives way: the head is the screen's width, as Player.html draws it.
  assert.deepEqual(valuesOf(PROFILE, ".g-frame #app-view:has(> .g-profile)", "padding"), ["0"]);
  // WCAG 2.4.11: what the keyboard reaches stands clear of the head, which is taller than the shell's.
  const phone = text("src/shell/frame.css").match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(phone, /:root:has\(\.g-frame\[data-drill\]\) \{ scroll-padding-top: 150px; \}/);
});

test("a player's address on a phone is his profile: his head — number, name, position · race · value, the pencil — his characteristics, SPP, advancements, skills with where each came from, access, injuries", async () => {
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: withOne(ADVANCED) });
    await playerPage("p3");
    assert.ok(profile());
    assert.equal(head().querySelector("h1").textContent, "Cade");
    assert.ok(head().querySelector("h1").classList.contains("g-profile__name"));
    assert.equal(head().querySelector(".g-profile__who").textContent, "Catcher · Human · 95k");
    assert.ok(head().querySelector(".g-profile__badge .g-num--lg.g-num--catcher"));
    assert.equal(head().querySelector(".g-profile__badge .g-num__n").textContent, "3");
    assert.equal(pencil().tagName, "BUTTON");
    assert.equal(pencil().getAttribute("data-player-edit"), "p3#0");
    assert.equal(pencil().getAttribute("aria-label"), "Edit the player");
    assert.equal(pencil().getAttribute("aria-haspopup"), "dialog");
    assert.ok(!pencil().hasAttribute("aria-disabled"));
    assert.ok(pencil().closest(".g-profile__head"), "the pencil in the head, as Player.html");
    const body = view.querySelector(".g-profile__body");
    assert.equal(body.getAttribute("data-panel-player"), "p3#0", "a skill's card finds his line");
    assert.deepEqual(body.querySelectorAll(".g-stat__v").map((value) => value.textContent), ["8", "3", "3+", "5+", "8+"]);
    assert.deepEqual([body.querySelector(".g-profile__availn").textContent, body.querySelector(".g-profile__availl").textContent], ["27", "SPP available"]);
    assert.deepEqual(body.querySelectorAll(".g-profile__ledgerline").map((line) => line.textContent), ["earned 30", "spent 3"]);
    assert.equal(body.querySelector(".g-progress__caption").textContent, "Advancements: 1 of 6");
    assert.equal(advance().tagName, "BUTTON");
    assert.equal(advance().textContent, "Advancement");
    assert.equal(advance().getAttribute("data-player-advance"), "p3#0");
    assert.equal(advance().getAttribute("aria-haspopup"), "dialog");
    assert.ok(!advance().hasAttribute("aria-disabled"));
    assert.ok(advance().querySelector("svg.g-icon"), "the arrow before the word");
    assert.equal(hint(), "Cheapest advancement — 4 SPP");
    assert.deepEqual(body.querySelectorAll(".g-skill--card").map((card) => [card.getAttribute("data-skill"), card.querySelector(".g-skill__source").textContent]),
      [["Catch", "starting"], ["Dodge", "starting"], ["Frenzy", "Random primary skill · rolled on the site"]]);
    assert.ok(body.querySelector('.g-skill--card.g-skill--gained[data-skill="Frenzy"]'));
    assert.deepEqual(body.querySelectorAll(".g-profile__accessrow").map((row) => [row.querySelector("dt").textContent, row.querySelector("dd").textContent]),
      [["Primary", "Agility · General"], ["Secondary", "Passing · Strength · Devious"]]);
    assert.deepEqual(valuesOf(PROFILE, ".g-profile__accessvalue", "font"), ["600 14px/normal var(--font-body)"], "the categories in bold");
    assert.equal(body.querySelector(".g-profile__injuries h2").textContent, "Injuries");
    assert.equal(body.querySelector(".g-profile__none").textContent, "No injuries and no Niggling Injuries");
    // Player.html's order: the characteristics, the SPP card, «Skills», («Career», stage 07e), «Injuries».
    const blocks = body.childNodes.map((node) => node.getAttribute("class").split(" ")[0]);
    assert.deepEqual(blocks, ["g-roster__notices", "g-stats", "g-profile__spp", "g-profile__skills", "g-profile__injuries"]);
    assert.ok(!view.querySelector(".g-roster__aside"), "no roster under it");
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("every way a skill came to him is named: an advancement's type, and how it was rolled when it was", async () => {
  const player = {
    ...ADVANCED, spp: { touchdowns: 20 },
    extraSkills: [...ADVANCED.extraSkills, { name: "Block", access: "primary" }, { name: "Sure Hands", access: "primary" }],
    advancements: [...ADVANCED.advancements, { type: "random", grants: { skill: "Block" }, roll: { via: "table" } }, { type: "primary", grants: { skill: "Sure Hands" } }],
  };
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: withOne(player) });
    await playerPage("p3");
    assert.deepEqual(view.querySelectorAll(".g-skill--card").map((card) => card.querySelector(".g-skill__source").textContent),
      ["starting", "starting", "Random primary skill · rolled on the site", "Random primary skill · rolled at the table", "Chosen primary skill"]);
  });
  // The desk's panel names the advancement's type too, short, as DeskRoster's cards do («Основной на выбор»; fidelity F4),
  // not 07a's «primary»; a skill no advancement gave keeps the roster's words.
  coach({ teamAnswer: withOne(player), open: "p3#0" });
  await renderTeamRoster("t1");
  assert.deepEqual(aside().querySelectorAll(".g-skill--card").map((card) => [card.getAttribute("data-skill"), card.querySelector(".g-skill__source").textContent]),
    [["Catch", "starting"], ["Dodge", "starting"], ["Frenzy", "Random primary"], ["Block", "Random primary"], ["Sure Hands", "Chosen primary"]]);
});

test("the captain wears his «C» in his head", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await playerPage("p2");
    const badge = head().querySelector(".g-profile__badge .g-num");
    assert.ok(badge.querySelector(".g-num__captain"));
    assert.equal(badge.querySelector(".g-num__captain").getAttribute("aria-hidden"), "true");
    assert.equal(badge.querySelector(".g-sr-only").textContent, "Captain", "said to a screen reader");
  });
  // PlayerCaptain.html: the «C» 24px, 6px over the badge's top and 8px past its side, ringed in the header's colour.
  assert.deepEqual([valuesOf(PROFILE, ".g-profile__badge .g-num__captain", "width"), valuesOf(PROFILE, ".g-profile__badge .g-num__captain", "height")], [["24px"], ["24px"]]);
  assert.deepEqual([valuesOf(PROFILE, ".g-profile__badge .g-num__captain", "top"), valuesOf(PROFILE, ".g-profile__badge .g-num__captain", "right")], [["-6px"], ["-8px"]]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__badge .g-num__captain", "box-shadow"), ["0 0 0 2px var(--header)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__badge .g-num__captain", "font"), ["800 13px/24px var(--font-body)"]);
});

test("his injuries: why he misses the match, his Niggling Injuries, each lasting one", async () => {
  const dell = { ...PLAYERS[3], injuryStatMods: { ma: -1 }, nigglingInjuries: 1 };
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: withOne(dell) });
    await playerPage("p4");
    const injuries = view.querySelector(".g-profile__injuries");
    assert.deepEqual(injuries.querySelectorAll(".g-profile__injury").map((line) => line.textContent),
      ["Misses the next match: Lasting Injury (MA)", "Niggling Injury · 1", "Lasting Injury (MA) · −1"]);
    assert.ok(!injuries.querySelector(".g-profile__none"));
    // Another reason the coach wrote is said as written.
    coach();
    await playerPage("p7");
    assert.deepEqual(view.querySelectorAll(".g-profile__injury").map((line) => line.textContent), ["Misses the next match: Suspended"]);
  });
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__injury", "color"), ["var(--muted)", "var(--danger)"]);
  assertReadable(PROFILE, ".g-profile__injury", "color", ["--surface"], 4.5);
  assertReadable(PROFILE, ".g-profile__none", "color", ["--surface"], 4.5);
});

test("his name takes the focus once his head is drawn; the page starts at its top", async () => {
  await withWindow({ phone: true }, async ({ scrolls }) => {
    await withoutTimers(async () => {
      coach();
      view.innerHTML = '<p id="elsewhere">Elsewhere</p>';
      await playerPage("p3");
      assert.ok(document.activeElement === view.querySelector(".g-profile__head h1"), "his name");
      assert.equal(document.activeElement.getAttribute("tabindex"), "-1");
      assert.deepEqual(scrolls[0], [0, 0], "another screen: the top of the page (drawScreen)");
      // Once: a later draw leaves the focus where the coach put it.
      advance().focus();
      gamesAre([]);
      await invalidateGames();
      await settle();
      assert.equal(document.activeElement.getAttribute("data-player-advance"), "p3#0");
    });
  });
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__name:focus", "outline"), ["none"]);
});

test("on a desk his address is the roster with him in the panel", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    globalThis.location.hash = "#/t/t1/roster/p3";
    await playerPage("p3");
    assert.ok(view.querySelector('[data-screen="team-roster"]'));
    assert.ok(!profile());
    assert.equal(aside().getAttribute("data-panel-player"), "p3#0");
    assert.equal(toggle("p3#0").getAttribute("aria-current"), "true");
    // The coach's choice stands, and the address is not written: a press would draw the route again.
    fireEvent(toggle("p1#0"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "a second press keeps him");
    await invalidateGames();
    await settle();
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "a later draw does not choose the address's player again");
    assert.equal(globalThis.location.hash, "#/t/t1/roster/p3");
    globalThis.location.hash = "#/t/t1/roster";
  });
});

test("the width crossing 900px redraws the address: the profile, the roster with him", async () => {
  const { listeners, cross } = crossingWindow();
  const scrolls = [];
  globalThis.scrollTo = (x, y) => scrolls.push([x, y]);
  try {
    coach();
    await playerPage("p3");
    assert.ok(profile());
    scrolls.length = 0;
    cross(false);
    assert.ok(view.querySelector('[data-screen="team-roster"]'));
    assert.equal(aside().getAttribute("data-panel-player"), "p3#0");
    assert.deepEqual(scrolls, [[0, 0]], "another screen starts at the top of the page (M6)");
    cross(true);
    assert.ok(profile());
    assert.equal(view.querySelector(".g-profile__name").textContent, "Cade");
    assert.deepEqual(scrolls, [[0, 0], [0, 0]], "the profile too: not part-way down where the desk stood");
    // A patch that draws the same screen keeps the page where it is.
    await invalidateGames();
    await settle();
    assert.equal(scrolls.length, 2);
    releaseCurrentScreen();
    assert.equal(listeners.size, 0, "a visit left listens no more");
  } finally {
    delete globalThis.matchMedia;
    delete globalThis.scrollTo;
  }
});

test("advancement closed, saying why: SPP short, every one taken, a match on, the screen's lock", async () => {
  await withWindow({ phone: true }, async () => {
    await withoutTimers(async () => {
      const closed = (title) => {
        assert.equal(advance().getAttribute("aria-disabled"), "true");
        assert.equal(advance().getAttribute("title"), title);
        assert.equal(advance().textContent, "Advancement");
        assert.equal(hint(), title, "the line under it says it too");
        fireEvent(advance(), "click");
        assert.equal(toasts().at(-1), title);
      };
      // One SPP: the random skill's three are two short (decision 21).
      coach({ teamAnswer: withOne({ ...PLAYERS[0], spp: { completions: 1 } }) });
      await playerPage("p1");
      closed("2 more SPP needed");
      assert.ok(!pencil().hasAttribute("aria-disabled"), "the pencil is not an advancement");
      // Six advancements: every one is taken.
      const six = Array.from({ length: 6 }, () => ({ type: "stat", grants: null }));
      coach({ teamAnswer: withOne({ ...ADVANCED, spp: { touchdowns: 40 }, advancements: six }) });
      await playerPage("p3");
      closed("Every advancement is taken");
      // A match on: the advancement and the pencil wait for its post-match.
      coach({ teamAnswer: withOne(ADVANCED) });
      gamesAre([LIVE_GAME]);
      await playerPage("p3");
      closed("Advancement — after the post-match");
      assert.equal(pencil().getAttribute("aria-disabled"), "true");
      assert.equal(pencil().getAttribute("title"), "Number, name and captain — after the post-match");
      assert.equal(pencil().getAttribute("aria-label"), "Edit the player");
      assert.equal(pencil().getAttribute("data-player-edit"), "p3#0", "it keeps his key, so the focus finds it again");
      fireEvent(pencil(), "click");
      assert.equal(toasts().at(-1), "Number, name and captain — after the post-match");
      // The screen's lock: the games read after the team.
      coach({ teamAnswer: withOne(ADVANCED) });
      const games = api.hold("GET /api/games");
      const drawing = playerPage("p3");
      await settle();
      closed("Loading the matches…");
      assert.equal(pencil().getAttribute("title"), "Loading the matches…");
      games.release();
      await drawing;
      assert.ok(!advance().hasAttribute("aria-disabled"), "open once they have answered");
    });
  });
  // The desk's panel says it the same way: a player the roster stores no id for.
  coach({ teamAnswer: team({ roster: { players: [{ rowIndex: 0, number: "1", name: "Nobody", spp: { touchdowns: 2 } }] } }) });
  await renderTeamRoster("t1");
  const closedAdvance = aside().querySelector(".g-btn--primary.g-roster__closed");
  assert.equal(closedAdvance.getAttribute("title"), NO_ID);
  assert.equal(closedAdvance.textContent, "Advance");
  assert.equal(aside().querySelector(".g-roster__cheapest").textContent, NO_ID);
});

test("offers not known yet (no Skill Table): the plain «Advancement», with no count and no cost (K28)", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    state.data = { ...state.data, skillGroups: undefined };
    await playerPage("p1");
    assert.equal(advance().textContent, "Advancement");
    assert.ok(!advance().hasAttribute("aria-disabled"), "not refused for a table nobody has read");
    assert.equal(hint(), null);
    assert.ok(!view.querySelector(".g-profile__body").textContent.includes("every skill"), "never «no skill left»");
  });
  // The desk's panel: «Advance», with no cost under it — a button that opens the advancement since Task 9.
  coach();
  state.data = { ...state.data, skillGroups: undefined };
  await renderTeamRoster("t1");
  assert.ok(!aside().querySelector('button.g-btn--primary[data-player-advance="p1#0"]').hasAttribute("aria-disabled"));
  assert.ok(!aside().querySelector(".g-roster__cheapest"));
});

test("on a desk the panel says his injuries in one line under his skills; a player with none has no line", async () => {
  const dell = { ...PLAYERS[3], injuryStatMods: { ma: -1 }, nigglingInjuries: 1 };
  coach({ teamAnswer: withOne(dell) });
  await renderTeamRoster("t1");
  assert.ok(!aside().querySelector(".g-roster__injuries"), "Ann has none");
  fireEvent(toggle("p4#0"), "click");
  const line = aside().querySelector(".g-roster__injuries");
  assert.equal(line.textContent, "Niggling Injury · 1 · Lasting Injury (MA) · −1");
  const block = line.closest(".g-roster__pblock");
  assert.equal(block.querySelector(".g-roster__ptitle").textContent, "Skills", "in the skills' block");
  assert.deepEqual(block.childNodes.map((node) => node.getAttribute("class")).slice(-2), ["g-roster__access", "g-roster__injuries"], "under the skills and their access");
  assertStyled(view, ...STYLES);
  const frameCss = "src/screens/team/roster/frame.css";
  assert.deepEqual(valuesOf(frameCss, ".g-roster__injuries", "font"), ["400 13px/1.35 var(--font-body)"]);
  assert.deepEqual([valuesOf(frameCss, ".g-roster__injuries", "border"), valuesOf(frameCss, ".g-roster__injuries", "background")], [["0"], ["none"]]);
  assert.deepEqual([valuesOf(frameCss, ".g-roster__injuries", "margin"), valuesOf(frameCss, ".g-roster__injuries", "padding")], [["0"], ["0"]]);
  assertReadable(frameCss, ".g-roster__injuries", "color", ["--surface"], 4.5);
});

test("every type of advancement and every way of rolling is named in both dictionaries", () => {
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const type of ADVANCEMENT_TYPES) assert.ok(words[`teamAdvance.type.${type}`], `${locale}: teamAdvance.type.${type}`);
    // The desk's panel and the advancement's window name each type short (fidelity F3, F4).
    for (const type of ADVANCEMENT_TYPES) {
      assert.ok(words[`teamAdvance.typeShort.${type}`], `${locale}: teamAdvance.typeShort.${type}`);
      assert.notEqual(words[`teamAdvance.typeShort.${type}`], words[`teamAdvance.type.${type}`], `${locale}: ${type} short is shorter`);
    }
    for (const via of ["site", "table"]) assert.ok(words[`teamPlayer.via.${via}`], `${locale}: teamPlayer.via.${via}`);
  }
});

// Fidelity follow-up: a fallen player's skill cards name an advancement's type as the living's do (K29) — in full with how
// it was rolled on his page, short in the desk's panel (DeskRoster's «Основной на выбор») — not 07a's «primary».
test("a fallen player's skill an advancement gave names its type: in full on his page, short in the desk's panel", async () => {
  const fallen = [died("f3", {
    id: "d3", rowIndex: 3, number: "8", name: "Pike", spp: { touchdowns: 10 },
    extraSkills: [{ name: "Mighty Blow", access: "primary" }, { name: "Dodge", access: "secondary" }],
    advancements: [{ type: "primary", grants: { skill: "Mighty Blow" } }, { type: "random", grants: { skill: "Dodge" }, roll: { id: "r9", via: "site" } }],
  }, { cause: "Foul by the Raiders" })];
  const sources = (root) => root.querySelectorAll(".g-skill--card").map((card) => [card.getAttribute("data-skill"), card.querySelector(".g-skill__source").textContent]);
  await withWindow({ phone: true }, async () => {
    coach({ fallen });
    await renderTeamPlayer("t1", "d3");
    assert.ok(view.querySelector(".g-fallen-page"));
    assert.deepEqual(sources(view), [["Block", "starting"], ["Tackle", "starting"], ["Mighty Blow", "Chosen primary skill"], ["Dodge", "Random primary skill · rolled on the site"]]);
  });
  coach({ fallen, open: "fallen-f3" });
  await renderTeamRoster("t1");
  assert.ok(aside().querySelector(".g-fallen"), "his profile in the panel");
  assert.deepEqual(sources(aside()), [["Block", "starting"], ["Tackle", "starting"], ["Mighty Blow", "Chosen primary"], ["Dodge", "Random primary"]]);
});

test("a fallen player's address read as fallen draws his profile, the undo the roster's", async () => {
  await withWindow({ phone: true }, async () => {
    // The coach's list still holds him on the roster: the player's address goes to the roster, whose read has him fallen.
    coach();
    state.myTeams = { items: [withPlayers([...PLAYERS, PIKE.player])], loaded: true, loading: false, error: "" };
    await renderTeamPlayer("t1", "d1");
    assert.ok(profile());
    assert.equal(head().querySelector("h1").textContent, "Pike");
    assert.equal(head().querySelector(".g-profile__who").textContent, "Blitzer · Human · fallen");
    assert.ok(head().querySelector(".g-profile__badge .g-num--fallen.g-num--lg"));
    assert.ok(!pencil(), "no pencil");
    const body = view.querySelector(".g-profile__fallen");
    assert.equal(body.getAttribute("data-panel-player"), "fallen-f1");
    assert.equal(body.querySelectorAll("h1, h2.g-roster__pname").length, 0, "his name once, in the head");
    const undo = body.querySelector("[data-roster-undo]");
    assert.equal(undo.textContent, "Undo the mark");
    fireEvent(undo, "click");
    assert.ok(view.querySelector("dialog#roster-undo")?.isModal, "the roster's undo, asked first");
    assert.equal(callsTo(FALLEN_READ).length, 1, "read once, with the roster");
    assert.equal(globalThis.location.hash, "#/t/t1/roster", "nothing sent elsewhere");
    assertStyled(view, ...STYLES, "sheet.css", "option-card.css", "filter-chips.css", "text-field.css");
  });
});

test("a fallen player's own page on a phone wears the same head; on a desk the page head as it was", async () => {
  const { listeners, cross } = crossingWindow();
  try {
    coach();
    await renderTeamPlayer("t1", "d1");
    assert.ok(view.querySelector('[data-screen="team-player"].g-fallen-page.g-profile'));
    assert.equal(head().querySelector(".g-profile__back").getAttribute("href"), "#/t/t1/roster");
    assert.equal(head().querySelector(".g-profile__back").textContent, "Roster");
    assert.equal(head().querySelector(".g-profile__badge .g-num--fallen").textContent, "8");
    assert.equal(head().querySelector("h1").textContent, "Pike");
    assert.equal(head().querySelector(".g-profile__who").textContent, "Blitzer · Human · fallen");
    assert.ok(!view.querySelector(".g-pagehead"));
    assert.ok(!view.querySelector("[data-player-edit]"), "no pencil (PlayerDead.html)");
    assert.ok(view.querySelector("[data-roster-undo]"), "the undo as it was");
    assertStyled(view, ...STYLES);
    cross(false);
    assert.ok(view.querySelector(".g-pagehead"), "a desk: the page head");
    assert.ok(!view.querySelector(".g-profile__head"));
    assert.ok(!view.querySelector(".g-fallen-page.g-profile"));
    assert.equal(view.querySelector("h1").textContent, "Pike");
    cross(true);
    assert.ok(head());
    releaseCurrentScreen();
    assert.equal(listeners.size, 0, "the page left listens no more");
    // The wait under «‹ Roster» alone.
    coach();
    const read = api.hold(FALLEN_READ);
    const drawing = renderTeamPlayer("t1", "d1");
    await settle();
    assert.ok(head().querySelector(".g-profile__back"));
    assert.equal(view.querySelectorAll("h1").length, 1);
    assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the player…");
    read.release();
    await drawing;
  } finally {
    delete globalThis.matchMedia;
  }
});

test("an id that is neither on the roster nor among the fallen: he is not on the roster, and the way back", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await playerPage("zz");
    const callout = view.querySelector(".g-profile__body .g-callout");
    assert.equal(callout.querySelector(".g-callout__title").textContent, "This player is no longer on the roster.");
    const link = callout.querySelector("a.g-roster__calloutlink");
    assert.equal(link.textContent, "To the roster");
    assert.equal(link.getAttribute("href"), "#/t/t1/roster");
    assertStyled(view, ...STYLES);
    // As the router draws it: the fallen are read first, then the roster's player mode says it.
    coach({ fallen: FALLEN });
    await renderTeamPlayer("t1", "zz");
    await settle();
    assert.equal(view.querySelector(".g-callout__title").textContent, "This player is no longer on the roster.");
  });
});

// Final review M5 (decision 1): a desk draws the roster for a player's address, him in the panel; one the roster holds
// nowhere — another device sold him, a bookmark — is said over the table in the phone's words, not left to another player.
test("on a desk, an address whose player the roster holds nowhere says so over the table, with the way to the roster (M5)", async () => {
  await withWindow({ phone: false }, async () => {
    const gone = () => view.querySelectorAll(".g-roster__main .g-callout").find((callout) => callout.querySelector(".g-callout__title").textContent === "This player is no longer on the roster.");
    coach();
    await playerPage("zz");
    assert.ok(view.querySelector('[data-screen="team-roster"]'), "a desk's player mode is the roster");
    const callout = gone();
    assert.ok(callout, "said");
    const link = callout.querySelector("a.g-roster__calloutlink");
    assert.equal(link.textContent, "To the roster");
    assert.equal(link.getAttribute("href"), "#/t/t1/roster");
    const main = [...view.querySelector(".g-roster__main").walk()];
    assert.ok(main.indexOf(callout) < main.indexOf(view.querySelector("table.g-rtable")), "over the table");
    assertStyled(view, ...STYLES);
    assertCspSafe(view);
    // One on the roster, and one among the fallen: drawn, and nothing said.
    for (const id of ["p3", "d1"]) {
      coach();
      await playerPage(id);
      assert.ok(!gone(), id);
    }
    // The roster itself names no player, and says nothing either.
    coach();
    await renderTeamRoster("t1");
    assert.ok(!gone());
  });
  const ru = dictionary("ru");
  assert.equal(ru["teamPlayer.gone"], "Этого игрока больше нет в составе.");
});

test("the save's banners stand over his profile: another device's save with «Load the new one», no network, a preparation", async () => {
  await withWindow({ phone: true }, async () => {
    await withoutTimers(async () => {
      const notices = () => view.querySelector(".g-profile__notices");
      coach();
      await playerPage("p3");
      assert.equal(notices().querySelector(".g-roster__status").textContent, "", "at rest the save says nothing");
      // A step on its way: the save's state at the right.
      const step = api.hold(PATCH);
      assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
      await settle();
      assert.equal(notices().querySelector(".g-roster__status").textContent, "Saving…");
      // Another device's save.
      step.release({ status: 409, body: { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: team({ revision: 6 }) } });
      await settle();
      assert.equal(notices().querySelector(".g-roster__conflict .g-callout__title").textContent, "The roster was changed on another device");
      assert.equal(notices().querySelector("[data-roster-reload]").textContent, "Load the new one");
      assert.ok(notices().closest(".g-profile__body"), "under his head");
      assert.ok(notices().classList.contains("g-roster__notices"), "in the roster's banners' look");
      // No network.
      coach();
      await playerPage("p3");
      api.fail(PATCH);
      save.stepSpp("t1", "p1", "touchdowns", 1);
      await settle();
      assert.equal(notices().querySelector(".g-roster__offline .g-callout__title").textContent, "No network");
      // A preparation: what its saves reset.
      coach();
      gamesAre([PREP_GAME]);
      await playerPage("p3");
      assert.equal(notices().querySelector(".g-callout--warn .g-callout__title").textContent, "Preparation for round 3 is on");
      assertStyled(view, ...STYLES);
    });
  });
});

test("his name and his skills are text", async () => {
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: withOne({ ...ADVANCED, name: HOSTILE, extraSkills: [...ADVANCED.extraSkills, { name: HOSTILE, access: "primary" }] }) });
    await playerPage("p3");
    assert.equal(view.querySelector(".g-profile__name").textContent, HOSTILE);
    assert.ok(view.querySelectorAll(".g-skill--card").some((card) => card.getAttribute("data-skill") === HOSTILE));
    assert.ok(!view.querySelector("img"));
    assert.ok(!view.querySelector("[onerror]"));
    assertCspSafe(view);
  });
});

test("every key is in both dictionaries; everything drawn is styled; the head's words readable", () => {
  assertDictionaryCovers("src/screens/team/roster/profile.mjs", "src/screens/team/roster/panel.mjs", "src/shell/app-header.mjs", "src/screens/team/player/index.mjs");
  for (const selector of [".g-profile__who", ".g-profile__name", ".g-profile__back"]) assertReadable(PROFILE, selector, "color", ["--header"], 4.5);
  assertReadable(PROFILE, ".g-profile__edit", "color", ["--header"], 4.5);
  for (const selector of [".g-profile__availl", ".g-profile__ledger", ".g-profile__hint", ".g-profile__accesskey", ".g-profile__accessvalue", ".g-profile__title"]) {
    assertReadable(PROFILE, selector, "color", ["--surface"], 4.5);
  }
  assertReadable(PROFILE, ".g-profile__availn", "color", ["--surface"], 3, { what: "44px" });
  const breakpoints = [...text(PROFILE).matchAll(/@media[^{]+/g)].map(([query]) => query.trim());
  assert.deepEqual(breakpoints, ["@media (max-width: 900px)"], "a phone's page: no rule of a desk's");
  assert.ok(!/--focus-ring/.test(text(PROFILE)), "the focus ring is base.css's");
  // K5: 07d's sheets come after 07c's market.css, in the order of their tasks; this file need not be the last.
  const styles = text("src/styles.css");
  const at = (path) => styles.indexOf(`@import url("${path}");`);
  assert.ok(at("screens/team/roster/market.css") >= 0 && at("screens/team/roster/profile.css") > at("screens/team/roster/market.css"));
  const later = ["player-sheets.css", "advance.css", "rolls.css", "fix.css"].map((name) => at(`screens/team/roster/${name}`)).concat(at("screens/team/manage/settings.css"));
  for (const place of later.filter((place) => place >= 0)) assert.ok(place > at("screens/team/roster/profile.css"));
});

test("what a finger presses on the profile is 44px", () => {
  const tokens = text("src/styles/tokens.css");
  assert.match(tokens, /--size-touch: 44px;/);
  assert.match(tokens, /--size-cta: 52px;/);
  // «‹ Roster»: a thumb tall over a 24px row (10px out above and under).
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__back", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__back", "margin"), ["-10px 0"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__backrow", "height"), ["24px"]);
  assert.deepEqual([valuesOf(PROFILE, ".g-profile__edit", "width"), valuesOf(PROFILE, ".g-profile__edit", "height")], [["var(--size-touch)"], ["var(--size-touch)"]]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__spp .g-btn--primary", "height"), ["var(--size-cta)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__skills .g-skill--card", "min-height"), ["var(--size-touch)"]);
});

test("a long name, a long skill and a long injury wrap; nothing is cut with «…»", async () => {
  const css = text(PROFILE).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/text-overflow\s*:\s*ellipsis/.test(css));
  assert.ok(!/white-space\s*:\s*nowrap/.test(css));
  for (const selector of [".g-profile__name", ".g-profile__who", ".g-profile__skills .g-skill--card", ".g-profile__injury", ".g-profile__accessvalue"]) {
    assert.deepEqual(valuesOf(PROFILE, selector, "overflow-wrap"), ["anywhere"], selector);
  }
  const injuries = text("src/screens/team/roster/frame.css").match(/\.g-roster__injuries \{[^}]*\}/)[0];
  assert.ok(!/text-overflow|nowrap/.test(injuries));
  const long = "Bartholomew Thistlewaite-Underhill the V";
  assert.equal(long.length, 40);
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: withOne({ ...ADVANCED, name: long }) });
    await playerPage("p3");
    assert.equal(view.querySelector(".g-profile__name").textContent, long, "his whole name");
  });
});

test("the profile's sizes are Player.html's", () => {
  const of = (selector, property) => valuesOf(PROFILE, selector, property);
  // The head: the header's colour, 14 16 20, 14 apart; «‹ Roster» 15/600 in the header's muted ink, no underline.
  assert.deepEqual([of(".g-profile__head", "background"), of(".g-profile__head", "padding"), of(".g-profile__head", "gap")],
    [["var(--header)"], ["var(--space-14) var(--space-16) var(--space-20)"], ["var(--space-14)"]]);
  assert.deepEqual([of(".g-profile__back", "font"), of(".g-profile__back", "color"), of(".g-profile__back", "text-decoration")],
    [["600 15px/1.2 var(--font-body)"], ["var(--header-muted)"], ["none"]]);
  assert.deepEqual(of(".g-profile__row", "gap"), ["var(--space-14)"]);
  // His number 60px ringed 2px, 28px; his name 30px/1.05; the line 15px/1.2 (Golos' own); the pencil round on a 12% veil.
  assert.deepEqual([of(".g-profile__badge .g-num", "width"), of(".g-profile__badge .g-num", "box-shadow"), of(".g-profile__badge .g-num", "font")],
    [["60px"], ["0 0 0 2px var(--header-ink)"], ["700 28px/1 var(--font-display)"]]);
  assert.deepEqual(of(".g-profile__name", "font"), ["700 30px/1.05 var(--font-display)"]);
  assert.deepEqual(of(".g-profile__who", "font"), ["400 15px/1.2 var(--font-body)"]);
  assert.deepEqual([of(".g-profile__edit", "border-radius"), of(".g-profile__edit", "background")], [["22px"], ["color-mix(in srgb, var(--header-ink) 12%, transparent)"]]);
  // `main`: 16 16 28, 22 apart. The characteristics' values 26px at Oswald's own line height: Player.html gives none (I2).
  assert.deepEqual([of(".g-profile__body", "padding"), of(".g-profile__body", "gap")], [["var(--space-16) var(--space-16) 28px"], ["var(--space-22)"]]);
  assert.deepEqual(of(".g-profile__body .g-stat__v", "font"), ["700 26px/normal var(--font-display)"]);
  // The SPP card: 16px corners, a 1px ring (#DCE3DF), 16 in, 14 apart; «27» 44px; the line under «Advancement» 13px, 6px up.
  assert.deepEqual([of(".g-profile__spp", "border-radius"), of(".g-profile__spp", "box-shadow"), of(".g-profile__spp", "padding"), of(".g-profile__spp", "gap")],
    [["var(--radius-2xl)"], ["inset 0 0 0 1px var(--line-strong)"], ["var(--space-16)"], ["var(--space-14)"]]);
  assert.deepEqual([of(".g-profile__availn", "font"), of(".g-profile__availl", "font"), of(".g-profile__ledger", "font")],
    [["700 44px/1 var(--font-display)"], ["600 15px/1.2 var(--font-body)"], ["400 13px/1.35 var(--font-body)"]]);
  assert.deepEqual([of(".g-profile__hint", "margin"), of(".g-profile__hint", "text-align"), of(".g-profile__hint", "font")],
    [["-6px 0 0"], ["center"], ["400 13px/normal var(--font-body)"]]);
  assert.deepEqual([of(".g-profile__spp .g-btn--primary", "border-radius"), of(".g-profile__spp .g-btn--primary", "font")], [["var(--radius-lg)"], ["700 17px/1.2 var(--font-body)"]]);
  // «Skills», «Injuries» 24px at Oswald's own line height (I2); a skill's card 10px corners, 6 12, 15/600, a gained one
  // ringed in a quarter of the accent over the tint (#B7D3C3, M1); the access 84px, 14px; the injuries 15px.
  assert.deepEqual(of(".g-profile__title", "font"), ["700 24px/normal var(--font-display)"]);
  assert.deepEqual(of(".g-profile__skills .g-skill--card.g-skill--gained", "box-shadow"), ["inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent)"]);
  assert.deepEqual([of(".g-profile__access", "font"), of(".g-profile__accesskey", "font")], [["400 14px/normal var(--font-body)"], ["400 14px/normal var(--font-body)"]]);
  assert.deepEqual([of(".g-profile__skills .g-skill--card", "border-radius"), of(".g-profile__skills .g-skill--card", "padding")], [["var(--radius-md)"], ["var(--space-6) var(--space-12)"]]);
  assert.deepEqual(of(".g-profile__accesskey", "width"), ["84px"]);
  assert.deepEqual(of(".g-profile__none", "font"), ["400 15px/normal var(--font-body)"]);
  for (const selector of [".g-profile", ".g-profile__name", ".g-profile__title", ".g-profile__access", ".g-profile__injury"]) {
    assert.deepEqual([of(selector, "text-transform"), of(selector, "letter-spacing")], [["none"], ["0"]], selector);
  }
});

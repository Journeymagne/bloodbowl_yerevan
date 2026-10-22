import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, blocks, inMedia, valuesOf } from "./helpers/contrast.mjs";

const frame = el(document, "div", { id: "app-frame", "data-shell": "guest" },
  el(document, "aside", { id: "side-nav" }), el(document, "header", { id: "app-header" }),
  el(document, "section", { id: "app-view" }), el(document, "footer", { id: "site-footer" }));
document.body.appendChild(frame);
// K9b: before the shell is imported, which reaches the API through the client that picks `fetch` up when it loads.
const api = installFakeApi();
const { mountShell, nextCompact, refreshShell, tabScrollLeft } = await import("../src/shell/shell.mjs");
const { setLocaleHandler } = await import("../src/core/locale-request.mjs");
const { state } = await import("../src/core/state.mjs");
const { ROUTE_NAMES, resolveRedirect, routeFromHash } = await import("../src/core/routes.mjs");
const { peekReturn, setReturn } = await import("../src/core/return-to.mjs");

const scrolls = [];
const scroller = { addEventListener: (type, listener) => scrolls.push(listener), document };
state.data = { teams: [], generatedAt: "2026-10-07T10:00:00Z" };
// What «New team» of the switcher is handed (stage 07d): the team block's button and the way back, as the app's sheet would be.
const newTeams = [];
mountShell({ document, scroller, onNewTeam: (button, options) => newTeams.push({ button, ...options }) });
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
/** Every script and stylesheet under src, as paths from the root of the repository. */
const sources = () => readdirSync(new URL("../src/", import.meta.url), { recursive: true }).filter((name) => /\.(css|m?js)$/.test(name)).map((name) => `src/${name}`);

test("the header folds past 48px, unfolds under 8px and holds between", () => {
  assert.deepEqual([[false, 49], [false, 30], [true, 30], [true, 7], [true, 100]].map(([compact, top]) => nextCompact(compact, top)), [true, false, true, false, true]);
});

test("a current tab past the edge is scrolled into view; one already visible is left", () => {
  assert.equal(tabScrollLeft({ tabLeft: 300, tabWidth: 90, viewWidth: 358, scrollLeft: 0 }), 48);
  assert.equal(tabScrollLeft({ tabLeft: 100, tabWidth: 60, viewWidth: 358, scrollLeft: 0 }), 0);
  assert.equal(tabScrollLeft({ tabLeft: 10, tabWidth: 60, viewWidth: 358, scrollLeft: 200 }), 0);
});

test("refreshing draws the mode, the header and the SideNav the route asks for", () => {
  state.auth.currentUser = null;
  refreshShell({ name: "refSection", params: { section: "skills" } });
  assert.equal(frame.getAttribute("data-shell"), "guest");
  assert.ok(document.querySelector("#app-header nav.g-tabs"));
  assert.ok(document.querySelector("#side-nav .g-sidenav__nav"));
  refreshShell({ name: "login", params: {} });
  assert.equal(frame.getAttribute("data-shell"), "bare");
});

test("a language button asks the app, and scrolling folds the header", () => {
  const asked = [];
  setLocaleHandler((locale) => asked.push(locale));
  refreshShell({ name: "season", params: {} });
  fireEvent(document.querySelector('[data-locale-switch="ru"]'), "click");
  assert.deepEqual(asked, ["ru"]);
  document.scrollingElement = { scrollTop: 120 };
  scrolls.forEach((listener) => listener());
  assert.ok(document.querySelector("#app-header").classList.contains("g-appbar--compact"));
});

test("the footer line under the content reads on the page", () => {
  assertReadable("src/shell/frame.css", ".g-site-footer", "color", ["--page"], 4.5);
});

test("the page has no 2.x chrome left", () => {
  const html = read("index.html");
  for (const gone of ['id="site-sidebar"', 'class="topbar"', "nav-toggle", "nav-overlay", "theme-select", "auth-button", "lang-toggle", "auth-modal"]) {
    assert.ok(!html.includes(gone), gone);
  }
  assert.ok(html.indexOf("data-skip-to-content") < html.indexOf('id="app-frame"'), "skip link first");
  // An image preloaded for nothing (the 2.x brand mark's logo) costs a warning on every load and competes with the fonts.
  const used = [html.replace(/<link rel="preload"[^>]*>/g, ""), ...sources().map(read)].join("\n");
  for (const [tag] of html.matchAll(/<link rel="preload" as="image"[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(tag)[1];
    assert.ok(used.includes(href.split("/").pop()), `${href} is preloaded and never used`);
  }
});

/**
 * A retired class anywhere in a selector — alone, compound (`body.nav-open`), under another
 * (`.view .sidebar`), inside `:is()`, `:where()` or `:not()` — with its family (`.brand-mark`,
 * `.theme-picker__swatch`), and the retired ids.
 */
const RETIRED = /\.(?:app-shell|sidebar|nav-toggle|nav-overlay|nav-list|nav-open|brand|legal-note|topbar|top-actions|theme-picker|search-wrap|icon-text-button)(?:[-_][\w-]*)?(?![\w-])|\.auth-[\w-]+|\.main(?![\w-])|#(?:site-sidebar|nav-toggle|nav-overlay|auth-button|lang-toggle|theme-select|generated-at)(?![\w-])/;

test("the retired-chrome pattern finds a retired name wherever a selector puts it, and nothing of 3.0", () => {
  for (const selector of [".view .sidebar", ":is(.topbar, .page-head)", ".content-panel a:where(:not(.primary-button, .icon-text-button))", "body.nav-open .nav-overlay",
    ".brand-mark img", ".theme-picker__swatch", ".auth-dialog", "body.auth-open", "#auth-button", "#lang-toggle", "#site-sidebar:hover", ".main"]) {
    assert.match(selector, RETIRED, selector);
  }
  for (const selector of [".matchday-sidebar", ".g-auth__brand", ".page-heading-main", ".g-main", ".g-main__footer", "#app-main", ".g-sidenav", ".g-appbar__team"]) {
    assert.doesNotMatch(selector, RETIRED, selector);
  }
});

test("no stylesheet styles the retired chrome", () => {
  for (const file of sources().filter((name) => name.endsWith(".css"))) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) assert.doesNotMatch(selector, RETIRED, `${file}: ${selector}`);
    }
  }
});

// K9b: the real standings rows carry `rank`; the row's place in the array is the server's order, not the place.
test("the header's place is the rank of the active team's standings row, and no row says no place", () => {
  const saved = { user: state.auth.currentUser, myTeams: state.myTeams, activeTeamId: state.activeTeamId, data: state.data, season: state.season.data };
  try {
    state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false };
    state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "human" }], loaded: true, loading: false, error: "" };
    state.activeTeamId = "t1";
    state.data = { teams: [{ slug: "human", title: "Human" }], generatedAt: "2026-10-07T10:00:00Z" };
    state.season.data = { standings: [{ rank: 1, team: { id: "t9" } }, { rank: 3, team: { id: "t1" } }] };
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    assert.equal(frame.getAttribute("data-shell"), "coach");
    assert.equal(document.querySelector("#app-header .g-appbar__label").textContent, "Ashgrove Wardens");
    assert.equal(document.querySelector("#app-header .g-appbar__sub").textContent, "Human · #3 in the league");
    state.season.data = { standings: [{ rank: 1, team: { id: "t9" } }] };
    refreshShell();
    assert.equal(document.querySelector("#app-header .g-appbar__sub").textContent, "Human", "the route is remembered; no row, no place");
  } finally {
    Object.assign(state, { myTeams: saved.myTeams, activeTeamId: saved.activeTeamId, data: saved.data });
    state.auth.currentUser = saved.user;
    state.season.data = saved.season;
  }
});

// Task 15: the SideNav's card is the active team's current match (shell/current-match.mjs), drawn with the frame.
test("the SideNav carries the active team's current match above the language; a guest and a coach with no team have none", () => {
  const saved = { user: state.auth.currentUser, myTeams: state.myTeams, activeTeamId: state.activeTeamId, data: state.data, games: state.games };
  const side = (id, name) => ({ user: { id: `u-${id}`, login: "x" }, team: { id, name } });
  const fixture = (id, over = {}) => ({ id, kind: "league", roundStatus: "started", roundNumber: 7, season: { currentRound: 7 }, resultStatus: "pending",
    preparationStatus: "not_started", postMatchStatus: "not_started", viewerIsHome: true, updatedAt: "2026-10-10T10:00:00Z",
    home: side("t1", "Ashgrove Wardens"), away: side("r1", "Grimtusk Raiders"), ...over });
  const games = (...items) => { state.games = { items, currentItems: [], loaded: true, loading: false, error: "" }; };
  const label = () => document.querySelector("#side-nav .g-navmatch .g-navmatch__label")?.textContent ?? null;
  try {
    state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false };
    state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "human" }], loaded: true, loading: false, error: "" };
    state.activeTeamId = "t1";
    state.data = { teams: [{ slug: "human", title: "Human" }], generatedAt: "2026-10-07T10:00:00Z" };
    games(fixture("g-next"));
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    assert.equal(label(), "Next match");
    const bottom = document.querySelector("#side-nav .g-sidenav__bottom");
    assert.deepEqual(bottom.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class").split(" ")[0]), ["g-navmatch", "g-sidenav__foot"]);
    games(fixture("g-next"), fixture("g-live", { preparationStatus: "in_progress", postMatchStatus: "draft" }));
    refreshShell();
    assert.equal(label(), "Match in play", "the list is read again on every refresh");
    // K8: a started match whose score was confirmed around the post-match is not live, and the card goes back to what is next.
    games(fixture("g-next"), fixture("g-around", { preparationStatus: "in_progress", resultStatus: "confirmed", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 0, awayCasualties: 0 }));
    refreshShell();
    assert.equal(label(), "Next match");
    games();
    refreshShell();
    assert.equal(label(), null, "no match, no card");
    games(fixture("g-next"));
    state.activeTeamId = "t9";
    refreshShell();
    assert.equal(label(), null, "a team that is not in the coach's list has no card");
    state.activeTeamId = "t1";
    state.myTeams = { items: [], loaded: true, loading: false, error: "" };
    refreshShell();
    assert.equal(label(), null, "a coach with no team has no card");
    state.myTeams = saved.myTeams;
    state.auth.currentUser = null;
    refreshShell();
    assert.equal(label(), null, "a guest has no card");
  } finally {
    Object.assign(state, { myTeams: saved.myTeams, activeTeamId: saved.activeTeamId, data: saved.data, games: saved.games });
    state.auth.currentUser = saved.user;
  }
});

test("a coach with two teams: switching the active team switches the card, and each team shows only its own match", () => {
  const saved = { user: state.auth.currentUser, myTeams: state.myTeams, activeTeamId: state.activeTeamId, data: state.data, games: state.games };
  const side = (id, name) => ({ user: { id: `u-${id}`, login: "x" }, team: { id, name } });
  const fixture = (id, home, away, over = {}) => ({ id, kind: "league", roundStatus: "started", roundNumber: 7, season: { currentRound: 7 }, resultStatus: "pending",
    preparationStatus: "not_started", postMatchStatus: "not_started", viewerIsHome: true, updatedAt: "2026-10-10T10:00:00Z", home, away, ...over });
  const card = () => [".g-navmatch__label", ".g-navmatch__opp", ".g-navmatch__cta"].map((selector) => document.querySelector(`#side-nav ${selector}`)?.textContent ?? null);
  try {
    state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false };
    state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "human" }, { id: "t2", name: "Ironmaw Brawlers", baseTeamSlug: "human" }], loaded: true, loading: false, error: "" };
    state.data = { teams: [{ slug: "human", title: "Human" }], generatedAt: "2026-10-07T10:00:00Z" };
    state.games = { loaded: true, loading: false, error: "", currentItems: [], items: [
      fixture("g-one", side("t1", "Ashgrove Wardens"), side("r1", "Grimtusk Raiders")),
      fixture("g-two", side("r2", "Dunmere Mudlarks"), side("t2", "Ironmaw Brawlers"), { viewerIsHome: false, preparationStatus: "in_progress", postMatchStatus: "draft" }),
    ] };
    state.activeTeamId = "t1";
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    assert.deepEqual(card(), ["Next match", "Grimtusk Raiders", "Match preparation"]);
    state.activeTeamId = "t2";
    refreshShell();
    assert.deepEqual(card().slice(0, 2), ["Match in play", "Dunmere Mudlarks"], "the other team's match, the other opponent");
    assert.equal(document.querySelector("#side-nav .g-navmatch__sub").textContent, "Round 7 · away");
    state.activeTeamId = "t1";
    refreshShell();
    assert.deepEqual(card(), ["Next match", "Grimtusk Raiders", "Match preparation"]);
  } finally {
    Object.assign(state, { myTeams: saved.myTeams, activeTeamId: saved.activeTeamId, data: saved.data, games: saved.games });
    state.auth.currentUser = saved.user;
  }
});

// Task 12 carry: the 2.x sidebar offered a guest #/my-teams, which the router sends on.
test("no link a guest is shown, on any page, is one the router sends on: My Teams least of all", () => {
  state.auth.currentUser = null;
  const hrefs = new Set([...read("index.html").matchAll(/href="(#[^"]*)"/g)].map(([, href]) => href));
  for (const name of ROUTE_NAMES) {
    refreshShell({ name, params: {} });
    for (const link of document.querySelectorAll("#app-header a, #side-nav a, #site-footer a")) hrefs.add(link.getAttribute("href"));
  }
  assert.ok(hrefs.has("#/legal") && hrefs.has("#/login"), "the guest's links were collected");
  for (const href of hrefs) {
    assert.doesNotMatch(href, /my-teams/);
    assert.equal(resolveRedirect(routeFromHash(href), { signedIn: false, hash: href }).target, null, href);
  }
});

// What the 2.x header button did (Task 9, M6): a guest who signs in comes back to the page they were reading.
test("a guest's sign-in link, in the header or the SideNav, keeps the page they were on to come back to", () => {
  state.auth.currentUser = null;
  refreshShell({ name: "season", params: {} });
  for (const selector of ["#app-header a.g-appbar__login", "#side-nav .g-sidenav__login a"]) {
    setReturn("");
    globalThis.location = { hash: "#/season" };
    fireEvent(document.querySelector(selector), "click");
    assert.equal(peekReturn(), "#/season", selector);
  }
  setReturn("");
});

test("the footer under the content carries the data date; the date is read when the data is there", () => {
  state.auth.currentUser = null;
  refreshShell({ name: "season", params: {} });
  assert.match(document.querySelector("#site-footer .g-site-footer").textContent, /^Updated 07\/10\/2026 · /);
});

// Stage 13 (decision 6): `overflow-x: hidden` made .g-main a box that scrolls (though it never does), the one a sticky
// part sticks to, so it never stuck; each screen with one clipped it back with a rule of its own. `clip` cuts off what
// goes past the sides without making a box, so the window is what every sticky part sticks to.
test("the main clips sideways for every screen, so a sticky part sticks to the window", () => {
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "overflow-x"), ["clip"]);
  assert.deepEqual([valuesOf("src/shell/frame.css", ".g-main", "overflow"), valuesOf("src/shell/frame.css", ".g-main", "overflow-y")], [[], []]);
  for (const file of sources().filter((name) => name.endsWith(".css"))) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) assert.ok(!selector.includes(".g-main:has("), `${file}: ${selector} clips the main for one screen`);
    }
  }
});

test("a short page fills the screen without scrolling: the content grows into it, and nothing takes the old top bar's height off", () => {
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "display"), ["flex"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "flex-direction"), ["column"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-frame #app-view", "min-height"), ["0"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-frame #app-view", "flex"), ["1 0 auto"]);
});

test("a bare screen's root fills the frame; a sheet it draws in #app-view keeps its own place (09b fidelity J2)", () => {
  const root = '.g-frame[data-shell="bare"] #app-view > :not(dialog)';
  assert.deepEqual([valuesOf("src/shell/frame.css", root, "margin"), valuesOf("src/shell/frame.css", root, "max-width")], [["0"], ["none"]]);
  assert.equal(valuesOf("src/shell/frame.css", '.g-frame[data-shell="bare"] #app-view > *', "margin").length, 0, "a dialog is no screen's root");
});

test("a sheet's scroll lock does not shift the page", () => {
  assert.deepEqual(valuesOf("src/shell/frame.css", "html", "scrollbar-gutter"), ["stable"]);
});

// R13-M6 (WCAG 2.4.11): the phone's header sticks to the top, 102px drawn and 91px folded (measured live). An element
// the keyboard reaches above the view, as Shift+Tab does, is scrolled to stand under it, not behind it.
test("on a phone, an element scrolled into view by the keyboard stands clear of the sticky header", () => {
  const css = read("src/shell/frame.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = css.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)[1];
  const padding = phone.match(/(?:^|\n)\s*html \{[^}]*scroll-padding-top: (\d+)px;/);
  assert.ok(padding, "html sets scroll-padding-top under 900px");
  assert.ok(Number(padding[1]) >= 102, `${padding[1]}px clears a 102px header`);
  assert.equal(valuesOf("src/shell/frame.css", "html", "scroll-padding-top").length, 1, "and only there: the desktop has no sticky header");
  assert.deepEqual(valuesOf("src/shell/app-header.css", ".g-appbar", "position"), ["sticky"]);
});

// R14 (N3): #app-view takes the focus after a form's navigation and from the skip link, as a tabindex="-1"
// container; it is a place to start from, not a control, and draws no ring around the whole screen.
test("the content takes the focus without a ring drawn round the whole screen", () => {
  assert.deepEqual(valuesOf("src/shell/frame.css", "#app-view:focus", "outline"), ["none"]);
  assert.match(read("index.html"), /<section id="app-view" tabindex="-1">/);
});

// Stage 13 (decision 4): the view's padding is the prototypes' `<main>`'s — Team.html, Matches.html, Player.html,
// CoachProfile.html, Guest.html up to 900px; every Desk*.html but the sign-in from 901px. A band reads the same figures.
test("the frame pads the view as the prototypes' main: 16 16 28 on a phone, 24 32 40 on a desk", () => {
  const frameCss = "src/shell/frame.css";
  assert.deepEqual(valuesOf(frameCss, "#app-view", "padding"), ["var(--view-top) var(--view-side) var(--view-bottom)"]);
  for (const [name, phone, desk] of [["--view-top", "16px", "24px"], ["--view-side", "16px", "32px"], ["--view-bottom", "28px", "40px"]]) {
    assert.deepEqual(inMedia(frameCss, "max-width: 900px", "#app-view", name), [phone], name);
    assert.deepEqual(inMedia(frameCss, "min-width: 901px", "#app-view", name), [desk], name);
  }
  // A page with a frame of its own (the builder, the sign-in, the match's visits) keeps none of it.
  assert.deepEqual(valuesOf(frameCss, '.g-frame[data-shell="bare"] #app-view', "padding"), ["0"]);
});

/** Every stylesheet of 3.0: src/**\/*.css but the 2.x tables of src/styles/, which go with their rules at stage 13's wave 2. */
const sheets30 = () => sources().filter((file) => file.endsWith(".css") && !file.startsWith("src/styles/"));

test("no .view is left: not in index.html, not in a stylesheet, no wash under a page", () => {
  assert.doesNotMatch(read("index.html"), /class="[^"]*\bview\b/, "the view is #app-view, without the 2.x class");
  for (const file of sheets30()) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) {
        assert.doesNotMatch(selector, /\.view(?![\w-])/, `${file}: ${selector}`);
        assert.ok(!(selector.includes("#app-view") && selector.includes("::after")), `${file}: ${selector} draws under the view`);
      }
    }
  }
});

// Stage 13, pre-flight L3: DeskRef.html and DeskGuest.html pad their main 24 32 40 under the band, as every desk page
// does — the frame's figures. The two screens that gave the 2.x padding up from 901px take the frame's instead.
test("from 901px the reference and a guest's front page stand in the frame's padding, as every desk page", () => {
  for (const [file, root] of [["src/screens/ref/ref.css", ".g-ref"], ["src/screens/home/guest.css", ".g-guest"]]) {
    for (const { selectors } of blocks(read(file))) {
      for (const selector of selectors) assert.ok(!selector.includes("#app-view"), `${file}: ${selector} gives the frame's padding up`);
    }
    assert.deepEqual(inMedia(file, "min-width: 901px", root, "gap"), ["0"], `${root}: the band and the body, 24 apart by the band's margin`);
  }
  assert.deepEqual(inMedia("src/screens/ref/ref.css", "min-width: 901px", ".g-ref__body", "padding"), [], "the body's 24 32 40 are the frame's");
  assert.deepEqual(inMedia("src/screens/home/guest.css", "min-width: 901px", ".g-guest__hero", "margin"), ["0"]);
  assert.deepEqual(inMedia("src/screens/home/guest.css", "min-width: 901px", ".g-guest__grid", "margin"), ["var(--space-20) 0 0"]);
});

// Stage 13, pre-flight L35: what took the 2.x view's padding back reads the frame's figures, and what added 4 to its
// 28 to make 32 adds nothing to the frame's 32.
test("a page that reaches past the view's padding takes back the frame's figures, never the 2.x view's", () => {
  const back = "calc(-1 * var(--view-top)) calc(-1 * var(--view-side))";
  assert.deepEqual(inMedia("src/screens/season/league.css", "max-width: 900px", ".g-league", "margin"), [`${back} 0`]);
  assert.deepEqual(inMedia("src/screens/coaches/profile.css", "max-width: 900px", ".g-coach--phone", "margin"), [`${back} calc(-1 * var(--view-bottom))`]);
  assert.deepEqual(inMedia("src/screens/coaches/profile.css", "min-width: 901px", ".g-coach--desk", "padding"), ["0"]);
  assert.deepEqual(inMedia("src/screens/coaches/team.css", "min-width: 901px", ".g-opp__body", "padding"), ["var(--space-24) 0 0"]);
  const open = ".g-rtable__player.is-expanded > tr >";
  const lastShown = ":nth-last-child(1 of :not(.g-rtable__c--desk))";
  const table = "src/ui/roster-table.css";
  assert.deepEqual(inMedia(table, "max-width: 900px", `${open} :first-child`, "box-shadow"), ["calc(-1 * var(--view-side)) 0 var(--surface-2)"]);
  assert.deepEqual(inMedia(table, "max-width: 900px", `${open} ${lastShown}`, "box-shadow"), ["var(--view-side) 0 var(--surface-2)"]);
  assert.deepEqual(inMedia(table, "max-width: 900px", `${open} :first-child${lastShown}`, "box-shadow"), ["calc(-1 * var(--view-side)) 0 var(--surface-2), var(--view-side) 0 var(--surface-2)"]);
  // OppTeam.html's «‹ Table»: its line 30 from the top (14 + the 32 of its link, halved), the frame's 16 above it.
  assert.deepEqual(valuesOf("src/screens/coaches/team.css", ".g-opp--phone > .g-opp__back", "margin"), ["-8px 0 -14px"]);
});

test("every frame class the page names is styled, the frame reaches the page, and it breaks at 900/901 only", () => {
  const css = ["src/shell/frame.css", "src/shell/app-header.css", "src/shell/side-nav.css"].map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set([...read("index.html").matchAll(/class="([^"]*)"/g)].flatMap(([, list]) => list.split(/\s+/)).filter((name) => name.startsWith("g-")));
  assert.ok(names.has("g-frame"));
  for (const name of names) assert.match(css, new RegExp(`\\.${name}(?![\\w-])`), `.${name} is not styled`);
  assert.match(read("src/styles.css"), /@import url\("shell\/frame\.css"\);/);
  for (const [, query] of read("src/shell/frame.css").matchAll(/@media\s*([^{]+)\{/g)) {
    assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  }
});

test("a current tab is scrolled clear of the fade at the row's edge, not only inside the row", () => {
  assert.match(read("src/shell/app-header.css"), /mask-image: linear-gradient\(to right, #000 85%, transparent\);/);
  assert.match(read("src/shell/shell.mjs"), /const TABS_CLEAR = 0\.85;/);
});

// Stage 06, Task 4: the block at the top of the header and the SideNav opens the switcher.

const PATCH = "PATCH /api/auth/preferences";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const switcherHost = () => document.querySelector("#team-switcher-host");
const openDialog = () => switcherHost().querySelector("dialog#team-switcher");

/** A coach with two teams, the first active, who is on the page at `hash`; the state and the address are put back after. */
async function asCoach(hash, run) {
  const saved = { user: state.auth.currentUser, myTeams: state.myTeams, activeTeamId: state.activeTeamId, data: state.data, games: state.games, season: state.season.data, location: globalThis.location };
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  globalThis.location = { hash };
  state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false, preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "human", stage: "active", inActiveSeason: true }, { id: "t2", name: "Ironmaw Brawlers", baseTeamSlug: "human", stage: "active", inActiveSeason: false }], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = { teams: [{ slug: "human", title: "Human" }], generatedAt: "2026-10-07T10:00:00Z" };
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  try {
    await run();
  } finally {
    refreshShell({ name: "login", params: {} });
    Object.assign(state, { myTeams: saved.myTeams, activeTeamId: saved.activeTeamId, data: saved.data, games: saved.games });
    state.auth.currentUser = saved.user;
    state.season.data = saved.season;
    globalThis.location = saved.location;
  }
}

test("the frame keeps a place for the switcher after everything else, and it takes no room of its own", () => {
  const host = switcherHost();
  assert.ok(host, "mountShell added it");
  assert.equal(frame.childNodes.filter((node) => node.nodeType === 1).at(-1), host);
  assert.equal(document.querySelectorAll("#team-switcher-host").length, 1);
  assert.deepEqual(valuesOf("src/shell/team-switcher.css", "#team-switcher-host", "display"), ["contents"], "an empty grid item would still be a cell of the desk's grid");
});

test("the header and the SideNav open the same switcher, and closing gives the focus back to the button that opened it", async () => {
  await asCoach("#/t/t1/roster", () => {
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    for (const selector of ["#side-nav [data-team-switcher]", "#app-header [data-team-switcher]"]) {
      const opener = document.querySelector(selector);
      fireEvent(opener, "click");
      assert.ok(openDialog().isModal, `${selector} opens it modally`);
      assert.deepEqual(switcherHost().querySelectorAll("[data-switch-team]").map((row) => row.getAttribute("data-switch-team")), ["t1", "t2"]);
      // Where the focus goes on opening is the browser's (showModal moves it into the dialog; the fake page does not), so only
      // the way back is asserted here, below; the opening was looked at in a real tab.
      fireEvent(switcherHost().querySelector("[data-sheet-close]"), "click");
      assert.equal(switcherHost().querySelector("dialog"), null, "closed, the host is empty");
      assert.equal(document.activeElement, opener, selector);
    }
    // Escape and the backdrop are the same way out as the cross.
    const opener = document.querySelector("#app-header [data-team-switcher]");
    for (const leave of [(dialog) => fireEvent(dialog, "keydown", { key: "Escape" }), (dialog) => fireEvent(dialog, "click")]) {
      document.querySelector("#side-nav [data-team-switcher]").focus();
      fireEvent(opener, "click");
      leave(openDialog());
      assert.equal(switcherHost().querySelector("dialog"), null);
      assert.equal(document.activeElement, opener);
    }
  });
});

test("the switcher's rows come from the coach's own list: the active team ticked, the place and the record from the table and the games", async () => {
  await asCoach("#/t/t1/roster", () => {
    const win = { id: "g1", kind: "league", season: { id: "s1" }, roundNumber: 1, resultStatus: "confirmed", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 0, awayCasualties: 0, home: { team: { id: "t1" } }, away: { team: { id: "x" } } };
    state.season.data = { season: { id: "s1" }, standings: [{ rank: 1, team: { id: "x" } }, { rank: 3, team: { id: "t1" } }] };
    state.games = { items: [win], currentItems: [], loaded: true, loading: false, error: "" };
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    fireEvent(document.querySelector("#app-header [data-team-switcher]"), "click");
    const rows = switcherHost().querySelectorAll(".g-switcher__row");
    assert.deepEqual(rows.map((row) => row.querySelector(".g-teamface__line").textContent), ["Human · #3 · 1-0-0", "Human"]);
    assert.deepEqual(rows.map((row) => row.getAttribute("aria-current")), ["true", null]);
    fireEvent(switcherHost().querySelector("[data-sheet-close]"), "click");
  });
});

test("choosing a team on a team page goes to the same section of the other one; on the season page it only makes it active", async () => {
  await asCoach("#/t/t1/roster", async () => {
    const choose = (route, hash, id) => {
      globalThis.location = { hash };
      refreshShell(route);
      fireEvent(document.querySelector("#app-header [data-team-switcher]"), "click");
      fireEvent(switcherHost().querySelector(`[data-switch-team="${id}"]`), "click");
      assert.equal(switcherHost().querySelector("dialog"), null, "a choice closes it");
    };
    choose({ name: "teamRoster", params: { teamId: "t1" } }, "#/t/t1/roster", "t2");
    await flush();
    assert.equal(location.hash, "#/t/t2/roster");
    assert.equal(state.activeTeamId, "t1", "the address makes it active, as the router does for any team's page, not the switcher");
    assert.equal(api.calls.filter(({ key }) => key === PATCH).length, 0);
    api.reply(PATCH, 200, { preferences: { activeTeamId: "t2" } });
    choose({ name: "season", params: {} }, "#/season", "t2");
    await flush();
    assert.equal(state.activeTeamId, "t2");
    assert.equal(location.hash, "#/season", "the page stays");
    assert.deepEqual(api.calls.filter(({ key }) => key === PATCH).map(({ body }) => body), [{ activeTeamId: "t2" }], "the account is told once");
    api.assertAnswered();
  });
});

test("choosing the team whose page it is only closes the switcher: a player's page does not jump to the roster", async () => {
  await asCoach("#/t/t1/roster/p1", async () => {
    // Stage 07d (owner's answer 1): a player's address is drilled into — a phone's header, and its switcher, are not drawn there.
    refreshShell({ name: "teamPlayer", params: { teamId: "t1", playerId: "p1" } });
    assert.equal(document.querySelector("#app-header [data-team-switcher]"), null, "no switcher in the header of a player's address");
    // A desk's SideNav keeps its team block there: the team whose page it is only closes the switcher, and the player stays.
    fireEvent(document.querySelector("#side-nav [data-team-switcher]"), "click");
    assert.equal(switcherHost().querySelector('[data-switch-team="t1"]').getAttribute("aria-current"), "true");
    fireEvent(switcherHost().querySelector('[data-switch-team="t1"]'), "click");
    await flush();
    assert.equal(switcherHost().querySelector("dialog"), null, "closed");
    assert.equal(location.hash, "#/t/t1/roster/p1", "the player stays");
    // From a page with a header, the team's roster: the same team only closes it, the other team is the roster of that team.
    globalThis.location = { hash: "#/t/t1/roster" };
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    fireEvent(document.querySelector("#app-header [data-team-switcher]"), "click");
    assert.equal(switcherHost().querySelector('[data-switch-team="t1"]').getAttribute("aria-current"), "true");
    fireEvent(switcherHost().querySelector('[data-switch-team="t1"]'), "click");
    await flush();
    assert.equal(switcherHost().querySelector("dialog"), null, "closed");
    assert.equal(location.hash, "#/t/t1/roster", "the page stays");
    assert.equal(api.calls.length, 0, "nothing is sent: it was the active team already");
    fireEvent(document.querySelector("#app-header [data-team-switcher]"), "click");
    fireEvent(switcherHost().querySelector('[data-switch-team="t2"]'), "click");
    assert.equal(location.hash, "#/t/t2/roster");
  });
});

test("choosing the team that is active on a page that is no team's sends nothing to the account", async () => {
  await asCoach("#/season", async () => {
    refreshShell({ name: "season", params: {} });
    fireEvent(document.querySelector("#app-header [data-team-switcher]"), "click");
    fireEvent(switcherHost().querySelector('[data-switch-team="t1"]'), "click");
    await flush();
    assert.equal(switcherHost().querySelector("dialog"), null);
    assert.equal(location.hash, "#/season", "the page stays");
    assert.equal(state.activeTeamId, "t1");
    assert.equal(api.calls.filter(({ key }) => key === PATCH).length, 0, "the account already names it");
  });
});

test("a link in the switcher closes it, and a route change closes it too; a redraw for the same route leaves it", async () => {
  await asCoach("#/t/t1/roster", () => {
    const route = { name: "teamRoster", params: { teamId: "t1" } };
    refreshShell(route);
    fireEvent(document.querySelector("#side-nav [data-team-switcher]"), "click");
    refreshShell();
    assert.ok(openDialog(), "the games came in, the frame is drawn again: the switcher stays");
    fireEvent(switcherHost().querySelector("a.g-switcher__all"), "click");
    assert.equal(switcherHost().querySelector("dialog"), null, "the way to all the teams closes it");
    fireEvent(document.querySelector("#side-nav [data-team-switcher]"), "click");
    refreshShell({ name: "season", params: {} });
    assert.equal(switcherHost().querySelector("dialog"), null, "a new page takes it with it");
  });
});

test("«New team» in the switcher: the switcher closes, onNewTeam is handed the team block's button and a way back that opens the switcher again", async () => {
  await asCoach("#/t/t1/roster", () => {
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    for (const selector of ["#side-nav [data-team-switcher]", "#app-header [data-team-switcher]"]) {
      newTeams.length = 0;
      const opener = document.querySelector(selector);
      fireEvent(opener, "click");
      fireEvent(switcherHost().querySelector("[data-switcher-new]"), "click");
      assert.equal(switcherHost().querySelector("dialog"), null, `${selector}: the switcher is closed before the sheet opens: one modal dialog at a time`);
      assert.equal(newTeams.length, 1, "pressed once, reported once");
      assert.ok(newTeams[0].button === opener, "it is handed the team block the switcher was opened from: the sheet gives the focus back to it");
      assert.deepEqual(Object.keys(newTeams[0]).sort(), ["back", "button"]);
      assert.ok(document.activeElement === opener, "closing gave it the focus, as for any way out; the sheet takes it where it opens");
      // The way back (the sheet's «‹» or «← My teams») opens the switcher again, from the coach's list as it stands.
      document.querySelector("#app-view").focus();
      newTeams[0].back();
      assert.ok(openDialog().isModal, "the switcher is open, modal, in its host");
      assert.deepEqual(switcherHost().querySelectorAll("[data-switch-team]").map((row) => row.getAttribute("data-switch-team")), ["t1", "t2"]);
      // Where the focus goes on opening is the browser's (see above); closing it gives it back to the same button.
      fireEvent(switcherHost().querySelector("[data-sheet-close]"), "click");
      assert.equal(switcherHost().querySelector("dialog"), null);
      assert.ok(document.activeElement === opener, `${selector}: the switcher that came back closes onto the block, as the first did`);
    }
    // Escape closes the switcher that came back, too.
    const opener = document.querySelector("#app-header [data-team-switcher]");
    fireEvent(opener, "click");
    fireEvent(switcherHost().querySelector("[data-switcher-new]"), "click");
    newTeams.at(-1).back();
    document.querySelector("#app-view").focus();
    fireEvent(openDialog(), "keydown", { key: "Escape" });
    assert.equal(switcherHost().querySelector("dialog"), null);
    assert.ok(document.activeElement === opener);
    // A choice made in the switcher that came back keeps the section, as in the first.
    fireEvent(opener, "click");
    fireEvent(switcherHost().querySelector("[data-switcher-new]"), "click");
    newTeams.at(-1).back();
    fireEvent(switcherHost().querySelector('[data-switch-team="t2"]'), "click");
    assert.equal(location.hash, "#/t/t2/roster");
    assert.equal(switcherHost().querySelector("dialog"), null);
  });
});

// Stage 07d final review m1, for the switcher too: the phone header's block is hidden on a desk (app-header.css), still in the page.
test("a switcher closed after the width hid the block it was opened from gives the focus to the screen's title", async () => {
  await asCoach("#/t/t1/roster", () => {
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    const screen = document.querySelector("#app-view");
    screen.innerHTML = '<h1 tabindex="-1">Roster</h1>';
    try {
      const opener = document.querySelector("#app-header [data-team-switcher]");
      fireEvent(opener, "click");
      opener.getClientRects = () => [];
      fireEvent(openDialog(), "keydown", { key: "Escape" });
      assert.equal(switcherHost().querySelector("dialog"), null);
      assert.ok(document.activeElement === screen.querySelector("h1"), "not the hidden block, nor the body");
    } finally {
      screen.innerHTML = "";
    }
  });
});

test("a switcher closed over a button that is gone, as a guest's block is a link, does not look for it", async () => {
  await asCoach("#/t/t1/roster", () => {
    refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
    const opener = document.querySelector("#app-header [data-team-switcher]");
    fireEvent(opener, "click");
    state.auth.currentUser = null;
    refreshShell({ name: "home", params: {} });
    assert.equal(switcherHost().querySelector("dialog"), null);
    assert.equal(opener.isConnected, false, "the coach's button is gone");
    assert.notEqual(document.activeElement, opener);
    assert.ok(document.querySelector("#app-header a.g-appbar__team"));
  });
});

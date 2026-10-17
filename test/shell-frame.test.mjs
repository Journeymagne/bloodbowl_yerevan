import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, blocks, valuesOf } from "./helpers/contrast.mjs";

const frame = el(document, "div", { id: "app-frame", "data-shell": "guest" },
  el(document, "aside", { id: "side-nav" }), el(document, "header", { id: "app-header" }),
  el(document, "div", { id: "ref-search", hidden: "" }), el(document, "section", { id: "app-view" }), el(document, "footer", { id: "site-footer" }));
document.body.appendChild(frame);
const { mountShell, nextCompact, refreshShell, tabScrollLeft } = await import("../src/shell/shell.mjs");
const { setLocaleHandler } = await import("../src/core/locale-request.mjs");
const { state } = await import("../src/core/state.mjs");
const { ROUTE_NAMES, resolveRedirect, routeFromHash } = await import("../src/core/routes.mjs");
const { peekReturn, setReturn } = await import("../src/core/return-to.mjs");

const scrolls = [];
const scroller = { addEventListener: (type, listener) => scrolls.push(listener), document };
state.data = { teams: [], generatedAt: "2026-10-07T10:00:00Z" };
mountShell({ document, scroller });
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

test("refreshing draws the mode, the header, the SideNav and the search bar the route asks for", () => {
  state.auth.currentUser = null;
  refreshShell({ name: "refSection", params: { section: "skills" } });
  assert.equal(frame.getAttribute("data-shell"), "guest");
  assert.ok(document.querySelector("#app-header nav.g-tabs"));
  assert.ok(document.querySelector("#side-nav .g-sidenav__nav"));
  assert.equal(document.querySelector("#ref-search").hasAttribute("hidden"), false);
  refreshShell({ name: "login", params: {} });
  assert.equal(frame.getAttribute("data-shell"), "bare");
  assert.equal(document.querySelector("#ref-search").hasAttribute("hidden"), true);
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
  for (const selector of [".matchday-sidebar", ".g-auth__brand", ".page-heading-main", ".g-main", ".g-main__footer", "#app-main", ".g-sidenav", ".g-searchbar", ".g-appbar__team"]) {
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
  refreshShell({ name: "teamNew", params: {} });
  for (const selector of ["#app-header a.g-appbar__login", "#side-nav .g-sidenav__login a"]) {
    setReturn("");
    globalThis.location = { hash: "#/teams/new" };
    fireEvent(document.querySelector(selector), "click");
    assert.equal(peekReturn(), "#/teams/new", selector);
  }
  setReturn("");
});

test("the footer under the content carries the data date; the date is read when the data is there", () => {
  state.auth.currentUser = null;
  refreshShell({ name: "season", params: {} });
  assert.match(document.querySelector("#site-footer .g-site-footer").textContent, /^Updated 07\/10\/2026 · /);
});

test("a short page fills the screen without scrolling: the content grows into it, and nothing takes the old top bar's height off", () => {
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "display"), ["flex"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "flex-direction"), ["column"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-frame #app-view", "min-height"), ["0"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-frame #app-view", "flex"), ["1 0 auto"]);
});

test("a sheet's scroll lock does not shift the page, and a hidden search bar stays hidden", () => {
  assert.deepEqual(valuesOf("src/shell/frame.css", "html", "scrollbar-gutter"), ["stable"]);
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-searchbar[hidden]", "display"), ["none"]);
  assertReadable("src/shell/frame.css", ".g-searchbar__input", "color", ["--surface-2"], 4.5);
  assertReadable("src/shell/frame.css", ".g-searchbar__input::placeholder", "color", ["--surface-2"], 4.5);
});

test("every frame class the page names is styled, the frame reaches the page, and it breaks at 900/901 only", () => {
  const css = ["src/shell/frame.css", "src/shell/app-header.css", "src/shell/side-nav.css"].map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set([...read("index.html").matchAll(/class="([^"]*)"/g)].flatMap(([, list]) => list.split(/\s+/)).filter((name) => name.startsWith("g-")));
  assert.ok(names.has("g-frame") && names.has("g-searchbar"));
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

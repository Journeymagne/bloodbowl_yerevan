import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  adminTeamEditUrl,
  authUrl,
  gameUrl,
  matchRoute,
  navRouteForPage,
  newTeamUrl,
  pageUrl,
  playerTeamUrl,
  playerUrl,
  refUrl,
  resolveRedirect,
  routeFromHash,
  savedRosterUrl,
  seasonTabUrl,
  settingsUrl,
  teamPlayerUrl,
  teamsUrl,
  teamUrl,
  TEAM_ROUTES,
} from "../src/core/routes.mjs";

const guest = { signedIn: false, activeTeamId: null, returnTo: "" };
const coach = { signedIn: true, activeTeamId: "t1", returnTo: "" };
const teamless = { signedIn: true, activeTeamId: null, returnTo: "" };
const target = (route, context) => resolveRedirect(route, context).target;

// ---------------------------------------------------------------------------
// Building links
// ---------------------------------------------------------------------------

test("a link can be built from an entity or from a bare id", () => {
  // Both spellings exist at call sites; they must agree.
  assert.equal(playerUrl("u1"), playerUrl({ id: "u1" }));
  assert.equal(gameUrl("g1"), gameUrl({ id: "g1" }));
  assert.equal(playerTeamUrl("u1", "t1"), playerTeamUrl({ id: "u1" }, { id: "t1" }));
});

test("ids are percent-encoded so a slash in an id cannot invent a segment", () => {
  assert.equal(playerUrl("a/b"), "#/coaches/a%2Fb");
  assert.equal(teamUrl("a/b", "matches"), "#/t/a%2Fb/matches");
  assert.equal(gameUrl("a b"), "#/games/a%20b");
  assert.equal(
    adminTeamEditUrl("u/1", "t 1"),
    "#/administration/users/u%2F1/teams/t%201/edit",
  );
});

test("a missing id gives an empty segment rather than the string 'undefined'", () => {
  assert.equal(playerUrl(null), "#/coaches/");
  assert.equal(playerUrl({}), "#/coaches/");
  assert.equal(teamUrl(undefined), "#/t/");
  assert.equal(gameUrl(undefined), "#/games/");
});

test("the remaining link shapes are what the screens expect", () => {
  assert.equal(pageUrl({ slug: "teams/amazon" }), "#/teams/amazon");
  assert.equal(savedRosterUrl("t1"), "#/t/t1/roster");
  assert.equal(seasonTabUrl(""), "#/season", "the default tab is the bare hash, not a trailing slash");
  assert.equal(seasonTabUrl("standings"), "#/season/standings");
});

test("3.0 links are built from ids, encoded, and the 2.x builders point at them", () => {
  assert.equal(teamUrl("t1"), "#/t/t1");
  assert.equal(teamUrl({ id: "t 1" }, "roster"), "#/t/t%201/roster");
  assert.equal(teamPlayerUrl("t1", { id: "p/1" }), "#/t/t1/roster/p%2F1");
  assert.equal(savedRosterUrl("t1"), "#/t/t1/roster");
  assert.equal(playerUrl("u1"), "#/coaches/u1");
  assert.equal(playerTeamUrl("u1", "t1"), "#/coaches/u1/teams/t1");
  assert.deepEqual([teamsUrl(), newTeamUrl(), authUrl(), authUrl("register"), settingsUrl()],
    ["#/teams", "#/teams/new", "#/login", "#/register", "#/settings"]);
  assert.deepEqual([refUrl(), refUrl("pages"), refUrl("skills")], ["#/ref", "#/ref", "#/ref/skills"]);
  assert.throws(() => teamUrl("t1", "treasury"), /section/);
});

// ---------------------------------------------------------------------------
// Reading the hash
// ---------------------------------------------------------------------------

test("an empty hash means home", () => {
  assert.equal(routeFromHash(""), "home");
  assert.equal(routeFromHash("#"), "home");
  assert.equal(routeFromHash("#/"), "home");
});

test("the hash is decoded, so an encoded slug finds its page", () => {
  assert.equal(routeFromHash("#/teams/amazon"), "teams/amazon");
  assert.equal(routeFromHash("#/players/a%2Fb"), "players/a/b");
});

test("a malformed hash lands on a route instead of throwing", () => {
  // decodeURIComponent("%") throws a URIError. Before this, a hand-edited or
  // truncated URL took the whole app down to a blank screen on load.
  assert.equal(routeFromHash("#/%"), "%");
  assert.equal(routeFromHash("#/teams/%E0%A4%A"), "teams/%E0%A4%A");
});

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

test("the plain screens match by name", () => {
  assert.deepEqual(matchRoute("home"), { name: "home", params: {} });
  assert.deepEqual(matchRoute("season"), { name: "season", params: { tab: "" } });
  assert.deepEqual(matchRoute("administration"), { name: "administration", params: {} });
  assert.deepEqual(matchRoute("legal"), { name: "legal", params: {} });
});

test("a season tab in the hash is carried as a param", () => {
  assert.deepEqual(matchRoute("season/standings"), { name: "season", params: { tab: "standings" } });
  assert.deepEqual(matchRoute("season/administration"), { name: "season", params: { tab: "administration" } });
});

test("reference sections match under #/ref and carry their section", () => {
  assert.deepEqual(matchRoute("ref"), { name: "ref", params: {} });
  assert.deepEqual(matchRoute("ref/skills"), { name: "refSection", params: { section: "skills" } });
  assert.deepEqual(matchRoute("ref/star-players"), {
    name: "refSection",
    params: { section: "star-players" },
  });
});

test("id-carrying routes hand back the id", () => {
  assert.deepEqual(matchRoute("t/t1/roster"), { name: "teamRoster", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("t/t1/matches"), { name: "teamMatches", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("games/g1"), { name: "game", params: { gameId: "g1" } });
  assert.deepEqual(matchRoute("overview/tactics"), { name: "overview", params: { slug: "tactics" } });
  assert.deepEqual(matchRoute("coaches/u1"), { name: "coach", params: { userId: "u1" } });
});

test("the admin roster editor wins over the admin user profile", () => {
  // Both start with "administration/users/". Matching the profile first would
  // send an admin editing a roster to a profile page whose id ends in "/edit".
  assert.deepEqual(matchRoute("administration/users/u1/teams/t1/edit"), {
    name: "adminTeamEdit",
    params: { ownerId: "u1", teamId: "t1" },
  });
  assert.deepEqual(matchRoute("administration/users/u1"), {
    name: "adminUserProfile",
    params: { userId: "u1" },
  });
});

test("a coach's team page wins over the coach's profile", () => {
  assert.deepEqual(matchRoute("coaches/u1/teams/t1"), {
    name: "coachTeam",
    params: { userId: "u1", teamId: "t1" },
  });
});

test("an admin roster URL with an extra segment is not the editor", () => {
  // The pattern is anchored; without that, a trailing segment would still
  // match and the editor would open the wrong team.
  assert.notEqual(matchRoute("administration/users/u1/teams/t1/edit/extra").name, "adminTeamEdit");
});

// Stage 12, Task 14: a player of the team an admin edits is the roster's player screen in the admin's mode.
test("a player of a team the admin edits is its own route, with the owner, the team and the player", () => {
  assert.deepEqual(matchRoute("administration/users/u/teams/t/edit/p"), {
    name: "adminTeamPlayer",
    params: { ownerId: "u", teamId: "t", playerId: "p" },
  });
  assert.notEqual(matchRoute("administration/users/u/teams/t/edit/p/extra").name, "adminTeamPlayer");
  assert.equal(target("administration/users/u/teams/t/edit/p", guest), "#/login");
  assert.equal(target("administration/users/u/teams/t/edit/p", coach), null);
});

test("the 3.0 screens match by name and carry their ids", () => {
  assert.deepEqual(matchRoute("teams/new"), { name: "teamNew", params: {} });
  assert.deepEqual(matchRoute("t/t1"), { name: "team", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("t/t1/team"), { name: "teamManage", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("t/t1/roster/p1"), { name: "teamPlayer", params: { teamId: "t1", playerId: "p1" } });
  assert.deepEqual(matchRoute("t/t1/challenges"), { name: "teamChallenges", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("coaches/u1/teams/t1"), { name: "coachTeam", params: { userId: "u1", teamId: "t1" } });
  assert.deepEqual(matchRoute("ref/skills"), { name: "refSection", params: { section: "skills" } });
  for (const name of ["login", "register", "settings", "teams", "ref"]) assert.deepEqual(matchRoute(name), { name, params: {} });
  assert.deepEqual([...TEAM_ROUTES].sort(), ["team", "teamChallenges", "teamManage", "teamMatches", "teamPlayer", "teamRoster", "teamSettings"]);
});

// Stage 07d, owner's second review (decision 56): the settings are a screen of their own on a phone, a card on a desk.
test("the team's settings have an address of their own: #/t/:id/settings, a team screen a guest signs in for", () => {
  assert.equal(teamUrl("t1", "settings"), "#/t/t1/settings");
  assert.equal(teamUrl({ id: "t 1" }, "settings"), "#/t/t%201/settings");
  assert.deepEqual(matchRoute("t/t1/settings"), { name: "teamSettings", params: { teamId: "t1" } });
  assert.equal(matchRoute(routeFromHash("#/t/t1/settings")).name, "teamSettings");
  assert.equal(matchRoute("t/t1/settings/x").name, "page", "a segment too many is a content slug");
  assert.ok(TEAM_ROUTES.has("teamSettings"), "a team screen: the team is made the active one");
  assert.deepEqual(resolveRedirect("t/t1/settings", { ...guest, hash: "#/t/t1/settings" }), { target: "#/login", returnTo: "#/t/t1/settings" });
  assert.equal(target("t/t1/settings", coach), null, "a coach is drawn it");
});

test("what is not a 3.0 shape stays a content slug", () => {
  for (const route of ["teams/amazon", "skills/block", "t/t1/treasury", "t/t1/roster/p1/x", "ref/nonsense", "coaches/u1/teams", "t"]) {
    assert.equal(matchRoute(route).name, "page", route);
  }
});

test("anything left over is a content slug for the caller to resolve", () => {
  assert.deepEqual(matchRoute("teams/amazon"), { name: "page", params: { slug: "teams/amazon" } });
  assert.deepEqual(matchRoute("nonsense"), { name: "page", params: { slug: "nonsense" } });
});

// ---------------------------------------------------------------------------
// Which list a content page belongs to
// ---------------------------------------------------------------------------

test("a content page belongs to the section its kind names", () => {
  assert.equal(navRouteForPage({ kind: "team" }), "teams");
  assert.equal(navRouteForPage({ kind: "starPlayer" }), "star-players");
  assert.equal(navRouteForPage({ kind: "cheatsheet" }), "cheatsheets");
  assert.equal(navRouteForPage({ kind: "whatever" }), "pages", "an unknown kind is still listed");
});

// ---------------------------------------------------------------------------
// Where an address leads
// ---------------------------------------------------------------------------

test("old links lead to the new screens, for a guest and for a coach", () => {
  const cases = [
    ["my-teams", coach, "#/teams"], ["my-teams/t9", coach, "#/t/t9/roster"], ["builder", guest, "#/teams/new"],
    ["players/u2", coach, "#/coaches/u2"], ["players/u2/teams/t2", coach, "#/coaches/u2/teams/t2"],
    ["pages", guest, "#/ref"], ["ref/pages", guest, "#/ref"], ["star-players", guest, "#/ref/star-players"],
    ["skills", coach, "#/ref/skills"], ["teams", guest, "#/ref/teams"],
    ["my-games", coach, "#/t/t1/matches"], ["my-games", teamless, "#/teams"],
  ];
  for (const [route, context, expected] of cases) assert.equal(target(route, context), expected, route);
  assert.equal(target("teams", coach), null, "a coach's #/teams is My Teams");
});

test("a coach's home is the active team's overview; without a team it stays home", () => {
  assert.equal(target("home", coach), "#/t/t1");
  assert.equal(target("home", teamless), null);
  assert.equal(target("home", guest), null);
});

test("a guest is sent to sign in and brought back to where the link pointed", () => {
  const first = resolveRedirect("t/t1/roster", guest);
  assert.deepEqual(first, { target: "#/login", returnTo: "#/t/t1/roster" });
  assert.deepEqual(resolveRedirect("my-games", guest), { target: "#/login", returnTo: "#/my-games" });
  assert.deepEqual(resolveRedirect("login", { ...coach, returnTo: first.returnTo }), { target: "#/t/t1/roster", returnTo: "" });
  assert.deepEqual(resolveRedirect("register", coach), { target: "#/", returnTo: "" });
  // The address as it was typed: one rebuilt from the decoded route would be another address for an encoded id.
  assert.deepEqual(resolveRedirect(routeFromHash("#/t/t%201/roster"), { ...guest, hash: "#/t/t%201/roster" }), { target: "#/login", returnTo: "#/t/t%201/roster" });
});

// Task 3 carry (c): a guest who gave up on signing in is not taken back to that page by a sign-in much later.
test("a guest who leaves the sign-in screens for another page is not brought back later", () => {
  const remembered = { ...guest, returnTo: "#/t/t1/roster" };
  assert.deepEqual(resolveRedirect("login", remembered), { target: null, returnTo: "#/t/t1/roster" });
  assert.deepEqual(resolveRedirect("register", remembered), { target: null, returnTo: "#/t/t1/roster" });
  for (const route of ["home", "season", "ref", "ref/skills", "skills/block", "legal", "settings"]) {
    assert.deepEqual(resolveRedirect(route, remembered), { target: null, returnTo: "" }, route);
  }
  // An old address hands it on to the page it leads to, which drops it.
  const old = resolveRedirect("skills", remembered);
  assert.deepEqual(old, { target: "#/ref/skills", returnTo: "#/t/t1/roster" });
  assert.equal(resolveRedirect(routeFromHash(old.target), { ...guest, returnTo: old.returnTo }).returnTo, "");
  // Another coach page asks again, for itself.
  assert.deepEqual(resolveRedirect("coaches/u2", remembered), { target: "#/login", returnTo: "#/coaches/u2" });
});

// Task 3 carry (a): coming back to a sign-in screen would only send the coach on again.
test("a sign-in screen is never the address to come back to", () => {
  for (const returnTo of ["#/login", "#/register", "#login", "#/%6Cogin"]) {
    assert.deepEqual(resolveRedirect("login", { ...coach, returnTo }), { target: "#/", returnTo: "" }, returnTo);
    assert.deepEqual(resolveRedirect("register", { ...teamless, returnTo }), { target: "#/", returnTo: "" }, returnTo);
    assert.deepEqual(resolveRedirect("login", { ...guest, returnTo }), { target: null, returnTo: "" }, returnTo);
  }
});

test("a guest may open the public pages, and every coach page asks for a session", () => {
  for (const route of ["home", "login", "register", "settings", "season", "season/standings", "ref", "ref/skills", "skills/block", "overview/x", "legal"]) {
    assert.equal(target(route, guest), null, route);
  }
  for (const route of ["t/t1", "t/t1/team", "t/t1/settings", "t/t1/roster", "t/t1/roster/p1", "t/t1/matches", "t/t1/challenges", "coaches/u1",
    "coaches/u1/teams/t1", "games/g1", "games/g1/pre-match", "games/g1/post-match/2", "administration", "administration/users/u1",
    "administration/users/u1/teams/t1/edit", "administration/users/u1/teams/t1/edit/p1"]) {
    assert.equal(target(route, guest), "#/login", route);
  }
});

test("a guest is sent to sign in from the builder and brought back to it, from its old address too", () => {
  assert.deepEqual(resolveRedirect("teams/new", { signedIn: false, hash: "#/teams/new" }), { target: "#/login", returnTo: "#/teams/new" });
  const first = resolveRedirect("builder", { signedIn: false });
  assert.equal(first.target, "#/teams/new");
  assert.deepEqual(resolveRedirect(routeFromHash(first.target), { signedIn: false, returnTo: first.returnTo, hash: first.target }), { target: "#/login", returnTo: "#/teams/new" });
});

test("no redirect loops: every route settles within two hops", () => {
  const routes = ["home", "login", "register", "settings", "teams", "teams/new", "my-teams", "my-teams/t9", "builder", "my-games",
    "players/u2", "players/u2/teams/t2", "pages", "ref/pages", "skills", "teams/amazon", "t/t1", "t/t1/roster", "games/g1", "administration"];
  const isSignIn = (hash) => ["login", "register"].includes(matchRoute(routeFromHash(hash)).name);
  const contexts = [guest, coach, teamless, { ...coach, returnTo: "#/my-games" }, { ...coach, returnTo: "#/login" },
    { ...teamless, returnTo: "#/register" }, { ...guest, returnTo: "#/login" }, { ...guest, returnTo: "#/t/t1/roster" }];
  for (const context of contexts) {
    for (const start of routes) {
      let route = start;
      let current = context;
      for (let hop = 0; ; hop += 1) {
        const { target: next, returnTo } = resolveRedirect(route, current);
        const where = `${start} (hop ${hop}) for ${JSON.stringify(context)}`;
        assert.ok(!returnTo || !isSignIn(returnTo), `${where} remembers a sign-in screen: ${returnTo}`);
        if (current.signedIn) assert.ok(!next || !isSignIn(next), `${where} sends a coach to sign in: ${next}`);
        if (!next) break;
        assert.ok(hop < 2, `${start} does not settle for ${JSON.stringify(context)}`);
        current = { ...current, returnTo };
        route = routeFromHash(next);
      }
    }
  }
});

const readData = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const DATA_FILES = ["public/data.en.json", "public/data.ru.json"];

test("every reference page still opens at its own address", () => {
  for (const file of DATA_FILES) {
    const { pages } = readData(file);
    // An empty list would pass every assertion below without checking one page (a build that was not run).
    assert.ok(pages.length > 0, `${file} has no pages: run npm run build first`);
    for (const page of pages) {
      // Through the address the link is built with, as a click on it would arrive.
      const route = routeFromHash(pageUrl(page));
      assert.equal(matchRoute(route).name, "page", `${file}: ${page.slug}`);
      for (const context of [guest, coach, teamless]) assert.equal(target(route, context), null, `${file}: ${page.slug}`);
    }
  }
});

/** Every string anywhere in a parsed JSON value. */
function* stringsIn(value) {
  if (typeof value === "string") yield value;
  else if (value && typeof value === "object") for (const inner of Object.values(value)) yield* stringsIn(inner);
}

test("no page links to an address that is redirected: #/teams is My Teams now, the list is #/ref/teams", () => {
  for (const file of DATA_FILES) {
    const hashes = new Set();
    for (const text of stringsIn(readData(file))) {
      for (const [, hash] of text.matchAll(/href="(#[^"]*)"/g)) hashes.add(hash.replaceAll("&amp;", "&"));
    }
    assert.ok(hashes.size > 0, `${file} links to no page at all: run npm run build first`);
    for (const hash of hashes) {
      for (const context of [guest, coach, teamless]) {
        assert.equal(target(routeFromHash(hash), context), null, `${file}: ${hash} is redirected for ${JSON.stringify(context)}`);
      }
    }
  }
});

// The build writes these links itself (no vault page uses them today), and it cannot be imported: it runs the build.
test("the wiki links the build maps to a screen of the app lead to addresses that are not redirected", () => {
  const source = readFileSync(new URL("../scripts/build-data.mjs", import.meta.url), "utf8");
  const mapped = source.match(/const virtualLinks = new Map\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(mapped, "build-data.mjs no longer has a virtualLinks map: update this test");
  const hashes = [...mapped.matchAll(/"(#\/[^"]*)"/g)].map((match) => match[1]);
  assert.ok(hashes.length > 0);
  for (const hash of hashes) {
    assert.notEqual(matchRoute(routeFromHash(hash)).name, "page", `${hash} is not a screen of the app`);
    for (const context of [guest, coach, teamless]) assert.equal(target(routeFromHash(hash), context), null, `${hash} is redirected`);
  }
});

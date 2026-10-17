import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  adminTeamEditUrl,
  authUrl,
  gameUrl,
  listUrlForRoute,
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
  assert.equal(listUrlForRoute("home"), "#/", "home is the bare hash, not #/home");
  assert.equal(listUrlForRoute("skills"), "#/ref/skills");
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
  assert.deepEqual([listUrlForRoute("home"), listUrlForRoute("skills"), listUrlForRoute("pages")], ["#/", "#/ref/skills", "#/ref"]);
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

test("the 3.0 screens match by name and carry their ids", () => {
  assert.deepEqual(matchRoute("teams/new"), { name: "teamNew", params: {} });
  assert.deepEqual(matchRoute("t/t1"), { name: "team", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("t/t1/team"), { name: "teamManage", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("t/t1/roster/p1"), { name: "teamPlayer", params: { teamId: "t1", playerId: "p1" } });
  assert.deepEqual(matchRoute("t/t1/challenges"), { name: "teamChallenges", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("coaches/u1/teams/t1"), { name: "coachTeam", params: { userId: "u1", teamId: "t1" } });
  assert.deepEqual(matchRoute("ref/skills"), { name: "refSection", params: { section: "skills" } });
  for (const name of ["login", "register", "settings", "teams", "ref"]) assert.deepEqual(matchRoute(name), { name, params: {} });
  assert.deepEqual([...TEAM_ROUTES].sort(), ["team", "teamChallenges", "teamManage", "teamMatches", "teamPlayer", "teamRoster"]);
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
  assert.deepEqual(resolveRedirect("season", { ...guest, returnTo: "#/x" }), { target: null, returnTo: "#/x" });
});

test("a guest may open the public pages, and every coach page asks for a session", () => {
  for (const route of ["home", "login", "register", "settings", "teams/new", "season", "season/standings", "ref", "ref/skills", "skills/block", "overview/x", "legal"]) {
    assert.equal(target(route, guest), null, route);
  }
  for (const route of ["t/t1", "t/t1/team", "t/t1/roster", "t/t1/roster/p1", "t/t1/matches", "t/t1/challenges", "coaches/u1",
    "coaches/u1/teams/t1", "games/g1", "games/g1/pre-match", "games/g1/post-match/2", "administration", "administration/users/u1",
    "administration/users/u1/teams/t1/edit"]) {
    assert.equal(target(route, guest), "#/login", route);
  }
});

test("no redirect loops: every route settles within two hops", () => {
  const routes = ["home", "login", "register", "settings", "teams", "teams/new", "my-teams", "my-teams/t9", "builder", "my-games",
    "players/u2", "players/u2/teams/t2", "pages", "ref/pages", "skills", "teams/amazon", "t/t1", "t/t1/roster", "games/g1", "administration"];
  for (const context of [guest, coach, teamless, { ...coach, returnTo: "#/my-games" }]) {
    for (const start of routes) {
      let route = start;
      let current = context;
      for (let hop = 0; ; hop += 1) {
        const { target: next, returnTo } = resolveRedirect(route, current);
        if (!next) break;
        assert.ok(hop < 2, `${start} does not settle for ${JSON.stringify(context)}`);
        current = { ...current, returnTo };
        route = routeFromHash(next);
      }
    }
  }
});

test("every reference page still opens at its own address", () => {
  for (const file of ["public/data.en.json", "public/data.ru.json"]) {
    const { pages } = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
    for (const { slug } of pages) {
      assert.equal(matchRoute(slug).name, "page", `${file}: ${slug}`);
      assert.equal(target(slug, guest), null, `${file}: ${slug}`);
      assert.equal(target(slug, coach), null, `${file}: ${slug}`);
    }
  }
});

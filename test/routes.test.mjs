import test from "node:test";
import assert from "node:assert/strict";

import {
  adminTeamEditUrl,
  gameUrl,
  listUrlForRoute,
  matchRoute,
  navRouteForPage,
  pageUrl,
  playerTeamUrl,
  playerUrl,
  routeFromHash,
  routeSection,
  savedRosterUrl,
} from "../src/core/routes.mjs";

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
  assert.equal(playerUrl("a/b"), "#/players/a%2Fb");
  assert.equal(gameUrl("a b"), "#/games/a%20b");
  assert.equal(
    adminTeamEditUrl("u/1", "t 1"),
    "#/administration/users/u%2F1/teams/t%201/edit",
  );
});

test("a missing id gives an empty segment rather than the string 'undefined'", () => {
  assert.equal(playerUrl(null), "#/players/");
  assert.equal(playerUrl({}), "#/players/");
  assert.equal(gameUrl(undefined), "#/games/");
});

test("the remaining link shapes are what the screens expect", () => {
  assert.equal(pageUrl({ slug: "teams/amazon" }), "#/teams/amazon");
  assert.equal(savedRosterUrl("t1"), "#/my-teams/t1");
  assert.equal(listUrlForRoute("home"), "#/", "home is the bare hash, not #/home");
  assert.equal(listUrlForRoute("skills"), "#/skills");
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
  assert.deepEqual(matchRoute("builder"), { name: "builder", params: {} });
  assert.deepEqual(matchRoute("my-teams"), { name: "myTeams", params: {} });
  assert.deepEqual(matchRoute("my-games"), { name: "myGames", params: {} });
  assert.deepEqual(matchRoute("season"), { name: "season", params: {} });
  assert.deepEqual(matchRoute("administration"), { name: "administration", params: {} });
  assert.deepEqual(matchRoute("legal"), { name: "legal", params: {} });
});

test("catalogue sections match and carry their own route", () => {
  assert.deepEqual(matchRoute("skills"), { name: "section", params: { route: "skills" } });
  assert.deepEqual(matchRoute("star-players"), {
    name: "section",
    params: { route: "star-players" },
  });
});

test("id-carrying routes hand back the id", () => {
  assert.deepEqual(matchRoute("my-teams/t1"), { name: "savedRoster", params: { teamId: "t1" } });
  assert.deepEqual(matchRoute("games/g1"), { name: "game", params: { gameId: "g1" } });
  assert.deepEqual(matchRoute("overview/tactics"), { name: "overview", params: { slug: "tactics" } });
  assert.deepEqual(matchRoute("players/u1"), { name: "playerProfile", params: { userId: "u1" } });
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

test("a public team page wins over a player profile", () => {
  assert.deepEqual(matchRoute("players/u1/teams/t1"), {
    name: "publicTeam",
    params: { userId: "u1", teamId: "t1" },
  });
});

test("an admin roster URL with an extra segment is not the editor", () => {
  // The pattern is anchored; without that, a trailing segment would still
  // match and the editor would open the wrong team.
  assert.notEqual(matchRoute("administration/users/u1/teams/t1/edit/extra").name, "adminTeamEdit");
});

test("anything left over is a content slug for the caller to resolve", () => {
  assert.deepEqual(matchRoute("teams/amazon"), { name: "page", params: { slug: "teams/amazon" } });
  assert.deepEqual(matchRoute("nonsense"), { name: "page", params: { slug: "nonsense" } });
});

// ---------------------------------------------------------------------------
// Which nav item lights up
// ---------------------------------------------------------------------------

test("a content page belongs to the section its kind names", () => {
  assert.equal(navRouteForPage({ kind: "team" }), "teams");
  assert.equal(navRouteForPage({ kind: "starPlayer" }), "star-players");
  assert.equal(navRouteForPage({ kind: "cheatsheet" }), "cheatsheets");
  assert.equal(navRouteForPage({ kind: "whatever" }), "pages", "an unknown kind is still listed");
});

test("nested routes light up the section that owns them", () => {
  assert.equal(routeSection("games/g1"), "my-games");
  assert.equal(routeSection("administration/users/u1"), "administration");
  assert.equal(routeSection("players/u1/teams/t1"), "players");
  assert.equal(routeSection("overview/tactics"), "home");
});

test("a route with no section falls back to home", () => {
  assert.equal(routeSection(""), "home");
  assert.equal(routeSection("home"), "home");
  assert.equal(routeSection(undefined), "home");
  assert.equal(routeSection("nonsense"), "home", "with no page found, nothing is highlighted");
});

test("a content slug lights up its section once the vault can resolve it", () => {
  const findPage = (slug) => (slug === "teams/amazon" ? { kind: "team" } : null);
  assert.equal(routeSection("teams/amazon", findPage), "teams");
  assert.equal(routeSection("teams/amazon"), "home", "and home before the vault is loaded");
});

test("section and static routes light themselves up", () => {
  assert.equal(routeSection("skills"), "skills");
  assert.equal(routeSection("builder"), "builder");
  assert.equal(routeSection("season"), "season");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertDictionaryCovers } from "./helpers/ui.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { ROUTE_NAMES, matchRoute, resolveRedirect, routeFromHash } from "../src/core/routes.mjs";
import { OWNED_ROUTES, shellModel } from "../src/shell/navigation.mjs";
import { ICON_NAMES } from "../src/ui/icons.mjs";

const COACH = { id: "u1", login: "coach", isAdmin: false };
const TEAM = { id: "t1", name: "Ashgrove Wardens" };
const at = (name, extra = {}) => ({ route: { name, params: {} }, user: COACH, team: TEAM, raceTitle: "Human", place: 2, ...extra });
const keys = (items) => items.map((item) => item.key);
const current = (items) => items.filter((item) => item.current).map((item) => item.key);

test("a coach with a team gets seven tabs and five side items, each to its place", () => {
  const model = shellModel(at("teamRoster"));
  assert.equal(model.mode, "coach");
  assert.deepEqual(keys(model.tabs), ["overview", "team", "roster", "matches", "table", "ref", "settings"]);
  assert.deepEqual(model.tabs.map((tab) => tab.href), ["#/t/t1", "#/t/t1/team", "#/t/t1/roster", "#/t/t1/matches", "#/season", "#/ref", "#/settings"]);
  assert.deepEqual(keys(model.side), ["overview", "roster", "season", "ref", "settings"]);
  assert.deepEqual(model.brand, { name: "Ashgrove Wardens", sub: "Human · #2 in the league", sideSub: "Human", href: "#/teams", switchTeam: true });
});

test("a coach with a team: the side item «Season» leads to the team's season; the phone's tab «Table» to the league's", () => {
  const href = (items, key) => items.find((item) => item.key === key).href;
  const model = shellModel(at("team"));
  assert.equal(href(model.side, "season"), "#/t/t1/matches");
  assert.equal(href(model.tabs, "table"), "#/season");
  for (const other of [shellModel(at("home", { user: null, team: null })), shellModel(at("season", { team: null })), shellModel(at("season", { team: null, user: { ...COACH, isAdmin: true } }))]) {
    assert.equal(href(other.side, "season"), "#/season");
    assert.equal(href(other.tabs, "table"), "#/season");
  }
});

test("an admin has administration on the desktop; the mobile reaches it from Settings", () => {
  const model = shellModel(at("administration", { user: { ...COACH, isAdmin: true } }));
  assert.equal(model.side.at(-1).href, "#/administration");
  assert.deepEqual(current(model.side), ["administration"]);
  assert.deepEqual(current(model.tabs), ["settings"]);
  assert.equal(keys(model.tabs).includes("administration"), false);
});

test("each route lights the tab and the side item that own it", () => {
  const table = {
    home: ["overview", "overview"], team: ["overview", "overview"], teamManage: ["team", "roster"], teamPlayer: ["roster", "roster"],
    teamChallenges: ["matches", "season"], coachTeam: ["table", "season"], season: ["table", "season"],
    refSection: ["ref", "ref"], page: ["ref", "ref"], legal: ["ref", "ref"], settings: ["settings", "settings"],
  };
  for (const [name, [tab, side]] of Object.entries(table)) {
    const model = shellModel(at(name));
    assert.deepEqual([current(model.tabs), current(model.side)], [[tab], [side]], name);
  }
  assert.deepEqual(current(shellModel(at("teams")).tabs), []);
});

// Stage 07d, owner's answer 1: a player's address on a phone is a screen of its own, under the player's head with «‹ Roster»;
// owner's second review (decision 56): so are the team's settings, under Builder.html's head with «‹».
test("the player's address and the team's settings are drilled into: no header of the shell; every other route keeps it", () => {
  const DRILLED = ["teamPlayer", "teamSettings", "adminTeamPlayer"];
  for (const name of DRILLED) {
    assert.equal(shellModel(at(name)).drill, true, name);
    assert.equal(shellModel(at(name, { user: null, team: null })).drill, true, `${name}: whoever is drawn there`);
  }
  for (const name of OWNED_ROUTES) {
    if (!DRILLED.includes(name)) assert.equal(shellModel(at(name)).drill, false, name);
  }
  for (const name of ["login", "register", "teamNew"]) assert.equal(shellModel(at(name)).drill, false, `${name}: bare`);
  // The tabs and the SideNav still say where it is: the SideNav of a desk is drawn as it was.
  assert.deepEqual([current(shellModel(at("teamPlayer")).tabs), current(shellModel(at("teamPlayer")).side)], [["roster"], ["roster"]]);
});

test("the settings light the tab «Team» and the SideNav's «Roster», as the team page", () => {
  for (const name of ["teamManage", "teamSettings"]) {
    const model = shellModel(at(name));
    assert.deepEqual([current(model.tabs), current(model.side)], [["team"], ["roster"]], name);
  }
  assert.ok(OWNED_ROUTES.has("teamSettings"));
});

test("a coach without a team keeps the league's tabs and a header that leads to creating one", () => {
  const model = shellModel(at("home", { team: null, raceTitle: "", place: null }));
  assert.deepEqual(keys(model.tabs), ["overview", "table", "ref", "settings"]);
  assert.equal(model.tabs[0].href, "#/");
  assert.equal(model.brand.href, "#/teams");
});

// R14 (N1): a coach whose list could not be read may have five teams; the header does not offer a first one.
test("a coach whose list of teams was not read gets the league's name, not an offer to create a team", () => {
  const model = shellModel(at("team", { team: null, raceTitle: "", place: null, teamsRead: false }));
  assert.equal(model.mode, "coach");
  assert.equal(model.brand.name, "Gata League");
  assert.equal(model.brand.sub, "Blood Bowl Sevens");
  assert.equal(model.brand.switchTeam, false);
  assert.equal(model.brand.href, "#/");
  assert.deepEqual(keys(model.tabs), ["overview", "table", "ref", "settings"]);
  assert.equal(shellModel(at("team", { team: null, teamsRead: true })).brand.name, "No team yet", "a list read and empty is no team");
  assert.equal(shellModel(at("team", { teamsRead: false })).brand.name, "Ashgrove Wardens", "a team in hand is named whatever the list says");
});

test("a guest gets home, table, reference and settings, and no team", () => {
  const model = shellModel(at("season", { user: null, team: null }));
  assert.equal(model.mode, "guest");
  assert.deepEqual(keys(model.tabs), ["home", "table", "ref", "settings"]);
  assert.deepEqual(keys(model.side), ["home", "season", "ref", "settings"]);
  assert.equal(model.brand.switchTeam, false);
});

test("sign-in and registration are drawn without the shell", () => {
  for (const name of ["login", "register"]) {
    const model = shellModel(at(name, { user: null, team: null }));
    assert.deepEqual([model.mode, model.tabs.length, model.side.length], ["bare", 0, 0]);
  }
});

test("the builder brings its own frame: no header, no tabs, no SideNav (Builder, DeskBuilder)", () => {
  const model = shellModel({ route: { name: "teamNew", params: {} }, user: { id: "u1" }, team: TEAM });
  assert.deepEqual([model.mode, model.tabs, model.side], ["bare", [], []]);
});

test("outside the season table the subtitle is the race alone", () => {
  assert.equal(shellModel(at("team", { place: null })).brand.sub, "Human");
});

test("the shell draws no search bar: the reference brings its own", () => {
  for (const name of ["ref", "refSection"]) assert.equal("showSearch" in shellModel(at(name)), false, name);
  assertDictionaryCovers("src/shell/navigation.mjs");
});

// What the brief's table cannot see: that the model agrees with the router it draws links for.

const ADMIN = { ...COACH, isAdmin: true };
/** The route a link leads to, as the router reads it. */
const routeOf = (href) => matchRoute(routeFromHash(href));
/** The three shapes a visitor can have, each with the active team the router would know. */
const VISITORS = {
  guest: { user: null, team: null, activeTeamId: null },
  "coach with a team": { user: ADMIN, team: TEAM, activeTeamId: TEAM.id },
  "coach without a team": { user: ADMIN, team: null, activeTeamId: null },
};

test("no link of the shell is sent on by the router: a guest is never offered My Teams", () => {
  for (const [who, { user, team, activeTeamId }] of Object.entries(VISITORS)) {
    const model = shellModel(at("settings", { user, team }));
    for (const href of [model.brand.href, ...model.tabs.map((tab) => tab.href), ...model.side.map((item) => item.href)]) {
      const route = routeFromHash(href);
      assert.equal(resolveRedirect(route, { signedIn: Boolean(user), activeTeamId, hash: href }).target, null, `${who}: ${href}`);
    }
  }
  const guest = shellModel(at("home", { user: null, team: null }));
  assert.deepEqual(guest.tabs.map((tab) => tab.href), ["#/", "#/season", "#/ref", "#/settings"]);
  assert.deepEqual(guest.side.map((item) => item.href), ["#/", "#/season", "#/ref", "#/settings"]);
  assert.equal(guest.brand.href, "#/");
});

test("the preparation brings its own frame: no header, no tabs, no SideNav", () => {
  for (const user of [COACH, ADMIN]) {
    const model = shellModel(at("preMatch", { user }));
    assert.equal(model.mode, "bare", user.login);
    assert.deepEqual([model.tabs, model.side, model.drill], [[], [], false], user.login);
  }
  // The game's page keeps the shell until its own stage.
  assert.equal(shellModel(at("game")).mode, "coach");
});

test("the post-match brings its own frame: no header, no tabs, no SideNav", () => {
  for (const user of [COACH, ADMIN]) {
    const model = shellModel(at("postMatch", { user }));
    assert.equal(model.mode, "bare", user.login);
    assert.deepEqual([model.tabs, model.side, model.drill], [[], [], false], user.login);
  }
});

test("every link of the shell lights itself when it is the page", () => {
  for (const [who, { user, team }] of Object.entries(VISITORS)) {
    const model = shellModel(at("settings", { user, team }));
    for (const kind of ["tabs", "side"]) {
      for (const item of model[kind]) {
        const there = shellModel({ route: routeOf(item.href), user, team, raceTitle: "Human", place: 2 });
        assert.deepEqual(current(there[kind]), [item.key], `${who}: ${kind} ${item.key} at ${item.href}`);
      }
    }
  }
});

test("every address the router knows lights one tab and one side item, or none for the way to a team", () => {
  const OWN = ["", "t/t1", "t/t1/team", "t/t1/settings", "t/t1/roster", "t/t1/roster/p1", "t/t1/matches", "t/t1/challenges", "coaches/u2", "coaches/u2/teams/t9",
    "games/g1", "season", "season/rounds", "ref", "ref/skills", "no-such-slug", "overview/rules",
    "legal", "settings", "administration", "administration/users/u2", "administration/users/u2/teams/t9/edit"];
  for (const route of OWN) {
    const model = shellModel({ ...at("home"), user: ADMIN, route: matchRoute(route || "home") });
    assert.deepEqual([current(model.tabs).length, current(model.side).length], [1, 1], route || "home");
  }
  // The pages with a frame of their own light nothing: they draw no tabs and no side items (stage 09a, decision 17).
  for (const route of ["games/g1/pre-match", "games/g1/pre-match/weather", "games/g1/post-match", "games/g1/post-match/players", "teams/new", "login"]) {
    const model = shellModel({ ...at("home"), user: ADMIN, route: matchRoute(route) });
    assert.deepEqual([model.tabs.length, model.side.length], [0, 0], route);
  }
  const teams = shellModel({ ...at("home"), route: matchRoute("teams") });
  assert.deepEqual([current(teams.tabs), current(teams.side)], [[], []], "teams");
});

test("a coach without a team still reaches administration, and a name that is no route lights nothing", () => {
  const model = shellModel(at("settings", { user: ADMIN, team: null }));
  assert.deepEqual(keys(model.side), ["overview", "season", "ref", "settings", "administration"]);
  assert.deepEqual(keys(model.tabs), ["overview", "table", "ref", "settings"]);
  assert.equal(model.brand.name, "No team yet");
  assert.equal(model.brand.sub, "Create a team");
  for (const name of ["constructor", "toString", "nowhere"]) {
    const unknown = shellModel(at(name));
    assert.deepEqual([current(unknown.tabs), current(unknown.side)], [[], []], name);
  }
});

test("a guest's home is the front page, and the league is the guest's header", () => {
  const model = shellModel(at("home", { user: null, team: null }));
  assert.deepEqual([current(model.tabs), current(model.side)], [["home"], ["home"]]);
  assert.deepEqual(model.brand, { name: "Gata League", sub: "Blood Bowl Sevens", sideSub: "Blood Bowl Sevens", href: "#/", switchTeam: false });
  assert.deepEqual(model.side.map((item) => item.icon).filter((icon, index, all) => all.indexOf(icon) !== index), [], "one glyph per side item");
  assert.ok(model.tabs.every((tab) => tab.label && tab.icon));
});

test("the subtitle is the race, then the place, and a place that is not one is left out", () => {
  assert.equal(shellModel(at("team", { place: 1 })).brand.sub, "Human · #1 in the league");
  assert.equal(shellModel(at("team", { place: 0 })).brand.sub, "Human");
  assert.equal(shellModel(at("team", { raceTitle: "", place: 3 })).brand.sub, "#3 in the league");
  assert.equal(shellModel(at("team", { raceTitle: "", place: null })).brand.sub, "");
});

test("labels and the place read in the language of the page", () => {
  initLocale("ru");
  try {
    const model = shellModel(at("teamRoster", { user: ADMIN }));
    assert.deepEqual(model.tabs.map((tab) => tab.label), ["Обзор", "Команда", "Состав", "Матчи", "Таблица", "Справочник", "Настройки"]);
    // The administration item carries a soft hyphen: in the 200px column the word would not fit, and breaks there.
    assert.deepEqual(model.side.map((item) => item.label), ["Обзор", "Состав", "Сезон", "Справочник", "Настройки", "Администри\u00ADрование"]);
    assert.equal(model.brand.sub, "Human · 2-е место в лиге");
    assert.equal(model.brand.sideSub, "Human");
    assert.deepEqual(shellModel(at("home", { user: null, team: null })).tabs.map((tab) => tab.label), ["Главная", "Таблица", "Справочник", "Настройки"]);
  } finally {
    initLocale("en");
  }
});

test("the SideNav names the race alone: «Human · Gata League» broke onto two lines for almost every race (M1, 1)", () => {
  const model = (raceTitle) => shellModel({ route: { name: "teamRoster", params: {} }, user: { id: "u1" }, team: { id: "t1", name: "W" }, raceTitle, place: 2 });
  assert.equal(model("Underworld Denizens").brand.sideSub, "Underworld Denizens");
  assert.equal(model("").brand.sideSub, "Gata League", "a race the data does not know names the league");
  assert.equal(model("Human").brand.sub, "Human · #2 in the league", "the phone's header keeps the place");
  assert.equal(shellModel(at("team", { place: null })).brand.sideSub, "Human", "the place is the table's to say on a desk");
  const noTeam = shellModel(at("home", { team: null, raceTitle: "", place: null })).brand;
  assert.deepEqual([noTeam.sideSub, noTeam.sub], ["Create a team", "Create a team"]);
});

test("every glyph the model hands out, in every mode, is one icon() can draw", () => {
  const visitors = [{ user: null, team: null }, { user: COACH, team: TEAM }, { user: ADMIN, team: TEAM }, { user: ADMIN, team: null }];
  const seen = new Set();
  for (const name of ["home", "teamRoster", "season", "ref", "settings", "administration", "teams", "login", "register"]) {
    for (const visitor of visitors) {
      const model = shellModel(at(name, visitor));
      for (const item of [...model.tabs, ...model.side]) {
        assert.ok(ICON_NAMES.includes(item.icon), `${name}: ${item.key} asks for the glyph "${item.icon}", which icons.mjs does not have`);
        seen.add(item.icon);
      }
    }
  }
  // The administration item has a glyph of its own, not a borrowed padlock.
  assert.deepEqual([...seen].sort(), ["book", "calendar", "overview", "roster", "settings", "shield"]);
});

test("a route the router gains is a route the model must be told about", () => {
  // The four the model leaves out on purpose: the way to a team and the two screens that bring their own frame.
  const leftOut = ["teams", "teamNew", "login", "register"];
  assert.deepEqual([...ROUTE_NAMES].sort(), [...OWNED_ROUTES, ...leftOut].sort());
  assert.deepEqual(OWNED_ROUTES.size + leftOut.length, ROUTE_NAMES.size, "no route is both owned and left out");
  // And the names are the router's own: every shape of address lands on one of them, and every one is landed on.
  const addresses = ["home", "login", "register", "settings", "teams", "teams/new", "ref", "ref/skills", "administration", "legal", "t/t1", "t/t1/team", "t/t1/settings", "t/t1/roster",
    "t/t1/roster/p1", "t/t1/matches", "t/t1/challenges", "coaches/u2", "coaches/u2/teams/t9", "games/g1", "games/g1/pre-match", "games/g1/post-match", "season", "season/rounds",
    "overview/rules", "administration/users/u2", "administration/users/u2/teams/t9/edit", "administration/season",
    "administration/users/u2/teams/t9/edit/p1", "no-such-slug"];
  assert.deepEqual([...new Set(addresses.map((address) => matchRoute(address).name))].sort(), [...ROUTE_NAMES].sort());
});

test("every name matchRoute gives from its own body is a name the router lists", () => {
  // ROUTE_NAMES is built from the route tables; a name written into matchRoute's body has to be added by hand, and this is what tells.
  const source = readFileSync(new URL("../src/core/routes.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const written = [...source.matchAll(/\bname:\s*"([^"]+)"/g)].map(([, name]) => name);
  assert.ok(written.length >= 2, "the names written into matchRoute were found");
  for (const name of written) assert.ok(ROUTE_NAMES.has(name), `matchRoute gives "${name}", which ROUTE_NAMES does not list`);
});

test("the administration item has its own words in the SideNav, and its English is plain", () => {
  const model = shellModel(at("administration", { user: ADMIN }));
  assert.equal(model.side.at(-1).label, "Administration");
});

test("a team whose id has a space or a slash in it is linked by its encoded id", () => {
  const model = shellModel(at("teamRoster", { team: { id: "a b", name: "Spaced" } }));
  assert.equal(model.tabs.find((tab) => tab.key === "roster").href, "#/t/a%20b/roster");
  assert.equal(model.side.find((item) => item.key === "roster").href, "#/t/a%20b/roster");
  assert.equal(shellModel(at("teamRoster", { team: { id: "a/b", name: "Slashed" } })).tabs[0].href, "#/t/a%2Fb");
});

test("the model reads its input and changes none of it", () => {
  const input = at("teamRoster", { user: ADMIN });
  const before = JSON.stringify(input);
  shellModel(input);
  assert.equal(JSON.stringify(input), before);
});

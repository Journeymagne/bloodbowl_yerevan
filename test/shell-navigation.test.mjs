import assert from "node:assert/strict";
import test from "node:test";

import { assertDictionaryCovers } from "./helpers/ui.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { matchRoute, resolveRedirect, routeFromHash } from "../src/core/routes.mjs";
import { shellModel } from "../src/shell/navigation.mjs";

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
  assert.deepEqual(model.brand, { name: "Ashgrove Wardens", sub: "Human · #2 in the league", href: "#/teams", switchTeam: true });
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
    teamChallenges: ["matches", "season"], preMatch: ["matches", "season"], coachTeam: ["table", "season"], season: ["table", "season"],
    refSection: ["ref", "ref"], page: ["ref", "ref"], legal: ["ref", "ref"], settings: ["settings", "settings"],
  };
  for (const [name, [tab, side]] of Object.entries(table)) {
    const model = shellModel(at(name));
    assert.deepEqual([current(model.tabs), current(model.side)], [[tab], [side]], name);
  }
  assert.deepEqual(current(shellModel(at("teams")).tabs), []);
});

test("a coach without a team keeps the league's tabs and a header that leads to creating one", () => {
  const model = shellModel(at("home", { team: null, raceTitle: "", place: null }));
  assert.deepEqual(keys(model.tabs), ["overview", "table", "ref", "settings"]);
  assert.equal(model.tabs[0].href, "#/");
  assert.equal(model.brand.href, "#/teams");
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

test("outside the season table the subtitle is the race alone", () => {
  assert.equal(shellModel(at("team", { place: null })).brand.sub, "Human");
});

test("the search bar belongs to the reference lists only", () => {
  assert.deepEqual(["ref", "refSection", "page", "settings"].map((name) => shellModel(at(name)).showSearch), [true, true, false, false]);
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
  const OWN = ["", "t/t1", "t/t1/team", "t/t1/roster", "t/t1/roster/p1", "t/t1/matches", "t/t1/challenges", "coaches/u2", "coaches/u2/teams/t9",
    "games/g1", "games/g1/pre-match", "games/g1/post-match", "season", "season/rounds", "ref", "ref/skills", "no-such-slug", "overview/rules",
    "legal", "settings", "administration", "administration/users/u2", "administration/users/u2/teams/t9/edit"];
  for (const route of OWN) {
    const model = shellModel({ ...at("home"), user: ADMIN, route: matchRoute(route || "home") });
    assert.deepEqual([current(model.tabs).length, current(model.side).length], [1, 1], route || "home");
  }
  for (const route of ["teams", "teams/new"]) {
    const model = shellModel({ ...at("home"), route: matchRoute(route) });
    assert.deepEqual([current(model.tabs), current(model.side)], [[], []], route);
  }
});

test("a coach without a team still reaches administration, and a name that is no route lights nothing", () => {
  const model = shellModel(at("settings", { user: ADMIN, team: null }));
  assert.deepEqual(keys(model.side), ["overview", "season", "ref", "settings", "administration"]);
  assert.deepEqual(keys(model.tabs), ["overview", "table", "ref", "settings"]);
  assert.equal(model.brand.name, "No team yet");
  assert.equal(model.brand.sub, "Create a team to start");
  for (const name of ["constructor", "toString", "nowhere"]) {
    const unknown = shellModel(at(name));
    assert.deepEqual([current(unknown.tabs), current(unknown.side)], [[], []], name);
  }
});

test("a guest's home is the front page, and the league is the guest's header", () => {
  const model = shellModel(at("home", { user: null, team: null }));
  assert.deepEqual([current(model.tabs), current(model.side)], [["home"], ["home"]]);
  assert.deepEqual(model.brand, { name: "Gata League", sub: "Blood Bowl Sevens", href: "#/", switchTeam: false });
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
    assert.deepEqual(model.side.map((item) => item.label), ["Обзор", "Состав", "Сезон", "Справочник", "Настройки", "Администрирование"]);
    assert.equal(model.brand.sub, "Human · 2-е место в лиге");
    assert.deepEqual(shellModel(at("home", { user: null, team: null })).tabs.map((tab) => tab.label), ["Главная", "Таблица", "Справочник", "Настройки"]);
  } finally {
    initLocale("en");
  }
});

test("the model reads its input and changes none of it", () => {
  const input = at("teamRoster", { user: ADMIN });
  const before = JSON.stringify(input);
  shellModel(input);
  assert.equal(JSON.stringify(input), before);
});

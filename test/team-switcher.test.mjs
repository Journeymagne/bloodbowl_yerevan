import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { TEAM_ROUTES } from "../src/core/routes.mjs";
import { renderTeamSwitcher, switchTarget, switcherRows, wireTeamSwitcher } from "../src/shell/team-switcher.mjs";

const SEASON = { season: { id: "s1" }, standings: [{ team: { id: "t1" }, rank: 2, points: 13 }, { team: { id: "x" }, rank: 1, points: 15 }] };
const win = { id: "g1", kind: "league", season: { id: "s1" }, roundNumber: 1, resultStatus: "confirmed", homeTouchdowns: 2, awayTouchdowns: 1, homeCasualties: 0, awayCasualties: 0, home: { team: { id: "t1" } }, away: { team: { id: "x" } } };
const friendly = { ...win, id: "g2", kind: "friendly", season: null, home: { team: { id: "t2" } } };
const TEAMS = [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true },
  { id: "t2", name: "Anji Magritta", baseTeamSlug: "teams/imperial-nobility", stage: "active", inActiveSeason: false },
  { id: "t3", name: "Fresh", baseTeamSlug: "teams/orc", stage: "draft", inActiveSeason: false }];
const rows = () => switcherRows({ teams: TEAMS, activeTeamId: "t1", raceTitleOf: (slug) => ({ "teams/human": "Human", "teams/orc": "Orc" })[slug] ?? "", seasonData: SEASON, games: [win, friendly] });

test("rows: the active team is current; each says its race and its place with the record, or the matches played, or the race alone", () => {
  assert.deepEqual(rows().map(({ id, initials, line, current, draft }) => [id, initials, line, current, draft]), [
    ["t1", "AW", "Human · #2 · 1-0-0", true, false],
    ["t2", "AM", "Matches: 1", false, false],
    ["t3", "F", "Orc", false, true],
  ]);
});

test("switching from a team's page keeps its section, from a player the roster; elsewhere the page stays", () => {
  const at = (name) => ({ name, params: { teamId: "t1" } });
  assert.equal(switchTarget(at("team"), "t2"), "#/t/t2");
  assert.equal(switchTarget(at("teamManage"), "t2"), "#/t/t2/team");
  assert.equal(switchTarget(at("teamPlayer"), "t2"), "#/t/t2/roster");
  assert.equal(switchTarget(at("teamChallenges"), "t2"), "#/t/t2/challenges");
  for (const name of ["season", "ref", "settings", "game", "teams", "home"]) assert.equal(switchTarget({ name, params: {} }, "t2"), null, name);
});

test("a team chosen on its settings goes to the other team's settings", () => {
  assert.equal(switchTarget({ name: "teamSettings", params: { teamId: "t1" } }, "t2"), "#/t/t2/settings");
});

test("the switcher is a labelled sheet anchored by the SideNav on a desk: every team, a new one, all of them", () => {
  const fragment = mount(renderTeamSwitcher(rows()));
  const dialog = fragment.querySelector("dialog#team-switcher.g-sheet.g-sheet--anchored");
  assert.equal(dialog.querySelector(".g-sheet__title").textContent, "My teams");
  assert.deepEqual(fragment.querySelectorAll("[data-switch-team]").map((row) => row.getAttribute("data-switch-team")), ["t1", "t2", "t3"]);
  assert.equal(fragment.querySelector('[data-switch-team="t1"]').getAttribute("aria-current"), "true");
  assert.equal(fragment.querySelector('[data-switch-team="t2"]').hasAttribute("aria-current"), false);
  assert.equal(fragment.querySelector("a.g-switcher__new").getAttribute("href"), "#/teams/new");
  assert.equal(fragment.querySelector("a.g-switcher__all").getAttribute("href"), "#/teams");
  assert.ok(fragment.querySelector('[data-switch-team="t3"] .g-status'), "a team in the pre-season build says so");
  assertCspSafe(fragment);
  assertStyled(fragment, "src/shell/team-switcher.css", "sheet.css", "status-chip.css", "button.css");
  assertDictionaryCovers("src/shell/team-switcher.mjs");
});

test("a coach with no team is shown the way to a new one and to all, and no empty group of rows", () => {
  const fragment = mount(renderTeamSwitcher([]));
  assert.equal(fragment.querySelector('[role="group"]'), null, "a group with nothing in it is announced for nothing");
  assert.equal(fragment.querySelector(".g-switcher"), null);
  assert.equal(fragment.querySelector("a.g-switcher__new").getAttribute("href"), "#/teams/new");
  assert.equal(fragment.querySelector("a.g-switcher__all").getAttribute("href"), "#/teams");
  assert.equal(mount(renderTeamSwitcher(rows())).querySelector('[role="group"]').getAttribute("aria-label"), "My teams", "with rows the group is named");
});

test("a team name a coach typed is text", () => {
  const fragment = mount(renderTeamSwitcher(switcherRows({ teams: [{ id: "t1", name: HOSTILE }], activeTeamId: "t1", raceTitleOf: () => "", seasonData: null, games: [] })));
  assert.equal(fragment.querySelector("img"), null);
});

test("choosing a team reports it once; a link inside and every way out close it", () => {
  const host = el(document, "div");
  document.body.appendChild(host);
  host.innerHTML = renderTeamSwitcher(rows());
  const heard = [];
  const off = wireTeamSwitcher(host, { onSwitch: (id) => heard.push(["switch", id]), onClose: () => heard.push(["close"]) });
  fireEvent(host.querySelector('[data-switch-team="t2"]'), "click");
  fireEvent(host.querySelector("a.g-switcher__all"), "click");
  fireEvent(host.querySelector("[data-sheet-close]"), "click");
  assert.deepEqual(heard, [["switch", "t2"], ["close"], ["close"]]);
  off();
});

// What the brief's tests do not hold: every team screen leads somewhere, the Russian reader's words, and what the sheet looks like.

const CSS = "src/shell/team-switcher.css";

test("every screen of a team has a place to go to in another team, and an id that needs encoding is a link that goes there", () => {
  for (const name of TEAM_ROUTES) assert.match(switchTarget({ name, params: { teamId: "t1" } }, "t2"), /^#\/t\/t2/, name);
  assert.equal(switchTarget({ name: "teamMatches", params: {} }, "a b"), "#/t/a%20b/matches");
  assert.equal(switchTarget(null, "t2"), null);
  assert.equal(switchTarget({ name: "constructor", params: {} }, "t2"), null, "a name is not found on the object's own prototype");
});

test("a team with no race, no table and no matches has no line, not an empty one; a team with a row but no season id counts no season", () => {
  const bare = switcherRows({ teams: [{ id: "t9", name: "Mudlarks" }], activeTeamId: null, raceTitleOf: () => "", seasonData: null, games: [] });
  assert.equal(bare[0].line, "");
  assert.equal(mount(renderTeamSwitcher(bare)).querySelector(".g-teamface__line"), null);
  assert.deepEqual([bare[0].current, bare[0].draft, bare[0].inSeason], [false, false, false]);
  const noSeason = switcherRows({ teams: TEAMS.slice(0, 1), activeTeamId: "t1", raceTitleOf: () => "Human", seasonData: { standings: SEASON.standings }, games: [win] });
  assert.equal(noSeason[0].line, "Human · #2 · 0-0-0", "a league match of a season the table does not name is not in the record");
  assert.equal(rows()[0].inSeason, true);
  assert.equal(rows()[1].inSeason, false);
});

test("a team that withdrew from the table, or a friendly alone, says the matches it played", () => {
  const withdrawn = { ...SEASON, standings: [{ team: { id: "t1" }, rank: 2, points: 13, withdrawnAt: "2026-10-01T10:00:00Z" }] };
  const [row] = switcherRows({ teams: TEAMS.slice(0, 1), activeTeamId: "t1", raceTitleOf: () => "Human", seasonData: withdrawn, games: [win] });
  assert.equal(row.line, "Human · Matches: 1");
});

test("in Russian the switcher is Мои команды, the place is a place and the pre-season build is Набор", () => {
  initLocale("ru");
  try {
    const fragment = mount(renderTeamSwitcher(rows()));
    assert.equal(fragment.querySelector(".g-sheet__title").textContent, "Мои команды");
    assert.deepEqual(fragment.querySelectorAll(".g-teamface__line").map((line) => line.textContent), ["Human · 2-е место · 1-0-0", "Матчей: 1", "Orc"]);
    assert.equal(fragment.querySelector('[data-switch-team="t1"] .g-sr-only').textContent, "Текущая команда");
    assert.equal(fragment.querySelector('[data-switch-team="t3"] .g-status').textContent, "Набор");
    assert.equal(fragment.querySelector("a.g-switcher__new").textContent, "Новая команда");
    assert.equal(fragment.querySelector("a.g-switcher__all").textContent, "Все команды");
  } finally {
    initLocale("en");
  }
});

test("only the active team is ticked, and says it in words; a draft says so beside its name", () => {
  const fragment = mount(renderTeamSwitcher(rows()));
  assert.deepEqual(fragment.querySelectorAll("[data-switch-team]").map((row) => row.querySelector("svg.g-icon") !== null), [true, false, false]);
  assert.equal(fragment.querySelector('[data-switch-team="t1"] .g-sr-only').textContent, "Current team");
  assert.equal(fragment.querySelector('[data-switch-team="t3"] .g-status').textContent, "Draft");
  assert.equal(fragment.querySelector('[data-switch-team="t1"] .g-status'), null);
  assert.equal(fragment.querySelector('[data-switch-team="t1"] .g-teamface__tile').textContent, "AW");
  assert.equal(fragment.querySelector('[data-switch-team="t1"] .g-teamface__tile').getAttribute("aria-hidden"), "true", "the name beside it says the team; the tile is a picture");
  assert.equal(fragment.querySelector('[role="group"]').getAttribute("aria-label"), "My teams");
  for (const button of fragment.querySelectorAll(".g-switcher__row")) assert.equal(button.getAttribute("type"), "button");
});

test("every row is a target of 44px at least, and a name or a line that is too long is cut with an ellipsis", () => {
  assert.equal(tokensOf("grass")["--size-row"], "60px");
  assert.deepEqual(valuesOf(CSS, ".g-switcher__row", "min-height"), ["var(--size-row)"]);
  assert.deepEqual(valuesOf(CSS, ".g-switcher__all", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(CSS, ".g-switcher__new", "min-height"), ["56px", "48px"], "an outlined button on a phone, a row on a desk");
  for (const selector of [".g-teamface__name", ".g-teamface__line"]) {
    assert.deepEqual([valuesOf(CSS, selector, "text-overflow"), valuesOf(CSS, selector, "white-space"), valuesOf(CSS, selector, "overflow")], [["ellipsis"], ["nowrap"], ["hidden"]], selector);
  }
  assert.deepEqual(valuesOf(CSS, ".g-teamface__text", "min-width"), ["0"], "the column may shrink below its words");
  assert.deepEqual([valuesOf(CSS, ".g-teamface__tile", "width"), valuesOf(CSS, ".g-teamface__tile", "height")], [["42px"], ["42px"]]);
});

test("the switcher reads in every palette: the row's words on both of its grounds, the tick, the tile and the links", () => {
  for (const selector of [".g-teamface__name", ".g-teamface__line"]) assertReadable(CSS, selector, "color", ["--surface", "--surface-2", "--accent-tint"], 4.5);
  assertReadable(CSS, ".g-teamface__tile", "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-switcher__new", "color", ["--surface", "--accent-tint-soft"], 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-switcher__new:hover", "background"), ["var(--accent-tint-soft)"], "what the words are held against on hover");
  assertReadable(CSS, ".g-switcher__all", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-switcher__row .g-icon", "color", ["--accent-tint"], 3);
  assert.deepEqual(valuesOf(CSS, ".g-switcher__row[aria-current=\"true\"]", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(valuesOf(CSS, ".g-switcher__row[aria-current=\"true\"]", "border-color"), ["var(--accent)"]);
});

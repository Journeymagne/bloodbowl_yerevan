import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, inMedia, read, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { t } from "../src/core/i18n.mjs";
import { state } from "../src/core/state.mjs";
import { seasonPoints, standingsOrder } from "../src/domain/league-rules.mjs";
import { tableWindow } from "../src/data/season-table.mjs";
import { TABLE_COLUMNS, leagueTableMarkup, miniTableMarkup, rowHref, tableNotesMarkup, tablePointsText } from "../src/screens/season/table.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
state.data = expandCollections(JSON.parse(text("public/data.en.json")));
const CSS = "src/screens/season/table.css";

/** A row as `seasonTable` gives it; the key is the team's id, `u<n>` the coach. */
const row = (rank, teamId, userId, over = {}) => ({
  rank, entryId: `e-${teamId}`, user: { id: userId, login: `coach-${userId}` }, team: { id: teamId, name: `Team ${teamId}`, baseTeamSlug: "teams/dwarf" },
  games: 3, points: 7, wins: 2, draws: 1, losses: 0, touchdowns: 6, conceded: 2, casualties: 3, suffered: 5, form: ["w", "d", "w"], withdrawn: false, ...over,
});
const ROWS = [
  row(1, "r1", "u2"),
  row(2, "t1", "u1", { touchdowns: 4, conceded: 4, casualties: 2, suffered: 2, form: ["l", "w", "d", "w", "w"] }),
  row(3, "w1", "u3", { withdrawn: true }),
  row(4, "r2", "u4", { team: { id: "r2", name: "Team r2", baseTeamSlug: "teams/nope" }, touchdowns: 1, conceded: 3 }),
];
const rowsOf = (fragment) => [...fragment.querySelectorAll('.g-table__row[role="row"]')];
const cell = (rowElement, key) => rowElement.querySelector(`.g-table__cell[data-column="${key}"]`);

test("one form for each width: a phone's eight columns, a desk's eleven, in the order of the prototypes", () => {
  const phone = mount(leagueTableMarkup({ rows: ROWS, phone: true, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  assert.equal(phone.querySelectorAll('[role="columnheader"]').length, 8);
  assert.deepEqual([...phone.querySelectorAll('[role="columnheader"] .g-sr-only')].map((item) => item.textContent),
    TABLE_COLUMNS.phone.map((key) => t(`league.colName.${key}`)));
  const desk = mount(leagueTableMarkup({ rows: ROWS, phone: false, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  assert.deepEqual([...desk.querySelectorAll('[role="columnheader"] .g-sr-only')].map((item) => item.textContent),
    TABLE_COLUMNS.desk.map((key) => t(`league.colName.${key}`)));
  assert.deepEqual([...desk.querySelectorAll('[role="columnheader"] [aria-hidden="true"]')].map((item) => item.textContent),
    TABLE_COLUMNS.desk.map((key) => t(`league.col.${key}`)), "the letter is seen, the word is heard");
  const table = desk.querySelector(".g-table");
  assert.equal(table.getAttribute("role"), "table");
  assert.equal(table.getAttribute("aria-labelledby"), "t");
  assert.equal(desk.querySelectorAll('[role="rowgroup"]').length, 2);
  for (const rowElement of rowsOf(desk)) assert.equal(rowElement.querySelectorAll('[role="cell"]').length, 11);
  for (const rowElement of rowsOf(phone)) assert.equal(rowElement.querySelectorAll('[role="cell"]').length, 8);
  assert.deepEqual(TABLE_COLUMNS.phone, ["rank", "team", "games", "wins", "draws", "losses", "tdDiff", "points"]);
  assert.deepEqual(TABLE_COLUMNS.desk, ["rank", "team", "games", "wins", "draws", "losses", "td", "tdDiff", "casDiff", "form", "points"]);
  assert.ok(Object.isFrozen(TABLE_COLUMNS));
});

test("the numbers are the row's: the place, the games, the results, the goals scored and conceded, the points", () => {
  const desk = mount(leagueTableMarkup({ rows: ROWS, phone: false, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  const own = rowsOf(desk)[1];
  assert.deepEqual(["rank", "games", "wins", "draws", "losses", "td", "points"].map((key) => cell(own, key).textContent),
    ["2", "3", "2", "1", "0", "4–4", "7"]);
});

test("a coach's own rows are marked and lead to the team's overview; another's lead to the opponent's page; a guest's lead nowhere", () => {
  for (const phone of [true, false]) {
    const fragment = mount(leagueTableMarkup({ rows: ROWS, phone, viewerId: "u1", signedIn: true, labelledBy: "t" }));
    const [rival, own] = rowsOf(fragment);
    assert.ok(own.classList.contains("g-table__row--mine"));
    assert.ok(!rival.classList.contains("g-table__row--mine"));
    const ownLink = own.querySelector("a.g-table__link");
    assert.equal(ownLink.getAttribute("href"), "#/t/t1");
    assert.equal(ownLink.getAttribute("aria-label"), t("league.teamLink", { team: "Team t1" }));
    assert.equal(ownLink.textContent, "Team t1");
    assert.equal(rival.querySelector("a.g-table__link").getAttribute("href"), "#/coaches/u2/teams/r1");
  }
  const guest = mount(leagueTableMarkup({ rows: ROWS, phone: false, labelledBy: "t" }));
  assert.equal(guest.querySelectorAll("a.g-table__link").length, 0);
  assert.equal(guest.querySelectorAll(".g-table__row--mine").length, 0);
  assert.equal(rowsOf(guest)[0].querySelector(".g-table__name").textContent, "Team r1");
  assert.ok(guest.querySelectorAll("a.g-table__race").length > 0, "a race still leads to its rules");
  assert.equal(rowHref(ROWS[0], { viewerId: "u1", signedIn: false }), "");
  assert.equal(rowHref(ROWS[0], { viewerId: "u1", signedIn: true }), "#/coaches/u2/teams/r1");
  assert.equal(rowHref(ROWS[1], { viewerId: "u1", signedIn: true }), "#/t/t1");
  assert.equal(rowHref(ROWS[2], { viewerId: "u1", signedIn: true }), "", "a withdrawn entry leads nowhere");
});

test("a race leads to its team rules on a desk; one the reference does not know, and every race on a phone, is text", () => {
  const desk = mount(leagueTableMarkup({ rows: ROWS, phone: false, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  const [rival, , , unknown] = rowsOf(desk);
  const race = rival.querySelector("a.g-table__race");
  assert.equal(race.getAttribute("href"), "#/teams/dwarf");
  assert.equal(race.getAttribute("title"), t("league.raceTitle"));
  assert.match(race.textContent, /Dwarf/);
  assert.ok(race.querySelector("svg.g-icon"), "the book");
  assert.equal(unknown.querySelector("a.g-table__race"), null);
  assert.equal(unknown.querySelector(".g-table__racetext"), null, "a race the reference has no name for is left out");
  const phone = mount(leagueTableMarkup({ rows: ROWS, phone: true, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  assert.equal(phone.querySelectorAll("a.g-table__race").length, 0, "on a phone the race is text: a 44px link would lie over the name");
  assert.match(rowsOf(phone)[0].querySelector(".g-table__racetext").textContent, /Dwarf/);
});

test("the differences carry their sign: plus, the minus sign, zero; the form is five squares", () => {
  const desk = mount(leagueTableMarkup({ rows: ROWS, phone: false, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  const [rival, own, , unknown] = rowsOf(desk);
  assert.equal(cell(rival, "tdDiff").textContent, "+4");
  assert.ok(cell(rival, "tdDiff").classList.contains("g-table__diff--up"));
  assert.equal(cell(rival, "casDiff").textContent, "−2");
  assert.ok(cell(rival, "casDiff").classList.contains("g-table__diff--down"));
  assert.equal(cell(own, "tdDiff").textContent, "0");
  assert.ok(cell(own, "tdDiff").classList.contains("g-table__diff--even"));
  assert.equal(cell(unknown, "tdDiff").textContent, "−2");
  const squares = [...own.querySelectorAll('[data-column="form"] .g-form__item')];
  assert.deepEqual(squares.map((square) => square.getAttribute("class").match(/g-form__item--(\w)/)[1]), ["l", "w", "d", "w", "w"]);
  const phone = mount(leagueTableMarkup({ rows: ROWS, phone: true, viewerId: "u1", signedIn: true, labelledBy: "t" }));
  assert.equal(cell(rowsOf(phone)[0], "tdDiff").textContent, "+4");
  assert.equal(phone.querySelectorAll(".g-form").length, 0, "no form on a phone");
});

test("a withdrawn entry keeps its place, says so and leads nowhere", () => {
  for (const phone of [true, false]) {
    const fragment = mount(leagueTableMarkup({ rows: ROWS, phone, viewerId: "u3", signedIn: true, labelledBy: "t" }));
    const withdrawn = rowsOf(fragment)[2];
    assert.ok(withdrawn.classList.contains("g-table__row--withdrawn"));
    assert.ok(!withdrawn.classList.contains("g-table__row--mine"), "not the coach's own any more either");
    assert.equal(cell(withdrawn, "rank").textContent, "3");
    assert.equal(withdrawn.querySelector(".g-table__withdrawn").textContent, t("league.withdrawn"));
    assert.equal(withdrawn.querySelectorAll("a").length, 0);
  }
});

test("no rows is the table's empty line", () => {
  const fragment = mount(leagueTableMarkup({ rows: [], phone: true, labelledBy: "t" }));
  assert.equal(fragment.querySelector("p.g-table__empty").textContent, t("guestHome.tableEmpty"));
  assert.equal(fragment.querySelector('[role="table"]'), null);
});

test("the note is the league's rules: its numbers are seasonPoints', its order standingsOrder's", () => {
  const phone = mount(tableNotesMarkup({ phone: true })).textContent;
  for (const value of [seasonPoints.win, seasonPoints.draw, seasonPoints.loss, seasonPoints.bigWinMargin, seasonPoints.casualtyThreshold, seasonPoints.bigWinBonus]) {
    assert.ok(phone.includes(String(value)), `${value} is in the note`);
  }
  assert.ok(phone.includes(t("league.points", { win: seasonPoints.win, draw: seasonPoints.draw, loss: seasonPoints.loss, bonus: seasonPoints.bigWinBonus,
    margin: seasonPoints.bigWinMargin, casualties: seasonPoints.casualtyThreshold })));
  assert.equal(seasonPoints.shutoutBonus, seasonPoints.bigWinBonus, "one figure in the note for the three bonuses: change both");
  assert.equal(seasonPoints.casualtyBonus, seasonPoints.bigWinBonus, "one figure in the note for the three bonuses: change both");
  assert.deepEqual(standingsOrder, ["points", "touchdowns", "casualties", "games"], "the words of league.order follow this order: change both");
  assert.ok(phone.includes(t("league.order")));
  assert.ok(phone.includes(t("league.taps")));
  assert.ok(!phone.includes(t("league.clicks")));
  const desk = mount(tableNotesMarkup({ phone: false })).textContent;
  assert.ok(desk.includes(t("league.order")) && desk.includes(t("league.clicks")));
  assert.ok(!desk.includes(t("league.taps")));
  assert.ok(!desk.includes(t("league.points", { win: 3, draw: 1, loss: 0, bonus: 1, margin: 3, casualties: 3 })), "a desk says the points at the card's head");
  assert.equal(tablePointsText(), t("league.points", { win: 3, draw: 1, loss: 0, bonus: 1, margin: 3, casualties: 3 }));
});

test("a guest is not told a row leads anywhere: his rows are no links", () => {
  const phone = mount(tableNotesMarkup({ phone: true, signedIn: false })).textContent;
  assert.ok(phone.includes(t("league.order")));
  assert.ok(!phone.includes(t("league.taps")));
  const desk = mount(tableNotesMarkup({ phone: false, signedIn: false })).textContent;
  assert.ok(desk.includes(t("league.clicksGuest")));
  assert.ok(!desk.includes(t("league.clicks")));
});

test("the overview's mini table: its rows, the team's own marked, the link to the whole table", () => {
  const many = Array.from({ length: 9 }, (_, at) => row(at + 1, `k${at + 1}`, `u${at + 10}`, { touchdowns: 5 - at, conceded: 2 }));
  many[7] = row(8, "t1", "u1", { touchdowns: 1, conceded: 3 });
  const fragment = mount(miniTableMarkup({ rows: tableWindow(many, "t1"), viewerId: "u1", href: "#/t/t1/matches" }));
  const section = fragment.querySelector("section.g-minitable");
  assert.equal(section.getAttribute("aria-labelledby"), "overview-table");
  assert.equal(fragment.querySelector("h2#overview-table").textContent, t("shell.tab.table"));
  const all = fragment.querySelector("a.g-minitable__all");
  assert.equal(all.getAttribute("href"), "#/t/t1/matches");
  assert.equal(all.textContent, t("teamOverview.tableAll"));
  const rows = [...fragment.querySelectorAll('.g-minitable__row[role="row"]')];
  assert.deepEqual(rows.map((item) => item.querySelector(".g-minitable__rank").textContent), ["1", "2", "3", "4", "5", "8"]);
  const own = rows.at(-1);
  assert.ok(own.classList.contains("g-minitable__row--mine"));
  assert.equal(own.querySelector("a.g-minitable__link").getAttribute("href"), "#/t/t1");
  assert.equal(rows[0].querySelector("a.g-minitable__link").getAttribute("href"), "#/coaches/u10/teams/k1");
  assert.deepEqual([own.querySelector(".g-minitable__diff").textContent, rows[0].querySelector(".g-minitable__diff").textContent], ["−2", "+3"]);
  assert.ok(own.querySelector(".g-minitable__diff").classList.contains("g-minitable__diff--down"));
  assert.equal(rows[0].querySelector(".g-minitable__points").textContent, "7");
  assert.equal(fragment.querySelector('[role="table"]').getAttribute("aria-labelledby"), "overview-table");
  assert.equal(fragment.querySelectorAll('[role="columnheader"]').length, 4, "the columns are named for a screen reader");
  assert.equal(miniTableMarkup({ rows: [], viewerId: "u1", href: "#/t/t1/matches" }), "");
});

test("names are text", () => {
  const hostile = [row(1, "h1", "u9", { user: { id: "u9", login: HOSTILE }, team: { id: "h1", name: HOSTILE, baseTeamSlug: HOSTILE } })];
  for (const markup of [
    leagueTableMarkup({ rows: hostile, phone: false, viewerId: "u1", signedIn: true, labelledBy: "t" }),
    leagueTableMarkup({ rows: hostile, phone: true, viewerId: "u1", signedIn: true, labelledBy: "t" }),
    miniTableMarkup({ rows: hostile, viewerId: "u1", href: "#/t/t1/matches" }),
  ]) {
    const fragment = mount(markup);
    assert.equal(fragment.querySelector("img"), null);
    assert.ok(fragment.textContent.includes(HOSTILE));
  }
  assert.throws(() => miniTableMarkup({ rows: ROWS, viewerId: "u1", href: "javascript:alert(1)" }));
});

test("no inline style or handler", () => {
  for (const phone of [true, false]) assertCspSafe(mount(leagueTableMarkup({ rows: ROWS, phone, viewerId: "u1", signedIn: true, labelledBy: "t" })));
  assertCspSafe(mount(tableNotesMarkup({ phone: true })));
  assertCspSafe(mount(miniTableMarkup({ rows: ROWS, viewerId: "u1", href: "#/t/t1/matches" })));
});

test("styled", () => {
  for (const phone of [true, false]) {
    assertStyled(mount(leagueTableMarkup({ rows: ROWS, phone, viewerId: "u1", signedIn: true, labelledBy: "t" })), CSS, "form-strip.css");
    assertStyled(mount(tableNotesMarkup({ phone })), CSS);
  }
  assertStyled(mount(leagueTableMarkup({ rows: [], phone: true, labelledBy: "t" })), CSS);
  assertStyled(mount(miniTableMarkup({ rows: ROWS, viewerId: "u1", href: "#/t/t1/matches" })), CSS);
  const styles = read("src/styles.css");
  const at = styles.indexOf('@import url("screens/season/table.css");');
  assert.ok(at > styles.indexOf('@import url("screens/matches/prep-inducements.css");') && at > styles.lastIndexOf('@import url("ui/'),
    "imported after the 09a sheets and the ui/ ones, the form strip's among them");
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/season/table.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  for (const key of new Set([...TABLE_COLUMNS.phone, ...TABLE_COLUMNS.desk])) {
    for (const name of [`league.col.${key}`, `league.colName.${key}`]) {
      assert.ok(en[name], `en ${name}`);
      assert.ok(ru[name], `ru ${name}`);
    }
  }
});

test("readable: the own row's tint, the signs' colours, the muted figures, in every palette", () => {
  for (const [selector, backgrounds] of [
    [".g-table__diff--up", ["--surface"]],
    [".g-table__diff--down", ["--surface", "--accent-tint"]],
    [".g-table__diff--even", ["--surface", "--accent-tint"]],
    [".g-table__row--mine .g-table__diff--up", ["--accent-tint"]],
    [".g-table__race", ["--surface"]],
    [".g-table__row--mine .g-table__race", ["--accent-tint"]],
    [".g-table__rank", ["--surface", "--accent-tint"]],
    [".g-table__name", ["--surface", "--accent-tint"]],
    [".g-table__link", ["--surface", "--accent-tint"]],
    [".g-table__withdrawn", ["--surface"]],
    [".g-table__notes", ["--surface"]],
    [".g-minitable__diff--up", ["--surface"]],
    [".g-minitable__row--mine .g-minitable__diff--up", ["--accent-tint"]],
    [".g-minitable__all", ["--surface"]],
    [".g-minitable__rank", ["--surface", "--accent-tint"]],
  ]) assertReadable(CSS, selector, "color", backgrounds, 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-table__row--mine", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(valuesOf(CSS, ".g-minitable__row--mine", "background"), ["var(--accent-tint)"]);
});

test("a long team name wraps; nothing is cut with «…»", () => {
  const css = read(CSS);
  assert.doesNotMatch(css, /ellipsis/);
  for (const selector of [".g-table__name", ".g-table__link", ".g-minitable__name", ".g-minitable__link"]) {
    assert.deepEqual(valuesOf(CSS, selector, "overflow-wrap"), ["anywhere"], selector);
  }
});

test("D2: a row, a race and «Whole table» are 44px to touch up to 900px and at least 24px from 901px", () => {
  const px = (values) => Number(String(values.at(-1)).replace("px", ""));
  assert.ok(px(inMedia(CSS, "max-width: 900px", ".g-table__row", "min-height")) >= 44, "a phone's row, which its link covers");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-table__row", "min-height")) >= 24);
  assert.deepEqual(valuesOf(CSS, ".g-table__link::after", "inset"), ["0"], "the link takes the whole row");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-table__race", "min-height")) >= 24);
  assert.ok(Number(valuesOf(CSS, ".g-minitable__all", "min-height")[0].replace("px", "")) >= 44, "the default, before any width's rule");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-minitable__all", "min-height")) >= 24);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-minitable__link", "min-height")) >= 24);
});

test("the grids are the prototypes'", () => {
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-table__row", "grid-template-columns"), ["26px minmax(0, 1fr) repeat(4, 24px) 38px 34px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-table__row", "grid-template-columns"),
    ["32px minmax(200px, 1fr) repeat(4, 32px) 52px 44px 44px 136px 40px"]);
  assert.deepEqual(valuesOf(CSS, ".g-minitable__row", "grid-template-columns"), ["24px minmax(0, 1fr) 34px 30px"]);
});

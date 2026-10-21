import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, inMedia, read, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { t } from "../src/core/i18n.mjs";
import { state } from "../src/core/state.mjs";
import { seasonPoints, standingsOrder } from "../src/domain/league-rules.mjs";
import { seasonTable, tableWindow } from "../src/data/season-table.mjs";
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

/**
 * The table of `count` teams `k1`…`k<count>` as `seasonTable` reads the server's standings: the `withdrawn`th entry
 * withdrawn (its place kept), the `own`th team the coach u1's.
 */
function tableOf(count, { withdrawn = 0, own = 0 } = {}) {
  return seasonTable({ rounds: [], standings: Array.from({ length: count }, (_, at) => ({
    entryId: `e-k${at + 1}`, rank: at + 1, games: 3, points: 20 - at, byes: 0, touchdowns: 0, casualties: 0,
    withdrawnAt: at + 1 === withdrawn ? "2026-10-01T10:00:00Z" : null,
    user: at + 1 === own ? { id: "u1", login: "coach-u1" } : { id: `u${at + 10}`, login: `coach-u${at + 10}` },
    team: { id: `k${at + 1}`, name: `Team k${at + 1}`, baseTeamSlug: "teams/dwarf" },
  })) });
}
/** The places of the rows in the zone, and of the one with the line under it, of a big table or of the overview's. */
function zoneOf(fragment, big = true) {
  const [rowClass, rankClass] = big ? ["g-table__row", "g-table__rank"] : ["g-minitable__row", "g-minitable__rank"];
  const rows = [...fragment.querySelectorAll(`.${rowClass}[role="row"]`)];
  const places = (modifier) => rows.filter((item) => item.classList.contains(`${rowClass}--${modifier}`)).map((item) => item.querySelector(`.${rankClass}`).textContent);
  return { zone: places("zone"), end: places("zoneend") };
}

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

test("on a team's own screens the team's row alone is marked: the coach's other teams lead to their overviews, unmarked (DeskSeason, DeskOverview)", () => {
  const rows = [...ROWS, row(5, "t2", "u1")];
  const marked = (fragment, selector) => [...fragment.querySelectorAll(selector)].map((item) => item.querySelector("a").getAttribute("href"));
  for (const phone of [true, false]) {
    const league = mount(leagueTableMarkup({ rows, phone, viewerId: "u1", signedIn: true, labelledBy: "t" }));
    assert.deepEqual(marked(league, ".g-table__row--mine"), ["#/t/t1", "#/t/t2"], "the league's page: every team of the coach's (decision 6)");
    const team = mount(leagueTableMarkup({ rows, phone, viewerId: "u1", signedIn: true, teamId: "t2", labelledBy: "t" }));
    assert.deepEqual(marked(team, ".g-table__row--mine"), ["#/t/t2"], "t2's season: t2 alone");
    assert.equal(rowsOf(team)[1].querySelector("a.g-table__link").getAttribute("href"), "#/t/t1", "t1 still leads to its overview");
    const stranger = mount(leagueTableMarkup({ rows, phone, viewerId: "u9", signedIn: true, teamId: "t2", labelledBy: "t" }));
    assert.equal(stranger.querySelectorAll(".g-table__row--mine").length, 0, "a team is marked for its own coach only");
  }
  const mini = mount(miniTableMarkup({ rows, viewerId: "u1", teamId: "t2", href: "#/t/t2/matches" }));
  assert.deepEqual(marked(mini, ".g-minitable__row--mine"), ["#/t/t2"]);
  assert.equal(mini.querySelectorAll(".g-minitable__row a")[1].getAttribute("href"), "#/t/t1");
});

test("a desk's TD pair is the prototype's 14px and its TD± 600 (DeskSeason.html); a phone's TD± stays as League.html draws it", () => {
  const desk = rowsOf(mount(leagueTableMarkup({ rows: ROWS, phone: false, viewerId: "u1", signedIn: true, labelledBy: "t" })));
  for (const rowElement of desk) {
    assert.ok(cell(rowElement, "td").classList.contains("g-table__num--pair"));
    assert.ok(cell(rowElement, "td").classList.contains("g-table__num--muted"));
    assert.ok(cell(rowElement, "tdDiff").classList.contains("g-table__diff--strong"));
    assert.ok(!cell(rowElement, "casDiff").classList.contains("g-table__diff--strong"), "CAS± is 400, as the prototype's");
  }
  const phone = rowsOf(mount(leagueTableMarkup({ rows: ROWS, phone: true, viewerId: "u1", signedIn: true, labelledBy: "t" })));
  assert.ok(phone.every((rowElement) => !cell(rowElement, "tdDiff").classList.contains("g-table__diff--strong")));
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-table__num--pair", "font-size"), ["14px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-table__diff--strong", "font-weight"), ["600"]);
  assert.deepEqual(valuesOf(CSS, ".g-table__diff--strong", "font-weight"), ["600"], "a desk's only");
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
  assert.ok(tablePointsText().startsWith(t("league.points", { win: 3, draw: 1, loss: 0, bonus: 1, margin: 3, casualties: 3 })));
});

test("the note says the technical win's points in the league's numbers", () => {
  const technical = t("league.technicalPoints", { technical: seasonPoints.technicalWin, bonus: seasonPoints.noTeamBonus });
  assert.equal(technical, "Technical win 2; +2 if the opponent could not field a team.");
  assert.ok(technical.includes(String(seasonPoints.technicalWin)) && technical.includes(`+${seasonPoints.noTeamBonus}`));
  const points = t("league.points", { win: seasonPoints.win, draw: seasonPoints.draw, loss: seasonPoints.loss, bonus: seasonPoints.bigWinBonus,
    margin: seasonPoints.bigWinMargin, casualties: seasonPoints.casualtyThreshold });
  assert.equal(tablePointsText(), `${points} ${technical}`, "the content's «2 points for a technical win» and «+2 points if the opponent could not field a team»");
  assert.ok(mount(tableNotesMarkup({ phone: true })).textContent.includes(technical), "a phone's note says it");
  assert.ok(!mount(tableNotesMarkup({ phone: false })).textContent.includes(technical), "a desk's card says it at its head, once");
});

test("the playoff zone: the first N rows not withdrawn, the line under the Nth; none without a number", () => {
  const rows = tableOf(6, { withdrawn: 2 });
  for (const phone of [true, false]) {
    const table = (playoffPlaces) => mount(leagueTableMarkup({ rows, phone, viewerId: "u1", signedIn: true, labelledBy: "t", playoffPlaces }));
    assert.deepEqual(zoneOf(table(3)), { zone: ["1", "3", "4"], end: ["4"] }, "the withdrawn second is no place of the zone");
    assert.deepEqual(zoneOf(table(null)), { zone: [], end: [] }, "no number, no zone");
    assert.deepEqual(zoneOf(table(undefined)), { zone: [], end: [] });
    assert.deepEqual(zoneOf(table(1)), { zone: ["1"], end: ["1"] });
    assert.deepEqual(zoneOf(table(5)), { zone: ["1", "3", "4", "5", "6"], end: [] }, "the fifth is the last row: no line under the table");
    assert.deepEqual(zoneOf(table(64)), { zone: ["1", "3", "4", "5", "6"], end: [] }, "more places than teams: all of them, no line");
    const withdrawn = rowsOf(table(3))[1];
    assert.ok(!withdrawn.classList.contains("g-table__row--zone"));
  }
  const zone = (props) => mount(tableNotesMarkup(props)).querySelector(".g-table__notes p.g-table__zone");
  for (const phone of [true, false]) {
    const notes = mount(tableNotesMarkup({ phone, playoffPlaces: 3 })).querySelector(".g-table__notes");
    assert.equal(notes.childNodes.filter((node) => node.nodeType === 1)[0], notes.querySelector("p.g-table__zone"), "the zone's line first, as the prototypes write it");
    assert.equal(zone({ phone, playoffPlaces: 3 }).textContent, "Playoff zone: places 1–3");
    assert.equal(zone({ phone, playoffPlaces: 1 }).textContent, "Playoff zone: place 1");
    assert.equal(zone({ phone, playoffPlaces: null }), null);
    assert.equal(zone({ phone }), null);
    assert.equal(zone({ phone, signedIn: false, playoffPlaces: 4 }).textContent, "Playoff zone: places 1–4", "a guest is told the zone too");
  }
  const mini = (window, playoffPlaces) => mount(miniTableMarkup({ rows: window, viewerId: "u1", href: "#/t/k1/matches", playoffPlaces }));
  const many = tableOf(9);
  assert.deepEqual(zoneOf(mini(tableWindow(many, "k1"), 6), false), { zone: ["1", "2", "3", "4", "5", "6"], end: [] }, "nothing under the sixth in a window of six: no line");
  assert.deepEqual(zoneOf(mini(tableWindow(many, "k1"), 3), false), { zone: ["1", "2", "3"], end: ["3"] });
  assert.deepEqual(zoneOf(mini(tableWindow(many, "k1"), null), false), { zone: [], end: [] });
  assert.deepEqual(zoneOf(mini(tableWindow(many, "k1")), false), { zone: [], end: [] });
});

test("the overview's zone goes by the place in the whole table, not by the row of the window (pre-flight L16)", () => {
  const ninth = tableOf(9, { own: 9 });
  const window = tableWindow(ninth, "k9");
  assert.deepEqual(window.map((item) => item.rank), [1, 2, 3, 4, 5, 9]);
  const mini = (rows, playoffPlaces) => mount(miniTableMarkup({ rows, viewerId: "u1", teamId: "k9", href: "#/t/k9/matches", playoffPlaces }));
  assert.deepEqual(zoneOf(mini(window, 6), false), { zone: ["1", "2", "3", "4", "5"], end: [] },
    "the ninth stands sixth in the window and outside a zone of six; the sixth place is not shown, nor a line for it");
  const own = mini(window, 6).querySelector(".g-minitable__row--mine");
  assert.equal(own.querySelector(".g-minitable__rank").textContent, "9");
  assert.ok(!own.classList.contains("g-minitable__row--zone"), "the team's own row is marked, outside the zone");
  assert.deepEqual(zoneOf(mini(window, 5), false), { zone: ["1", "2", "3", "4", "5"], end: ["5"] }, "the line under the fifth: the ninth follows it");
  const withdrawn = tableOf(9, { withdrawn: 2 });
  assert.deepEqual(zoneOf(mini(tableWindow(withdrawn, "k1"), 3), false), { zone: ["1", "3", "4"], end: ["4"] }, "the window leaves the withdrawn out, the zone does not count it");
  assert.deepEqual(zoneOf(mount(leagueTableMarkup({ rows: ninth, phone: false, viewerId: "u1", signedIn: true, teamId: "k9", labelledBy: "t", playoffPlaces: 6 }))),
    { zone: ["1", "2", "3", "4", "5", "6"], end: ["6"] }, "the whole table draws the sixth and the line under it");
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
  const zoned = tableOf(8, { withdrawn: 2, own: 3 });
  for (const phone of [true, false]) {
    assertStyled(mount(leagueTableMarkup({ rows: zoned, phone, viewerId: "u1", signedIn: true, labelledBy: "t", playoffPlaces: 4 })), CSS, "form-strip.css");
    assertStyled(mount(tableNotesMarkup({ phone, playoffPlaces: 4 })), CSS);
  }
  assertStyled(mount(miniTableMarkup({ rows: tableWindow(zoned, "k3"), viewerId: "u1", teamId: "k3", href: "#/t/k3/matches", playoffPlaces: 4 })), CSS);
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
    [".g-table__row--zone .g-table__rank", ["--surface"]],
    [".g-table__row--mine.g-table__row--zone .g-table__rank", ["--accent-tint"]],
    [".g-minitable__row--zone .g-minitable__rank", ["--surface"]],
    [".g-minitable__row--mine.g-minitable__row--zone .g-minitable__rank", ["--accent-tint"]],
  ]) assertReadable(CSS, selector, "color", backgrounds, 4.5);
  assert.deepEqual(valuesOf(CSS, ".g-table__row--mine", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(valuesOf(CSS, ".g-minitable__row--mine", "background"), ["var(--accent-tint)"]);
});

test("readable: the zone's place in the league's green (League.html's posColor), its line and its dot a mark that holds 3:1", () => {
  // The prototypes' #2F7A52 is --accent-text (= --accent in a light palette); a dark palette's --accent is under 3:1 on
  // --surface, so the line and the dot take --accent-text, the colour of the places they key.
  assert.deepEqual(valuesOf(CSS, ".g-table__row--zone .g-table__rank", "color"), ["var(--accent-text)"]);
  assert.deepEqual(valuesOf(CSS, ".g-minitable__row--zone .g-minitable__rank", "color"), ["var(--accent-text)"]);
  for (const selector of [".g-table__row--zoneend", ".g-minitable__row--zoneend"]) {
    const [line] = valuesOf(CSS, selector, "border-bottom");
    assert.match(line, /^2px solid var\(--accent-text\)$/, selector);
    assertContrast("var(--accent-text)", ["--surface", "--accent-tint"], 3, { what: `${selector} line` });
  }
  assert.deepEqual(valuesOf(CSS, ".g-table__zone::before", "width"), ["10px"]);
  assert.deepEqual(valuesOf(CSS, ".g-table__zone::before", "height"), ["10px"]);
  assert.deepEqual(valuesOf(CSS, ".g-table__zone::before", "border-radius"), ["50%"]);
  assertReadable(CSS, ".g-table__zone::before", "background", ["--surface"], 3);
  assert.deepEqual(valuesOf(CSS, ".g-table__zone", "gap"), ["var(--space-8)"], "the dot 8 from the words, as the prototypes'");
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

test("a phone's row is League.html's 71: its 58 with the padding and the rule on top, the prototype setting no box-sizing", () => {
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-table__row", "min-height"), ["71px"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-table__row", "padding"), ["var(--space-6) var(--space-16)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-table__row", "min-height"), ["56px"], "a desk's is 57 in DeskSeason.html: a pixel, left");
});

test("the grids are the prototypes'", () => {
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-table__row", "grid-template-columns"), ["26px minmax(0, 1fr) repeat(4, 24px) 38px 34px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-table__row", "grid-template-columns"),
    ["32px minmax(200px, 1fr) repeat(4, 32px) 52px 44px 44px 136px 40px"]);
  assert.deepEqual(valuesOf(CSS, ".g-minitable__row", "grid-template-columns"), ["24px minmax(0, 1fr) 34px 30px"]);
});

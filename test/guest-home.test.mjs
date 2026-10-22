import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale, withWindow } from "./helpers/ref-screen.mjs";

// The fake API comes first: api-client.mjs picks `fetch` up when it loads.
const api = installFakeApi();
const view = mountView();
const { guestHomeMarkup, guestTable, renderGuestHome } = await import("../src/screens/home/guest.mjs");
const { sectionTitle } = await import("../src/screens/ref/catalog.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");

const SHEET = "src/screens/home/guest.css";
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const turns = async (count = 20) => { for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

const season = (standings, rounds = []) => ({ season: { id: "s1", name: "Season 2", status: "active" }, standings, rounds });
const row = (rank, name, slug, extra = {}) => ({ rank, points: 20 - rank, withdrawnAt: null, user: { id: `u${rank}` }, team: { id: `t${rank}`, name, baseTeamSlug: slug }, ...extra });
const SIX = [row(1, "Duskspire Knives", "teams/dark-elf"), row(2, "Gone", "teams/orc", { withdrawnAt: "2026-10-01" }), row(3, "Ashgrove", "teams/human"),
  row(4, "Karak", "teams/dwarf"), row(5, "Grimtusk", "teams/orc"), row(6, "Silverbrook", "teams/wood-elves"), row(7, "Seventh", "teams/ogre")];
const loaded = (data) => ({ data, loaded: true, loading: false, error: "" });

// Every screen starts as a visitor finds it on arrival: English, a guest, no team, the season read.
beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  state.auth.currentUser = null;
  state.myTeams.items = [];
  state.season = loaded(season(SIX));
  api.reset();
});

test("a guest's front page: what the league is, the way in, the table and the reference", () => {
  state.season = { data: season(SIX), loaded: true, loading: false, error: "" };
  renderGuestHome();
  assert.equal(view.querySelector("h1").textContent, "A league for Blood Bowl Sevens coaches");
  assert.deepEqual(view.querySelectorAll(".g-guest__hero a").map((a) => a.getAttribute("href")), ["#/login", "#/register"]);
  assert.deepEqual(view.querySelectorAll(".g-guest__tile").map((a) => a.getAttribute("href")), ["#/ref/teams", "#/ref/skills", "#/ref", "#/all-gata-changes"]);
  assert.equal(view.querySelector(".g-guest__more").getAttribute("href"), "#/season");
  assertCspSafe(view);
  assertStyled(view, "src/screens/home/guest.css", "page-head.css", "button.css", "list-row.css");
});

test("the table is the top five, without the withdrawn, each with its race and points, and says after which round", () => {
  const table = guestTable(season(SIX, [{ roundNumber: 5, status: "completed" }, { roundNumber: 6, status: "completed" }, { roundNumber: 7, status: "started" }]), state.data);
  assert.equal(table.round, 6);
  assert.deepEqual(table.rows.map((r) => [r.rank, r.name, r.race]), [[1, "Duskspire Knives", "Dark Elf"], [3, "Ashgrove", "Human"], [4, "Karak", "Dwarf"], [5, "Grimtusk", "Orc"], [6, "Silverbrook", "Wood Elves"]]);
  state.season = { data: season(SIX, [{ roundNumber: 6, status: "completed" }]), loaded: true, loading: false, error: "" };
  renderGuestHome();
  assert.equal(view.querySelector(".g-guest__table h2").textContent, "Table · after round 6");
  assert.equal(view.querySelectorAll(".g-guest__table .g-ranked").length, 5);
});

test("a coach's team name is text, not markup", () => {
  state.season = { data: season([row(1, HOSTILE, "teams/human")]), loaded: true, loading: false, error: "" };
  renderGuestHome();
  assert.equal(view.querySelector("img"), null);
  assert.equal(view.querySelector(".g-ranked__title").textContent, HOSTILE);
});

test("no season yet, no rows, or no answer: the box says so and still leads to the full table", () => {
  for (const [seasonState, text] of [
    [{ data: season([]), loaded: true, error: "" }, "The table fills in once coaches enter the season."],
    [{ data: season([row(1, "Gone", "teams/orc", { withdrawnAt: "2026-10-01" })]), loaded: true, error: "" }, "The table fills in once coaches enter the season."],
    [{ data: null, loaded: false, error: "No connection to the server. Check the internet and try again." }, "No connection to the server. Check the internet and try again."],
  ]) {
    state.season = { loading: false, ...seasonState };
    view.innerHTML = guestHomeMarkup({ season: state.season, data: state.data });
    assert.equal(view.querySelector(".g-guest__table .g-guest__note").textContent, text);
    assert.ok(view.querySelector(".g-guest__more"));
  }
});

test("the season is read when the page opens and the box drawn again when it comes; a guest who left is not redrawn", async () => {
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.reply("GET /api/season", 200, season(SIX));
  renderGuestHome();
  assert.ok(view.querySelector(".g-guest__table .g-guest__note"), "loading line");
  await turns();
  assert.equal(view.querySelectorAll(".g-guest__table .g-ranked").length, 5);
});

test("no link on a guest's page is one the router sends on; the same page in Russian", () => {
  renderGuestHome();
  assertNotSentOn(hrefsIn(view), { as: ["guest"] });
  useLocale("ru");
  renderGuestHome();
  assert.equal(view.querySelector("h1").textContent, "Лига тренеров Blood Bowl Sevens");
  useLocale("en");
  assert.ok(readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").includes('@import url("screens/home/guest.css");'));
  assertDictionaryCovers("src/screens/home/guest.mjs");
});

// What the brief leaves to the screen.

test("the page says what it waits for: a season on its way is a loading line, one that did not come is its error, then the empty line", async () => {
  state.season = { data: null, loaded: false, loading: false, error: "" };
  const gate = api.hold("GET /api/season");
  renderGuestHome();
  assert.equal(view.querySelector(".g-guest__note").textContent, "Loading season...", "the line is there from the first draw, not an empty box");
  api.reply("GET /api/season", 200, season([]));
  gate.release();
  await turns();
  assert.equal(view.querySelector(".g-guest__note").textContent, "The table fills in once coaches enter the season.");
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.fail("GET /api/season");
  renderGuestHome();
  await turns();
  assert.equal(view.querySelector(".g-guest__note").textContent, "No connection to the server. Check the internet and try again.", "an error is drawn when it comes");
  assert.ok(view.querySelector(".g-guest__more"));
  assert.equal(view.querySelector(".g-guest__table .g-ranked"), null);
});

test("a visit after a failed one starts with the loading line, not the old error", async () => {
  state.season = { data: null, loaded: false, loading: false, error: "No connection to the server. Check the internet and try again." };
  const gate = api.hold("GET /api/season");
  api.reply("GET /api/season", 200, season(SIX));
  renderGuestHome();
  assert.equal(view.querySelector(".g-guest__note").textContent, "Loading season...");
  gate.release();
  await turns();
  assert.equal(view.querySelectorAll(".g-guest__table .g-ranked").length, 5);
});

test("the page opens at its top, whatever screen it comes from; the season arriving and a language switch keep the coach where they are", async () => {
  await withWindow({}, async ({ scrolls, scrollPage }) => {
    state.season = { data: null, loaded: false, loading: false, error: "" };
    api.reply("GET /api/season", 200, season(SIX));
    view.innerHTML = "<p>the reference, scrolled down</p>";
    scrollPage(900);
    renderGuestHome();
    assert.equal(view.querySelector(".g-guest").getAttribute("data-screen"), "guest");
    assert.deepEqual(scrolls, [[0, 0]], "a tap on the logo or Back from the reference: a fresh page");
    scrollPage(260);
    scrolls.length = 0;
    await turns();
    assert.equal(view.querySelectorAll(".g-guest__table .g-ranked").length, 5, "the season did come");
    useLocale("ru");
    renderGuestHome();
    assert.deepEqual(scrolls, []);
    assert.equal(globalThis.scrollY, 260);
    useLocale("en");
  });
});

test("a guest who has gone on is not redrawn by a season that comes after", async () => {
  state.season = { data: null, loaded: false, loading: false, error: "" };
  const gate = api.hold("GET /api/season");
  api.reply("GET /api/season", 200, season(SIX));
  renderGuestHome();
  releaseCurrentScreen(); // the router moves to another screen
  view.innerHTML = '<p id="elsewhere">Somewhere else</p>';
  gate.release();
  await turns();
  assert.equal(view.querySelector("#elsewhere").textContent, "Somewhere else");
  assert.equal(view.querySelector(".g-guest"), null);
  assert.equal(api.calls.filter((call) => call.key === "GET /api/season").length, 1);
});

test("a season that is already read is not asked for again", async () => {
  renderGuestHome();
  await turns();
  assert.equal(api.calls.length, 0);
  assert.equal(view.querySelectorAll(".g-guest__table .g-ranked").length, 5);
});

test("the server's answer to a guest may be empty: the page still opens, with the league's name and no round", async () => {
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.reply("GET /api/season", 200, {});
  renderGuestHome();
  await turns();
  assert.equal(view.querySelector("h1").textContent, "A league for Blood Bowl Sevens coaches");
  assert.equal(view.querySelector(".g-guest__table h2").textContent, "Table");
  assert.equal(view.querySelector(".g-guest__table .g-guest__note").textContent, "The table fills in once coaches enter the season.");
  assert.deepEqual(view.querySelectorAll(".g-pagehead p").map((p) => p.textContent), ["Gata League"]);
});

test("the band over a desktop's page names the league and the season, and the round when a round is played", () => {
  const head = (seasonData) => guestHomeMarkup({ season: loaded(seasonData), data: state.data });
  view.innerHTML = head(season(SIX, [{ roundNumber: 3, status: "completed" }]));
  assert.deepEqual(view.querySelectorAll(".g-pagehead p").map((p) => p.textContent), ["Gata League", "Season 2 · after round 3"]);
  view.innerHTML = head(season(SIX));
  assert.deepEqual(view.querySelectorAll(".g-pagehead p").map((p) => p.textContent), ["Gata League", "Season 2"]);
  assert.equal(view.querySelector(".g-guest__table h2").textContent, "Table");
  const hostile = { ...season(SIX), season: { name: HOSTILE } };
  view.innerHTML = head(hostile);
  assert.equal(view.querySelectorAll(".g-pagehead p")[1].textContent, HOSTILE);
  assert.equal(view.querySelector("img"), null);
});

test("a place is the server's rank as it is, gaps and all", () => {
  const table = guestTable(season([row(3, "Third", "teams/human"), row(1, "First", "teams/human"), row(4, "Fourth", "teams/human", { withdrawnAt: "x" }), row(7, "Seventh", "teams/human")]), state.data, 2);
  assert.deepEqual(table.rows.map((r) => [r.rank, r.name, r.points]), [[1, "First", 19], [3, "Third", 17]]);
  state.season = loaded(season([row(2, "Second", "teams/human"), row(5, "Fifth", "teams/human")]));
  renderGuestHome();
  assert.deepEqual(view.querySelectorAll(".g-guest__rank").map((r) => r.textContent), ["2", "5"]);
});

test("a table without an answer, a race the vault does not know and a round not yet played are all plain", () => {
  assert.deepEqual(guestTable(undefined, state.data), { round: null, rows: [] });
  assert.deepEqual(guestTable({}, state.data), { round: null, rows: [] });
  assert.deepEqual(guestTable(season([row(1, "Nobody", "teams/nonesuch")]), null).rows, [{ rank: 1, name: "Nobody", race: "", points: 19 }]);
  assert.equal(guestTable(season(SIX, [{ roundNumber: 1, status: "started" }]), state.data).round, null);
  assert.equal(guestTable(season(SIX, [{ roundNumber: 4, status: "completed" }, { roundNumber: 2, status: "completed" }]), state.data).round, 4);
});

test("the reference tiles lead to pages that exist in both languages", () => {
  for (const locale of ["en", "ru"]) {
    const data = referenceData(locale);
    assert.ok(data.pages.some((page) => page.slug === "all-gata-changes"), `${locale}: the Gata changes page`);
    assert.ok(data.pages.some((page) => page.slug === "teams/human"), `${locale}: the team rules the races come from`);
  }
});

test("the Skills tile is named as the list it opens, in both languages", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    renderGuestHome();
    const tile = view.querySelectorAll(".g-guest__tile").find((a) => a.getAttribute("href") === "#/ref/skills");
    assert.equal(tile.querySelector(".g-guest__tile-title").textContent, sectionTitle("skills"), locale);
  }
  useLocale("en");
});

// Stage 13 (decision 9): one band. The page's h1 is the hero's, so the band names the league with a paragraph.
test("the guest's band is the page head, a desk's alone", () => {
  view.innerHTML = guestHomeMarkup({ season: loaded(season(SIX, [{ roundNumber: 3, status: "completed" }])), data: state.data });
  const head = view.querySelector(".g-guest header.g-pagehead");
  assert.ok(head);
  assert.equal(head.classList.contains("g-pagehead--phone"), false);
  assert.equal(head.querySelector("p.g-pagehead__title").textContent, "Gata League");
  assert.equal(head.querySelector(".g-pagehead__sub").textContent, "Season 2 · after round 3");
  assert.equal(head.querySelector("h1"), null);
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["A league for Blood Bowl Sevens coaches"]);
  assert.ok(view.querySelector(".g-guest__hero h1"));
  assertStyled(head, "page-head.css");
  // A phone's header already names the league and the season: the band is not drawn there, for a screen reader either.
  assert.deepEqual(inMedia(SHEET, "max-width: 900px", ".g-guest > .g-pagehead", "display"), ["none"]);
  assert.doesNotMatch(read(SHEET), /g-guest__(?:head|brand|season)/, "the guest's own band is gone");
});

test("the whole page is in the language of the visitor", () => {
  useLocale("ru");
  renderGuestHome();
  assert.equal(view.querySelector(".g-guest__table h2").textContent, "Таблица");
  assert.equal(view.querySelector(".g-guest__more").textContent, "Вся таблица и календарь");
  assert.deepEqual(view.querySelectorAll(".g-guest__hero a").map((a) => a.textContent), ["Войти", "Регистрация"]);
  assert.deepEqual(view.querySelectorAll(".g-guest__tile-title").map((b) => b.textContent), ["Правила команд", "Skills", "Перед матчем", "Изменения Gata"]);
  state.season = loaded(season(SIX, [{ roundNumber: 6, status: "completed" }]));
  renderGuestHome();
  assert.equal(view.querySelector(".g-guest__table h2").textContent, "Таблица · после 6 тура");
  assert.equal(view.querySelectorAll(".g-pagehead p")[1].textContent, "Season 2 · после 6 тура");
});

// The sheet.

test("the sheet sets its own font, border and case; a phone has a column, a desktop the band, the dark ribbon and the cards side by side", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-guest__lead", "font"), ["700 30px/1.05 var(--font-display)", "700 44px/1.05 var(--font-display)"]);
  assert.ok(valuesOf(SHEET, ".g-guest__lead", "text-transform").every((value) => value === "none"));
  assert.deepEqual(valuesOf(SHEET, ".g-guest__actions", "grid-template-columns"), ["1fr 1fr"]);
  assert.deepEqual(valuesOf(SHEET, ".g-guest__grid", "grid-template-columns"), ["repeat(auto-fit, minmax(360px, 1fr))"]);
  assert.deepEqual(valuesOf(SHEET, ".g-guest__tiles", "grid-template-columns"), ["1fr 1fr"]);
  assert.deepEqual(valuesOf(SHEET, ".g-guest__card", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-guest__card", "border-radius"), ["var(--radius-2xl)"]);
  const bare = read(SHEET).replace(/\/\*[\s\S]*?\*\//g, "");
  const wide = bare.match(/@media\s*\(min-width: 901px\)\s*\{([\s\S]*)\n\}/)[1];
  assert.match(wide, /\.g-guest__hero\s*\{[^}]*background:\s*var\(--header\);[^}]*color:\s*var\(--header-ink\);/);
  assert.match(wide, /\.g-guest__hero \.g-btn--primary\s*\{[^}]*background:\s*var\(--header-ink\);[^}]*color:\s*var\(--header\);/);
  assert.match(wide, /\.g-guest__hero \.g-btn:not\(\.g-btn--primary\)\s*\{[^}]*border-color:\s*var\(--header-ink\);/);
  for (const selector of [".g-guest__actions .g-btn", ".g-guest__tile"]) {
    const heights = valuesOf(SHEET, selector, "min-height");
    assert.ok(heights.length && heights.every((value) => Number.parseInt(value, 10) >= 44), `${selector} is a target of 44px or more`);
  }
  assert.deepEqual(valuesOf(SHEET, ".g-guest__actions .g-btn", "min-height"), ["48px"]);
});

test("every colour of the page holds on what it sits on, in every palette", () => {
  const [leadOnPage, leadOnRibbon] = valuesOf(SHEET, ".g-guest__lead", "color");
  assertContrast(leadOnPage, ["--page"], 4.5, { what: "the lead on the page" });
  assertContrast(leadOnRibbon, ["--header"], 4.5, { what: "the lead on the ribbon" });
  assertReadable(SHEET, ".g-guest__text", "color", ["--page"], 4.5);
  assertReadable(SHEET, ".g-guest__title", "color", ["--surface"], 4.5);
  assertReadable(SHEET, ".g-guest__rank", "color", ["--surface"], 4.5);
  assertReadable(SHEET, ".g-guest__note", "color", ["--surface"], 4.5);
  assertReadable(SHEET, ".g-guest__more", "color", ["--surface"], 4.5);
  assertReadable(SHEET, ".g-guest__tile", "color", ["--surface"], 4.5);
  assertReadable(SHEET, ".g-guest__tile-text", "color", ["--surface"], 4.5);
  // The ribbon: the lead and the text in the header's ink on its colour, the filled button turned over.
  assertContrast("--header-ink", ["--header"], 4.5, { what: "the ribbon's ink on --header" });
  assertContrast("--header", ["--header-ink", "--header-muted"], 4.5, { what: "the ribbon's primary button, at rest and under the pointer" });
  assertReadable(SHEET, ".g-guest__hero .g-guest__text", "color", ["--header"], 4.5);
});

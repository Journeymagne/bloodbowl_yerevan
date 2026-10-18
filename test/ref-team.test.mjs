import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale } from "./helpers/ref-screen.mjs";

// The fake API comes first: api-client.mjs picks `fetch` up when it loads.
const api = installFakeApi();
const view = mountView();
const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
const { leagueTeamsOf, specialRuleSections, specialRuleText, teamRulesMarkup } = await import("../src/screens/ref/team.mjs");
const { teamLeagueOptions, teamSpecialRuleTokens } = await import("../src/domain/roster/team-rules.mjs");
const { setMyTeams } = await import("../src/data/teams.mjs");
const { setRefQuery, refQuery } = await import("../src/screens/ref/memory.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const draw = (markup) => parseHtml(document, markup);
const turns = async (count = 20) => { for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };
const type = (value) => { const input = view.querySelector("#ref-query"); input.value = value; fireEvent(input, "input"); };

const pageOf = (slug) => state.data.pages.find((page) => page.slug === slug);
const human = () => pageOf("teams/human");
const specialRulesPage = () => state.data.pages.find((page) => page.id === "general-information-special-rules");
const row = (rank, team, extra = {}) => ({ rank, points: 9 - rank, withdrawnAt: null, user: { id: `u${rank}`, login: `c${rank}` }, team, ...extra });
const STANDINGS = [
  row(1, { id: "a", name: "Ashgrove Wardens", baseTeamSlug: "teams/human" }),
  row(2, { id: "b", name: HOSTILE, baseTeamSlug: "teams/human" }),
  row(3, { id: "c", name: "Gone", baseTeamSlug: "teams/human" }, { withdrawnAt: "2026-10-01" }),
  row(4, { id: "d", name: "Karak", baseTeamSlug: "teams/dwarf" }),
];
const GUEST = { signedIn: false, teamIds: new Set() };
const COACH = { signedIn: true, teamIds: new Set(["a"]) };
const freshSeason = () => { state.season = { data: null, loaded: false, loading: false, error: "" }; };

// Every screen starts as a visitor finds it on arrival: English, a guest, no team, a season nobody has read.
beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  setRefQuery("");
  state.auth.currentUser = null;
  state.myTeams.items = [];
  freshSeason();
  api.reset();
});

test("a team's rules: tier, re-rolls, apothecary and league access, from the vault's lines", () => {
  const fragment = draw(teamRulesMarkup({ data: state.data, page: human() }));
  const value = (label) => fragment.querySelectorAll(".g-kv").find((kv) => kv.querySelector(".g-kv__label").textContent === label).querySelector(".g-kv__value").textContent;
  assert.equal(value("Tier"), human().team.meta.league);
  assert.equal(value("Rerolls"), human().team.meta.rerolls);
  assert.equal(value("League access"), teamLeagueOptions(human()).join(", "));
});

test("every position: quantity, cost, characteristics, skills and access — cards on a phone, a table on a desktop", () => {
  const fragment = draw(teamRulesMarkup({ data: state.data, page: human() }));
  assert.equal(fragment.querySelectorAll(".g-ref-position").length, human().team.roster.length);
  const ogre = fragment.querySelectorAll(".g-ref-position").at(-1);
  assert.match(ogre.textContent, /140K/);
  assert.ok(ogre.querySelector('a[href="#/traits/bonehead"]'), "Bone Head finds Bonehead");
  assert.equal(fragment.querySelectorAll(".g-ref-roster tbody tr").length, human().team.roster.length);
  assert.ok(fragment.querySelector(".g-ref-roster td.fit-cell.number-cell"));
});

test("every special rule of every team finds its text on the Special Rules page, in both vaults", () => {
  for (const locale of ["en", "ru"]) {
    const data = referenceData(locale);
    const sections = specialRuleSections(data.pages.find((page) => page.id === "general-information-special-rules"));
    for (const team of data.teams) for (const rule of teamSpecialRuleTokens(team)) assert.ok(specialRuleText(sections, rule), `${locale}: ${team.title} ${rule}`);
  }
});

test("the league's teams of the race, by place, without the withdrawn; links for a coach, names alone for a guest, text either way", () => {
  assert.deepEqual(leagueTeamsOf(STANDINGS, "teams/human").map((s) => s.team.id), ["a", "b"]);
  const coach = draw(teamRulesMarkup({ data: state.data, page: human(), standings: STANDINGS, viewer: { signedIn: true, teamIds: new Set(["a"]) } }));
  assert.deepEqual(coach.querySelectorAll(".g-ref-inleague a").map((a) => a.getAttribute("href")), ["#/t/a", "#/coaches/u2/teams/b"]);
  assert.equal(coach.querySelector("img"), null);
  const guest = draw(teamRulesMarkup({ data: state.data, page: human(), standings: STANDINGS }));
  assert.equal(guest.querySelectorAll(".g-ref-inleague a").length, 0);
  assert.equal(guest.querySelectorAll(".g-ref-inleague .g-ranked").length, 2);
  assert.equal(draw(teamRulesMarkup({ data: state.data, page: human() })).querySelector(".g-ref-inleague"), null);
});

test("the season is read once when the page opens, the block appears when it comes, and a page left first is not redrawn", async () => {
  freshSeason();
  api.reply("GET /api/season", 200, { standings: STANDINGS });
  renderReferencePage("teams/human");
  assert.equal(view.querySelector(".g-ref-inleague"), null);
  await turns();
  assert.equal(view.querySelectorAll(".g-ref-inleague .g-ranked").length, 2, "a guest: names without links");
  assert.equal(api.calls.filter((call) => call.key === "GET /api/season").length, 1);
});

test("a season that does not come leaves the rules whole", async () => {
  freshSeason();
  api.fail("GET /api/season");
  renderReferencePage("teams/human");
  await turns();
  assert.equal(view.querySelector("h1").textContent, "Human");
  assert.equal(view.querySelector(".g-ref-inleague"), null);
  assertDictionaryCovers("src/screens/ref/team.mjs");
});

// What the brief leaves to the screen.

test("the special rules page is cut at its h3 lines: each rule's text under its own name, the intro left out", () => {
  const sections = specialRuleSections(specialRulesPage());
  assert.deepEqual([...sections.values()].map((section) => section.title), [
    "Brawlin' Brutes", "Bribery and Corruption", "Favoured of...", "Architect of Fate", "Explosive Demise",
    "Low Cost Linemen", "Masters of Undeath", "Passing Virtuosos", "Swarming", "Team Captain",
  ]);
  const swarming = sections.get("swarming");
  assert.match(swarming.html, /^<p>/, "the text, with no heading of its own");
  assert.ok(!swarming.html.includes("<h3"), "and none of the next rule's");
  assert.ok(!sections.get("teamcaptain").html.includes("This page lists"), "the page's intro belongs to no rule");
  for (const section of sections.values()) draw(section.html);
});

test("a rule is found under its own name, however the team spells it; Favoured of X is the Favoured of... text", () => {
  const sections = specialRuleSections(specialRulesPage());
  assert.equal(specialRuleText(sections, "Brawlin' Brutes").title, "Brawlin' Brutes");
  assert.equal(specialRuleText(sections, "Brawling Brutes").title, "Brawlin' Brutes", "the vault spells it both ways");
  assert.equal(specialRuleText(sections, "Favoured of Khorne"), sections.get("favouredof"));
  assert.equal(specialRuleText(sections, "Favoured of..."), sections.get("favouredof"));
  assert.equal(specialRuleText(sections, "No Such Rule"), null);
  assert.equal(specialRuleText(new Map(), "Swarming"), null);
  assert.equal(specialRuleSections(null).size, 0, "a vault with no Special Rules page has no sections");
});

test("a team's special rules are a section each, in the team's order, with the text of the page; Team Captain is everyone's", () => {
  const khorne = pageOf("teams/khorne");
  const sections = specialRuleSections(specialRulesPage());
  const fragment = draw(teamRulesMarkup({ data: state.data, page: khorne }));
  const rules = fragment.querySelectorAll("section.g-prose");
  assert.deepEqual(rules.map((section) => section.querySelector("h3").textContent), teamSpecialRuleTokens(khorne));
  assert.ok(rules.some((section) => section.querySelector("h3").textContent === "Favoured of Khorne"));
  assert.equal(rules.at(-1).querySelector("h3").textContent, "Team Captain");
  assert.equal(rules.at(-1).querySelectorAll("p").length, draw(sections.get("teamcaptain").html).querySelectorAll("p").length);
  assert.deepEqual(draw(teamRulesMarkup({ data: state.data, page: human() })).querySelectorAll("section.g-prose h3").map((h) => h.textContent), ["Team Captain"]);
});

test("a rule whose text the vault does not have is still named", () => {
  const fragment = draw(teamRulesMarkup({ data: { pages: [] }, page: pageOf("teams/khorne") }));
  assert.deepEqual(fragment.querySelectorAll("section.g-prose h3").map((h) => h.textContent), teamSpecialRuleTokens(pageOf("teams/khorne")));
});

test("the table's columns, in the brief's order, with the vault's classes; a card has the five characteristics and the access", () => {
  const fragment = draw(teamRulesMarkup({ data: state.data, page: human() }));
  assert.deepEqual(fragment.querySelectorAll(".g-ref-roster th").map((th) => th.textContent), ["Position", "Qty", "Cost", "MA", "ST", "AG", "PA", "AR", "Skills", "Access"]);
  const ogre = fragment.querySelectorAll(".g-ref-roster tbody tr").at(-1);
  assert.deepEqual(ogre.querySelectorAll("td").map((td) => td.textContent).slice(0, 8), ["Ogre", "0-1", "140K", "5", "5", "4+", "5+", "10+"]);
  assert.equal(ogre.querySelectorAll("td")[1].getAttribute("class"), "fit-cell center-cell");
  assert.equal(ogre.querySelectorAll("td")[2].getAttribute("class"), "fit-cell number-cell");
  assert.equal(ogre.querySelectorAll("td").at(-1).textContent, "S / A G");
  const card = fragment.querySelectorAll(".g-ref-position").at(-1);
  assert.deepEqual(card.querySelectorAll(".g-stat__v").map((v) => v.textContent), ["5", "5", "4+", "5+", "10+"]);
  assert.match(card.querySelector(".g-ref-position__caption").textContent, /^0-1 · skills S \/ A G$/);
  assert.equal(card.querySelector(".g-ref-position__name").textContent, "Ogre");
  assert.deepEqual(card.querySelectorAll("a").map((a) => a.getAttribute("href")), ["#/traits/bonehead", "#/skills/thick-skull", "#/skills/mighty-blow", "#/traits/loner-x", "#/traits/throw-team-mate"]);
  assert.equal(card.querySelector(".g-ref-position__skills").textContent, "Bone Head, Thick Skull, Mighty Blow, Loner (3+), Throw Team-mate");
});

test("a position with no skills has no skills line; a skill with no page is text; access with no letters is a dash", () => {
  const stub = { id: "x", title: "Stub", kind: "team", team: { meta: {}, roster: [
    { qty: "0-16", position: "Lineman", ma: "6", st: "3", ag: "3+", pa: "-", ar: "9+", skills: [], primary: ["G"], secondary: ["-"], price: "50K" },
    { qty: "0-1", position: "Odd", ma: "5", st: "3", ag: "3+", pa: "4+", ar: "9+", skills: ["Nonesuch", "Block"], primary: ["GASP"], secondary: [], price: "70K" },
  ] } };
  const fragment = draw(teamRulesMarkup({ data: state.data, page: stub }));
  const [lineman, odd] = fragment.querySelectorAll(".g-ref-position");
  assert.equal(lineman.querySelector(".g-ref-position__skills"), null);
  assert.match(lineman.querySelector(".g-ref-position__caption").textContent, /skills G \/ -$/);
  assert.equal(odd.querySelector(".g-ref-position__skills").textContent, "Nonesuch, Block");
  assert.deepEqual(odd.querySelectorAll("a").map((a) => a.getAttribute("href")), ["#/skills/block"]);
  assert.match(odd.querySelector(".g-ref-position__caption").textContent, /skills G A S P \/ -$/, "the letters of one word are read one by one");
  assert.equal(fragment.querySelectorAll(".g-kv").length, 4, "a team with no facts still has its four lines");
});

test("a team name a coach typed is text on the league's list; the place is the server's, gaps and all; the withdrawn are left out", () => {
  const guest = draw(teamRulesMarkup({ data: state.data, page: human(), standings: STANDINGS }));
  assert.deepEqual(guest.querySelectorAll(".g-ref-inleague .g-ranked__title").map((title) => title.textContent), ["Ashgrove Wardens", HOSTILE]);
  assert.deepEqual(guest.querySelectorAll(".g-ref-inleague .g-ranked__caption").map((caption) => caption.textContent), ["#1 · 8 pts", "#2 · 7 pts"]);
  assert.equal(guest.querySelector("img"), null);
  assertCspSafe(guest);
  const gap = [row(1, { id: "a", name: "First", baseTeamSlug: "teams/human" }), row(3, { id: "e", name: "Third", baseTeamSlug: "teams/human" })];
  const drawn = draw(teamRulesMarkup({ data: state.data, page: human(), standings: gap, viewer: COACH }));
  assert.deepEqual(drawn.querySelectorAll(".g-ref-inleague .g-list-row__desc").map((desc) => desc.textContent), ["#1 · 8 pts", "#3 · 6 pts"]);
  assert.ok(!drawn.textContent.includes("Gone"));
});

test("the league's block is a heading over its rows, and only the races' own teams are in it", () => {
  const fragment = draw(teamRulesMarkup({ data: state.data, page: pageOf("teams/dwarf"), standings: STANDINGS, viewer: COACH }));
  assert.deepEqual(fragment.querySelectorAll(".g-ref-inleague a").map((a) => a.getAttribute("href")), ["#/coaches/u4/teams/d"]);
  assert.equal(fragment.querySelector(".g-ref-inleague h2").textContent, "Playing in the league");
  assert.equal(draw(teamRulesMarkup({ data: state.data, page: pageOf("teams/ogre"), standings: STANDINGS, viewer: COACH })).querySelector(".g-ref-inleague"), null, "a race nobody plays has no block");
  assert.deepEqual(leagueTeamsOf([...STANDINGS].reverse(), "teams/human").map((entry) => entry.team.id), ["a", "b"], "by place, whatever order the server sent");
  assert.deepEqual(leagueTeamsOf(undefined, "teams/human"), []);
  assert.deepEqual(leagueTeamsOf([{ rank: 1 }], "teams/human"), [], "a row with no team is nobody's");
});

test("the article is the page's own: its title, its kicker and the way up, the vault's roster table is not drawn twice", () => {
  renderReferencePage("teams/human");
  assert.equal(view.querySelector(".g-article__kicker").textContent, "Teams · Team's Rules");
  assert.equal(view.querySelector(".g-ref-back").getAttribute("href"), "#/ref/teams");
  assert.equal(view.querySelectorAll("table").length, 1, "the roster table, once");
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]').getAttribute("href"), "#/ref/teams");
  assertCspSafe(view);
  assertNotSentOn(hrefsIn(view));
});

test("every team of both vaults draws, with its roster, its rules and the dictionary's words, and nothing the CSP refuses", () => {
  state.season = { data: { standings: [] }, loaded: true, loading: false, error: "" };
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    for (const page of state.data.pages.filter((item) => item.kind === "team")) {
      renderReferencePage(page.slug);
      assert.equal(view.querySelectorAll(".g-ref-position").length, page.team.roster.length, `${locale}: ${page.slug}`);
      assert.equal(view.querySelectorAll(".g-ref-roster tbody tr").length, page.team.roster.length, `${locale}: ${page.slug}`);
      assert.ok(view.querySelectorAll("section.g-prose").length >= 1, `${locale}: ${page.slug} names Team Captain at least`);
      assertCspSafe(view);
    }
  }
  assert.equal(api.calls.length, 0, "a season that is read is not asked for again");
});

test("in Russian: the lines, the headings and the place are in Russian; the rules keep the vault's names", () => {
  useLocale("ru");
  state.season = { data: { standings: STANDINGS }, loaded: true, loading: false, error: "" };
  renderReferencePage("teams/human");
  assert.deepEqual(view.querySelectorAll(".g-kv__label").map((label) => label.textContent), ["Уровень", "Рероллы", "Апотекарий", "Доступ к лигам"]);
  assert.deepEqual(view.querySelectorAll(".g-ref-team h2").map((h2) => h2.textContent), ["Состав", "Особые правила", "В лиге играют"]);
  assert.deepEqual(view.querySelectorAll(".g-ref-roster th").map((th) => th.textContent), ["Позиция", "Кол-во", "Стоимость", "MA", "ST", "AG", "PA", "AR", "Навыки", "Кат."], "every column, as in English: the five characteristics from stats.ma to stats.ar too");
  assert.match(view.querySelector(".g-ref-position__caption").textContent, /^0-16 · навыки G \/ A S D$/);
  assert.equal(view.querySelector(".g-ranked__caption").textContent, "1-е место · очков: 8");
});

test("the season arrives into the page that is up: one search, one pager, a coach's own team a link to itself", async () => {
  state.auth.currentUser = { id: "u1", login: "c1" };
  state.myTeams.items = [{ id: "a" }];
  api.reply("GET /api/season", 200, { standings: STANDINGS });
  renderReferencePage("teams/human");
  await turns();
  assert.deepEqual(hrefsIn(view.querySelector(".g-ref-inleague")), ["#/t/a", "#/coaches/u2/teams/b"]);
  assert.equal(view.listeners.get("input").length, 1, "one listener for the band, however often the page was drawn");
  assert.equal(view.listeners.get("click").length, 1, "and one for the pager");
  globalThis.location = { hash: "#/teams/human" };
  type("dodge");
  assert.equal(refQuery(), "dodge", "the band still hears its field after the redraw");
  assert.equal(view.querySelector(".g-ref-inleague a").textContent.includes("Ashgrove Wardens"), true);
});

test("a coach's list that comes after the page was drawn turns their team from a rival's page into their own, in the same page; a page left first is not drawn into", () => {
  state.auth.currentUser = { id: "u1", login: "c1" };
  state.season = { data: { standings: STANDINGS }, loaded: true, loading: false, error: "" };
  renderReferencePage("teams/human");
  assert.deepEqual(hrefsIn(view.querySelector(".g-ref-inleague")), ["#/coaches/u1/teams/a", "#/coaches/u2/teams/b"], "opened before the list was read, their team is taken for a rival's");
  setMyTeams([{ id: "a" }]);
  assert.deepEqual(hrefsIn(view.querySelector(".g-ref-inleague")), ["#/t/a", "#/coaches/u2/teams/b"]);
  assert.equal(view.listeners.get("input").length, 1, "one listener for the band, however often the page was drawn");
  assert.equal(view.listeners.get("click").length, 1, "and one for the pager");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  setMyTeams([]);
  assert.equal(view.textContent, "elsewhere");
});

test("a season already read is drawn at once, and the server is not asked", async () => {
  state.season = { data: { standings: STANDINGS }, loaded: true, loading: false, error: "" };
  renderReferencePage("teams/human");
  assert.equal(view.querySelectorAll(".g-ref-inleague .g-ranked").length, 2);
  await turns();
  assert.equal(api.calls.length, 0);
});

test("a visitor who has left is not drawn into: the season that comes late goes nowhere", async () => {
  const gate = api.hold("GET /api/season");
  renderReferencePage("teams/human");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  gate.release({ status: 200, body: { standings: STANDINGS } });
  await turns();
  assert.equal(view.textContent, "elsewhere");
});

// The sheet.

test("a team's rules have a sheet of their own, read after the article's, and the article's holds none of their classes", () => {
  const styles = read("src/styles.css");
  assert.ok(styles.includes('@import url("screens/ref/team.css");'));
  assert.ok(styles.indexOf("screens/ref/team.css") > styles.indexOf("screens/ref/article.css"), "the roster's full width is decided after the article's line width");
  assert.ok(!/\.g-ref-(team|position|roster|rule|inleague)/.test(read("src/screens/ref/article.css")));
});

const SHEET = "src/screens/ref/team.css";

test("the markup a team draws is styled by its own sheet, the article's (the skill links), the prose's and the list rows'", () => {
  const coach = draw(teamRulesMarkup({ data: state.data, page: pageOf("teams/khorne"), standings: [row(1, { id: "k", name: "Skull", baseTeamSlug: "teams/khorne" })], viewer: COACH }));
  assertStyled(coach, SHEET, "src/screens/ref/article.css", "src/screens/ref/prose.css", "list-row.css", "stat-strip.css");
  const guest = draw(teamRulesMarkup({ data: state.data, page: pageOf("teams/khorne"), standings: [row(1, { id: "k", name: "Skull", baseTeamSlug: "teams/khorne" })], viewer: GUEST }));
  assertStyled(guest, SHEET, "src/screens/ref/article.css", "src/screens/ref/prose.css", "list-row.css", "stat-strip.css");
});

test("a phone has the cards and a desktop the table; the table is not cut to the prose's width", () => {
  const bare = read(SHEET).replace(/\/\*[\s\S]*?\*\//g, "");
  const wide = bare.match(/@media\s*\(min-width: 901px\)\s*\{([\s\S]*)\n\}/)[1];
  const narrow = bare.match(/@media\s*\(max-width: 900px\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.match(narrow, /\.g-ref-roster\s*\{[^}]*display:\s*none;/);
  assert.match(wide, /\.g-ref-positions\s*\{[^}]*display:\s*none;/);
  assert.match(wide, /\.g-article \.g-ref-roster\s*\{[^}]*max-width:\s*none;/);
  const outside = bare.replace(/@media\s*\(max-width: 900px\)\s*\{[\s\S]*?\n\}/, "");
  assert.ok(!/\.g-ref-roster\s*[,{][^}]*display:/.test(outside), "nothing outside the phone's rule hides the table");
});

test("a card's cost is the accent, its caption quiet, its skills in the text colour; each is readable on the page and on the card", () => {
  for (const [selector, property] of [[".g-ref-position__cost", "color"], [".g-ref-position__caption", "color"], [".g-ref-position__skills", "color"], [".g-ref-position__name", "color"], [".g-ref-team h2", "color"]]) {
    assert.ok(valuesOf(SHEET, selector, property).length, `${selector} sets its ${property}`);
    assertReadable(SHEET, selector, property, ["--surface", "--page"], 4.5);
  }
  assertReadable(SHEET, ".g-ref-rule h3", "color", ["--surface", "--page"], 4.5);
  assertReadable(SHEET, ".g-ref-roster td.number-cell", "color", ["--surface", "--page"], 4.5);
});

test("a card sets its own font, border and case, and nothing in it is below the touch size where it is a target", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-position__name", "font"), ["700 17px/1.25 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-position__cost", "font"), ["700 22px/1.1 var(--font-display)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-position", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-position", "list-style"), ["none"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-team h2", "text-transform"), ["none"]);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertReadable, tokensOf, valuesOf } from "./helpers/contrast.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { ROUTE_NAMES } from "../src/core/routes.mjs";
import { shellModel } from "../src/shell/navigation.mjs";
import { renderAppHeader } from "../src/shell/app-header.mjs";
import { renderLanguageSwitch, renderSideNav, renderSiteFooter } from "../src/shell/side-nav.mjs";

const coach = (team = { id: "t1", name: "Ashgrove Wardens" }) => shellModel({ route: { name: "teamRoster", params: {} }, user: { id: "u1", isAdmin: false }, team, raceTitle: "Human", place: 2 });
const guest = shellModel({ route: { name: "season", params: {} }, user: null });
const HEADER = ["src/shell/app-header.css", "src/shell/crest.css"];
const SIDE = ["src/shell/side-nav.css", "src/shell/crest.css"];

test("the mobile header: crest, the team with its switch hint, the subtitle, tabs with one current", () => {
  const fragment = mount(renderAppHeader(coach()));
  const team = fragment.querySelector("a.g-appbar__team");
  assert.equal(team.getAttribute("href"), "#/teams");
  assert.ok(team.querySelector("svg.g-crest"));
  assert.match(team.querySelector(".g-appbar__name").textContent, /^Ashgrove Wardens/);
  assert.equal(team.querySelector(".g-sr-only").textContent, "Switch team");
  assert.equal(fragment.querySelector(".g-appbar__sub").textContent, "Human · #2 in the league");
  assert.equal(fragment.querySelector("nav.g-tabs").getAttribute("aria-label"), "Sections");
  assert.deepEqual(fragment.querySelectorAll('.g-tab[aria-current="page"]').map((tab) => tab.textContent), ["Roster"]);
  assertCspSafe(fragment);
  assertStyled(fragment, ...HEADER);
});

test("a team name a coach typed is text, not markup", () => {
  const fragment = mount(renderAppHeader(coach({ id: "t1", name: HOSTILE })) + renderSideNav(coach({ id: "t1", name: HOSTILE }), { locale: "en" }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-appbar__label").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-sidenav__name").textContent, HOSTILE);
});

test("the SideNav: team block, items with icons, language and the footer line", () => {
  const fragment = mount(renderSideNav(coach(), { locale: "en", generatedAt: "2026-10-07T10:00:00Z" }));
  assert.equal(fragment.querySelector("a.g-sidenav__team").getAttribute("href"), "#/teams");
  const links = fragment.querySelectorAll(".g-sidenav__link");
  assert.deepEqual(links.map((link) => link.getAttribute("href")), ["#/t/t1", "#/t/t1/roster", "#/season", "#/ref", "#/settings"]);
  assert.ok(links.every((link) => link.querySelector("svg.g-icon")));
  assert.equal(fragment.querySelector('.g-sidenav__link[aria-current="page"]').getAttribute("href"), "#/t/t1/roster");
  assert.ok(fragment.querySelector('.g-site-footer a[href="#/legal"]'));
  assertCspSafe(fragment);
  assertStyled(fragment, ...SIDE, "button.css");
});

test("the language switch says which language is on", () => {
  const fragment = mount(renderLanguageSwitch("ru"));
  assert.equal(fragment.querySelector('[role="group"]').getAttribute("aria-label"), "Language");
  assert.deepEqual(fragment.querySelectorAll("[data-locale-switch]").map((button) => [button.getAttribute("data-locale-switch"), button.getAttribute("aria-pressed")]),
    [["ru", "true"], ["en", "false"]]);
});

test("a guest is offered to sign in; a bare page gets no header at all", () => {
  assert.equal(mount(renderAppHeader(guest)).querySelector("a.g-appbar__login").getAttribute("href"), "#/login");
  assert.ok(mount(renderSideNav(guest, { locale: "en" })).querySelector('a[href="#/login"]'));
  const bare = shellModel({ route: { name: "login", params: {} }, user: null });
  assert.equal(renderAppHeader(bare), "");
  assert.equal(renderSideNav(bare, { locale: "en" }), "");
});

test("text on the header band reads in every palette, and focus there is drawn in header ink", () => {
  assertReadable("src/shell/app-header.css", ".g-tab", "color", ["--header"], 4.5);
  assertReadable("src/shell/app-header.css", ".g-appbar__sub", "color", ["--header"], 4.5);
  assertReadable("src/shell/side-nav.css", ".g-sidenav__link", "color", ["--header"], 4.5);
  assertReadable("src/shell/side-nav.css", ".g-sidenav .g-site-footer", "color", ["--header"], 4.5);
  assert.deepEqual(valuesOf("src/shell/app-header.css", ".g-appbar :focus-visible", "outline-color"), ["var(--header-ink)"]);
  assert.deepEqual(valuesOf("src/shell/side-nav.css", ".g-sidenav :focus-visible", "outline-color"), ["var(--header-ink)"]);
});

test("every shell stylesheet reaches the page, and every key is in both dictionaries", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const sheet of ["crest.css", "app-header.css", "side-nav.css"]) assert.ok(styles.includes(`@import url("shell/${sheet}");`), sheet);
  assertDictionaryCovers("src/shell/app-header.mjs", "src/shell/side-nav.mjs");
});

// What the brief's table cannot see: the targets, what the footer and the guest's button say, and that every model draws.

const HEADER_CSS = "src/shell/app-header.css";
const SIDE_CSS = "src/shell/side-nav.css";
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("everything pressable on the dark band is a 44px target, the language buttons included", () => {
  const touch = ["var(--size-touch)"];
  assert.equal(tokensOf("grass")["--size-touch"], "44px");
  for (const [file, selector] of [[HEADER_CSS, ".g-tab"], [HEADER_CSS, ".g-appbar__team"], [HEADER_CSS, ".g-appbar__login"], [SIDE_CSS, ".g-sidenav__link"], [SIDE_CSS, ".g-sidenav__team"]]) {
    assert.deepEqual(valuesOf(file, selector, "min-height"), touch, `${selector} min-height`);
  }
  // A language button is drawn 36×28 and pressed anywhere in 44×44: the pill is a pseudo-element, not the button.
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-lang__item", "min-width"), touch, "the language button's width");
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-lang__item", "min-height"), touch, "the language button's height");
  assert.deepEqual([valuesOf(SIDE_CSS, ".g-lang__item::before", "width"), valuesOf(SIDE_CSS, ".g-lang__item::before", "height")], [["36px"], ["28px"]]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-lang__item", "background"), ["transparent"], "the button itself paints nothing");
});

test("the language pill is drawn only on the language that is on", () => {
  const pill = valuesOf(SIDE_CSS, '.g-lang__item[aria-pressed="true"]::before', "background");
  assert.deepEqual(pill, ["color-mix(in srgb, var(--header-ink) 14%, transparent)"]);
  assertReadable(SIDE_CSS, ".g-lang__item", "color", ["--header"], 4.5);
  assertReadable(SIDE_CSS, '.g-lang__item[aria-pressed="true"]', "color", ["--header"], 4.5);
});

test("the header folds to a small crest and a short name, and the fold stands still for a reader who asked it to", () => {
  const css = read(HEADER_CSS);
  assert.deepEqual([valuesOf(HEADER_CSS, ".g-appbar--compact .g-crest", "width"), valuesOf(HEADER_CSS, ".g-appbar--compact .g-crest", "height")], [["24px"], ["27px"]]);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-appbar--compact .g-appbar__sub", "display"), ["none"]);
  assert.match(css, /\.g-appbar--compact \.g-appbar__name\s*\{[^}]*font-size:\s*18px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*transition:\s*none/);
});

test("a name that is too long for the bar is cut with an ellipsis and keeps its chevron", () => {
  const css = read(HEADER_CSS);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-appbar__label", "text-overflow"), ["ellipsis"]);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-appbar__label", "white-space"), ["nowrap"]);
  assert.match(css, /\.g-appbar__name\s*\{[^}]*display:\s*flex/);
  const fragment = mount(renderAppHeader(coach()));
  assert.ok(fragment.querySelector(".g-appbar__name svg.g-icon"), "the chevron is beside the label, not inside what is cut");
  assert.equal(fragment.querySelector(".g-appbar__label svg"), null);
});

test("a tab's focus ring is drawn inside it: the row scrolls, and a ring outside would be cut", () => {
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-tab:focus-visible", "outline-offset"), ["-3px"]);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-tabs", "overflow-x"), ["auto"]);
});

test("the header says the team with its race and place; the SideNav says the race and the league", () => {
  const side = mount(renderSideNav(coach(), { locale: "en" }));
  assert.equal(side.querySelector(".g-sidenav__sub").textContent, "Human · Gata League");
  assert.equal(side.querySelector(".g-sidenav__name").textContent, "Ashgrove Wardens");
  const guestSide = mount(renderSideNav(guest, { locale: "en" }));
  assert.equal(guestSide.querySelector(".g-sidenav__name").textContent, "Gata League");
  assert.equal(guestSide.querySelector(".g-sidenav__sub").textContent, "Blood Bowl Sevens");
});

test("only a team the coach can switch carries the chevron and its hint; a guest's league does not", () => {
  const withTeam = mount(renderSideNav(coach(), { locale: "en" }));
  assert.ok(withTeam.querySelector("a.g-sidenav__team svg.g-icon"));
  assert.equal(withTeam.querySelector("a.g-sidenav__team .g-sr-only").textContent, "Switch team");
  const league = mount(renderSideNav(guest, { locale: "en" }));
  assert.equal(league.querySelector("a.g-sidenav__team").getAttribute("href"), "#/");
  assert.equal(league.querySelector("a.g-sidenav__team svg.g-icon"), null);
  assert.equal(league.querySelector("a.g-sidenav__team .g-sr-only"), null);
  assert.equal(mount(renderAppHeader(guest)).querySelector("a.g-appbar__team .g-appbar__name svg.g-icon"), null);
});

test("the sign-in link is a guest's: a coach has none, in the header or the SideNav", () => {
  assert.equal(mount(renderAppHeader(coach())).querySelector("a.g-appbar__login"), null);
  const side = mount(renderSideNav(coach(), { locale: "en" }));
  assert.equal(side.querySelector('a[href="#/login"]'), null);
  const guestSide = mount(renderSideNav(guest, { locale: "en" }));
  const login = guestSide.querySelector('.g-sidenav__bottom a.g-btn[href="#/login"]');
  assert.equal(login.textContent, "Sign in");
  assertStyled(guestSide, ...SIDE, "button.css");
});

test("the match block is markup another renderer drew, and sits above the language and the footer", () => {
  const fragment = mount(renderSideNav(coach(), { locale: "en", matchHtml: '<div class="g-btn" id="match-card">Start</div>' }));
  const bottom = fragment.querySelector(".g-sidenav__bottom");
  assert.deepEqual(bottom.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("id") ?? node.getAttribute("class")), ["match-card", "g-sidenav__foot"]);
  assert.ok(bottom.querySelector(".g-sidenav__foot .g-lang"));
  assert.ok(bottom.querySelector(".g-sidenav__foot .g-site-footer"));
});

test("the footer line: the date in the reader's format, the note, the legal link", () => {
  const en = mount(renderSiteFooter({ generatedAt: "2026-10-07T12:00:00Z", locale: "en" })).querySelector(".g-site-footer");
  assert.equal(en.textContent, "Updated 07/10/2026 · Unofficial fan-made league reference. Legal Information");
  assert.equal(en.querySelector("a").getAttribute("href"), "#/legal");
  initLocale("ru");
  try {
    const ru = mount(renderSiteFooter({ generatedAt: "2026-10-07T12:00:00Z", locale: "ru" })).querySelector(".g-site-footer");
    assert.equal(ru.textContent, "Обновлено 07.10.2026 · Неофициальный фанатский справочник по лиге. Юридическая информация");
  } finally {
    initLocale("en");
  }
});

test("a footer with no data date, or one that is not a date, says the rest and no date", () => {
  for (const generatedAt of [undefined, "", "yesterday"]) {
    const line = mount(renderSiteFooter({ generatedAt, locale: "en" })).querySelector(".g-site-footer");
    assert.equal(line.textContent, "Unofficial fan-made league reference. Legal Information", String(generatedAt));
  }
});

test("a SideNav asks for no date when nothing is loaded yet, and a locale that is not Russian is dated the English way", () => {
  const side = mount(renderSideNav(coach(), { locale: "en" }));
  assert.doesNotMatch(side.querySelector(".g-site-footer").textContent, /Updated/);
  assert.match(mount(renderSiteFooter({ generatedAt: "2026-10-07T12:00:00Z", locale: "de" })).textContent, /^Updated 07\/10\/2026/);
});

test("the language switch marks English too", () => {
  const fragment = mount(renderLanguageSwitch("en"));
  assert.deepEqual(fragment.querySelectorAll("[data-locale-switch]").map((button) => button.getAttribute("aria-pressed")), ["false", "true"]);
  assert.deepEqual(fragment.querySelectorAll("[data-locale-switch]").map((button) => button.textContent), ["RU", "EN"]);
  assertCspSafe(fragment);
  assertStyled(fragment, SIDE_CSS);
});

test("every route, for every visitor, draws without an unknown glyph, with every link a link", () => {
  const visitors = [
    { user: null, team: null },
    { user: { id: "u1", isAdmin: true }, team: { id: "a b", name: "Ashgrove Wardens" } },
    { user: { id: "u1", isAdmin: false }, team: null },
  ];
  for (const name of ROUTE_NAMES) {
    for (const visitor of visitors) {
      const model = shellModel({ route: { name, params: {} }, ...visitor, raceTitle: "Human", place: 1 });
      const markup = renderAppHeader(model) + renderSideNav(model, { locale: "en", generatedAt: "2026-10-07T12:00:00Z" });
      if (model.mode === "bare") {
        assert.equal(markup, "", `${name}: a bare page draws nothing`);
        continue;
      }
      const fragment = mount(markup);
      assertCspSafe(fragment);
      assert.equal(fragment.querySelectorAll(".g-tab").length, model.tabs.length, name);
      assert.equal(fragment.querySelectorAll(".g-sidenav__link").length, model.side.length, name);
      assert.ok(fragment.querySelectorAll(".g-tab, .g-sidenav__link").every((link) => link.getAttribute("href").startsWith("#/")), name);
    }
  }
});

test("a team whose id needs encoding is a link that goes there, in the tabs and the SideNav alike", () => {
  const model = coach({ id: "a b", name: "Ashgrove Wardens" });
  const fragment = mount(renderAppHeader(model) + renderSideNav(model, { locale: "en" }));
  assert.ok(fragment.querySelector('.g-tab[href="#/t/a%20b/roster"]'));
  assert.ok(fragment.querySelector('.g-sidenav__link[href="#/t/a%20b/roster"]'));
});

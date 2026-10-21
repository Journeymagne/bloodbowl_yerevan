import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, mount } from "./helpers/ui.mjs";
import { assertContrast, assertReadable, tokensOf, valuesOf } from "./helpers/contrast.mjs";
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
  const team = fragment.querySelector("button.g-appbar__team[data-team-switcher]");
  assert.equal(team.getAttribute("aria-haspopup"), "dialog");
  assert.equal(team.getAttribute("type"), "button");
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
  const team = fragment.querySelector("button.g-sidenav__team[data-team-switcher]");
  assert.equal(team.getAttribute("aria-haspopup"), "dialog");
  const links = fragment.querySelectorAll(".g-sidenav__link");
  assert.deepEqual(links.map((link) => link.getAttribute("href")), ["#/t/t1", "#/t/t1/roster", "#/t/t1/matches", "#/ref", "#/settings"]);
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

// Stage 07d, owner's answer 1: the player's own head with «‹ Roster» stands in the header's place (screens/team/roster/profile.mjs).
test("a drilled-into page has no header", () => {
  const drilled = shellModel({ route: { name: "teamPlayer", params: { teamId: "t1", playerId: "p1" } }, user: { id: "u1", isAdmin: false }, team: { id: "t1", name: "Ashgrove Wardens" }, raceTitle: "Human", place: 2 });
  assert.equal(renderAppHeader({ ...coach(), drill: true }), "");
  assert.equal(renderAppHeader(drilled), "");
  assert.ok(mount(renderSideNav(drilled, { locale: "en" })).querySelector('.g-sidenav__link[aria-current="page"]'), "a desk's SideNav as it was");
  assert.ok(mount(renderAppHeader(coach())).querySelector("nav.g-tabs"), "any other page keeps it");
  // The team's settings on a phone draw Builder.html's head with «‹» in the header's place (owner, 2026-10-20).
  const settings = shellModel({ route: { name: "teamSettings", params: { teamId: "t1" } }, user: { id: "u1", isAdmin: false }, team: { id: "t1", name: "Ashgrove Wardens" }, raceTitle: "Human", place: 2 });
  assert.equal(renderAppHeader(settings), "");
  assert.ok(mount(renderSideNav(settings, { locale: "en" })).querySelector('.g-sidenav__link[aria-current="page"][href="#/t/t1/roster"]'), "a desk's SideNav lights «Roster», as on the team page");
});

test("text on the header band reads in every palette, and focus there is drawn in header ink", () => {
  assertReadable("src/shell/app-header.css", ".g-tab", "color", ["--header"], 4.5);
  assertReadable("src/shell/app-header.css", ".g-appbar__sub", "color", ["--header"], 4.5);
  assertReadable("src/shell/side-nav.css", ".g-sidenav__link", "color", ["--header"], 4.5);
  assertReadable("src/shell/side-nav.css", ".g-sidenav .g-site-footer", "color", ["--header"], 4.5);
  assert.deepEqual(valuesOf("src/shell/app-header.css", ".g-appbar :focus-visible", "outline-color"), ["var(--header-ink)"]);
  assert.deepEqual(valuesOf("src/shell/side-nav.css", ".g-sidenav :focus-visible", "outline-color"), ["var(--header-ink)"]);
  // The ring, the current tab's underline and the pill's letters are all header ink: a header lighter than that would lose them.
  assertContrast("--header-ink", ["--header"], 3, { what: "header ink on the header" });
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
  // The folded bar's team link is 44px high at the top of a page: its ring is 3px, so the bar keeps 3px above it.
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-appbar--compact", "padding-top"), ["3px"]);
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

test("the header says the team with its race and place; the SideNav says the race alone, and the league for a guest", () => {
  const side = mount(renderSideNav(coach(), { locale: "en" }));
  assert.equal(side.querySelector(".g-sidenav__sub").textContent, "Human");
  assert.equal(side.querySelector(".g-sidenav__name").textContent, "Ashgrove Wardens");
  const guestSide = mount(renderSideNav(guest, { locale: "en" }));
  assert.equal(guestSide.querySelector(".g-sidenav__name").textContent, "Gata League");
  assert.equal(guestSide.querySelector(".g-sidenav__sub").textContent, "Blood Bowl Sevens");
});

test("a race longer than the column is cut, not wrapped, and says itself whole on hover", () => {
  const fragment = mount(renderSideNav(coach(), { locale: "en" }));
  assert.equal(fragment.querySelector(".g-sidenav__sub").getAttribute("title"), "Human");
  assert.deepEqual(valuesOf("src/shell/side-nav.css", ".g-sidenav__sub", "overflow"), ["hidden"], "what does not fit is cut");
  assert.deepEqual(valuesOf("src/shell/side-nav.css", ".g-sidenav__sub", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf("src/shell/side-nav.css", ".g-sidenav__sub", "text-overflow"), ["ellipsis"]);
});

test("only a team the coach can switch carries the chevron and its hint; a guest's league does not", () => {
  const withTeam = mount(renderSideNav(coach(), { locale: "en" }));
  assert.ok(withTeam.querySelector("button.g-sidenav__team svg.g-icon"));
  assert.equal(withTeam.querySelector("button.g-sidenav__team .g-sr-only").textContent, "Switch team");
  const league = mount(renderSideNav(guest, { locale: "en" }));
  assert.equal(league.querySelector("a.g-sidenav__team").getAttribute("href"), "#/");
  assert.equal(league.querySelector("a.g-sidenav__team svg.g-icon"), null);
  assert.equal(league.querySelector("a.g-sidenav__team .g-sr-only"), null);
  assert.equal(mount(renderAppHeader(guest)).querySelector("a.g-appbar__team .g-appbar__name svg.g-icon"), null);
});

// Stage 06: the block that led to My Teams is the switcher's button; a guest's league, and a list that was never read, keep their links.
test("the team block opens the switcher for a coach, and stays a link for a guest and for a list that could not be read", () => {
  const unread = shellModel({ route: { name: "team", params: {} }, user: { id: "u1", isAdmin: false }, team: null, teamsRead: false });
  for (const [what, model] of [["a guest", guest], ["an unread list", unread]]) {
    const fragment = mount(renderAppHeader(model) + renderSideNav(model, { locale: "en" }));
    for (const selector of ["a.g-appbar__team", "a.g-sidenav__team"]) assert.equal(fragment.querySelector(selector).getAttribute("href"), "#/", `${what}: ${selector}`);
    assert.equal(fragment.querySelector("[data-team-switcher]"), null, what);
  }
  const noTeam = shellModel({ route: { name: "home", params: {} }, user: { id: "u1", isAdmin: false }, team: null });
  const first = mount(renderAppHeader(noTeam) + renderSideNav(noTeam, { locale: "en" }));
  assert.equal(first.querySelectorAll("button[data-team-switcher]").length, 2, "a coach with no team yet opens the same panel, which offers the first one");
  const buttons = mount(renderAppHeader(coach()) + renderSideNav(coach(), { locale: "en" })).querySelectorAll("[data-team-switcher]");
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.equal(button.hasAttribute("href"), false, "a button has no address");
    assert.equal(button.querySelector(".g-sr-only").textContent, "Switch team");
  }
});

test("a team block that is a button looks like the link it replaced: no button chrome, and it reads as pressable", () => {
  for (const [file, selector] of [[HEADER_CSS, ".g-appbar__team"], [SIDE_CSS, ".g-sidenav__team"]]) {
    for (const [property, value] of [["font", "inherit"], ["cursor", "pointer"], ["text-align", "left"]]) assert.deepEqual(valuesOf(file, selector, property), [value], `${selector} ${property}`);
  }
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-appbar__team", "padding"), ["0"], "the bar's own padding, not the button's");
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
      // A player's address and the team's settings are drilled into (stage 07d): no header, and so no tabs drawn; any other route counts them.
      if (model.drill) assert.equal(renderAppHeader(model), "", `${name}: a drilled-into page draws no header`);
      else assert.equal(fragment.querySelectorAll(".g-tab").length, model.tabs.length, name);
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

// Fix round 1: what the review of the first commit measured.

test("the tab row has as much room after its last tab as the fade at its edge covers", () => {
  const [, solid] = valuesOf(HEADER_CSS, ".g-tabs", "mask-image")[0].match(/#000 (\d+)%/);
  const fade = 100 - Number(solid);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-tabs::after", "width"), [`${fade}%`], "the room after the last tab is the width of the fade");
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-tabs::after", "flex"), ["none"]);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-tabs::after", "content"), ['""']);
  assert.deepEqual(valuesOf(HEADER_CSS, ".g-tabs", "-webkit-mask-image"), valuesOf(HEADER_CSS, ".g-tabs", "mask-image"), "both prefixes fade alike");
});

test("every SideNav label sits in a span that may shrink and break, so a long word stays in its pill", () => {
  const fragment = mount(renderSideNav(coach(), { locale: "en" }));
  const links = fragment.querySelectorAll(".g-sidenav__link");
  assert.deepEqual(links.map((link) => link.querySelector(".g-sidenav__label").textContent), ["Overview", "Roster", "Season", "Reference", "Settings"]);
  assert.deepEqual(links.map((link) => link.textContent), ["Overview", "Roster", "Season", "Reference", "Settings"], "the span adds no words");
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__label", "min-width"), ["0"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__label", "overflow-wrap"), ["anywhere"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__label", "hyphens"), ["auto"]);
});

test("the administration item breaks at its soft hyphen in Russian, and its page keeps its own word", () => {
  initLocale("ru");
  try {
    const admin = shellModel({ route: { name: "administration", params: {} }, user: { id: "u1", isAdmin: true }, team: null });
    const fragment = mount(renderSideNav(admin, { locale: "ru" }));
    const label = fragment.querySelector('.g-sidenav__link[aria-current="page"] .g-sidenav__label').textContent;
    assert.equal(label, "Администри\u00ADрование");
    assert.equal(label.replace("\u00AD", ""), "Администрирование", "taken out, the soft hyphen leaves the word whole");
  } finally {
    initLocale("en");
  }
});

test("the current SideNav item and the pressed language show without colour: a border, where forced colours remove the rest", () => {
  const forced = read(SIDE_CSS).match(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(forced, "a forced-colors block");
  for (const selector of ['.g-sidenav__link[aria-current="page"]', '.g-lang__item[aria-pressed="true"]::before']) {
    assert.ok(forced[1].includes(selector), `${selector} is drawn in the forced-colors block`);
    assert.match(valuesOf(SIDE_CSS, selector, "border")[0], /^\d+px solid \w+$/, selector);
  }
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-lang__item::before", "box-sizing"), ["border-box"], "a border on the pill leaves it 36×28");
  const tabs = read(HEADER_CSS).match(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(tabs?.[1].includes('.g-tab[aria-current="page"]'), "the current tab is told from the others by more than its colour");
});

test("a long team name is cut at three lines in the SideNav, and the whole name is its title", () => {
  const fragment = mount(renderSideNav(coach({ id: "t1", name: HOSTILE }), { locale: "en" }));
  assert.equal(fragment.querySelector(".g-sidenav__name").getAttribute("title"), HOSTILE);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__name", "-webkit-line-clamp"), ["3"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__name", "display"), ["-webkit-box"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__name", "-webkit-box-orient"), ["vertical"]);
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__name", "overflow"), ["hidden"]);
  assertCspSafe(fragment);
});

test("a guest's sign-in button has a border of its own on the dark band, and a match card's buttons are left as they are", () => {
  const fragment = mount(renderSideNav(guest, { locale: "en" }));
  assert.ok(fragment.querySelector('.g-sidenav__bottom .g-sidenav__login a.g-btn[href="#/login"]'));
  assert.deepEqual(valuesOf(SIDE_CSS, ".g-sidenav__login .g-btn", "border-color"), ["var(--header-tab)"]);
  assert.equal(mount(renderSideNav(coach(), { locale: "en" })).querySelector(".g-sidenav__login"), null);
  assertStyled(fragment, ...SIDE, "button.css");
});

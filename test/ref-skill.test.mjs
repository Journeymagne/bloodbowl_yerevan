import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, useLocale } from "./helpers/ref-screen.mjs";

const view = mountView();
const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
const { badgeMarkup, categoryOf, skillDetailMarkup, skillHolders, skillRoll } = await import("../src/screens/ref/skill.mjs");
const { renderRefSection } = await import("../src/screens/ref/list.mjs");
const { setListFilter } = await import("../src/screens/ref/memory.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const draw = (markup) => parseHtml(document, markup);
const pageOf = (slug) => state.data.pages.find((page) => page.slug === slug);
const amazon = () => pageOf("teams/amazon");

// Rows 0 and 3 of the Amazon roster both have Evasive; the captain has Pro besides.
const TEAM = {
  id: "t1",
  name: "Wardens",
  baseTeamSlug: "teams/amazon",
  roster: { players: [{ id: "p1", rowIndex: 0, number: 3, name: "Itzel" }, { id: "p2", rowIndex: 3, number: 7, name: HOSTILE, isCaptain: true }] },
};

// Every screen starts as a coach finds it on arrival: English, no filter, no team, nothing chosen.
beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  for (const section of ["skills", "traits"]) setListFilter(section, { query: "", category: "all" });
  state.myTeams.items = [];
  state.activeTeamId = null;
});

test("a skill's panel: its letter on the category colour, its name, category and type, its rule", () => {
  renderReferencePage("skills/block");
  const panel = view.querySelector(".g-ref__panel .g-skill-detail");
  assert.equal(panel.querySelector("h1").textContent, "Block");
  assert.ok(panel.querySelector(".g-ref-badge.g-ref-badge--general"));
  assert.equal(panel.querySelector(".g-ref-badge").textContent, "G");
  assert.ok(panel.querySelector(".g-ref-badge.g-ref-badge--lg"));
  assert.equal(panel.querySelector(".g-skill-detail__caption").textContent, "General · Active");
  assert.ok(panel.querySelector(".g-prose h3"));
});

test("the random roll is the skill's face on the Skill Table's D16; a skill with a parameter is found under its name, a trait is not on it", () => {
  assert.deepEqual(skillRoll(state.data, "Block"), { category: "General", face: 1, sides: 16 });
  assert.deepEqual(skillRoll(state.data, "Mighty Blow (+1)"), { category: "Strength", face: 8, sides: 16 });
  assert.equal(skillRoll(state.data, "Loner (X+)"), null);
  renderReferencePage("skills/mighty-blow-1");
  assert.equal(view.querySelector(".g-kv__value").textContent, "Strength · 8 on D16");
});

test("a coach sees who in the active team has the skill, captaincy and the position included; others see no such block", () => {
  assert.deepEqual(skillHolders({ team: TEAM, teamPage: amazon(), title: "Evasive" }).map((p) => p.number), ["3", "7"]);
  assert.deepEqual(skillHolders({ team: TEAM, teamPage: amazon(), title: "Pro" }).map((p) => p.number), ["7"]);
  assert.deepEqual(skillHolders({ team: null, teamPage: null, title: "Evasive" }), []);
  const page = pageOf("skills/evasive");
  assert.equal(draw(skillDetailMarkup({ data: state.data, page })).querySelector(".g-skill-detail__ours"), null);
});

test("a player's name in the active team is text, not markup", () => {
  const page = pageOf("skills/evasive");
  const fragment = draw(skillDetailMarkup({ data: state.data, page, team: TEAM, teamPage: amazon() }));
  assert.equal(fragment.querySelector("img"), null);
  assert.deepEqual(fragment.querySelectorAll(".g-skill-detail__who").map((who) => who.textContent), ["Itzel", HOSTILE]);
  assertCspSafe(fragment);
});

test("on a wide screen the list stays beside the article, the open skill marked and the filter kept; the article is the one h1", () => {
  setListFilter("skills", { query: "", category: "Agility" });
  renderReferencePage("skills/dodge");
  assert.equal(view.querySelector('a.g-ref-row[aria-current="page"]').getAttribute("href"), "#/skills/dodge");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 13);
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Dodge"]);
  assert.equal(view.querySelector(".g-ref-back").getAttribute("href"), "#/ref/skills");
  setListFilter("skills", { category: "all" });
  assertDictionaryCovers("src/screens/ref/skill.mjs");
});

// What the brief leaves to the screen.

test("a player whose row the race no longer has is left out, not a crash", () => {
  const team = { ...TEAM, roster: { players: [{ rowIndex: 9, number: 1, name: "Gone" }, { rowIndex: 0, number: 2, name: "Here" }, { number: 4, name: "No row at all" }] } };
  assert.deepEqual(skillHolders({ team, teamPage: amazon(), title: "Evasive" }).map((p) => p.name), ["Here"]);
  assert.deepEqual(skillHolders({ team: { ...TEAM, roster: {} }, teamPage: amazon(), title: "Evasive" }), [], "a list entry that came without its players");
  assert.deepEqual(skillHolders({ team: TEAM, teamPage: null, title: "Evasive" }), [], "a race the vault does not have");
});

test("a holder is shown by number, name and position; a skill nobody has says so", () => {
  const page = pageOf("skills/evasive");
  const ours = draw(skillDetailMarkup({ data: state.data, page, team: TEAM, teamPage: amazon() })).querySelector(".g-skill-detail__ours");
  assert.equal(ours.querySelector("h2").textContent, "In your team");
  const first = ours.querySelectorAll(".g-skill-detail__holder")[0];
  assert.deepEqual(["num", "who", "pos"].map((part) => first.querySelector(`.g-skill-detail__${part}`).textContent), ["3", "Itzel", "Eagle Warrior Linewoman"]);
  const nobody = draw(skillDetailMarkup({ data: state.data, page: pageOf("skills/block"), team: TEAM, teamPage: amazon() })).querySelector(".g-skill-detail__ours");
  assert.equal(nobody.querySelector(".g-skill-detail__none").textContent, "No one has it");
  assert.equal(nobody.querySelector("li"), null);
});

test("a name in a roster finds its page whatever the spelling or the parameter: Bone Head is Bonehead, Loner (4+) is Loner (X+)", () => {
  const race = { team: { roster: [{ position: "Ogre Blocker", skills: ["Bone Head", "Loner (4+)", "Throw Team-mate", "Animosity (All)", "Mighty Blow (+1)", "Kick Team-mate"] }] } };
  const team = { roster: { players: [{ rowIndex: 0, number: 5, name: "Grunt" }] } };
  const has = (title) => skillHolders({ team, teamPage: race, title }).length;
  for (const title of ["Bonehead", "Loner (X+)", "Throw Team-Mate", "Animosity (X)", "Mighty Blow", "Mighty Blow (+2)", "Kick Team-Mate"]) assert.equal(has(title), 1, title);
  for (const title of ["Block", "Kick", "Hatred (X)", "Throw"]) assert.equal(has(title), 0, title);
});

test("with a signed-in coach's active team the panel on its page says who has the skill; the guest's has no such block", () => {
  renderReferencePage("skills/evasive");
  assert.equal(view.querySelector(".g-skill-detail__ours"), null);
  state.myTeams.items = [TEAM];
  state.activeTeamId = "t1";
  renderReferencePage("skills/evasive");
  assert.deepEqual(view.querySelectorAll(".g-skill-detail__num").map((num) => num.textContent), ["3", "7"]);
  state.activeTeamId = null;
  renderReferencePage("skills/evasive");
  assert.equal(view.querySelector(".g-skill-detail__ours"), null, "a coach with no active team has none either");
  state.myTeams.items = [{ ...TEAM, baseTeamSlug: "teams/no-such-race" }];
  state.activeTeamId = "t1";
  renderReferencePage("skills/evasive");
  assert.equal(view.querySelector(".g-skill-detail__none").textContent, "No one has it", "a race the vault lacks has no one");
});

test("a trait has a dot for a letter, its tags for a caption and no roll; a skill the table leaves out says so", () => {
  renderReferencePage("traits/throw-team-mate");
  const panel = view.querySelector(".g-ref__panel .g-skill-detail");
  assert.equal(panel.querySelector("h1").textContent, "Throw Team-Mate");
  assert.equal(panel.querySelector(".g-ref-badge").textContent, "•");
  assert.ok(panel.querySelector(".g-ref-badge--trait"));
  assert.equal(panel.querySelector(".g-skill-detail__caption").textContent, "Trait · Passive");
  assert.equal(panel.querySelector(".g-kv"), null);
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]').getAttribute("href"), "#/ref/traits");
  assert.equal(view.querySelector('a.g-ref-row[aria-current="page"]').getAttribute("href"), "#/traits/throw-team-mate");
  assert.equal(view.querySelector(".g-ref-back").getAttribute("href"), "#/ref/traits");
  renderReferencePage("traits/always-hungry");
  assert.equal(view.querySelector(".g-skill-detail__caption").textContent, "Trait");
  renderReferencePage("skills/cannoneer");
  assert.equal(view.querySelector(".g-kv__value").textContent, "Not on the Skill Table");
  assert.equal(view.querySelector(".g-skill-detail__caption").textContent, "Passing · Active");
});

test("the category is the first tag the Skill Table has; a trait has none, and a tag without a colour is drawn as a trait", () => {
  assert.equal(categoryOf(state.data, pageOf("skills/dodge")), "Agility");
  assert.equal(categoryOf(state.data, { tags: ["Passive", "General"] }), "General");
  assert.equal(categoryOf(state.data, pageOf("traits/always-hungry")), null);
  assert.equal(categoryOf({}, pageOf("skills/dodge")), null, "a vault without skill groups");
  assert.ok(draw(badgeMarkup("Elite")).querySelector(".g-ref-badge--trait"));
  assert.equal(draw(badgeMarkup("Passing", { large: true })).querySelector(".g-ref-badge").textContent, "P");
});

test("the panel and the list agree: a skill's letter is the same in its row and in its card", () => {
  renderReferencePage("skills/sidestep");
  const row = view.querySelector('a.g-ref-row[aria-current="page"] .g-ref-badge');
  const card = view.querySelector(".g-skill-detail .g-ref-badge");
  assert.deepEqual([row.textContent, row.getAttribute("class").includes("g-ref-badge--agility")], [card.textContent, card.getAttribute("class").includes("g-ref-badge--agility")]);
});

test("a phone gets the way back from the panel to the list, not to the reference; with nothing chosen it is the other way", () => {
  renderReferencePage("skills/dodge");
  const back = view.querySelectorAll("a.g-ref-back");
  assert.deepEqual(back.map((link) => [link.getAttribute("href"), link.textContent]), [["#/ref/skills", "Skills"]]);
  assert.ok(view.querySelector(".g-ref__panel a.g-ref-back"), "the panel carries it: the list is hidden when the panel shows");
  assert.ok(view.querySelector(".g-ref.g-ref--split.g-ref--open"));
  useLocale("ru");
  renderReferencePage("traits/bonehead");
  assert.deepEqual(view.querySelectorAll("a.g-ref-back").map((link) => [link.getAttribute("href"), link.textContent]), [["#/ref/traits", "Traits"]], "the glossary keeps the section's name in English");
});

test("a phone starts the panel at its top, wherever the list was read to; a wide screen, and the open panel redrawn, stay where they are", () => {
  const scrolls = [];
  globalThis.scrollTo = (x, y) => scrolls.push([x, y]);
  try {
    globalThis.matchMedia = () => ({ matches: false });
    renderRefSection("skills");
    renderReferencePage("skills/dodge");
    assert.deepEqual(scrolls, [], "a wide screen shows the list beside the panel: nothing to start over");
    globalThis.matchMedia = (query) => ({ matches: query === "(max-width: 900px)" });
    renderRefSection("skills");
    renderReferencePage("skills/dodge");
    assert.deepEqual(scrolls, [[0, 0]], "a phone swaps the list for the panel");
    const field = view.querySelector("#ref-list-query");
    field.value = "d";
    fireEvent(field, "input");
    assert.ok(view.querySelector(".g-ref--open"), "the panel stays up while the list is searched");
    assert.equal(scrolls.length, 1, "and the redraw does not start it over");
  } finally {
    delete globalThis.matchMedia;
    delete globalThis.scrollTo;
  }
});

test("every skill and trait of both vaults draws in the panel: one h1 with its name, nothing the CSP refuses, no link the router sends on", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    for (const page of state.data.pages.filter((item) => item.kind === "skill" || item.kind === "trait")) {
      renderReferencePage(page.slug);
      assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), [page.title], `${locale}: ${page.slug}`);
      assert.ok(view.querySelector(".g-ref__panel .g-skill-detail .g-prose"), `${locale}: ${page.slug}`);
      assertCspSafe(view);
    }
    assertNotSentOn(hrefsIn(view));
  }
});

test("in Russian the labels are Russian and the names stay the vault's", () => {
  useLocale("ru");
  state.myTeams.items = [TEAM];
  state.activeTeamId = "t1";
  renderReferencePage("skills/evasive");
  assert.equal(view.querySelector(".g-kv__label").textContent, "Случайный бросок");
  assert.match(view.querySelector(".g-kv__value").textContent, /^Agility · \d+ на D16$/);
  assert.equal(view.querySelector(".g-skill-detail__ours-title").textContent, "В нашей команде");
  renderReferencePage("skills/block");
  state.activeTeamId = "t1";
  assert.equal(view.querySelector(".g-skill-detail__none").textContent, "Ни у кого нет");
});

// The sheet: what the brief fixes, and what the 2.x globals would otherwise decide.

const ARTICLE = "src/screens/ref/article.css";
const REF = "src/screens/ref/ref.css";
const bare = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, "");
/** The part of a sheet that is for 901px and up (it is the last block of the file), and the part that is not. */
const split = (file) => {
  const css = bare(file);
  const wide = css.match(/@media\s*\(min-width: 901px\)\s*\{([\s\S]*)\n\}/)?.[1] ?? "";
  return { wide, rest: css.replace(wide, "") };
};

test("the panel's badge is 52px, its name 700 34px in the display face, its caption quiet; none in capitals", () => {
  assert.deepEqual(valuesOf(REF, ".g-ref-badge--lg", "width"), ["52px"]);
  assert.deepEqual(valuesOf(REF, ".g-ref-badge--lg", "height"), ["52px"]);
  assert.deepEqual(valuesOf(REF, ".g-ref-badge--lg", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(REF, ".g-ref-badge--lg", "font"), ["700 26px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__name", "font"), ["700 34px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__name", "text-transform"), ["none"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__caption", "font"), ["400 14px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__ours-title", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__ours-title", "letter-spacing"), [".08em"]);
});

test("up to 900px the panel is the page itself; from 901px it is a card of the surface in the ring, 24px inside", () => {
  const { wide, rest } = split(ARTICLE);
  assert.ok(!/\.g-skill-detail\s*\{[^}]*\b(box-shadow|padding)\s*:/.test(rest), "a phone's panel has no frame");
  assert.ok(!/\.g-skill-detail\s*\{[^}]*\bbackground\s*:\s*var\(--surface\)/.test(rest), "and no card");
  assert.match(wide, /\.g-skill-detail\s*\{[^}]*padding:\s*24px;/);
  assert.match(wide, /\.g-skill-detail\s*\{[^}]*border-radius:\s*var\(--radius-2xl\);/);
  assert.match(wide, /\.g-skill-detail\s*\{[^}]*background:\s*var\(--surface\);/);
  assert.match(wide, /\.g-skill-detail\s*\{[^}]*box-shadow:\s*var\(--ring\);/);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail .g-prose > :first-child", "margin-top"), ["0"]);
});

test("a holder row is a 44px line with a 32px badge for the number; what is said on it is readable in every palette", () => {
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__holder", "min-height"), ["44px"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__num", "width"), ["32px"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__num", "height"), ["32px"]);
  assertContrast("--on-accent-tint", ["--accent-tint"], 4.5, { what: "the number on its badge" });
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__num", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__num", "color"), ["var(--on-accent-tint)"]);
  for (const part of ["name", "caption", "ours-title", "who", "pos", "none"]) {
    assertReadable(ARTICLE, `.g-skill-detail__${part}`, "color", ["--surface", "--page"], 4.5);
  }
});

test("the way back is a phone's link: shown up to 900px, hidden from 901px", () => {
  assert.deepEqual(valuesOf(REF, ".g-ref-back", "display"), ["inline-flex", "none"]);
  assert.ok(split(REF).wide.includes(".g-ref-back"), "the rule that hides it is the desktop's");
  assert.ok(!split(REF).rest.match(/\.g-ref-back\s*\{[^}]*display:\s*none/), "and nothing hides it on a phone");
});

test("from 901px the split page's columns never wrap, and its panel stays in view while the list is read", () => {
  assert.deepEqual(valuesOf(REF, ".g-ref--split .g-ref__body", "display"), ["grid"]);
  assert.deepEqual(valuesOf(REF, ".g-ref--split .g-ref__body", "flex-flow"), []);
  assert.ok(split(REF).wide.includes(".g-ref--split .g-ref__body"), "the columns are the desktop's");
  assert.deepEqual(valuesOf(REF, ".g-ref--split .g-ref__panel", "position"), ["sticky"]);
  // Sticking needs the frame's box not to be one that scrolls: `overflow-x: hidden` makes it one, which never scrolls, so nothing would stick.
  assert.deepEqual(valuesOf(REF, ".g-main:has(.g-ref)", "overflow-x"), ["clip"]);
  assert.ok(split(REF).wide.includes(".g-main:has(.g-ref)"), "and only where the panel is: from 901px");
  assert.equal(valuesOf("src/shell/frame.css", ".g-main", "overflow-x")[0], "hidden", "the frame's other screens stay as they were");
});

test("a row holds the category it says to a screen reader, so that the page cannot be scrolled past the rows' box", () => {
  assert.deepEqual(valuesOf(REF, ".g-ref-row", "position"), ["relative"]);
  assert.deepEqual(valuesOf("src/ui/base.css", ".g-sr-only", "position"), ["absolute"]);
});

test("every class the panel draws is styled, and the sheets reach the page", () => {
  renderReferencePage("skills/evasive");
  state.myTeams.items = [TEAM];
  state.activeTeamId = "t1";
  renderReferencePage("skills/evasive");
  assertStyled(view, REF, ARTICLE, "list-row.css", "search-field.css", "filter-chips.css");
  const styles = read("src/styles.css");
  assert.ok(styles.includes('@import url("screens/ref/ref.css");') && styles.includes('@import url("screens/ref/article.css");'));
});

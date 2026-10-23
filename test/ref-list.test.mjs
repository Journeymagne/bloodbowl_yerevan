import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertContrast, assertReadable, blocks, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints, mediaText } from "./helpers/css.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale } from "./helpers/ref-screen.mjs";

const view = mountView();
const { renderRefSection, refListMarkup, skillCategories, listRows } = await import("../src/screens/ref/list.mjs");
const { listFilter, refQuery, setListFilter, setRefQuery } = await import("../src/screens/ref/memory.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { overviewCards } = await import("../src/data/overview-cards-en.mjs");
const { t } = await import("../src/core/i18n.mjs");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const type = (selector, value) => { const input = view.querySelector(selector); input.value = value; fireEvent(input, "input"); };
const draw = (markup) => parseHtml(document, markup);
/** The nav rows whose address starts with `prefix` (the fake document has no `^=` selector). */
const rowsTo = (prefix) => view.querySelectorAll("a.g-list-row").filter((row) => row.getAttribute("href").startsWith(prefix));

const SECTIONS = ["teams", "skills", "traits", "star-players", "inducements", "rules", "cheatsheets"];

// Every list starts as a coach finds it on arrival: English, nothing typed, nothing chosen.
beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  for (const section of SECTIONS) setListFilter(section, { query: "", category: "all" });
  setRefQuery("");
});

test("skills: every one, a letter for its category, its type, and a link to its page", () => {
  renderRefSection("skills");
  const rows = view.querySelectorAll("a.g-ref-row");
  assert.equal(rows.length, 82);
  assert.equal(view.querySelector("h1").textContent, "Skills");
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "82 of 82");
  const block = view.querySelector('a.g-ref-row[href="#/skills/block"]');
  assert.deepEqual([block.querySelector(".g-ref-badge").textContent, block.querySelector(".g-ref-row__meta").textContent], ["G", "Active"]);
  assert.equal(view.querySelector('a.g-ref-row[href="#/skills/thick-skull"] .g-ref-row__meta').textContent, "Passive");
});

test("a category chip narrows the skills to it and says how many of how many; All brings them back", () => {
  renderRefSection("skills");
  fireEvent(view.querySelector('[data-chip-value="Agility"]'), "click");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 14);
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "14 of 82");
  fireEvent(view.querySelector('[data-chip-value="all"]'), "click");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 82);
});

test("the list search narrows by name and keeps focus in the field as the list is redrawn", () => {
  renderRefSection("skills");
  const input = view.querySelector("#ref-list-query");
  input.focus();
  type("#ref-list-query", "dodge");
  assert.deepEqual(view.querySelectorAll("a.g-ref-row").map((row) => row.getAttribute("href")), ["#/skills/dodge"]);
  assert.equal(document.activeElement, view.querySelector("#ref-list-query"));
});

test("each list keeps its own filter: a query typed in Skills is not in Traits", () => {
  renderRefSection("skills");
  type("#ref-list-query", "dodge");
  renderRefSection("traits");
  assert.equal(view.querySelector("#ref-list-query").value, "");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 38);
  assert.equal(view.querySelector('[role="radiogroup"]'), null, "only skills have categories");
});

test("teams, star players and inducements are rows that say what tells them apart", () => {
  renderRefSection("teams");
  assert.equal(view.querySelectorAll("a.g-list-row").length, 37);
  assert.match(view.querySelector('a.g-list-row[href="#/teams/human"] .g-list-row__desc').textContent, /^Tier \d · Core$/);
  renderRefSection("star-players");
  assert.equal(view.querySelectorAll("a.g-list-row").length, 75);
  assert.match(view.querySelector('a.g-list-row[href="#/rotten-rick-bupkeis"] .g-list-row__desc').textContent, /^95K · Sylvanian Spotlight$/);
});

test("the league rules: the overview in brief first, then the full rules", () => {
  renderRefSection("rules");
  assert.deepEqual(view.querySelectorAll(".g-ref-list h2").map((h) => h.textContent), ["In brief", "Full text"]);
  assert.equal(rowsTo("#/overview/").length, 7);
  assert.equal(rowsTo("#/rules/").length, 5);
});

test("an empty list says so; a wide screen gets the table of contents with the list lit", () => {
  renderRefSection("cheatsheets");
  assert.ok(view.querySelector(".g-ref-empty"));
  renderRefSection("skills");
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]').getAttribute("href"), "#/ref/skills");
  assert.equal(view.querySelector(".g-ref__panel .g-ref-pick").textContent, "Choose a skill to read its rule");
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Skills"], "no article is open: the list keeps its heading");
});

test("no link a list draws is sent on by the router, and every key is in both dictionaries", () => {
  for (const section of SECTIONS) {
    renderRefSection(section);
    assertNotSentOn(hrefsIn(view));
    assertCspSafe(view);
  }
  assertDictionaryCovers("src/screens/ref/list.mjs");
});

// What the brief leaves to the screen.

test("a skill names its category for a screen reader and wears its colour; a trait wears a dot, and only a passive one says so", () => {
  renderRefSection("skills");
  const block = view.querySelector('a.g-ref-row[href="#/skills/block"]');
  assert.equal(block.querySelector(".g-sr-only").textContent, "General");
  assert.ok(block.querySelector(".g-ref-badge.g-ref-badge--general"));
  assert.equal(block.querySelector(".g-ref-badge").getAttribute("aria-hidden"), "true");
  assert.ok(view.querySelector('a.g-ref-row[href="#/skills/thick-skull"] .g-ref-row__meta--passive'), "the word Passive is also marked for the colour");
  assert.equal(view.querySelector('a.g-ref-row[href="#/skills/block"] .g-ref-row__meta--passive'), null);
  renderRefSection("traits");
  const trait = view.querySelector('a.g-ref-row[href="#/traits/always-hungry"]');
  assert.equal(trait.querySelector(".g-ref-badge").textContent, "•");
  assert.ok(trait.querySelector(".g-ref-badge--trait"));
  assert.equal(trait.querySelector(".g-sr-only").textContent, "Trait");
  assert.equal(trait.querySelector(".g-ref-row__meta"), null, "a trait with no Active or Passive tag has no type to show");
  assert.equal(view.querySelector('a.g-ref-row[href="#/traits/throw-team-mate"] .g-ref-row__meta').textContent, "Passive");
  assertStyled(view, "src/screens/ref/ref.css", "page-head.css", "list-row.css", "search-field.css", "filter-chips.css");
});

test("the categories are the skill groups' in their order, each with the skills that carry the tag", () => {
  const categories = skillCategories(referenceData("en"));
  assert.deepEqual(categories.map((category) => category.value), ["Agility", "Devious", "General", "Mutation", "Passing", "Strength"]);
  assert.deepEqual(categories.map((category) => category.count), [14, 9, 19, 13, 13, 14]);
  assert.equal(categories.reduce((sum, category) => sum + category.count, 0), 82);
  assert.deepEqual(skillCategories({}), [], "a vault without skill groups has no categories");
});

test("rows are the section's pages narrowed by name (case and ё aside) and, for skills, by the category tag", () => {
  const data = referenceData("en");
  assert.equal(listRows(data, "skills").length, 82);
  assert.deepEqual(listRows(data, "skills", { query: "  DODGE " }).map((page) => page.title), ["Dodge"]);
  assert.ok(listRows(data, "skills", { category: "Passing" }).every((page) => page.tags.includes("Passing")));
  assert.equal(listRows(data, "skills", { query: "block", category: "Strength" }).every((page) => page.title.toLowerCase().includes("block") && page.tags.includes("Strength")), true);
  assert.equal(listRows(data, "traits", { category: "Passing" }).length, 38, "only skills have categories");
  assert.deepEqual(listRows(data, "cheatsheets"), []);
  assert.deepEqual(listRows({ teams: [{ title: "Ёж" }, { title: "Крот" }] }, "teams", { query: "еж" }).map((page) => page.title), ["Ёж"], "ё is е");
});

test("a query nothing matches says so, and the count says none of all", () => {
  renderRefSection("skills");
  type("#ref-list-query", "zzzz");
  assert.equal(view.querySelector(".g-ref-empty").textContent, "Nothing found. Try changing the search or filters.");
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "0 of 82");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 0);
  type("#ref-list-query", "");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 82);
});

test("the count is a live region that stays on the page while it changes", () => {
  renderRefSection("skills");
  const count = view.querySelector(".g-ref-list__count");
  assert.equal(count.getAttribute("role"), "status");
  type("#ref-list-query", "dodge");
  assert.equal(view.querySelector(".g-ref-list__count"), count, "the same node, so a screen reader hears the change");
  assert.equal(count.textContent, "1 of 82");
});

test("a remembered category the vault does not have is All, not a broken chip row", () => {
  setListFilter("skills", { category: "Telepathy" });
  renderRefSection("skills");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 82);
  assert.equal(view.querySelector('[data-chip-value="all"]').getAttribute("aria-checked"), "true");
});

test("the filter outlives the screen: back from an article the list is as it was left", () => {
  renderRefSection("skills");
  fireEvent(view.querySelector('[data-chip-value="Strength"]'), "click");
  type("#ref-list-query", "mighty");
  releaseCurrentScreen();
  renderRefSection("skills");
  assert.deepEqual(listFilter("skills"), { query: "mighty", category: "Strength" });
  assert.equal(view.querySelector("#ref-list-query").value, "mighty");
  assert.equal(view.querySelector('[data-chip-value="Strength"]').getAttribute("aria-checked"), "true");
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "3 of 82", "Mighty Blow, and its +1 and +2");
});

test("the field shows the filter, not what a field of the screen before left in it", () => {
  renderRefSection("skills");
  type("#ref-list-query", "dodge"); // the field now holds a typed value, which a changed attribute does not replace
  releaseCurrentScreen();
  renderRefSection("traits");
  assert.equal(view.querySelector("#ref-list-query").value, "");
  assert.equal(view.querySelector("#ref-list-query").getAttribute("data-list-search"), "traits");
});

test("a skill that is open is marked in the list, which keeps its filter; the list's title is no longer the page's h1", () => {
  const dodge = referenceData("en").skills.find((page) => page.slug === "skills/dodge");
  setListFilter("skills", { category: "Agility" });
  renderRefSection("skills", { selected: dodge });
  const current = view.querySelectorAll('a.g-ref-row[aria-current="page"]');
  assert.deepEqual(current.map((row) => row.getAttribute("href")), ["#/skills/dodge"]);
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 14);
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Dodge"], "the open skill's panel owns the h1");
  assert.equal(view.querySelector("p.g-ref-list__title").textContent, "Skills");
  assert.ok(view.querySelector(".g-ref.g-ref--split.g-ref--open"));
  assert.ok(view.querySelector(".g-ref__panel .g-skill-detail"), "the panel stands where the hint did");
  assert.equal(view.querySelector(".g-ref-pick"), null);
  renderRefSection("skills");
  assert.equal(view.querySelector(".g-ref--open"), null, "nothing chosen: the list is the whole screen on a phone");
  assert.equal(view.querySelectorAll('a.g-ref-row[aria-current="page"]').length, 0, "and no row is marked");
  assert.ok(view.querySelector("h1"), "the list has its heading back");
});

test("the rows box keeps its scroll while an item is opened beside it, and starts at the top for any other set of rows", () => {
  const dodge = referenceData("en").skills.find((page) => page.slug === "skills/dodge");
  renderRefSection("skills");
  const body = () => view.querySelector(".g-ref-list__body");
  body().scrollTop = 300;
  renderRefSection("skills", { selected: dodge });
  assert.equal(body().scrollTop, 300, "the same list with one row marked");
  fireEvent(view.querySelector('[data-chip-value="Agility"]'), "click");
  assert.equal(body().scrollTop, 0, "another category is another list");
  body().scrollTop = 40;
  type("#ref-list-query", "d");
  assert.equal(body().scrollTop, 0, "a search too");
  body().scrollTop = 40;
  renderRefSection("traits");
  assert.equal(body().scrollTop, 0, "and so is another section: the box of the screen before is reused");
});

test("traits get the trait hint; the lists that are not split have no panel and are never open", () => {
  renderRefSection("traits");
  assert.equal(view.querySelector(".g-ref__panel .g-ref-pick").textContent, "Choose a trait to read its rule");
  for (const section of ["teams", "star-players", "inducements", "rules", "cheatsheets"]) {
    renderRefSection(section);
    assert.ok(view.querySelector(".g-ref.g-ref--list"), section);
    assert.equal(view.querySelector(".g-ref__panel"), null, section);
  }
});

test("a phone gets the way back up to the reference; the table of contents and the band are the page's own", () => {
  renderRefSection("teams");
  assert.equal(view.querySelector("a.g-ref-back").getAttribute("href"), "#/ref");
  assert.equal(view.querySelector("a.g-ref-back").textContent, "Reference");
  assert.equal(view.querySelector("header.g-pagehead p.g-pagehead__title").textContent, "Reference");
  assert.ok(view.querySelector("nav.g-ref-toc"));
  setRefQuery("dodge");
  renderRefSection("teams");
  assert.equal(view.querySelector("#ref-query").value, "dodge", "the band's search holds what the reference remembers");
});

test("only the lists worth searching have a search; each says what it looks for", () => {
  const labels = { skills: "Find a skill", traits: "Find a trait", teams: "Find a team", "star-players": "Find a star player", inducements: "Find an inducement" };
  for (const [section, label] of Object.entries(labels)) {
    renderRefSection(section);
    const field = view.querySelector("#ref-list-query");
    assert.equal(view.querySelector('label[for="ref-list-query"]').textContent, label, section);
    assert.equal(field.getAttribute("placeholder"), label, section);
    assert.equal(field.getAttribute("data-list-search"), section, section);
  }
  for (const section of ["rules", "cheatsheets"]) {
    renderRefSection(section);
    assert.equal(view.querySelector("#ref-list-query"), null, section);
  }
});

test("a team narrows by name, and the list of teams, stars and inducements all answer to their own search", () => {
  renderRefSection("teams");
  type("#ref-list-query", "dwarf");
  assert.deepEqual(view.querySelectorAll("a.g-list-row").map((row) => row.getAttribute("href")), ["#/teams/chaos-dwarfs", "#/teams/dwarf"]);
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "2 of 37");
  renderRefSection("star-players");
  type("#ref-list-query", "rotten");
  assert.deepEqual(view.querySelectorAll("a.g-list-row").map((row) => row.getAttribute("href")), ["#/rotten-rick-bupkeis"]);
  renderRefSection("inducements");
  type("#ref-list-query", "training");
  assert.equal(view.querySelector("a.g-list-row .g-list-row__title").textContent, "Additional Training");
});

test("an inducement says its rule in the first ninety characters", () => {
  const data = referenceData("en");
  renderRefSection("inducements");
  const rows = view.querySelectorAll("a.g-list-row");
  assert.equal(rows.length, 24);
  for (const row of rows) {
    const page = data.inducements.find((item) => `#/${item.slug}` === row.getAttribute("href"));
    const text = row.querySelector(".g-list-row__desc").textContent;
    assert.equal(text, page.text.length > 90 ? `${page.text.slice(0, 90).trimEnd()}…` : page.text, page.title);
  }
  assert.equal(view.querySelector('a.g-list-row[href="#/inducements/additional-training"] .g-list-row__desc').textContent, "0-6 Additional Training (85k): Gain a Team Reroll until the end of the game.");
});

test("a league rule is described by its sentence in the dictionary, in both languages, for every page of both vaults", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    const rules = referenceData(locale).rules;
    assert.equal(rules.length, 5);
    for (const page of rules) assert.notEqual(t(`preview.${page.id}`), `preview.${page.id}`, `${locale}: ${page.id}`);
    renderRefSection("rules");
    const sentences = rowsTo("#/rules/").map((row) => row.querySelector(".g-list-row__desc").textContent);
    assert.deepEqual(sentences, rules.map((page) => t(`preview.${page.id}`)), locale);
    // The cards come first and say their own summary.
    const cards = rowsTo("#/overview/");
    assert.equal(cards.length, 7, locale);
    assert.ok(cards.every((row) => row.querySelector(".g-list-row__desc").textContent.length > 0), locale);
  }
});

test("the league rules count the cards and the pages together", () => {
  renderRefSection("rules");
  assert.equal(view.querySelector(".g-ref-list__count").textContent, `${overviewCards.length + referenceData("en").rules.length} of 12`);
  assert.equal(view.querySelector('a.g-list-row[href="#/overview/code-of-conduct"] .g-list-row__title').textContent, "Code Of Conduct");
});

test("the same lists in Russian, from the Russian dictionary and the Russian vault", () => {
  useLocale("ru");
  renderRefSection("teams");
  assert.equal(view.querySelector("h1").textContent, "Правила команд");
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "37 из 37");
  assert.equal(view.querySelector("#ref-list-query").getAttribute("placeholder"), "Найти команду");
  assert.match(view.querySelector('a.g-list-row[href="#/teams/human"] .g-list-row__desc').textContent, /^Tier \d · Основные$/);
  renderRefSection("skills");
  assert.equal(view.querySelector(".g-ref__panel .g-ref-pick").textContent, "Выберите навык, чтобы прочитать правило");
  assert.equal(view.querySelector("a.g-ref-back").textContent, "Справочник");
  renderRefSection("rules");
  assert.deepEqual(view.querySelectorAll(".g-ref-list h2").map((h) => h.textContent), ["Кратко", "Полный текст"]);
  assert.equal(view.querySelector('a.g-list-row[href="#/overview/code-of-conduct"] .g-list-row__title').textContent, "Кодекс поведения");
  type("#ref-query", "");
});

test("a title a person could have typed is text wherever a list draws it", () => {
  const data = referenceData("en");
  const hostile = {
    ...data,
    skills: [{ ...data.skills[0], title: HOSTILE, slug: "skills/x" }],
    teams: [{ ...data.teams[0], title: HOSTILE, team: { meta: { league: HOSTILE } } }],
  };
  const filter = { query: HOSTILE, category: "all" };
  const skills = draw(refListMarkup({ data: hostile, section: "skills", filter }));
  assert.equal(skills.querySelector(".g-ref-row__name").textContent, HOSTILE);
  const teams = draw(refListMarkup({ data: hostile, section: "teams", filter }));
  assert.equal(teams.querySelector(".g-list-row__title").textContent, HOSTILE);
  assert.ok(teams.querySelector(".g-list-row__desc").textContent.startsWith(HOSTILE));
  for (const fragment of [skills, teams]) {
    assert.equal(fragment.querySelector("img"), null);
    assert.equal(fragment.querySelector("#ref-list-query").getAttribute("value"), HOSTILE, "a query is text when it is drawn back");
    assertCspSafe(fragment);
  }
});

test("the search of the band, on a list, takes the coach to the reference with what was typed", () => {
  renderRefSection("skills");
  globalThis.location = { hash: "#/ref/skills" };
  type("#ref-query", "dodge");
  assert.equal(refQuery(), "dodge");
  assert.equal(location.hash, "#/ref");
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 82, "the list itself is not narrowed by the band");
});

test("leaving a list unhooks it, and drawing it twice hooks it once", () => {
  renderRefSection("skills");
  releaseCurrentScreen();
  type("#ref-list-query", "dodge");
  assert.equal(listFilter("skills").query, "", "nothing hears the field after the screen is left");
  renderRefSection("skills");
  renderRefSection("skills");
  assert.equal(view.listeners.get("input").length, 2, "the list's search and the band's, once each");
  type("#ref-list-query", "dodge");
  assert.equal(listFilter("skills").query, "dodge");
});

test("the 2.x list screen and its filters are gone, and the router draws the new one", () => {
  for (const gone of ["src/screens/section.mjs", "src/components/filters.mjs"]) assert.equal(existsSync(new URL(`../${gone}`, import.meta.url)), false, gone);
  const router = read("src/core/router.mjs");
  assert.match(router, /refSection: \(\{ section \}\) => renderRefSection\(section\),/);
  assert.ok(!router.includes("renderSection"));
});

// The sheet: what the brief fixes, and what the 2.x globals would otherwise decide.

const SHEET = "src/screens/ref/ref.css";

test("a row is 48px: a 28px badge, the name, the type; the name 500 15px, the type 700 11px in capitals", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row", "display"), ["grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row", "grid-template-columns"), ["28px minmax(0, 1fr) auto"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row", "min-height"), ["48px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row__name", "font"), ["500 15px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row__meta", "font"), ["700 11px/1.2 var(--font-body)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row__meta", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row__meta--passive", "color"), ["var(--danger)"]);
});

test("the badge is a 28px square, white on its category's colour", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-badge", "width"), ["28px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-badge", "height"), ["28px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-badge", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-badge", "font"), ["700 14px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-badge", "color"), ["var(--on-accent)"]);
  for (const tone of ["agility", "devious", "general", "mutation", "passing", "strength", "trait"]) {
    assert.deepEqual(valuesOf(SHEET, `.g-ref-badge--${tone}`, "background"), [`var(--cat-${tone})`], tone);
    assertContrast("--on-accent", [`--cat-${tone}`], 4.5, { what: `the letter on ${tone}` });
  }
});

test("on a phone a split page is two screens: the list, or — with something chosen — its panel", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split .g-ref__panel", "display"), ["none"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split.g-ref--open .g-ref__main", "display"), ["none"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split.g-ref--open .g-ref__panel", "display"), ["block"]);
  const phone = mediaText(SHEET, "max-width: 900px");
  for (const selector of [".g-ref--split .g-ref__panel", ".g-ref--split.g-ref--open .g-ref__main", ".g-ref--split.g-ref--open .g-ref__panel"]) {
    assert.ok(phone.includes(selector), `${selector} is a phone rule`);
  }
});

test("from 901px a list is columns that never wrap: the contents, the list and, with a panel, the panel up to 440px", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref--list .g-ref__body", "display"), ["grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--list .g-ref__body", "grid-template-columns"), ["clamp(140px, 27vw - 129px, 260px) minmax(0, 1fr)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split .g-ref__body", "display"), ["grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split .g-ref__body", "grid-template-columns"), ["clamp(140px, 27vw - 129px, 260px) minmax(0, 1fr) clamp(200px, 42vw - 203px, 440px)"]);
  // The columns at a window's width (the side nav 232, the page's 32 each side, two gaps of 20): DeskRef's at 1440 —
  // contents ≈ 254–260, panel 402, the list one column of rows —, and a list of 300 and more at 1024 (fidelity N6).
  const clamp = (text, width) => {
    const [, low, vw, minus, high] = text.match(/^clamp\((\d+)px, (\d+)vw - (\d+)px, (\d+)px\)$/);
    return Math.min(Number(high), Math.max(Number(low), (Number(vw) * width) / 100 - Number(minus)));
  };
  const [contents, , panel] = valuesOf(SHEET, ".g-ref--split .g-ref__body", "grid-template-columns")[0].split(/ (?=clamp|minmax)/);
  const columns = (width) => {
    const [left, right] = [clamp(contents, width), clamp(panel, width)];
    return [left, width - 232 - 64 - 40 - left - right, right].map(Math.round);
  };
  assert.deepEqual(columns(1440), [260, 442, 402]);
  assert.ok(columns(1024)[1] >= 300, `the list at 1024: ${columns(1024)}`);
  assert.ok(columns(901)[1] >= 220, `the list at 901: ${columns(901)}`);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split .g-ref__panel", "position"), ["sticky"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--split .g-ref__panel", "top"), ["24px"]);
  for (const selector of [".g-ref--list .g-ref__body", ".g-ref--split .g-ref__body"]) {
    assert.deepEqual(valuesOf(SHEET, selector, "flex-flow"), [], `${selector} is not a wrapping row`);
    assert.deepEqual(valuesOf(SHEET, selector, "align-items"), ["start"], `${selector} lets the panel stick`);
  }
});

test("from 901px the rows are a grid of 220px columns in a framed card that scrolls from 720px", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__body", "grid-template-columns"), ["repeat(auto-fill, minmax(min(220px, 100%), 1fr))"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__body", "max-height"), ["720px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__body", "overflow-y"), ["auto"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list", "background"), ["none", "var(--surface)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__subtitle", "grid-column"), ["1 / -1"]);
  assert.deepEqual(valuesOf(SHEET, '.g-ref-row[aria-current="page"]', "box-shadow"), ["var(--ring-selected)"]);
});

test("the list sheet breaks at 900/901 only, and sets the case wherever it sets a font", () => {
  const css = read(SHEET).replace(/\/\*[\s\S]*?\*\//g, "");
  assertBreakpoints(SHEET);
  for (const { selectors, body } of blocks(css)) {
    if (/(?:^|[;\s])font\s*:/.test(body)) assert.match(body, /text-transform\s*:/, `${selectors}: a font without its case`);
    if (/(?:^|[;\s])font\s*:/.test(body)) assert.match(body, /letter-spacing\s*:/, `${selectors}: a font without its tracking`);
  }
});

test("the list's title, count, names, types and hint are readable in every palette", () => {
  assertReadable(SHEET, ".g-ref-list__title", "color", ["--page", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-list__count", "color", ["--page", "--surface"], 4.5);
  assertReadable(SHEET, ".g-ref-list__subtitle", "color", ["--page", "--surface"], 4.5);
  // The row that is open sits on the accent tint.
  assertReadable(SHEET, ".g-ref-row", "color", ["--page", "--surface", "--accent-tint-soft"], 4.5);
  assertReadable(SHEET, ".g-ref-row__meta", "color", ["--page", "--surface", "--accent-tint-soft"], 4.5);
  assertReadable(SHEET, ".g-ref-row__meta--passive", "color", ["--page", "--surface", "--accent-tint-soft"], 4.5);
  assertReadable(SHEET, ".g-ref-pick", "color", ["--page", "--surface"], 4.5);
});

test("every key the lists ask for is in both dictionaries, and the sheet reaches the page", () => {
  assertDictionaryCovers("src/screens/ref/list.mjs");
  assert.ok(read("src/styles.css").includes('@import url("screens/ref/ref.css");'));
});

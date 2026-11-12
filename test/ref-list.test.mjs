import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertContrast, assertReadable, blocks, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints, mediaText } from "./helpers/css.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale, withWindow } from "./helpers/ref-screen.mjs";

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

test("skills: every one, a letter for its category and a link to its page; Active or Passive is the panel's", () => {
  renderRefSection("skills");
  const rows = view.querySelectorAll("a.g-ref-row");
  assert.equal(rows.length, 82);
  assert.equal(view.querySelector("h1").textContent, "Skills");
  assert.equal(view.querySelector(".g-ref-list__count").textContent, "82 of 82");
  const block = view.querySelector('a.g-ref-row[href="#/skills/block"]');
  assert.deepEqual([block.querySelector(".g-ref-badge").textContent, block.querySelector(".g-ref-row__name").textContent], ["G", "Block"]);
  assert.equal(block.textContent.includes("Active"), false, "the row says no type");
  renderRefSection("skills", { selected: referenceData("en").skills.find((page) => page.slug === "skills/block") });
  assert.equal(view.querySelector(".g-ref__panel .g-skill-detail__caption").textContent, "General · Active", "the open skill's panel says it");
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

test("a skill names its category for a screen reader and wears its colour; a trait wears a T", () => {
  renderRefSection("skills");
  const block = view.querySelector('a.g-ref-row[href="#/skills/block"]');
  assert.equal(block.querySelector(".g-sr-only").textContent, "General");
  assert.ok(block.querySelector(".g-ref-badge.g-ref-badge--general"));
  assert.equal(block.querySelector(".g-ref-badge").getAttribute("aria-hidden"), "true");
  renderRefSection("traits");
  const trait = view.querySelector('a.g-ref-row[href="#/traits/always-hungry"]');
  assert.equal(trait.querySelector(".g-ref-badge").textContent, "T");
  assert.ok(trait.querySelector(".g-ref-badge--trait"));
  assert.equal(trait.querySelector(".g-sr-only").textContent, "Trait");
  assertStyled(view, "src/screens/ref/ref.css", "src/screens/ref/article.css", "page-head.css", "list-row.css", "search-field.css", "filter-chips.css");
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
  assert.ok(view.querySelector(".g-ref.g-ref--split"));
  assert.ok(view.querySelector(".g-ref__panel .g-skill-detail"), "the panel stands where the hint did");
  assert.equal(view.querySelector(".g-ref-pick"), null);
  renderRefSection("skills");
  assert.equal(view.querySelectorAll('a.g-ref-row[aria-current="page"]').length, 0, "nothing chosen: no row is marked");
  assert.ok(view.querySelector("h1"), "the list has its heading back");
});

test("traits and inducements get their hints; the lists that are not split have no panel", () => {
  renderRefSection("traits");
  assert.equal(view.querySelector(".g-ref__panel .g-ref-pick").textContent, "Choose a trait to read its rule");
  renderRefSection("inducements");
  assert.ok(view.querySelector(".g-ref.g-ref--split"));
  assert.equal(view.querySelector(".g-ref__panel .g-ref-pick").textContent, "Choose an inducement to read its rule");
  for (const section of ["teams", "star-players", "rules", "cheatsheets"]) {
    renderRefSection(section);
    assert.ok(view.querySelector(".g-ref.g-ref--list"), section);
    assert.equal(view.querySelector(".g-ref__panel"), null, section);
  }
});

test("an inducement's address opens it beside its list on a desk: the row marked, the page's text under its name, the one h1", async () => {
  const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
  renderReferencePage("inducements/biased-referee");
  assert.ok(view.querySelector(".g-ref.g-ref--split .g-ref-list--nav"), "the list keeps its two-line rows");
  assert.deepEqual(view.querySelectorAll('a.g-list-row[aria-current="page"]').map((row) => row.getAttribute("href")), ["#/inducements/biased-referee"]);
  const card = view.querySelector(".g-ref__panel .g-skill-detail");
  assert.equal(card.getAttribute("data-page"), "inducements/biased-referee");
  assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Biased Referee"]);
  assert.equal(card.querySelector(".g-ref-badge"), null, "an inducement has no letter");
  assert.equal(card.querySelector(".g-skill-detail__caption").textContent, "Inducement", "what it is, under its name, as a skill's category");
  assert.ok(card.querySelector(".g-prose p"));
  assert.equal(view.querySelector('.g-ref-toc [aria-current="page"]').getAttribute("href"), "#/ref/inducements");
  assertStyled(view, "src/screens/ref/ref.css", "src/screens/ref/article.css", "src/screens/ref/prose.css", "page-head.css", "list-row.css", "search-field.css");
});

test("on a phone an inducement opens in a sheet over its list, named by it, with no letter", async () => {
  const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
  withWindow({ phone: true }, () => {
    renderReferencePage("inducements/biased-referee");
    const sheet = view.querySelector("dialog#ref-detail");
    assert.ok(sheet.matches(":modal"));
    assert.equal(sheet.querySelector(".g-sheet__title").textContent, "Biased Referee");
    assert.equal(sheet.querySelector(".g-sheet__sub").textContent, "Inducement");
    useLocale("ru");
    renderReferencePage("inducements/biased-referee");
    assert.equal(view.querySelector("dialog#ref-detail .g-sheet__sub").textContent, "Inducement", "the glossary keeps the reference's inducement words English");
    useLocale("en");
    renderReferencePage("inducements/biased-referee");
    assert.equal(sheet.querySelector(".g-ref-badge"), null);
    assert.ok(sheet.querySelector(".g-skill-detail .g-prose"));
    assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), ["Inducements"]);
  });
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

test("an inducement's row says how many, the name and the price — its rule's opening up to the colon — and has no chevron, as a skill's", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    const data = referenceData(locale);
    renderRefSection("inducements");
    const rows = view.querySelectorAll("a.g-list-row");
    assert.equal(rows.length, 24, locale);
    for (const row of rows) {
      const page = data.inducements.find((item) => `#/${item.slug}` === row.getAttribute("href"));
      assert.equal(row.querySelector(".g-list-row__desc").textContent, page.text.slice(0, page.text.indexOf(":")).trim(), `${locale}: ${page.title}`);
      assert.equal(row.querySelector(".g-icon"), null, `${locale}: ${page.title}`);
    }
  }
  useLocale("en");
  renderRefSection("inducements");
  assert.equal(view.querySelector('a.g-list-row[href="#/inducements/additional-training"] .g-list-row__desc').textContent, "0-6 Additional Training (85k)");
  assert.equal(view.querySelector('a.g-list-row[href="#/inducements/biased-referee"] .g-list-row__desc').textContent, "0-1 Biased Referee (100k, or 60k for Bribery and Corruption)");
  renderRefSection("star-players");
  assert.ok(view.querySelector("a.g-list-row .g-icon"), "a row that leads to a page of its own keeps its chevron");
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
  renderRefSection("traits");
  assert.equal(view.querySelector('a.g-ref-row[href="#/traits/always-hungry"] .g-ref-badge').textContent, "T", "a trait's letter is the English one, as a skill's");
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

test("a row is 48px: a 28px badge and the name, 500 15px", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row", "display"), ["grid"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row", "grid-template-columns"), ["28px minmax(0, 1fr)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row", "min-height"), ["48px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-row__name", "font"), ["500 15px/1.3 var(--font-body)"]);
  assert.equal(read(SHEET).includes("g-ref-row__meta"), false, "the type's styles went with it");
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

test("a phone has no panel: what a split page opens is a sheet over its list, which is never hidden", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref__panel", "display"), ["none"]);
  assert.ok(mediaText(SHEET, "max-width: 900px").includes(".g-ref__panel"), "a phone rule");
  assert.equal(read(SHEET).includes("g-ref--open"), false, "no state shows the panel instead of the list");
});

test("from 901px every page is the Skills page's grid: the contents, the main column, the panel's column, empty where there is no panel", () => {
  const desk = mediaText(SHEET, "min-width: 901px");
  assert.deepEqual(valuesOf(SHEET, ".g-ref__body", "display"), ["flex", "grid"], "a phone's column, a desk's grid");
  assert.deepEqual(valuesOf(SHEET, ".g-ref__body", "grid-template-columns"), ["var(--ref-nav) minmax(0, 1fr) var(--ref-side)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref__body", "align-items"), ["start"], "the panel can stick");
  assert.ok(desk.includes(".g-ref__body {"), "the grid is a desk rule");
  // Every page's content is the main column: no page breaks out of it, so all of them are one width at a window's width.
  for (const layout of ["list", "split", "article"]) assert.deepEqual(valuesOf(SHEET, `.g-ref--${layout} .g-ref__main`, "grid-column"), ["2"], layout);
  assert.deepEqual(valuesOf(SHEET, ".g-ref--index .g-ref__main", "grid-column"), ["1 / 3"], "the index has no contents: it starts at the left, ends where every page ends");
  assert.equal(read(SHEET).replace(/\/\*[\s\S]*?\*\//g, "").match(/:has\(\.g-ref-skilltable|--ref-(mid|read)/), null, "no page, the Skill Table's among them, is wider than the main column");
  assert.deepEqual(valuesOf(SHEET, ".g-ref__panel", "grid-column"), ["3"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-toc", "grid-column"), ["1"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-results", "max-width"), [], "search results are as wide as every list");
  // The columns at a window's width (the side nav 232, the page's 32 each side, two gaps of 20).
  const clamp = (text, width) => {
    const [, low, vw, minus, high] = text.match(/^clamp\((\d+)px, (\d+)vw - (\d+)px, (\d+)px\)$/);
    return Math.min(Number(high), Math.max(Number(low), (Number(vw) * width) / 100 - Number(minus)));
  };
  const [nav] = valuesOf(SHEET, ".g-ref", "--ref-nav");
  const [side] = valuesOf(SHEET, ".g-ref", "--ref-side");
  const columns = (width) => [clamp(nav, width), width - 232 - 64 - 40 - clamp(nav, width) - clamp(side, width), clamp(side, width)].map(Math.round);
  assert.deepEqual(columns(1440), [220, 484, 400]);
  assert.deepEqual(columns(1920), [220, 964, 400]);
  assert.ok(columns(1024)[1] >= 300, `the main column at 1024: ${columns(1024)}`);
  assert.ok(columns(901)[1] >= 220, `the main column at 901: ${columns(901)}`);
  assert.deepEqual(valuesOf(SHEET, ".g-ref__panel", "position"), ["sticky"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref__panel", "top"), ["24px"]);
});

test("from 901px the rows are a grid of 220px columns in a framed card, and the page scrolls, not the rows", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__body", "grid-template-columns"), ["repeat(auto-fill, minmax(min(220px, 100%), 1fr))"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__body", "max-height"), []);
  // In columns no row of the last line keeps a line under it: the line is over each row, the first lying on the head's rule.
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list--nav .g-ref-list__body .g-list-row", "border-top"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list--nav .g-ref-list__body .g-list-row", "border-bottom"), ["0"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list--nav .g-ref-list__body", "margin-top"), ["-1px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__body", "overflow-y"), []);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list", "background"), ["none", "var(--surface)"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__subtitle", "grid-column"), ["1 / -1"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__subtitle", "font"), ["700 24px/1.2 var(--font-display)"], "a group's heading is a card title, as the season page's");
  assert.deepEqual(valuesOf(SHEET, ".g-ref-list__subtitle", "margin"), ["var(--space-24) 0 var(--space-8)"]);
  assert.deepEqual(valuesOf(SHEET, '.g-ref-row[aria-current="page"]', "box-shadow"), ["var(--ring-selected)"]);
  assert.deepEqual(valuesOf(SHEET, '.g-ref-row[aria-current="page"] .g-ref-row__name', "font-weight"), [], "the open row's name keeps its weight, so its width");
});

test("on a phone the chips row scrolls with no bar under the chips; a desk keeps the bar", () => {
  const CHIPS = "src/ui/filter-chips.css";
  const phone = mediaText(CHIPS, "max-width: 900px");
  assert.match(phone, /\.g-chips\s*\{[^}]*scrollbar-width:\s*none/);
  assert.match(phone, /\.g-chips::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(read(CHIPS).replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, ""), /scrollbar-width/, "outside the phone's rule the bar is the browser's");
  assert.deepEqual(valuesOf(CHIPS, ".g-chips", "overflow-x"), ["auto"]);
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
  assertReadable(SHEET, ".g-ref-pick", "color", ["--page", "--surface"], 4.5);
});

test("every key the lists ask for is in both dictionaries, and the sheet reaches the page", () => {
  assertDictionaryCovers("src/screens/ref/list.mjs");
  assert.ok(read("src/styles.css").includes('@import url("screens/ref/ref.css");'));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import "./helpers/ui.mjs"; // the real dictionaries
import { initLocale } from "../src/core/i18n.mjs";
import { REF_SECTIONS } from "../src/core/routes.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import {
  REF_GROUPS, SECTION_COLLECTIONS, articleNeighbours, groupTitle, itemKeyOf, overviewUrl, pageForName, refGroups, sectionDescription, sectionPages, sectionTitle,
} from "../src/screens/ref/catalog.mjs";

const data = (locale) => expandCollections(JSON.parse(readFileSync(new URL(`../public/data.${locale}.json`, import.meta.url), "utf8")));
const en = data("en");
const ru = data("ru");
const dictionaries = Object.fromEntries(["en", "ru"].map((l) => [l, JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), "utf8"))]));
const keys = (group) => group.items.map((item) => item.key);

test("four groups, in the order a coach reaches for them, and every page they name is in both vaults", () => {
  const groups = refGroups(en, { overviewCount: 7 });
  assert.deepEqual(groups.map((group) => group.key), ["match", "players", "teams", "league"]);
  assert.deepEqual(groups[0].items.map((item) => item.title), ["Weather", "Kick-off Table", "Prayers to Nuffle", "Casualties", "Inducements"]);
  for (const group of REF_GROUPS) for (const item of group.items.filter((entry) => entry.page)) {
    for (const vault of [en, ru]) assert.ok(vault.pages.some((page) => page.id === item.page), item.page);
  }
  assert.deepEqual(refGroups(ru).map(keys), refGroups(en).map(keys));
});

test("a section counts its list, and the league rules count the overview cards too", () => {
  const items = refGroups(en, { overviewCount: 7 }).flatMap((group) => group.items);
  const count = (key) => items.find((item) => item.key === key).count;
  assert.deepEqual([count("skills"), count("traits"), count("teams"), count("star-players"), count("inducements"), count("rules")], [82, 38, 37, 75, 24, 12]);
  assert.equal(items.find((item) => item.key === "skills").href, "#/ref/skills");
  assert.equal(items.find((item) => item.key === "general-information-weather").href, "#/weather");
  assert.equal(sectionPages(en, "cheatsheets").length, 0);
});

test("a page lights its own item, a list member lights its list, and a page outside both lights nothing", () => {
  const bySlug = (slug) => en.pages.find((page) => page.slug === slug);
  assert.equal(itemKeyOf(bySlug("weather")), "general-information-weather");
  assert.deepEqual(["teams/human", "skills/block", "traits/loner-x", "inducements/bribe", "rules/1-league-basics"].map((slug) => itemKeyOf(bySlug(slug))),
    ["teams", "skills", "traits", "inducements", "rules"]);
  assert.equal(itemKeyOf(bySlug("rotten-rick-bupkeis")), "star-players");
  assert.equal(itemKeyOf(bySlug("reference-sources")), null);
});

test("the articles of the groups page through in order; the ends have no neighbour", () => {
  const { prev, next } = articleNeighbours(en, "general-information-casualties");
  assert.deepEqual([prev.title, next.title], ["Prayers to Nuffle", "Player Advancement"]);
  assert.equal(articleNeighbours(en, "general-information-weather").prev, null);
  assert.equal(articleNeighbours(en, "general-information-all-gata-changes").next, null);
  assert.deepEqual(articleNeighbours(en, "reference-sources"), { prev: null, next: null });
});

test("a name in a roster finds its page whatever the spelling", () => {
  const slugOf = (name) => pageForName(en, name)?.slug ?? null;
  assert.deepEqual(["Block", "Bone Head", "Loner (3+)", "Mighty Blow (+1)", "Side Step", "No Such Skill"].map(slugOf),
    ["skills/block", "traits/bonehead", "traits/loner-x", "skills/mighty-blow-1", "skills/sidestep", null]);
});

test("a parameter that is a word stands for the template page: Animosity (All) is Animosity (X), Hatred (Troll) is Hatred (X)", () => {
  const slugOf = (name) => pageForName(en, name)?.slug ?? null;
  assert.deepEqual(["Animosity (All)", "Animosity (Underworld Goblin Linemen)", "Hatred (Troll)", "Animosity (X)", "  Hatred  (Troll) "].map(slugOf),
    ["traits/animosity-x", "traits/animosity-x", "traits/hatred-x", "traits/animosity-x", "traits/hatred-x"]);
  assert.equal(slugOf("Mighty Blow (+3)"), null, "a number is the skill's own: it has its page or the template's, never the plain skill's");
  assert.equal(slugOf("Block (All)"), null, "a template the vault does not have is no page");
});

// A position's skills that have no page to link to. A name added here is a decision about the vault, not a way to a green test.
const EXPECTED_UNLINKED = [];

test("every skill of every position of every team has a page to link to, in both vaults", () => {
  for (const [locale, vault] of [["en", en], ["ru", ru]]) {
    const unlinked = new Set();
    let checked = 0;
    for (const team of vault.teams) for (const row of rowsForTeam(team)) for (const skill of row.skills ?? []) {
      checked += 1;
      if (!pageForName(vault, skill)) unlinked.add(`${team.slug}: ${skill}`);
    }
    assert.ok(checked > 100, `${locale}: the walk saw ${checked} skills`);
    assert.deepEqual([...unlinked].sort(), EXPECTED_UNLINKED, locale);
  }
});

test("every skill and every trait is found under its own title, and a name in no Latin letters is nobody's", () => {
  for (const vault of [en, ru]) for (const page of [...vault.skills, ...vault.traits]) assert.equal(pageForName(vault, page.title)?.slug, page.slug, page.title);
  assert.equal(pageForName(ru, "Блок"), null);
  assert.equal(pageForName({ pages: [{ title: "Блок", slug: "block" }] }, "Ёж"), null, "two names with no letters of the key's alphabet are not the same name");
  assert.equal(pageForName({ pages: [{ title: "Блок", slug: "block" }] }, "Блок")?.slug, "block", "but a title is still found as it is written");
});

test("every description the groups and the league rules ask for is in both dictionaries", () => {
  const ids = [...REF_GROUPS.flatMap((group) => group.items.filter((item) => item.page).map((item) => item.page)), ...sectionPages(en, "rules").map((page) => page.id)];
  for (const id of ids) for (const locale of ["en", "ru"]) assert.ok(dictionaries[locale][`preview.${id}`], `${locale}: preview.${id}`);
});

test("every section the router knows has its collection, and every collection is in both vaults", () => {
  assert.deepEqual(Object.keys(SECTION_COLLECTIONS).sort(), [...REF_SECTIONS].sort());
  for (const vault of [en, ru]) for (const section of REF_SECTIONS) assert.ok(Array.isArray(sectionPages(vault, section)), section);
  assert.deepEqual(sectionPages({}, "skills"), []);
  assert.deepEqual(sectionPages(en, "nonsense"), []);
});

test("group and section names speak the language of the page, not a dictionary key", () => {
  const names = () => [...REF_GROUPS.map((group) => groupTitle(group.key)), ...[...REF_SECTIONS].flatMap((section) => [sectionTitle(section), sectionDescription(section)])];
  const spoken = {};
  try {
    for (const locale of ["en", "ru"]) {
      initLocale(locale);
      spoken[locale] = names();
    }
  } finally {
    initLocale("en");
  }
  for (const locale of ["en", "ru"]) for (const text of spoken[locale]) assert.doesNotMatch(text, /^\w+(\.\w+)+$/, `${locale}: ${text}`);
  assert.deepEqual(spoken.en.slice(0, 4), ["Before and during a match", "Players", "Teams", "League"]);
  assert.deepEqual(spoken.ru.slice(0, 4), ["Перед матчем и в игре", "Игроки", "Команды", "Лига"]);
});

test("an overview card is addressed by its slug, encoded", () => {
  assert.equal(overviewUrl({ slug: "league-basics" }), "#/overview/league-basics");
  assert.equal(overviewUrl({ slug: "a b/c" }), "#/overview/a%20b%2Fc");
});

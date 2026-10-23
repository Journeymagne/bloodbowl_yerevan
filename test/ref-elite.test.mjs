/**
 * The elite combination in a skill's panel (DeskRef: under «Случайный бросок», «Элитная комбинация» —
 * «с Mighty Blow · +15k», a skill of no pair «—»). The pairs and the surcharge are the league's rules
 * (`eliteSkillCombos`, `eliteComboCost` in domain/league-rules.mjs; `Rules/3. Team Management.md`, «Elite
 * Combos»): four pairs, one more than the prototype's three (Sneaky Git + Dirty Player, PR #24).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { parseHtml } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { mountView, referenceData, useLocale } from "./helpers/ref-screen.mjs";

const view = mountView();
const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
const { eliteOf, skillDetailMarkup } = await import("../src/screens/ref/skill.mjs");
const { eliteComboCost, eliteSkillCombos } = await import("../src/domain/league-rules.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");

const ARTICLE = "src/screens/ref/article.css";
const REF = "src/screens/ref/ref.css";
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionaries = { en: JSON.parse(read("src/i18n/en.json")), ru: JSON.parse(read("src/i18n/ru.json")) };
const draw = (markup) => parseHtml(document, markup);
const pageOf = (slug) => state.data.pages.find((page) => page.slug === slug);

/** The panel's lines, label and value, in their order. */
const facts = (root) => root.querySelectorAll(".g-skill-detail__facts .g-kv")
  .map((row) => [row.querySelector(".g-kv__label").textContent, row.querySelector(".g-kv__value").textContent]);
const eliteLine = (root) => facts(root).find(([label]) => label === "Elite combination" || label === "Элитная комбинация");

beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  state.myTeams.items = [];
  state.activeTeamId = null;
});

test("a skill of an elite pair names its partner and the surcharge", () => {
  // The league's rule, not the prototype's: 15k, and Sneaky Git + Dirty Player is a pair too.
  assert.equal(eliteComboCost, 15);
  assert.deepEqual(eliteOf("Claws"), { partners: ["Mighty Blow"], surcharge: 15 });
  assert.deepEqual(eliteOf("Sneaky Git"), { partners: ["Dirty Player"], surcharge: 15 });
  assert.deepEqual(eliteOf("Dirty Player"), { partners: ["Sneaky Git"], surcharge: 15 });

  renderReferencePage("skills/claws");
  const panel = view.querySelector(".g-ref__panel .g-skill-detail");
  assert.deepEqual(eliteLine(panel), ["Elite combination", "with Mighty Blow · +15k"]);
  // Under the random roll, as DeskRef has it.
  assert.deepEqual(facts(panel).map(([label]) => label), ["Random roll", "Elite combination"]);
  renderReferencePage("skills/sneaky-git");
  assert.deepEqual(eliteLine(view), ["Elite combination", "with Dirty Player · +15k"]);

  // Every half of every pair has a page, and that page names the other half.
  for (const [one, other] of eliteSkillCombos) {
    for (const [skill, partner] of [[one, other], [other, one]]) {
      const page = state.data.pages.find((item) => item.kind === "skill" && item.title === skill);
      assert.ok(page, `${skill} has a page in the vault`);
      assert.deepEqual(eliteLine(draw(skillDetailMarkup({ data: state.data, page }))), ["Elite combination", `with ${partner} · +15k`], skill);
    }
  }
});

test("a skill with a parameter is found under its name: Mighty Blow (+1) is the Mighty Blow of the pair", () => {
  assert.deepEqual(eliteOf("Mighty Blow (+1)"), { partners: ["Claws"], surcharge: 15 });
  assert.deepEqual(eliteOf("Mighty Blow (+2)"), { partners: ["Claws"], surcharge: 15 });
  renderReferencePage("skills/mighty-blow-1");
  assert.deepEqual(eliteLine(view), ["Elite combination", "with Claws · +15k"]);
});

test("a skill outside the pairs says —; a trait has no such row", () => {
  assert.equal(eliteOf("Block"), null);
  assert.equal(eliteOf(""), null);
  renderReferencePage("skills/block");
  assert.deepEqual(eliteLine(view), ["Elite combination", "—"]);
  renderReferencePage("traits/throw-team-mate");
  const panel = view.querySelector(".g-ref__panel .g-skill-detail");
  assert.equal(panel.querySelector(".g-kv"), null, "a trait has neither the roll nor the elite line");
  assert.equal(panel.querySelector(".g-skill-detail__facts"), null);
});

test("every key in both dictionaries, with the same placeholders; in Russian the words are Russian and the names the vault's", () => {
  assertDictionaryCovers("src/screens/ref/skill.mjs");
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  for (const key of ["ref.skill.elite", "ref.skill.eliteWith", "ref.skill.eliteNone"]) {
    assert.ok(dictionaries.en[key] && dictionaries.ru[key], key);
    assert.deepEqual(placeholders(dictionaries.ru[key]), placeholders(dictionaries.en[key]), key);
  }
  assert.equal(dictionaries.en["ref.skill.elite"], "Elite combination");
  assert.equal(dictionaries.ru["ref.skill.elite"], "Элитная комбинация");
  assert.equal(dictionaries.en["ref.skill.eliteWith"], "with {skills} · +{price}");
  assert.equal(dictionaries.ru["ref.skill.eliteWith"], "с {skills} · +{price}");
  assert.equal(dictionaries.en["ref.skill.eliteNone"], "—");
  assert.equal(dictionaries.ru["ref.skill.eliteNone"], "—");

  useLocale("ru");
  assert.ok(referenceData("ru").pages.some((page) => page.slug === "skills/claws"));
  renderReferencePage("skills/claws");
  assert.deepEqual(eliteLine(view), ["Элитная комбинация", "с Mighty Blow · +15k"]);
  renderReferencePage("skills/block");
  assert.deepEqual(eliteLine(view), ["Элитная комбинация", "—"]);
});

test("the roll and the elite line stand under one rule, each over its own, 15px with a quiet label and a 700 value (DeskRef)", () => {
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__facts", "display"), ["flex"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__facts", "flex-direction"), ["column"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__facts", "border-top"), ["1px solid var(--line)"]);
  // The line under each is the row's own (ui/list-row.css); a second line above it would double the rule between them.
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail .g-kv", "border-top"), []);
  assert.deepEqual(valuesOf("src/ui/list-row.css", ".g-kv", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf("src/ui/list-row.css", ".g-kv", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__facts .g-kv", "font-size"), ["15px"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__facts .g-kv__label", "color"), ["var(--muted)"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__facts .g-kv__value", "font-weight"), ["700"]);
  assertReadable(ARTICLE, ".g-skill-detail__facts .g-kv__label", "color", ["--surface", "--page"], 4.5);
  // A long value wraps rather than runs out of the panel.
  assert.ok(!read(ARTICLE).replace(/\/\*[\s\S]*?\*\//g, "").match(/\.g-skill-detail__facts[^{]*\{[^}]*text-overflow/), "no ellipsis on the lines");

  renderReferencePage("skills/claws");
  // The page's band is the page head since stage 13 (Task 4).
  assertStyled(view, REF, "page-head.css", ARTICLE, "list-row.css", "search-field.css", "filter-chips.css");
});

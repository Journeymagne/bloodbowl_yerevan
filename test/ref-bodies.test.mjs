import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertReadable, blocks, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale } from "./helpers/ref-screen.mjs";

const view = mountView();
const { leaguesBody, rollSkill, skillTableBody, starsForLeague, teamsForLeague, wireSkillTableRoller } = await import("../src/screens/ref/bodies.mjs");
const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
const { rollerState, setRoller } = await import("../src/screens/ref/memory.mjs");
const { leagueAccessNames } = await import("../src/domain/league-rules.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { t } = await import("../src/core/i18n.mjs");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const draw = (markup) => parseHtml(document, markup);
const click = (selector) => fireEvent(view.querySelector(selector), "click");

/** Run `body` with Math.random answering `values` in turn (the last one for ever after), and count what it was asked. */
function withRandom(values, body) {
  const real = Math.random;
  let asked = 0;
  Math.random = () => values[Math.min(asked++, values.length - 1)];
  try {
    body();
  } finally {
    Math.random = real;
  }
  return asked;
}

// Every page starts as a coach finds it on arrival: English, the die on its first column, not thrown.
beforeEach(() => {
  releaseCurrentScreen();
  useLocale("en");
  setRoller({});
});

test("Leagues lists each league's teams and stars as links, by the 2.x rules", () => {
  renderReferencePage("leagues");
  assert.equal(view.querySelectorAll(".g-ref-league").length, leagueAccessNames.length);
  const human = teamsForLeague(state.data, "Old World Classic").map((page) => page.slug);
  assert.ok(human.includes("teams/human"));
  assert.ok(view.querySelector('.g-ref-league a[href="#/teams/human"]'));
});

test("each league says how many teams and star players it has, and links every one of them", () => {
  renderReferencePage("leagues");
  const sections = view.querySelectorAll(".g-ref-league");
  leagueAccessNames.forEach((league, at) => {
    const teams = teamsForLeague(state.data, league);
    const stars = starsForLeague(state.data, league);
    const section = sections[at];
    assert.equal(section.querySelector("h2").textContent, league);
    assert.equal(section.querySelector(".g-ref-league__sum").textContent, `${teams.length} teams · ${stars.length} star players`, league);
    assert.deepEqual(section.querySelectorAll("h3").map((h) => h.textContent), ["Teams", "Star Players"], league);
    const links = section.querySelectorAll(".g-ref-links");
    assert.deepEqual(links[0].querySelectorAll("a").map((a) => a.getAttribute("href")), teams.map((page) => `#/${page.slug}`), league);
    assert.deepEqual(links[1].querySelectorAll("a").map((a) => a.getAttribute("href")), stars.map((page) => `#/${page.slug}`), league);
  });
  assert.equal(view.querySelectorAll("h1").length, 1);
  assertCspSafe(view);
});

test("a team is in the leagues its rules name; a star player in the leagues its availability names, 'any team' meaning every one but the exceptions", () => {
  const slugs = (pages) => pages.map((page) => page.slug);
  assert.ok(slugs(teamsForLeague(state.data, "Sylvanian Spotlight")).includes("teams/vampire"));
  assert.ok(!slugs(teamsForLeague(state.data, "Halfling Thimble Cup")).includes("teams/vampire"));
  assert.ok(slugs(starsForLeague(state.data, "Sylvanian Spotlight")).includes("rotten-rick-bupkeis"));
  assert.ok(!slugs(starsForLeague(state.data, "Old World Classic")).includes("rotten-rick-bupkeis"));
  assert.ok(slugs(starsForLeague(state.data, "Old World Classic")).includes("morg-n-thorg"), "Any Team except Sylvanian Spotlight");
  assert.ok(!slugs(starsForLeague(state.data, "Sylvanian Spotlight")).includes("morg-n-thorg"));
  for (const league of leagueAccessNames) assert.ok(slugs(starsForLeague(state.data, league)).includes("akhorne-the-squirrel"), `Any Team: ${league}`);
  const sorted = teamsForLeague(state.data, "Old World Classic").map((page) => page.title);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a.localeCompare(b, "en")), "by name");
});

test("a league with nobody in it says so, and a name a person could have typed is text", () => {
  const league = leagueAccessNames[0];
  const hostile = { title: HOSTILE, slug: "teams/hostile", team: { meta: { specialRules: league } } };
  const fragment = draw(leaguesBody({ teams: [hostile], starPlayers: [] }));
  const first = fragment.querySelectorAll(".g-ref-league")[0];
  assert.equal(first.querySelector(".g-ref-links a").textContent, HOSTILE);
  assert.equal(first.querySelector("img"), null);
  assert.deepEqual(first.querySelectorAll(".g-ref-links").map((p) => p.textContent), [HOSTILE, "No star players"]);
  const second = fragment.querySelectorAll(".g-ref-league")[1];
  assert.deepEqual(second.querySelectorAll(".g-ref-links").map((p) => p.textContent), ["No teams", "No star players"]);
  assert.equal(second.querySelector(".g-ref-league__sum").textContent, "0 teams · 0 star players");
  assertCspSafe(fragment);
  assert.equal(draw(leaguesBody({})).querySelectorAll(".g-ref-league").length, leagueAccessNames.length, "a vault with no teams or stars has the leagues, empty");
});

test("a roll lands on a skill of the chosen column, every face as likely: a D16 with the empty faces rolled again", () => {
  const column = (category) => state.data.skillGroups.find((group) => group.category === category).skills;
  assert.deepEqual(rollSkill(state.data, "Devious", () => 0), { category: "Devious", face: 1, skill: column("Devious")[0] });
  assert.equal(rollSkill(state.data, "Devious", () => 0.9999).face, column("Devious").length);
  assert.equal(rollSkill(state.data, "General", () => 0.9999).face, 16);
  assert.equal(rollSkill(state.data, "Agility").category, "Agility", "Math.random by default");
  assert.throws(() => rollSkill(state.data, "Nope", () => 0), /Nope/);
});

// The owner's rule is a D16 whose blank faces are rolled again. Drawing a face from 1 to the column's length is the same
// throw only while each column's skills sit on faces 1 to N, with no blank face in the middle: so say it, for both vaults.
test("every column of the Skill Table sits on faces 1 to N with no gap, so a roll over N is the D16 with the blanks rolled again", () => {
  for (const locale of ["en", "ru"]) {
    const data = referenceData(locale);
    const table = draw(data.pages.find((page) => page.id === "skills-and-traits-skill-table").html);
    const rows = table.querySelectorAll("tbody tr").map((row) => row.querySelectorAll("td").map((cell) => cell.textContent.trim()));
    assert.equal(table.querySelectorAll("thead th").map((cell) => cell.textContent.trim()).join("|"), ["#", ...data.skillGroups.map((group) => group.category)].join("|"), locale);
    assert.deepEqual(rows.map((row) => row[0]), Array.from({ length: 16 }, (_, at) => String(at + 1)), `${locale}: a D16`);
    data.skillGroups.forEach(({ category, skills }, at) => {
      const faces = rows.flatMap((row) => (row[at + 1] ? [Number(row[0])] : []));
      assert.deepEqual(faces, Array.from({ length: skills.length }, (_, face) => face + 1), `${locale}: ${category} has a blank face in the middle`);
      assert.deepEqual(rows.slice(0, skills.length).map((row) => row[at + 1]), skills, `${locale}: ${category} is the table's column`);
      assert.ok(skills.length >= 1 && skills.length <= 16, `${locale}: ${category}`);
    });
  }
});

test("the roller shows a D16 and the face it rolled, and links the skill it landed on", () => {
  setRoller({ category: "Strength", face: 8, skill: "Mighty Blow" });
  renderReferencePage("skill-table");
  assert.equal(view.querySelector(".g-ref-roller .g-die").getAttribute("aria-label"), t("ui.die.rolled", { type: "D16", value: 8 }));
  assert.equal(view.querySelector(".g-ref-roller a").getAttribute("href"), "#/skills/mighty-blow");
  fireEvent(view.querySelector('[data-chip-value="Agility"]'), "click");
  assert.equal(view.querySelector(".g-ref-roller .g-die .g-die__value").textContent, "?");
});

test("the roller has not thrown yet: a D16 waiting, the category's chip on, and a hint instead of a skill", () => {
  renderReferencePage("skill-table");
  const roller = view.querySelector(".g-ref-roller");
  assert.equal(roller.getAttribute("aria-label"), "Skill randomizer");
  assert.equal(roller.querySelector(".g-die").getAttribute("aria-label"), t("ui.die.waiting", { type: "D16" }));
  assert.equal(roller.querySelector("a"), null);
  assert.equal(roller.querySelector(".g-ref-roller__skill").textContent, "Pick a category and roll the D16");
  assert.equal(roller.querySelector(".g-ref-roller__skill").getAttribute("role"), "status");
  assert.equal(roller.querySelector(".g-chips").getAttribute("aria-label"), "Skill group");
  assert.deepEqual(roller.querySelectorAll(".g-chip").map((chip) => chip.getAttribute("data-chip-value")), state.data.skillGroups.map((group) => group.category));
  assert.equal(roller.querySelector('.g-chip[aria-checked="true"]').getAttribute("data-chip-value"), "Agility");
  assert.equal(roller.querySelector("button.g-btn--primary[data-roll-skill]").textContent, "Roll");
});

test("Roll throws for the chosen column and the page shows it; a category chip clears the throw and keeps the choice", () => {
  renderReferencePage("skill-table");
  const agility = state.data.skillGroups.find((group) => group.category === "Agility").skills;
  const asked = withRandom([0.5], () => click("[data-roll-skill]"));
  assert.equal(asked, 1);
  assert.deepEqual(rollerState(), { category: "Agility", face: 8, skill: agility[7] });
  assert.equal(view.querySelector(".g-ref-roller .g-die__value").textContent, "8");
  assert.equal(view.querySelector(".g-ref-roller a").textContent, agility[7]);
  click('[data-chip-value="Devious"]');
  assert.deepEqual(rollerState(), { category: "Devious", face: null, skill: "" });
  assert.equal(view.querySelector('.g-ref-roller .g-chip[aria-checked="true"]').getAttribute("data-chip-value"), "Devious");
  assert.equal(view.querySelector(".g-ref-roller a"), null);
  withRandom([0.9999], () => click("[data-roll-skill]"));
  assert.equal(view.querySelector(".g-ref-roller .g-die__value").textContent, "9", "Devious has nine skills");
});

test("the throw is remembered while the page lives: another article and back finds the die as it was", () => {
  renderReferencePage("skill-table");
  click('[data-chip-value="Mutation"]');
  withRandom([0], () => click("[data-roll-skill]"));
  renderReferencePage("weather");
  renderReferencePage("skill-table");
  assert.equal(view.querySelector('.g-ref-roller .g-chip[aria-checked="true"]').getAttribute("data-chip-value"), "Mutation");
  assert.equal(view.querySelector(".g-ref-roller .g-die__value").textContent, "1");
  assert.equal(view.querySelector(".g-ref-roller a").getAttribute("href"), "#/skills/big-hand");
});

test("a remembered category the vault does not have is the first column, and a throw is then that column's", () => {
  setRoller({ category: "Nonsense", face: 3, skill: "Dodge" });
  renderReferencePage("skill-table");
  assert.equal(view.querySelector('.g-ref-roller .g-chip[aria-checked="true"]').getAttribute("data-chip-value"), "Agility");
  assert.equal(view.querySelector(".g-ref-roller .g-die__value").textContent, "?", "a face of another column is not shown");
  withRandom([0], () => click("[data-roll-skill]"));
  assert.deepEqual(rollerState(), { category: "Agility", face: 1, skill: "Catch" });
  setRoller({ category: "Strength", face: 8, skill: "Not On The Strength Column" });
  renderReferencePage("skill-table");
  assert.equal(view.querySelector(".g-ref-roller .g-die__value").textContent, "?", "a skill that is not on that face is not shown");
});

test("drawing the page again does not hear a click twice, and leaving the page stops hearing it", () => {
  renderReferencePage("skill-table");
  renderReferencePage("skill-table");
  assert.equal(withRandom([0.5], () => click("[data-roll-skill]")), 1);
  releaseCurrentScreen();
  const before = rollerState();
  assert.equal(withRandom([0.1], () => click("[data-roll-skill]")), 0);
  click('[data-chip-value="Passing"]');
  assert.deepEqual(rollerState(), before);
});

test("the roller is wired by its own chip group and answers a redraw, whatever else is on the root", () => {
  const root = mountView();
  releaseCurrentScreen();
  useLocale("en");
  root.innerHTML = skillTableBody(state.data, { html: "<table></table>" }, rollerState())
    + `<div class="g-chips" role="radiogroup" data-chip-group="other"><button type="button" class="g-chip" data-chip-value="x" aria-checked="false">x</button><button type="button" class="g-chip" data-chip-value="y" aria-checked="true">y</button></div>`;
  let redraws = 0;
  const stop = wireSkillTableRoller(root, () => { redraws += 1; });
  fireEvent(root.querySelector('[data-chip-value="x"]'), "click");
  assert.equal(redraws, 0, "another group's chip is not the roller's");
  assert.equal(rollerState().category, "Agility");
  fireEvent(root.querySelector('.g-ref-roller [data-chip-value="Passing"]'), "click");
  assert.deepEqual([redraws, rollerState().category], [1, "Passing"]);
  stop();
  fireEvent(root.querySelector('.g-ref-roller [data-chip-value="General"]'), "click");
  assert.deepEqual([redraws, rollerState().category], [1, "Passing"], "stopped");
  root.innerHTML = "";
});

test("on a phone the Skill Table is a numbered list per category; on a desktop it is the vault's table", () => {
  renderReferencePage("skill-table");
  assert.equal(view.querySelectorAll(".g-ref-skilltable h2").length, 6);
  assert.equal(view.querySelectorAll(".g-ref-skilltable ol").at(0).querySelectorAll("li").length, 14);
  assert.ok(view.querySelector(".g-ref-skilltable__desk table"));
});

test("a phone's lists are the table's columns, face by face, each skill a link to its page; the roller comes first", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    renderReferencePage("skill-table");
    const section = view.querySelector(".g-ref-skilltable");
    assert.equal(section.getAttribute("aria-label"), t("skills.tableByCategoryRegion"), locale);
    assert.deepEqual(section.querySelectorAll("h2").map((h) => h.textContent), state.data.skillGroups.map((group) => group.category), locale);
    const lists = section.querySelectorAll("ol");
    state.data.skillGroups.forEach(({ skills }, at) => {
      assert.deepEqual(lists[at].querySelectorAll("li").map((li) => li.textContent), skills, `${locale}: ${at}`);
      for (const link of lists[at].querySelectorAll("li a")) assert.match(link.getAttribute("href"), /^#\/skills\/[\w-]+$/, `${locale}: ${link.textContent}`);
      assert.equal(lists[at].querySelectorAll("li a").length, skills.length, `${locale}: every skill is a link`);
    });
    assert.deepEqual(view.querySelector(".g-article").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class")).slice(2, 5),
      ["g-ref-roller", "g-ref-skilltable", "g-prose g-ref-skilltable__desk"], locale);
    assert.deepEqual(view.querySelectorAll("h1").map((h) => h.textContent), [state.data.pages.find((page) => page.id === "skills-and-traits-skill-table").title], locale);
    assertCspSafe(view);
  }
});

test("Kick-off and Prayers are their tables, not 2.x cards", () => {
  for (const slug of ["kick-off-table", "prayers-to-nuffle"]) {
    renderReferencePage(slug);
    assert.ok(view.querySelector(".g-prose table.fit-table"), slug);
    assert.equal(view.querySelector(".reference-table-mobile"), null, slug);
  }
  assertDictionaryCovers("src/screens/ref/bodies.mjs");
});

test("both special bodies draw in both languages, every link on them is one the router lets through, and no page but these two has a roller", () => {
  for (const locale of ["en", "ru"]) {
    useLocale(locale);
    for (const slug of ["leagues", "skill-table"]) {
      renderReferencePage(slug);
      assertNotSentOn(hrefsIn(view.querySelector(".g-article")));
    }
    renderReferencePage("weather");
    assert.equal(view.querySelector(".g-ref-roller"), null);
    assert.equal(view.querySelector(".g-ref-league"), null);
  }
  useLocale("ru");
  renderReferencePage("leagues");
  assert.match(view.querySelector(".g-ref-league__sum").textContent, /^\d+ команд · \d+ звёздных игроков$/);
  renderReferencePage("skill-table");
  assert.equal(view.querySelector(".g-ref-roller__skill").textContent, "Выберите категорию и бросьте D16");
  assert.equal(view.querySelector("[data-roll-skill]").textContent, t("skillRoll.rollButton"));
});

test("the markup the two bodies draw is styled by the reference's sheets", () => {
  setRoller({ category: "Strength", face: 8, skill: "Mighty Blow" });
  for (const slug of ["leagues", "skill-table"]) {
    renderReferencePage(slug);
    assertStyled(view, "src/screens/ref/ref.css", "src/screens/ref/article.css", "src/screens/ref/prose.css", "search-field.css", "filter-chips.css", "die.css", "button.css");
  }
});

test("the 2.x Leagues module is gone, and nothing names it", () => {
  assert.equal(existsSync(new URL("../src/screens/leagues.mjs", import.meta.url)), false);
  for (const file of readdirSync(new URL("../src", import.meta.url), { recursive: true }).filter((name) => /\.(mjs|js|css)$/.test(name))) {
    assert.ok(!/screens\/leagues|isLeaguesPage|renderLeaguesReferencePage|teamsForLeagueAccess/.test(read(`src/${file}`)), `src/${file} still names the 2.x Leagues screen`);
  }
  const article = read("src/screens/ref/article.mjs");
  assert.match(article, /general-information-leagues/);
  assert.match(article, /skills-and-traits-skill-table/);
});

// The sheet.

const SHEET = "src/screens/ref/article.css";

/** The part of the sheet that is for 901px and up, the part for 900px and down, and the rest. */
function parts(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const wide = bare.match(/@media\s*\(min-width: 901px\)\s*\{([\s\S]*)\n\}/)?.[1] ?? "";
  const narrow = [...bare.replace(wide, "").matchAll(/@media\s*\(max-width: 900px\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]).join("\n");
  return { wide, narrow };
}

test("the Skill Table's two shapes: up to 900px the lists, from 901px the vault's table, never both", () => {
  const { wide, narrow } = parts(read(SHEET));
  assert.match(narrow, /\.g-ref-skilltable__desk\s*\{[^}]*display:\s*none/);
  assert.match(wide, /\.g-ref-skilltable\s*\{[^}]*display:\s*none/);
  assert.ok(!/\.g-ref-skilltable__desk\s*\{[^}]*display:\s*none/.test(wide), "the table shows on a desktop");
  assert.ok(!/\.g-ref-skilltable\s*\{[^}]*display:\s*none/.test(narrow), "the lists show on a phone");
  const queries = [...read(SHEET).matchAll(/@media\s*([^{]+)\{/g)].map((match) => match[1].trim());
  for (const query of queries) assert.match(query, /^\((max-width: 900px|min-width: 901px)\)$/);
});

test("the roller is a padded box, so the chips' keyboard ring is not cut by the screen's edge", () => {
  assert.match(valuesOf(SHEET, ".g-ref-roller", "padding")[0], /^var\(--space-(12|14|16|20|24)\)$/);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-roller", "box-sizing"), ["border-box"]);
});

test("what the two bodies write is readable on the page, the card and the roller's box in every palette", () => {
  const grounds = ["--surface", "--surface-2", "--page"];
  assertReadable(SHEET, ".g-ref-league h2", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-league__sum", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-league h3", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-links", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-links--none", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-link", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-roller__hint", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-skilltable h2", "color", grounds, 4.5);
  assertReadable(SHEET, ".g-ref-skilltable li::marker", "color", grounds, 4.5);
});

test("a heading the bodies draw sets its own type, and a link in them is 44px to touch", () => {
  for (const { selectors, body } of blocks(read(SHEET))) {
    if (!selectors.some((selector) => /^\.g-ref-(league|skilltable)\b.*\bh[23]$/.test(selector))) continue;
    assert.match(body, /(^|;|\s)font:/, selectors.join(", "));
    assert.match(body, /text-transform:\s*(none|uppercase)/, selectors.join(", "));
    assert.match(body, /letter-spacing:/, selectors.join(", "));
  }
  assert.deepEqual(valuesOf(SHEET, ".g-ref-skilltable li .g-ref-link", "min-height"), ["44px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-ref-roller__skill .g-ref-link", "min-height"), ["44px"]);
});

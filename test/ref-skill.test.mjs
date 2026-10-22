import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent, parseHtml } from "./helpers/fake-dom.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { assertNotSentOn, hrefsIn, mountView, referenceData, useLocale, withWindow } from "./helpers/ref-screen.mjs";

const view = mountView();
const { renderReferencePage } = await import("../src/screens/ref/article.mjs");
const { badgeMarkup, categoryOf, skillDetailMarkup, skillHolders, skillRoll } = await import("../src/screens/ref/skill.mjs");
const { pageForName } = await import("../src/screens/ref/catalog.mjs");
const { rowsForTeam } = await import("../src/domain/roster/values.mjs");
const { renderRefSection } = await import("../src/screens/ref/list.mjs");
const { setListFilter } = await import("../src/screens/ref/memory.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { createStorage } = await import("../src/core/storage.mjs");
const { resetActiveTeam, syncActiveTeam } = await import("../src/data/active-team.mjs");
const { setMyTeams } = await import("../src/data/teams.mjs");
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

const RIVALS = { id: "t2", name: "Rivals", baseTeamSlug: "teams/amazon", roster: { players: [{ id: "q1", rowIndex: 0, number: 11, name: "Solo" }] } };
const holders = () => view.querySelectorAll(".g-skill-detail__who").map((who) => who.textContent);

test("an open panel follows the coach's team: a switch of the active team and a list that comes in late redraw it; a screen that was left is not drawn into", () => {
  const backend = new Map();
  const store = createStorage({ getItem: (key) => backend.get(key) ?? null, setItem: (key, value) => backend.set(key, String(value)), removeItem: (key) => backend.delete(key) });
  // The account already names the team switched to, so the switch writes nothing.
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t2" } };
  state.myTeams = { items: [TEAM, RIVALS], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  try {
    renderReferencePage("skills/evasive");
    assert.deepEqual(holders(), ["Itzel", HOSTILE]);
    syncActiveTeam({ routeTeamId: "t2", store });
    assert.deepEqual(holders(), ["Solo"], "the panel left open shows the team switched to");
    setMyTeams([]);
    assert.equal(view.querySelector(".g-skill-detail__ours"), null, "a list that came back without the team takes the block away");
    setMyTeams([TEAM, RIVALS]);
    assert.deepEqual(holders(), ["Solo"], "and brings it back when it comes");
    releaseCurrentScreen();
    resetActiveTeam();
    assert.deepEqual(holders(), ["Solo"], "nothing listens once the screen is left");
  } finally {
    state.auth.currentUser = null;
  }
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
  assert.equal(view.querySelectorAll("a.g-ref-row").length, 14);
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
  assert.equal(first.textContent, "3ItzelEagle Warrior Linewoman", "a row reads number, name, position");
  const text = first.querySelector(".g-skill-detail__text");
  assert.ok(text.querySelector(".g-skill-detail__who") && text.querySelector(".g-skill-detail__pos"), "the name and the position are stacked in one block");
  assert.equal(first.querySelector(".g-skill-detail__num").closest(".g-skill-detail__text"), null, "and the number is the badge beside it, not a column of the block");
  const nobody = draw(skillDetailMarkup({ data: state.data, page: pageOf("skills/block"), team: TEAM, teamPage: amazon() })).querySelector(".g-skill-detail__ours");
  assert.equal(nobody.querySelector(".g-skill-detail__none").textContent, "No one has it");
  assert.equal(nobody.querySelector("li"), null);
});

test("a name in a roster finds its page whatever the spelling or a placeholder's parameter: Bone Head is Bonehead, Loner (4+) is Loner (X+)", () => {
  const race = { team: { roster: [{ position: "Ogre Blocker", skills: ["Bone Head", "Loner (4+)", "Throw Team-mate", "Animosity (All)", "Mighty Blow (+1)", "Kick Team-mate"] }] } };
  const team = { roster: { players: [{ rowIndex: 0, number: 5, name: "Grunt" }] } };
  const has = (title) => skillHolders({ team, teamPage: race, title }).length;
  for (const title of ["Bonehead", "Loner (X+)", "Throw Team-Mate", "Animosity (X)", "Mighty Blow", "Kick Team-Mate", "Mighty Blow (+1)"]) assert.equal(has(title), 1, title);
  for (const title of ["Block", "Kick", "Hatred (X)", "Throw", "Mighty Blow (+2)"]) assert.equal(has(title), 0, title);
});

test("a skill with a number in its title is its own skill: Mighty Blow (+2) is not held by whoever has (+1) or none; a plain title lists all", () => {
  const race = { team: { roster: [{ position: "Troll", skills: ["Mighty Blow (+1)"] }, { position: "Ogre", skills: ["Mighty Blow"] }, { position: "Giant", skills: ["Mighty Blow (+2)", "Loner (4+)"] }, { position: "Lineman", skills: ["Block"] }] } };
  const team = { roster: { players: [1, 2, 3, 4].map((number) => ({ rowIndex: number - 1, number, name: `P${number}` })) } };
  const numbers = (title) => skillHolders({ team, teamPage: race, title }).map((holder) => holder.number);
  assert.deepEqual(numbers("Mighty Blow (+1)"), ["1"]);
  assert.deepEqual(numbers("Mighty Blow (+2)"), ["3"]);
  assert.deepEqual(numbers("Mighty Blow"), ["1", "2", "3"], "the plain skill is held under any parameter");
  assert.deepEqual(numbers("Loner (X+)"), ["3"], "a placeholder is any number");
  const captain = { roster: { players: [{ rowIndex: 3, number: 9, name: "Cap", isCaptain: true }] } };
  assert.deepEqual(skillHolders({ team: captain, teamPage: race, title: "Pro" }).map((holder) => holder.number), ["9"], "and what the captaincy brings is held by name too");
});

test("a word for a parameter is the placeholder's: Hatred (Troll) holds Hatred (X) and Animosity (Underworld Goblin Linemen) holds Animosity (X), not each other's", () => {
  const race = { team: { roster: [{ position: "Dwarf Troll Slayer", skills: ["Hatred (Troll)"] }, { position: "Underworld Lineman", skills: ["Animosity (Underworld Goblin Linemen)"] }] } };
  const team = { roster: { players: [1, 2].map((number) => ({ rowIndex: number - 1, number, name: `P${number}` })) } };
  const numbers = (title) => skillHolders({ team, teamPage: race, title }).map((holder) => holder.number);
  assert.deepEqual([numbers("Hatred (X)"), numbers("Animosity (X)"), numbers("Loner (X+)")], [["1"], ["2"], []]);
});

test("a skill in a roster is held, on the page the reference links it to, by the position that has it — in every team of both vaults", () => {
  let seen = 0;
  for (const locale of ["en", "ru"]) {
    const data = referenceData(locale);
    for (const teamPage of data.teams) {
      rowsForTeam(teamPage).forEach((row, rowIndex) => {
        const team = { roster: { players: [{ rowIndex, number: 1, name: "P" }] } };
        for (const skill of row.skills ?? []) {
          const page = pageForName(data, skill);
          assert.ok(page, `${locale}: ${teamPage.slug}: ${skill} has a page`);
          assert.equal(skillHolders({ team, teamPage, title: page.title }).length, 1, `${locale}: ${teamPage.slug}: ${row.position} holds ${skill} on the page ${page.title}`);
          seen += 1;
        }
      });
    }
  }
  assert.ok(seen > 200, `the walk saw ${seen} skills`);
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

test("a trait has a dot for a letter, its tags for a caption and no roll", () => {
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
});

test("a skill the Skill Table leaves out says so, with the category its tags give", () => {
  // Written out, not taken from the vault: which skills the table lacks is the content's to settle.
  const data = { skillGroups: [{ category: "Passing", skills: ["Pass"] }] };
  const page = { kind: "skill", slug: "skills/x", title: "Cannon", tags: ["Active", "Passing"], html: "<p>Rule.</p>" };
  const panel = draw(skillDetailMarkup({ data, page }));
  assert.equal(panel.querySelector(".g-kv__value").textContent, "Not on the Skill Table");
  assert.equal(panel.querySelector(".g-skill-detail__caption").textContent, "Passing · Active");
  assert.equal(draw(skillDetailMarkup({ data, page: { ...page, title: "Pass" } })).querySelector(".g-kv__value").textContent, "Passing · 1 on D16");
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

/** Another screen is on the page, as when the coach comes to the reference from the roster. */
const elsewhere = () => { view.innerHTML = "<p>elsewhere</p>"; };

test("a phone starts a panel at its top, wherever the list or the panel before it was read to; the same panel redrawn stays where it is", () => {
  withWindow({ phone: true }, ({ scrolls, scrollPage }) => {
    elsewhere();
    renderRefSection("skills");
    scrollPage(500);
    scrolls.length = 0;
    renderReferencePage("skills/dodge");
    assert.deepEqual(scrolls, [[0, 0]], "a phone swaps the list for the panel");
    scrollPage(300);
    scrolls.length = 0;
    const field = view.querySelector("#ref-list-query");
    field.value = "d";
    fireEvent(field, "input");
    assert.ok(view.querySelector(".g-ref--open"), "the panel stays up while the list is searched");
    renderReferencePage("skills/dodge");
    assert.deepEqual(scrolls, [], "neither the redraw nor the same address again starts it over");
    renderReferencePage("skills/block");
    assert.deepEqual(scrolls, [[0, 0]], "a link in a rule to another skill is another screen, and starts at its top");
    elsewhere();
    scrollPage(800);
    scrolls.length = 0;
    renderReferencePage("skills/block");
    assert.deepEqual(scrolls, [[0, 0]], "so is a skill opened from another screen");
  });
});

test("a wide screen shows the panel beside the list: going from one skill to the next leaves the page where it is", () => {
  withWindow({ phone: false }, ({ scrolls, scrollPage }) => {
    elsewhere();
    renderRefSection("skills");
    scrollPage(500);
    scrolls.length = 0;
    renderReferencePage("skills/dodge");
    renderReferencePage("skills/block");
    renderReferencePage("skills/dodge");
    renderRefSection("skills");
    useLocale("ru");
    renderReferencePage("skills/dodge");
    assert.deepEqual(scrolls, [], "the list, a panel, another panel, the list again, the other language: one page");
    assert.equal(globalThis.scrollY, 500);
    renderRefSection("traits");
    assert.deepEqual(scrolls, [[0, 0]], "another list is another page");
  });
});

test("a phone going back from a panel finds the list where it was read to; a list reached any other way starts at its top", () => {
  withWindow({ phone: true }, ({ scrolls, scrollPage }) => {
    elsewhere();
    renderRefSection("skills");
    scrollPage(640);
    renderReferencePage("skills/dodge");
    assert.equal(globalThis.scrollY, 0, "the panel starts at its top");
    renderReferencePage("skills/block");
    assert.equal(globalThis.scrollY, 0, "so does the next one");
    renderRefSection("skills");
    assert.equal(globalThis.scrollY, 640, "the way back is the list as it was left, not the offset of the panels read since");
    scrollPage(100);
    scrolls.length = 0;
    const field = view.querySelector("#ref-list-query");
    field.value = "a";
    fireEvent(field, "input");
    assert.deepEqual(scrolls, [], "a search typed in the list is not a way back");
    elsewhere();
    scrollPage(900);
    renderReferencePage("skills/dodge");
    renderRefSection("skills");
    assert.equal(globalThis.scrollY, 0, "a panel opened from another screen leaves the list at its top, not at the offset of that screen");
    elsewhere();
    renderRefSection("skills");
    scrollPage(700);
    renderReferencePage("skills/dodge");
    renderReferencePage("traits/bonehead");
    renderRefSection("traits");
    assert.equal(globalThis.scrollY, 0, "a trait reached by a link from a skill: the traits were never read, and the skills' place is not theirs");
  });
  withWindow({ phone: false }, ({ scrolls, scrollPage }) => {
    elsewhere();
    renderRefSection("skills");
    scrollPage(640);
    renderReferencePage("skills/dodge");
    scrollPage(30);
    renderRefSection("skills");
    assert.deepEqual(scrolls, [[0, 0]], "a wide screen never had the list taken away: only the first draw started the page");
    assert.equal(globalThis.scrollY, 30);
  });
});

/**
 * Give the fake page a layout for the list's box: 720px of 48px rows, one to a line, which scrolls. The
 * rows' tops follow the box's `scrollTop`, as a browser's do.
 */
function withListLayout(run) {
  const proto = Object.getPrototypeOf(view);
  const classOf = (node) => node.getAttribute("class") ?? "";
  const body = (node) => node.closest(".g-ref-list__body");
  const original = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value() {
      if (classOf(this).includes("g-ref-list__body")) return { top: 100, bottom: 820 };
      const index = body(this).querySelectorAll("a.g-ref-row").indexOf(this);
      const top = 100 + index * 48 - body(this).scrollTop;
      return { top, bottom: top + 48 };
    },
  });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return classOf(this).includes("g-ref-list__body") ? 720 : 0; } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return 48; } });
  try {
    run();
  } finally {
    Object.defineProperty(proto, "getBoundingClientRect", original);
    delete proto.clientHeight;
    delete proto.offsetHeight;
  }
}

test("a skill opened by a link is brought into view in the list's box, which is all that moves; a row already in view stays", () => {
  withListLayout(() => {
    const rows = () => view.querySelectorAll("a.g-ref-row");
    const body = () => view.querySelector(".g-ref-list__body");
    const indexOf = (slug) => rows().findIndex((row) => row.getAttribute("href") === `#/${slug}`);
    renderReferencePage("skills/evasive");
    const at = indexOf("skills/evasive");
    assert.ok(at * 48 > 720, "the row is below the fold of a box that shows fifteen");
    assert.equal(body().scrollTop, at * 48 - (720 - 48) / 2, "it is in the middle of the box");
    const kept = body().scrollTop;
    renderReferencePage(rows()[at + 1].getAttribute("href").slice(2));
    assert.equal(body().scrollTop, kept, "the next row is in view: nothing moves");
    renderReferencePage("skills/accurate");
    assert.equal(body().scrollTop, 0, "a link from the panel to a skill above is brought down to the top: it cannot be centred");
    renderRefSection("skills");
    assert.equal(body().scrollTop, 0, "a list with nothing chosen starts at its top");
  });
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
  assert.match(wide, /\.g-skill-detail\s*\{[^}]*padding:\s*var\(--space-24\);/);
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

test("a holder's name is one line that gives way with an ellipsis, its position a caption under it", () => {
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__text", "display"), ["flex"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__text", "flex-direction"), ["column"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__text", "min-width"), ["0"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__who", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__who", "text-overflow"), ["ellipsis"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__who", "overflow"), ["hidden"]);
  assert.deepEqual(valuesOf(ARTICLE, ".g-skill-detail__pos", "font"), ["400 13px/1.35 var(--font-body)"]);
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
  // Sticking needs the frame's box not to be one that scrolls: the frame clips sideways for every screen (stage 13), so no rule of the reference's own does it.
  assert.deepEqual(valuesOf("src/shell/frame.css", ".g-main", "overflow-x"), ["clip"]);
  assert.deepEqual(valuesOf(REF, ".g-main:has(.g-ref)", "overflow-x"), []);
});

test("a panel taller than the window scrolls in itself, so that its foot (who in the team has the skill) is not out of reach while it is stuck", () => {
  assert.deepEqual(valuesOf(REF, ".g-ref--split .g-ref__panel", "max-height"), ["calc(100vh - 48px)"], "the window less 24px above and below, as the panel's `top`");
  assert.deepEqual(valuesOf(REF, ".g-ref--split .g-ref__panel", "overflow-y"), ["auto"]);
  assert.deepEqual(valuesOf(REF, ".g-ref--split .g-ref__panel", "top"), ["24px"]);
  assert.ok(split(REF).wide.includes("max-height: calc(100vh - 48px)"), "only from 901px, where the panel is a column and sticks");
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
  assertStyled(view, REF, "page-head.css", ARTICLE, "list-row.css", "search-field.css", "filter-chips.css");
  const styles = read("src/styles.css");
  assert.ok(styles.includes('@import url("screens/ref/ref.css");') && styles.includes('@import url("screens/ref/article.css");'));
});

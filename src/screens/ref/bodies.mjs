/**
 * The two articles whose body is not the page's own text (article.mjs picks them by page id): Leagues,
 * which says for each league the teams and the star players that may play in it, and the Skill Table,
 * which a coach can roll a random skill from and reads, on a phone, as a numbered list for each category.
 *
 * The roll is the reference's toy, thrown here with `Math.random`: the throw that counts for an
 * advancement is the server's. What a screen remembers of it lives in memory.mjs.
 */
import { delegate, escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl } from "../../core/routes.mjs";
import { state } from "../../core/state.mjs";
import { leagueAccessNames } from "../../domain/league-rules.mjs";
import { canonicalLeagueName, splitRuleAccessParts, teamLeagueOptions } from "../../domain/roster/team-rules.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderDie } from "../../ui/die.mjs";
import { renderFilterChips, wireFilterChips } from "../../ui/filter-chips.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { pageForName } from "./catalog.mjs";
import { rollerState, setRoller } from "./memory.mjs";
import { proseMarkup } from "./prose.mjs";

/** The roller's chip row is one of its screen's rows by name, for the reason `wireFilterChips` gives. */
const ROLLER_GROUP = "roller";

/** The die the Skill Table is thrown on. */
const SKILL_DIE = "D16";

const byTitle = (first, second) => first.title.localeCompare(second.title, "en");

/** The teams a league lets in: those whose rules name it. */
export function teamsForLeague(data, league) {
  const wanted = canonicalLeagueName(league);
  return (data.teams ?? [])
    .filter((team) => teamLeagueOptions(team).some((option) => canonicalLeagueName(option) === wanted))
    .sort(byTitle);
}

function starAvailableFor(star, league) {
  const availability = star.starPlayer?.availability ?? "";
  const tags = star.tags ?? [];
  const combined = [availability, ...tags].join(", ");
  const wanted = canonicalLeagueName(league);
  if (/any\s+team/i.test(combined)) {
    const exclusions = [...combined.matchAll(/except\s+([^,;]+)/gi)].flatMap((match) => splitRuleAccessParts(match[1]));
    return !exclusions.some((option) => canonicalLeagueName(option) === wanted);
  }
  return splitRuleAccessParts(combined).some((option) => canonicalLeagueName(option) === wanted);
}

/** The star players a league lets in: "Any Team" less the ones it names after "except", or the leagues listed. */
export function starsForLeague(data, league) {
  return (data.starPlayers ?? []).filter((star) => starAvailableFor(star, league)).sort(byTitle);
}

function link(href, text) {
  assertLinkHref(href);
  return `<a class="g-ref-link" href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
}

/** The pages as links run together with commas, or the line that says there are none. */
function linkLine(pages, none) {
  if (!pages.length) return `<p class="g-ref-links g-ref-links--none">${escapeHtml(none)}</p>`;
  return `<p class="g-ref-links">${pages.map((page) => link(pageUrl(page), page.title)).join(", ")}</p>`;
}

function leagueSection(data, league) {
  const teams = teamsForLeague(data, league);
  const stars = starsForLeague(data, league);
  // A label and a number, which needs no plural form ("1 команд" would).
  const sum = [t("ref.league.teams", { count: teams.length }), t("ref.league.starPlayers", { count: stars.length })].join(" · ");
  return `<section class="g-ref-league"><h2>${escapeHtml(league)}</h2><p class="g-ref-league__sum">${escapeHtml(sum)}</p>`
    + `<h3>${escapeHtml(t("common.teams"))}</h3>${linkLine(teams, t("leagueRef.noTeams"))}`
    + `<h3>${escapeHtml(t("nav.starPlayers"))}</h3>${linkLine(stars, t("leagueRef.noStarPlayers"))}</section>`;
}

/** Leagues: for each league, how many teams and star players it has and who they are, each a link to its page. */
export function leaguesBody(data) {
  return `<div class="g-ref-leagues">${leagueAccessNames.map((league) => leagueSection(data, league)).join("")}</div>`;
}

function skillColumn(data, category) {
  return (data.skillGroups ?? []).find((group) => group.category === category)?.skills ?? [];
}

/**
 * Throw the die for a category: the skill on the face that came up.
 *
 * The Skill Table is a D16 whose faces below a column's last skill are blank, and a blank face is thrown
 * again. Each column's skills sit on faces 1 to N with none missing in between (test/ref-bodies.test.mjs
 * checks both vaults), so throwing the blanks again leaves every skill of the column as likely as any
 * other and a face drawn from 1 to N is the same throw, without the loop.
 *
 * @param {object} data the content vault of the language
 * @param {string} category a category of `data.skillGroups`
 * @param {() => number} [random] a number from 0 up to but not including 1
 * @returns {{category: string, face: number, skill: string}}
 */
export function rollSkill(data, category, random = Math.random) {
  const column = skillColumn(data, category);
  if (!column.length) throw new Error(`no skills to roll in ${JSON.stringify(category)}`);
  const face = 1 + Math.floor(random() * column.length);
  return { category, face, skill: column[face - 1] };
}

/** The column the roller is on: the one remembered, or the first when the vault has no such category. */
function rollerGroup(data, roller) {
  const groups = data.skillGroups ?? [];
  return groups.find((group) => group.category === roller.category) ?? groups[0] ?? null;
}

/** A skill as a link to its page, or its name where the vault has no page for it. */
export function skillLink(data, skill) {
  const page = pageForName(data, skill);
  return page ? link(pageUrl(page), skill) : escapeHtml(skill);
}

function rollerMarkup(data, group, rolled) {
  const chips = renderFilterChips({
    label: t("skillRoll.groupLabel"),
    items: data.skillGroups.map(({ category, skills }) => ({ value: category, label: category, count: skills.length })),
    selected: group.category,
    data: { chipGroup: ROLLER_GROUP },
  });
  const result = rolled ? skillLink(data, rolled.skill) : `<span class="g-ref-roller__hint">${escapeHtml(t("ref.roll.hint"))}</span>`;
  const roll = renderButton({ label: t("skillRoll.rollButton"), kind: "primary", data: { rollSkill: "" } });
  return `<section class="g-ref-roller" aria-label="${escapeHtml(t("skills.randomizerRegion"))}">${chips}`
    + `<div class="g-ref-roller__throw">${renderDie({ type: SKILL_DIE, value: rolled?.face ?? null })}`
    + `<div class="g-ref-roller__result"><p class="g-ref-roller__skill" role="status">${result}</p>${roll}</div></div></section>`;
}

/** The table for a phone: a list for each category, a skill to a line, numbered by its face. */
function listsMarkup(data, groups) {
  const lists = groups.map(({ category, skills }) => `<div class="g-ref-skilltable__group"><h2>${escapeHtml(category)}</h2>`
    + `<ol>${skills.map((skill) => `<li>${skillLink(data, skill)}</li>`).join("")}</ol></div>`);
  return `<section class="g-ref-skilltable" aria-label="${escapeHtml(t("skills.tableByCategoryRegion"))}">${lists.join("")}</section>`;
}

/**
 * The Skill Table: the roller, then the table as the page has it, in the shape the screen's width calls
 * for (the sheet shows one of the two).
 *
 * @param {object} data the content vault of the language
 * @param {object} page the Skill Table page
 * @param {{category: string, face: number|null, skill: string}} roller what memory.mjs holds of the die; what it shows is the throw only if it is of the column the roller is on and that face is that skill there
 */
export function skillTableBody(data, page, roller) {
  const group = rollerGroup(data, roller);
  if (!group) return proseMarkup(page.html);
  const rolled = roller.category === group.category && roller.face !== null && group.skills[roller.face - 1] === roller.skill ? roller : null;
  return rollerMarkup(data, group, rolled)
    + listsMarkup(data, data.skillGroups)
    + `<div class="g-prose g-ref-skilltable__desk">${page.html}</div>`;
}

/**
 * The roller's controls under `root`: a chip picks the category (and clears the throw), Roll throws for
 * it; each answers by drawing the page again with `redraw`.
 *
 * @param {Element} root a container that outlives the redraws
 * @param {() => void} redraw
 * @returns {() => void} stops listening
 */
export function wireSkillTableRoller(root, redraw) {
  const stopChips = wireFilterChips(root, (category) => {
    setRoller({ category, face: null, skill: "" });
    redraw();
  }, { group: ROLLER_GROUP });
  const stopRoll = delegate(root, "click", "[data-roll-skill]", () => {
    const group = rollerGroup(state.data, rollerState());
    if (!group) return;
    setRoller(rollSkill(state.data, group.category));
    redraw();
  });
  return () => {
    stopChips();
    stopRoll();
  };
}

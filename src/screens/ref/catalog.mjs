/**
 * What the reference holds and in what order, as data — pure, so every vault is checked by a test.
 *
 * The index, the table of contents, the article's previous/next and the roster's skill links all
 * read from here, each handing in the content vault it has (`data`). Nothing below touches the
 * DOM or application state; the only thing it asks of the page is the current language, through
 * `t`, when a title or a description is built.
 */
import { t } from "../../core/i18n.mjs";
import { navRouteForPage, pageUrl, refUrl } from "../../core/routes.mjs";
import { ruleLookupKey } from "../../domain/roster/team-rules.mjs";

/**
 * The four groups, in the order a coach reaches for them: what a match needs first, the people in
 * it, the teams they play for, the league around them. An entry is a content page (by id) or one
 * of the reference lists (by section). The groups are the only place the order is written down.
 */
export const REF_GROUPS = [
  {
    key: "match",
    items: [
      { page: "general-information-weather" },
      { page: "general-information-kick-off-table" },
      { page: "general-information-prayers-to-nuffle" },
      { page: "general-information-casualties" },
      { section: "inducements" },
    ],
  },
  {
    key: "players",
    items: [
      { page: "general-information-player-advancement" },
      { page: "skills-and-traits-skill-table" },
      { section: "skills" },
      { section: "traits" },
    ],
  },
  {
    key: "teams",
    items: [
      { section: "teams" },
      { page: "general-information-special-rules" },
      { section: "star-players" },
      { page: "general-information-leagues" },
    ],
  },
  {
    key: "league",
    items: [
      { page: "general-information-all-gata-changes" },
      { section: "rules" },
    ],
  },
];

/** Which field of the content data holds a section's pages (the keys are `REF_SECTIONS`). */
export const SECTION_COLLECTIONS = {
  teams: "teams",
  skills: "skills",
  traits: "traits",
  "star-players": "starPlayers",
  inducements: "inducements",
  rules: "rules",
  cheatsheets: "cheatsheets",
};

/** What the group is called. The titles are looked up when asked, so a language change reaches them. */
export function groupTitle(key) {
  return {
    match: t("ref.group.match"),
    players: t("ref.group.players"),
    teams: t("ref.group.teams"),
    league: t("ref.group.league"),
  }[key] ?? key;
}

export function sectionTitle(section) {
  return {
    teams: t("nav.teamsRules"),
    skills: t("nav.skills"),
    traits: t("nav.traits"),
    "star-players": t("nav.starPlayers"),
    inducements: t("nav.inducements"),
    rules: t("section.rulesTitle"),
    cheatsheets: t("section.cheatsheetsTitle"),
  }[section] ?? section;
}

export function sectionDescription(section) {
  return {
    teams: t("section.teamsDescription"),
    skills: t("section.skillsDescription"),
    traits: t("section.traitsDescription"),
    "star-players": t("section.starPlayersDescription"),
    inducements: t("section.inducementsDescription"),
    rules: t("section.rulesDescription"),
    cheatsheets: t("section.cheatsheetsDescription"),
  }[section] ?? "";
}

/** The pages a section lists; a vault without the field (or a section that is not one) has none. */
export function sectionPages(data, section) {
  return data[SECTION_COLLECTIONS[section]] ?? [];
}

/** An overview card is not a content page, so it has no `pageUrl`; its address is built from its slug. */
export function overviewUrl(card) {
  return `#/overview/${encodeURIComponent(card.slug)}`;
}

function pageItem(page) {
  return { key: page.id, title: page.title, desc: t(`preview.${page.id}`), href: pageUrl(page), count: "" };
}

function sectionItem(data, section, extra) {
  return {
    key: section,
    title: sectionTitle(section),
    desc: sectionDescription(section),
    href: refUrl(section),
    count: sectionPages(data, section).length + extra,
  };
}

function pagesById(data) {
  return new Map((data.pages ?? []).map((page) => [page.id, page]));
}

/** The articles the groups name, in the groups' order; one the vault does not have is left out. */
function articlePages(data) {
  const byId = pagesById(data);
  return REF_GROUPS.flatMap((group) => group.items).flatMap((entry) => byId.get(entry.page) ?? []);
}

/**
 * The index: each group with its items, a page or a section list. A page the vault does not have
 * is skipped, a section is always there. `overviewCount` is how many overview cards the league
 * rules list shows ahead of the five regulation pages.
 */
export function refGroups(data, { overviewCount = 0 } = {}) {
  const byId = pagesById(data);
  const itemsOf = (entry) => {
    if (entry.section) return sectionItem(data, entry.section, entry.section === "rules" ? overviewCount : 0);
    const page = byId.get(entry.page);
    return page ? pageItem(page) : [];
  };
  return REF_GROUPS.map((group) => ({ key: group.key, title: groupTitle(group.key), items: group.items.flatMap(itemsOf) }));
}

const ARTICLE_IDS = new Set(REF_GROUPS.flatMap((group) => group.items).flatMap((entry) => entry.page ?? []));
const LIST_SECTIONS = new Set(REF_GROUPS.flatMap((group) => group.items).flatMap((entry) => entry.section ?? []));

/**
 * The table-of-contents item a page lights: its own, when the groups name it; its list's, for a
 * team, skill, trait, star player, inducement or league rule; nothing for any other page.
 */
export function itemKeyOf(page) {
  if (ARTICLE_IDS.has(page.id)) return page.id;
  const section = navRouteForPage(page);
  return LIST_SECTIONS.has(section) ? section : null;
}

/** The articles on either side of one, in the groups' order (lists are not articles). */
export function articleNeighbours(data, pageId) {
  const pages = articlePages(data);
  const index = pages.findIndex((page) => page.id === pageId);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? pageItem(pages[index - 1]) : null,
    next: index < pages.length - 1 ? pageItem(pages[index + 1]) : null,
  };
}

const PARAMETER = /^(.*?)\s*\(([^()]*)\)$/;
const NUMBER = /^[+-]?\d+\+?$/;
const spaced = (name) => String(name ?? "").replace(/\s+/g, " ").trim();

/** A name with a parameter at its end: the base and the parameter, or null for a name with none. */
function splitParameter(name) {
  const match = PARAMETER.exec(spaced(name));
  return match ? { base: match[1], parameter: match[2].trim() } : null;
}

/** A parameter that is a number (`Loner (4+)`, `Mighty Blow (+1)`), not a placeholder (`Loner (X+)`) or a word (`Animosity (All)`). */
export function hasNumericParameter(name) {
  return NUMBER.test(splitParameter(name)?.parameter ?? "");
}

/** The name without its parameter: `Mighty Blow (+1)` is `Mighty Blow`; a name with none is as it is. */
export function withoutParameter(name) {
  return splitParameter(name)?.base ?? spaced(name);
}

/**
 * The titles a name in a roster is looked for under, best first: the name itself; then the page the
 * parameter stands for. A number has its own page where the vault has one (`Mighty Blow (+1)`), else the
 * template's (`Loner (4+)` is `Loner (X+)`); a word is the template's (`Animosity (All)` is `Animosity (X)`).
 */
function titlesForName(name) {
  const wanted = spaced(name);
  const split = splitParameter(wanted);
  if (!split) return wanted ? [wanted] : [];
  const templates = hasNumericParameter(wanted) ? [`${split.base} (X+)`, `${split.base} (X)`] : [`${split.base} (X)`];
  return [wanted, ...templates];
}

/** The same name spelled another way (`Bone Head` is `Bonehead`): equal keys, and a key that is something. A name in no Latin letter has none. */
function sameSpelling(name, title) {
  const key = ruleLookupKey(name);
  return Boolean(key) && key === ruleLookupKey(title);
}

/**
 * Whether a name in a roster stands for the page titled `title`: the one rule for what a skill name
 * points to, which `pageForName` finds the page by and the panel of a skill finds its holders by.
 */
export function nameMatchesTitle(name, title) {
  return titlesForName(name).includes(title) || sameSpelling(name, title);
}

/**
 * The skill, trait or page a name in a roster stands for (see `nameMatchesTitle`): the exact title; the
 * title of the template a parameter stands for (`Loner (3+)` is `Loner (X+)`, `Animosity (All)` is
 * `Animosity (X)`); then the same name spelled another way (`Bone Head` is `Bonehead`, `Side Step` is
 * `Sidestep`).
 */
export function pageForName(data, name) {
  const wanted = spaced(name);
  if (!wanted) return null;
  const candidates = [...(data.skills ?? []), ...(data.traits ?? []), ...(data.pages ?? [])];
  for (const title of titlesForName(wanted)) {
    const page = candidates.find((candidate) => candidate.title === title);
    if (page) return page;
  }
  return candidates.find((page) => sameSpelling(wanted, page.title)) ?? null;
}

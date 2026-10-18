/**
 * One search over everything the reference holds: the content pages, the lists the index offers
 * and the league overview's cards — pure, so every vault is checked by a test.
 *
 * It answers with plain results (what to call it, where it lives, where it leads); the screen that
 * draws them decides how. Nothing below touches the DOM or application state; like the catalog it
 * asks the page only for the current language, through `t`, when a caption is built.
 */
import { t } from "../../core/i18n.mjs";
import { navRouteForPage, pageUrl, refUrl } from "../../core/routes.mjs";
import { REF_GROUPS, SECTION_COLLECTIONS, groupTitle, overviewUrl, sectionDescription, sectionPages, sectionTitle } from "./catalog.mjs";

/** Lower case, `ё` as `е`, runs of spaces as one, the edges trimmed: how a query and a text are compared. */
export function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** The group that names a list or an article, or null when none does. */
function groupOf(match) {
  return REF_GROUPS.find((group) => group.items.some((item) => match(item))) ?? null;
}

function pageCaption(page) {
  const section = navRouteForPage(page);
  if (SECTION_COLLECTIONS[section]) return sectionTitle(section);
  const group = groupOf((item) => item.page === page.id);
  return group ? groupTitle(group.key) : t("shell.tab.ref");
}

function sectionCaption(section) {
  const group = groupOf((item) => item.section === section);
  return group ? groupTitle(group.key) : t("shell.tab.ref");
}

/**
 * What can be found, each with the words it is searched by. The lists come first, then the cards,
 * then the pages: of two things with the same name the one that holds the other is listed first.
 * A list with nothing in it (the cheatsheets, as long as there are none) leads nowhere and is left out.
 */
function candidates(data, overviewCards) {
  const lists = Object.keys(SECTION_COLLECTIONS).filter((section) => sectionPages(data, section).length > 0).map((section) => ({
    key: `section:${section}`,
    title: sectionTitle(section),
    caption: sectionCaption(section),
    href: refUrl(section),
    words: [sectionTitle(section), sectionDescription(section)],
  }));
  const cards = overviewCards.map((card) => ({
    key: `overview:${card.slug}`,
    title: card.title,
    caption: sectionTitle("rules"),
    href: overviewUrl(card),
    words: [card.title, card.summary, ...(card.sections ?? []).flatMap((part) => [part.title, ...(part.items ?? [])])],
  }));
  const pages = (data.pages ?? []).map((page) => ({
    key: page.id,
    title: page.title,
    caption: pageCaption(page),
    href: pageUrl(page),
    words: [page.title, page.sectionLabel, page.text, ...(page.tags ?? [])],
  }));
  return [...lists, ...cards, ...pages];
}

/** 0: the name starts with the query; 1: the name has it inside; 2: only what is said about it does. */
function rank(entry, wanted) {
  const title = normalizeText(entry.title);
  if (title.startsWith(wanted)) return 0;
  return title.includes(wanted) ? 1 : 2;
}

/**
 * @param {object} options
 * @param {object} options.data the content vault of the current language
 * @param {object[]} [options.overviewCards] the league overview's cards of that language
 * @param {string} options.query what was typed; blank is not a search
 * @param {number} [options.limit] how many results to hand back; `total` says how many there were
 * @param {string} [options.locale] the language names are ordered in
 * @returns {{total: number, results: {key: string, title: string, caption: string, href: string}[]}}
 */
export function searchReference({ data, overviewCards = [], query, limit = 50, locale = "en" }) {
  const wanted = normalizeText(query);
  if (!wanted) return { total: 0, results: [] };
  const found = candidates(data, overviewCards)
    .filter((entry) => normalizeText(entry.words.join(" ")).includes(wanted))
    .map((entry) => ({ entry, rank: rank(entry, wanted) }))
    .sort((a, b) => a.rank - b.rank || a.entry.title.localeCompare(b.entry.title, locale));
  const results = found.slice(0, limit).map(({ entry: { key, title, caption, href } }) => ({ key, title, caption, href }));
  return { total: found.length, results };
}

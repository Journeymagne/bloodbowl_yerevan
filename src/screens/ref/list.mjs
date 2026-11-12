/**
 * The reference's lists (`#/ref/:section`): the skills, the traits, the teams, the star players, the
 * inducements and the league's rules, each under the reference's head and table of contents.
 *
 * A list says how many of how many it shows, and most have a search of their own that narrows it by
 * name as it is typed; the skills have a chip for each category too. What a list is narrowed to is the
 * reference's memory (`memory.mjs`, one filter per list), so going into an article and back finds it as
 * it was left. Skills, traits and inducements are drawn as a split page: the list, and the card of the chosen one
 * beside it on a desk, in a sheet over it on a phone (details.mjs).
 */
import { delegate, escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, refUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { onActiveTeamChange } from "../../data/active-team.mjs";
import { onMyTeamsChange } from "../../data/teams.mjs";
import { renderFilterChips, wireFilterChips } from "../../ui/filter-chips.mjs";
import { renderNavRow } from "../../ui/list-row.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderSearchField } from "../../ui/search-field.mjs";
import { activeOverviewCards } from "../overview.mjs";
import { overviewUrl, refGroups, sectionPages, sectionTitle } from "./catalog.mjs";
import { closeDetailSheet, detailPanelMarkup, detailSheetMarkup, drawWithDetail, isPhone, noteSheet, onPhoneChange, wireDetailSheet } from "./details.mjs";
import { backLinkMarkup, goSearch, refHeadMarkup, refPageMarkup, refTocMarkup, wireRefSearch } from "./frame.mjs";
import { listFilter, refQuery, setListFilter } from "./memory.mjs";
import { normalizeText } from "./search.mjs";
import { badgeMarkup, isTrait, tagsOf } from "./skill.mjs";

/** The lists whose rows open their item beside the list (a desk) or in a sheet over it (a phone), not a page of their own. */
const SPLIT_SECTIONS = new Set(["skills", "traits", "inducements"]);

/** Of those, the lists whose rows are a letter and a name; an inducement's row says its rule under its name. */
const LETTER_SECTIONS = new Set(["skills", "traits"]);

/** How much of an inducement's rule its row quotes when the rule has no «count, name (price):» opening. */
const INDUCEMENT_PREVIEW = 90;

/** The chip row is one of its screen's rows by name, for the reason `wireFilterChips` gives. */
const CHIP_GROUP = "category";

/**
 * The categories a coach can narrow the skills to: the skill groups', in their order, each with the
 * number of skills that carry its tag.
 *
 * @returns {{value: string, count: number}[]}
 */
export function skillCategories(data) {
  const skills = sectionPages(data, "skills");
  return (data.skillGroups ?? []).map(({ category }) => ({ value: category, count: skills.filter((page) => (page.tags ?? []).includes(category)).length }));
}

/**
 * The pages of a section a filter leaves: those whose name holds `query` (as `normalizeText` reads
 * both) and, for the skills, those that carry the tag `category`. Every other list has no categories.
 */
export function listRows(data, section, { query = "", category = "all" } = {}) {
  const wanted = normalizeText(query);
  return sectionPages(data, section).filter((page) => {
    if (wanted && !normalizeText(page.title).includes(wanted)) return false;
    return section !== "skills" || category === "all" || (page.tags ?? []).includes(category);
  });
}

function referenceRow(page, selectedSlug) {
  const href = pageUrl(page);
  assertLinkHref(href);
  const { category } = tagsOf(page);
  const current = page.slug === selectedSlug ? ' aria-current="page"' : "";
  return `<a class="g-ref-row" href="${escapeHtml(href)}"${current}>`
    + badgeMarkup(category, { trait: isTrait(page) })
    + `<span class="g-sr-only">${escapeHtml(category)}</span>`
    + `<span class="g-ref-row__name">${escapeHtml(page.title)}</span></a>`;
}

/** The line under a team's name: its tier, and whether it is one of the core teams. */
function teamLine(page) {
  const kind = { Core: t("filters.core"), Experimental: t("filters.experimental") }[page.team?.type ?? page.tags?.[0]];
  return [page.team?.meta?.league, kind].filter(Boolean).join(" · ");
}

function starLine(page) {
  return [page.starPlayer?.cost, page.starPlayer?.availability].filter(Boolean).join(" · ");
}

/**
 * An inducement's row says how many a team may take, the name and the price: its rule's opening, up to the colon
 * («0-6 Additional Training (85k)»); the rule itself is its card's (the owner, 2026-11-12). A rule that opens with no
 * colon is quoted in its first characters.
 */
function inducementLine(page) {
  const text = String(page.text ?? "");
  const at = text.indexOf(":");
  if (at > 0) return text.slice(0, at).trim();
  return text.length > INDUCEMENT_PREVIEW ? `${text.slice(0, INDUCEMENT_PREVIEW).trimEnd()}…` : text;
}

const DESCRIBE = { teams: teamLine, "star-players": starLine, inducements: inducementLine };

const subtitle = (text) => `<h2 class="g-ref-list__subtitle">${escapeHtml(text)}</h2>`;

/** The league's rules: the overview's cards in brief, then the regulation pages in full. */
function rulesMarkup(pages, cards) {
  const brief = cards.map((card) => renderNavRow({ href: overviewUrl(card), title: card.title, desc: card.summary }));
  const full = pages.map((page) => renderNavRow({ href: pageUrl(page), title: page.title, desc: t(`preview.${page.id}`) }));
  return `${brief.length ? subtitle(t("ref.rules.brief")) + brief.join("") : ""}${full.length ? subtitle(t("ref.rules.full")) + full.join("") : ""}`;
}

function rowsMarkup(section, pages, cards, selectedSlug) {
  if (!pages.length && !cards.length) return `<p class="g-ref-empty">${escapeHtml(t("section.emptyState"))}</p>`;
  if (section === "rules") return rulesMarkup(pages, cards);
  if (LETTER_SECTIONS.has(section)) return pages.map((page) => referenceRow(page, selectedSlug)).join("");
  // A row that opens its card beside the list, as a skill's does, has no chevron: it leads to no page of its own.
  const chevron = SPLIT_SECTIONS.has(section) ? null : undefined;
  return pages.map((page) => renderNavRow({ href: pageUrl(page), title: page.title, desc: DESCRIBE[section]?.(page) ?? "", current: page.slug === selectedSlug, chevron })).join("");
}

/** What a list's search is for, by section; the lists with no search (the rules, the cheatsheets) have no entry. */
function searchLabel(section) {
  return {
    skills: t("ref.listSearch.skills"),
    traits: t("ref.listSearch.traits"),
    teams: t("ref.listSearch.teams"),
    "star-players": t("ref.listSearch.starPlayers"),
    inducements: t("ref.listSearch.inducements"),
  }[section] ?? "";
}

function categoryChips(data, categories, selected) {
  const all = { value: "all", label: t("ref.allCategories"), count: sectionPages(data, "skills").length };
  const items = [all, ...categories.map(({ value, count }) => ({ value, label: value, count }))];
  return renderFilterChips({ label: t("sidebar.category"), items, selected, data: { chipGroup: CHIP_GROUP } });
}

/**
 * A list: its title and count, its search and (for the skills) its categories, then the rows.
 *
 * @param {object} props
 * @param {object} props.data the content vault of the language
 * @param {string} props.section one of the lists (`REF_SECTIONS`)
 * @param {{query: string, category: string}} props.filter what the list is narrowed to; a category the vault does not have is All
 * @param {object[]} [props.overviewCards] the league overview's cards, which the rules list shows ahead of its pages
 * @param {string|null} [props.selectedSlug] the page that is open: its row is the current one
 * @param {boolean} [props.heading] the list's title is the page's h1; not when the card open beside it has the h1
 * @param {string} [props.backHtml] a phone's way up, `backLinkMarkup()`'s, at the left of the title
 */
export function refListMarkup({ data, section, filter, overviewCards = [], selectedSlug = null, heading = !selectedSlug, backHtml = "" }) {
  const categories = section === "skills" ? skillCategories(data) : [];
  const category = categories.some(({ value }) => value === filter.category) ? filter.category : "all";
  const pages = listRows(data, section, { query: filter.query, category });
  const cards = section === "rules" ? overviewCards : [];
  const count = t("ref.count", { shown: pages.length + cards.length, total: sectionPages(data, section).length + cards.length });
  const title = escapeHtml(sectionTitle(section));
  const titleHtml = heading ? `<h1 class="g-ref-list__title">${title}</h1>` : `<p class="g-ref-list__title">${title}</p>`;
  const label = searchLabel(section);
  const search = label ? renderSearchField({ id: "ref-list-query", label, placeholder: label, value: filter.query, data: { listSearch: section } }) : "";
  const chips = section === "skills" ? categoryChips(data, categories, category) : "";
  const shape = LETTER_SECTIONS.has(section) ? "" : " g-ref-list--nav";
  // Keyed, so that the redraw which opens an item beside the list keeps the list's node, and the focus in its search.
  return `<section class="g-ref-list${shape}" data-section="${escapeHtml(section)}" data-key="ref-list"><header class="g-ref-list__head">`
    + `<div class="g-ref-list__top">${backHtml}${titleHtml}<p class="g-ref-list__count" role="status">${escapeHtml(count)}</p></div>${search}${chips}</header>`
    + `<div class="g-ref-list__body">${rowsMarkup(section, pages, cards, selectedSlug)}</div></section>`;
}

/** A field shows what the memory holds even when the screen before left something typed in it, which the markup's `value` does not replace. */
function syncField(selector, value) {
  const field = view.querySelector(selector);
  if (field && field.value !== value) field.value = value;
}

/** What a split page's panel says until an item is chosen. */
const pickOf = (section) => ({ skills: t("ref.skill.pick"), traits: t("ref.trait.pick"), inducements: t("ref.inducement.pick") })[section];

/**
 * A list is one screen with or without an item open, so choosing one leaves the page where it was read to: on a desk
 * the item's card is the panel beside the list, on a phone a sheet over it, whose close puts the focus back on its row.
 */
function draw(section, selected) {
  const overviewCards = activeOverviewCards();
  const filter = listFilter(section);
  const split = SPLIT_SECTIONS.has(section);
  const sheet = split && selected && isPhone() ? selected : null;
  if (sheet) noteSheet(view, sheet, view.querySelector(".g-ref-list")?.getAttribute("data-section") === section);
  const panel = sheet ? null : selected;
  const markup = refPageMarkup({
    layout: split ? "split" : "list",
    screen: `list:${section}`,
    headHtml: refHeadMarkup({ query: refQuery() }),
    tocHtml: refTocMarkup(refGroups(state.data, { overviewCount: overviewCards.length }), section),
    mainHtml: refListMarkup({ data: state.data, section, filter, overviewCards, selectedSlug: selected?.slug ?? null, heading: !panel,
      backHtml: backLinkMarkup({ href: refUrl(), label: t("shell.tab.ref") }) }),
    panelHtml: split ? detailPanelMarkup(panel, pickOf(section)) : "",
  });
  drawWithDetail(view, markup + detailSheetMarkup(sheet), Boolean(sheet), (slug) => `.g-ref-list a[href="#/${slug}"]`);
  syncField("#ref-list-query", filter.query);
  syncField("#ref-query", refQuery());
}

/**
 * Draw a list. `selected` is the item an address names: its row is marked, and its card is the panel (a desk) or a
 * sheet over the list (a phone).
 *
 * @param {string} section one of the lists (`REF_SECTIONS`)
 * @param {{selected?: object|null}} [options] `selected`: the page whose row is marked and whose card is shown
 */
export function renderRefSection(section, { selected = null } = {}) {
  const redraw = () => draw(section, selected);
  redraw();
  // Typing and choosing redraw through `redraw`; only the router comes back here, and the key hands the wiring on.
  const release = [
    delegate(view, "input", "[data-list-search]", (event, field) => {
      setListFilter(section, { query: field.value });
      redraw();
    }),
    wireFilterChips(view, (category) => {
      setListFilter(section, { category });
      redraw();
    }, { group: CHIP_GROUP }),
    wireRefSearch(view, { onQuery: goSearch }),
  ];
  // The card's "In your team" is the active team's: it follows a switch of team and a list that comes in late. A width
  // that crosses 900px moves an open item between the panel and the sheet.
  if (SPLIT_SECTIONS.has(section)) {
    release.push(onActiveTeamChange(redraw), onMyTeamsChange(redraw), onPhoneChange(redraw), wireDetailSheet(view, () => refUrl(section)),
      () => closeDetailSheet(view));
  }
  onScreenLeave("ref:list", () => release.forEach((stop) => stop()));
}

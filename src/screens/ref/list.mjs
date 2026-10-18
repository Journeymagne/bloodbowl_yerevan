/**
 * The reference's lists (`#/ref/:section`): the skills, the traits, the teams, the star players, the
 * inducements and the league's rules, each under the reference's head and table of contents.
 *
 * A list says how many of how many it shows, and most have a search of their own that narrows it by
 * name as it is typed; the skills have a chip for each category too. What a list is narrowed to is the
 * reference's memory (`memory.mjs`, one filter per list), so going into an article and back finds it as
 * it was left. Skills and traits are drawn as a split page: the list, and beside it (on a phone, instead
 * of it, once something is chosen) the panel of the chosen one.
 */
import { delegate, escapeHtml, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, refUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { activeTeam } from "../../data/active-team.mjs";
import { renderFilterChips, wireFilterChips } from "../../ui/filter-chips.mjs";
import { renderNavRow } from "../../ui/list-row.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderSearchField } from "../../ui/search-field.mjs";
import { activeOverviewCards } from "../overview.mjs";
import { overviewUrl, refGroups, sectionPages, sectionTitle } from "./catalog.mjs";
import { backLinkMarkup, goSearch, refHeadMarkup, refPageMarkup, refTocMarkup, wireRefSearch } from "./frame.mjs";
import { listFilter, refQuery, setListFilter } from "./memory.mjs";
import { normalizeText } from "./search.mjs";
import { badgeMarkup, skillDetailMarkup, tagsOf } from "./skill.mjs";

/** The lists whose rows are a letter, a name and a type, and which keep a panel beside them. */
const SPLIT_SECTIONS = new Set(["skills", "traits"]);

/** How much of an inducement's rule its row quotes. */
const INDUCEMENT_PREVIEW = 90;

/** The width up to which a split page shows its list or its panel, not both (ref.css). */
const PHONE = "(max-width: 900px)";

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
  const { category, type } = tagsOf(page);
  const meta = type ? `<span class="g-ref-row__meta${type === "Passive" ? " g-ref-row__meta--passive" : ""}">${escapeHtml(type)}</span>` : "";
  const current = page.slug === selectedSlug ? ' aria-current="page"' : "";
  return `<a class="g-ref-row" href="${escapeHtml(href)}"${current}>`
    + badgeMarkup(category)
    + `<span class="g-sr-only">${escapeHtml(category)}</span>`
    + `<span class="g-ref-row__name">${escapeHtml(page.title)}</span>${meta}</a>`;
}

/** The line under a team's name: its tier, and whether it is one of the core teams. */
function teamLine(page) {
  const kind = { Core: t("filters.core"), Experimental: t("filters.experimental") }[page.team?.type ?? page.tags?.[0]];
  return [page.team?.meta?.league, kind].filter(Boolean).join(" · ");
}

function starLine(page) {
  return [page.starPlayer?.cost, page.starPlayer?.availability].filter(Boolean).join(" · ");
}

function inducementLine(page) {
  const text = String(page.text ?? "");
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
  if (SPLIT_SECTIONS.has(section)) return pages.map((page) => referenceRow(page, selectedSlug)).join("");
  return pages.map((page) => renderNavRow({ href: pageUrl(page), title: page.title, desc: DESCRIBE[section]?.(page) ?? "" })).join("");
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
 * @param {string|null} [props.selectedSlug] the page open beside the list: its row is the current one, and the list's title is no longer a heading
 */
export function refListMarkup({ data, section, filter, overviewCards = [], selectedSlug = null }) {
  const categories = section === "skills" ? skillCategories(data) : [];
  const category = categories.some(({ value }) => value === filter.category) ? filter.category : "all";
  const pages = listRows(data, section, { query: filter.query, category });
  const cards = section === "rules" ? overviewCards : [];
  const count = t("ref.count", { shown: pages.length + cards.length, total: sectionPages(data, section).length + cards.length });
  const title = escapeHtml(sectionTitle(section));
  const heading = selectedSlug ? `<p class="g-ref-list__title">${title}</p>` : `<h1 class="g-ref-list__title">${title}</h1>`;
  const label = searchLabel(section);
  const search = label ? renderSearchField({ id: "ref-list-query", label, placeholder: label, value: filter.query, data: { listSearch: section } }) : "";
  const chips = section === "skills" ? categoryChips(data, categories, category) : "";
  const shape = SPLIT_SECTIONS.has(section) ? "" : " g-ref-list--nav";
  // Keyed, so that the redraw which opens a skill beside the list (its way up is no longer in front of it) keeps the list's box, and with it the scroll.
  return `<section class="g-ref-list${shape}" data-section="${escapeHtml(section)}" data-key="ref-list"><header class="g-ref-list__head">`
    + `<div class="g-ref-list__top">${heading}<p class="g-ref-list__count" role="status">${escapeHtml(count)}</p></div>${search}${chips}</header>`
    + `<div class="g-ref-list__body">${rowsMarkup(section, pages, cards, selectedSlug)}</div></section>`;
}

/** A field shows what the memory holds even when the screen before left something typed in it, which the markup's `value` does not replace. */
function syncField(selector, value) {
  const field = view.querySelector(selector);
  if (field && field.value !== value) field.value = value;
}

/** The rows are a box that scrolls and that a redraw keeps, so a new set of rows starts at the top of it. */
function rewind() {
  const body = view.querySelector(".g-ref-list__body");
  if (body) body.scrollTop = 0;
}

/**
 * A skill opened by a link (from a roster, from another skill's rule) may be a row below the fold of the
 * box that scrolls: the box moves to put it in the middle. Only the box: `scrollIntoView` would move the
 * page too. A row already in view stays where it is.
 */
function revealSelected() {
  const body = view.querySelector(".g-ref-list__body");
  const row = body?.querySelector('[aria-current="page"]');
  if (!row) return;
  const box = body.getBoundingClientRect();
  const at = row.getBoundingClientRect();
  if (at.top >= box.top && at.bottom <= box.bottom) return;
  body.scrollTop = Math.max(0, at.top - box.top + body.scrollTop - (body.clientHeight - row.offsetHeight) / 2);
}

/**
 * The panel of a split page: what is said until a skill or a trait is chosen, then the chosen one's
 * card, with the coach's active team beside it. On a phone the panel is the whole screen, so it carries
 * the way back to the list (a link the sheet shows only there).
 */
function panelMarkup(section, selected) {
  if (!selected) return `<p class="g-ref-pick">${escapeHtml({ skills: t("ref.skill.pick"), traits: t("ref.trait.pick") }[section])}</p>`;
  const team = activeTeam();
  const teamPage = team ? (state.data.teams ?? []).find((page) => page.slug === team.baseTeamSlug) ?? null : null;
  return backLinkMarkup({ href: refUrl(section), label: sectionTitle(section) })
    + skillDetailMarkup({ data: state.data, page: selected, team, teamPage });
}

function draw(section, selected) {
  const overviewCards = activeOverviewCards();
  const filter = listFilter(section);
  const split = SPLIT_SECTIONS.has(section);
  const sameList = view.querySelector(".g-ref-list")?.getAttribute("data-section") === section;
  // The page the panel is showing now, before the redraw: a different one is a new screen on a phone.
  const shown = view.querySelector(".g-skill-detail")?.getAttribute("data-page") ?? null;
  patch(view, refPageMarkup({
    layout: split ? "split" : "list",
    open: Boolean(selected),
    headHtml: refHeadMarkup({ query: refQuery() }),
    tocHtml: refTocMarkup(refGroups(state.data, { overviewCount: overviewCards.length }), section),
    // With something chosen the list is hidden on a phone, and the panel brings the way back.
    mainHtml: (selected ? "" : backLinkMarkup({ href: refUrl(), label: t("shell.tab.ref") }))
      + refListMarkup({ data: state.data, section, filter, overviewCards, selectedSlug: selected?.slug ?? null }),
    panelHtml: split ? panelMarkup(section, selected) : "",
  }));
  syncField("#ref-list-query", filter.query);
  syncField("#ref-query", refQuery());
  // Opening a skill redraws the same list beside it, which must stay where the coach scrolled it to.
  if (!sameList) rewind();
  if (!selected || selected.slug === shown) return;
  revealSelected();
  // A phone shows the panel in the list's place, a screen of its own: from its top, not from wherever the list (or the panel before it) was read to.
  if (globalThis.matchMedia?.(PHONE).matches) globalThis.scrollTo?.(0, 0);
}

/**
 * Draw a list. `selected` is the skill or trait open beside it, when an address names one.
 *
 * @param {string} section one of the lists (`REF_SECTIONS`)
 * @param {{selected?: object|null}} [options] `selected`: the page whose row is marked and whose panel is shown
 */
export function renderRefSection(section, { selected = null } = {}) {
  const redraw = () => draw(section, selected);
  redraw();
  // Typing and choosing redraw through `redraw`; only the router comes back here, and the key hands the wiring on.
  const release = [
    delegate(view, "input", "[data-list-search]", (event, field) => {
      setListFilter(section, { query: field.value });
      redraw();
      rewind();
    }),
    wireFilterChips(view, (category) => {
      setListFilter(section, { category });
      redraw();
      rewind();
    }, { group: CHIP_GROUP }),
    wireRefSearch(view, { onQuery: goSearch }),
  ];
  onScreenLeave("ref:list", () => release.forEach((stop) => stop()));
}

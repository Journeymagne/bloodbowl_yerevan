/**
 * The reference's articles, in reading mode: a page of the vault at its own address (`#/<slug>`), a
 * card of the league overview (`#/overview/<slug>`) and the legal page (`#/legal`), each under the
 * reference's head and beside its table of contents, with the way up at the top for a phone.
 *
 * An article says where it lives (its kicker: the group and the section), what it is, and, when the
 * reference's groups name it, which article comes before it and after it. A page that is a member of
 * a list (a team, an inducement) goes back to that list. An address with no page is an
 * article too, and says so, rather than leaving the coach on a bare screen. Two pages are drawn by
 * bodies.mjs instead of from the vault's text: Leagues and the Skill Table; a team's page is drawn by
 * team.mjs from the team's data. A skill or a trait is not an article: it is the panel beside its list
 * (list.mjs).
 */
import { drawScreen, escapeHtml, listenerGroup, patch } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { REF_SECTIONS, navRouteForPage, refUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { activeOverviewCards, findOverviewCard } from "../overview.mjs";
import { leaguesBody, skillTableBody, wireSkillTableRoller } from "./bodies.mjs";
import { REF_GROUPS, articleNeighbours, groupTitle, itemKeyOf, refGroups, sectionTitle } from "./catalog.mjs";
import { backLinkMarkup, goSearch, refHeadMarkup, refPageMarkup, refTocMarkup, wireRefSearch } from "./frame.mjs";
import { renderRefSection } from "./list.mjs";
import { refQuery, rollerState } from "./memory.mjs";
import { proseMarkup } from "./prose.mjs";
import { teamContext, teamRulesMarkup, watchTeamData } from "./team.mjs";

/** The two pages whose body is drawn by bodies.mjs, not taken from the vault. */
const LEAGUES_ID = "general-information-leagues";
const SKILL_TABLE_ID = "skills-and-traits-skill-table";

/**
 * The page an address names: the slug as it is, or the one slug that ends with it (2.x let `#/block`
 * stand for `skills/block`). Null when there is none.
 */
export function findPage(data, slug) {
  const pages = data.pages ?? [];
  return pages.find((page) => page.slug === slug) ?? pages.find((page) => page.slug.endsWith(`/${slug}`)) ?? null;
}

/** The reference list a page is a member of, or null for a page that belongs to none. */
function sectionOf(page) {
  const section = navRouteForPage(page);
  return REF_SECTIONS.has(section) ? section : null;
}

const groupOfSection = (section) => REF_GROUPS.find((group) => group.items.some((item) => item.section === section));
const groupOfPage = (page) => REF_GROUPS.find((group) => group.items.some((item) => item.page === page.id));

/** Where the way up from a page leads: its list, or the reference. */
export function parentOf(page) {
  const section = sectionOf(page);
  return section ? { href: refUrl(section), label: sectionTitle(section) } : { href: refUrl(), label: t("shell.tab.ref") };
}

/**
 * The line over an article's title that says where it lives: "Teams · Team's Rules" for a member of
 * a list, "Players · league reference" for an article of a group, "Reference" for any other page.
 */
export function kickerOf(page) {
  const section = sectionOf(page);
  if (section) {
    const group = groupOfSection(section);
    return group ? `${groupTitle(group.key)} · ${sectionTitle(section)}` : sectionTitle(section);
  }
  const group = groupOfPage(page);
  return group ? t("ref.kicker", { group: groupTitle(group.key) }) : t("shell.tab.ref");
}

/**
 * What an article says under its title. The page's own text unless the page is drawn some other way
 * (Leagues, the Skill Table: bodies.mjs; a team: team.mjs); `context` is what such a body needs besides
 * the page: the content vault (`data`) for these, and for a team the season's `standings` and the
 * `viewer` (team.mjs `teamContext`).
 */
export function articleBody(page, context = {}) {
  if (page.id === LEAGUES_ID) return leaguesBody(context.data);
  if (page.id === SKILL_TABLE_ID) return skillTableBody(context.data, page, context.roller ?? rollerState());
  if (page.kind === "team") return teamRulesMarkup({ data: context.data, page, standings: context.standings, viewer: context.viewer });
  return proseMarkup(page.html || `<p>${escapeHtml(page.text)}</p>`);
}

function pagerLink(item, side) {
  assertLinkHref(item.href);
  return `<a class="g-article__${side}" href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>`;
}

/** The article before and the article after, when the groups have either; the arrows are the sheet's. */
function pagerMarkup({ prev, next }) {
  if (!prev && !next) return "";
  return `<nav class="g-article__pager" aria-label="${escapeHtml(t("ref.pager"))}">${prev ? pagerLink(prev, "prev") : ""}${next ? pagerLink(next, "next") : ""}</nav>`;
}

/**
 * The reference page that holds an article: the head, the table of contents with `currentKey` lit,
 * and the article itself. `kicker` and `sub` are left out when empty. `screen` is what makes it this
 * article and no other (`drawScreen`): the page's slug, so that the same article drawn again stays put.
 */
function articleFrame({ screen, groups, currentKey = null, back, kicker = "", title, sub = "", bodyHtml = "", pagerHtml = "" }) {
  const head = `<div class="g-article__head">`
    + `${kicker ? `<p class="g-article__kicker">${escapeHtml(kicker)}</p>` : ""}`
    + `<h1 class="g-article__title">${escapeHtml(title)}</h1>`
    + `${sub ? `<p class="g-article__sub">${escapeHtml(sub)}</p>` : ""}</div>`;
  return refPageMarkup({
    layout: "article",
    screen: `article:${screen}`,
    headHtml: refHeadMarkup({ query: refQuery() }),
    tocHtml: refTocMarkup(groups, currentKey),
    mainHtml: `<article class="g-article">${backLinkMarkup(back)}${head}${bodyHtml}${pagerHtml}</article>`,
  });
}

/**
 * A page of the vault as an article.
 *
 * @param {object} props
 * @param {object} props.data the content vault of the language
 * @param {object} props.page the page to draw
 * @param {object[]} props.groups the table of contents, as catalog.mjs `refGroups` gives it
 * @param {object} [props.context] what the page's body needs besides the page and the vault (see `articleBody`)
 */
export function articleMarkup({ data, page, groups, context = {} }) {
  return articleFrame({
    screen: page.slug,
    groups,
    currentKey: itemKeyOf(page),
    back: parentOf(page),
    kicker: kickerOf(page),
    title: page.title,
    bodyHtml: articleBody(page, { data, ...context }),
    pagerHtml: pagerMarkup(articleNeighbours(data, page.id)),
  });
}

/** The table of contents as the page has it: the league rules count the overview's cards ahead of their pages. */
function currentGroups() {
  return refGroups(state.data, { overviewCount: activeOverviewCards().length });
}

const referenceBack = () => ({ href: refUrl(), label: t("shell.tab.ref") });

/** An address with no page behind it (`slug`: what the address said, which is also what tells it from another): said in the article's own place, with the reference all round it. */
export function notFoundMarkup(slug = "") {
  return articleFrame({ screen: slug, groups: currentGroups(), back: referenceBack(), title: t("app.pageNotFound") });
}

/**
 * The reference draws the screen and hears its band's search; drawing another article in its place
 * hooks it once. An article that is another one than the page held starts at the top (`drawScreen`),
 * the pager's next article included, wherever the link was and whichever way the coach came (a tap, a
 * Back). `wireBody` is how a body that listens too (the Skill Table's die) joins the search, so that it
 * is let go with it.
 */
function show(markup, wireBody = null) {
  drawScreen(view, markup);
  const listeners = listenerGroup(view);
  listeners.own(wireRefSearch(view, { onQuery: goSearch }));
  if (wireBody) listeners.own(wireBody());
  onScreenLeave("ref:article", listeners.release);
}

/**
 * A team's rules: drawn at once, with the league's teams of the race if the season has been read, and
 * drawn again in its place when the season comes, or the coach's own teams (the page is not wired twice,
 * and a visitor who has left is not drawn into).
 */
function renderTeamRules(page, groups) {
  const markup = () => articleMarkup({ data: state.data, page, groups, context: teamContext() });
  show(markup(), () => watchTeamData(() => patch(view, markup())));
}

/** Draw the page `slug` names (see `findPage`), or say there is none. */
export function renderReferencePage(slug) {
  const page = findPage(state.data, slug);
  if (!page) {
    show(notFoundMarkup(slug));
    return;
  }
  if (page.kind === "skill" || page.kind === "trait") {
    renderRefSection(navRouteForPage(page), { selected: page });
    return;
  }
  const groups = currentGroups();
  if (page.kind === "team") {
    renderTeamRules(page, groups);
    return;
  }
  const markup = () => articleMarkup({ data: state.data, page, groups });
  // The die changes the article, not the screen around it: the page is drawn again in its place and nothing is wired twice.
  show(markup(), page.id === SKILL_TABLE_ID ? () => wireSkillTableRoller(view, () => patch(view, markup())) : null);
}

/** An item written "Label: text" keeps its label in strong. */
function overviewItem(item = "") {
  const match = String(item).match(/^([^:]{2,42}):\s+(.+)$/);
  if (!match) return escapeHtml(item);
  return `<strong>${escapeHtml(match[1])}:</strong> ${escapeHtml(match[2])}`;
}

function overviewSection(section) {
  const items = (section.items ?? []).map((item) => `<li>${overviewItem(item)}</li>`);
  return `<section><h2>${escapeHtml(section.title)}</h2><ul>${items.join("")}</ul></section>`;
}

/** A card of the league overview: an article of the league rules, whose list is its way up. */
export function renderOverviewArticle(slug) {
  const card = findOverviewCard(slug);
  if (!card) {
    show(notFoundMarkup(`overview/${slug}`));
    return;
  }
  show(articleFrame({
    screen: `overview/${slug}`,
    groups: currentGroups(),
    currentKey: "rules",
    back: { href: refUrl("rules"), label: sectionTitle("rules") },
    kicker: sectionTitle("rules"),
    title: card.title,
    bodyHtml: proseMarkup((card.sections ?? []).map(overviewSection).join("")),
  }));
}

/** The legal notice, an article of the reference. */
export function renderLegal() {
  const paragraphs = [t("legal.paragraph1"), t("legal.paragraph2"), t("legal.paragraph3")];
  show(articleFrame({
    screen: "legal",
    groups: currentGroups(),
    back: referenceBack(),
    title: t("legal.title"),
    sub: t("legal.subtitle"),
    bodyHtml: proseMarkup(paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")),
  }));
}

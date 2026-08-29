/**
 * The catalogue screens: #/teams, #/skills, #/traits, #/rules,
 * #/cheatsheets, #/inducements, #/star-players, #/pages — one route per
 * entry in core/routes.mjs's SECTION_ROUTES.
 *
 * Mechanically moved out of src/app.js, with one deliberate change: filters
 * used to call `renderSection(route)` directly (see components/filters.mjs's
 * docstring) — it now gets that as a `rerender` callback.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { renderFilters, normalizeSkillFilters, wireFilters } from "../components/filters.mjs";
import { renderListCard } from "../components/cards.mjs";

function normalize(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesQuery(page) {
  if (!state.query) return true;
  const haystack = normalize([
    page.title,
    page.sectionLabel,
    page.text,
    ...(page.tags ?? []),
  ].join(" "));
  return haystack.includes(normalize(state.query));
}

export function isStarVisible(page) {
  return matchesQuery(page);
}

function skillGroupMatches(page, category) {
  if ((page.tags ?? []).includes(category)) return true;
  return (state.data.skillGroups ?? [])
    .some((group) => group.category === category && (group.skills ?? []).includes(page.title));
}

export function isSkillVisible(page) {
  if (!matchesQuery(page)) return false;
  const tags = page.tags ?? [];
  const { category, application } = state.skillFilters;
  if (category !== "all" && !skillGroupMatches(page, category)) return false;
  if (application !== "all" && !tags.includes(application)) return false;
  return true;
}

function collectionForRoute(route) {
  if (route === "teams") return state.data.teams;
  if (route === "skills") return state.data.skills;
  if (route === "traits") return state.data.traits;
  if (route === "rules") return state.data.rules;
  if (route === "cheatsheets") return state.data.cheatsheets;
  if (route === "inducements") return state.data.inducements;
  if (route === "star-players") return state.data.starPlayers;
  if (route === "pages") {
    return state.data.pages
      .filter((page) => page.kind === "page" && REFERENCE_PAGE_TITLES.has(page.title));
  }
  return [];
}

/** The nine reference pages, whatever else the vault holds. */
const REFERENCE_PAGE_TITLES = new Set([
  "Weather",
  "Kick-off Table",
  "Prayers to Nuffle",
  "Casualties",
  "Player Advancement",
  "Leagues",
  "Skill Table",
  "Special Rules",
  "All Gata Changes",
]);

/**
 * The four a coach reaches for during a match, in the order they need them.
 * Everything else on the References screen follows alphabetically.
 */
const PINNED_REFERENCES = ["Weather", "Kick-off Table", "Prayers to Nuffle", "Casualties"];

/** Pinned first, in their own order; the rest by name, in the reader's language. */
function byReferenceOrder(a, b) {
  const rankA = PINNED_REFERENCES.indexOf(a.title);
  const rankB = PINNED_REFERENCES.indexOf(b.title);
  if (rankA !== -1 || rankB !== -1) {
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  }
  return a.title.localeCompare(b.title, state.locale);
}

function visibleCollection(route) {
  const items = collectionForRoute(route);
  if (route === "teams") return items.filter(matchesQuery);
  if (route === "skills") return items.filter(isSkillVisible);
  if (route === "star-players") return items.filter(isStarVisible);
  return items.filter(matchesQuery);
}

export function renderSection(route) {
  setActiveNav(route);
  setViewSection(route);
  normalizeSkillFilters(route);
  const items = visibleCollection(route);
  const allItems = collectionForRoute(route);
  const sectionTitleKeys = {
    teams: "nav.teamsRules",
    skills: "nav.skills",
    traits: "nav.traits",
    rules: "section.rulesTitle",
    cheatsheets: "section.cheatsheetsTitle",
    inducements: "nav.inducements",
    "star-players": "nav.starPlayers",
    pages: "nav.references",
  };
  const sectionDescriptionKeys = {
    teams: "section.teamsDescription",
    skills: "section.skillsDescription",
    traits: "section.traitsDescription",
    rules: "section.rulesDescription",
    cheatsheets: "section.cheatsheetsDescription",
    inducements: "section.inducementsDescription",
    "star-players": "section.starPlayersDescription",
  };
  // No "create a team" here any more: the builder is opened from the Create
  // button in My Teams, so a browsing screen does not offer a second door.
  const actions = "";
  const description = route === "pages" ? "" : `${items.length} ${t("section.countOf")} ${allItems.length}. ${t(sectionDescriptionKeys[route])}`;

  // The five nested sections get a way back up: they are inside References
  // now, and the sidebar no longer holds a link to where they came from.
  const headerOptions = route === "pages" ? {} : { back: true, backFallback: "#/pages" };

  const cards = route === "pages"
    ? referenceCards(items)
    : items.map((page) => renderListCard(page, route)).join("");

  view.innerHTML = `
    ${renderHeader(t(sectionTitleKeys[route]), description, actions, headerOptions)}
    ${renderFilters(route)}
    <div class="card-grid">
      ${cards || `<div class="empty-state">${t("section.emptyState")}</div>`}
    </div>
  `;
  wireFilters(route, () => renderSection(route));
}

/**
 * The five sections that used to be sidebar entries of their own.
 *
 * The sidebar had eleven items and only the first few are things a coach opens
 * during a match; these are the reference material, so they are behind one
 * entry now. They sit in the same list as the reference pages, because to
 * somebody looking for the casualty table there is no difference between a
 * page and a catalogue — both are places to read.
 */
const REFERENCE_SECTIONS = [
  ["teams", "nav.teamsRules", "section.teamsDescription"],
  ["skills", "nav.skills", "section.skillsDescription"],
  ["traits", "nav.traits", "section.traitsDescription"],
  ["star-players", "nav.starPlayers", "section.starPlayersDescription"],
  ["inducements", "nav.inducements", "section.inducementsDescription"],
];

/** One card for a section, with the size of it, since a catalogue has one. */
function sectionCard({ route, title, description, count }) {
  return `
    <a class="card reference-section-card" href="#/${route}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <div class="meta-line">${count} ${t("section.entries")}</div>
    </a>
  `;
}

/** The References screen: pages and sections in one list, in one order. */
function referenceCards(pages) {
  const sections = REFERENCE_SECTIONS
    .map(([route, titleKey, descriptionKey]) => ({
      route,
      title: t(titleKey),
      description: t(descriptionKey),
      count: collectionForRoute(route).length,
    }))
    .filter((section) => matchesQuery({ title: section.title, text: section.description }));

  return [...pages, ...sections]
    .sort(byReferenceOrder)
    .map((entry) => (entry.route ? sectionCard(entry) : renderListCard(entry, "pages")))
    .join("");
}

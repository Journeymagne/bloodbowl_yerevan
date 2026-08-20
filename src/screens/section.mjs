/**
 * The catalogue screens: #/teams, #/skills, #/traits, #/rules,
 * #/cheatsheets, #/inducements, #/star-players, #/pages — one route per
 * entry in core/routes.mjs's SECTION_ROUTES.
 *
 * Mechanically moved out of src/app.js, with one deliberate change: filters
 * used to call `renderSection(route)` directly (see components/filters.mjs's
 * docstring) — it now gets that as a `rerender` callback.
 */
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

export function isInducementVisible(page) {
  if (!matchesQuery(page)) return false;
  return state.inducementFilters.tag === "all" || (page.tags ?? []).includes(state.inducementFilters.tag);
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
    const order = ["Weather", "Kick-off Table", "Prayers to Nuffle", "Casualties", "Player Advancement", "Leagues", "Skill Table", "Special Rules", "All Gata Changes"];
    return state.data.pages
      .filter((page) => page.kind === "page" && order.includes(page.title))
      .sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title));
  }
  return [];
}

function visibleCollection(route) {
  const items = collectionForRoute(route);
  if (route === "teams") return items.filter(matchesQuery);
  if (route === "skills") return items.filter(isSkillVisible);
  if (route === "star-players") return items.filter(isStarVisible);
  if (route === "inducements") return items.filter(isInducementVisible);
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
  const actions = route === "teams" ? `<a class="primary-button" href="#/builder">${t("section.createTeamButton")}</a>` : "";
  const description = route === "pages" ? "" : `${items.length} ${t("section.countOf")} ${allItems.length}. ${t(sectionDescriptionKeys[route])}`;

  view.innerHTML = `
    ${renderHeader(t(sectionTitleKeys[route]), description, actions)}
    ${renderFilters(route)}
    <div class="card-grid">
      ${items.length ? items.map((page) => renderListCard(page, route)).join("") : `<div class="empty-state">${t("section.emptyState")}</div>`}
    </div>
  `;
  wireFilters(route, () => renderSection(route));
}

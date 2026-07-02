const state = {
  data: null,
  query: "",
  teamFilters: {
    type: "all",
    league: "all",
    skill: "all",
    tag: "all",
    price: "all",
  },
  starFilters: {
    tag: "all",
  },
  inducementFilters: {
    tag: "all",
  },
  skillFilters: {
    category: "all",
    application: "all",
  },
  skillTableRoller: {
    group: "Agility",
    result: "",
    roll: null,
  },
  builder: {
    teamSlug: "",
    teamName: "",
    budget: 600,
    roster: {},
    rerolls: 0,
    apothecary: false,
    bribes: 0,
    dedicatedFans: 0,
    assistantCoaches: 0,
    cheerleaders: 0,
  },
};

const view = document.querySelector("#app-view");
const searchInput = document.querySelector("#global-search");
const generatedAt = document.querySelector("#generated-at");
const langToggle = document.querySelector("#lang-toggle");

const sectionRoutes = new Map([
  ["teams", "teams"],
  ["skills", "skills"],
  ["traits", "traits"],
  ["rules", "rules"],
  ["cheatsheets", "cheatsheets"],
  ["inducements", "inducements"],
  ["star-players", "star-players"],
  ["pages", "pages"],
]);
const staticRoutes = new Set(["builder", "legal"]);

const builderStaffCosts = {
  dedicatedFans: 10,
  assistantCoaches: 10,
  cheerleaders: 10,
};

const builderStaffMaximums = {
  rerolls: 8,
  bribes: 3,
  dedicatedFans: 6,
  assistantCoaches: 6,
  cheerleaders: 6,
};

const sectionTitles = {
  teams: "Teams",
  skills: "Skills",
  traits: "Traits",
  rules: "League Rules",
  cheatsheets: "Cheatsheets",
  inducements: "Inducements",
  "star-players": "Star Players",
  pages: "General Information",
};

const sectionDescriptions = {
  teams: "Browse rosters, tiers, special rules and team-building data.",
  skills: "Skill reference with category and active/passive filters.",
  traits: "Trait reference for players, star players and special rules.",
  rules: "Gata league format, roster creation, season flow and league-specific rulings.",
  cheatsheets: "Compact tables and match aids used during play.",
  inducements: "Inducements and match extras available in the league.",
  "star-players": "Star player costs, availability groups, keywords and abilities.",
  pages: "General reference pages and useful external links.",
};

const quickPreviews = new Map([
  ["1. League Basics", "League format, event tone, dice/model expectations and core conduct for Gata league games."],
  ["2. Team Creation", "Starting roster rules, team budget, model requirements and how new teams enter the league."],
  ["3. Team Management", "Team transfers, treasury, player contracts, injuries and post-game roster management."],
  ["4. Match Procedures", "Season structure, weekly games, match organization and league-point handling."],
  ["5. Patch Notes", "Current Gata League 2 changes to teams, skills, traits and special rulings."],
  ["Reference Sources", "External references for base Blood Bowl 2025 wording and the site's legal/source notes."],
]);

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortText(value = "", length = 180) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}...` : clean;
}

function normalize(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function pageUrl(page) {
  return `#/${page.slug}`;
}

function isSkillTablePage(page) {
  return page.title === "Skill Table";
}

function pageForSkillTableEntry(title) {
  return state.data.skills.find((page) => page.title === title)
    ?? state.data.traits.find((page) => page.title === title)
    ?? state.data.pages.find((page) => page.title === title)
    ?? null;
}

function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === route);
  });
}

function setViewSection(section) {
  view.dataset.section = section;
}

function navRouteForPage(page) {
  if (page.kind === "team") return "teams";
  if (page.kind === "skill") return "skills";
  if (page.kind === "trait") return "traits";
  if (page.kind === "rules") return "rules";
  if (page.kind === "cheatsheet") return "cheatsheets";
  if (page.kind === "inducement") return "inducements";
  if (page.kind === "starPlayer") return "star-players";
  return "pages";
}

function routeSection(route) {
  if (!route || route === "home") return "home";
  if (sectionRoutes.has(route)) return route;
  if (staticRoutes.has(route)) return route;
  const page = findPageBySlug(route);
  return page ? navRouteForPage(page) : "home";
}

function findPageBySlug(slug) {
  return state.data.pages.find((page) => page.slug === slug)
    ?? state.data.pages.find((page) => page.slug.endsWith(`/${slug}`))
    ?? null;
}

function matchesQuery(page) {
  if (!state.query) return true;
  const haystack = normalize([
    page.title,
    page.sectionLabel,
    page.text,
    ...(page.tags ?? []),
  ].join(" "));
  return haystack.includes(normalize(state.query));
}

function splitList(value = "") {
  return String(value)
    .split(/,|;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function costToNumber(value = "") {
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function rowCost(row) {
  return row.cost ?? row.price ?? "";
}

function optionLabel(value) {
  return value === "-" ? "None" : value;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

function rowsForTeam(team) {
  return team.team?.roster ?? [];
}

function allRosterRows() {
  return state.data.teams.flatMap(rowsForTeam);
}

function allRowSkills() {
  return uniqueSorted(allRosterRows().flatMap((row) => row.skills ?? []));
}

function allRowTags() {
  return uniqueSorted(allRosterRows().flatMap((row) => row.tags ?? []));
}

function allRowCosts() {
  return uniqueSorted(allRosterRows().map(rowCost).filter(Boolean));
}

function isTeamVisible(team) {
  if (!matchesQuery(team)) return false;
  const { type, league, skill, tag, price } = state.teamFilters;
  const roster = rowsForTeam(team);
  if (type === "core" && team.team?.experimental) return false;
  if (type === "experimental" && !team.team?.experimental) return false;
  if (league !== "all" && team.team?.meta?.league !== league) return false;
  if (skill !== "all" && !roster.some((row) => (row.skills ?? []).includes(skill))) return false;
  if (tag !== "all" && !roster.some((row) => (row.tags ?? []).includes(tag))) return false;
  if (price !== "all" && !roster.some((row) => rowCost(row) === price)) return false;
  return true;
}

function isStarVisible(page) {
  if (!matchesQuery(page)) return false;
  return state.starFilters.tag === "all" || (page.tags ?? []).includes(state.starFilters.tag);
}

function isInducementVisible(page) {
  if (!matchesQuery(page)) return false;
  return state.inducementFilters.tag === "all" || (page.tags ?? []).includes(state.inducementFilters.tag);
}

function skillGroupMatches(page, category) {
  if ((page.tags ?? []).includes(category)) return true;
  return (state.data.skillGroups ?? [])
    .some((group) => group.category === category && (group.skills ?? []).includes(page.title));
}

function isSkillVisible(page) {
  if (!matchesQuery(page)) return false;
  const tags = page.tags ?? [];
  const { category, application } = state.skillFilters;
  if (category !== "all" && !skillGroupMatches(page, category)) return false;
  if (application !== "all" && !tags.includes(application)) return false;
  return true;
}

function badgeList(items, limit = 4) {
  const visible = (items ?? []).slice(0, limit);
  const extra = (items ?? []).length - visible.length;
  return [
    ...visible.map((item) => `<span class="badge">${escapeHtml(item)}</span>`),
    extra > 0 ? `<span class="badge">+${extra}</span>` : "",
  ].join("");
}

function renderHeader(title, description, actions = "") {
  return `
    <header class="page-head">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      </div>
      ${actions ? `<div class="toolbar">${actions}</div>` : ""}
    </header>
  `;
}

function renderHome() {
  setActiveNav("home");
  setViewSection("home");
  const quickPages = [
    ...["1. League Basics", "2. Team Creation", "3. Team Management", "4. Match Procedures", "5. Patch Notes"]
      .map((title) => state.data.rules.find((page) => page.title === title))
      .filter(Boolean),
    state.data.otherPages?.find((page) => page.title === "Reference Sources"),
  ].filter(Boolean);

  view.innerHTML = `
    <section class="league-hero">
      <div class="league-hero-copy">
        <h1>Gata Blood Bowl League</h1>
        <p>Teams, star players, skills, traits and league rules in one searchable reference.</p>
      </div>
      <div class="league-hero-media" aria-hidden="true">
        <img src="assets/brand/gata-league-logo.png" alt="">
      </div>
    </section>

    <section>
      <div class="page-head">
        <div>
          <h1>Quick Start</h1>
          <p>Jump into the most useful league pages, or use search for teams, rules, skills and star players.</p>
        </div>
      </div>
      <div class="card-grid quick-grid">
        <a class="card compact" href="#/teams">
          <h3>Teams</h3>
          <p>${state.data.counts.teams} rosters with team-building data.</p>
        </a>
        <a class="card compact" href="#/builder">
          <h3>Team Builder</h3>
          <p>Create a 600k Sevens roster and copy it for sharing.</p>
        </a>
        <a class="card compact" href="#/star-players">
          <h3>Star Players</h3>
          <p>${state.data.counts.starPlayers} stars with costs and availability.</p>
        </a>
        ${quickPages.map(renderSimpleCard).join("")}
      </div>
    </section>
  `;
}

function renderSimpleCard(page) {
  const preview = quickPreviews.get(page.title) ?? shortText(page.text, 135);
  return `
    <a class="card compact" href="${pageUrl(page)}">
      <h3>${escapeHtml(page.title)}</h3>
      <p>${escapeHtml(preview)}</p>
    </a>
  `;
}

function collectionForRoute(route) {
  if (route === "teams") return state.data.teams;
  if (route === "skills") return state.data.skills;
  if (route === "traits") return state.data.traits;
  if (route === "rules") return state.data.rules;
  if (route === "cheatsheets") return state.data.cheatsheets;
  if (route === "inducements") return state.data.inducements;
  if (route === "star-players") return state.data.starPlayers;
  if (route === "pages") return state.data.pages.filter((page) => page.kind === "page");
  return [];
}

function visibleCollection(route) {
  const items = collectionForRoute(route);
  if (route === "teams") return items.filter(isTeamVisible);
  if (route === "skills" || route === "traits") return items.filter(isSkillVisible);
  if (route === "star-players") return items.filter(isStarVisible);
  if (route === "inducements") return items.filter(isInducementVisible);
  return items.filter(matchesQuery);
}

function renderSection(route) {
  setActiveNav(route);
  setViewSection(route);
  const items = visibleCollection(route);
  const allItems = collectionForRoute(route);
  const actions = route === "teams" ? `<a class="primary-button" href="#/builder">Create Team!</a>` : "";

  view.innerHTML = `
    ${renderHeader(sectionTitles[route], `${items.length} of ${allItems.length}. ${sectionDescriptions[route]}`, actions)}
    ${renderFilters(route)}
    <div class="card-grid">
      ${items.length ? items.map((page) => renderListCard(page, route)).join("") : `<div class="empty-state">Nothing found. Try changing the search or filters.</div>`}
    </div>
  `;
  wireFilters(route);
}

function renderFilters(route) {
  if (route === "teams") return renderTeamFilters();
  if (route === "skills" || route === "traits") return renderSkillFilters();
  if (route === "star-players") return renderStarFilters();
  if (route === "inducements") return renderInducementFilters();
  return "";
}

function renderOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderTeamFilters() {
  const leagues = uniqueSorted(state.data.teams.map((team) => team.team?.meta?.league));
  const skills = allRowSkills();
  const tags = allRowTags();
  const prices = allRowCosts();
  const f = state.teamFilters;
  return `
    <div class="filter-panel" data-filter-panel="teams">
      <label class="filter-field"><span>Type</span><select data-filter="type">
        ${renderOption("all", "All teams", f.type)}
        ${renderOption("core", "Core", f.type)}
        ${renderOption("experimental", "Experimental", f.type)}
      </select></label>
      <label class="filter-field"><span>League</span><select data-filter="league">
        ${renderOption("all", "Any league", f.league)}
        ${leagues.map((league) => renderOption(league, league, f.league)).join("")}
      </select></label>
      <label class="filter-field"><span>Skill or trait</span><select data-filter="skill">
        ${renderOption("all", "Any skill", f.skill)}
        ${skills.map((skill) => renderOption(skill, skill, f.skill)).join("")}
      </select></label>
      <label class="filter-field"><span>Player tag</span><select data-filter="tag">
        ${renderOption("all", "Any tag", f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
      </select></label>
      <label class="filter-field"><span>Player cost</span><select data-filter="price">
        ${renderOption("all", "Any cost", f.price)}
        ${prices.map((price) => renderOption(price, price, f.price)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>Reset</button>
    </div>
  `;
}

function renderSkillFilters() {
  const tags = uniqueSorted([...state.data.skills, ...state.data.traits].flatMap((page) => page.tags ?? []));
  const groupCategories = (state.data.skillGroups ?? []).map((group) => group.category);
  const categories = uniqueSorted([
    ...groupCategories,
    ...tags.filter((tag) => !["Active", "Passive"].includes(tag)),
  ]);
  const f = state.skillFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="skills">
      <label class="filter-field"><span>Group</span><select data-filter="category">
        ${renderOption("all", "Any group", f.category)}
        ${categories.map((tag) => renderOption(tag, tag, f.category)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>Reset</button>
    </div>
  `;
}

function renderStarFilters() {
  const tags = uniqueSorted(state.data.starPlayers.flatMap((page) => page.tags ?? []));
  const f = state.starFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="star-players">
      <label class="filter-field"><span>Player tag</span><select data-filter="tag">
        ${renderOption("all", "Any tag", f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>Reset</button>
    </div>
  `;
}

function renderInducementFilters() {
  const tags = uniqueSorted(state.data.inducements.flatMap((page) => page.tags ?? []));
  const f = state.inducementFilters;
  return `
    <div class="filter-panel compact-panel" data-filter-panel="inducements">
      <label class="filter-field"><span>Inducement tag</span><select data-filter="tag">
        ${renderOption("all", "Any tag", f.tag)}
        ${tags.map((tag) => renderOption(tag, tag, f.tag)).join("")}
      </select></label>
      <button class="filter-button" type="button" data-reset-filters>Reset</button>
    </div>
  `;
}

function wireFilters(route) {
  view.querySelectorAll("[data-filter]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.filter;
      const value = event.currentTarget.value;
      if (route === "teams") state.teamFilters[key] = value;
      if (route === "skills" || route === "traits") state.skillFilters[key] = value;
      if (route === "star-players") state.starFilters[key] = value;
      if (route === "inducements") state.inducementFilters[key] = value;
      renderSection(route);
    });
  });
  view.querySelector("[data-reset-filters]")?.addEventListener("click", () => {
    if (route === "teams") {
      state.teamFilters = { type: "all", league: "all", skill: "all", tag: "all", price: "all" };
    }
    if (route === "skills" || route === "traits") {
      state.skillFilters = { category: "all", application: "all" };
    }
    if (route === "star-players") state.starFilters = { tag: "all" };
    if (route === "inducements") state.inducementFilters = { tag: "all" };
    renderSection(route);
  });
}

function renderListCard(page, route) {
  if (route === "teams") {
    return `
      <a class="card compact" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <p>${escapeHtml(page.team?.meta?.league ?? "League roster")}</p>
      </a>
    `;
  }
  if (route === "star-players") {
    return `
      <a class="card" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <p>${escapeHtml([page.starPlayer?.cost, page.starPlayer?.availability].filter(Boolean).join(" · "))}</p>
        <div class="meta-line">${badgeList(page.tags, 3)}</div>
      </a>
    `;
  }
  if (route === "skills" || route === "traits") {
    return `
      <a class="card compact" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <div class="meta-line">${badgeList(page.tags, 4)}</div>
      </a>
    `;
  }
  const preview = shortText(page.text.replace(/Full base wording:.*/i, "").trim(), 155);
  return `
    <a class="card" href="${pageUrl(page)}">
      <h3>${escapeHtml(page.title)}</h3>
      <p>${escapeHtml(preview)}</p>
      <div class="meta-line">${badgeList(page.tags, 3)}</div>
    </a>
  `;
}

function renderDetail(page) {
  const route = navRouteForPage(page);
  setActiveNav(route);
  setViewSection(route);
  const sidebar = renderSidebar(page);
  view.innerHTML = `
    ${renderHeader(page.title, page.sectionLabel)}
    <div class="detail-layout">
      <article class="content-panel content-body">
        ${isSkillTablePage(page) ? renderSkillTableRoller() : ""}
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </article>
      ${sidebar}
    </div>
  `;
  wireSkillTableRoller(page);
}

function renderSkillTableRoller() {
  const groups = state.data.skillGroups ?? [];
  const selectedGroup = groups.find((group) => group.category === state.skillTableRoller.group) ?? groups[0];
  if (!selectedGroup) return "";

  const skills = selectedGroup.skills ?? [];
  const result = skills.includes(state.skillTableRoller.result) ? state.skillTableRoller.result : "";
  const resultPage = result ? pageForSkillTableEntry(result) : null;
  const resultMarkup = result
    ? `<a class="skill-roll-result-link" href="${resultPage ? pageUrl(resultPage) : "#/skill-table"}">${escapeHtml(result)}</a>`
    : `<span class="skill-roll-placeholder">Ready to roll 1d${skills.length}.</span>`;

  return `
    <section class="skill-roll-panel" aria-label="Skill randomizer">
      <div class="skill-roll-controls">
        <label class="filter-field">
          <span>Skill group</span>
          <select data-skill-roll-group>
            ${groups.map((group) => renderOption(group.category, group.category, selectedGroup.category)).join("")}
          </select>
        </label>
        <button class="primary-button" type="button" data-skill-roll>Roll</button>
      </div>
      <div class="skill-roll-result">
        <span class="skill-roll-die">1d${skills.length}${state.skillTableRoller.roll ? `: ${state.skillTableRoller.roll}` : ""}</span>
        ${resultMarkup}
      </div>
    </section>
  `;
}

function wireSkillTableRoller(page) {
  if (!isSkillTablePage(page)) return;

  view.querySelector("[data-skill-roll-group]")?.addEventListener("change", (event) => {
    state.skillTableRoller.group = event.currentTarget.value;
    state.skillTableRoller.result = "";
    state.skillTableRoller.roll = null;
    renderDetail(page);
  });

  view.querySelector("[data-skill-roll]")?.addEventListener("click", () => {
    const group = (state.data.skillGroups ?? []).find((item) => item.category === state.skillTableRoller.group);
    const skills = group?.skills ?? [];
    if (!skills.length) return;
    const index = Math.floor(Math.random() * skills.length);
    state.skillTableRoller.result = skills[index];
    state.skillTableRoller.roll = index + 1;
    renderDetail(page);
  });
}

function renderSidebar(page) {
  if (page.kind === "team") {
    const roster = rowsForTeam(page);
    const costs = uniqueSorted(roster.map((row) => row.cost).filter(Boolean));
    return `
      <aside class="side-panel">
        <h3>Team</h3>
        <dl class="stat-list">
          <dt>Positions</dt><dd>${roster.length}</dd>
          <dt>Player cost</dt><dd>${escapeHtml(costs.join(" - ") || "-")}</dd>
          <dt>Rerolls</dt><dd>${escapeHtml(page.team?.meta?.rerolls ?? "-")}</dd>
          <dt>Apothecary</dt><dd>${escapeHtml(cleanApothecary(page.team?.meta?.apothecary))}</dd>
          <dt>League</dt><dd>${escapeHtml(page.team?.meta?.league ?? "-")}</dd>
          <dt>Special rules</dt><dd>${badgeList(splitList(page.team?.meta?.specialRules ?? ""), 8)}</dd>
        </dl>
      </aside>
    `;
  }
  if (page.kind === "starPlayer") {
    return `
      <aside class="side-panel">
        <h3>Star Player</h3>
        <dl class="stat-list">
          <dt>Cost</dt><dd>${escapeHtml(page.starPlayer?.cost ?? "-")}</dd>
          <dt>Availability</dt><dd>${escapeHtml(page.starPlayer?.availability ?? "-")}</dd>
          <dt>Tags</dt><dd>${badgeList(page.tags, 8)}</dd>
        </dl>
      </aside>
    `;
  }
  return `
    <aside class="side-panel">
      <h3>Page</h3>
      <dl class="stat-list">
        <dt>Category</dt><dd>${escapeHtml(page.sectionLabel)}</dd>
        ${page.tags?.length ? `<dt>Tags</dt><dd>${badgeList(page.tags, 8)}</dd>` : ""}
      </dl>
    </aside>
  `;
}

function cleanApothecary(value = "") {
  return String(value).replace(/^Apothecary:\s*/i, "") || "-";
}

function renderLegal() {
  setActiveNav("legal");
  setViewSection("pages");
  view.innerHTML = `
    ${renderHeader("Legal Information", "Unofficial fan-made reference for a private Blood Bowl league.")}
    <article class="content-panel content-body">
      <p>Gata Blood Bowl League is an unofficial fan reference. It is not affiliated with, endorsed by, or sponsored by Games Workshop.</p>
      <p>Blood Bowl and related names belong to their respective owners. This site is intended to document league-specific house rules and help players navigate their local league.</p>
      <p>Base game wording is referenced through Blood Bowl Base where appropriate instead of being reproduced here in full.</p>
    </article>
  `;
}

function renderBuilder() {
  setActiveNav("teams");
  setViewSection("teams");
  const teams = state.data.teams;
  if (!state.builder.teamSlug && teams[0]) {
    state.builder.teamSlug = teams[0].slug;
    state.builder.teamName = teams[0].title;
  }
  const team = teams.find((item) => item.slug === state.builder.teamSlug) ?? teams[0];
  const rows = rowsForTeam(team);
  const costs = calculateBuilderCosts(team);
  const warnings = builderWarnings(team, costs);

  view.innerHTML = `
    ${renderHeader("Team Builder", "Create a 600k Sevens roster and copy it for sharing.")}
    <div class="builder-layout">
      <section class="builder-panel">
        <div class="builder-form">
          <label class="filter-field">
            <span>Team</span>
            <select data-builder-team>
              ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>Roster name</span>
            <input type="text" value="${escapeHtml(state.builder.teamName || team.title)}" data-builder-name>
          </label>
          <label class="filter-field">
            <span>Budget</span>
            <input type="number" min="100" step="10" value="${state.builder.budget}" data-builder-budget>
          </label>
          <a class="primary-button full-width" href="${pageUrl(team)}">Open Team</a>
        </div>

        <div class="builder-addons">
          ${renderAddon("rerolls", "Rerolls", `${team.team?.meta?.rerolls ?? "-"} each`, builderStaffMaximums.rerolls, state.builder.rerolls, costToNumber(team.team?.meta?.rerolls))}
          ${renderAddon("apothecary", "Apothecary", "50k", 1, state.builder.apothecary ? 1 : 0, 50, !hasApothecary(team))}
          ${renderAddon("bribes", "Bribes", "50k each", builderStaffMaximums.bribes, state.builder.bribes, 50, !hasBribery(team))}
          ${renderAddon("dedicatedFans", "Dedicated Fans", "10k each", builderStaffMaximums.dedicatedFans, state.builder.dedicatedFans, 10)}
          ${renderAddon("assistantCoaches", "Assistant Coaches", "10k each", builderStaffMaximums.assistantCoaches, state.builder.assistantCoaches, 10)}
          ${renderAddon("cheerleaders", "Cheerleaders", "10k each", builderStaffMaximums.cheerleaders, state.builder.cheerleaders, 10)}
        </div>

        <div class="builder-roster">
          ${rows.map((row, index) => renderBuilderRow(row, index)).join("")}
        </div>
      </section>

      <aside class="builder-summary side-panel">
        <h3>Roster Summary</h3>
        <dl class="stat-list">
          <dt>Players</dt><dd>${costs.playersCount}</dd>
          <dt>Players cost</dt><dd>${costs.playersCost}k</dd>
          <dt>Staff cost</dt><dd>${costs.staffCost}k</dd>
          <dt>Total</dt><dd>${costs.total}k / ${state.builder.budget}k</dd>
          <dt>Remaining</dt><dd class="${costs.remaining < 0 ? "danger-text" : ""}">${costs.remaining}k</dd>
        </dl>
        ${warnings.length ? `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : `<div class="builder-ok">Roster is within the current limits.</div>`}
        <button class="primary-button full-width" type="button" data-copy-roster>Copy Roster</button>
        <button class="filter-button full-width" type="button" data-download-roster>Download .txt</button>
      </aside>
    </div>
  `;
  wireBuilder(team);
}

function renderAddon(key, title, description, max, value, cost, disabled = false) {
  const current = disabled ? 0 : value;
  return `
    <div class="builder-addon ${disabled ? "disabled" : ""}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(disabled ? "Not available for this team" : description)}</span>
      </div>
      ${renderStepper(`builder-addon-${key}`, current, 0, max, disabled || !cost)}
    </div>
  `;
}

function renderBuilderRow(row, index) {
  const value = state.builder.roster[index] ?? 0;
  const max = rosterMax(row.qty);
  return `
    <div class="builder-row">
      <div>
        <strong>${escapeHtml(row.position)}</strong>
        <span>${escapeHtml([row.qty, rowCost(row), (row.skills ?? []).join(", "), (row.tags ?? []).join(", ")].filter(Boolean).join(" · "))}</span>
      </div>
      ${renderStepper(`builder-row-${index}`, value, 0, max)}
    </div>
  `;
}

function renderStepper(name, value, min, max, disabled = false) {
  return `
    <div class="stepper" data-stepper="${escapeHtml(name)}" data-min="${min}" data-max="${max}">
      <button type="button" data-step="-1" data-builder-step="-1" onclick="this.dispatchEvent(new Event('builderstep',{bubbles:true}))" ${disabled || value <= min ? "disabled" : ""}>-</button>
      <output>${value}</output>
      <button type="button" data-step="1" data-builder-step="1" onclick="this.dispatchEvent(new Event('builderstep',{bubbles:true}))" ${disabled || value >= max ? "disabled" : ""}>+</button>
    </div>
  `;
}

function rosterMax(value = "") {
  const match = String(value).match(/-(\d+)/);
  return match ? Number(match[1]) : 16;
}

function hasApothecary(team) {
  return /available|yes/i.test(team.team?.meta?.apothecary ?? "");
}

function hasBribery(team) {
  return /bribery\s+and\s+corruption/i.test(team.team?.meta?.specialRules ?? "");
}

function calculateBuilderCosts(team) {
  const roster = rowsForTeam(team);
  const players = roster.map((row, index) => ({ count: state.builder.roster[index] ?? 0, cost: costToNumber(rowCost(row)) }));
  const playersCount = players.reduce((sum, item) => sum + item.count, 0);
  const playersCost = players.reduce((sum, item) => sum + item.count * item.cost, 0);
  const rerollCost = costToNumber(team.team?.meta?.rerolls) * state.builder.rerolls;
  const apothecaryCost = state.builder.apothecary && hasApothecary(team) ? 50 : 0;
  const bribeCost = hasBribery(team) ? state.builder.bribes * 50 : 0;
  const staffCost = rerollCost
    + apothecaryCost
    + bribeCost
    + state.builder.dedicatedFans * builderStaffCosts.dedicatedFans
    + state.builder.assistantCoaches * builderStaffCosts.assistantCoaches
    + state.builder.cheerleaders * builderStaffCosts.cheerleaders;
  const total = playersCost + staffCost;
  return { playersCount, playersCost, staffCost, total, remaining: state.builder.budget - total };
}

function builderWarnings(team, costs) {
  const warnings = [];
  if (costs.remaining < 0) warnings.push("Roster is over budget.");
  if (costs.playersCount < 7) warnings.push("A Sevens roster usually needs at least 7 players.");
  if (costs.playersCount > 11) warnings.push("A Sevens roster should not exceed 11 players.");
  rowsForTeam(team).forEach((row, index) => {
    const count = state.builder.roster[index] ?? 0;
    const minMatch = String(row.qty).match(/^(\d+)-/);
    const min = minMatch ? Number(minMatch[1]) : 0;
    const max = rosterMax(row.qty);
    if (count < min) warnings.push(`${row.position}: minimum is ${min}.`);
    if (count > max) warnings.push(`${row.position}: maximum is ${max}.`);
  });
  return warnings;
}

function wireBuilder(team) {
  view.querySelector("[data-builder-team]")?.addEventListener("change", (event) => {
    state.builder.teamSlug = event.currentTarget.value;
    const nextTeam = state.data.teams.find((item) => item.slug === state.builder.teamSlug);
    state.builder.teamName = nextTeam?.title ?? "";
    state.builder.roster = {};
    state.builder.rerolls = 0;
    state.builder.apothecary = false;
    state.builder.bribes = 0;
    renderBuilder();
  });
  view.querySelector("[data-builder-name]")?.addEventListener("input", (event) => {
    state.builder.teamName = event.currentTarget.value;
  });
  view.querySelector("[data-builder-budget]")?.addEventListener("change", (event) => {
    state.builder.budget = Math.max(100, Number(event.currentTarget.value) || 600);
    renderBuilder();
  });
  view.querySelector("[data-copy-roster]")?.addEventListener("click", () => copyRoster(team));
  view.querySelector("[data-download-roster]")?.addEventListener("click", () => downloadRoster(team));
}

function handleBuilderStepEvent(event) {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  const button = target?.closest("button[data-builder-step]");
  if (!button) return;
  const stepper = button.closest("[data-stepper]");
  if (!stepper) return;

  const key = stepper.dataset.stepper;
  const delta = Number(button.dataset.builderStep);
  if (key.startsWith("builder-row-")) {
    const index = key.replace("builder-row-", "");
    const current = state.builder.roster[index] ?? 0;
    state.builder.roster[index] = clamp(current + delta, Number(stepper.dataset.min), Number(stepper.dataset.max));
  } else {
    const addon = key.replace("builder-addon-", "");
    if (addon === "apothecary") {
      state.builder.apothecary = !state.builder.apothecary;
    } else {
      state.builder[addon] = clamp((state.builder[addon] ?? 0) + delta, Number(stepper.dataset.min), Number(stepper.dataset.max));
    }
  }
  renderBuilder();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function copyRoster(team) {
  const lines = buildRosterText(team);
  await navigator.clipboard.writeText(lines);
  const button = view.querySelector("[data-copy-roster]");
  if (button) {
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy Roster"; }, 1200);
  }
}

function buildRosterText(team) {
  const rows = rowsForTeam(team);
  const selected = rows
    .map((row, index) => ({ row, count: state.builder.roster[index] ?? 0 }))
    .filter((item) => item.count > 0);
  const costs = calculateBuilderCosts(team);
  const lines = [
    `${state.builder.teamName || team.title} (${team.title})`,
    `Budget: ${state.builder.budget}k`,
    `Total: ${costs.total}k`,
    "",
    ...selected.map(({ row, count }) => `${count}x ${row.position} - ${rowCost(row)}`),
    state.builder.rerolls ? `Rerolls: ${state.builder.rerolls}` : "",
    state.builder.apothecary ? "Apothecary: 1" : "",
    state.builder.bribes ? `Bribes: ${state.builder.bribes}` : "",
    state.builder.dedicatedFans ? `Dedicated Fans: ${state.builder.dedicatedFans}` : "",
    state.builder.assistantCoaches ? `Assistant Coaches: ${state.builder.assistantCoaches}` : "",
    state.builder.cheerleaders ? `Cheerleaders: ${state.builder.cheerleaders}` : "",
  ].filter(Boolean).join("\n");
  return lines;
}

function downloadRoster(team) {
  const text = buildRosterText(team);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = (state.builder.teamName || team.title || "gata-roster")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "gata-roster";
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderRoute() {
  const route = decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "home";
  const section = routeSection(route);
  if (route === "home") return renderHome();
  if (sectionRoutes.has(route)) return renderSection(route);
  if (route === "builder") return renderBuilder();
  if (route === "legal") return renderLegal();
  const page = findPageBySlug(route);
  if (page) return renderDetail(page);
  setActiveNav("home");
  setViewSection("home");
  view.innerHTML = `<div class="empty-state">Page not found.</div>`;
}

async function init() {
  const response = await fetch("public/data.json", { cache: "no-store" });
  state.data = await response.json();
  if (generatedAt) {
    generatedAt.textContent = `Updated ${new Date(state.data.generatedAt).toLocaleDateString("en-GB")}`;
  }
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.query = event.currentTarget.value;
      renderRoute();
    });
  }
  view.addEventListener("builderstep", handleBuilderStepEvent);
  if (langToggle) {
    langToggle.textContent = "EN";
    langToggle.title = "English version";
  }
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}

init().catch((error) => {
  console.error(error);
  view.innerHTML = `<div class="empty-state">Could not load site data.</div>`;
});

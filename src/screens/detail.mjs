/**
 * The catch-all content-page screen: any single team/skill/trait/star-player/
 * rules page, plus the three pages that replace their body with something
 * else entirely (Leagues, the skill table roller, Kick-off/Prayers cards).
 *
 * Mechanically moved out of src/app.js.
 */
import { escapeHtml, renderOption } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { inlineSimpleMarkdown, parseFirstMarkdownTable } from "../core/markdown.mjs";
import { listUrlForRoute, navRouteForPage, pageUrl } from "../core/routes.mjs";
import { rowCost, rowsForTeam } from "../domain/roster/values.mjs";
import { cleanApothecary, teamLeagueOptions, teamSpecialRuleTokens } from "../domain/roster/team-rules.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { badgeList } from "../components/cards.mjs";
import { pageForSkillTableEntry, renderRosterLinks, renderRuleLinks, uniqueSorted } from "../components/content-links.mjs";
import { isLeaguesPage, renderLeaguesReferencePage } from "./leagues.mjs";

export function isSkillTablePage(page) {
  return page.title === "Skill Table";
}

export function isMobileCardTablePage(page) {
  return ["Kick-off Table", "Prayers to Nuffle"].includes(page.title);
}

export function renderDetail(page) {
  const route = navRouteForPage(page);
  setActiveNav(route);
  setViewSection(route);
  const sidebar = renderSidebar(page);
  let content = page.html || `<p>${escapeHtml(page.text)}</p>`;
  if (isLeaguesPage(page)) {
    content = renderLeaguesReferencePage();
  } else if (page.kind === "team") {
    content = `
      ${renderTeamRosterMobile(page)}
      <div class="team-roster-desktop">
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </div>
    `;
  } else if (isSkillTablePage(page)) {
    content = `
      ${renderSkillTableRoller()}
      ${renderSkillTableMobile()}
      <div class="skill-table-desktop">
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </div>
    `;
  } else if (isMobileCardTablePage(page)) {
    content = `
      ${renderReferenceTableMobile(page)}
      <div class="reference-table-desktop">
        ${page.html || `<p>${escapeHtml(page.text)}</p>`}
      </div>
    `;
  }
  view.innerHTML = `
    ${renderHeader(page.title, page.sectionLabel, "", { back: true, backFallback: listUrlForRoute(route) })}
    <div class="detail-layout">
      <article class="content-panel content-body">
        ${content}
      </article>
      ${sidebar}
    </div>
  `;
  wireSkillTableRoller(page);
}

function renderRosterValues(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => `<span class="roster-pill roster-pill-muted">${escapeHtml(item)}</span>`).join("");
}

export function renderRosterStatGrid(row) {
  return `
    <dl class="team-stat-grid">
      <div><dt>${t("stats.ma")}</dt><dd>${escapeHtml(row.ma || "-")}</dd></div>
      <div><dt>${t("stats.st")}</dt><dd>${escapeHtml(row.st || "-")}</dd></div>
      <div><dt>${t("stats.ag")}</dt><dd>${escapeHtml(row.ag || "-")}</dd></div>
      <div><dt>${t("stats.pa")}</dt><dd>${escapeHtml(row.pa || "-")}</dd></div>
      <div><dt>${t("stats.ar")}</dt><dd>${escapeHtml(row.ar || "-")}</dd></div>
    </dl>
  `;
}

function renderTeamRosterMobile(team) {
  const rows = rowsForTeam(team);
  if (!rows.length) return "";

  return `
    <section class="team-roster-mobile" aria-label="${escapeHtml(team.title)} roster">
      ${rows.map((row) => `
        <article class="team-roster-card">
          <header>
            <div>
              <h2>${escapeHtml(row.position)}</h2>
              <span>${escapeHtml(row.qty || "-")}</span>
            </div>
            <strong>${escapeHtml(rowCost(row) || "-")}</strong>
          </header>
          ${renderRosterStatGrid(row)}
          <div class="team-roster-field">
            <span>${t("roster.skillsLabel")}</span>
            <div>${renderRosterLinks(row.skills)}</div>
          </div>
          <div class="team-roster-columns">
            <div class="team-roster-field">
              <span>${t("roster.primary")}</span>
              <div>${renderRosterValues(row.primary)}</div>
            </div>
            <div class="team-roster-field">
              <span>${t("roster.secondary")}</span>
              <div>${renderRosterValues(row.secondary)}</div>
            </div>
          </div>
          <div class="team-roster-field">
            <span>${t("roster.tags")}</span>
            <div>${renderRosterValues(row.tags)}</div>
          </div>
        </article>
      `).join("")}
    </section>
  `;
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
    : `<span class="skill-roll-placeholder">${t("skillRoll.readyPrefix")}${skills.length}.</span>`;

  return `
    <section class="skill-roll-panel" aria-label="Skill randomizer">
      <div class="skill-roll-controls">
        <label class="filter-field">
          <span>${t("skillRoll.groupLabel")}</span>
          <select data-skill-roll-group>
            ${groups.map((group) => renderOption(group.category, group.category, selectedGroup.category)).join("")}
          </select>
        </label>
        <button class="primary-button" type="button" data-skill-roll>${t("skillRoll.rollButton")}</button>
      </div>
      <div class="skill-roll-result">
        <span class="skill-roll-die">1d${skills.length}${state.skillTableRoller.roll ? `: ${state.skillTableRoller.roll}` : ""}</span>
        ${resultMarkup}
      </div>
    </section>
  `;
}

function renderReferenceTableMobile(page) {
  const table = parseFirstMarkdownTable(page.body);
  if (!table?.rows.length) return "";

  return `
    <section class="reference-table-mobile" aria-label="${escapeHtml(page.title)} mobile table">
      ${table.rows.map((row) => {
        const roll = row[0] ?? "";
        if (table.headers.length >= 3) {
          return `
            <article class="reference-table-card">
              <header>
                <strong>${escapeHtml(roll)}</strong>
              </header>
              <h2>${inlineSimpleMarkdown(row[1] ?? "")}</h2>
              <p>${inlineSimpleMarkdown(row[2] ?? "")}</p>
            </article>
          `;
        }

        return `
          <article class="reference-table-card">
            <header>
              <strong>${escapeHtml(roll)}</strong>
            </header>
            <p>${inlineSimpleMarkdown(row[1] ?? "")}</p>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function renderSkillTableMobile() {
  const groups = state.data.skillGroups ?? [];
  if (!groups.length) return "";

  return `
    <section class="skill-table-mobile" aria-label="Skill table grouped by category">
      ${groups.map((group) => `
        <article class="skill-table-group">
          <h2>${escapeHtml(group.category)}</h2>
          <ol class="skill-table-list">
            ${(group.skills ?? []).map((skill, index) => {
              const skillPage = pageForSkillTableEntry(skill);
              return `
                <li>
                  <span class="skill-table-number">${index + 1}</span>
                  <a href="${skillPage ? pageUrl(skillPage) : "#/skill-table"}">${escapeHtml(skill)}</a>
                </li>
              `;
            }).join("")}
          </ol>
        </article>
      `).join("")}
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
    const costs = uniqueSorted(roster.map(rowCost).filter(Boolean));
    return `
      <aside class="side-panel">
        <h3>${t("sidebar.teamHeading")}</h3>
        <dl class="stat-list">
          <dt>${t("sidebar.positions")}</dt><dd>${roster.length}</dd>
          <dt>${t("filters.playerCost")}</dt><dd>${escapeHtml(costs.join(" - ") || "-")}</dd>
          <dt>${t("sidebar.rerolls")}</dt><dd>${escapeHtml(page.team?.meta?.rerolls ?? "-")}</dd>
          <dt>${t("sidebar.apothecary")}</dt><dd>${escapeHtml(cleanApothecary(page.team?.meta?.apothecary))}</dd>
          <dt>${t("roster.tier")}</dt><dd>${escapeHtml(page.team?.meta?.league ?? "-")}</dd>
          <dt>${t("roster.leagueAccess")}</dt><dd>${renderRuleLinks(teamLeagueOptions(page))}</dd>
          <dt>${t("roster.specialRules")}</dt><dd>${renderRuleLinks(teamSpecialRuleTokens(page))}</dd>
        </dl>
      </aside>
    `;
  }
  if (page.kind === "starPlayer") {
    return `
      <aside class="side-panel">
        <h3>${t("sidebar.starPlayerHeading")}</h3>
        <dl class="stat-list">
          <dt>${t("sidebar.cost")}</dt><dd>${escapeHtml(page.starPlayer?.cost ?? "-")}</dd>
          <dt>${t("sidebar.availability")}</dt><dd>${escapeHtml(page.starPlayer?.availability ?? "-")}</dd>
          <dt>${t("roster.tags")}</dt><dd>${badgeList(page.tags, 8)}</dd>
        </dl>
      </aside>
    `;
  }
  return `
    <aside class="side-panel">
      <h3>${t("sidebar.pageHeading")}</h3>
      <dl class="stat-list">
        <dt>${t("sidebar.category")}</dt><dd>${escapeHtml(page.sectionLabel)}</dd>
        ${page.tags?.length ? `<dt>${t("roster.tags")}</dt><dd>${badgeList(page.tags, 8)}</dd>` : ""}
      </dl>
    </aside>
  `;
}

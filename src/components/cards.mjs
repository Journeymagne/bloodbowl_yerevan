/**
 * Catalogue cards: the plain list card plus the richer team/star-player
 * cards used by screens/section.mjs.
 *
 * Mechanically moved out of src/app.js.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { starPlayerTableData } from "../core/markdown.mjs";
import { pageUrl } from "../core/routes.mjs";
import { rowsForTeam } from "../domain/roster/values.mjs";
import { teamLeagueOptions, teamSpecialRuleTokens } from "../domain/roster/team-rules.mjs";
import { renderRuleLinks, renderRosterLinks } from "./content-links.mjs";

export const quickPreviews = new Map([
  ["1. League Basics", "League format, event tone, dice/model expectations and core conduct for Gata league games."],
  ["2. Team Creation", "Starting roster rules, team budget, model requirements and how new teams enter the league."],
  ["3. Team Management", "Team transfers, treasury, player contracts, injuries and post-game roster management."],
  ["4. Match Procedures", "Season structure, weekly games, match organization and league-point handling."],
  ["5. Patch Notes", "Current Gata League 2 changes to teams, skills, traits and special rulings."],
  ["All Gata Changes", "Full list of Gata gameplay, team, skill, Favoured Of, and Coach's Safe changes."],
  ["Skill Table", "Skill categories, row numbers, and the random skill roller."],
  ["Kick-off Table", "2D6 kick-off events used in Gata league games."],
  ["Player Advancement", "SPP costs, value increases, elite combinations, and characteristic rolls."],
  ["Special Rules", "Team special rules that change gameplay, advancement, TV, or inducement access."],
  ["Prayers to Nuffle", "D16 prayer table with temporary match effects."],
  ["Weather", "Spring and Summer weather tables with 2D6 and D6 results."],
  ["Casualties", "D16 casualty table with injury outcomes."],
  ["Leagues", "League access cards with eligible teams and available star players."],
  ["Reference Sources", "External references for base Blood Bowl 2025 wording and the site's legal/source notes."],
]);

function shortText(value = "", length = 180) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}...` : clean;
}

export function badgeList(items, limit = 4) {
  const visible = (items ?? []).slice(0, limit);
  const extra = (items ?? []).length - visible.length;
  return [
    ...visible.map((item) => `<span class="badge">${escapeHtml(item)}</span>`),
    extra > 0 ? `<span class="badge">+${extra}</span>` : "",
  ].join("");
}

export function renderListCard(page, route) {
  if (route === "teams") {
    return renderTeamCatalogCard(page);
  }
  if (route === "star-players") {
    return renderStarPlayerCatalogCard(page);
  }
  if (route === "skills" || route === "traits") {
    return `
      <a class="card compact" href="${pageUrl(page)}">
        <h3>${escapeHtml(page.title)}</h3>
        <div class="meta-line">${badgeList(page.tags, 4)}</div>
      </a>
    `;
  }
  const preview = quickPreviews.get(page.title) ?? shortText(page.text.replace(/Full base wording:.*/i, "").trim(), 155);
  return `
    <a class="card" href="${pageUrl(page)}">
      <h3>${escapeHtml(page.title)}</h3>
      <p>${escapeHtml(preview)}</p>
      <div class="meta-line">${badgeList(page.tags, 3)}</div>
    </a>
  `;
}

function renderCatalogField(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function renderLimitedRuleLinks(items = [], limit = 3) {
  const visible = items.slice(0, limit);
  const extra = items.length - visible.length;
  if (!visible.length) return `<span class="muted-text">-</span>`;
  return `${renderRuleLinks(visible)}${extra > 0 ? `<span class="roster-pill roster-pill-muted">+${extra}</span>` : ""}`;
}

function renderLimitedRosterLinks(items = [], limit = 5) {
  const visible = items.slice(0, limit);
  const extra = items.length - visible.length;
  if (!visible.length) return `<span class="muted-text">-</span>`;
  return `${renderRosterLinks(visible)}${extra > 0 ? `<span class="roster-pill roster-pill-muted">+${extra}</span>` : ""}`;
}

function renderTeamCatalogCard(page) {
  const rows = rowsForTeam(page);
  const leagueOptions = teamLeagueOptions(page);
  const specialRules = teamSpecialRuleTokens(page);
  const positionPreview = rows.slice(0, 3).map((row) => row.position).filter(Boolean);
  const extraPositions = rows.length - positionPreview.length;
  return `
    <article class="card catalog-card team-catalog-card">
      <header class="catalog-card-head">
        <div>
          <span class="catalog-kicker">${escapeHtml(page.team?.type ?? page.tags?.[0] ?? t("sidebar.teamHeading"))}</span>
          <h3><a class="catalog-card-title" href="${pageUrl(page)}">${escapeHtml(page.title)}</a></h3>
        </div>
      </header>
      <dl class="catalog-card-stats">
        ${renderCatalogField(t("catalog.tier"), escapeHtml(page.team?.meta?.league ?? "-"))}
        ${renderCatalogField(t("catalog.positions"), escapeHtml(String(rows.length)))}
        ${renderCatalogField(t("catalog.rerolls"), escapeHtml(page.team?.meta?.rerolls ?? "-"))}
      </dl>
      <section class="catalog-card-section">
        <span>${t("catalog.players")}</span>
        <p>${escapeHtml(positionPreview.join(", ") || t("catalog.noRosterRows"))}${extraPositions > 0 ? ` +${extraPositions}` : ""}</p>
      </section>
      <section class="catalog-card-section">
        <span>${t("catalog.leagueAccess")}</span>
        <div class="catalog-pill-row">${renderLimitedRuleLinks(leagueOptions, 2)}</div>
      </section>
      <section class="catalog-card-section">
        <span>${t("catalog.specialRules")}</span>
        <div class="catalog-pill-row">${renderLimitedRuleLinks(specialRules, 3)}</div>
      </section>
      <footer class="catalog-card-actions">
        <a class="primary-button compact-action" href="${pageUrl(page)}">${t("catalog.open")}</a>
      </footer>
    </article>
  `;
}

function renderStarCatalogStats(star) {
  return `
    <dl class="catalog-stat-strip">
      <div><dt>MA</dt><dd>${escapeHtml(star.ma || "-")}</dd></div>
      <div><dt>ST</dt><dd>${escapeHtml(star.st || "-")}</dd></div>
      <div><dt>AG</dt><dd>${escapeHtml(star.ag || "-")}</dd></div>
      <div><dt>PA</dt><dd>${escapeHtml(star.pa || "-")}</dd></div>
      <div><dt>AR</dt><dd>${escapeHtml(star.ar || "-")}</dd></div>
    </dl>
  `;
}

function renderStarPlayerCatalogCard(page) {
  const star = starPlayerTableData(page);
  const cost = page.starPlayer?.cost ?? star.cost ?? "-";
  const availability = page.starPlayer?.availability ?? "-";
  const keywords = star.keywords.length ? star.keywords : (page.tags ?? []).filter((tag) => tag !== "Star Player");
  return `
    <article class="card catalog-card star-catalog-card">
      <header class="catalog-card-head">
        <div>
          <span class="catalog-kicker">Star Player</span>
          <h3><a class="catalog-card-title" href="${pageUrl(page)}">${escapeHtml(page.title)}</a></h3>
        </div>
        <span class="catalog-price">${escapeHtml(cost)}</span>
      </header>
      ${renderStarCatalogStats(star)}
      <section class="catalog-card-section">
        <span>${t("sidebar.availability")}</span>
        <p>${escapeHtml(availability || "-")}</p>
      </section>
      <section class="catalog-card-section">
        <span>${t("roster.skillsLabel")}</span>
        <div class="catalog-pill-row">${renderLimitedRosterLinks(star.skills, 5)}</div>
      </section>
      <section class="catalog-card-section">
        <span>${t("catalog.keywords")}</span>
        <div class="catalog-pill-row">${badgeList(keywords, 4)}</div>
      </section>
      <footer class="catalog-card-actions">
        <a class="primary-button compact-action" href="${pageUrl(page)}">${t("catalog.open")}</a>
      </footer>
    </article>
  `;
}

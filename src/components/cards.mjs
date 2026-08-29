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

/**
 * The hand-written summary for a reference page, if it has one.
 *
 * These fifteen sentences used to be an English Map keyed by English page
 * title, which meant a Russian coach read the catalogue in English (step
 * 13.1). They are dictionary entries now, keyed by page identifier — the one
 * thing that is the same in both vaults.
 *
 * A page without one falls back to the opening of its own text, which is
 * already in the reader's language.
 */
function pagePreview(page) {
  const key = `preview.${page.id}`;
  const written = t(key);
  if (written !== key) return written;
  return shortText(page.text.replace(/Full base wording:.*/i, "").trim(), 155);
}

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
  const preview = pagePreview(page);
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

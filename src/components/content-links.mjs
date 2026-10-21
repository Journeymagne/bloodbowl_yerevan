/**
 * Turning a rule/skill/page name — or a coach's saved team — into a link,
 * when there is somewhere for it to point.
 *
 * Mechanically moved out of src/app.js. Reference screens use the rule/page
 * links for cross-links between pages; screens/season/*.mjs and the 2.x
 * admin screens use the same functions to link a player's skills and a
 * team's special rules back to their pages, and `renderPublicTeamLink`/
 * `renderPlayerLink` to link to a coach's profile or saved team — which is
 * why this is a shared module rather than living under screens/.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { pageUrl, playerTeamUrl, playerUrl } from "../core/routes.mjs";
import { canonicalLeagueName, canonicalSpecialRuleName } from "../domain/roster/team-rules.mjs";
import { pageForName } from "../screens/ref/catalog.mjs";

// A name finds its page by the reference's one rule (`pageForName`, screens/ref/catalog.mjs); a league and a special rule are sections of their own pages.
function pageForSkillTableEntry(title) {
  return pageForName(state.data, title);
}

/** @param {Set<string>} [favoured] names to mark as favoured-skill pills */
export function renderRosterLinks(items = [], favoured = new Set()) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => {
    const page = pageForSkillTableEntry(item);
    const className = favoured.has(item) ? "roster-pill favoured-skill-pill" : "roster-pill";
    return page
      ? `<a class="${className}" href="${pageUrl(page)}">${escapeHtml(item)}</a>`
      : `<span class="${className}">${escapeHtml(item)}</span>`;
  }).join("");
}

function pageForRuleEntry(title) {
  if (canonicalLeagueName(title)) {
    return state.data.pages.find((page) => page.title === "Leagues") ?? null;
  }
  if (canonicalSpecialRuleName(title)) {
    return state.data.pages.find((page) => page.title === "Special Rules") ?? null;
  }
  return pageForName(state.data, title);
}

export function renderCaptainBadge(className = "roster-pill roster-pill-muted") {
  const page = pageForRuleEntry("Team Captain");
  const label = escapeHtml(t("roster.captain"));
  return page
    ? `<a class="${className}" href="${pageUrl(page)}">${label}</a>`
    : `<span class="${className}">${label}</span>`;
}

export function renderRuleLinks(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => {
    const page = pageForRuleEntry(item);
    return page
      ? `<a class="roster-pill" href="${pageUrl(page)}">${escapeHtml(item)}</a>`
      : `<span class="roster-pill roster-pill-muted">${escapeHtml(item)}</span>`;
  }).join("");
}

export function renderPublicTeamLink(user, team) {
  if (!user?.id || !team?.id) return `<span class="muted-text">${escapeHtml(team?.name || "-")}</span>`;
  return `<a class="inline-rule-link" href="${playerTeamUrl(user, team)}">${escapeHtml(team.name || t("sidebar.teamHeading"))}</a>`;
}

export function renderPlayerLink(user) {
  if (!user?.id) return `<span class="muted-text">-</span>`;
  return `<a class="inline-rule-link" href="${playerUrl(user)}">${escapeHtml(user.login || t("admin.playerHeader"))}</a>`;
}

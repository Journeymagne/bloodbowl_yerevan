/**
 * Turning a rule/skill/page name into a link, when there is a page for it.
 *
 * Mechanically moved out of src/app.js. Reference screens use these for
 * cross-links between pages; the roster editor (still in app.js) uses the
 * same functions to link a player's skills and a team's special rules back
 * to their pages, which is why this is a shared module rather than living
 * under screens/.
 */
import { escapeHtml } from "../core/dom.mjs";
import { state } from "../core/state.mjs";
import { pageUrl } from "../core/routes.mjs";
import { canonicalLeagueName, canonicalSpecialRuleName, ruleLookupKey } from "../domain/roster/team-rules.mjs";

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

export function pageForSkillTableEntry(title) {
  return state.data.skills.find((page) => page.title === title)
    ?? state.data.traits.find((page) => page.title === title)
    ?? state.data.pages.find((page) => page.title === title)
    ?? null;
}

export function renderRosterLinks(items = []) {
  if (!items.length) return `<span class="muted-text">-</span>`;
  return items.map((item) => {
    const page = pageForSkillTableEntry(item);
    return page
      ? `<a class="roster-pill" href="${pageUrl(page)}">${escapeHtml(item)}</a>`
      : `<span class="roster-pill">${escapeHtml(item)}</span>`;
  }).join("");
}

export function pageForRuleEntry(title) {
  if (canonicalLeagueName(title)) {
    return state.data.pages.find((page) => page.title === "Leagues") ?? null;
  }
  if (canonicalSpecialRuleName(title)) {
    return state.data.pages.find((page) => page.title === "Special Rules") ?? null;
  }
  const key = ruleLookupKey(title);
  return [...state.data.pages, ...state.data.skills, ...state.data.traits].find((page) => ruleLookupKey(page.title) === key)
    ?? null;
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

/**
 * The "Leagues" reference page: which teams and star players each league
 * card grants access to. Special-cased inside screens/detail.mjs because it
 * replaces a content page's normal body instead of rendering it.
 *
 * Mechanically moved out of src/app.js.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { pageUrl } from "../core/routes.mjs";
import { leagueAccessNames } from "../domain/league-rules.mjs";
import { canonicalLeagueName, splitRuleAccessParts, teamLeagueOptions } from "../domain/roster/team-rules.mjs";

export function isLeaguesPage(page) {
  return page.title === "Leagues";
}

function teamsForLeagueAccess(leagueName) {
  const canonicalLeague = canonicalLeagueName(leagueName);
  return state.data.teams
    .filter((team) => teamLeagueOptions(team).some((option) => canonicalLeagueName(option) === canonicalLeague))
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

function starPlayerAvailableForLeague(starPlayer, leagueName) {
  const availability = starPlayer.starPlayer?.availability ?? "";
  const tags = starPlayer.tags ?? [];
  const combined = [availability, ...tags].join(", ");
  const canonicalLeague = canonicalLeagueName(leagueName);
  if (/any\s+team/i.test(combined)) {
    const exclusions = [...combined.matchAll(/except\s+([^,;]+)/gi)]
      .flatMap((match) => splitRuleAccessParts(match[1]));
    if (exclusions.some((option) => canonicalLeagueName(option) === canonicalLeague)) {
      return false;
    }
    return true;
  }

  const options = splitRuleAccessParts(combined);
  return options.some((option) => canonicalLeagueName(option) === canonicalLeague);
}

function starPlayersForLeagueAccess(leagueName) {
  return state.data.starPlayers
    .filter((starPlayer) => starPlayerAvailableForLeague(starPlayer, leagueName))
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

function renderPagePills(items, emptyLabel = "-") {
  if (!items.length) return `<span class="muted-text">${escapeHtml(emptyLabel)}</span>`;
  return items.map((item) => `<a class="roster-pill" href="${pageUrl(item)}">${escapeHtml(item.title)}</a>`).join("");
}

export function renderLeaguesReferencePage() {
  return `
    <div class="league-reference-grid">
      ${leagueAccessNames.map((league) => {
        const teams = teamsForLeagueAccess(league);
        const starPlayers = starPlayersForLeagueAccess(league);
        return `
          <article class="league-reference-card">
            <header>
              <h2>${escapeHtml(league)}</h2>
              <span>${teams.length} ${t("leagueRef.teamsSuffix")} · ${starPlayers.length} ${t("leagueRef.starPlayersSuffix")}</span>
            </header>
            <section class="league-reference-section">
              <h3>${t("common.teams")}</h3>
              <div class="rule-link-list league-link-list">
                ${renderPagePills(teams, t("leagueRef.noTeams"))}
              </div>
            </section>
            <section class="league-reference-section">
              <h3>${t("nav.starPlayers")}</h3>
              <div class="rule-link-list league-link-list league-star-list">
                ${renderPagePills(starPlayers, t("leagueRef.noStarPlayers"))}
              </div>
            </section>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

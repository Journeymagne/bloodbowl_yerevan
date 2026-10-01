/** A compact read-only season snapshot. Never infer results or season state. */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { renderPublicTeamLink } from "./content-links.mjs";

export function renderHomeSeason({ data, error }) {
  if (error) return `<div class="home-season-message"><h2>${t("home.seasonUnavailable")}</h2>
    <p>${t("home.seasonUnavailableNote")}</p><button class="filter-button" type="button" data-home-retry>${t("home.retry")}</button></div>`;
  if (!data?.season) return `<div class="home-season-message"><h2>${t("home.noSeason")}</h2><p>${t("home.noSeasonNote")}</p></div>`;
  const standings = data.standings ?? [];
  return `<h2 class="season-name">${escapeHtml(data.season.name ?? t("nav.season"))}</h2>
    ${standings.length ? `<table class="home-standings"><caption class="sr-only">${t("season.tab.standings")}</caption>
      <thead><tr><th scope="col">#</th><th scope="col">${t("sidebar.teamHeading")}</th><th scope="col">${t("season.leaguePointsLabel")}</th></tr></thead>
      <tbody>${standings.slice(0, 5).map(row => `<tr><td>${escapeHtml(row.rank)}</td>
        <td>${renderPublicTeamLink(row.user, row.team)}</td><td>${escapeHtml(row.points)}</td></tr>`).join("")}</tbody></table>
      <a class="text-link" href="#/season/standings">${t("home.fullStandings")}</a>`
    : `<p class="muted-text">${t("season.noTeamsCommittedYet")}</p>`}`;
}

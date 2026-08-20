/**
 * The season's standings tab: the league table.
 *
 * Mechanically moved out of src/app.js.
 */
import { t } from "../../core/i18n.mjs";
import { renderPlayerLink, renderPublicTeamLink } from "../../components/content-links.mjs";

export function renderSeasonStandings(data) {
  const standings = data.standings ?? [];
  return `
    <section class="content-panel season-card">
      <h2>${t("season.tab.standings")}</h2>
      <p class="muted-text">${t("season.scoringNote")}</p>
      ${standings.length ? `
        <div class="table-scroll">
          <table class="compact-roster-table season-table">
            <thead>
              <tr>
                <th>#</th>
                <th>${t("admin.coachHeading")}</th>
                <th>${t("sidebar.teamHeading")}</th>
                <th>${t("season.gamesHeader")}</th>
                <th>${t("season.leaguePointsLabel")}</th>
                <th>${t("season.touchdownsLabel")}</th>
                <th>${t("season.casualtiesLabel")}</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((standing) => `
                <tr>
                  <td>${standing.rank}</td>
                  <td>${renderPlayerLink(standing.user)}</td>
                  <td><strong>${renderPublicTeamLink(standing.user, standing.team)}</strong></td>
                  <td>${standing.games}</td>
                  <td>${standing.points}</td>
                  <td>${standing.touchdowns ?? 0}</td>
                  <td>${standing.casualties ?? 0}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p>${t("season.noTeamsCommittedYet")}</p>`}
    </section>
  `;
}

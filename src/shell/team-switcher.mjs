/**
 * The team switcher: the coach's teams in a sheet from the bottom of a phone,
 * and in a panel by the SideNav on a desk (an `anchored` sheet, ui/sheet.mjs).
 * It replaces the link the header and the SideNav had to My Teams (plan stage
 * 06, decision 8).
 *
 * Each team is a row with its tile of initials, its name and a line that says
 * where it stands: its race with its place in the table and its record, or the
 * matches it has played, or the race alone. The row of the active team is
 * ticked. Under the list stand the way to a new team, a sheet the shell is
 * handed (app.js), and the way to all of them.
 *
 * What this module draws and decides is the content: `switcherRows` reads the
 * rows from the coach's list, the table and the games, `renderTeamSwitcher`
 * draws them, `switchTarget` says where a choice leads. Opening, closing, the
 * focus around them and what «New team» opens are the shell's (shell/shell.mjs).
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { teamUrl, teamsUrl } from "../core/routes.mjs";
import { gameOutcome, seasonRecord, standingOf, teamInitials } from "../data/team-record.mjs";
import { icon } from "../ui/icons.mjs";
import { renderSheet, wireSheets } from "../ui/sheet.mjs";
import { renderStatusChip } from "../ui/status-chip.mjs";
import { renderTeamLogo, teamLogoProps } from "../ui/team-logo.mjs";

/** What the sheet is shown by (`#team-switcher`), and what wireSheets reports. */
export const SWITCHER_ID = "team-switcher";

/** The team screens a choice keeps: the section of the other team each leads to; a player's page leads to the roster. */
const SECTIONS = { team: "", teamManage: "team", teamSettings: "settings", teamRoster: "roster", teamPlayer: "roster", teamMatches: "matches", teamChallenges: "challenges" };

/** "1-0-0": wins, draws, losses. */
const recordText = ({ wins, draws, losses }) => `${wins}-${draws}-${losses}`;

/**
 * What a team's line says, as parts: its race, then its place in the table with
 * the record of the season when it has a row there, else the matches it has
 * played (a friendly counts) when it has any.
 */
function lineParts(team, race, seasonData, games) {
  const standing = standingOf(seasonData, team.id);
  if (standing) {
    const record = seasonRecord(games, team.id, seasonData.season?.id ?? null);
    return [race, t("teams.line.place", { place: standing.rank, record: recordText(record) })];
  }
  const played = games.filter((game) => gameOutcome(game, team.id)).length;
  return [race, played ? t("teams.line.played", { count: played }) : ""];
}

/**
 * The rows of the switcher, one for each of the coach's teams in the order of
 * their list.
 *
 * @param {object} input
 * @param {object[]} input.teams the coach's teams as `/api/teams` sends them
 * @param {string|null} input.activeTeamId
 * @param {(slug: string) => string} input.raceTitleOf the race's name by the team's base team; "" when the data is not there
 * @param {object|null} input.seasonData the answer of `/api/season`
 * @param {object[]} input.games the answer of `/api/games`
 * @returns {{id: string, name: string, initials: string, line: string, current: boolean, draft: boolean, inSeason: boolean}[]}
 */
export function switcherRows({ teams, activeTeamId, raceTitleOf, seasonData, games }) {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    initials: teamInitials(team.name),
    ...teamLogoProps(team),
    line: lineParts(team, raceTitleOf(team.baseTeamSlug), seasonData, games).filter(Boolean).join(" · "),
    current: team.id === activeTeamId,
    draft: team.stage === "draft",
    inSeason: team.inActiveSeason === true,
  }));
}

/**
 * A team as a row shows it: the tile of its initials, its name and its line,
 * and a chip while it is still in the pre-season build. Phrasing content only,
 * so a button can hold it.
 *
 * @param {ReturnType<typeof switcherRows>[number]} row
 */
export function renderTeamFace(row) {
  const line = row.line ? `<span class="g-teamface__line">${escapeHtml(row.line)}</span>` : "";
  const draft = row.draft ? renderStatusChip({ label: t("teams.stage.draft") }) : "";
  const fallbackHtml = `<span class="g-teamface__tile" aria-hidden="true">${escapeHtml(row.initials)}</span>`;
  return `<span class="g-teamface">${renderTeamLogo(row, { fallbackHtml })}`
    + `<span class="g-teamface__text"><span class="g-teamface__name">${escapeHtml(row.name)}</span>${line}${draft}</span></span>`;
}

function renderRow(row) {
  const mark = row.current ? `${icon("check", 20)}<span class="g-sr-only">${escapeHtml(t("teams.current"))}</span>` : "";
  return `<button type="button" class="g-switcher__row" data-switch-team="${escapeHtml(row.id)}"${row.current ? ' aria-current="true"' : ""}>${renderTeamFace(row)}${mark}</button>`;
}

/**
 * The sheet: every team, then a new one, then all of them. Closed until the
 * shell shows it (patchWithModal).
 *
 * @param {ReturnType<typeof switcherRows>} rows
 */
export function renderTeamSwitcher(rows) {
  const title = escapeHtml(t("teams.title"));
  // A coach with no team has no rows: a group with nothing in it would be announced for nothing.
  const list = rows.length ? `<div class="g-switcher" role="group" aria-label="${title}">${rows.map(renderRow).join("")}</div>` : "";
  // «New team» opens a sheet over this screen, so it is a button that says so, not a link to an address.
  const bodyHtml = `${list}<button type="button" class="g-switcher__new" data-switcher-new aria-haspopup="dialog"><span class="g-switcher__plus">${icon("plus")}</span>${escapeHtml(t("teams.new"))}</button>`
    + `<a class="g-switcher__all" href="${escapeHtml(teamsUrl())}">${escapeHtml(t("teams.all"))}</a>`;
  return renderSheet({ id: SWITCHER_ID, title: t("teams.title"), anchored: true, bodyHtml });
}

/**
 * Where choosing `teamId` leads from `route`: the same section of that team
 * when the page is one of a team's (a player's page leads to the roster, there
 * being no such player in the other team); null elsewhere, where the page
 * stays and the team only becomes the active one.
 *
 * @param {{name: string}|null} route what the router matched
 * @param {string} teamId
 * @returns {string|null} a hash
 */
export function switchTarget(route, teamId) {
  return Object.hasOwn(SECTIONS, route?.name) ? teamUrl(teamId, SECTIONS[route.name]) : null;
}

/**
 * Listen to the sheet in `host`: a team chosen is reported to `onSwitch`; a link
 * followed, the cross, the backdrop and Escape are reported to `onClose`; «New
 * team» is reported to `onNewTeam` alone, the shell closing the switcher and
 * opening what it is handed. The host outlives the sheet, so this is wired once.
 *
 * @param {Element} host
 * @param {{onSwitch: (teamId: string) => void, onClose: () => void, onNewTeam?: () => void}} handlers
 * @returns {() => void} removes the listeners
 */
export function wireTeamSwitcher(host, { onSwitch, onClose, onNewTeam = () => {} }) {
  const offs = [
    delegate(host, "click", "[data-switch-team]", (event, row) => onSwitch(row.getAttribute("data-switch-team"))),
    delegate(host, "click", "[data-switcher-new]", () => onNewTeam()),
    delegate(host, "click", "a", () => onClose()),
    wireSheets(host, { onClose: () => onClose() }),
  ];
  return () => offs.forEach((off) => off());
}

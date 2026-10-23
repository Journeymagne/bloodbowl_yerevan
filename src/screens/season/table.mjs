/**
 * The league's table, one markup for the two widths, and the overview's few rows of it.
 *
 * Which columns at which width (decisions 1–8 of the stage 10 plan; League.html, DeskSeason.html):
 * - up to 900px eight: the place, the team, games, wins, draws, losses, the touchdown difference, the points;
 * - from 901px eleven: those, and the touchdowns scored–conceded, the casualty difference and the form of the
 *   last five matches, between the losses and the points.
 * Where each number comes from is `src/data/season-table.mjs`'s: the place, the points and the games are the
 * server's, the rest the league pairings'. The rows stand in the server's order; nothing here sorts them.
 *
 * A row is a grid with one link stretched over it (`::after`), not a `<tr>`, which has no reliable box to
 * stretch a link over: an ARIA table, each column named by its letter for the eye and by its word for a
 * screen reader. A coach's own row is tinted and leads to the team's overview, another's to the opponent's
 * page; a guest's rows lead nowhere (the pages of a coach are closed to a guest), nor does a withdrawn entry,
 * which keeps its place and says so. On the league's page every team of the coach's is his own row (decision 6); on a
 * team's own screens (its desk season, its overview's few rows) that team's alone is, as DeskSeason.html and
 * DeskOverview.html mark one row. A race leads to its rules in the reference on a desk, over the row's
 * link; on a phone it is text, as a 44px target under the name would lie over the name (pre-flight L5, as
 * 09a's results). A race the reference has no page for has no name to show and is left out.
 *
 * The note under the table is the league's own rules, read from `seasonPoints` and in the order of
 * `standingsOrder`, not the prototype's words — a technical win's points among them (stage 12).
 *
 * The playoff zone (stage 12, decision 6; League.html, DeskSeason.html, DeskOverview.html) is the season's setting the
 * admin sets: none until it is set. The first N entries still in the season have their place in the league's green, the
 * Nth a line under it when a row follows (a line under the last row tells nothing), and the note names the zone first,
 * by its dot. A withdrawn entry keeps its place in the table and is no place of the zone. The overview's few rows are
 * zoned by each team's place in the whole table (`zonePlace`), not by the row of the window (pre-flight L16).
 */
import { renderTeamLogo } from "../../ui/team-logo.mjs";
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, playerTeamUrl, teamUrl } from "../../core/routes.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { seasonPoints } from "../../domain/league-rules.mjs";
import { renderFormStrip } from "../../ui/form-strip.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref, classNames, dataAttributes } from "../../ui/markup.mjs";

/** The columns of each width's table, in the prototypes' order; each key names its `league.col.*` and `league.colName.*`. */
export const TABLE_COLUMNS = Object.freeze({
  phone: Object.freeze(["rank", "team", "games", "wins", "draws", "losses", "tdDiff", "points"]),
  desk: Object.freeze(["rank", "team", "games", "wins", "draws", "losses", "td", "tdDiff", "casDiff", "form", "points"]),
});

/**
 * Where a row leads: a coach's own team to its overview, another's to the opponent's page; nowhere for a
 * guest, and nowhere for a withdrawn entry.
 *
 * @param {{user: {id: string}, team: {id: string}, withdrawn?: boolean}} row a table row, or a side of a round's pairing
 * @param {{viewerId?: string, signedIn?: boolean}} viewer
 * @returns {string}
 */
export function rowHref(row, { viewerId = "", signedIn = false } = {}) {
  if (!signedIn || row.withdrawn || !row.team?.id || !row.user?.id) return "";
  return row.user.id === viewerId ? teamUrl(row.team.id) : playerTeamUrl(row.user.id, row.team.id);
}

/** A difference with its sign: «+3», «−2» (the minus sign), «0»; and the way it is coloured. */
function signed(value) {
  if (value > 0) return { text: `+${value}`, tone: "up" };
  if (value < 0) return { text: `−${Math.abs(value)}`, tone: "down" };
  return { text: "0", tone: "even" };
}

/** Where a column's head stands: the place and the team at the left, the points at the right, the rest centred. */
const COLUMN_SIDE = { rank: "start", team: "start", points: "end" };

function headerMarkup(columns) {
  const cells = columns.map((key) => `<span class="${classNames("g-table__col", COLUMN_SIDE[key] && `g-table__col--${COLUMN_SIDE[key]}`)}" role="columnheader"${dataAttributes({ column: key })}>`
    + `<span aria-hidden="true">${escapeHtml(t(`league.col.${key}`))}</span><span class="g-sr-only">${escapeHtml(t(`league.colName.${key}`))}</span></span>`);
  return `<div role="rowgroup"><div class="g-table__head" role="row">${cells.join("")}</div></div>`;
}

/** The race under the name: a link to its rules on a desk, text on a phone and in a row that leads nowhere; none for a race the reference does not know. */
function raceMarkup(row, phone) {
  const race = raceTeamOf(row.team.baseTeamSlug);
  if (!race) return "";
  if (phone || row.withdrawn) return `<span class="g-table__racetext">${escapeHtml(race.title)}</span>`;
  const href = pageUrl(race);
  assertLinkHref(href);
  return `<a class="g-table__race" href="${escapeHtml(href)}" title="${escapeHtml(t("league.raceTitle"))}">${icon("book", 12)}<span>${escapeHtml(race.title)}</span></a>`;
}

/** The team's cell: the name (the row's link when it leads somewhere), the race, and the word for a withdrawn entry. */
function teamMarkup(row, phone, viewer) {
  const href = rowHref(row, viewer);
  if (href) assertLinkHref(href);
  const name = href
    ? `<a class="g-table__link" href="${escapeHtml(href)}" aria-label="${escapeHtml(t("league.teamLink", { team: row.team.name }))}">${escapeHtml(row.team.name)}</a>`
    : `<span class="g-table__name">${escapeHtml(row.team.name)}</span>`;
  const withdrawn = row.withdrawn ? `<span class="g-table__withdrawn">${escapeHtml(t("league.withdrawn"))}</span>` : "";
  const identity = `${name}${raceMarkup(row, phone)}${withdrawn}`;
  const logo = renderTeamLogo(row.team, { size: "sm" });
  return logo ? `<span class="g-table__face">${logo}<span class="g-table__identity">${identity}</span></span>` : identity;
}

/** What one column of a row holds, as markup, and the classes of its cell beyond `g-table__cell`. */
function cellOf(key, row, phone, viewer) {
  const number = (value, extra = "") => ({ html: escapeHtml(value), extra: classNames("g-table__num", extra) });
  const difference = (value, extra = "") => {
    const { text, tone } = signed(value);
    return { html: escapeHtml(text), extra: classNames("g-table__diff", `g-table__diff--${tone}`, extra) };
  };
  switch (key) {
    case "rank": return { html: escapeHtml(row.rank), extra: "g-table__rank" };
    case "team": return { html: teamMarkup(row, phone, viewer), extra: "g-table__team" };
    case "games": return number(row.games, "g-table__num--muted");
    case "td": return number(`${row.touchdowns}–${row.conceded}`, "g-table__num--muted g-table__num--pair");
    case "tdDiff": return difference(row.touchdowns - row.conceded, phone ? "" : "g-table__diff--strong");
    case "casDiff": return difference(row.casualties - row.suffered);
    case "form": return { html: renderFormStrip({ results: row.form }), extra: "g-table__form" };
    case "points": return { html: escapeHtml(row.points), extra: "g-table__points" };
    default: return number(row[key]);
  }
}

/** The coach's own row: his team on that team's screens (`teamId`), else any of his. */
const ownRow = (row, { viewerId, teamId }) => Boolean(viewerId) && row.user.id === viewerId && (!teamId || row.team.id === teamId);

/**
 * Where each row stands in the playoff zone of `playoffPlaces`: in it when its place among the entries still in the
 * season (`zonePlace`) is N or better; the Nth ends it — the line under it — when another row follows it here.
 *
 * @param {import("../../data/season-table.mjs").TableRow[]} rows the table, or the overview's few rows of it
 * @param {number|null} playoffPlaces the season's (`playoffPlacesOf`); null — no zone
 * @returns {{zone: boolean, end: boolean}[]} one for each row, in their order
 */
function zoneRank(rows, playoffPlaces) {
  return rows.map((row, at) => {
    const zone = Boolean(playoffPlaces) && row.zonePlace != null && row.zonePlace <= playoffPlaces;
    return { zone, end: zone && row.zonePlace === playoffPlaces && at < rows.length - 1 };
  });
}

function rowMarkup(row, phone, viewer, place) {
  const mine = !row.withdrawn && viewer.signedIn && ownRow(row, viewer);
  const className = classNames("g-table__row", mine && "g-table__row--mine", row.withdrawn && "g-table__row--withdrawn",
    place.zone && "g-table__row--zone", place.end && "g-table__row--zoneend");
  const cells = TABLE_COLUMNS[phone ? "phone" : "desk"].map((key) => {
    const { html, extra } = cellOf(key, row, phone, viewer);
    return `<span class="${classNames("g-table__cell", extra)}" role="cell"${dataAttributes({ column: key })}>${html}</span>`;
  });
  return `<div class="${className}" role="row">${cells.join("")}</div>`;
}

/**
 * @param {object} props
 * @param {import("../../data/season-table.mjs").TableRow[]} props.rows the table, in the server's order
 * @param {boolean} props.phone the phone's eight columns, or the desk's eleven
 * @param {string} [props.viewerId] the signed-in coach, whose rows are his own
 * @param {boolean} [props.signedIn] a guest's rows are no links
 * @param {string} [props.teamId] on a team's own screens, the team whose row alone is the coach's own
 * @param {string} props.labelledBy the id of the heading that names the table
 * @param {number|null} [props.playoffPlaces] the season's playoff places (`playoffPlacesOf`); null — no zone
 */
export function leagueTableMarkup({ rows, phone, viewerId = "", signedIn = false, teamId = "", labelledBy, playoffPlaces = null }) {
  if (!rows.length) return `<p class="g-table__empty">${escapeHtml(t("guestHome.tableEmpty"))}</p>`;
  const viewer = { viewerId, signedIn, teamId };
  const zone = zoneRank(rows, playoffPlaces);
  const body = rows.map((row, at) => rowMarkup(row, phone, viewer, zone[at])).join("");
  return `<div class="g-table" role="table" aria-labelledby="${escapeHtml(labelledBy)}">`
    + `${headerMarkup(TABLE_COLUMNS[phone ? "phone" : "desk"])}<div role="rowgroup">${body}</div></div>`;
}

/**
 * How the league scores a match, in its own numbers (`seasonPoints`), a technical win's too (content: «2 points for a
 * technical win», «+2 points if the opponent could not field a team»): a phone's note says it, a desk's card at its head.
 */
export function tablePointsText() {
  const played = t("league.points", {
    win: seasonPoints.win, draw: seasonPoints.draw, loss: seasonPoints.loss, bonus: seasonPoints.bigWinBonus,
    margin: seasonPoints.bigWinMargin, casualties: seasonPoints.casualtyThreshold,
  });
  return `${played} ${t("league.technicalPoints", { technical: seasonPoints.technicalWin, bonus: seasonPoints.noTeamBonus })}`;
}

/**
 * A desk's card of the table (DeskSeason.html; the season's row of league.css): «Table» with the league's points at its
 * right, then what `bodyHtml` holds — the table and its note —, all of it one block that scrolls sideways in the card.
 *
 * @param {{titleId: string, bodyHtml: string}} props `bodyHtml`: markup of `leagueTableMarkup` and `tableNotesMarkup`
 */
export function tableCardMarkup({ titleId, bodyHtml }) {
  return `<section class="g-season__table" aria-labelledby="${escapeHtml(titleId)}"><div class="g-season__inner"><div class="g-season__head">`
    + `<h2 class="g-season__title" id="${escapeHtml(titleId)}">${escapeHtml(t("shell.tab.table"))}</h2>`
    + `<span class="g-season__rule">${escapeHtml(tablePointsText())}</span></div>${bodyHtml}</div></section>`;
}

/** Ranks as runs: [1, 3, 4, 5] → «1, 3–5». */
function rankRuns(ranks) {
  const runs = [];
  for (const rank of ranks) {
    const last = runs.at(-1);
    if (last && rank === last[1] + 1) last[1] = rank;
    else runs.push([rank, rank]);
  }
  return runs.map(([first, end]) => (first === end ? String(first) : `${first}–${end}`)).join(", ");
}

/**
 * The zone's line, its dot before it: «Playoff zone: places 1–4»; nothing without a zone. The places named are the
 * ranks the table colours (`rows`): a team withdrawn inside the zone keeps its rank and is no place of it, so the zone
 * reaches one rank further, and the line says so («places 1, 3–5») rather than a range the rows contradict.
 */
function zoneNoteMarkup(places, rows) {
  if (!places) return "";
  const ranks = rows ? [...new Set(rows.filter((row) => row.zonePlace != null && row.zonePlace <= places).map((row) => Number(row.rank)))].sort((one, other) => one - other) : [];
  let words;
  if (!ranks.length || ranks.every((rank, at) => rank === at + 1)) words = places === 1 ? t("league.zoneOne", { rank: 1 }) : t("league.zone", { places });
  else words = ranks.length === 1 ? t("league.zoneOne", { rank: ranks[0] }) : t("league.zoneRanks", { ranks: rankRuns(ranks) });
  return `<p class="g-table__zone">${escapeHtml(words)}</p>`;
}

/**
 * The note under the table: the playoff zone first when the season has one, as the prototypes write it; then on a
 * phone the points, the order and what a tap does, on a desk the order and what a click does (its card says the
 * points at its head). A guest is told nothing about rows that lead nowhere for him.
 *
 * @param {{phone: boolean, signedIn?: boolean, playoffPlaces?: number|null, rows?: import("../../data/season-table.mjs").TableRow[]|null}} props
 *   `rows`: the table the note is under, whose coloured ranks the zone's line names
 */
export function tableNotesMarkup({ phone, signedIn = true, playoffPlaces = null, rows = null }) {
  const lines = phone
    ? [tablePointsText(), t("league.order"), signedIn ? t("league.taps") : ""]
    : [t("league.order"), t(signedIn ? "league.clicks" : "league.clicksGuest")];
  return `<div class="g-table__notes">${zoneNoteMarkup(playoffPlaces, rows)}`
    + `${lines.filter(Boolean).map((line) => `<p class="g-table__note">${escapeHtml(line)}</p>`).join("")}</div>`;
}

const MINI_COLUMNS = ["rank", "team", "tdDiff", "points"];

function miniRowMarkup(row, viewerId, teamId, place) {
  const href = rowHref(row, { viewerId, signedIn: true });
  if (href) assertLinkHref(href);
  const mine = ownRow(row, { viewerId, teamId });
  const className = classNames("g-minitable__row", mine && "g-minitable__row--mine", place.zone && "g-minitable__row--zone",
    place.end && "g-minitable__row--zoneend");
  const { text, tone } = signed(row.touchdowns - row.conceded);
  const name = href
    ? `<a class="g-minitable__link" href="${escapeHtml(href)}">${escapeHtml(row.team.name)}</a>`
    : `<span class="g-minitable__name">${escapeHtml(row.team.name)}</span>`;
  return `<div class="${className}" role="row">`
    + `<span class="g-minitable__rank" role="cell">${escapeHtml(row.rank)}</span>`
    + `<span class="g-minitable__team" role="cell">${renderTeamLogo(row.team, { size: "sm" })}${name}</span>`
    + `<span class="g-minitable__diff g-minitable__diff--${tone}" role="cell">${escapeHtml(text)}</span>`
    + `<span class="g-minitable__points" role="cell">${escapeHtml(row.points)}</span></div>`;
}

/**
 * The overview's «Table» (DeskOverview.html): a few rows of it (`tableWindow`), the team's own marked, the playoff zone
 * by each team's place in the whole table — the line under the Nth only when the window shows the row after it —, and
 * the way to the whole table. The columns are named for a screen reader only, as the prototype draws none.
 *
 * @param {{rows: import("../../data/season-table.mjs").TableRow[], viewerId: string, teamId?: string, href: string,
 *   playoffPlaces?: number|null}} props `teamId`: the overview's team, whose row alone is marked
 * @returns {string} "" when there are no rows
 */
export function miniTableMarkup({ rows, viewerId, teamId = "", href, playoffPlaces = null }) {
  if (!rows.length) return "";
  assertLinkHref(href);
  const zone = zoneRank(rows, playoffPlaces);
  const head = MINI_COLUMNS.map((key) => `<span role="columnheader">${escapeHtml(t(`league.colName.${key}`))}</span>`).join("");
  return `<section class="g-minitable" aria-labelledby="overview-table"><div class="g-minitable__head">`
    + `<h2 class="g-minitable__title" id="overview-table">${escapeHtml(t("shell.tab.table"))}</h2>`
    + `<a class="g-minitable__all" href="${escapeHtml(href)}">${escapeHtml(t("teamOverview.tableAll"))}</a></div>`
    + `<div class="g-minitable__rows" role="table" aria-labelledby="overview-table">`
    + `<div class="g-sr-only" role="rowgroup"><div role="row">${head}</div></div>`
    + `<div role="rowgroup">${rows.map((row, at) => miniRowMarkup(row, viewerId, teamId, zone[at])).join("")}</div></div></section>`;
}

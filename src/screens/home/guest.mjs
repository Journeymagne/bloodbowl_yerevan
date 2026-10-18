/**
 * A guest's front page (`#/`): what the league is, the way in (sign in, register), the top of the
 * season's table and four doors into the reference. A coach's `#/` is another screen (the router
 * decides); this one has no name of its own to be known by, so the page is the league's.
 *
 * The table is the public half of `/api/season`: the first five rows of the standings without the
 * withdrawn, each with its race from the reference and its points. The place is the server's rank as
 * it is, with the gaps a withdrawn coach leaves, as in the full table. A team is a name, not a link:
 * a coach's page is closed to a guest. Until the season has come the box says so, and when it did not
 * come the box says why; it leads to the full table either way.
 *
 * Up to 900px the page is a column; from 901px it is the league's band, a dark ribbon with the call to
 * sign in, and the two cards side by side (guest.css).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { authUrl, pageUrl, refUrl, seasonTabUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderRankedRow } from "../../ui/list-row.mjs";
import { drawScreen } from "../ref/frame.mjs";
import { loadSeason } from "../season/season-data.mjs";

/** How many teams the box shows; the full table is one link away. */
const TABLE_LIMIT = 5;

/** The page of the reference that says how the league differs from Blood Bowl (`general-information/all-gata-changes.md`). */
const CHANGES_PAGE = { slug: "all-gata-changes" };

/**
 * What the table box shows, from the season as the server sent it.
 *
 * @param {{standings?: object[], rounds?: object[]}|null|undefined} seasonData `/api/season`; a guest's answer may be `{}`, and a season nobody has read is null
 * @param {{teams?: object[]}|null|undefined} data the content vault of the language, whose teams give the races their names
 * @param {number} [limit]
 * @returns {{round: number|null, rows: {rank: number, name: string, race: string, points: number}[]}} `round`: the latest completed round, null when none is
 */
export function guestTable(seasonData, data, limit = TABLE_LIMIT) {
  const races = new Map((data?.teams ?? []).map((page) => [page.slug, page.title]));
  const rows = (seasonData?.standings ?? [])
    .filter((entry) => !entry.withdrawnAt)
    .sort((first, second) => first.rank - second.rank)
    .slice(0, limit)
    .map((entry) => ({ rank: entry.rank, name: entry.team.name, race: races.get(entry.team.baseTeamSlug) ?? "", points: entry.points }));
  const played = (seasonData?.rounds ?? []).filter((round) => round.status === "completed").map((round) => round.roundNumber);
  return { round: played.length ? Math.max(...played) : null, rows };
}

const renderRank = (rank) => `<span class="g-guest__rank">${escapeHtml(rank)}</span>`;

/** The league's name over the season's, for a desktop; a phone's header already says both. */
function headMarkup(seasonName, round) {
  const line = round === null || !seasonName ? seasonName : t("guestHome.season", { season: seasonName, round });
  return `<header class="g-guest__head"><p class="g-guest__brand">${escapeHtml(t("shell.league"))}</p>`
    + `${line ? `<p class="g-guest__season">${escapeHtml(line)}</p>` : ""}</header>`;
}

function heroMarkup() {
  return `<section class="g-guest__hero"><div class="g-guest__intro">`
    + `<h1 class="g-guest__lead">${escapeHtml(t("guestHome.lead"))}</h1><p class="g-guest__text">${escapeHtml(t("guestHome.text"))}</p></div>`
    + `<div class="g-guest__actions">`
    + renderButton({ label: t("auth.toLogin"), kind: "primary", href: authUrl() })
    + renderButton({ label: t("auth.register"), href: authUrl("register") })
    + `</div></section>`;
}

/** The box's rows; where there are none, the line that says why: the error first, then that it is on its way, then that nobody has entered. */
function tableBodyMarkup(season, rows) {
  if (rows.length) return rows.map((row) => renderRankedRow({ leadHtml: renderRank(row.rank), title: row.name, caption: row.race, value: row.points })).join("");
  const note = season.error || (season.loaded ? t("guestHome.tableEmpty") : t("season.loading"));
  return `<p class="g-guest__note" role="status">${escapeHtml(note)}</p>`;
}

function tableMarkup(season, data) {
  const { round, rows } = guestTable(season.data, data);
  const title = round === null ? t("guestHome.table") : t("guestHome.tableAfter", { round });
  return `<section class="g-guest__card g-guest__table"><h2 class="g-guest__title">${escapeHtml(title)}</h2>${tableBodyMarkup(season, rows)}`
    + `<a class="g-guest__more" href="${escapeHtml(seasonTabUrl())}">${escapeHtml(t("guestHome.tableAll"))}</a></section>`;
}

function referenceMarkup() {
  const tiles = [
    { href: refUrl("teams"), title: t("guestHome.tile.teams"), text: t("guestHome.tile.teamsText") },
    { href: refUrl("skills"), title: t("guestHome.tile.skills"), text: t("guestHome.tile.skillsText") },
    { href: refUrl(), title: t("guestHome.tile.match"), text: t("guestHome.tile.matchText") },
    { href: pageUrl(CHANGES_PAGE), title: t("guestHome.tile.changes"), text: t("guestHome.tile.changesText") },
  ];
  const links = tiles.map((tile) => `<a class="g-guest__tile" href="${escapeHtml(tile.href)}"><b class="g-guest__tile-title">${escapeHtml(tile.title)}</b>`
    + `<span class="g-guest__tile-text">${escapeHtml(tile.text)}</span></a>`);
  return `<section class="g-guest__card g-guest__ref"><h2 class="g-guest__title">${escapeHtml(t("shell.tab.ref"))}</h2><div class="g-guest__tiles">${links.join("")}</div></section>`;
}

/**
 * @param {object} props
 * @param {{data: object|null, loaded: boolean, error: string}} props.season `state.season`: the answer of `/api/season`, whether it has come, and why not
 * @param {object} props.data the content vault of the language
 */
export function guestHomeMarkup({ season, data }) {
  const round = guestTable(season.data, data).round;
  return `<div class="g-guest" data-screen="guest">${headMarkup(season.data?.season?.name ?? "", round)}${heroMarkup()}`
    + `<div class="g-guest__grid">${tableMarkup(season, data)}${referenceMarkup()}</div></div>`;
}

/** The page as the app holds the season and the content now; coming from another screen it starts at the top (`drawScreen`). */
function redraw() {
  drawScreen(view, guestHomeMarkup({ season: state.season, data: state.data }));
}

/**
 * Draw the page and, if the season has not been read, read it and draw the box again when it comes (or
 * when it did not: the box then says why). A guest who has gone on to another screen by then is not
 * drawn over it.
 */
export function renderGuestHome() {
  // The request goes out first, so the first draw already knows the season is on its way.
  const coming = state.season.loaded ? null : loadSeason();
  redraw();
  let here = true;
  onScreenLeave("guest-home", () => {
    here = false;
  });
  coming?.then(() => {
    if (here) redraw();
  });
}

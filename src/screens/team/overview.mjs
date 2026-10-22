/**
 * A team's overview (`#/t/:id`): the page head, the figures, who can take an
 * advancement now, the match board (or the call to enter the season), the
 * team's leaders and its recent matches.
 * It replaces the 2.x front page the team's address used to draw (plan stage 06,
 * decision 11); the figures are read from what the server already sends
 * (data/team-record.mjs), and the board's actions are the SideNav card's
 * (`matchActions`, shell/current-match.mjs).
 *
 * `overviewModel` turns the saved team, its race, the table and the games into
 * what the page says (besides them it reads only the reference's names of the
 * races), and `overviewMarkup` draws that. What a figure is worth is the
 * model's; the board, the rows and the words around them are ui/'s and the
 * dictionaries'.
 *
 * One form for each width (stage 07d, decision 47): the model is told whether
 * the screen is a phone's (`isPhone`, as the roster asks it) each time it is
 * drawn, and the screen is drawn again when the width crosses 900px. The figures
 * are the prototypes' (decision 48): a desk's five cards (DeskOverview.html) —
 * the place and the points, each with a quieter second part, the value, the
 * treasury and the TD and CAS difference, in the accent when it is good news —
 * and a phone's four tiles (Team.html): the value, the treasury, the record and
 * the difference, the place being the phone's header's. A desk's head has the
 * reference's search at its right (decision 49), which hands what is typed to
 * the reference as the reference's own heads do; a phone's head is a screen
 * reader's, and has none. A desk's board is DeskOverview.html's (decision 54):
 * the league's crest by our name, the opponent's letter in a circle by theirs,
 * their name leading to their team and their race to its rules; a phone's
 * board says the race and the place as text. The ready players are the one
 * exception: both forms are drawn, and the stylesheet shows one.
 *
 * The board is the season's band (screens/matches/band.mjs, stage 09a): a desk
 * pages through the team's played matches to the current one, its squares the
 * tabs, and its bubbles open «Before the match» from the numbers the
 * preparation would have; the opponent's value stands by his name on both
 * widths once his team is read (from his public page, once a visit for the
 * game as it stands). A phone's board pages nothing and has no bubbles: its
 * squares are smaller than a thumb (decision 12 of stage 05), and the owner
 * keeps the phone's board as it was. A match in play offers its records with
 * their count — the same records the leaders read, not a second read.
 *
 * Who can advance is the roster's own answer (`rosterLines`' `ready`: the SPP to
 * spend reach the first random skill); the Skill Table plays no part in it. It is
 * read from the saved roster, as the player's page the card leads to is. The
 * Roster tab's head counts the save queue's draft — steps not saved yet — and the
 * rows of a match waiting to be settled too, so it can count one more: while a
 * step that gives SPP waits, or while such a match is on, when advancing is
 * closed. It is said twice, and only one is shown for the width (overview.css): a
 * card after the figures on a phone (Team.html), a list in the right column on a
 * desk (DeskOverview.html).
 *
 * Under the board stand two columns (decision 51): the leaders and the recent
 * matches at the left, who can advance at the right and under them, since stage
 * 10, a few rows of the league's table (decision 15 of its plan: the top six, the
 * team below them last with its place, `tableWindow`; since stage 12 the playoff
 * zone the admin set, by each team's place in the whole table) and the way to the whole of
 * it; a column with nothing in it is not drawn, and the other has the row. A
 * phone has no table (Team.html) and shows the left column alone
 * (Team.html's order: the figures, the card, the board, the leaders, the
 * matches). The leaders and the recent results are overview-lists.mjs's, each in
 * the form of the width; the model names the opponent's race of each result from
 * the reference, as the board does, and the addresses of the opponent's team and
 * of the race's rules, which a desk's row leads to (`resultOf`).
 *
 * A page opened on this address has read neither the table nor the games yet,
 * and nothing is said that they could contradict: without the table there is
 * no place and neither a board nor a call to enter the season, without the
 * games the points stand alone and no opponent is said to come later. The
 * screen draws at once from what the state holds and again when they come.
 *
 * The leaders are the career, as «Состав» counts it (stage 07e, decision 13):
 * the roster and the records not settled yet — the taps of a match on
 * (`careerCounters`). The records are read once the games and the table have
 * answered, and again on every answer of the games, one read in the air (a team
 * in its build has none to read); until they come, and when they cannot be
 * read, the leaders are the roster's numbers, and nothing is said. They are
 * taken only with the revision of the team in the coach's list: the roster is
 * the list's, and records of another moment would count a match twice (the
 * post-match settled them into a roster the list does not hold yet) or not at
 * all. Records newer than the list read the list again, once for that answer
 * (review I1): a match begun or ended moves the team's revision on the server —
 * the pre-match's treasury, the post-match — and nothing else tells the coach's
 * list, so the whole page then stands on the roster the records are of. «Ready
 * to advance» stays on the roster (decision 14): an advancement spends the
 * roster's SPP, and the records of a match given up wait for its post-match.
 */
import { apiRequest } from "../../core/api-client.mjs";
import { drawKeepingFocus, escapeHtml, patch } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, playerTeamUrl, teamPlayerUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { loadGames, onGamesChange } from "../../data/games.mjs";
import { playoffPlacesOf, seasonTable, tableWindow } from "../../data/season-table.mjs";
import { recentResults, seasonDifference, seasonRecord, standingOf, teamLeaders, teamValue } from "../../data/team-record.mjs";
import { loadMyTeams, raceTeamOf } from "../../data/teams.mjs";
import { seasonCallFor } from "../../data/season-entry.mjs";
import { matchRecords } from "../../domain/match/preview.mjs";
import { normalizeDraft } from "../../domain/roster/schema.mjs";
import { currentMatch } from "../../shell/current-match.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon as renderIcon } from "../../ui/icons.mjs";
import { renderKpiGrid } from "../../ui/kpi-tile.mjs";
import { renderPlayerBadge } from "../../ui/number-badge.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { bandBoard, bandBoardMarkup, bandItems, bandVisit, previewFor } from "../matches/band.mjs";
import { goSearch, refSearchField, wireRefSearch } from "../ref/frame.mjs";
import { enterCallMarkup, seasonEnterVisit } from "../season/enter.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { miniTableMarkup } from "../season/table.mjs";
import { rosterLines } from "./roster/model.mjs";
import { isPhone, onPhoneChange } from "./roster/screen.mjs";
import { leadersMarkup, resultsMarkup } from "./overview-lists.mjs";

/** How many finished matches the list holds: a phone shows the first three (overview-lists.css). */
const RECENT_MATCHES = 5;

/** "Mock Season · round 3"; the name alone while no round has begun; "" with no season. */
function seasonLineOf(season) {
  if (!season?.name) return "";
  return season.currentRound ? t("teamOverview.season", { season: season.name, round: season.currentRound }) : season.name;
}

/**
 * A finished match as a desk's row says it (DeskOverview.html): the opponent's race by the reference's name, and the ways
 * the row's two links lead — the opponent's team, as the board's name does (`opponentOf`), and the race's rules. "" for a
 * race the reference does not know, and for an opponent whose coach or team the server does not name: no address.
 * @param {ReturnType<typeof recentResults>[number]} result
 */
function resultOf(result) {
  const race = raceTeamOf(result.opponentRace);
  const { opponentUserId: user, opponentTeamId: team } = result;
  return { ...result, race: race?.title ?? "", raceHref: race ? pageUrl(race) : "", teamHref: user && team ? playerTeamUrl(user, team) : "" };
}

/**
 * The board of a team in the table: the season's band (screens/matches/band.mjs) at the item `band.key` names (the
 * current one for none, or one the games no longer hold), the opponent's team as the visit read it, «Before the match»
 * from both, and the records of a match on counted from `matchEvents`, the leaders' read (null while it has not come).
 */
function boardOf({ team, raceTeam, seasonData, games, gamesRead, phone, band, matchEvents, data }) {
  const items = bandItems(games, team.id, seasonData);
  const current = currentMatch(games, team.id);
  const at = band.key === null ? -1 : items.findIndex((item) => item.key === band.key);
  const preview = previewFor({ team, current, opponent: band.opponent, data, teamId: team.id });
  const records = current && matchEvents ? matchRecords(matchEvents, current.game.id) : null;
  return bandBoard({ items, index: at === -1 ? null : at, games, team, raceTeam, seasonData, current, preview, opponent: band.opponent, records, phone, gamesRead });
}

/** What a figure the games give says while they are not read, or could not be: a dash, not a zero they could contradict. */
const UNREAD = "–";

/** A difference with its sign: «+6», «0», «−1» (a minus sign, not a hyphen). */
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : "0");

/** Good news: neither difference below zero, and one above it. */
const ahead = ({ touchdowns, casualties }) => touchdowns >= 0 && casualties >= 0 && (touchdowns > 0 || casualties > 0);

/**
 * The figures (decision 48). Outside the table, the value and the treasury on both widths. In it, a desk's five
 * (DeskOverview.html): the place «2» with «/ 10», the points «13» with «· 4/1/1», the value, the treasury and «+6 / +4»,
 * in the accent when it is good news; a phone's four (Team.html): the value, the treasury, «4 · 1 · 1» and «+6 / +4» in
 * the ink. The record and the difference are the season's league matches with a confirmed score (`seasonRecord`,
 * `seasonDifference`); `games` is null while they are not read, and then the points stand alone and both are a dash.
 * @param {{teamId: string, standing: object|null, games: object[]|null, seasonId: string|null, own: object[], phone: boolean}} input
 */
function tilesOf({ teamId, standing, games, seasonId, own, phone }) {
  if (!standing) return own;
  const record = games && seasonRecord(games, teamId, seasonId);
  const difference = games && seasonDifference(games, teamId, seasonId);
  const both = difference ? `${signed(difference.touchdowns)} / ${signed(difference.casualties)}` : UNREAD;
  if (phone) {
    return [...own,
      { label: t("teamOverview.tile.record"), value: record ? `${record.wins} · ${record.draws} · ${record.losses}` : UNREAD },
      { label: t("teamOverview.tile.diff"), value: both }];
  }
  return [
    { label: t("teamOverview.tile.place"), value: String(standing.rank), rest: `/ ${standing.of}` },
    { label: t("teamOverview.tile.points"), value: String(standing.points), rest: record ? `· ${record.wins}/${record.draws}/${record.losses}` : "" },
    ...own,
    { label: t("teamOverview.tile.diffDesk"), value: both, accent: Boolean(difference) && ahead(difference) },
  ];
}

/**
 * The players who can take an advancement now, the one with the most SPP to spend first, a tie in the roster's order.
 * One the roster stores no id for is left out: no address leads to him. With no race there are no players to read.
 * @returns {{id: string, number: string, name: string, position: string, kind: string, available: number}[]}
 */
function readyPlayers(draft, raceTeam) {
  return rosterLines({ draft, race: raceTeam })
    .filter((line) => line.ready && line.id)
    .map(({ id, number, name, position, kind, available }) => ({ id, number, name, position, kind, available }))
    .sort((one, other) => other.available - one.available);
}

/**
 * What the overview says of a team.
 *
 * @param {object} input
 * @param {object} input.team the saved team, as `/api/teams` sends it
 * @param {object|null} input.raceTeam the race's page in the reference data; null when it is not known
 * @param {object|null} input.seasonData the answer of `/api/season`; null while it is not read
 * @param {object[]|null} input.games the answer of `/api/games`; null while it is not read
 * @param {string} [input.gamesError] why the games could not be read, as a sentence
 * @param {string} [input.seasonError] why the table could not be read; said only while there is no table to show
 * @param {boolean} [input.phone] the screen is a phone's (up to 900px): Team.html's form, not DeskOverview.html's
 * @param {object[]} [input.events] the records not settled yet, of the roster's own moment: what the leaders add to it
 * @param {{key: string|null, opponent: {team: object}|{error: string}|null}} [input.band] the board's item shown and the
 *   opponent's team, as the visit holds them (`bandVisit`)
 * @param {object[]|null} [input.matchEvents] the records as last read, of any moment: what a match on counts
 * @param {object|null} [input.data] the reference, for «Before the match»
 * @param {string} [input.viewerId] the coach who looks: the team's row of the table is his own, marked
 * @param {object[]} [input.myTeams] the coach's teams: the call to enter the season names the one that plays it
 * @param {boolean} [input.entering] the entry into the season is on its way (the call's button is busy)
 */
export function overviewModel({ team, raceTeam, seasonData, games, gamesError = "", seasonError = "", phone = false, events = [],
  band = { key: null, opponent: null }, matchEvents = null, data = null, viewerId = "", myTeams = [], entering = false }) {
  const season = seasonData?.season ?? null;
  const standing = standingOf(seasonData, team.id);
  const gamesRead = Array.isArray(games) && !gamesError;
  const list = Array.isArray(games) ? games : [];
  const worth = teamValue(team, raceTeam);
  const draft = normalizeDraft(team.roster ?? {});
  const own = [
    { label: t("teamOverview.tile.value"), value: formatMoney(worth) },
    { label: t("roster.treasuryTitle"), value: formatMoney(draft.treasury), href: teamUrl(team.id, "team") },
  ];
  return {
    teamId: team.id,
    phone,
    seasonLine: seasonLineOf(season),
    draft: team.stage === "draft",
    tiles: tilesOf({ teamId: team.id, standing, games: gamesRead ? list : null, seasonId: season?.id ?? null, own, phone }),
    inSeason: Boolean(standing),
    seasonRead: Boolean(seasonData),
    table: standing && !phone ? tableWindow(seasonTable(seasonData), team.id) : [],
    playoffPlaces: playoffPlacesOf(seasonData),
    viewerId,
    board: standing && !gamesError ? boardOf({ team, raceTeam, seasonData, games: list, gamesRead, phone, band, matchEvents, data }) : null,
    ready: readyPlayers(draft, raceTeam),
    leaders: teamLeaders(team, raceTeam, events),
    results: recentResults(list, team.id, RECENT_MATCHES).map(resultOf),
    gamesError,
    seasonError: seasonData ? "" : seasonError,
    seasonCall: seasonCallFor(team.id, seasonData, myTeams),
    entering,
  };
}

/** A read that failed, in a danger callout. */
const failedLine = (title) => renderCallout({ tone: "danger", title });

/**
 * Where the board stands: the board; the words for each read that failed, when it could not be drawn (the table, and the
 * games for a team in the table or while the table is not there to say); the call to enter the season, with its button
 * (stage 12) or the coach's other team that plays it; or nothing yet.
 */
function boardSlot(model) {
  if (model.board) return bandBoardMarkup(model.board);
  const failures = [];
  if (model.seasonError) failures.push(failedLine(t("teamOverview.seasonFailed", { reason: model.seasonError })));
  if (model.gamesError && (model.inSeason || !model.seasonRead)) failures.push(failedLine(t("teamOverview.gamesFailed", { reason: model.gamesError })));
  if (failures.length) return `<div class="g-overview__failed" role="alert">${failures.join("")}</div>`;
  if (!model.seasonRead) return "";
  return enterCallMarkup(model.seasonCall, model.entering);
}

/**
 * A phone's card (Team.html): the player with the most SPP to spend, and how many others can advance, leading to him.
 * Nothing when nobody can.
 */
function readyCardMarkup(ready, teamId) {
  if (!ready.length) return "";
  const [first, ...others] = ready;
  const who = others.length
    ? t("teamOverview.ready.more", { name: first.name, spp: first.available, more: others.length })
    : t("teamOverview.ready.who", { name: first.name, spp: first.available });
  return `<a class="g-overview__ready" href="${escapeHtml(teamPlayerUrl(teamId, first.id))}"><span class="g-overview__readytext">`
    + `<span class="g-overview__readytitle">${escapeHtml(t("teamOverview.ready.card"))}</span><span class="g-overview__readywho">${escapeHtml(who)}</span></span>`
    + `${renderIcon("chevron", 18)}</a>`;
}

/**
 * One who can advance on a desk: the number, name and position, the SPP to spend, and «Advance» to the address.
 * Every row says the same word, so the link is named for the player (it starts with the word, as it reads).
 */
function readyRow({ id, number, name, position, kind, available }, teamId) {
  return `<li class="g-overview__readyrow">${renderPlayerBadge({ number, kind })}`
    + `<span class="g-overview__readyplayer"><span class="g-overview__readyname">${escapeHtml(name)}</span><span class="g-overview__readypos">${escapeHtml(position)}</span></span>`
    + `<span class="g-overview__readyspp">${escapeHtml(t("teamOverview.ready.spp", { spp: available }))}</span>`
    + `<a class="g-overview__advance" href="${escapeHtml(teamPlayerUrl(teamId, id))}" aria-label="${escapeHtml(t("teamOverview.ready.advanceLabel", { name }))}">${escapeHtml(t("teamOverview.ready.advance"))}</a></li>`;
}

/** A desk's list (DeskOverview.html): every player who can advance, with how many they are in its head. */
function readyListMarkup(ready, teamId) {
  if (!ready.length) return "";
  return `<section class="g-overview__readylist"><div class="g-overview__readybar"><h2 class="g-overview__readyheading">${escapeHtml(t("teamOverview.ready.title"))}</h2>`
    + `<span class="g-overview__readycount">${escapeHtml(t("teamOverview.ready.count", { count: ready.length }))}</span></div>`
    + `<ul class="g-overview__readyrows">${ready.map((player) => readyRow(player, teamId)).join("")}</ul></section>`;
}

/**
 * The reference's search at the right of a desk's head (DeskOverview.html, decision 49): the reference's own field and
 * words — the prototype's «Players, skills, rules…» would promise players, whom the reference does not look for.
 */
const searchMarkup = () => `<div class="g-overview__search">${refSearchField("overview-query")}</div>`;

/** A column of the overview's two (`g-overview__main`, `g-overview__aside`), holding `markup`; nothing for one with nothing in it. */
const column = (className, markup) => (markup ? `<div class="${className}">${markup}</div>` : "");

/**
 * The two columns under the board (DeskOverview.html, decision 51): the leaders and the recent matches at the left, who
 * can advance and the table at the right. A column with nothing in it is not drawn, and the other has the row to itself;
 * with neither there is nothing. A phone shows the left one alone, under the board (Team.html): the right one is a desk's.
 */
function columnsMarkup(model) {
  const { leaders, results, teamId, phone } = model;
  const main = leadersMarkup({ leaders, teamId, phone }) + resultsMarkup({ results, teamId, phone });
  const aside = readyListMarkup(model.ready, teamId)
    + miniTableMarkup({ rows: model.table, viewerId: model.viewerId, teamId, href: teamUrl(teamId, "matches"), playoffPlaces: model.playoffPlaces });
  return main || aside ? `<div class="g-overview__cols">${column("g-overview__main", main)}${column("g-overview__aside", aside)}</div>` : "";
}

/**
 * A team in its build says so: in the page head on a desk, and as the first line of the page on a phone, where the
 * head is only for a screen reader (the owner's ruling R4 of stage 08). The phone's line is hidden from a screen
 * reader, which hears the head's, and from a desk (overview.css), so the chip is never said twice. The head's search
 * is a desk's only: a phone's head is not seen.
 * @param {ReturnType<typeof overviewModel>} model
 */
export function overviewMarkup(model) {
  const draft = model.draft ? renderStatusChip({ label: t("teams.stage.draft") }) : "";
  const head = renderPageHead({ title: t("shell.tab.overview"), sub: model.seasonLine, metaHtml: draft + (model.phone ? "" : searchMarkup()) });
  const stage = draft ? `<div class="g-overview__stage" aria-hidden="true">${draft}</div>` : "";
  return `${head}<div class="g-overview">${stage}${renderKpiGrid(model.tiles, { row: true })}${readyCardMarkup(model.ready, model.teamId)}${boardSlot(model)}`
    + `${columnsMarkup(model)}</div>`;
}

/**
 * The team's records not settled yet and the revision they were read at (`GET /api/teams/:id/events`), for the
 * leaders; null for a read that failed, or an answer that is not one (no list, no whole revision).
 * @param {string} teamId
 * @returns {Promise<{events: object[], revision: number}|null>}
 */
async function readRecords(teamId) {
  try {
    const { events, revision } = (await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/events`)) ?? {};
    return Array.isArray(events) && Number.isInteger(revision) ? { events, revision } : null;
  } catch {
    return null;
  }
}

/** The team `teamId` in the coach's list; undefined once it is not there. */
const listed = (teamId) => state.myTeams.items.find((item) => item.id === teamId);

/**
 * Records read at a revision past the one of the team in the coach's list (review I1): a match begun or ended since the
 * list was read. A team the list holds with no whole revision has none to compare.
 * @param {{revision: number}|null} records @param {{revision?: unknown}|undefined} team
 */
const pastList = (records, team) => Boolean(records) && Number.isInteger(team?.revision) && records.revision > team.revision;

/**
 * The overview of `teamId` as the state has it now; "" when the team is not on the coach's list (it was deleted
 * while the games were on their way), and the screen is left as it was. A failure `held` back is one an earlier
 * read left, which the read repeating it has not yet answered: it is not drawn, nor the games it left. The leaders
 * count the `records` only when they are of the team's revision in the list; a match on counts them as they are.
 * @param {{games: boolean, season: boolean}} held
 * @param {{events: object[], revision: number}|null} records as the visit last read them
 * @param {{key: string|null, opponent: object|null}} band the board's part of the visit
 */
function markupOf(teamId, held, records, band, entry) {
  const team = listed(teamId);
  if (!team) return "";
  const { items, loaded, error } = state.games;
  const same = Number.isInteger(team.revision) && records?.revision === team.revision;
  return overviewMarkup(overviewModel({
    team,
    raceTeam: raceTeamOf(team.baseTeamSlug),
    seasonData: state.season.data,
    games: loaded && !held.games ? items : null,
    gamesError: held.games ? "" : error,
    seasonError: held.season ? "" : state.season.error,
    phone: isPhone(),
    events: same ? records.events : [],
    band: { key: band.key, opponent: band.opponent },
    matchEvents: records?.events ?? null,
    data: state.data,
    viewerId: state.auth.currentUser?.id ?? "",
    myTeams: state.myTeams.items,
    entering: entry.busy,
  }));
}

/**
 * The overview of one of the coach's teams. Drawn at once from the state, the title taking the focus; again when
 * the table and the games come, if the coach is still here, whenever the games change while they are (a start,
 * a score sent), and when the width crosses 900px. The later draws patch the page, so the focus stays where the coach
 * has put it. What is typed in a desk's search takes the coach to the reference with it (`goSearch`).
 *
 * A read that failed is made again on this visit (nothing else would, and the overview would say so until a
 * reload); what it said before is not drawn while the new answer is on its way. The leaders' records are read once the
 * games and the table have answered (review M2: an answer of the games on its way when the page is drawn asks for no
 * second read), and on every answer of the games after it: one read in the air, and one more after it for the answers
 * it missed; an answer is taken while the coach is here, a failure as none. One newer than the coach's list reads the
 * list again before it is drawn (review I1) — as part of that read, so none is sent while another is in the air, and
 * one for each answer at most.
 * @param {string} teamId
 */
export async function renderTeamOverview(teamId) {
  let here = true;
  const held = { games: Boolean(state.games.error), season: Boolean(state.season.error) };
  const records = { last: null, reading: false, again: false, armed: false };
  const draw = () => {
    if (!here) return;
    const markup = markupOf(teamId, held, records.last, band, entry);
    if (markup) patch(view, markup);
  };
  // «Enter the season» on the call (stage 12): one question, one entry on its way.
  const entry = seasonEnterVisit({ root: view, teamId, here: () => here, draw });
  // The board's part: the match shown, the opponent read for the match on, «Before the match» (stage 09a).
  const gamesNow = () => (state.games.loaded && !held.games ? state.games.items : null);
  const band = bandVisit({ teamId, root: view, draw, read: () => ({ team: listed(teamId), games: gamesNow(), seasonData: state.season.data, data: state.data }) });
  // A team in its build that has no match in the coach's games has no records to read. Since stage 12 every new team
  // starts in its build and may play (a friendly, or a round that paired it) before the admin moves it into the season.
  const plays = () => (gamesNow() ?? []).some((game) => game.home?.team?.id === teamId || game.away?.team?.id === teamId);
  const readLeaders = async () => {
    if (!here || (listed(teamId)?.stage === "draft" && !plays())) return;
    if (records.reading) {
      records.again = true;
      return;
    }
    records.reading = true;
    const answer = await readRecords(teamId);
    if (here && pastList(answer, listed(teamId))) await loadMyTeams(true).catch(() => {});
    records.reading = false;
    if (!here) return;
    records.last = answer;
    draw();
    if (records.again) {
      records.again = false;
      void readLeaders();
    }
  };
  // Any answer to the games heard from here on is to the read started below, or to a newer one: no old failure outlives it.
  const offs = [
    onGamesChange(() => {
      held.games = false;
      band.gamesChanged();
      draw();
      if (records.armed) void readLeaders();
    }),
    // The field, a tile or a list the coach was on may be gone with the other form, or hidden by it — the desk's
    // «Advance» on a phone, the phone's card on a desk, the fourth and fifth match on a phone (Review Focus 2, fix
    // round 1): a focus left on nothing goes to the title.
    onPhoneChange(() => drawKeepingFocus(view, draw, "h1")),
    wireRefSearch(view, { onQuery: goSearch }),
    () => band.release(),
    entry.off,
  ];
  onScreenLeave("team-overview", () => {
    here = false;
    for (const off of offs) off();
  });
  const reads = Promise.allSettled([loadGames(held.games), loadSeason(held.season)]);
  const first = markupOf(teamId, held, records.last, band, entry);
  if (first) {
    view.innerHTML = first;
    view.querySelector("h1")?.focus();
  }
  await reads;
  held.games = false;
  held.season = false;
  band.gamesChanged();
  draw();
  records.armed = true;
  void readLeaders();
}

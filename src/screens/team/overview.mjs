/**
 * A team's overview (`#/t/:id`): the page head, four figures, who can take an
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
 * Who can advance is the roster's own answer (`rosterLines`' `ready`: the SPP to
 * spend reach the first random skill), the same one the roster counts, so the
 * two never disagree; the Skill Table plays no part in it. It is said twice,
 * and only one is shown for the width (overview.css): a card after the figures
 * on a phone (Team.html), a list under the leaders on a desk (DeskOverview.html).
 *
 * A page opened on this address has read neither the table nor the games yet,
 * and nothing is said that they could contradict: without the table there is
 * no place and neither a board nor a call to enter the season, without the
 * games the points stand alone and no opponent is said to come later. The
 * screen draws at once from what the state holds and again when they come.
 */
import { escapeHtml, patch } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, seasonTabUrl, teamPlayerUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { loadGames, onGamesChange } from "../../data/games.mjs";
import { gameSides, recentResults, seasonPager, seasonRecord, standingOf, teamLeaders, teamValue } from "../../data/team-record.mjs";
import { raceTeamOf, raceTitleOf } from "../../data/teams.mjs";
import { normalizeDraft } from "../../domain/roster/schema.mjs";
import { currentMatch, matchActions, subLine } from "../../shell/current-match.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon as renderIcon } from "../../ui/icons.mjs";
import { renderKpiGrid } from "../../ui/kpi-tile.mjs";
import { renderRankedRow } from "../../ui/list-row.mjs";
import { renderBoardActions, renderMatchBoard } from "../../ui/match-board.mjs";
import { renderPlayerBadge } from "../../ui/number-badge.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderResultPill } from "../../ui/result-pill.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { rosterLines } from "./roster/model.mjs";

/** How many finished matches the list holds: a phone shows the first three (overview.css). */
const RECENT_MATCHES = 5;

/** "#3 Catcher": a player's number, when he has one, and his position. */
const playerLine = (number, position) => [number ? `#${number}` : "", position].filter(Boolean).join(" ");

/** "Mock Season · round 3"; the name alone while no round has begun; "" with no season. */
function seasonLineOf(season) {
  if (!season?.name) return "";
  return season.currentRound ? t("teamOverview.season", { season: season.name, round: season.currentRound }) : season.name;
}

/** The side a proposed score is read from: the proposal's touchdowns of home or away. */
const proposedTouchdowns = (game, side) => game[`proposed${side === "home" ? "Home" : "Away"}Touchdowns`];

/** The score a team sent or was sent, as the team reads it ("2–1"); "" when a number of it is missing. */
function proposedScore(game, sides) {
  const [own, other] = [proposedTouchdowns(game, sides.own), proposedTouchdowns(game, sides.other)];
  return own === null || own === undefined || other === null || other === undefined ? "" : `${own}–${other}`;
}

/** The opponent's race and its place in the table: "Dwarf · #1 in the league". */
function opponentLine(rival, seasonData) {
  const place = standingOf(seasonData, rival.team?.id)?.rank;
  return [raceTitleOf(rival.team?.baseTeamSlug), place ? t("shell.place", { place }) : ""].filter(Boolean).join(" · ");
}

/**
 * The board of a team in the table: the match it is about (`currentMatch`), our side with the place and the value, the
 * other with the race and the place, the score only once one is sent, and the season's squares for the form.
 */
function boardOf({ team, raceTeam, seasonData, games, gamesRead, standing, worth }) {
  const current = currentMatch(games, team.id);
  const sides = current && gameSides(current.game, team.id);
  const rival = sides && current.game[sides.other];
  const round = seasonData.season?.currentRound;
  const own = { name: team.name, sub: raceTeam ? t("teamOverview.ownSub", { race: raceTeam.title, place: standing.rank, value: formatMoney(worth) }) : "" };
  return {
    overline: sides ? subLine(current.game, sides.own) : "",
    own,
    opponent: rival ? { name: rival.team?.name ?? "", sub: opponentLine(rival, seasonData) } : null,
    pendingText: gamesRead && round ? t("teamOverview.opponentLater", { round }) : "",
    score: current?.phase === "sent" ? proposedScore(current.game, sides) : "",
    status: current?.phase ?? "none",
    pager: seasonPager(games, team.id, seasonData, current?.game.id).map((square) => ({ label: String(square.round), result: square.result, current: square.current })),
    ...matchActions(current, team.id),
  };
}

/** The place and the points of a team in the table; the record only when the games were read. */
function tableTiles(standing, record) {
  const points = record ? `${standing.points} · ${record.wins}/${record.draws}/${record.losses}` : String(standing.points);
  return [
    { label: t("teamOverview.tile.place"), value: `${standing.rank} / ${standing.of}` },
    { label: t("teamOverview.tile.points"), value: points },
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
 */
export function overviewModel({ team, raceTeam, seasonData, games, gamesError = "", seasonError = "" }) {
  const season = seasonData?.season ?? null;
  const standing = standingOf(seasonData, team.id);
  const gamesRead = Array.isArray(games) && !gamesError;
  const list = Array.isArray(games) ? games : [];
  const worth = teamValue(team, raceTeam);
  const record = gamesRead && standing ? seasonRecord(list, team.id, season?.id ?? null) : null;
  const draft = normalizeDraft(team.roster ?? {});
  const own = [
    { label: t("teamOverview.tile.value"), value: formatMoney(worth) },
    { label: t("roster.treasuryTitle"), value: formatMoney(draft.treasury), href: teamUrl(team.id, "team") },
  ];
  return {
    teamId: team.id,
    seasonLine: seasonLineOf(season),
    draft: team.stage === "draft",
    tiles: standing ? [...tableTiles(standing, record), ...own] : own,
    inSeason: Boolean(standing),
    seasonRead: Boolean(seasonData),
    board: standing && !gamesError ? boardOf({ team, raceTeam, seasonData, games: list, gamesRead, standing, worth }) : null,
    ready: readyPlayers(draft, raceTeam),
    leaders: teamLeaders(team, raceTeam),
    results: recentResults(list, team.id, RECENT_MATCHES),
    gamesError,
    seasonError: seasonData ? "" : seasonError,
  };
}

/** The state under the score: not begun, in play, waiting for the opponent's or our confirmation; nothing for no match. */
function statusChip(status) {
  if (status === "idle") return renderStatusChip({ label: t("teamOverview.status.idle") });
  if (status === "live") return renderStatusChip({ label: t("shell.match.live"), tone: "live" });
  if (status === "sent") return renderStatusChip({ label: t("shell.match.awaiting"), tone: "wait" });
  return "";
}

/** The board, with the way to the friendlies last among its actions. */
function boardMarkup(board, teamId) {
  const friendlies = { label: t("teamOverview.friendlies"), href: teamUrl(teamId, "challenges"), kind: "light" };
  return renderMatchBoard({
    overline: board.overline,
    own: board.own,
    opponent: board.opponent,
    pendingText: board.pendingText,
    score: board.score,
    statusHtml: statusChip(board.status),
    pager: board.pager,
    actionsHtml: renderBoardActions({ links: [...board.links, friendlies], sentLine: board.sentLine }),
    live: board.status === "live",
  });
}

/** A read that failed, in a danger callout. */
const failedLine = (title) => renderCallout({ tone: "danger", title });

/**
 * Where the board stands: the board; the words for each read that failed, when it could not be drawn (the table, and the
 * games for a team in the table or while the table is not there to say); the call to enter the season; or nothing yet.
 */
function boardSlot(model) {
  if (model.board) return boardMarkup(model.board, model.teamId);
  const failures = [];
  if (model.seasonError) failures.push(failedLine(t("teamOverview.seasonFailed", { reason: model.seasonError })));
  if (model.gamesError && (model.inSeason || !model.seasonRead)) failures.push(failedLine(t("teamOverview.gamesFailed", { reason: model.gamesError })));
  if (failures.length) return `<div class="g-overview__failed" role="alert">${failures.join("")}</div>`;
  if (!model.seasonRead) return "";
  return renderCallout({ title: t("teamOverview.notInSeason"), sub: t("teamOverview.notInSeasonSub"), href: seasonTabUrl("registration") });
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

/** One who can advance on a desk: his number, name and position, the SPP he has to spend, and «Advance» to his address. */
function readyRow({ id, number, name, position, kind, available }, teamId) {
  return `<li class="g-overview__readyrow">${renderPlayerBadge({ number, kind })}`
    + `<span class="g-overview__readyplayer"><span class="g-overview__readyname">${escapeHtml(name)}</span><span class="g-overview__readypos">${escapeHtml(position)}</span></span>`
    + `<span class="g-overview__readyspp">${escapeHtml(t("teamOverview.ready.spp", { spp: available }))}</span>`
    + `<a class="g-overview__advance" href="${escapeHtml(teamPlayerUrl(teamId, id))}">${escapeHtml(t("teamOverview.ready.advance"))}</a></li>`;
}

/** A desk's list (DeskOverview.html): every player who can advance, with how many they are in its head. */
function readyListMarkup(ready, teamId) {
  if (!ready.length) return "";
  return `<section class="g-overview__readylist"><div class="g-overview__readybar"><h2 class="g-overview__readyheading">${escapeHtml(t("teamOverview.ready.title"))}</h2>`
    + `<span class="g-overview__readycount">${escapeHtml(t("teamOverview.ready.count", { count: ready.length }))}</span></div>`
    + `<ul class="g-overview__readyrows">${ready.map((player) => readyRow(player, teamId)).join("")}</ul></section>`;
}

/** A leader's tag (SPP, TD, CAS, COMP) as the ranked row's lead: text, escaped. */
function leaderTag(key) {
  return escapeHtml(t(`teamOverview.leader.${key}`));
}

function leadersMarkup(leaders) {
  if (!leaders.length) return "";
  const rows = leaders.map(({ key, name, number, position, value }) => renderRankedRow({ leadHtml: leaderTag(key), title: name, caption: playerLine(number, position), value }));
  return `<section class="g-overview__leaders"><h2 class="g-overview__title">${escapeHtml(t("teamOverview.leaders"))}</h2>`
    + `<div class="g-overview__leaderlist">${rows.join("")}</div></section>`;
}

/** One finished match: its pill, the opponent with the round and the casualties, the score; the whole row opens the match. */
function resultRow({ gameId, result, opponent, round, friendly, score, cas }) {
  const line = friendly ? t("teamOverview.friendlyLine", { cas }) : t("teamOverview.resultLine", { round, cas });
  return `<li class="g-overview__result"><a class="g-overview__row" href="${escapeHtml(gameUrl(gameId))}">${renderResultPill({ result, compact: true })}`
    + `<span class="g-overview__text"><span class="g-overview__opponent">${escapeHtml(opponent)}</span><span class="g-overview__line">${escapeHtml(line)}</span></span>`
    + `<span class="g-overview__score">${escapeHtml(score)}</span></a></li>`;
}

function resultsMarkup(results, teamId) {
  if (!results.length) return "";
  return `<section class="g-overview__results"><div class="g-overview__bar"><h2 class="g-overview__title">${escapeHtml(t("teamOverview.results"))}</h2>`
    + `<a class="g-overview__all" href="${escapeHtml(teamUrl(teamId, "matches"))}">${escapeHtml(t("teamOverview.wholeSeason"))}</a></div>`
    + `<ul class="g-overview__list">${results.map(resultRow).join("")}</ul></section>`;
}

/**
 * A team in its build says so: in the page head on a desk, and as the first line of the page on a phone, where the
 * head is only for a screen reader (the owner's ruling R4 of stage 08). The phone's line is hidden from a screen
 * reader, which hears the head's, and from a desk (overview.css), so the chip is never said twice.
 * @param {ReturnType<typeof overviewModel>} model
 */
export function overviewMarkup(model) {
  const draft = model.draft ? renderStatusChip({ label: t("teams.stage.draft") }) : "";
  const head = renderPageHead({ title: t("shell.tab.overview"), sub: model.seasonLine, metaHtml: draft });
  const stage = draft ? `<div class="g-overview__stage" aria-hidden="true">${draft}</div>` : "";
  const lists = leadersMarkup(model.leaders) + resultsMarkup(model.results, model.teamId) + readyListMarkup(model.ready, model.teamId);
  return `${head}<div class="g-overview">${stage}${renderKpiGrid(model.tiles, { row: true })}${readyCardMarkup(model.ready, model.teamId)}${boardSlot(model)}`
    + `${lists ? `<div class="g-overview__cols">${lists}</div>` : ""}</div>`;
}

/**
 * The overview of `teamId` as the state has it now; "" when the team is not on the coach's list (it was deleted
 * while the games were on their way), and the screen is left as it was. A failure `held` back is one an earlier
 * read left, which the read repeating it has not yet answered: it is not drawn, nor the games it left.
 * @param {{games: boolean, season: boolean}} held
 */
function markupOf(teamId, held) {
  const team = state.myTeams.items.find((item) => item.id === teamId);
  if (!team) return "";
  const { items, loaded, error } = state.games;
  return overviewMarkup(overviewModel({
    team,
    raceTeam: raceTeamOf(team.baseTeamSlug),
    seasonData: state.season.data,
    games: loaded && !held.games ? items : null,
    gamesError: held.games ? "" : error,
    seasonError: held.season ? "" : state.season.error,
  }));
}

/**
 * The overview of one of the coach's teams. Drawn at once from the state, the title taking the focus; again when
 * the table and the games come, if the coach is still here, and whenever the games change while they are (a start,
 * a score sent). The later draws patch the page, so the focus stays where the coach has put it.
 *
 * A read that failed is made again on this visit (nothing else would, and the overview would say so until a
 * reload); what it said before is not drawn while the new answer is on its way.
 * @param {string} teamId
 */
export async function renderTeamOverview(teamId) {
  let here = true;
  const held = { games: Boolean(state.games.error), season: Boolean(state.season.error) };
  const draw = () => {
    if (!here) return;
    const markup = markupOf(teamId, held);
    if (markup) patch(view, markup);
  };
  // Any answer to the games heard from here on is to the read started below, or to a newer one: no old failure outlives it.
  const stopListening = onGamesChange(() => {
    held.games = false;
    draw();
  });
  onScreenLeave("team-overview", () => {
    here = false;
    stopListening();
  });
  const reads = Promise.allSettled([loadGames(held.games), loadSeason(held.season)]);
  const first = markupOf(teamId, held);
  if (first) {
    view.innerHTML = first;
    view.querySelector("h1")?.focus();
  }
  await reads;
  held.games = false;
  held.season = false;
  draw();
}

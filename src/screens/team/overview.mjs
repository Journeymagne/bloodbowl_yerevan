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
 * matches at the left, who can advance at the right; a column with nothing in it
 * is not drawn, and the other has the row. A phone shows the left one alone
 * (Team.html's order: the figures, the card, the board, the leaders, the
 * matches). The leaders and the recent results are overview-lists.mjs's, each in
 * the form of the width; the model names the opponent's race of each result from
 * the reference, as the board does.
 *
 * A page opened on this address has read neither the table nor the games yet,
 * and nothing is said that they could contradict: without the table there is
 * no place and neither a board nor a call to enter the season, without the
 * games the points stand alone and no opponent is said to come later. The
 * screen draws at once from what the state holds and again when they come.
 */
import { drawKeepingFocus, escapeHtml, patch } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, playerTeamUrl, seasonTabUrl, teamPlayerUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { loadGames, onGamesChange } from "../../data/games.mjs";
import { gameSides, recentResults, seasonDifference, seasonPager, seasonRecord, standingOf, teamLeaders, teamValue } from "../../data/team-record.mjs";
import { raceTeamOf, raceTitleOf } from "../../data/teams.mjs";
import { normalizeDraft } from "../../domain/roster/schema.mjs";
import { renderCrest } from "../../shell/crest.mjs";
import { currentMatch, matchActions, subLine } from "../../shell/current-match.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon as renderIcon } from "../../ui/icons.mjs";
import { renderKpiGrid } from "../../ui/kpi-tile.mjs";
import { renderBoardActions, renderMatchBoard } from "../../ui/match-board.mjs";
import { renderPlayerBadge } from "../../ui/number-badge.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { goSearch, refSearchField, wireRefSearch } from "../ref/frame.mjs";
import { loadSeason } from "../season/season-data.mjs";
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

/** The side a proposed score is read from: the proposal's touchdowns of home or away. */
const proposedTouchdowns = (game, side) => game[`proposed${side === "home" ? "Home" : "Away"}Touchdowns`];

/** The score a team sent or was sent, as the team reads it ("2–1"); "" when a number of it is missing. */
function proposedScore(game, sides) {
  const [own, other] = [proposedTouchdowns(game, sides.own), proposedTouchdowns(game, sides.other)];
  return own === null || own === undefined || other === null || other === undefined ? "" : `${own}–${other}`;
}

/** The letter in the opponent's circle (DeskOverview.html): the name's first, upper case; «?» for a name of nothing. */
const initialOf = (name) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

/**
 * The opponent's side of the board, with its place short («#1», «1-е»). On a desk (DeskOverview.html, decision 54) the
 * name leads to the team's page, the letter stands in a circle by it, and a race the reference knows leads to its rules
 * at the head of the line, the place after it; on a phone the race and the place are a line of text: «Dwarf · #1».
 */
function opponentOf(rival, seasonData, phone) {
  const name = rival.team?.name ?? "";
  const race = raceTeamOf(rival.team?.baseTeamSlug);
  const rank = standingOf(seasonData, rival.team?.id)?.rank;
  const place = rank ? t("teamOverview.opponentPlace", { place: rank }) : "";
  if (phone) return { name, sub: [race?.title, place].filter(Boolean).join(" · ") };
  const href = rival.user?.id && rival.team?.id ? playerTeamUrl(rival.user.id, rival.team.id) : undefined;
  const raceLink = race ? { title: race.title, href: pageUrl(race), hint: t("teamOverview.boardRace") } : undefined;
  return { name, href, hint: t("teamOverview.boardTeam"), sub: place, initial: initialOf(name), race: raceLink };
}

/**
 * The board of a team in the table: the match it is about (`currentMatch`), our side with the place and the value (and
 * on a desk the league's crest), the other's (`opponentOf`), the score only once one is sent, and the season's squares
 * for the form.
 */
function boardOf({ team, raceTeam, seasonData, games, gamesRead, standing, worth, phone }) {
  const current = currentMatch(games, team.id);
  const sides = current && gameSides(current.game, team.id);
  const rival = sides && current.game[sides.other];
  const round = seasonData.season?.currentRound;
  const own = { name: team.name, sub: raceTeam ? t("teamOverview.ownSub", { race: raceTeam.title, place: standing.rank, value: formatMoney(worth) }) : "" };
  if (!phone) own.crestHtml = renderCrest({ size: "md" });
  return {
    overline: sides ? subLine(current.game, sides.own) : "",
    own,
    opponent: rival ? opponentOf(rival, seasonData, phone) : null,
    pendingText: gamesRead && round ? t("teamOverview.opponentLater", { round }) : "",
    score: current?.phase === "sent" ? proposedScore(current.game, sides) : "",
    status: current?.phase ?? "none",
    pager: seasonPager(games, team.id, seasonData, current?.game.id).map((square) => ({ label: String(square.round), result: square.result, current: square.current })),
    ...matchActions(current, team.id),
  };
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
 */
export function overviewModel({ team, raceTeam, seasonData, games, gamesError = "", seasonError = "", phone = false }) {
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
    board: standing && !gamesError ? boardOf({ team, raceTeam, seasonData, games: list, gamesRead, standing, worth, phone }) : null,
    ready: readyPlayers(draft, raceTeam),
    leaders: teamLeaders(team, raceTeam),
    results: recentResults(list, team.id, RECENT_MATCHES).map((result) => ({ ...result, race: raceTitleOf(result.opponentRace) })),
    gamesError,
    seasonError: seasonData ? "" : seasonError,
  };
}

/**
 * The state under the score: not begun, in play, waiting for the opponent's or our confirmation; nothing for no match.
 * The chip is the dark band's (DeskOverview.html: an eighth of the ink, the dot the state's).
 */
function statusChip(status) {
  if (status === "idle") return renderStatusChip({ label: t("teamOverview.status.idle"), onDark: true });
  if (status === "live") return renderStatusChip({ label: t("shell.match.live"), tone: "live", onDark: true });
  if (status === "sent") return renderStatusChip({ label: t("shell.match.awaiting"), tone: "wait", onDark: true });
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
 * can advance at the right. A column with nothing in it is not drawn, and the other has the row to itself; with neither
 * there is nothing. A phone shows the left one alone, under the board (Team.html): the right one's list is a desk's.
 */
function columnsMarkup(model) {
  const { leaders, results, teamId, phone } = model;
  const main = leadersMarkup({ leaders, teamId, phone }) + resultsMarkup({ results, teamId, phone });
  const aside = readyListMarkup(model.ready, teamId);
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
    phone: isPhone(),
  }));
}

/**
 * The overview of one of the coach's teams. Drawn at once from the state, the title taking the focus; again when
 * the table and the games come, if the coach is still here, whenever the games change while they are (a start,
 * a score sent), and when the width crosses 900px. The later draws patch the page, so the focus stays where the coach
 * has put it. What is typed in a desk's search takes the coach to the reference with it (`goSearch`).
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
  const offs = [
    onGamesChange(() => {
      held.games = false;
      draw();
    }),
    // The field, a tile or a list the coach was on may be gone with the other form, or hidden by it — the desk's
    // «Advance» on a phone, the phone's card on a desk, the fourth and fifth match on a phone (Review Focus 2, fix
    // round 1): a focus left on nothing goes to the title.
    onPhoneChange(() => drawKeepingFocus(view, draw, "h1")),
    wireRefSearch(view, { onQuery: goSearch }),
  ];
  onScreenLeave("team-overview", () => {
    here = false;
    for (const off of offs) off();
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

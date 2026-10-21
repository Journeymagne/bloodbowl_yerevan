/**
 * What the «Matches» tab says of a team (`#/t/:id/matches`, stage 09a decisions 1–9), with no DOM: the match on as a
 * card, the season's results, what comes later in the season, and the failures to say. A phone draws it as
 * Matches.html; a desk as DeskSeason.html without the table (the owner's M2 answer 1).
 *
 * The card's match is the SideNav card's and the board's (`currentMatch`): in play, else the round's next, else a score
 * sent. Its phase says more than theirs (`MATCH_PHASES`, decision 2): a match not begun is `idle`, or `preparing` once
 * its preparation is open; one on is `live`, or `post` once its post-match is opened; a score waiting is `sent`. What it
 * offers is `matchActions`' words and ways; its tiles, the line of who is out and the bubbles are «Before the match»'s
 * (`beforeFigures`), from the same preview as the sheet. A card is drawn whenever there is a match on, in the table or
 * not (pre-flight L9: a friendly in the off-season keeps its records and post-match).
 *
 * The results and the calendar are the season's as the board reads it (`seasonResults`, pre-flight L13). «Later in the
 * season» lists the team's other open matches first (the owner's M2 answer 3: a friendly accepted beside the league's
 * match), then the next round, whose opponent the Swiss pairing gives once the round is in.
 *
 * A desk's page is the season's (DeskSeason.html, until stage 10 without its table): its line («Mock Season · teams: 4 ·
 * after round 2»), the board paging through the team's matches (`bandBoard`, as the overview's), and the calendar — the
 * played matches, the one on and the next round.
 *
 * Nothing is said that a read not answered yet could contradict: without the games no card, no result and no round to
 * come; without the table no call to enter the season.
 */
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, playerTeamUrl, postMatchUrl, preMatchUrl } from "../../core/routes.mjs";
import { resultLabels } from "../../ui/result-pill.mjs";
import { gameOutcome, gameSides, seasonRecord, standingOf } from "../../data/team-record.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { matchRecords } from "../../domain/match/preview.mjs";
import { currentMatch, matchActions, sentScore, subLine } from "../../shell/current-match.mjs";
import { beforeFigures } from "./before.mjs";
import { bandBoard, bandItems, previewFor, seasonResults } from "./band.mjs";

/** The phases of the match on, as the card says them (decision 2). */
export const MATCH_PHASES = Object.freeze(["idle", "preparing", "live", "post", "sent"]);

/** What a figure says while it is not known: a dash, never a zero the answer could contradict. */
const UNREAD = "–";

/**
 * The card's phase of a match `currentMatch` gave: its own three, told apart further by the preparation's status (open,
 * or ready) and the post-match's (opened).
 * @param {{game: object, phase: "live"|"idle"|"sent"}} current
 * @returns {typeof MATCH_PHASES[number]}
 */
export function phaseOf({ game, phase }) {
  if (phase === "sent") return "sent";
  if (phase === "live") return (game.postMatchStatus ?? "not_started") === "not_started" ? "live" : "post";
  return game.preparationStatus === "preparing" || game.preparationStatus === "ready" ? "preparing" : "idle";
}

/** «Human · 2-е»: a side's race and place, as a phone's card and board say them; what is not known is left out. */
function sideLine(team, seasonData) {
  const rank = standingOf(seasonData, team?.id)?.rank;
  return [raceTeamOf(team?.baseTeamSlug)?.title, rank ? t("teamOverview.opponentPlace", { place: rank }) : ""].filter(Boolean).join(" · ");
}

/** The address of a side's team: its coach's public page; "" when the server names neither. */
const teamHrefOf = (side) => (side?.user?.id && side?.team?.id ? playerTeamUrl(side.user.id, side.team.id) : "");

/**
 * The tiles of a match not sent (decision 4): both CTVs and the inducements' tile, from «Before the match». Until the
 * preview can be made both CTVs are a dash and the tile is closed — with why, when the opponent's team could not be read.
 */
function tilesOf(preview, opponent) {
  if (preview) {
    return { own: formatMoney(preview.own.ctv), other: formatMoney(preview.other.ctv), before: beforeFigures(preview).tile, reason: "" };
  }
  const reason = opponent?.error ? t("matches.before.unread", { reason: opponent.error }) : "";
  return { own: UNREAD, other: UNREAD, before: null, reason };
}

/** The head over the card: what the match is to the team now. */
function headOf(phase, friendly) {
  if (phase === "sent") return "sent";
  if (phase === "live" || phase === "post") return "live";
  return friendly ? "friendly" : "next";
}

/**
 * The card of the match on (decisions 2, 4–6).
 * @param {{current: NonNullable<ReturnType<typeof currentMatch>>, team: object, seasonData: object|null, preview: object|null,
 *   opponent: {team: object}|{error: string}|null, records: {events: object[]}|{error: string}|null}} input
 */
function cardOf({ current, team, seasonData, preview, opponent, records }) {
  const { game } = current;
  const sides = gameSides(game, team.id);
  const rival = game[sides.other];
  const phase = phaseOf(current);
  const friendly = game.kind === "friendly";
  const playing = phase === "live" || phase === "post";
  const { links, sentLine } = matchActions(current, team.id);
  const confirm = links.find((link) => link.kind === "primary" && phase === "sent");
  return {
    gameId: game.id,
    phase,
    head: headOf(phase, friendly),
    meta: { left: friendly ? t("matches.offTable") : subLine(game, sides.own), right: "" },
    own: { name: team.name, sub: sideLine(team, seasonData) },
    other: { name: rival.team?.name ?? "", sub: sideLine(rival.team, seasonData), href: teamHrefOf(rival) },
    score: phase === "sent" ? sentScore(game, sides, " : ") : "",
    tiles: phase === "sent" ? null : tilesOf(preview, opponent),
    miss: (phase === "idle" || phase === "preparing") && preview ? beforeFigures(preview).miss : null,
    friendly,
    records: playing && records?.events ? matchRecords(records.events, game.id) : null,
    recordsError: playing && records?.error ? records.error : "",
    sent: phase === "sent" ? { line: sentLine, waitingFor: confirm ? "" : rival.team?.name ?? "", confirmHref: confirm?.href ?? "" } : null,
    links,
  };
}

/**
 * A result as a phone's row says it (Matches.html): the row leads to the match, as the overview's rows do (spec §3,
 * parked 8 of the fix wave), the opponent over «Round 6 · Orc · CAS 3–1» with the race as text, «MVP: Gruk» when the
 * team picked one, the score. Its square is how the match ended for the team, a friendly's too (В/Н/П in the result's
 * colour, as Matches.html's: the friendly says so in its line); the desk's calendar keeps the friendly's «F».
 * @param {ReturnType<typeof seasonResults>[number]} result
 * @param {string} teamId
 */
function resultRow(result, teamId) {
  const word = result.friendly ? t("ui.result.tName") : t("matches.before.round", { round: result.round });
  const line = [word, raceTeamOf(result.opponentRace)?.title, t("matches.band.cas", { cas: result.cas })].filter(Boolean).join(" · ");
  return {
    gameId: result.gameId, result: result.friendly ? gameOutcome(result.game, teamId) ?? result.result : result.result, opponent: result.opponent,
    href: gameUrl(result.gameId), line, mvp: result.mvps.length ? t("matches.mvp", { names: result.mvps.join(", ") }) : "", score: result.score,
  };
}

/** Where an open match leads: its post-match while it is on, the game while a score waits, else its preparation. */
function openHref(game, phase) {
  if (phase === "live" || phase === "post") return postMatchUrl(game);
  return phase === "sent" ? gameUrl(game) : preMatchUrl(game);
}

/** The order of the other open matches: one on first, then one being prepared, one not begun, a score waiting. */
const URGENCY = ["live", "post", "preparing", "idle", "sent"];

/**
 * The team's other open matches, not the card's (the owner's M2 answer 3): each one the card would show if it were
 * alone, the most urgent phase first. A friendly says so before its opponent.
 */
function othersOf(games, teamId, shownId) {
  const rows = [];
  for (const game of games) {
    const open = game.id !== shownId && currentMatch([game], teamId);
    if (!open) continue;
    const phase = phaseOf(open);
    const rival = game[gameSides(game, teamId).other].team?.name ?? "";
    const friendly = game.kind === "friendly";
    rows.push({ key: game.id, label: friendly ? "" : t("matches.before.round", { round: game.roundNumber }),
      title: friendly ? t("matches.otherFriendly", { opponent: rival }) : rival, note: t(`matches.status.${phase}`), href: openHref(game, phase), phase });
  }
  return rows.sort((one, other) => URGENCY.indexOf(one.phase) - URGENCY.indexOf(other.phase));
}

/** The season's round on, as a number; null without one. */
const roundOn = (seasonData) => (Number.isInteger(Number(seasonData?.season?.currentRound)) && seasonData?.season?.currentRound ? Number(seasonData.season.currentRound) : null);

/** The team in the table has no match of the round on (a bye, a late entry): the card's place says so. */
function pendingOf(games, team, seasonData, current) {
  const round = roundOn(seasonData);
  if (current || !round) return null;
  const seasonId = seasonData.season.id;
  const ofRound = games.some((game) => game.kind === "league" && game.season?.id === seasonId && game.roundNumber === round && gameSides(game, team.id));
  return ofRound ? null : round;
}

/**
 * «Mock Season · teams: 10 · after round 6» (DeskSeason.html): the season, how many teams its table has, and the last
 * round over — by the rounds the season names, else the one before the round on; without one over, the first two alone.
 */
function seasonLineOf(seasonData) {
  const season = seasonData?.season;
  if (!season?.name) return "";
  const teams = Array.isArray(seasonData.standings) ? seasonData.standings.length : 0;
  const over = Array.isArray(seasonData.rounds)
    ? Math.max(0, ...seasonData.rounds.filter((each) => each.status === "completed").map((each) => Number(each.roundNumber) || 0))
    : Math.max(0, (roundOn(seasonData) ?? 1) - 1);
  return over ? t("matches.seasonLine", { season: season.name, teams, round: over }) : t("matches.seasonLineStart", { season: season.name, teams });
}

/** The calendar's word of a match: «Round 3», «Friendly». */
const roundWord = (game) => (game.kind === "friendly" ? t("ui.result.tName") : t("matches.before.round", { round: game.roundNumber }));

/** A side's opponent as the calendar names him: his team's name, leading to it when the server names its coach and team. */
const opponentRef = (rival) => ({ name: rival?.team?.name ?? "", href: teamHrefOf(rival) });

/**
 * @typedef {{key: string, square: {label: string, result: "w"|"d"|"l"|"t"|null, current: boolean, friendly: boolean},
 *   opponent: {name: string, href: string}|null, line: string, score: string, muted: boolean}} CalendarRow
 */

/** @returns {CalendarRow} a played match: its result's letter, «Round 1 · at home · CAS 2–0», the score from our side */
function playedRow(result, teamId) {
  const { game } = result;
  const sides = gameSides(game, teamId);
  const venue = result.friendly ? "matches.calendarFriendly" : sides.own === "home" ? "matches.calendarHome" : "matches.calendarAway";
  return { key: game.id, square: { label: resultLabels(result.result).letter, result: result.result, current: false, friendly: result.friendly },
    opponent: opponentRef(game[sides.other]), line: `${roundWord(game)} · ${t(venue, { cas: result.cas })}`, score: result.score, muted: false };
}

/** @returns {CalendarRow} the match on: «Round 3 · at home · next» (in play, awaiting confirmation…), the score sent */
function currentRow(current, teamId) {
  const { game } = current;
  const sides = gameSides(game, teamId);
  const friendly = game.kind === "friendly";
  const where = friendly ? "friendly" : sides.own;
  const state = t(`matches.calendarState.${phaseOf(current)}`);
  return { key: game.id, square: { label: friendly ? t("ui.result.t") : String(game.roundNumber), result: null, current: true, friendly },
    opponent: opponentRef(game[sides.other]), line: `${roundWord(game)} · ${t(`matches.calendarAt.${where}`, { state })}`,
    score: current.phase === "sent" ? sentScore(game, sides) || "—" : "—", muted: false };
}

/** @returns {CalendarRow} the next round: its opponent comes with the Swiss pairing once the round on is over */
const nextRow = (round) => ({ key: "next", square: { label: String(round), result: null, current: false, friendly: false },
  opponent: { name: t("teamOverview.opponentLater", { round: round - 1 }), href: "" },
  line: `${t("matches.before.round", { round })} · ${t("matches.calendarSwiss")}`, score: "—", muted: true });

/**
 * The calendar (DeskSeason.html): the season's played matches in the order they were settled, as the board pages them
 * (`seasonResults`; a team outside the table, every friendly), then the match on, then the next round.
 * @returns {CalendarRow[]}
 */
function calendarOf(games, teamId, seasonData, current, nextRound, sinceSeason) {
  const rows = seasonResults(games, teamId, seasonData, { sinceSeason }).reverse().map((result) => playedRow(result, teamId));
  if (current) rows.push(currentRow(current, teamId));
  if (nextRound) rows.push(nextRow(nextRound));
  return rows;
}

/**
 * A desk's board (DeskSeason.html): the season's band at the item the visit's key names (the current one for none, or
 * for one the games no longer hold), as the overview's (`bandBoard`); null outside the table with no match on.
 */
function deskBand({ list, team, raceTeam, seasonData, standing, current, preview, opponent, records, bandKey }) {
  if (!list || (!standing && !current)) return null;
  const items = bandItems(list, team.id, seasonData);
  if (!items.length) return null;
  const at = bandKey === null ? -1 : items.findIndex((item) => item.key === bandKey);
  const counted = current && records?.events ? matchRecords(records.events, current.game.id) : null;
  return bandBoard({ items, index: at === -1 ? null : at, games: list, team, raceTeam, seasonData, current, preview, opponent,
    records: counted, phone: false, gamesRead: true });
}

/** A read that failed, as the page says it: the table's when there is none to show, the games' when the team's matches need them. */
function failuresOf({ seasonData, seasonError, gamesError }) {
  const failures = [];
  if (seasonError && !seasonData) failures.push(t("teamOverview.seasonFailed", { reason: seasonError }));
  if (gamesError) failures.push(t("teamOverview.gamesFailed", { reason: gamesError }));
  return failures;
}

/**
 * What the matches page says of a team.
 *
 * @param {object} input
 * @param {object} input.team the saved team, as `/api/teams` sends it
 * @param {object|null} input.raceTeam the race's page in the reference
 * @param {object|null} input.seasonData `/api/season`'s answer; null while it is not read
 * @param {object[]|null} input.games `/api/games`'s; null while they are not read
 * @param {string} [input.gamesError] why the games could not be read
 * @param {string} [input.seasonError] why the table could not be read
 * @param {{team: object}|{error: string}|null} [input.opponent] the opponent of the match on, as his public page was read
 * @param {{events: object[]}|{error: string}|null} [input.records] the team's records, as last read
 * @param {object|null} [input.data] the reference, for «Before the match»
 * @param {boolean} [input.phone] the screen is a phone's (up to 900px)
 * @param {string|null} [input.bandKey] the item a desk's board shows, as the visit holds it; null for the current one
 */
export function matchesModel({ team, raceTeam = null, seasonData, games, gamesError = "", seasonError = "", opponent = null, records = null,
  data = null, phone = false, bandKey = null }) {
  const list = Array.isArray(games) && !gamesError ? games : null;
  const standing = standingOf(seasonData, team.id);
  const current = list && currentMatch(list, team.id);
  const preview = current ? previewFor({ team, current, opponent, data, teamId: team.id }) : null;
  const round = list && standing ? roundOn(seasonData) : null;
  return {
    teamId: team.id,
    phone,
    inSeason: Boolean(standing),
    seasonRead: Boolean(seasonData),
    gamesRead: Boolean(list),
    current: current ? cardOf({ current, team, seasonData, preview, opponent, records }) : null,
    pendingRound: list && standing ? pendingOf(list, team, seasonData, current) : null,
    results: list ? seasonResults(list, team.id, seasonData, { sinceSeason: Boolean(standing) }).map((result) => resultRow(result, team.id)) : [],
    record: list && standing ? seasonRecord(list, team.id, seasonData.season.id) : null,
    others: list ? othersOf(list, team.id, current?.game.id ?? null) : [],
    nextRound: round ? round + 1 : null,
    band: phone ? null : deskBand({ list, team, raceTeam, seasonData, standing, current, preview, opponent, records, bandKey }),
    calendar: list ? calendarOf(list, team.id, seasonData, current, round ? round + 1 : null, Boolean(standing)) : [],
    seasonLine: seasonLineOf(seasonData),
    failures: failuresOf({ seasonData, seasonError, gamesError }),
  };
}

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
 * Nothing is said that a read not answered yet could contradict: without the games no card, no result and no round to
 * come; without the table no call to enter the season.
 */
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl, playerTeamUrl, postMatchUrl, preMatchUrl } from "../../core/routes.mjs";
import { gameSides, seasonRecord, standingOf } from "../../data/team-record.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { matchRecords } from "../../domain/match/preview.mjs";
import { currentMatch, matchActions, sentScore, subLine } from "../../shell/current-match.mjs";
import { beforeFigures } from "./before.mjs";
import { previewFor, seasonResults } from "./band.mjs";

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
 * A result as a phone's row says it (Matches.html): the opponent leading to his team, «Round 6 · Orc · CAS 3–1» with
 * the race as text (pre-flight L14: the row is one link on a phone), «MVP: Gruk» when the team picked one, the score.
 * @param {ReturnType<typeof seasonResults>[number]} result
 */
function resultRow(result) {
  const word = result.friendly ? t("ui.result.tName") : t("matches.before.round", { round: result.round });
  const line = [word, raceTeamOf(result.opponentRace)?.title, t("matches.band.cas", { cas: result.cas })].filter(Boolean).join(" · ");
  return {
    gameId: result.gameId, result: result.result, opponent: result.opponent,
    href: result.opponentUserId && result.opponentTeamId ? playerTeamUrl(result.opponentUserId, result.opponentTeamId) : "", line, mvp: result.mvps.length ? t("matches.mvp", { names: result.mvps.join(", ") }) : "", score: result.score,
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
 */
export function matchesModel({ team, raceTeam = null, seasonData, games, gamesError = "", seasonError = "", opponent = null, records = null,
  data = null, phone = false }) {
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
    results: list ? seasonResults(list, team.id, seasonData).map(resultRow) : [],
    record: list && standing ? seasonRecord(list, team.id, seasonData.season.id) : null,
    others: list ? othersOf(list, team.id, current?.game.id ?? null) : [],
    nextRound: round ? round + 1 : null,
    band: null,
    failures: failuresOf({ seasonData, seasonError, gamesError }),
  };
}

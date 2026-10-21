/**
 * What an opponent's page says (`#/coaches/:uid/teams/:tid`; OppTeam.html, DeskOppTeam.html): a pure model over
 * what the server already sends — the coach's public team (`GET /api/players/:uid/teams/:tid`: `{user, team,
 * rolls}`), the league table (`/api/season`) and the looking coach's own games (`/api/games`). No endpoint of its
 * own: an opponent's page is put together on the client (design spec 3.0 §4). The screen is `team.mjs`.
 *
 * Where each figure comes from (decisions 16–21 of the stage 10 plan):
 * - the place, the record, the points, the differences and the form are the table's row of the team
 *   (`seasonTable`: the place and the points the server's, the rest the league pairings'); a team outside the
 *   table has none of them, only its value; while the table is not read they are a dash;
 * - the value is the roster's (`teamValue` by the race, as the season's board says it); a race the reference
 *   does not know has no value and no roster to show;
 * - «Next opponent» is the active team's match on (`currentMatch`) when its opponent is this team and no score
 *   is sent yet: «Round 7 · home» (matches have no dates); it leads to the active team's matches;
 * - «Our meeting» is the active team's last confirmed match against this team, from our side: its outcome
 *   (`gameOutcome`, a friendly's too), «Round 4 · away» or «Friendly», and the score, ours first;
 * - the coach and his Telegram are the public team's `user`; a contact the forms would refuse has no address;
 * - the roster is the lines «Состав» draws (`rosterLines`): those who miss the next match last, then by the SPP
 *   earned, then in the roster's order; TD and CAS are the roster's counters (a match on of the opponent's is
 *   his own to see); a skill an advancement or a god gave is marked. No career of an opponent's player is shown
 *   (stage 07e: his history answers its owner and an admin only), so the rows lead nowhere.
 * The way back is the table's: a phone's «Table» (`#/season`), a desk's «Season» of the active team, or the
 * league's table without one. One's own team at this address is no model's business: the screen sends the
 * coach to its overview (decision 23).
 */
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { pageUrl, playerUrl, seasonTabUrl, teamUrl } from "../../core/routes.mjs";
import { seasonTable, teamTableRow } from "../../data/season-table.mjs";
import { gameOutcome, gameSides, recentResults, teamInitials, teamValue } from "../../data/team-record.mjs";
import { raceTeamOf } from "../../data/teams.mjs";
import { telegramUrl } from "../../domain/account.mjs";
import { normalizeDraft } from "../../domain/roster/schema.mjs";
import { currentMatch, subLine } from "../../shell/current-match.mjs";
import { rosterLines } from "../team/roster/model.mjs";

/** What a figure of the table says while the table is not read: a dash, not a zero it could contradict. */
const UNREAD = "–";

/** A difference with its sign: «+1», «0», «−4» (a minus sign, not a hyphen). */
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/**
 * The tiles (decision 17): the value, «W · D · L», the points and «TD / CAS» differences — each word a phone's
 * (OppTeam.html) or a desk's (DeskOppTeam.html). Outside the table the value alone; a race the reference does not
 * know has no value; the table not read leaves its three a dash.
 * @param {import("../../data/season-table.mjs").TableRow|null} row @param {number|null} worth
 */
function tilesOf({ row, read, worth, phone }) {
  const value = worth === null ? [] : [{ label: t(phone ? "teamOverview.tile.value" : "opponent.tile.tv"), value: formatMoney(worth) }];
  if (read && !row) return value;
  const of = (figure) => (row ? figure(row) : UNREAD);
  return [...value,
    { label: t("opponent.tile.record"), value: of(({ wins, draws, losses }) => `${wins} · ${draws} · ${losses}`) },
    { label: t("opponent.tile.points"), value: of(({ points }) => String(points)) },
    { label: t(phone ? "teamOverview.tile.diff" : "teamOverview.tile.diffDesk"),
      value: of(({ touchdowns, conceded, casualties, suffered }) => `${signed(touchdowns - conceded)} / ${signed(casualties - suffered)}`) },
  ];
}

/** The active team's match on against this team, unless its score is sent: «Round 3 · home», leading to the active team's matches. */
function nextOf(games, activeTeamId, teamId) {
  const current = activeTeamId ? currentMatch(games, activeTeamId) : null;
  const sides = current && gameSides(current.game, activeTeamId);
  if (!sides || current.phase === "sent" || current.game[sides.other]?.team?.id !== teamId) return null;
  return { line: subLine(current.game, sides.own), href: teamUrl(activeTeamId, "matches") };
}

/** The active team's last confirmed match against this team, from our side (pre-flight L10): the outcome, the round or «Friendly», the score. */
function meetingOf(games, activeTeamId, teamId) {
  if (!activeTeamId) return null;
  const last = recentResults(games, activeTeamId, Infinity).find((result) => result.opponentTeamId === teamId);
  const game = last && games.find((item) => item.id === last.gameId);
  if (!game) return null;
  const line = game.kind === "friendly" ? t("teamOverview.friendly") : subLine(game, gameSides(game, activeTeamId).own);
  return { result: gameOutcome(game, activeTeamId), line, score: last.score };
}

/**
 * @typedef {{key: string, number: string, name: string, position: string, captain: boolean, out: boolean, line: string,
 *   touchdowns: number, casualties: number, spp: number, skills: {name: string, gained: boolean}[]}} SquadRow
 */

/**
 * The roster's rows (decision 19): who misses the next match last, then the most SPP first, a tie in the roster's order.
 * @param {import("../team/roster/model.mjs").PlayerLine[]} lines
 * @returns {SquadRow[]}
 */
function squadOf(lines) {
  return lines.map((line, at) => {
    const touchdowns = line.blob.touchdowns ?? 0, casualties = line.blob.casualties ?? 0;
    const words = { number: line.number, position: line.position };
    return {
      at, key: line.key, number: line.number, name: line.name, position: line.position, captain: line.captain, out: line.skip,
      line: line.skip ? t("opponent.out", words) : t("opponent.sub", { ...words, touchdowns, casualties }),
      touchdowns, casualties, spp: line.earned, skills: line.skills.map(({ name, gained }) => ({ name, gained })),
    };
  }).sort((one, other) => Number(one.out) - Number(other.out) || other.spp - one.spp || one.at - other.at)
    .map(({ at, ...row }) => row);
}

/**
 * What the opponent's page says of a coach's team.
 *
 * @param {object} input
 * @param {{id: string, login: string, telegram?: string}} input.user the coach, as the public team's answer names him
 * @param {object} input.team the public team (`publicSavedTeam`)
 * @param {object[]} [input.rolls] the team's used random-skill rolls, their dice' skills alone (stage 10, Task 1)
 * @param {object|null} input.seasonData `/api/season`; null while it is not read
 * @param {object[]} input.games the looking coach's games (`/api/games`); [] while they are not read
 * @param {string|null} [input.activeTeamId] the looking coach's active team: the next match, our meeting and a desk's way back are its
 * @param {boolean} [input.phone] OppTeam.html's words, not DeskOppTeam.html's
 */
export function opponentModel({ user, team, rolls = [], seasonData, games = [], activeTeamId = null, phone = false }) {
  const raceTeam = raceTeamOf(team.baseTeamSlug);
  const row = teamTableRow(seasonTable(seasonData), team.id);
  const lines = raceTeam ? rosterLines({ draft: normalizeDraft(team.roster ?? {}), race: raceTeam }) : [];
  const list = Array.isArray(games) ? games : [];
  return {
    userId: user.id,
    teamId: team.id,
    phone,
    name: team.name ?? "",
    initials: teamInitials(team.name),
    race: raceTeam ? { title: raceTeam.title, href: pageUrl(raceTeam) } : null,
    raceKnown: Boolean(raceTeam),
    place: row?.rank ?? null,
    coach: { login: user.login ?? "", href: playerUrl(user.id) },
    telegram: { handle: user.telegram ?? "", href: telegramUrl(user.telegram) },
    next: nextOf(list, activeTeamId, team.id),
    meeting: meetingOf(list, activeTeamId, team.id),
    tiles: tilesOf({ row, read: Boolean(seasonData), worth: raceTeam ? teamValue(team, raceTeam) : null, phone }),
    form: row?.form ?? [],
    squad: squadOf(lines),
    lines,
    rolls: Array.isArray(rolls) ? rolls : [],
    back: phone || !activeTeamId
      ? { label: t(phone ? "shell.tab.table" : "shell.side.season"), href: seasonTabUrl() }
      : { label: t("shell.side.season"), href: teamUrl(activeTeamId, "matches") },
  };
}

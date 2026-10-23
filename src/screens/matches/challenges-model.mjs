/**
 * What a team's friendlies say (stage 09c; Challenges.html, DeskChallenges.html, ChallengeSend.html,
 * ChallengeSendSearch.html, ChallengeAccept.html): the page, the sheet that challenges a coach and the sheet that
 * accepts a challenge. A pure model, no DOM, over what the server already sends — the coach's challenges and the
 * coaches he can challenge (`readChallenges`, data/challenges.mjs), his games (`/api/games`) and his own teams
 * (`state.myTeams`). Its text is plain: the page (challenges-view.mjs) and the sheets (challenges-sheets.mjs) escape it.
 *
 * The decisions of the stage 09c plan it carries:
 * - whose (2): the challenges sent to the coach are on the page of any of his teams; those he sent and those
 *   accepted are all of his, not only the page's team's — one sent with another team says which («with X»).
 *   «played N» counts the page's team's friendlies with a confirmed score (`gameOutcome`);
 * - the lines (4), parts joined by « · », newest first: one sent to the coach — the challenging team, on a phone
 *   its race too, «challenge yesterday» (a desk's «team · yesterday», as DeskChallenges.html); one he sent — the
 *   opponent's teams, the team it was sent with, «awaiting an answer · yesterday» (a desk's «awaiting · yesterday»).
 *   A day is «today», «yesterday» or its date by the reader's clock: no «2 days», which takes a plural, and no
 *   «challenged», a past tense with a gender (the owner's neutral words);
 * - accepted and the history (5): an accepted challenge whose match is among the coach's games and still on
 *   (`currentMatch`) is «Accepted», with what its match offers (`matchActions`, as the SideNav's card). One whose
 *   match is over, a declined and a cancelled one are the history, the freshest eight first (the owner's answer to
 *   question 2, as 2.x's «Recent responses»); the one played leads to its match. With the games not read an
 *   accepted challenge is in neither (pre-flight L25): whether its match is over is not known;
 * - the search (9): a part of the login or of the name of any of a coach's teams, whatever the case, the query
 *   trimmed (as the prototype's `factory`);
 * - recent opponents (10): up to three coaches of the coach's games (league and friendly, by when they last
 *   changed) and challenges (both ways, by when they were sent), the freshest first, only those who can be
 *   challenged; they are not among «the others»;
 * - the coach the chosen team has a challenge waiting with (11) is busy: he cannot be chosen, and one chosen
 *   becomes unchosen; another team may challenge him. The word is «Challenge sent», not «already challenged»
 *   (a participle with a gender);
 * - the team to challenge with (12) is the page's unless another is chosen; one team is a line, not a group;
 * - a coach the address names (13) who cannot be challenged — oneself, a coach with no team, an id the league
 *   does not know — is said;
 * - the accept sheet (14): the challenger and what was read of his team (its value, his Telegram); the coach's
 *   teams, each with its race, value and whether it is in the season — any of them may play; the page's by default.
 * The league keeps no limit of friendlies (the owner's answer to question 1): nothing here closes a team.
 */
import { formatDay, formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { gameUrl } from "../../core/routes.mjs";
import { gameOutcome, gameSides, teamValue } from "../../data/team-record.mjs";
import { raceTeamOf, raceTitleOf } from "../../data/teams.mjs";
import { currentMatch, matchActions } from "../../shell/current-match.mjs";
import { coachInitial } from "../../ui/coach-letter.mjs";

/** What the history says came of a challenge; each is the key `friendly.status.<kind>`. */
export const HISTORY_KINDS = ["declined", "cancelled", "played"];

/** How many challenges the history shows: 2.x's «Recent responses» showed eight. */
const HISTORY_LIMIT = 8;

/** The parts of a line, those that say something, joined. */
const joined = (parts) => parts.filter(Boolean).join(" · ");

/** A moment as a number to sort by; a missing or unreadable one is the oldest. */
const stamp = (moment) => Date.parse(moment) || 0;

/** A sort by a moment of each, the latest first. */
const latestFirst = (field) => (one, other) => stamp(other[field]) - stamp(one[field]);

/** The race of a team by its base team's slug; "" for none, or one the reference does not know. */
const raceOf = (slug) => (slug ? raceTitleOf(slug) : "");

/** «TV 1,050k» of a team, by its race; "" when the race is not known. */
function worthLine(team) {
  const worth = team ? teamValue(team, team.baseTeamSlug ? raceTeamOf(team.baseTeamSlug) : null) : null;
  return worth === null ? "" : t("friendly.tv", { worth: formatMoney(worth) });
}

/**
 * The day of a moment as the page says it: «today» or «yesterday» by the reader's own clock, otherwise its date
 * («19 Oct»); anything that is not a moment is the dash `formatDay` writes.
 *
 * @param {string|Date} moment @param {Date} [now]
 * @returns {string}
 */
export function dayWord(moment, now = new Date()) {
  const day = typeof moment === "string" || moment instanceof Date ? new Date(moment) : null;
  if (!day || Number.isNaN(day.getTime())) return formatDay(moment);
  if (day.toDateString() === now.toDateString()) return t("friendly.today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return day.toDateString() === yesterday.toDateString() ? t("friendly.yesterday") : formatDay(day);
}

/** A coach's teams by name: «Grimtusk Raiders · Iron Teeth»; "" for a coach sent without them (a server before stage 09c). */
export function teamsLine(opponent) {
  return Array.isArray(opponent?.teams) ? joined(opponent.teams.map((team) => team?.name ?? "")) : "";
}

/**
 * The coaches a query finds: a part of the login or of the name of any of his teams, whatever the case (in any
 * script: `toLocaleLowerCase`); the query without the spaces at its ends. A blank query finds everyone.
 *
 * @param {object[]} opponents @param {string} query
 * @returns {object[]} in the order they came
 */
export function matchOpponents(opponents, query) {
  const wanted = String(query ?? "").trim().toLocaleLowerCase();
  if (!wanted) return opponents;
  const holds = (name) => String(name ?? "").toLocaleLowerCase().includes(wanted);
  return opponents.filter((coach) => holds(coach.login) || (Array.isArray(coach.teams) && coach.teams.some((team) => holds(team?.name))));
}

/**
 * The coaches the coach met last (decision 10): the other side of each of his games (by when it last changed) and
 * of each challenge either way (by when it was sent), each coach by his latest; only those who can be challenged
 * (`opponents`); the freshest first. Games not read are none.
 *
 * @param {{games: object[]|null, challenges: object[], opponents: object[], viewerId: string, limit?: number}} input
 * @returns {string[]} the coaches' ids
 */
export function recentOpponents({ games, challenges, opponents, viewerId, limit = 3 }) {
  const latest = new Map();
  const met = (id, moment) => {
    if (id && id !== viewerId) latest.set(id, Math.max(latest.get(id) ?? 0, stamp(moment)));
  };
  for (const game of games ?? []) {
    if (game?.home?.user?.id === viewerId) met(game.away?.user?.id, game.updatedAt);
    else if (game?.away?.user?.id === viewerId) met(game.home?.user?.id, game.updatedAt);
  }
  for (const challenge of challenges ?? []) {
    met(challenge.sender?.id === viewerId ? challenge.recipient?.id : challenge.sender?.id, challenge.createdAt);
  }
  const offered = new Set(opponents.map(({ id }) => id));
  return [...latest].filter(([id]) => offered.has(id)).sort((one, other) => other[1] - one[1]).slice(0, limit).map(([id]) => id);
}

/**
 * The coaches the team has a challenge waiting with (decision 11): those the coach sent one with this team and
 * nobody has answered yet. The server refuses another (`CHALLENGE_ALREADY_SENT`).
 *
 * @param {object[]} challenges @param {string} viewerId @param {string} teamId
 * @returns {Set<string>}
 */
export function busyRecipients(challenges, viewerId, teamId) {
  return new Set((challenges ?? [])
    .filter((challenge) => challenge.status === "pending" && challenge.sender?.id === viewerId && challenge.team?.id === teamId)
    .map((challenge) => challenge.recipient?.id));
}

/** How many friendlies the team has played: those with a confirmed score. */
export function friendliesPlayed(games, teamId) {
  return (games ?? []).filter((game) => game?.kind === "friendly" && gameOutcome(game, teamId) !== null).length;
}

/** The name of one of the coach's teams: his list's, or the one the challenge was sent with. */
const ownName = (teams, team) => teams.find(({ id }) => id === team?.id)?.name ?? team?.name ?? "";

/** A challenge sent to the coach: the challenging team, on a phone its race, and when. */
function incomingRow(challenge, { phone, now }) {
  const team = challenge.team ?? {};
  const when = dayWord(challenge.createdAt, now);
  const line = phone ? joined([team.name, raceOf(team.baseTeamSlug), t("friendly.challengedWhen", { when })]) : joined([team.name, when]);
  return { id: challenge.id, login: challenge.sender?.login ?? "", initial: coachInitial(challenge.sender?.login), line };
}

/** A challenge the coach sent: the opponent's teams, the team it was sent with when not the page's, and since when it waits. */
function outgoingRow(challenge, { opponents, teams, teamId, phone, now }) {
  const opponent = opponents.find(({ id }) => id === challenge.recipient?.id);
  const other = challenge.team?.id === teamId ? "" : t("friendly.withTeam", { team: ownName(teams, challenge.team) });
  const when = dayWord(challenge.createdAt, now);
  const waiting = phone ? t("friendly.waitingWhen", { when }) : t("friendly.waitingWhenDesk", { when });
  const login = challenge.recipient?.login ?? "";
  return { id: challenge.id, login, initial: coachInitial(login), line: joined([teamsLine(opponent), other, waiting]) };
}

/** The coach's team in a game: the side whose coach he is; null when he is neither. */
function ownTeamIn(game, viewerId) {
  if (game?.home?.user?.id === viewerId) return game.home.team?.id ?? null;
  if (game?.away?.user?.id === viewerId) return game.away.team?.id ?? null;
  return null;
}

/** A challenge answered or played, for the history: the other coach, the team it was sent with, what came of it, and when. */
function historyRow(challenge, kind, href, { viewerId, teams, now }) {
  const sent = challenge.sender?.id === viewerId;
  const coach = sent ? challenge.recipient : challenge.sender;
  const team = sent ? t("friendly.withTeam", { team: ownName(teams, challenge.team) }) : challenge.team?.name;
  return { id: challenge.id, line: joined([coach?.login, team, t(`friendly.status.${kind}`), dayWord(challenge.updatedAt, now)]), href };
}

/**
 * The accepted challenges whose match is on, and the history (decision 5), each the latest answered first.
 * `games` null — not read — leaves the accepted ones out of both.
 */
function settledOf(challenges, games, context) {
  const accepted = [], history = [];
  for (const challenge of [...challenges].sort(latestFirst("updatedAt"))) {
    if (challenge.status === "declined" || challenge.status === "cancelled") {
      history.push(historyRow(challenge, challenge.status, "", context));
      continue;
    }
    const game = challenge.status === "accepted" && games ? games.find(({ id }) => id === challenge.gameId) : null;
    const ownTeamId = ownTeamIn(game, context.viewerId);
    const sides = ownTeamId && gameSides(game, ownTeamId);
    if (!sides) continue;
    const current = currentMatch([game], ownTeamId);
    if (!current) {
      history.push(historyRow(challenge, "played", gameUrl(game), context));
      continue;
    }
    const { links, sentLine } = matchActions(current, ownTeamId);
    accepted.push({ id: challenge.id, gameId: game.id, own: game[sides.own].team?.name ?? "", other: game[sides.other].team?.name ?? "",
      when: t("friendly.acceptedWhen", { when: dayWord(challenge.updatedAt, context.now) }), links, sentLine });
  }
  return { accepted, history: history.slice(0, HISTORY_LIMIT) };
}

/**
 * @typedef {{id: string, login: string, initial: string, line: string}} ChallengeRow
 * @typedef {{teamId: string, phone: boolean, read: boolean, unread: boolean, played: string, failures: string[],
 *   incoming: ChallengeRow[], outgoing: ChallengeRow[],
 *   accepted: {id: string, gameId: string, own: string, other: string, when: string,
 *     links: {label: string, href: string, kind: "primary"|"light"|"text"}[], sentLine: string}[],
 *   history: {id: string, line: string, href: string}[], empty: boolean}} PageModel
 */

/**
 * The page (decisions 2–5). The challenges are drawn once read, and not while a read of them failed: what the
 * page would say is from before; the failure is said with its reason (`unread`: the page offers to read again; not
 * read and not `unread` is still on its way). The games not read (null, or a read that failed: `gamesError`) leave
 * out «Accepted» and «played», and say why. `empty` — the challenges read, and none.
 *
 * @param {{payload: {challenges: object[], opponents: object[]}|null, readError?: string, games?: object[]|null,
 *   gamesError?: string, teamId: string, viewerId: string, teams?: object[], now?: Date, phone?: boolean}} input
 * @returns {PageModel}
 */
export function challengesModel({ payload, readError = "", games = null, gamesError = "", teamId, viewerId, teams = [], now = new Date(), phone = false }) {
  const read = Boolean(payload) && !readError;
  const challenges = read && Array.isArray(payload.challenges) ? payload.challenges : [];
  const opponents = read && Array.isArray(payload.opponents) ? payload.opponents : [];
  const known = Array.isArray(games) && !gamesError ? games : null;
  const waiting = challenges.filter((challenge) => challenge.status === "pending").sort(latestFirst("createdAt"));
  const context = { opponents, teams, teamId, viewerId, phone, now };
  const { accepted, history } = settledOf(challenges, known, context);
  return {
    teamId, phone, read, unread: Boolean(readError),
    played: known ? t("friendly.played", { count: friendliesPlayed(known, teamId) }) : "",
    failures: [readError && t("friendly.unread", { reason: readError }), gamesError && t("teamOverview.gamesFailed", { reason: gamesError })].filter(Boolean),
    incoming: waiting.filter((challenge) => challenge.recipient?.id === viewerId).map((challenge) => incomingRow(challenge, context)),
    outgoing: waiting.filter((challenge) => challenge.sender?.id === viewerId).map((challenge) => outgoingRow(challenge, context)),
    accepted, history,
    empty: read && challenges.length === 0,
  };
}

/**
 * @typedef {{id: string, login: string, initial: string, line: string, busy: boolean, checked: boolean}} Row
 * @typedef {{query: string, searching: boolean, recent: Row[], rows: Row[], listLabel: string, nobody: boolean,
 *   single: string, teams: {id: string, name: string, checked: boolean}[], teamId: string, chosen: Row|null,
 *   note: string, summary: string, cta: {label: string, disabled: boolean}}} SendModel
 */

/**
 * The sheet that challenges a coach (decisions 9–13). The team is the one chosen (`teamChoice`), or the page's;
 * the coach chosen (`chosenId`) is chosen only while he can be: offered and not busy with that team. While a
 * query is typed «Recent opponents» are not shown and every coach it finds is listed; without one the others
 * follow the recent ones. `presetId` is the coach the address named: one not offered is said (`note`).
 *
 * @param {{payload: {challenges: object[], opponents: object[]}|null, games?: object[]|null, teams?: object[],
 *   teamId: string, viewerId: string, query?: string, chosenId?: string, teamChoice?: string, presetId?: string}} input
 * @returns {SendModel}
 */
export function sendModel({ payload, games = null, teams = [], teamId, viewerId, query = "", chosenId = "", teamChoice = "", presetId = "" }) {
  const challenges = Array.isArray(payload?.challenges) ? payload.challenges : [];
  const opponents = Array.isArray(payload?.opponents) ? payload.opponents : [];
  const own = teams.find(({ id }) => id === teamChoice) ?? teams.find(({ id }) => id === teamId) ?? null;
  const ownId = own?.id ?? teamId;
  const busy = busyRecipients(challenges, viewerId, ownId);
  const pick = opponents.find(({ id }) => id === chosenId && !busy.has(id)) ?? null;
  const row = (coach) => ({ id: coach.id, login: coach.login ?? "", initial: coachInitial(coach.login), line: teamsLine(coach),
    busy: busy.has(coach.id), checked: coach.id === pick?.id });
  const searching = String(query ?? "").trim() !== "";
  const recentIds = searching ? [] : recentOpponents({ games, challenges, opponents, viewerId });
  const recent = recentIds.map((id) => row(opponents.find((coach) => coach.id === id)));
  const rows = (searching ? matchOpponents(opponents, query) : opponents.filter(({ id }) => !recentIds.includes(id))).map(row);
  const chosen = pick && row(pick);
  return {
    query: String(query ?? ""), searching, recent, rows,
    listLabel: searching ? t("friendly.found", { count: rows.length }) : t("friendly.others", { count: rows.length }),
    nobody: recent.length === 0 && rows.length === 0,
    single: teams.length === 1 ? t("friendly.oneTeam", { team: teams[0].name ?? "" }) : "",
    teams: teams.length > 1 ? teams.map(({ id, name }) => ({ id, name: name ?? "", checked: id === ownId })) : [],
    teamId: ownId,
    chosen,
    note: presetId && !opponents.some(({ id }) => id === presetId) ? t("friendly.unknownCoach") : "",
    summary: chosen ? t("friendly.summary", { login: chosen.login, team: own?.name ?? "" }) : t("friendly.summaryNone"),
    cta: chosen ? { label: t("friendly.challenge", { login: chosen.login }), disabled: false } : { label: t("friendly.choose"), disabled: true },
  };
}

/**
 * @typedef {{id: string, login: string, initial: string, title: string, line: string,
 *   options: {id: string, name: string, line: string, checked: boolean}[], chosenId: string,
 *   cta: {label: string, disabled: boolean}}} AcceptModel
 */

/**
 * The sheet that accepts a challenge (decision 14). The challenger's line is his team's race, and what was read of
 * the team (`readCoachTeam`: its value by its roster, his Telegram) once it is; while it is read, or when the read
 * failed, the race alone. The coach's teams are each a choice — any may play, one not in the season too — and the
 * one chosen is `choiceId` when it is his, otherwise the page's.
 *
 * @param {{challenge: object, sender?: {user: object, team: object}|{error: string}|null, teams?: object[], choiceId?: string, teamId: string}} input
 * @returns {AcceptModel}
 */
export function acceptModel({ challenge, sender = null, teams = [], choiceId = "", teamId }) {
  const team = challenge?.team ?? {};
  const login = challenge?.sender?.login ?? "";
  const known = sender && !sender.error && sender.team ? sender : null;
  const telegram = known?.user?.telegram ? t("friendly.telegram", { handle: known.user.telegram }) : "";
  const theirs = known && { ...known.team, baseTeamSlug: known.team.baseTeamSlug ?? team.baseTeamSlug };
  const chosenId = [choiceId, teamId].find((id) => teams.some((own) => own.id === id)) ?? teams[0]?.id ?? "";
  return {
    id: challenge?.id ?? "", login, initial: coachInitial(login),
    title: t("friendly.acceptWho", { login, team: team.name ?? "" }),
    line: joined([raceOf(team.baseTeamSlug), known ? worthLine(theirs) : "", telegram]),
    options: teams.map((own) => ({ id: own.id, name: own.name ?? "", checked: own.id === chosenId,
      line: joined([raceOf(own.baseTeamSlug), worthLine(own), own.inActiveSeason === true ? t("friendly.inSeason") : ""]) })),
    chosenId,
    cta: { label: t("friendly.acceptGo"), disabled: !chosenId },
  };
}

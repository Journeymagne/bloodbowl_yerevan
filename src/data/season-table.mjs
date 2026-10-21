/**
 * The league's table and its rounds, read from what `/api/season` already sends: no endpoint of its own
 * (design spec 3.0 §4). Functions only, no DOM and no `t()`: the pages that show the table (the league's
 * page, a desk's season, the overview's mini table) say it in their own words.
 *
 * Where each number comes from (decisions 1, 2 and 10 of the stage 10 plan):
 * - the place, the points and the games played are the server's (`standings`, `computeSeasonStandings`) as
 *   they are, the order too: the rows go by `rank`, the gap a withdrawn entry leaves included, and the
 *   client never sorts them again;
 * - wins, draws, losses, the touchdowns scored and conceded, the casualties caused and suffered, and the
 *   form come from `rounds[].pairings` by the server's own rule for a match that counts: a league pairing of
 *   a round `started` or `completed`, with both sides and the points of both. A bye counts in the server's
 *   games and points and in no result here (as `seasonDifference` of the overview: "a bye adds nothing"),
 *   so a team with a bye has one game more than its wins, draws and losses, and the touchdowns a bye was
 *   credited with are not among the scored ones shown (the server's tiebreak still counts them);
 * - a result is read by touchdowns, as `gameOutcome` reads a game: more is a win, as many a draw.
 *
 * The rounds are the league's calendar: the rounds under way or over, newest first, their pairings by table,
 * each side the season's entry (a withdrawn one too, from `historicalEntries`), the score once confirmed.
 */

/** The states of a round whose pairings count in the table and show in the calendar; a `draft` round is neither. */
export const ROUND_STATES = Object.freeze(["started", "completed"]);

/** How many results the form shows, the oldest first. */
const FORM_LENGTH = 5;

/** The number of a side's touchdowns or casualties, as the server counts it: none is 0. */
const amount = (value) => Number(value ?? 0) || 0;

/** The season's pairings that are in a round under way or over, each with its round's number. */
function roundPairings(seasonData) {
  return (seasonData?.rounds ?? [])
    .filter((round) => ROUND_STATES.includes(round.status))
    .flatMap((round) => (round.pairings ?? [])
      .filter((pairing) => ROUND_STATES.includes(pairing.roundStatus ?? round.status))
      .map((pairing) => ({ ...pairing, roundNumber: Number(pairing.roundNumber ?? round.roundNumber) })));
}

/** A pairing the table counts a result of: both sides, the points of both. */
const counts = (pairing) => Boolean(pairing.homeEntryId && pairing.awayEntryId) && pairing.homePoints != null && pairing.awayPoints != null;

/** How the match ended for one side, by touchdowns. */
function outcomeOf(own, other) {
  if (own === other) return "d";
  return own > other ? "w" : "l";
}

/**
 * Each entry's results from the pairings the table counts, by entry id.
 *
 * @returns {Map<string, {wins: number, draws: number, losses: number, touchdowns: number, conceded: number,
 *   casualties: number, suffered: number, results: {round: number, outcome: "w"|"d"|"l"}[]}>}
 */
function counted(seasonData) {
  const tally = new Map();
  const of = (entryId) => {
    if (!tally.has(entryId)) tally.set(entryId, { wins: 0, draws: 0, losses: 0, touchdowns: 0, conceded: 0, casualties: 0, suffered: 0, results: [] });
    return tally.get(entryId);
  };
  const field = { w: "wins", d: "draws", l: "losses" };
  for (const pairing of roundPairings(seasonData).filter(counts)) {
    for (const [own, other] of [["home", "away"], ["away", "home"]]) {
      const record = of(pairing[`${own}EntryId`]);
      const scored = amount(pairing[`${own}Touchdowns`]), against = amount(pairing[`${other}Touchdowns`]);
      const outcome = outcomeOf(scored, against);
      record[field[outcome]] += 1;
      record.touchdowns += scored;
      record.conceded += against;
      record.casualties += amount(pairing[`${own}Casualties`]);
      record.suffered += amount(pairing[`${other}Casualties`]);
      record.results.push({ round: pairing.roundNumber, outcome });
    }
  }
  return tally;
}

/**
 * @typedef {{rank: number, entryId: string, user: {id: string, login: string},
 *   team: {id: string, name: string, baseTeamSlug: string}, games: number, points: number,
 *   wins: number, draws: number, losses: number, touchdowns: number, conceded: number,
 *   casualties: number, suffered: number, form: ("w"|"d"|"l")[], withdrawn: boolean}} TableRow
 */

/**
 * The table: a row for each of the server's standings, in the order of its `rank`.
 *
 * @param {{standings?: object[], rounds?: object[]}|null|undefined} seasonData `/api/season`; null while nobody has read it
 * @returns {TableRow[]}
 */
export function seasonTable(seasonData) {
  const standings = Array.isArray(seasonData?.standings) ? seasonData.standings : [];
  if (!standings.length) return [];
  const tally = counted(seasonData);
  return [...standings].sort((first, second) => first.rank - second.rank).map((standing) => {
    const record = tally.get(standing.entryId);
    const form = (record?.results ?? []).sort((first, second) => first.round - second.round).slice(-FORM_LENGTH).map((result) => result.outcome);
    return {
      rank: standing.rank,
      entryId: standing.entryId,
      user: { id: standing.user?.id ?? "", login: standing.user?.login ?? "" },
      team: { id: standing.team?.id ?? "", name: standing.team?.name ?? "", baseTeamSlug: standing.team?.baseTeamSlug ?? "" },
      games: standing.games,
      points: standing.points,
      wins: record?.wins ?? 0,
      draws: record?.draws ?? 0,
      losses: record?.losses ?? 0,
      touchdowns: record?.touchdowns ?? 0,
      conceded: record?.conceded ?? 0,
      casualties: record?.casualties ?? 0,
      suffered: record?.suffered ?? 0,
      form,
      withdrawn: Boolean(standing.withdrawnAt),
    };
  });
}

/**
 * The team's row, unless its entry was withdrawn.
 *
 * @param {TableRow[]} rows
 * @returns {TableRow|null}
 */
export function teamTableRow(rows, teamId) {
  return rows.find((row) => row.team.id === teamId && !row.withdrawn) ?? null;
}

/**
 * The overview's few rows of the table: the first `size` without the withdrawn; a team below them takes the
 * last of those places, with its own rank.
 *
 * @param {TableRow[]} rows
 * @returns {TableRow[]}
 */
export function tableWindow(rows, teamId, size = 6) {
  const standing = rows.filter((row) => !row.withdrawn);
  const top = standing.slice(0, size);
  const own = teamTableRow(standing, teamId);
  if (!own || top.includes(own)) return top;
  return [...top.slice(0, size - 1), own];
}

/**
 * @typedef {{entryId: string, user: object, team: object, withdrawn: boolean}|null} RoundSide
 * @typedef {{id: string, table: number, home: RoundSide, away: RoundSide, score: [number, number]|null,
 *   casualties: [number, number]|null, waiting: "none"|"result"|"confirmation"|null}} RoundPairing
 */

/** The season's entry of a side, a withdrawn one too (as `pairingEntry` of the 2.x season). */
function sideOf(seasonData, entryId) {
  if (!entryId) return null;
  const entry = [...(seasonData?.entries ?? []), ...(seasonData?.historicalEntries ?? [])].find((item) => item.id === entryId);
  return entry ? { entryId, user: entry.user, team: entry.team, withdrawn: Boolean(entry.withdrawnAt) } : null;
}

/** What a pairing still waits for: nothing once confirmed, no result at all for a bye. */
function waitingOf(pairing, bye) {
  if (bye) return "none";
  if (pairing.resultStatus === "confirmed") return null;
  return pairing.resultStatus === "awaiting_confirmation" ? "confirmation" : "result";
}

/** A pairing of the calendar; null for one with neither side. A bye is its one side at home. */
function roundPairing(seasonData, pairing) {
  const sides = [sideOf(seasonData, pairing.homeEntryId), sideOf(seasonData, pairing.awayEntryId)];
  const [home, away] = sides[0] ? sides : [sides[1], null];
  if (!home) return null;
  const bye = !away;
  const confirmed = !bye && pairing.resultStatus === "confirmed";
  return {
    id: pairing.id,
    table: Number(pairing.tableNumber ?? 0),
    home,
    away,
    score: confirmed ? [amount(pairing.homeTouchdowns), amount(pairing.awayTouchdowns)] : null,
    casualties: confirmed ? [amount(pairing.homeCasualties), amount(pairing.awayCasualties)] : null,
    waiting: waitingOf(pairing, bye),
  };
}

/**
 * The league's rounds under way or over, the newest first, each with its pairings by table. A `draft`
 * round is not shown; a pairing with neither side is left out.
 *
 * @returns {{number: number, status: "started"|"completed", pairings: RoundPairing[]}[]}
 */
export function leagueRounds(seasonData) {
  return (seasonData?.rounds ?? [])
    .filter((round) => ROUND_STATES.includes(round.status))
    .sort((first, second) => second.roundNumber - first.roundNumber)
    .map((round) => ({
      number: round.roundNumber,
      status: round.status,
      pairings: [...(round.pairings ?? [])]
        .sort((first, second) => Number(first.tableNumber ?? 0) - Number(second.tableNumber ?? 0))
        .map((pairing) => roundPairing(seasonData, pairing))
        .filter(Boolean),
    }));
}

/**
 * The latest round that is over, as the guest's front page says it (`guestTable`); null when none is.
 *
 * @returns {number|null}
 */
export function lastRoundOver(seasonData) {
  const over = (seasonData?.rounds ?? []).filter((round) => round.status === "completed").map((round) => round.roundNumber);
  return over.length ? Math.max(...over) : null;
}

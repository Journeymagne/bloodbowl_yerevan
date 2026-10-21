/**
 * The mock API's season (stage 10): the league's table with its rounds, the league's other coaches and their public
 * teams. server/season/store.mjs (`loadSeasonBundle`) and server/routes/players.mjs are the reference.
 *
 *   GET /api/season                 «Mock Season» at round 3, ten entries: the coach's three teams in the season (t1–t3,
 *                                 `inActiveSeason`), the rival's three (rt1–rt3, u2), Narek's two (u3, @narek_bb) and
 *                                 Lilit's two (u4, @lilit_leaps), one of hers withdrawn after round 1 (in
 *                                 `historicalEntries`, its row kept). Rounds 1 and 2 are over, round 3 is on; t2 and t3
 *                                 entered late and play from round 3. Round 1 holds g4 (t1 2–1 rt2), round 2 g5 (rt3
 *                                 2–0 t1) and round 3 g1–g3, each as the coach's games have it now (score, casualties,
 *                                 a score sent); the other pairings are the league's own, their points `matchPoints`'.
 *                                 Rounds 2 and 3 have a bye, which no points have been given for. `standings` is
 *                                 `computeSeasonStandings` over these rows, as on the server: the rival's first team
 *                                 leads (6 points, two games, TD 4, CAS 2) and t1 has its 3 points, TD 2 and CAS 1 —
 *                                 its place is the one that makes (fourth), not the second it was before stage 10.
 *                                 `myEntry`, `currentFixture` and `myTeams` stay as the mock had them (none).
 *                                 MOCK_EMPTY=1: the league's seven entries and their own pairings, none of the coach's.
 *   GET /api/players/u2|u3|u4       `{user, teams}`: the coach (`publicAdminUser`: his teams' count) and his teams as
 *                                 summaries (`publicSavedTeamSummary`: no stage, no season flag — the server's query
 *                                 does not select them). The coach's own page is mock-api.mjs's (`answerPeople`).
 *   GET /api/players/u3|u4/teams/:tid   `{user, team, rolls}` (`publicUser`, `publicSavedTeam`, `publicTeamRoll`): Narek's
 *                                 first team has a captain, a player who misses the next match and one who took Wrestle
 *                                 with a site roll of two dice (Wrestle and Fend, `mock-roll-n1`); every other team has
 *                                 no rolls. Another coach's team under them is 404 TEAM_NOT_FOUND. The rival's teams
 *                                 are scripts/mock/matches.mjs's (stage 09a), asked first: they carry no `rolls`, which
 *                                 the client reads as none (pre-flight L27).
 *
 * Everything is made afresh on each request from the coach's games as they are: a write there is the table's too.
 */
import { publicSeasonEntry, publicSeasonPairing } from "../../server/api/serializers.mjs";
import { computeSeasonStandings } from "../../server/season/scoring.mjs";
import { matchPoints } from "../../src/domain/league-rules.mjs";

const STARTED = new Date().toISOString();
/** A stamp `days` before the mock started. */
const daysAgo = (days) => new Date(Date.parse(STARTED) - days * 86_400_000).toISOString();
/** As the games carry it (mock-api.mjs's `season`), with the table's stamps. */
const SEASON = { id: "s1", name: "Mock Season", status: "active", currentRound: 3, createdAt: daysAgo(30), updatedAt: STARTED };
/** The rival's teams, as mock-api.mjs's `rivals`: the sides of its games, here too when MOCK_EMPTY=1 leaves none. */
const RIVALS = [
  { id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" },
  { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" },
  { id: "rt3", name: "Rival Wardens", baseTeamSlug: "teams/lizardmen" },
];
const NAREK = { id: "u3", login: "narek", telegram: "@narek_bb", isAdmin: false, createdAt: "2025-03-14T09:00:00.000Z" };
const LILIT = { id: "u4", login: "lilit", telegram: "@lilit_leaps", isAdmin: false, createdAt: "2025-09-02T18:30:00.000Z" };

// ---- The public teams of the league's coaches ----------------------------------------------------------------------

/** A player of a roster; `changes` replace what a fresh recruit has. */
const playerOf = (idPrefix, number, rowIndex, name, changes = {}) => ({
  id: `${idPrefix}${number}`, rowIndex, number: String(number), name, statMods: {}, extraSkills: [], favouredSkills: [], spp: {}, advancements: [], ...changes,
});
/** A roster as the server keeps it; the counts are how many stand in each row of the race. */
const rosterOf = (teamSlug, teamName, players) => ({
  teamSlug, teamName, players, roster: players.reduce((counts, { rowIndex }) => ({ ...counts, [rowIndex]: (counts[rowIndex] ?? 0) + 1 }), {}),
  treasury: 60, coachesSafe: 0, teamRerolls: 2, startingRerolls: 2, purchasedStaff: {},
});
/** Seven: one of the race's fourth row, the captain, and six of its first. */
const sevenOf = (idPrefix, slug, name) => rosterOf(slug, name, [
  playerOf(idPrefix, 1, 3, `${name} One`, { isCaptain: true, spp: { touchdowns: 1 } }),
  ...[2, 3, 4, 5, 6, 7].map((number) => playerOf(idPrefix, number, 0, `${name} ${number}`)),
]);
// Ararat Lions (Human: 0 Lineman, 3 Blitzer): the captain, Sev who took Wrestle on a site roll, and Gor who misses the match.
const ARARAT = rosterOf("teams/human", "Ararat Lions", [
  playerOf("n", 1, 3, "Aram Vardanyan", { isCaptain: true, spp: { touchdowns: 3, casualties: 1 } }),
  playerOf("n", 2, 0, "Sev Petrosyan", {
    spp: { touchdowns: 2 }, extraSkills: [{ name: "Wrestle", access: "primary" }],
    advancements: [{ type: "random", grants: { skill: "Wrestle" }, roll: { id: "mock-roll-n1", via: "site" } }],
  }),
  playerOf("n", 3, 0, "Gor Hakobyan", { skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, spp: { casualties: 1 } }),
  playerOf("n", 4, 0, "Levon Sargsyan", { spp: { completions: 2 } }),
  playerOf("n", 5, 0, "Tigran Avetisyan"),
  playerOf("n", 6, 0, "Hayk Grigoryan"),
  playerOf("n", 7, 3, "Davit Mkrtchyan", { spp: { casualties: 2 } }),
]);
/** The league's other teams: whose, the team as `publicSavedTeam` sends it, its entry withdrawn or not, its used rolls. */
const LEAGUE = [
  { owner: NAREK, team: { id: "n1", name: "Ararat Lions", baseTeamSlug: "teams/human", roster: ARARAT },
    rolls: [{ id: "mock-roll-n1", playerId: "n2", purpose: "random_skill", result: { dice: [{ skill: "Wrestle" }, { skill: "Fend" }] } }] },
  { owner: NAREK, team: { id: "n2", name: "Sevan Raiders", baseTeamSlug: "teams/orc", roster: sevenOf("o", "teams/orc", "Sevan") } },
  { owner: LILIT, team: { id: "l1", name: "Silverbrook Rangers", baseTeamSlug: "teams/wood-elves", roster: sevenOf("w", "teams/wood-elves", "Silverbrook") } },
  { owner: LILIT, team: { id: "l2", name: "Mirefen Rotters", baseTeamSlug: "teams/nurgle", roster: sevenOf("m", "teams/nurgle", "Mirefen") }, withdrawn: daysAgo(10) },
];
/** A team as `publicSavedTeam` (server/api/serializers.mjs) sends it. */
const publicTeam = (team, withdrawn) => ({ logoData: null, revision: 1, stage: "active", activatedAt: null, inActiveSeason: !withdrawn,
  createdAt: daysAgo(40), updatedAt: daysAgo(3), ...team });
/** As `publicSavedTeamSummary` sends it from the coach's page: the columns that query selects. */
const summaryOf = ({ id, name, baseTeamSlug, roster }) => ({ id, name, baseTeamSlug, logoData: null, roster: roster ?? {}, createdAt: daysAgo(40), updatedAt: daysAgo(3) });

// ---- The season's rows, as the server reads them -------------------------------------------------------------------

/** A `season_entries` row joined with its coach and team (store.mjs `loadSeasonEntryRows`). */
const entryRow = (owner, team, withdrawn = null) => ({
  id: `e-${team.id}`, season_id: SEASON.id, withdrawn_at: withdrawn, created_at: daysAgo(30), updated_at: withdrawn ?? daysAgo(30),
  user_id: owner.id, user_login: owner.login, user_telegram: owner.telegram, user_is_admin: Boolean(owner.isAdmin),
  saved_team_id: team.id, team_name: team.name, base_team_slug: team.baseTeamSlug, team_created_at: daysAgo(40), team_updated_at: daysAgo(3),
});

/** The rounds' rows, a week apart; round 3 is the one on. */
const ROUNDS = [[1, "completed", 23], [2, "completed", 16], [3, "started", 9]].map(([number, status, days]) => ({ id: `r${number}`, number, status, days, at: daysAgo(days) }));

/** A pairing of the league's own, played three days into its round: its score, casualties and the league's points for both. */
function played(id, round, table, [home, away], [homeTd, awayTd], [homeCas, awayCas]) {
  const at = daysAgo(ROUNDS[round - 1].days - 3);
  return {
    id, round, table, home, away, homeTd, awayTd, homeCas, awayCas, status: "confirmed", at,
    homePoints: matchPoints({ touchdownsFor: homeTd, touchdownsAgainst: awayTd, casualtiesFor: homeCas }),
    awayPoints: matchPoints({ touchdownsFor: awayTd, touchdownsAgainst: homeTd, casualtiesFor: awayCas }),
  };
}
/** A pairing not played yet, or a bye (`away` null): no score, no points. */
const pending = (id, round, table, home, away = null) => ({ id, round, table, home, away, status: "pending" });

// The league's own pairings. Round 1: the rival's first team wins without a bonus (rt3 does not win: pre-flight L1);
// Lilit's withdrawn team plays its last match. Round 2: rt1 wins again, a draw, and Silverbrook's bye. Round 3: one
// match not played yet and Sevan's bye. Rounds 1 and 2 hold g4 and g5, round 3 g1–g3 (`fromGames`).
const OWN_PAIRINGS = [
  played("p1-2", 1, 2, ["rt1", "l2"], [2, 1], [1, 0]),
  played("p1-3", 1, 3, ["rt3", "n1"], [1, 1], [0, 0]),
  played("p1-4", 1, 4, ["n2", "l1"], [1, 0], [0, 1]),
  played("p2-2", 2, 2, ["rt1", "n1"], [2, 1], [1, 0]),
  played("p2-3", 2, 3, ["rt2", "n2"], [1, 1], [0, 0]),
  pending("p2-4", 2, 4, "l1"),
  pending("p3-4", 3, 4, "n1", "l1"),
  pending("p3-5", 3, 5, "n2"),
];
const ROUND_OF_GAME = { g4: 1, g5: 2, g1: 3, g2: 3, g3: 3 };

/** A `season_pairings` row joined with its round (store.mjs `loadSeasonPairingRows`), from a pairing of the league's own. */
function ownRow({ id, round, table, home, away, homeTd = null, awayTd = null, homeCas = null, awayCas = null, homePoints = null, awayPoints = null, status, at }) {
  const roundRow = ROUNDS[round - 1];
  return {
    id, round_id: roundRow.id, round_number: round, round_status: roundRow.status, table_number: table, match_kind: "league",
    home_entry_id: `e-${home}`, away_entry_id: away ? `e-${away}` : null, home_touchdowns: homeTd, away_touchdowns: awayTd,
    home_casualties: homeCas, away_casualties: awayCas, home_points: homePoints, away_points: awayPoints, result_status: status,
    preparation_status: status === "confirmed" ? "completed" : "not_started", post_match_status: status === "confirmed" ? "completed" : "not_started",
    proposed_by_user_id: null, proposed_home_touchdowns: null, proposed_away_touchdowns: null, proposed_home_casualties: null, proposed_away_casualties: null,
    proposed_at: null, confirmed_at: status === "confirmed" ? at : null, created_at: roundRow.at, updated_at: at ?? roundRow.at,
  };
}

/** The row of one of the coach's league games (g1–g5), as the game is now. */
const gameRow = (game) => ({
  id: game.id, round_id: `r${ROUND_OF_GAME[game.id]}`, round_number: ROUND_OF_GAME[game.id], round_status: ROUNDS[ROUND_OF_GAME[game.id] - 1].status,
  table_number: game.tableNumber, match_kind: "league", home_entry_id: `e-${game.home.team.id}`, away_entry_id: `e-${game.away.team.id}`,
  home_touchdowns: game.homeTouchdowns, away_touchdowns: game.awayTouchdowns, home_casualties: game.homeCasualties, away_casualties: game.awayCasualties,
  home_points: game.homePoints, away_points: game.awayPoints, result_status: game.resultStatus, preparation_status: game.preparationStatus,
  post_match_status: game.postMatchStatus, proposed_by_user_id: game.proposedByUserId, proposed_home_touchdowns: game.proposedHomeTouchdowns,
  proposed_away_touchdowns: game.proposedAwayTouchdowns, proposed_home_casualties: game.proposedHomeCasualties, proposed_away_casualties: game.proposedAwayCasualties,
  proposed_at: game.proposedAt, confirmed_at: game.confirmedAt, created_at: game.createdAt, updated_at: game.updatedAt,
});

/** The season's entries and pairings as rows: the coach's teams in the season, the rival's, the league's; their pairings. */
function seasonRows({ teams, games, user, rival }) {
  const own = teams.filter(({ inActiveSeason }) => inActiveSeason);
  const entryRows = [
    ...own.map((team) => entryRow(user, team)),
    ...RIVALS.map((team) => entryRow(rival, team)),
    ...LEAGUE.map(({ owner, team, withdrawn }) => entryRow(owner, team, withdrawn ?? null)),
  ];
  const known = new Set(entryRows.map(({ id }) => id));
  const listed = (row) => known.has(row.home_entry_id) && (!row.away_entry_id || known.has(row.away_entry_id));
  const pairingRows = [
    ...games.filter(({ id }) => Object.hasOwn(ROUND_OF_GAME, id)).map(gameRow),
    ...OWN_PAIRINGS.map(ownRow),
  ].filter(listed).sort((one, other) => one.round_number - other.round_number || one.table_number - other.table_number);
  return { entryRows, pairingRows };
}

/** `GET /api/season` (store.mjs `loadSeasonBundle`) for a signed-in coach: contacts included. */
function seasonBundle(mock) {
  const { entryRows, pairingRows } = seasonRows(mock);
  const allEntries = entryRows.map((row) => publicSeasonEntry(row));
  const pairings = pairingRows.map(publicSeasonPairing);
  return {
    season: SEASON,
    entries: allEntries.filter((entry) => !entry.withdrawnAt),
    historicalEntries: allEntries.filter((entry) => entry.withdrawnAt),
    standings: computeSeasonStandings(entryRows, pairingRows),
    rounds: ROUNDS.map(({ id, number, status, at }) => ({ id, seasonId: SEASON.id, roundNumber: number, status, createdAt: at, updatedAt: at,
      pairings: pairings.filter((pairing) => pairing.roundId === id) })),
    myEntry: null,
    currentFixture: null,
    myTeams: [],
  };
}

// ---- The coaches' pages -------------------------------------------------------------------------------------------

/** The league's coaches besides the signed-in one: who, and their teams as the season lists them. */
function coachesOf({ rival }) {
  return new Map([
    [rival.id, { user: rival, teams: RIVALS.map((team) => ({ team: { ...team, roster: {} }, rolls: [] })) }],
    ...[NAREK, LILIT].map((owner) => [owner.id, { user: owner, teams: LEAGUE.filter((item) => item.owner === owner) }]),
  ]);
}

const PLAYER_PAGE = /^\/api\/players\/([^/]+)$/;
const PLAYER_TEAM = /^\/api\/players\/([^/]+)\/teams\/([^/]+)$/;

/** `GET /api/players/:uid` of a coach of the league: the public fields and the count of his teams, his teams as summaries. */
function coachPage(found) {
  const { id, login, telegram, isAdmin, createdAt } = found.user;
  const user = { id, login, telegram, isAdmin, createdAt, savedTeamCount: found.teams.length, lastTeamUpdatedAt: daysAgo(3) };
  return { user, teams: found.teams.map(({ team }) => summaryOf(team)) };
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], games: object[], user: object, rival: object, reply: Function, refuse: Function}} mock the
 *   mock's lists, its coach and rival, and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerSeason(request, pathname, mock) {
  if (request.method !== "GET") return null;
  if (pathname === "/api/season") return mock.reply(seasonBundle(mock));
  const coaches = coachesOf(mock);
  const page = pathname.match(PLAYER_PAGE);
  if (page) {
    const found = coaches.get(decodeURIComponent(page[1]));
    return found ? mock.reply(coachPage(found)) : null;
  }
  const teamPage = pathname.match(PLAYER_TEAM);
  const [userId, teamId] = teamPage ? teamPage.slice(1).map(decodeURIComponent) : [];
  // The rival's teams are the matches' mock's (asked before this one); the coach's own are mock-api.mjs's.
  if (!teamPage || userId === mock.rival.id || !coaches.has(userId)) return null;
  const owned = coaches.get(userId).teams.find(({ team }) => team.id === teamId);
  if (!owned) return mock.refuse(404, "TEAM_NOT_FOUND");
  const { id, login, telegram, isAdmin, createdAt } = owned.owner;
  return mock.reply({ user: { id, login, telegram, isAdmin, createdAt }, team: publicTeam(owned.team, owned.withdrawn), rolls: owned.rolls ?? [] });
}

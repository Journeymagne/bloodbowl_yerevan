/**
 * The mock API's career of a player, what a phone's profile reads under «Career» (server/routes/player-history.mjs and
 * server/season/player-history.mjs are the reference, src/domain/post-match/history.mjs says what the rows mean).
 *
 *   GET /api/teams/:id/players/:pid/history  `{history: {playerId, matches, outside}}`: the team's matches, oldest
 *                                  first, each with what the player did in it (`played`, `source`, `counters`, `injury`,
 *                                  `pending`) and what the match was, from the team's side (`kind`, `seasonId`,
 *                                  `roundNumber`, `status`, `opponent: {teamId, name}`, `score: {own, opponent}`), and
 *                                  the player's edits outside a match, as sums. A team that is not there is 404
 *                                  TEAM_NOT_FOUND; a player id the team never had is an answer, as on the server: the
 *                                  matches without details (`played: null`, `source: "none"`, `counters: null`) and
 *                                  nothing outside.
 *
 * What it does not do: the season is not filtered — `?season=` is not read, so every match is listed whatever season is
 * asked, and a season that is no UUID is no 400 for `season`; anybody may read any team (on the server, the owner and an
 * administrator); `counters` and `outside` hold only the counters that are not nought (the server sends every one, the
 * noughts too, and a client reads one that is missing as nought); and the career is fixed: it follows neither the taps,
 * nor the saves of the roster, nor the matches the mock plays.
 *
 * Fixtures: Mock Team (t1) has three matches, as scripts/mock-api.mjs holds them — g4 (round 1, at home to Rival Raiders,
 * won 2–1), g5 (round 2, away to Rival Wardens, lost 0–2) and the friendly g6 against Rival Team (1–1), which the site has
 * no details of. Blitzer Three (p3, 7 touchdowns on the roster) scored 2 in g4, played g5 with no action, and has 5
 * touchdowns from edits outside a match, so his rows add up to his roster's line. Every other player of t1 has the three
 * matches without details and nothing outside: a veteran, all of whose SPP are from before the site's records. Every
 * other team has no match.
 */
const HISTORY = /^\/api\/teams\/([^/]+)\/players\/([^/]+)\/history$/;

/** Mock Team's matches from its own side, oldest first: scripts/mock-api.mjs' g4, g5 and g6. */
const MOCK_TEAM_MATCHES = [
  { pairingId: "g4", kind: "league", seasonId: "s1", roundNumber: 1, status: "confirmed", opponent: { teamId: "rt2", name: "Rival Raiders" }, score: { own: 2, opponent: 1 } },
  { pairingId: "g5", kind: "league", seasonId: "s1", roundNumber: 2, status: "confirmed", opponent: { teamId: "rt3", name: "Rival Wardens" }, score: { own: 0, opponent: 2 } },
  { pairingId: "g6", kind: "friendly", seasonId: null, roundNumber: null, status: "confirmed", opponent: { teamId: "rt1", name: "Rival Team" }, score: { own: 1, opponent: 1 } },
];

/** A match the site has no details of for the player: no roster of it says whether he played, and nothing was applied or tapped. */
const BARE = { played: null, source: "none", counters: null, injury: null, pending: false };

/** What Blitzer Three did, by match: two touchdowns in g4, as its post-match applied them, and g5 played with no action. */
const BLITZER_MATCHES = new Map([
  ["g4", { played: true, source: "applied", counters: { touchdowns: 2 }, injury: null, pending: false }],
  ["g5", { played: true, source: "applied", counters: {}, injury: null, pending: false }],
]);

/** The career of a player of the team `teamId` (see the header): t1's matches, his own rows in them, and his edits outside. */
function careerOf(teamId, playerId) {
  if (teamId !== "t1") return { playerId, matches: [], outside: {} };
  const own = playerId === "p3" ? BLITZER_MATCHES : new Map();
  return {
    playerId,
    matches: MOCK_TEAM_MATCHES.map(({ pairingId, ...match }) => ({ pairingId, ...(own.get(pairingId) ?? BARE), ...match })),
    outside: playerId === "p3" ? { touchdowns: 5 } : {},
  };
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], reply: Function, refuse: Function}} mock the mock's list of teams and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerHistory(request, pathname, mock) {
  const { teams, reply, refuse } = mock;
  const [, id, playerId] = (request.method === "GET" ? HISTORY.exec(pathname) : null) ?? [];
  if (!id) return null;
  if (!teams.some((item) => item.id === id)) return refuse(404, "TEAM_NOT_FOUND");
  return reply({ history: careerOf(id, playerId) });
}

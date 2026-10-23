/**
 * The mock API's career of a player, what «Career» reads — a phone's profile, a desk's panel, a fallen player's page
 * (server/routes/player-history.mjs and server/season/player-history.mjs are the reference,
 * src/domain/post-match/history.mjs says what the rows mean).
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
 * touchdowns from edits outside a match, so his rows add up to his roster's line. Linewoman Nine (p9, fallen f2,
 * scripts/mock/fallen.mjs) made a completion in g4 and died in g5 with no tap of hers: the post-match's side has the
 * death, and no roster after it has her (`source: "none"`, `counters: null`); g6 after it says nothing of her, and her
 * rows end at g5 (stage 07e, pre-flight L6). Every other player of t1 — Blitzer Ten (p10, fallen f1) among them — has
 * the three matches without details and nothing outside: a veteran, all of whose SPP are from before the site's records.
 *
 * Mock Humans (t2) has its match g2 on (round 3, at home to Rival Raiders, no score): its rows are what
 * scripts/mock/roster.mjs's records of it say — Blitzer Four's touchdown, Catcher Five's completion (and his
 * interception outside a match), Thrower Six's lasting injury (AG) — each waiting for the post-match; Lineman Two, who
 * skips the next game (scripts/mock/roster.mjs), misses it, as the server leaves him out of the match's roster
 * (src/domain/match/snapshot.mjs); the other three are on its roster with nothing tapped yet. Every other team has no
 * match.
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

/** What Linewoman Nine did, by match: a completion in g4, as its post-match applied it, and her death in g5 with no tap of hers. */
const LINEWOMAN_MATCHES = new Map([
  ["g4", { played: true, source: "applied", counters: { completions: 1 }, injury: null, pending: false }],
  ["g5", { played: true, source: "none", counters: null, injury: { code: "dead" }, pending: false }],
]);

/** Mock Humans' match on, from its own side: scripts/mock-api.mjs' g2, round 3 at home to the second rival, no score yet. */
const MOCK_HUMANS_MATCHES = [
  { pairingId: "g2", kind: "league", seasonId: "s1", roundNumber: 3, status: "in_progress", opponent: { teamId: "rt2", name: "Rival Raiders" }, score: null },
];

/** On the roster of the match on, with nothing tapped yet. */
const ON_ROSTER = { played: true, source: "none", counters: null, injury: null, pending: false };
/** Left out of the match's roster: he skips it (`skipNextGame`), so no tap of his can be made. */
const SKIPPED = { played: false, source: "none", counters: null, injury: null, pending: false };
/** A row of the match on that its taps make (scripts/mock/roster.mjs' records), waiting for the post-match. */
const tapped = (counters, injury = null) => new Map([["g2", { played: true, source: "events", counters, injury, pending: true }]]);
const HUMANS_ROWS = new Map([
  ["q1", new Map([["g2", ON_ROSTER]])], ["q2", new Map([["g2", SKIPPED]])], ["q3", new Map([["g2", ON_ROSTER]])],
  ["q4", tapped({ touchdowns: 1 })], ["q5", tapped({ completions: 1 })], ["q6", tapped({}, { code: "lasting", stat: "ag" })],
  ["q7", new Map([["g2", ON_ROSTER]])],
]);

/**
 * Each team's career: its matches, oldest first, each player's own rows in them (a match without a row of his has no
 * details), and his edits outside a match. The ids are quoted: check-references reads a bare `t1:` as a use of `t`.
 */
const CAREERS = new Map([
  ["t1", { matches: MOCK_TEAM_MATCHES, own: new Map([["p3", BLITZER_MATCHES], ["p9", LINEWOMAN_MATCHES]]), outside: new Map([["p3", { touchdowns: 5 }]]) }],
  ["t2", { matches: MOCK_HUMANS_MATCHES, own: HUMANS_ROWS, outside: new Map([["q5", { interceptions: 1 }]]) }],
]);

/** The career of a player of the team `teamId` (see the header): the team's matches, his own rows in them, and his edits outside. */
function careerOf(teamId, playerId) {
  const career = CAREERS.get(teamId);
  if (!career) return { playerId, matches: [], outside: {} };
  const own = career.own.get(playerId) ?? new Map();
  return {
    playerId,
    matches: career.matches.map(({ pairingId, ...match }) => ({ pairingId, ...(own.get(pairingId) ?? BARE), ...match })),
    outside: career.outside.get(playerId) ?? {},
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

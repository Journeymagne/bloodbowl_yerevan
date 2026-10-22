/**
 * The mock API's friendly challenges (stage 09c): the coach's challenges both ways, the coaches he can challenge with
 * their teams, and the writes. server/friendly/challenges.mjs and server/routes/challenges.mjs are the reference.
 *
 *   GET  /api/challenges            `{challenges, teams, opponents}` (`listChallenges`), the challenges newest first, one
 *                                 of each kind: c1 from the rival with Rival Raiders (rt2), waiting since yesterday —
 *                                 the mock's incoming come from the rival alone: `pairingOf` makes him the other side
 *                                 of a match, and his teams are the ones its preparation knows; c2 to lilit with Mock
 *                                 Team (t1), waiting two days; c3 from the rival with Rival Team (rt1), accepted today:
 *                                 g7, Mock Veterans' friendly in preparation; c4 to amazona with Mock Humans (t2),
 *                                 declined; c5 to frostulf with Mock Team, cancelled; c6 to the rival with Mock Team,
 *                                 accepted: g6, played. `teams` are the coach's (`publicSavedTeamSlim`), as they are
 *                                 now. `opponents` are twelve coaches by login, each with his teams newest first as
 *                                 `{id, name, baseTeamSlug}` and nothing else of them: the rival (u2), narek (u3) and
 *                                 lilit (u4) as scripts/mock/season.mjs has them, and nine more from the prototype
 *                                 (ChallengeSend), so that the list is as long as it draws it; rotfather has two teams.
 *   POST /api/challenges            `{opponentId, teamId}`, checked in the server's order: no coach or no team chosen 400
 *                                 CHALLENGE_SELECTION_REQUIRED (the ids are the mock's, not UUIDs: only an empty one is
 *                                 refused), oneself 400 CHALLENGE_SELF, a team not the coach's 404 TEAM_NOT_FOUND, a
 *                                 coach who is no opponent 404 CHALLENGE_OPPONENT_UNAVAILABLE, one waiting from that
 *                                 team to that coach 409 CHALLENGE_ALREADY_SENT; else 201 `{id}`: the next c<n>, waiting.
 *   POST /api/challenges/:id/accept|decline|cancel   as `respondToChallenge`: an id nobody has 404 CHALLENGE_NOT_FOUND;
 *                                 one the coach may not answer (a cancel is the sender's, the others the recipient's)
 *                                 403 CHALLENGE_NOT_YOURS; an accept again the same `{gameId}`; one no longer waiting
 *                                 409 CHALLENGE_CLOSED. An accept takes the team to play (none 400
 *                                 CHALLENGE_SELECTION_REQUIRED, not the coach's 404 TEAM_NOT_FOUND) and makes the
 *                                 friendly — the next g<n>, first in the games, the challenger at home as
 *                                 `acceptChallenge` makes it — answered `{gameId}`; a decline and a cancel `{gameId: null}`.
 *                                 Another method on these paths is 405 ROUTE_NOT_FOUND, as on the server.
 *   POST /api/mock/challenges/:case mock only: `empty` — no challenge (the coaches stay, so the sheet has whom to
 *                                 challenge); `reset` — as the mock started; `fail` — the list's read is 500
 *                                 SERVER_ERROR until another case is set. `empty` and `reset` take away the friendlies an
 *                                 accept made. Answers `{case}`; 400 FIELD_INVALID `case` for another word.
 *
 * MOCK_EMPTY=1 (`mock.empty`): no challenge and nobody to challenge, `reset` included. Everything is held in memory, for
 * each mock its own: a write lasts until the mock restarts or a case is set. An id, of a challenge or of a match, is not
 * given twice.
 */

const STARTED = new Date().toISOString();
/** A stamp `days` before the mock started; the days may be fractions. */
const daysAgo = (days) => new Date(Date.parse(STARTED) - days * 86_400_000).toISOString();

const CHALLENGES = "/api/challenges";
const ANSWER = /^\/api\/challenges\/([^/]+)\/(accept|decline|cancel)$/;
const MOCK_CASE = /^\/api\/mock\/challenges\/([^/]+)$/;
const CASES = new Set(["empty", "reset", "fail"]);
/** What an answer leaves a waiting challenge as. */
const ANSWERED = { accept: "accepted", decline: "declined", cancel: "cancelled" };

/** The rival's teams, as mock-api.mjs's `rivals` (and scripts/mock/season.mjs's `RIVALS`): the sides of his matches. */
const RIVAL_TEAMS = [
  { id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" },
  { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" },
  { id: "rt3", name: "Rival Wardens", baseTeamSlug: "teams/lizardmen" },
];
/**
 * The other coaches who can be challenged, each `[id, login, teams]`, a team `[id, name, race]` and the newest first.
 * Narek and Lilit as scripts/mock/season.mjs has them (it does not export them); the nine after them are the
 * prototype's (ChallengeSend), their races the mock's.
 */
const COACHES = [
  ["u3", "narek", [["n1", "Ararat Lions", "teams/human"], ["n2", "Sevan Raiders", "teams/orc"]]],
  ["u4", "lilit", [["l1", "Silverbrook Rangers", "teams/wood-elves"], ["l2", "Mirefen Rotters", "teams/nurgle"]]],
  ["u5", "amazona", [["am1", "Lustria Valkyries", "teams/amazon"]]],
  ["u6", "frostulf", [["fr1", "Frostfang Raiders", "teams/norse"]]],
  ["u7", "gutbag", [["gu1", "Cinderpeak Ash", "teams/chaos-dwarfs"]]],
  ["u8", "howler", [["ho1", "Bloodmoon Howlers", "teams/necromantic-horror"]]],
  ["u9", "lizardking", [["lz1", "Sotek's Chosen", "teams/lizardmen"]]],
  ["u10", "pharaoh_k", [["ph1", "Tombway Kings", "teams/tomb-kings"]]],
  ["u11", "rotfather", [["ro1", "Mirefen Rotters", "teams/nurgle"], ["ro2", "Plaguebearers", "teams/nurglings"]]],
  ["u12", "snotty", [["sn1", "Gobbo Wreckers", "teams/goblin"]]],
  ["u13", "squeak", [["sq1", "Ratwharf Gnawers", "teams/skaven"]]],
].map(([id, login, teams]) => ({ id, login, teams: teams.map(([teamId, name, baseTeamSlug]) => ({ id: teamId, name, baseTeamSlug })) }));

const coachOf = ({ id, login }) => ({ id, login });
const teamRef = ({ id, name, baseTeamSlug }) => ({ id, name, baseTeamSlug });
const coachNamed = (login) => coachOf(COACHES.find((item) => item.login === login));

/** A challenge as `listChallenges` sends it; answered `updatedAt`, else when it was sent. */
const challengeOf = (id, sender, recipient, team, status, gameId, createdAt, updatedAt = createdAt) => ({
  id, sender: coachOf(sender), recipient: coachOf(recipient), team: teamRef(team), status, gameId, createdAt, updatedAt,
});

/** The challenges the mock starts with: one of each kind (the header). */
function startingChallenges({ user, rival, teams }) {
  const own = (id) => teams.find((team) => team.id === id);
  return [
    challengeOf("c1", rival, user, RIVAL_TEAMS[1], "pending", null, daysAgo(1)),
    challengeOf("c2", user, coachNamed("lilit"), own("t1"), "pending", null, daysAgo(2)),
    challengeOf("c3", rival, user, RIVAL_TEAMS[0], "accepted", "g7", daysAgo(1.2), STARTED),
    challengeOf("c4", user, coachNamed("amazona"), own("t2"), "declined", null, daysAgo(4), daysAgo(3)),
    challengeOf("c5", user, coachNamed("frostulf"), own("t1"), "cancelled", null, daysAgo(6), daysAgo(5)),
    // Accepted when g6 was made (`pairingOf`'s stamp, 30 days ago); it has been played since.
    challengeOf("c6", user, rival, own("t1"), "accepted", "g6", daysAgo(31), daysAgo(30)),
  ];
}

/** Each mock's own: its challenges, whom its coach can challenge, the friendlies an accept made, the case `fail`. */
const states = new WeakMap();

function stateOf(mock) {
  if (!states.has(mock)) {
    const opponents = mock.empty ? [] : [{ ...coachOf(mock.rival), teams: RIVAL_TEAMS.map(teamRef) }, ...COACHES]
      .sort((a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));
    states.set(mock, { challenges: mock.empty ? [] : startingChallenges(mock), opponents, made: new Set(), failing: false, lastChallenge: 6, lastGame: 0 });
  }
  return states.get(mock);
}

/** `GET /api/challenges`: copies, so that what is answered is not the mock's own. */
function listOf(mock, state) {
  if (state.failing) return mock.refuse(500, "SERVER_ERROR");
  const challenges = [...state.challenges].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const teams = mock.teams.map(({ id, name, baseTeamSlug, createdAt, updatedAt }) => ({ id, name, baseTeamSlug, logoData: null, roster: {}, createdAt, updatedAt }));
  return mock.reply(structuredClone({ challenges, teams, opponents: state.opponents }));
}

/** An id as the body sends it; "" for none (the server's `challengeId` refuses it). */
const idIn = (value) => String(value || "");

/** `POST /api/challenges` (`createChallenge`), its refusals in the server's order. */
function sendOne(body, mock, state) {
  const opponentId = idIn(body.opponentId), teamId = idIn(body.teamId);
  if (!opponentId) return mock.refuse(400, "CHALLENGE_SELECTION_REQUIRED");
  if (opponentId === mock.user.id) return mock.refuse(400, "CHALLENGE_SELF");
  if (!teamId) return mock.refuse(400, "CHALLENGE_SELECTION_REQUIRED");
  const team = mock.teams.find((item) => item.id === teamId);
  if (!team) return mock.refuse(404, "TEAM_NOT_FOUND");
  const opponent = state.opponents.find((item) => item.id === opponentId);
  if (!opponent) return mock.refuse(404, "CHALLENGE_OPPONENT_UNAVAILABLE");
  const waiting = state.challenges.some((item) => item.status === "pending" && item.sender.id === mock.user.id
    && item.recipient.id === opponentId && item.team.id === teamId);
  if (waiting) return mock.refuse(409, "CHALLENGE_ALREADY_SENT");
  state.lastChallenge += 1;
  const stamp = new Date().toISOString();
  const made = challengeOf(`c${state.lastChallenge}`, mock.user, opponent, team, "pending", null, stamp);
  state.challenges.push(made);
  return mock.reply({ id: made.id }, 201);
}

/** The next match id: past every id in the games and every one given before (a match `reset` took away included). */
function nextGameId(mock, state) {
  const numbers = mock.games.map(({ id }) => Number(/^g(\d+)$/.exec(id)?.[1] ?? 0));
  state.lastGame = Math.max(state.lastGame, ...numbers) + 1;
  return `g${state.lastGame}`;
}

/** An accept (`acceptChallenge`): the coach's team, then the friendly, the challenger at home; null and a refusal when not. */
function acceptOne(challenge, body, mock, state) {
  const teamId = idIn(body.teamId);
  if (!teamId) return { refusal: mock.refuse(400, "CHALLENGE_SELECTION_REQUIRED") };
  const team = mock.teams.find((item) => item.id === teamId);
  if (!team) return { refusal: mock.refuse(404, "TEAM_NOT_FOUND") };
  const stamp = new Date().toISOString();
  const gameId = nextGameId(mock, state);
  mock.games.unshift(mock.pairingOf(gameId, 1, team, challenge.team, {
    kind: "friendly", season: null, roundId: null, roundNumber: 0, homeEntryId: null, awayEntryId: null, viewerIsHome: false, createdAt: stamp, updatedAt: stamp,
  }));
  state.made.add(gameId);
  return { gameId };
}

/** `POST /api/challenges/:id/<action>` (`respondToChallenge`, `checkChallengeAction`). */
function answerOne(id, action, body, mock, state) {
  const challenge = state.challenges.find((item) => item.id === id);
  if (!challenge) return mock.refuse(404, "CHALLENGE_NOT_FOUND");
  const allowed = action === "cancel" ? challenge.sender.id : challenge.recipient.id;
  if (allowed !== mock.user.id) return mock.refuse(403, "CHALLENGE_NOT_YOURS");
  if (challenge.status === "accepted" && action === "accept") return mock.reply({ gameId: challenge.gameId });
  if (challenge.status !== "pending") return mock.refuse(409, "CHALLENGE_CLOSED");
  let gameId = null;
  if (action === "accept") {
    const accepted = acceptOne(challenge, body, mock, state);
    if (accepted.refusal) return accepted.refusal;
    gameId = accepted.gameId;
  }
  Object.assign(challenge, { status: ANSWERED[action], gameId, updatedAt: new Date().toISOString() });
  return mock.reply({ gameId });
}

/** `POST /api/mock/challenges/:case`: the challenges as the case says; the friendlies accepts made are taken away by `empty` and `reset`. */
function setCase(word, mock, state) {
  if (!CASES.has(word)) return mock.refuse(400, "FIELD_INVALID", { field: "case" });
  state.failing = word === "fail";
  if (word !== "fail") {
    for (let index = mock.games.length - 1; index >= 0; index -= 1) if (state.made.has(mock.games[index].id)) mock.games.splice(index, 1);
    state.made.clear();
    state.challenges = word === "reset" && !mock.empty ? startingChallenges(mock) : [];
  }
  return mock.reply({ case: word });
}

/**
 * @param {object} request the HTTP request (`method`; the body is read with `mock.readBody`)
 * @param {string} pathname
 * @param {{teams: object[], games: object[], user: object, rival: object, pairingOf: Function, empty: boolean,
 *   readBody: Function, reply: Function, refuse: Function}} mock the mock's lists, its coach and rival, its maker of a
 *   match and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerChallenges(request, pathname, mock) {
  const { method } = request;
  const mockCase = pathname.match(MOCK_CASE);
  if (mockCase) return method === "POST" ? setCase(decodeURIComponent(mockCase[1]), mock, stateOf(mock)) : null;
  const answer = pathname.match(ANSWER);
  if (pathname !== CHALLENGES && !answer) return null;
  const state = stateOf(mock);
  if (method === "GET" && !answer) return listOf(mock, state);
  if (method !== "POST") return mock.refuse(405, "ROUTE_NOT_FOUND");
  const body = await mock.readBody(request);
  return answer ? answerOne(decodeURIComponent(answer[1]), answer[2], body, mock, state) : sendOne(body, mock, state);
}

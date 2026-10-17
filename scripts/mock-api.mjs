#!/usr/bin/env node
/**
 * Static files plus a fake API, so the logged-in screens can be driven in a
 * browser without Postgres.
 *
 *   node scripts/mock-api.mjs          # serves on :5174
 *   node scripts/browser-check-roster.mjs
 *
 * Ports and variants (the launch configs in .claude/launch.json):
 *   :5174  bloodbowl-mock-api          a coach with three teams and three matches
 *   :5175  bloodbowl-mock-api-admin    MOCK_ADMIN=1, the same coach as an administrator
 *   :5176  bloodbowl-mock-api-empty    MOCK_EMPTY=1, a coach with no team and no match
 * MOCK_PORT picks the port. A page is signed in by a token in localStorage
 * (`gata-league-auth-token`, any value: "mock" in the screenshots) or by the
 * sign-in form with any login and the password `mock-pass`.
 *
 * It keeps one user and one saved team in memory, records every PATCH of that
 * team into .codex_tmp/mock-saves.json, and answers just enough of the API for
 * the shell (sign-in, settings, the SideNav's match card, the header's place),
 * the saved roster, my-games (with its challenges), game, administration
 * (including editing a user's team) and player-profile screens. Not a
 * substitute for `npm run smoke`, which exercises the real server.
 *
 * What it answers, where it is not obvious (the real server is the reference):
 *   GET   /api/auth/me           the coach as `accountUser` (server/routes/account.mjs)
 *                                has them: `publicUser`, `managedByServer: false` and
 *                                `preferences: {}`. The account's theme is empty, so a
 *                                screenshot's palette comes from the page's own storage.
 *                                Unlike the server, which says `{user: null}` to a request
 *                                with no token, it answers the user to everyone: the
 *                                client asks only with a token, and `curl` need not send one.
 *   PATCH /api/auth/preferences  `{preferences}` = the body, a `null` removing its key.
 *                                Nothing is stored, so every screenshot starts from the
 *                                same account whatever an earlier one saved.
 *   PATCH /api/auth/profile      `{user}` (`publicUser`) with the contact sent; stores
 *                                nothing either. A new password needs `currentPassword`
 *                                to be `mock-pass`, else 403 CURRENT_PASSWORD_WRONG.
 *   POST  /api/auth/login        `{token: "mock", user}`; any other password is 401
 *                                WRONG_LOGIN_OR_PASSWORD. /register is 201, /logout `{ok}`.
 *   GET   /api/games             g1 is "next match" (Mock Team, round 1 started, no preparation),
 *                                g2 "match in play" (Mock Humans, preparation on, post-match a
 *                                draft), g3 "awaiting confirmation" (Mock Orcs; the rival sent
 *                                the score, so `viewerIsProposer` is false and the coach may
 *                                confirm it). Each side has `team.id`. GET /api/games/:id is one.
 *   GET   /api/season            one active season whose standings put the rival first and
 *                                Mock Team second, Mock Humans third, Mock Orcs fourth, each
 *                                row with its `rank` (the header's place reads it).
 * Errors are the server's `errorPayload`: `{error: {code, params, message}}`.
 * MOCK_EMPTY=1 leaves no team, game or challenge; the season still has the rival.
 * Its ids are `t1`, `g1`, not UUIDs: the server would refuse `t1` as an active team (400), the mock takes it.
 */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

import { errorPayload } from "../server/http/errors.mjs";
import { resolveStaticPath } from "../server/http/static-path.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savesPath = path.join(rootDir, ".codex_tmp", "mock-saves.json");
const port = Number(process.env.MOCK_PORT || 5174);
const empty = process.env.MOCK_EMPTY === "1";
const mockPassword = "mock-pass";
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

const now = new Date().toISOString();

/** A roster of two players; the copies for other races differ in their race and their player ids. */
const rosterOf = (teamSlug, teamName, idPrefix) => ({
  teamSlug,
  teamName,
  players: [
    { id: `${idPrefix}1`, rowIndex: 0, number: "1", name: "Linewoman One", statMods: {}, extraSkills: [], favouredSkills: [], spp: { touchdowns: 1 }, advancements: [] },
    { id: `${idPrefix}2`, rowIndex: 1, number: "2", name: "Thrower Two", statMods: { ma: 1 }, extraSkills: [{ name: "Block", access: "primary" }], favouredSkills: [], spp: {}, advancements: [] },
  ],
  roster: { 0: 1, 1: 1 },
  treasury: 120,
  coachesSafe: 0,
  teamRerolls: 1,
  startingRerolls: 1,
  purchasedStaff: {},
});
const teamOf = (id, name, baseTeamSlug, idPrefix) => ({
  id,
  name,
  baseTeamSlug,
  logoData: null,
  // The real API sends this on every list query; without it the mock cannot
  // exercise anything that depends on a team being in play.
  inActiveSeason: true,
  roster: rosterOf(baseTeamSlug, name, idPrefix),
  createdAt: now,
  updatedAt: now,
});

// t1 is the team the roster editor saves to. t2 and t3 are copies of its roster under other races, so
// that the coach has a team for each phase of the SideNav's match card (g1, g2, g3 below).
const team = teamOf("t1", "Mock Team", "teams/amazon", "p");
const teams = empty ? [] : [team, teamOf("t2", "Mock Humans", "teams/human", "q"), teamOf("t3", "Mock Orcs", "teams/orc", "r")];

const user = {
  id: "u1",
  login: "coach",
  telegram: "@coach",
  isAdmin: process.env.MOCK_ADMIN === "1",
  createdAt: now,
  // The administrator's lists carry these (`publicAdminUser`); `/api/auth/me` does not.
  savedTeamCount: teams.length,
  lastTeamUpdatedAt: teams.length ? now : null,
};
const rival = {
  id: "u2",
  login: "rival",
  telegram: "@rival",
  isAdmin: false,
  createdAt: now,
  savedTeamCount: 0,
  lastTeamUpdatedAt: null,
};

/** What `publicUser` (server/api/serializers.mjs) says of a user: no counts, and no settings. */
const publicFields = ({ id, login, telegram, isAdmin, createdAt }) => ({ id, login, telegram, isAdmin, createdAt });

/** `GET /api/auth/me`'s user (`accountUser`, server/routes/account.mjs): the public fields, `managedByServer` and the settings. */
const accountUser = () => ({ ...publicFields(user), managedByServer: false, preferences: {} });

// Who the coach plays: one rival team in each of the matches below.
const rivals = [
  { id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" },
  { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" },
  { id: "rt3", name: "Rival Wardens", baseTeamSlug: "teams/lizardmen" },
];
const season = { id: "s1", name: "Mock Season", status: "active", currentRound: 1 };

const coach = ({ id, login }) => ({ id, login });
const gameSide = (owner, { id, name, baseTeamSlug }) => ({ user: coach(owner), team: { id, name, baseTeamSlug, logoUrl: null } });

/**
 * A league match of round 1 as `/api/games` sends it (`publicGame`): the round is on, nobody has sent a
 * result, the match has not begun. `changes` says how far it has got. The coach's team is the home side.
 */
const pairingOf = (id, tableNumber, own, opposing, changes = {}) => ({
  id,
  roundId: "r1",
  roundNumber: 1,
  roundStatus: "started",
  tableNumber,
  homeEntryId: `e-${own.id}`,
  awayEntryId: `e-${opposing.id}`,
  homeTouchdowns: null,
  awayTouchdowns: null,
  homeCasualties: null,
  awayCasualties: null,
  homePoints: null,
  awayPoints: null,
  resultStatus: "pending",
  preparationStatus: "not_started",
  postMatchStatus: "not_started",
  proposedByUserId: null,
  proposedHomeTouchdowns: null,
  proposedAwayTouchdowns: null,
  proposedHomeCasualties: null,
  proposedAwayCasualties: null,
  proposedAt: null,
  confirmedAt: null,
  createdAt: now,
  updatedAt: now,
  ...changes,
  kind: "league",
  season,
  home: gameSide(user, own),
  away: gameSide(rival, opposing),
  viewerIsHome: true,
  viewerIsProposer: (changes.proposedByUserId ?? null) === user.id,
});
const games = empty ? [] : [
  // Next match: Mock Team's preparation has not begun.
  pairingOf("g1", 1, teams[0], rivals[0]),
  // Match in play: the preparation is on and the post-match is a draft.
  pairingOf("g2", 2, teams[1], rivals[1], { preparationStatus: "in_progress", postMatchStatus: "draft" }),
  // Awaiting confirmation: the rival sent 2-1, casualties 1-0, so the coach is the one to confirm it.
  pairingOf("g3", 3, teams[2], rivals[2], {
    resultStatus: "awaiting_confirmation",
    proposedByUserId: rival.id,
    proposedHomeTouchdowns: 2,
    proposedAwayTouchdowns: 1,
    proposedHomeCasualties: 1,
    proposedAwayCasualties: 0,
    proposedAt: now,
  }),
];

// GET /api/challenges (server/friendly/challenges.mjs listChallenges): the
// coach's own challenges (senders and recipients as id and login only), their
// teams in the slim shape, and who may be challenged. One of each kind, so
// my-games shows both columns and the history.
const challenge = (id, sender, recipient, senderTeam, status, gameId = null) => ({
  id, sender: coach(sender), recipient: coach(recipient), team: { id: senderTeam.id, name: senderTeam.name },
  status, gameId, createdAt: team.createdAt, updatedAt: team.updatedAt,
});
const challenges = {
  challenges: empty ? [] : [
    challenge("c1", rival, user, rivals[0], "pending"),
    challenge("c2", user, rival, team, "pending"),
    challenge("c3", rival, user, rivals[0], "accepted", "g1"),
  ],
  teams: teams.map(({ id, name, baseTeamSlug, createdAt, updatedAt }) => ({ id, name, baseTeamSlug, logoData: null, roster: {}, createdAt, updatedAt })),
  opponents: [coach(rival)],
};

/**
 * GET /api/season (server/season/store.mjs loadSeasonBundle), cut down to the table: nobody has entered or
 * played yet, so every row is on zero, and the order is the one the screens are photographed in. The rows
 * are `computeSeasonStandings`' (server/season/scoring.mjs), `rank` included: the header's place reads it.
 */
const standingRow = (owner, entryTeam, rank) => ({
  entryId: `e-${entryTeam.id}`,
  withdrawnAt: null,
  user: { id: owner.id, login: owner.login, telegram: owner.telegram, isAdmin: owner.isAdmin },
  team: { id: entryTeam.id, name: entryTeam.name, baseTeamSlug: entryTeam.baseTeamSlug },
  points: 0,
  games: 0,
  byes: 0,
  touchdowns: 0,
  casualties: 0,
  rank,
});
const seasonBundle = {
  season,
  entries: [],
  historicalEntries: [],
  standings: [standingRow(rival, rivals[0], 1), ...teams.map((entryTeam, index) => standingRow(user, entryTeam, index + 2))],
  rounds: [],
  myEntry: null,
  currentFixture: null,
  myTeams: [],
};

export const saves = [];

/** A body that is no JSON object: the 400 `readJson` (server/http/responses.mjs) gives it. */
async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("body"), { badBody: true });
  return body;
}

const reply = (payload, status = 200) => ({ status, payload });
const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);

/** Sign-in, the account and its settings: the routes of server/routes/auth.mjs and account.mjs. */
async function answerAuth(request, pathname) {
  const { method } = request;
  if (method === "GET" && pathname === "/api/auth/me") return reply({ user: accountUser() });
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(request);
    return body.password === mockPassword ? reply({ token: "mock", user: publicFields(user) }) : refuse(401, "WRONG_LOGIN_OR_PASSWORD");
  }
  if (method === "POST" && pathname === "/api/auth/register") return reply({ token: "mock", user: publicFields(user) }, 201);
  if (method === "POST" && pathname === "/api/auth/logout") return reply({ ok: true });
  if (method === "PATCH" && pathname === "/api/auth/profile") {
    const body = await readBody(request);
    if (body.password && body.currentPassword !== mockPassword) return refuse(403, "CURRENT_PASSWORD_WRONG");
    return reply({ user: { ...publicFields(user), login: body.login ?? user.login, telegram: body.telegram ?? user.telegram } });
  }
  if (method === "PATCH" && pathname === "/api/auth/preferences") {
    const body = await readBody(request);
    return reply({ preferences: Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null)) });
  }
  return null;
}

/** The coach's teams and the one the roster editor saves. */
async function answerTeams(request, pathname) {
  if (pathname === "/api/teams" && request.method === "GET") return reply({ teams });
  if (pathname === "/api/teams/t1" && request.method === "PATCH" && teams.includes(team)) {
    const body = await readBody(request);
    saves.push(body);
    await fs.mkdir(path.dirname(savesPath), { recursive: true });
    await fs.writeFile(savesPath, JSON.stringify(saves, null, 1));
    Object.assign(team, { name: body.name, roster: body.roster, updatedAt: new Date().toISOString() });
    return reply({ team });
  }
  return null;
}

/** Challenges, matches and the season. */
function answerLeague(request, pathname) {
  if (pathname === "/api/challenges" && request.method === "GET") return reply(challenges);
  if (pathname === "/api/season" && request.method === "GET") return reply(seasonBundle);
  if (pathname === "/api/games") return reply({ games, currentGames: user.isAdmin ? games : [] });
  if (pathname.startsWith("/api/games/")) {
    const game = games.find((item) => item.id === pathname.split("/")[3]);
    if (!game) return refuse(404, "GAME_NOT_FOUND");
    return reply({ game });
  }
  return null;
}

/** The team called `id` (any team of the coach's if the id is not theirs, as the mock always did) in `answer`, or 404 when the coach has none. */
function teamOrRefusal(id, answer) {
  const found = teams.find((item) => item.id === id) ?? teams[0];
  return found ? reply(answer(found)) : refuse(404, "TEAM_NOT_FOUND");
}

/** The administrator's lists, and a player's page. */
function answerPeople(request, pathname) {
  if (pathname === "/api/admin/users") return reply({ users: [user, rival] });
  if (pathname.startsWith("/api/admin/users/")) return reply({ user, teams });
  // An administrator opening somebody else's team: the owner beside the team (server/routes/admin.mjs).
  const adminTeam = pathname.match(/^\/api\/admin\/teams\/([^/]+)$/);
  if (adminTeam && request.method === "GET") return teamOrRefusal(adminTeam[1], (found) => ({ owner: user, team: found }));
  const playerTeam = pathname.match(/^\/api\/players\/[^/]+\/teams\/([^/]+)$/);
  if (playerTeam) return teamOrRefusal(playerTeam[1], (found) => ({ user, team: found }));
  if (pathname.startsWith("/api/players/")) return reply({ user, teams });
  return null;
}

async function answerApi(request, pathname) {
  for (const answer of [answerAuth, answerTeams, answerLeague, answerPeople]) {
    const answered = await answer(request, pathname);
    if (answered) return answered;
  }
  return reply({});
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);

  if (url.pathname.startsWith("/api/")) {
    let answered;
    try {
      answered = await answerApi(request, url.pathname);
    } catch (error) {
      if (!error.badBody) throw error;
      answered = refuse(400, "FIELD_INVALID", { field: "body" });
    }
    response.writeHead(answered.status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(answered.payload));
    return;
  }

  const fullPath = resolveStaticPath(url.pathname, rootDir);
  if (!fullPath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await fs.readFile(fullPath);
    response.writeHead(200, { "Content-Type": mime.get(path.extname(fullPath)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

// The loopback address only: it answers with whatever is signed in to anyone who asks, so
// it must not be reachable from the network the machine is on.
server.listen(port, "127.0.0.1", () => console.log(`mock api on http://127.0.0.1:${port}`));

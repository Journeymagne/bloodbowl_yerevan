#!/usr/bin/env node
/**
 * Static files plus a fake API, so the logged-in screens can be driven in a
 * browser without Postgres.
 *
 *   node scripts/mock-api.mjs          # serves on :5174
 *   node scripts/browser-check-roster.mjs
 *
 * Ports and variants (the launch configs in .claude/launch.json):
 *   :5174  bloodbowl-mock-api          a coach with five teams and six matches
 *   :5175  bloodbowl-mock-api-admin    MOCK_ADMIN=1, the same coach as an administrator
 *   :5176  bloodbowl-mock-api-empty    MOCK_EMPTY=1, a coach with no team and no match
 * MOCK_PORT picks the port. The launch configs set these through `env` (as the
 * release 2.1.0 maintenance config did): the config format names a command and
 * its arguments, not an environment, and `npx --yes cross-env` fetched an
 * unpinned package from the registry at every start.
 *
 * Run `npm run build` first: the races are read from the built data when the mock
 * starts (scripts/mock/treasury.mjs), and it stops without them.
 *
 * A page is signed in by a token in localStorage (`gata-league-auth-token`,
 * any value: "mock" in the screenshots) or by the sign-in form with any login
 * and the password `mock-pass`.
 *
 * It keeps one user and the coach's teams in memory (a team made or deleted
 * stays so until the mock restarts), records every accepted PATCH of the first team
 * into .codex_tmp/mock-saves.json, and answers just enough of the API for the shell
 * (sign-in, settings, the SideNav's match card, the header's place), the teams
 * list, a team's overview, a new team, the saved roster, my-games (with its
 * challenges), game, administration (including editing a user's team) and
 * player-profile screens. Not a substitute for `npm run smoke`, which exercises
 * the real server.
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
 *   GET   /api/teams             the coach's teams, each as `publicSavedTeam` has it (`stage`,
 *                                `activatedAt`, `revision`, `inActiveSeason`): t1 Mock Team
 *                                (Amazon; seven players, whose counters give the overview its
 *                                leaders), t2 Mock Humans (seven players too, match records in
 *                                g2), t3 Mock Orcs (a save of it is dropped), t4 Mock Draft (Norse,
 *                                `stage: "draft"`, no season, no match) and t5 Mock Veterans
 *                                (Dwarf, from a past season: in no active season, and played).
 *                                GET /api/teams/:id is one, or 404 TEAM_NOT_FOUND.
 *   POST  /api/teams             no `name` is 400 TEAM_NAME_REQUIRED, no `baseTeamSlug` 400
 *                                BASE_TEAM_REQUIRED (`readTeamBody`); else 201 `{team}`: the
 *                                next `t<n>` (an id is not used twice), `stage: "active"`, in no
 *                                season, first on the list. The roster is kept as sent, not
 *                                checked against the race.
 *   DELETE /api/teams/:id        a team of the active season or of a past one is 409
 *                                TEAM_IN_SEASON_CANNOT_BE_DELETED (t1, t2, t3, t5); any other
 *                                (t4, a team made here) goes off the list: `{ok: true}`, which,
 *                                like the server, an id nobody has gets too.
 *   PATCH /api/teams/:id         a save of any team, held as the server holds it (scripts/mock/treasury.mjs):
 *                                an integer `revision` that is not the team's is 409 TEAM_SAVED_ELSEWHERE
 *                                with the team; a re-roll the stage forbids is 422 STAGE_PURCHASE_LOCKED;
 *                                else `{team}` with the revision one up and the treasury's change journaled.
 *                                The roster rules (`checkRoster`) are not applied: a roster the server
 *                                would refuse with 422 ROSTER_BREAKS_THE_RULES is kept.
 *   GET   /api/teams/:id/ledger  the treasury's history, newest first: `{entries, next, since, total}`.
 *                                t1 has six lines (the last ends at its treasury, 120), t5 one, t4 none.
 *   POST  /api/teams/:id/treasury  an entry by hand `{delta, reason, note?, revision}`: 400, 409 or 422 as
 *                                the server gives them, else 201 `{team, entry}`.
 *   GET   /api/teams/:id/events  `{events, revision}`: the team's records of a match tapped, or those not
 *   POST  /api/teams/:id/events  settled; a tap is the server's 201 or 400, 409 or 422 (scripts/mock/roster.mjs).
 *   GET   /api/games             round 3 is on. g1 is "next match" (Mock Team, started, no
 *                                preparation), g2 "match in play" (Mock Humans, preparation on,
 *                                post-match a draft), g3 "awaiting confirmation" (Mock Orcs; the
 *                                rival sent the score, so `viewerIsProposer` is false and the
 *                                coach may confirm it). Played: g4 (round 1, Mock Team at home,
 *                                won 2-1), g5 (round 2, Mock Team away, lost 0-2) and g6, a
 *                                friendly of Mock Team that ended 1-1 (`kind: "friendly"`,
 *                                `season: null`, no round, no points), and g7, a friendly of Mock
 *                                Veterans against the same rival whose preparation is on. Each side has `team.id`.
 *                                The list is in the server's order (the friendly, then the
 *                                rounds from the last); `currentGames` (administrator) holds the
 *                                matches in play and waiting. GET /api/games/:id is one.
 *   GET   /api/season            scripts/mock/season.mjs (and the league's other coaches' pages; t1's place is what the table makes).
 *   GET/PATCH /api/games/:id/post-match, POST …/finish, …/post-match/rolls  scripts/mock/post.mjs (g2's post-match and its cases).
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
import { answerMatches } from "./mock/matches.mjs";
import { answerPost } from "./mock/post.mjs";
import { answerSeason } from "./mock/season.mjs";
import { answerRoster, humanPlayers, preparingFriendly } from "./mock/roster.mjs";
import { treasuryRoutes } from "./mock/treasury.mjs";

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
/** A stamp `days` before the mock started; the days may be fractions. */
const daysAgo = (days) => new Date(Date.parse(now) - days * 86_400_000).toISOString();

/** A player of the roster; `changes` replace what a fresh recruit has. */
const playerOf = (idPrefix, number, rowIndex, name, changes = {}) => ({
  id: `${idPrefix}${number}`,
  rowIndex,
  number: String(number),
  name,
  statMods: {},
  extraSkills: [],
  favouredSkills: [],
  spp: {},
  advancements: [],
  ...changes,
});
/** The two players of a small roster; the copies for other teams differ in their player ids. */
const startersOf = (idPrefix) => [
  playerOf(idPrefix, 1, 0, "Linewoman One", { spp: { touchdowns: 1 } }),
  playerOf(idPrefix, 2, 1, "Thrower Two", { statMods: { ma: 1 }, extraSkills: [{ name: "Block", access: "primary" }] }),
];
// Mock Team's eight (rows of teams/amazon: 0 Linewoman, 1 Thrower, 2 Blitzer, 3 Blocker), the counters spread so that every leader of the overview
// is somebody else: SPP and touchdowns Three, casualties Four, completions Two, and the MVP, who is no leader of a counter, Five; Eight is a fresh
// purchase (cancelled for 50, until a match). Three advances, Four is the captain, Six carries a lasting injury.
const amazons = [
  playerOf("p", 1, 0, "Linewoman One", { spp: { touchdowns: 1 } }),
  playerOf("p", 2, 1, "Thrower Two", { statMods: { ma: 1 }, extraSkills: [{ name: "Block", access: "primary" }], spp: { completions: 3 } }),
  playerOf("p", 3, 2, "Blitzer Three", { spp: { touchdowns: 7 }, extraSkills: [{ name: "Dodge", access: "primary" }], advancements: [{ type: "random", grants: { skill: "Dodge" }, roll: { id: "mock-roll-p3", via: "site" } }] }),
  playerOf("p", 4, 3, "Blocker Four", { isCaptain: true, spp: { casualties: 2 } }),
  playerOf("p", 5, 0, "Linewoman Five", { spp: { mvps: 1 } }),
  playerOf("p", 6, 0, "Linewoman Six", { skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, niglingInjury: true, statMods: { ag: -1 }, injuryStatMods: { ag: -1 } }),
  playerOf("p", 7, 2, "Blitzer Seven", { skipNextGame: true, absence: { code: "other", note: "Suspended by the league" } }), playerOf("p", 8, 0, "Linewoman Eight", { purchased: true, purchaseRefund: 50 }),
];

/** A roster of `players`; the counts are how many stand in each row of the race. */
const rosterOf = (teamSlug, teamName, players) => ({
  teamSlug,
  teamName,
  players,
  roster: players.reduce((counts, { rowIndex }) => ({ ...counts, [rowIndex]: (counts[rowIndex] ?? 0) + 1 }), {}),
  treasury: 120,
  coachesSafe: 0,
  teamRerolls: 1,
  startingRerolls: 1,
  purchasedStaff: {},
});
/** A team as `publicSavedTeam` (server/api/serializers.mjs) sends it; `changes` replace what a team of the season has. */
const teamOf = (id, name, baseTeamSlug, players, changes = {}) => ({
  id,
  name,
  baseTeamSlug,
  logoData: null,
  roster: rosterOf(baseTeamSlug, name, players),
  revision: 1,
  stage: "active",
  // Null, as for a team that was playing before there were stages.
  activatedAt: null,
  // The real API sends this on every list query; without it the mock cannot
  // exercise anything that depends on a team being in play.
  inActiveSeason: true,
  createdAt: now,
  updatedAt: now,
  ...changes,
});

// t1 is the team whose saves the browser checks read back (any team may be saved). t2 has seven players of its own (the roster
// screen's match) and t3 is a copy of the small roster under another race, so that the coach has a team for each phase of the
// SideNav's match card (g1, g2, g3 below). t4 is still being built and has played nothing, so it can be deleted; t5 played a
// season that is over, so it cannot be.
const team = teamOf("t1", "Mock Team", "teams/amazon", amazons);
const teams = empty ? [] : [
  team,
  teamOf("t2", "Mock Humans", "teams/human", humanPlayers(playerOf)),
  teamOf("t3", "Mock Orcs", "teams/orc", startersOf("r")),
  teamOf("t4", "Mock Draft", "teams/norse", startersOf("s"), { stage: "draft", inActiveSeason: false }),
  teamOf("t5", "Mock Veterans", "teams/dwarf", startersOf("v"), { inActiveSeason: false }),
];
/** Teams that have played a season which is not the active one: what a delete is refused for besides the active season. */
const pastSeasonTeamIds = new Set(["t5"]);
/** The number of the last team id given out: an id is not given twice, nor to a team made after another was deleted. */
let lastTeamNumber = Math.max(0, ...teams.map(({ id }) => Number(id.slice(1))));

const user = {
  id: "u1",
  login: "coach",
  telegram: "@coach",
  isAdmin: process.env.MOCK_ADMIN === "1",
  createdAt: now,
  // The administrator's lists carry these (`publicAdminUser`); `/api/auth/me` does not. They follow the teams
  // made and deleted since the mock started.
  get savedTeamCount() {
    return teams.length;
  },
  get lastTeamUpdatedAt() {
    return teams.length ? now : null;
  },
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
// As a game carries it (`publicGame`); the table's has the stamps too (`publicSeason`).
const season = { id: "s1", name: "Mock Season", status: "active", currentRound: 3 };

const coach = ({ id, login }) => ({ id, login });
const gameSide = (owner, { id, name, baseTeamSlug }) => ({ user: coach(owner), team: { id, name, baseTeamSlug, logoUrl: null } });

/**
 * A league match of round 3 as `/api/games` sends it (`publicGame`): the round is on, nobody has sent a
 * result, the match has not begun. `changes` says how far it has got, or what else it is. The coach's team
 * is the home side unless `viewerIsHome` says otherwise.
 */
const pairingOf = (id, tableNumber, own, opposing, changes = {}) => {
  const viewerIsHome = changes.viewerIsHome ?? true;
  const [home, away] = viewerIsHome ? [[user, own], [rival, opposing]] : [[rival, opposing], [user, own]];
  return {
    id,
    roundId: "r3",
    roundNumber: 3,
    roundStatus: "started",
    tableNumber,
    homeEntryId: `e-${home[1].id}`,
    awayEntryId: `e-${away[1].id}`,
    homeTouchdowns: null,
    awayTouchdowns: null,
    homeCasualties: null,
    awayCasualties: null,
    homePoints: null,
    awayPoints: null,
    resultStatus: "pending",
    preparationStatus: "not_started",
    postMatchStatus: "not_started", homeMvps: [], awayMvps: [], // the list's MVPs (`loadGameMvps`): only g4's post-match is completed
    proposedByUserId: null,
    proposedHomeTouchdowns: null,
    proposedAwayTouchdowns: null,
    proposedHomeCasualties: null,
    proposedAwayCasualties: null,
    proposedAt: null,
    confirmedAt: null,
    createdAt: daysAgo(30),
    updatedAt: now,
    kind: "league",
    season,
    ...changes,
    home: gameSide(...home),
    away: gameSide(...away),
    viewerIsHome,
    viewerIsProposer: (changes.proposedByUserId ?? null) === user.id,
  };
};

/**
 * A score that `proposer` sent and the other coach confirmed `days` ago. `touchdowns`, `casualties` and `points`
 * are [home, away]; the points are the league's (`matchPoints`: a win is 3, 1 more for a shutout), a friendly's 0.
 */
const confirmedScore = (proposer, days, { touchdowns, casualties, points }) => ({
  resultStatus: "confirmed",
  homeTouchdowns: touchdowns[0],
  awayTouchdowns: touchdowns[1],
  homeCasualties: casualties[0],
  awayCasualties: casualties[1],
  homePoints: points[0],
  awayPoints: points[1],
  proposedByUserId: proposer.id,
  proposedHomeTouchdowns: touchdowns[0],
  proposedAwayTouchdowns: touchdowns[1],
  proposedHomeCasualties: casualties[0],
  proposedAwayCasualties: casualties[1],
  proposedAt: daysAgo(days + 0.1),
  confirmedAt: daysAgo(days),
  updatedAt: daysAgo(days),
});
// The server's order: by the season's start, then the rounds from the last, and a friendly, which has no season,
// by its own: it was made after the season began, so it comes first.
const games = empty ? [] : [
  // A friendly of Mock Veterans against the first rival, its preparation begun and no result sent; the freshest of the friendlies.
  preparingFriendly(pairingOf, teams[4], rivals[0]),
  // A friendly of Mock Team against the first rival, 1-1: it has no season, round or table entry, and no points.
  pairingOf("g6", 1, teams[0], rivals[0], {
    kind: "friendly",
    season: null,
    roundId: null,
    roundNumber: 0,
    homeEntryId: null,
    awayEntryId: null,
    ...confirmedScore(rival, 2, { touchdowns: [1, 1], casualties: [0, 0], points: [0, 0] }),
  }),
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
  // Round 2, away: Mock Team lost 0-2, the casualty was the rival's, and a win to nil is worth 4.
  pairingOf("g5", 1, teams[0], rivals[2], {
    roundId: "r2",
    roundNumber: 2,
    roundStatus: "completed",
    viewerIsHome: false,
    ...confirmedScore(rival, 6, { touchdowns: [2, 0], casualties: [1, 0], points: [4, 0] }),
  }),
  // Round 1, at home: Mock Team won 2-1, took the casualty; post-match completed (mock/history.mjs), MVP Linewoman Five (p5).
  pairingOf("g4", 1, teams[0], rivals[1], {
    roundId: "r1", postMatchStatus: "completed", homeMvps: [{ id: "p5", name: "Linewoman Five" }],
    roundNumber: 1,
    roundStatus: "completed",
    ...confirmedScore(user, 13, { touchdowns: [2, 1], casualties: [1, 0], points: [3, 0] }),
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
  // The teams the coach has now, made and deleted since the mock started included.
  get teams() {
    return teams.map(({ id, name, baseTeamSlug, createdAt, updatedAt }) => ({ id, name, baseTeamSlug, logoData: null, roster: {}, createdAt, updatedAt }));
  },
  opponents: [coach(rival)],
};

export const saves = [];

/** A PATCH of t1 that was accepted, kept for scripts/browser-check-roster.mjs in .codex_tmp/mock-saves.json. */
async function recordSave(body) {
  saves.push(body);
  await fs.mkdir(path.dirname(savesPath), { recursive: true });
  await fs.writeFile(savesPath, JSON.stringify(saves, null, 1));
}

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
/** What an answerer is given besides the request: the lists it reads and the helpers it replies with. */
const mock = { teams, games, user, rival, readBody, reply, refuse };

/** A team's history, an entry by hand and the save of any team (scripts/mock/treasury.mjs); it gives t1, t4 and t5 their fixtures too. */
const answerTreasury = treasuryRoutes({ teams, readBody, onSave: recordSave });

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

/** `POST /api/teams` (server/routes/teams.mjs, `readTeamBody`): the team made, in no season, first on the list. */
function makeTeam(body) {
  const name = String(body.name ?? "").trim();
  const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
  if (!name) return refuse(400, "TEAM_NAME_REQUIRED");
  if (!baseTeamSlug) return refuse(400, "BASE_TEAM_REQUIRED");
  lastTeamNumber += 1;
  const stamp = new Date().toISOString();
  const made = teamOf(`t${lastTeamNumber}`, name, baseTeamSlug, [], {
    logoData: body.logoData ? String(body.logoData) : null,
    roster: body.roster ?? {},
    inActiveSeason: false,
    createdAt: stamp,
    updatedAt: stamp,
  });
  teams.unshift(made);
  return reply({ team: made }, 201);
}

/** `DELETE /api/teams/:id`: a team that has played a season stays, any other goes; an id nobody has is no error, as on the server. */
function deleteTeam(id) {
  const index = teams.findIndex((item) => item.id === id);
  if (index === -1) return reply({ ok: true });
  if (teams[index].inActiveSeason || pastSeasonTeamIds.has(id)) return refuse(409, "TEAM_IN_SEASON_CANNOT_BE_DELETED");
  teams.splice(index, 1);
  return reply({ ok: true });
}

/** The coach's teams: the list, one of them, making and deleting one. Saving one is the treasury's (`answerTreasury`). */
async function answerTeams(request, pathname) {
  const { method } = request;
  if (pathname === "/api/teams" && method === "GET") return reply({ teams });
  if (pathname === "/api/teams" && method === "POST") return makeTeam(await readBody(request));
  const id = pathname.match(/^\/api\/teams\/([^/]+)$/)?.[1];
  if (!id) return null;
  if (method === "GET") {
    const found = teams.find((item) => item.id === id);
    return found ? reply({ team: found }) : refuse(404, "TEAM_NOT_FOUND");
  }
  if (method === "DELETE") return deleteTeam(id);
  return null;
}

/** Whether a match is one the administrator's list of current matches holds: started and not confirmed (server/season/store.mjs). */
const isCurrent = (game) => game.roundStatus === "started" && game.resultStatus !== "confirmed";
const withoutMvps = ({ homeMvps, awayMvps, ...game }) => game; // only the list carries MVPs, as on the server (`server/routes/games.mjs`)

/** Challenges and matches. */
function answerLeague(request, pathname) {
  if (pathname === "/api/challenges" && request.method === "GET") return reply(challenges);
  if (pathname === "/api/games") return reply({ games, currentGames: user.isAdmin ? games.filter(isCurrent).map(withoutMvps) : [] });
  if (pathname.startsWith("/api/games/")) {
    const game = games.find((item) => item.id === pathname.split("/")[3]);
    return game ? reply({ game: withoutMvps(game) }) : refuse(404, "GAME_NOT_FOUND");
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
  for (const answer of [answerAuth, answerRoster, answerTreasury, answerTeams, answerPost, answerMatches, answerSeason, answerLeague, answerPeople]) {
    const answered = await answer(request, pathname, mock);
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
      if (!error.badBody) console.error(error);
      answered = error.badBody ? refuse(400, "FIELD_INVALID", { field: "body" }) : refuse(500, "SERVER_ERROR");
    }
    // A dropped connection gets no answer at all: the screen's "no network" (scripts/mock/roster.mjs).
    if (answered.drop) return void request.socket.destroy();
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

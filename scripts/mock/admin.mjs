/**
 * The mock API's administration (stage 12): the league's coaches as the admin sees them, a coach's page, the admin's
 * view of any team, the scores awaiting confirmation, and the admin's writes (server/routes/admin.mjs, admin-coaches.mjs,
 * admin-team.mjs, team-stage.mjs and the season's admin routes of server/routes/season.mjs are the reference).
 *
 * Every route here is the admin's: a coach who is no admin (MOCK_ADMIN unset) is 403 ADMIN_REQUIRED, as on the server,
 * and the reads of another coach's team below are left to scripts/mock/roster.mjs, which calls the team not found.
 *
 *   GET    /api/admin/users            the six coaches of the prototypes (DeskAdminUsers), each as `publicAdminUser` sends
 *                                 him with `draftTeamCount` and `managedByServer`: felstell (u1, the signed-in coach of
 *                                 mock-api.mjs under the prototypes' name), the admin of the server's env file, with two
 *                                 teams; orc_boss (u2, the rival of the matches) with two; thalion, nightblade and gutbag
 *                                 with one each; newbie_coach (u8) with Mudfoot Boyz in the build, which is the season's
 *                                 (scripts/mock/season.mjs). The last change of a team is a week back, as the prototype
 *                                 dates it, and today for newbie_coach.
 *   GET    /api/admin/users/:id        `{user, teams}`: the user with `lastLoginAt` (a live session's, or null),
 *                                 `managedByServer` and `deleteBlock` — "self", then "friendly", then "season", the order
 *                                 the delete refuses in (orc_boss: "friendly", as DeskAdminUser says) — and the teams as
 *                                 summaries with `stage`, `inActiveSeason`, `matches` (confirmed, league and friendly),
 *                                 `friendlies` and `deleteBlock` ("season", then "friendly"). orc_boss: Grimtusk Raiders
 *                                 (rt1, Orc, in the season, six matches) and Iron Teeth (Black Orc, one friendly). 404
 *                                 USER_NOT_FOUND for anybody else.
 *   GET    /api/admin/teams/:id        `{owner, team, inMatch, matches}`: rt1 is Grimtusk Raiders (DeskAdminTeamEdit: 95k,
 *                                 Thrag, Gorbag, Snik, Uzg, Morg and six more), its six matches newest first, each
 *                                 `{id, kind, roundNumber, opponent, score: [the team's, the opponent's], confirmedAt}`.
 *                                 The coach's own teams are the admin's too (felstell's), their matches the coach's games;
 *                                 a team of the league's other coaches is the season's, with no matches. `inMatch` is
 *                                 false: no team of the administration plays here. 404 TEAM_NOT_FOUND for any other id.
 *   GET    /api/teams/:id/events|fallen|rolls, …/players/:pid/history   of a team the admin opens that is not the coach's
 *                                 own: none of them (`{events: [], revision}` at the team's revision). The coach's own
 *                                 are scripts/mock/roster.mjs's.
 *   GET    /api/admin/awaiting         `{games}`: the coach's games whose score waits for a confirmation, a closed round's
 *                                 and a friendly's too (here g3), oldest proposal first, without the list's MVPs.
 *   POST   /api/admin/users/:id/reset-password   `{password: "Hq4-wX9p-Lr2z"}` (DeskAdminReset); the server's admin 409
 *                                 ADMIN_PASSWORD_FROM_ENV, one's own 409 SELF_PASSWORD_RESET.
 *   POST   /api/admin/coaches          `{login, telegram, teamName, baseTeamSlug, enter}`, refused in the server's order
 *                                 (LOGIN_TOO_SHORT, TELEGRAM_REQUIRED, TEAM_NAME_REQUIRED, FIELD_INVALID `baseTeamSlug`
 *                                 for a race the data has not, 409 LOGIN_ALREADY_REGISTERED for a login the list has —
 *                                 newbie_coach's among them, so a screenshot fills another); else 201 `{user, team,
 *                                 password: "k7Qp-2xLm-9wRa", entryId}` — the team a draft of 600k with no player, the
 *                                 entry an id when `enter` (the season itself is not changed) — and the coach is listed.
 *   POST   /api/admin/users/:id/teams  a draft for that coach, the roster as sent: 201 `{user, team}`.
 *   PATCH  /api/admin/users/:id        `{login, isAdmin}`: the server's admin 409 ADMIN_PROFILE_FROM_ENV, one's own rights
 *                                 409 SELF_ADMIN_DEMOTE; else stored: `{user}`.
 *   DELETE /api/admin/users/:id        `deleteBlock` decides: SELF_ADMIN_DELETE, USER_IN_FRIENDLY_GAMES, USER_IN_SEASON
 *                                 (409); else he and his teams go: `{ok: true}`.
 *   DELETE /api/admin/teams/:id        a team of the administration's coaches: TEAM_IN_SEASON_CANNOT_BE_DELETED,
 *                                 TEAM_IN_FRIENDLY_GAMES (409); else it goes: `{ok: true, ownerId}`.
 *   Any other write of the season (`/api/season/admin/…`) answers the season as it is (`seasonBundle`), and any write of
 *   a team (PATCH /api/admin/teams/:id, its treasury, a death and its undo, a fallen player added afterwards,
 *   POST /api/teams/:id/activate) the team as it is — `{team}`, `{team, entry: null}`, 201 `{team, fallen}`, `{team}`,
 *   201 `{fallen}`: the snapshots only read. The game's writes (PATCH /api/games/:id, its confirm and reject) are
 *   mock-api.mjs's, which answers the game as it is.
 *
 * Everything is held per mock (`worldOf`) in memory: a coach made or deleted stays so until the mock restarts. Ids are
 * the mock's, not UUIDs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTeamReference, teamBySlug } from "../../server/domain/roster.mjs";
import { LOGIN_MIN_LENGTH } from "../../src/domain/account.mjs";
import { startingBudget } from "../../src/domain/league-rules.mjs";
import { leagueTeam, seasonBundle } from "./season.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
await loadTeamReference(rootDir);

const DAY = 86_400_000;
const STARTED = Date.now();
/** A stamp `days` before the mock started. */
const daysAgo = (days) => new Date(STARTED - days * DAY).toISOString();
const RESET_PASSWORD = "Hq4-wX9p-Lr2z";
const NEW_COACH_PASSWORD = "k7Qp-2xLm-9wRa";

// ---- The coaches and their teams, as the prototypes draw them ----------------------------------------------------

/** A player of a roster; `changes` replace what a fresh recruit has. */
const playerOf = (idPrefix, number, rowIndex, name, changes = {}) => ({
  id: `${idPrefix}${number}`, rowIndex, number: String(number), name, statMods: {}, extraSkills: [], favouredSkills: [], spp: {}, advancements: [], ...changes,
});
/** A roster as the server keeps it; the counts are how many stand in each row of the race. */
const rosterOf = (teamSlug, teamName, players, treasury = 60) => ({
  teamSlug, teamName, players, roster: players.reduce((counts, { rowIndex }) => ({ ...counts, [rowIndex]: (counts[rowIndex] ?? 0) + 1 }), {}),
  treasury, coachesSafe: 0, teamRerolls: 1, startingRerolls: 2, purchasedStaff: {},
});
/** Eleven of the race's first row. */
const elevenOf = (idPrefix, slug, name) => rosterOf(slug, name, Array.from({ length: 11 }, (_, at) => playerOf(idPrefix, at + 1, 0, `${name} ${at + 1}`)));
// Grimtusk Raiders (Orc: 0 Lineman, 1 Thrower, 2 Blitzer, 3 Big Un, 4 Goblin): DeskAdminTeamEdit's five first, then six more.
const GRIMTUSK = rosterOf("teams/orc", "Grimtusk Raiders", [
  playerOf("gr", 1, 2, "Thrag", { isCaptain: true, spp: { touchdowns: 4, casualties: 2 } }),
  playerOf("gr", 2, 2, "Gorbag", { spp: { casualties: 3 } }),
  playerOf("gr", 3, 4, "Snik", { spp: { touchdowns: 1 } }),
  playerOf("gr", 4, 0, "Uzg"),
  playerOf("gr", 5, 1, "Morg", { spp: { completions: 5 } }),
  playerOf("gr", 6, 3, "Grishnak"),
  playerOf("gr", 7, 3, "Lugdush"),
  ...["Bolg", "Shagrat", "Ufthak", "Snaga"].map((name, at) => playerOf("gr", at + 8, 0, name)),
], 95);

/** A team as `publicSavedTeam` sends it, changed `days` ago; `entered` — its entry in the season. */
const teamOf = (id, name, baseTeamSlug, roster, { days, entered = false }) => ({
  id, name, baseTeamSlug, logoData: null, roster, revision: 1, stage: "active", activatedAt: null, inActiveSeason: entered,
  createdAt: daysAgo(days + 60), updatedAt: daysAgo(days),
});

/** The coaches besides newbie_coach, whose account and team are the season's; `lastLoginAt` is a live session's. */
const COACHES = [
  { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: true, managedByServer: true, createdAt: "2024-09-02T10:00:00.000Z", lastLoginAt: daysAgo(0.05) },
  { id: "u2", login: "orc_boss", telegram: "@orc_boss", createdAt: "2025-02-03T18:20:00.000Z", lastLoginAt: daysAgo(1) },
  { id: "u5", login: "thalion", telegram: "@thalion_bb", createdAt: "2025-02-11T12:00:00.000Z", lastLoginAt: daysAgo(2) },
  { id: "u6", login: "nightblade", telegram: "@nightblade", createdAt: "2025-03-01T20:15:00.000Z", lastLoginAt: null },
  { id: "u7", login: "gutbag", telegram: "@gutbag7", createdAt: "2025-04-19T16:40:00.000Z", lastLoginAt: daysAgo(5) },
];
/** Each team with its coach; Mudfoot Boyz is the season's (in the build, entered). */
const HOLDINGS = [
  ["u1", teamOf("aw1", "Ashgrove Wardens", "teams/human", elevenOf("aw", "teams/human", "Ashgrove"), { days: 7, entered: true })],
  ["u1", teamOf("ca1", "Cinderpeak Ash", "teams/chaos-dwarfs", elevenOf("ca", "teams/chaos-dwarfs", "Cinderpeak"), { days: 40 })],
  ["u2", teamOf("rt1", "Grimtusk Raiders", "teams/orc", GRIMTUSK, { days: 9, entered: true })],
  ["u2", teamOf("it1", "Iron Teeth", "teams/black-orc", elevenOf("it", "teams/black-orc", "Iron Teeth"), { days: 20 })],
  ["u5", teamOf("sr1", "Silverbrook Rangers", "teams/wood-elves", elevenOf("sr", "teams/wood-elves", "Silverbrook"), { days: 8, entered: true })],
  ["u6", teamOf("dk1", "Duskspire Knives", "teams/dark-elf", elevenOf("dk", "teams/dark-elf", "Duskspire"), { days: 12, entered: true })],
  ["u7", teamOf("rg1", "Ratwharf Gnawers", "teams/skaven", elevenOf("rg", "teams/skaven", "Ratwharf"), { days: 10, entered: true })],
];
/** newbie_coach and Mudfoot Boyz, as the season has them. */
const NEWCOMER = leagueTeam("mb1");

/** A confirmed game between two of the administration's teams, as `/api/games` sends one: what a team's matches are read from. */
const playedGame = (id, roundNumber, [home, away], [homeTd, awayTd], days) => {
  const sideOf = (teamId) => ({ team: { id: teamId, name: HOLDINGS.find(([, team]) => team.id === teamId)[1].name } });
  return { id, kind: roundNumber ? "league" : "friendly", roundNumber, home: sideOf(home), away: sideOf(away), homeTouchdowns: homeTd,
    awayTouchdowns: awayTd, resultStatus: "confirmed", confirmedAt: daysAgo(days) };
};
// Grimtusk Raiders' six rounds (the plan's example of a match in the sheet of a fallen player added afterwards: round 6
// against Silverbrook Rangers, 2–1), and Iron Teeth's friendly. A Swiss draw avoids a rematch where it can: with four
// rivals in six rounds, it could not twice.
const GAMES = [
  playedGame("ag6", 6, ["rt1", "sr1"], [2, 1], 2),
  playedGame("ag5", 5, ["dk1", "rt1"], [1, 1], 9),
  playedGame("af1", null, ["it1", "aw1"], [1, 2], 12),
  playedGame("ag4", 4, ["aw1", "rt1"], [2, 0], 16),
  playedGame("ag3", 3, ["rt1", "rg1"], [3, 0], 23),
  playedGame("ag2", 2, ["rg1", "rt1"], [1, 2], 30),
  playedGame("ag1", 1, ["rt1", "aw1"], [1, 1], 37),
];

/** The administration of one mock: its coaches and their teams, which its writes change. */
const worlds = new WeakMap();
function worldOf(mock) {
  if (!worlds.has(mock)) {
    const coaches = [...structuredClone(COACHES), { ...NEWCOMER.owner, managedByServer: false, lastLoginAt: null }];
    const holdings = [...HOLDINGS.map(([ownerId, team]) => ({ ownerId, team: structuredClone(team) })), { ownerId: NEWCOMER.owner.id, team: NEWCOMER.team }];
    worlds.set(mock, { coaches, holdings, made: 0 });
  }
  return worlds.get(mock);
}

// ---- What the routes answer ----------------------------------------------------------------------------------------

/** The team's confirmed games among `games` from its side, newest first: `GET /api/admin/teams/:id`'s `matches`. */
function matchesOf(teamId, games) {
  return games
    .filter((game) => game.resultStatus === "confirmed" && [game.home, game.away].some((side) => side?.team.id === teamId))
    .map((game) => {
      const home = game.home.team.id === teamId;
      const [own, other] = home ? [game.homeTouchdowns, game.awayTouchdowns] : [game.awayTouchdowns, game.homeTouchdowns];
      return { id: game.id, kind: game.kind, roundNumber: game.kind === "friendly" ? null : game.roundNumber, opponent: (home ? game.away : game.home).team.name,
        score: [own, other], confirmedAt: game.confirmedAt };
    })
    .sort((one, other) => Date.parse(other.confirmedAt) - Date.parse(one.confirmedAt));
}

const friendliesOf = (teamId) => GAMES.filter((game) => game.kind === "friendly" && [game.home, game.away].some((side) => side.team.id === teamId)).length;
/** Why a team cannot be deleted: its season history first, then its friendlies (server/routes/admin.mjs). */
const teamBlock = ({ team }) => (team.inActiveSeason || matchesOf(team.id, GAMES).some(({ kind }) => kind === "league") ? "season"
  : friendliesOf(team.id) ? "friendly" : null);
/** Why a coach cannot be deleted, in the order the delete refuses: one's own, a friendly, a season's history. */
function coachBlock(world, coach, mock) {
  const teams = teamsOf(world, coach);
  if (coach.id === mock.user.id) return "self";
  if (teams.some(({ team }) => friendliesOf(team.id))) return "friendly";
  return teams.some((holding) => teamBlock(holding) === "season") ? "season" : null;
}

const publicFields = ({ id, login, telegram, isAdmin = false, createdAt }) => ({ id, login, telegram, isAdmin, createdAt });
const teamsOf = (world, coach) => world.holdings.filter(({ ownerId }) => ownerId === coach.id);
/** A coach as `publicAdminUser` sends him: the public fields, his teams' count and their last change. */
function accountOf(world, coach) {
  const stamps = teamsOf(world, coach).map(({ team }) => team.updatedAt).sort();
  return { ...publicFields(coach), savedTeamCount: stamps.length, lastTeamUpdatedAt: stamps.at(-1) ?? null };
}
/** A coach as the list sends him: the account, his teams in the build, and whether the server's env file makes him. */
const listRow = (world, coach) => ({ ...accountOf(world, coach), draftTeamCount: teamsOf(world, coach).filter(({ team }) => team.stage === "draft").length,
  managedByServer: Boolean(coach.managedByServer) });

/** `GET /api/admin/users/:id`: the account with its last sign-in and its delete, the teams with their history. */
function coachPage(world, coach, mock) {
  const teams = teamsOf(world, coach).map((holding) => ({
    ...holding.team, logoData: null, matches: matchesOf(holding.team.id, GAMES).length, friendlies: friendliesOf(holding.team.id), deleteBlock: teamBlock(holding),
  }));
  const user = { ...accountOf(world, coach), managedByServer: Boolean(coach.managedByServer), lastLoginAt: coach.lastLoginAt ?? null,
    deleteBlock: coachBlock(world, coach, mock) };
  return { user, teams };
}

/** A team the admin may open, with its coach and its matches: the administration's, the coach's own, the league's. */
function teamFor(world, mock, teamId) {
  const held = world.holdings.find(({ team }) => team.id === teamId);
  if (held) return { owner: publicFields(world.coaches.find(({ id }) => id === held.ownerId)), team: held.team, matches: matchesOf(teamId, GAMES), held };
  const own = mock.teams.find(({ id }) => id === teamId);
  if (own) return { owner: publicFields(world.coaches.find(({ id }) => id === mock.user.id)), team: own, matches: matchesOf(teamId, mock.games), own: true };
  const league = leagueTeam(teamId);
  return league ? { ...league, matches: [] } : null;
}

/** The coach's games whose score waits for a confirmation, oldest proposal first (server/season/store.mjs `loadAwaitingGameRows`). */
function awaitingGames(games) {
  const stamp = (value) => (value ? Date.parse(value) : Infinity);
  return games
    .filter((game) => game.resultStatus === "awaiting_confirmation" && (game.kind === "friendly" || game.season?.status === "active"))
    .sort((one, other) => stamp(one.proposedAt) - stamp(other.proposedAt) || stamp(one.createdAt) - stamp(other.createdAt) || one.tableNumber - other.tableNumber)
    .map(({ homeMvps, awayMvps, ...game }) => game);
}

// ---- The writes -------------------------------------------------------------------------------------------------------

/** `POST /api/admin/coaches`: the coach, his team in the build and a temporary password, or the server's refusal. */
function makeCoach(world, body, { reply, refuse }) {
  const login = String(body.login ?? "").trim();
  const telegram = String(body.telegram ?? "").trim();
  const teamName = String(body.teamName ?? "").trim();
  const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
  if (login.length < LOGIN_MIN_LENGTH) return refuse(400, "LOGIN_TOO_SHORT");
  if (!telegram) return refuse(400, "TELEGRAM_REQUIRED");
  if (!teamName) return refuse(400, "TEAM_NAME_REQUIRED");
  if (!teamBySlug(baseTeamSlug)) return refuse(400, "FIELD_INVALID", { field: "baseTeamSlug" });
  if (world.coaches.some((coach) => coach.login.toLowerCase() === login.toLowerCase())) return refuse(409, "LOGIN_ALREADY_REGISTERED");
  world.made += 1;
  const stamp = new Date().toISOString();
  const coach = { id: `u${100 + world.made}`, login, telegram, createdAt: stamp, managedByServer: false, lastLoginAt: null };
  const roster = { ...rosterOf(baseTeamSlug, teamName, []), treasury: startingBudget, teamRerolls: 0, startingRerolls: 0 };
  const team = { ...teamOf(`nt${world.made}`, teamName, baseTeamSlug, roster, { days: 0, entered: body.enter === true }), stage: "draft", createdAt: stamp, updatedAt: stamp };
  world.coaches.push(coach);
  world.holdings.push({ ownerId: coach.id, team });
  return reply({ user: listRow(world, coach), team, password: NEW_COACH_PASSWORD, entryId: body.enter === true ? `e-${team.id}` : null }, 201);
}

/** `POST /api/admin/users/:id/teams`: a draft for that coach, as the coach's own create answers it. */
function makeTeam(world, coach, body, { reply, refuse }) {
  const name = String(body.name ?? "").trim();
  const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
  if (!name) return refuse(400, "TEAM_NAME_REQUIRED");
  if (!baseTeamSlug) return refuse(400, "BASE_TEAM_REQUIRED");
  world.made += 1;
  const stamp = new Date().toISOString();
  const team = { ...teamOf(`nt${world.made}`, name, baseTeamSlug, body.roster ?? {}, { days: 0 }), stage: "draft", createdAt: stamp, updatedAt: stamp };
  world.holdings.push({ ownerId: coach.id, team });
  return reply({ user: publicFields(coach), team }, 201);
}

/** `PATCH /api/admin/users/:id`: the login and the rights, refused for the server's admin and one's own rights. */
function editCoach(world, coach, body, { user, reply, refuse }) {
  const login = String(body.login ?? coach.login).trim();
  const isAdmin = Object.hasOwn(body, "isAdmin") ? Boolean(body.isAdmin) : Boolean(coach.isAdmin);
  if (login.length < LOGIN_MIN_LENGTH) return refuse(400, "LOGIN_TOO_SHORT");
  if (world.coaches.some((other) => other !== coach && other.login.toLowerCase() === login.toLowerCase())) return refuse(409, "LOGIN_ALREADY_REGISTERED");
  if (coach.managedByServer && (login.toLowerCase() !== coach.login.toLowerCase() || isAdmin !== Boolean(coach.isAdmin))) return refuse(409, "ADMIN_PROFILE_FROM_ENV");
  if (coach.id === user.id && !isAdmin) return refuse(409, "SELF_ADMIN_DEMOTE");
  Object.assign(coach, { login, isAdmin });
  return reply({ user: listRow(world, coach) });
}

/** `DELETE /api/admin/users/:id`: refused by what `deleteBlock` says, else the coach and his teams go. */
function deleteCoach(world, coach, mock) {
  const block = coachBlock(world, coach, mock);
  const codes = { self: "SELF_ADMIN_DELETE", friendly: "USER_IN_FRIENDLY_GAMES", season: "USER_IN_SEASON" };
  if (block) return mock.refuse(409, codes[block]);
  world.coaches.splice(world.coaches.indexOf(coach), 1);
  world.holdings = world.holdings.filter(({ ownerId }) => ownerId !== coach.id);
  return mock.reply({ ok: true });
}

/** `DELETE /api/admin/teams/:id` of a team of the administration's coaches: refused for its history, else it goes. */
function deleteTeam(world, found, { reply, refuse }) {
  if (!found?.held) return refuse(404, "TEAM_NOT_FOUND");
  const block = teamBlock(found.held);
  if (block) return refuse(409, block === "season" ? "TEAM_IN_SEASON_CANNOT_BE_DELETED" : "TEAM_IN_FRIENDLY_GAMES");
  world.holdings.splice(world.holdings.indexOf(found.held), 1);
  return reply({ ok: true, ownerId: found.held.ownerId });
}

/** A record of the fallen as `publicFallen` sends it, of a death written now (never kept: the snapshots only read). */
const fallenOf = (player, { cause = null, pairingId = null, diedAt = null } = {}) => ({
  id: `af-${Date.now()}`, player, cause, pairingId, roundNumber: null, diedAt: diedAt ?? new Date().toISOString(), fromMatch: Boolean(pairingId),
});

/** The writes of a team's content, each answered with the team as it is. */
async function teamWrite(request, found, tail, { readBody, reply, refuse }) {
  if (!found) return refuse(404, "TEAM_NOT_FOUND");
  const { method } = request;
  const { team } = found;
  if (!tail && method === "PATCH") return reply({ team });
  if (tail === "treasury" && method === "POST") return reply({ team, entry: null });
  if (tail === "fallen" && method === "POST") {
    const body = await readBody(request);
    const player = { id: `af-player-${Date.now()}`, rowIndex: 0, number: body.player?.number == null ? "" : String(body.player.number), name: String(body.player?.name ?? "") };
    return reply({ fallen: fallenOf(player, body) }, 201);
  }
  const death = tail?.match(/^players\/([^/]+)\/death$/);
  if (death && method === "POST") {
    const body = await readBody(request);
    const player = (team.roster.players ?? []).find(({ id }) => id === decodeURIComponent(death[1]));
    return player ? reply({ team, fallen: fallenOf(player, { cause: body.cause ?? null }) }, 201) : refuse(404, "PLAYER_NOT_FOUND");
  }
  if (/^fallen\/[^/]+$/.test(tail ?? "") && method === "DELETE") return reply({ team });
  return null;
}

// ---- The routes -------------------------------------------------------------------------------------------------------

const USER = /^\/api\/admin\/users\/([^/]+)(?:\/(reset-password|teams))?$/;
const TEAM = /^\/api\/admin\/teams\/([^/]+)(?:\/(.+))?$/;
const ACTIVATE = /^\/api\/teams\/([^/]+)\/activate$/;
const TEAM_READ = /^\/api\/teams\/([^/]+)\/(events|fallen|rolls|players\/([^/]+)\/history)$/;

/** `/api/admin/users…`: the list, a coach's page, his password, his teams, his account and his delete. */
async function answerCoaches(request, pathname, mock, world) {
  const { method } = request;
  if (pathname === "/api/admin/users" && method === "GET") return mock.reply({ users: world.coaches.map((coach) => listRow(world, coach)) });
  if (pathname === "/api/admin/coaches" && method === "POST") return makeCoach(world, await mock.readBody(request), mock);
  const [, id, tail] = pathname.match(USER) ?? [];
  if (!id) return null;
  const coach = world.coaches.find((item) => item.id === decodeURIComponent(id));
  if (tail === "teams" && method === "POST") return coach ? makeTeam(world, coach, await mock.readBody(request), mock) : mock.refuse(404, "COACH_NOT_FOUND");
  if (!coach) return mock.refuse(404, "USER_NOT_FOUND");
  if (tail === "reset-password" && method === "POST") {
    if (coach.managedByServer) return mock.refuse(409, "ADMIN_PASSWORD_FROM_ENV");
    return coach.id === mock.user.id ? mock.refuse(409, "SELF_PASSWORD_RESET") : mock.reply({ password: RESET_PASSWORD });
  }
  if (tail) return null;
  if (method === "GET") return mock.reply(coachPage(world, coach, mock));
  if (method === "PATCH") return editCoach(world, coach, await mock.readBody(request), mock);
  return method === "DELETE" ? deleteCoach(world, coach, mock) : null;
}

/** The admin's routes of teams and of the season: a team read and written, the awaiting scores, the season's writes. */
async function answerTeamsAndSeason(request, pathname, mock, world) {
  const { method } = request;
  if (pathname === "/api/admin/awaiting" && method === "GET") return mock.reply({ games: awaitingGames(mock.games) });
  if (pathname.startsWith("/api/season/admin/") && method !== "GET") return mock.reply(seasonBundle(mock));
  const activate = method === "POST" ? pathname.match(ACTIVATE) : null;
  if (activate) {
    const found = teamFor(world, mock, decodeURIComponent(activate[1]));
    return found ? mock.reply({ team: found.team }) : mock.refuse(404, "TEAM_NOT_FOUND");
  }
  const [, id, tail] = pathname.match(TEAM) ?? [];
  if (!id) return null;
  const found = teamFor(world, mock, decodeURIComponent(id));
  if (!tail && method === "GET") {
    return found ? mock.reply({ owner: found.owner, team: found.team, inMatch: false, matches: found.matches }) : mock.refuse(404, "TEAM_NOT_FOUND");
  }
  if (!tail && method === "DELETE") return deleteTeam(world, found, mock);
  return teamWrite(request, found, tail, mock);
}

/** What the roster reads beside a team the admin opens that is not the coach's own: no records, no fallen, no rolls, no career. */
function answerTeamReads(request, pathname, mock, world) {
  const [, id, what, playerId] = request.method === "GET" ? pathname.match(TEAM_READ) ?? [] : [];
  const found = id ? teamFor(world, mock, decodeURIComponent(id)) : null;
  if (!found || found.own) return null;
  if (what === "events") return mock.reply({ events: [], revision: found.team.revision });
  if (what === "fallen" || what === "rolls") return mock.reply({ [what]: [] });
  return mock.reply({ history: { playerId: decodeURIComponent(playerId), matches: [], outside: {} } });
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], games: object[], user: object, rival: object, readBody: Function, reply: Function,
 *   refuse: Function}} mock the mock's lists, its coach (an admin when MOCK_ADMIN=1) and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerAdmin(request, pathname, mock) {
  const admins = pathname.startsWith("/api/admin/") || pathname.startsWith("/api/season/admin/") || (request.method === "POST" && ACTIVATE.test(pathname));
  if (!mock.user.isAdmin) return admins ? mock.refuse(403, "ADMIN_REQUIRED") : null;
  const world = worldOf(mock);
  if (!admins) return answerTeamReads(request, pathname, mock, world);
  return (await answerCoaches(request, pathname, mock, world)) ?? (await answerTeamsAndSeason(request, pathname, mock, world));
}

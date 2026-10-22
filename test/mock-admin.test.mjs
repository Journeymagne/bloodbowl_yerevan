import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { errorPayload } from "../server/http/errors.mjs";
import { startingBudget, technicalPoints } from "../src/domain/league-rules.mjs";
import { answerAdmin } from "../scripts/mock/admin.mjs";
import { answerSeason } from "../scripts/mock/season.mjs";

/*
 * The mock API's administration (scripts/mock/admin.mjs, stage 12 Task 18): the coaches of the prototypes, a coach's
 * page, the admin's view of any team, the scores awaiting confirmation, the admin's writes, and the season the admin's
 * screens read (scripts/mock/season.mjs). The lists are the ones scripts/mock-api.mjs hands its answerers: the coach is
 * u1, an admin when MOCK_ADMIN=1; the rival u2; Mock Team (t1) and Mock Orcs (t3) are in the season, Mock Draft (t4)
 * is not.
 */

const SEASON = { id: "s1", name: "Mock Season", status: "active", currentRound: 3 };
const teamOf = (id, name, baseTeamSlug, changes = {}) => ({ id, name, baseTeamSlug, logoData: null, roster: { players: [], treasury: 120 }, revision: 3,
  stage: "active", activatedAt: null, inActiveSeason: true, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...changes });
const TEAMS = [teamOf("t1", "Mock Team", "teams/amazon"), teamOf("t3", "Mock Orcs", "teams/orc"),
  teamOf("t4", "Mock Draft", "teams/norse", { stage: "draft", inActiveSeason: false })];
const RIVAL_TEAMS = [{ id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" }, { id: "rt3", name: "Rival Wardens", baseTeamSlug: "teams/lizardmen" }];
const side = (owner, { id, name, baseTeamSlug }) => ({ user: { id: owner.id, login: owner.login }, team: { id, name, baseTeamSlug, logoUrl: null } });
const coach = { id: "u1", login: "coach" };
const rival = { id: "u2", login: "rival", telegram: "@rival", isAdmin: false, createdAt: "2026-10-01T00:00:00Z" };
/** A game as mock-api.mjs's `pairingOf` makes it: round 3, the coach's team at home. */
const game = (id, own, opposing, changes = {}) => ({
  id, kind: "league", season: SEASON, roundId: "r3", roundNumber: 3, roundStatus: "started", tableNumber: 1, homeEntryId: `e-${own.id}`,
  awayEntryId: `e-${opposing.id}`, homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null, homePoints: null,
  awayPoints: null, resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started", homeMvps: [], awayMvps: [],
  proposedByUserId: null, proposedHomeTouchdowns: null, proposedAwayTouchdowns: null, proposedHomeCasualties: null, proposedAwayCasualties: null,
  proposedAt: null, confirmedAt: null, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", ...changes,
  home: side(coach, own), away: side(rival, opposing), viewerIsHome: true, viewerIsProposer: false,
});
const confirmed = (touchdowns, points, at) => ({ resultStatus: "confirmed", homeTouchdowns: touchdowns[0], awayTouchdowns: touchdowns[1], homeCasualties: 0,
  awayCasualties: 0, homePoints: points[0], awayPoints: points[1], confirmedAt: at });
const GAMES = [
  game("g6", TEAMS[0], RIVAL_TEAMS[0], { kind: "friendly", season: null, roundId: null, roundNumber: 0, ...confirmed([1, 1], [0, 0], "2026-10-19T00:00:00Z") }),
  game("g1", TEAMS[0], RIVAL_TEAMS[0]),
  game("g3", TEAMS[1], RIVAL_TEAMS[1], { tableNumber: 3, resultStatus: "awaiting_confirmation", proposedByUserId: "u2", proposedHomeTouchdowns: 2,
    proposedAwayTouchdowns: 1, proposedHomeCasualties: 1, proposedAwayCasualties: 0, proposedAt: "2026-10-21T00:00:00Z" }),
  game("g4", TEAMS[0], { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" }, { roundId: "r1", roundNumber: 1, roundStatus: "completed",
    homeMvps: [{ id: "p5", name: "Linewoman Five" }], ...confirmed([2, 1], [3, 0], "2026-10-08T00:00:00Z") }),
];

/** A fresh copy of the mock's lists and helpers, as mock-api.mjs hands them to an answerer; `admin` is MOCK_ADMIN=1's. */
function freshMock({ admin = true } = {}) {
  const reply = (payload, status = 200) => ({ status, payload });
  const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);
  return { teams: structuredClone(TEAMS), games: structuredClone(GAMES), user: { ...coach, telegram: "@coach", isAdmin: admin, createdAt: "2026-10-01T00:00:00Z" },
    rival, readBody: async (request) => request.body ?? {}, reply, refuse };
}

/** Ask the administration: `{status, payload}`, or null when the route is not the module's. */
const ask = (mock, method, path, body) => answerAdmin({ method, url: path, body }, path, mock);
const codeOf = (answer) => [answer.status, answer.payload.error?.code];
const DAY = 86_400_000;
const daysBack = (stamp) => (Date.now() - Date.parse(stamp)) / DAY;

test("the coaches of the prototype, one an admin, one with a team in the build", async () => {
  const { status, payload } = await ask(freshMock(), "GET", "/api/admin/users");
  assert.equal(status, 200);
  const { users } = payload;
  // DeskAdminUsers: six coaches, eight teams; the admin is the signed-in coach (u1), orc_boss the rival of the matches (u2).
  assert.deepEqual(users.map(({ login }) => login), ["felstell", "orc_boss", "thalion", "nightblade", "gutbag", "newbie_coach"]);
  assert.deepEqual(users.map(({ telegram }) => telegram), ["@felstell", "@orc_boss", "@thalion_bb", "@nightblade", "@gutbag7", "@newbie"]);
  assert.deepEqual(users.slice(0, 2).map(({ id }) => id), ["u1", "u2"]);
  assert.deepEqual(users.map(({ savedTeamCount }) => savedTeamCount), [2, 2, 1, 1, 1, 1]);
  assert.deepEqual(users.map(({ isAdmin }) => isAdmin), [true, false, false, false, false, false]);
  assert.deepEqual(users.map(({ managedByServer }) => managedByServer), [true, false, false, false, false, false], "the server's admin is felstell");
  assert.deepEqual(users.map(({ draftTeamCount }) => draftTeamCount), [0, 0, 0, 0, 0, 1], "newbie_coach's team is in the build");
  // The last change of a team, as the prototype dates them a week back and today.
  assert.deepEqual(users.map(({ lastTeamUpdatedAt }) => Math.round(daysBack(lastTeamUpdatedAt))), [7, 9, 8, 12, 10, 0]);
  for (const user of users) {
    assert.deepEqual(Object.keys(user).sort(), ["createdAt", "draftTeamCount", "id", "isAdmin", "lastTeamUpdatedAt", "login", "managedByServer",
      "savedTeamCount", "telegram"], `${user.login}: publicAdminUser, draftTeamCount and managedByServer`);
  }
});

test("a coach's page with a team in the season and one with a friendly", async () => {
  const mock = freshMock();
  const { status, payload } = await ask(mock, "GET", "/api/admin/users/u2");
  assert.equal(status, 200);
  const { user, teams } = payload;
  // DeskAdminUser: orc_boss, in the league since 03.02.2025, signed in yesterday; no delete: his friendly.
  assert.deepEqual([user.login, user.telegram, user.createdAt.slice(0, 10), user.managedByServer, user.deleteBlock], ["orc_boss", "@orc_boss", "2025-02-03", false, "friendly"]);
  assert.equal(Math.round(daysBack(user.lastLoginAt)), 1);
  assert.deepEqual(teams.map(({ id, name, baseTeamSlug }) => [id, name, baseTeamSlug]), [["rt1", "Grimtusk Raiders", "teams/orc"], ["it1", "Iron Teeth", "teams/black-orc"]]);
  const [grimtusk, ironTeeth] = teams;
  assert.deepEqual([grimtusk.stage, grimtusk.inActiveSeason, grimtusk.matches, grimtusk.friendlies, grimtusk.deleteBlock], ["active", true, 6, 0, "season"]);
  assert.deepEqual([ironTeeth.stage, ironTeeth.inActiveSeason, ironTeeth.matches, ironTeeth.friendlies, ironTeeth.deleteBlock], ["active", false, 1, 1, "friendly"]);
  assert.equal(grimtusk.logoData, null, "a summary carries no logo");
  // One's own page: the delete is closed for being one's own; the server's admin.
  const own = (await ask(mock, "GET", "/api/admin/users/u1")).payload;
  assert.deepEqual([own.user.login, own.user.deleteBlock, own.user.managedByServer], ["felstell", "self", true]);
  assert.deepEqual(own.teams.map(({ name, deleteBlock }) => [name, deleteBlock]), [["Ashgrove Wardens", "season"], ["Cinderpeak Ash", null]]);
  // newbie_coach's team is the season's: entered while in the build, so his delete is closed by the season.
  const newbie = (await ask(mock, "GET", "/api/admin/users/u8")).payload;
  assert.deepEqual(newbie.teams.map(({ id, name, stage, inActiveSeason }) => [id, name, stage, inActiveSeason]), [["mb1", "Mudfoot Boyz", "draft", true]]);
  assert.equal(newbie.user.deleteBlock, "season");
  assert.equal(newbie.user.lastLoginAt, null, "no live session: no last sign-in");
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/admin/users/u99")), [404, "USER_NOT_FOUND"]);
});

test("the admin's team carries its owner and its matches", async () => {
  const mock = freshMock();
  const { status, payload } = await ask(mock, "GET", "/api/admin/teams/rt1");
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(payload).sort(), ["inMatch", "matches", "owner", "team"]);
  assert.deepEqual(payload.owner, { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, createdAt: payload.owner.createdAt });
  // DeskAdminTeamEdit: Grimtusk Raiders, Orc, 95k in the treasury, Thrag, Gorbag, Snik, Uzg and Morg first.
  const { team } = payload;
  assert.deepEqual([team.name, team.baseTeamSlug, team.stage, team.roster.treasury], ["Grimtusk Raiders", "teams/orc", "active", 95]);
  assert.deepEqual(team.roster.players.slice(0, 5).map(({ name }) => name), ["Thrag", "Gorbag", "Snik", "Uzg", "Morg"]);
  assert.ok(team.roster.players.length >= 11, "a roster that can play");
  assert.equal(payload.inMatch, false);
  // Its six matches, the newest first: round 6 against Silverbrook Rangers, won 2–1 (decision 24's sheet of the fallen).
  assert.equal(payload.matches.length, 6);
  assert.deepEqual(payload.matches[0], { id: payload.matches[0].id, kind: "league", roundNumber: 6, opponent: "Silverbrook Rangers", score: [2, 1],
    confirmedAt: payload.matches[0].confirmedAt });
  const stamps = payload.matches.map(({ confirmedAt }) => Date.parse(confirmedAt));
  assert.deepEqual(stamps, [...stamps].sort((one, other) => other - one), "newest first");
  // The roster reads its records and its fallen beside it: none, at the team's revision.
  assert.deepEqual((await ask(mock, "GET", "/api/teams/rt1/events")).payload, { events: [], revision: team.revision });
  assert.deepEqual((await ask(mock, "GET", "/api/teams/rt1/fallen")).payload, { fallen: [] });
  assert.deepEqual((await ask(mock, "GET", "/api/teams/rt1/rolls")).payload, { rolls: [] });
  assert.deepEqual((await ask(mock, "GET", "/api/teams/rt1/players/gr1/history")).payload, { history: { playerId: "gr1", matches: [], outside: {} } });
  // The coach's own team is the admin's too (the admin is the coach): its matches are the coach's games; its records the roster's.
  const ownTeam = (await ask(mock, "GET", "/api/admin/teams/t1")).payload;
  assert.deepEqual([ownTeam.owner.id, ownTeam.owner.login, ownTeam.team.name], ["u1", "felstell", "Mock Team"]);
  assert.deepEqual(ownTeam.matches.map(({ id, kind, roundNumber, opponent, score }) => [id, kind, roundNumber, opponent, score]),
    [["g6", "friendly", null, "Rival Team", [1, 1]], ["g4", "league", 1, "Rival Raiders", [2, 1]]]);
  assert.equal(await ask(mock, "GET", "/api/teams/t1/events"), null, "the coach's own team's records are scripts/mock/roster.mjs's");
  // A team of the league's other coaches: the season's.
  const newbie = (await ask(mock, "GET", "/api/admin/teams/mb1")).payload;
  assert.deepEqual([newbie.owner.login, newbie.team.name, newbie.team.stage, newbie.team.roster.treasury], ["newbie_coach", "Mudfoot Boyz", "draft", 150]);
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/admin/teams/zz")), [404, "TEAM_NOT_FOUND"]);
});

test("a coach who is no admin is refused", async () => {
  const mock = freshMock({ admin: false });
  for (const [method, path] of [["GET", "/api/admin/users"], ["GET", "/api/admin/users/u2"], ["GET", "/api/admin/teams/rt1"], ["GET", "/api/admin/awaiting"],
    ["POST", "/api/admin/coaches"], ["POST", "/api/admin/users/u2/reset-password"], ["PATCH", "/api/admin/teams/rt1"],
    ["PATCH", "/api/season/admin/settings"], ["POST", "/api/teams/mb1/activate"]]) {
    assert.deepEqual(codeOf(await ask(mock, method, path, {})), [403, "ADMIN_REQUIRED"], `${method} ${path}`);
  }
  // Another coach's team is not his to read: the roster's mock says so (404), not this one.
  assert.equal(await ask(mock, "GET", "/api/teams/rt1/events"), null);
  for (const path of ["/api/teams", "/api/season", "/api/games", "/api/players/u2"]) assert.equal(await ask(freshMock(), "GET", path), null, path);
});

test("the season has playoff places, a technical pairing and a score awaiting confirmation", async () => {
  const mock = freshMock();
  const { payload } = await answerSeason({ method: "GET" }, "/api/season", mock);
  assert.equal(payload.season.playoffPlaces, 4);
  const pairings = payload.rounds.flatMap((round) => round.pairings);
  const technical = pairings.filter(({ resultType }) => resultType === "technical");
  assert.equal(technical.length, 1);
  const [decided] = technical;
  // Round 2: Rival Raiders could not field a team against Sevan Raiders — 2–0, no casualties, 4 and 0 (2 + 2: content, 3. Team Management :81).
  assert.deepEqual([decided.roundNumber, decided.technicalReason, decided.resultStatus], [2, "no_team", "confirmed"]);
  assert.deepEqual([decided.preparationStatus, decided.postMatchStatus], ["not_started", "not_started"], "nobody played it");
  assert.deepEqual([decided.homeTouchdowns, decided.awayTouchdowns, decided.homeCasualties, decided.awayCasualties], [0, 2, 0, 0]);
  assert.deepEqual([decided.homePoints, decided.awayPoints], [technicalPoints({ won: false, reason: "no_team" }), technicalPoints({ won: true, reason: "no_team" })]);
  assert.deepEqual([decided.homePoints, decided.awayPoints], [0, 4]);
  for (const pairing of pairings.filter(({ id }) => id !== decided.id)) {
    assert.deepEqual([pairing.resultType, pairing.technicalReason], ["played", null], pairing.id);
  }
  // Neither the coach's team nor the first rival's played it (pre-flight L26): the table's first and fourth are as before.
  assert.ok(![decided.homeEntryId, decided.awayEntryId].some((id) => ["e-t1", "e-rt1"].includes(id)));
  assert.equal(payload.standings[0].team.id, "rt1");
  // Round 3 has one score awaiting its confirmation: g3, the rival's 2–1.
  const third = payload.rounds.find(({ roundNumber }) => roundNumber === 3);
  assert.deepEqual(third.pairings.filter(({ resultStatus }) => resultStatus === "awaiting_confirmation").map(({ id }) => id), ["g3"]);
  // The admin's block: every team with its stage and treasury; Mudfoot Boyz in the build, 450k of 600k spent.
  const { savedTeams } = payload.admin;
  for (const team of savedTeams) assert.ok(["draft", "active"].includes(team.stage) && Number.isFinite(team.treasury), team.id);
  const mudfoot = savedTeams.find(({ id }) => id === "mb1");
  assert.deepEqual([mudfoot.stage, startingBudget - mudfoot.treasury, mudfoot.owner.login], ["draft", 450, "newbie_coach"]);
  assert.equal(payload.entries.find((entry) => entry.team.id === "mb1").user.login, "newbie_coach", "in the season");
  assert.deepEqual(savedTeams.filter(({ id }) => !payload.entries.some((entry) => entry.team.id === id)).map(({ id }) => id).sort(), ["l2", "t4"],
    "what «+ Entry» may offer: the coach's team out of the season, and Lilit's withdrawn one");
  assert.ok(payload.admin.users.some(({ login }) => login === "newbie_coach"));
  assert.equal((await answerSeason({ method: "GET" }, "/api/season", freshMock({ admin: false }))).payload.admin, undefined, "a coach gets no admin block");
  // Every score awaiting confirmation, a closed round's and a friendly's too: here g3; a game without its MVPs, as on the server.
  const awaiting = await ask(mock, "GET", "/api/admin/awaiting");
  assert.equal(awaiting.status, 200);
  assert.deepEqual(awaiting.payload.games.map(({ id }) => id), ["g3"]);
  assert.equal(awaiting.payload.games[0].proposedHomeTouchdowns, 2);
  assert.equal(Object.hasOwn(awaiting.payload.games[0], "homeMvps"), false);
});

test("the admin's writes answer as the server does: a password once, a coach made, a delete refused for its history, the season and the team as they are", async () => {
  const mock = freshMock();
  // A reset: the prototype's temporary password (DeskAdminReset); never the server's admin, never one's own.
  assert.deepEqual(await ask(mock, "POST", "/api/admin/users/u2/reset-password"), { status: 200, payload: { password: "Hq4-wX9p-Lr2z" } });
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/admin/users/u1/reset-password")), [409, "ADMIN_PASSWORD_FROM_ENV"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/admin/users/u99/reset-password")), [404, "USER_NOT_FOUND"]);
  // A coach with a team, at one stroke (DeskAdminCoachNew): refused in the server's order, nothing made.
  const body = { login: "mudfoot_coach", telegram: "@mudfoot", teamName: "Mudfoot Lads", baseTeamSlug: "teams/orc", enter: true };
  for (const [change, code] of [[{ login: "ab" }, "LOGIN_TOO_SHORT"], [{ telegram: " " }, "TELEGRAM_REQUIRED"], [{ teamName: "" }, "TEAM_NAME_REQUIRED"]]) {
    assert.deepEqual(codeOf(await ask(mock, "POST", "/api/admin/coaches", { ...body, ...change })), [400, code]);
  }
  const unknownRace = await ask(mock, "POST", "/api/admin/coaches", { ...body, baseTeamSlug: "teams/nobody" });
  assert.deepEqual([...codeOf(unknownRace), unknownRace.payload.error.params.field], [400, "FIELD_INVALID", "baseTeamSlug"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/admin/coaches", { ...body, login: "Orc_Boss" })), [409, "LOGIN_ALREADY_REGISTERED"]);
  assert.equal((await ask(mock, "GET", "/api/admin/users")).payload.users.length, 6, "nothing made");
  const made = await ask(mock, "POST", "/api/admin/coaches", body);
  assert.equal(made.status, 201);
  assert.deepEqual([made.payload.user.login, made.payload.password, made.payload.team.name, made.payload.team.stage], ["mudfoot_coach", "k7Qp-2xLm-9wRa", "Mudfoot Lads", "draft"]);
  assert.deepEqual([made.payload.team.roster.treasury, made.payload.team.roster.players.length], [startingBudget, 0]);
  assert.equal(typeof made.payload.entryId, "string");
  const unentered = await ask(mock, "POST", "/api/admin/coaches", { ...body, login: "another_coach", enter: false });
  assert.deepEqual([unentered.payload.entryId, unentered.payload.team.inActiveSeason], [null, false]);
  const listed = (await ask(mock, "GET", "/api/admin/users")).payload.users;
  assert.deepEqual([listed.length, listed.find(({ login }) => login === "mudfoot_coach").draftTeamCount], [8, 1]);
  assert.equal((await ask(mock, "GET", `/api/admin/users/${made.payload.user.id}`)).payload.teams[0].name, "Mudfoot Lads", "«Open the coach» opens him");
  // A team for a coach is a draft, its roster as sent.
  const roster = { teamSlug: "teams/human", teamName: "Second", players: [], roster: {}, treasury: startingBudget };
  const second = await ask(mock, "POST", "/api/admin/users/u5/teams", { name: "Second", baseTeamSlug: "teams/human", roster });
  assert.deepEqual([second.status, second.payload.user.login, second.payload.team.stage, second.payload.team.roster.treasury], [201, "thalion", "draft", startingBudget]);
  // Deletes: closed ones refused with the server's codes, an open one done.
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/admin/users/u1")), [409, "SELF_ADMIN_DELETE"]);
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/admin/users/u2")), [409, "USER_IN_FRIENDLY_GAMES"]);
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/admin/users/u6")), [409, "USER_IN_SEASON"]);
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/admin/teams/rt1")), [409, "TEAM_IN_SEASON_CANNOT_BE_DELETED"]);
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/admin/teams/it1")), [409, "TEAM_IN_FRIENDLY_GAMES"]);
  assert.deepEqual(await ask(mock, "DELETE", "/api/admin/teams/ca1"), { status: 200, payload: { ok: true, ownerId: "u1" } });
  assert.deepEqual(codeOf(await ask(mock, "DELETE", `/api/admin/users/${made.payload.user.id}`)), [409, "USER_IN_SEASON"], "entered at his making");
  assert.deepEqual((await ask(mock, "DELETE", `/api/admin/users/${unentered.payload.user.id}`)).payload, { ok: true });
  assert.equal((await ask(mock, "GET", "/api/admin/users")).payload.users.some(({ login }) => login === "another_coach"), false);
  // The account: one's own rights and the server's admin are not changed here; another coach's are.
  assert.deepEqual(codeOf(await ask(mock, "PATCH", "/api/admin/users/u1", { login: "felstell", isAdmin: false })), [409, "ADMIN_PROFILE_FROM_ENV"]);
  const renamed = await ask(mock, "PATCH", "/api/admin/users/u2", { login: "orc_king", isAdmin: true });
  assert.deepEqual([renamed.status, renamed.payload.user.login, renamed.payload.user.isAdmin], [200, "orc_king", true]);
  // The season's writes answer the season as it is; a team's writes, the team as it is (the snapshots only read).
  const season = (await answerSeason({ method: "GET" }, "/api/season", mock)).payload;
  for (const [method, path] of [["PATCH", "/api/season/admin/settings"], ["POST", "/api/season/admin/rounds/generate"], ["DELETE", "/api/season/admin/entries/e-mb1"]]) {
    const answer = await ask(mock, method, path, {});
    assert.deepEqual([answer.status, answer.payload.season, answer.payload.rounds.length], [200, season.season, season.rounds.length], `${method} ${path}`);
  }
  const grimtusk = (await ask(mock, "GET", "/api/admin/teams/rt1")).payload.team;
  assert.deepEqual(await ask(mock, "PATCH", "/api/admin/teams/rt1", { revision: grimtusk.revision }), { status: 200, payload: { team: grimtusk } });
  assert.deepEqual((await ask(mock, "POST", "/api/admin/teams/rt1/treasury", { treasury: 120, note: "Fix" })).payload, { team: grimtusk, entry: null });
  assert.deepEqual((await ask(mock, "POST", "/api/teams/mb1/activate")).payload.team.stage, "draft");
  const died = await ask(mock, "POST", "/api/admin/teams/rt1/players/gr4/death", { cause: "Crowd", revision: grimtusk.revision });
  assert.deepEqual([died.status, died.payload.team, died.payload.fallen.player.name], [201, grimtusk, "Uzg"]);
  assert.deepEqual(await ask(mock, "DELETE", "/api/admin/teams/rt1/fallen/f9"), { status: 200, payload: { team: grimtusk } });
  const afterwards = await ask(mock, "POST", "/api/admin/teams/rt1/fallen", { player: { name: "Gorbag II", position: "Blitzer", number: 12 }, cause: "Before 3.0", pairingId: "ag6" });
  assert.deepEqual([afterwards.status, afterwards.payload.fallen.player.name, afterwards.payload.fallen.fromMatch], [201, "Gorbag II", true]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", "/api/admin/teams/zz", {})), [404, "TEAM_NOT_FOUND"]);
});

test("mock-api.mjs asks the administration right after the sign-in, and its player pages answer none of the admin's routes", () => {
  const api = readFileSync(new URL("../scripts/mock-api.mjs", import.meta.url), "utf8");
  assert.match(api, /import \{ answerAdmin \} from "\.\/mock\/admin\.mjs";/);
  assert.match(api, /\[answerAuth, answerAdmin, answerRoster,/, "before the roster's mock, which would call another coach's team not found");
  assert.doesNotMatch(api, /"\/api\/admin\//);
});

test("a team the mock makes is born in the build, as the server's since stage 12, and no save goes to disk", () => {
  const api = readFileSync(new URL("../scripts/mock-api.mjs", import.meta.url), "utf8");
  const make = api.slice(api.indexOf("function makeTeam"), api.indexOf("function deleteTeam"));
  assert.match(make, /stage: "draft"/, "the build's re-roll locks are the server's on the mock too");
  assert.doesNotMatch(api, /mock-saves|recordSave|writeFile/, "the browser check that read the saves back went in stage 12");
  assert.doesNotMatch(readFileSync(new URL("../scripts/mock/treasury.mjs", import.meta.url), "utf8"), /onSave/);
});

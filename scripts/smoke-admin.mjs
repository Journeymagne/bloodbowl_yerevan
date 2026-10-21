#!/usr/bin/env node
/**
 * smoke:admin — the administration of 3.0 on a running server (stage 12), as an admin walks it.
 *
 *   . output/12/admin.env && SMOKE_ADMIN_LOGIN="$ADMIN_LOGIN" SMOKE_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
 *     APP_URL=http://localhost:3080 npm run smoke:admin
 *
 * The admin signs in and makes a coach with a team at one stroke, entered in the season: the team is born in
 * the build with 600k, and the server's password signs the coach in. A Team Re-roll waits for the season — the
 * coach's save is refused in the build, goes through once the admin moves the team in — and nine re-rolls are
 * refused on every write. The admin sets the treasury with a reason (the admin's line of the ledger), adds a
 * fallen player afterwards and undoes him, sets the season's playoff places and takes them away, gives a pairing
 * of the season a technical result and changes its reason (4 to 0 when the opponent could not field a team, 2 to
 * 0 otherwise: content/Gata/Rules/3. Team Management.md:71, :81), resets the coach's password, and is refused the
 * delete of a coach with a season's history while one without any goes.
 *
 * It speaks HTTP only, and only to a site on this machine (http on localhost, 127.0.0.1 or [::1]), following no
 * redirect: it writes coaches, teams and results. It runs again on the same database: its coaches and teams carry
 * the run's stamp, a playoff setting it finds is put back, and its pairing goes into the season's round under way
 * (or one it starts when none is). What it cannot take back stays: a coach with a season entry is not deleted —
 * that is one of its checks — so each run leaves its coach and his rival in the season. Nothing it prints holds a
 * password or a token. The fallen player's position is read from public/data.en.json: run `npm run build` first.
 */
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { expandCollections } from "../src/data/reference.mjs";
import { PASSWORD_MIN_LENGTH } from "../src/domain/account.mjs";
import { applyPaidStaffChange } from "../src/domain/roster/costs.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SETTINGS = ["APP_URL", "SMOKE_ADMIN_LOGIN", "SMOKE_ADMIN_PASSWORD"];
const USAGE = "APP_URL=http://localhost:3080 SMOKE_ADMIN_LOGIN=… SMOKE_ADMIN_PASSWORD=… npm run smoke:admin";
// What no line of the output may show: the passwords the server makes, the admin's, and every session's token.
const SECRET_KEYS = new Set(["password", "token"]);
// The prototype's coach (orc_boss, Grimtusk Raiders) plays Orcs; a team made by the admin starts with 600k.
const RACE = "teams/orc";
const STARTING_TREASURY = 600;

/**
 * Where the smoke goes and as whom, from the environment: APP_URL — plain http on this machine, nothing else —
 * and the admin's SMOKE_ADMIN_LOGIN and SMOKE_ADMIN_PASSWORD. A refusal names what is missing, or the address
 * that is not local by its origin alone; it never repeats the password, nor a value that is not an address.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {{base: string, login: string, password: string}} `base`: the site's origin, without a trailing slash
 * @throws naming the settings missing, or the site that is not local
 */
export function smokeAdminTarget(env) {
  const missing = SETTINGS.filter((name) => !String(env?.[name] ?? "").trim());
  if (missing.length) throw new Error(`smoke:admin needs ${missing.join(", ")}: ${USAGE}`);
  let site = null;
  try {
    site = new URL(env.APP_URL.trim());
  } catch {
    site = null;
  }
  if (!site || site.protocol !== "http:" || !LOCAL_HOSTS.has(site.hostname)) {
    const named = site ? JSON.stringify(site.origin) : "an APP_URL that is not an address";
    throw new Error(`smoke:admin runs only against a local site (http on localhost, 127.0.0.1 or [::1]), not ${named}`);
  }
  return { base: site.origin, login: env.SMOKE_ADMIN_LOGIN, password: env.SMOKE_ADMIN_PASSWORD };
}

/**
 * The names one run gives what it makes: three coaches — the one the admin walks with, his rival in the season,
 * and a spare with no history whose delete goes through — and their teams, each with the run's stamp, so a second
 * run on the same database meets no login already taken (pre-flight L27).
 *
 * @param {string} stamp what tells this run from the others: a few letters and digits
 * @returns {{logins: Record<"coach"|"rival"|"spare", string>, teamNames: Record<"coach"|"rival"|"spare", string>}}
 */
export function smokeAdminRun(stamp) {
  const who = ["coach", "rival", "spare"];
  return {
    logins: Object.fromEntries(who.map((name) => [name, `smoke-admin-${stamp}-${name}`])),
    teamNames: Object.fromEntries(who.map((name) => [name, `Smoke ${name} ${stamp}`])),
  };
}

/** A value as a failure shows it: JSON, cut short, with every password and token hidden. */
function shown(value) {
  const text = JSON.stringify(value, (key, item) => (SECRET_KEYS.has(key) ? "[hidden]" : item));
  return String(text).slice(0, 300);
}

/** The error a step throws when an answer is not what it should be: what was wrong, and what came back. */
function need(condition, message, got) {
  if (!condition) throw new Error(`${message}: ${shown(got)}`);
}

/** A refusal with this code. */
function needCode(payload, code) {
  need(payload?.error?.code === code, `the refusal is not ${code}`, payload?.error);
}

/** These fields of `object`, for a comparison that names only what it checks. */
const picked = (object, keys) => Object.fromEntries(keys.map((key) => [key, object?.[key]]));

/**
 * One request to the site, and its answer, which must have the status expected: a failure names the request, the
 * status and what came back. No redirect is followed: a site that sends this elsewhere is not the one checked.
 */
async function api(base, pathname, { method = "GET", body, token = "", expect = 200 } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expect) throw new Error(`${method} ${pathname} -> ${response.status} (expected ${expect}): ${shown(payload)}`);
  return payload;
}

let built = null;
/** The built reference, read once: the races, as the server reads them. */
const reference = () => (built ??= readFile(new URL("../public/data.en.json", import.meta.url), "utf8")
  .then((text) => expandCollections(JSON.parse(text))));

/** A team's PATCH body as the team page sends it: the roster as `draft` holds it, on the revision the team is at. */
const saveBody = (team, draft) => ({ name: team.name, baseTeamSlug: team.baseTeamSlug, revision: team.revision, roster: rosterForStorage(draft) });

/**
 * `team`'s roster with one more Team Re-roll, paid for as the team page's step takes it (`stepResource`,
 * src/screens/team/manage/model.mjs) — but sent whatever the page's own lock would say: the server's is checked.
 */
function withTeamReroll(team) {
  const draft = normalizeDraft(team.roster), held = draft.teamRerolls;
  draft.teamRerolls = held + 1;
  applyPaidStaffChange(draft, "teamRerolls", held, held + 1);
  return draft;
}

/** Sign in, or be refused with the status expected. */
const signIn = (ctx, login, password, expect = 200) => ctx.call("/api/auth/login", { method: "POST", body: { login, password }, expect });

/**
 * «Тренер с командой»: the run's coach `who`, with a team of the race, entered in the running season or not.
 *
 * @returns {Promise<{id: string, password: string, team: object, entryId: string|null}>}
 */
async function makeCoach(ctx, who, enter) {
  const body = { login: ctx.run.logins[who], telegram: "@smoke_admin", teamName: ctx.run.teamNames[who], baseTeamSlug: RACE, enter };
  const made = await ctx.call("/api/admin/coaches", { method: "POST", token: ctx.admin.token, body, expect: 201 });
  need(made.user?.login === body.login && made.user.id, "the answer is not the coach made", made.user);
  need(typeof made.password === "string" && made.password.length >= PASSWORD_MIN_LENGTH, "the answer has no temporary password", Object.keys(made));
  need(enter ? Boolean(made.entryId) : made.entryId === null, `the coach's entry is not ${enter ? "made" : "absent"}`, made.entryId);
  return { id: made.user.id, password: made.password, team: made.team, entryId: made.entryId };
}

async function signInAdmin(ctx) {
  const health = await ctx.call("/api/health");
  need(health.ok === true, "the site is not healthy", health);
  const signed = await signIn(ctx, ctx.target.login, ctx.target.password);
  need(signed.token && signed.user?.isAdmin === true, "SMOKE_ADMIN_LOGIN does not sign in as an administrator", signed.user);
  ctx.admin = { id: signed.user.id, token: signed.token };
  needCode(await ctx.call("/api/admin/users", { expect: 401 }), "NOT_AUTHORIZED");
  const { users } = await ctx.call("/api/admin/users", { token: ctx.admin.token });
  need(users?.some((user) => user.id === ctx.admin.id && user.isAdmin === true), "the admin is not in the coaches as an admin", users?.length);
}

async function coachWithTeam(ctx) {
  const made = await makeCoach(ctx, "coach", true);
  const { team } = made;
  need(team?.stage === "draft" && team.activatedAt === null, "the coach's team is not in the build", picked(team, ["stage", "activatedAt"]));
  need(team.roster?.treasury === STARTING_TREASURY && (team.roster.players ?? []).length === 0,
    `the team does not start with ${STARTING_TREASURY}k and no players`, { treasury: team.roster?.treasury, players: team.roster?.players?.length });
  const signed = await signIn(ctx, ctx.run.logins.coach, made.password);
  need(signed.user?.id === made.id && signed.user.isAdmin === false, "the temporary password does not sign the coach in", signed.user);
  ctx.coach = { ...made, teamId: team.id, token: signed.token };
  needCode(await ctx.call("/api/admin/users", { token: ctx.coach.token, expect: 403 }), "ADMIN_REQUIRED");
  const { users } = await ctx.call("/api/admin/users", { token: ctx.admin.token });
  const listed = users?.find((user) => user.id === made.id);
  need(listed?.savedTeamCount === 1 && listed.draftTeamCount === 1, "the coaches do not count his team in the build", listed);
  const page = await ctx.call(`/api/players/${made.id}`, { token: ctx.coach.token });
  need(page.teams?.length === 1 && page.teams[0].stage === "draft", "the coach's page does not name the team's stage", page.teams);
  const { entries } = await ctx.call("/api/season", { token: ctx.admin.token });
  need(entries?.some((entry) => entry.id === made.entryId && entry.team?.id === team.id), "the team is not in the season", entries?.length);
}

async function rerollsByStage(ctx) {
  const { teamId } = ctx.coach;
  const read = async () => (await ctx.call(`/api/teams/${teamId}`, { token: ctx.coach.token })).team;
  const save = (team, draft, expect) => ctx.call(`/api/teams/${teamId}`, { method: "PATCH", token: ctx.coach.token, body: saveBody(team, draft), expect });
  const building = await read();
  const locked = await save(building, withTeamReroll(building), 422);
  needCode(locked, "STAGE_PURCHASE_LOCKED");
  need(isDeepStrictEqual(locked.error.params, { key: "teamRerolls", stage: "draft" }), "the lock does not name the Team Re-rolls of the build", locked.error.params);
  const moved = await ctx.call(`/api/teams/${teamId}/activate`, { method: "POST", token: ctx.admin.token });
  need(moved.team?.stage === "active" && moved.team.activatedAt, "the admin did not move the team into the season", picked(moved.team, ["stage", "activatedAt"]));
  const playing = await read();
  const { team: bought } = await save(playing, withTeamReroll(playing), 200);
  const held = normalizeDraft(bought?.roster);
  need(held.teamRerolls === 1 && bought.roster.treasury === STARTING_TREASURY - 120, "the Team Re-roll is not bought at 120", picked(held, ["teamRerolls", "treasury"]));
  // Nine: five Starting and four Team Re-rolls, the counters alone and the treasury as it is — the cap refuses it
  // on the coach's route and on the admin's, which the stage's lock does not hold, before anything else is looked at.
  const nine = { ...held, startingRerolls: 5, teamRerolls: 4 };
  for (const [path, token] of [[`/api/teams/${teamId}`, ctx.coach.token], [`/api/admin/teams/${teamId}`, ctx.admin.token]]) {
    const refused = await ctx.call(path, { method: "PATCH", token, body: saveBody(bought, nine), expect: 422 });
    const cap = [{ code: "REROLLS_MAX", params: { max: 8, count: 9 } }];
    need(isDeepStrictEqual(refused.violations, cap), `${path} does not refuse nine re-rolls as REROLLS_MAX alone`, refused);
  }
}

async function adminTreasury(ctx) {
  const { teamId } = ctx.coach;
  const read = await ctx.call(`/api/admin/teams/${teamId}`, { token: ctx.admin.token });
  need(read.owner?.id === ctx.coach.id && read.inMatch === false && Array.isArray(read.matches), "the admin's team does not name its coach, its match and its matches",
    { owner: read.owner?.id, inMatch: read.inMatch, matches: read.matches });
  const { team } = read, opening = team.roster.treasury, note = `Smoke ${ctx.stamp}: the admin's fix`;
  const body = { treasury: opening - 50, note, revision: team.revision };
  const set = await ctx.call(`/api/admin/teams/${teamId}/treasury`, { method: "POST", token: ctx.admin.token, body });
  need(set.team?.roster?.treasury === opening - 50, "the treasury is not set", set.team?.roster?.treasury);
  const line = { kind: "admin", delta: -50, balanceAfter: opening - 50, note };
  need(isDeepStrictEqual(picked(set.entry, Object.keys(line)), line), "the answer's line is not the admin's, 50 less, with the reason", set.entry);
  const { entries } = await ctx.call(`/api/teams/${teamId}/ledger`, { token: ctx.coach.token });
  need(entries?.[0]?.id === set.entry.id && isDeepStrictEqual(picked(entries[0], Object.keys(line)), line),
    "the head of the team's ledger is not the admin's line", entries?.[0]);
}

async function fallenAfterwards(ctx) {
  const { teamId } = ctx.coach;
  const race = (await reference()).teams.find((item) => item.slug === RACE);
  const [row] = race ? rowsForTeam(race) : [];
  need(row?.position, `the reference has no position for ${RACE}`, race?.slug);
  const name = `Smoke Fallen ${ctx.stamp}`;
  const body = { player: { name, position: row.position, number: 7 }, cause: "Smoke: died before 3.0 kept the dead" };
  const { fallen } = await ctx.call(`/api/admin/teams/${teamId}/fallen`, { method: "POST", token: ctx.admin.token, body, expect: 201 });
  need(fallen?.fromMatch === false && fallen.pairingId === null && fallen.player?.name === name && fallen.player.id,
    "the fallen player added afterwards is not a death outside a match", fallen);
  const listed = (await ctx.call(`/api/teams/${teamId}/fallen`, { token: ctx.coach.token })).fallen;
  need(listed?.some((item) => item.id === fallen.id && item.fromMatch === false), "the team's fallen do not show him as no match's", listed);
  const back = await ctx.call(`/api/admin/teams/${teamId}/fallen/${fallen.id}`, { method: "DELETE", token: ctx.admin.token });
  const returned = back.team?.roster?.players?.some((player) => player.id === fallen.player.id && player.name === name);
  need(returned, "the undo did not put him on the roster", back.team?.roster?.players);
  const rest = (await ctx.call(`/api/teams/${teamId}/fallen`, { token: ctx.coach.token })).fallen;
  need(Array.isArray(rest) && !rest.some((item) => item.id === fallen.id), "the undone death is still in the fallen", rest);
}

async function playoffPlaces(ctx) {
  const set = (playoffPlaces) => ctx.call("/api/season/admin/settings", { method: "PATCH", token: ctx.admin.token, body: { playoffPlaces } });
  const seen = async () => (await ctx.call("/api/season")).season?.playoffPlaces;
  const found = await seen();
  try {
    needCode(await ctx.call("/api/season/admin/settings", { method: "PATCH", token: ctx.coach.token, body: { playoffPlaces: 4 }, expect: 403 }), "ADMIN_REQUIRED");
    need((await set(4)).season?.playoffPlaces === 4, "the answer's season has not 4 playoff places", null);
    need((await seen()) === 4, "a guest's season has not 4 playoff places", null);
    need((await set(null)).season?.playoffPlaces === null, "the answer's season still has playoff places", null);
    need((await seen()) === null, "a guest's season still has playoff places", null);
  } finally {
    if (found !== null && found !== undefined) await set(found); // a setting the run found is left as it was
  }
}

/**
 * A pairing of the run's coach (home) and his rival in the running season: in its round under way (the latest
 * started), or in a round the admin makes and starts for it when none is — the table counts a started round's
 * results. A pairing left without a result, or a round left in draft, by a step that failed half-way is taken
 * away afterwards: either would hold the season's next round back.
 */
async function seasonPairing(ctx, homeEntryId, awayEntryId) {
  const admin = ctx.admin.token;
  const { rounds } = await ctx.call("/api/season", { token: admin });
  let round = rounds.filter((item) => item.status === "started").sort((a, b) => b.roundNumber - a.roundNumber)[0];
  if (!round) {
    need(!rounds.some((item) => item.status === "draft"), "the season has a round in draft and none under way: start or delete it, then run again", null);
    round = (await ctx.call("/api/season/admin/rounds", { method: "POST", token: admin, expect: 201 })).rounds.find((item) => item.status === "draft");
  }
  const body = { homeEntryId, awayEntryId };
  const added = await ctx.call(`/api/season/admin/rounds/${round.id}/pairings`, { method: "POST", token: admin, body, expect: 201 });
  const pairings = added.rounds.find((item) => item.id === round.id)?.pairings ?? [];
  const pairing = pairings.find((item) => item.homeEntryId === homeEntryId && item.awayEntryId === awayEntryId);
  need(pairing, "the pairing is not in its round", pairings.length);
  ctx.cleanups.push(async () => {
    const left = (await ctx.call("/api/season", { token: admin })).rounds;
    const own = left.flatMap((item) => item.pairings).find((item) => item.id === pairing.id);
    const remove = (path) => ctx.call(path, { method: "DELETE", token: admin });
    if (own && own.resultStatus !== "confirmed") await remove(`/api/season/admin/pairings/${pairing.id}`);
    if (round.status === "draft" && left.find((item) => item.id === round.id)?.status === "draft") await remove(`/api/season/admin/rounds/${round.id}`);
  });
  if (round.status !== "started") await ctx.call(`/api/season/admin/rounds/${round.id}/start`, { method: "POST", token: admin });
  return pairing;
}

// What a technical result leaves on its pairing besides its reason and points: 2–0 to the winner, CAS 0–0, confirmed.
const TECHNICAL = { resultType: "technical", resultStatus: "confirmed", homeTouchdowns: 2, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 };
const RESULT_KEYS = [...Object.keys(TECHNICAL), "technicalReason", "homePoints", "awayPoints"];

async function technicalResult(ctx) {
  const rival = await makeCoach(ctx, "rival", true);
  const pairing = await seasonPairing(ctx, ctx.coach.entryId, rival.entryId);
  const body = { mode: "technical", winner: "home", technicalReason: "no_team" };
  const { game } = await ctx.call(`/api/games/${pairing.id}`, { method: "PATCH", token: ctx.admin.token, body });
  // content/Gata/Rules/3. Team Management.md:71 and :81: 2 for a technical win, +2 when the opponent could not field a team.
  const noTeam = { ...TECHNICAL, technicalReason: "no_team", homePoints: 4, awayPoints: 0 };
  need(isDeepStrictEqual(picked(game, RESULT_KEYS), noTeam), "the opponent who could not field a team is not 4 to 0", picked(game, RESULT_KEYS));
  const changed = await ctx.call(`/api/season/admin/pairings/${pairing.id}/technical-reason`, { method: "PATCH", token: ctx.admin.token, body: { technicalReason: "other" } });
  const after = changed.rounds?.flatMap((round) => round.pairings).find((item) => item.id === pairing.id);
  const other = { ...TECHNICAL, technicalReason: "other", homePoints: 2, awayPoints: 0 };
  need(isDeepStrictEqual(picked(after, RESULT_KEYS), other), "another reason is not 2 to 0 with the score kept", picked(after, RESULT_KEYS));
  need(after.confirmedAt === game.confirmedAt, "the reason's change confirmed the result again", { before: game.confirmedAt, after: after.confirmedAt });
  const standing = (entryId) => picked(changed.standings?.find((item) => item.entryId === entryId), ["points", "games"]);
  need(isDeepStrictEqual([standing(ctx.coach.entryId), standing(rival.entryId)], [{ points: 2, games: 1 }, { points: 0, games: 1 }]),
    "the table does not add the server's points", [standing(ctx.coach.entryId), standing(rival.entryId)]);
}

async function passwordReset(ctx) {
  const { password } = await ctx.call(`/api/admin/users/${ctx.coach.id}/reset-password`, { method: "POST", token: ctx.admin.token });
  need(typeof password === "string" && password.length >= PASSWORD_MIN_LENGTH && password !== ctx.coach.password, "the reset gave no new password", null);
  const me = await ctx.call("/api/auth/me", { token: ctx.coach.token });
  need(me.user === null, "the coach's session outlived the reset", me.user?.id);
  needCode(await signIn(ctx, ctx.run.logins.coach, ctx.coach.password, 401), "WRONG_LOGIN_OR_PASSWORD");
  const fresh = await signIn(ctx, ctx.run.logins.coach, password);
  need(fresh.user?.id === ctx.coach.id, "the new password does not sign the coach in", fresh.user?.id);
  Object.assign(ctx.coach, { password, token: fresh.token });
}

async function deletes(ctx) {
  const admin = ctx.admin.token;
  needCode(await ctx.call(`/api/admin/users/${ctx.coach.id}`, { method: "DELETE", token: admin, expect: 409 }), "USER_IN_SEASON");
  const kept = await ctx.call(`/api/admin/users/${ctx.coach.id}`, { token: admin });
  need(kept.user?.deleteBlock === "season", "the coach's page does not say the season holds him", kept.user?.deleteBlock);
  const spare = await makeCoach(ctx, "spare", false);
  const page = await ctx.call(`/api/admin/users/${spare.id}`, { token: admin });
  need(page.user?.deleteBlock === null, "a coach without history is said to be held", page.user?.deleteBlock);
  await ctx.call(`/api/admin/users/${spare.id}`, { method: "DELETE", token: admin });
  needCode(await ctx.call(`/api/admin/users/${spare.id}`, { token: admin, expect: 404 }), "USER_NOT_FOUND");
  needCode(await ctx.call(`/api/admin/teams/${spare.team.id}`, { token: admin, expect: 404 }), "TEAM_NOT_FOUND");
}

const STEPS = [
  ["the admin signs in; a guest is refused the coaches", signInAdmin],
  ["a coach with a team at one stroke: in the season, the team in the build with 600k, the server's password signs him in, the administration refuses him", coachWithTeam],
  ["a Team Re-roll waits for the season: refused in the build, bought once the admin moves the team in; nine re-rolls are refused on every write", rerollsByStage],
  ["the admin's treasury: 50 less with its reason, the admin's line at the head of the ledger", adminTreasury],
  ["a fallen player added afterwards is no match's; undone by the admin, he is on the roster", fallenAfterwards],
  ["the playoff places: 4 in the season, then none", playoffPlaces],
  ["a technical result: 4 to 0 when the opponent could not field a team; another reason, 2 to 0 and nothing else", technicalResult],
  ["a password reset: the coach's sessions end, the old password no longer signs in, the new one does", passwordReset],
  ["a coach with a season's history is not deleted (USER_IN_SEASON); one without any is", deletes],
];

async function main() {
  let target = null;
  try {
    target = smokeAdminTarget(process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const stamp = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
  const ctx = { target, stamp, run: smokeAdminRun(stamp), cleanups: [], call: (pathname, options) => api(target.base, pathname, options) };
  console.log(`smoke:admin against ${target.base}, run ${stamp}\n`);
  let passed = 0, failed = "";
  for (const [name, step] of STEPS) {
    try {
      await step(ctx);
      passed += 1;
      console.log(`  ok   ${name}`);
    } catch (error) {
      failed = name;
      console.error(`  FAIL ${name}\n       ${error.message}`);
      break; // every step stands on what the ones before it made
    }
  }
  for (const cleanup of ctx.cleanups.reverse()) await cleanup().catch((error) => console.error(`  cleanup: ${error.message}`));
  if (failed) {
    console.error(`\nsmoke:admin FAILED at «${failed}» (${passed} of ${STEPS.length} steps passed)`);
    process.exit(1);
  }
  console.log(`\nsmoke:admin passed (${passed} steps)`);
}

// Run when it is the script node was started with; a test imports its pure part and runs nothing.
const invoked = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === await realpath(process.argv[1]).catch(() => "");
if (invoked) await main();

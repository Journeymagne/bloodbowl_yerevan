#!/usr/bin/env node
/**
 * End-to-end smoke test against a running server.
 *
 *   npm start          # in one terminal
 *   npm run smoke      # in another
 *
 * Override the target with APP_URL. The script creates a throwaway account and
 * a team, exercises the saved-team endpoints (its treasury and ledger, its
 * fallen, a player's roll, an advancement that takes it and its undo, a random
 * skill's two dice, the second taken and undone, a rename, a hire, its cancel
 * and a sale), the account's settings and password change,
 * then deletes the team and ends its sessions. The account itself stays. It also
 * checks that files outside the static whitelist are not served. The advancement,
 * hire and sale steps read the race's rules and the Skill Table from
 * public/data.en.json, as the server does: run `npm run build` first.
 */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import { expandCollections } from "../src/data/reference.mjs";
import { sameValues } from "../src/domain/post-match/events.mjs";
import { rolledDice } from "../src/domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys } from "../src/domain/roster/players.mjs";
import { advancementGrantOptions, statChoices, takeAdvancement, undoLastAdvancement } from "../src/domain/roster/progression.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import { hirePlayers, removeLeaguePlayer } from "../src/domain/roster/transfers.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";

const baseUrl = (process.env.APP_URL || "http://localhost:3002").replace(/\/$/, "");

let failures = 0;
let token = "";

function ok(message) {
  console.log(`  ok   ${message}`);
}

function fail(message, detail = "") {
  failures += 1;
  console.error(`  FAIL ${message}${detail ? `\n       ${detail}` : ""}`);
}

async function api(pathname, { method = "GET", body, expect = 200, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expect) {
    throw new Error(`${method} ${pathname} -> ${response.status} (expected ${expect}): ${JSON.stringify(payload).slice(0, 200)}`);
  }
  return payload;
}

async function step(name, run) {
  try {
    await run();
    ok(name);
  } catch (error) {
    fail(name, error.message);
  }
}

/** The error a step throws when an answer is not what it should be: what was wrong, and what came back. */
function fault(message, got) {
  return new Error(`${message}: ${JSON.stringify(got)?.slice(0, 300)}`);
}

function need(condition, message, got) {
  if (!condition) throw fault(message, got);
}

/** A team's PATCH body as the roster screen builds it: the draft as it stands, on the revision the team is at. */
const saveBody = (team, draft) => ({ name: team.name, baseTeamSlug: team.baseTeamSlug, revision: team.revision, roster: rosterForStorage(draft) });

/**
 * A team's PATCH body as its settings send it (`saveTeamRoster` with an identity, src/data/treasury.mjs): `saveBody`'s,
 * with the name and logo the team has unless `identity` names others, and its roster as it stands, under that name and
 * the team's own race (the settings change no race).
 */
function settingsBody(team, identity = {}) {
  const { name = team.name, logoData = team.logoData ?? null } = identity;
  return { ...saveBody({ ...team, name }, { ...normalizeDraft(team.roster), teamSlug: team.baseTeamSlug, teamName: name }), logoData };
}

// One transparent pixel: a logo for the rename to keep.
const SMOKE_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let built = null;
/** The built reference, read once: the races and the Skill Table, as the server reads them. */
const reference = () => (built ??= readFile(new URL("../public/data.en.json", import.meta.url), "utf8").then((text) => expandCollections(JSON.parse(text))));

console.log(`Smoke test against ${baseUrl}\n`);

await step("GET /api/health", async () => {
  const payload = await api("/api/health", { auth: false });
  if (payload.ok !== true) throw new Error(`unexpected payload: ${JSON.stringify(payload)}`);
});

const login = `smoke-${Date.now().toString(36)}`;
const password = `pw-${Math.random().toString(36).slice(2, 10)}`;
const newPassword = `${password}-new`;
let teamId = "";
let playerId = "";
let waitingRoll = null;

await step("POST /api/auth/register", async () => {
  const payload = await api("/api/auth/register", {
    method: "POST",
    auth: false,
    expect: 201,
    body: { login, password, telegram: "@smoke" },
  });
  if (!payload.token) throw new Error("no token returned");
  token = payload.token;
});

await step("GET /api/auth/me", async () => {
  const payload = await api("/api/auth/me");
  if (payload.user?.login !== login) throw new Error(`unexpected user: ${JSON.stringify(payload.user)}`);
});

await step("POST /api/teams", async () => {
  const payload = await api("/api/teams", {
    method: "POST",
    expect: 201,
    body: {
      name: "Smoke Team",
      baseTeamSlug: "teams/amazon",
      roster: {
        teamSlug: "teams/amazon",
        teamName: "Smoke Team",
        players: Array.from({ length: 11 }, (_, i) => ({ rowIndex: 0, name: `Smoke ${i + 1}` })),
        treasury: 600,
      },
    },
  });
  teamId = payload.team?.id;
  if (!teamId) throw new Error("no team id returned");
});

await step("GET /api/teams lists the new team", async () => {
  const payload = await api("/api/teams");
  if (!(payload.teams ?? []).some((team) => team.id === teamId)) throw new Error("team missing from list");
});

const teamPath = () => `/api/teams/${teamId}`;
const readTeam = async () => (await api(teamPath())).team;

/** The last advancement of the player `id` on `team` undone and saved, which must be the one that took `roll`: the team's rolls then. */
async function undoTaking(team, id, roll) {
  const undoing = normalizeDraft(team.roster);
  const undone = undoLastAdvancement(undoing.players.find((item) => item.id === id));
  need(undone.removed && undone.roll?.id === roll.id, "the advancement undone is not the one that took the roll", undone);
  await api(teamPath(), { method: "PATCH", body: saveBody(team, undoing) });
  return (await api(`${teamPath()}/rolls`)).rolls;
}

await step("GET /api/teams/:id has stage and activatedAt", async () => {
  const team = await readTeam();
  for (const key of ["stage", "activatedAt"]) need(Object.hasOwn(team, key), `the team has no ${key}`, Object.keys(team));
  need(team.stage === "active", "a new team is not active", { stage: team.stage, activatedAt: team.activatedAt });
});

await step("POST /api/teams/:id/treasury credits with a reason", async () => {
  const { revision } = await readTeam();
  const credited = await api(`${teamPath()}/treasury`, { method: "POST", expect: 201, body: { delta: 12.5, reason: "sponsor", revision } });
  need(credited.team?.roster?.treasury === 612.5, "the treasury is not 612.5", credited.team?.roster?.treasury);
  need(credited.entry?.kind === "manual", "the entry is not a manual one", credited.entry);
  const ledger = await api(`${teamPath()}/ledger`);
  need(credited.entry?.id, "the answer's entry has no id", credited.entry);
  need(ledger.entries?.[0]?.id === credited.entry.id, "the first ledger line is not the new entry", ledger.entries?.[0]);
  need(ledger.since, "the ledger does not say since when it is kept", ledger.since);
  need(ledger.total >= 1, "the ledger does not count its lines", ledger.total);
});

await step("POST /api/teams/:id/treasury refuses a debit below zero", async () => {
  const { revision } = await readTeam();
  const refused = await api(`${teamPath()}/treasury`, { method: "POST", expect: 422, body: { delta: -700, reason: "fine", revision } });
  need(refused.violations?.[0]?.code === "TREASURY_INVALID", "the refusal is not TREASURY_INVALID", refused);
});

await step("POST …/players/:pid/death and DELETE …/fallen/:fid", async () => {
  const team = await readTeam();
  playerId = team.roster?.players?.[0]?.id;
  need(playerId, "the created team's first player has no id", team.roster?.players?.[0]);
  const died = await api(`${teamPath()}/players/${playerId}/death`, { method: "POST", expect: 201, body: { cause: "smoke", revision: team.revision } });
  const alive = died.team?.roster?.players;
  need(Array.isArray(alive) && !alive.some((player) => player.id === playerId), "the dead player is still on the roster", died.fallen);
  const { fallen } = await api(`${teamPath()}/fallen`);
  const grave = fallen?.find((item) => item.id === died.fallen?.id);
  need(grave?.fromMatch === false && grave.player?.id === playerId, "the death is not in the fallen as a coach's own", fallen);
  const back = await api(`${teamPath()}/fallen/${grave.id}`, { method: "DELETE" });
  need(back.team?.roster?.players?.some((player) => player.id === playerId), "the undone death did not return the player", back.team?.roster?.players?.length);
  const rest = (await api(`${teamPath()}/fallen`)).fallen;
  need(Array.isArray(rest) && rest.length === 0, "the undone death is still in the fallen", rest);
});

await step("POST …/players/:pid/rolls is one roll a step", async () => {
  const ask = () => api(`${teamPath()}/players/${playerId}/rolls`, { method: "POST", body: { purpose: "stat" } });
  const first = await ask();
  const again = await ask();
  need(first.roll?.id && first.roll.id === again.roll?.id, "asking twice did not give one roll", { first: first.roll, again: again.roll });
  need(first.roll.params?.sides === 8, "a characteristic roll is not a D8", first.roll);
  waitingRoll = first.roll;
});

await step("an advancement takes the site's roll once; a resent one meets the 409 that holds it; undone, the roll is the player's again", async () => {
  const { teams, skillGroups } = await reference();
  const race = teams.find((item) => item.slug === "teams/amazon");
  const playerOf = (draft) => draft.players.find((item) => item.id === playerId);
  const ask = (body, expect = 200) => api(`${teamPath()}/players/${playerId}/rolls`, { method: "POST", expect, body });
  const teamRolls = async () => (await api(`${teamPath()}/rolls`)).rolls;
  // Five touchdowns, 15 SPP: a characteristic is 14 at the first advancement.
  const team = await readTeam();
  const scoring = normalizeDraft(team.roster);
  playerOf(scoring).spp = { ...playerOf(scoring).spp, touchdowns: 5 };
  const scored = (await api(teamPath(), { method: "PATCH", body: saveBody(team, scoring) })).team;
  const { roll } = await ask({ purpose: "stat" });
  need(roll?.id && roll.id === waitingRoll?.id, "the characteristic's roll is not the one that waited", { roll, waiting: waitingRoll });
  // The face's first characteristic the player can raise, as the screen offers it, else a skill in its place.
  const advancing = normalizeDraft(scored.roster), player = playerOf(advancing), row = rowsForTeam(race)[player.rowIndex];
  const stat = statChoices(row, player, roll.result?.roll).find((choice) => !choice.refusal)?.stat;
  const grant = stat ? { stat } : { skill: advancementGrantOptions(row, player, "primary", skillGroups).options[0]?.skill };
  const taken = takeAdvancement(race, row, player, { type: "stat", grant, roll: { id: roll.id, via: "site" } }, skillGroups);
  need(taken.applied, "the domain did not take the advancement", taken);
  const body = saveBody(scored, advancing);
  const advanced = (await api(teamPath(), { method: "PATCH", body })).team;
  // The answer is lost, the same body goes again on the revision it was made on: the 409 holds the advancement as sent.
  const resent = await api(teamPath(), { method: "PATCH", expect: 409, body });
  need(resent.error?.code === "TEAM_SAVED_ELSEWHERE", "a resent advancement is not TEAM_SAVED_ELSEWHERE", resent.error);
  need(sameValues(normalizeDraft(resent.team?.roster), normalizeDraft(body.roster)), "the 409's team does not hold the advancement as it was sent", resent.team?.roster?.players?.find((item) => item.id === playerId));
  const used = await teamRolls();
  need(used?.length === 1 && used[0].id === roll.id && used[0].usedAt !== null, "the team's rolls are not the one roll, used", used);
  const freed = await undoTaking(advanced, playerId, roll);
  need(freed?.length === 1 && freed[0].id === roll.id && freed[0].usedAt === null, "the undone advancement did not give the roll back", freed);
  const again = await ask({ purpose: "stat" });
  need(again.roll?.id === roll.id, "the roll given back is not the one asked for again", again.roll);
  const other = await ask({ purpose: "random_skill", category: "General" }, 409);
  need(other.error?.code === "DICE_ROLL_WAITING" && other.error.params?.purpose === "stat", "a random skill asked while the characteristic waits is not DICE_ROLL_WAITING for it", other.error);
});

await step("a random skill is two dice, both skills the player lacks and different; an advancement takes the second; undone, the roll is the player's again", async () => {
  const { teams, skillGroups } = await reference();
  const race = teams.find((item) => item.slug === "teams/amazon");
  const team = await readTeam();
  // Any player but `playerId`, whose characteristic roll waits and whom the death's undo put back at the end: the second, read now.
  const otherId = team.roster?.players?.[1]?.id;
  need(otherId, "the team's second player has no id", team.roster?.players?.[1]);
  need(otherId !== playerId, "the team's second player is the one whose characteristic roll waits", { otherId, playerId });
  const playerOf = (draft) => draft.players.find((item) => item.id === otherId);
  const ask = () => api(`${teamPath()}/players/${otherId}/rolls`, { method: "POST", body: { purpose: "random_skill", category: "General" } });
  const listed = async (id) => (await api(`${teamPath()}/rolls`)).rolls?.find((item) => item.id === id);
  // One touchdown, 3 SPP: a random skill is 3 at the first advancement.
  const scoring = normalizeDraft(team.roster);
  playerOf(scoring).spp = { ...playerOf(scoring).spp, touchdowns: 1 };
  const scored = (await api(teamPath(), { method: "PATCH", body: saveBody(team, scoring) })).team;
  const { roll } = await ask();
  const advancing = normalizeDraft(scored.roster), player = playerOf(advancing), row = rowsForTeam(race)[player.rowIndex];
  // A Linewoman holds no General skill: the column has more than one free skill, so the server throws both dice.
  const dice = rolledDice(roll), held = heldSkillKeys(row, player), skills = dice.map((die) => canonicalSkillName(die.skill));
  // Each die ends on a face of the D16 that is its skill's on the column: not a blank face beyond it.
  const faced = dice.every((die) => Number.isInteger(die.face) && roll?.params?.candidates?.[die.face - 1] === die.skill);
  need(roll?.id && roll.params?.sides === 16 && dice.length === 2 && faced && skills[0] !== skills[1],
    "a random skill is not two D16s of different skills, each ending on its face's skill", roll);
  need(!skills.some((skill) => held.has(skill)), "a die came up a skill the player holds", { skills, held: [...held] });
  const choice = { type: "random", grant: { skill: dice[1].skill }, roll: { id: roll.id, via: "site" } };
  const taken = takeAdvancement(race, row, player, choice, skillGroups);
  need(taken.applied, "the domain did not take the second die's skill", taken);
  const advanced = (await api(teamPath(), { method: "PATCH", body: saveBody(scored, advancing) })).team;
  const used = await listed(roll.id);
  need(used && used.usedAt !== null, "the advancement that takes the second die did not use the roll", used);
  const freed = (await undoTaking(advanced, otherId, roll))?.find((item) => item.id === roll.id);
  need(freed && freed.usedAt === null, "the undone advancement did not give the roll back", freed);
  const again = await ask();
  need(again.roll?.id === roll.id, "the roll given back is not the one asked for again", again.roll);
});

await step("a team renamed keeps its roster, race and logo", async () => {
  const save = async (team, identity) => (await api(teamPath(), { method: "PATCH", body: settingsBody(team, identity) })).team;
  // The logo first, as the settings' logo row sends it, so that the rename has one to keep.
  const before = await save(await readTeam(), { logoData: SMOKE_LOGO });
  const name = `${before.name} (smoke)`;
  await save(before, { name });
  const renamed = await readTeam();
  need(renamed.name === name && renamed.roster?.teamName === name, "the team does not have the new name", { name: renamed.name, teamName: renamed.roster?.teamName });
  // What a rename leaves as it was: the race, the logo, and the roster but for the name it carries.
  const kept = (team) => ({ baseTeamSlug: team.baseTeamSlug, logoData: team.logoData, roster: { ...normalizeDraft(team.roster), teamName: "" } });
  need(before.logoData === SMOKE_LOGO, "the logo was not saved", before.logoData?.slice(0, 40));
  // On a failure, what changed by name — the race, the logo, the roster's fields — not the values (a logo is long).
  const changed = (left, right) => Object.keys({ ...left, ...right }).filter((key) => !sameValues(left[key], right[key]));
  need(sameValues(kept(renamed), kept(before)), "the rename did not keep the race, the logo and the roster", {
    changed: changed(kept(before), kept(renamed)), roster: changed(kept(before).roster, kept(renamed).roster), race: [before.baseTeamSlug, renamed.baseTeamSlug],
  });
  const back = await save(renamed, { name: before.name });
  need(back.name === before.name && back.logoData === SMOKE_LOGO, "the old name did not come back with the logo", { name: back.name });
});

await step("PATCH journals a hire, its cancel and a sale exactly; a resent hire meets the 409 that holds it; a treasury below zero is refused", async () => {
  const race = (await reference()).teams.find((item) => item.slug === "teams/amazon");
  const ledger = () => api(`${teamPath()}/ledger`);
  const save = (team, draft) => api(teamPath(), { method: "PATCH", body: saveBody(team, draft) });
  const headIs = async (expected, what) => {
    const head = (await ledger()).entries?.[0];
    need(head?.kind === expected.kind && head.delta === expected.delta, `the head of the ledger is not ${what}`, head);
  };
  const opened = (await ledger()).total;
  const team = await readTeam();
  const hiring = normalizeDraft(team.roster);
  const [bought] = hirePlayers(race, hiring, { 0: 1 }).hired;
  need(bought?.id && bought.purchaseRefund === 50, "the cart did not buy a Linewoman at 50", bought);
  const body = saveBody(team, hiring);
  const hired = await api(teamPath(), { method: "PATCH", body });
  need(hired.team?.roster?.players?.some((player) => player.id === bought.id), "the hire is not on the saved roster", hired.team?.roster?.players?.length);
  await headIs({ kind: "hire", delta: -50 }, "the hire at 50");
  // The answer is lost, the same body goes again on the revision it was made on: the 409 holds the hire as sent.
  const resent = await api(teamPath(), { method: "PATCH", expect: 409, body });
  need(resent.error?.code === "TEAM_SAVED_ELSEWHERE", "a resent hire is not TEAM_SAVED_ELSEWHERE", resent.error);
  need(sameValues(normalizeDraft(resent.team?.roster), normalizeDraft(body.roster)), "the 409's team does not hold the hire as it was sent", resent.team?.roster?.players?.length);
  // The team it holds is the one the coach goes on from.
  const cancelling = normalizeDraft(resent.team.roster);
  need(removeLeaguePlayer(race, cancelling, bought.id, "cancel-purchase").applied, "the hire cannot be cancelled", cancelling.players.length);
  const cancelled = await save(resent.team, cancelling);
  await headIs({ kind: "cancel_purchase", delta: 50 }, "the cancelled purchase, 50 back");
  // The last player is the one the death's undo put back at the end, whose advancement the step before undid: his value
  // is a Linewoman's 50 again, and the sale half of it.
  const selling = normalizeDraft(cancelled.team.roster);
  need(removeLeaguePlayer(race, selling, selling.players.at(-1).id, "sell").applied, "the last player cannot be sold", selling.players.length);
  const sold = await save(cancelled.team, selling);
  await headIs({ kind: "sale", delta: 25 }, "the sale at half of 50");
  const broke = { ...normalizeDraft(sold.team.roster), treasury: -1 };
  const refused = await api(teamPath(), { method: "PATCH", expect: 422, body: saveBody(sold.team, broke) });
  need(refused.violations?.[0]?.code === "TREASURY_INVALID", "a treasury below zero is not TREASURY_INVALID", refused);
  // Each of the three is one line, no hire twice and nothing the diff did not explain.
  const after = await ledger();
  const lines = (after.entries ?? []).slice(0, after.total - opened).map(({ kind, delta }) => ({ kind, delta }));
  need(isDeepStrictEqual(lines, [{ kind: "sale", delta: 25 }, { kind: "cancel_purchase", delta: 50 }, { kind: "hire", delta: -50 }]), "the lines written are not the sale, the cancel and the one hire", lines);
});

await step("PATCH /api/auth/preferences and /api/auth/me", async () => {
  const saved = await api("/api/auth/preferences", { method: "PATCH", body: { themeMode: "dark", activeTeamId: teamId.toUpperCase() } });
  need(saved.preferences?.themeMode === "dark" && saved.preferences.activeTeamId === teamId, "the settings were not saved as sent", saved);
  const me = await api("/api/auth/me");
  need(isDeepStrictEqual(me.user?.preferences, saved.preferences), "/me shows other settings than the save did", { me: me.user?.preferences, saved: saved.preferences });
  const foreign = await api("/api/auth/preferences", { method: "PATCH", expect: 404, body: { activeTeamId: "44444444-4444-4444-8444-444444444444" } });
  need(foreign.error?.code === "TEAM_NOT_FOUND", "a team that is not there is not TEAM_NOT_FOUND", foreign);
});

await step("PATCH /api/auth/profile needs the current password", async () => {
  const wrong = await api("/api/auth/profile", { method: "PATCH", expect: 403, body: { password: newPassword } });
  need(wrong.error?.code === "CURRENT_PASSWORD_WRONG", "a password change without the current one is not refused as such", wrong);
  await api("/api/auth/profile", { method: "PATCH", body: { password: newPassword, currentPassword: password } });
  // The session that made the change goes on; only the others end.
  const kept = await api("/api/auth/me");
  need(kept.user?.login === login, "the session that changed the password has ended", kept);
  // That session is the register one; nothing is left behind, as the logout step ends the one that follows.
  await api("/api/auth/logout", { method: "POST", body: {} });
  const ended = await api("/api/auth/me"); // /me answers 200 with no user for a token that is not a session
  need(ended.user === null, "the logged-out session still answers", ended);
  const next = await api("/api/auth/login", { method: "POST", auth: false, body: { login, password: newPassword } });
  need(next.token, "no token for a login with the new password", next);
  token = next.token;
});

await step("PATCH /api/teams/:id persists a change", async () => {
  const team = await readTeam();
  await api(teamPath(), {
    method: "PATCH",
    body: {
      name: "Smoke Team Renamed",
      baseTeamSlug: "teams/amazon",
      revision: team.revision,
      roster: { ...team.roster, teamName: "Smoke Team Renamed", treasury: 550 },
    },
  });
  const payload = await api(teamPath());
  if (payload.team?.name !== "Smoke Team Renamed") throw new Error(`name not persisted: ${payload.team?.name}`);
  if (payload.team?.roster?.treasury !== 550) throw new Error(`roster not persisted: ${JSON.stringify(payload.team?.roster)}`);
});

await step("GET /api/teams/:id requires authentication", async () => {
  await api(`/api/teams/${teamId}`, { auth: false, expect: 401 });
});

await step("DELETE /api/teams/:id", async () => {
  await api(`/api/teams/${teamId}`, { method: "DELETE" });
  await api(`/api/teams/${teamId}`, { expect: 404 });
});

await step("POST /api/auth/logout", async () => {
  await api("/api/auth/logout", { method: "POST", body: {} });
});

console.log("\nStatic file exposure:");
for (const pathname of ["/.env", "/.git/config", "/package.json", "/server/init.sql", "/docker-compose.yml"]) {
  await step(`${pathname} is not served`, async () => {
    const response = await fetch(`${baseUrl}${pathname}`);
    if (response.status !== 404) throw new Error(`expected 404, got ${response.status}`);
  });
}
for (const pathname of ["/", "/src/app.js", "/public/data.en.json"]) {
  await step(`${pathname} is served`, async () => {
    const response = await fetch(`${baseUrl}${pathname}`);
    if (!response.ok) throw new Error(`expected 200, got ${response.status}`);
  });
}

console.log(failures ? `\nSmoke test FAILED: ${failures} problem(s).` : "\nSmoke test passed.");
process.exit(failures ? 1 : 0);

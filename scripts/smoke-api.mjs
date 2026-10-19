#!/usr/bin/env node
/**
 * End-to-end smoke test against a running server.
 *
 *   npm start          # in one terminal
 *   npm run smoke      # in another
 *
 * Override the target with APP_URL. The script creates a throwaway account and
 * a team, exercises the saved-team endpoints (its treasury and ledger, its
 * fallen, a player's roll, a hire, its cancel and a sale), the account's settings
 * and password change, then deletes the team and ends its sessions. The account
 * itself stays. It also checks that files outside the static whitelist are not
 * served. The hire and sale step reads the race's rules from public/data.en.json,
 * as the server does: run `npm run build` first.
 */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import { expandCollections } from "../src/data/reference.mjs";
import { sameValues } from "../src/domain/post-match/events.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import { hirePlayers, removeLeaguePlayer } from "../src/domain/roster/transfers.mjs";

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
});

await step("PATCH journals a hire, its cancel and a sale exactly; a resent hire meets the 409 that holds it; a treasury below zero is refused", async () => {
  const data = expandCollections(JSON.parse(await readFile(new URL("../public/data.en.json", import.meta.url), "utf8")));
  const race = data.teams.find((item) => item.slug === "teams/amazon");
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

#!/usr/bin/env node
/**
 * End-to-end smoke test against a running server.
 *
 *   npm start          # in one terminal
 *   npm run smoke      # in another
 *
 * Override the target with APP_URL. The script creates a throwaway account,
 * exercises the saved-team endpoints and deletes everything it created.
 * It also checks that files outside the static whitelist are not served.
 */
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

console.log(`Smoke test against ${baseUrl}\n`);

await step("GET /api/health", async () => {
  const payload = await api("/api/health", { auth: false });
  if (payload.ok !== true) throw new Error(`unexpected payload: ${JSON.stringify(payload)}`);
});

const login = `smoke-${Date.now().toString(36)}`;
const password = `pw-${Math.random().toString(36).slice(2, 10)}`;
let teamId = "";

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
      baseTeamSlug: "amazon",
      roster: { teamSlug: "amazon", teamName: "Smoke Team", players: [], treasury: 600 },
    },
  });
  teamId = payload.team?.id;
  if (!teamId) throw new Error("no team id returned");
});

await step("GET /api/teams lists the new team", async () => {
  const payload = await api("/api/teams");
  if (!(payload.teams ?? []).some((team) => team.id === teamId)) throw new Error("team missing from list");
});

await step("PATCH /api/teams/:id persists a change", async () => {
  await api(`/api/teams/${teamId}`, {
    method: "PATCH",
    body: {
      name: "Smoke Team Renamed",
      baseTeamSlug: "amazon",
      roster: { teamSlug: "amazon", teamName: "Smoke Team Renamed", players: [], treasury: 550 },
    },
  });
  const payload = await api(`/api/teams/${teamId}`);
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

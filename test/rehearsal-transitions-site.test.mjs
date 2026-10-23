import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { postMatch, siteApi, siteVersion } from "../scripts/rehearsal/transitions-api.mjs";
import { tableChanges } from "../scripts/rehearsal/transitions-checks.mjs";
import { finishTransitions } from "../scripts/rehearsal/transitions-finish.mjs";

/*
 * How rehearsal:transitions speaks to a site (stage 09b's final review): no redirect followed, the site's version read
 * before anything is written, a refused step of a match named by its side and step, a sign-in refused said for every
 * state, and a table that moved said by the entries that moved.
 */

/** A server on this machine answering every request with `answer(request)` → `{status, headers?, body?}`; `hits` the paths asked. */
async function stubSite(answer) {
  const hits = [];
  const server = http.createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    const { status, headers = {}, body = "" } = answer(request);
    response.writeHead(status, { "Content-Type": "application/json", ...headers });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => { server.listen(0, "127.0.0.1", resolve); });
  return { base: `http://127.0.0.1:${server.address().port}`, hits, close: () => new Promise((resolve) => { server.close(resolve); }) };
}

test("a redirect is followed nowhere: refused, with where it pointed", async () => {
  const site = await stubSite((request) => (request.url === "/api/season"
    ? { status: 308, headers: { Location: "https://example.org/api/season" } } : { status: 200, body: { moved: true } }));
  try {
    const api = siteApi(site.base);
    await assert.rejects(api.request("GET", "/api/season"), /GET \/api\/season → 308, a redirect to https:\/\/example\.org\/api\/season: rehearsal:transitions follows none/);
    await assert.rejects(api.ok("POST", "/api/season", { body: { a: 1 } }), /308, a redirect to https:\/\/example\.org/);
    assert.deepEqual(site.hits, ["GET /api/season", "POST /api/season"], "the address it pointed to is never asked");
  } finally {
    await site.close();
  }
});

test("the site's version is one read with no session: 3.0 asks a stranger to sign in for a team's rolls, 2.1.0 has no such route", async () => {
  const answers = { "3.0": { status: 401, body: { error: { code: "NOT_AUTHORIZED" } } }, "2.1.0": { status: 404, body: { error: { code: "ROUTE_NOT_FOUND" } } } };
  for (const [version, answer] of Object.entries(answers)) {
    const site = await stubSite(() => answer);
    try {
      assert.equal(await siteVersion(siteApi(site.base)), version);
      assert.deepEqual(site.hits, ["GET /api/teams/00000000-0000-4000-8000-000000000000/rolls"]);
    } finally {
      await site.close();
    }
  }
  const other = await stubSite(() => ({ status: 503, body: { error: { code: "MAINTENANCE" } } }));
  try {
    await assert.rejects(siteVersion(siteApi(other.base)), new RegExp(`${other.base.replace(/[.]/g, "\\.")} answers GET /api/teams/…/rolls with 503 .*neither 2\\.1\\.0 nor 3\\.0`));
  } finally {
    await other.close();
  }
});

/** A site as --finish meets it: `version`, and `login` answering each sign-in; every call listed in `calls`. */
function finishSite({ version = "3.0", login = () => ({ status: 200, data: { token: "t" } }) } = {}) {
  const calls = [];
  const api = {
    base: "http://localhost:3077",
    async request(method, path, options = {}) {
      calls.push(`${method} ${path}`);
      if (path.endsWith("/rolls")) return version === "3.0" ? { status: 401, data: { error: { code: "NOT_AUTHORIZED" } } } : { status: 404, data: { error: { code: "ROUTE_NOT_FOUND" } } };
      if (path === "/api/auth/login") return login(options.body);
      return { status: 409, data: { error: { code: "POST_ACTION" } } };
    },
    async ok(method, path, options) {
      const answer = await api.request(method, path, options);
      if (answer.status < 200 || answer.status > 299) throw new Error(`${method} ${path} → ${answer.status} ${JSON.stringify(answer.data)}`);
      return answer.data;
    },
  };
  return { api, calls };
}

const RECORD = { coaches: { home: { login: "transitions-home-1", password: "p" }, away: { login: "transitions-away-1", password: "p" } }, cases: {}, season: null };
const ADMIN = { login: "admin", password: "a" };

test("--finish reads the site's version first: a 2.1.0 site is refused before any sign-in", async () => {
  const { api, calls } = finishSite({ version: "2.1.0" });
  await assert.rejects(finishTransitions(api, RECORD, { admin: ADMIN }), /http:\/\/localhost:3077 is a 2\.1\.0 site, and --finish runs against 3\.0 only — nothing was written to it/);
  assert.deepEqual(calls, ["GET /api/teams/00000000-0000-4000-8000-000000000000/rolls"]);
});

test("a sign-in refused fails every state with a line of its own, saying whose it was", async () => {
  const { api } = finishSite({ login: (body) => (body.login === "transitions-away-1" ? { status: 401, data: { error: { code: "LOGIN_FAILED" } } } : { status: 200, data: { token: "t" } }) });
  const results = await finishTransitions(api, RECORD, { admin: ADMIN });
  assert.deepEqual(results.map((result) => [result.state, result.ok]), [
    ["preparation", false], ["started", false], ["postPlayers", false], ["proposed", false], ["challenge", false], ["table", false],
  ]);
  for (const result of results) assert.match(result.error, /^before the first state: the sign-in of the away coach \(transitions-away-1\) — POST \/api\/auth\/login → 401/);
});

test("a refused step of the post-match says its side, the step it was on and the action", async () => {
  const { api } = finishSite();
  const post = postMatch(api, "g1", { home: "h", away: "a" });
  post.answer = { postMatch: { revision: 4, home: { stage: 3 }, away: { stage: 2 } } };
  await assert.rejects(post.act("home", { type: "lock-roster" }), /^Error: the post-match's home side on its «roster» step, «lock-roster»: PATCH \/api\/games\/g1\/post-match → 409/);
  await assert.rejects(post.finish(), /^Error: the post-match's finish: POST \/api\/games\/g1\/finish → 409/);
});

test("a table that moved is said by the entries that moved, not by the tables", () => {
  const row = (entryId, points, more = {}) => ({ entryId, points, games: 3, byes: 0, touchdowns: 4, casualties: 2, ...more });
  const before = { id: "s1", standings: [row("e1", 9), row("e2", 6), row("e3", 3)] };
  assert.deepEqual(tableChanges(before, structuredClone(before)), []);
  const after = { id: "s1", standings: [row("e1", 9), row("e2", 8, { games: 4 }), row("e4", 0, { games: 0 })] };
  assert.deepEqual(tableChanges(before, after), [
    "entry e2: points 6 → 8, games 3 → 4", "entry e3 is gone", "entry e4 is new: points 0, games 0, byes 0, touchdowns 4, casualties 2",
  ]);
  assert.deepEqual(tableChanges(before, { ...before, id: "s2" }), ["the season s1 → s2"]);
  assert.deepEqual(tableChanges(before, { id: "s1", standings: [...before.standings].reverse() }), ["the entries are the same, in another order"]);
});

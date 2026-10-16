/**
 * The API on a throwaway database, called the way the server calls it.
 *
 * `callApi` hands a request to `handleApi` — the chain server.mjs runs — with no socket in
 * between, so the routes, their SQL and their locks are the real ones and a test reads the status,
 * the JSON and the headers a client would. `withApiDatabase` is the database those routes talk to:
 * the server's own pool pointed at a scratch database, so calls made together are connections made
 * together. The seed helpers write rows the way the site leaves them. `recording` and `loggingErrors`
 * are for the tests that look at what a request did inside its transaction, and at what it logged.
 */
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { normalizeLogin } from "../../server/api/serializers.mjs";
import { hashPassword, hashToken } from "../../server/auth/session.mjs";
import { pool } from "../../server/db/pool.mjs";
import { loadTeamReference } from "../../server/domain/roster.mjs";
import { handleApi } from "../../server/routes/index.mjs";
import { withScratchDatabase, withServerPool } from "./scratch-db.mjs";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
let reference = null;

/**
 * One request through the API chain.
 *
 * @param {string} method
 * @param {string} path with its query string
 * @param {{token?: string, body?: unknown}} [options] a session token, and a body sent as JSON
 * @returns {Promise<{status: number, body: any, headers: Record<string, string>}>} `body` is the
 *   parsed JSON, null when there is none; header names are lower-case
 */
export async function callApi(method, path, { token, body } = {}) {
  reference ??= loadTeamReference(rootDir); // the race tables the roster rules read, loaded once
  await reference;
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(request, { method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const headers = {};
  let status = null, answer = null;
  const setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  const response = {
    __request: request,
    setHeader,
    writeHead(code, fields = {}) { status = code; for (const [name, value] of Object.entries(fields)) setHeader(name, value); },
    end(chunk) { answer = { status, body: chunk?.length ? JSON.parse(String(chunk)) : null, headers }; },
  };
  await handleApi(request, response, new URL(path, "http://localhost"));
  if (!answer) throw new Error(`${method} ${path} was never answered`);
  return answer;
}

/** A session for `userId`: the token a client would hold, stored the way the server stores it. */
export async function sessionFor(client, userId) {
  const token = randomBytes(32).toString("base64url");
  await client.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')",
    [hashToken(token), userId]);
  return token;
}

/** A coach, or an admin with `{ admin: true }`: password `<login>-pw`, and a session already open. */
export async function seedCoach(client, login, { admin = false } = {}) {
  const password = `${login}-pw`;
  const { rows } = await client.query(
    "INSERT INTO users (login, login_key, telegram, password_hash, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [login, normalizeLogin(login), `@${login}`, hashPassword(password), admin]);
  return { id: rows[0].id, login, password, token: await sessionFor(client, rows[0].id) };
}

/**
 * A saved team of `players` players on the first roster row (`p0`, `p1`, ...) with 100 in the treasury,
 * as the site stores it. `roster` is laid over those fields, so `{ players: [...] }` replaces the
 * players. Returns the team's id.
 */
export async function seedTeam(client, ownerId, { name = "Lions", slug = "teams/human", players = 11, roster = {}, stage = "active" } = {}) {
  const blob = { treasury: 100, players: Array.from({ length: players }, (_, n) => ({ id: `p${n}`, rowIndex: 0, spp: {} })), ...roster };
  const { rows } = await client.query(
    "INSERT INTO saved_teams (user_id, name, base_team_slug, roster, stage) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [ownerId, name, slug, JSON.stringify(blob), stage]);
  return rows[0].id;
}

/** The `saved_teams` row as the database holds it now. */
export async function teamRow(client, id) {
  return (await client.query("SELECT * FROM saved_teams WHERE id = $1", [id])).rows[0];
}

/**
 * `run({ client, url })` on a scratch database with every migration applied and the server's pool
 * answering from it. `client` is the test's own connection, to seed with and to read back what a
 * route wrote; `url` is what `withForcedOverlap` connects to.
 */
export function withApiDatabase(run) {
  return withScratchDatabase(({ client, url }) => withServerPool(url, () => run({ client, url })));
}

/**
 * What `run` did to the database on the connections the server's pool lent it: each statement as written,
 * in order, and `release` when a connection went back. A statement run straight on the pool (who is asking,
 * the first look at the team) is not a transaction's and is not here.
 */
export async function recording(run) {
  const log = [], connect = pool.connect;
  pool.connect = async (...args) => {
    const client = await connect.apply(pool, args);
    return new Proxy(client, {
      get(target, key) {
        if (key === "query") return (...query) => { log.push(String(query[0]).trim().replace(/\s+/g, " ")); return target.query(...query); };
        if (key === "release") return (...release) => { log.push("release"); return target.release(...release); };
        return typeof target[key] === "function" ? target[key].bind(target) : target[key];
      },
    });
  };
  try { return { result: await run(), log }; } finally { pool.connect = connect; }
}

/** `run` with console.error held back, and what was said to it: a 500 is logged on purpose, and the test output stays quiet. */
export async function loggingErrors(run) {
  const original = console.error, logged = [];
  console.error = (...args) => logged.push(args);
  try { return { result: await run(), logged }; } finally { console.error = original; }
}

/**
 * Passwords, session tokens, and who is making this request.
 *
 * Moved out of server.mjs by step 4.9: every route starts by asking who is
 * calling, so this cannot stay in the file the routes are being lifted out of.
 *
 * Two properties worth keeping in mind while reading it. A session token is
 * stored hashed, so a leaked database does not hand out live sessions — the
 * same reason a password is stored as a scrypt hash with its own salt. And
 * verifyPassword compares with timingSafeEqual rather than `===`, because the
 * time a mismatch takes should not depend on how much of the hash matched.
 */
import crypto from "node:crypto";

import { pool } from "../db/pool.mjs";
import { isAdminUser } from "../api/serializers.mjs";

const sessionDays = Number(process.env.SESSION_DAYS || 30);

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password, stored = "") {
  const [method, salt, expected] = stored.split(":");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

export function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

export async function currentUser(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT users.*
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash],
  );
  const user = result.rows[0] ?? null;
  return user ? { ...user, is_admin: isAdminUser(user) } : null;
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(sessionDays)],
  );
  return token;
}

/**
 * Delete sessions that have already expired.
 *
 * Nothing did, ever. A row is written on every login and removed only when
 * somebody logs out, so a coach who signs in from a phone and closes the tab
 * leaves a row behind that stops being useful in thirty days and stays for
 * good. It is not a leak of anything — an expired row cannot authenticate,
 * currentUser checks the date — it is a table that only grows, on the same
 * disk the season lives on.
 *
 * @param {(text: string, values?: unknown[]) => Promise<{rowCount: number}>} [query]
 * @returns {Promise<number>} how many rows went
 */
export async function purgeExpiredSessions(query = (text) => pool.query(text)) {
  const result = await query(`DELETE FROM sessions WHERE expires_at <= now()`);
  return result?.rowCount ?? 0;
}

/**
 * Sweep on a timer, starting now.
 *
 * A timer rather than a cron entry: the deploy has enough moving parts, and
 * this has to work on a laptop too. `unref()` so it never keeps the process
 * alive — a sweep is not a reason to refuse to shut down.
 *
 * @param {{intervalMs?: number, purge?: () => Promise<number>, log?: (message: string) => void}} [options]
 * @returns {{stop: () => void}}
 */
export function startSessionSweeper({
  intervalMs = Number(process.env.SESSION_SWEEP_MS || 6 * 60 * 60 * 1000),
  purge = purgeExpiredSessions,
  log = console.log,
} = {}) {
  const sweep = async () => {
    try {
      const removed = await purge();
      if (removed > 0) log(`[sessions] removed ${removed} expired session(s)`);
    } catch (error) {
      // A failed sweep is not a failed site: say so and try again next time.
      console.error(`[sessions] sweep failed: ${error.message}`);
    }
  };
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  sweep();
  return { stop: () => clearInterval(timer) };
}

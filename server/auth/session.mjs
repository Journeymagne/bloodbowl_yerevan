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

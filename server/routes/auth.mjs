/**
 * Signing in, signing out, and who you are.
 *
 * The first routes lifted out of handleApi by step 4.9, which was a 632-line
 * chain of `if`s — every endpoint the site has, in one function, in no
 * particular order. Nothing here changed except its indentation and the shape
 * that lets the chain be a list: a route module answers the request and says
 * it handled it, or says nothing and lets the next one look.
 */
import { pool } from "../db/pool.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import { currentMaintenance } from "../http/maintenance.mjs";
import { bearerToken, createSession, currentUser, hashPassword, hashToken, verifyPassword } from "../auth/session.mjs";
import { attemptKey, checkLoginAttempt, clearLoginAttempts, recordFailedLogin } from "../auth/rate-limit.mjs";
import { normalizeLogin, publicUser } from "../api/serializers.mjs";
import { LOGIN_MIN_LENGTH, PASSWORD_MIN_LENGTH } from "../../src/domain/account.mjs";
import { accountUser, handleAccountRoutes } from "./account.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/** The same, for a refusal the client can translate. */
function sendError(response, status, code, params) {
  return send(response, status, errorPayload(code, params));
}

/**
 * `POST /api/auth/login`, out of `handleAuthRoutes`, which is held to a line budget, now that it also
 * looks the account up before it counts: the guesses are counted against the account (`attemptKey`).
 *
 * @returns {Promise<boolean>} true: the request is answered
 */
async function signIn(request, response) {
  const body = await readJson(request);
  const loginKey = normalizeLogin(body.login ?? "");
  const password = String(body.password ?? "");

  // The account is looked up first, because it is what the guesses are counted against (attemptKey).
  const user = (await pool.query("SELECT * FROM users WHERE login_key = $1", [loginKey])).rows[0];
  const key = attemptKey(loginKey, user);

  // Checked before the password is verified, not after: verifying is the
  // expensive part, and refusing to do it is the point.
  const attempt = checkLoginAttempt(key);
  if (!attempt.allowed) {
    response.setHeader?.("Retry-After", String(attempt.retryAfterSeconds));
    return send(response, 429, {
      ...errorPayload("TOO_MANY_LOGIN_ATTEMPTS"),
      retryAfterSeconds: attempt.retryAfterSeconds,
    });
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailedLogin(key);
    return sendError(response, 401, "WRONG_LOGIN_OR_PASSWORD");
  }
  clearLoginAttempts(key);
  const token = await createSession(user.id);
  return send(response, 200, { token, user: publicUser(user) });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request; what it does not answer
 *   it offers last to the signed-in user's own account routes (account.mjs)
 */
export async function handleAuthRoutes(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    await pool.query("SELECT 1");
    // 200 even in maintenance: the deploy's health check reads this, and maintenance is not "down".
    return send(response, 200, { ok: true, maintenance: await currentMaintenance() });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await currentUser(request);
    return send(response, 200, { user: await accountUser(pool, user) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(request);
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");
    const telegram = String(body.telegram ?? "").trim();
    const loginKey = normalizeLogin(login);

    if (login.length < LOGIN_MIN_LENGTH) return sendError(response, 400, "LOGIN_TOO_SHORT");
    if (password.length < PASSWORD_MIN_LENGTH) return sendError(response, 400, "PASSWORD_TOO_SHORT");
    if (!telegram) return sendError(response, 400, "TELEGRAM_REQUIRED");

    const passwordHash = hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (login, login_key, telegram, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [login, loginKey, telegram, passwordHash],
    ).catch((error) => {
      if (error.code === "23505") return null;
      throw error;
    });
    if (!result) return sendError(response, 409, "LOGIN_ALREADY_REGISTERED");

    const token = await createSession(result.rows[0].id);
    return send(response, 201, { token, user: publicUser(result.rows[0]) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") return signIn(request, response);

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = bearerToken(request);
    if (token) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    }
    return send(response, 200, { ok: true });
  }

  return handleAccountRoutes(request, response, url);
}

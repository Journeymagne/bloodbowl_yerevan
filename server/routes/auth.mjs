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
import { bearerToken, createSession, currentUser, hashPassword, hashToken, verifyPassword } from "../auth/session.mjs";
import { checkLoginAttempt, clearLoginAttempts, recordFailedLogin } from "../auth/rate-limit.mjs";
import { normalizeLogin, publicUser } from "../api/serializers.mjs";

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
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleAuthRoutes(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    await pool.query("SELECT 1");
    return send(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await currentUser(request);
    return send(response, 200, { user: publicUser(user) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(request);
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");
    const telegram = String(body.telegram ?? "").trim();
    const loginKey = normalizeLogin(login);

    if (login.length < 3) return sendError(response, 400, "LOGIN_TOO_SHORT");
    if (password.length < 4) return sendError(response, 400, "PASSWORD_TOO_SHORT");
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

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const loginKey = normalizeLogin(body.login ?? "");
    const password = String(body.password ?? "");

    // Checked before the password is verified, not after: verifying is the
    // expensive part, and refusing to do it is the point.
    const attempt = checkLoginAttempt(loginKey);
    if (!attempt.allowed) {
      response.setHeader?.("Retry-After", String(attempt.retryAfterSeconds));
      return send(response, 429, {
        ...errorPayload("TOO_MANY_LOGIN_ATTEMPTS"),
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
    }

    const result = await pool.query("SELECT * FROM users WHERE login_key = $1", [loginKey]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordFailedLogin(loginKey);
      return sendError(response, 401, "WRONG_LOGIN_OR_PASSWORD");
    }
    clearLoginAttempts(loginKey);
    const token = await createSession(user.id);
    return send(response, 200, { token, user: publicUser(user) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = bearerToken(request);
    if (token) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    }
    return send(response, 200, { ok: true });
  }

  if (request.method === "PATCH" && url.pathname === "/api/auth/profile") {
    return updateProfile(request, response);
  }

  return false;
}

/**
 * Change your own login, contact or password.
 *
 * Its own function because handleAuthRoutes was 97 lines and the limit is 80 —
 * which is the check doing what it is for: this block was always a separate
 * thing wearing the same `if`.
 */
async function updateProfile(request, response) {
  const user = await currentUser(request);
  if (!user) return sendError(response, 401, "NOT_AUTHORIZED");

  const body = await readJson(request);
  const login = String(body.login ?? user.login).trim();
  const telegram = String(body.telegram ?? user.telegram).trim();
  const password = String(body.password ?? "");
  const loginKey = normalizeLogin(login);

  if (login.length < 3) return sendError(response, 400, "LOGIN_TOO_SHORT");
  if (!telegram) return sendError(response, 400, "TELEGRAM_REQUIRED");
  if (password && password.length < 4) return sendError(response, 400, "PASSWORD_TOO_SHORT");

  const params = [user.id, login, loginKey, telegram];
  const passwordSql = password ? ", password_hash = $5" : "";
  if (password) params.push(hashPassword(password));
  const updated = await pool.query(
    `UPDATE users
     SET login = $2,
         login_key = $3,
         telegram = $4,
         updated_at = now()
         ${passwordSql}
     WHERE id = $1
     RETURNING *`,
    params,
  ).catch((error) => {
    if (error.code === "23505") return null;
    throw error;
  });
  if (!updated) return sendError(response, 409, "LOGIN_ALREADY_REGISTERED");

  return send(response, 200, { user: publicUser(updated.rows[0]) });
}

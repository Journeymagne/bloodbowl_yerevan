/**
 * The site administrator's account, brought in line with the env file at boot.
 *
 * Moved out of server.mjs by release 2.1.0, which needed the lines for the
 * maintenance gate: server.mjs is held to a line budget, and this was the one
 * part of it that is not starting the server.
 *
 * Every boot rewrites the password and Telegram from the env file, so the file
 * stays the single place an operator changes them. A password set anywhere else
 * would last until the next start, after it had already ended the account's other
 * sessions: the routes that set one refuse this account (`isEnvAdmin`).
 */
import { normalizeLogin } from "../api/serializers.mjs";
import { hashPassword } from "./session.mjs";

/** The login of the account the env file keeps: `ADMIN_LOGIN`, or `admin`. */
const envAdminLogin = (env) => env.ADMIN_LOGIN || "admin";

/**
 * Whether a user is the administrator's account the env file keeps — the one `ensureAdminAccount` writes,
 * found the way it finds it, by `login_key`. Its password is the file's (ADMIN_PASSWORD_FROM_ENV).
 *
 * @param {{login_key?: string}|null|undefined} user a `users` row
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function isEnvAdmin(user, env = process.env) {
  return typeof user?.login_key === "string" && user.login_key === normalizeLogin(envAdminLogin(env));
}

/**
 * @param {{query: (sql: string, params: unknown[]) => Promise<unknown>}} pool
 * @param {Record<string, string|undefined>} [env]
 * @returns {Promise<string>} the admin login, for the startup log
 */
export async function ensureAdminAccount(pool, env = process.env) {
  const login = envAdminLogin(env);
  const password = env.ADMIN_PASSWORD || "change-me-site-admin-password";
  const telegram = env.ADMIN_TELEGRAM || "@admin";
  await pool.query(
    `INSERT INTO users (login, login_key, telegram, password_hash, is_admin)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (login_key) DO UPDATE
       SET telegram = EXCLUDED.telegram,
           password_hash = EXCLUDED.password_hash,
           is_admin = TRUE,
           updated_at = now()`,
    [login, normalizeLogin(login), telegram, hashPassword(password)],
  );
  return login;
}

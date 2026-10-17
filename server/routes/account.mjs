/**
 * The signed-in user's own account: their settings, and their login, contact and password.
 *
 * The only module that answers with `preferences` (migration 013), so nothing that shows a user to
 * others can carry them: `publicUser` has no such field, and the settings leave the server in two
 * places, both made here and both shown the same way — `GET /api/auth/me`, through `accountUser`,
 * and the answer to `PATCH /api/auth/preferences`.
 *
 * `handleAuthRoutes` offers this module every request it has not answered itself. Refusals are
 * thrown (`httpError`) for `handleApi` to send; the module keeps no `send` of its own.
 */
import { checkPreferences, mergePreferences } from "../api/preferences.mjs";
import { isEnvAdmin } from "../auth/admin-account.mjs";
import { normalizeLogin, publicUser } from "../api/serializers.mjs";
import { attemptKey, checkLoginAttempt, clearLoginAttempts, recordFailedLogin } from "../auth/rate-limit.mjs";
import { bearerToken, currentUser, hashPassword, hashToken, verifyPassword } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";

/**
 * Whether `teamId` is one of `userId`'s own teams. A plain read, on purpose: it takes no lock on the
 * team, which a settings save must never do while it holds the user's row (see `mergeInto`).
 *
 * @param {{query: Function}} db a pg pool, or the client of a transaction
 */
async function ownsTeam(db, userId, teamId) {
  const { rowCount } = await db.query("SELECT 1 FROM saved_teams WHERE id = $1 AND user_id = $2", [teamId, userId]);
  return rowCount > 0;
}

/**
 * A user's stored settings as the user is shown them: the keys and values the site still knows
 * (`mergePreferences`), and no active team that is not theirs. A team deleted since it was chosen stops
 * showing, and nothing stored is taken on trust to be the user's. What is stored stays as it is: the
 * next save that mentions the active team is the one that decides it.
 *
 * @param {{query: Function}} db a pg pool, or the client of a transaction
 * @param {string} userId
 * @param {unknown} stored `users.preferences` as the database holds it
 * @returns {Promise<object>}
 */
async function shownPreferences(db, userId, stored) {
  const preferences = mergePreferences(stored, {});
  if (preferences.activeTeamId && !(await ownsTeam(db, userId, preferences.activeTeamId))) delete preferences.activeTeamId;
  return preferences;
}

/**
 * The user as they see themselves in `GET /api/auth/me`: what `publicUser` says, and their settings.
 *
 * @param {{query: Function}} db a pg pool, or the client of a transaction
 * @param {object|null} user as `currentUser` returns it
 * @returns {Promise<object|null>} null for no user
 */
export async function accountUser(db, user) {
  if (!user) return null;
  return { ...publicUser(user), preferences: await shownPreferences(db, user.id, user.preferences) };
}

/**
 * The transaction of a settings save: lock the user's row, check the active team if the patch names
 * one, store the merge, and hand the merge back.
 *
 * The row is locked first so that the settings merged into are the ones the last save left, not the
 * ones this request saw when it began: two tabs changing different keys each keep theirs. It is
 * `FOR NO KEY UPDATE` and not `FOR UPDATE` because every write that names the user takes
 * `FOR KEY SHARE` on their row through its foreign key (a tap, a ledger line, a roll, the SPP rows of
 * a roster save), and those hold their team, or the pairing and teams, while they insert: `FOR UPDATE`
 * would make them wait on a settings save. This lock conflicts with another write of the row itself
 * (a second save, a profile change, a delete) and not with a write that only names the user; the
 * UPDATE below changes no key column, so it is a no-key update too.
 *
 * Nothing else is locked. A locking read of the team after this row would close a cycle with a
 * roster save, which holds the team and then asks for the user's row. A team deleted after the
 * check is harmless: it stops showing (`shownPreferences`).
 *
 * @param {import("pg").PoolClient} client the client of a transaction
 * @param {string} userId
 * @param {object} value what `checkPreferences` accepted; not empty
 * @returns {Promise<object>} what is stored now
 */
async function mergeInto(client, userId, value) {
  const { rows } = await client.query("SELECT preferences FROM users WHERE id = $1 FOR NO KEY UPDATE", [userId]);
  if (!rows[0]) throw httpError(401, "NOT_AUTHORIZED"); // the user went while this request waited its turn
  if (value.activeTeamId && !(await ownsTeam(client, userId, value.activeTeamId))) throw httpError(404, "TEAM_NOT_FOUND");
  const merged = mergePreferences(rows[0].preferences, value);
  await client.query("UPDATE users SET preferences = $2, updated_at = now() WHERE id = $1", [userId, merged]);
  return merged;
}

/**
 * `PATCH /api/auth/preferences` `{ themeMode?, lightPalette?, darkPalette?, activeTeamId?, locale? }` —
 * the signed-in user changes the keys they name and keeps the rest: 200 `{ preferences }`, as `/me` shows
 * them. A body that is not an object, a key or a value the site does not know: 400 FIELD_INVALID naming
 * the field (`body` for the first). An active team that is not the user's own, or is not there: 404
 * TEAM_NOT_FOUND, and nothing is stored. `activeTeamId: null` clears it.
 *
 * An empty body changes nothing, so it takes no lock and writes nothing: the answer is the settings
 * as `currentUser` just read them. The body is looked at before any transaction is opened.
 */
async function savePreferences(request, response) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  const checked = checkPreferences(await readJson(request));
  if (!checked.ok) throw httpError(400, "FIELD_INVALID", { field: checked.key || "body" });
  const { value } = checked;
  const stored = Object.keys(value).length ? await withTransaction((client) => mergeInto(client, user.id, value)) : user.preferences;
  sendJson(response, 200, { preferences: await shownPreferences(pool, user.id, stored) });
}

/**
 * Lets a password be replaced only by someone who knows the one it replaces: a stolen session token or
 * a phone left unlocked must not be enough to take the account over.
 *
 * Guessing it is guessing the login, so it is counted the way a login is: under the user's account
 * (`attemptKey`), in the same counter `POST /api/auth/login` uses, and a user who has used up the
 * attempts gets the same 429 the login gives. The account and not the name, so that renaming it, even
 * twice at once, gives nothing back. The limit is looked at before the password is verified,
 * not after: verifying is the expensive part (scrypt, on the one thread), and refusing to is the point.
 *
 * @param {object} user as `currentUser` returns it
 * @param {unknown} currentPassword what the request says the password is. Anything that is not a string
 *   is wrong, and is not turned into one: a number that spells the password does not know it.
 * @throws 429 TOO_MANY_LOGIN_ATTEMPTS carrying `retryAfterSeconds` (`handleApi` sets the header), or
 *   403 CURRENT_PASSWORD_WRONG, which counts as a failed login. 403 and not 401: the session is fine,
 *   it is the password that is wrong.
 */
function requireCurrentPassword(user, currentPassword) {
  const key = attemptKey(user.login_key, user);
  const attempt = checkLoginAttempt(key);
  if (!attempt.allowed) throw httpError(429, "TOO_MANY_LOGIN_ATTEMPTS", {}, { retryAfterSeconds: attempt.retryAfterSeconds });
  if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, user.password_hash)) {
    recordFailedLogin(key);
    throw httpError(403, "CURRENT_PASSWORD_WRONG");
  }
  clearLoginAttempts(key);
}

/**
 * The write of a profile change: the user's own row, as `RETURNING *` gives it back.
 *
 * @param {{query: Function}} db a pg pool, or the client of a transaction
 * @param {unknown[]} params `[id, login, loginKey, telegram]`; a fifth, the new password's hash, is a
 *   password change
 * @throws 409 LOGIN_ALREADY_REGISTERED when another user has the login. Inside a transaction the
 *   failed statement has already aborted it: this is thrown to roll it back, not to carry on.
 * @throws 401 NOT_AUTHORIZED when the user is no longer there: deleted while this request waited for
 *   the row, as in a settings save.
 */
async function writeProfile(db, params) {
  const { rows } = await db.query(
    `UPDATE users
     SET login = $2, login_key = $3, telegram = $4, updated_at = now()${params.length > 4 ? ", password_hash = $5" : ""}
     WHERE id = $1
     RETURNING *`,
    params,
  ).catch((error) => {
    throw error.code === "23505" ? httpError(409, "LOGIN_ALREADY_REGISTERED") : error;
  });
  if (!rows[0]) throw httpError(401, "NOT_AUTHORIZED");
  return rows[0];
}

/**
 * `PATCH /api/auth/profile` `{ login?, telegram?, password?, currentPassword? }` — change your own
 * login, contact or password: 200 `{ user }`.
 *
 * The refusals come in an order, the cheap and the certain before the costly: no session is 401; a
 * login under 3 characters, an empty contact and a new password under 4 are the 400s they always were,
 * and none of them looks at the current password or counts as a guess; then, only when there is a new
 * password, 409 ADMIN_PASSWORD_FROM_ENV for the account the env file keeps (`isEnvAdmin`: its password is
 * the file's, rewritten at every start), before any guess is counted or verified; then
 * `requireCurrentPassword` (429 or 403); then the write. A login or contact change without a
 * new password needs no `currentPassword`, ignores one that is sent, ends no session, and is the one
 * statement it always was.
 *
 * A new password and the end of every other session are one transaction, the user's row first, so a
 * login that is already taken (409) or a write that fails leaves the old password and every session as
 * they were. The session that made the request goes on. The new password is hashed before the
 * transaction opens: scrypt blocks the thread, and the user's row is not to be held while it does.
 */
async function updateProfile(request, response) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");

  const body = await readJson(request);
  const login = String(body.login ?? user.login).trim();
  const telegram = String(body.telegram ?? user.telegram).trim();
  const password = String(body.password ?? "");

  if (login.length < 3) throw httpError(400, "LOGIN_TOO_SHORT");
  if (!telegram) throw httpError(400, "TELEGRAM_REQUIRED");
  if (password && password.length < 4) throw httpError(400, "PASSWORD_TOO_SHORT");
  if (password && isEnvAdmin(user)) throw httpError(409, "ADMIN_PASSWORD_FROM_ENV");
  if (password) requireCurrentPassword(user, body.currentPassword);

  const params = [user.id, login, normalizeLogin(login), telegram];
  let updated;
  if (password) {
    params.push(hashPassword(password));
    updated = await withTransaction(async (client) => {
      const row = await writeProfile(client, params);
      await client.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [user.id, hashToken(bearerToken(request))]);
      return row;
    });
  } else {
    updated = await writeProfile(pool, params);
  }
  sendJson(response, 200, { user: publicUser(updated) });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleAccountRoutes(request, response, url) {
  if (request.method === "PATCH" && url.pathname === "/api/auth/profile") {
    await updateProfile(request, response);
    return true;
  }
  if (request.method === "PATCH" && url.pathname === "/api/auth/preferences") {
    await savePreferences(request, response);
    return true;
  }
  return false;
}

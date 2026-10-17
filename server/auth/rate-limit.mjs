/**
 * How many times a login may be guessed before the answer becomes "later".
 *
 * Every attempt runs scryptSync, which is deliberately expensive and blocks the
 * single thread while it does. So an unlimited login endpoint is two problems
 * wearing one coat: a password can be guessed at whatever rate the network
 * allows, and the site stops answering anybody else while it happens.
 *
 * In memory, per process, on purpose. There is one process; a restart clearing
 * the counters is acceptable for this, and it costs no schema and no round trip
 * to the database on the hot path. If the deployment ever grows a second
 * process, this stops being enough — and the honest version then is a shared
 * store, not a bigger number here.
 *
 * Counted per login name rather than per IP address: the attack this refuses is
 * guessing one coach's password, and a shared address is the normal case for a
 * league whose members sit in the same city.
 *
 * Two doors count here, under the same key: signing in, and changing a password, which asks for the
 * current one. A rename moves the count with the account (`moveLoginAttempts`).
 */

const attemptsByLogin = new Map();

const DEFAULTS = {
  limit: Number(process.env.LOGIN_ATTEMPT_LIMIT || 10),
  windowMs: Number(process.env.LOGIN_ATTEMPT_WINDOW_MS || 15 * 60 * 1000),
};

/**
 * @param {string} loginKey the normalised login being tried
 * @param {{now?: () => number, limit?: number, windowMs?: number}} [options]
 * @returns {{allowed: boolean, retryAfterSeconds: number}}
 */
export function checkLoginAttempt(loginKey, options = {}) {
  const now = options.now ?? Date.now;
  const limit = options.limit ?? DEFAULTS.limit;
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  const at = now();

  const record = attemptsByLogin.get(loginKey);
  if (!record || at - record.since >= windowMs) return { allowed: true, retryAfterSeconds: 0 };
  if (record.failures < limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.ceil((record.since + windowMs - at) / 1000) };
}

/** A wrong password. The window starts at the first failure, not the last. */
export function recordFailedLogin(loginKey, options = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  const at = now();
  const record = attemptsByLogin.get(loginKey);
  if (!record || at - record.since >= windowMs) {
    attemptsByLogin.set(loginKey, { since: at, failures: 1 });
    return;
  }
  record.failures += 1;
}

/** A correct password clears the count: the person is who they said they were. */
export function clearLoginAttempts(loginKey) {
  attemptsByLogin.delete(loginKey);
}

/**
 * Whether `a` holds a login back more than `b` does: it blocks longer, or, when neither blocks, it has
 * counted more failures. Both are live records (`moveLoginAttempts` has checked their windows).
 */
function holdsBackMore(a, b, limit) {
  const aBlocks = a.failures >= limit;
  const bBlocks = b.failures >= limit;
  if (aBlocks || bBlocks) return aBlocks && bBlocks ? a.since > b.since : aBlocks;
  return a.failures > b.failures;
}

/**
 * A rename: what was counted against `fromKey` is counted against `toKey` from now on.
 *
 * Failures are kept per login, and a signed-in user can change their login without knowing the
 * password, so without this a rename would give the guesses back: ten wrong ones, a new name, ten more
 * (on the profile route, which counts under the user's own key, and on login, under the new name). The
 * record keeps the window it had; the rename does not start a new one.
 *
 * When `toKey` has a record of its own, the stricter of the two stays: the one that blocks longer or,
 * when neither blocks, the one with more failures; on a tie, the one already there. A record whose
 * window is over counts for nothing. Nothing is left under `fromKey`. Moving a key to itself, or a key
 * that has no record, changes nothing.
 *
 * @param {string} fromKey the normalised login the user had
 * @param {string} toKey the normalised login the user has now
 * @param {{now?: () => number, limit?: number, windowMs?: number}} [options]
 */
export function moveLoginAttempts(fromKey, toKey, options = {}) {
  if (fromKey === toKey) return;
  const moving = attemptsByLogin.get(fromKey);
  if (!moving) return;
  attemptsByLogin.delete(fromKey);

  const now = options.now ?? Date.now;
  const limit = options.limit ?? DEFAULTS.limit;
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  const at = now();
  const live = (record) => record && at - record.since < windowMs;
  if (!live(moving)) return;
  const staying = attemptsByLogin.get(toKey);
  if (live(staying) && !holdsBackMore(moving, staying, limit)) return;
  attemptsByLogin.set(toKey, moving);
}

/** Test seam, and a way to keep the map from growing without bound. */
export function forgetExpiredLoginAttempts(options = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  const at = now();
  for (const [key, record] of attemptsByLogin) {
    if (at - record.since >= windowMs) attemptsByLogin.delete(key);
  }
  return attemptsByLogin.size;
}

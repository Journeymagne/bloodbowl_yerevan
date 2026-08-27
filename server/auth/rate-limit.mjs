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

/**
 * The one place that talks to the API.
 *
 * Every failure comes back as an ApiError with a `kind`, so callers can tell a
 * dropped connection from an expired session from a rejected roster instead of
 * matching on an English sentence. The roster store relies on this: `offline`
 * means keep the edit and retry, `conflict` means ask the user, anything else
 * is a plain error.
 *
 * Requests also get a timeout — without one a stalled connection left the
 * autosave hanging on "saving..." forever.
 */
import { t } from "./i18n.mjs";


export const API_ERROR = Object.freeze({
  /** The request never reached the server (no network, DNS, refused). */
  OFFLINE: "offline",
  /** It took too long and was aborted. */
  TIMEOUT: "timeout",
  /** 401: the session is gone. The only status that ends it on the client. */
  UNAUTHORIZED: "unauthorized",
  /** 403: the session is alive, the account just may not do this. */
  FORBIDDEN: "forbidden",
  /** 409: someone else changed this first. */
  CONFLICT: "conflict",
  /** 422: the server rejected the payload, `violations` says why. */
  INVALID: "invalid",
  /** 503 MAINTENANCE: the site is closed for maintenance. */
  MAINTENANCE: "maintenance",
  /** Any other non-2xx. */
  HTTP: "http",
});

export class ApiError extends Error {
  constructor(kind, { status = 0, message = "", payload = null, cause = null } = {}) {
    super(message || `API ${kind}`);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.payload = payload;
    this.violations = payload?.violations ?? null;
    // The server names its refusals since step 13.3; `message` is the English
    // it used to send, kept as the fallback when a dictionary lacks the key.
    this.code = payload?.error?.code ?? null;
    this.params = payload?.error?.params ?? {};
    if (cause) this.cause = cause;
  }
}

function kindForStatus(status, payload) {
  if (status === 401) return API_ERROR.UNAUTHORIZED;
  if (status === 403) return API_ERROR.FORBIDDEN;
  if (status === 409) return API_ERROR.CONFLICT;
  if (status === 422) return API_ERROR.INVALID;
  if (status === 503 && payload?.error?.code === "MAINTENANCE") return API_ERROR.MAINTENANCE;
  return API_ERROR.HTTP;
}

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetchFn
 * @param {() => string} deps.getToken
 * @param {(error: ApiError, sent: {token: string}) => void} [deps.onUnauthorized] called once per 401, with the
 *   token the request went out with: the session may have changed while it was on its way
 * @param {(error: ApiError) => void} [deps.onMaintenance] called on 503 MAINTENANCE
 * @param {number} [deps.timeoutMs]
 */
export function createApiClient({ fetchFn = fetch, getToken = () => "", onUnauthorized, onMaintenance, timeoutMs = 20000 } = {}) {
  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let response;
    try {
      response = await fetchFn(path, { ...options, headers, signal: controller?.signal });
    } catch (cause) {
      // fetch only rejects when the request never completed: offline, DNS,
      // refused connection, or our own abort.
      const aborted = cause?.name === "AbortError";
      throw new ApiError(aborted ? API_ERROR.TIMEOUT : API_ERROR.OFFLINE, { message: cause?.message, cause });
    } finally {
      if (timer) clearTimeout(timer);
    }

    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;

    const error = new ApiError(kindForStatus(response.status, payload), {
      status: response.status,
      message: payload?.error?.message || payload?.error || `Request failed with ${response.status}`,
      payload,
    });
    if (error.kind === API_ERROR.UNAUTHORIZED) onUnauthorized?.(error, { token });
    if (error.kind === API_ERROR.MAINTENANCE) {
      try {
        onMaintenance?.(error);
      } catch {
        // A failing hook must not replace the ApiError the caller needs.
      }
    }
    throw error;
  }

  return { request };
}

/**
 * An error as a sentence the reader can read.
 *
 * Server refusals name themselves with a code (step 13.3), so the same
 * refusal reads in whichever language the page is in. `message` is the
 * English the server sends alongside, and stays the fallback: a dictionary
 * that lacks the key should show a sentence, not error.SOMETHING.
 *
 * A request that never got an answer has no code, and its `message` is
 * whatever the browser's fetch said ("Failed to fetch"), in the browser's
 * language rather than the page's. Those two are told here instead.
 */
export function errorText(error) {
  if (error?.kind === API_ERROR.OFFLINE) return t("request.offline");
  if (error?.kind === API_ERROR.TIMEOUT) return t("request.timeout");
  const code = error?.code;
  if (code) {
    const key = `error.${code}`;
    const translated = t(key, error.params ?? {});
    if (translated !== key) return translated;
  }
  return error?.message ?? String(error);
}

/**
 * A refused request as a sentence, for the writes that sign in, change a password, save a contact or
 * make and delete a team: errorText's, with two exceptions. Too many tries say when to try again: the 429 carries
 * `retryAfterSeconds`, and the window is a quarter of an hour, so the wait is said in
 * minutes, and in seconds only for its last minute; without the number, "shortly" is all
 * there is to say. And an answer without a code (a proxy's 502 while the server restarts)
 * says the server did not answer instead of "Request failed with 502".
 * @param {unknown} error
 */
export function refusalText(error) {
  if (error?.kind === API_ERROR.HTTP && !error.code) return t("request.noAnswer");
  const seconds = Math.ceil(Number(error?.payload?.retryAfterSeconds));
  if (error?.code !== "TOO_MANY_LOGIN_ATTEMPTS" || !(seconds > 0)) return errorText(error);
  return seconds < 60 ? t("auth.tooManySeconds", { seconds }) : t("auth.tooManyMinutes", { minutes: Math.ceil(seconds / 60) });
}

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
  /** 401/403: the session is gone or the account may not do this. */
  UNAUTHORIZED: "unauthorized",
  /** 409: someone else changed this first. */
  CONFLICT: "conflict",
  /** 422: the server rejected the payload, `violations` says why. */
  INVALID: "invalid",
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

function kindForStatus(status) {
  if (status === 401 || status === 403) return API_ERROR.UNAUTHORIZED;
  if (status === 409) return API_ERROR.CONFLICT;
  if (status === 422) return API_ERROR.INVALID;
  return API_ERROR.HTTP;
}

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetchFn
 * @param {() => string} deps.getToken
 * @param {(error: ApiError) => void} [deps.onUnauthorized] called once per 401
 * @param {number} [deps.timeoutMs]
 */
export function createApiClient({ fetchFn = fetch, getToken = () => "", onUnauthorized, timeoutMs = 20000 } = {}) {
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

    const error = new ApiError(kindForStatus(response.status), {
      status: response.status,
      message: payload?.error?.message || payload?.error || `Request failed with ${response.status}`,
      payload,
    });
    if (error.kind === API_ERROR.UNAUTHORIZED) onUnauthorized?.(error);
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
 */
export function errorText(error) {
  const code = error?.code;
  if (code) {
    const key = `error.${code}`;
    const translated = t(key, error.params ?? {});
    if (translated !== key) return translated;
  }
  return error?.message ?? String(error);
}

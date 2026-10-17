/**
 * A browser's localStorage and fetch for modules that talk to the API; replies
 * by "METHOD /path", every request recorded with its body and headers.
 *
 * Install it before importing src/core/api-client.mjs: the client picks up
 * `fetch` when the module loads, so a fetch installed later is never called.
 * That is also why a second install hands back the first one instead of
 * replacing it.
 *
 * A request nobody replied to rejects, as `fail()` does, and api.mjs reports
 * that as `offline` — the very outcome some tests are about. So a forgotten
 * reply would pass for a dropped connection: it is listed in `unanswered`, and
 * a test that does not mean to leave a request unanswered ends with
 * `assertAnswered()`.
 */
let installed = null;

export function installFakeApi() {
  if (installed) return installed;
  const items = new Map();
  const calls = [];
  const unanswered = [];
  const replies = new Map();

  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  };

  globalThis.fetch = async (path, init = {}) => {
    const key = `${init.method || "GET"} ${path}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : null, headers: { ...init.headers } });
    const reply = replies.get(key);
    if (!reply) {
      unanswered.push(key);
      throw new Error(`fake api: no reply for ${key}`);
    }
    if (reply.error) throw reply.error;
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    };
  };

  installed = {
    items,
    calls,
    /** The key of every request that found no reply, in order. */
    unanswered,
    /** Throw, naming them, if any request found no reply since the last reset. */
    assertAnswered() {
      if (unanswered.length) throw new Error(`fake api: no reply for ${unanswered.join(", ")}`);
    },
    /** The next requests to `key` ("PATCH /api/x") come back with this status and JSON body. */
    reply(key, status, body = {}) {
      replies.set(key, { status, body });
    },
    /** The next requests to `key` never reach the server: fetch rejects, as it does offline. */
    fail(key, error = new TypeError("Failed to fetch")) {
      replies.set(key, { error });
    },
    /** Empty the storage, the records and the replies; the same objects, so references stay valid. */
    reset() {
      items.clear();
      calls.length = 0;
      unanswered.length = 0;
      replies.clear();
    },
  };
  return installed;
}

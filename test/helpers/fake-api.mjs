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
 *
 * `hold(key)` keeps the requests to `key` from being answered until the test
 * says so, which is how a test stands in the middle of a request: the second
 * of two quick writes is sent while the first is still on its way.
 */
let installed = null;

export function installFakeApi() {
  if (installed) return installed;
  const items = new Map();
  const calls = [];
  const unanswered = [];
  const replies = new Map();
  const holds = new Map();

  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  };

  globalThis.fetch = async (path, init = {}) => {
    const key = `${init.method || "GET"} ${path}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : null, headers: { ...init.headers } });
    // A held request is recorded above, so `calls` shows it sent; it is answered when the hold is released.
    const released = holds.has(key) ? await new Promise((resolve) => { holds.get(key).waiting.push(resolve); }) : undefined;
    const reply = released ?? replies.get(key);
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
    /**
     * From now on requests to `key` are recorded in `calls` and then wait. `release()` lets every one that is
     * waiting be answered as `reply`/`fail` say, and ends the hold; `release({ status, body })` or
     * `release({ error })` answers them that way instead, once, so one request can fail and the next succeed.
     * `waiting` is how many are held now.
     */
    hold(key) {
      const gate = {
        waiting: [],
        get count() { return gate.waiting.length; },
        release(answer) {
          holds.delete(key);
          for (const resolve of gate.waiting.splice(0)) resolve(answer);
        },
      };
      holds.set(key, gate);
      return gate;
    },
    /** Empty the storage, the records, the replies and the holds; the same objects, so references stay valid. */
    reset() {
      items.clear();
      calls.length = 0;
      unanswered.length = 0;
      replies.clear();
      holds.clear();
    },
  };
  return installed;
}

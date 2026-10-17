/**
 * A browser's localStorage and fetch for modules that talk to the API; replies
 * by "METHOD /path", every request recorded.
 *
 * Install it before importing src/core/api-client.mjs: the client picks up
 * `fetch` when the module loads, so a fetch installed later is never called.
 * A request nobody replied to throws, so a test cannot pass on a call it did
 * not expect.
 */
export function installFakeApi() {
  const items = new Map();
  const calls = [];
  const replies = new Map();

  globalThis.localStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  };

  globalThis.fetch = async (path, init = {}) => {
    const key = `${init.method || "GET"} ${path}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : null });
    const reply = replies.get(key);
    if (!reply) throw new Error(`fake api: no reply for ${key}`);
    if (reply.error) throw reply.error;
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    };
  };

  return {
    items,
    calls,
    /** The next requests to `key` ("PATCH /api/x") come back with this status and JSON body. */
    reply(key, status, body = {}) {
      replies.set(key, { status, body });
    },
    /** The next requests to `key` never reach the server: fetch rejects, as it does offline. */
    fail(key, error = new TypeError("Failed to fetch")) {
      replies.set(key, { error });
    },
    /** Empty the storage, the record of calls and the replies; the same objects, so references stay valid. */
    reset() {
      items.clear();
      calls.length = 0;
      replies.clear();
    },
  };
}

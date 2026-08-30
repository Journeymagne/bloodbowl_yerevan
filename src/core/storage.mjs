/**
 * localStorage with the try/catch in one place.
 *
 * Reading and writing localStorage throws in private mode, when the quota is
 * full, and when cookies are blocked entirely. The app used to repeat the same
 * `try { ... } catch (_error) {}` in five places and silently disagree about
 * what happens on failure.
 */

const KEY_PREFIX = "gata-league-";

/** Every key the app is allowed to use, so they are greppable from one file. */
export const STORAGE_KEYS = Object.freeze({
  authToken: "auth-token",
  theme: "theme",
  locale: "locale",
  builderDraft: "builder-draft",
});

function fullKey(key) {
  return key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
}

/** A storage that works even when the browser refuses to persist anything. */
export function createStorage(backend = globalThis.localStorage) {
  const memory = new Map();

  const readable = () => {
    try {
      return Boolean(backend);
    } catch {
      return false;
    }
  };

  return {
    get(key) {
      const name = fullKey(key);
      try {
        if (readable()) {
          const value = backend.getItem(name);
          if (value !== null) return value;
        }
      } catch {
        // fall through to the in-memory copy
      }
      return memory.has(name) ? memory.get(name) : null;
    },

    set(key, value) {
      const name = fullKey(key);
      memory.set(name, String(value));
      try {
        if (readable()) backend.setItem(name, String(value));
        return true;
      } catch {
        // Quota or privacy mode: the in-memory copy keeps this session working.
        return false;
      }
    },

    remove(key) {
      const name = fullKey(key);
      memory.delete(name);
      try {
        if (readable()) backend.removeItem(name);
      } catch {
        // nothing to do
      }
    },

    getJson(key, fallback = null) {
      const raw = this.get(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    setJson(key, value) {
      return this.set(key, JSON.stringify(value));
    },
  };
}

export const storage = createStorage();

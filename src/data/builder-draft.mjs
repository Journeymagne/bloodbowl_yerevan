/**
 * Keeps the in-progress builder team alive across reloads.
 *
 * The builder draft lived in memory only: closing the tab, following a link or
 * a stray refresh threw away a half-built team with no warning. It is now
 * mirrored into storage on every change and offered back when the builder is
 * opened with nothing in it.
 *
 * Deliberately dumb about roster rules — it stores and returns whatever the
 * builder hands it, and only refuses a draft whose race no longer exists.
 */
import { STORAGE_KEYS } from "../core/storage.mjs";

/** Staff counters that make a draft worth restoring even with no players yet. */
const STAFF_FIELDS = [
  "teamRerolls",
  "startingRerolls",
  "bribes",
  "dedicatedFans",
  "assistantCoaches",
  "cheerleaders",
  "apothecary",
  "mortuaryAssistant",
  "plagueDoctor",
];

/** Nothing worth keeping: no players, no logo, no purchases. */
export function isEmptyBuilderDraft(draft) {
  if (!draft) return true;
  if ((draft.players ?? []).length) return false;
  if (draft.logoData) return false;
  return !STAFF_FIELDS.some((field) => Number(draft[field]) > 0);
}

export function createBuilderDraftStore({
  storage,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  debounceMs = 450,
  now = () => Date.now(),
  key = STORAGE_KEYS.builderDraft,
} = {}) {
  let timer = null;

  return {
    /** Mirror the draft, debounced — the builder calls this on every change. */
    save(draft) {
      if (timer) clearTimeoutFn(timer);
      timer = setTimeoutFn(() => {
        timer = null;
        if (isEmptyBuilderDraft(draft)) {
          storage.remove(key);
          return;
        }
        storage.setJson(key, { savedAt: now(), draft });
      }, debounceMs);
    },

    /** Write immediately, skipping the debounce. */
    saveNow(draft) {
      if (timer) clearTimeoutFn(timer);
      timer = null;
      if (isEmptyBuilderDraft(draft)) {
        storage.remove(key);
        return;
      }
      storage.setJson(key, { savedAt: now(), draft });
    },

    clear() {
      if (timer) clearTimeoutFn(timer);
      timer = null;
      storage.remove(key);
    },

    /**
     * The stored draft, if there is one worth restoring.
     *
     * @param {(slug: string) => boolean} isKnownTeam guards against a race that
     *   has since disappeared from the content vault
     * @returns {object|null}
     */
    read(isKnownTeam = () => true) {
      const stored = storage.getJson(key, null);
      const draft = stored?.draft;
      if (!draft || isEmptyBuilderDraft(draft)) return null;
      if (draft.teamSlug && !isKnownTeam(draft.teamSlug)) {
        storage.remove(key);
        return null;
      }
      return draft;
    },
  };
}

/**
 * The reference content: teams, skills, traits, star players, rules pages.
 *
 * Built from the Markdown vault by scripts/build-data.mjs into one JSON file
 * per locale. Loaded once per locale and kept, so switching language back and
 * forth costs nothing after the first time.
 *
 * `local-preview.html` inlines both locales into `window.__REFERENCE_DATA__`
 * instead, so the offline preview needs no fetches.
 */

const cache = new Map();

/** The collections that are stored as identifiers rather than as pages. */
const COLLECTIONS = [
  "teams", "skills", "traits", "rules", "cheatsheets", "inducements", "starPlayers", "otherPages",
];

/**
 * Turn each collection of identifiers back into an array of pages.
 *
 * The built file used to carry 276 of its 292 pages twice — once in `pages`
 * and once inside a collection, byte for byte — which was most of its weight.
 * It now stores identifiers, and this puts the references back.
 *
 * The arrays hold **the same objects** as `pages`, not copies: a screen that
 * has a team from `state.data.teams` and one from `state.data.pages` has one
 * object, so nothing can drift between them. That was not true before.
 *
 * Tolerates a file that already holds pages — the inline preview data in
 * local-preview.html is built the old way until it is regenerated, and an
 * unknown identifier is dropped rather than turned into a hole in the array.
 */
export function expandCollections(data) {
  const byId = new Map((data.pages ?? []).map((page) => [page.id, page]));
  for (const name of COLLECTIONS) {
    const collection = data[name];
    if (!Array.isArray(collection)) continue;
    data[name] = collection.map((entry) => (typeof entry === "string" ? byId.get(entry) : entry)).filter(Boolean);
  }
  return data;
}

/**
 * @param {string} locale
 * @param {object} options
 * @param {string} options.version cache-busting token from index.html
 * @param {typeof fetch} [options.fetchFn]
 * @param {object} [options.inlineData] preloaded locales, keyed by locale
 */
export async function loadReferenceData(locale, { version, fetchFn = fetch, inlineData } = {}) {
  if (cache.has(locale)) return cache.get(locale);

  const inline = inlineData?.[locale];
  if (inline) {
    const expanded = expandCollections(inline);
    cache.set(locale, expanded);
    return expanded;
  }

  const response = await fetchFn(`public/data.${locale}.json?v=${version}`);
  if (!response.ok) {
    // Without this a 404 fed an HTML error page to JSON.parse and the app
    // reported a parse error instead of a missing file.
    throw new Error(`Reference data for "${locale}" is missing (${response.status}).`);
  }
  const data = expandCollections(await response.json());
  cache.set(locale, data);
  return data;
}

export function isReferenceDataLoaded(locale) {
  return cache.has(locale);
}

/** Test seam. */
export function clearReferenceCache() {
  cache.clear();
}

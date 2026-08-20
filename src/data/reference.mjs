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
    cache.set(locale, inline);
    return inline;
  }

  const response = await fetchFn(`public/data.${locale}.json?v=${version}`);
  if (!response.ok) {
    // Without this a 404 fed an HTML error page to JSON.parse and the app
    // reported a parse error instead of a missing file.
    throw new Error(`Reference data for "${locale}" is missing (${response.status}).`);
  }
  const data = await response.json();
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

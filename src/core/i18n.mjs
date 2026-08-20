/**
 * Interface strings and the current locale.
 *
 * Two things live here: the `t()` lookup used by every screen, and the locale
 * itself — which one is active, how it is stored, and how the static chrome in
 * index.html gets translated.
 *
 * Reference *content* (teams, skills, rules) is a separate matter; it is loaded
 * per locale by src/data/reference.mjs and keyed off `getLocale()`.
 */
import { STORAGE_KEYS, storage } from "./storage.mjs";

export const SUPPORTED_LOCALES = Object.freeze(["en", "ru"]);

const supported = new Set(SUPPORTED_LOCALES);
const listeners = new Set();

let dictionaries = { en: {}, ru: {} };
let locale = "en";

export function detectDefaultLocale(navigatorLike = globalThis.navigator) {
  const languages = navigatorLike?.languages?.length
    ? navigatorLike.languages
    : [navigatorLike?.language || "en"];
  return languages.some((language) => String(language).toLowerCase().startsWith("ru")) ? "ru" : "en";
}

export function storedLocale() {
  const saved = storage.get(STORAGE_KEYS.locale);
  return supported.has(saved) ? saved : detectDefaultLocale();
}

export function getLocale() {
  return locale;
}

export function isSupportedLocale(value) {
  return supported.has(value);
}

/**
 * Look up an interface string.
 *
 * Falls back to English and then to the key itself, so a missing translation
 * degrades to something readable instead of blanking the screen. `params`
 * fills `{placeholders}` — used by the validation messages, which come from the
 * domain as codes plus values.
 */
export function t(key, params) {
  const template = dictionaries[locale]?.[key] ?? dictionaries.en?.[key] ?? key;
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export function setDictionaries(next) {
  dictionaries = { en: next?.en ?? {}, ru: next?.ru ?? {} };
}

export async function loadTranslations(version, fetchFn = fetch) {
  const [en, ru] = await Promise.all(
    SUPPORTED_LOCALES.map((name) => fetchFn(`src/i18n/${name}.json?v=${version}`).then((response) => response.json())),
  );
  setDictionaries({ en, ru });
  return dictionaries;
}

/** Translate everything index.html marked up with data-i18n* attributes. */
export function applyStaticI18n(root = document) {
  const attributes = [
    ["data-i18n", (element, value) => { element.textContent = value; }],
    ["data-i18n-placeholder", (element, value) => element.setAttribute("placeholder", value)],
    ["data-i18n-title", (element, value) => element.setAttribute("title", value)],
    ["data-i18n-aria-label", (element, value) => element.setAttribute("aria-label", value)],
  ];
  for (const [attribute, apply] of attributes) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) {
      apply(element, t(element.getAttribute(attribute)));
    }
  }
}

/**
 * Switch locale. Persisting is best effort; listeners are told either way so
 * the screen always matches what `getLocale()` reports.
 */
export function setLocale(next) {
  if (!supported.has(next) || next === locale) return locale;
  locale = next;
  storage.set(STORAGE_KEYS.locale, next);
  document.documentElement.lang = next;
  applyStaticI18n();
  for (const listener of listeners) listener(next);
  return locale;
}

/** Set the locale without announcing it — used once, on boot. */
export function initLocale(next) {
  locale = supported.has(next) ? next : detectDefaultLocale();
  document.documentElement.lang = locale;
  return locale;
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

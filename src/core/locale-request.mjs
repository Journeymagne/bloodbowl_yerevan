/**
 * How a screen or the shell asks for another language.
 *
 * Switching reloads the reference data and redraws the route, and app.js owns
 * both. A screen cannot import app.js, nor the router that draws it back, so
 * app.js hands its switch over once at start and the screens ask through here.
 * Nothing in this module imports anything, which is what keeps it a leaf.
 */

let handler = () => undefined;

/** @param {(locale: string) => unknown} next what a request for a language does; app.js sets it once */
export function setLocaleHandler(next) {
  handler = next;
}

/**
 * @param {string} locale
 * @returns {unknown} whatever the handler answers: a promise, when the switch waits for data
 */
export function requestLocale(locale) {
  return handler(locale);
}

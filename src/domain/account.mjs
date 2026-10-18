/**
 * The account rules the server and the forms share: how short a login or a password may be, what a
 * Telegram contact looks like, and what a registration or a password change is told.
 *
 * Read by the server routes and by the forms, so a form never refuses what the server takes or takes
 * what it refuses. The one rule the server does not enforce is the Telegram format (the UI spec's, §2):
 * it still takes any contact that is not empty, and only the forms apply the format.
 *
 * Pure: no DOM, no state, safe to import from the server.
 */

/** A login is at least this many characters, after trimming. */
export const LOGIN_MIN_LENGTH = 3;
/** A password is at least this many characters, as typed (the server does not trim it). */
export const PASSWORD_MIN_LENGTH = 4;
/** From this length a password is shown as strong; below it, as short of the best. */
export const STRONG_PASSWORD_LENGTH = 8;

const TELEGRAM_BARE_NAME = /^[A-Za-z0-9_]+$/;
const TELEGRAM_FORMAT = /^@[A-Za-z0-9_]{5,32}$/;

/**
 * A contact as the form submits it: trimmed, and a bare name given its `@`. Anything else, a link
 * included, is left as it was typed, for `telegramProblem` to refuse.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTelegram(value) {
  const contact = String(value ?? "").trim();
  return TELEGRAM_BARE_NAME.test(contact) ? `@${contact}` : contact;
}

/**
 * @param {unknown} value as typed; it is normalized first
 * @returns {null|"TELEGRAM_REQUIRED"|"TELEGRAM_FORMAT"} null for a contact the forms accept: `@` and
 *   5 to 32 letters, digits or underscores
 */
export function telegramProblem(value) {
  const contact = normalizeTelegram(value);
  if (!contact) return "TELEGRAM_REQUIRED";
  return TELEGRAM_FORMAT.test(contact) ? null : "TELEGRAM_FORMAT";
}

/**
 * @param {unknown} password
 * @returns {0|1|2|3} 0 for none, 1 for one the server refuses, 2 for one it takes, 3 for a long one
 */
export function passwordStrength(password) {
  const { length } = String(password ?? "");
  if (length === 0) return 0;
  if (length < PASSWORD_MIN_LENGTH) return 1;
  return length < STRONG_PASSWORD_LENGTH ? 2 : 3;
}

/**
 * What is wrong with a registration form, field by field. A field that is fine is not in the answer,
 * so `{}` is a form the server will take.
 *
 * @param {{login?: unknown, telegram?: unknown, password?: unknown, repeat?: unknown}} form as typed
 * @returns {{login?: "LOGIN_TOO_SHORT", telegram?: "TELEGRAM_REQUIRED"|"TELEGRAM_FORMAT",
 *   password?: "PASSWORD_TOO_SHORT", repeat?: "PASSWORDS_DIFFER"}}
 */
export function registrationProblems({ login, telegram, password, repeat }) {
  const problems = {};
  const typed = String(password ?? ""), again = String(repeat ?? "");
  if (String(login ?? "").trim().length < LOGIN_MIN_LENGTH) problems.login = "LOGIN_TOO_SHORT";
  const contact = telegramProblem(telegram);
  if (contact) problems.telegram = contact;
  if (typed.length < PASSWORD_MIN_LENGTH) problems.password = "PASSWORD_TOO_SHORT";
  if (again === "" || again !== typed) problems.repeat = "PASSWORDS_DIFFER";
  return problems;
}

/**
 * The three things a new password is checked for, in the order the form lists them. "New" and "typed
 * twice" are false while nothing is typed: an empty box has not passed them.
 *
 * @param {{current?: unknown, next?: unknown, repeat?: unknown}} form as typed
 * @returns {{key: "length"|"different"|"match", ok: boolean}[]}
 */
export function passwordChangeChecks({ current, next, repeat }) {
  const typed = String(next ?? "");
  return [
    { key: "length", ok: typed.length >= PASSWORD_MIN_LENGTH },
    { key: "different", ok: typed !== "" && typed !== String(current ?? "") },
    { key: "match", ok: typed !== "" && typed === String(repeat ?? "") },
  ];
}

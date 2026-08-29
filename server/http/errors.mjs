/**
 * Every refusal the API can give, as a code.
 *
 * Half the league reads Russian and the server answered all of them in English:
 * "Not authorized.", "Team not found.", "Wrong login or password." The client
 * has had a translation layer since the beginning and could not use it, because
 * what arrived was a finished English sentence.
 *
 * So an error carries `{ code, params }` and the client renders
 * `t("error.<CODE>", params)`. That is the mechanism roster violations have used
 * since step 3.6 — no second one is introduced here.
 *
 * The English text stays, as the value in this table, and travels with the
 * response as `message`. It is the fallback when a dictionary is missing the
 * key, and it is what a `curl` shows: a code alone is a worse answer to a
 * person holding a terminal than a sentence.
 *
 * Adding a code means adding `error.<CODE>` to both dictionaries;
 * test/api-errors.test.mjs fails until you do.
 */

/** @type {Readonly<Record<string, string>>} code → the English it used to say */
export const API_ERRORS = Object.freeze({
  ADMIN_REQUIRED: "Admin access required.",
  BASE_TEAM_REQUIRED: "Base team is required.",
  BODY_TOO_LARGE: "Request body is larger than {limitKb} KB.",
  BYE_NEEDS_NO_CONFIRMATION: "A BYE game does not require confirmation.",
  COACH_ALREADY_COMMITTED: "This coach already has a committed team.",
  COACH_NOT_FOUND: "Coach not found.",
  COACH_REQUIRED: "Coach is required.",
  ENTRY_ALREADY_COMMITTED: "This coach or team is already committed to the season.",
  ENTRY_NOT_FOUND: "Season entry not found.",
  FIXTURE_NOT_YOURS: "This fixture does not belong to your team.",
  FIXTURE_NOT_PLAYER_SUBMITTABLE: "This fixture cannot receive a player-submitted result.",
  GAME_NOT_FOUND: "Game not found.",
  GAME_NOT_STARTED: "This game has not started yet.",
  LOGIN_ALREADY_REGISTERED: "This login is already registered.",
  LOGIN_TOO_SHORT: "Login must be at least 3 characters.",
  LOGO_TOO_LARGE: "Logo is too large.",
  NEED_A_COMMITTED_TEAM: "Add at least one committed team first.",
  NEED_A_PAIRING: "Add at least one non-empty pairing before starting the round.",
  NOT_AUTHORIZED: "Not authorized.",
  NOT_A_NON_NEGATIVE_INTEGER: "{field} must be a non-negative integer.",
  NO_RESULT_AWAITING_CONFIRMATION: "There is no result awaiting confirmation.",
  PAIRING_NOT_FOUND: "Pairing not found.",
  PASSWORD_TOO_SHORT: "Password must be at least 4 characters.",
  PLAYER_NOT_FOUND: "Player not found.",
  PROPOSER_CANNOT_CONFIRM: "You proposed this result; your opponent has to confirm it.",
  RESULT_ALREADY_CONFIRMED: "This result is already confirmed.",
  RESULT_NEEDS_BOTH_TEAMS: "Enter touchdowns and casualties for both teams.",
  ROSTER_BREAKS_THE_RULES: "This roster breaks the league's rules.",
  ROUND_HAS_UNFINISHED_PAIRINGS: "Round {round} has unfinished pairings.",
  ROUND_IS_LOCKED: "This round cannot be changed.",
  ROUND_CLOSED_FOR_PLAYERS: "This round is closed for player result changes.",
  ROUND_NOT_FOUND: "Round not found.",
  ROUND_STILL_A_DRAFT: "Round {round} is still a draft. Start or delete it before creating another round.",
  ROUTE_NOT_FOUND: "API route not found.",
  SAVED_TEAM_NOT_FOUND: "Saved team not found.",
  SELF_ADMIN_DELETE: "You cannot delete your own admin account.",
  SELF_ADMIN_DEMOTE: "You cannot remove admin access from your own account.",
  SERVER_ERROR: "Server error.",
  TEAM_IN_SEASON_CANNOT_BE_DELETED:
    "This team has played in a season, so its results belong to other coaches too. It cannot be deleted.",
  TEAM_SAVED_ELSEWHERE: "This team was saved somewhere else after you opened it.",
  TEAM_NAME_REQUIRED: "Team name is required.",
  TEAM_NOT_FOUND: "Team not found.",
  TEAM_PLAYS_ITSELF: "A team cannot play itself.",
  TEAM_REQUIRED: "Team is required.",
  TELEGRAM_REQUIRED: "Telegram contact is required.",
  TOO_MANY_LOGIN_ATTEMPTS: "Too many attempts for this login. Try again shortly.",
  USER_NOT_FOUND: "User not found.",
  WRONG_LOGIN_OR_PASSWORD: "Wrong login or password.",
});

/** Fill `{name}` placeholders, the same shape `t()` uses on the client. */
function fillMessage(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : match
  ));
}

/**
 * An error the API turns into a status and a code rather than a 500.
 *
 * @param {number} status
 * @param {string} code a key of API_ERRORS
 * @param {object} [params] values for the message's placeholders
 */
export function httpError(status, code, params = {}) {
  const template = API_ERRORS[code];
  if (!template) throw new Error(`Unknown API error code: ${code}`);
  const error = new Error(fillMessage(template, params));
  error.status = status;
  error.code = code;
  error.params = params;
  return error;
}

/** The body an error is sent as: a code to translate, and English to fall back on. */
export function errorPayload(code, params = {}, message = "") {
  return {
    error: {
      code,
      params,
      message: message || fillMessage(API_ERRORS[code] ?? code, params),
    },
  };
}

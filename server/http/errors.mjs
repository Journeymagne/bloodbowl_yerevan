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
  POST_VALUE: 'Enter a valid non-negative whole number.',
  POST_DICE: 'Enter the result of a D{maximum} roll.',
  POST_STATISTICS: 'Player TD and CAS totals must match the result. Technical wins have no played TD or CAS.',
  POST_MVP: 'Choose the required MVP recipient(s) from eligible players.',
  POST_PLAYER: 'This player is unavailable for this action.',
  POST_FAVOURED: 'Record the Favoured of roll and a legal bonus skill when it triggers.',
  POST_ADVANCEMENT: 'This advancement is unavailable: check SPP, access and the chosen grant.',
  POST_STAT_LIMIT: 'This characteristic cannot be improved further.',
  POST_POSITION: 'The roster or position limit has been reached.',
  POST_SELL: 'Selling this player would leave fewer than seven rostered players.',
  POST_BUDGET: 'The treasury cannot cover this purchase or safe deposit.',
  POST_RAISE: 'This free Lineman requires Masters of Undeath and a recorded opposition death.',
  POST_ACTION: 'This action is unavailable at the current post-match step.',
  POST_RESULT: 'Both coaches must agree the result first.',
  POST_RESULT_LOCKED: 'Manage this result in its post-match checklist. Applied results are sealed.',
  POST_WAIT_STATISTICS: 'Wait for both coaches to finish recording player statistics and injuries.',
  POST_CAPTAIN: 'Select a captain for the next match.',
  POST_INCOMPLETE: 'Both coaches must complete and confirm their post-match checklists.',
  POST_CLOSED: 'This post-match is confirmed. Reopen your draft to make changes.',
  POST_NOT_STARTED: 'Start the match and save both match rosters before recording its post-match.',
  POST_REVISION: 'The post-match changed in another window. Refreshed the latest version.',
  POST_TEAM_CHANGED: 'The saved roster changed. Reset your draft from the current roster before continuing.',
  CHALLENGE_SELECTION_REQUIRED: "Choose a coach and your team.",
  CHALLENGE_SELF: "You cannot challenge yourself.",
  CHALLENGE_OPPONENT_UNAVAILABLE: "This coach has no team available for a challenge.",
  CHALLENGE_ALREADY_SENT: "A pending challenge with this team has already been sent to this coach.",
  CHALLENGE_ACTION: "Unknown challenge action.",
  CHALLENGE_NOT_YOURS: "Only the addressed coach can respond, and only the sender can cancel.",
  CHALLENGE_CLOSED: "This challenge has already been answered or cancelled.",
  CHALLENGE_NOT_FOUND: "Challenge not found.",
  FRIENDLY_TEAMS_FIXED: "The teams were chosen when this challenge was accepted.",
  TEAM_IN_FRIENDLY_GAMES: "This team belongs to a friendly pairing and cannot be deleted.",
  USER_IN_FRIENDLY_GAMES: "This coach belongs to friendly pairings and cannot be deleted.",
  MATCH_ACTION: "Unknown preparation action.",
  MATCH_DICE: "Enter an integer between 1 and {maximum}.",
  MATCH_JOURNEYMEN: "Choose a Lineman position. Journeymen can only bring the available roster up to seven players.",
  MATCH_LOCKED: "Reopen this selection before editing it.",
  MATCH_WAIT: "Finish the preceding step or wait for your opponent.",
  MATCH_PURCHASE: "This inducement cannot be selected: {item}.",
  MATCH_BUDGET: "The selection exceeds the available budget by {missing}k.",
  MATCH_STAR_LIMIT: "The maximum is {maximum} Star Player choices.",
  MATCH_ROSTER_LIMIT: "The match roster cannot exceed {maximum} players.",
  MATCH_POSITION_LIMIT: "The match roster allows at most {maximum} players at {position}.",
  MATCH_EFFECTS: "Record all required rolls, players and skills for purchased effects.",
  MATCH_KICKOFF: "The roll-off winner chooses the receiving team. Ties must be rerolled.",
  MATCH_STARTED: "This match has already started. Its preparation is read-only.",
  MATCH_ROSTER_CHANGED: "A team has changed. Reload and confirm the new match roster.",
  MATCH_REVISION: "The preparation changed on another device. Review the latest version.",
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
  SELF_PASSWORD_RESET: "Use your account settings to change your own password.",
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

/**
 * What the roster editor reads about the situation it serves, described as data.
 *
 * The editor serves a team already in play: purchases come out of its treasury,
 * there is no starting budget left to respect, and the rules it can break are
 * reported as violations rather than blocked. (It once also served a brand-new
 * team spending that budget; the 3.0 team builder replaced that, and with it the
 * flags only that situation set.)
 *
 * Components read these strings. They must never compare the mode's id — a
 * `if (mode.id === "league")` anywhere in a component means a rule leaked out
 * of this file.
 */

/**
 * @typedef {object} RosterEditorMode
 * @property {string} id                     which situation this is; for debugging, not for branching
 * @property {string} hireAttribute          the data attribute the hire buttons carry
 * @property {string} hireCountHeadingKey    i18n key for the "how many do I have" column
 * @property {string} staffAttribute         the data attribute the staff steppers carry
 * @property {string} staffCardClass         the wrapper class the staff card wears
 * @property {string} identityAttribute      data-attribute prefix on the identity controls
 * @property {string} identityFormClass      the class the identity form wears
 */

/**
 * A team already playing in the league, spending its treasury.
 *
 * Position limits are deliberately not enforced here, matching what the editor
 * has always done: a league roster that breaks one is reported by
 * validateRoster as a violation the coach can see and resolve, not something
 * the interface silently refuses.
 */
export const LEAGUE_MODE = Object.freeze({
  id: "league",
  hireAttribute: "add-saved-row",
  hireCountHeadingKey: "savedRoster.rosterHeading",
  staffAttribute: "roster-staff",
  staffCardClass: "roster-purchase-card",
  identityAttribute: "roster",
  identityFormClass: "saved-roster-form",
});

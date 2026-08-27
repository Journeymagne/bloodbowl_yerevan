/**
 * The two situations the roster editor serves, described as data.
 *
 * `create` is the builder: a brand-new team spending the league's starting
 * budget, where nothing may be bought once that budget is gone. `league` is a
 * team already in play: purchases come out of its treasury, there is no budget
 * left to respect, and the rules it can break are reported as violations
 * rather than blocked.
 *
 * Components read these flags. They must never compare mode names — a
 * `if (mode.id === "create")` anywhere in a component means a rule leaked out
 * of this file, which is how the two editors drifted apart in the first place
 * (12 pairs of near-identical functions, section 5.1 of the design spec).
 */

/**
 * @typedef {object} RosterEditorMode
 * @property {string} id                     which situation this is; for debugging, not for branching
 * @property {boolean} enforcesBudget        hiring refuses to exceed the league's starting budget
 * @property {boolean} enforcesPositionLimit hiring refuses to exceed a position's maximum
 * @property {boolean} spendsTreasury        a hire is paid for out of the team's treasury
 * @property {boolean} marksPurchased        players hired here are recorded as bought after the team started
 * @property {boolean} showsHireCards        the hire pool also renders cards for narrow screens
 * @property {string} hireAttribute          the data attribute the hire buttons carry
 * @property {string} hireCountHeadingKey    i18n key for the "how many do I have" column
 * @property {string} staffAttribute         the data attribute the staff steppers carry
 * @property {string} staffCardClass         the wrapper class the staff card wears
 */

/** A brand-new team, spending the league's starting budget. */
export const CREATE_MODE = Object.freeze({
  id: "create",
  enforcesBudget: true,
  enforcesPositionLimit: true,
  spendsTreasury: false,
  marksPurchased: false,
  showsHireCards: true,
  hireAttribute: "add-row",
  hireCountHeadingKey: "builder.selectedHeader",
  staffAttribute: "builder-staff",
  staffCardClass: "builder-tracker-control",
});

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
  enforcesBudget: false,
  enforcesPositionLimit: false,
  spendsTreasury: true,
  marksPurchased: true,
  showsHireCards: false,
  hireAttribute: "add-saved-row",
  hireCountHeadingKey: "savedRoster.rosterHeading",
  staffAttribute: "roster-staff",
  staffCardClass: "roster-purchase-card",
});

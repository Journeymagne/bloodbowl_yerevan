/**
 * League rules a roster can break, reported as codes.
 *
 * The domain does not know about languages, so it returns
 * `{ code, params }` and the interface renders it with
 * `t("validation.<code>", params)`. This replaces the four hardcoded English
 * strings that used to live in rosterWarnings() in src/app.js — the one place
 * in the app that bypassed the translation layer.
 */
import { rosterSizeLimits } from "../league-rules.mjs";
import { rosterMax, rowsForTeam } from "./values.mjs";

export const VALIDATION_CODES = Object.freeze({
  ROSTER_MIN_PLAYERS: "ROSTER_MIN_PLAYERS",
  ROSTER_MAX_PLAYERS: "ROSTER_MAX_PLAYERS",
  POSITION_MIN: "POSITION_MIN",
  POSITION_MAX: "POSITION_MAX",
});

/** Minimum quantity a position requires, e.g. 1 from "1-2". */
export function positionMinimum(qty) {
  const match = String(qty).match(/^(\d+)-/);
  return match ? Number(match[1]) : 0;
}

/**
 * @returns {{code: string, params: object}[]} empty when the roster is legal
 */
export function validateRoster(team, draft, costs) {
  const violations = [];

  if (costs.playersCount < rosterSizeLimits.min) {
    violations.push({ code: VALIDATION_CODES.ROSTER_MIN_PLAYERS, params: { min: rosterSizeLimits.min, count: costs.playersCount } });
  }
  if (costs.playersCount > rosterSizeLimits.max) {
    violations.push({ code: VALIDATION_CODES.ROSTER_MAX_PLAYERS, params: { max: rosterSizeLimits.max, count: costs.playersCount } });
  }

  rowsForTeam(team).forEach((row, index) => {
    const count = draft.roster?.[index] ?? 0;
    const min = positionMinimum(row.qty);
    const max = rosterMax(row.qty);
    if (count < min) {
      violations.push({ code: VALIDATION_CODES.POSITION_MIN, params: { position: row.position, min, count } });
    }
    if (count > max) {
      violations.push({ code: VALIDATION_CODES.POSITION_MAX, params: { position: row.position, max, count } });
    }
  });

  return violations;
}

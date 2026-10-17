/**
 * League rules a roster can break, reported as codes.
 *
 * The domain does not know about languages, so it returns
 * `{ code, params }` and the interface renders it with
 * `t("validation.<code>", params)`. This replaces the four hardcoded English
 * strings that used to live in rosterWarnings() in src/app.js — the one place
 * in the app that bypassed the translation layer.
 */
import { rosterSizeLimits, sppCounterDefinitions } from "../league-rules.mjs";
import { countToNumber, rosterMax, rowsForTeam } from "./values.mjs";
import { isMoneyAmount } from "../money.mjs";

export const VALIDATION_CODES = Object.freeze({
  ROSTER_MIN_PLAYERS: "ROSTER_MIN_PLAYERS",
  ROSTER_MAX_PLAYERS: "ROSTER_MAX_PLAYERS",
  POSITION_MIN: "POSITION_MIN",
  POSITION_MAX: "POSITION_MAX",
  TREASURY_INVALID: "TREASURY_INVALID",
  SAFE_INVALID: "SAFE_INVALID",
  SPP_OUT_OF_RANGE: "SPP_OUT_OF_RANGE",
  DUPLICATE_PLAYER_ID: "DUPLICATE_PLAYER_ID",
  SPP_EDIT_TOO_LARGE: "SPP_EDIT_TOO_LARGE",
});

/** The most one SPP counter of a player may hold. */
export const MAX_SPP_COUNTER = 999;

/**
 * The most steps one roster save may change SPP by, every player and counter together: each step is a
 * row of the history, written while the team is held (server/routes/teams.mjs, `writeSavedTeam`).
 */
export const MAX_SPP_EDIT_STEPS = 2000;

/**
 * An SPP counter as the history counts it: what the roster reads (`countToNumber`), held to 0…999 and
 * cut to a whole number. A roster may only be sent with counters like that (`playerViolations`); a blob
 * stored before the rule may hold anything, and its steps are counted from here.
 */
export function boundedSppCounter(value) {
  return Math.trunc(Math.min(MAX_SPP_COUNTER, Math.max(0, countToNumber(value))));
}

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
  if (!isMoneyAmount(draft.treasury ?? 0)) violations.push({ code: VALIDATION_CODES.TREASURY_INVALID, params: {} });
  if (!isMoneyAmount(draft.coachesSafe ?? 0)) violations.push({ code: VALIDATION_CODES.SAFE_INVALID, params: {} });

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

// A player's id as the roster stores it (normalizeRosterPlayer): none for a player without one, who is
// given an id of his own when the roster is read, and so never shares it.
const storedId = (player) => (player?.id ? String(player.id) : null);

// A player as a person reads him in a message: his name, or his place in the list when he has none.
const shownName = (player, row) => (typeof player?.name === "string" && player.name.trim()) || `#${row + 1}`;

/**
 * What a roster as sent breaks player by player, read before normalisation can hide it — it would
 * clamp a counter below zero to zero and give a player without an id one of his own:
 *
 * - SPP_OUT_OF_RANGE: an SPP counter (every one the roster keeps, MVPs included), read as the roster
 *   reads it (`countToNumber`), that is not a whole number from 0 to 999. A roster save writes each
 *   step of its SPP change as a row of the player's history, so a counter has to be one a career
 *   can reach: a typo of 100000 would be a hundred thousand rows. Params: `player` (his name, or
 *   `#<place in the list>` when he has none) and `counter` (its short label, TD…MVP), which a message
 *   shows; and his `playerId`, or his `row` in `players` (from 0) when he has no id, for the client to
 *   find him by.
 * - DUPLICATE_PLAYER_ID: two players under one id, once per id; every rule that finds a player by his
 *   id (rolls, deaths, events) would find either. Params: `names` (theirs, as `player` above, joined
 *   with ", ") and `playerId`.
 *
 * @param {object} roster the roster as a client sent it
 * @returns {{code: string, params: object}[]} empty when every player is fine
 */
export function playerViolations(roster) {
  const players = Array.isArray(roster?.players) ? roster.players : [];
  const violations = [];
  players.forEach((player, row) => {
    const who = { ...(storedId(player) === null ? { row } : { playerId: storedId(player) }), player: shownName(player, row) };
    for (const [key, label] of sppCounterDefinitions) {
      const value = countToNumber(player?.spp?.[key]);
      if (!Number.isInteger(value) || value < 0 || value > MAX_SPP_COUNTER) {
        violations.push({ code: VALIDATION_CODES.SPP_OUT_OF_RANGE, params: { ...who, counter: label } });
      }
    }
  });
  const named = new Map(); // id → the names of the players under it, in the roster's order
  players.forEach((player, row) => {
    const id = storedId(player);
    if (id !== null) named.set(id, [...(named.get(id) ?? []), shownName(player, row)]);
  });
  for (const [playerId, names] of named) {
    if (names.length > 1) violations.push({ code: VALIDATION_CODES.DUPLICATE_PLAYER_ID, params: { playerId, names: names.join(", ") } });
  }
  return violations;
}

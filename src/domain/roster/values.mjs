/**
 * Small parsers and shared value helpers for roster data.
 *
 * The content pipeline hands the app strings ("0-16", "50K"), so everything
 * here is about turning those into numbers predictably. Extracted verbatim from
 * src/app.js; behaviour is pinned by test/roster-domain.test.mjs.
 */
import { defaultPositionMaximum, skillAccessMap } from "../league-rules.mjs";

/**
 * The five printed characteristics, in the order a roster table shows them.
 *
 * Written down once (step 13.4): three files carried their own copy of this
 * array, and each of them turns a name here into a `stats.<name>` dictionary
 * key. A list nobody can enumerate is a list nothing can check.
 */
export const PLAYER_STATS = Object.freeze(["ma", "st", "ag", "pa", "ar"]);

export function splitList(value = "") {
  return String(value)
    .split(/,|;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function costToNumber(value = "") {
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function countToNumber(value = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function rowCost(row) {
  return row.cost ?? row.price ?? "";
}

export function rowsForTeam(team) {
  return team.team?.roster ?? [];
}

export function makeRosterPlayerId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function parseAccessCodes(values = []) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .flatMap((value) => String(value).split(/\s+/))
    .flatMap((code) => /^[ADGMPS]+$/.test(code) ? code.split("") : [code])
    .filter((code) => code && code !== "-"))];
}

export function categoriesForAccess(values = []) {
  return parseAccessCodes(values).map((code) => skillAccessMap[code]).filter(Boolean);
}

export function statValueForDisplayByStat(stat, base, mod = 0) {
  if (base === "-" || base === "") return base || "-";
  const match = String(base).match(/^(\d+)(\+)?$/);
  if (!match) return base;
  const raw = Number(match[1]);
  const next = ["ag", "pa"].includes(stat) ? raw - mod : raw + mod;
  return `${Math.max(1, next)}${match[2] ?? ""}`;
}


export function rosterMax(value = "") {
  // Quantities in the vault are ranges ("0-16"). A bare number falls back to
  // the default maximum, which is why a position written as "2" would not be
  // limited to 2 — see the content validation task in the refactor plan.
  const match = String(value).match(/-(\d+)/);
  return match ? Number(match[1]) : defaultPositionMaximum;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

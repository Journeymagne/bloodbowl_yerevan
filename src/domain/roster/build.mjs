/**
 * Building a new team: the rules of the builder, as plain functions on a draft.
 *
 * A coach starts with 600k, a race and nothing else, hires players and buys
 * staff, and the team is saved when the squad is 7 to 14 players inside the
 * budget. Everything here only reads the numbers `league-rules.mjs` and the
 * race's table give; it returns a refusal as `{ code, params }`, never a
 * sentence, and the screen words it with `t("validation.<code>", params)`.
 *
 * The budget is not a refusal. A coach may overspend while choosing, and the
 * overspend is counted (`buildTotals().over`) so the save waits for it to be
 * put right; hiring and buying never say no on money.
 *
 * Nothing here touches the DOM, storage or the network.
 */
import { builderStaffMaximums, medicalStaffDefinitions, rosterSizeLimits, startingBudget } from "../league-rules.mjs";
import { calculateRosterCosts } from "./costs.mjs";
import { canAddRowToDraft, rowCountInPlayers, syncRosterCountsFromPlayers } from "./players.mjs";
import { createDraft, createPlayer, draftPayload, rosterForStorage } from "./schema.mjs";
import { availableMedicalStaffDefinitions, hasBribery, teamFavouredOptions, teamLeagueOptions } from "./team-rules.mjs";
import { countToNumber, rosterMax, rowsForTeam } from "./values.mjs";

/**
 * What the builder sells. Team rerolls are not here: a Team Reroll is bought
 * once the team plays in a season, and building buys Starting rerolls instead
 * (`stage.mjs`).
 */
export const BUILD_STAFF_KEYS = Object.freeze([
  "startingRerolls",
  "dedicatedFans",
  "assistantCoaches",
  "cheerleaders",
  "bribes",
  "apothecary",
  "mortuaryAssistant",
  "plagueDoctor",
]);

/** Shirt numbers run 1 to 99. */
export const LAST_SHIRT_NUMBER = 99;

/**
 * A draft of a new team of this race: named, in the first league and with the
 * first favoured alignment the race has (none for most), nothing hired.
 *
 * @param {object} team the race's page
 * @param {{name?: string}} [options]
 */
export function newBuild(team, { name = "" } = {}) {
  const draft = createDraft(team);
  draft.teamName = String(name).trim();
  draft.selectedLeague = teamLeagueOptions(team)[0] ?? "";
  draft.favouredChoice = teamFavouredOptions(team)[0] ?? "";
  return draft;
}

/**
 * May this race buy this staff while building? Bribes need Bribery and
 * Corruption, a medic the race's own; the rest of the list is for everyone,
 * and a key that is not on it is not sold.
 */
export function staffAvailable(team, key) {
  if (!BUILD_STAFF_KEYS.includes(key)) return false;
  if (key === "bribes") return hasBribery(team);
  if (!medicalStaffDefinitions.some((staff) => staff.key === key)) return true;
  return availableMedicalStaffDefinitions(team).some((staff) => staff.key === key);
}

/** The lowest shirt number from 1 to 99 nobody wears, or 99 when all are worn. */
export function nextFreeNumber(players) {
  const worn = new Set(players.map((player) => Number(player.number)));
  for (let number = 1; number <= LAST_SHIRT_NUMBER; number += 1) {
    if (!worn.has(number)) return number;
  }
  return LAST_SHIRT_NUMBER;
}

/**
 * Hire one player of the position on row `rowIndex` of the race's table.
 *
 * @returns {{code: string, params: object}|null} why not, or null when he is hired
 * @throws {RangeError} when the race has no such row: that is the caller's mistake, not a rule
 */
export function hirePlayer(team, draft, rowIndex) {
  const row = rowsForTeam(team)[rowIndex];
  if (!row) throw new RangeError(`${team.slug} has no position on row ${rowIndex}`);
  if (!canAddRowToDraft(row, rowIndex, draft)) {
    return { code: "POSITION_MAX", params: { position: row.position, max: rosterMax(row.qty) } };
  }
  const count = draft.players.length;
  if (count >= rosterSizeLimits.max) {
    return { code: "ROSTER_MAX_PLAYERS", params: { max: rosterSizeLimits.max, count } };
  }
  draft.players.push(createPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex), { number: nextFreeNumber(draft.players) }));
  syncRosterCountsFromPlayers(draft);
  return null;
}

/**
 * Let go the position's last hire; the captaincy goes with the player.
 *
 * @returns {boolean} whether there was anyone of that position to drop
 */
export function dropPlayer(team, draft, rowIndex) {
  const index = draft.players.findLastIndex((player) => player.rowIndex === rowIndex);
  if (index === -1) return false;
  draft.players.splice(index, 1);
  syncRosterCountsFromPlayers(draft);
  return true;
}

/**
 * Buy (`delta` 1) or take back (`delta` -1) one of the staff `key`.
 * Stepping below none changes nothing.
 *
 * @returns {{code: string, params: object}|null} why not, or null when it is done
 */
export function stepStaff(team, draft, key, delta) {
  if (!staffAvailable(team, key)) return { code: "STAFF_UNAVAILABLE", params: { key } };
  const max = builderStaffMaximums[key];
  const next = countToNumber(draft[key]) + delta;
  if (next > max) return { code: "STAFF_MAX", params: { key, max } };
  if (next >= 0) draft[key] = next;
  return null;
}

/**
 * What the build costs and whether it can be saved: the budget left (negative
 * when overspent), how far the squad is short of the minimum, how far the
 * budget is overspent.
 */
export function buildTotals(team, draft) {
  const costs = calculateRosterCosts(team, draft, { includeDedicatedFans: true });
  const left = startingBudget - costs.total;
  const count = costs.playersCount;
  const short = Math.max(0, rosterSizeLimits.min - count);
  const over = Math.max(0, -left);
  return {
    playersCost: costs.playersCost,
    staffCost: costs.staffCost,
    total: costs.total,
    left,
    count,
    short,
    over,
    ready: !short && !over && count <= rosterSizeLimits.max,
  };
}

/**
 * The body of `POST /api/teams`: the race, the name, the logo (a column of its
 * own, so not in the roster) and the roster with what the build leaves unspent
 * as the new team's treasury.
 *
 * A build that is over the budget would send a negative treasury, which the
 * server refuses; the screen asks `buildTotals().ready` first.
 */
export function buildRequest(team, draft) {
  const name = String(draft.teamName ?? "").trim();
  const { left } = buildTotals(team, draft);
  return {
    name,
    baseTeamSlug: team.slug,
    logoData: draft.logoData || null,
    roster: rosterForStorage({ ...draftPayload(draft), teamSlug: team.slug, teamName: name, treasury: left }),
  };
}

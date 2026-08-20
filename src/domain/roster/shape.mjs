/**
 * Which storage shape a saved roster is in.
 *
 * The app used to accept three shapes and convert the old two on every read.
 * That support was removed once every saved team had been in the current shape
 * for a while. This module is what `scripts/check-roster-shapes.mjs` uses to
 * confirm that against a live database before the removal is deployed.
 *
 * Pure: it takes a parsed JSONB value and returns a verdict.
 */

export const ROSTER_SHAPES = Object.freeze({
  /** players[] with at least one player — the only shape that is read. */
  CURRENT: "current",
  /** Nothing stored at all: a team that was created and never filled in. */
  EMPTY: "empty",
  /** No usable players[], but data in one of the retired shapes. */
  RETIRED: "retired",
});

function playerCount(roster) {
  return Array.isArray(roster?.players) ? roster.players.length : 0;
}

function slotCount(roster) {
  return Array.isArray(roster?.slots)
    ? roster.slots.filter((slot) => slot && typeof slot === "object").length
    : 0;
}

function editCount(roster) {
  const edits = roster?.playerEdits;
  return edits && typeof edits === "object" && !Array.isArray(edits) ? Object.keys(edits).length : 0;
}

function countKeys(roster) {
  const counts = roster?.roster;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return 0;
  // Only non-zero counts describe players; syncRosterCountsFromPlayers writes
  // {} for an empty roster.
  return Object.values(counts).filter((value) => Number(value) > 0).length;
}

/**
 * @param {unknown} roster parsed `saved_teams.roster`
 * @returns {{shape: string, players: number, slots: number, edits: number, counts: number}}
 */
export function classifyRosterShape(roster) {
  const players = playerCount(roster);
  const slots = slotCount(roster);
  const edits = editCount(roster);
  const counts = countKeys(roster);

  let shape = ROSTER_SHAPES.EMPTY;
  if (players > 0) shape = ROSTER_SHAPES.CURRENT;
  else if (slots > 0 || edits > 0 || counts > 0) shape = ROSTER_SHAPES.RETIRED;

  return { shape, players, slots, edits, counts };
}

/** True when a roster still carries retired keys it no longer needs. */
export function hasVestigialKeys(roster) {
  return playerCount(roster) > 0 && (slotCount(roster) > 0 || editCount(roster) > 0);
}

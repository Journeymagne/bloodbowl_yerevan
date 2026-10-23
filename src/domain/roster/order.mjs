/** Reorder the listed slots only; hidden players and other sections keep their slots. */
export function rosterInOrder(players, indices) {
  if (!Array.isArray(indices) || indices.length < 2 || new Set(indices).size !== indices.length
    || indices.some((index) => !Number.isInteger(index) || index < 0 || index >= players.length)) return null;
  const slots = [...indices].sort((a, b) => a - b);
  if (slots.every((slot, at) => slot === indices[at])) return null;
  const ordered = [...players];
  slots.forEach((slot, at) => { ordered[slot] = players[indices[at]]; });
  return ordered;
}

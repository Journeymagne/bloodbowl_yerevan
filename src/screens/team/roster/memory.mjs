/**
 * What the roster keeps of a team while the page lives (plan 07a, decision 2): the column it is sorted by,
 * the player chosen (the open row on a phone, the one in the panel on a desk), the match whose taps are
 * edits outside it, and each player's SPP when the visit first showed him. A visit elsewhere and back finds
 * the first three as they were; nothing is written to the address or to the browser's storage, so a reload forgets.
 */

/** @type {Map<string, RosterMemory>} */
const memories = new Map();

/**
 * @typedef {object} RosterMemory
 * @property {{key: string, dir: "asc"|"desc"}|null} sort null is the roster's own order
 * @property {string|null} selected a line's key (`<id>#<place>`), or none
 * @property {string|null} outside the game id of the match in which «Edit outside the match» is on, or none: the
 *   switch is the team's and that match's (R13), so the next match starts with it off (stage 07a, Task 11)
 * @property {Map<string, number>} baseline a line's SPP when this visit first showed it, and the SPP of the edits
 *   outside the match waiting for him then: what the coach's edits are counted from
 */

/**
 * The memory of one team's roster: the same object on every visit while the page lives.
 *
 * @param {string} teamId
 * @returns {RosterMemory}
 */
export function rosterMemory(teamId) {
  if (!memories.has(teamId)) memories.set(teamId, { sort: null, selected: null, outside: null, baseline: new Map() });
  return memories.get(teamId);
}

/**
 * What a line's SPP has moved since the screen was opened: the sum of the coach's edits (plan 07a, decision 11);
 * with `outside`, only what the edits outside the match have moved it — a record of the match is no edit.
 * The first time a visit shows the line is where it is counted from; a visit, and the server's roster taken in
 * place of the coach's, starts the count again (`memory.baseline.clear()`).
 *
 * @param {RosterMemory} memory
 * @param {{key: string, earned: number, outsideSpp: number}} line
 * @param {{outside?: boolean}} [options]
 * @returns {number}
 */
export function sessionSppOf(memory, line, { outside = false } = {}) {
  const [key, now] = outside ? [`${line.key} outside`, line.outsideSpp] : [line.key, line.earned];
  if (!memory.baseline.has(key)) memory.baseline.set(key, now);
  return now - memory.baseline.get(key);
}

/**
 * What the roster keeps of a team while the page lives (plan 07a, decision 2): the column it is sorted by,
 * the player chosen (the open row on a phone, the one in the panel on a desk), the match whose taps are
 * edits outside it, and each player's SPP when the visit first showed him. A visit elsewhere and back finds
 * the first three as they were; nothing is written to the address or to the browser's storage, so a reload forgets.
 * The way back from a player's page (stage 07d, «‹ Roster») finds the page where the coach left it, too.
 */
import { onScreenLeave } from "../../../core/screen-lifecycle.mjs";

/** @type {Map<string, RosterMemory>} */
const memories = new Map();

/**
 * @typedef {object} RosterMemory
 * @property {{key: string, dir: "asc"|"desc"}|null} sort null is the roster's own order
 * @property {string|null} selected a line's key (`<id>#<n>`, model.mjs), or none
 * @property {string|null} outside the game id of the match in which «Edit outside the match» is on, or none: the
 *   switch is the team's and that match's (R13), so the next match starts with it off (stage 07a, Task 11)
 * @property {Map<string, number>} baseline a line's SPP when this visit first showed it, and the SPP of the edits
 *   outside the match waiting for him then: what the coach's edits are counted from
 * @property {number|null} scroll where the roster's page stood when the coach left it (`scrollY`), until the page after
 *   it is left in turn: none once another page came between
 * @property {number|null} wayBack where the roster stood when the coach left it for the player's page on screen
 * @property {boolean} fromPlayer the last page left was a player's, his profile drawn, and no other page came after it
 */

/**
 * The memory of one team's roster: the same object on every visit while the page lives.
 *
 * @param {string} teamId
 * @returns {RosterMemory}
 */
export function rosterMemory(teamId) {
  if (!memories.has(teamId)) memories.set(teamId, { sort: null, selected: null, outside: null, baseline: new Map(), scroll: null, wayBack: null, fromPlayer: false });
  return memories.get(teamId);
}

/**
 * What a line's SPP has moved since the screen was opened: the sum of the coach's edits (plan 07a, decision 11);
 * with `outside`, only what the edits outside the match have moved it — a record of the match is no edit.
 * The first time a visit shows the line is where it is counted from; a visit starts the count again
 * (`memory.baseline.clear()`), and so does the server's roster taken after a conflict — another device's save — but not
 * one taken after a refusal or a match, which holds the coach's saved steps as they were (index.mjs, `reloadRoster`).
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

/**
 * A page of the roster module is left (stage 07d, K4). `"roster"`: the roster's page — its own mode, or a desk's player
 * mode, which is the roster (M4) — keeps where it stood (`scroll`) for a player's page it is left for, and forgets it
 * once the page after it is left in turn (I1): the way back is from a page the roster led to, never over another page.
 * `"player"`: a player's page left with his profile drawn — a phone's, or a fallen player's own (M3) — leaves the way
 * back for the roster's next visit (`fromPlayer`), which a page between them forgets. `""` keeps nothing.
 *
 * @param {RosterMemory} memory
 * @param {"roster"|"player"|""} kind
 */
export function leaveVisit(memory, kind) {
  // Each forgetting is registered before it is set: one still waiting (a page drawn again with no leave between it and
  // the next) runs as it is replaced, and must not undo what is set now.
  if (kind === "roster") {
    onScreenLeave("team-roster-left", () => {
      memory.scroll = null;
    });
    memory.scroll = globalThis.scrollY ?? 0;
  } else if (kind === "player") {
    onScreenLeave("team-roster-back", () => {
      memory.fromPlayer = false;
    });
    memory.fromPlayer = true;
  }
}

/**
 * The way back, as a visit of the roster module takes it (every visit does, so it serves once). A player's page entered
 * from the roster keeps where the roster stood (`wayBack`), and one entered from another player's page the one that page
 * kept; the roster's next visit, back from it, puts its page there once its lines are drawn. Either visit keeps the
 * session's SPP count while there is a way back (M7): the drill into the profile and back is the roster's own.
 *
 * @param {RosterMemory} memory
 * @param {boolean} player the visit is a player's page (the player mode, a fallen player's own)
 * @returns {number|null} where the roster stood when the coach left it for the player's address; null for none
 */
export function takeWayBack(memory, player) {
  const kept = memory.fromPlayer ? memory.wayBack : null;
  memory.fromPlayer = false;
  memory.wayBack = player ? kept ?? memory.scroll : null;
  return player ? memory.wayBack : kept;
}

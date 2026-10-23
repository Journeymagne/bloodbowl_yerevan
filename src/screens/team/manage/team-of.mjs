/**
 * The two questions every part of the team page asks of what the page holds now: which team it is (the coach's list,
 * `state.myTeams`) and whether its match is on (the coach's games, `state.games`, judged by `matchLock`). The
 * resources, the sheets (money, fix, settings) and their host ask them here, each at the moment it needs the answer,
 * so a press made after the list or the games moved is judged on what moved.
 *
 * Kept apart from model.mjs (stage 13, decision 22; pre-flight L34): the model is plain functions of what it is given,
 * and these two read the state.
 */
import { state } from "../../../core/state.mjs";
import { matchLock } from "./model.mjs";

/**
 * The team as the coach's list holds it: the list's own object, not a copy; undefined for a team no longer on it.
 * @param {string} teamId @returns {object|undefined}
 */
export function teamOf(teamId) {
  return state.myTeams.items.find((item) => item.id === teamId);
}

/**
 * Whether the team's match is on as the page and the SideNav card judge it (`matchLock`, the card's own pick): the
 * resources and the money are closed until its post-match. A match being prepared only warns, and is not this.
 * @param {string} teamId @returns {boolean}
 */
export function isLive(teamId) {
  return matchLock(state.games.items, teamId)?.kind === "live";
}

/**
 * The roster's side of the rows a match's taps add (taps.mjs is the queue's; Task 11): a record of the match, or
 * with «Edit outside the match» an edit of the career that waits for the match's finish — never a save of the roster
 * (R8). A row is counted at once, as a row on its way (`visit.pending`), so the count, the match's «+1» and the minus
 * that takes it back move with the tap (Review Focus 1); its answer takes it out, and a written row takes its place.
 *
 * A failure is said once for the taps on their way, and where the server may hold what the screen does not, the
 * records are read again once they have all answered — never the tap sent again (R10).
 */
import { toast } from "../../../components/toast.mjs";
import { sendTap } from "./taps.mjs";

/**
 * What the screen lends this file: the route's team, the visit (index.mjs's `Visit`), the draw, and the read of the
 * team and its records with the games.
 * @typedef {{teamId: string, visit: object, draw: () => void, readAgain: () => void}} Tapping
 */

/** The refusals after which the server holds what the screen does not: the records are read again. */
const READ_AGAIN = new Set(["MATCH_NOT_LIVE", "EVENT_BELOW_ZERO"]);

/**
 * A tap answered. Its row on the way is out whatever the answer (R10), and a written one joins the records. A failure
 * is the first of its taps on the way — those behind it were dropped unsent (taps.mjs) — and the only one said; once
 * they have all answered, the records are read again if the server may hold what the screen does not: an answer that
 * was lost, a minus with nothing to take back, a match that is not on (which the games read with them end). A side
 * whose Players step is saved closes the match's own taps until the records are read again (Review Focus 2). A read
 * that landed while taps were on their way was not taken (index.mjs): it is made again here too.
 * @param {Tapping} tapping
 */
function heardTap(tapping, step, answer) {
  const { visit } = tapping;
  const at = visit.pending.indexOf(step);
  if (at >= 0) visit.pending.splice(at, 1);
  if (!visit.here) return;
  if (answer.event) {
    // Kept once: a read that already holds it (a safety net, since a read is not taken while a tap is on its way).
    if (!visit.events.some((event) => event.id === answer.event.id)) visit.events.push(answer.event);
    visit.heard.push(answer.event);
  } else if (!visit.failed) {
    visit.failed = true;
    toast(answer.refusal, { tone: "error" });
    if (answer.code === "EVENT_SIDE_LOCKED") visit.sideLocked = answer.refusal;
    else if (answer.lost || READ_AGAIN.has(answer.code)) visit.reread = true;
  }
  if (!visit.pending.length) {
    visit.failed = false;
    if (visit.reread) tapping.readAgain();
    visit.reread = false;
  }
  tapping.draw();
}

/**
 * Send one row (`{pairingId, playerId, counter, delta}`): drawn at once, on its way, and after the taps before it.
 * @param {Tapping} tapping
 */
export function sendRow(tapping, step) {
  tapping.visit.pending.push(step);
  tapping.draw();
  void sendTap(tapping.teamId, step).then((answer) => heardTap(tapping, step, answer));
}

/**
 * The records a read brought, and the rows the answers to taps have brought since it was sent (`since`, a place in
 * `visit.heard`) that it does not hold: a read made before a tap was written does not take its row away.
 */
export function withHeard(visit, events, since) {
  const later = visit.heard.slice(since).filter((row) => !events.some((event) => event.id === row.id));
  return [...events, ...later];
}

/** The rows of the match on that the team has, as last read and written: what its banner counts (decision 13). */
export function recordsOf(visit, mode) {
  return mode.kind === "match" ? visit.events.filter((event) => !event.settledAt && event.pairingId === mode.game.id).length : 0;
}

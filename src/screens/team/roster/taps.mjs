/**
 * A tap during a match, and an edit outside it, as the server takes them (`POST /api/teams/:id/events`): one at a
 * time per team, so a step down never overtakes the step up it takes back; an answer that does not come is not a
 * reason to send again — the rows are read again instead (master plan, 07a: taps go to the events,
 * EVENT_SIDE_LOCKED, EVENT_BELOW_ZERO).
 *
 * A tap is a row the server adds, not a save of the roster (save.mjs keeps the other queue): sending one again
 * after a lost answer may write it twice, and a minus after a plus that was never written takes a real point. So a
 * tap that fails in any way takes the taps queued behind it with it, and the screen reads the rows again.
 */
import { apiRequest, sessionTokenHolds } from "../../../core/api-client.mjs";
import { t } from "../../../core/i18n.mjs";
import { refusalWithRules, unanswered } from "../../../data/teams.mjs";

/**
 * The taps of a team that no answer has settled, in the order they were taken, by team. The first is in the air
 * (it leaves as soon as it is taken when nothing is); the others wait for it. A team with none has no entry.
 * @type {Map<string, {tap: object, settle: (answer: object) => void}[]>}
 */
const lanes = new Map();

/** The row as the server reads it: `injury` is only the injury counter's (any other counter's is refused). */
const bodyOf = ({ pairingId = null, playerId, counter, delta, injury = null }) => ({
  pairingId, playerId, counter, delta, ...(counter === "injury" ? { injury } : {}),
});

/** One tap to the server, whatever comes of it; it does not throw. */
async function send(teamId, tap) {
  try {
    // A tap queued behind another leaves later than the call that made it: the token is asked as it leaves.
    if (!sessionTokenHolds()) return { refusal: t("auth.otherTab"), code: null };
    const { event } = await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/events`, { method: "POST", body: JSON.stringify(bodyOf(tap)) });
    return { event };
  } catch (error) {
    // No answer, so no words of the server's to say; and not sent again, since it may have been written.
    if (unanswered(error)) return { refusal: t("teamRoster.tapLost"), code: null, lost: true };
    return { refusal: refusalWithRules(error), code: error?.code ?? null };
  }
}

/**
 * Send the taps of a lane one after another until it is empty. A tap is out of the lane (and out of
 * `tapsWaiting`) when its answer is known, before the caller is told; the taps behind a failed one are out with
 * it, and a tap taken after that is a lane of its own.
 */
async function work(teamId, lane) {
  while (lane.length) {
    const answer = await send(teamId, lane[0].tap);
    const [{ settle }] = lane.splice(0, 1);
    const dropped = "refusal" in answer ? lane.splice(0) : [];
    if (!lane.length) lanes.delete(teamId);
    settle(answer);
    for (const behind of dropped) behind.settle({ refusal: t("teamRoster.tapDropped"), code: null, lost: true });
  }
}

/**
 * One tap: a step of a counter of a player, in the match `pairingId` names, or outside any match without it.
 * It waits for the taps of the team taken before it.
 * @param {string} teamId
 * @param {{pairingId?: string|null, playerId: string, counter: string, delta: 1|-1, injury?: {code: string, stat?: string}|null}} tap
 * @returns {Promise<{event: object} | {refusal: string, code: string|null, lost?: true}>} the row the server wrote; or
 *   the refusal in words and its code (`code` null where the server said none: another tab's coach, a lost answer, a
 *   dropped tap), `lost` where it is not known whether the row was written (read the rows again).
 */
export function sendTap(teamId, tap) {
  return new Promise((settle) => {
    const lane = lanes.get(teamId);
    if (lane) {
      lane.push({ tap, settle });
      return;
    }
    const fresh = [{ tap, settle }];
    lanes.set(teamId, fresh);
    void work(teamId, fresh);
  });
}

/** The taps of the team that no answer has settled: the one in the air and those queued behind it. */
export function tapsWaiting(teamId) {
  return lanes.get(teamId)?.length ?? 0;
}

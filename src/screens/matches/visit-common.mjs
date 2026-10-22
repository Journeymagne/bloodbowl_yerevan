/**
 * What a visit of the preparation (prep.mjs, stage 09a) and of the post-match (post.mjs, 09b) share — one module since
 * stage 13 (the hand-off of 09b): the footer's button armed a moment after its action appears, the focus a draw left on
 * nothing, and the poll that reads the open page again.
 *
 * The footer's button keeps its place (`data-key="prep-cta"`) while its action changes under it — «Confirm the
 * preparation» into «Start the match», «Confirm the summary» into «Finish the match» —, so its action is armed only
 * `FOOTER_ARM_MS` after it appears: the second click of a double click does nothing. What the action is, each screen
 * says (its footer's own shape); the visit keeps the action drawn and when it is armed (`footerAction`, `footerAfter`),
 * which the screen's press reads.
 *
 * The poll keeps its own state — its timer, a read in the air, the failures and the ticks to wait — in what
 * `startPoll` returns, not on the visit: whether it may read now (`mayPoll`) and what a read does (`read`) are the
 * screen's.
 */
import { focusLost } from "../../core/dom.mjs";

/**
 * How long the footer's button waits after it turns into another action (09a's Task 11 review, I-1): a double click on
 * «Confirm the preparation» starts nothing, one on «Confirm the roster» buys nothing, one on «Confirm the summary»
 * finishes nothing.
 */
export const FOOTER_ARM_MS = 600;

/** How often the open page is read again, as 2.x did. */
const POLL_MS = 6000;

/** The most ticks a poll waits out after reads that failed: a minute between reads at most. */
const POLL_WAIT_MOST = 9;

/** A poll refused for good: the game is not there, or not the coach's. */
const POLL_STOPS = new Set([403, 404]);

/** Whether a read's refusal stops the poll for good, unless the caller says otherwise. */
const stopsForGood = (error) => POLL_STOPS.has(error?.status);

/** Arm the footer's action `FOOTER_ARM_MS` from now: a press before then is the rest of an earlier gesture. */
export function armFooter(visit) {
  visit.footerAfter = Date.now() + FOOTER_ARM_MS;
}

/**
 * The footer's action as the page now draws it (its screen's word for it, "" for none: a link on, a closed button, no
 * footer): armed when it appears — none before it, or another one.
 */
export function takeFooter(visit, action) {
  if (action && action !== visit.footerAction) armFooter(visit);
  visit.footerAction = action;
}

/** A focus left on nothing, or on a control a draw has just closed (`disabled` takes no press and no key). */
export const focusGone = (active) => focusLost(active) || Boolean(active?.hasAttribute?.("disabled"));

/**
 * Read the open page again every `everyMs` while the screen lets it (`mayPoll(visit)`: seen, nothing on its way, no
 * dialog open …) and no read of the poll's own is in the air; `read(visit)` reads and draws what it should. A read that
 * fails waits out more ticks each time (1, 3, 7, then `maxTicks`: up to a minute), a read that answers none; one refused
 * for good (`refusedForGood`: a 403, a 404) stops the poll.
 * @param {object} visit the screen's visit, handed to `read` and `mayPoll`
 * @param {object} options `read(visit)`, async — a refusal throws; `mayPoll(visit)`; `everyMs` (6000), `maxTicks` (9)
 *   and `refusedForGood(error)` (a 403, a 404): what both screens poll by unless told otherwise
 * @returns {Function} stops the poll (leaving, a match begun or finished); again, it does nothing
 */
export function startPoll(visit, { read, mayPoll, everyMs = POLL_MS, maxTicks = POLL_WAIT_MOST, refusedForGood = stopsForGood }) {
  const poll = { timer: 0, polling: false, failures: 0, wait: 0 };
  const stop = () => {
    clearInterval(poll.timer);
    poll.timer = 0;
  };
  const tick = async () => {
    if (poll.wait > 0) {
      poll.wait -= 1;
      return;
    }
    if (poll.polling || !mayPoll(visit)) return;
    poll.polling = true;
    try {
      await read(visit);
      poll.failures = 0;
    } catch (error) {
      // A read that finds no answer keeps what is drawn; a later one tries again.
      if (refusedForGood(error)) stop();
      poll.failures += 1;
      poll.wait = Math.min(2 ** poll.failures - 1, maxTicks);
    } finally {
      poll.polling = false;
    }
  };
  poll.timer = setInterval(() => void tick(), everyMs);
  return stop;
}

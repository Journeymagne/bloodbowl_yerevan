/**
 * The line under the roster that says whether the team is saved.
 *
 * Extracted from screens/saved-roster.mjs in step 15.5, when the status line
 * gained a second audience: it is now also what a screen reader is told after
 * a save, since #app-view stopped being one big live region.
 *
 * The banner offering a choice between two versions of a team is a different
 * thing and still lives in the screen: a conflict arrives between renders and
 * needs one, and that trigger has to be careful, since subscribe() replays the
 * status and every render subscribes again. It is the rest of step 4.7, in the
 * plan rather than shipped unverified — reaching the state needs unsaved
 * edits, which the beforeunload guard stops a check from driving.
 */
import { announce } from "../live-region.mjs";
import { SAVE_STATUS } from "../../data/roster-store.mjs";
import { t } from "../../core/i18n.mjs";

const STATUS_MESSAGES = {
  [SAVE_STATUS.IDLE]: "roster.autosaveDefaultMessage",
  [SAVE_STATUS.DIRTY]: "roster.unsavedStatus",
  [SAVE_STATUS.SAVING]: "roster.savingStatus",
  [SAVE_STATUS.SAVED]: "roster.autosavedStatus",
  [SAVE_STATUS.OFFLINE]: "roster.offlineStatus",
  [SAVE_STATUS.CONFLICT]: "roster.conflictStatus",
  [SAVE_STATUS.ERROR]: "roster.autosaveFailedStatus",
};

/** What autosave says out loud: results, not the typing in between. */
const ANNOUNCED = new Set([SAVE_STATUS.SAVED, SAVE_STATUS.OFFLINE, SAVE_STATUS.CONFLICT, SAVE_STATUS.ERROR]);

/** One save status as a sentence in the reader's language. */
export function autosaveMessageFor(status) {
  return t(STATUS_MESSAGES[status] ?? STATUS_MESSAGES[SAVE_STATUS.IDLE]);
}

/**
 * Keep the status line in step with the store.
 *
 * @param {HTMLElement} root the rendered screen, which holds the line
 * @param {object} store the roster store
 * @param {string} teamId
 * @returns {() => void} the unsubscribe, for the caller to register
 */
export function wireAutosaveStatus(root, store, teamId) {
  let announced = null;
  return store.subscribe(teamId, ({ status }) => {
    const node = root.querySelector("[data-autosave-status]");
    if (!node) return;
    const message = autosaveMessageFor(status);
    node.textContent = message;
    node.dataset.status = status;
    // "unsaved" and "saving" arrive on every keystroke, and a reader hearing
    // them cannot type. Outcomes are worth interrupting for, once per change.
    if (!ANNOUNCED.has(status) || status === announced) return;
    announced = status;
    announce(message);
  });
}

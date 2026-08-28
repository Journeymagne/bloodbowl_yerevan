/**
 * Banners above the roster editor.
 *
 * Two situations the editor used to say nothing about:
 *
 * 1. Edits that never reached the server before the tab was closed. They are
 *    mirrored into storage by the roster store, so on the next visit we can
 *    offer them back instead of quietly showing the older saved version.
 * 2. Someone else saved this team after it was opened here. Dormant until the
 *    server starts answering 409 (task 4 of the refactor plan), but the screen
 *    is ready for it.
 *
 * The rendering half is pure: it takes state and a translator, returns markup.
 */
import { listenerGroup } from "../core/dom.mjs";

/**
 * @param {object} options
 * @param {{savedAt: number}|null} options.pending mirrored unsaved edits
 * @param {string|number|null} options.serverUpdatedAt when the server last saved
 * @param {boolean} options.conflict the last save was refused as out of date
 * @param {(key: string) => string} options.t
 */
export function renderRosterNotices({ pending, serverUpdatedAt, conflict, t }) {
  const notices = [];

  if (isPendingNewer(pending, serverUpdatedAt)) {
    notices.push(`
      <div class="notice-box" data-key="roster-pending" data-roster-pending>
        <strong>${t("roster.pendingRestoreHeading")}</strong>
        <p>${t("roster.pendingRestoreBody")}</p>
        <div class="game-confirm-actions">
          <button class="primary-button" type="button" data-roster-restore-pending>${t("roster.pendingRestoreAction")}</button>
          <button class="filter-button danger-action" type="button" data-roster-discard-pending>${t("roster.pendingDiscardAction")}</button>
        </div>
      </div>
    `);
  }

  if (conflict) {
    notices.push(`
      <div class="notice-box" data-key="roster-conflict" data-roster-conflict>
        <strong>${t("roster.conflictStatus")}</strong>
        <p>${t("roster.conflictBody")}</p>
        <div class="game-confirm-actions">
          <button class="primary-button" type="button" data-roster-reload-server>${t("roster.conflictReloadAction")}</button>
        </div>
      </div>
    `);
  }

  return notices.join("");
}

/**
 * Only offer edits that are actually newer than what the server has. A mirror
 * left over from a save that did land would otherwise nag on every visit.
 */
export function isPendingNewer(pending, serverUpdatedAt) {
  const pendingStamp = Number(pending?.savedAt);
  if (!Number.isFinite(pendingStamp) || pendingStamp <= 0) return false;
  const serverStamp = typeof serverUpdatedAt === "number"
    ? serverUpdatedAt
    : Date.parse(serverUpdatedAt ?? "");
  if (!Number.isFinite(serverStamp)) return true;
  return pendingStamp > serverStamp;
}

/**
 * Attach the banners' buttons. Markup and behaviour live together so a screen
 * only has to say what each action means.
 *
 * Delegated to `root` rather than bound to the buttons: a banner appears and
 * disappears as the roster's state changes, and the screen wires once.
 *
 * @param {Element} root
 * @param {{onRestore: Function, onDiscard: Function, onReload: Function}} handlers
 * @returns {() => void} removes the listeners
 */
export function wireRosterNotices(root, { onRestore, onDiscard, onReload }) {
  const events = listenerGroup(root);
  events.on("click", "[data-roster-restore-pending]", onRestore);
  events.on("click", "[data-roster-discard-pending]", onDiscard);
  events.on("click", "[data-roster-reload-server]", onReload);
  return () => events.release();
}

/**
 * Show the conflict banner when the conflict arrives, not at the next render.
 *
 * The rest of step 4.7. The server answers 409 and the store reaches
 * `conflict`, but the banner is markup: without this, a coach whose team was
 * saved in another tab sees only the status line change, and the offer to take
 * the server's version waits for a render that may never come.
 *
 * The trigger has to be careful for two reasons. subscribe() replays the
 * current status immediately, and every render subscribes again — so a naive
 * "re-render on conflict" renders forever. The guard is the banner itself: if
 * it is already on screen, this conflict is the one that is already being
 * shown.
 *
 * @param {HTMLElement} root the rendered screen
 * @param {object} store the roster store
 * @param {string} teamId
 * @param {string} conflictStatus the store's conflict status value
 * @param {() => void} rerender
 * @returns {() => void} the unsubscribe, for the caller to register
 */
export function wireConflictBanner(root, store, teamId, conflictStatus, rerender) {
  return store.subscribe(teamId, ({ status }) => {
    if (status !== conflictStatus) return;
    if (root.querySelector("[data-roster-conflict]")) return;
    rerender();
  });
}

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
 * Pure: takes state and a translator, returns markup.
 */

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
      <div class="notice-box" data-roster-pending>
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
      <div class="notice-box" data-roster-conflict>
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
 * @param {ParentNode} root
 * @param {{onRestore: Function, onDiscard: Function, onReload: Function}} handlers
 */
export function wireRosterNotices(root, { onRestore, onDiscard, onReload }) {
  root.querySelector("[data-roster-restore-pending]")?.addEventListener("click", onRestore);
  root.querySelector("[data-roster-discard-pending]")?.addEventListener("click", onDiscard);
  root.querySelector("[data-roster-reload-server]")?.addEventListener("click", onReload);
}

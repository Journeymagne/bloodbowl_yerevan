/**
 * The roster's marks (stage 07b): a missed match and back on the roster, which are steps of the save queue (save.mjs)
 * and are drawn at once from its draft; a death and its undo (fallen.mjs), which are not, and go only when the queue
 * has nothing waiting. None of them during a match (R8): their place is the match's injury. What a sheet holds lives
 * on the visit, as the injury's sheet does (injury.mjs).
 *
 * A mark is a step like a tap on a counter: it waits for the network with them, a lost answer is known by the 409
 * that holds it, another device's save is the coach's to settle, and a match that begins while it waits gives it up
 * with the coach told how many (index.mjs, `reloadRoster`). A player who misses the next match is offered no second
 * mark — it would lay its injury over the first — but «Back on the roster», then a mark (owner's question 4).
 */
import { toast } from "../../../components/toast.mjs";
import { keyed } from "./injury.mjs";
import { chosenMark } from "./mark-sheet.mjs";
import { markClosed, returnClosed } from "./panel.mjs";
import { markSkip, unmarkSkip } from "./save.mjs";

/**
 * The screen as it stands at a press, as far as a mark goes: the mode, why every write is closed just now, the save
 * queue's state, and the lines — the roster's and the fallen.
 * @typedef {{mode: object, lock: string, save: {status: string, waiting: number}, lines: import("./model.mjs").PlayerLine[],
 *   fallen: import("./model.mjs").FallenLine[]}} Now
 */

/** The player of `key` on the roster as it stands, or null: the sheet's, a row's. */
const lineOf = (where, key) => where.lines.find((line) => line.key === key) ?? null;

/**
 * The sheet as the screen draws it, or null when it stands no longer: a missed match's while its player is on the
 * roster, plays the next match and no match is on. It says why no mark can be made just now (`markClosed`).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where & {save: {status: string, waiting: number}}} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function markSheetOf(visit, lines, where) {
  const { sheet } = visit;
  const line = sheet?.kind === "mark" ? lines.find((item) => item.key === sheet.key && !item.fallen) : null;
  if (!line || line.skip || where.mode.kind === "match") return null;
  return { ...sheet, reason: markClosed(line, where) };
}

/**
 * «Mark the missed match»: the choice made whole and the closure asked again, then one step of the queue. A refusal
 * (another tab's coach, the rules a 422 left the queue waiting on) is said in the sheet, which stays as it was; a
 * step taken closes it, and the focus goes to his row's button — in «Missing the match» now, under the same key — and
 * the panel keeps him. A step not taken (he misses the match already, the conflict the screen's lock says) changes
 * nothing but the drawing, which closes a sheet that no longer stands. A refusal while the queue waits for the server's
 * roster after a 422 asks for it again (`refused`), as a counter's step does: else a read that failed would leave
 * every press to say the same rule and nothing more (07a, c088324).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => Now, refused: () => void}} options
 */
function sendMark({ teamId, visit, memory, draw }, { now, refused }) {
  const { sheet } = visit;
  if (sheet?.kind !== "mark" || sheet.busy) return;
  const where = now();
  const line = lineOf(where, sheet.key);
  const reason = line ? markClosed(line, where) : "";
  const mark = chosenMark(sheet.choice);
  if (reason) toast(reason);
  if (reason || !mark) return;
  const answer = line && !line.skip ? markSkip(teamId, line.id, mark) : { ok: false };
  if (answer.refusal) sheet.refusal = answer.refusal;
  else if (answer.ok) {
    Object.assign(visit, { sheet: null, opener: null });
    memory.selected = sheet.key;
  }
  draw();
  if (answer.ok) keyed("data-row-key", sheet.key)?.focus();
  if (answer.refusal) refused();
}

/**
 * What the marks' presses do (wire.mjs): «Miss a match…» opens the sheet, a reason, its characteristic or its words
 * are kept in it, «Mark the missed match» takes the step (`sendMark`), «Back on the roster» takes its own. A press on
 * one that is closed says why and does nothing.
 *
 * The sheet's `busy` is a write of it on its way: a missed match never is one (a step of the queue closes the sheet at
 * once), a death is (Task 8), and the sheet's button sends nothing while it is.
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => Now, refused: () => void}} options `now` is the screen as it stands at the press; `refused`
 *   is what a step the queue refused asks for: the server's roster again, when a 422's read of it failed (index.mjs)
 */
export function markHandlers(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  // The same sheet, changed: the field the coach types in survives the redraw (patchWithModal keeps its caret). A
  // refusal was said of the choice before, and goes with it.
  const change = (part) => {
    if (visit.sheet?.kind !== "mark") return;
    Object.assign(visit.sheet, { choice: { ...visit.sheet.choice, ...part }, refusal: "" });
    draw();
  };
  return {
    onMark: (key, button) => {
      const where = now();
      const line = lineOf(where, key);
      if (!line || line.skip) return;
      const reason = markClosed(line, where);
      if (reason) toast(reason);
      else {
        Object.assign(visit, { sheet: { kind: "mark", key, choice: { code: "", stat: "", text: "" }, busy: false, refusal: "" }, opener: button });
        draw();
      }
    },
    onMarkChoice: (part) => change(part),
    onMarkText: (text) => change({ text }),
    onMarkSend: () => sendMark(saving, { now, refused }),
    onReturn: (key) => {
      const where = now();
      const line = lineOf(where, key);
      if (!line?.skip) return;
      const reason = returnClosed(line, where);
      if (reason) {
        toast(reason);
        return;
      }
      const { refusal } = unmarkSkip(teamId, line.id);
      if (!refusal) return;
      toast(refusal, { tone: "error" });
      refused();
    },
  };
}

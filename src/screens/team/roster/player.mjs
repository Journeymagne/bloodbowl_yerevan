/**
 * What a player's own controls do (stage 07d): the pencil opens his edit — number, name, the captaincy — and «Save» is
 * one step of the save queue; on a desk the edit also carries his SPP counters outside a match (owner's D3), each press
 * a step of its own as on a phone. None during a match (R8). What a sheet holds lives on the visit, as the marks' do.
 *
 * A skill's chip, in his row, his panel or his profile, opens the skill's rule (07a). The edit's sheet is drawn by
 * player-sheets.mjs; its tiles are the roster's counters, whose presses index.mjs's `onStep` takes as every counter's.
 */
import { toast } from "../../../components/toast.mjs";
import { closeSheet } from "./injury.mjs";
import { editClosed } from "./panel.mjs";
import { editCheck } from "./player-sheets.mjs";
import { amendPlayer } from "./save.mjs";

/** The roster's line of `key`, never one of the fallen (whose number, name and armband are history), or null. */
const rosterLineOf = (lines, key) => lines.find((line) => line.key === key && !line.fallen) ?? null;

/**
 * A player's sheet as the screen draws it, or null when it stands no longer: his line has left the roster (read again,
 * or fallen), or a match has begun (R8) — the screen closes it, and the focus goes back to his pencil, closed now
 * (`openerOf`). The edit says why «Save» is closed just now (`editClosed`: the screen's lock).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function playerSheetOf(visit, lines, where) {
  const { sheet } = visit;
  const line = sheet ? rosterLineOf(lines, sheet.key) : null;
  if (!line || where.mode.kind === "match") return null;
  return sheet.kind === "edit" ? { ...sheet, reason: editClosed(line, where) } : null;
}

/**
 * The player of `key` as the screen stands at the press (`now`): his line on the roster, the draft the edit is checked
 * on, and why his edit cannot be saved just now ("" when it can); null when he is not on the roster.
 */
function playerOf(now, key) {
  const where = now();
  const line = rosterLineOf(where.lines, key);
  return line ? { line, draft: where.draft, reason: editClosed(line, where) } : null;
}

/**
 * «Save»: only from the edit that is open — a press that finds none is a second press, and sends nothing. Why it is
 * closed is asked again, then the form as the draft stands: one the roster would refuse, or that changes nothing, sends
 * nothing (the sheet says so, «Save» shut). Then one step of the queue (`amendPlayer`) and, in the same turn, the sheet
 * closes, the focus back on the pencil, his number, name and armband drawn at once from the draft. A refusal (another
 * tab's coach, the rules a 422 left the queue on) is said in the sheet, which stays; one of the queue's 422 asks for the
 * server's roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 */
function saveEdit(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== "edit") return;
  const player = playerOf(now, sheet.key);
  if (!player) return;
  if (player.reason) {
    toast(player.reason);
    return;
  }
  const { refusal, changed } = editCheck(player.draft, player.line, sheet.form);
  if (refusal || !changed) return;
  const answer = amendPlayer(teamId, player.line.id, { ...sheet.form }, { closed: () => editClosed(player.line, now()) });
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  closeSheet(saving);
}

/**
 * What a player's own presses do (wire.mjs): a skill's chip opens its rule; the pencil opens his edit with his number,
 * name and armband as they stand, unless something closes it just now (said instead); a field typed in or the switch
 * flipped changes the edit's form, and the last refusal goes with the form it was said of; «Cancel» closes it, the focus
 * back on the pencil; «Save» saves it (`saveEdit`).
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => object, refused: () => void}} lent what the screen lends: `now` is the screen as it stands at the
 *   press; `refused` asks for the server's roster again after a refusal of the queue's 422 whose read failed (index.mjs)
 */
export function playerHandlers(saving, lent) {
  const { visit, draw } = saving;
  // The edit that is open, changed: the same sheet, so that an answer on its way still finds it.
  const change = (fields) => {
    if (visit.sheet?.kind !== "edit") return;
    Object.assign(visit.sheet, { form: { ...visit.sheet.form, ...fields }, refusal: "" });
    draw();
  };
  return {
    onSkill: (key, name, chip) => {
      Object.assign(visit, { sheet: { kind: "skill", key, name }, opener: chip });
      draw();
    },
    onEdit: (key, button) => {
      const player = playerOf(lent.now, key);
      if (player?.reason) toast(player.reason);
      else if (player) {
        const { number, name, captain } = player.line;
        Object.assign(visit, { sheet: { kind: "edit", key, form: { number, name, captain }, refusal: "" }, opener: button });
        draw();
      }
    },
    onEditField: (field, value) => {
      if (field === "number" || field === "name") change({ [field]: String(value ?? "") });
    },
    onEditCaptain: (on) => change({ captain: Boolean(on) }),
    onEditKeep: () => {
      if (visit.sheet?.kind === "edit") closeSheet(saving);
    },
    onEditSave: () => saveEdit(saving, lent),
  };
}

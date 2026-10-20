/**
 * «Save» of a player's own sheet (stage 07d; Task 13 fix round 1, M5): his edit (player.mjs) and his fix by hand
 * (fix.mjs) are saved the same way, so the way is here once — the player as the screen stands at the press, why his
 * sheet is closed just now, the form checked on the draft, one step of the queue, a refusal into the sheet, the sheet
 * closed. A module of its own, so that the two that save with it need not import each other.
 */
import { toast } from "../../../components/toast.mjs";
import { rowsForTeam } from "../../../domain/roster/values.mjs";
import { closeSheet } from "./injury.mjs";
import { editClosed } from "./player-access.mjs";

/** The roster's line of `key`, never one of the fallen (whose number, name and armband are history), or null. */
export const rosterLineOf = (lines, key) => lines.find((line) => line.key === key && !line.fallen) ?? null;

/**
 * The player of `key` as the screen stands at the press (`now`): his line on the roster, the player as the draft stores
 * him and his position, the screen, and why his edit or his fix cannot be saved just now (`editClosed`: a match, the
 * screen's lock, no id; "" when it can); null when he is not on the roster.
 *
 * @param {() => object} now @param {string} key his line's
 */
export function playerAt(now, key) {
  const where = now();
  const line = rosterLineOf(where.lines, key);
  const stored = line ? where.draft.players[line.index] : null;
  if (!stored) return null;
  return { line, stored, where, row: where.race ? rowsForTeam(where.race)[Number(stored.rowIndex)] : null, reason: editClosed(line, where) };
}

/**
 * «Save» of the player's sheet of `kind` that is open: only from that sheet — a press that finds none is a second
 * press, and sends nothing. Why it is closed is asked again (said), then the form as the draft stands (`check`): one the
 * roster would refuse, or that changes nothing, sends nothing (the sheet says so, «Save» shut). Then one step of the
 * queue (`send`, lent why the screen is closed at the step's own press, K15) and, in the same turn, the sheet closes, the
 * focus back on the pencil, the player drawn at once from the draft. A refusal (another tab's coach, the rules a 422
 * left the queue on) is said in the sheet, which stays; one of the queue's 422 asks for the server's roster again
 * (`refused`). While the step is taken the sheet is `sending`: the draw the queue makes then is the step's own.
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => object, refused: () => void}} lent
 * @param {{kind: string, check: (player: object, form: object) => {refusal: object|null, changed: boolean},
 *   send: (player: object, form: object, closed: () => string) => {ok?: boolean, refusal?: string}}} how
 */
export function savePlayerSheet(saving, { now, refused }, { kind, check, send }) {
  const { visit, draw } = saving;
  const { sheet } = visit;
  const player = sheet?.kind === kind ? playerAt(now, sheet.key) : null;
  if (!player) return;
  if (player.reason) {
    toast(player.reason);
    return;
  }
  const { refusal, changed } = check(player, sheet.form);
  if (refusal || !changed) return;
  sheet.sending = true;
  const answer = send(player, structuredClone(sheet.form), () => editClosed(player.line, now()));
  sheet.sending = false;
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  closeSheet(saving);
}

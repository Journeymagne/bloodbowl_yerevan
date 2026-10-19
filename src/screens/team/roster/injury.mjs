/**
 * «Injury in the match…» on the roster (Task 12, decision 14): the sheet it opens, what is chosen in it, and the
 * row it sends. An injury is a row of the match like any tap (R14): it goes with `sendRow`, and its answer is heard
 * there, once, as every tap's is (match-taps.mjs) — the row counted while it is on its way, the side lock, a match
 * that is no longer live, and the one read of the records when a row's fate is not known. The sheet only follows
 * that answer: a row written closes it; a refusal, said, leaves it open as it was; a row whose fate is not known
 * (its answer lost, or dropped behind a tap that failed) closes it while the records are read, so that no second
 * injury leaves before the read says whether the first was written. While one of his is on its way the sheet's
 * buttons wait for it.
 */
import { view } from "../../../core/view.mjs";
import { toast } from "../../../components/toast.mjs";
import { sendRow } from "./match-taps.mjs";
import { injuryClosed } from "./panel.mjs";
import { chosenInjury } from "./sheets.mjs";

/** An injury of this player is on its way: the sheet sends no other until it has answered (R14). */
const inTheAir = (visit, playerId) => visit.pending.some((step) => step.counter === "injury" && step.playerId === playerId);

/** An injury may be recorded for him: a match is on, a tap is a record of it, and he plays it. */
const injuryStands = (line, { mode, outside }) => mode.kind === "match" && !outside && !line.skip;

/**
 * The sheet as the screen draws it, or null when it stands no longer: its player has left the roster (read again),
 * or no injury may be recorded for him any more (the match is over, the switch is on).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines
 * @param {{mode: object, outside: boolean}} where the mode and the switch, as the screen is drawn with them
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function sheetOf(visit, lines, where) {
  const { sheet } = visit;
  const line = sheet ? lines.find((item) => item.key === sheet.key) : null;
  if (!line) return null;
  if (sheet.kind !== "injury") return sheet;
  return injuryStands(line, where) ? { ...sheet, busy: inTheAir(visit, line.id) } : null;
}

/** The injury's button of the player a closed sheet was for, as drawn now. */
function injuryButtonOf(sheet) {
  if (sheet?.kind !== "injury") return null;
  return [...view.querySelectorAll("[data-roster-injury]")].find((button) => button.getAttribute("data-roster-injury") === sheet.key) ?? null;
}

/**
 * The sheet that is open closed, and the focus given back to what opened it: the chip of a skill, the injury's
 * button (or the one drawn in its place).
 * @param {{visit: object, draw: () => void}} saving the visit and its draw (index.mjs)
 */
export function closeSheet({ visit, draw }) {
  const { opener, sheet } = visit;
  Object.assign(visit, { sheet: null, opener: null });
  draw();
  const back = opener?.isConnected ? opener : injuryButtonOf(sheet);
  back?.focus();
}

/**
 * The row of one press of the sheet's buttons: the injury chosen (+1), or the one that stands taken back by its
 * own −1. None while one of his is on its way, nor while the match's taps are closed (said instead).
 */
function record(saving, tapping, delta, playerOf) {
  const { visit } = saving;
  const { sheet } = visit;
  const player = sheet?.kind === "injury" ? playerOf(sheet.key) : null;
  if (!player || inTheAir(visit, player.line.id)) return;
  if (player.reason) {
    toast(player.reason);
    return;
  }
  const injury = delta > 0 ? chosenInjury(sheet.choice) : player.line.injury;
  if (!injury) return;
  const step = { pairingId: player.mode.game.id, playerId: player.line.id, counter: "injury", delta, injury };
  void sendRow(tapping, step).then((answer) => {
    // A refusal is said (heardTap) and leaves the sheet as it was; another sheet opened meanwhile is not this one's.
    if (!visit.here || visit.sheet !== sheet || (!answer.event && !answer.lost)) return;
    closeSheet(saving);
  });
}

/**
 * What the injury's presses do (wire.mjs): its button opens the sheet, a card or a characteristic chosen is kept in
 * it, «Record in the match» and «Remove the record» send their row.
 *
 * @param {{visit: object, draw: () => void}} saving the visit's side of the queue (index.mjs's `Saving`)
 * @param {object} options
 * @param {import("./match-taps.mjs").Tapping} options.tapping what `sendRow` is lent
 * @param {() => {mode: object, outside: boolean, lines: import("./model.mjs").PlayerLine[], lock: string}} options.now
 *   the screen as it stands at the press: the mode, the switch, the lines, and why no tap is taken just now
 */
export function injuryHandlers(saving, { tapping, now }) {
  const { visit, draw } = saving;
  // The player of `key` while an injury may be recorded for him, with why it may not be just now ("" when it may).
  const playerOf = (key) => {
    const where = now();
    const line = where.lines.find((item) => item.key === key);
    if (!line || !injuryStands(line, where)) return null;
    return { line, mode: where.mode, reason: injuryClosed(line, { lock: where.lock, sideLocked: visit.sideLocked }) };
  };
  return {
    onInjury: (key, button) => {
      const player = playerOf(key);
      if (player?.reason) toast(player.reason);
      else if (player) {
        Object.assign(visit, { sheet: { kind: "injury", key, choice: { code: "", stat: "" } }, opener: button });
        draw();
      }
    },
    onInjuryChoice: (change) => {
      if (visit.sheet?.kind !== "injury") return;
      // The same sheet, changed: an answer on its way still finds it (`record`).
      visit.sheet.choice = { ...visit.sheet.choice, ...change };
      draw();
    },
    onInjuryStep: (delta) => record(saving, tapping, delta, playerOf),
  };
}

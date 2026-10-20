/**
 * «Injury in the match…» on the roster (Task 12, decision 14): the sheet it opens, what is chosen in it, and the
 * row it sends. An injury is a row of the match like any tap (R14): it goes with `sendRow`, and its answer is heard
 * there, once, as every tap's is (match-taps.mjs) — the row counted while it is on its way, the side lock, a match
 * that is no longer live, and the one read of the records when a row's fate is not known. The sheet only follows
 * that answer: a row written closes it; a refusal, said, leaves it open as it was; a row whose fate is not known
 * (its answer lost, or dropped behind a tap that failed) closes it while the records are read, so that no second
 * injury leaves before the read says whether the first was written — and if that read fails, none does until a read
 * succeeds (`visit.unsure`, fix round 1). While one of his is on its way the sheet's buttons wait for it; while the
 * match's taps are closed they say why. A sheet is its match's: another match on, or none, closes it.
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
 * What the screen is drawn with, as far as an injury goes: the mode and the switch, and why the match's taps are
 * closed — the screen's lock, the side lock, an injury whose fate is not known (`injuryClosed`).
 * @typedef {{mode: object, outside: boolean, lock: string, sideLocked: string, unsure: boolean}} Where
 */

/**
 * The sheet as the screen draws it, or null when it stands no longer: its player has left the roster (read again),
 * or no injury may be recorded for him in its match any more (the match is over, another is on, the switch is on).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines
 * @param {Where} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function sheetOf(visit, lines, where) {
  const { sheet } = visit;
  const line = sheet ? lines.find((item) => item.key === sheet.key) : null;
  if (!line) return null;
  if (sheet.kind !== "injury") return sheet;
  if (!injuryStands(line, where) || where.mode.game.id !== sheet.gameId) return null;
  return { ...sheet, busy: inTheAir(visit, line.id), reason: injuryClosed(line, where) };
}

/**
 * The buttons that open a sheet, by the sheet's kind: a player's carry his line's key — his pencil and his
 * «Advancement» too (stage 07d), and his pencil again for the fix by hand, which his edit opens, and for the undo of
 * his last advancement, which the fix opens in its place (decision 40); the hire cart's «+» carries "hire" (stage 07c).
 */
const OPENERS = Object.freeze({
  injury: "data-roster-injury", mark: "data-roster-mark", undo: "data-roster-undo", hire: "data-roster-hire", sell: "data-roster-sell", edit: "data-player-edit",
  advance: "data-player-advance", unadvance: "data-player-edit", fix: "data-player-edit",
});

/** The element under the view whose `attribute` names `key`, or null: matched as text, so no key can break a selector. */
export const keyed = (attribute, key) => [...view.querySelectorAll(`[${attribute}]`)].find((element) => element.getAttribute(attribute) === key) ?? null;

/**
 * Where the focus goes back to when a sheet has closed: what opened it, or the button of the same player drawn in its
 * place — for the hire cart the «+» drawn again, in the header or under the words (stage 07c); for a mark's or an
 * undo's (stage 07b), else his row's own button — a match begun takes the actions away, a
 * mark moves him to another table. Null when there is none (the match is over: the screen gives it to the title).
 * What opened it counts only while it still names the sheet's player: the desk's panel patches its buttons for the
 * next player when a read takes this one away, and Enter must not open a sheet for someone else (T6-1).
 * @param {{opener: Element|null, sheet: object|null}} closed the sheet that was open, and what opened it
 */
export function openerOf({ opener, sheet }) {
  const attribute = OPENERS[sheet?.kind];
  if (opener?.isConnected && (!attribute || opener.getAttribute(attribute) === sheet.key)) return opener;
  if (!attribute) return null;
  const again = keyed(attribute, sheet.key);
  if (again || sheet.kind === "injury") return again;
  return keyed("data-row-key", sheet.key);
}

/**
 * The sheet that is open closed, and the focus given back to what opened it.
 * @param {{visit: object, draw: () => void}} saving the visit and its draw (index.mjs)
 */
export function closeSheet({ visit, draw }) {
  const closed = { opener: visit.opener, sheet: visit.sheet };
  Object.assign(visit, { sheet: null, opener: null });
  draw();
  openerOf(closed)?.focus();
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
    // Not known whether it was written: no injury until a read of the records says (index.mjs's holdTeam clears it).
    if (answer.lost) visit.unsure = true;
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
 * @param {() => Where & {lines: import("./model.mjs").PlayerLine[]}} options.now the screen as it stands at the
 *   press: the mode, the switch, why no tap is taken just now, and the lines
 */
export function injuryHandlers(saving, { tapping, now }) {
  const { visit, draw } = saving;
  // The player of `key` while an injury may be recorded for him, with why it may not be just now ("" when it may).
  const playerOf = (key) => {
    const where = now();
    const line = where.lines.find((item) => item.key === key);
    if (!line || !injuryStands(line, where)) return null;
    return { line, mode: where.mode, reason: injuryClosed(line, where) };
  };
  return {
    onInjury: (key, button) => {
      const player = playerOf(key);
      if (player?.reason) toast(player.reason);
      else if (player) {
        Object.assign(visit, { sheet: { kind: "injury", key, gameId: player.mode.game.id, choice: { code: "", stat: "" } }, opener: button });
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

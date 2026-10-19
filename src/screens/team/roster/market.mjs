/**
 * The roster's market (stage 07c): hiring from the race's positions into a cart and buying it, and letting a player
 * go — sold, or his purchase cancelled. Each is a step of the save queue (save.mjs), drawn at once from its draft, with
 * the queue's rules: it waits for the network, a lost answer is known by the 409 that holds it, a conflict is the
 * coach's. None during a match (R8). What a sheet holds lives on the visit, as the marks' do (marks.mjs).
 *
 * The cart is the visit's (`{kind: "hire", key: "hire", cart, refusal}`): what each line of the race's table holds,
 * by the line's index, and the last press's refusal. What it buys, what it costs and what refuses one more is asked of
 * the domain on the queue's draft at every draw and every press (`hireQuote`), so a step taken meanwhile is counted.
 * «Buy» is one step and closes the sheet in the same turn, with no wait between (Review Focus 3): the queue cannot
 * tell a second «Buy» of the same cart from a new purchase, so a second press must find no sheet to buy from.
 */
import { toast } from "../../../components/toast.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { hireQuote } from "../../../domain/roster/transfers.mjs";
import { refusalWords } from "./hire-sheet.mjs";
import { closeSheet, keyed } from "./injury.mjs";
import { hireClosed } from "./panel.mjs";
import { buyPlayers } from "./save.mjs";

/**
 * The screen as it stands at a press, as far as the market goes: the marks' (`Now`, marks.mjs) with the team's race
 * and the queue's draft, which the cart is priced and limited on.
 * @typedef {import("./marks.mjs").Now & {race: object|null, draft: object}} MarketNow
 */

/**
 * The market's sheet as the screen draws it, or null when it stands no longer: the cart while no match is on and the
 * race is known, with what it buys on the queue's draft (`quote`) and why nothing can be bought just now (`reason`).
 * The sale's sheet is Task 6's.
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where & {lock: string, race: object|null, draft: object}} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function marketSheetOf(visit, lines, where) {
  const { sheet } = visit;
  if (sheet?.kind !== "hire" || where.mode.kind === "match" || !where.race) return null;
  return { ...sheet, quote: hireQuote(where.race, where.draft, sheet.cart), reason: hireClosed(where) };
}

/** The «+»: the cart opens empty, unless something closes it just now (said instead). */
function openCart({ visit, draw }, { now }, button) {
  const reason = hireClosed(now());
  if (reason) {
    toast(reason);
    return;
  }
  Object.assign(visit, { sheet: { kind: "hire", key: "hire", cart: {}, refusal: "" }, opener: button });
  draw();
}

/**
 * A + or a − of one line of the cart, in the cart that is open. A + the rules refuse (the position's maximum, fourteen
 * on the roster, as the draft stands now) says why and changes nothing; money refuses none. A refusal of «Buy» goes
 * with the cart it was said of. The press keeps the focus on the card (K14): «+ To the cart» and the stepper take each
 * other's place, and the focus that fell with the one goes to the other's +, never to the sheet's cross.
 */
function stepCart({ visit, draw }, { now }, rowIndex, delta) {
  const { sheet } = visit;
  if (sheet?.kind !== "hire" || !Number.isInteger(rowIndex)) return;
  const where = now();
  const line = where.race ? hireQuote(where.race, where.draft, sheet.cart).rows[rowIndex] : null;
  if (!line) return;
  if (delta > 0 && line.refusal) {
    toast(refusalWords(line.refusal));
    return;
  }
  const cart = { ...sheet.cart };
  const count = Math.max(0, line.inCart + delta);
  if (count) cart[rowIndex] = count;
  else delete cart[rowIndex];
  Object.assign(sheet, { cart, refusal: "" });
  draw();
  const card = keyed("data-hire-key", String(rowIndex));
  if (!card?.contains(document.activeElement)) card?.querySelector('[data-hire-step="1"]')?.focus();
}

/**
 * «Buy»: only from the cart that is open (K8) — a press that finds none is a second press, and sends nothing. The
 * closure is asked again, then the cart as the draft stands: an empty one, or one the rules refuse, buys nothing (the
 * sheet says why). Then one step of the queue (`buyPlayers`) and, in the same turn, the sheet closes, the focus back on
 * the «+», and the coach is told whom he bought and what the treasury holds (K13: the draft is drawn at once, and the
 * save's status says when it still waits). A refusal (another tab's coach, the rules a 422 left the queue on) is said
 * in the sheet, which stays as it was; one of the queue's 422 asks for the server's roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => MarketNow, refused: () => void}} lent
 */
function buyCart(saving, { now, refused }) {
  const { teamId, visit, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== "hire") return;
  const where = now();
  const reason = hireClosed(where);
  if (reason) {
    toast(reason);
    return;
  }
  const quote = where.race ? hireQuote(where.race, where.draft, sheet.cart) : null;
  if (!quote?.count || quote.refusal) return;
  const answer = buyPlayers(teamId, where.race, sheet.cart);
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  closeSheet(saving);
  const players = answer.hired.map(({ position, number }) => t("teamRoster.hire.player", { position, number })).join(", ");
  toast(t("teamRoster.hire.done", { players, treasury: formatMoney(answer.treasury) }));
}

/**
 * What the market's presses do (wire.mjs): the «+» opens the cart (`openCart`), a + or a − of a card changes it
 * (`stepCart`), «Cancel» closes it, the focus back on the «+», and «Buy» buys it (`buyCart`). A press on one that is
 * closed says why and does nothing.
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => MarketNow, refused: () => void}} lent what the screen lends: `now` is the screen as it stands at the
 *   press; `refused` asks for the server's roster again after a refusal of the queue's 422 whose read failed (index.mjs)
 */
export function marketHandlers(saving, lent) {
  return {
    onHire: (key, button) => openCart(saving, lent, button),
    onHireStep: (rowIndex, delta) => stepCart(saving, lent, rowIndex, delta),
    onHireKeep: () => {
      if (saving.visit.sheet?.kind === "hire") closeSheet(saving);
    },
    onHireBuy: () => buyCart(saving, lent),
  };
}

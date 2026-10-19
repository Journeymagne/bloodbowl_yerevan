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
 *
 * A sale is the visit's too (`{kind: "sell", key, refusal}`): the player's line, by its key, and the last press's
 * refusal. What it does — a sale or a purchase cancelled, for how much — is the line's (`line.removal`, on the draft),
 * so the press sends what the sheet said; it is one step and closes the sheet in the same turn, as «Buy» does.
 */
import { toast } from "../../../components/toast.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { view } from "../../../core/view.mjs";
import { sppEdits } from "../../../domain/post-match/events.mjs";
import { markEdits } from "../../../domain/roster/absence.mjs";
import { hireQuote, transferEdits } from "../../../domain/roster/transfers.mjs";
import { refusalWords } from "./hire-sheet.mjs";
import { closeSheet, keyed } from "./injury.mjs";
import { hireClosed, sellClosed } from "./panel.mjs";
import { buyPlayers, removePlayer } from "./save.mjs";

/**
 * The screen as it stands at a press, as far as the market goes: the marks' (`Now`, marks.mjs) with the team's race
 * and the queue's draft, which the cart is priced and limited on.
 * @typedef {import("./marks.mjs").Now & {race: object|null, draft: object}} MarketNow
 */

/**
 * What a match that has begun took from the coach's steps that waited for the network (R8), in words and in order: the
 * SPP steps, the missed-match marks, then the hires and sales — one line, with no number, for one purchase may be
 * several players. Each count is held to what waited, after the kinds before it have taken theirs: the roster the
 * server holds may differ from the draft by another device's save that the same read took in, and that is not the
 * coach's to be told of (07a's rule). A kind with nothing dropped is not said.
 *
 * @param {object} server the roster the server holds, which the draft is given up for
 * @param {object} draft the queue's draft, as the coach had it
 * @param {number} waiting how many steps of the queue waited
 * @returns {string[]}
 */
export function droppedWords(server, draft, waiting) {
  const spp = Math.min(sppEdits(server, draft).length, waiting);
  const marks = Math.min(markEdits(server, draft), waiting - spp);
  const market = waiting - spp - marks > 0 && transferEdits(server, draft) > 0;
  return [
    spp ? t("teamRoster.matchDropped", { count: spp }) : "",
    marks ? t("teamRoster.mark.matchDropped", { count: marks }) : "",
    market ? t("teamRoster.market.matchDropped") : "",
  ].filter(Boolean);
}

/** The player of `key` on the roster as it stands, never one of the fallen (the dead are not sold), or null. */
const rosterLineOf = (lines, key) => lines.find((line) => line.key === key && !line.fallen) ?? null;

/**
 * The market's sheet as the screen draws it, or null when it stands no longer — a match has begun (R8), or the
 * player has left the roster (read again): the cart while the race is known, with what it buys on the queue's draft
 * (`quote`) and why nothing can be bought just now (`reason`); a sale's, with why he cannot go just now (`sellClosed`).
 *
 * @param {object} visit index.mjs's `Visit`
 * @param {import("./model.mjs").PlayerLine[]} lines the roster's lines and the fallen
 * @param {import("./injury.mjs").Where & {lock: string, race: object|null, draft: object}} where
 * @returns {import("./view.mjs").RosterScreen["sheet"]}
 */
export function marketSheetOf(visit, lines, where) {
  const { sheet } = visit;
  if (where.mode.kind === "match") return null;
  if (sheet?.kind === "sell") {
    const line = rosterLineOf(lines, sheet.key);
    return line ? { ...sheet, reason: sellClosed(line, where) } : null;
  }
  if (sheet?.kind !== "hire" || !where.race) return null;
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

/** «Sell» or «Cancel purchase»: the sheet that asks first, unless something closes it just now (said instead). */
function openSale({ visit, draw }, { now }, key, button) {
  const where = now();
  const line = rosterLineOf(where.lines, key);
  if (!line) return;
  const reason = sellClosed(line, where);
  if (reason) {
    toast(reason);
    return;
  }
  Object.assign(visit, { sheet: { kind: "sell", key, refusal: "" }, opener: button });
  draw();
}

/**
 * One step of the queue letting the line's player go (`removePlayer`). Should the plan and the domain's removal ever
 * drift (T4-1), the step throws before anything waits or is sent; that is a refusal in the domain's words here, said
 * in the sheet like any other, never an error out of the press.
 * @param {string} teamId @param {object} race @param {import("./model.mjs").PlayerLine} line
 */
function letGo(teamId, race, line) {
  try {
    return removePlayer(teamId, race, line.id, line.removal.type);
  } catch (error) {
    if (typeof error?.refusal !== "string") throw error;
    return { ok: false, refusal: error.refusal };
  }
}

/**
 * «Sell for 47.5k» or «Cancel and get 50k back»: only from the sheet that is open (K8) — a press that finds none is a
 * second press, and sends nothing. The closure is asked again, then one step of the queue (`removePlayer`) with what
 * the line says parting with him is, as the draft stands — the sheet was drawn from the same. In the same turn the
 * sheet closes; his row is gone, so the focus goes to the page's title, the panel to the first player (DeskRosterSell),
 * and the coach is told what came back and what the treasury holds (K13). A refusal (another tab's coach, the rules a
 * 422 left the queue on) is said in the sheet, which stays as it was; one of the queue's 422 asks for the server's
 * roster again (`refused`).
 *
 * @param {import("./index.mjs").Saving} saving
 * @param {{now: () => MarketNow, refused: () => void}} lent
 */
function sellPlayer(saving, { now, refused }) {
  const { teamId, visit, memory, draw } = saving;
  const { sheet } = visit;
  if (sheet?.kind !== "sell") return;
  const where = now();
  const line = rosterLineOf(where.lines, sheet.key);
  if (!line) return;
  const reason = sellClosed(line, where);
  if (reason) {
    toast(reason);
    return;
  }
  const answer = letGo(teamId, where.race, line);
  if (answer.refusal) {
    sheet.refusal = answer.refusal;
    draw();
    refused();
    return;
  }
  if (!answer.ok) return;
  Object.assign(visit, { sheet: null, opener: null });
  if (memory.selected === line.key) memory.selected = null;
  draw();
  view.querySelector("h1")?.focus();
  const words = { name: line.name, amount: formatMoney(answer.amount), treasury: formatMoney(answer.treasury) };
  toast(line.removal.type === "cancel-purchase" ? t("teamRoster.sell.cancelled", words) : t("teamRoster.sell.done", words));
}

/** «Cancel» in the sheet `kind`: closed, the focus back on what opened it. */
const keepOf = (saving, kind) => () => {
  if (saving.visit.sheet?.kind === kind) closeSheet(saving);
};

/**
 * What the market's presses do (wire.mjs): the «+» opens the cart (`openCart`), a + or a − of a card changes it
 * (`stepCart`), «Cancel» closes it, the focus back on the «+», and «Buy» buys it (`buyCart`); «Sell» or «Cancel
 * purchase» opens the sheet that asks first (`openSale`), its «Cancel» closes it, the focus back on the button, and its
 * button lets him go (`sellPlayer`). A press on one that is closed says why and does nothing.
 *
 * @param {import("./index.mjs").Saving} saving the visit's side of the queue
 * @param {{now: () => MarketNow, refused: () => void}} lent what the screen lends: `now` is the screen as it stands at the
 *   press; `refused` asks for the server's roster again after a refusal of the queue's 422 whose read failed (index.mjs)
 */
export function marketHandlers(saving, lent) {
  return {
    onHire: (key, button) => openCart(saving, lent, button),
    onHireStep: (rowIndex, delta) => stepCart(saving, lent, rowIndex, delta),
    onHireKeep: keepOf(saving, "hire"),
    onHireBuy: () => buyCart(saving, lent),
    onSell: (key, button) => openSale(saving, lent, key, button),
    onSellKeep: keepOf(saving, "sell"),
    onSellSend: () => sellPlayer(saving, lent),
  };
}

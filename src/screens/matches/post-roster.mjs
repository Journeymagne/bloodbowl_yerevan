/**
 * The post-match's Roster step (stage 09b decision 15, PostRoster.html; a desk draws the same cards in the frame's
 * middle): what the treasury holds after the match's income and what is left once this step's purchases are paid, the
 * staff as counters — Team Re-rolls only bought —, hiring and selling from sheets, the journeymen of this match kept at
 * full price, Raise Dead for Masters of Undeath, and this step's operations in words with their money and «Undo the
 * last». Every press is a write of the step (`roster`, the screen's); nothing is kept on the page.
 *
 * The numbers are the domain's: the roster as `projectPostRoster` leaves it with this step's operations, the prices and
 * the limits its `rosterOperation` holds them to. Each control closed says why (a counter's «+», a sheet's row).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { builderStaffCosts, builderStaffMaximums, combinedRerollsMaximum, medicalStaffDefinitions } from "../../domain/league-rules.mjs";
import { isLineman } from "../../domain/match/roster.mjs";
import { otherSide } from "../../domain/match/rules.mjs";
import { sumMoney } from "../../domain/money.mjs";
import { postStaffOptions } from "../../domain/post-match/roster.mjs";
import { effectiveInjury } from "../../domain/post-match/rules.mjs";
import { playerCurrentCost } from "../../domain/roster/costs.mjs";
import { teamHasSpecialRule } from "../../domain/roster/team-rules.mjs";
import { playerSaleValue } from "../../domain/roster/transfers.mjs";
import { costToNumber, rosterMax, rowsForTeam } from "../../domain/roster/values.mjs";
import { renderResourceCounter } from "../../ui/resource-counter.mjs";
import { renderSheet } from "../../ui/sheet.mjs";
import { signedMoney } from "./post-model.mjs";
import { actionFooter, labelMarkup, nextLink, noteMarkup, rowMarkup } from "./post-steps.mjs";

/** The ids of the hiring and the selling sheets. */
export const HIRE_SHEET = "after-hire";
export const SELL_SHEET = "after-sell";

/** The most players a roster holds, and the fewest a sale may leave. */
const ROSTER_MOST = 14;
const ROSTER_FEWEST = 7;

/** A staff counter's name: Team Re-rolls «· buy more», a medic by its title, the rest as the treasury names them. */
function staffName(key, { buy = false } = {}) {
  if (key === "teamRerolls") return buy ? t("after.rerollsBuy") : t("savedRoster.teamRerolls");
  return medicalStaffDefinitions.find((staff) => staff.key === key)?.title ?? t(`savedRoster.${key}`);
}

/** What the side's treasury holds: after the match's income, and once this step's operations are paid. */
function moneyOf(model) {
  const { accounting } = model.preview;
  const income = sumMoney(accounting.opening, accounting.winnings);
  return { income, left: sumMoney(income, accounting.sales, -accounting.purchases) };
}

/** Why one more of a staff key cannot be bought: its maximum, the re-rolls' joint maximum, the treasury. "" when it can. */
function staffRefusal(key, roster, left) {
  const next = Number(roster[key] || 0) + 1;
  if (next > builderStaffMaximums[key]) return t("validation.STAFF_MAX", { title: staffName(key), max: builderStaffMaximums[key] });
  if (key === "teamRerolls" && next + Number(roster.startingRerolls || 0) > combinedRerollsMaximum) return t("after.rerollsFull", { max: combinedRerollsMaximum });
  const price = builderStaffCosts[key];
  return price > left ? t("after.short", { amount: formatMoney(sumMoney(price, -left)) }) : "";
}

/** «Staff» (PostRoster.html): a counter per staff key the race may have, Team Re-rolls only bought; each «+» closed with why. */
function staffCard(model, lockedReason) {
  const side = model.post[model.sideName], roster = model.preview.roster, { left } = moneyOf(model);
  const counters = postStaffOptions(side.reference).map((key) => {
    const price = formatMoney(builderStaffCosts[key]), now = Number(side.baseRoster[key] || 0);
    const note = key === "teamRerolls" ? t("after.staffEach", { price, count: now }) : t("after.staffNow", { price, count: now });
    return renderResourceCounter({ key, name: staffName(key, { buy: true }), note, value: Number(roster[key] || 0),
      decDisabled: key === "teamRerolls" || Number(roster[key] || 0) <= 0, incBlockedReason: staffRefusal(key, roster, left), lockedReason });
  }).join("");
  return `<div class="g-after__card g-after__card--rows g-after__staff">${labelMarkup(t("after.staff"))}${counters}${noteMarkup(t("after.rerollsNote"))}</div>`;
}

/** The journeymen of this match who may still be kept: not dead, not kept already. */
function journeymenOf(model) {
  const side = model.post[model.sideName];
  const kept = new Set(side.operations.filter((operation) => operation.type === "keep").map((operation) => operation.playerId));
  return model.preview.players.filter((player) => player.kind === "journeyman" && !kept.has(player.id) && effectiveInjury(side, player.id).code !== "dead");
}

/** The opponent's dead of this match (rookie protection applied): how many a Masters of Undeath side may raise. */
function deadOfOpponent(model) {
  const other = model.post[otherSide(model.sideName)];
  return other.snapshot.players.filter((player) => player.kind !== "star" && effectiveInjury(other, player.id).code === "dead").length;
}

/** Why one more player of a row cannot join the roster: the position full, the roster full, the treasury. "" when it can. */
function placeRefusal(model, rowIndex, price) {
  const roster = model.preview.roster, row = rowsForTeam(model.post[model.sideName].reference)[rowIndex];
  if (roster.players.length >= ROSTER_MOST) return t("after.rosterFull");
  if (roster.players.filter((player) => player.rowIndex === rowIndex).length >= rosterMax(row.qty)) return t("after.hireFull");
  const { left } = moneyOf(model);
  return price > left ? t("after.short", { amount: formatMoney(sumMoney(price, -left)) }) : "";
}

/** A button of the step that may be closed: `data` its write, the reason drawn under its words when it is. */
function placeButton({ words, reason, data, className = "g-after__place" }) {
  if (reason) return `<button type="button" class="${className}" aria-disabled="true" title="${escapeHtml(reason)}"><span>${escapeHtml(words)}</span><span class="g-after__why">${escapeHtml(reason)}</span></button>`;
  return `<button type="button" class="${className}" ${data}><span>${escapeHtml(words)}</span></button>`;
}

/** «Players»: «+ Hire» and «Sell…» opening their sheets, the journeymen to keep, Raise Dead. */
function playersCard(model, closed) {
  const side = model.post[model.sideName], rows = rowsForTeam(side.reference);
  const open = (sheet, words) => `<button type="button" class="g-after__open" data-after-open="${sheet}" aria-haspopup="dialog"${closed ? ` aria-disabled="true" title="${escapeHtml(closed)}"` : ""}>${escapeHtml(words)}</button>`;
  const keeps = journeymenOf(model).map((player) => {
    const price = playerCurrentCost(rows[player.rowIndex], player);
    const button = placeButton({ words: t("after.keep", { price: formatMoney(price) }), reason: closed || placeRefusal(model, player.rowIndex, price), data: `data-after-keep="${escapeHtml(player.id)}"` });
    return `<div class="g-after__keeprow"><span class="g-after__name">${escapeHtml(t("after.who", { number: player.number, name: player.name }))}</span>${button}</div>`;
  }).join("");
  const keepHtml = keeps ? `${labelMarkup(t("after.journeymen"))}<div class="g-after__places">${keeps}</div>` : "";
  let raise = "";
  if (teamHasSpecialRule(side.reference, "Masters of Undeath")) {
    const raised = side.operations.filter((operation) => operation.type === "raise").length;
    const shut = closed || (raised >= deadOfOpponent(model) ? t("after.raiseShut") : "");
    raise = rows.map((row, rowIndex) => (isLineman(row) ? placeButton({ words: t("after.raise", { position: row.position }), reason: shut || placeRefusal(model, rowIndex, 0), data: `data-after-raise="${rowIndex}"` }) : "")).join("");
    raise = raise ? `<div class="g-after__places">${raise}</div>` : "";
  }
  return `<div class="g-after__card">${labelMarkup(t("after.players"))}<div class="g-after__opens">${open("hire", t("after.hire"))}${open("sell", t("after.sell"))}</div>`
    + `${keepHtml}${raise}${noteMarkup(t("after.playersNote"))}</div>`;
}

/**
 * This step's operations in words with their money (`projectPostRoster`'s transactions): «Hire: Blitzer», «Sale: L.
 * Ashby», «Journeyman stays: J. Corr», «Raise Dead: Zombie», «Assistant Coaches 1 → 2».
 * @returns {{label: string, amount: number}[]}
 */
export function opLines(model) {
  const side = model.post[model.sideName], rows = rowsForTeam(side.reference);
  const counts = {};
  const nameOf = (id) => [...side.baseRoster.players, ...side.snapshot.players].find((player) => player.id === id)?.name ?? "";
  return model.preview.accounting.transactions.map((operation) => {
    const amount = operation.amount;
    if (operation.type === "hire") return { label: t("after.op.hire", { position: rows[operation.rowIndex]?.position ?? "" }), amount };
    if (operation.type === "raise") return { label: t("after.op.raise", { position: rows[operation.rowIndex]?.position ?? "" }), amount };
    if (operation.type === "sell") return { label: t("after.op.sell", { name: nameOf(operation.playerId) }), amount };
    if (operation.type === "keep") return { label: t("after.op.keep", { name: nameOf(operation.playerId) }), amount };
    const from = counts[operation.key] ?? Number(side.baseRoster[operation.key] || 0);
    counts[operation.key] = from + operation.delta;
    return { label: t("after.op.staff", { staff: staffName(operation.key), from, to: counts[operation.key] }), amount };
  });
}

/** «This step's operations» with their money, spending in the danger's colour, a sale's in the accent's ink; «Undo the last». */
function opsCard(model, closed) {
  const lines = opLines(model);
  if (!lines.length) return "";
  const rows = lines.map(({ label, amount }) => rowMarkup(label, signedMoney(amount), { tone: amount < 0 ? "danger" : amount > 0 ? "gain" : "" })).join("");
  const undo = closed ? "" : `<button type="button" class="g-after__undo" data-prep-action="undo-roster">${escapeHtml(t("after.undoLast"))}</button>`;
  return `<div class="g-after__card g-after__card--tight">${labelMarkup(t("after.ops"))}${rows}${undo}</div>`;
}

/**
 * The Roster step (PostRoster.html): the treasury, the staff, the players, this step's operations. «Next: treasury»
 * locks it (`lock-roster`).
 * @param {ReturnType<typeof import("./post-model.mjs").postModel>} model
 */
export function rosterStep(model) {
  const closed = model.readonly ? t("after.rosterLocked") : "";
  const { income, left } = moneyOf(model);
  const money = `<div class="g-after__card"><div class="g-after__money"><span class="g-after__moneyk">${escapeHtml(t("after.treasuryAfterIncome"))} <b class="g-after__moneyv">${escapeHtml(formatMoney(income))}</b></span>`
    + `<span class="g-after__left${left < 0 ? " g-after__left--short" : ""}">${escapeHtml(formatMoney(left))}</span></div>${noteMarkup(t("after.paidAtFinish"))}</div>`;
  const contentHtml = `${money}${staffCard(model, closed)}${playersCard(model, closed)}${opsCard(model, closed)}`;
  return { contentHtml, asideHtml: "", footer: model.readonly ? nextLink(model, "finance") : actionFooter("lock-roster", t("after.next.finance")) };
}

/** «Hire a player» (`dialog#after-hire`): the race's positions with their price and how many, each closed with why. */
export function hireSheetMarkup(model) {
  const side = model.post[model.sideName], roster = model.preview.roster, closed = model.readonly ? t("after.rosterLocked") : "";
  const rows = rowsForTeam(side.reference).map((row, rowIndex) => {
    const price = costToNumber(row.price || row.cost), count = roster.players.filter((player) => player.rowIndex === rowIndex).length;
    const words = `${row.position} · ${formatMoney(price)} · ${t("after.hireCount", { count, max: rosterMax(row.qty) })}`;
    return placeButton({ words, reason: closed || placeRefusal(model, rowIndex, price), data: `data-after-hire="${rowIndex}"`, className: "g-after__pick" });
  }).join("");
  return renderSheet({ id: HIRE_SHEET, title: t("after.hireTitle"), bodyHtml: `<div class="g-after__picks">${rows}</div>` });
}

/** «Sell a player» (`dialog#after-sell`): the roster after this match with each one's price; at seven, none. */
export function sellSheetMarkup(model) {
  const side = model.post[model.sideName], roster = model.preview.roster;
  const closed = model.readonly ? t("after.rosterLocked") : roster.players.length <= ROSTER_FEWEST ? t("after.sellSeven") : "";
  const rows = roster.players.map((player) => placeButton({ words: `${t("after.who", { number: player.number, name: player.name })} · +${formatMoney(playerSaleValue(side.reference, player))}`,
    reason: closed, data: `data-after-sell="${escapeHtml(player.id)}"`, className: "g-after__pick" })).join("");
  return renderSheet({ id: SELL_SHEET, title: t("after.sellTitle"), bodyHtml: `${closed && !model.readonly ? noteMarkup(closed) : ""}<div class="g-after__picks">${rows}</div>` });
}

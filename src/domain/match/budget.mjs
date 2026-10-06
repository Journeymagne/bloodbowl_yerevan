import { calculateMatchCtv } from "./roster.mjs";
import { matchCatalog, catalogAccess } from "./catalog.mjs";
import { MATCH_RULES, otherSide, tierAllowance, teamKey, matchError } from "./rules.mjs";
import { isMoneyAmount, sumMoney } from "../money.mjs";

export function basketTotals(side, data) {
  const catalog = matchCatalog(side, data);
  return Object.entries(side.basket).reduce((total, [id, quantity]) => {
    const item = catalog.find(entry => entry.id === id);
    if (item) { total.cost += item.cost * quantity; total.slots += item.slots * quantity; total.spaces += item.spaces * quantity; }
    return total;
  }, { cost: 0, slots: 0, spaces: 0 });
}

export function purchaseOrder(preparation) {
  const home = calculateMatchCtv(preparation.home).total, away = calculateMatchCtv(preparation.away).total;
  return home === away ? null : home > away ? "home" : "away";
}

export function matchBudget(preparation, sideName, data) {
  const side = preparation[sideName], opponent = preparation[otherSide(sideName)];
  if (!isMoneyAmount(side.roster.treasury)) throw matchError("MATCH_BUDGET", { missing: 0 });
  const first = purchaseOrder(preparation), isFirst = first === sideName;
  const bonus = tierAllowance(side.reference, opponent.reference);
  const difference = Math.max(0, calculateMatchCtv(opponent).total - calculateMatchCtv(side).total);
  const otherSpent = first && !isFirst && opponent.basketLocked ? matchBudget(preparation, first, data).treasuryUsed : 0;
  const pettyCash = difference + otherSpent;
  const treasuryLimit = first ? Math.min(Number(side.roster.treasury), isFirst ? Number(side.roster.treasury) : MATCH_RULES.lowerTreasuryMaximum) : 0;
  const chosen = basketTotals(side, data).cost;
  const treasuryUsed = Math.max(0, chosen - pettyCash - bonus);
  const canChoose = preparation.home.rosterLocked && preparation.away.rosterLocked && (!first || isFirst || opponent.basketLocked);
  return { difference, opponentSpent: otherSpent, pettyCash, bonus, treasuryLimit, treasuryUsed, chosen,
    maximum: pettyCash + bonus + treasuryLimit, remaining: pettyCash + bonus + treasuryLimit - chosen,
    unspent: Math.max(0, pettyCash + bonus - chosen), canChoose,
    treasuryAfter: sumMoney(side.roster.treasury, -treasuryUsed) };
}

export function validateBasket(preparation, sideName, data) {
  const side = preparation[sideName], catalog = matchCatalog(side, data);
  for (const [id, quantity] of Object.entries(side.basket)) {
    const item = catalog.find(entry => entry.id === id);
    if (!item || !Number.isInteger(quantity) || quantity < 0 || quantity > item.limit || !catalogAccess(item, side)) throw matchError("MATCH_PURCHASE", { item: item?.title || id });
  }
  const totals = basketTotals(side, data);
  const slots = MATCH_RULES.stuntyTeams.includes(teamKey(side.reference)) ? 4 : 2;
  if (totals.slots > slots) throw matchError("MATCH_STAR_LIMIT", { maximum: slots });
  const players = calculateMatchCtv(side).players;
  if (players + totals.spaces > MATCH_RULES.rosterMaximum) throw matchError("MATCH_ROSTER_LIMIT", { maximum: MATCH_RULES.rosterMaximum });
  const budget = matchBudget(preparation, sideName, data);
  if (budget.treasuryUsed > budget.treasuryLimit) throw matchError("MATCH_BUDGET", { missing: budget.treasuryUsed - budget.treasuryLimit });
  return budget;
}

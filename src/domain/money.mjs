/** Money is stored in thousands; a half-price sale may include individual gold. */
export function isMoneyAmount(value) {
  const gold = Number(value) * 1000;
  return Number.isFinite(gold) && gold >= 0 && Number.isSafeInteger(Math.round(gold))
    && Math.abs(gold - Math.round(gold)) < 1e-7;
}

/** Sum in gold so repeated additions do not accumulate floating point drift. */
export function sumMoney(...amounts) {
  return amounts.reduce((gold, amount) => gold + Math.round(Number(amount) * 1000), 0) / 1000;
}

import assert from "node:assert/strict";
import test from "node:test";

import "./helpers/ui.mjs";
import { setLocale } from "../src/core/i18n.mjs";
import { formatMoney } from "../src/core/format.mjs";

test("money is in thousands with the page's grouping and one decimal at most", () => {
  setLocale("ru");
  try {
    assert.equal(formatMoney(1120), "1 120k");
    assert.equal(formatMoney(42.5), "42,5k");
    assert.equal(formatMoney(42.46), "42,5k");
  } finally {
    setLocale("en");
  }
  assert.equal(formatMoney(1120), "1,120k");
  assert.equal(formatMoney(42.5), "42.5k");
  assert.equal(formatMoney(0), "0k");
  assert.deepEqual([-0, -0.04].map(formatMoney), ["0k", "0k"], "a zero is no \"-0k\", whichever way it came");
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(Number.NaN), "—");
});

test("an amount that is no number is a dash, not a figure", () => {
  for (const amount of [undefined, "", "150", {}, Number.POSITIVE_INFINITY]) assert.equal(formatMoney(amount), "—", String(amount));
});

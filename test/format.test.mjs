import assert from "node:assert/strict";
import test from "node:test";

import "./helpers/ui.mjs";
import { setLocale } from "../src/core/i18n.mjs";
import { formatDay, formatMoney } from "../src/core/format.mjs";

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

test("a day is written the page's way, with the year when asked", () => {
  try {
    setLocale("en");
    assert.equal(formatDay("2026-10-18T12:00:00Z"), "18 Oct");
    assert.equal(formatDay("2026-10-18T12:00:00Z", { year: true }), "18 Oct 2026");
    assert.equal(formatDay(new Date("2026-10-18T12:00:00Z")), "18 Oct", "a Date is a moment as well");
    setLocale("ru");
    assert.match(formatDay("2026-10-18T12:00:00Z"), /^18 окт/);
    assert.match(formatDay("2026-10-18T12:00:00Z", { year: true }), /^18 окт.* 2026/);
  } finally {
    setLocale("en");
  }
});

test("a day that is none is a dash, not a date of 1970 or \"Invalid Date\"", () => {
  for (const moment of ["not a date", "", null, undefined, 0, {}]) assert.equal(formatDay(moment), "—", String(moment));
  assert.equal(formatDay("not a date", { year: true }), "—");
});

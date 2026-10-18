/**
 * How the page writes a figure and a day.
 *
 * Money in this league is counted in thousands of gold (a treasury of 35 is
 * "35k"), and it is grouped the way the reader's language groups: a Russian
 * page writes "1 120k" with a no-break space and "42,5k" with a comma, an
 * English one "1,120k" and "42.5k". A day is the day and the month ("18 Oct",
 * "18 окт."), with the year where it is asked for. The locale is the page's
 * (`getLocale`), not the browser's, so a Russian page on an English browser
 * still reads as Russian.
 */
import { getLocale } from "./i18n.mjs";

/** The tag Intl is asked for, by the page's locale. */
const INTL_TAGS = Object.freeze({ ru: "ru-RU", en: "en-GB" });

/** What stands for a sum that is not there. */
const NO_MONEY = "—";

/** What stands for a day that is not there. */
const NO_DAY = "—";

/**
 * An amount in thousands as the page writes it: at most one decimal, then "k".
 * Anything that is not a finite number (a team with no race has no value, a
 * treasury not loaded yet) is a dash, never "NaNk".
 *
 * @param {number|null|undefined} amount thousands of gold
 * @returns {string}
 */
export function formatMoney(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return NO_MONEY;
  const tag = INTL_TAGS[getLocale()] ?? INTL_TAGS.en;
  // Rounded to tenths before Intl sees it: Intl writes -0 and -0.04 as "-0", and `|| 0` turns the -0 left over into 0.
  const tenths = Math.round(amount * 10) / 10 || 0;
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(tenths)}k`;
}

/**
 * A day as the page writes it: the day and the short month, and with `year` the year too. The day is the one
 * the reader's own clock shows for the moment. Anything that is not a date (a line with no time, a text that
 * reads as none) is a dash, never "Invalid Date" or the first of January 1970.
 *
 * @param {string|Date|null|undefined} iso a moment, as the server writes it (ISO 8601)
 * @param {{year?: boolean}} [options]
 * @returns {string}
 */
export function formatDay(iso, { year = false } = {}) {
  const moment = typeof iso === "string" || iso instanceof Date ? new Date(iso) : null;
  if (!moment || Number.isNaN(moment.getTime())) return NO_DAY;
  const tag = INTL_TAGS[getLocale()] ?? INTL_TAGS.en;
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", ...(year && { year: "numeric" }) }).format(moment);
}

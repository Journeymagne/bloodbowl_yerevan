/**
 * What the reference screens remember while the page lives: the queries, each list's filter, the
 * skill die; never written to the address or to storage (plan stage 11, decision 4).
 *
 * Plain module state, no DOM: a screen reads its pieces when it is drawn and hands them back when
 * the coach changes them, so going from a list into an article and back finds the list as it was
 * left, and a reload starts clean. What these functions return is a copy; changing it changes nothing.
 */

const NO_FILTER = { query: "", category: "all" };

/** The skill die opens on Agility, as the 2.x screen did; a screen that has the skill groups at hand falls back to the first when a vault has no such category. */
const FRESH_ROLLER = { category: "Agility", face: null, skill: "" };

let query = "";
let searchFocusAsked = false;
let roller = { ...FRESH_ROLLER };
const filters = new Map();

/** The text in the reference's search box. */
export function refQuery() {
  return query;
}

export function setRefQuery(value) {
  query = String(value ?? "");
}

/** What one list (`skills`, `traits`…) is narrowed to; every list has its own. */
export function listFilter(section) {
  return { ...NO_FILTER, ...filters.get(section) };
}

export function setListFilter(section, patch) {
  filters.set(section, { ...listFilter(section), ...patch });
}

/** A screen that wants the search box focused when it is drawn says so; the next draw takes the flag. */
export function askSearchFocus() {
  searchFocusAsked = true;
}

export function takeSearchFocus() {
  const asked = searchFocusAsked;
  searchFocusAsked = false;
  return asked;
}

/** The skill die: the category it throws for, the face it last showed and the skill that face means. */
export function rollerState() {
  return { ...roller };
}

export function setRoller(next) {
  roller = { ...FRESH_ROLLER, ...next };
}

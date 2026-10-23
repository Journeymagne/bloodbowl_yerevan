/**
 * A desk's roster search (owner, 2026-10-20; DeskRoster.html): typing narrows the three tables to the players whose
 * number, name, position or skill each word of the query finds; a line leads to the reference with the same query — the
 * way stage 11's strip does (`setRefQuery`, `askSearchFocus`). The query is the page's memory; a phone has no field.
 * Nothing is written. An address that names a player the query kept would hide clears it (`yieldQuery`).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { refUrl } from "../../../core/routes.mjs";
import { view } from "../../../core/view.mjs";
import { renderSearchField } from "../../../ui/search-field.mjs";
import { askSearchFocus, setRefQuery } from "../../ref/memory.mjs";
import { normalizeText } from "../../ref/search.mjs";
import { fallenName } from "./fallen-view.mjs";

/** The field's id: its label's `for`, and where an address that clears the query finds it. */
const FIELD_ID = "roster-query";

/** A word of digits, which is a number: the player's own, matched whole. */
const DIGITS = /^\d+$/;

/**
 * The words of a query as the reference compares them (`normalizeText`): lower case, «ё» as «е», no blanks.
 * @param {string} query
 * @returns {string[]}
 */
export function queryWords(query) {
  return normalizeText(query).split(" ").filter(Boolean);
}

/**
 * Whether the query finds a line: every word must. A word of digits is his number whole — «3» is not «Loner (3+)», and a
 * number that is none matches no digits; any other word is a part of his name as the table shows it (a fallen player's
 * record with none is «Fallen», `fallenName`), his position or one of his skills. No words find everyone.
 * @param {{number?: string, name?: string, position?: string, skills?: {name: string}[], fallen?: object}} line
 * @param {string[]} words
 */
export function lineMatches(line, words) {
  if (!words.length) return true;
  const number = String(line.number ?? "").trim();
  const name = line.fallen ? fallenName(line) : line.name;
  const texts = [name, line.position, ...(line.skills ?? []).map((skill) => skill.name)].map(normalizeText);
  return words.every((word) => (DIGITS.test(word) ? DIGITS.test(number) && Number(word) === Number(number) : texts.some((text) => text.includes(word))));
}

/**
 * The field at the right of a desk's page band (DeskRoster.html): what is typed, as the roster's memory keeps it.
 * @param {string} query
 */
export function searchFieldMarkup(query) {
  const field = renderSearchField({
    id: FIELD_ID, label: t("teamRoster.search.label"), placeholder: t("teamRoster.search.placeholder"), value: query, data: { rosterQuery: "" },
  });
  return `<div class="g-roster__search">${field}</div>`;
}

/**
 * Over a desk's tables: how many the query finds, in a live region that stands with no query too, so that a screen
 * reader hears its first words; and with a query the way to the reference with it.
 * @param {string} query as typed, its blanks at the ends taken off; "" for none
 * @param {number} count the players the three tables show
 */
export function foundMarkup(query, count) {
  const said = query ? t("teamRoster.search.found", { count }) : "";
  const link = query
    ? `<a class="g-roster__refsearch" href="${escapeHtml(refUrl())}" data-roster-refsearch>${escapeHtml(t("teamRoster.search.ref", { query }))}</a>`
    : "";
  return `<div class="g-roster__found"><p class="g-roster__foundcount" role="status">${escapeHtml(said)}</p>${link}</div>`;
}

/**
 * The player an address names (the player mode, `screenOf`), once his line is there: a query kept from before that would
 * hide him gives way, in the memory and in the field drawn — a patch leaves a focused field's value as it is — so that the
 * table and the panel show him. One that finds him stays.
 * @param {import("./memory.mjs").RosterMemory} memory
 * @param {import("./model.mjs").PlayerLine} line
 */
export function yieldQuery(memory, line) {
  if (lineMatches(line, queryWords(memory.query))) return;
  memory.query = "";
  const field = view.querySelector(`#${FIELD_ID}`);
  if (field) field.value = "";
}

/**
 * The field's presses: what is typed narrows the tables, Esc empties it (wire.mjs empties the field), and the line to
 * the reference hands it the query as the line names it, trimmed, and asks for the caret in its field; the link itself
 * goes there (wire.mjs hears only a plain click: another tab is another page, with a reference of its own).
 * @param {{memory: import("./memory.mjs").RosterMemory, draw: () => void}} saving
 */
export function searchHandlers({ memory, draw }) {
  return {
    onRosterQuery: (value) => {
      memory.query = value;
      draw();
    },
    onRosterQueryClear: () => {
      memory.query = "";
      draw();
    },
    onRefSearch: () => {
      setRefQuery(memory.query.trim());
      askSearchFocus();
    },
  };
}

/**
 * The shape of a roster draft, described once.
 *
 * It used to be described four times over — `emptyBuilderState`, `builderPayload`
 * and `normalizeSavedRoster` in data/roster-draft.mjs, plus the initial value of
 * `state.builder` — with a player's shape a fifth, in `makeRosterPlayer`. Adding
 * a field meant editing all of them and noticing if you missed one; they had
 * already drifted, `emptyBuilderState` being the only one without
 * `selectedLeague`. Section 6 of the design spec counts this as its own problem.
 *
 * **This does not change what is stored.** Section 10.2 of the design spec
 * describes a different, tidier shape (RosterV2: nested `staff`, `money`,
 * `status`), and writing it would mean rewriting every saved blob — the one
 * migration the league owner cancelled on 2026-08-19, along with support for
 * the two retired shapes. So this file describes what is in the database now,
 * and step 3.2's job is to describe it in one place rather than four. The RosterV2
 * section of the spec is superseded; see the plan's revision note.
 *
 * The fields carry a kind rather than a reader each, so the three operations —
 * make an empty one, normalise a stored one, produce a payload — are one loop
 * apiece instead of three parallel lists.
 */
import { countToNumber, makeRosterPlayerId } from "./values.mjs";

/**
 * @typedef {"text"|"count"|"list"|"map"|"staff"} FieldKind
 * @typedef {{name: string, kind: FieldKind, from?: string[]}} DraftField
 */

/**
 * Every field a draft carries, in the order they were written when this lived in
 * four places. `from` lists older key names still read out of stored rosters.
 *
 * @type {readonly DraftField[]}
 */
export const DRAFT_FIELDS = Object.freeze([
  { name: "editingTeamId", kind: "text" },
  { name: "teamSlug", kind: "text" },
  { name: "teamName", kind: "text" },
  { name: "selectedLeague", kind: "text" },
  { name: "favouredChoice", kind: "text" },
  // `column` names a field the server keeps outside the blob; rosterForStorage
  // leaves those out of what it sends.
  { name: "logoData", kind: "text", column: "logo_data" },
  { name: "players", kind: "list" },
  { name: "roster", kind: "map" },
  { name: "teamRerolls", kind: "count" },
  // `rerolls` is what the very first builder wrote; a few stored teams still
  // carry it and nothing rewrites them, so it is read here rather than migrated.
  { name: "startingRerolls", kind: "count", from: ["startingRerolls", "rerolls"] },
  { name: "bribes", kind: "count" },
  { name: "dedicatedFans", kind: "count" },
  { name: "assistantCoaches", kind: "count" },
  { name: "cheerleaders", kind: "count" },
  { name: "apothecary", kind: "count" },
  { name: "mortuaryAssistant", kind: "count" },
  { name: "plagueDoctor", kind: "count" },
  { name: "purchasedStaff", kind: "staff" },
  { name: "treasury", kind: "count" },
  { name: "coachesSafe", kind: "count" },
]);

/** The staff counters recorded as bought after the team started playing. */
export const PURCHASED_STAFF_FIELDS = Object.freeze([
  "teamRerolls",
  "startingRerolls",
  "bribes",
  "assistantCoaches",
  "cheerleaders",
  "apothecary",
  "mortuaryAssistant",
  "plagueDoctor",
]);

const EMPTY = { text: () => "", count: () => 0, list: () => [], map: () => ({}), staff: () => ({}) };

/**
 * What a stored roster's `purchasedStaff` becomes.
 *
 * `teamRerolls` falls back to the roster's own count because teams saved before
 * purchased staff existed had every reroll bought after the fact.
 */
export function normalizePurchasedStaff(roster = {}) {
  const purchased = roster.purchasedStaff ?? {};
  const result = {};
  for (const field of PURCHASED_STAFF_FIELDS) {
    const fallback = field === "teamRerolls" ? roster.teamRerolls : undefined;
    result[field] = countToNumber(purchased[field] ?? fallback ?? 0);
  }
  return result;
}

function readField(field, source) {
  const keys = field.from ?? [field.name];
  let raw;
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) {
      raw = source[key];
      break;
    }
  }
  switch (field.kind) {
    case "count": return countToNumber(raw ?? 0);
    case "list": return Array.isArray(raw) ? raw : [];
    case "map": return raw ?? {};
    case "staff": return normalizePurchasedStaff(source);
    default: return String(raw ?? "");
  }
}

/** A draft with nothing in it, optionally already pointed at a race. */
export function createDraft(team = null) {
  const draft = {};
  for (const field of DRAFT_FIELDS) draft[field.name] = EMPTY[field.kind]();
  draft.teamSlug = team?.slug ?? "";
  draft.teamName = team?.title ?? "";
  return draft;
}

/** A stored roster, read into the shape the editors work on. */
export function normalizeDraft(raw = {}) {
  const draft = {};
  for (const field of DRAFT_FIELDS) draft[field.name] = readField(field, raw);
  return draft;
}

/**
 * The draft as the server should store it: without what it keeps elsewhere.
 *
 * Step 4.8. A logo is up to 2.9 MB of data URL, and it went to the server
 * twice — once as `logoData`, once inside the roster blob, where the editor
 * keeps it while a coach is looking at it. The server has stripped the second
 * copy for as long as the column has existed, so nothing stored is wrong; it
 * was the request, and the JSON parse of it, that carried a megabyte for
 * nothing.
 *
 * The server keeps stripping, for coaches still running an older bundle.
 */
export function rosterForStorage(draft = {}) {
  const owned = new Set(DRAFT_FIELDS.filter((field) => field.column).map((field) => field.name));
  return Object.fromEntries(Object.entries(draft).filter(([name]) => !owned.has(name)));
}

/** A draft, copied out for sending to the server. */
export function draftPayload(draft = {}) {
  const payload = {};
  for (const field of DRAFT_FIELDS) {
    payload[field.name] = draft[field.name] ?? EMPTY[field.kind]();
  }
  return payload;
}

/**
 * The fields a roster player carries, and what an untouched one holds.
 *
 * The fifth description of the shape, and the one the other four never
 * mentioned: `makeRosterPlayer` declared it alone in players.mjs.
 */
export const PLAYER_FIELDS = Object.freeze({
  statMods: () => ({}),
  extraSkills: () => [],
  favouredSkills: () => [],
  skipNextGame: () => false,
  niglingInjury: () => false,
  isCaptain: () => false,
  extendedContracts: () => 0,
  spp: () => ({}),
  advancements: () => [],
});

/**
 * A new player on row `rowIndex` of the race's roster table.
 *
 * @param {object} row the position's line in the team's roster table
 * @param {number} rowIndex which line that is
 * @param {number} [copyIndex] how many of this position the team already has
 * @param {{number?: string|number, purchased?: boolean}} [options]
 */
export function createPlayer(row, rowIndex, copyIndex = 0, options = {}) {
  const player = {
    id: makeRosterPlayerId(),
    rowIndex,
    number: String(options.number ?? copyIndex + 1),
    name: `${row.position} ${copyIndex + 1}`,
  };
  for (const [name, empty] of Object.entries(PLAYER_FIELDS)) player[name] = empty();
  player.purchased = Boolean(options.purchased);
  return player;
}

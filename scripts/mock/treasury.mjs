/**
 * The mock API's treasury: a team's history, the entry a coach writes by hand, and the save of any team
 * (server/routes/team-ledger.mjs and `writeSavedTeam` in server/routes/teams.mjs are the reference).
 *
 *   GET   /api/teams/:id/ledger?before=&limit=   one page, newest first: `{entries, next, since, total}`.
 *                                 The cursor is the number of the line the page starts at, as text (the
 *                                 server's is opaque; a client holds it as a string either way). `since` is
 *                                 30 days back, `limit` is 1 to 100 (20 otherwise), a cursor that is no
 *                                 number is 400 FIELD_INVALID `before`.
 *   POST  /api/teams/:id/treasury `{delta, reason, note?, revision}`: `checkManualEntry` decides 400;
 *                                 a revision that is not the team's is 409 TEAM_SAVED_ELSEWHERE with the
 *                                 team; a treasury below zero is 422 ROSTER_BREAKS_THE_RULES
 *                                 (TREASURY_INVALID); else 201 `{team, entry}`, the revision one up.
 *   PATCH /api/teams/:id          a save of any team: an integer `revision` that is not the team's is 409
 *                                 (a body without one writes unconditionally, as the server does); a
 *                                 re-roll the stage does not allow is 422 STAGE_PURCHASE_LOCKED; else the
 *                                 name, race, logo and roster are stored, the lines `classifyTreasuryChange`
 *                                 finds are written, and the answer is `{team}`.
 *
 * The history of each team lives in memory with the teams. Two are given one when the routes are made
 * (and nothing under MOCK_EMPTY, which has no team): t1 six lines, ending at its treasury, and t5 a sponsor's.
 * The races are read from the built data, so the mock stops at start without `npm run build`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isMoneyAmount, sumMoney } from "../../src/domain/money.mjs";
import { classifyTreasuryChange, ledgerRows } from "../../src/domain/roster/ledger.mjs";
import { stageViolations } from "../../src/domain/roster/stage.mjs";
import { VALIDATION_CODES } from "../../src/domain/roster/validate.mjs";
import { countToNumber } from "../../src/domain/roster/values.mjs";
import { LEDGER_PAGE_SIZE, checkManualEntry } from "../../server/api/team-ledger.mjs";
import { loadTeamReference, normalizeDraft, teamBySlug } from "../../server/domain/roster.mjs";
import { errorPayload } from "../../server/http/errors.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
await loadTeamReference(rootDir);

const DAY = 86_400_000;
const MAX_PAGE_SIZE = 100;
const reply = (payload, status = 200) => ({ status, payload });
const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);
/** The 409 of a write made against a revision the team has moved past: the team travels beside the error. */
const savedElsewhere = (found) => reply({ ...errorPayload("TEAM_SAVED_ELSEWHERE"), team: found }, 409);

// What the teams are given when the routes are made, oldest line first, each `days` back from now. Amounts are
// thousands; the balances are counted from what the treasury was before the first line, so the last is its treasury.
// The ids are quoted: check-references reads a bare `t1:` as a use of `t`.
const HISTORIES = {
  "t1": [
    { days: 16, kind: "staff", delta: -10 },
    { days: 13, kind: "match_income", delta: 60, pairingId: "g4" },
    { days: 13, kind: "safe", delta: -20, pairingId: "g4" },
    { days: 6, kind: "match_income", delta: 40, pairingId: "g5" },
    { days: 2, kind: "manual", delta: 20, reason: "friendly", note: "Ratwharf Gnawers" },
    { days: 1, kind: "manual", delta: -5, reason: "fine" },
  ],
  "t5": [{ days: 9, kind: "manual", delta: 30, reason: "sponsor" }],
};
// What t1's roster says of the money and the staff its history paid for.
const T1_RESOURCES = Object.freeze({ coachesSafe: 20, assistantCoaches: 1, cheerleaders: 1, apothecary: 1, purchasedStaff: Object.freeze({ cheerleaders: 1 }) });

/** `?limit=` as a page size: a whole number of 1 to 100, and the usual page for anything else. */
function pageSize(params) {
  const text = params.get("limit") ?? "";
  const size = /^\d{1,3}$/.test(text) ? Number(text) : 0;
  return size >= 1 && size <= MAX_PAGE_SIZE ? size : LEDGER_PAGE_SIZE;
}

/**
 * Lines at the end of a team's history, in the order given; `atOf(row, index)` is when each was written, in
 * milliseconds. A line has the fields of the server's (`ledgerEntry`) and an id of its own.
 */
function appendLines(store, teamId, rows, atOf) {
  const lines = store.histories.get(teamId) ?? [];
  store.histories.set(teamId, lines);
  rows.forEach((row, index) => lines.push({
    id: `l${++store.lastLine}`,
    kind: row.kind,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason ?? null,
    note: row.note ?? null,
    pairingId: row.pairingId ?? null,
    createdAt: new Date(atOf(row, index)).toISOString(),
  }));
  return lines;
}

/** The fixtures: t1's resources and the histories of t1 and t5, for the teams the mock has. */
function seed(store, teams) {
  const now = Date.now();
  for (const [id, entries] of Object.entries(HISTORIES)) {
    const found = teams.find((item) => item.id === id);
    if (!found) continue;
    if (id === "t1") Object.assign(found.roster, structuredClone(T1_RESOURCES));
    const opening = sumMoney(countToNumber(found.roster.treasury), ...entries.map(({ delta }) => -delta));
    // A millisecond apart at least, so lines of one day keep their order.
    appendLines(store, id, ledgerRows(opening, entries), (row, index) => now - row.days * DAY + index);
  }
}

/** `GET …/ledger`: the page that starts at the line `before` names, newest first. */
function history(store, found, params) {
  const text = params.get("before") ?? "";
  if (text !== "" && !/^\d+$/.test(text)) return refuse(400, "FIELD_INVALID", { field: "before" });
  const newest = [...(store.histories.get(found.id) ?? [])].reverse();
  const from = Number(text);
  const size = pageSize(params);
  return reply({ entries: newest.slice(from, from + size), next: from + size < newest.length ? String(from + size) : null, since: store.since, total: newest.length });
}

/** `POST …/treasury`: the checks in the server's order (the body, the revision, the rule), then the write. */
function addEntry(store, found, body) {
  let asked;
  try {
    asked = checkManualEntry(body);
  } catch (error) {
    if (!error.status) throw error;
    return refuse(error.status, error.code, error.params);
  }
  if (body.revision !== found.revision) return savedElsewhere(found);
  const [row] = ledgerRows(countToNumber(found.roster.treasury), [{ kind: "manual", ...asked }]);
  if (!isMoneyAmount(row.balanceAfter)) {
    return reply({ ...errorPayload("ROSTER_BREAKS_THE_RULES"), violations: [{ code: VALIDATION_CODES.TREASURY_INVALID, params: {} }] }, 422);
  }
  Object.assign(found, { roster: { ...found.roster, treasury: row.balanceAfter }, revision: found.revision + 1, updatedAt: new Date().toISOString() });
  const entry = appendLines(store, found.id, [row], () => Date.now()).at(-1);
  return reply({ team: found, entry }, 201);
}

/** `PATCH`: the team body's checks (`readTeamBody`), then the revision, the stage, and the write with its lines. */
async function save(store, found, body, onSave) {
  const name = String(body.name ?? "").trim();
  const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
  if (!name) return refuse(400, "TEAM_NAME_REQUIRED");
  if (!baseTeamSlug) return refuse(400, "BASE_TEAM_REQUIRED");
  if (Number.isInteger(body.revision) && body.revision !== found.revision) return savedElsewhere(found);
  const before = normalizeDraft(found.roster);
  const roster = normalizeDraft(body.roster ?? {});
  const [locked] = stageViolations(before, roster, found.stage);
  if (locked) return refuse(422, "STAGE_PURCHASE_LOCKED", locked.params);
  // The race prices a sale; after a race change the old squad has no price here.
  const race = found.baseTeamSlug === baseTeamSlug ? teamBySlug(baseTeamSlug) : null;
  const rows = ledgerRows(before.treasury, classifyTreasuryChange(race, before, roster));
  if (found.id === "t1") await onSave(body);
  Object.assign(found, { name, baseTeamSlug, logoData: body.logoData ? String(body.logoData) : null, roster: body.roster ?? {}, revision: found.revision + 1, updatedAt: new Date().toISOString() });
  const stamp = Date.now();
  appendLines(store, found.id, rows, (row, index) => stamp + index);
  return reply({ team: found });
}

/**
 * @param {{teams: object[], readBody: (request: object) => Promise<object>, onSave: (body: object) => Promise<void>}} mock
 *   `teams` is the coach's list, changed in place; `readBody` the mock's JSON reader; `onSave` hears the body of
 *   every save of t1 that was accepted
 * @returns {(request: object, pathname: string) => Promise<{status: number, payload: object}|null>}
 */
export function treasuryRoutes({ teams, readBody, onSave }) {
  const store = { histories: new Map(), lastLine: 0, since: new Date(Date.now() - 30 * DAY).toISOString() };
  seed(store, teams);
  // A route is its method and what follows the team's id; "team" is the team itself.
  const routes = {
    "GET ledger": async (request, found) => history(store, found, new URL(request.url, "http://localhost").searchParams),
    "POST treasury": async (request, found) => addEntry(store, found, await readBody(request)),
    "PATCH team": async (request, found) => save(store, found, await readBody(request), onSave),
  };
  return async (request, pathname) => {
    const [, id, tail = "team"] = pathname.match(/^\/api\/teams\/([^/]+)(?:\/(ledger|treasury))?$/) ?? [];
    const answer = routes[`${request.method} ${tail}`];
    if (!id || !answer) return null;
    const found = teams.find((item) => item.id === id);
    return found ? answer(request, found) : refuse(404, "TEAM_NOT_FOUND");
  };
}

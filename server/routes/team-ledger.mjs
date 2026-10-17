/**
 * A team's treasury over HTTP: the history of its money, and the entry a coach writes by hand.
 *
 * `GET /api/teams/:id/ledger` is the history, a page at a time. `POST /api/teams/:id/treasury` is a
 * correction a coach makes themselves — a friendly's winnings, a sponsor, a fine — and it moves the
 * treasury and writes its line in one transaction, so the line exists exactly when the move does.
 * What else changes the treasury (a roster save, a match, a post-match) writes its own lines in its
 * own transaction through `writeLedgerEntries`.
 *
 * A team is the owner's. The history may be read by an administrator too; an entry is the owner's
 * alone, and to anybody else the team is not there (`teamForUser`).
 */
import { isMoneyAmount, sumMoney } from "../../src/domain/money.mjs";
import { VALIDATION_CODES } from "../../src/domain/roster/validate.mjs";
import { countToNumber } from "../../src/domain/roster/values.mjs";
import { publicSavedTeam } from "../api/serializers.mjs";
import { UUID_SOURCE, teamConflict, teamForUser } from "../api/team-access.mjs";
import { LEDGER_PAGE_SIZE, checkManualEntry, decodeLedgerCursor, ledgerSince, readLedgerPage, writeLedgerEntries } from "../api/team-ledger.mjs";
import { SAVED_TEAM_COLUMNS } from "../api/team-queries.mjs";
import { currentUser } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";

const LEDGER = new RegExp(`^/api/teams/(${UUID_SOURCE})/ledger$`, "i");
const TREASURY = new RegExp(`^/api/teams/(${UUID_SOURCE})/treasury$`, "i");
const MAX_PAGE_SIZE = 100;

/** `?limit=` as a page size: a whole number of 1 to 100, and the usual page for anything else. */
function pageSize(params) {
  const text = params.get("limit") ?? "";
  const size = /^\d{1,3}$/.test(text) ? Number(text) : 0;
  return size >= 1 && size <= MAX_PAGE_SIZE ? size : LEDGER_PAGE_SIZE;
}

/**
 * `?before=` as the cursor it names: none when it is left out or empty — the first page, so a client may send
 * the cursor it holds, empty while it holds none (R11) — and a 400 for `before` when it is no cursor of ours.
 */
function cursorOf(params) {
  const text = params.get("before");
  if (text === null || text === "") return null;
  const cursor = decodeLedgerCursor(text);
  if (!cursor) throw httpError(400, "FIELD_INVALID", { field: "before" });
  return cursor;
}

/**
 * The refusal for a treasury that would end below zero: the roster rule, in the shape a roster
 * save is refused with, so the client words it the way it words that one.
 */
function belowZero() {
  const error = httpError(422, "ROSTER_BREAKS_THE_RULES");
  error.violations = [{ code: VALIDATION_CODES.TREASURY_INVALID, params: {} }];
  return error;
}

/** `GET /api/teams/:id/ledger?before=&limit=` — one page of the history, and since when it is kept. */
async function sendHistory(request, response, teamId, params) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // One snapshot: the team, the page and `since` are read at the same moment, and the database
  // refuses a write inside it. The team comes first, so a stranger is told 404 whatever the cursor.
  const history = await withTransaction(async (client) => {
    const team = await teamForUser(client, teamId, user, { admin: true });
    const page = await readLedgerPage(client, team.id, { before: cursorOf(params), limit: pageSize(params) });
    return { ...page, since: await ledgerSince(client) };
  }, { readOnly: true });
  sendJson(response, 200, history);
}

/**
 * The transaction of an entry. The team is locked first; then, in this order, the revision the client
 * saw, the rule, the write and the answer read back. A refusal at any point throws, and the whole
 * transaction goes back: the treasury never moves without its line, nor the line without the treasury.
 *
 * The team in the answer is read again after the write, the way `GET` reads it (`inActiveSeason`
 * included), so the client handles one shape of team whichever route it came from.
 */
async function writeEntry(client, teamId, user, revision, { delta, reason, note }) {
  const team = await teamForUser(client, teamId, user, { lock: true });
  if (revision !== team.revision) throw await teamConflict(client, team); // no revision at all is a revision that cannot match
  const opening = countToNumber(team.roster?.treasury);
  const closing = sumMoney(opening, delta);
  if (!isMoneyAmount(closing)) throw belowZero();
  await client.query(
    `UPDATE saved_teams
        SET roster = jsonb_set(roster, '{treasury}', to_jsonb($2::numeric)), revision = revision + 1, updated_at = now()
      WHERE id = $1`,
    [team.id, closing],
  );
  await writeLedgerEntries(client, { teamId: team.id, opening, entries: [{ kind: "manual", delta, reason, note }], actorId: user.id });
  const { rows } = await client.query(`SELECT ${SAVED_TEAM_COLUMNS} FROM saved_teams WHERE id = $1`, [team.id]);
  const { entries } = await readLedgerPage(client, team.id, { limit: 1 });
  return { team: publicSavedTeam(rows[0]), entry: entries[0] };
}

/** `POST /api/teams/:id/treasury` `{ delta, reason, note?, revision }` — the owner adds a line by hand. */
async function addEntry(request, response, teamId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // Whose team it is comes before anything else about the request: a stranger is told 404 for a bad
  // body as for a good one. This look takes no lock — the transaction below looks again, locked.
  await teamForUser(pool, teamId, user);
  const body = await readJson(request);
  const entry = checkManualEntry(body); // a bad body costs no transaction
  const answer = await withTransaction((client) => writeEntry(client, teamId, user, body.revision, entry));
  sendJson(response, 201, answer);
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleLedgerRoutes(request, response, url) {
  const ledgerPath = request.method === "GET" ? LEDGER.exec(url.pathname) : null;
  if (ledgerPath) {
    await sendHistory(request, response, ledgerPath[1], url.searchParams);
    return true;
  }
  const treasuryPath = request.method === "POST" ? TREASURY.exec(url.pathname) : null;
  if (treasuryPath) {
    await addEntry(request, response, treasuryPath[1]);
    return true;
  }
  return false;
}

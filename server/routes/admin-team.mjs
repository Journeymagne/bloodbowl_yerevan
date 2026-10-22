/**
 * The administration's own way into a coach's team (stage 12): its money, a death and its undo, a death the site
 * never recorded — and the matches `GET /api/admin/teams/:id` lists for the last of them.
 *
 * These routes are the repair path. The owner's answer to question 2 of the 09a plan: while a team plays a match, it is
 * put right through /api/admin/* and nowhere else. A coach's route refuses every write of a team in a match
 * (TEAM_IN_MATCH, server/season/live-match.mjs), to an administrator as well; none of these asks. The team is put right
 * for the match to be settled on, and a post-match already open starts over with the team as it now stands
 * (POST_TEAM_CHANGED, stage 09b). Each takes the team's row, `FOR UPDATE`, and no row of the match before it: a tap
 * holds the pairing and then waits on the team, and a write that held the team and then waited on the pairing would
 * close a cycle with it. A fallen player added afterwards that names a match is the one that touches a pairing (its
 * row's key, for the record's reference): it takes that pairing first, `FOR KEY SHARE`, in the tap's order, and the
 * team after it.
 *
 * - `POST /api/admin/teams/:id/treasury {treasury, note, revision}` sets the treasury to the sum given and writes why:
 *   one `admin` line of the ledger, the difference, with the admin's reason as its note and the admin as its actor.
 *   The same sum is nothing to write. A stale revision is refused with the team, as every save of a team is.
 * - `POST /api/admin/teams/:id/players/:pid/death {cause, revision}` and `DELETE /api/admin/teams/:id/fallen/:fid` are
 *   the coach's own transactions (server/routes/team-fallen.mjs) with `{ admin: true }`: any coach's team, by the
 *   admin. The undo returns a match's death too — the player with what he had; the rolls he used stay used (09b).
 * - `POST /api/admin/teams/:id/fallen {player: {name, position, number?}, cause, pairingId?, diedAt?}` keeps a player
 *   who died with no record: before 3.0 kept the dead, or with nobody to mark it. He is kept as a roster holds a new
 *   player of the position, under an id of his own, so his undo puts him on the roster like any other. The roster is
 *   not touched: he is not on it.
 */
import { isMoneyAmount, sumMoney } from "../../src/domain/money.mjs";
import { MAX_NOTE } from "../../src/domain/roster/ledger.mjs";
import { normalizeRosterPlayer } from "../../src/domain/roster/players.mjs";
import { createPlayer } from "../../src/domain/roster/schema.mjs";
import { countToNumber, rowsForTeam } from "../../src/domain/roster/values.mjs";
import { publicFallen } from "../api/serializers.mjs";
import { PLAYER_ID_SOURCE, UUID_SOURCE, isUuid, teamConflict, teamForUser } from "../api/team-access.mjs";
import { readLedgerPage, writeLedgerEntries } from "../api/team-ledger.mjs";
import { readPublicTeam } from "../api/team-queries.mjs";
import { currentUser } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { teamBySlug } from "../domain/roster.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { checkCause, returnPlayer, writeDeath } from "./team-fallen.mjs";

const TREASURY = new RegExp(`^/api/admin/teams/(${UUID_SOURCE})/treasury$`, "i");
const DEATH = new RegExp(`^/api/admin/teams/(${UUID_SOURCE})/players/(${PLAYER_ID_SOURCE})/death$`, "i");
const FALLEN = new RegExp(`^/api/admin/teams/(${UUID_SOURCE})/fallen$`, "i");
const ONE_FALLEN = new RegExp(`^/api/admin/teams/(${UUID_SOURCE})/fallen/(${UUID_SOURCE})$`, "i");

/** The ledger keeps thousands as numeric(12,3): from a billion thousands on, a line would not fit (a 500). */
const TREASURY_LIMIT = 1e9;
/** The longest name of a fallen player added afterwards, in characters once trimmed. */
const MAX_NAME = 60;
/** How many matches the admin's team page lists: the newest, for the «Матч» of a fallen player added afterwards. */
const MAX_MATCHES = 100;
/** How far ahead of UTC a day begins (UTC+14): a day that has begun somewhere on Earth is no day to come. */
const AHEAD_OF_UTC_MS = 14 * 3600 * 1000;
const NOON_MS = 12 * 3600 * 1000;
/** A day, or a time with its zone: what `diedAt` may be. A time with no zone would be read in whatever zone the server is. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

const MATCHES_SQL = `
  SELECT id, match_kind, round_number, home_team_id, home_team_name, away_team_name, home_touchdowns, away_touchdowns, confirmed_at
    FROM match_pairing_context
   WHERE $1::uuid IN (home_team_id, away_team_id) AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL
     AND result_status = 'confirmed'
   ORDER BY confirmed_at DESC NULLS LAST, created_at DESC, id DESC
   LIMIT ${MAX_MATCHES}`;

const invalid = (field) => httpError(400, "FIELD_INVALID", { field });

/** The user asking, who has to be an admin: 401 NOT_AUTHORIZED for nobody, 403 ADMIN_REQUIRED for a coach. */
async function adminOf(request) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  if (!user.is_admin) throw httpError(403, "ADMIN_REQUIRED");
  return user;
}

/**
 * The admin, and the team the path names, before the body is read: a coach and a guest hear 403 and 401 whatever they
 * sent, and a team that is not there is a 404 for a bad body as for a good one. This look takes no lock — the
 * transaction looks again, locked.
 */
async function adminAndTeam(request, teamId) {
  const admin = await adminOf(request);
  await teamForUser(pool, teamId, admin, { admin: true });
  return admin;
}

/**
 * The treasury a body asks for and why, checked before any transaction: a sum to the gold, sent as a number, from 0 up
 * to what the ledger holds; a reason of 1 to `MAX_NOTE` characters once trimmed, with no NUL (U+0000, which no text
 * column of Postgres holds).
 *
 * @throws 400 FIELD_INVALID `treasury` or `note`
 */
function checkTreasury(body) {
  const { treasury, note } = body;
  if (typeof treasury !== "number" || !isMoneyAmount(treasury) || treasury >= TREASURY_LIMIT) throw invalid("treasury");
  const text = typeof note === "string" ? note.trim() : "";
  if (!text || text.length > MAX_NOTE || text.includes("\u0000")) throw invalid("note");
  return { treasury: sumMoney(treasury), note: text };
}

/**
 * The transaction of a treasury set by the admin. The team is locked first; then the revision the admin saw; then,
 * unless the sum is the one the team has, the treasury, the revision moved on, and the line that says so — `admin`,
 * the difference, the reason, the admin — and the answer read back. No refusal while the team plays: the repair path.
 * The entry is the newest line, which is the one just written, as for a coach's entry (server/routes/team-ledger.mjs).
 */
async function writeTreasury(client, teamId, admin, revision, { treasury, note }) {
  const team = await teamForUser(client, teamId, admin, { lock: true, admin: true });
  if (revision !== team.revision) throw await teamConflict(client, team); // no revision at all is a revision that cannot match
  const opening = countToNumber(team.roster?.treasury);
  const delta = sumMoney(treasury, -opening);
  if (!delta) return { team: await readPublicTeam(client, team.id), entry: null };
  await client.query(
    `UPDATE saved_teams
        SET roster = jsonb_set(roster, '{treasury}', to_jsonb($2::numeric)), revision = revision + 1, updated_at = now()
      WHERE id = $1`,
    [team.id, treasury],
  );
  await writeLedgerEntries(client, { teamId: team.id, opening, entries: [{ kind: "admin", delta, note }], actorId: admin.id });
  const { entries: [entry] } = await readLedgerPage(client, team.id, { limit: 1 });
  if (entry?.balanceAfter !== treasury) throw new Error(`the newest ledger line of team ${team.id} is not the admin's just written`);
  return { team: await readPublicTeam(client, team.id), entry };
}

/** `POST /api/admin/teams/:id/treasury` `{ treasury, note, revision }` → 200 `{ team, entry }`, `entry` null for the same sum. */
async function setTreasury(request, response, teamId) {
  const admin = await adminAndTeam(request, teamId);
  const body = await readJson(request);
  const asked = checkTreasury(body); // a bad body costs no transaction
  sendJson(response, 200, await withTransaction((client) => writeTreasury(client, teamId, admin, body.revision, asked)));
}

/** `POST /api/admin/teams/:id/players/:pid/death` `{ cause, revision }` → 201 `{ team, fallen }`: the coach's death, by the admin. */
async function markDeath(request, response, teamId, playerId) {
  const admin = await adminAndTeam(request, teamId);
  const body = await readJson(request);
  const cause = checkCause(body);
  const answer = await withTransaction((client) => writeDeath(client, teamId, admin, playerId, cause, body.revision, { admin: true }));
  sendJson(response, 201, answer);
}

/** `DELETE /api/admin/teams/:id/fallen/:fid` → 200 `{ team }`: the coach's undo, by the admin — a match's death too. */
async function undoDeath(request, response, teamId, fallenId) {
  const admin = await adminOf(request);
  const team = await withTransaction((client) => returnPlayer(client, teamId, fallenId, admin, { admin: true }));
  sendJson(response, 200, { team });
}

/**
 * When a player added afterwards died, as the row keeps it; null for now. A day (`2025-03-01`) is that day as every
 * calendar of the league shows it — its noon in UTC, or now if that has not come yet — and may be a day that has
 * begun anywhere on Earth; a time names its zone and has come. Anything else, a day no calendar has, or one to come,
 * is a 400 for `diedAt`.
 */
function checkDiedAt(value) {
  if (value === undefined || value === null) return null;
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  const [year, month, day] = match ? match.slice(1, 4).map(Number) : [];
  const start = Date.UTC(year, month - 1, day), date = new Date(start), now = Date.now();
  const real = Boolean(match) && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (real && !match[4] && start <= now + AHEAD_OF_UTC_MS) return new Date(Math.min(start + NOON_MS, now)).toISOString();
  const time = real && match[4] ? Date.parse(value) : NaN;
  if (!Number.isFinite(time) || time > now) throw invalid("diedAt");
  return new Date(time).toISOString();
}

/**
 * What a fallen player added afterwards is sent as, checked as far as it can be without the team, in this order: the
 * player, his name (1 to 60 characters once trimmed, no NUL), his shirt number (a whole number 1–99, or none), the
 * cause (as a coach's death has it), the pairing (an id, or none) and the day. His position is the race's, asked
 * with the team held.
 *
 * @throws 400 FIELD_INVALID naming the first of `player`, `name`, `number`, `cause`, `pairingId`, `diedAt` that is wrong
 */
function checkFallen(body) {
  const { player, pairingId = null } = body;
  if (!player || typeof player !== "object" || Array.isArray(player)) throw invalid("player");
  const name = typeof player.name === "string" ? player.name.trim() : "";
  if (!name || name.length > MAX_NAME || name.includes("\u0000")) throw invalid("name");
  const number = player.number ?? null;
  if (number !== null && !(Number.isInteger(number) && number >= 1 && number <= 99)) throw invalid("number");
  const cause = checkCause(body);
  if (pairingId !== null && !isUuid(pairingId)) throw invalid("pairingId");
  return { name, position: player.position, number, cause, pairingId, diedAt: checkDiedAt(body.diedAt) };
}

/**
 * A player of the team's race on the position named, as a roster holds a new one (`createPlayer`, read as a roster
 * reads him: `normalizeRosterPlayer`), with an id of his own, his name and his shirt number — none when none was
 * given, rather than a «1» nobody wore. The whole record, so that his undo can put him on the roster.
 *
 * @throws 400 FIELD_INVALID `position` for a position the race of the team does not have
 */
function fallenPlayer(slug, { name, position, number }) {
  const race = teamBySlug(slug);
  const rows = race ? rowsForTeam(race) : [];
  const rowIndex = typeof position === "string" ? rows.findIndex((row) => row.position === position) : -1;
  if (rowIndex < 0) throw invalid("position");
  return normalizeRosterPlayer({ ...createPlayer(rows[rowIndex], rowIndex, 0, { number: number ?? "" }), name }, rows);
}

/**
 * A match this team played, with its round: a pairing of two teams with the team a side of it, its result confirmed
 * or the match begun (as `adminTeamMatches` offers them, and an abandoned one); 400 for `pairingId` for any other — a
 * bye, a pairing not begun, another team's.
 */
async function pairingOfTeam(client, teamId, pairingId) {
  const { rows } = await client.query(
    `SELECT id, round_number FROM match_pairing_context WHERE id = $1 AND $2::uuid IN (home_team_id, away_team_id)
       AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL AND (result_status = 'confirmed' OR preparation_status = 'in_progress')`,
    [pairingId, teamId],
  );
  if (!rows[0]) throw invalid("pairingId");
  return rows[0];
}

/**
 * The transaction of a fallen player added afterwards. A match named is held first (its row's key, `FOR KEY SHARE`, in
 * the order a tap or a post-match takes the pairing and then the team: never a cycle with one); then the team, so its
 * race is the one the record is made for; then the position, the pairing's check, and the row: a match's death when
 * it names the match (`from_match`, the coach's to leave alone), dead when the admin says or now, recorded by the admin.
 */
async function writeFallen(client, teamId, admin, fallen) {
  if (fallen.pairingId) await client.query("SELECT 1 FROM season_pairings WHERE id = $1 FOR KEY SHARE", [fallen.pairingId]);
  const team = await teamForUser(client, teamId, admin, { lock: true, admin: true });
  const player = fallenPlayer(team.base_team_slug, fallen);
  const pairing = fallen.pairingId ? await pairingOfTeam(client, team.id, fallen.pairingId) : null;
  const { rows: [row] } = await client.query(
    `INSERT INTO team_fallen_players (saved_team_id, player, cause, pairing_id, recorded_by, died_at, from_match)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7) RETURNING *`,
    [team.id, JSON.stringify(player), fallen.cause, pairing?.id ?? null, admin.id, fallen.diedAt, Boolean(pairing)],
  );
  return publicFallen({ ...row, round_number: pairing?.round_number ?? null });
}

/** `POST /api/admin/teams/:id/fallen` `{ player: {name, position, number?}, cause, pairingId?, diedAt? }` → 201 `{ fallen }`. */
async function addFallen(request, response, teamId) {
  const admin = await adminAndTeam(request, teamId);
  const fallen = checkFallen(await readJson(request)); // a bad body costs no transaction
  sendJson(response, 201, { fallen: await withTransaction((client) => writeFallen(client, teamId, admin, fallen)) });
}

/**
 * The team's matches with a confirmed score, league and friendly, newest first and no more than `MAX_MATCHES`: what
 * a fallen player added afterwards may name. A bye has no opponent and is none. The score is this team's first.
 *
 * @param {{query: Function}} db
 * @param {string} teamId the team's id as the database holds it
 * @returns {Promise<{id: string, kind: "league"|"friendly", roundNumber: number|null, opponent: string,
 *   score: [number, number]|null, confirmedAt: Date|null}[]>}
 */
export async function adminTeamMatches(db, teamId) {
  const { rows } = await db.query(MATCHES_SQL, [teamId]);
  return rows.map((row) => {
    const home = row.home_team_id === teamId;
    const [own, theirs] = home ? [row.home_touchdowns, row.away_touchdowns] : [row.away_touchdowns, row.home_touchdowns];
    return {
      id: row.id,
      kind: row.match_kind,
      roundNumber: row.round_number ?? null,
      opponent: home ? row.away_team_name : row.home_team_name,
      score: own === null || theirs === null ? null : [own, theirs],
      confirmedAt: row.confirmed_at,
    };
  });
}

/** The routes of this module: method, path, and who answers it with the path's ids. */
const ROUTES = [
  ["POST", TREASURY, setTreasury],
  ["POST", DEATH, markDeath],
  ["DELETE", ONE_FALLEN, undoDeath],
  ["POST", FALLEN, addFallen],
];

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleAdminTeamWrites(request, response, url) {
  for (const [method, path, answer] of ROUTES) {
    const match = request.method === method ? path.exec(url.pathname) : null;
    if (match) {
      await answer(request, response, ...match.slice(1));
      return true;
    }
  }
  return false;
}

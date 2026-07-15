import crypto from "node:crypto";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { Pool } from "pg";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvFile() {
  const envPath = path.join(rootDir, ".env");
  let body = "";
  try {
    body = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

await loadEnvFile();

const appPort = Number(process.env.APP_PORT || process.env.PORT || 3002);

function resolveDatabaseUrl() {
  const value = process.env.DATABASE_URL || "postgres://gata_admin:change-me-admin-password@localhost:5432/gata_league";
  if (process.env.RUNNING_IN_DOCKER === "true") {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname === "postgres") {
      url.hostname = "localhost";
      url.port = process.env.POSTGRES_PORT || "5432";
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
}

const databaseUrl = resolveDatabaseUrl();
const sessionDays = Number(process.env.SESSION_DAYS || 30);
const databaseCheckRetries = Number(process.env.DATABASE_CHECK_RETRIES || 30);
const databaseCheckDelayMs = Number(process.env.DATABASE_CHECK_DELAY_MS || 1000);
const compressionMinBytes = Number(process.env.COMPRESSION_MIN_BYTES || 1024);

const pool = new Pool({ connectionString: databaseUrl });
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
const compressibleTypes = [
  "text/",
  "application/json",
  "application/javascript",
  "text/javascript",
  "image/svg+xml",
];

function normalizeLogin(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    telegram: row.telegram,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  };
}

function publicAdminUser(row) {
  if (!row) return null;
  return {
    ...publicUser(row),
    savedTeamCount: Number(row.saved_team_count ?? 0),
    lastTeamUpdatedAt: row.last_team_updated_at ?? null,
  };
}

function publicSavedTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseTeamSlug: row.base_team_slug,
    logoData: row.logo_data,
    roster: rosterWithoutEmbeddedLogo(row.roster),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripEmbeddedLogoData(value) {
  if (Array.isArray(value)) {
    return value.map(stripEmbeddedLogoData);
  }
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "logoData" && key !== "logo_data")
      .map(([key, entry]) => [key, stripEmbeddedLogoData(entry)]),
  );
}

function rosterWithoutEmbeddedLogo(roster = {}) {
  if (!roster || typeof roster !== "object") return {};
  return stripEmbeddedLogoData(roster);
}

function serializeRosterForStorage(roster = {}) {
  return JSON.stringify(rosterWithoutEmbeddedLogo(roster));
}

function publicSavedTeamSummary(row) {
  if (!row) return null;
  return {
    ...publicSavedTeam(row),
    logoData: null,
    roster: rosterWithoutEmbeddedLogo(row.roster),
  };
}

function publicSavedTeamSlim(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseTeamSlug: row.base_team_slug,
    logoData: null,
    roster: {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicSeason(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentRound: row.current_round,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicSeasonEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    seasonId: row.season_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.user_id,
      login: row.user_login,
      telegram: row.user_telegram,
      isAdmin: row.user_is_admin,
    },
    team: {
      id: row.saved_team_id,
      name: row.team_name,
      baseTeamSlug: row.base_team_slug,
      logoData: null,
      roster: {},
      createdAt: row.team_created_at,
      updatedAt: row.team_updated_at,
    },
  };
}

function publicSeasonPairing(row) {
  if (!row) return null;
  return {
    id: row.id,
    roundId: row.round_id,
    roundNumber: row.round_number,
    roundStatus: row.round_status,
    tableNumber: row.table_number,
    homeEntryId: row.home_entry_id,
    awayEntryId: row.away_entry_id,
    homeTouchdowns: row.home_touchdowns,
    awayTouchdowns: row.away_touchdowns,
    resultType: row.result_type,
    homeOpponentUnable: row.home_opponent_unable,
    awayOpponentUnable: row.away_opponent_unable,
    homePoints: row.home_points,
    awayPoints: row.away_points,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicAdminSavedTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseTeamSlug: row.base_team_slug,
    logoData: row.logo_data,
    roster: rosterWithoutEmbeddedLogo(row.roster),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: {
      id: row.user_id,
      login: row.user_login,
      telegram: row.user_telegram,
      isAdmin: row.user_is_admin,
    },
  };
}

function publicAdminSavedTeamSlim(row) {
  if (!row) return null;
  return {
    ...publicSavedTeamSlim(row),
    owner: {
      id: row.user_id,
      login: row.user_login,
      telegram: row.user_telegram,
      isAdmin: row.user_is_admin,
    },
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored = "") {
  const [method, salt, expected] = stored.split(":");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function safeDatabaseLabel(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}:${url.port || 5432}/${url.pathname.replace(/^\//, "")}`;
  } catch {
    return "configured database";
  }
}

function startupLog(message) {
  console.log(`[startup] ${message}`);
}

async function waitForDatabase() {
  const label = safeDatabaseLabel(databaseUrl);
  startupLog(`checking PostgreSQL at ${label}`);

  for (let attempt = 1; attempt <= databaseCheckRetries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      startupLog(`PostgreSQL is up, site is connected to ${label}`);
      return;
    } catch (error) {
      const isLastAttempt = attempt === databaseCheckRetries;
      const detail = error?.code || error?.message || "connection failed";
      if (isLastAttempt) {
        startupLog(`PostgreSQL check failed after ${attempt} attempts: ${detail}`);
        throw error;
      }
      startupLog(`PostgreSQL is not ready yet (${attempt}/${databaseCheckRetries}): ${detail}`);
      await wait(databaseCheckDelayMs);
    }
  }
}

async function ensureSchema() {
  const sql = await fs.readFile(path.join(rootDir, "server", "init.sql"), "utf8");
  await pool.query(sql);
  startupLog("database schema is ready");
}

async function ensureAdmin() {
  const login = process.env.ADMIN_LOGIN || "admin";
  const password = process.env.ADMIN_PASSWORD || "change-me-site-admin-password";
  const telegram = process.env.ADMIN_TELEGRAM || "@admin";
  const loginKey = normalizeLogin(login);
  const passwordHash = hashPassword(password);

  await pool.query(
    `INSERT INTO users (login, login_key, telegram, password_hash, is_admin)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (login_key) DO UPDATE
       SET telegram = EXCLUDED.telegram,
           password_hash = EXCLUDED.password_hash,
           is_admin = TRUE,
           updated_at = now()`,
    [login, loginKey, telegram, passwordHash],
  );
  startupLog(`admin account is ready: ${login}`);
}

function shouldCompress(contentType = "", body) {
  return body.length >= compressionMinBytes
    && compressibleTypes.some((type) => contentType.startsWith(type));
}

function preferredEncoding(request) {
  const value = String(request?.headers?.["accept-encoding"] ?? "");
  if (/\bbr\b/.test(value)) return "br";
  if (/\bgzip\b/.test(value)) return "gzip";
  return "";
}

function encodedBody(request, body, contentType) {
  if (!shouldCompress(contentType, body)) return { body };
  const encoding = preferredEncoding(request);
  if (encoding === "br") {
    return {
      body: brotliCompressSync(body, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        },
      }),
      encoding,
    };
  }
  if (encoding === "gzip") {
    return { body: gzipSync(body, { level: 6 }), encoding };
  }
  return { body };
}

function writeResponse(request, response, status, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const contentType = String(headers["Content-Type"] ?? "");
  const encoded = encodedBody(request, buffer, contentType);
  const responseHeaders = {
    ...headers,
    "Content-Length": encoded.body.length,
  };
  if (encoded.encoding) {
    responseHeaders["Content-Encoding"] = encoded.encoding;
    responseHeaders.Vary = [responseHeaders.Vary, "Accept-Encoding"].filter(Boolean).join(", ");
  }
  response.writeHead(status, responseHeaders);
  response.end(encoded.body);
}

function sendJson(response, status, payload) {
  writeResponse(response.__request, response, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function currentUser(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await pool.query(
    `SELECT users.*
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(sessionDays)],
  );
  return token;
}

async function ensureActiveSeason() {
  const existing = await pool.query(
    `SELECT * FROM seasons WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`,
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    `INSERT INTO seasons (name, status)
     VALUES ('Season 1', 'active')
     RETURNING *`,
  ).catch((error) => {
    if (error.code === "23505") return null;
    throw error;
  });
  if (created?.rows[0]) return created.rows[0];

  const raced = await pool.query(
    `SELECT * FROM seasons WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`,
  );
  return raced.rows[0];
}

async function loadSeasonEntryRows(seasonId) {
  const result = await pool.query(
    `SELECT
       se.*,
       users.login AS user_login,
       users.telegram AS user_telegram,
       users.is_admin AS user_is_admin,
       saved_teams.name AS team_name,
       saved_teams.base_team_slug,
       saved_teams.created_at AS team_created_at,
       saved_teams.updated_at AS team_updated_at
     FROM season_entries se
     JOIN users ON users.id = se.user_id
     JOIN saved_teams ON saved_teams.id = se.saved_team_id
     WHERE se.season_id = $1
     ORDER BY se.created_at ASC, users.login_key ASC`,
    [seasonId],
  );
  return result.rows;
}

async function loadSeasonRoundRows(seasonId) {
  const result = await pool.query(
    `SELECT * FROM season_rounds WHERE season_id = $1 ORDER BY round_number ASC`,
    [seasonId],
  );
  return result.rows;
}

async function loadSeasonPairingRows(seasonId) {
  const result = await pool.query(
    `SELECT season_pairings.*, season_rounds.round_number, season_rounds.status AS round_status
     FROM season_pairings
     JOIN season_rounds ON season_rounds.id = season_pairings.round_id
     WHERE season_rounds.season_id = $1
     ORDER BY season_rounds.round_number ASC, season_pairings.table_number ASC`,
    [seasonId],
  );
  return result.rows;
}

function nullableInteger(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw httpError(400, `${fieldName} must be a non-negative integer.`);
  }
  return number;
}

function normalizeResultType(value = "played") {
  const resultType = String(value || "played");
  return ["played", "technical_home", "technical_away"].includes(resultType) ? resultType : "played";
}

function scoreLeagueResult({
  homeTouchdowns,
  awayTouchdowns,
  resultType = "played",
  homeOpponentUnable = false,
  awayOpponentUnable = false,
  hasHome = true,
  hasAway = true,
}) {
  if (!hasHome && !hasAway) {
    return { homePoints: null, awayPoints: null, homeTouchdowns: null, awayTouchdowns: null };
  }

  if (resultType === "technical_home") {
    return { homePoints: hasHome ? 2 : null, awayPoints: hasAway ? 0 : null, homeTouchdowns: hasHome ? 1 : null, awayTouchdowns: hasAway ? 0 : null };
  }

  if (resultType === "technical_away") {
    return { homePoints: hasHome ? 0 : null, awayPoints: hasAway ? 2 : null, homeTouchdowns: hasHome ? 0 : null, awayTouchdowns: hasAway ? 1 : null };
  }

  if (homeTouchdowns === null || awayTouchdowns === null || homeTouchdowns === undefined || awayTouchdowns === undefined) {
    return { homePoints: null, awayPoints: null, homeTouchdowns: homeTouchdowns ?? null, awayTouchdowns: awayTouchdowns ?? null };
  }

  let homePoints = homeTouchdowns > awayTouchdowns ? 3 : homeTouchdowns === awayTouchdowns ? 1 : 0;
  let awayPoints = awayTouchdowns > homeTouchdowns ? 3 : homeTouchdowns === awayTouchdowns ? 1 : 0;
  const touchdownGap = Math.abs(homeTouchdowns - awayTouchdowns);

  if (touchdownGap >= 3) {
    if (homeTouchdowns > awayTouchdowns) homePoints += 1;
    if (awayTouchdowns > homeTouchdowns) awayPoints += 1;
  }

  if (homeTouchdowns > 0 && awayTouchdowns === 0) homePoints += 1;
  if (awayTouchdowns > 0 && homeTouchdowns === 0) awayPoints += 1;
  if (homeOpponentUnable) homePoints += 2;
  if (awayOpponentUnable) awayPoints += 2;

  return { homePoints, awayPoints, homeTouchdowns, awayTouchdowns };
}

function computeSeasonStandings(entryRows, pairingRows) {
  const standings = new Map(entryRows.map((row) => {
    const entry = publicSeasonEntry(row);
    return [row.id, {
      entryId: row.id,
      user: entry.user,
      team: entry.team,
      points: 0,
      games: 0,
      byes: 0,
      opponents: [],
    }];
  }));

  for (const pairing of pairingRows) {
    if (pairing.round_status !== "started") continue;
    if (!pairing.home_entry_id && !pairing.away_entry_id) continue;

    const home = standings.get(pairing.home_entry_id);
    const away = standings.get(pairing.away_entry_id);

    if (home && !away) {
      if (pairing.home_points === null) continue;
      home.games += 1;
      home.byes += 1;
      home.points += Number(pairing.home_points);
      continue;
    }

    if (away && !home) {
      if (pairing.away_points === null) continue;
      away.games += 1;
      away.byes += 1;
      away.points += Number(pairing.away_points);
      continue;
    }

    if (!home || !away) continue;
    home.opponents.push(pairing.away_entry_id);
    away.opponents.push(pairing.home_entry_id);

    if (pairing.home_points === null || pairing.away_points === null) {
      continue;
    }

    home.games += 1;
    away.games += 1;
    home.points += Number(pairing.home_points);
    away.points += Number(pairing.away_points);
  }

  return [...standings.values()]
    .sort((a, b) => b.points - a.points
      || b.games - a.games
      || a.user.login.localeCompare(b.user.login, "en")
      || a.team.name.localeCompare(b.team.name, "en"))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

async function loadSeasonBundle(user) {
  const seasonRow = await ensureActiveSeason();
  const [entryRows, roundRows, pairingRows, myTeamsResult] = await Promise.all([
    loadSeasonEntryRows(seasonRow.id),
    loadSeasonRoundRows(seasonRow.id),
    loadSeasonPairingRows(seasonRow.id),
    pool.query(
      `SELECT id, user_id, name, base_team_slug, created_at, updated_at
       FROM saved_teams
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [user.id],
    ),
  ]);
  const entries = entryRows.map(publicSeasonEntry);
  const pairings = pairingRows.map(publicSeasonPairing);
  const rounds = roundRows.map((round) => ({
    id: round.id,
    seasonId: round.season_id,
    roundNumber: round.round_number,
    status: round.status,
    createdAt: round.created_at,
    updatedAt: round.updated_at,
    pairings: pairings.filter((pairing) => pairing.roundId === round.id),
  }));
  const standings = computeSeasonStandings(entryRows, pairingRows);
  const myEntry = entries.find((entry) => entry.user.id === user.id) ?? null;
  const startedRounds = rounds.filter((round) => round.status === "started").sort((a, b) => b.roundNumber - a.roundNumber);
  const currentFixture = myEntry
    ? (startedRounds.flatMap((round) => round.pairings)
      .find((pairing) => pairing.homeEntryId === myEntry.id || pairing.awayEntryId === myEntry.id) ?? null)
    : null;
  const payload = {
    season: publicSeason(seasonRow),
    entries,
    standings,
    rounds,
    myEntry,
    currentFixture,
    myTeams: myTeamsResult.rows.map(publicSavedTeamSlim),
  };

  if (user.is_admin) {
    const [usersResult, teamsResult] = await Promise.all([
      pool.query(`SELECT * FROM users ORDER BY login_key ASC`),
      pool.query(
        `SELECT saved_teams.id,
                saved_teams.user_id,
                saved_teams.name,
                saved_teams.base_team_slug,
                saved_teams.created_at,
                saved_teams.updated_at,
                users.login AS user_login,
                users.telegram AS user_telegram,
                users.is_admin AS user_is_admin
         FROM saved_teams
         JOIN users ON users.id = saved_teams.user_id
         ORDER BY users.login_key ASC, saved_teams.updated_at DESC`,
      ),
    ]);
    payload.admin = {
      users: usersResult.rows.map(publicUser),
      savedTeams: teamsResult.rows.map(publicAdminSavedTeamSlim),
    };
  }

  return payload;
}

async function commitSavedTeamToSeason(seasonId, savedTeamId, ownerId = "") {
  const params = ownerId ? [savedTeamId, ownerId] : [savedTeamId];
  const ownerSql = ownerId ? "AND user_id = $2" : "";
  const savedTeam = await pool.query(
    `SELECT * FROM saved_teams WHERE id = $1 ${ownerSql}`,
    params,
  );
  if (!savedTeam.rows[0]) throw httpError(404, "Saved team not found.");

  const result = await pool.query(
    `INSERT INTO season_entries (season_id, user_id, saved_team_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [seasonId, savedTeam.rows[0].user_id, savedTeam.rows[0].id],
  ).catch((error) => {
    if (error.code === "23505") return null;
    throw error;
  });
  if (!result) throw httpError(409, "This coach or team is already committed to the season.");
  return result.rows[0];
}

function previousOpponentMap(entryRows, pairingRows) {
  const opponents = new Map(entryRows.map((entry) => [entry.id, new Set()]));
  const byes = new Set();
  for (const pairing of pairingRows) {
    if (pairing.round_status !== "started") continue;
    if (!pairing.home_entry_id && !pairing.away_entry_id) continue;
    if (!pairing.away_entry_id) {
      if (pairing.home_entry_id) byes.add(pairing.home_entry_id);
      continue;
    }
    if (!pairing.home_entry_id) {
      byes.add(pairing.away_entry_id);
      continue;
    }
    opponents.get(pairing.home_entry_id)?.add(pairing.away_entry_id);
    opponents.get(pairing.away_entry_id)?.add(pairing.home_entry_id);
  }
  return { opponents, byes };
}

function assertNoDraftRound(roundRows) {
  const draft = roundRows.find((round) => round.status === "draft");
  if (draft) {
    throw httpError(409, `Round ${draft.round_number} is still a draft. Start or delete it before creating another round.`);
  }
}

function assertCurrentRoundComplete(pairingRows) {
  const latestRound = Math.max(0, ...pairingRows
    .filter((pairing) => pairing.round_status === "started")
    .map((pairing) => Number(pairing.round_number)));
  if (!latestRound) return;
  const unfinished = pairingRows.some((pairing) => pairing.round_number === latestRound
    && pairing.round_status === "started"
    && pairing.home_entry_id
    && pairing.away_entry_id
    && (pairing.home_points === null || pairing.away_points === null));
  if (unfinished) {
    throw httpError(409, `Round ${latestRound} has unfinished pairings.`);
  }
}

async function generateSwissRound(seasonRow) {
  const entryRows = await loadSeasonEntryRows(seasonRow.id);
  const roundRows = await loadSeasonRoundRows(seasonRow.id);
  const pairingRows = await loadSeasonPairingRows(seasonRow.id);
  if (!entryRows.length) throw httpError(400, "Add at least one committed team first.");
  assertNoDraftRound(roundRows);
  assertCurrentRoundComplete(pairingRows);

  const standings = computeSeasonStandings(entryRows, pairingRows);
  const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
  const queue = standings.map((standing) => entriesById.get(standing.entryId)).filter(Boolean);
  const { opponents, byes } = previousOpponentMap(entryRows, pairingRows);
  const pairingsToCreate = [];

  if (queue.length % 2 === 1) {
    let byeIndex = -1;
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (!byes.has(queue[index].id)) {
        byeIndex = index;
        break;
      }
    }
    if (byeIndex === -1) byeIndex = queue.length - 1;
    const [byeEntry] = queue.splice(byeIndex, 1);
    pairingsToCreate.push({
      homeEntryId: byeEntry.id,
      awayEntryId: null,
      homePoints: null,
      awayPoints: null,
    });
  }

  const matchPairings = [];
  while (queue.length > 0) {
    const home = queue.shift();
    let awayIndex = queue.findIndex((candidate) => !opponents.get(home.id)?.has(candidate.id));
    if (awayIndex === -1) awayIndex = 0;
    const [away] = queue.splice(awayIndex, 1);
    matchPairings.push({
      homeEntryId: home.id,
      awayEntryId: away.id,
      homePoints: null,
      awayPoints: null,
    });
  }

  const nextRoundNumber = Math.max(0, ...roundRows.map((round) => Number(round.round_number))) + 1;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roundResult = await client.query(
      `INSERT INTO season_rounds (season_id, round_number)
       VALUES ($1, $2)
       RETURNING *`,
      [seasonRow.id, nextRoundNumber],
    );
    const round = roundResult.rows[0];
    const orderedPairings = [...matchPairings, ...pairingsToCreate];
    for (let index = 0; index < orderedPairings.length; index += 1) {
      const pairing = orderedPairings[index];
      await client.query(
        `INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id, home_points, away_points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          round.id,
          index + 1,
          pairing.homeEntryId,
          pairing.awayEntryId,
          pairing.homePoints,
          pairing.awayPoints,
        ],
      );
    }
    await client.query(
      `UPDATE seasons SET current_round = $2, updated_at = now() WHERE id = $1`,
      [seasonRow.id, nextRoundNumber],
    );
    await client.query("COMMIT");
    return round;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function validateSeasonEntry(seasonId, entryId) {
  if (!entryId) return null;
  const result = await pool.query(
    `SELECT id FROM season_entries WHERE id = $1 AND season_id = $2`,
    [entryId, seasonId],
  );
  if (!result.rows[0]) throw httpError(404, "Season entry not found.");
  return result.rows[0].id;
}

async function createManualRound(seasonRow) {
  const roundRows = await loadSeasonRoundRows(seasonRow.id);
  const pairingRows = await loadSeasonPairingRows(seasonRow.id);
  assertNoDraftRound(roundRows);
  assertCurrentRoundComplete(pairingRows);
  const nextRoundNumber = Math.max(0, ...roundRows.map((round) => Number(round.round_number))) + 1;
  const result = await pool.query(
    `INSERT INTO season_rounds (season_id, round_number, status)
     VALUES ($1, $2, 'draft')
     RETURNING *`,
    [seasonRow.id, nextRoundNumber],
  );
  return result.rows[0];
}

async function addSeasonPairing(seasonId, roundId, homeEntryId = "", awayEntryId = "") {
  const round = await pool.query(
    `SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2`,
    [roundId, seasonId],
  );
  if (!round.rows[0]) throw httpError(404, "Round not found.");
  if (round.rows[0].status !== "draft") throw httpError(409, "Started rounds are locked.");

  const homeId = await validateSeasonEntry(seasonId, homeEntryId);
  const awayId = await validateSeasonEntry(seasonId, awayEntryId);
  if (homeId && awayId && homeId === awayId) throw httpError(400, "A team cannot play itself.");

  const nextTable = await pool.query(
    `SELECT COALESCE(MAX(table_number), 0) + 1 AS table_number
     FROM season_pairings
     WHERE round_id = $1`,
    [roundId],
  );
  const result = await pool.query(
    `INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [roundId, nextTable.rows[0].table_number, homeId, awayId],
  );
  return result.rows[0];
}

async function updateSeasonPairing(seasonId, pairingId, body, isAdmin = false, userId = "") {
  const current = await pool.query(
    `SELECT season_pairings.*, season_rounds.season_id, season_rounds.status AS round_status
     FROM season_pairings
     JOIN season_rounds ON season_rounds.id = season_pairings.round_id
     WHERE season_pairings.id = $1 AND season_rounds.season_id = $2`,
    [pairingId, seasonId],
  );
  const pairing = current.rows[0];
  if (!pairing) throw httpError(404, "Pairing not found.");

  const wantsTeamUpdate = Object.hasOwn(body, "homeEntryId") || Object.hasOwn(body, "awayEntryId");
  if (wantsTeamUpdate && !isAdmin) throw httpError(403, "Admin access required.");
  if (wantsTeamUpdate && pairing.round_status !== "draft") throw httpError(409, "Started pairings are locked.");
  if (!isAdmin && pairing.round_status !== "started") throw httpError(409, "This round has not started yet.");
  if (!isAdmin && (!pairing.home_entry_id || !pairing.away_entry_id)) {
    throw httpError(400, "This fixture cannot receive a player-submitted result.");
  }

  let homeEntryId = pairing.home_entry_id;
  let awayEntryId = pairing.away_entry_id;
  if (wantsTeamUpdate) {
    homeEntryId = await validateSeasonEntry(seasonId, body.homeEntryId);
    awayEntryId = await validateSeasonEntry(seasonId, body.awayEntryId);
    if (homeEntryId && awayEntryId && homeEntryId === awayEntryId) {
      throw httpError(400, "A team cannot play itself.");
    }
  }

  if (!isAdmin) {
    const userEntry = await pool.query(
      `SELECT id FROM season_entries WHERE season_id = $1 AND user_id = $2`,
      [seasonId, userId],
    );
    const entryId = userEntry.rows[0]?.id;
    if (!entryId || (entryId !== pairing.home_entry_id && entryId !== pairing.away_entry_id)) {
      throw httpError(403, "This fixture does not belong to your team.");
    }
  }

  const resultType = normalizeResultType(body.resultType ?? pairing.result_type);
  const homeTouchdowns = nullableInteger(body.homeTouchdowns, "Home touchdowns");
  const awayTouchdowns = nullableInteger(body.awayTouchdowns, "Away touchdowns");
  const nextHomeTouchdowns = homeTouchdowns === undefined ? pairing.home_touchdowns : homeTouchdowns;
  const nextAwayTouchdowns = awayTouchdowns === undefined ? pairing.away_touchdowns : awayTouchdowns;
  const nextHomeOpponentUnable = Boolean(body.homeOpponentUnable ?? pairing.home_opponent_unable);
  const nextAwayOpponentUnable = Boolean(body.awayOpponentUnable ?? pairing.away_opponent_unable);
  const score = scoreLeagueResult({
    homeTouchdowns: nextHomeTouchdowns,
    awayTouchdowns: nextAwayTouchdowns,
    resultType,
    homeOpponentUnable: nextHomeOpponentUnable,
    awayOpponentUnable: nextAwayOpponentUnable,
    hasHome: Boolean(homeEntryId),
    hasAway: Boolean(awayEntryId),
  });

  const result = await pool.query(
    `UPDATE season_pairings
     SET home_entry_id = $2,
         away_entry_id = $3,
         home_touchdowns = $4,
         away_touchdowns = $5,
         result_type = $6,
         home_opponent_unable = $7,
         away_opponent_unable = $8,
         home_points = $9,
         away_points = $10,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      pairingId,
      homeEntryId,
      awayEntryId,
      score.homeTouchdowns,
      score.awayTouchdowns,
      resultType,
      nextHomeOpponentUnable,
      nextAwayOpponentUnable,
      score.homePoints,
      score.awayPoints,
    ],
  );
  return result.rows[0];
}

async function startSeasonRound(seasonId, roundId) {
  const round = await pool.query(
    `SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2`,
    [roundId, seasonId],
  );
  if (!round.rows[0]) throw httpError(404, "Round not found.");
  if (round.rows[0].status === "started") return round.rows[0];

  const pairings = await pool.query(
    `SELECT * FROM season_pairings WHERE round_id = $1 ORDER BY table_number ASC`,
    [roundId],
  );
  if (!pairings.rows.some((pairing) => pairing.home_entry_id || pairing.away_entry_id)) {
    throw httpError(400, "Add at least one non-empty pairing before starting the round.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const pairing of pairings.rows) {
      if (pairing.home_entry_id && !pairing.away_entry_id) {
        await client.query(
          `UPDATE season_pairings
           SET result_type = 'technical_home',
               home_touchdowns = 1,
               away_touchdowns = 0,
               home_points = 2,
               away_points = 0,
               updated_at = now()
           WHERE id = $1`,
          [pairing.id],
        );
      } else if (!pairing.home_entry_id && pairing.away_entry_id) {
        await client.query(
          `UPDATE season_pairings
           SET result_type = 'technical_away',
               home_touchdowns = 0,
               away_touchdowns = 1,
               home_points = 0,
               away_points = 2,
               updated_at = now()
           WHERE id = $1`,
          [pairing.id],
        );
      }
    }
    const updated = await client.query(
      `UPDATE season_rounds
       SET status = 'started',
           updated_at = now()
       WHERE id = $1 AND season_id = $2
       RETURNING *`,
      [roundId, seasonId],
    );
    await client.query(
      `UPDATE seasons
       SET current_round = GREATEST(current_round, $2),
           updated_at = now()
       WHERE id = $1`,
      [seasonId, round.rows[0].round_number],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      await pool.query("SELECT 1");
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await currentUser(request);
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJson(request);
      const login = String(body.login ?? "").trim();
      const password = String(body.password ?? "");
      const telegram = String(body.telegram ?? "").trim();
      const loginKey = normalizeLogin(login);

      if (login.length < 3) return sendJson(response, 400, { error: "Login must be at least 3 characters." });
      if (password.length < 4) return sendJson(response, 400, { error: "Password must be at least 4 characters." });
      if (!telegram) return sendJson(response, 400, { error: "Telegram contact is required." });

      const passwordHash = hashPassword(password);
      const result = await pool.query(
        `INSERT INTO users (login, login_key, telegram, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [login, loginKey, telegram, passwordHash],
      ).catch((error) => {
        if (error.code === "23505") return null;
        throw error;
      });
      if (!result) return sendJson(response, 409, { error: "This login is already registered." });

      const token = await createSession(result.rows[0].id);
      return sendJson(response, 201, { token, user: publicUser(result.rows[0]) });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(request);
      const loginKey = normalizeLogin(body.login ?? "");
      const password = String(body.password ?? "");
      const result = await pool.query("SELECT * FROM users WHERE login_key = $1", [loginKey]);
      const user = result.rows[0];
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(response, 401, { error: "Wrong login or password." });
      }
      const token = await createSession(user.id);
      return sendJson(response, 200, { token, user: publicUser(user) });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = bearerToken(request);
      if (token) {
        await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
      }
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "PATCH" && url.pathname === "/api/auth/profile") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });

      const body = await readJson(request);
      const login = String(body.login ?? user.login).trim();
      const telegram = String(body.telegram ?? user.telegram).trim();
      const password = String(body.password ?? "");
      const loginKey = normalizeLogin(login);

      if (login.length < 3) return sendJson(response, 400, { error: "Login must be at least 3 characters." });
      if (!telegram) return sendJson(response, 400, { error: "Telegram contact is required." });
      if (password && password.length < 4) return sendJson(response, 400, { error: "Password must be at least 4 characters." });

      const params = [user.id, login, loginKey, telegram];
      const passwordSql = password ? ", password_hash = $5" : "";
      if (password) params.push(hashPassword(password));
      const updated = await pool.query(
        `UPDATE users
         SET login = $2,
             login_key = $3,
             telegram = $4,
             updated_at = now()
             ${passwordSql}
         WHERE id = $1
         RETURNING *`,
        params,
      ).catch((error) => {
        if (error.code === "23505") return null;
        throw error;
      });
      if (!updated) return sendJson(response, 409, { error: "This login is already registered." });

      return sendJson(response, 200, { user: publicUser(updated.rows[0]) });
    }

    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const result = await pool.query(
        `SELECT users.*,
                COUNT(saved_teams.id) AS saved_team_count,
                MAX(saved_teams.updated_at) AS last_team_updated_at
         FROM users
         LEFT JOIN saved_teams ON saved_teams.user_id = users.id
         GROUP BY users.id
         ORDER BY users.login_key ASC`,
      );
      return sendJson(response, 200, { users: result.rows.map(publicAdminUser) });
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i);
    if (adminUserMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const [profileResult, teamsResult] = await Promise.all([
        pool.query(
          `SELECT users.*,
                  COUNT(saved_teams.id) AS saved_team_count,
                  MAX(saved_teams.updated_at) AS last_team_updated_at
           FROM users
           LEFT JOIN saved_teams ON saved_teams.user_id = users.id
           WHERE users.id = $1
           GROUP BY users.id`,
          [adminUserMatch[1]],
        ),
        pool.query(
          `SELECT id, user_id, name, base_team_slug, roster, created_at, updated_at
           FROM saved_teams
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [adminUserMatch[1]],
        ),
      ]);
      if (!profileResult.rows[0]) return sendJson(response, 404, { error: "User not found." });
      return sendJson(response, 200, {
        user: publicAdminUser(profileResult.rows[0]),
        teams: teamsResult.rows.map(publicSavedTeamSummary),
      });
    }

    const adminUserTeamsMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/teams$/i);
    if (adminUserTeamsMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const name = String(body.name ?? "").trim();
      const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
      const logoData = body.logoData ? String(body.logoData) : null;
      const roster = body.roster ?? {};

      if (!name) return sendJson(response, 400, { error: "Team name is required." });
      if (!baseTeamSlug) return sendJson(response, 400, { error: "Base team is required." });
      if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
        return sendJson(response, 400, { error: "Logo is too large." });
      }

      const coach = await pool.query(`SELECT * FROM users WHERE id = $1`, [adminUserTeamsMatch[1]]);
      if (!coach.rows[0]) return sendJson(response, 404, { error: "Coach not found." });

      const result = await pool.query(
        `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [adminUserTeamsMatch[1], name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      return sendJson(response, 201, {
        user: publicUser(coach.rows[0]),
        team: publicSavedTeam(result.rows[0]),
      });
    }

    const adminTeamMatch = url.pathname.match(/^\/api\/admin\/teams\/([0-9a-f-]+)$/i);
    if (adminTeamMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const result = await pool.query(
        `SELECT saved_teams.*, users.id AS owner_id, users.login AS owner_login, users.telegram AS owner_telegram, users.is_admin AS owner_is_admin, users.created_at AS owner_created_at
         FROM saved_teams
         JOIN users ON users.id = saved_teams.user_id
         WHERE saved_teams.id = $1`,
        [adminTeamMatch[1]],
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      const row = result.rows[0];
      return sendJson(response, 200, {
        owner: publicUser({
          id: row.owner_id,
          login: row.owner_login,
          telegram: row.owner_telegram,
          is_admin: row.owner_is_admin,
          created_at: row.owner_created_at,
        }),
        team: publicSavedTeam(row),
      });
    }

    if (adminTeamMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const name = String(body.name ?? "").trim();
      const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
      const logoData = body.logoData ? String(body.logoData) : null;
      const roster = body.roster ?? {};

      if (!name) return sendJson(response, 400, { error: "Team name is required." });
      if (!baseTeamSlug) return sendJson(response, 400, { error: "Base team is required." });
      if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
        return sendJson(response, 400, { error: "Logo is too large." });
      }

      const result = await pool.query(
        `UPDATE saved_teams
         SET name = $2,
             base_team_slug = $3,
             logo_data = $4,
             roster = $5,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [adminTeamMatch[1], name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      return sendJson(response, 200, { team: publicSavedTeam(result.rows[0]) });
    }

    const publicTeamMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)\/teams\/([0-9a-f-]+)$/i);
    if (publicTeamMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const [profileResult, teamResult] = await Promise.all([
        pool.query(`SELECT * FROM users WHERE id = $1`, [publicTeamMatch[1]]),
        pool.query(`SELECT * FROM saved_teams WHERE user_id = $1 AND id = $2`, [publicTeamMatch[1], publicTeamMatch[2]]),
      ]);
      if (!profileResult.rows[0]) return sendJson(response, 404, { error: "Player not found." });
      if (!teamResult.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      return sendJson(response, 200, {
        user: publicUser(profileResult.rows[0]),
        team: publicSavedTeam(teamResult.rows[0]),
      });
    }

    const publicPlayerMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)$/i);
    if (publicPlayerMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const [profileResult, teamsResult] = await Promise.all([
        pool.query(
          `SELECT users.*,
                  COUNT(saved_teams.id) AS saved_team_count,
                  MAX(saved_teams.updated_at) AS last_team_updated_at
           FROM users
           LEFT JOIN saved_teams ON saved_teams.user_id = users.id
           WHERE users.id = $1
           GROUP BY users.id`,
          [publicPlayerMatch[1]],
        ),
        pool.query(
          `SELECT id, user_id, name, base_team_slug, roster, created_at, updated_at
           FROM saved_teams
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [publicPlayerMatch[1]],
        ),
      ]);
      if (!profileResult.rows[0]) return sendJson(response, 404, { error: "Player not found." });
      return sendJson(response, 200, {
        user: publicAdminUser(profileResult.rows[0]),
        teams: teamsResult.rows.map(publicSavedTeamSummary),
      });
    }

    if (url.pathname === "/api/season" && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/commit" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const body = await readJson(request);
      const teamId = String(body.teamId ?? "").trim();
      if (!teamId) return sendJson(response, 400, { error: "Team is required." });
      const season = await ensureActiveSeason();
      await commitSavedTeamToSeason(season.id, teamId, user.id);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/entries" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const teamId = String(body.teamId ?? "").trim();
      if (!teamId) return sendJson(response, 400, { error: "Team is required." });
      const season = await ensureActiveSeason();
      await commitSavedTeamToSeason(season.id, teamId);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    const seasonEntryMatch = url.pathname.match(/^\/api\/season\/admin\/entries\/([0-9a-f-]+)$/i);
    if (seasonEntryMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await pool.query(
        `DELETE FROM season_entries WHERE id = $1 AND season_id = $2`,
        [seasonEntryMatch[1], season.id],
      );
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/create-team" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const userId = String(body.userId ?? "").trim();
      const name = String(body.name ?? "").trim();
      const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
      const logoData = body.logoData ? String(body.logoData) : null;
      const roster = body.roster ?? {};

      if (!userId) return sendJson(response, 400, { error: "Coach is required." });
      if (!name) return sendJson(response, 400, { error: "Team name is required." });
      if (!baseTeamSlug) return sendJson(response, 400, { error: "Base team is required." });
      if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
        return sendJson(response, 400, { error: "Logo is too large." });
      }

      const coach = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
      if (!coach.rows[0]) return sendJson(response, 404, { error: "Coach not found." });

      const season = await ensureActiveSeason();
      const existingEntry = await pool.query(
        `SELECT id FROM season_entries WHERE season_id = $1 AND user_id = $2`,
        [season.id, userId],
      );
      if (existingEntry.rows[0]) {
        return sendJson(response, 409, { error: "This coach already has a committed team." });
      }

      const savedTeam = await pool.query(
        `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      await commitSavedTeamToSeason(season.id, savedTeam.rows[0].id);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/rounds/generate" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await generateSwissRound(season);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/rounds" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await createManualRound(season);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    const seasonRoundMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)$/i);
    if (seasonRoundMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await pool.query(`DELETE FROM season_rounds WHERE id = $1 AND season_id = $2`, [seasonRoundMatch[1], season.id]);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    const seasonRoundStartMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/start$/i);
    if (seasonRoundStartMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await startSeasonRound(season.id, seasonRoundStartMatch[1]);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    const seasonRoundPairingsMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/pairings$/i);
    if (seasonRoundPairingsMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const season = await ensureActiveSeason();
      await addSeasonPairing(season.id, seasonRoundPairingsMatch[1], body.homeEntryId, body.awayEntryId);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    const fixtureMatch = url.pathname.match(/^\/api\/season\/fixture\/([0-9a-f-]+)$/i);
    if (fixtureMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const season = await ensureActiveSeason();
      const body = await readJson(request);
      await updateSeasonPairing(season.id, fixtureMatch[1], { ...body, resultType: "played" }, false, user.id);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    const seasonPairingMatch = url.pathname.match(/^\/api\/season\/admin\/pairings\/([0-9a-f-]+)$/i);
    if (seasonPairingMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const season = await ensureActiveSeason();
      await updateSeasonPairing(season.id, seasonPairingMatch[1], body, true, user.id);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (seasonPairingMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await pool.query(
        `DELETE FROM season_pairings
         USING season_rounds
         WHERE season_pairings.id = $1
           AND season_pairings.round_id = season_rounds.id
           AND season_rounds.season_id = $2`,
        [seasonPairingMatch[1], season.id],
      );
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/teams" && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const result = await pool.query(
        `SELECT * FROM saved_teams WHERE user_id = $1 ORDER BY updated_at DESC`,
        [user.id],
      );
      return sendJson(response, 200, { teams: result.rows.map(publicSavedTeam) });
    }

    if (url.pathname === "/api/teams" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const body = await readJson(request);
      const name = String(body.name ?? "").trim();
      const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
      const logoData = body.logoData ? String(body.logoData) : null;
      const roster = body.roster ?? {};

      if (!name) return sendJson(response, 400, { error: "Team name is required." });
      if (!baseTeamSlug) return sendJson(response, 400, { error: "Base team is required." });
      if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
        return sendJson(response, 400, { error: "Logo is too large." });
      }

      const result = await pool.query(
        `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [user.id, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      return sendJson(response, 201, { team: publicSavedTeam(result.rows[0]) });
    }

    const teamMatch = url.pathname.match(/^\/api\/teams\/([0-9a-f-]+)$/i);
    if (teamMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const result = await pool.query(
        `SELECT * FROM saved_teams WHERE id = $1 AND user_id = $2`,
        [teamMatch[1], user.id],
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      return sendJson(response, 200, { team: publicSavedTeam(result.rows[0]) });
    }

    if (teamMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const body = await readJson(request);
      const name = String(body.name ?? "").trim();
      const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
      const logoData = body.logoData ? String(body.logoData) : null;
      const roster = body.roster ?? {};

      if (!name) return sendJson(response, 400, { error: "Team name is required." });
      if (!baseTeamSlug) return sendJson(response, 400, { error: "Base team is required." });
      if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
        return sendJson(response, 400, { error: "Logo is too large." });
      }

      const result = await pool.query(
        `UPDATE saved_teams
         SET name = $3,
             base_team_slug = $4,
             logo_data = $5,
             roster = $6,
             updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [teamMatch[1], user.id, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      return sendJson(response, 200, { team: publicSavedTeam(result.rows[0]) });
    }

    if (teamMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      await pool.query(`DELETE FROM saved_teams WHERE id = $1 AND user_id = $2`, [teamMatch[1], user.id]);
      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) {
      console.error(error);
    }
    return sendJson(response, status, { error: status >= 500 ? "Server error." : error.message });
  }
}

function resolveStaticPath(url) {
  const cleanPath = decodeURIComponent(url.pathname);
  const target = cleanPath === "/" ? "index.html" : cleanPath.slice(1);
  const fullPath = path.resolve(rootDir, target);
  return fullPath.startsWith(rootDir) ? fullPath : null;
}

function cacheControlForStatic(url, fullPath) {
  const pathname = url.pathname;
  const extension = path.extname(fullPath);
  if (extension === ".html" || pathname === "/" || pathname === "/index.html") {
    return "no-cache";
  }
  if (url.searchParams.has("v") || pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/public/data") || pathname.startsWith("/src/i18n/")) {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }
  return "public, max-age=86400";
}

async function handleStatic(request, response, url) {
  const fullPath = resolveStaticPath(url);
  if (!fullPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(fullPath);
    writeResponse(request, response, 200, body, {
      "Content-Type": mimeTypes.get(path.extname(fullPath)) || "application/octet-stream",
      "Cache-Control": cacheControlForStatic(url, fullPath),
    });
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

await waitForDatabase();
await ensureSchema();
await ensureAdmin();

const server = http.createServer(async (request, response) => {
  response.__request = request;
  const url = new URL(request.url || "/", `http://localhost:${appPort}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }
  await handleStatic(request, response, url);
});

server.listen(appPort, () => {
  startupLog(`Gata League site and API are running at http://localhost:${appPort}`);
});

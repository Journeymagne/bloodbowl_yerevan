/**
 * What a rehearsal proves: the 3.0 migrations only added, and changed nothing
 * that was there.
 *
 * A snapshot is taken before and after migrating, in one read-only transaction.
 * "Nothing that was there changed" is checked exactly: for every column of every
 * table but sessions and the migration log, a hash of the whole column in primary
 * key order. A migration may add columns and tables, so those only get a note;
 * a column that is gone or whose hash moved is a problem.
 *
 * The rest is for reading the report: a team is its roster's hash and its
 * revision, the season is a hash of its results, and row counts name what was
 * deleted. Sessions are moved by every login (a note), and the migration log is
 * compared by name. The stored stage must match the rule: active if a team is
 * entered or has a played match, draft otherwise. What a migration should have
 * produced (stages, fallen players, empty preferences) and what is still open (a
 * match half-way through) go in the report for a person to read.
 */
const LIST = (rows) => rows.map((row) => ({ id: row.id, matchKind: row.match_kind }));

// The migration log grows by one row per migration; compareSnapshots checks it by name.
// Sessions grows with every login, so its change is a note, not a problem. Neither
// is hashed column by column.
const MIGRATION_LOG = "schema_migrations";
const SESSIONS = "sessions";

const quote = (name) => `"${name.replace(/"/g, '""')}"`;

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
    [table, column],
  );
  return rows.length > 0;
}

async function baseTables(client) {
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return rows.map((row) => row.table_name);
}

async function tableCounts(client, tables) {
  const counts = {};
  for (const name of tables) {
    counts[name] = (await client.query(`SELECT count(*)::int AS n FROM ${quote(name)}`)).rows[0].n;
  }
  return counts;
}

async function primaryKey(client, table) {
  const { rows } = await client.query(
    `SELECT kcu.column_name FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

/**
 * The hash of one column: its values as JSON text, joined in key order.
 *
 * to_jsonb keeps every value apart from its neighbours (concat_ws drops a NULL
 * and shifts the rest: 3/NULL and NULL/3 would hash alike). A SQL NULL is tagged
 * NULL, which no JSON text is, so it differs from a jsonb null. Every table in
 * migrations 001–008 has a primary key; for one without, the rows are ordered by
 * the column's own value instead, which still catches any change to the values
 * but not a swap between rows.
 */
export function columnHashSql(table, column, keyColumns) {
  const value = `to_jsonb(t.${quote(column)})::text`;
  const order = keyColumns.length ? keyColumns.map((key) => `t.${quote(key)}`).join(", ") : value;
  return `SELECT md5(coalesce(string_agg(coalesce(${value}, 'NULL'), ',' ORDER BY ${order}), '')) AS h FROM ${quote(table)} t`;
}

async function columnHashes(client, tables) {
  const { rows } = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position",
  );
  const hashes = {};
  for (const table of tables.filter((name) => name !== MIGRATION_LOG && name !== SESSIONS)) {
    const keys = await primaryKey(client, table);
    hashes[table] = {};
    for (const { column_name: column } of rows.filter((row) => row.table_name === table)) {
      hashes[table][column] = (await client.query(columnHashSql(table, column, keys))).rows[0].h;
    }
  }
  return hashes;
}

async function seasonHashes(client) {
  const pairings = await client.query(`
    SELECT md5(coalesce(string_agg(concat_ws('|', id, home_touchdowns, away_touchdowns, home_casualties, away_casualties,
      result_type, home_points, away_points, result_status, confirmed_at), ',' ORDER BY id), '')) AS hash FROM season_pairings`);
  const entries = await client.query(`
    SELECT md5(coalesce(string_agg(concat_ws('|', id, season_id, user_id, saved_team_id, withdrawn_at), ',' ORDER BY id), '')) AS hash FROM season_entries`);
  return { pairings: pairings.rows[0].hash, entries: entries.rows[0].hash };
}

async function openStates(client) {
  const applied = "EXISTS (SELECT 1 FROM match_post_applications a WHERE a.pairing_id = p.id)";
  const preparing = await client.query(`SELECT p.id, p.match_kind FROM season_pairings p
    WHERE p.preparation_status NOT IN ('not_started', 'in_progress') AND p.result_status IS DISTINCT FROM 'confirmed' ORDER BY p.id`);
  // Started and not applied, and either a post-match draft exists or the result
  // is still open: an old match whose score was confirmed the quick way, with no
  // post-match ever begun, is history rather than a match in flight.
  const started = await client.query(`SELECT p.id, p.match_kind FROM season_pairings p
    WHERE p.preparation_status = 'in_progress' AND NOT ${applied}
      AND (EXISTS (SELECT 1 FROM match_post_games g WHERE g.pairing_id = p.id) OR p.result_status IS DISTINCT FROM 'confirmed')
    ORDER BY p.id`);
  const awaiting = await client.query(`SELECT p.id, p.match_kind FROM season_pairings p
    WHERE p.result_status = 'awaiting_confirmation' ORDER BY p.id`);
  const challenges = await client.query("SELECT count(*)::int AS n FROM friendly_challenges WHERE status = 'pending'");
  return {
    preparing: LIST(preparing.rows),
    startedWithoutPost: LIST(started.rows),
    awaitingConfirmation: LIST(awaiting.rows),
    pendingChallenges: challenges.rows[0].n,
  };
}

async function stages(client) {
  if (!(await columnExists(client, "saved_teams", "stage"))) return null;
  const { rows } = await client.query(`
    SELECT t.id, t.name, t.stage,
      EXISTS (SELECT 1 FROM season_entries e JOIN seasons s ON s.id = e.season_id
              WHERE e.saved_team_id = t.id AND e.withdrawn_at IS NULL AND s.status = 'active') AS entered,
      (EXISTS (SELECT 1 FROM match_post_applications a WHERE a.saved_team_id = t.id)
       OR EXISTS (SELECT 1 FROM season_pairings p
                  LEFT JOIN season_entries he ON he.id = p.home_entry_id
                  LEFT JOIN season_entries ae ON ae.id = p.away_entry_id
                  WHERE p.result_status = 'confirmed'
                    AND t.id IN (he.saved_team_id, ae.saved_team_id, p.friendly_home_team_id, p.friendly_away_team_id))) AS played_match
    FROM saved_teams t ORDER BY t.stage, t.name`);
  return rows.map((row) => ({ id: row.id, name: row.name, stage: row.stage, entered: row.entered, playedMatch: row.played_match }));
}

async function collect(client) {
  const tables = await baseTables(client);
  const teams = {};
  for (const row of (await client.query("SELECT id, name, revision, md5(roster::text) AS roster FROM saved_teams ORDER BY id")).rows) {
    teams[row.id] = { name: row.name, revision: Number(row.revision), roster: row.roster };
  }
  const fallenExists = (await client.query("SELECT to_regclass('public.team_fallen_players') IS NOT NULL AS ok")).rows[0].ok;
  const fallen = fallenExists
    ? Object.fromEntries((await client.query("SELECT saved_team_id, count(*)::int AS n FROM team_fallen_players GROUP BY 1")).rows.map((row) => [row.saved_team_id, row.n]))
    : null;
  return {
    takenAt: new Date().toISOString(),
    migrations: (await client.query("SELECT name FROM schema_migrations ORDER BY name")).rows.map((row) => row.name),
    tables: await tableCounts(client, tables),
    columns: await columnHashes(client, tables),
    teams,
    season: await seasonHashes(client),
    open: await openStates(client),
    stages: await stages(client),
    preferencesSet: (await columnExists(client, "users", "preferences"))
      ? (await client.query("SELECT count(*)::int AS n FROM users WHERE preferences <> '{}'::jsonb")).rows[0].n
      : null,
    fallen,
  };
}

// One transaction at one point in time: the counts, the hashes and the semantic
// reads must describe the same database, even if the server is started on it.
export async function takeSnapshot(client) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const snapshot = await collect(client);
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

function compareTables(before, after, problems, notes) {
  for (const [name, count] of Object.entries(before.tables)) {
    if (name === MIGRATION_LOG || after.tables[name] === count) continue;
    if (!(name in after.tables)) problems.push(`table ${name} is gone`);
    else if (name === SESSIONS) notes.push(`sessions: ${count} rows before, ${after.tables[name]} after (logins between snapshots)`);
    else problems.push(`table ${name}: ${count} rows before, ${after.tables[name]} after`);
  }
  for (const name of Object.keys(after.tables)) {
    if (name !== MIGRATION_LOG && !(name in before.tables)) notes.push(`new table ${name}: ${after.tables[name]} rows`);
  }
}

function compareTeams(before, after, problems) {
  for (const [id, team] of Object.entries(before.teams)) {
    const now = after.teams[id];
    if (!now) problems.push(`team ${team.name} (${id}) is gone`);
    else if (now.roster !== team.roster) problems.push(`team ${team.name}: roster changed`);
    else if (now.revision !== team.revision) problems.push(`team ${team.name}: revision ${team.revision} → ${now.revision}`);
  }
}

// Migrations only add (spec 3.0 §0.13): whatever a column held before, it holds now.
function compareColumns(before, after, problems, notes) {
  if (!before.columns || !after.columns) {
    problems.push("a snapshot has no column hashes — take both with this version of rehearsal:check (--before, migrate, --after)");
    return;
  }
  for (const [table, hashes] of Object.entries(before.columns)) {
    const now = after.columns[table] ?? {};
    for (const [column, hash] of Object.entries(hashes)) {
      if (!(column in now)) problems.push(`column ${table}.${column} is gone`);
      else if (now[column] !== hash) problems.push(`column ${table}.${column} changed`);
    }
  }
  for (const [table, hashes] of Object.entries(after.columns)) {
    const added = Object.keys(hashes).filter((column) => !(column in (before.columns[table] ?? {})));
    if (added.length) notes.push(`new columns in ${table}: ${added.join(", ")}`);
  }
}

export function compareSnapshots(before, after) {
  const problems = [];
  const notes = [];
  compareTables(before, after, problems, notes);
  compareColumns(before, after, problems, notes);
  compareTeams(before, after, problems);
  if (before.season.pairings !== after.season.pairings) problems.push("season_pairings results changed");
  if (before.season.entries !== after.season.entries) problems.push("season_entries changed");
  if (JSON.stringify(before.open) !== JSON.stringify(after.open)) problems.push("open states changed between the snapshots");
  for (const name of before.migrations.filter((migration) => !after.migrations.includes(migration))) {
    problems.push(`migration ${name} is gone`);
  }
  const added = after.migrations.filter((name) => !before.migrations.includes(name));
  if (added.length) notes.push(`migrations applied: ${added.join(", ")}`);
  else notes.push("no migrations were applied between the snapshots");
  for (const row of after.stages ?? []) {
    if (!["draft", "active"].includes(row.stage)) problems.push(`team ${row.name}: unexpected stage ${row.stage}`);
    const expected = row.entered || row.playedMatch ? "active" : "draft";
    if (row.stage !== expected) problems.push(`team ${row.name}: stage ${row.stage}, expected ${expected} (${reason(row)})`);
  }
  if (after.preferencesSet) problems.push(`${after.preferencesSet} users already have preferences set`);
  return { problems, notes };
}

function reason(row) {
  return [row.entered && "entered in the current season", row.playedMatch && "has a played match"].filter(Boolean).join(", ") || "no entry, no match";
}

export function renderReport(before, after, { problems, notes }) {
  const names = Object.fromEntries(Object.entries(after.teams).map(([id, team]) => [id, team.name]));
  const lines = [
    `# Rehearsal report — ${after.takenAt}`,
    "",
    problems.length ? `**${problems.length} problem(s)**` : "**OK** — no existing data changed",
    "",
    ...problems.map((problem) => `- ✗ ${problem}`),
    ...notes.map((note) => `- ${note}`),
    "",
    "## Stages",
    "",
    ...(after.stages ? after.stages.map((row) => `- ${row.name} — ${row.stage} — ${reason(row)}`) : ["- (no stage column yet)"]),
    "",
    "## Fallen players carried over",
    "",
    ...(after.fallen ? Object.entries(after.fallen).map(([id, count]) => `- ${names[id] ?? id}: ${count}`) : ["- (no fallen table yet)"]),
    "",
    "## Open states",
    "",
    `- preparing (pre-match begun, match not started): ${after.open.preparing.map((row) => `${row.id} (${row.matchKind})`).join(", ") || "none"}`,
    `- started, post-match not finished: ${after.open.startedWithoutPost.map((row) => `${row.id} (${row.matchKind})`).join(", ") || "none"}`,
    `- result awaiting confirmation: ${after.open.awaitingConfirmation.map((row) => `${row.id} (${row.matchKind})`).join(", ") || "none"}`,
    `- pending friendly challenges: ${after.open.pendingChallenges}`,
    "",
    `Before: ${before.takenAt}, ${before.migrations.length} migrations. After: ${after.migrations.length} migrations.`,
  ];
  return `${lines.join("\n")}\n`;
}

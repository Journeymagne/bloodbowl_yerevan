/**
 * What a rehearsal proves: the 3.0 migrations added and changed nothing else.
 *
 * A snapshot is taken before and after migrating. Existing data is compared by
 * what it means rather than by whole rows: a migration adds columns to
 * saved_teams, so a team is its roster's hash and its revision, and the season
 * is a hash of its results. Row counts catch anything deleted. What a migration
 * should have produced (stages, fallen players, empty preferences) and what is
 * still open (a match half-way through) go in the report for a person to read.
 */
const LIST = (rows) => rows.map((row) => ({ id: row.id, matchKind: row.match_kind }));

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
    [table, column],
  );
  return rows.length > 0;
}

async function tableCounts(client) {
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const counts = {};
  for (const { table_name: name } of rows) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    counts[name] = (await client.query(`SELECT count(*)::int AS n FROM ${quoted}`)).rows[0].n;
  }
  return counts;
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

export async function takeSnapshot(client) {
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
    tables: await tableCounts(client),
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

function compareTables(before, after, problems, notes) {
  for (const [name, count] of Object.entries(before.tables)) {
    if (!(name in after.tables)) problems.push(`table ${name} is gone`);
    else if (after.tables[name] !== count) problems.push(`table ${name}: ${count} rows before, ${after.tables[name]} after`);
  }
  for (const name of Object.keys(after.tables)) {
    if (!(name in before.tables)) notes.push(`new table ${name}: ${after.tables[name]} rows`);
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

export function compareSnapshots(before, after) {
  const problems = [];
  const notes = [];
  compareTables(before, after, problems, notes);
  compareTeams(before, after, problems);
  if (before.season.pairings !== after.season.pairings) problems.push("season_pairings results changed");
  if (before.season.entries !== after.season.entries) problems.push("season_entries changed");
  const added = after.migrations.filter((name) => !before.migrations.includes(name));
  if (added.length) notes.push(`migrations applied: ${added.join(", ")}`);
  for (const row of after.stages ?? []) {
    if (!["draft", "active"].includes(row.stage)) problems.push(`team ${row.name}: unexpected stage ${row.stage}`);
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

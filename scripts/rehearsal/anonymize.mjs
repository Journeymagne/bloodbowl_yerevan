/**
 * Strip a restored production dump of what is private before anyone uses it.
 *
 * What goes: password hashes (every account gets the rehearsal password, so
 * a rehearsal can sign in as any coach), Telegram contacts, and sessions.
 * What stays: logins, teams, rosters and results — the league already shows
 * those to anybody on the public site, and they are what a rehearsal tests.
 *
 * One transaction: a half-anonymized database is worse than none. The marker
 * (scripts/rehearsal/marker.mjs) is written inside it, as its last statement,
 * so the database carries the marker exactly when the anonymization committed.
 */
import { hashPassword } from "../../server/auth/session.mjs";
import { REHEARSAL_DATABASE } from "./guard.mjs";

// COMMENT is a utility statement: it takes no parameters, so the text is quoted
// here. Doubling the quote is enough while standard_conforming_strings is on,
// which it is by default and in the postgres:16 image.
const literal = (text) => `'${text.replace(/'/g, "''")}'`;

export async function anonymizeRehearsalDatabase(client, password, hash = hashPassword, { marker } = {}) {
  if (!password) throw new Error("rehearsal: set REHEARSAL_PASSWORD in .env before restoring a dump");
  const passwordHash = hash(password);
  await client.query("BEGIN");
  try {
    const users = await client.query(
      `UPDATE users SET password_hash = $1, telegram = '@coach_' || ranked.position
       FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position FROM users) AS ranked
       WHERE users.id = ranked.id`,
      [passwordHash],
    );
    const sessions = await client.query("DELETE FROM sessions");
    if (marker) await client.query(`COMMENT ON DATABASE ${REHEARSAL_DATABASE} IS ${literal(marker)}`);
    await client.query("COMMIT");
    return { users: users.rowCount, sessions: sessions.rowCount, hash: passwordHash };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/**
 * Read the committed result back: every user has the hash and a coach handle,
 * and no session is left. The restore drops the database when this fails.
 */
export async function verifyAnonymized(client, hash) {
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE password_hash <> $1 OR telegram !~ '^@coach_[0-9]+$')::int AS bad,
            (SELECT count(*)::int FROM sessions) AS sessions
     FROM users`,
    [hash],
  );
  const { bad, sessions } = rows[0];
  if (bad !== 0 || sessions !== 0) {
    throw new Error(`anonymization check failed (${bad} users not anonymized, ${sessions} sessions left)`);
  }
}

/**
 * Strip a restored production dump of what is private before anyone uses it.
 *
 * What goes: password hashes (every account gets the rehearsal password, so
 * a rehearsal can sign in as any coach), Telegram contacts, and sessions.
 * What stays: logins, teams, rosters and results — the league already shows
 * those to anybody on the public site, and they are what a rehearsal tests.
 *
 * One transaction: a half-anonymized database is worse than none.
 */
import { hashPassword } from "../../server/auth/session.mjs";

export async function anonymizeRehearsalDatabase(client, password, hash = hashPassword) {
  if (!password) throw new Error("rehearsal: set REHEARSAL_PASSWORD in .env before restoring a dump");
  await client.query("BEGIN");
  try {
    const users = await client.query(
      `UPDATE users SET password_hash = $1, telegram = '@coach_' || ranked.position
       FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position FROM users) AS ranked
       WHERE users.id = ranked.id`,
      [hash(password)],
    );
    const sessions = await client.query("DELETE FROM sessions");
    await client.query("COMMIT");
    return { users: users.rowCount, sessions: sessions.rowCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

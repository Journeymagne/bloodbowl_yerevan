/** Create a coach, their starter team and their season entry together. */
import { pool } from "../db/pool.mjs";
import { httpError } from "../http/responses.mjs";
import { hashPassword } from "../auth/session.mjs";
import { normalizeLogin, serializeRosterForStorage } from "../api/serializers.mjs";

/** The team has already passed readTeamBody's roster validation. */
export async function createSeasonCoachWithTeam(seasonId, data, database = pool) {
  const login = String(data.login ?? "").trim();
  const password = String(data.password ?? "");
  const telegram = String(data.telegram ?? "").trim();
  if (login.length < 3) throw httpError(400, "LOGIN_TOO_SHORT");
  if (password.length < 4) throw httpError(400, "PASSWORD_TOO_SHORT");
  if (!telegram) throw httpError(400, "TELEGRAM_REQUIRED");

  const passwordHash = hashPassword(password);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const coach = await client.query(
      `INSERT INTO users (login, login_key, telegram, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [login, normalizeLogin(login), telegram, passwordHash],
    ).catch((error) => {
      if (error.code === "23505") throw httpError(409, "LOGIN_ALREADY_REGISTERED");
      throw error;
    });
    const team = await client.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [coach.rows[0].id, data.name, data.baseTeamSlug, data.logoData, serializeRosterForStorage(data.roster)],
    );
    const entry = await client.query(
      `INSERT INTO season_entries (season_id, user_id, saved_team_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [seasonId, coach.rows[0].id, team.rows[0].id],
    );
    await client.query("COMMIT");
    return entry.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

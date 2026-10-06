import { pool } from "../db/pool.mjs";
import { httpError } from "../http/errors.mjs";
import { publicSavedTeamSlim } from "../api/serializers.mjs";

export function challengeId(value) {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw httpError(400, "CHALLENGE_SELECTION_REQUIRED");
  return id;
}

export async function listChallenges(userId) {
  const [challenges, teams, opponents] = await Promise.all([
    pool.query(`SELECT c.*, su.login AS sender_login, ru.login AS recipient_login, t.name AS sender_team_name
      FROM friendly_challenges c JOIN users su ON su.id=c.sender_id JOIN users ru ON ru.id=c.recipient_id
      JOIN saved_teams t ON t.id=c.sender_team_id WHERE c.sender_id=$1 OR c.recipient_id=$1 ORDER BY c.created_at DESC LIMIT 100`, [userId]),
    pool.query("SELECT id,name,base_team_slug,created_at,updated_at FROM saved_teams WHERE user_id=$1 ORDER BY updated_at DESC", [userId]),
    pool.query(`SELECT u.id,u.login FROM users u WHERE u.id<>$1
      AND EXISTS (SELECT 1 FROM saved_teams t WHERE t.user_id=u.id) ORDER BY u.login_key`, [userId]),
  ]);
  return { challenges: challenges.rows.map(row => ({ id: row.id, sender: { id: row.sender_id, login: row.sender_login },
    recipient: { id: row.recipient_id, login: row.recipient_login }, team: { id: row.sender_team_id, name: row.sender_team_name },
    status: row.status, gameId: row.pairing_id, createdAt: row.created_at, updatedAt: row.updated_at })),
    teams: teams.rows.map(publicSavedTeamSlim), opponents: opponents.rows };
}

async function ownedTeam(client, teamId, userId) {
  const team = (await client.query("SELECT id FROM saved_teams WHERE id=$1 AND user_id=$2 FOR UPDATE", [challengeId(teamId), userId])).rows[0];
  if (!team) throw httpError(404, "TEAM_NOT_FOUND");
  return team.id;
}

export async function createChallenge(userId, body) {
  const recipientId = challengeId(body?.opponentId);
  if (recipientId === userId) throw httpError(400, "CHALLENGE_SELF");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const teamId = await ownedTeam(client, body?.teamId, userId);
    const recipient = await client.query("SELECT id FROM users WHERE id=$1 AND EXISTS (SELECT 1 FROM saved_teams WHERE user_id=$1)", [recipientId]);
    if (!recipient.rows[0]) throw httpError(404, "CHALLENGE_OPPONENT_UNAVAILABLE");
    const row = (await client.query(`INSERT INTO friendly_challenges(sender_id,recipient_id,sender_team_id) VALUES ($1,$2,$3)
      ON CONFLICT (sender_id,recipient_id,sender_team_id) WHERE status='pending' DO NOTHING RETURNING id`, [userId, recipientId, teamId])).rows[0];
    if (!row) throw httpError(409, "CHALLENGE_ALREADY_SENT");
    await client.query("COMMIT"); return { id: row.id };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

export function checkChallengeAction(challenge, userId, action) {
  const allowed = action === "cancel" ? challenge.sender_id : challenge.recipient_id;
  if (!["accept", "decline", "cancel"].includes(action)) throw httpError(400, "CHALLENGE_ACTION");
  if (allowed !== userId) throw httpError(403, "CHALLENGE_NOT_YOURS");
  if (challenge.status === "accepted" && action === "accept") return challenge.pairing_id;
  if (challenge.status !== "pending") throw httpError(409, "CHALLENGE_CLOSED");
  return null;
}

export async function respondToChallenge(id, userId, action, body = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const challenge = (await client.query("SELECT * FROM friendly_challenges WHERE id=$1 FOR UPDATE", [challengeId(id)])).rows[0];
    if (!challenge) throw httpError(404, "CHALLENGE_NOT_FOUND");
    let gameId = checkChallengeAction(challenge, userId, action);
    if (!gameId) {
      if (action === "accept") gameId = await acceptChallenge(client, challenge, body?.teamId);
      const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
      await client.query("UPDATE friendly_challenges SET status=$2,pairing_id=$3,updated_at=now() WHERE id=$1", [id, status, gameId]);
    }
    await client.query("COMMIT"); return { gameId };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

async function acceptChallenge(client, challenge, teamId) {
  // Lock both source teams in deterministic order, as match start does.
  const ids = [challenge.sender_team_id, challengeId(teamId)].sort();
  await client.query("SELECT id FROM saved_teams WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
  await ownedTeam(client, challenge.sender_team_id, challenge.sender_id);
  const recipientTeam = await ownedTeam(client, teamId, challenge.recipient_id);
  const row = (await client.query(`INSERT INTO season_pairings(match_kind,round_id,table_number,
    friendly_home_user_id,friendly_away_user_id,friendly_home_team_id,friendly_away_team_id)
    VALUES ('friendly',NULL,1,$1,$2,$3,$4) RETURNING id`,
  [challenge.sender_id, challenge.recipient_id, challenge.sender_team_id, recipientTeam])).rows[0];
  return row.id;
}

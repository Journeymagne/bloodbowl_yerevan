import { httpError } from '../http/errors.mjs';
import { sameCasualty } from '../../src/domain/getting-even.mjs';

export function publicGettingEven(row) {
  if (!row) return null;
  return { id: row.id, injuryEventId: row.injury_event_id, playerId: row.player_id,
    injury: row.injury, roll: row.roll, source: row.source, attacker: row.attacker, keyword: row.keyword };
}

/** A draft's D6 belongs to this player in this match, never to another injury or coach. */
export async function bindGettingEven(client, event, decisionId = null) {
  if (event.counter !== 'injury' || event.delta !== 1 || !event.pairing_id) return null;
  if (!decisionId) {
    const draft = (await client.query(`SELECT * FROM match_getting_even WHERE pairing_id=$1 AND saved_team_id=$2
      AND player_id=$3 AND injury_event_id IS NULL FOR UPDATE`, [event.pairing_id, event.saved_team_id, event.player_id])).rows[0];
    if (draft && sameCasualty(draft.injury, event.injury)) decisionId = draft.id;
  }
  if (decisionId) {
    const row = (await client.query('SELECT * FROM match_getting_even WHERE id=$1 FOR UPDATE', [decisionId])).rows[0];
    if (!row || row.pairing_id !== event.pairing_id || row.saved_team_id !== event.saved_team_id
      || row.player_id !== event.player_id || (row.injury_event_id && row.injury_event_id !== event.id)
      || !sameCasualty(row.injury, event.injury)) throw httpError(409, 'GETTING_EVEN_CHANGED');
    return (await client.query(`UPDATE match_getting_even SET injury_event_id=$2, updated_at=clock_timestamp()
      WHERE id=$1 RETURNING *`, [decisionId, event.id])).rows[0];
  }
  return (await client.query(`INSERT INTO match_getting_even(pairing_id,saved_team_id,player_id,injury_event_id,injury,created_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(injury_event_id) DO UPDATE SET injury=EXCLUDED.injury RETURNING *`,
  [event.pairing_id, event.saved_team_id, event.player_id, event.id, JSON.stringify(event.injury), event.created_by])).rows[0];
}

/** Rolls live with their casualty decision, not in the advancement-only dice queue. */
export async function getDecision(client, { pairingId, teamId, playerId, eventId, injury, userId }) {
  const row = (await client.query(`SELECT * FROM match_getting_even WHERE pairing_id=$1 AND saved_team_id=$2
    AND player_id=$3 AND injury_event_id IS NOT DISTINCT FROM $4::uuid FOR UPDATE`, [pairingId, teamId, playerId, eventId])).rows[0];
  if (row) return row;
  return (await client.query(`INSERT INTO match_getting_even(pairing_id,saved_team_id,player_id,injury_event_id,injury,created_by)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [pairingId, teamId, playerId, eventId, JSON.stringify(injury), userId])).rows[0];
}

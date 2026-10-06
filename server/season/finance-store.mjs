/** These writes run only inside the locked start/finish transaction, never for a draft. */
import { httpError } from '../http/errors.mjs';
import { sealPlayerPurchases } from '../../src/domain/roster/transfers.mjs';

export async function applyPreMatchTreasury(client, pairingId, name, snapshot) {
  const team = snapshot.team, budget = snapshot.budget;
  await client.query(`INSERT INTO match_treasury_spends (pairing_id,side,saved_team_id,amount)
    VALUES ($1,$2,$3,$4)`, [pairingId, name, team.id, budget.treasuryUsed]);
  const players = sealPlayerPurchases(team.roster.players || []);
  const saved = await client.query(`UPDATE saved_teams SET roster=jsonb_set(jsonb_set(roster,'{treasury}',to_jsonb($2::numeric)),'{players}',$4::jsonb),
    revision=revision+1, updated_at=now() WHERE id=$1 AND revision=$3 RETURNING id`,
  [team.id, budget.treasuryAfter, team.revision, JSON.stringify(players)]);
  if (!saved.rows[0]) throw httpError(409, 'MATCH_ROSTER_CHANGED');
}

export async function applyPostMatchRoster(client, pairingId, name, side, projection) {
  projection.roster.players = sealPlayerPurchases(projection.roster.players);
  await client.query(`INSERT INTO match_post_applications(pairing_id,side,saved_team_id,before_roster,after_roster)
    VALUES($1,$2,$3,$4,$5)`, [pairingId, name, side.team.id, JSON.stringify(side.baseRoster), JSON.stringify(projection.roster)]);
  const saved = await client.query(`UPDATE saved_teams SET roster=$2,revision=revision+1,updated_at=now()
    WHERE id=$1 AND revision=$3 RETURNING id`, [side.team.id, JSON.stringify(projection.roster), side.baseRevision]);
  if (!saved.rows[0]) throw httpError(409, 'POST_TEAM_CHANGED');
}

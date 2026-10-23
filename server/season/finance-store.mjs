/**
 * These writes run only inside the locked start/finish transaction, never for a draft.
 * The treasury ledger is written here too, in that same transaction and only once
 * the team's own write has gone through: a start or a finish that is refused leaves
 * no lines behind. The fallen of a finish follow the ledger on the same terms: a
 * finish that is refused records nobody.
 */
import { httpError } from '../http/errors.mjs';
import { writeLedgerEntries } from '../api/team-ledger.mjs';
import { sumMoney } from '../../src/domain/money.mjs';
import { postMatchLedgerEntries } from '../../src/domain/roster/ledger.mjs';
import { fallenPlayers } from '../../src/domain/post-match/roster.mjs';
import { sealPlayerPurchases } from '../../src/domain/roster/transfers.mjs';

export async function applyPreMatchTreasury(client, pairingId, name, snapshot, actorId = null) {
  const team = snapshot.team, budget = snapshot.budget;
  await client.query(`INSERT INTO match_treasury_spends (pairing_id,side,saved_team_id,amount)
    VALUES ($1,$2,$3,$4)`, [pairingId, name, team.id, budget.treasuryUsed]);
  const players = sealPlayerPurchases(team.roster.players || []);
  const saved = await client.query(`UPDATE saved_teams SET roster=jsonb_set(jsonb_set(roster,'{treasury}',to_jsonb($2::numeric)),'{players}',$4::jsonb),
    revision=revision+1, updated_at=now() WHERE id=$1 AND revision=$3 RETURNING id`,
  [team.id, budget.treasuryAfter, team.revision, JSON.stringify(players)]);
  if (!saved.rows[0]) throw httpError(409, 'MATCH_ROSTER_CHANGED');
  await writeLedgerEntries(client, { teamId: team.id, opening: sumMoney(budget.treasuryAfter, budget.treasuryUsed),
    entries: budget.treasuryUsed ? [{ kind: 'match_spend', delta: -budget.treasuryUsed }] : [], pairingId, actorId });
}

export async function applyPostMatchRoster(client, pairingId, name, side, projection, actorId = null) {
  projection.roster.players = sealPlayerPurchases(projection.roster.players);
  await client.query(`INSERT INTO match_post_applications(pairing_id,side,saved_team_id,before_roster,after_roster)
    VALUES($1,$2,$3,$4,$5)`, [pairingId, name, side.team.id, JSON.stringify(side.baseRoster), JSON.stringify(projection.roster)]);
  const saved = await client.query(`UPDATE saved_teams SET roster=$2,revision=revision+1,updated_at=now()
    WHERE id=$1 AND revision=$3 RETURNING id`, [side.team.id, JSON.stringify(projection.roster), side.baseRevision]);
  if (!saved.rows[0]) throw httpError(409, 'POST_TEAM_CHANGED');
  await writeLedgerEntries(client, { teamId: side.team.id, opening: side.baseRoster.treasury,
    entries: postMatchLedgerEntries(projection.accounting), pairingId, actorId });
  // The dead are the same players, by the same rule, that migration 015 carries over from earlier
  // matches: the player as the roster held him before the match, rookie protection via effectiveInjury.
  for (const player of fallenPlayers(side)) {
    await client.query(`INSERT INTO team_fallen_players (saved_team_id, player, pairing_id, recorded_by, from_match) VALUES ($1, $2, $3, $4, true)`,
      [side.team.id, JSON.stringify(player), pairingId, actorId]);
  }
}

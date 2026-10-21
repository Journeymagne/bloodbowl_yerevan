/**
 * A live match on the server: the match a tap is written to, and the side it is written for.
 *
 * A tap takes the post-match's own locks in the post-match's own order — the pairing, both teams, the
 * post-match row — so it lands wholly before or wholly after a Players step or a finish; a side that no
 * longer follows the events refuses it, because the finish's difference would silently take it back.
 *
 * A match is live from its start (preparation `in_progress`, both match rosters saved) until its
 * post-match is completed — the runbook's «started, post-match open» (`LIVE_MATCH`): a started match whose
 * score was confirmed around the post-match, as 2.x let both coaches or the admin do, is not live while it
 * has no post-match row, and is live again once its post-match is opened. A tap belongs to one team's side of it: to the coach whose team that is, a
 * pairing that is anything else — not there, not his, a bye, a match his team does not play, not on or
 * already over — is one answer, MATCH_NOT_LIVE (spec §3.7). Whose team it is was asked before
 * (`teamForUser`): a team that is not the coach's never gets this far.
 *
 * An edit outside a match is taken only while the team has a live match (`teamHasLiveMatch`), and holds
 * nothing but the team's own row: whether a match is on is read without a lock. A coach's write of the team
 * itself is refused for exactly that while, on the same terms (`refuseWhilePlaying`).
 */
import { httpError } from "../http/errors.mjs";
import { loadPreparationFixture, loadPreparationSources } from "./preparation-store.mjs";
import { SIDES } from "../../src/domain/match/rules.mjs";
import { sideFollowsEvents } from "../../src/domain/post-match/events.mjs";

// What the fixture loader answers the pre-match screens with — no such pairing, not your pairing, a bye —
// says to a tap only that there is no match of this team to write it to.
const NO_MATCH_OF_YOURS = new Set(["GAME_NOT_FOUND", "FIXTURE_NOT_YOURS", "BYE_NEEDS_NO_CONFIRMATION"]);

const notLive = () => httpError(409, "MATCH_NOT_LIVE");

/**
 * A match is on, as the rollout's runbook counts «started, post-match open»: started (`in_progress`), its
 * post-match not completed, and either a post-match row to finish or a score nobody has confirmed. One
 * predicate for a tap and an edit outside a match: `p` is the pairing, `g` its `match_post_games` row joined
 * LEFT, none when the post-match was never opened.
 */
const LIVE_MATCH = `p.preparation_status = 'in_progress'
  AND (g.pairing_id IS NULL OR g.state->>'status' IS DISTINCT FROM 'completed')
  AND (g.pairing_id IS NOT NULL OR p.result_status IS DISTINCT FROM 'confirmed')`;

const TEAM_HAS_LIVE_MATCH = `
  SELECT EXISTS (
    SELECT 1
      FROM match_roster_snapshots s
      JOIN season_pairings p ON p.id = s.pairing_id
      LEFT JOIN match_post_games g ON g.pairing_id = s.pairing_id
     WHERE s.saved_team_id = $1 AND ${LIVE_MATCH}
  ) AS live`;

const PAIRING_IS_LIVE = `
  SELECT EXISTS (
    SELECT 1 FROM season_pairings p LEFT JOIN match_post_games g ON g.pairing_id = p.id WHERE p.id = $1 AND ${LIVE_MATCH}
  ) AS live`;

/** The pairing, locked (`FOR UPDATE OF p`), with the loader's refusals told as MATCH_NOT_LIVE. */
async function lockPairing(client, pairingId, user) {
  try {
    return await loadPreparationFixture(client, pairingId, user);
  } catch (error) {
    throw NO_MATCH_OF_YOURS.has(error.code) ? notLive() : error;
  }
}

/**
 * Holds the live match of `teamId` for one tap, and says which side the team plays and who is on it.
 *
 * Call it first on the client of the tap's transaction. The order is fixed, the post-match's own: the
 * pairing `FOR UPDATE OF p`, both teams `ORDER BY id FOR UPDATE`, then the post-match row, if there is one,
 * `FOR UPDATE`; no lock is taken before them. Whether the match is on is asked under them, of the rows they
 * hold (`LIVE_MATCH`, as `teamHasLiveMatch` asks it). Refused at any point, the transaction is to be rolled back.
 *
 * @param {{ query: Function }} client the client of the tap's transaction
 * @param {{ pairingId: string, teamId: string, user: { id: string } }} tap `pairingId` a UUID; `teamId` the
 *   team's id as the database holds it (the row `teamForUser` returned)
 * @returns {Promise<{ fixture: object, side: "home"|"away", snapshot: object }>} the pairing as the loader
 *   reads it, the team's side, and that side's match roster (`match_roster_snapshots`)
 * @throws 409 MATCH_NOT_LIVE when this is not the team's live match on the coach's own side; 409
 *   EVENT_SIDE_LOCKED when the side's post-match no longer follows the events
 */
export async function lockLiveSide(client, { pairingId, teamId, user }) {
  const fixture = await lockPairing(client, pairingId, user);
  // Both teams, locked as the post-match locks them; what the loader reads of them is not needed here.
  await loadPreparationSources(client, fixture);
  const side = SIDES.find((name) => fixture[`${name}_team_id`] === teamId);
  if (!side || fixture[`${side}_user_id`] !== user.id) throw notLive();
  const post = (await client.query("SELECT state FROM match_post_games WHERE pairing_id = $1 FOR UPDATE", [fixture.id])).rows[0];
  if (!(await client.query(PAIRING_IS_LIVE, [fixture.id])).rows[0].live) throw notLive();
  if (post && !sideFollowsEvents(post.state[side])) throw httpError(409, "EVENT_SIDE_LOCKED");
  const { rows } = await client.query("SELECT snapshot FROM match_roster_snapshots WHERE pairing_id = $1 AND side = $2",
    [fixture.id, side]);
  if (!rows[0]) throw notLive(); // started, the match has both rosters: without one it never started
  return { fixture, side, snapshot: rows[0].snapshot };
}

/**
 * True while a match of the team is live (`LIVE_MATCH`) with the team's own match roster in it (a snapshot
 * of the team).
 *
 * A plain read that locks nothing. An edit outside a match asks it holding the team's row, and must not
 * then wait on the pairing: a tap holds the pairing and waits on the team, and each would wait on the
 * other. The row is enough against the finish, which ends a match: it takes that row too, so an edit
 * lands wholly before it, and is carried in, or wholly after it, and is told the match is over.
 *
 * @param {{ query: Function }} db the client of the edit's transaction, or a pool
 * @param {string} teamId the team's id as the database holds it
 * @returns {Promise<boolean>}
 */
export async function teamHasLiveMatch(db, teamId) {
  return (await db.query(TEAM_HAS_LIVE_MATCH, [teamId])).rows[0].live;
}

/**
 * Refuses a coach's write of a team while the team plays a match (stage 09a): 422 TEAM_IN_MATCH. The team — its
 * roster, name and logo, treasury, deaths, site rolls — changes again once the post-match is completed; until then the
 * match's own record (taps, edits outside it) is the way in. An administrator's repair is the administration's route
 * (`PATCH /api/admin/teams/:id`, whose caller leaves this out); the coach's routes refuse an administrator alike.
 *
 * The round is not asked (the Task 1 review, M-1): a match left in its post-match after its round was closed keeps the
 * team in it, as the client's `isMatchLive` and the taps read it. The post-match is not closed by the round, the card
 * leads to it, and finishing it is what frees the team.
 *
 * Call it inside the write's transaction, which already holds the team's row `FOR UPDATE`, after the revision is
 * compared (a stale tab still hears TEAM_SAVED_ELSEWHERE with the team). So a start (the pairing, then both teams) and
 * the write are put in one order: the write first — it lands before the match, and a roster it changed has another
 * revision for the start to see (MATCH_ROSTER_CHANGED); the start first — the write sees the match on. The finish takes
 * the same row: a write before it is refused, one after it lands.
 *
 * @param {{ query: Function }} db the client of the write's transaction
 * @param {string} teamId the team's id as the database holds it
 * @returns {Promise<void>}
 * @throws 422 TEAM_IN_MATCH while `teamHasLiveMatch`
 */
export async function refuseWhilePlaying(db, teamId) {
  if (await teamHasLiveMatch(db, teamId)) throw httpError(422, "TEAM_IN_MATCH");
}

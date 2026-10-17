/**
 * A live match on the server: the match a tap is written to, and the side it is written for.
 *
 * A tap takes the post-match's own locks in the post-match's own order — the pairing, both teams, the
 * post-match row — so it lands wholly before or wholly after a Players step or a finish; a side that no
 * longer follows the events refuses it, because the finish's difference would silently take it back.
 *
 * A match is live from its start (preparation `in_progress`, both match rosters saved) until its
 * post-match is completed. A tap belongs to one team's side of it: to the coach whose team that is, a
 * pairing that is anything else — not there, not his, a bye, a match his team does not play, not on or
 * already over — is one answer, MATCH_NOT_LIVE (spec §3.7). Whose team it is was asked before
 * (`teamForUser`): a team that is not the coach's never gets this far.
 */
import { httpError } from "../http/errors.mjs";
import { loadPreparationFixture, loadPreparationSources } from "./preparation-store.mjs";
import { SIDES } from "../../src/domain/match/rules.mjs";
import { sideFollowsEvents } from "../../src/domain/post-match/events.mjs";

// What the fixture loader answers the pre-match screens with — no such pairing, not your pairing, a bye —
// says to a tap only that there is no match of this team to write it to.
const NO_MATCH_OF_YOURS = new Set(["GAME_NOT_FOUND", "FIXTURE_NOT_YOURS", "BYE_NEEDS_NO_CONFIRMATION"]);

const notLive = () => httpError(409, "MATCH_NOT_LIVE");

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
 * `FOR UPDATE`; no lock is taken before them. Refused at any point, the transaction is to be rolled back.
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
  if (!side || fixture[`${side}_user_id`] !== user.id || fixture.preparation_status !== "in_progress") throw notLive();
  const post = (await client.query("SELECT state FROM match_post_games WHERE pairing_id = $1 FOR UPDATE", [fixture.id])).rows[0];
  if (post?.state.status === "completed") throw notLive();
  if (post && !sideFollowsEvents(post.state[side])) throw httpError(409, "EVENT_SIDE_LOCKED");
  const { rows } = await client.query("SELECT snapshot FROM match_roster_snapshots WHERE pairing_id = $1 AND side = $2",
    [fixture.id, side]);
  if (!rows[0]) throw notLive(); // started, the match has both rosters: without one it never started
  return { fixture, side, snapshot: rows[0].snapshot };
}

/**
 * A player's dice over HTTP: `POST /api/teams/:id/players/:pid/rolls` — the server rolls.
 *
 * A coach who rolls on the site asks for a roll and is told what came up; the die is the server's
 * (`serverDie`), the result is kept as a `dice_rolls` row, and the advancement that takes it
 * refers to that row (`roll: { id, via: "site" }`). Asking again — a retry after a lost answer, a
 * second tab — is answered with the roll already waiting, never a fresh die, and asking for the
 * other purpose while the player's earliest waiting roll is of this one is refused: see
 * `rollForPlayer` for the player's turn of rolls and what holds him to one roll.
 *
 * Rolling is the owner's, and an administrator is not the owner: to anybody else the team is not
 * there (`teamForUser`). The request is a transaction that takes the team's row first, so the roll
 * that is waiting is looked for, and a new one written, with nobody else doing the same.
 */
import { DICE_PURPOSES } from "../../src/domain/roster/dice.mjs";
import { publicRoll, rollForPlayer } from "../api/dice-rolls.mjs";
import { PLAYER_ID_SOURCE, UUID_SOURCE, teamForUser } from "../api/team-access.mjs";
import { currentUser } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";

const ROLLS = new RegExp(`^/api/teams/(${UUID_SOURCE})/players/(${PLAYER_ID_SOURCE})/rolls$`, "i");

/**
 * What a body asks for: one of the purposes dice are rolled for, and for a random skill a category.
 * Any non-empty string is a category here; `DICE_CATEGORY` says whether the player can take it. A
 * characteristic has no use for a category and does not read one. Anything else is a 400 for the field.
 */
function checkRoll(body) {
  const { purpose, category } = body ?? {};
  if (!DICE_PURPOSES.includes(purpose)) throw httpError(400, "FIELD_INVALID", { field: "purpose" });
  if (purpose === "random_skill" && (typeof category !== "string" || category === "")) throw httpError(400, "FIELD_INVALID", { field: "category" });
  return { purpose, category };
}

/**
 * `POST /api/teams/:id/players/:pid/rolls` `{ purpose, category? }` — the owner asks for the roll of a step: 200 `{ roll }`,
 * new or waiting; 409 DICE_ROLL_WAITING while the player's earliest waiting roll is of the other purpose.
 */
async function rollForOwner(request, response, teamId, playerId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // Whose team it is comes before anything else about the request: a stranger is told 404 for a bad
  // body as for a good one. This look takes no lock — the transaction below looks again, locked.
  await teamForUser(pool, teamId, user);
  const { purpose, category } = checkRoll(await readJson(request)); // a bad body costs no transaction
  const row = await withTransaction(async (client) => {
    const team = await teamForUser(client, teamId, user, { lock: true });
    return rollForPlayer(client, { teamRow: team, playerId, purpose, category, userId: user.id });
  });
  sendJson(response, 200, { roll: publicRoll(row) });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleRollRoutes(request, response, url) {
  const rollPath = request.method === "POST" ? ROLLS.exec(url.pathname) : null;
  if (!rollPath) return false;
  await rollForOwner(request, response, rollPath[1], rollPath[2]);
  return true;
}

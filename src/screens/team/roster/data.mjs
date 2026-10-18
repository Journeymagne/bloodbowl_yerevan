/**
 * Reading the roster for its screen: the team and the match events not settled yet, as one snapshot.
 *
 * The screen shows a career: the blob's SPP plus the events waiting to be carried into it. Those are two
 * requests, and the team's revision comes with the events (`GET …/events`, read in the same snapshot as
 * the team there) to say whether they are added to the blob that was read here. A save that lands between
 * the two requests makes them disagree, and then both are read again.
 */
import { apiRequest } from "../../../core/api-client.mjs";
import { refusalText } from "../../../core/api.mjs";
import { t } from "../../../core/i18n.mjs";

/**
 * @param {string} teamId
 * @param {{attempts?: number}} [options] how many times the two reads are made before giving up on their agreeing
 * @returns {Promise<{team: object, events: object[]} | {error: string}>} the team (GET's shape) and the events
 *   of its revision, oldest first; or why there is nothing to show
 */
export async function readRoster(teamId, { attempts = 3 } = {}) {
  const path = `/api/teams/${encodeURIComponent(teamId)}`;
  try {
    for (let read = 0; read < attempts; read += 1) {
      const [{ team }, { events, revision }] = await Promise.all([apiRequest(path), apiRequest(`${path}/events`)]);
      if (revision === team.revision) return { team, events };
    }
  } catch (error) {
    return { error: refusalText(error) };
  }
  return { error: t("teamRoster.readMismatch") };
}

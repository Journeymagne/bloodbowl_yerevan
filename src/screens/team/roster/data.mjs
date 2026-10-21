/**
 * Reading the roster for its screen: the team and the match events not settled yet, as one snapshot.
 *
 * The screen shows a career: the blob's SPP plus the events waiting to be carried into it. Those are two
 * requests, and the team's revision comes with the events (`GET …/events`, read in the same snapshot as
 * the team there) to say whether they are added to the blob that was read here. A save that lands between
 * the two requests makes them disagree, and then both are read again.
 *
 * An admin's visit (stage 12, source.mjs) reads the team on the administration's route, which answers with what the
 * admin's screen says besides — the owner, whether the team plays a match, its matches (`admin`); the records are read
 * on the coach's route, which an admin may read.
 */
import { apiRequest } from "../../../core/api-client.mjs";
import { refusalText } from "../../../core/api.mjs";
import { t } from "../../../core/i18n.mjs";
import { readFallen } from "./fallen.mjs";
import { adminOf, teamReadPath } from "./source.mjs";

/**
 * What the admin's read says besides the team (`GET /api/admin/teams/:id`): its owner, whether it plays a match now and
 * its matches; a part the answer lacks is none.
 * @typedef {{owner: object|null, inMatch: boolean, matches: object[]}} AdminPart
 */
const adminPartOf = (answer) => ({
  owner: answer.owner && typeof answer.owner === "object" ? answer.owner : null,
  inMatch: answer.inMatch === true,
  matches: Array.isArray(answer.matches) ? answer.matches : [],
});

/**
 * @param {string} teamId
 * @param {{attempts?: number}} [options] how many times the two reads are made before giving up on their agreeing
 * @returns {Promise<{team: object, events: object[], admin?: AdminPart} | {error: string}>} the team (GET's shape) and
 *   the events of its revision, oldest first, and for an admin's visit what the admin's read says besides; or why
 *   there is nothing to show
 */
export async function readRoster(teamId, { attempts = 3 } = {}) {
  const path = `/api/teams/${encodeURIComponent(teamId)}`;
  const admin = Boolean(adminOf(teamId));
  try {
    for (let read = 0; read < attempts; read += 1) {
      const [teamAnswer, eventsAnswer] = await Promise.all([apiRequest(teamReadPath(teamId)), apiRequest(`${path}/events`)]);
      const [team, events] = [teamAnswer?.team, eventsAnswer?.events];
      // A 2xx whose body is not the team or its records (a proxy's page, which api.mjs reads as `{}`) is no answer.
      if (!team || !Array.isArray(events)) return { error: t("request.noAnswer") };
      if (eventsAnswer.revision === team.revision) return admin ? { team, events, admin: adminPartOf(teamAnswer) } : { team, events };
    }
  } catch (error) {
    return { error: refusalText(error) };
  }
  return { error: t("teamRoster.readMismatch") };
}

/**
 * The roster and the team's fallen, read side by side: what the screen draws is the players who are on the roster and
 * the ones who are not, and a read of one without the other would show a player twice or not at all. They are two
 * requests of different tables, so a death that lands between them is not told apart here: the writes of the fallen
 * come with the team they leave, which the screen takes (save.mjs, `takeAnswerTeam`).
 * @param {string} teamId
 * @returns {Promise<{team: object, events: object[], fallen: object[], admin?: AdminPart} | {error: string}>} `readRoster`'s
 *   answer with the team's deaths, newest first; or why there is nothing to show (the roster's first, then the fallen's)
 */
export async function readSnapshot(teamId) {
  const [roster, dead] = await Promise.all([readRoster(teamId), readFallen(teamId)]);
  if (roster.error) return { error: roster.error };
  if (dead.error) return { error: dead.error };
  return { team: roster.team, events: roster.events, fallen: dead.fallen, ...(roster.admin ? { admin: roster.admin } : {}) };
}

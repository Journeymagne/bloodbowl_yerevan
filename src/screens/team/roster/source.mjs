/**
 * Whose visit a team's roster is (stage 12, decision 23): its coach's, from the team's tabs, or the league
 * administrator's, from the administration (`#/administration/users/:uid/teams/:tid/edit[/:pid]`). It is one roster 3.0
 * either way — the same lines, sheets, locks and save queue — and the visit decides only where the team goes:
 *
 * - the team is read and saved on the admin's route (`GET`/`PATCH /api/admin/teams/:id`), which answers with its owner,
 *   whether it plays a match and its matches, and lets the admin repair it during one (plan 09a, question 2);
 * - a death and its undo go on the admin's routes (`/api/admin/teams/:id/players/:pid/death`, `…/fallen/:fid`);
 * - its links stay in the administration: a player's page is `…/edit/:pid`, the way back from it `…/edit`.
 *
 * What stays the coach's routes is what an admin may read there: the team's records, its fallen, a player's career and
 * the team's rolls. The admin rolls nothing on the site (advance.mjs).
 *
 * The roster's entry says whose visit it is, every time (`openRosterAs`): a coach's visit says none, so a team an admin
 * has edited is the coach's again on the coach's next visit — and its save queue goes on the coach's route from the next
 * read (`trackRoster`), while a step still waiting keeps the route it was taken on (save.mjs).
 */
import { adminTeamEditUrl, adminTeamPlayerUrl, teamPlayerUrl, teamUrl } from "../../../core/routes.mjs";

/** The teams an admin's visit is open on: the team's id → `{ownerId}`, the id of the coach whose team it is, as the address names it. */
const admins = new Map();

/**
 * Whose visit of `teamId` begins: the admin's, with the owner's id from the address, or (`admin` null) the coach's.
 * @param {string} teamId @param {{admin?: {ownerId: string}|null}} [options]
 */
export function openRosterAs(teamId, { admin = null } = {}) {
  if (admin) admins.set(String(teamId), { ownerId: String(admin.ownerId) });
  else admins.delete(String(teamId));
}

/** The admin's visit of the team, `{ownerId}`, or null for the coach's. */
export function adminOf(teamId) {
  return admins.get(String(teamId)) ?? null;
}

/** Where the team lives for the visit: the administration's route of it, or the coach's. */
const teamPath = (teamId) => `${adminOf(teamId) ? "/api/admin/teams" : "/api/teams"}/${encodeURIComponent(teamId)}`;

/** Where the team is read (`GET`): the admin's route answers `{owner, team, inMatch, matches}`, the coach's `{team}`. */
export function teamReadPath(teamId) {
  return teamPath(teamId);
}

/** Where the roster's save queue sends the team (`PATCH`). */
export function teamSavePath(teamId) {
  return teamPath(teamId);
}

/** Where a player's death is marked (`POST`). */
export function deathPath(teamId, playerId) {
  return `${teamPath(teamId)}/players/${encodeURIComponent(playerId)}/death`;
}

/** Where a death is undone (`DELETE`). */
export function undoPath(teamId, fallenId) {
  return `${teamPath(teamId)}/fallen/${encodeURIComponent(fallenId)}`;
}

/** The roster's address for the visit: the admin's edit of the team, or the team's «Roster» tab. */
export function rosterHref(teamId) {
  const admin = adminOf(teamId);
  return admin ? adminTeamEditUrl(admin.ownerId, teamId) : teamUrl(teamId, "roster");
}

/** A player's address for the visit: his screen in the admin's edit of the team, or on the team's «Roster». */
export function playerHref(teamId, playerId) {
  const admin = adminOf(teamId);
  return admin ? adminTeamPlayerUrl(admin.ownerId, teamId, playerId) : teamPlayerUrl(teamId, playerId);
}

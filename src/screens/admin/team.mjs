/**
 * A coach's team as the league's administrator edits it (`#/administration/users/:uid/teams/:tid/edit`, and a player of
 * it at `…/edit/:pid`; stage 12, decision 23; DeskAdminTeamEdit.html): not a screen of its own but the team's roster 3.0
 * (screens/team/roster) in the admin's mode — read and saved through the administration's routes, its deaths and their
 * undos the admin's, no roll on the site, its players' addresses in the administration (source.mjs). Its routes are not
 * the coach's team routes: the team is not made the active one, and the admin's own team stays in the shell.
 *
 * A coach who is no admin is told the section is the admin's, and nothing of it is read (decision 10).
 */
import { drawScreen } from "../../core/dom.mjs";
import { view } from "../../core/view.mjs";
import { renderTeamRoster } from "../team/roster/index.mjs";
import { adminRefusalMarkup, isAdminViewer } from "./frame.mjs";

/**
 * @param {{ownerId: string, teamId: string, playerId?: string}} route the address's coach, team and player ("" for the roster)
 * @returns {Promise<void>}
 */
export async function renderAdminTeam({ ownerId, teamId, playerId = "" }) {
  if (!isAdminViewer()) {
    drawScreen(view, `<div data-screen="admin-refused">${adminRefusalMarkup()}</div>`);
    view.querySelector("h1")?.focus();
    return;
  }
  await renderTeamRoster(teamId, { playerId, admin: { ownerId } });
}

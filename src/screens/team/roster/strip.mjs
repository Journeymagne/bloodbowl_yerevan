/**
 * Stage 08's treasury strip over the desk roster (DeskRoster): the money and what the team holds, and the button
 * that opens 08's «Add / Take» sheet. The strip is 08's (screens/team/manage/strip.mjs): it draws itself again on
 * every change of the coach's teams and games, and its sheet stands in a host of its own on the body, so a redraw
 * of the roster closes nothing. What is here is where it stands, what it is drawn from, and how the roster hears
 * what it writes.
 *
 * It is drawn from the team as the coach's list holds it (K4 c), where 08's writes land, so a redraw of the roster
 * never takes back an entry the strip has drawn; the roster's own read stands in for a team the list does not hold.
 * Up to 900px it is hidden (roster.css): the phone's treasury is the Team tab's card.
 *
 * A write of the strip moves the team's revision, and the roster's next save, sent on the one before, would meet it
 * as a 409 and lay the roster it read over the entry. So the roster listens to the list too (`wireStrip`), and reads
 * the team again when the list is ahead of its queue (`listAhead`; index.mjs, `followList`, K4 b).
 */
import { onScreenLeave } from "../../../core/screen-lifecycle.mjs";
import { state } from "../../../core/state.mjs";
import { onMyTeamsChange } from "../../../data/teams.mjs";
import { renderTreasuryStrip, wireTreasuryStrip } from "../manage/strip.mjs";

const listed = (teamId) => state.myTeams.items.find((item) => item.id === teamId) ?? null;

/** @param {object} team the team as the roster read it @returns {string} the strip over the table */
export function stripMarkup(team) {
  return `<div class="g-roster__strip">${renderTreasuryStrip({ team: listed(team.id) ?? team })}</div>`;
}

/**
 * The revision of the team in the coach's list when it is ahead of `revision`, the one the roster's queue saves on: a
 * write made elsewhere on the page, which the roster has not read; null when there is none. A revision only goes up,
 * so a list older than the roster (read before another device's save) brings nothing to read.
 * @param {string} teamId @param {number|null} revision @returns {number|null}
 */
export function listAhead(teamId, revision) {
  const ahead = listed(teamId)?.revision;
  return Number.isInteger(ahead) && Number.isInteger(revision) && ahead > revision ? ahead : null;
}

/**
 * The strips under `root` wired for the visit — once per mount, as 08 asks: a visit drawn again for the same team
 * shares the wiring, and its sheet stays open — and `onListChange` on every change of the coach's teams, both until
 * the screen is left.
 * @param {Element} root the view @param {() => void} onListChange
 */
export function wireStrip(root, onListChange) {
  const release = wireTreasuryStrip(root);
  const off = onMyTeamsChange(onListChange);
  onScreenLeave("team-roster:strip", () => {
    off();
    release();
  });
}

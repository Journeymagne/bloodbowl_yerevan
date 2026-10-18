/**
 * The overview of a coach who has no team in hand. Stage 06 makes this the
 * empty state of the team overview itself; until then the router draws it on
 * `#/`, where a coach with a team is sent on to that team.
 *
 * Two coaches get here. One whose list came back empty has no team yet: what
 * will be here, and the one way forward, the builder. One whose list could not
 * be read at all (`/api/teams` failed while `/me` answered) may have five: the
 * screen says the list did not load and offers to read it again, rather than
 * offer a first team (R10).
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { newTeamUrl, teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { syncActiveTeam } from "../../data/active-team.mjs";
import { loadMyTeams, onMyTeamsChange } from "../../data/teams.mjs";
import { renderButton } from "../../ui/button.mjs";

export function noTeamMarkup() {
  return `<section class="g-team-empty">
    <h1 class="g-team-empty__title" tabindex="-1">${escapeHtml(t("team.empty.title"))}</h1>
    <p class="g-team-empty__text">${escapeHtml(t("team.empty.text"))}</p>
    ${renderButton({ label: t("team.empty.create"), kind: "primary", href: newTeamUrl() })}
  </section>`;
}

/**
 * A list that could not be read, and the button (`data-teams-retry`) that reads it again: what the retry then
 * draws is the screen's, so the screen wires it.
 * @param {string} error why the list was not read, as a sentence
 */
export function unreadMarkup(error) {
  return `<section class="g-team-empty">
    <h1 class="g-team-empty__title">${escapeHtml(t("team.unread.title"))}</h1>
    <p class="g-team-empty__text">${escapeHtml(error)}</p>
    ${renderButton({ label: t("team.unread.retry"), kind: "primary", data: { teamsRetry: true } })}
  </section>`;
}

/**
 * Read the list again. A list with a team in it has made one active (data/teams.mjs), and `#/` goes on
 * to it as resolveRedirect would have sent it; an empty one is the overview of no team; another failure
 * says so again. Nothing is drawn once the coach has left the screen.
 */
async function retry(isHere) {
  view.innerHTML = `<div class="loading">${escapeHtml(t("myTeams.loadingTeams"))}</div>`;
  await loadMyTeams(true);
  if (!isHere()) return;
  if (state.activeTeamId) location.replace(teamUrl(state.activeTeamId));
  else renderNoTeam();
}

/**
 * A team has come onto the list while the screen offers a first one: the builder's answer, which came after the coach
 * had left the builder for this page, or a list read again. `#/` is that team's now, and the address is replaced as
 * resolveRedirect would have sent it. The change is heard before the builder settles the active team, so it is
 * settled here too (the same answer, written once).
 */
function goOnToTeam() {
  if (!state.auth.currentUser || !state.myTeams.items.length) return;
  const teamId = syncActiveTeam();
  if (teamId) location.replace(teamUrl(teamId));
}

export function renderNoTeam() {
  setActiveNav("home");
  setViewSection("home");
  const { loaded, error } = state.myTeams;
  if (loaded || !error) {
    view.innerHTML = noTeamMarkup();
    onScreenLeave("team-empty", onMyTeamsChange(goOnToTeam));
    return;
  }
  let here = true;
  onScreenLeave("team-unread", () => { here = false; });
  view.innerHTML = unreadMarkup(error);
  view.querySelector("[data-teams-retry]").addEventListener("click", () => retry(() => here));
}

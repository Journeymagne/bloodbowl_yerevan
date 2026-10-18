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
import { loadMyTeams } from "../../data/teams.mjs";
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

export function renderNoTeam() {
  setActiveNav("home");
  setViewSection("home");
  const { loaded, error } = state.myTeams;
  if (loaded || !error) {
    view.innerHTML = noTeamMarkup();
    return;
  }
  let here = true;
  onScreenLeave("team-unread", () => { here = false; });
  view.innerHTML = unreadMarkup(error);
  view.querySelector("[data-teams-retry]").addEventListener("click", () => retry(() => here));
}

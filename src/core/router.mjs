/**
 * The route table, and what a route change has to tear down.
 *
 * `core/routes.mjs` stays pure — it turns a hash into a name and parameters,
 * and decides where an address leads (`resolveRedirect`); both are covered by
 * ordinary tests. This module is the half that needs the DOM: it applies the
 * redirect, maps the names onto screen modules and runs the dispatch. The 3.0
 * names draw the 2.x screens until their own stage (plan stage 05, "Маршруты
 * этапа 05").
 *
 * Leaving a screen is core/screen-lifecycle.mjs' job; the router only says
 * when.
 */
import { TEAM_ROUTES, matchRoute, resolveRedirect, routeFromHash, teamUrl, teamsUrl } from "./routes.mjs";
import { peekReturn, setReturn } from "./return-to.mjs";
import { releaseCurrentScreen } from "./screen-lifecycle.mjs";
import { escapeHtml } from "./dom.mjs";
import { t } from "./i18n.mjs";
import { state } from "./state.mjs";
import { view } from "./view.mjs";
import { announce } from "../components/live-region.mjs";
import { toast } from "../components/toast.mjs";
import { prepareTeamRoute, syncActiveTeam } from "../data/active-team.mjs";
import { loadMyTeams } from "../data/teams.mjs";
import { renderGuestHome } from "../screens/home/guest.mjs";
import { renderLogin } from "../screens/auth/login.mjs";
import { renderNoTeam } from "../screens/team/empty.mjs";
import { renderTeamOverview } from "../screens/team/overview.mjs";
import { renderTeamRoster } from "../screens/team/roster/index.mjs";
import { renderSettings } from "../screens/settings/index.mjs";
import { renderLegal, renderOverviewArticle, renderReferencePage } from "../screens/ref/article.mjs";
import { renderRef } from "../screens/ref/index.mjs";
import { renderRefSection } from "../screens/ref/list.mjs";
import { renderTeams } from "../screens/teams/index.mjs";
import { renderSavedRoster } from "../screens/saved-roster.mjs";
import { renderNewTeam } from "../screens/teams/new.mjs";
import { renderSeason } from "../screens/season/index.mjs";
import { renderMyGames } from "../screens/games/my-games.mjs";
import { renderGamePage } from "../screens/games/game.mjs";
import { renderPreMatch } from "../screens/games/pre-match.mjs";
import { renderPostMatch } from "../screens/games/post-match.mjs";
import { renderAdministration } from "../screens/administration/users.mjs";
import { renderAdminUserProfile } from "../screens/administration/user.mjs";
import { renderPlayerProfile } from "../screens/players/profile.mjs";
import { renderPublicTeamProfile } from "../screens/players/team.mjs";
import { refreshShell } from "../shell/shell.mjs";

/**
 * A coach's `#/` with no team active (one with a team active never gets here: resolveRedirect sends
 * `#/` on to it). A coach with teams has one settled and goes on to it, the address replaced as
 * resolveRedirect would have; nothing is drawn, the team's screen comes with the hashchange. A coach
 * with none, or whose list could not be read, gets the overview of no team (screens/team/empty.mjs),
 * which goes on by itself once a team appears.
 */
function renderCoachHome() {
  const { items } = state.myTeams;
  if (!items.length) return renderNoTeam();
  // With a team in the list the sync always settles on one (the first, when nothing names another), so it cannot be null here.
  location.replace(teamUrl(syncActiveTeam()));
  return undefined;
}

const screens = {
  home: () => (state.auth.currentUser ? renderCoachHome() : renderGuestHome()),
  login: () => renderLogin("login"),
  register: () => renderLogin("register"),
  settings: () => renderSettings(),
  overview: ({ slug }) => renderOverviewArticle(slug),
  teams: () => renderTeams(),
  teamNew: () => renderNewTeam(),
  team: ({ teamId }) => renderTeamOverview(teamId),
  teamManage: ({ teamId }) => renderSavedRoster(teamId),
  teamRoster: ({ teamId }) => renderTeamRoster(teamId),
  teamPlayer: ({ teamId }) => renderSavedRoster(teamId),
  teamMatches: () => renderMyGames(),
  teamChallenges: () => renderMyGames(),
  coach: ({ userId }) => renderPlayerProfile(userId),
  coachTeam: ({ userId, teamId }) => renderPublicTeamProfile(userId, teamId),
  ref: () => renderRef(),
  refSection: ({ section }) => renderRefSection(section),
  game: ({ gameId }) => renderGamePage(gameId),
  preMatch: ({ gameId, step }) => renderPreMatch(gameId, step),
  postMatch: ({ gameId, step }) => renderPostMatch(gameId, step),
  season: ({ tab }) => renderSeason(true, tab),
  adminTeamEdit: ({ ownerId, teamId }) => renderSavedRoster(teamId, true, { adminOwnerId: ownerId }),
  adminUserProfile: ({ userId }) => renderAdminUserProfile(userId),
  administration: () => renderAdministration(),
  legal: () => renderLegal(),
  page: ({ slug }) => renderReferencePage(slug),
};

/** Counts route changes, so a screen that finishes drawing after the next one started is not announced. */
let ticket = 0;

/** Read the coach's list again with the screen saying so: the one before is released, and must not stay clickable. */
function reloadTeams() {
  view.innerHTML = `<div class="loading">${escapeHtml(t("myTeams.loadingTeam"))}</div>`;
  return loadMyTeams(true);
}

/**
 * A team's screen opens only on one of the coach's own teams, which it makes the active
 * one. A team missing from the list may be the one the builder saved a moment ago, so the
 * list is read once more before the coach is told it is not there — or that the list
 * could not be read — and sent to My Teams.
 */
async function renderTeamScreen(name, params, current) {
  const found = await prepareTeamRoute(params.teamId, { reload: reloadTeams });
  if (current !== ticket) return undefined;
  if (!found) {
    toast(state.myTeams.error || t("error.TEAM_NOT_FOUND"), { tone: "error" });
    location.replace(teamsUrl());
    return undefined;
  }
  syncActiveTeam({ routeTeamId: params.teamId });
  return screens[name](params);
}

/**
 * Draw the screen the hash names, unless resolveRedirect sends the address on:
 * then `location.replace` swaps it (the redirected address does not stay in
 * history) and the hashchange that follows draws the target.
 *
 * The 2.x screens still set their own nav highlight on the way in, which
 * lights nothing now; the 3.0 frame takes its tabs and items from the route
 * name (shell/navigation.mjs), redrawn here before the screen.
 */
export function renderRoute() {
  const current = ++ticket;
  const startedAt = location.hash;
  const route = routeFromHash(location.hash);
  const { target, returnTo } = resolveRedirect(route, {
    signedIn: Boolean(state.auth.currentUser),
    activeTeamId: state.activeTeamId ?? null,
    returnTo: peekReturn(),
    hash: location.hash,
  });
  setReturn(returnTo);
  if (target) {
    location.replace(target);
    return undefined;
  }
  releaseCurrentScreen();
  const { name, params } = matchRoute(route);
  refreshShell({ name, params });
  const rendered = TEAM_ROUTES.has(name) ? renderTeamScreen(name, params, current) : screens[name](params);
  // A sighted reader sees the screen change; #app-view no longer says so
  // (step 15.5), so the heading is announced instead — after the screen has
  // put one there, which for anything that waits on a fetch is not yet. A
  // screen that sent the address on drew nothing: the heading still in the
  // view is the screen before's, and the hashchange to come announces the next.
  Promise.resolve(rendered).then(() => {
    if (current === ticket && location.hash === startedAt) announce(view.querySelector("h1, h2")?.textContent ?? "");
  });
  return rendered;
}

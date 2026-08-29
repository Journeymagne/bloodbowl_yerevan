/**
 * The route table, and what a route change has to tear down.
 *
 * `core/routes.mjs` stays pure — it turns a hash into a name and parameters,
 * and is covered by ordinary tests. This module is the half that needs the
 * DOM: it maps those names onto screen modules and runs the dispatch.
 *
 * Leaving a screen is core/screen-lifecycle.mjs' job; the router only says
 * when.
 */
import { matchRoute, routeFromHash } from "./routes.mjs";
import { releaseCurrentScreen } from "./screen-lifecycle.mjs";
import { t } from "./i18n.mjs";
import { state } from "./state.mjs";
import { view } from "./view.mjs";
import { announce } from "../components/live-region.mjs";
import { setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { renderHome } from "../screens/home.mjs";
import { renderOverviewDetail } from "../screens/overview.mjs";
import { renderSection } from "../screens/section.mjs";
import { renderDetail } from "../screens/detail.mjs";
import { renderLegal } from "../screens/legal.mjs";
import { renderMyTeams } from "../screens/my-teams.mjs";
import { renderSavedRoster } from "../screens/saved-roster.mjs";
import { renderBuilder } from "../screens/builder.mjs";
import { renderSeason } from "../screens/season/index.mjs";
import { renderMyGames } from "../screens/games/my-games.mjs";
import { renderGamePage } from "../screens/games/game.mjs";
import { renderAdministration } from "../screens/administration/users.mjs";
import { renderAdminUserProfile } from "../screens/administration/user.mjs";
import { renderPlayerProfile } from "../screens/players/profile.mjs";
import { renderPublicTeamProfile } from "../screens/players/team.mjs";

function findPageBySlug(slug) {
  return state.data.pages.find((page) => page.slug === slug)
    ?? state.data.pages.find((page) => page.slug.endsWith(`/${slug}`))
    ?? null;
}

const screens = {
  home: () => renderHome(),
  overview: ({ slug }) => renderOverviewDetail(slug),
  section: ({ route }) => renderSection(route),
  builder: () => renderBuilder(),
  savedRoster: ({ teamId }) => renderSavedRoster(teamId),
  myTeams: () => renderMyTeams(),
  game: ({ gameId }) => renderGamePage(gameId),
  myGames: () => renderMyGames(),
  season: ({ tab }) => renderSeason(true, tab),
  adminTeamEdit: ({ ownerId, teamId }) => renderSavedRoster(teamId, true, { adminOwnerId: ownerId }),
  adminUserProfile: ({ userId }) => renderAdminUserProfile(userId),
  administration: () => renderAdministration(),
  publicTeam: ({ userId, teamId }) => renderPublicTeamProfile(userId, teamId),
  playerProfile: ({ userId }) => renderPlayerProfile(userId),
  legal: () => renderLegal(),
  page: ({ slug }) => {
    const page = findPageBySlug(slug);
    return page ? renderDetail(page) : renderNotFound();
  },
};

function renderNotFound() {
  setActiveNav("home");
  setViewSection("home");
  view.innerHTML = `<div class="empty-state">${t("app.pageNotFound")}</div>`;
}

export function renderRoute() {
  // Each screen sets its own nav highlight on the way in. core/routes.mjs also
  // exports routeSection(), which derives the same thing from the route alone —
  // the two disagree today (a player profile highlights "season"), so switching
  // to it is a visible change and belongs in its own commit, not this one.
  releaseCurrentScreen();
  const { name, params } = matchRoute(routeFromHash(location.hash));
  const rendered = screens[name](params);
  // A sighted reader sees the screen change; #app-view no longer says so
  // (step 15.5), so the heading is announced instead — after the screen has
  // put one there, which for anything that waits on a fetch is not yet.
  Promise.resolve(rendered).then(() => announce(view.querySelector("h1, h2")?.textContent ?? ""));
  return rendered;
}

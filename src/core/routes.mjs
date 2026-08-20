/**
 * Where every link goes, and what a hash means.
 *
 * The app is a hash router: `location.hash` is the single source of truth for
 * which screen is on the page. Two things used to make that hard to reason
 * about — the URLs were built by hand at each call site (so a missing
 * `encodeURIComponent` was one copy-paste away), and the matching lived inside
 * a long if-chain in `renderRoute` that could only be exercised by loading the
 * whole app in a browser.
 *
 * Both live here now, and both are pure: `matchRoute` turns a hash into a name
 * and parameters, and the builders turn ids back into hashes. Nothing in this
 * module touches `document`, `location` or application state, so the routing
 * table is covered by ordinary tests.
 */

/** Catalogue sections: a route name that is also the collection it lists. */
export const SECTION_ROUTES = new Map([
  ["teams", "teams"],
  ["skills", "skills"],
  ["traits", "traits"],
  ["rules", "rules"],
  ["cheatsheets", "cheatsheets"],
  ["inducements", "inducements"],
  ["star-players", "star-players"],
  ["pages", "pages"],
]);

/** Screens that are not driven by the content vault. */
export const STATIC_ROUTES = new Set([
  "builder",
  "legal",
  "my-teams",
  "my-games",
  "season",
  "administration",
]);

/** Accept either an entity or its id, because call sites have both. */
function idOf(entityOrId) {
  return typeof entityOrId === "string" ? entityOrId : entityOrId?.id;
}

/** Encode an id for a hash segment; a missing id yields an empty segment. */
function segment(entityOrId) {
  return encodeURIComponent(idOf(entityOrId) || "");
}

// ---------------------------------------------------------------------------
// Building links
// ---------------------------------------------------------------------------

export function pageUrl(page) {
  return `#/${page.slug}`;
}

export function playerUrl(userOrId) {
  return `#/players/${segment(userOrId)}`;
}

export function playerTeamUrl(userOrId, teamOrId) {
  return `#/players/${segment(userOrId)}/teams/${segment(teamOrId)}`;
}

export function adminTeamEditUrl(userOrId, teamOrId) {
  return `#/administration/users/${segment(userOrId)}/teams/${segment(teamOrId)}/edit`;
}

export function gameUrl(gameOrId) {
  return `#/games/${segment(gameOrId)}`;
}

export function savedRosterUrl(teamOrId) {
  return `#/my-teams/${segment(teamOrId)}`;
}

export function listUrlForRoute(route) {
  return route === "home" ? "#/" : `#/${route}`;
}

// ---------------------------------------------------------------------------
// Reading links
// ---------------------------------------------------------------------------

/**
 * The route string a hash refers to. `#/`, `#` and "" all mean home.
 *
 * A hash that is not valid percent-encoding is used as-is rather than throwing:
 * a broken link should land on "page not found", not on a blank screen.
 */
export function routeFromHash(hash = "") {
  const raw = String(hash).replace(/^#\/?/, "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded || "home";
}

/** Which nav item owns a content page. */
export function navRouteForPage(page) {
  if (page.kind === "team") return "teams";
  if (page.kind === "skill") return "skills";
  if (page.kind === "trait") return "traits";
  if (page.kind === "rules") return "rules";
  if (page.kind === "cheatsheet") return "cheatsheets";
  if (page.kind === "inducement") return "inducements";
  if (page.kind === "starPlayer") return "star-players";
  return "pages";
}

/**
 * Which nav section should look active for a route.
 *
 * @param {string} route
 * @param {(slug: string) => object|null} [findPage] resolves a content slug;
 *   defaults to "not found", so this stays usable without the content vault.
 */
export function routeSection(route, findPage = () => null) {
  if (!route || route === "home") return "home";
  if (route.startsWith("overview/")) return "home";
  if (route.startsWith("administration/")) return "administration";
  if (route.startsWith("games/")) return "my-games";
  if (route.startsWith("players/")) return "players";
  if (SECTION_ROUTES.has(route)) return route;
  if (STATIC_ROUTES.has(route)) return route;
  const page = findPage(route);
  return page ? navRouteForPage(page) : "home";
}

const ADMIN_TEAM_EDIT = /^administration\/users\/([^/]+)\/teams\/([^/]+)\/edit$/;
const PUBLIC_TEAM = /^players\/([^/]+)\/teams\/([^/]+)$/;

/**
 * Turn a route string into the screen to render.
 *
 * Order matters and mirrors the original if-chain: the more specific patterns
 * come first, so `administration/users/x/teams/y/edit` is the roster editor and
 * not a user profile whose id happens to contain slashes.
 *
 * The `page` result is the fallback — the caller looks the slug up in the
 * content vault and renders "not found" when there is nothing there. Resolving
 * it here would drag application state into a pure function.
 *
 * @returns {{name: string, params: object}}
 */
export function matchRoute(route) {
  if (route === "home") return { name: "home", params: {} };
  if (route.startsWith("overview/")) {
    return { name: "overview", params: { slug: route.slice("overview/".length) } };
  }
  if (SECTION_ROUTES.has(route)) return { name: "section", params: { route } };
  if (route === "builder") return { name: "builder", params: {} };
  if (route.startsWith("my-teams/")) {
    return { name: "savedRoster", params: { teamId: route.slice("my-teams/".length) } };
  }
  if (route === "my-teams") return { name: "myTeams", params: {} };
  if (route.startsWith("games/")) {
    return { name: "game", params: { gameId: route.slice("games/".length) } };
  }
  if (route === "my-games") return { name: "myGames", params: {} };
  if (route === "season") return { name: "season", params: {} };

  const adminEdit = route.match(ADMIN_TEAM_EDIT);
  if (adminEdit) {
    return { name: "adminTeamEdit", params: { ownerId: adminEdit[1], teamId: adminEdit[2] } };
  }
  if (route.startsWith("administration/users/")) {
    return {
      name: "adminUserProfile",
      params: { userId: route.slice("administration/users/".length) },
    };
  }
  if (route === "administration") return { name: "administration", params: {} };

  const publicTeam = route.match(PUBLIC_TEAM);
  if (publicTeam) {
    return { name: "publicTeam", params: { userId: publicTeam[1], teamId: publicTeam[2] } };
  }
  if (route.startsWith("players/")) {
    return { name: "playerProfile", params: { userId: route.slice("players/".length) } };
  }
  if (route === "legal") return { name: "legal", params: {} };

  return { name: "page", params: { slug: route } };
}

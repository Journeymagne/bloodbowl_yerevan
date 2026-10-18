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
 *
 * 3.0 routes render the 2.x screens until their stage (plan stage 05,
 * "Маршруты этапа 05"); every decision about where an address leads lives in
 * resolveRedirect, pure.
 */

/** The reference lists under `#/ref/<section>`; each is also the collection it lists. */
export const REF_SECTIONS = new Set(["teams", "skills", "traits", "rules", "cheatsheets", "inducements", "star-players"]);

/** The screens of one of the coach's own teams, `#/t/:teamId[/…]`. */
export const TEAM_ROUTES = new Set(["team", "teamManage", "teamRoster", "teamPlayer", "teamMatches", "teamChallenges"]);

/** The tail of a team address for each team screen but the player, which has an id of its own. */
const TEAM_SECTIONS = new Set(["", "team", "roster", "matches", "challenges"]);

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

/** A team's screen: `""` is its overview, the others are its tabs. */
export function teamUrl(teamOrId, section = "") {
  if (!TEAM_SECTIONS.has(section)) throw new Error(`Unknown team section: ${section}`);
  return `#/t/${segment(teamOrId)}${section ? `/${section}` : ""}`;
}

export function teamPlayerUrl(teamOrId, playerOrId) {
  return `${teamUrl(teamOrId, "roster")}/${segment(playerOrId)}`;
}

export function teamsUrl() {
  return "#/teams";
}

export function newTeamUrl() {
  return "#/teams/new";
}

/** @param {"login"|"register"} mode */
export function authUrl(mode = "login") {
  return mode === "register" ? "#/register" : "#/login";
}

export function settingsUrl() {
  return "#/settings";
}

/** `""` and `"pages"` (the 2.x name of the whole list) are the reference itself. */
export function refUrl(section = "") {
  return section && section !== "pages" ? `#/ref/${encodeURIComponent(section)}` : "#/ref";
}

/** A coach's public profile (2.x called coaches players). */
export function playerUrl(userOrId) {
  return `#/coaches/${segment(userOrId)}`;
}

export function playerTeamUrl(userOrId, teamOrId) {
  return `#/coaches/${segment(userOrId)}/teams/${segment(teamOrId)}`;
}

export function adminTeamEditUrl(userOrId, teamOrId) {
  return `#/administration/users/${segment(userOrId)}/teams/${segment(teamOrId)}/edit`;
}

export function gameUrl(gameOrId) {
  return `#/games/${segment(gameOrId)}`;
}

export function preMatchUrl(gameOrId, step = "") {
  return `${gameUrl(gameOrId)}/pre-match${step ? `/${encodeURIComponent(step)}` : ""}`;
}

export function postMatchUrl(gameOrId, step = "") {
  return `${gameUrl(gameOrId)}/post-match${step ? `/${encodeURIComponent(step)}` : ""}`;
}

/** The 2.x saved-roster editor, which the team's roster tab draws until stage 07. */
export function savedRosterUrl(teamOrId) {
  return teamUrl(teamOrId, "roster");
}

/** Bare `#/season` is the default tab; only a non-default tab gets a segment. */
export function seasonTabUrl(tab) {
  return tab ? `#/season/${encodeURIComponent(tab)}` : "#/season";
}

/** The list a content page goes back to: a reference section, or home. */
export function listUrlForRoute(route) {
  return route === "home" ? "#/" : refUrl(route);
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

/** Which reference list owns a content page. */
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

/** Whole routes with no parameters: the route string → the screen's name. */
const PLAIN_ROUTES = new Map([
  ["home", "home"],
  ["login", "login"],
  ["register", "register"],
  ["settings", "settings"],
  ["teams", "teams"],
  ["teams/new", "teamNew"],
  ["ref", "ref"],
  ["administration", "administration"],
  ["legal", "legal"],
]);

/**
 * Routes with ids: `[pattern, name, ...param names]`. Anchored, so a segment
 * too many is a content slug and not the screen with an odd id. An optional
 * group that did not match is `""`.
 */
const ID_ROUTES = [
  [/^t\/([^/]+)$/, "team", "teamId"],
  [/^t\/([^/]+)\/team$/, "teamManage", "teamId"],
  [/^t\/([^/]+)\/roster$/, "teamRoster", "teamId"],
  [/^t\/([^/]+)\/roster\/([^/]+)$/, "teamPlayer", "teamId", "playerId"],
  [/^t\/([^/]+)\/matches$/, "teamMatches", "teamId"],
  [/^t\/([^/]+)\/challenges$/, "teamChallenges", "teamId"],
  [/^coaches\/([^/]+)$/, "coach", "userId"],
  [/^coaches\/([^/]+)\/teams\/([^/]+)$/, "coachTeam", "userId", "teamId"],
  [/^games\/([^/]+)\/pre-match(?:\/([^/]+))?$/, "preMatch", "gameId", "step"],
  [/^games\/([^/]+)\/post-match(?:\/([^/]+))?$/, "postMatch", "gameId", "step"],
  [/^administration\/users\/([^/]+)\/teams\/([^/]+)\/edit$/, "adminTeamEdit", "ownerId", "teamId"],
];

/** The 2.x shapes that take the rest of the route as one parameter: `[prefix, name, param]`. */
const PREFIX_ROUTES = [
  ["overview/", "overview", "slug"],
  ["games/", "game", "gameId"],
  ["season/", "season", "tab"],
  ["administration/users/", "adminUserProfile", "userId"],
];

/**
 * Every name matchRoute can give: the plain routes, the id and prefix shapes, and the two it names
 * in its own body (a reference section, and the content page it falls back to). A route added to
 * one of the tables is here with no edit, and the navigation model's test fails until the model
 * knows it; a name that matchRoute starts giving from its body has to be added here too.
 */
export const ROUTE_NAMES = new Set([...PLAIN_ROUTES.values(), ...ID_ROUTES.map(([, name]) => name), ...PREFIX_ROUTES.map(([, name]) => name), "refSection", "page"]);

/**
 * Turn a route string into the screen to render.
 *
 * Order matters: the anchored id routes come before the prefixes, so
 * `administration/users/x/teams/y/edit` is the roster editor and not a user
 * profile whose id happens to contain slashes, and `games/g/pre-match` is the
 * preparation and not a game.
 *
 * The `page` result is the fallback — the caller looks the slug up in the
 * content vault and renders "not found" when there is nothing there. Resolving
 * it here would drag application state into a pure function. The 2.x
 * addresses (`#/my-teams`, `#/skills`…) are pages here too: resolveRedirect
 * sends them on before anything is drawn.
 *
 * @returns {{name: string, params: object}}
 */
export function matchRoute(route) {
  if (PLAIN_ROUTES.has(route)) return { name: PLAIN_ROUTES.get(route), params: {} };
  if (route === "season") return { name: "season", params: { tab: "" } };
  const section = route.match(/^ref\/([^/]+)$/)?.[1];
  if (REF_SECTIONS.has(section)) return { name: "refSection", params: { section } };
  for (const [pattern, name, ...keys] of ID_ROUTES) {
    const match = route.match(pattern);
    if (match) return { name, params: Object.fromEntries(keys.map((key, index) => [key, match[index + 1] ?? ""])) };
  }
  for (const [prefix, name, key] of PREFIX_ROUTES) {
    if (route.startsWith(prefix)) return { name, params: { [key]: route.slice(prefix.length) } };
  }
  return { name: "page", params: { slug: route } };
}

// ---------------------------------------------------------------------------
// Where an address leads
// ---------------------------------------------------------------------------

/**
 * What a guest cannot open: the way in is to sign in (plan stage 05, decision 5). A guest's
 * `#/teams` never gets this far: rule (1) sends it to the team rules first, as in 2.x.
 * `teamNew` is here since stage 06: stage 05 left the builder open to a guest because the 2.x one
 * kept its draft in the browser and asked for the session only at the save; the new one saves on
 * the server at once, so it is a coach's page like the rest, and a guest comes back to it after signing in.
 */
const SIGNED_IN_ROUTES = new Set([
  "teams",
  "teamNew",
  ...TEAM_ROUTES,
  "coach",
  "coachTeam",
  "game",
  "preMatch",
  "postMatch",
  "administration",
  "adminUserProfile",
  "adminTeamEdit",
]);

/**
 * The 2.x addresses and where they live now: `[pattern, (match, context) →
 * hash or null]`. Null is "not for this visitor", and the rest of
 * resolveRedirect decides: a guest's `#/my-games` asks for a session like any
 * coach page, a coach's `#/teams` is My Teams.
 */
const OLD_ADDRESSES = [
  [/^my-teams$/, () => teamsUrl()],
  [/^my-teams\/([^/]+)$/, ([, teamId]) => teamUrl(teamId, "roster")],
  // A guest goes on from there to sign in (rule 4), so the old address takes two hops, and signing in leads back to the builder.
  [/^builder$/, () => newTeamUrl()],
  [/^my-games$/, (match, { signedIn, activeTeamId }) => {
    if (!signedIn) return null;
    return activeTeamId ? teamUrl(activeTeamId, "matches") : teamsUrl();
  }],
  [/^players\/([^/]+)$/, ([, userId]) => playerUrl(userId)],
  [/^players\/([^/]+)\/teams\/([^/]+)$/, ([, userId, teamId]) => playerTeamUrl(userId, teamId)],
  [/^(?:ref\/)?pages$/, () => refUrl()],
  [/^(skills|traits|rules|cheatsheets|inducements|star-players)$/, ([, name]) => refUrl(name)],
  // In 2.x #/teams was the team rules list, and a guest's old link still means that.
  [/^teams$/, (match, { signedIn }) => (signedIn ? null : refUrl("teams"))],
];

function oldAddressTarget(route, context) {
  for (const [pattern, lead] of OLD_ADDRESSES) {
    const match = route.match(pattern);
    if (match) return lead(match, context);
  }
  return null;
}

const isSignInRoute = (name) => name === "login" || name === "register";

/**
 * Where a route leads before anything is drawn, in this order: (1) a 2.x
 * address goes to its 3.0 one; (2) a signed-in visitor on the sign-in screens
 * goes back where they were sent from, or home; (3) a coach's home is the
 * active team; (4) a guest on a coach page signs in first, and the address is
 * remembered; (5) otherwise the route stays, and a remembered address outlives
 * it only on the sign-in screens: a guest who went elsewhere gave up on it.
 *
 * Every target is a different route and settles within two hops (the tests
 * walk them), so the router can apply it with `location.replace` and let the
 * next hashchange draw. A sign-in screen is never remembered, nor returned to:
 * coming back to one would only send the coach on again.
 *
 * @param {string} route as `routeFromHash` gives it
 * @param {{signedIn: boolean, activeTeamId?: string|null, returnTo?: string, hash?: string}} context
 *   `hash` is the address as it was typed (`location.hash`): it is what (4)
 *   remembers, since one rebuilt from the decoded route is another address for
 *   an id with an encoded character in it
 * @returns {{target: string|null, returnTo: string}} the hash to go to (null:
 *   draw this route), and the address to come back to after signing in
 */
export function resolveRedirect(route, { signedIn, activeTeamId = null, returnTo = "", hash = "" }) {
  const back = returnTo && isSignInRoute(matchRoute(routeFromHash(returnTo)).name) ? "" : returnTo;
  const old = oldAddressTarget(route, { signedIn, activeTeamId });
  if (old) return { target: old, returnTo: back };
  const { name } = matchRoute(route);
  if (signedIn && isSignInRoute(name)) return { target: back || "#/", returnTo: "" };
  if (signedIn && activeTeamId && name === "home") return { target: teamUrl(activeTeamId), returnTo: back };
  if (!signedIn && (SIGNED_IN_ROUTES.has(name) || route === "my-games")) return { target: authUrl(), returnTo: hash || `#/${route}` };
  return { target: null, returnTo: isSignInRoute(name) ? back : "" };
}

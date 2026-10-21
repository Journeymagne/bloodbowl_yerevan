/**
 * Which tabs and side items a route gets: the navigation model of the shell.
 *
 * The mobile header draws `tabs`, the desktop SideNav draws `side`; both come
 * from one place so a coach on a phone and a coach at a desk are always told
 * the same thing about where they are. Pure — no DOM, no state read. The
 * caller passes the route, the visitor and the active team, and draws the
 * answer.
 *
 * Three modes. `bare` is the sign-in and registration screens, the new
 * team's builder (Builder, DeskBuilder), a match's preparation (PreFans …
 * PreReview, DeskPreInducements, DeskPreReview; stage 09a) and its post-match
 * (PostResult … PostReview, DeskPostResult … DeskPostReview; stage 09b), which
 * bring their own frame: no tabs, no items. `guest` has the league without a team.
 * `coach` has the team's screens beside the league's, or — with no team yet —
 * the league's alone and a header that leads to creating one. A desk's «Season»
 * of a coach with a team is the team's season (its board, the table and its
 * calendar, `#/t/:id/matches`); a phone's «Table», a guest's and a coach's with
 * no team lead to the league's page (`#/season`; stage 10, decision 12). A coach whose
 * list of teams could not be read may have teams: the header names the league.
 *
 * A player's address and the team's settings are drilled into (`drill`; owner,
 * 2026-10-19 and 2026-10-20): on a phone each is a screen of its own under a head
 * of its own — the player's with «‹ Roster», Builder.html's with «‹» back to the
 * team page — so the header draws neither the team nor the tabs; the SideNav of a
 * desk is the same.
 */
import { t } from "../core/i18n.mjs";
import { adminUrl, refUrl, seasonTabUrl, settingsUrl, teamUrl, teamsUrl } from "../core/routes.mjs";

/**
 * The routes the shell stays out of. The preparation and the post-match (PostResult … PostReview, DeskPostResult …
 * DeskPostReview; stage 09b) bring a frame of their own and keep their owners below: what they lit before.
 */
const BARE_ROUTES = new Set(["login", "register", "teamNew", "preMatch", "postMatch"]);

/** The routes a phone draws as a screen of its own, under its own head: the header draws nothing there. */
const DRILL_ROUTES = new Set(["teamPlayer", "teamSettings"]);

/**
 * Which tab and which side item own a route: `[tab, side item]`. A route that
 * is not here — My Teams, the builder — lights nothing, because it is the way
 * to a team and not a place in one.
 */
const OWNERS = {
  home: ["overview", "overview"],
  team: ["overview", "overview"],
  teamManage: ["team", "roster"],
  teamSettings: ["team", "roster"],
  teamRoster: ["roster", "roster"],
  teamPlayer: ["roster", "roster"],
  teamMatches: ["matches", "season"],
  teamChallenges: ["matches", "season"],
  game: ["matches", "season"],
  preMatch: ["matches", "season"],
  postMatch: ["matches", "season"],
  season: ["table", "season"],
  coach: ["table", "season"],
  coachTeam: ["table", "season"],
  ref: ["ref", "ref"],
  refSection: ["ref", "ref"],
  page: ["ref", "ref"],
  overview: ["ref", "ref"],
  legal: ["ref", "ref"],
  settings: ["settings", "settings"],
  administration: ["settings", "administration"],
  adminUserProfile: ["settings", "administration"],
  adminTeamEdit: ["settings", "administration"],
};

/** The route names the model has an answer for; test/shell-navigation.test.mjs holds them against the router's. */
export const OWNED_ROUTES = new Set(Object.keys(OWNERS));

/**
 * What each key looks like: the glyph (named in src/ui/icons.mjs) and the
 * label, read when the model is built so a change of language shows. The mobile
 * tabs draw no glyph; the side items do. Tabs and side items that lead to the
 * same place share a glyph.
 */
const FACES = {
  home: { icon: "overview", label: () => t("shell.tab.home") },
  overview: { icon: "overview", label: () => t("shell.tab.overview") },
  team: { icon: "roster", label: () => t("shell.tab.team") },
  roster: { icon: "roster", label: () => t("shell.tab.roster") },
  matches: { icon: "calendar", label: () => t("shell.tab.matches") },
  table: { icon: "calendar", label: () => t("shell.tab.table") },
  season: { icon: "calendar", label: () => t("shell.side.season") },
  ref: { icon: "book", label: () => t("shell.tab.ref") },
  settings: { icon: "settings", label: () => t("shell.tab.settings") },
  administration: { icon: "shield", label: () => t("shell.side.administration") },
};

/** A guest has no overview of a team: the league's front page is theirs. */
const guestKey = (key) => (key === "overview" ? "home" : key);

/**
 * The header's name, its subtitle, and the SideNav's subtitle (`sideSub`), and where the block leads.
 * The header says where the team stands (race, place); the SideNav, with the table a click away
 * and the page's own title beside it, says the race alone: the league and the race together broke
 * onto two lines for almost every race in the column.
 */
function leagueBrand() {
  const sub = t("shell.leagueSub");
  return { name: t("shell.league"), sub, sideSub: sub, href: "#/", switchTeam: false };
}

/** The race, then the place in the league when there is one: "Human · #2 in the league". */
function teamSubtitle(raceTitle, place) {
  const placeText = Number(place) > 0 ? t("shell.place", { place }) : "";
  return [raceTitle, placeText].filter(Boolean).join(" · ");
}

/** What every mode has after its own first items: the league's table, the reference and the settings. */
const leagueTabs = () => [["table", seasonTabUrl()], ["ref", refUrl()], ["settings", settingsUrl()]];
const leagueSide = () => [["season", seasonTabUrl()], ["ref", refUrl()], ["settings", settingsUrl()]];

/** The links of each mode, as `[key, href]` pairs in the order they are drawn. */
function guestLinks() {
  return { tabs: [["home", "#/"], ...leagueTabs()], side: [["home", "#/"], ...leagueSide()] };
}

function coachLinks(team, isAdmin) {
  const admin = isAdmin ? [["administration", adminUrl()]] : [];
  if (!team) return { tabs: [["overview", "#/"], ...leagueTabs()], side: [["overview", "#/"], ...leagueSide(), ...admin] };
  return {
    tabs: [
      ["overview", teamUrl(team.id)],
      ["team", teamUrl(team.id, "team")],
      ["roster", teamUrl(team.id, "roster")],
      ["matches", teamUrl(team.id, "matches")],
      ...leagueTabs(),
    ],
    side: [["overview", teamUrl(team.id)], ["roster", teamUrl(team.id, "roster")], ["season", teamUrl(team.id, "matches")], ["ref", refUrl()], ["settings", settingsUrl()], ...admin],
  };
}

function coachBrand(team, raceTitle, place) {
  if (!team) {
    const sub = t("shell.noTeamHint");
    return { name: t("shell.noTeam"), sub, sideSub: sub, href: teamsUrl(), switchTeam: true };
  }
  // A race the data does not know names the league, so the line is never empty under a team.
  return { name: team.name, sub: teamSubtitle(raceTitle, place), sideSub: raceTitle || t("shell.league"), href: teamsUrl(), switchTeam: true };
}

/** @typedef {{key: string, label: string, href: string, icon: string, current: boolean}} NavItem */

/** @returns {NavItem[]} */
function navItems(links, currentKey) {
  return links.map(([key, href]) => ({ key, label: FACES[key].label(), href, icon: FACES[key].icon, current: key === currentKey }));
}

/**
 * What the shell draws around a route.
 *
 * @param {{route: {name: string, params?: object}, user: object|null, team?: {id: string, name: string}|null, raceTitle?: string, place?: number|null, teamsRead?: boolean}} input
 *   `user` is the signed-in coach or null; `team` is the active team; `raceTitle` and
 *   `place` (the team's place in the season table, null outside it) are the header's subtitle;
 *   `teamsRead` is false while the coach's list of teams has not been read (no team is known)
 * @returns {{mode: "bare"|"guest"|"coach", brand: {name: string, sub: string, sideSub: string, href: string, switchTeam: boolean}, tabs: NavItem[], side: NavItem[], drill: boolean}}
 *   `drill` is true on a player's address and on the team's settings, which a phone draws as screens of their own: the header draws nothing there
 */
export function shellModel({ route, user, team = null, raceTitle = "", place = null, teamsRead = true }) {
  if (BARE_ROUTES.has(route.name)) return { mode: "bare", brand: leagueBrand(), tabs: [], side: [], drill: false };
  const owners = Object.hasOwn(OWNERS, route.name) ? OWNERS[route.name] : [];
  const drill = DRILL_ROUTES.has(route.name);
  if (!user) {
    const [tabKey, sideKey] = owners.map(guestKey);
    const links = guestLinks();
    return { mode: "guest", brand: leagueBrand(), tabs: navItems(links.tabs, tabKey), side: navItems(links.side, sideKey), drill };
  }
  const [tabKey, sideKey] = owners;
  const links = coachLinks(team, Boolean(user.isAdmin));
  const brand = !team && !teamsRead ? leagueBrand() : coachBrand(team, raceTitle, place);
  return { mode: "coach", brand, tabs: navItems(links.tabs, tabKey), side: navItems(links.side, sideKey), drill };
}

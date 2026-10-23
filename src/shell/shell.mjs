/**
 * The 3.0 frame on the page: the mobile header, the desktop SideNav and the
 * footer line under the content.
 *
 * index.html holds the empty frame; this module fills it. `mountShell` finds
 * the parts and wires what lives as long as the page does — the header folding
 * as the document scrolls (plan stage 05, decision 10), the language buttons,
 * a guest's way in, the list of games the match card is drawn from — and
 * registers nothing with core/screen-lifecycle.mjs: a route change tears down
 * a screen, never the frame. `refreshShell` draws the frame for a route; the
 * router calls it on every route, app.js whenever the session, the active
 * team, the language or the loaded data change, and the shell itself whenever
 * the games are read again (data/games.mjs).
 *
 * What the frame says comes from shell/navigation.mjs, drawn by
 * shell/app-header.mjs and shell/side-nav.mjs; the sizes and breakpoints are
 * frame.css's. The team block of the header and the SideNav opens the team
 * switcher (shell/team-switcher.mjs) in a host at the end of the frame; what
 * the shell does is open it, close it with the focus back where it was, act on
 * a team chosen, and hand «New team» to the sheet it is given (app.js gives it:
 * the frame imports no screen).
 */
import { delegate, focusLost, patch } from "../core/dom.mjs";
import { getLocale } from "../core/i18n.mjs";
import { requestLocale } from "../core/locale-request.mjs";
import { setReturn } from "../core/return-to.mjs";
import { TEAM_ROUTES } from "../core/routes.mjs";
import { state } from "../core/state.mjs";
import { activeTeam, isTeamListRead, syncActiveTeam } from "../data/active-team.mjs";
import { onGamesChange } from "../data/games.mjs";
import { onMyTeamsChange, raceTitleOf } from "../data/teams.mjs";
import { patchWithModal } from "../ui/sheet.mjs";
import { renderAppHeader } from "./app-header.mjs";
import { wireTeamLogos } from "../ui/team-logo.mjs";
import { currentMatch, renderNavMatch } from "./current-match.mjs";
import { shellModel } from "./navigation.mjs";
import { renderSideNav, renderSiteFooter } from "./side-nav.mjs";
import { SWITCHER_ID, renderTeamSwitcher, switchTarget, switcherRows, wireTeamSwitcher } from "./team-switcher.mjs";

/** Hysteresis of the fold: a page that settles between the two keeps the header as it was. */
const FOLD_PAST = 48;
const UNFOLD_UNDER = 8;

/** Room left between a tab scrolled into view and the edge of the row. */
const TAB_MARGIN = 16;

/** The share of the tab row that is not under its fade (app-header.css masks the last 15%): the part a tab is in view in. */
const TABS_CLEAR = 0.85;

/** A guest's way in, in the header and the SideNav (shell/app-header.mjs, shell/side-nav.mjs). */
const SIGN_IN_LINKS = "a.g-appbar__login, .g-sidenav__login a";

/** What the frame does when the games or the teams change: draw itself again for the route it has (one function, so mounting twice listens once). */
const redraw = () => refreshShell();

/** Where the team switcher is shown: the last child of the frame, which takes no room of its own (team-switcher.css). */
const SWITCHER_HOST = "team-switcher-host";

/** @type {{frame: Element, header: Element, sideNav: Element, footer: Element, switcher: Element}|null} */
let parts = null;
/** The route the frame was last drawn for: a refresh without one redraws it. */
let lastRoute = null;
/** The button that opened the switcher while it is open: the focus goes back to it. */
let opener = null;

/**
 * Whether the header is folded once the page stands `scrollTop` pixels down.
 * @param {boolean} compact whether it is folded now
 * @param {number} scrollTop
 * @returns {boolean}
 */
export function nextCompact(compact, scrollTop) {
  if (scrollTop > FOLD_PAST) return true;
  if (scrollTop < UNFOLD_UNDER) return false;
  return compact;
}

/**
 * Where the tab row should be scrolled to show the current tab: where it is
 * when the tab is already in view, else with the tab 16px in from the edge it
 * was past. Lengths are the row's pixels, `tabLeft` from the row's own start.
 * @param {{tabLeft: number, tabWidth: number, viewWidth: number, scrollLeft: number}} geometry
 * @returns {number}
 */
export function tabScrollLeft({ tabLeft, tabWidth, viewWidth, scrollLeft }) {
  if (tabLeft < scrollLeft) return Math.max(0, tabLeft - TAB_MARGIN);
  if (tabLeft + tabWidth > scrollLeft + viewWidth) return tabLeft + tabWidth + TAB_MARGIN - viewWidth;
  return scrollLeft;
}

/**
 * Find the frame's parts and wire what outlives every screen. The language
 * buttons are heard on the SideNav, which holds them, and not on the frame.
 * @param {{document?: Document, scroller?: {addEventListener: Function, document?: Document}, onNewTeam?: (opener: Element|null, options: {back: () => void}) => void}} [options]
 *   `scroller` is what scrolls the page — the window — and the document whose position is read;
 *   `onNewTeam` opens what «New team» of the switcher leads to, over the page, with the block the switcher
 *   was opened from (where the focus goes back to) and a `back` that opens the switcher again
 */
export function mountShell({ document = globalThis.document, scroller = globalThis, onNewTeam = () => {} } = {}) {
  wireTeamLogos(document);
  const find = (id) => document.querySelector(`#${id}`);
  parts = { frame: find("app-frame"), header: find("app-header"), sideNav: find("side-nav"), footer: find("site-footer"), switcher: find(SWITCHER_HOST) };
  if (!parts.switcher) {
    parts.switcher = document.createElement("div");
    parts.switcher.setAttribute("id", SWITCHER_HOST);
    parts.frame.appendChild(parts.switcher);
  }
  let compact = false;
  scroller.addEventListener("scroll", () => {
    const next = nextCompact(compact, (scroller.document ?? document).scrollingElement?.scrollTop ?? 0);
    if (next !== compact) parts.header.classList.toggle("g-appbar--compact", next);
    compact = next;
  }, { passive: true });
  delegate(parts.sideNav, "click", "[data-locale-switch]", (event, button) => requestLocale(button.getAttribute("data-locale-switch")));
  // A guest who signs in comes back to the page they were reading, as the 2.x header's button brought them.
  for (const root of [parts.header, parts.sideNav]) delegate(root, "click", SIGN_IN_LINKS, () => setReturn(globalThis.location?.hash ?? ""));
  // The team block of either opens the one switcher, which is wired here once: the host outlives every sheet shown in it.
  for (const root of [parts.header, parts.sideNav]) delegate(root, "click", "[data-team-switcher]", (event, button) => openSwitcher(button));
  wireTeamSwitcher(parts.switcher, { onSwitch: chooseTeam, onClose: closeSwitcher, onNewTeam: () => newTeam(onNewTeam) });
  // The match card is drawn from the games: a screen that changes one (data/games.mjs `invalidateGames`) redraws the frame when the list is read again.
  onGamesChange(redraw);
  // The team's name, tabs and card come from the coach's list: one read after the frame was drawn redraws it (R14).
  onMyTeamsChange(redraw);
}

/** The race the reference calls the team's base team; "" when the data has not come. */
function raceTitle(team) {
  return raceTitleOf(team?.baseTeamSlug);
}

/** Show the switcher over the page, built from the coach's list, the table and the games as they stand now. */
function openSwitcher(button) {
  const rows = switcherRows({ teams: state.myTeams.items, activeTeamId: state.activeTeamId, raceTitleOf, seasonData: state.season.data, games: state.games.items });
  opener = button;
  patchWithModal(parts.switcher, renderTeamSwitcher(rows), `#${SWITCHER_ID}`);
}

/**
 * Take the switcher away, if it is open, and give the focus back to the button that opened it, if that
 * button is still on the page and shown (`focusLost`: a coach who signed out has a link there now; a width
 * that crossed 900px hides the phone header's block); else the screen's title takes it, never the body.
 */
function closeSwitcher() {
  if (!opener) return;
  const button = opener;
  opener = null;
  patch(parts.switcher, "");
  (focusLost(button) ? parts.frame.ownerDocument?.querySelector("#app-view h1") : button)?.focus();
}

/**
 * A team chosen: on one of a team's pages the same page of the other team, whose address makes it the active
 * one (the router); anywhere else the page stays and the team only becomes the active one. The team whose page
 * it is already stays where it is: its address would only be the roster for a player's page.
 */
function chooseTeam(teamId) {
  closeSwitcher();
  if (TEAM_ROUTES.has(lastRoute?.name) && lastRoute.params?.teamId === teamId) return;
  const target = switchTarget(lastRoute, teamId);
  if (target) globalThis.location.hash = target;
  else syncActiveTeam({ routeTeamId: teamId });
}

/**
 * «New team»: the switcher goes first, so that one modal dialog is open at a time, and the sheet opens over the page in
 * its place. It is handed the block the switcher was opened from, which the focus goes back to when the sheet is closed,
 * and a way back that opens the switcher again for that block.
 */
function newTeam(open) {
  const button = opener;
  closeSwitcher();
  open(button, { back: () => openSwitcher(button) });
}

/** The team's place in the season table: its standings row's `rank` (the server's order is not the place); null outside the table. */
function seasonPlace(team) {
  const row = team ? state.season.data?.standings?.find((standing) => standing.team?.id === team.id) : null;
  return row?.rank ?? null;
}

/**
 * Scroll the tab row so the current tab stands clear of the fade at its edge;
 * nothing while the row is not laid out (the desktop hides it).
 */
function revealCurrentTab(header) {
  const row = header.querySelector(".g-tabs");
  const tab = row?.querySelector('[aria-current="page"]');
  if (!tab || !row.clientWidth || typeof tab.getBoundingClientRect !== "function") return;
  const tabLeft = tab.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
  row.scrollLeft = tabScrollLeft({ tabLeft, tabWidth: tab.offsetWidth, viewWidth: row.clientWidth * TABS_CLEAR, scrollLeft: row.scrollLeft });
}

/**
 * Draw the frame for `route` (by default the last one drawn) from the state:
 * the visitor, the active team with its race, place and current match, the
 * page's language and the data's date. Nothing before the frame is mounted or
 * a route is known.
 * @param {{name: string, params?: object}|null} [route] what the router matched
 */
export function refreshShell(route = lastRoute) {
  // A page of its own takes an open switcher with it; the frame drawn again for the same page (the games came in) leaves it.
  const moved = route !== lastRoute;
  lastRoute = route;
  if (!parts || !route) return;
  const user = state.auth.currentUser;
  const team = user ? activeTeam() : null;
  const model = shellModel({ route, user, team, raceTitle: raceTitle(team), place: seasonPlace(team), teamsRead: isTeamListRead() });
  const locale = getLocale();
  const generatedAt = state.data?.generatedAt ?? "";
  // The card is the team's: a guest, and a coach with no team yet, have none.
  const matchHtml = team ? renderNavMatch(currentMatch(state.games.items, team.id), team.id) : "";
  patch(parts.header, renderAppHeader(model));
  patch(parts.sideNav, renderSideNav(model, { matchHtml, locale, generatedAt }));
  patch(parts.footer, renderSiteFooter({ generatedAt, locale }));
  parts.frame.setAttribute("data-shell", model.mode);
  // A player's address is a screen of its own on a phone: frame.css hides the header's band there.
  if (model.drill) parts.frame.setAttribute("data-drill", "");
  else parts.frame.removeAttribute("data-drill");
  revealCurrentTab(parts.header);
  if (moved) closeSwitcher();
}

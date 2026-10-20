/**
 * "My teams" (`#/teams`): the coach's teams as a list, each a link to its
 * overview, with the way to a new one under it and, for a team that may go,
 * a bin. It replaces the 2.x list of cards (screens/my-teams.mjs). «New team»
 * opens the sheet of a new team's name and race over the list (new-sheet.mjs),
 * and so does «Create a team» of a coach with none; `#/teams/new` with no
 * build begun comes here with the sheet asked for, and the first drawing opens it.
 *
 * A row is the team as the switcher draws it (shell/team-switcher.mjs): the
 * rows come from the same `switcherRows`, so the two say the same of a team.
 * The active team is ticked. A team in the season has no bin, a chip says why,
 * and a line under the list says it of every team that has played (the
 * server's refusals, the season's and the friendlies', are said in the sheet).
 *
 * The bin asks first, in a sheet with the one red button of the screen. What
 * the sheet holds (which team, whether the delete is on its way, what the
 * server refused with) is the visit's; `deleteTeam` (data/teams.mjs) owns the
 * request and what follows it: the list read again, the active team settled.
 */
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { teamUrl } from "../../core/routes.mjs";
import { onScreenLeave } from "../../core/screen-lifecycle.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { patchWithModal } from "../../components/dialog.mjs";
import { setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { toast } from "../../components/toast.mjs";
import { isTeamListRead, onActiveTeamChange } from "../../data/active-team.mjs";
import { loadGames } from "../../data/games.mjs";
import { deleteTeam, loadMyTeams, onMyTeamsChange, raceTitleOf } from "../../data/teams.mjs";
import { renderTeamFace, switcherRows } from "../../shell/team-switcher.mjs";
import { renderButton, renderIconButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { classNames } from "../../ui/markup.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { loadSeason } from "../season/season-data.mjs";
import { noTeamMarkup, unreadMarkup } from "../team/empty.mjs";
import { openAskedNewTeamSheet, openNewTeamSheet } from "./new-sheet.mjs";

const SHEET_ID = "team-delete";

/**
 * The sheet that asks before a team is deleted.
 * @typedef {object} Deleting
 * @property {string} id the team
 * @property {string} name
 * @property {boolean} pending the request is on its way
 * @property {string} refusal why the server (or the page) refused, as a sentence; "" before any refusal
 */

/** @param {Deleting} deleting */
function deleteSheet({ name, pending, refusal }) {
  const alert = refusal ? `<div role="alert">${renderCallout({ tone: "danger", title: refusal })}</div>` : "";
  return renderSheet({
    id: SHEET_ID,
    title: t("teams.delete.title"),
    bodyHtml: `<p class="g-teams__sheet-text">${escapeHtml(t("teams.delete.text", { name }))}</p>${alert}`,
    footHtml: renderButton({
      label: pending ? t("teams.delete.pending") : t("teams.delete.action", { name }),
      kind: "danger",
      data: { deleteConfirm: true },
    }),
  });
}

/** One team: its face as a link to its overview, ticked when it is the active one, and a chip or a bin at the right. */
function renderItem(row) {
  const tick = row.current ? `${icon("check", 20)}<span class="g-sr-only">${escapeHtml(t("teams.current"))}</span>` : "";
  const aside = row.inSeason
    ? renderStatusChip({ label: t("teams.inSeason") })
    : renderIconButton({ icon: "trash", label: t("teams.delete.action", { name: row.name }), data: { deleteTeam: row.id } });
  return `<li class="${classNames("g-teams__item", row.current && "g-teams__item--current")}">`
    + `<a class="g-teams__open" href="${escapeHtml(teamUrl(row.id))}">${renderTeamFace(row)}${tick}</a>${aside}</li>`;
}

/**
 * The screen for a coach with teams.
 *
 * @param {object} input
 * @param {ReturnType<typeof switcherRows>} input.rows the coach's teams, as the switcher reads them
 * @param {Deleting|null} [input.deleting] the sheet that is open, if one is
 * @returns {string}
 */
export function teamsMarkup({ rows, deleting = null }) {
  const head = renderPageHead({ title: t("teams.title"), sub: t("teams.subtitle"), phone: true });
  const add = renderButton({ label: t("teams.new"), kind: "primary", icon: "plus", dialog: true, data: { newTeam: true } });
  return `${head}<section class="g-teams-page"><ul class="g-teams">${rows.map(renderItem).join("")}</ul>`
    + `<div class="g-teams__foot">${add}<p class="g-teams__note">${escapeHtml(t("teams.deleteNote"))}</p></div></section>`
    + (deleting ? deleteSheet(deleting) : "");
}

/**
 * What one visit to the screen holds. A new object for every visit, so that an answer which comes after the
 * coach left (or came back) finds its own visit closed.
 * @typedef {object} Visit
 * @property {boolean} open the coach is still on the screen
 * @property {Deleting|null} deleting
 * @property {boolean} retrying the list is being read again, and the screen says so
 */

/** @type {Visit|null} */
let visit = null;

/** Draw the screen from the state: the list, the empty overview, or the list that did not load; the sheet over it if one is open. */
function draw() {
  if (!visit?.open || visit.retrying) return;
  const { items, error } = state.myTeams;
  if (!isTeamListRead() && error) {
    patchWithModal(view, unreadMarkup(error));
  } else if (!items.length) {
    patchWithModal(view, noTeamMarkup());
  } else {
    const rows = switcherRows({ teams: items, activeTeamId: state.activeTeamId, raceTitleOf, seasonData: state.season.data, games: state.games.items });
    patchWithModal(view, teamsMarkup({ rows, deleting: visit.deleting }), visit.deleting ? `#${SHEET_ID}` : "");
  }
}

/** Read the list again; a list with teams is the screen, an empty one the way to a first team, another failure says so again. */
async function retry() {
  const mine = visit;
  mine.retrying = true;
  view.innerHTML = `<div class="loading">${escapeHtml(t("myTeams.loadingTeams"))}</div>`;
  await loadMyTeams(true);
  mine.retrying = false;
  if (visit === mine) draw();
}

const focusTitle = () => view.querySelector("h1")?.focus();

/** The bin of a team, or null when the list has been drawn without it. */
const binOf = (teamId) => [...view.querySelectorAll("[data-delete-team]")].find((bin) => bin.getAttribute("data-delete-team") === teamId) ?? null;

function openDelete(teamId) {
  const team = state.myTeams.items.find((item) => item.id === teamId);
  if (!visit?.open || !team) return;
  visit.deleting = { id: team.id, name: team.name, pending: false, refusal: "" };
  draw();
}

/** Every way out of the sheet that deletes nothing: the focus goes back to the bin that opened it. */
function closeDelete() {
  const sheet = visit?.deleting;
  if (!sheet) return;
  visit.deleting = null;
  draw();
  binOf(sheet.id)?.focus();
}

/**
 * The red button. The request goes once: a press while it is on its way is no second delete. A refusal stays in
 * the sheet, with the button given back; the team gone closes it, says so, and takes the focus to the title (the
 * bin it was on is gone). A sheet the coach closed meanwhile, or a screen the coach left, hears the answer as a
 * message instead.
 */
async function confirmDelete() {
  const mine = visit;
  const sheet = mine?.deleting;
  if (!sheet || sheet.pending) return;
  sheet.pending = true;
  sheet.refusal = "";
  draw();
  const { refusal } = await deleteTeam(sheet.id);
  const shown = mine.open && mine.deleting === sheet;
  if (refusal) {
    if (shown) {
      sheet.pending = false;
      sheet.refusal = refusal;
      draw();
    } else {
      toast(refusal, { tone: "error" });
    }
    return;
  }
  toast(t("teams.deleted", { name: sheet.name }));
  if (!mine.open) return;
  if (shown) mine.deleting = null;
  draw();
  // The sheet's button is gone, and so may be the bin the focus went back to when the sheet was closed.
  if (shown || !document.activeElement || document.activeElement === document.body) focusTitle();
}

export function renderTeams() {
  setActiveNav("my-teams");
  setViewSection("teams");
  const mine = { open: true, deleting: null, retrying: false };
  const group = listenerGroup(view);
  // Registered first: the visit before this one (the same route drawn again) is released before this one is wired.
  onScreenLeave("teams", () => {
    mine.open = false;
    group.release();
  });
  visit = mine;
  group.on("click", "[data-delete-team]", (event, bin) => openDelete(bin.getAttribute("data-delete-team")));
  group.on("click", "[data-delete-confirm]", () => confirmDelete());
  group.on("click", "[data-teams-retry]", () => retry());
  // «New team», and «Create a team» of a coach with none: the sheet over the list, in a host of its own.
  group.on("click", "[data-new-team]", (event, button) => openNewTeamSheet(button));
  group.own(wireSheets(view, { onClose: closeDelete }));
  group.own(onMyTeamsChange(draw));
  group.own(onActiveTeamChange(draw));
  draw();
  openAskedNewTeamSheet(view.querySelector("[data-new-team]"));
  // The list is read again on every visit, as the 2.x screen did, and drawn when it comes (onMyTeamsChange): a team
  // registered for the season since the list was read has no bin now, but a chip. Not before the first draw, and
  // not for a list that never loaded: that one has its own retry, and a read begun under it would clear its reason.
  if (isTeamListRead()) void loadMyTeams(true);
  // A page opened on this address has not read the games and the table yet; the lines say where each team stands once they are in.
  void Promise.allSettled([loadGames(), loadSeason()]).then(() => {
    if (visit === mine) draw();
  });
}

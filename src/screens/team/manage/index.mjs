/**
 * The team page (`#/t/:id/team`; TeamManage, TeamManagePre on a phone, DeskRosterFunds, DeskRosterPreseason on a
 * desk): the treasury and the way to add to it or take from it, Coach's Safe and its correction by hand, the
 * resources the team holds, and what moved the money. It replaces the 2.x roster editor this address drew (plan
 * stage 08, decisions 18–20); the editor itself stays, for the roster and the administrator.
 *
 * The page is assembled here and decides nothing of its own: which phase the team is in, which match closes it and
 * which resource is open are the model's (`phaseOf`, `matchLock`, `resourceRows`); the parts are drawn and wired by
 * their modules (the strip, the two sheets, the resources, the history, the settings). `manageModel` gathers what the
 * page shows, `manageMarkup` draws it. A match on closes the money and the resources and says where to go (decision
 * 11); a match being prepared only warns.
 *
 * On a phone the page is a dark treasury card with «+ Add» and «− Take», then the safe, the correction, the
 * resources and the history, in that order (decision 19), and the DOM keeps it; a row last leads to the team's
 * settings, a screen of their own at their address (settings-screen.mjs; owner, 2026-10-20). On a desk the strip says
 * the treasury, and two columns follow: the resources at the left, the safe, the correction, the history and the
 * settings' card at the right (manage.css places them); their address is this page, the focus on the card. The width
 * is asked at each draw (`isPhone`), and the page is drawn again in the other form when it crosses 900px.
 */
import { drawKeepingFocus, drawScreen, escapeHtml, patch } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { postMatchUrl, preMatchUrl } from "../../../core/routes.mjs";
import { onScreenLeave } from "../../../core/screen-lifecycle.mjs";
import { state } from "../../../core/state.mjs";
import { view } from "../../../core/view.mjs";
import { loadGames, onGamesChange } from "../../../data/games.mjs";
import { teamValue } from "../../../data/team-record.mjs";
import { onMyTeamsChange, raceTeamOf } from "../../../data/teams.mjs";
import { isWriting, ledgerOf, onLedgerChange, readLedger } from "../../../data/treasury.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { renderPageHead } from "../../../ui/page-head.mjs";
import { renderStatusChip } from "../../../ui/status-chip.mjs";
import { loadSeason } from "../../season/season-data.mjs";
import { onSaveState, saveState } from "../roster/save.mjs";
import { isPhone, onPhoneChange } from "../roster/screen.mjs";
import { wireFixSheet } from "./fix-sheet.mjs";
import { historyExpanded, historyMarkup, safeMarkup, wireHistory } from "./history.mjs";
import { matchLock, phaseOf, resourceRows } from "./model.mjs";
import { resourcesMarkup, wireResources } from "./resources.mjs";
import { settingsEntryMarkup, settingsScreenMarkup } from "./settings-screen.mjs";
import { SETTINGS_PLACE, settingsMarkup, settingsModel, wireSettings } from "./settings.mjs";
import { renderTreasuryStrip, shutOpener, treasuryCardMarkup, wireTreasuryStrip } from "./strip.mjs";

/**
 * What the page shows of a team.
 *
 * @param {object} input
 * @param {object} input.team the team as `state.myTeams` holds it
 * @param {object|null} input.race the reference's entry for its race; null while the data has not come
 * @param {object|null} input.seasonData what `loadSeason` holds; null while it is not read
 * @param {object[]|null} input.games the coach's games (`state.games.items`)
 * @param {object} input.ledger what `ledgerOf` holds for the team: the whole of the lines read so far
 * @param {boolean} [input.expanded] the history is unfolded (`historyExpanded`)
 * @param {boolean} [input.busy] a save of the team is on its way (`isWriting`)
 * @param {boolean} [input.gamesUnknown] the games could not be read (`state.games.error`): whether a match is on is
 *   not known, and the lock judges the list read before, if any
 * @param {{status: string, waiting: number}} [input.queue] where the roster's queue stands (`saveState`): a step of
 *   it holds the settings
 * @param {boolean} [input.phone] the width is a phone's (`isPhone`)
 * @param {"page"|"settings"} [input.screen] the address: the team page's, or its settings' (a screen of its own on a phone)
 * @returns {{teamId: string, team: object, treasury: number, safe: number, worth: number|null,
 *   phase: ReturnType<typeof phaseOf>, lock: ReturnType<typeof matchLock>, rows: ReturnType<typeof resourceRows>,
 *   ledger: object, games: object[], expanded: boolean, busy: boolean, gamesUnknown: boolean, phone: boolean,
 *   screen: "page"|"settings", settings: ReturnType<typeof settingsModel>}} `team` is what the strip is drawn from
 */
export function manageModel({ team, race, seasonData, games, ledger, expanded = false, busy = false, gamesUnknown = false, queue, phone = false, screen = "page" }) {
  const roster = team.roster ?? {};
  const list = games ?? [];
  const lock = matchLock(list, team.id);
  return {
    teamId: team.id,
    team,
    treasury: countToNumber(roster.treasury),
    safe: countToNumber(roster.coachesSafe),
    worth: teamValue(team, race),
    phase: phaseOf(team, seasonData),
    lock,
    rows: resourceRows({ race, roster, stage: team.stage, locked: lock?.kind === "live" }),
    ledger,
    games: list,
    expanded,
    busy,
    gamesUnknown,
    phone,
    screen,
    settings: settingsModel({ team, race, lock, busy, queue }),
  };
}

/** The chip of the phase: a build waits, a season is on, a team out of it is neither. Literal keys, so the dictionary test finds them. */
function phaseChip({ key, round }) {
  if (key === "draft") return renderStatusChip({ label: t("treasury.phase.draft"), tone: "wait" });
  if (key === "out") return renderStatusChip({ label: t("treasury.phase.out") });
  const label = round ? t("treasury.phase.season", { round }) : t("treasury.phase.seasonNoRound");
  return renderStatusChip({ label, tone: "live" });
}

/** The steps of the pre-match a purchase resets, named as the pre-match names them (the server keeps fans and weather). */
const resetSteps = () => ({ roster: t("pre.step.roster"), inducements: t("pre.step.inducements"), kickoff: t("pre.step.review") });

/** Games that could not be read, said quietly: the page stays open, and a write may land in a match it does not know of. */
const unknownCallout = (gamesUnknown) => (gamesUnknown ? renderCallout({ tone: "warn", title: t("treasury.gamesUnknown") }) : "");

/** What a match does to the page, said above it, with the way to where it is finished or prepared; the games not read, unless a match is on. */
function lockCallout(lock, gamesUnknown) {
  if (lock?.kind === "live") return renderCallout({ tone: "warn", title: t("treasury.liveTitle"), sub: t("treasury.liveSub"), href: postMatchUrl(lock.game) });
  // A preparation known from games read before is the state most likely to have gone live since: both are said.
  if (lock?.kind === "preparing") return renderCallout({ tone: "warn", title: t("treasury.prepTitle"), sub: t("treasury.prepSub", resetSteps()), href: preMatchUrl(lock.game) }) + unknownCallout(gamesUnknown);
  return unknownCallout(gamesUnknown);
}

/** @param {ReturnType<typeof manageModel>} model */
export function manageMarkup(model) {
  const live = model.lock?.kind === "live";
  // The phone's settings screen says a match on and a preparation in the settings' words, and the games not read as here (L4).
  if (model.phone && model.screen === "settings") return settingsScreenMarkup(model, { noticeHtml: live ? "" : unknownCallout(model.gamesUnknown) });
  const head = renderPageHead({
    title: t("treasury.title"),
    sub: t("treasury.tv", { value: formatMoney(model.worth) }),
    metaHtml: phaseChip(model.phase),
    phone: true,
  });
  const side = `<div class="g-manage__side">${safeMarkup({ safe: model.safe, entries: model.ledger.entries })}`
    + `${shutOpener("g-manage__fix", `data-treasury-fix="${escapeHtml(model.teamId)}"`, t("treasury.fix.open"), live)}</div>`;
  const history = historyMarkup({ ledger: model.ledger, games: model.games, expanded: model.expanded });
  // The settings: the right column's last card on a desk (the columns keyed: a callout coming over them keeps their nodes,
  // and a focus in them); on a phone, a row last on the page leads to their screen.
  const [card, entry] = model.phone ? ["", settingsEntryMarkup(model.teamId)] : [settingsMarkup(model), ""];
  return `<div class="g-manage" data-screen="team-manage">${head}${lockCallout(model.lock, model.gamesUnknown)}`
    + `${renderTreasuryStrip({ team: model.team, games: model.games })}${treasuryCardMarkup(model, live)}`
    + `<div class="g-manage__cols" data-key="manage-cols">${side}${resourcesMarkup({ rows: model.rows, busy: model.busy })}${history}${card}</div>${entry}</div>`;
}

/** The page of `teamId` (its `screen`, at the width there is now) as the state has it now; "" when the team is not on the coach's list. */
function markupOf(teamId, screen) {
  const team = state.myTeams.items.find((item) => item.id === teamId);
  if (!team) return "";
  return manageMarkup(manageModel({
    team,
    race: raceTeamOf(team.baseTeamSlug),
    seasonData: state.season.data,
    games: state.games.items,
    ledger: ledgerOf(teamId),
    expanded: historyExpanded(teamId),
    // As fresh as this draw: a write's start is not announced, and a redraw then would turn a medic's switch back while its save is on its way.
    busy: isWriting(teamId),
    gamesUnknown: Boolean(state.games.error),
    queue: saveState(teamId),
    phone: isPhone(),
    screen,
  }));
}

/** Where a focus the other width's form leaves on nothing goes (L22): from the settings or on their address, their title or row; else the h1. */
const focusHome = (screen) => (screen === "settings" || document.activeElement?.closest?.(".g-team-settings, .g-team-settings-entry") ? SETTINGS_PLACE : "h1");

/**
 * The team page of one of the coach's teams. Drawn at once from the state, the title taking the focus (the history
 * says it is loading until it is read); then the games, the table and the history are read, and the page is drawn
 * again with them if the coach is still here. It follows the team (a write of its own or of a sheet), the games (a
 * match that goes live closes it) and the history while it is on screen, patching itself so the focus stays where the
 * coach has put it. A team not on the list (it was deleted meanwhile) draws nothing, as the overview does.
 *
 * Everything the page wires is on `view`, which outlives its redraws, and goes when the screen is left: the strip's
 * wiring holds the money sheet's host, the fix sheet and the settings hold their own. The settings' address (`settings`)
 * puts the first focus on their title — the phone's screen's h1, the desk's card's h2 — and the page's on its h1.
 * @param {string} teamId
 * @param {{settings?: boolean}} [options]
 */
export async function renderTeamManage(teamId, { settings = false } = {}) {
  const screen = settings ? "settings" : "page";
  const first = markupOf(teamId, screen);
  if (!first) return;
  let here = true;
  const draw = () => {
    if (!here) return;
    const markup = markupOf(teamId, screen);
    if (markup) patch(view, markup);
  };
  drawScreen(view, first);
  view.querySelector(settings ? "#team-settings-title" : "h1")?.focus();
  const releases = [
    onMyTeamsChange(draw),
    onGamesChange(draw),
    onLedgerChange(draw),
    wireTreasuryStrip(view),
    wireResources(view, teamId),
    wireFixSheet(view),
    wireHistory(view, teamId, draw),
    wireSettings(view, teamId),
    // The roster's queue holds the settings and lets them go (a team it does not hold: one call, nothing after).
    onSaveState(teamId, draw),
    onPhoneChange(() => drawKeepingFocus(view, draw, focusHome(screen))),
  ];
  onScreenLeave("team-manage", () => {
    here = false;
    for (const release of releases) release();
  });
  // The games are read again whatever the page holds of them: a list read at sign-in may be hours old, and a match that
  // went live since must close the page (nothing polls them while it is up). A season read that failed is made again.
  await Promise.allSettled([loadGames(true), loadSeason(Boolean(state.season.error)), readLedger(teamId)]);
  draw();
  // The reads drew the history, and perhaps a callout, over the desk's card: one the focus is still on is put in view again (T36 m3).
  const title = view.querySelector("#team-settings-title");
  if (here && settings && !isPhone() && title && document.activeElement === title) title.scrollIntoView?.({ block: "nearest" });
}

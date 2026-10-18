/**
 * The team page (`#/t/:id/team`; TeamManage, TeamManagePre on a phone, DeskRosterFunds, DeskRosterPreseason on a
 * desk): the treasury and the way to add to it or take from it, Coach's Safe and its correction by hand, the
 * resources the team holds, and what moved the money. It replaces the 2.x roster editor this address drew (plan
 * stage 08, decisions 18–20); the editor itself stays, for the roster and the administrator.
 *
 * The page is assembled here and decides nothing of its own: which phase the team is in, which match closes it and
 * which resource is open are the model's (`phaseOf`, `matchLock`, `resourceRows`); the parts are drawn and wired by
 * their modules (the strip, the two sheets, the resources, the history). `manageModel` gathers what the page shows,
 * `manageMarkup` draws it. A match on closes the money and the resources and says where to go (decision 11); a
 * match being prepared only warns.
 *
 * On a phone the page is a dark treasury card with «+ Add» and «− Take», then the safe, the correction, the
 * resources and the history, in that order (decision 19), and the DOM keeps it. On a desk the strip says the
 * treasury, and two columns follow: the resources at the left, the safe, the correction and the history at the
 * right (manage.css places them).
 */
import { drawScreen, escapeHtml, patch } from "../../../core/dom.mjs";
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
import { wireFixSheet } from "./fix-sheet.mjs";
import { historyExpanded, historyMarkup, safeMarkup, wireHistory } from "./history.mjs";
import { matchLock, phaseOf, resourceRows } from "./model.mjs";
import { resourcesMarkup, wireResources } from "./resources.mjs";
import { renderTreasuryStrip, wireTreasuryStrip } from "./strip.mjs";

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
 * @returns {{teamId: string, team: object, treasury: number, safe: number, worth: number|null,
 *   phase: ReturnType<typeof phaseOf>, lock: ReturnType<typeof matchLock>, rows: ReturnType<typeof resourceRows>,
 *   ledger: object, games: object[], expanded: boolean, busy: boolean}} `team` is what the strip is drawn from
 */
export function manageModel({ team, race, seasonData, games, ledger, expanded = false, busy = false }) {
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
  };
}

/** The chip of the phase: a build waits, a season is on, a team out of it is neither. Literal keys, so the dictionary test finds them. */
function phaseChip({ key, round }) {
  if (key === "draft") return renderStatusChip({ label: t("treasury.phase.draft"), tone: "wait" });
  if (key === "out") return renderStatusChip({ label: t("treasury.phase.out") });
  const label = round ? t("treasury.phase.season", { round }) : t("treasury.phase.seasonNoRound");
  return renderStatusChip({ label, tone: "live" });
}

/** What a match does to the page, said above it, with the way to where it is finished or prepared; nothing without one. */
function lockCallout(lock) {
  if (lock?.kind === "live") return renderCallout({ tone: "warn", title: t("treasury.liveTitle"), sub: t("treasury.liveSub"), href: postMatchUrl(lock.game) });
  if (lock?.kind === "preparing") return renderCallout({ tone: "warn", title: t("treasury.prepTitle"), sub: t("treasury.prepSub"), href: preMatchUrl(lock.game) });
  return "";
}

/**
 * A button that opens a sheet. While a match is on it is shut, not disabled (it keeps its place in the tab order and
 * says why when pressed: the strip's and the fix sheet's wiring read the `title`).
 */
function opener(className, data, label, live) {
  const shut = live ? ` aria-disabled="true" title="${escapeHtml(t("treasury.lockedLive"))}"` : "";
  return `<button type="button" class="${className}" ${data} aria-haspopup="dialog"${shut}>${escapeHtml(label)}</button>`;
}

/** The phone's treasury card: the sum, the team's value, and «+ Add» / «− Take», which open the strip's sheet. */
function cardMarkup(model, live) {
  const id = escapeHtml(model.teamId);
  const money = (sign, className, label) => opener(className, `data-treasury-money="${id}" data-treasury-sign="${sign}"`, label, live);
  return `<section class="g-manage__card" aria-labelledby="manage-card-title"><div class="g-manage__card-text">`
    + `<h2 class="g-manage__card-title" id="manage-card-title">${escapeHtml(t("roster.treasuryTitle"))}</h2>`
    + `<span class="g-manage__card-sum">${escapeHtml(formatMoney(model.treasury))}</span>`
    + `<span class="g-manage__card-tv">${escapeHtml(t("treasury.tv", { value: formatMoney(model.worth) }))}</span></div>`
    + `<div class="g-manage__card-actions">${money("1", "g-manage__in", t("treasury.in"))}${money("-1", "g-manage__out", t("treasury.out"))}</div></section>`;
}

/** @param {ReturnType<typeof manageModel>} model */
export function manageMarkup(model) {
  const live = model.lock?.kind === "live";
  const head = renderPageHead({
    title: t("treasury.title"),
    sub: t("treasury.tv", { value: formatMoney(model.worth) }),
    metaHtml: phaseChip(model.phase),
    phone: true,
  });
  const side = `<div class="g-manage__side">${safeMarkup({ safe: model.safe, entries: model.ledger.entries })}`
    + `${opener("g-manage__fix", `data-treasury-fix="${escapeHtml(model.teamId)}"`, t("treasury.fix.open"), live)}</div>`;
  const history = historyMarkup({ ledger: model.ledger, games: model.games, expanded: model.expanded });
  return `<div class="g-manage" data-screen="team-manage">${head}${lockCallout(model.lock)}`
    + `${renderTreasuryStrip({ team: model.team, games: model.games })}${cardMarkup(model, live)}`
    + `<div class="g-manage__cols">${side}${resourcesMarkup({ rows: model.rows, busy: model.busy })}${history}</div></div>`;
}

/** The page of `teamId` as the state has it now; "" when the team is not on the coach's list. */
function markupOf(teamId) {
  const team = state.myTeams.items.find((item) => item.id === teamId);
  if (!team) return "";
  return manageMarkup(manageModel({
    team,
    race: raceTeamOf(team.baseTeamSlug),
    seasonData: state.season.data,
    games: state.games.items,
    ledger: ledgerOf(teamId),
    expanded: historyExpanded(teamId),
    busy: isWriting(teamId),
  }));
}

/**
 * The team page of one of the coach's teams. Drawn at once from the state, the title taking the focus (the history
 * says it is loading until it is read); then the games, the table and the history are read, and the page is drawn
 * again with them if the coach is still here. It follows the team (a write of its own or of a sheet), the games (a
 * match that goes live closes it) and the history while it is on screen, patching itself so the focus stays where the
 * coach has put it. A team not on the list (it was deleted meanwhile) draws nothing, as the overview does.
 *
 * Everything the page wires is on `view`, which outlives its redraws, and goes when the screen is left: the strip's
 * wiring holds the money sheet's host, the fix sheet holds its own.
 * @param {string} teamId
 */
export async function renderTeamManage(teamId) {
  const first = markupOf(teamId);
  if (!first) return;
  let here = true;
  const draw = () => {
    if (!here) return;
    const markup = markupOf(teamId);
    if (markup) patch(view, markup);
  };
  drawScreen(view, first);
  view.querySelector("h1")?.focus();
  const releases = [
    onMyTeamsChange(draw),
    onGamesChange(draw),
    onLedgerChange(draw),
    wireTreasuryStrip(view),
    wireResources(view, teamId),
    wireFixSheet(view),
    wireHistory(view, teamId, draw),
  ];
  onScreenLeave("team-manage", () => {
    here = false;
    for (const release of releases) release();
  });
  // A read that failed before is made again: the games say whether a match closes the page.
  await Promise.allSettled([loadGames(Boolean(state.games.error)), loadSeason(Boolean(state.season.error)), readLedger(teamId)]);
  draw();
}

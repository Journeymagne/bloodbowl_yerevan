/**
 * The treasury strip of the desk roster (DeskRoster): the money and what the team holds in one row, and the way
 * to add or take money. Stage 07a puts it over the roster table; its two exports are that stage's contract —
 * renderTreasuryStrip({team}) and wireTreasuryStrip(root). The strip redraws itself when the team or the games
 * change, and its sheet lives in a host of its own on the body, so a screen redrawing around it closes nothing.
 *
 * What the strip announces. Every write of the team page (an entry by hand, a step of a resource, a correction
 * of a roster) replaces the team in `state.myTeams` (`setMyTeams`, data/treasury.mjs) and is announced by
 * `onMyTeamsChange` (data/teams.mjs), whose listeners read the new revision off the list. A screen with a save
 * queue of its own, which sends a revision with each save, takes it from there and not from a copy it kept; the
 * strip itself keeps none and reads the team and the games again at each announcement.
 *
 * The cells are what `resourceRows` says the team holds (a counter's number, a medic's yes or no); what is closed
 * to the coach's hand is not the strip's business, but a resource the race cannot have (Bribes without Bribery and
 * Corruption) has no cell. Nothing is entered during a match: the button says why, as the sheet would.
 */
import { toast } from "../../../components/toast.mjs";
import { escapeHtml, listenerGroup, patch } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { onGamesChange } from "../../../data/games.mjs";
import { onMyTeamsChange, raceTeamOf } from "../../../data/teams.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { icon } from "../../../ui/icons.mjs";
import { matchLock, resourceRows } from "./model.mjs";
import { openMoneySheet, wireMoneySheet } from "./money-sheet.mjs";
import { mountSheetHost, unmountSheetHost } from "./sheet-host.mjs";

const cell = (label, value, modifier = "") => `<div class="g-funds__cell${modifier}"><span class="g-funds__k">${escapeHtml(label)}</span><span class="g-funds__v">${escapeHtml(value)}</span></div>`;

/** The cell of a resource the team holds: a counter's number, a medic's yes or no; none for one its race cannot have. */
function resourceCell(row) {
  if (row.lock === "unavailable") return "";
  const value = row.kind === "medic" ? t(row.value > 0 ? "treasury.strip.yes" : "treasury.strip.no") : String(row.value);
  return cell(t(`treasury.strip.${row.key}`), value);
}

/** The edit button: «Add», or the reason it is shut while a match is on (the sheet says the same). Keyed, so a patch keeps the focus on it. */
function editButton(teamId, live) {
  const shut = live ? ` aria-disabled="true" title="${escapeHtml(t("treasury.lockedLive"))}"` : "";
  return `<button type="button" class="g-funds__edit" data-key="treasury-edit" data-treasury-money="${escapeHtml(teamId)}" data-treasury-sign="1" aria-label="${escapeHtml(t("treasury.strip.edit"))}"${shut}>${icon("pencil")}</button>`;
}

/** What stands in the strip: the cells and the button; the section around them stays when the strip is patched. */
function stripContent(team, games) {
  const rows = resourceRows({ race: raceTeamOf(team.baseTeamSlug), roster: team.roster, stage: team.stage });
  const money = cell(t("roster.treasuryTitle"), formatMoney(countToNumber(team.roster?.treasury)), " g-funds__cell--money");
  return money + rows.map(resourceCell).join("") + editButton(team.id, matchLock(games, team.id)?.kind === "live");
}

/**
 * The strip of one team.
 *
 * @param {object} input
 * @param {object} input.team the team as `state.myTeams` holds it
 * @param {object[]|null} [input.games] the coach's games, to know whether a match is on; the app's own list unless
 *   the screen gives the one it draws from
 * @returns {string} a section, hidden up to 900px (the phone has the treasury card)
 */
export function renderTreasuryStrip({ team, games = state.games.items }) {
  return `<section class="g-funds" data-treasury-strip="${escapeHtml(team.id)}" aria-label="${escapeHtml(t("treasury.title"))}">${stripContent(team, games)}</section>`;
}

/** Every strip under `root` is drawn again from what the page holds now; one whose team is gone from the list stays as it was. */
function redrawStrips(root) {
  for (const section of root.querySelectorAll("[data-treasury-strip]")) {
    const team = state.myTeams.items.find((item) => item.id === section.getAttribute("data-treasury-strip"));
    if (team) patch(section, stripContent(team, state.games.items));
  }
}

/**
 * The press on an edit button: the sheet, or, while a match is on, the reason the button was shut with.
 * Any `[data-treasury-money]` under the root is one (the strip's, the phone's treasury card): the sign is the button's own.
 */
function press(host, button) {
  if (button.getAttribute("aria-disabled") === "true") {
    toast(button.getAttribute("title"), { tone: "error" });
    return;
  }
  openMoneySheet(host, { teamId: button.getAttribute("data-treasury-money"), sign: Number(button.getAttribute("data-treasury-sign")) || 1, opener: button });
}

/**
 * Everything the strips under `root` do: a press on an edit button opens «Add / Take» in a host of its own on the
 * body, and the strips draw themselves again when the coach's teams or games change, so a screen has nothing to
 * redraw after an entry.
 *
 * @param {Element} root the screen's element, which holds the strips (and any other `[data-treasury-money]` button)
 * @returns {() => void} removes the listeners, closes the sheet and takes its host away
 */
export function wireTreasuryStrip(root) {
  const host = mountSheetHost("treasury-money");
  const group = listenerGroup(root);
  group.own(wireMoneySheet(host));
  group.on("click", "[data-treasury-money]", (event, button) => press(host, button));
  const redraw = () => redrawStrips(root);
  group.own(onMyTeamsChange(redraw));
  group.own(onGamesChange(redraw));
  return () => {
    group.release();
    unmountSheetHost(host);
  };
}

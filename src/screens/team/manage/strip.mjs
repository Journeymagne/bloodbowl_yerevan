/**
 * The treasury strip of the desk roster (DeskRoster): the money and what the team holds in one row, and the pencil
 * that leads to the team page, where they are changed. Stage 07a puts it over the roster
 * table; two of its exports are that stage's contract — renderTreasuryStrip({team}) and wireStripRedraw(root), which
 * draws it again when the team changes.
 *
 * The others are the team page's (index.mjs): its phone's treasury card (`treasuryCardMarkup`), whose «+ Add» and
 * «− Take», and its desk's (`treasuryBlockMarkup`), whose pencil, open «Add / Take» (`wireMoneyOpeners`), in a host
 * of its own on the body, so a screen redrawing around it closes nothing; and the shut opener they draw (`shutOpener`).
 *
 * What the strip announces. Every write of the team page (an entry by hand, a step of a resource, a correction
 * of a roster) replaces the team in `state.myTeams` (`adopt` in data/treasury.mjs, via `setMyTeams` of
 * data/teams.mjs) and is announced by `onMyTeamsChange` (data/teams.mjs), whose listeners read the new revision
 * off the list. A screen with a save
 * queue of its own, which sends a revision with each save, takes it from there and not from a copy it kept; the
 * strip itself keeps none and reads the team again at each announcement.
 *
 * The cells are what `resourceRows` says the team holds (a counter's number, a medic's yes or no); what is closed
 * to the coach's hand is not the strip's business, but a resource priced by a race not read yet (Bribes) has no
 * cell. The pencil is a link even during a match: the team page says what the match closes there. Nothing is entered
 * during a match: a shut opener of the team page says why, as the sheet would.
 *
 * Wire once per screen mount, and keep the function each wiring returns for `onScreenLeave`.
 */
import { toast } from "../../../components/toast.mjs";
import { escapeHtml, listenerGroup, patch } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamUrl } from "../../../core/routes.mjs";
import { state } from "../../../core/state.mjs";
import { onMyTeamsChange, raceTeamOf } from "../../../data/teams.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { icon } from "../../../ui/icons.mjs";
import { resourceRows } from "./model.mjs";
import { openMoneySheet, wireMoneySheet } from "./money-sheet.mjs";
import { mountSheetHost, unmountSheetHost } from "./sheet-host.mjs";

const cell = (label, value, modifier = "") => `<div class="g-funds__cell${modifier}"><span class="g-funds__k">${escapeHtml(label)}</span><span class="g-funds__v">${escapeHtml(value)}</span></div>`;

/** The cell of a resource the team holds: a counter's number, a medic's yes or no; none for bribes before the race is read. */
function resourceCell(row) {
  if (row.lock === "unavailable") return "";
  const value = row.kind === "medic" ? t(row.value > 0 ? "treasury.strip.yes" : "treasury.strip.no") : String(row.value);
  return cell(t(`treasury.strip.${row.key}`), value);
}

/** Keyed, so a patch keeps the focus on it. */
function editLink(teamId) {
  return `<a class="g-funds__edit" data-key="treasury-edit" href="${escapeHtml(teamUrl(teamId, "team"))}" aria-label="${escapeHtml(t("treasury.title"))}">${icon("pencil")}</a>`;
}

/**
 * A button that opens a sheet. While a match is on it is shut, not disabled (it keeps its place in the tab order and
 * says why when pressed: the strip's and the fix sheet's wiring read the `title`).
 */
export function shutOpener(className, data, label, live) {
  const shut = live ? ` aria-disabled="true" title="${escapeHtml(t("treasury.lockedLive"))}"` : "";
  return `<button type="button" class="${className}" ${data} aria-haspopup="dialog"${shut}>${escapeHtml(label)}</button>`;
}

/** The phone's treasury card of the team page: the sum, the team's value, and «+ Add» / «− Take», which open the strip's sheet. */
export function treasuryCardMarkup(model, live) {
  const id = escapeHtml(model.teamId);
  const money = (sign, className, label) => shutOpener(className, `data-treasury-money="${id}" data-treasury-sign="${sign}"`, label, live);
  return `<section class="g-manage__card" aria-labelledby="manage-card-title"><div class="g-manage__card-text">`
    + `<h2 class="g-manage__card-title" id="manage-card-title">${escapeHtml(t("roster.treasuryTitle"))}</h2>`
    + `<span class="g-manage__card-sum">${escapeHtml(formatMoney(model.treasury))}</span>`
    + `<span class="g-manage__card-tv">${escapeHtml(t("treasury.tv", { value: formatMoney(model.worth) }))}</span></div>`
    + `<div class="g-manage__card-actions">${money("1", "g-manage__in", t("treasury.in"))}${money("-1", "g-manage__out", t("treasury.out"))}</div></section>`;
}

/** The desk's «Treasury» card of the team page; `after` is what index.mjs puts under the sum (the safe, the correction). */
export function treasuryBlockMarkup(model, live, after = "") {
  const shut = live ? ` aria-disabled="true" title="${escapeHtml(t("treasury.lockedLive"))}"` : "";
  const edit = `<button type="button" class="g-resource__btn" data-treasury-money="${escapeHtml(model.teamId)}" data-treasury-sign="1" aria-haspopup="dialog"`
    + ` aria-label="${escapeHtml(t("treasury.edit"))}"${shut}>${icon("pencil", 18)}</button>`;
  const title = escapeHtml(t("roster.treasuryTitle"));
  return `<section class="g-manage__treasury" data-key="manage-treasury" aria-labelledby="manage-treasury-title">`
    + `<h2 class="g-manage__treasury-title" id="manage-treasury-title">${title}</h2>`
    + `<div class="${live ? "g-resource g-resource--locked" : "g-resource"}"><span class="g-resource__text"><span class="g-resource__name">${escapeHtml(t("treasury.balance"))}</span></span>`
    + `<span class="g-resource__stepper"><span class="g-resource__value g-manage__treasury-sum">${escapeHtml(formatMoney(model.treasury))}</span>${edit}</span></div>`
    + `${after}</section>`;
}

/** What stands in the strip: the cells and the pencil; the section around them stays when the strip is patched. */
function stripContent(team) {
  const roster = team.roster ?? {};
  const rows = resourceRows({ race: raceTeamOf(team.baseTeamSlug), roster, stage: team.stage });
  const money = cell(t("roster.treasuryTitle"), formatMoney(countToNumber(roster.treasury)), " g-funds__cell--money");
  return money + rows.map(resourceCell).join("") + editLink(team.id);
}

/**
 * The strip of one team.
 *
 * @param {object} input
 * @param {object} input.team the team as `state.myTeams` holds it
 * @returns {string} a section, hidden up to 900px (the phone has the Team tab's treasury card)
 */
export function renderTreasuryStrip({ team }) {
  return `<section class="g-funds" data-treasury-strip="${escapeHtml(team.id)}" aria-label="${escapeHtml(t("treasury.strip.title"))}">${stripContent(team)}</section>`;
}

/**
 * The strips under `root` drawn again whenever the coach's teams change; one whose team is gone from the list stays as
 * it was. @returns {() => void} the listener's removal
 */
export function wireStripRedraw(root) {
  return onMyTeamsChange(() => {
    for (const section of root.querySelectorAll("[data-treasury-strip]")) {
      const team = state.myTeams.items.find((item) => item.id === section.getAttribute("data-treasury-strip"));
      if (team) patch(section, stripContent(team));
    }
  });
}

/**
 * The press on an opener of the sheet: the sheet, or, while a match is on, the reason the button was shut with (its
 * `title`; a shut button that gives none is shut by the match, which is the one reason there is). Any
 * `[data-treasury-money]` under the root is one (the phone card's «+ Add» and «− Take», the desk card's pencil): the
 * sign is the button's own.
 */
function press(host, button) {
  if (button.getAttribute("aria-disabled") === "true") {
    toast(button.getAttribute("title") || t("treasury.lockedLive"), { tone: "error" });
    return;
  }
  openMoneySheet(host, { teamId: button.getAttribute("data-treasury-money"), sign: Number(button.getAttribute("data-treasury-sign")) || 1, opener: button });
}

/** root → what its wiring holds: how many hold it, and how to take it away. */
const wired = new WeakMap();

/** A holder's release, spent once: the wiring goes with the last one. */
function releaseOf(root, entry) {
  let spent = false;
  return () => {
    if (spent) return;
    spent = true;
    entry.holders -= 1;
    if (entry.holders > 0) return;
    wired.delete(root);
    entry.release();
  };
}

/**
 * The team page's openers of «Add / Take» under `root` (`[data-treasury-money]`): a press opens the sheet in a host of
 * its own on the body. A root is wired once: wiring it again shares the first wiring (one host, one dialog, one
 * listener) and returns a release of its own, and everything goes when the last release is called.
 *
 * @param {Element} root the screen's element
 * @returns {() => void} removes the listeners, closes the sheet and takes its host away
 */
export function wireMoneyOpeners(root) {
  const held = wired.get(root);
  if (held) {
    held.holders += 1;
    return releaseOf(root, held);
  }
  const host = mountSheetHost("treasury-money");
  const group = listenerGroup(root);
  group.own(wireMoneySheet(host));
  group.on("click", "[data-treasury-money]", (event, button) => press(host, button));
  const entry = {
    holders: 1,
    release() {
      group.release();
      unmountSheetHost(host);
    },
  };
  wired.set(root, entry);
  return releaseOf(root, entry);
}

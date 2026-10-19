/**
 * The roster's markup: the band with its counts, the table, and beside it on a desk the chosen player's panel;
 * a skill's or an injury's sheet over it when one is open. What a line says is model.mjs's, the row's panel and
 * the side panel panel.mjs's, the sheets sheets.mjs's.
 *
 * The player's button does what the width it is drawn at does with it (R11): up to 900px it opens his row
 * (`aria-expanded`, and the row's panel it controls), from 901px it chooses him for the panel beside the table
 * (`aria-controls` names the panel, `aria-current` marks the one in it). The screen draws again when the width
 * crosses 900px.
 *
 * Above the table stand what the coach has to keep in mind: a preparation or a match that is on (Task 11,
 * decisions 12 and 13), and the save's trouble (Task 10); then, on a desk, stage 08's treasury strip (Task 15).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { postMatchUrl, preMatchUrl } from "../../../core/routes.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { icon } from "../../../ui/icons.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderPageHead } from "../../../ui/page-head.mjs";
import { renderRosterTable } from "../../../ui/roster-table.mjs";
import { renderStatusChip } from "../../../ui/status-chip.mjs";
import { renderToggle } from "../../../ui/toggle.mjs";
import { MAIN_COUNTERS, rosterCounts } from "./model.mjs";
import { matchWords, rowPanelMarkup, sidePanelMarkup, skillChipsMarkup } from "./panel.mjs";
import { injurySheetMarkup, skillSheetMarkup } from "./sheets.mjs";
import { stripMarkup } from "./strip.mjs";

/** The id of the panel beside the table, which a desk's player buttons control. */
export const ASIDE_ID = "roster-aside";
/** What wireToggles reports for «Edit outside the match». */
export const OUTSIDE_TOGGLE = "roster-outside";
/** The id of what the switch is described by: why it is there, which does not fit beside it in the banner (K9). */
const OUTSIDE_NOTE = "roster-outside-note";

/**
 * @typedef {object} RosterScreen
 * @property {object|null} team the team as last read: id, name, baseTeamSlug; null before the first answer
 * @property {object|null} race its page in the reference
 * @property {object} data the reference (state.data): the skills' pages
 * @property {(import("./model.mjs").PlayerLine & {sessionSpp: number, sessionOutside: number})[]} lines in the order of
 *   `memory.sort`; `sessionSpp` is what his SPP has moved since the screen opened, `sessionOutside` what the edits
 *   outside the match alone have moved it (`sessionSppOf`)
 * @property {{kind: "plain"|"prep"|"match", game?: object, round?: number|null}} mode
 * @property {{sort: object|null, selected: string|null, outside: string|null}} memory (memory.mjs)
 * @property {boolean} outside «Edit outside the match» is on for the match on (`memory.outside` is its game id, R13)
 * @property {{status: string, waiting: number, refusal: string}} save where the roster's save queue stands (`saveState`)
 * @property {string} lock why every counter is closed just now: the games unread («Loading the matches…») or unreadable
 *   (the failure); the records read again during a match or after one ended («Reading the records…»); or a conflict
 *   the coach has to settle; "" when none
 * @property {string} sideLocked why the match's own taps are closed: the server's refusal `EVENT_SIDE_LOCKED` (the
 *   side has saved its Players step), until the records are read again; "" when they are open
 * @property {number} records the rows of the match on that the team has, as last read: what its banner counts
 * @property {{kind: "skill", key: string, name: string}|{kind: "injury", key: string, gameId: string, choice: {code: string, stat: string}, busy: boolean, reason: string}|null} sheet
 *   the sheet that is open: a skill's rule, or an injury of the match `gameId` with what is chosen in it ("" for
 *   nothing yet), whether an injury of the player is on its way (R14), and why none can be recorded just now
 * @property {boolean} unsure an injury's answer was lost and the read that followed failed: whether it was written is
 *   not known, so no injury is recorded until a read of the records succeeds (R14)
 * @property {string} error a read that failed, "" when none
 * @property {boolean} loading the roster has not been read yet (or is read again after a failure)
 * @property {boolean} phone the width the screen is drawn at is a phone's (`(max-width: 900px)`)
 */

/** The table's columns: the player, the five characteristics, and on a desk the career and the SPP. */
function columnsOf() {
  return [
    { key: "player", label: t("teamRoster.column.player") },
    ...PLAYER_STATS.map((stat) => ({ key: stat, label: t(`stats.${stat}`), group: "stats" })),
    ...MAIN_COUNTERS.map((counter) => ({ key: counter, label: t(`teamRoster.counter.${counter}`), name: t(`teamRoster.counterName.${counter}`), group: "career", desk: true })),
    { key: "earned", label: t("teamRoster.column.earned"), group: "spp", desk: true },
    { key: "available", label: t("teamRoster.column.available"), name: t("teamRoster.available"), group: "spp", desk: true },
  ];
}

/** The over-heads from 901px: «Characteristics», «Career», «SPP». */
function groupsOf() {
  return [
    { label: t("teamRoster.group.stats"), span: PLAYER_STATS.length },
    { label: t("teamRoster.group.career"), span: MAIN_COUNTERS.length },
    { label: t("teamRoster.group.spp"), span: 2 },
  ];
}

/** A characteristic: as the model writes it, a change tinted and said in words. */
function statCell({ text, change }) {
  const note = change === "up" ? t("ui.stat.improved") : change === "down" ? t("ui.stat.lowered") : "";
  return { text, tone: change, note };
}

/** An injury in words: «Seriously Hurt», a lasting one with its characteristic, «Lasting Injury (AG)». */
function injuryWords({ code, stat }) {
  const injury = t(`teamRoster.injury.${code}`);
  return stat ? t("teamRoster.injury.withStat", { injury, stat: t(`stats.${stat}`) }) : injury;
}

/** The line under a player's name while an injury of the match on stands for him (Task 12): «Lasting Injury (AG) · round 3»; "" when none does. */
function injuryLine(line, mode) {
  return mode.kind === "match" && line.injury ? t("teamRoster.injury.line", { injury: injuryWords(line.injury), match: matchWords(mode) }) : "";
}

/** A count: quiet at zero. */
const countCell = (count) => ({ text: String(count), tone: count === 0 ? "zero" : "" });

/** A line's cells; in a match each count of the career says what the match has added to it («+1»). */
function cellsOf(line, { mode }) {
  const added = (counter) => (mode.kind === "match" ? line.match[counter] : 0);
  return [
    ...PLAYER_STATS.map((stat) => statCell(line.stats[stat])),
    ...MAIN_COUNTERS.map((counter) => ({ ...countCell(line.career[counter] ?? 0), delta: added(counter) })),
    { text: String(line.earned) },
    { text: String(line.available), tone: "strong" },
  ];
}

/**
 * Whose row is open (a phone) and who stands in the panel (a desk): the player the coach chose while he is
 * still on the roster; on a desk the table's first when there is none.
 */
function choiceOf({ lines, memory }) {
  const open = lines.some((line) => line.key === memory.selected) ? memory.selected : null;
  return { open, chosen: open ?? lines[0]?.key ?? null };
}

/**
 * A player's row: the open row's panel on a phone, the mark of the panel's player on a desk. Under his name an
 * injury the match on has dealt him (Task 12), else that he misses the next match, else his position.
 */
function rowOf(line, screen, choice) {
  const injury = injuryLine(line, screen.mode);
  const row = {
    key: line.key,
    badgeHtml: renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain }),
    name: line.name,
    sub: injury || (line.skip ? t("teamRoster.skip") : line.position),
    alert: Boolean(injury) || line.skip,
    cells: cellsOf(line, screen),
    skillsHtml: skillChipsMarkup(line),
  };
  if (!screen.phone) return { ...row, selected: choice.chosen === line.key, controls: ASIDE_ID };
  const expanded = choice.open === line.key;
  return { ...row, expanded, panelHtml: expanded ? rowPanelMarkup(line, screen) : "" };
}

/**
 * The save's state in a few words at the right of «Active roster», in a live region a screen reader hears: on the
 * way, saved (until the next step), waiting for the network with the edits that wait, not saved; nothing at rest.
 */
function statusMarkup({ status, waiting }) {
  let chip = "";
  if (status === SAVE_STATUS.SAVING || status === SAVE_STATUS.DIRTY) chip = renderStatusChip({ label: t("teamRoster.status.saving"), tone: "wait" });
  else if (status === SAVE_STATUS.SAVED) chip = renderStatusChip({ label: t("teamRoster.status.saved"), tone: "live" });
  else if (status === SAVE_STATUS.OFFLINE) chip = renderStatusChip({ label: t("teamRoster.status.waiting", { count: waiting }), tone: "wait" });
  else if (status === SAVE_STATUS.CONFLICT || status === SAVE_STATUS.ERROR) chip = renderStatusChip({ label: t("teamRoster.status.unsaved"), tone: "danger" });
  return `<span class="g-roster__status" role="status">${chip}</span>`;
}

/** A banner's way to where its news is dealt with: one line, a thumb tall, in the banner's own ink. */
const calloutLink = (href, label) => `<a class="g-roster__calloutlink" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;

/**
 * A preparation that is on (decision 12): yellow, what any save of the roster resets — the steps named as the
 * pre-match names them (R12) — and the way to it. Nothing is closed: a save only sends the coach back to those steps.
 */
function prepMarkup({ mode }) {
  const title = mode.round === null ? t("teamRoster.prep.titleFriendly") : t("teamRoster.prep.title", { round: mode.round });
  const sub = t("teamRoster.prep.sub", { roster: t("pre.step.roster"), inducements: t("pre.step.inducements"), kickoff: t("pre.step.kickoff") });
  return renderCallout({ tone: "warn", title, sub, actionHtml: calloutLink(preMatchUrl(mode.game), t("teamRoster.prep.link")) });
}

/**
 * A match that is on (decision 13): green while a tap is a record of it, yellow with «Edit outside the match» on (as
 * StatsLive and spec §7); its records counted, the switch, and the way to the post-match. The switch's explanation
 * is its description (K9), not a line beside it: the banner's action is the switch and the link.
 */
function matchMarkup({ mode, outside, records }) {
  const match = matchWords(mode);
  const toggle = renderToggle({ key: OUTSIDE_TOGGLE, label: t("teamRoster.match.outside"), checked: outside, describedBy: OUTSIDE_NOTE });
  const note = `<span id="${OUTSIDE_NOTE}" hidden>${escapeHtml(t("teamRoster.match.outsideCaption", { match }))}</span>`;
  const actionHtml = `<div class="g-roster__calloutactions">${toggle}${note}${calloutLink(postMatchUrl(mode.game), t("teamRoster.match.postMatch"))}</div>`;
  return renderCallout({
    tone: outside ? "warn" : "accent",
    title: t("teamRoster.match.title", { match, count: records }),
    sub: outside ? t("teamRoster.match.outsideSub") : t("teamRoster.match.sub"),
    actionHtml,
  });
}

/**
 * What the coach has to know of the save (spec UI §8): another device's save, which only he can settle — «Load the
 * new one» reads the team again and gives his edit up; no network, with the edits that wait and the offline sign
 * before the words.
 */
function saveNoticeMarkup({ save }) {
  if (save.status === SAVE_STATUS.CONFLICT) {
    const actionHtml = renderButton({ label: t("teamRoster.conflict.reload"), kind: "primary", data: { rosterReload: true } });
    return renderCallout({ tone: "danger", title: t("teamRoster.conflict.title"), sub: t("teamRoster.conflict.sub"), actionHtml });
  }
  if (save.status !== SAVE_STATUS.OFFLINE) return "";
  const callout = renderCallout({ tone: "warn", title: t("teamRoster.offline.title"), sub: t("teamRoster.offline.sub", { count: save.waiting }) });
  return `<div class="g-roster__offline">${icon("offline", 22)}${callout}</div>`;
}

/**
 * An injury whose fate is not known (R14): its answer was lost and the read that followed failed. No injury is
 * recorded until a read succeeds, and «Try again» reads the records again.
 */
function unsureMarkup({ mode, unsure }) {
  if (mode.kind !== "match" || !unsure) return "";
  return renderCallout({ tone: "danger", title: t("teamRoster.injury.unsure"), actionHtml: renderButton({ label: t("teamRoster.readAgain"), data: { rosterReread: true } }) });
}

/** The banners above the table: the preparation or the match that is on, an injury whose fate is not known, then the save's trouble. */
function noticesMarkup(screen) {
  const kind = screen.mode.kind;
  const notices = `${kind === "prep" ? prepMarkup(screen) : kind === "match" ? matchMarkup(screen) : ""}${unsureMarkup(screen)}${saveNoticeMarkup(screen)}`;
  return notices ? `<div class="g-roster__notices">${notices}</div>` : "";
}

/**
 * The banners, stage 08's treasury strip on a desk (strip.mjs), then the table and the panel beside it; a roster with
 * nobody on it says so instead of the table.
 */
function layoutMarkup(screen) {
  const { lines, team } = screen;
  const choice = choiceOf(screen);
  const heading = `<div class="g-roster__bar"><h2 class="g-roster__heading" id="roster-heading">${escapeHtml(t("teamRoster.heading"))} `
    + `<span class="g-roster__count">${escapeHtml(lines.length)}</span></h2>${statusMarkup(screen.save)}</div>`;
  const table = lines.length
    ? renderRosterTable({ label: t("teamRoster.tableLabel", { team: team.name }), columns: columnsOf(), groups: groupsOf(), rows: lines.map((line) => rowOf(line, screen, choice)), sort: screen.memory.sort })
    : `<p class="g-roster__empty">${escapeHtml(t("teamRoster.empty"))}</p>`;
  const chosen = lines.find((line) => line.key === choice.chosen);
  const aside = chosen
    ? `<aside class="g-roster__aside" id="${ASIDE_ID}" aria-label="${escapeHtml(t("teamRoster.panelLabel"))}"${dataAttributes({ panelPlayer: chosen.key })}>${sidePanelMarkup(chosen, screen)}</aside>`
    : "";
  return `${noticesMarkup(screen)}${stripMarkup(team)}<div class="g-roster__layout"><section class="g-roster__main" aria-labelledby="roster-heading">${heading}${table}</section>${aside}</div>`;
}

/** A fault in place of the table, in a danger callout; a read that failed offers to read again. */
function failedMarkup(title, { retry = false } = {}) {
  const actionHtml = retry ? renderButton({ label: t("teamRoster.readAgain"), data: { rosterRetry: true } }) : "";
  return `<div class="g-roster__failed" role="alert">${renderCallout({ tone: "danger", title, actionHtml })}</div>`;
}

/** What stands under the band: the wait, the failure, a race the reference does not know, or the roster. */
function bodyMarkup(screen) {
  if (screen.loading) return `<p class="g-roster__loading" role="status">${escapeHtml(t("teamRoster.loading"))}</p>`;
  if (screen.error) return failedMarkup(screen.error, { retry: true });
  if (!screen.race) return failedMarkup(t("teamRoster.noRace", { slug: screen.team.baseTeamSlug }));
  return layoutMarkup(screen);
}

/** The sheet that is open, while its player is still on the roster: a skill's, or an injury's (`screenOf` closes one that no longer stands). */
function sheetMarkup(screen) {
  const { sheet } = screen;
  const line = sheet && screen.race ? screen.lines.find((item) => item.key === sheet.key) : null;
  if (!line) return "";
  if (sheet.kind === "injury") return injurySheetMarkup({ line, mode: screen.mode, choice: sheet.choice, busy: sheet.busy, reason: sheet.reason });
  return skillSheetMarkup({ data: screen.data, line, name: sheet.name });
}

/** @param {RosterScreen} screen */
export function rosterMarkup(screen) {
  const drawn = !screen.loading && !screen.error && screen.race;
  const head = renderPageHead({ title: t("shell.tab.roster"), sub: drawn ? t("teamRoster.counts", rosterCounts(screen.lines)) : "" });
  return `<div class="g-roster" data-screen="team-roster">${head}${bodyMarkup(screen)}${sheetMarkup(screen)}</div>`;
}

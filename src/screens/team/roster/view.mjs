/**
 * The roster's markup: the band with its counts, the table, and beside it on a desk the chosen player's panel;
 * a skill's, an injury's, a missed match's, a death's undo's, the hire cart's, a sale's, a player's edit's, his
 * advancement's, its undo's or his fix by hand's sheet over it when one is open. What a line says is model.mjs's, the
 * row's panel and the side panel panel.mjs's, the sheets sheets.mjs's, mark-sheet.mjs's, fallen-view.mjs's,
 * hire-sheet.mjs's, sell-sheet.mjs's, player-sheets.mjs's, advance-sheet.mjs's, roll-view.mjs's and fix.mjs's.
 *
 * The player's button does what the width it is drawn at does with it (R11): up to 900px it opens his row
 * (`aria-expanded`, and the row's panel it controls), from 901px it chooses him for the panel beside the table
 * (`aria-controls` names the panel, `aria-current` marks the one in it). The screen draws again when the width
 * crosses 900px.
 *
 * Above the table, in its column (DeskRoster.html: the panel stands beside them from the top), stand what the coach
 * has to keep in mind: a preparation or a match that is on (Task 11, decisions 12 and 13), and the save's trouble
 * (Task 10); then, on a desk, stage 08's treasury strip (Task 15). Under the tables a line says how to read them.
 *
 * The roster is three tables (stage 07b, decision 13): «Active roster», those who play the next match; «Missing the
 * match», each saying why under his name; and «Fallen», the dead, whose row and panel are fallen-view.mjs's. One sort
 * orders the three, one choice picks the row that is open or the player in the panel among them all, and the labels
 * repeat once, under the last table drawn. A desk draws the three in one frame, as DeskRosterInjured.html's one table:
 * the headings of the other two are bands across it, «Active roster» is for a screen reader, and the column labels
 * show once at the top (roster.css).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { t } from "../../../core/i18n.mjs";
import { postMatchUrl, preMatchUrl, teamUrl } from "../../../core/routes.mjs";
import { SAVE_STATUS } from "../../../data/roster-store.mjs";
import { PLAYER_STATS } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderPageHead } from "../../../ui/page-head.mjs";
import { renderRosterTable } from "../../../ui/roster-table.mjs";
import { renderStatusChip } from "../../../ui/status-chip.mjs";
import { renderToggle } from "../../../ui/toggle.mjs";
import { advanceSheetMarkup } from "./advance-sheet.mjs";
import { causeOf, fallenName, fallenPanelMarkup, fallenRowMarkup, undoSheetMarkup } from "./fallen-view.mjs";
import { MAIN_COUNTERS, counterSlots, rosterCounts, rosterSections } from "./model.mjs";
import { absenceWords, injuryWords, matchTarget, matchWords, prepResetWords, rowPanelMarkup, sidePanelMarkup, skillChipsMarkup } from "./panel.mjs";
import { hireButtonMarkup, hireSheetMarkup } from "./hire-sheet.mjs";
import { markSheetMarkup } from "./mark-sheet.mjs";
import { fixSheetMarkup } from "./fix.mjs";
import { editSheetMarkup, unadvanceSheetMarkup } from "./player-sheets.mjs";
import { rollBlockMarkup } from "./roll-view.mjs";
import { sellSheetMarkup } from "./sell-sheet.mjs";
import { injurySheetMarkup, skillSheetMarkup } from "./sheets.mjs";
import { stripMarkup } from "./strip.mjs";

/** The id of the panel beside the table, which a desk's player buttons control. */
export const ASIDE_ID = "roster-aside";
/** What wireToggles reports for «Edit outside the match». */
export const OUTSIDE_TOGGLE = "roster-outside";
/** The id of what the switch is described by: why it is there, which does not fit beside it in the banner (K9). */
const OUTSIDE_NOTE = "roster-outside-note";
/** The ids of the three sections' headings, which name the sections. */
const HEADINGS = Object.freeze({ active: "roster-heading", skipping: "roster-skips-heading", fallen: "roster-fallen-heading" });
/** No match is on for the dead: no count of theirs says what one added. */
const NO_MATCH = Object.freeze({ kind: "plain" });

/**
 * @typedef {object} RosterScreen
 * @property {string} teamId the route's team, which the screen is drawn for before its first answer too
 * @property {object|null} team the team as last read: id, name, baseTeamSlug; null before the first answer
 * @property {object|null} race its page in the reference
 * @property {object} draft the save queue's draft, normalised (`players`, `treasury`): what the lines are drawn from and the cart is priced on
 * @property {object} data the reference (state.data): the skills' pages
 * @property {(import("./model.mjs").PlayerLine & {sessionSpp: number, sessionOutside: number})[]} lines in the order of
 *   `memory.sort`; `sessionSpp` is what his SPP has moved since the screen opened, `sessionOutside` what the edits
 *   outside the match alone have moved it (`sessionSppOf`)
 * @property {import("./model.mjs").FallenLine[]} fallen the team's dead the roster as read does not hold, in the order of
 *   `memory.sort` (none: the server's, the newest first)
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
 * @property {{kind: "skill", key: string, name: string}|{kind: "injury", key: string, gameId: string, choice: {code: string, stat: string}, busy: boolean, reason: string}
 *   |{kind: "mark", key: string, choice: import("./mark-sheet.mjs").MarkChoice, busy: boolean, refusal: string, reason: string}
 *   |{kind: "undo", key: string, busy: boolean, refusal: string, reason: string}
 *   |{kind: "hire", key: "hire", cart: import("../../../domain/roster/transfers.mjs").HireCart, refusal: string,
 *   quote: import("../../../domain/roster/transfers.mjs").HireQuote, reason: string}
 *   |{kind: "sell", key: string, refusal: string, reason: string}
 *   |{kind: "edit", key: string, form: {number: string, name: string, captain: boolean}, seed: string, refusal: string, reason: string}
 *   |{kind: "advance", key: string, type: string, category: string, skill: string, step: string, refusal: string, taken: object|null, reason?: string}
 *   |{kind: "unadvance", key: string, index: number, confirmed: string, refusal: string, reason?: string}
 *   |{kind: "fix", key: string, form: import("../../../domain/roster/edits.mjs").PlayerFix, seed: string, refusal: string, reason: string}|null} sheet
 *   the sheet that is open: a skill's rule; an injury of the match `gameId` with what is chosen in it ("" for
 *   nothing yet), whether an injury of the player is on its way (R14), and why none can be recorded just now; a
 *   missed match's reasons (stage 07b) with what is chosen, the last refusal, and why no mark can be made just now; or
 *   a death's undo (Task 9), whether it is on its way, the last refusal, and why none can be sent just now; or the
 *   hire cart (stage 07c) with what it holds, the last refusal of «Buy», what it buys on the draft, and why nothing can
 *   be bought just now; or a player's sale or cancelled purchase (stage 07c), the last refusal, and why he cannot go
 *   just now; or a player's edit (stage 07d) with its form as typed, what it was seeded from, the last refusal of «Save»,
 *   and why it is closed; or his advancement (stage 07d, advance.mjs) with what is chosen, its step, what was taken, and
 *   why «Take» is closed; or the undo of his last advancement (stage 07d) with the advancement it confirms (its place and
 *   how it was shown), the last refusal, and why «Undo advancement» is closed; or his fix by hand (stage 07d, fix.mjs)
 *   with its form, what it was seeded from, the last refusal of «Save», and why it is closed
 * @property {boolean} unsure an injury's answer was lost and the read that followed failed: whether it was written is
 *   not known, so no injury is recorded until a read of the records succeeds (R14)
 * @property {string} error a read that failed, "" when none
 * @property {boolean} loading the roster has not been read yet (or is read again after a failure)
 * @property {boolean} phone the width the screen is drawn at is a phone's (`(max-width: 900px)`)
 * @property {string} player the player mode's stored id, as the address carries it (stage 07d); "" for the roster itself
 * @property {null | {loading: true, rolls: object[]|null} | {rolls: object[]} | {error: string}} rolls the team's rolls on the site as the visit read
 *   them (stage 07d); a read on its way keeps the list read before it
 * @property {import("./index.mjs").Visit["career"]} career the player's career by match as the visit read it (a phone's profile, career.mjs)
 * @property {boolean} careerOpen its list is open
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

/** The line under a player's name while an injury of the match on stands for him (Task 12): «Lasting Injury (AG) · round 3»; "" when none does. */
function injuryLine(line, mode) {
  return mode.kind === "match" && line.injury ? t("teamRoster.injury.line", { injury: injuryWords(line.injury), match: matchWords(mode) }) : "";
}

/** A count: quiet at zero. */
const countCell = (count) => ({ text: String(count), tone: count === 0 ? "zero" : "" });

/**
 * A line's cells; in a match each count of the career says what the match has added to it («+1»). What he may
 * spend is green when it buys an advancement — he plays, and has the cheapest one's SPP — and quiet when it does not
 * (DeskRoster.html).
 */
function cellsOf(line, { mode }) {
  const added = (counter) => (mode.kind === "match" ? line.match[counter] : 0);
  const buys = line.ready && !line.skip && !line.fallen;
  return [
    ...PLAYER_STATS.map((stat) => statCell(line.stats[stat])),
    ...MAIN_COUNTERS.map((counter) => ({ ...countCell(line.career[counter] ?? 0), delta: added(counter) })),
    { text: String(line.earned) },
    { text: String(line.available), tone: buys ? "strong" : "quiet" },
  ];
}

/**
 * Whose row is open (a phone) and who stands in the panel (a desk): the player the coach chose while he is still
 * on the screen; on a desk, when there is none, the first of `lines` — those who play, then those who miss the
 * match, then the fallen.
 */
function choiceOf(lines, { memory }) {
  const open = lines.some((line) => line.key === memory.selected) ? memory.selected : null;
  return { open, chosen: open ?? lines[0]?.key ?? null };
}

/**
 * A player of the roster: under his name an injury the match on has dealt him (Task 12), else why he misses the next
 * match (decision 14), else his position.
 */
function playerRowOf(line, screen) {
  const injury = injuryLine(line, screen.mode);
  return {
    key: line.key,
    badgeHtml: renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain }),
    name: line.name,
    sub: injury || (line.skip ? absenceWords(line) : line.position),
    alert: Boolean(injury) || line.skip,
    cells: cellsOf(line, screen),
    skillsHtml: skillChipsMarkup(line),
  };
}

/** A fallen player (decision 15): his number grey, «Fallen · <cause>» in red under his name as every absence (StatsInjured.html), his numbers as they were. */
function fallenRowOf(line) {
  const cause = causeOf(line);
  return {
    key: line.key,
    badgeHtml: renderPlayerBadge({ number: line.number, kind: line.kind, fallen: true }),
    name: fallenName(line),
    sub: cause ? t("teamRoster.fallen.sub", { cause }) : t("teamRoster.fallen.status"),
    alert: true,
    cells: cellsOf(line, { mode: NO_MATCH }),
    skillsHtml: skillChipsMarkup(line),
  };
}

/** A row of any of the three tables: the open row's panel on a phone, the mark of the panel's player on a desk. */
function rowOf(line, screen, choice) {
  const row = line.fallen ? fallenRowOf(line) : playerRowOf(line, screen);
  if (!screen.phone) return { ...row, selected: choice.chosen === line.key, controls: ASIDE_ID };
  const expanded = choice.open === line.key;
  let panelHtml = "";
  if (expanded) panelHtml = line.fallen ? fallenRowMarkup(line, screen) : rowPanelMarkup(line, screen);
  return { ...row, expanded, panelHtml };
}

/**
 * The save's state in a few words at the right of «Active roster», in a live region a screen reader hears: on the
 * way, saved (until the next step), waiting for the network with the edits that wait, not saved; nothing at rest.
 * Drawn as a dot and its words, with no capsule (SaveOffline.html; roster.css).
 */
export function statusMarkup({ status, waiting }) {
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
export function prepMarkup({ mode, phone }) {
  const title = mode.round === null ? t("teamRoster.prep.titleFriendly") : t("teamRoster.prep.title", { round: mode.round });
  const sub = prepResetWords(phone ? "teamRoster.prep.bannerPhone" : "teamRoster.prep.banner");
  return renderCallout({ tone: "warn", title, sub, actionHtml: calloutLink(preMatchUrl(mode.game), t("teamRoster.prep.link")) });
}

/**
 * A match that is on (decision 13): green while a tap is a record of it, yellow with «Edit outside the match» on (as
 * StatsLive and spec §7); a dot, the match and its records counted, the switch, and the way to the post-match. On a
 * desk the count follows the match on the title's line («● Match on · round 3 · records: 3») and the switch's
 * explanation is its description (K9); on a phone the count stands at the right of the title, and the switch says it
 * under its name (StatsLive.html).
 */
function matchMarkup({ mode, outside, records, phone }) {
  const target = matchTarget(mode);
  const caption = t("teamRoster.match.outsideCaption", { target });
  const toggle = phone
    ? renderToggle({ key: OUTSIDE_TOGGLE, label: t("teamRoster.match.outside"), caption, checked: outside })
    : `${renderToggle({ key: OUTSIDE_TOGGLE, label: t("teamRoster.match.outside"), checked: outside, describedBy: OUTSIDE_NOTE })}<span id="${OUTSIDE_NOTE}" hidden>${escapeHtml(caption)}</span>`;
  const actionHtml = `<div class="g-roster__calloutactions">${toggle}${calloutLink(postMatchUrl(mode.game), t("teamRoster.match.postMatch"))}</div>`;
  const title = outside ? t("teamRoster.match.outside") : t("teamRoster.match.title", { match: matchWords(mode) });
  // The words are each width's prototype's: a phone taps (StatsLive), a desk's counters stand on the right (DeskRosterLive).
  const desk = outside ? "teamRoster.match.outsideSubDesk" : "teamRoster.match.subDesk";
  const sub = t(phone ? (outside ? "teamRoster.match.outsideSub" : "teamRoster.match.sub") : desk, { target });
  const callout = renderCallout({ tone: outside ? "warn" : "accent", title, sub, actionHtml });
  const drawn = `<span class="g-roster__livedot" aria-hidden="true"></span><span class="g-roster__livetitle">${escapeHtml(title)}</span>`
    + `<span class="g-roster__livesep"> · </span><span class="g-roster__livecount">${escapeHtml(t("teamRoster.match.records", { count: records }))}</span>`;
  return callout.replace(`<span class="g-callout__title">${escapeHtml(title)}</span>`, `<span class="g-callout__title g-roster__live">${drawn}</span>`);
}

/**
 * What the coach has to know of the save (spec UI §8): another device's save, which only he can settle — «Load the
 * new one» reads the team again and gives his edit up; no network, with the edits that wait and the offline sign
 * before the words.
 */
export function saveNoticeMarkup({ save }) {
  if (save.status === SAVE_STATUS.CONFLICT) {
    // Under the words, half the banner wide (SaveConflict.html): roster.css lays it out and takes the sign away.
    const actionHtml = renderButton({ label: t("teamRoster.conflict.reload"), kind: "primary", data: { rosterReload: true } });
    return `<div class="g-roster__conflict">${renderCallout({ tone: "danger", title: t("teamRoster.conflict.title"), sub: t("teamRoster.conflict.sub"), actionHtml })}</div>`;
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
 * One section of the roster, named by its heading: the band — the heading with its number, and what stands at the
 * right of it (the save's status, by «Active roster») — then its table or what stands in place of one.
 */
function sectionMarkup({ which, heading, count, barHtml = "", bodyHtml }) {
  const id = HEADINGS[which];
  return `<section class="${classNames("g-roster__section", which !== "skipping" && `g-roster__section--${which}`)}" aria-labelledby="${id}">`
    + `<div class="g-roster__bar"><h2 class="g-roster__heading" id="${id}">${escapeHtml(heading)} <span class="g-roster__count">${escapeHtml(count)}</span></h2>`
    + `${barHtml}</div>${bodyHtml}</section>`;
}

/**
 * How to read the table, under it (DeskRoster.html, Stats.html): on a desk what the SPP columns are, the green and
 * the click; on a phone the tap, the green, and what each action is worth to the race.
 */
function captionMarkup(screen) {
  if (!screen.phone) return `<p class="g-roster__caption">${escapeHtml(t("teamRoster.caption.desk"))}</p>`;
  const weights = counterSlots(screen.race).main.map(({ key, spp }) => `${t(`teamRoster.counter.${key}`)} ${spp}`).join(" · ");
  const key = screen.mode.kind === "match" ? "teamRoster.caption.phoneMatch" : "teamRoster.caption.phone";
  return `<p class="g-roster__caption">${escapeHtml(t(key, { weights }))}</p>`;
}

/**
 * The banners, stage 08's treasury strip on a desk (strip.mjs), the three sections and the line on how to read
 * them, in one column, and the panel beside it from its top (DeskRoster.html). «Active roster» always stands, with
 * the save's status: a roster with nobody on it says so, and one whose players all miss the match says that, in place
 * of its table; the other two are drawn only with someone in them. The labels repeat under the last table alone;
 * the first one's «Player» has the «+» after it (stage 07c, `headTailHtml`); with no table of its own the roster has
 * the «Hire players» button under its words.
 */
function layoutMarkup(screen) {
  const { lines, fallen, team } = screen;
  const { active, skipping } = rosterSections(lines);
  const choice = choiceOf([...active, ...skipping, ...fallen], screen);
  const last = fallen.length ? fallen : skipping.length ? skipping : active;
  const first = active.length ? active : skipping.length ? skipping : fallen;
  // A desk shows the labels once, over the first table drawn: the others keep theirs for a screen reader (DeskRosterInjured.html).
  const table = (label, rows, headTailHtml = "") => renderRosterTable({
    label, columns: columnsOf(), groups: groupsOf(), rows: rows.map((line) => rowOf(line, screen, choice)), sort: screen.memory.sort, headTailHtml,
    foot: rows === last, quietHead: !screen.phone && rows !== first,
  });
  const activeBody = active.length
    ? table(t("teamRoster.tableLabel", { team: team.name }), active, hireButtonMarkup(screen))
    : `<p class="g-roster__empty">${escapeHtml(lines.length ? t("teamRoster.skips.noneActive") : t("teamRoster.empty"))}</p>`
      + `<div class="g-market__hirebar">${hireButtonMarkup(screen, { block: true })}</div>`;
  const sections = [sectionMarkup({ which: "active", heading: t("teamRoster.heading"), count: active.length, barHtml: statusMarkup(screen.save), bodyHtml: activeBody })];
  if (skipping.length) {
    sections.push(sectionMarkup({ which: "skipping", heading: t("teamRoster.skips.heading"), count: skipping.length, bodyHtml: table(t("teamRoster.skips.tableLabel", { team: team.name }), skipping) }));
  }
  if (fallen.length) sections.push(sectionMarkup({ which: "fallen", heading: t("teamRoster.fallen.heading"), count: fallen.length, bodyHtml: table(t("teamRoster.fallen.tableLabel", { team: team.name }), fallen) }));
  const chosen = [...lines, ...fallen].find((line) => line.key === choice.chosen);
  const aside = chosen
    ? `<aside class="g-roster__aside" id="${ASIDE_ID}" aria-label="${escapeHtml(t("teamRoster.panelLabel"))}"${dataAttributes({ panelPlayer: chosen.key })}>`
      + `${chosen.fallen ? fallenPanelMarkup(chosen, screen) : sidePanelMarkup(chosen, screen)}</aside>`
    : "";
  // A desk drawn for a player's address that names nobody it holds says so over the table (M5), as a phone's page does.
  const gone = screen.player && ![...lines, ...fallen].some((line) => line.id === screen.player) ? goneMarkup(screen.teamId) : "";
  const main = `${gone}${noticesMarkup(screen)}${stripMarkup(team)}<div class="g-roster__sections">${sections.join("")}</div>${lines.length || fallen.length ? captionMarkup(screen) : ""}`;
  return `<div class="g-roster__layout"><div class="g-roster__main">${main}</div>${aside}</div>`;
}

/**
 * An address whose player the roster holds nowhere — neither among those who play nor among the fallen (decision 1): he
 * is no longer on the roster, and the way back to it. A phone says it under his page's head (profile.mjs); a desk over
 * the table it draws in his place (final review M5).
 * @param {string} teamId
 */
export function goneMarkup(teamId) {
  const actionHtml = `<a class="g-roster__calloutlink" href="${escapeHtml(teamUrl(teamId, "roster"))}">${escapeHtml(t("teamRoster.fallen.toRoster"))}</a>`;
  return renderCallout({ title: t("teamPlayer.gone"), actionHtml });
}

/** A fault in place of the table, in a danger callout; a read that failed offers to read again. */
export function failedMarkup(title, { retry = false } = {}) {
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

/**
 * The sheet that is open, while its player is still on the screen: a skill's — a fallen player's chip opens its rule
 * too; how an advancement gave it, and what a site roll's dice showed as the visit read them (stage 07d) — an injury's, a
 * missed match's, a death's undo, a sale's, on the draft's treasury, or a player's edit, advancement, the undo of his
 * last one or his fix by hand (stage 07d); the hire cart, which is no player's (`screenOf` closes one that no longer stands).
 */
export function sheetMarkup(screen) {
  const { sheet } = screen;
  if (sheet?.kind === "hire") return hireSheetMarkup({ race: screen.race, quote: sheet.quote, mode: screen.mode, refusal: sheet.refusal, reason: sheet.reason });
  const line = sheet && screen.race ? [...screen.lines, ...screen.fallen].find((item) => item.key === sheet.key) : null;
  if (!line) return "";
  if (sheet.kind === "injury") return injurySheetMarkup({ line, mode: screen.mode, choice: sheet.choice, busy: sheet.busy, reason: sheet.reason });
  if (sheet.kind === "mark") return markSheetMarkup({ line, choice: sheet.choice, busy: sheet.busy, refusal: sheet.refusal, reason: sheet.reason });
  if (sheet.kind === "undo") return undoSheetMarkup({ line, mode: screen.mode, busy: sheet.busy, refusal: sheet.refusal, reason: sheet.reason });
  if (sheet.kind === "sell") {
    return sellSheetMarkup({ line, race: screen.race, treasury: screen.draft.treasury, mode: screen.mode, refusal: sheet.refusal, reason: sheet.reason });
  }
  if (sheet.kind === "edit") return editSheetMarkup({ line, lines: screen.lines, screen, sheet });
  if (sheet.kind === "advance") return advanceSheetMarkup({ line, screen, sheet });
  if (sheet.kind === "unadvance") return unadvanceSheetMarkup({ line, screen, sheet });
  if (sheet.kind === "fix") return fixSheetMarkup({ line, screen, sheet });
  return skillSheetMarkup({ data: screen.data, line, name: sheet.name, advancementHtml: rollBlockMarkup({ line, skill: sheet.name, rolls: screen.rolls }) });
}

/** @param {RosterScreen} screen */
export function rosterMarkup(screen) {
  const drawn = !screen.loading && !screen.error && screen.race;
  const head = renderPageHead({ title: t("shell.tab.roster"), sub: drawn ? t("teamRoster.counts", rosterCounts(screen.lines)) : "" });
  return `<div class="g-roster" data-screen="team-roster">${head}${bodyMarkup(screen)}${sheetMarkup(screen)}</div>`;
}

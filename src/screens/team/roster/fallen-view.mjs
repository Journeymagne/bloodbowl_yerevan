/**
 * A fallen player on the roster (stage 07b, spec UI §9): his row opened on a phone, and on a desk the panel, which is
 * his profile; the profile's body is the one the player's own address draws on a phone too (screens/team/player). An
 * undo is offered only for a death a coach marked; one a post-match recorded is the administrator's, and so is a record
 * the roster cannot read (K11: the server would not give him back). The undo is asked first, in a sheet of its own.
 *
 * Nothing here counts or saves: a fallen player has no counters, plays no match and takes no advancement. What his
 * line says is model.mjs's (`fallenLines`): what the roster held when he died, and how and when he fell.
 *
 * His career by match (stage 07e) stands where PlayerDead.html puts its «Career» — after the card of his death, before
 * «Skills» — in place of the one line «Career: N SPP»: career.mjs's block, which the caller draws (`careerHtml`) — the
 * phone's on his own page and the roster's player page, the desk's in the desk's panel. The first two read it once his
 * profile is drawn, the panel only while its list is open. A record with no id keeps the one line: no read could name him.
 *
 * On the admin's visit (stage 12, pre-flight L10) a death a post-match recorded is undone here too, the undo saying what
 * it keeps; a record the roster cannot read says, in the admin's words, that no undo gives the player back. A player's
 * profile is in the administration then (source.mjs).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatDay } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { raceTitleOf } from "../../../data/teams.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { renderStatusChip } from "../../../ui/status-chip.mjs";
import { undoable } from "./model.mjs";
import { markClosed, prepResetWords, profileLinkMarkup, skillChipsMarkup, skillSourceOf, statsMarkup } from "./panel.mjs";
import { closedMarkup } from "./player-access.mjs";
import { UNDO_SHEET, footButton } from "./sheets.mjs";
import { playerHref } from "./source.mjs";

/**
 * His name as his row, the desk's panel and his own page head it: a record may name nobody (a snapshot with no player
 * data, model.mjs's bare line), and is «Fallen» then, so the row's button and the head still say who he is.
 * @param {{name: string}} line
 */
export const fallenName = (line) => String(line.name ?? "").trim() || t("teamRoster.fallen.status");

/** The cause as it was recorded, "" for none: a death the 2.x list carried over (migration 015) has none. */
export function causeOf(line) {
  return typeof line.fallen.cause === "string" ? line.fallen.cause.trim() : "";
}

/**
 * When and how he fell (decision 18): a death a coach marked by hand has its day — it is tied to no match, so it has
 * no round; one a match recorded has the match's round and day, or its day alone for a friendly.
 *
 * @param {import("./model.mjs").FallenLine} line
 */
export function fallenWhen(line) {
  const { fromMatch, round, diedAt } = line.fallen;
  const date = formatDay(diedAt);
  if (!fromMatch) return t("teamRoster.fallen.manual", { date });
  return round === null ? t("teamRoster.fallen.inMatch", { date }) : t("teamRoster.fallen.inRound", { round, date });
}

/** «Cause of death» and the cause as it was written, or that none was. */
function causeMarkup(line) {
  const cause = causeOf(line);
  return `<div class="g-fallen__why"><p class="g-fallen__label">${escapeHtml(t("teamRoster.fallen.cause"))}</p>`
    + `<p class="${classNames("g-fallen__cause", !cause && "g-fallen__cause--none")}">${escapeHtml(cause || t("teamRoster.fallen.noCause"))}</p></div>`;
}

/** A quiet line under the rest: where the mark is undone, or that a post-match's death is the administrator's to correct. */
const noteMarkup = (key) => `<p class="g-fallen__note">${escapeHtml(t(key))}</p>`;

/**
 * That the league's administrator corrects a death the screen does not undo: one a post-match recorded, or a record the
 * roster cannot read (K11); "" for one a coach marked. The admin's visit (`admin`) undoes the first, and is told of the
 * second that no undo gives the player back.
 */
function adminMarkup(line, { admin = false } = {}) {
  if (admin) return line.bare ? noteMarkup("adminTeam.fallen.bare") : "";
  if (line.fallen.fromMatch) return noteMarkup("teamRoster.fallen.fromMatch");
  return line.bare ? noteMarkup("teamRoster.fallen.bare") : "";
}

/** What the admin is told of an undo of a death a post-match recorded (stage 12): back with the advancements, the match's rolls kept used (09b). */
const fromMatchUndone = (line, admin) => admin && line.fallen.fromMatch;

/**
 * Where a death a coach marked is undone (decision 17, K20): «Undo the mark», which opens the sheet that asks first —
 * closed while no undo can be sent, saying why as the roster's actions do — and under it what an undo does. A death the
 * screen does not undo says who corrects it instead. `data.key` keeps the button apart from the actions a patch may draw
 * in its place (Task 7).
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {string} reason why no undo can be sent just now (`markClosed` with `direct`), "" when one can
 * @param {{admin?: boolean}} [options] `admin` is the admin's visit (stage 12): a death a post-match recorded is undone too
 * @returns {string}
 */
export function undoMarkup(line, reason, { admin = false } = {}) {
  if (!undoable(line, { admin })) return adminMarkup(line, { admin });
  const label = t("teamRoster.fallen.undo");
  const data = { key: "roster-undo", rosterUndo: line.key };
  const button = reason
    ? closedMarkup({ className: "g-btn g-btn--block", label, reason, data })
    : `<button type="button" class="g-btn g-btn--block" aria-haspopup="dialog"${dataAttributes(data)}>${escapeHtml(label)}</button>`;
  return `${button}${noteMarkup(fromMatchUndone(line, admin) ? "adminTeam.fallen.fromMatch" : "teamRoster.fallen.undoHint")}`;
}

/**
 * His row opened on a phone (decision 16): the cause, his career and when he fell, the way to his profile — where a
 * death a coach marked is undone — and for a death a post-match recorded, or a record the roster cannot read, that the
 * league's administrator corrects it. A record the roster stores no id for has no profile to lead to.
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function fallenRowMarkup(line, screen) {
  const career = t("teamRoster.fallen.careerWhen", { spp: line.earned, when: fallenWhen(line) });
  const profile = line.id ? profileLinkMarkup(t("teamRoster.fallen.profile"), playerHref(screen.team.id, line.id), { outline: true }) : "";
  let note = adminMarkup(line, { admin: Boolean(screen.admin) });
  if (!note && line.id) note = noteMarkup("teamRoster.fallen.undoInProfile");
  return `<div class="g-fallen__rowpanel">${causeMarkup(line)}<p class="g-fallen__career">${escapeHtml(career)}</p>${profile}${note}</div>`;
}

/**
 * The body of a fallen player's profile, the desk's panel and his own page alike (PlayerDead): his characteristics in
 * grey, «Fallen» and when, the cause, then the undo the caller offers (`undoHtml`, a death a coach marked) or, for a
 * death the screen does not undo, who corrects it; his career by match (`careerHtml`, stage 07e) — «Career: N SPP» for
 * a record with no id — his skills as cards (a chip opens its rule, as on the roster) — an advancement's skill named by
 * its type, as the living's are (K29): in full with how it was rolled on his page, short in the desk's panel (`short`)
 * — and what a death means.
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {{undoHtml?: string, short?: boolean, careerHtml?: string}} [options] `undoHtml` and `careerHtml` are markup of
 *   a `render…()`/`…Markup()`: the undo and its hint (`undoMarkup`), his career (career.mjs's `careerMarkup`)
 * @returns {string}
 */
export function fallenProfileMarkup(line, { undoHtml = "", short = false, careerHtml = "" } = {}) {
  const state = `<div class="g-fallen__state">${renderStatusChip({ label: t("teamRoster.fallen.status") })}`
    + `<span class="g-fallen__when">${escapeHtml(fallenWhen(line))}</span></div>`;
  const after = undoHtml || adminMarkup(line);
  const chips = skillChipsMarkup(line, { card: true, sourceOf: (skill) => skillSourceOf(line, skill, { short }) });
  const skills = `<section class="g-roster__pblock"><h3 class="g-roster__ptitle">${escapeHtml(t("teamRoster.skills"))}</h3>${chips}</section>`;
  return `<div class="g-fallen"><div class="g-fallen__stats">${statsMarkup(line)}</div>`
    + `<div class="g-fallen__card">${state}${causeMarkup(line)}${after}</div>`
    + `${careerHtml || `<p class="g-fallen__career">${escapeHtml(t("teamRoster.fallen.career", { spp: line.earned }))}</p>`}${skills}`
    + `<p class="g-fallen__rules">${escapeHtml(t("teamRoster.fallen.rules"))}</p></div>`;
}

/**
 * The line under a fallen player's name (`fallenName`), on the desk's panel and his own page: «<position> · <race> ·
 * fallen», and for a record that names no position, «<race> · fallen».
 * @param {import("./model.mjs").FallenLine} line @param {string} baseTeamSlug the team's
 */
export function fallenWho(line, baseTeamSlug) {
  const race = raceTitleOf(baseTeamSlug);
  return String(line.position ?? "").trim() ? t("teamRoster.fallen.who", { position: line.position, race }) : t("teamRoster.fallen.whoRace", { race });
}

/**
 * The desk's panel for a fallen player (decision 17: the panel is his profile): his number grey and large, his name,
 * «<position> · <race> · fallen» (`fallenWho`), then the profile's body, with «Undo the mark» for a death a coach
 * marked — closed, as the sheet's button would be, while a match is on, the screen is locked or a step of the roster
 * waits (K6) — and the desk's «Career» the caller draws (`careerHtml`, stage 07e).
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 * @param {{careerHtml?: string}} [options] `careerHtml` is markup of career.mjs's `careerMarkup()`, "" for a record with no id
 */
export function fallenPanelMarkup(line, screen, { careerHtml = "" } = {}) {
  const who = fallenWho(line, screen.team.baseTeamSlug);
  const admin = Boolean(screen.admin);
  const reason = undoable(line, { admin }) ? markClosed(line, screen, { direct: true }) : "";
  return `<div class="g-roster__phead">${renderPlayerBadge({ number: line.number, kind: line.kind, fallen: true, large: true })}`
    + `<div class="g-roster__pwho"><h2 class="g-roster__pname">${escapeHtml(fallenName(line))}</h2><p class="g-roster__pline">${escapeHtml(who)}</p></div></div>`
    + fallenProfileMarkup(line, { undoHtml: undoMarkup(line, reason, { admin }), short: true, careerHtml });
}

/**
 * «Undo the mark?» (decision 20, PlayerDeadConfirm): who comes back, and to what, and — quiet, under it — that a death
 * a post-match recorded is not undone so; during a preparation, what a save of the roster resets (R12) — an undo is one. «Keep» closes it; «Back on the roster» sends the undo — the main button, not
 * a red one: a new mark undoes it in turn. While the undo is on its way the button says it waits (`busy`, the focus
 * kept on it); while none can be sent, it says why and stays in reach (`reason`, as the mark's sheet's does).
 *
 * @param {object} props
 * @param {import("./model.mjs").FallenLine} props.line the fallen player whose mark is undone
 * @param {{kind: string}} props.mode `rosterMode`'s
 * @param {boolean} [props.busy] the undo is on its way
 * @param {string} [props.refusal] why the last press was refused (another tab's coach, the rules), "" for none
 * @param {string} [props.reason] why no undo can be sent just now (`markClosed` with `direct`), "" when one can
 * @param {boolean} [props.admin] the admin's visit (stage 12): the quiet line is what an undo of a death a post-match
 *   recorded keeps, for one; none for a death a coach marked
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-undo")` opens it
 */
export function undoSheetMarkup({ line, mode, busy = false, refusal = "", reason = "", admin = false }) {
  const prep = mode.kind === "prep" ? `<p class="g-fallen__undoprep">${escapeHtml(prepResetWords())}</p>` : "";
  const refused = refusal ? `<p class="g-roster__markrefusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  let quiet = admin ? "" : t("teamRoster.fallen.fromMatch");
  if (fromMatchUndone(line, admin)) quiet = t("adminTeam.fallen.fromMatch");
  return renderSheet({
    id: UNDO_SHEET,
    at: 120,
    title: t("teamRoster.fallen.undoTitle"),
    bodyHtml: `<p class="g-fallen__undotext">${escapeHtml(t("teamRoster.fallen.undoBody", { name: line.name }))}</p>`
      + `${quiet ? `<p class="g-fallen__undoprep">${escapeHtml(quiet)}</p>` : ""}${prep}${refused}`,
    footStartHtml: renderButton({ label: t("teamRoster.fallen.keep"), data: { undoKeep: true } }),
    footHtml: footButton({ label: t("teamRoster.fallen.restore"), kind: "primary", data: { undoSend: true }, busy, reason }),
  });
}

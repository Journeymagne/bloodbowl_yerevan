/**
 * A fallen player on the roster (stage 07b, spec UI §9): his row opened on a phone, and on a desk the panel, which is
 * his profile; the profile's body is the one the player's own address draws on a phone too (screens/team/player). An
 * undo is offered only for a death a coach marked; one a post-match recorded is the administrator's.
 *
 * Nothing here counts or saves: a fallen player has no counters, plays no match and takes no advancement. What his
 * line says is model.mjs's (`fallenLines`): what the roster held when he died, and how and when he fell.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatDay } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { teamPlayerUrl } from "../../../core/routes.mjs";
import { raceTitleOf } from "../../../data/teams.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { classNames } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderStatusChip } from "../../../ui/status-chip.mjs";
import { skillChipsMarkup, statsMarkup } from "./panel.mjs";

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
 * His row opened on a phone (decision 16): the cause, his career and when he fell, the way to his profile — where a
 * death a coach marked is undone — and for a death a post-match recorded, that the league's administrator corrects it.
 * A record the roster stores no id for has no profile to lead to, and nothing to undo from there.
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function fallenRowMarkup(line, screen) {
  const career = t("teamRoster.fallen.careerWhen", { spp: line.earned, when: fallenWhen(line) });
  const profile = line.id ? renderButton({ label: t("teamRoster.fallen.profile"), kind: "dark", block: true, href: teamPlayerUrl(screen.team.id, line.id) }) : "";
  let note = "";
  if (line.fallen.fromMatch) note = noteMarkup("teamRoster.fallen.fromMatch");
  else if (line.id) note = noteMarkup("teamRoster.fallen.undoInProfile");
  return `<div class="g-fallen__rowpanel">${causeMarkup(line)}<p class="g-fallen__career">${escapeHtml(career)}</p>${profile}${note}</div>`;
}

/**
 * The body of a fallen player's profile, the desk's panel and his own page alike (PlayerDead): his characteristics in
 * grey, «Fallen» and when, the cause, then the undo the caller offers (`undoHtml`, a death a coach marked) or, for a
 * death a post-match recorded, that the administrator corrects it; his career, his skills as cards (a chip opens its
 * rule, as on the roster), and what a death means.
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {{undoHtml?: string}} [options] `undoHtml` is markup of a `render…()`/`…Markup()`: the undo and its hint (Task 9)
 * @returns {string}
 */
export function fallenProfileMarkup(line, { undoHtml = "" } = {}) {
  const state = `<div class="g-fallen__state">${renderStatusChip({ label: t("teamRoster.fallen.status") })}`
    + `<span class="g-fallen__when">${escapeHtml(fallenWhen(line))}</span></div>`;
  const after = undoHtml || (line.fallen.fromMatch ? noteMarkup("teamRoster.fallen.fromMatch") : "");
  const skills = `<section class="g-roster__pblock"><h3 class="g-roster__ptitle">${escapeHtml(t("teamRoster.skills"))}</h3>${skillChipsMarkup(line, { card: true })}</section>`;
  return `<div class="g-fallen"><div class="g-fallen__stats">${statsMarkup(line)}</div>`
    + `<div class="g-fallen__card">${state}${causeMarkup(line)}${after}</div>`
    + `<p class="g-fallen__career">${escapeHtml(t("teamRoster.fallen.career", { spp: line.earned }))}</p>${skills}`
    + `<p class="g-fallen__rules">${escapeHtml(t("teamRoster.fallen.rules"))}</p></div>`;
}

/**
 * The desk's panel for a fallen player (decision 17: the panel is his profile): his number grey and large, his name,
 * «<position> · <race> · fallen», then the profile's body.
 *
 * @param {import("./model.mjs").FallenLine} line
 * @param {import("./view.mjs").RosterScreen} screen
 */
export function fallenPanelMarkup(line, screen) {
  const who = t("teamRoster.fallen.who", { position: line.position, race: raceTitleOf(screen.team.baseTeamSlug) });
  return `<div class="g-roster__phead">${renderPlayerBadge({ number: line.number, kind: line.kind, fallen: true, large: true })}`
    + `<div class="g-roster__pwho"><h2 class="g-roster__pname">${escapeHtml(line.name)}</h2><p class="g-roster__pline">${escapeHtml(who)}</p></div></div>`
    + fallenProfileMarkup(line);
}

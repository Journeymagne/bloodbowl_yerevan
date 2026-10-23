/**
 * The two sheets of a team's friendlies (stage 09c, decisions 8–14): the one that challenges a coach and the one that
 * accepts a challenge. The words are the models' (challenges-model.mjs `sendModel`, `acceptModel`); this draws them,
 * escapes every one, and leaves what is open, typed and chosen to the screen (challenges.mjs), which redraws them.
 *
 * - The challenge sheet is one sheet on both widths: up to 900px ChallengeSend.html from the bottom, 92% of the screen,
 *   «Whom do we challenge»; from 901px DeskChallenges.html's window of 760px, «Challenge to a friendly» and its line.
 *   The search stays over the list, which scrolls (a phone's) or is a block of two columns 300px high (a desk's);
 *   while a query is typed the list is what it finds, and «Clear» stands in the field.
 * - The coaches to choose from are one radio group, `.g-challenge__group`, on both widths. A phone's holds the recent
 *   opponents and the others under their two captions (the arrows walk through both; the prototype draws two groups).
 *   A desk's recent opponents are chips over the list, as the prototype: toggles, `aria-pressed`, outside the group,
 *   so its arrows never land on them. A coach the chosen team has a challenge waiting with is busy: his row, or his
 *   chip, says «Challenge sent» and cannot be chosen (`aria-disabled`, which the arrows skip). Nobody found, or nobody
 *   at all, says so in place of the group.
 * - The team to challenge with is a radio group of segments, two to a row (`.g-challenge__teams`: a coach may have four
 *   teams, more than the segmented control holds); one team is a line. A phone chooses it in the foot, over the summary
 *   and the button, as ChallengeSend.html; a desk in the body, under the list, with «Cancel» and the button in the foot.
 * - The accept sheet (ChallengeAccept.html; a desk's is the same in a window of 480px, no prototype of its own): the
 *   challenger's card — his letter, «login · team», the race and what was read of his team — then the coach's teams as
 *   one radio group (`.g-challenge__own`), each its race, value and season, and the note that any of them may play.
 * - A refusal the server gave is an alert by the search (or under the teams), where a list's scroll does not take it
 *   away; a write on its way makes the sheet's button busy (`aria-busy`), not disabled, so the focus stays on it.
 *
 * Every radio group carries its state: the checked item `aria-checked="true"` and the one tab stop, or the first item
 * that can be chosen while none is (a roving tabindex; `wireRadioGroups` walks it). A coach's circle is the header's
 * colour (the prototypes' own colours have no token). Long logins and team names wrap; nothing is cut with «…».
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCoachLetter } from "../../ui/coach-letter.mjs";
import { icon } from "../../ui/icons.mjs";
import { renderSearchField } from "../../ui/search-field.mjs";
import { renderSheet } from "../../ui/sheet.mjs";

/** The challenge sheet's id: what the screen shows it by (`#friendly-send`). */
export const SEND_SHEET = "friendly-send";
/** The accept sheet's id. */
export const ACCEPT_SHEET = "friendly-accept";

/** A paragraph of plain words, or nothing for none. */
const paragraph = (className, words) => (words ? `<p class="${className}">${escapeHtml(words)}</p>` : "");

/** What the server said when it refused, as an alert; nothing when it did not. */
const refusalMarkup = (refusal) => (refusal ? `<p class="g-challenge__refusal" role="alert">${escapeHtml(refusal)}</p>` : "");

/** A coach's first letter in his circle (ui/coach-letter.mjs), ChallengeSend's 36 with its 17px letter: a decoration, his login says who he is. */
const letterMarkup = (initial) => renderCoachLetter({ initial, size: 36, className: "g-challenge__letter" });

/** «Challenge sent»: a coach the chosen team already has a challenge waiting with. */
const busyMarkup = () => `<span class="g-challenge__busy">${escapeHtml(t("friendly.busy"))}</span>`;

/** A radio item's state: whether it is checked, and whether it is the group's one tab stop. */
const radioState = (checked, stop) => `role="radio" aria-checked="${checked ? "true" : "false"}" tabindex="${stop ? "0" : "-1"}"`;

/** The roving tab stop of a group: the item checked, otherwise the first that can be chosen. */
const tabStopOf = (items) => items.find((item) => item.checked) ?? items.find((item) => !item.busy) ?? null;

/** A caption over what follows it: «Recent opponents», «Other coaches · 9», «Found · 2», «Which team do you play». */
const captionMarkup = (words) => `<span class="g-challenge__caption">${escapeHtml(words)}</span>`;

/** A coach to choose: his letter, his login over his teams, and at the right the radio — or «Challenge sent». */
function rowMarkup(row, stop) {
  const line = row.line ? `<span class="g-challenge__line">${escapeHtml(row.line)}</span>` : "";
  const tail = row.busy ? busyMarkup() : '<span class="g-challenge__radio" aria-hidden="true"></span>';
  return `<button type="button" class="g-challenge__row" ${radioState(row.checked, row === stop)} data-friendly-pick="${escapeHtml(row.id)}"${row.busy ? ' aria-disabled="true"' : ""}>`
    + `${letterMarkup(row.initial)}<span class="g-challenge__id"><b class="g-challenge__login">${escapeHtml(row.login)}</b>${line}</span>${tail}</button>`;
}

/** A desk's recent opponent: a chip that is pressed while he is the one chosen, as DeskChallenges.html. */
function chipMarkup(row) {
  return `<button type="button" class="g-challenge__chip" aria-pressed="${row.checked ? "true" : "false"}" data-friendly-pick="${escapeHtml(row.id)}"${row.busy ? ' aria-disabled="true"' : ""}>`
    + `${letterMarkup(row.initial)}<span class="g-challenge__chiplogin">${escapeHtml(row.login)}</span>${row.busy ? busyMarkup() : ""}</button>`;
}

/** The radio group of the coaches to choose from, around `contentHtml` (markup of rowMarkup and captionMarkup). */
const groupMarkup = (contentHtml) => `<div class="g-challenge__group" role="radiogroup" aria-label="${escapeHtml(t("friendly.opponentGroup"))}">${contentHtml}</div>`;

/** A caption and what it is over. */
const blockMarkup = (captionWords, contentHtml) => `<div class="g-challenge__block">${captionMarkup(captionWords)}${contentHtml}</div>`;

/** Nobody found, or nobody to challenge at all. */
const nobodyMarkup = () => `<p class="g-challenge__nobody">${escapeHtml(t("friendly.nobody"))}</p>`;

/**
 * A phone's list (ChallengeSend.html): one radio group, the recent opponents under their caption and the others under
 * theirs — or, while searching, what was found. A caption with nobody under it is not drawn.
 */
function phoneListMarkup(model) {
  if (model.nobody) return blockMarkup(model.listLabel, nobodyMarkup());
  const stop = tabStopOf([...model.recent, ...model.rows]);
  const rows = (list) => list.map((row) => rowMarkup(row, stop)).join("");
  const recent = model.recent.length ? blockMarkup(t("friendly.recent"), rows(model.recent)) : "";
  const others = model.rows.length ? blockMarkup(model.listLabel, rows(model.rows)) : "";
  return groupMarkup(recent + others);
}

/** A desk's list (DeskChallenges.html): «Recent:» and their chips, then the others in two columns — or what was found. */
function deskListMarkup(model) {
  const chips = model.recent.length
    ? `<div class="g-challenge__recent"><span class="g-challenge__recentlabel">${escapeHtml(t("friendly.recentDesk"))}</span>${model.recent.map(chipMarkup).join("")}</div>`
    : "";
  if (model.nobody) return chips + blockMarkup(model.listLabel, nobodyMarkup());
  if (!model.rows.length) return chips;
  const stop = tabStopOf(model.rows);
  return chips + blockMarkup(model.listLabel, groupMarkup(model.rows.map((row) => rowMarkup(row, stop)).join("")));
}

/** The search, «Clear» while something is typed, and under them the note of a coach the address named and the refusal. */
function topMarkup(model, refusal) {
  const field = renderSearchField({
    id: "friendly-search", label: t("friendly.search"), placeholder: t("friendly.searchPlaceholder"), value: model.query, data: { friendlySearch: "" },
  });
  const clear = model.query
    ? `<button type="button" class="g-challenge__clear" aria-label="${escapeHtml(t("friendly.clear"))}" data-friendly-clear="">${icon("close", 16)}</button>`
    : "";
  return `<div class="g-challenge__top"><div class="g-challenge__search">${field}${clear}</div>${paragraph("g-challenge__note", model.note)}${refusalMarkup(refusal)}</div>`;
}

/** «Challenging with» and the coach's teams as segments; one team is a line, «Challenging with Mock Team». */
function teamsMarkup(model) {
  if (model.single) return paragraph("g-challenge__single", model.single);
  if (!model.teams.length) return "";
  const stop = tabStopOf(model.teams);
  const items = model.teams.map((team) => `<button type="button" class="g-challenge__team" ${radioState(team.checked, team === stop)} data-friendly-team="${escapeHtml(team.id)}">`
    + `${escapeHtml(team.name)}</button>`).join("");
  const label = t("friendly.withTeamLabel");
  return `<div class="g-challenge__with"><span class="g-challenge__label">${escapeHtml(label)}</span>`
    + `<div class="g-challenge__teams" role="radiogroup" aria-label="${escapeHtml(label)}">${items}</div></div>`;
}

/**
 * The sheet that challenges a coach (ChallengeSend.html, ChallengeSendSearch.html; DeskChallenges.html's window).
 * @param {ReturnType<typeof import("./challenges-model.mjs").sendModel>} model
 * @param {{phone?: boolean, refusal?: string, busy?: boolean}} [options] the width's form; what the server said when it
 *   refused the challenge; whether the challenge is on its way
 * @returns {string}
 */
export function sendSheetMarkup(model, { phone = false, refusal = "", busy = false } = {}) {
  const cta = renderButton({ label: model.cta.label, kind: "primary", disabled: model.cta.disabled, busy, data: { friendlyChallenge: "" } });
  const summary = paragraph("g-challenge__summary", model.summary);
  const top = topMarkup(model, refusal);
  if (phone) {
    return renderSheet({
      id: SEND_SHEET, className: "g-challenge-send", title: t("friendly.sheetTitle"),
      bodyHtml: `${top}<div class="g-challenge__list">${phoneListMarkup(model)}</div>`,
      footHtml: `${teamsMarkup(model)}${summary}${cta}`,
    });
  }
  return renderSheet({
    id: SEND_SHEET, className: "g-challenge-send", title: t("friendly.sheetTitleDesk"), sub: t("friendly.sheetSubDesk"),
    bodyHtml: `${top}${deskListMarkup(model)}${teamsMarkup(model)}`,
    footHtml: `${summary}${renderButton({ label: t("common.cancel"), data: { sheetClose: "" } })}${cta}`,
  });
}

/** The challenger (ChallengeAccept.html's card): his letter, «orc_boss · Grimtusk Raiders», the race and what was read of his team. */
function challengerMarkup(model) {
  const line = model.line ? `<span class="g-challenge__line">${escapeHtml(model.line)}</span>` : "";
  return `<div class="g-challenge__card">${renderCoachLetter({ initial: model.initial, size: 44 })}<span class="g-challenge__id"><b class="g-challenge__title">${escapeHtml(model.title)}</b>${line}</span></div>`;
}

/** The coach's teams to play with, one radio group: each its name over its race, value and season. */
function ownTeamsMarkup(model) {
  const stop = tabStopOf(model.options);
  const options = model.options.map((option) => `<button type="button" class="g-challenge__option" ${radioState(option.checked, option === stop)} data-friendly-own="${escapeHtml(option.id)}">`
    + `<span class="g-challenge__optname">${escapeHtml(option.name)}</span>${option.line ? `<span class="g-challenge__optline">${escapeHtml(option.line)}</span>` : ""}</button>`).join("");
  return `<div class="g-challenge__own" role="radiogroup" aria-label="${escapeHtml(t("friendly.whichTeam"))}">${options}</div>`;
}

/**
 * The sheet that accepts a challenge (ChallengeAccept.html): the same on both widths — a sheet from the bottom, or a
 * window of 480px from 901px.
 * @param {ReturnType<typeof import("./challenges-model.mjs").acceptModel>} model
 * @param {{refusal?: string, busy?: boolean}} [options] what the server said when it refused; whether the accept is on its way
 * @returns {string}
 */
export function acceptSheetMarkup(model, { refusal = "", busy = false } = {}) {
  const bodyHtml = `${challengerMarkup(model)}${captionMarkup(t("friendly.whichTeam"))}${ownTeamsMarkup(model)}`
    + `${paragraph("g-challenge__any", t("friendly.anyTeam"))}${refusalMarkup(refusal)}`;
  const footHtml = renderButton({ label: model.cta.label, kind: "primary", disabled: model.cta.disabled, busy, data: { friendlyConfirm: "" } });
  return renderSheet({ id: ACCEPT_SHEET, className: "g-challenge-accept", title: t("friendly.acceptTitle"), bodyHtml, footHtml });
}

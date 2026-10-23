/**
 * A team's friendlies as the page draws them (stage 09c, decisions 3–6): Challenges.html up to 900px, DeskChallenges.html
 * from 901px — the page under its window. The words are the model's (challenges-model.mjs); this draws them and escapes
 * every one.
 *
 * - A phone: «Friendlies» and «played 2» at its right, the note that a friendly is off the table, «Challenge» the
 *   width of the page, then «Incoming · 1», «Outgoing · 1», «Accepted», each challenge its own card, and the history at
 *   the bottom, folded under its button.
 * - A desk: the band «Friendlies» with «Off the table · …» and «Challenge» at its right (the prototype draws its window
 *   already open, and so no button: one is needed to open it); «Incoming» and «Outgoing» cards side by side,
 *   «Accepted» the whole width under them, the history a card under that. As the prototype: no count of played, no
 *   chip «Waiting» on a challenge sent, and no day an accepted one was accepted.
 * - An incoming challenge offers «Accept…» (its sheet) and «Decline»; an outgoing one «Cancel the challenge» («Cancel» on
 *   a desk); an accepted one what its match offers (`matchActions`: «Match preparation», the records and the
 *   post-match, «Confirm the score» or the score sent as a line).
 * - While a write is on its way (the screen says which), the «Decline» or «Cancel» pressed says it is busy, and
 *   «Challenge», «Accept…» and the other «Decline» and «Cancel» buttons are closed: a press of one would do nothing.
 * - A section with nothing in it is not drawn; no challenge at all says so. While the challenges are read the page
 *   says so; a read that failed is a danger callout with «Refresh», and «Challenge» stays closed either way: there is
 *   nobody to offer yet.
 *
 * A coach's circle is the header's colour: the prototype's maroon and blue have no token. Long logins and team names
 * wrap; nothing is cut with «…».
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { renderCoachLetter } from "../../ui/coach-letter.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderPageHead } from "../../ui/page-head.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";

/** The id of the history's list: its button controls it. */
const HISTORY_ID = "friendly-history";

/** «played 2» beside the phone's title; nothing while the games are not read. */
const playedMarkup = (model) => (model.played ? `<span class="g-friendly__played">${escapeHtml(model.played)}</span>` : "");

/**
 * A button of the page that writes or opens a sheet, while a write is on its way and the list is read after it: the
 * «Decline» or the «Cancel» pressed says it is busy, every other is closed. Both are `aria-disabled`, not `disabled`,
 * which would take the focus from the button pressed; the screen takes no press of them until the write is done.
 */
function heldButton(button, { writing = "", answering = "" }, action = "", id = "") {
  if (!writing) return renderButton(button);
  if (action && writing === action && answering === id) return renderButton({ ...button, busy: true });
  return renderButton(button).replace(/^<button /, '<button aria-disabled="true" ');
}

/** «Challenge»: it opens the sheet; closed until the challenges are read, and while a write is on its way. */
function sendMarkup(model, options) {
  const button = { label: t("friendly.send"), kind: "primary", block: options.phone, dialog: true, disabled: !model.read, data: { friendlySend: "" } };
  return model.read ? heldButton(button, options) : renderButton(button);
}

/** The reads that failed, as an alert; the challenges' one offers to read them again. */
function failuresMarkup(model) {
  if (!model.failures.length) return "";
  const retry = renderButton({ label: t("common.refresh"), data: { friendlyRetry: "" } });
  const callouts = model.failures.map((title, at) => renderCallout({ tone: "danger", title, actionHtml: at === 0 && model.unread ? retry : "" }));
  return `<div class="g-friendly__failed" role="alert">${callouts.join("")}</div>`;
}

/** «Reading the challenges…» while they are on their way; «No challenges yet…» once read and none. */
function stateMarkup(model) {
  if (!model.read && !model.unread) return `<p class="g-friendly__loading" role="status">${escapeHtml(t("friendly.loading"))}</p>`;
  return model.empty ? `<p class="g-friendly__none">${escapeHtml(t("friendly.none"))}</p>` : "";
}

/** The coach's letter in its circle, his login, the line under it, and on a phone the chip at the right. */
function whoMarkup(row, chip = "") {
  return `<div class="g-friendly__who">${renderCoachLetter({ initial: row.initial, size: 44 })}`
    + `<span class="g-friendly__id"><b class="g-friendly__login">${escapeHtml(row.login)}</b><span class="g-friendly__line">${escapeHtml(row.line)}</span></span>${chip}</div>`;
}

/**
 * A waiting challenge's card is known by its id: the card a decline or a cancel took away goes with its button, and the
 * card under it keeps its own (a card matched by place would take the focus on to that challenge's button).
 */
const cardKey = (row) => `data-key="${escapeHtml(row.id)}"`;

/** One challenge sent to the coach: who and with which team, «Accept…» and «Decline». */
function incomingMarkup(row, options) {
  const { phone } = options;
  const accept = heldButton({ label: t("friendly.accept"), kind: "primary", dialog: true, data: { friendlyAccept: row.id } }, options);
  const decline = heldButton({ label: t("friendly.decline"), data: { friendlyAnswer: "decline", friendlyId: row.id } }, options, "decline", row.id);
  return `<div class="${phone ? "g-friendly__card " : ""}g-friendly__item" ${cardKey(row)}>${whoMarkup(row)}<div class="g-friendly__actions g-friendly__actions--pair">${accept}${decline}</div></div>`;
}

/** One challenge the coach sent: whom, «Waiting» on a phone, and the way to take it back. */
function outgoingMarkup(row, options) {
  const { phone } = options;
  const chip = phone ? renderStatusChip({ label: t("friendly.waitChip"), tone: "wait" }) : "";
  const cancel = heldButton({ label: phone ? t("friendly.cancel") : t("friendly.cancelDesk"), data: { friendlyAnswer: "cancel", friendlyId: row.id } },
    options, "cancel", row.id);
  return `<div class="${phone ? "g-friendly__card " : ""}g-friendly__item" ${cardKey(row)}>${whoMarkup(row, chip)}<div class="g-friendly__actions">${cancel}</div></div>`;
}

/** One way a match offers, by how loud it is: the accent's button, an outline one, or a plain link. */
function linkMarkup({ label, href, kind }, { phone }) {
  if (kind === "primary") return renderButton({ label, href, kind: "primary", block: phone });
  if (kind === "light") return renderButton({ label, href, block: phone });
  if (kind !== "text") throw new Error(`unknown match action kind: ${kind}`);
  assertLinkHref(href);
  return `<a class="g-friendly__link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/** What the accepted challenge's match offers, and the score sent as a line. */
function linksMarkup(item, options) {
  const links = item.links.map((link) => linkMarkup(link, options)).join("");
  const sent = item.sentLine ? `<p class="g-friendly__sent">${escapeHtml(item.sentLine)}</p>` : "";
  return links || sent ? `<div class="g-friendly__links">${links}${sent}</div>` : "";
}

/**
 * One challenge accepted, its match on: «Friendly · off the table»; on a phone the day it was accepted and the two
 * teams across, «Ours vs Theirs»; on a desk the two in one line, the match's ways at the right.
 */
function acceptedMarkup(item, { phone }) {
  const chip = renderStatusChip({ label: t("matches.offTable") });
  if (!phone) {
    return `<div class="g-friendly__item g-friendly__item--accepted">${chip}`
      + `<b class="g-friendly__pair">${escapeHtml(`${item.own} ${t("friendly.vs")} ${item.other}`)}</b>${linksMarkup(item, { phone })}</div>`;
  }
  return `<div class="g-friendly__card g-friendly__item g-friendly__item--accepted"><div class="g-friendly__top">${chip}`
    + `<span class="g-friendly__when">${escapeHtml(item.when)}</span></div><div class="g-friendly__match">`
    + `<b class="g-friendly__side">${escapeHtml(item.own)}</b><span class="g-friendly__vs">${escapeHtml(t("friendly.vs"))}</span>`
    + `<b class="g-friendly__side g-friendly__side--other">${escapeHtml(item.other)}</b></div>${linksMarkup(item, { phone })}</div>`;
}

/** The history's rows: what came of each challenge; the one played leads to its match. */
function pastMarkup(row) {
  if (!row.href) return `<li class="g-friendly__past">${escapeHtml(row.line)}</li>`;
  assertLinkHref(row.href);
  return `<li class="g-friendly__past"><a class="g-friendly__pastlink" href="${escapeHtml(row.href)}">${escapeHtml(row.line)}</a></li>`;
}

/** A section's heading, which names it: a phone's caption, a desk's card title. */
function headingMarkup(kind, contentHtml, { phone }) {
  return `<h2 class="${phone ? "g-friendly__caption" : "g-friendly__title"}" id="friendly-${kind}-title">${contentHtml}</h2>`;
}

/** A section named by its heading: a phone's caption over its cards, a desk's card. */
function sectionMarkup(kind, bodyHtml, { phone }) {
  return `<section class="${phone ? "g-friendly__section" : "g-friendly__card g-friendly__group"}" aria-labelledby="friendly-${kind}-title">${bodyHtml}</section>`;
}

/** The history's heading is its button: «Challenge history · 2», the list under it hidden until it is opened. */
function historyMarkup(model, options) {
  if (!model.history.length) return "";
  const open = options.historyOpen === true;
  const toggle = `<button type="button" class="g-friendly__fold" aria-expanded="${open ? "true" : "false"}" aria-controls="${HISTORY_ID}" data-friendly-history="">`
    + `<span>${escapeHtml(t("friendly.history", { count: model.history.length }))}</span>${icon("chevronShort", 16)}</button>`;
  const list = `<ul class="g-friendly__history${options.phone ? " g-friendly__card" : ""}" id="${HISTORY_ID}"${open ? "" : " hidden"}>${model.history.map(pastMarkup).join("")}</ul>`;
  return sectionMarkup("history", headingMarkup("history", toggle, options) + list, options);
}

/**
 * The sections, each named by its heading; one with nothing in it is not drawn. A phone's: «Incoming · 1»,
 * «Outgoing · 1», «Accepted», the history, each a caption over its cards. A desk's: «Incoming» and «Outgoing» side by
 * side, «Accepted» the whole width under them, then the history.
 */
function sectionsMarkup(model, options) {
  const listed = (kind, words, rows, markup) => (rows.length
    ? sectionMarkup(kind, headingMarkup(kind, escapeHtml(words), options) + rows.map((row) => markup(row, options)).join(""), options) : "");
  const { phone } = options;
  const pair = listed("incoming", phone ? t("friendly.incomingCount", { count: model.incoming.length }) : t("friendly.incoming"), model.incoming, incomingMarkup)
    + listed("outgoing", phone ? t("friendly.outgoingCount", { count: model.outgoing.length }) : t("friendly.outgoing"), model.outgoing, outgoingMarkup);
  const side = phone || !pair ? pair : `<div class="g-friendly__grid">${pair}</div>`;
  return `${side}${listed("accepted", t("friendly.accepted"), model.accepted, acceptedMarkup)}${historyMarkup(model, options)}`;
}

/**
 * The page in the form of the width: a phone's as Challenges.html orders it, a desk's as DeskChallenges.html.
 * @param {ReturnType<typeof import("./challenges-model.mjs").challengesModel>} model
 * @param {{historyOpen?: boolean, writing?: string, answering?: string}} [options] the screen's, not the model's: whether
 *   the history is open; the write on its way ("send", "accept", "decline", "cancel") and the challenge it answers
 * @returns {string}
 */
export function challengesMarkup(model, { historyOpen = false, writing = "", answering = "" } = {}) {
  const phone = model.phone === true;
  const options = { phone, historyOpen, writing, answering };
  if (phone) {
    const head = renderPageHead({ title: t("friendly.title"), metaHtml: playedMarkup(model), phone: true });
    return `<div class="g-friendly g-friendly--phone" data-screen="team-challenges">${head}<p class="g-friendly__note">${escapeHtml(t("friendly.note"))}</p>`
      + `${sendMarkup(model, options)}${failuresMarkup(model)}${stateMarkup(model)}${sectionsMarkup(model, options)}</div>`;
  }
  const head = renderPageHead({ title: t("friendly.title"), sub: t("friendly.deskSub"), metaHtml: sendMarkup(model, options) });
  return `<div class="g-friendly g-friendly--desk" data-screen="team-challenges">${head}${failuresMarkup(model)}${stateMarkup(model)}${sectionsMarkup(model, options)}</div>`;
}

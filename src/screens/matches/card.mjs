/**
 * The match on as the matches page draws it (Matches.html, MatchesLive.html, MatchesPrePlus.html): the section's own
 * heading with the phase beside it (not for a match not begun: the prototype draws the chip only past it), and under
 * it the card (`renderMatchCard`) the heading names.
 *
 * In the card, by phase (stage 09a decisions 4–6):
 *   - not begun or being prepared: both CTVs and the inducements' tile, a friendly's note, the line of who is out, and
 *     «Match preparation»;
 *   - in play or in its post-match: the tiles, the records leading to the roster with their count and sums, the note on
 *     the post-match, and «Post-match» in the header's colour;
 *   - a score sent: the score between the names, its line and who confirms it — or «Confirm the score» when the
 *     opponent sent it. No tiles.
 * The tile and the line open «Before the match» (`data-before-open`); a tile that cannot is closed and says why.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { icon } from "../../ui/icons.mjs";
import { assertLinkHref } from "../../ui/markup.mjs";
import { renderMatchCard } from "../../ui/match-card.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";

/** The chip's tone for each phase past the first. */
const PHASE_TONES = { preparing: "wait", live: "live", post: "wait", sent: "wait" };

/** The section's heading id: the card is labelled by it. */
const HEAD_ID = "matches-current";

/** The inducements' tile: a button that opens «Before the match», or a closed one with why it cannot. */
function inducementTile(tiles) {
  const info = `<span class="g-matches__tileicon">${icon("info", 14)}</span>`;
  if (!tiles.before) {
    const why = tiles.reason ? `<span class="g-matches__tilewhy">${escapeHtml(tiles.reason)}</span>` : "";
    return `<button type="button" class="g-matches__tile g-matches__tile--ind g-matches__tile--even g-matches__tile--closed" aria-disabled="true"`
      + `${tiles.reason ? ` data-before-closed="${escapeHtml(tiles.reason)}"` : ""}><span class="g-matches__tiletext">`
      + `<span class="g-matches__tilek">${escapeHtml(t("matches.inducements"))}</span><span class="g-matches__tilev">–</span>${why}</span>${info}</button>`;
  }
  const { who, amount, tone } = tiles.before;
  return `<button type="button" class="g-matches__tile g-matches__tile--ind g-matches__tile--${escapeHtml(tone)}" aria-haspopup="dialog" data-before-open="">`
    + `<span class="g-matches__tiletext"><span class="g-matches__tilek">${escapeHtml(t("matches.before.tile", { who }))}</span>`
    + `<span class="g-matches__tilev">${escapeHtml(amount)}</span></span>${info}</button>`;
}

/** Both CTVs, «1 120k / 1 210k», and the inducements' tile beside them. */
function tilesMarkup(tiles) {
  if (!tiles) return "";
  return `<div class="g-matches__tile"><span class="g-matches__tilek">${escapeHtml(t("matches.ctv"))}</span>`
    + `<span class="g-matches__tilev">${escapeHtml(tiles.own)} <span class="g-matches__tilerest">/ ${escapeHtml(tiles.other)}</span></span></div>${inducementTile(tiles)}`;
}

/** «Out: J. Corr · Seriously Hurt, B. Seven · Suspended», or «Lineup: all in»: it opens «Before the match» too. */
function missMarkup(miss) {
  if (!miss) return "";
  const parts = miss.parts.map(({ name, why }) => `<b>${escapeHtml(name)}</b>${why ? ` · ${escapeHtml(why)}` : ""}`).join(", ");
  return `<button type="button" class="g-matches__miss" aria-haspopup="dialog" data-before-open=""><span class="g-matches__misstext">${escapeHtml(miss.lead)} `
    + `${parts}</span><span class="g-matches__missicon">${icon("info", 14)}</span></button>`;
}

/** The match's records in play: their count and sums when read, why not when they could not be. */
function recordsMarkup(card, href) {
  const title = card.records ? t("matches.records", { count: card.records.count }) : t("shell.match.records");
  const sub = card.records
    ? t("matches.recordsSub", { touchdowns: card.records.touchdowns, casualties: card.records.casualties })
    : card.recordsError ? t("matches.recordsUnread", { reason: card.recordsError }) : "";
  assertLinkHref(href);
  return `<a class="g-matches__records" href="${escapeHtml(href)}"><span class="g-matches__recordstext"><span class="g-matches__recordstitle">${escapeHtml(title)}</span>`
    + `${sub ? `<span class="g-matches__recordssub">${escapeHtml(sub)}</span>` : ""}</span>${icon("chevron", 16)}</a>`
    + `<p class="g-matches__note">${escapeHtml(t("matches.liveNote"))}</p>`;
}

/** A score sent: its line, and who confirms it (nothing more when the coach is the one to confirm: the button says it). */
function sentMarkup(sent) {
  const waiting = sent.waitingFor ? `<span class="g-matches__sentnote">${escapeHtml(t("matches.sentWaiting", { team: sent.waitingFor }))}</span>` : "";
  return `<div class="g-matches__sent"><span class="g-matches__sentline">${escapeHtml(sent.line)}</span>${waiting}</div>`;
}

/** The card's body under the tiles: the friendly's note, who is out, the records or the score sent. */
function bodyOf(card) {
  const note = card.friendly && card.tiles ? `<div class="g-matches__friendly">${escapeHtml(t("matches.friendlyNote"))}</div>` : "";
  const records = card.links.find((link) => link.kind === "text");
  if (card.sent) return sentMarkup(card.sent);
  return `${note}${missMarkup(card.miss)}${records ? recordsMarkup(card, records.href) : ""}`;
}

/** How each loud action is drawn: the preparation and the confirmation in the accent, the post-match in the header's colour. */
const CTA_CLASS = { primary: "g-matches__cta", light: "g-matches__cta g-matches__cta--dark" };

/** The actions under the body, each the card's width, a chevron after the words. */
function actionsOf(card) {
  return card.links.filter((link) => CTA_CLASS[link.kind]).map(({ label, href, kind }) => {
    assertLinkHref(href);
    return `<a class="${CTA_CLASS[kind]}" href="${escapeHtml(href)}">${escapeHtml(label)}${icon("chevron", 16)}</a>`;
  }).join("");
}

/**
 * The section of the match on: «Next match» and the like, the phase's chip beside it, the card under it.
 * @param {NonNullable<ReturnType<typeof import("./model.mjs").matchesModel>["current"]>} card
 */
export function currentCardMarkup(card) {
  const chip = card.phase === "idle" ? "" : renderStatusChip({ label: t(`matches.status.${card.phase}`), tone: PHASE_TONES[card.phase] });
  const head = `<div class="g-matches__head"><h2 class="g-matches__title" id="${HEAD_ID}">${escapeHtml(t(`matches.head.${card.head}`))}</h2>${chip}</div>`;
  const other = card.other;
  return `<section class="g-matches__current">${head}${renderMatchCard({
    labelledBy: HEAD_ID, meta: card.meta, home: card.own, away: other, score: card.score, live: card.phase === "live" || card.phase === "post",
    tilesHtml: tilesMarkup(card.tiles), bodyHtml: bodyOf(card), actionsHtml: actionsOf(card),
  })}</section>`;
}

/** The round on has no match of the team yet: the section says so where the card would stand. */
export function noMatchMarkup() {
  return `<section class="g-matches__current"><div class="g-matches__head"><h2 class="g-matches__title" id="${HEAD_ID}">${escapeHtml(t("matches.head.next"))}</h2></div>`
    + `<p class="g-matches__none">${escapeHtml(t("matches.noMatch"))}</p></section>`;
}

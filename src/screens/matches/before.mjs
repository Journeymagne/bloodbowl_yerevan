/**
 * «Before the match» (MatchesPrePlus/Minus/Even.html, DeskSeasonPrePlus/Minus/Even.html): a sheet that says, from the
 * numbers the preparation would have (`matchPreview`, stage 09a decision 10), who gets the inducements and why — CTV
 * against CTV, the amount, both lineups —, who misses the match on each side with why and when back, and the inducement
 * budget the inducements step will give. The tile, the line of who is out and the board's bubbles that open it say the
 * same in fewer words (`beforeFigures`), from the same preview, so nothing on the page disagrees with the sheet.
 *
 * At equal CTVs a tier bonus stays (the owner's M2 answer, the league's Inducement Tiering): the sheet then says «CTVs
 * equal», never «no inducements», and names the bonus — ours in the budget, the opponent's on a line of its own. The
 * prototypes say «no inducements» at equal CTVs whatever the tiers: the code wins there (decision 12).
 *
 * The sheet stands in a host of its own at the end of `<body>` (`mountSheetHost`), one for the page: it outlives the
 * screen's redraws, and the screen that opened it takes it away when it is left (`closeBeforeSheet`). Its widths are the
 * sheet's (`renderSheet`, wide: 640px from 901px, from the bottom up to 900px) and before.css's.
 */
import { escapeHtml, focusLost } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { getLocale, t } from "../../core/i18n.mjs";
import { refUrl } from "../../core/routes.mjs";
import { patchWithModal, renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { mountSheetHost, unmountSheetHost } from "../team/manage/sheet-host.mjs";
import { absenceWords } from "../team/roster/panel.mjs";

export const BEFORE_SHEET_ID = "match-before";

/** @typedef {ReturnType<typeof import("../../domain/match/preview.mjs").matchPreview>} Preview */

const HERO_TONES = { own: "gets", other: "pays", even: "even" };
const MINUS = "−";

/** «Before the match · Round 7», «· Friendly» for a match with no round. */
export function beforeTitle(game) {
  const match = game?.kind === "friendly" || game?.roundNumber === null || game?.roundNumber === undefined
    ? t("matches.before.friendly") : t("matches.before.round", { round: game.roundNumber });
  return t("matches.before.title", { match });
}

/** Either side has a tier bonus: equal CTVs are then no «no inducements» (pre-flight L8). */
const anyBonus = (preview) => preview.bonus.own > 0 || preview.bonus.other > 0;

/** When a player who misses this match is back: the round after it, or the next match after a friendly. */
function backWords(game) {
  const round = Number(game?.roundNumber);
  return game?.kind === "friendly" || !Number.isInteger(round) ? t("matches.before.backNext") : t("matches.before.back", { round: round + 1 });
}

/** The first letter lower, the rest as written: an injury with its characteristic, a coach's note (pre-flight L25). */
const lowerFirst = (words) => (words ? words.charAt(0).toLocaleLowerCase() + words.slice(1) : words);

/**
 * Why a player misses the match, as the line after his name says it: in Russian with its first letter small (pre-flight
 * L25: «· тяжёлое повреждение»); in English as the injury is named, «· Seriously Hurt» (the fix wave's parked 6: the
 * names are capitalised word by word, and a small first letter alone read «seriously Hurt»).
 */
const reasonOf = (player) => (getLocale() === "ru" ? lowerFirst(absenceWords(player)) : absenceWords(player));

/**
 * Our players who miss the match, each with why (the fidelity pass's G4): «J. Corr · Seriously Hurt, B. Seven ·
 * Suspended by the league»; one reason after all the names when they share it, «Elriel, Thalion · Serious Injury».
 */
function missParts(players) {
  const reasons = players.map(reasonOf);
  if (reasons.every((why) => why === reasons[0])) return [{ name: players.map((player) => player.name).join(", "), why: reasons[0] }];
  return players.map((player, at) => ({ name: player.name, why: reasons[at] }));
}

function sideMarkup(side, which) {
  const other = which === "other";
  return `<span class="g-before__side${other ? " g-before__side--other" : ""}"><span class="g-before__name">${escapeHtml(side.name)}</span>`
    + `<span class="g-before__ctvk">${escapeHtml(t("matches.before.ctv"))}</span><span class="g-before__ctv">${escapeHtml(formatMoney(side.ctv))}</span></span>`;
}

const lineupMarkup = (side, other = false) => `<span class="g-before__lineup${other ? " g-before__lineup--other" : ""}">${escapeHtml(t("matches.before.lineup"))} `
  + `<b>${escapeHtml(t("matches.before.ofTotal", { count: side.available, total: side.total }))}</b></span>`;

function heroMarkup(preview) {
  const even = preview.gets === "even";
  const to = even && anyBonus(preview) ? t("matches.before.evenBonus") : t(`matches.before.to.${preview.gets}`);
  const amount = even ? "0" : formatMoney(preview.difference);
  return `<div class="g-before__hero g-before__hero--${HERO_TONES[preview.gets]}"><div class="g-before__teams">${sideMarkup(preview.own, "own")}`
    + `<span class="g-before__mid"><span class="g-before__amount">${escapeHtml(amount)}</span><span class="g-before__to">${escapeHtml(to)}</span></span>`
    + `${sideMarkup(preview.other, "other")}</div><div class="g-before__lineups">${lineupMarkup(preview.own)}${lineupMarkup(preview.other, true)}</div></div>`;
}

/** One who misses the match: «#9 J. Corr» on our side, «J. Corr #9» on the opponent's, which stands at the right. */
function missMarkup(player, game, other) {
  const who = other ? `${player.name} #${player.number}` : `#${player.number} ${player.name}`;
  const back = player.retired ? "" : `<span class="g-before__back">${escapeHtml(backWords(game))}</span>`;
  return `<li class="g-before__miss"><span class="g-before__who">${escapeHtml(who)}</span><span class="g-before__pos">${escapeHtml(player.position)}</span>`
    + `<span class="g-before__why">${escapeHtml(absenceWords(player))}</span>${back}</li>`;
}

function columnMarkup(side, game, other) {
  const kind = other ? " g-before__col--other" : "";
  if (!side.missing.length) return `<div class="g-before__col${kind}"><p class="g-before__none">${escapeHtml(t("matches.before.none"))}</p></div>`;
  return `<div class="g-before__col${kind}"><ul class="g-before__list" aria-label="${escapeHtml(side.name)}">`
    + `${side.missing.map((player) => missMarkup(player, game, other)).join("")}</ul></div>`;
}

/**
 * The budget's lines, as the preview gives them; ours, and the opponent's tier bonus when there is one. Once the match
 * has begun the treasury was settled by the start, and the saved team's treasury is what is left after it: the line
 * says so rather than give that remainder as what may be spent (the final review, m-2).
 */
function budgetLines(preview, begun) {
  const { gets, petty, bonus, treasury } = preview;
  const lines = [[gets === "own" ? t("matches.before.petty") : t("matches.before.pettyNone"), formatMoney(petty)]];
  if (gets !== "even" || bonus.own > 0) lines.push([t("matches.before.bonus"), formatMoney(bonus.own)]);
  if (bonus.other > 0) lines.push([t("matches.before.bonusOther"), formatMoney(bonus.other)]);
  if (begun && gets !== "even") lines.push([t("matches.before.treasury"), t("matches.before.treasuryStarted")]);
  else if (gets === "own") lines.push([t("matches.before.treasuryTop"), t("matches.before.treasuryUpTo", { amount: formatMoney(treasury.amount) })]);
  else if (gets === "other") lines.push([t("matches.before.treasury"), t("matches.before.treasuryAll", { amount: formatMoney(treasury.amount) })]);
  else lines.push([t("matches.before.treasury"), t("matches.before.treasuryNone")]);
  return lines;
}

function budgetMarkup(preview, begun) {
  const note = preview.gets === "even" && anyBonus(preview) ? t("matches.before.noteEvenBonus") : t(`matches.before.note.${preview.gets}`);
  const lines = budgetLines(preview, begun).map(([label, value]) => `<div class="g-before__line"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  return `<section class="g-before__budget"><h3 class="g-before__heading g-before__heading--start">${escapeHtml(t("matches.before.budget"))}</h3>`
    + `<dl class="g-before__lines">${lines}</dl><p class="g-before__note">${escapeHtml(note)}</p></section>`;
}

/**
 * The sheet, closed (`patchWithModal` opens it): the CTV block, who misses the match in two columns (ours at the left),
 * the budget and the way to what inducements can buy. Its widths are CSS's.
 * @param {{preview: NonNullable<Preview>, game: object}} props
 */
export function beforeSheetMarkup({ preview, game }) {
  const body = `<div class="g-before">${heroMarkup(preview)}<div class="g-before__body">`
    + `<h3 class="g-before__heading">${escapeHtml(t("matches.before.missing"))}</h3>`
    + `<div class="g-before__missing">${columnMarkup(preview.own, game, false)}${columnMarkup(preview.other, game, true)}</div>`
    + `${budgetMarkup(preview, game?.preparationStatus === "in_progress")}<a class="g-before__shop" href="${escapeHtml(refUrl("inducements"))}">${escapeHtml(t("matches.before.shop"))}</a></div></div>`;
  return renderSheet({ id: BEFORE_SHEET_ID, title: beforeTitle(game), wide: true, className: "g-before-sheet", bodyHtml: body });
}

/**
 * What the tile, the line of who is out and the bubbles say, from the same preview as the sheet: the amount of the
 * difference with its sign (`+90k` ours, `−90k` the opponent's, `0` at equal CTVs; the tier bonus is the sheet's to say),
 * our players who miss the match with why each one does (`missParts`), and how many miss it on both sides.
 * `bubble.gets` is null when no side gets the difference: there is no bubble then.
 * @param {NonNullable<Preview>} preview
 */
export function beforeFigures(preview) {
  const { gets, difference } = preview;
  const amount = gets === "even" ? "0" : `${gets === "own" ? "+" : MINUS}${formatMoney(difference)}`;
  const ours = preview.own.missing;
  const miss = ours.length
    ? { lead: t("matches.before.out"), parts: missParts(ours) }
    : { lead: t("matches.before.lineupLead"), parts: [{ name: t("matches.before.lineupAll"), why: "" }] };
  const count = ours.length + preview.other.missing.length;
  return {
    tile: { who: t(`matches.before.tileWho.${gets}`), amount, tone: HERO_TONES[gets] },
    miss,
    bubble: gets === "even" ? { gets: null, text: "" } : { gets, text: t("matches.before.bubble", { amount: formatMoney(difference) }) },
    missText: count ? t("matches.before.bubbleMiss", { count }) : t("matches.before.allIn"),
  };
}

/** The page's host while the sheet has one, what took it away again, and the button the focus goes back to. */
let host = null;
let unwire = () => {};
let opener = null;

/** Closed by the cross, the backdrop or Escape: the dialog goes, and the focus back to the button that opened it. */
function dismissed() {
  patchWithModal(host, "");
  const back = opener;
  opener = null;
  if (back && !focusLost(back)) back.focus();
}

/**
 * Show the sheet over the page.
 * @param {Element|null} from what opened it: the focus goes back there when it is closed
 * @param {{preview: NonNullable<Preview>, game: object}} props
 */
export function openBeforeSheet(from, { preview, game }) {
  if (!host) {
    host = mountSheetHost(BEFORE_SHEET_ID);
    unwire = wireSheets(host, { onClose: dismissed });
  } else if (!host.isConnected) {
    document.body.append(host);
  }
  opener = from;
  patchWithModal(host, beforeSheetMarkup({ preview, game }), `#${BEFORE_SHEET_ID}`);
}

/** The screen is left: the sheet closes and its host goes. */
export function closeBeforeSheet() {
  if (!host) return;
  unwire();
  unmountSheetHost(host);
  host = null;
  unwire = () => {};
  opener = null;
}

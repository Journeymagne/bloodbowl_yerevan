/**
 * Letting a player go (spec UI §11; StatsSell on a phone, DeskRosterSell on a desk): what he cost, what he gained, what
 * he is worth now and what comes back — half his value, or under Architect of Fate his full value and his injuries —
 * and the treasury before and after; for a purchase no match has sealed yet, the price paid back in full. The sale's
 * button is the screen's one red button: it cannot be undone; a cancelled purchase can be bought again, so its button
 * is not.
 *
 * What parting with him gives is the domain's (`line.removal`, `playerRemoval` on the queue's draft at every draw), so
 * the sheet says what the press will do; the press itself is market.mjs's.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { sumMoney } from "../../../domain/money.mjs";
import { teamHasSpecialRule } from "../../../domain/roster/team-rules.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { classNames } from "../../../ui/markup.mjs";
import { renderPlayerBadge } from "../../../ui/number-badge.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { prepResetWords } from "./panel.mjs";
import { SELL_SHEET, footButton } from "./sheets.mjs";

/** The arrow from the treasury now to the treasury after, as both prototypes draw it: a sign, with no words of its own. */
const ARROW = '<svg class="g-market__arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** What comes back, or what a line adds: «+47.5k». */
const plus = (amount) => t("teamRoster.sell.plus", { amount: formatMoney(amount) });

/**
 * Who he is, on a phone (StatsSell.html; a desk's sub says it): his number on his position's colour, his name, and
 * «Catcher · 6 SPP · Catch, Dodge, Block» — his skills as his row lists them, his position's first.
 * @param {import("./model.mjs").PlayerLine} line
 */
function whoMarkup(line) {
  const skills = line.skills.map(({ name }) => name).join(", ") || t("newTeam.noSkills");
  return `<div class="g-market__who">${renderPlayerBadge({ number: line.number, kind: line.kind, captain: line.captain })}`
    + `<span class="g-market__whotext"><b class="g-market__whoname">${escapeHtml(line.name)}</b>`
    + `<span class="g-market__wholine">${escapeHtml(t("teamRoster.sell.who", { position: line.position, spp: line.earned, skills }))}</span></span></div>`;
}

/** One line of what he is worth: the words at the left, the sum at the right in its look (`className`). */
function factMarkup(label, value, className = "") {
  return `<div class="g-market__fact"><dt class="g-market__factkey">${escapeHtml(label)}</dt>`
    + `<dd class="${classNames("g-market__factvalue", className)}">${escapeHtml(value)}</dd></div>`;
}

/**
 * The lines (DeskRosterSell.html): for a sale what his position costs to hire, what his skills and improvements add
 * («—» for nothing), what he is worth now, his career's SPP that go with him (red), and what comes back — half, or under
 * Architect of Fate his whole value and 10k an injury; for a cancel what was paid and what comes back, the same.
 * @param {import("./model.mjs").PlayerLine} line @param {boolean} cancel @param {boolean} fate
 */
function factsMarkup(line, cancel, fate) {
  const back = plus(line.removal.amount);
  if (cancel) return factMarkup(t("teamRoster.sell.paid"), formatMoney(line.removal.amount)) + factMarkup(t("teamRoster.sell.refund"), back, "g-market__back");
  const extras = sumMoney(line.value, -line.price);
  const added = extras > 0 ? plus(extras) : extras < 0 ? formatMoney(extras) : t("teamRoster.sell.nothing");
  return factMarkup(t("teamRoster.sell.price", { position: line.position }), formatMoney(line.price))
    + factMarkup(t("teamRoster.sell.extras"), added)
    + factMarkup(t("teamRoster.sell.value"), formatMoney(line.value), "g-market__factvalue--total")
    + factMarkup(t("teamRoster.sell.spp"), t("teamRoster.sell.sppLost", { spp: line.earned }), "g-market__lost")
    + factMarkup(fate ? t("teamRoster.sell.backFate") : t("teamRoster.sell.back"), back, "g-market__back");
}

/** «Treasury now 120k → After the sale 167.5k», on the accent's tint. */
function flowMarkup(treasury, amount, cancel) {
  const side = (label, value, className = "") => `<span class="${classNames("g-market__flowside", className)}"><span class="g-market__flowlabel">${escapeHtml(label)}</span>`
    + `<b class="g-market__flownum">${escapeHtml(value)}</b></span>`;
  const after = cancel ? t("teamRoster.sell.afterCancel") : t("teamRoster.sell.after");
  return `<div class="g-market__flow">${side(t("teamRoster.sell.now"), formatMoney(treasury))}${ARROW}`
    + `${side(after, formatMoney(sumMoney(treasury, amount)), "g-market__flowside--after")}</div>`;
}

/** What it means, under the flow: the sale's rule (Architect of Fate's own), or the cancel's; and the captaincy that goes with him. */
function notesMarkup(line, cancel, fate) {
  let note = t("teamRoster.sell.note");
  if (cancel) note = t("teamRoster.sell.cancelNote");
  else if (fate) note = t("teamRoster.sell.noteFate");
  const captain = line.captain ? `<p class="g-market__note">${escapeHtml(t("teamRoster.sell.captain", { name: line.name }))}</p>` : "";
  return `<p class="g-market__note">${escapeHtml(note)}</p>${captain}`;
}

/**
 * The sheet that asks before a player goes (decision 14), from the bottom on a phone and a modal on a desk: the title,
 * on a desk «Hal · #8 Catcher» under it (market.css hides it on a phone, where his card says who), the lines, the
 * treasury now and after, what it means, and in a preparation what a save of the roster resets (R12). «Cancel» beside
 * the button on a desk (hidden on a phone, where the cross closes the sheet). The button says what comes back; closed
 * with the screen's reason (`reason`), it stays in reach to say it.
 *
 * @param {object} props
 * @param {import("./model.mjs").PlayerLine} props.line the player; `line.removal` is what parting with him gives on the queue's draft
 * @param {object} props.race the team's race
 * @param {number} props.treasury the treasury on the queue's draft
 * @param {{kind: string}} props.mode what the roster is for just now
 * @param {string} [props.refusal] the last press's refusal, "" for none
 * @param {string} [props.reason] why he cannot go just now (`sellClosed`), "" when he can
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-sell")` opens it
 */
export function sellSheetMarkup({ line, race, treasury, mode, refusal = "", reason = "" }) {
  const cancel = line.removal.type === "cancel-purchase";
  const fate = !cancel && teamHasSpecialRule(race, "Architect of Fate");
  const amount = formatMoney(line.removal.amount);
  const prep = mode.kind === "prep" ? `<p class="g-market__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const alert = refusal ? `<p class="g-market__refusal" role="alert">${escapeHtml(refusal)}</p>` : "";
  return renderSheet({
    id: SELL_SHEET,
    title: cancel ? t("teamRoster.sell.cancelTitle") : t("teamRoster.sell.title"),
    sub: t("teamRoster.sell.sub", { name: line.name, number: line.number, position: line.position }),
    bodyHtml: `${whoMarkup(line)}<dl class="g-market__rows">${factsMarkup(line, cancel, fate)}</dl>${flowMarkup(treasury, line.removal.amount, cancel)}`
      + `${notesMarkup(line, cancel, fate)}${prep}${alert}`,
    footStartHtml: renderButton({ label: t("teamRoster.sell.keep"), data: { sellKeep: true } }),
    footHtml: footButton({
      label: cancel ? t("teamRoster.sell.cancelSend", { amount }) : t("teamRoster.sell.send", { amount }),
      kind: cancel ? "primary" : "danger",
      data: { sellSend: true },
      reason,
    }),
  });
}

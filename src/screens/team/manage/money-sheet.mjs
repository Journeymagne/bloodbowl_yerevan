/**
 * «Add / Take»: the sheet that moves the treasury by hand (TeamManageMoney, DeskRosterFunds). An amount, what it
 * is for, a comment if there is one, the treasury as it will stand, and one button that says what it waits for.
 *
 * The strip of the desk roster and the phone's treasury card both open it (`openMoneySheet`) into a host of
 * their own (`mountSheetHost`); `wireMoneySheet(host)` is the whole of its wiring. What the sheet holds while it
 * is open is the form, which `moneySheetMarkup` only draws. The amount is kept as it was typed, so a redraw never
 * rewrites a field the coach is in.
 *
 * Nothing the sheet judges is its own: whether a debit can be covered, which reasons there are and how long a
 * comment may be come from `moneyCheck` (model.mjs) and the domain, whether a match is on from `matchLock`, and
 * the write from `addTreasuryEntry`. The sheet decides again at the press, on what the page holds then.
 */
import { escapeHtml, listenerGroup } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { onGamesChange } from "../../../data/games.mjs";
import { onMyTeamsChange } from "../../../data/teams.mjs";
import { addTreasuryEntry, readLedger } from "../../../data/treasury.mjs";
import { MANUAL_REASONS } from "../../../domain/roster/ledger.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { wireRadioGroups } from "../../../ui/choice.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../../../ui/segmented-control.mjs";
import { renderSheet, wireSheets } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { MAX_ENTRY, MAX_NOTE, matchLock, moneyCheck, readAmount } from "./model.mjs";
import { sheetController, teamToast } from "./sheet-host.mjs";

export const MONEY_SHEET_ID = "treasury-money";
/** The amounts to press, in thousands. */
export const MONEY_PRESETS = Object.freeze([5, 10, 20, 50, 100]);
/** What a new sheet opens on: the middle preset. */
const DEFAULT_AMOUNT = "20";
/** The amount field: what the input is wired by, and where the focus goes when the button it was on is disabled under it. */
const AMOUNT_FIELD = "#money-amount";

/** What the button says about the one thing it waits for, by `moneyCheck`'s problem. Literal keys, so the dictionary test finds them. */
const PROBLEM_TEXT = {
  amount: () => t("treasury.money.needAmount"),
  tooMuch: () => t("treasury.money.tooMuch", { max: formatMoney(MAX_ENTRY) }),
  reason: () => t("treasury.money.needReason"),
  note: () => t("treasury.money.noteLong", { max: MAX_NOTE }),
  short: (check) => t("treasury.money.short", { short: formatMoney(check.short) }),
};

/**
 * The button's words: waiting, a match on, what is missing, or what it will do. A match on is said before what
 * is missing, since nothing the coach fills in changes it.
 */
function applyLabel(form, check, locked) {
  if (form.pending) return t("treasury.money.saving");
  if (locked) return t("treasury.lockedLive");
  if (check.problem) return PROBLEM_TEXT[check.problem](check);
  const amount = formatMoney(Math.abs(check.delta));
  return form.sign > 0 ? t("treasury.money.in", { amount }) : t("treasury.money.out", { amount });
}

/** Amounts to press, not a group to choose from: a typed amount matches none of them, and the one that matches is pressed. */
function presetsHtml(amount) {
  const buttons = MONEY_PRESETS
    .map((preset) => `<button type="button" class="g-money__preset" data-money-preset="${preset}" aria-pressed="${amount === preset}">${escapeHtml(formatMoney(preset))}</button>`)
    .join("");
  return `<div class="g-money__presets" role="group" aria-label="${escapeHtml(t("treasury.money.amounts"))}">${buttons}</div>`;
}

/**
 * The reasons, a radio group wired by `wireRadioGroups`, as a segmented control is. FilterChips draws the same
 * thing and does not fit: it needs one chip chosen (a reason is asked for, never guessed, so at first none is) and
 * it scrolls sideways, where five chips must wrap. With none chosen the first stands in the tab order, so the group
 * can be entered by the keyboard.
 */
function reasonsHtml(chosen) {
  const entry = MANUAL_REASONS.includes(chosen) ? chosen : MANUAL_REASONS[0];
  const chips = MANUAL_REASONS
    .map((reason) => `<button type="button" class="g-money__reason" role="radio" data-money-reason="${escapeHtml(reason)}" aria-checked="${reason === chosen}" tabindex="${reason === entry ? 0 : -1}">${escapeHtml(t(`treasury.reason.${reason}`))}</button>`)
    .join("");
  const label = escapeHtml(t("treasury.money.reason"));
  return `<div class="g-money__group"><span class="g-money__label" aria-hidden="true">${label}</span>`
    + `<div class="g-money__reasons" role="radiogroup" aria-label="${label}" data-money-reasons>${chips}</div></div>`;
}

/**
 * «Treasury: 70k → 112.5k», the figure after the arrow set apart; the sentence is the dictionary's, so the figure
 * is found in it. `block` is the class of the line (`g-money__preview`, and the fix sheet's `g-fix__preview`), which
 * gets its `--short` where the treasury would stand below zero.
 */
export function previewHtml(block, before, after) {
  const figure = formatMoney(after);
  const text = t("treasury.money.preview", { before: formatMoney(before), after: figure });
  const at = text.lastIndexOf(figure);
  const line = at < 0 ? escapeHtml(text) : `<span>${escapeHtml(text.slice(0, at))}</span><span>${escapeHtml(text.slice(at))}</span>`;
  return `<p class="${block}${after < 0 ? ` ${block}--short` : ""}">${line}</p>`;
}

/** Always on the page, so a screen reader hears what is put in it. */
const alertHtml = (refusal) => `<div class="g-money__alert" role="alert">${refusal ? renderCallout({ tone: "danger", title: refusal }) : ""}</div>`;

function bodyHtml(form, treasury, check) {
  const amount = readAmount(form.amountText);
  const sign = renderSegmentedControl({
    label: t("treasury.money.sign"),
    items: [{ value: "in", label: t("treasury.money.signIn") }, { value: "out", label: t("treasury.money.signOut") }],
    selected: form.sign > 0 ? "in" : "out",
    data: { segGroup: "money-sign" },
  });
  // A text that reads as no amount (a second decimal) is marked; the hint under the field says what it takes.
  const amountField = renderTextField({
    id: "money-amount", name: "amount", label: t("treasury.money.amount"), value: form.amountText, inputmode: "decimal", verbatim: true, autocomplete: "off",
    help: t("treasury.money.amountHelp"), invalid: form.amountText.trim() !== "" && amount === null,
  });
  const noteField = renderTextField({ id: "money-note", name: "note", label: t("treasury.money.note"), value: form.note, autocomplete: "off" });
  return `<div class="g-money">${sign}${presetsHtml(amount)}${amountField}${reasonsHtml(form.reason)}${noteField}${previewHtml("g-money__preview", treasury, check.after)}${alertHtml(form.refusal)}</div>`;
}

/**
 * The sheet, closed (`patchWithModal` opens it).
 *
 * @param {object} input
 * @param {{teamId: string, sign: 1|-1, amountText: string, reason: string, note: string, pending: boolean, refusal: string}} input.form
 *   `amountText` as typed, `reason` empty until one is chosen, `refusal` what the last try was told
 * @param {number} input.treasury the team's treasury now, in thousands
 * @param {boolean} input.locked a match is on: nothing is entered until its post-match
 * @returns {string}
 */
export function moneySheetMarkup({ form, treasury, locked }) {
  const check = moneyCheck({ treasury, sign: form.sign, amountText: form.amountText, reason: form.reason, note: form.note });
  // Not disabled while it waits (`busy`): a focused button that is disabled drops the focus in Chrome. The press is refused in `apply`.
  const button = renderButton({
    kind: "primary", label: applyLabel(form, check, locked), busy: form.pending, disabled: !form.pending && (locked || Boolean(check.problem)), data: { moneyApply: "" },
  });
  return renderSheet({
    id: MONEY_SHEET_ID,
    title: form.sign > 0 ? t("treasury.money.titleIn") : t("treasury.money.titleOut"),
    bodyHtml: bodyHtml(form, treasury, check),
    footHtml: button,
  });
}

const treasuryOf = (teamId) => countToNumber(state.myTeams.items.find((team) => team.id === teamId)?.roster?.treasury);
const isLive = (teamId) => matchLock(state.games.items, teamId)?.kind === "live";

const drawn = (form) => moneySheetMarkup({ form, treasury: treasuryOf(form.teamId), locked: isLive(form.teamId) });

/** One controller per host, so that opening and wiring a host, which are two calls, meet the same form. */
const controllers = new WeakMap();
function controllerOf(host) {
  if (!controllers.has(host)) controllers.set(host, sheetController(host, { id: MONEY_SHEET_ID, markup: drawn }));
  return controllers.get(host);
}

/**
 * Open the sheet in `host` on a new form: 20k, no reason, no comment.
 *
 * @param {Element} host from `mountSheetHost`, wired by `wireMoneySheet`
 * @param {object} options
 * @param {string} options.teamId
 * @param {1|-1} [options.sign] add (1, the default) or take (-1)
 * @param {Element|null} [options.opener] the button that was pressed: it gets the focus back when the sheet closes
 */
export function openMoneySheet(host, { teamId, sign = 1, opener = null }) {
  controllerOf(host).open({ teamId, sign: sign < 0 ? -1 : 1, amountText: DEFAULT_AMOUNT, reason: "", note: "", pending: false, refusal: "" }, opener);
}

/**
 * The press on the sheet's button. What the page holds is asked again here: the sheet may have been drawn before
 * the treasury moved or a match went live, and a button that looks pressable is not a promise. A problem is
 * drawn (the button says it) and nothing is sent.
 */
async function apply(sheet) {
  const form = sheet.form;
  if (!form || form.pending) return;
  const check = moneyCheck({ treasury: treasuryOf(form.teamId), sign: form.sign, amountText: form.amountText, reason: form.reason, note: form.note });
  if (check.problem || isLive(form.teamId)) {
    // The button that was pressed is disabled by the redraw, and the focus on it would be dropped.
    sheet.redraw();
    sheet.focus(AMOUNT_FIELD);
    return;
  }
  const amount = formatMoney(Math.abs(check.delta));
  await sheet.submit(() => addTreasuryEntry(form.teamId, { delta: check.delta, reason: form.reason, note: form.note.trim() }), {
    // The entry may be written already; a new one is the coach's deliberate act, after the history.
    startOver: { amountText: "" },
    refocus: AMOUNT_FIELD,
    // A lost answer is read again by `addTreasuryEntry`; an entry whose own code threw is not, so the history is read here.
    unknown: () => { void readLedger(form.teamId); },
    done: () => teamToast(form.teamId, form.sign > 0 ? t("treasury.money.doneIn", { amount }) : t("treasury.money.doneOut", { amount })),
  });
}

/**
 * Everything the sheet does once it is in `host`: the cross, the backdrop and Escape close it; the sign, an amount
 * (pressed or typed), the reason and the comment change the form, and the sheet is drawn again in place, so the
 * field being typed in keeps its focus and its caret; the button sends one entry. Closing, by any road, forgets
 * the form and gives the focus back to the button that opened the sheet.
 *
 * @param {Element} host
 * @returns {() => void} removes the listeners
 */
export function wireMoneySheet(host) {
  const sheet = controllerOf(host);
  const group = listenerGroup(host);
  group.own(wireSheets(host, { onClose: (id) => { if (id === MONEY_SHEET_ID) sheet.close(); } }));
  group.own(wireSegmentedControls(host, (value) => sheet.change({ sign: value === "in" ? 1 : -1 }), { group: "money-sign" }));
  group.own(wireRadioGroups(host, { group: "[data-money-reasons]", item: "[data-money-reason]", attribute: "data-money-reason", onChange: (reason) => sheet.change({ reason }) }));
  group.on("click", "[data-money-preset]", (event, button) => sheet.change({ amountText: button.getAttribute("data-money-preset") }));
  group.on("input", AMOUNT_FIELD, (event, input) => sheet.change({ amountText: input.value }));
  group.on("input", "#money-note", (event, input) => sheet.change({ note: input.value }));
  group.on("click", "[data-money-apply]", () => { void apply(sheet); });
  // The team moved (a write of this sheet's or of the page's, which may have landed after the sheet was opened again): the preview is read
  // again. A match that went live shuts the button at once, not only at the press.
  group.own(onMyTeamsChange(() => sheet.follow()));
  group.own(onGamesChange(() => sheet.follow()));
  return () => group.release();
}

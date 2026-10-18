/**
 * «Correct by hand» (TeamManage, «Исправить вручную»): the sheet that sets the treasury and Coach's Safe to what
 * the coach says they are, when the books and the page have parted ways. Two amounts, the treasury as it will
 * stand, and one button that says what it waits for.
 *
 * It is a roster save (`saveTeamRoster`): the team as the list holds it with the two balances replaced, and
 * nothing else moved. The server reads the difference (`classifyTreasuryChange`) and, where the treasury differs,
 * writes it to the history as one line by hand, with no reason; the safe has no history, so a change of it alone
 * leaves no line. The words of the sheet say so.
 *
 * `wireFixSheet(root)` is the whole of its wiring: the sheet stands in a host of its own on the body
 * (`mountSheetHost`), and any `[data-treasury-fix]` button under `root` opens it. What the sheet holds while it
 * is open is the form, which `fixSheetMarkup` only draws. A field the coach has not touched is `null` in the form
 * and shows the team as it stands now, so a team that moves under the sheet (a 409, a read after a lost answer)
 * is shown as it is, and the fields are put back to that by one assignment; a field typed in is kept as typed.
 */
import { toast } from "../../../components/toast.mjs";
import { delegate, listenerGroup } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { state } from "../../../core/state.mjs";
import { loadMyTeams, onMyTeamsChange } from "../../../data/teams.mjs";
import { readLedger, saveTeamRoster } from "../../../data/treasury.mjs";
import { normalizeDraft } from "../../../domain/roster/schema.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { renderCallout } from "../../../ui/callout.mjs";
import { renderSheet, wireSheets } from "../../../ui/sheet.mjs";
import { renderTextField } from "../../../ui/text-field.mjs";
import { MAX_ENTRY, matchLock, readAmount } from "./model.mjs";
import { previewHtml } from "./money-sheet.mjs";
import { mountSheetHost, sheetController, unmountSheetHost } from "./sheet-host.mjs";

export const FIX_SHEET_ID = "treasury-fix";
/** The treasury field: where the focus goes when the button it was on is disabled under it. */
const TREASURY_FIELD = "#fix-treasury";
const SAFE_FIELD = "#fix-safe";

/**
 * What a field says: its amount (the balance itself where the coach has not touched it), or why it says none:
 * `invalid`, a text `readAmount` does not read, or `tooMuch`, more than `MAX_ENTRY`. A tenth of a thousand
 * up to `MAX_ENTRY` is always an amount the server counts in gold; above it the history's column overflows (the
 * server answers 500, which would read as a write that may have gone through), so the field refuses it first.
 */
function fieldOf(text, balance) {
  if (text === null) return { amount: balance, problem: null };
  const amount = readAmount(text);
  if (amount === null) return { amount: null, problem: "invalid" };
  return amount > MAX_ENTRY ? { amount: null, problem: "tooMuch" } : { amount, problem: null };
}

/** What the form says against the balances now: each field, and whether the two amounts are as they were. */
function fixCheck(form, before) {
  const treasury = fieldOf(form.treasuryText, before.treasury);
  const safe = fieldOf(form.safeText, before.safe);
  return {
    treasury,
    safe,
    invalid: Boolean(treasury.problem || safe.problem),
    unchanged: treasury.amount === before.treasury && safe.amount === before.safe,
  };
}

/** What a field with no amount says at itself: the limit, or what `invalid` is for that balance. */
function errorOf(field, invalid) {
  if (field.problem === "tooMuch") return t("treasury.fix.tooMuch", { max: formatMoney(MAX_ENTRY) });
  return field.problem ? invalid : "";
}

/** The button's words: waiting, a match on, nothing to save, or what it does. A match on is said before the rest, since nothing the coach types changes it. */
function saveLabel(form, check, locked) {
  if (form.pending) return t("treasury.money.saving");
  if (locked) return t("treasury.lockedLive");
  return check.unchanged ? t("treasury.fix.unchanged") : t("common.save");
}

/** Always on the page, so a screen reader hears what is put in it. */
const alertHtml = (refusal) => `<div class="g-fix__alert" role="alert">${refusal ? renderCallout({ tone: "danger", title: refusal }) : ""}</div>`;

/**
 * The sheet, closed (`patchWithModal` opens it).
 *
 * @param {object} input
 * @param {{teamId: string, treasuryText: string|null, safeText: string|null, pending: boolean, refusal: string}} input.form
 *   a text as typed, or null for a field not touched yet (it shows the balance); `refusal` what the last try was told
 * @param {{treasury: number, safe: number}} input.before the balances the team holds now, in thousands
 * @param {boolean} input.locked a match is on: nothing is corrected until its post-match
 * @returns {string}
 */
export function fixSheetMarkup({ form, before, locked }) {
  const check = fixCheck(form, before);
  // Read-only while the save is on its way (not disabled: a focused field that is disabled drops the focus): what is
  // typed then would meet the team the answer brings, and be shown over it.
  const treasuryField = renderTextField({
    id: "fix-treasury", name: "treasury", label: t("treasury.fix.treasury"), value: form.treasuryText ?? String(before.treasury),
    inputmode: "decimal", verbatim: true, autocomplete: "off", readonly: form.pending, error: errorOf(check.treasury, t("validation.TREASURY_INVALID")),
  });
  const safeField = renderTextField({
    id: "fix-safe", name: "safe", label: t("treasury.fix.safe"), value: form.safeText ?? String(before.safe),
    inputmode: "decimal", verbatim: true, autocomplete: "off", readonly: form.pending, error: errorOf(check.safe, t("validation.SAFE_INVALID")),
  });
  const preview = previewHtml("g-fix__preview", before.treasury, check.treasury.amount ?? before.treasury);
  // Not disabled while it waits (`busy`): a focused button that is disabled drops the focus in Chrome. The press is refused in `submit`.
  const button = renderButton({
    kind: "primary", label: saveLabel(form, check, locked), busy: form.pending, disabled: !form.pending && (locked || check.invalid || check.unchanged), data: { fixSave: "" },
  });
  return renderSheet({
    id: FIX_SHEET_ID,
    title: t("treasury.fix.title"),
    sub: t("treasury.fix.sub"),
    bodyHtml: `<div class="g-fix">${treasuryField}${safeField}${preview}${alertHtml(form.refusal)}</div>`,
    footHtml: button,
  });
}

const teamOf = (teamId) => state.myTeams.items.find((team) => team.id === teamId);
const isLive = (teamId) => matchLock(state.games.items, teamId)?.kind === "live";
const balancesOf = (teamId) => ({ treasury: countToNumber(teamOf(teamId)?.roster?.treasury), safe: countToNumber(teamOf(teamId)?.roster?.coachesSafe) });

const drawn = (form) => fixSheetMarkup({ form, before: balancesOf(form.teamId), locked: isLive(form.teamId) });

/**
 * A field the coach has not typed in shows the balance as it is now. `patch` leaves the control that has the focus
 * alone, so as not to fight a person typing, and the focus may be on such a field (after a disarm it is on the
 * treasury field; the coach may have clicked into the other while the save was on its way): its value is set here,
 * or it would say a balance the team no longer has.
 */
function followBalances(host, form) {
  if (!form) return;
  const before = balancesOf(form.teamId);
  for (const [selector, text, balance] of [[TREASURY_FIELD, form.treasuryText, before.treasury], [SAFE_FIELD, form.safeText, before.safe]]) {
    const field = host.querySelector(selector);
    if (field && text === null && field.value !== String(balance)) field.value = String(balance);
  }
}

/** The team moved (a write of this sheet's or of the page's, a list read after a lost answer): the sheet is drawn again. */
function teamMoved(host, sheet) {
  sheet.redraw();
  followBalances(host, sheet.form);
}

/**
 * The press on the button that opens the sheet: the sheet, on a new form with both fields as the team holds
 * them, or, while a match is on, the reason the button was shut with (its `title`; a shut button that gives none
 * is shut by the match, which is the one reason there is).
 */
function press(sheet, button) {
  if (button.getAttribute("aria-disabled") === "true") {
    toast(button.getAttribute("title") || t("treasury.lockedLive"), { tone: "error" });
    return;
  }
  const teamId = button.getAttribute("data-treasury-fix");
  if (!teamOf(teamId)) {
    toast(t("error.TEAM_NOT_FOUND"), { tone: "error" });
    return;
  }
  sheet.open({ teamId, treasuryText: null, safeText: null, pending: false, refusal: "" }, button);
}

/**
 * The press on the sheet's button. What the page holds is asked again here: the sheet may have been drawn before
 * a match went live, and a button that looks pressable is not a promise. A problem is drawn (the button says it)
 * and nothing is sent. The roster goes as the team has it, read the way the 2.x editor reads one
 * (`normalizeDraft` of a copy: the list's own object is not touched), with the two balances replaced.
 */
async function apply(host, sheet) {
  const form = sheet.form;
  if (!form || form.pending) return;
  const team = teamOf(form.teamId);
  if (!team) {
    sheet.change({ refusal: t("error.TEAM_NOT_FOUND") });
    return;
  }
  const check = fixCheck(form, balancesOf(form.teamId));
  if (check.invalid || check.unchanged || isLive(form.teamId)) {
    // The button that was pressed is disabled by the redraw, and the focus on it would be dropped.
    sheet.redraw();
    sheet.focus(TREASURY_FIELD);
    return;
  }
  const draft = { ...normalizeDraft(structuredClone(team.roster)), treasury: check.treasury.amount, coachesSafe: check.safe.amount };
  await sheet.submit(() => saveTeamRoster(form.teamId, draft), {
    // The correction may be written already (a 409 brings the team as it is; a lost answer says nothing): the fields
    // follow the team again, so that a new correction is the coach's deliberate act, after the history.
    startOver: { treasuryText: null, safeText: null },
    refocus: TREASURY_FIELD,
    // The list is read as well as the history: the fields show the balances, and the write may have changed them.
    unknown: () => {
      void readLedger(form.teamId);
      void loadMyTeams(true);
    },
    done: () => toast(t("treasury.fix.done")),
  });
  // A refusal that put the fields back (`startOver`) drew them while a field may have had the focus.
  followBalances(host, sheet.form);
}

/**
 * Everything the sheet does: a press on a `[data-treasury-fix]` button under `root` opens it in a host of its own
 * on the body; the cross, the backdrop and Escape close it, forgetting the form and giving the focus back to the
 * button that opened it; a field typed in changes the form, and the sheet is drawn again in place, so the field
 * being typed in keeps its focus and its caret; the button sends one roster. Wire once per screen mount, and keep
 * the function returned for `onScreenLeave`.
 *
 * @param {Element} root the screen's element, which holds the buttons
 * @returns {() => void} removes the listeners, closes the sheet and takes its host away
 */
export function wireFixSheet(root) {
  const host = mountSheetHost("treasury-fix");
  const sheet = sheetController(host, { id: FIX_SHEET_ID, markup: drawn });
  const group = listenerGroup(host);
  group.own(delegate(root, "click", "[data-treasury-fix]", (event, button) => press(sheet, button)));
  group.own(wireSheets(host, { onClose: (id) => { if (id === FIX_SHEET_ID) sheet.close(); } }));
  group.on("input", TREASURY_FIELD, (event, input) => sheet.change({ treasuryText: input.value }));
  group.on("input", SAFE_FIELD, (event, input) => sheet.change({ safeText: input.value }));
  group.on("click", "[data-fix-save]", () => { void apply(host, sheet); });
  // The team moved (a write of this sheet's or of the page's, which may land while the sheet is open): the preview is read again.
  group.own(onMyTeamsChange(() => teamMoved(host, sheet)));
  return () => {
    group.release();
    unmountSheetHost(host);
  };
}

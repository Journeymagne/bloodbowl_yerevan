/**
 * Changing the password: a sheet over Settings that asks for the current one.
 *
 * Three fields, a meter, and the three things a new password is checked for
 * (domain/account.mjs, the server's own rule: four characters, not the same,
 * typed twice). The button waits for the current password and for all three
 * checks. A refusal is said where it belongs: a wrong current password on its
 * field, anything else (too many tries, the .env administrator's password, a
 * lost connection) in one alert above the button. A change ends the account's
 * other sessions; this one goes on, and the sheet says so.
 *
 * The sheet draws what it is given and holds nothing: the screen keeps the
 * passwords between keystrokes (settings/index.mjs) and wipes them when the
 * sheet closes.
 */
import { API_ERROR } from "../../core/api.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { escapeHtml, listenerGroup } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { mergeCurrentUser, refusalText } from "../../data/session.mjs";
import { PASSWORD_MIN_LENGTH, passwordChangeChecks } from "../../domain/account.mjs";
import { renderButton } from "../../ui/button.mjs";
import { renderCallout } from "../../ui/callout.mjs";
import { icon } from "../../ui/icons.mjs";
import { classNames } from "../../ui/markup.mjs";
import { renderSheet, wireSheets } from "../../ui/sheet.mjs";
import { renderTextField } from "../../ui/text-field.mjs";
import { renderPasswordMeter } from "../auth/password-meter.mjs";

const SHEET_ID = "password-sheet";
const FORM_ID = "password-form";
const CHECKS_ID = "password-checks";
/** The fields the sheet reports by name: the input's `name`, and the key of the screen's state. */
const FIELDS = new Set(["current", "next", "repeat"]);

/** What each check says, by its key in `passwordChangeChecks`. Literal keys, so the dictionary test finds them. */
const CHECK_TEXT = {
  length: () => t("password.check.length", { min: PASSWORD_MIN_LENGTH }),
  different: () => t("password.check.different"),
  match: () => t("password.check.match"),
};

/**
 * Whether the form is one the server will take: a current password and all three checks passed.
 * @param {{current?: string, next?: string, repeat?: string}} form as typed
 */
export function passwordReady(form) {
  return String(form.current ?? "") !== "" && passwordChangeChecks(form).every((check) => check.ok);
}

/** A tick for a check that is done, a ring for one that is not; the words are for a screen reader. */
function checkHtml({ key, ok }) {
  const mark = ok ? icon("check", 16) : '<span class="g-check__ring" aria-hidden="true"></span>';
  return `<li class="${classNames("g-check", ok && "g-check--ok")}">${mark}<span class="g-check__text">${escapeHtml(CHECK_TEXT[key]())}</span>`
    + `<span class="g-sr-only">: ${escapeHtml(ok ? t("password.check.ok") : t("password.check.no"))}</span></li>`;
}

/** One name in both states; whether it is pressed says which (K10b). */
function showToggleHtml(show) {
  return `<button type="button" class="g-password__show" data-password-show aria-pressed="${show ? "true" : "false"}">${escapeHtml(t("auth.showPassword"))}</button>`;
}

function fieldsHtml(sheet) {
  const type = sheet.show ? "text" : "password";
  const wrong = sheet.error?.field === "current" ? sheet.error.text : "";
  // A password drawn as text is not sent to a spell checker nor capitalised by a keyboard: `verbatim`.
  const field = (key, label, autocomplete, error = "", describedBy = "") => renderTextField({ id: `password-${key}`, name: key, label, type,
    value: sheet[key], autocomplete, error, describedBy, verbatim: sheet.show });
  // The new password and its repeat are what the checks are about: a screen reader is told where they stand.
  return field("current", t("password.current"), "current-password", wrong)
    + field("next", t("password.next"), "new-password", "", CHECKS_ID)
    + field("repeat", t("password.repeat"), "new-password", "", CHECKS_ID);
}

/** Always on the page, so a screen reader hears what is put in it; empty until a try is refused, and for a refusal that is a field's. */
function alertHtml(error) {
  const callout = error && !error.field ? renderCallout({ tone: "danger", title: error.text, sub: error.sub ?? "" }) : "";
  return `<div class="g-password__alert" id="password-alert" role="alert">${callout}</div>`;
}

function formHtml(sheet) {
  return `<form class="g-password__form" id="${FORM_ID}" novalidate${sheet.pending ? ' aria-busy="true"' : ""}>`
    + `${fieldsHtml(sheet)}${renderPasswordMeter(sheet.next)}`
    // Live, and as a whole: a check that turns done is said with the two that did not, not alone.
    + `<ul class="g-checks" id="${CHECKS_ID}" aria-live="polite" aria-atomic="true">${passwordChangeChecks(sheet).map(checkHtml).join("")}</ul>`
    + `${showToggleHtml(sheet.show)}${alertHtml(sheet.error)}</form>`;
}

function doneHtml() {
  return `<div class="g-password__done"><span class="g-password__done-mark" aria-hidden="true">${icon("check", 30)}</span>`
    + `<p class="g-password__done-title">${escapeHtml(t("password.done"))}</p>`
    + `<p class="g-password__done-text">${escapeHtml(t("password.doneText"))}</p>`
    + renderButton({ label: t("password.doneButton"), kind: "primary", block: true, data: { passwordDone: true, sheetClose: "" } })
    + "</div>";
}

/**
 * @param {object} sheet what the screen holds
 * @param {string} sheet.current @param {string} sheet.next @param {string} sheet.repeat as typed
 * @param {boolean} sheet.show the passwords are drawn as text
 * @param {boolean} sheet.pending a try is on its way
 * @param {boolean} sheet.done the password was changed: the form gives way to the news
 * @param {null|{text: string, sub?: string, field: "current"|null}} sheet.error what was said about the last try
 * @returns {string} a closed dialog; `patchWithModal(view, markup, "#password-sheet")` opens it
 */
export function passwordSheetMarkup(sheet) {
  // Not disabled while it waits: a focused button that is disabled drops the focus in Chrome. The screen takes no second press.
  const submit = renderButton({ label: sheet.pending ? t("password.pending") : t("password.submit"), kind: "primary", type: "submit", form: FORM_ID,
    disabled: !passwordReady(sheet) });
  return renderSheet({
    id: SHEET_ID,
    title: t("password.title"),
    bodyHtml: sheet.done ? doneHtml() : formHtml(sheet),
    footHtml: sheet.done ? "" : submit,
  });
}

/**
 * Change the password. The server asks for the current one, ends the account's other sessions and
 * keeps this one. The answer is the account as the server holds it, which is merged in: it lacks
 * the settings only /me carries (`mergeCurrentUser` keeps the ones the coach has).
 *
 * @param {{current: string, next: string}} passwords as typed; the server does not trim them
 * @returns {Promise<null|{text: string, sub?: string, field: "current"|null}>} null once changed; otherwise
 *   what to say and the field it is about. A wrong current password is the field's; every other refusal
 *   (too many tries, the administrator whose password is the server's, a lost connection) is the alert's.
 *   An answer that never came (offline, a timeout, a proxy that said nothing) carries a `sub`: the server
 *   may have changed the password before the answer was lost, and the coach should know to sign in with the new one.
 */
export async function changePassword({ current, next }) {
  let answer;
  try {
    answer = await apiRequest("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ password: next, currentPassword: current }) });
  } catch (error) {
    // No answer is no "no": the connection, the timer or a gateway gave up, not the server.
    const unanswered = error?.kind === API_ERROR.OFFLINE || error?.kind === API_ERROR.TIMEOUT || (error?.kind === API_ERROR.HTTP && !error.code);
    return { text: refusalText(error), field: error?.code === "CURRENT_PASSWORD_WRONG" ? "current" : null, ...(unanswered ? { sub: t("password.maybeChanged") } : {}) };
  }
  // The password is changed whatever the body says; a body that names no one has nothing to merge.
  if (answer?.user) mergeCurrentUser(answer.user);
  return null;
}

/**
 * Wire the sheet. Typing is reported by field, the form's submit once (the button is outside the
 * form, tied to it by `form=`, so Enter in a field and a press on the button are the same event),
 * and every way out — the cross, the backdrop, Escape, Done — as one close.
 *
 * @param {Element} root a container that outlives redraws, the sheet in it or not
 * @param {object} handlers
 * @param {(name: "current"|"next"|"repeat", value: string) => void} handlers.onInput
 * @param {() => void} handlers.onToggleShow
 * @param {() => void} handlers.onSubmit
 * @param {() => void} handlers.onClose
 * @returns {() => void} removes the listeners
 */
export function wirePasswordSheet(root, { onInput, onToggleShow, onSubmit, onClose }) {
  const group = listenerGroup(root);
  group.on("input", `#${SHEET_ID} input`, (event, input) => {
    const name = input.getAttribute("name");
    if (FIELDS.has(name)) onInput(name, input.value);
  });
  group.on("click", `#${SHEET_ID} [data-password-show]`, () => onToggleShow());
  group.on("submit", `#${FORM_ID}`, (event) => {
    event.preventDefault();
    onSubmit();
  });
  group.own(wireSheets(root, { onClose: (id) => { if (id === SHEET_ID) onClose(); } }));
  return () => group.release();
}

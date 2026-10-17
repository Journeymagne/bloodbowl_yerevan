/**
 * How strong a new password is, as three bars and a word: none, too short for
 * the server, enough, long. The steps are domain/account.mjs's
 * (`passwordStrength`), so the meter never calls fair what the server refuses.
 *
 * The bars are for the eyes; the word is what a screen reader hears, and it is
 * a polite live region, so a change of step is said while the coach types.
 * Its styles are in login.css, beside the form that draws it first.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { passwordStrength } from "../../domain/account.mjs";

/** The word for a step; nothing for an empty field. */
function strengthLabel(step) {
  if (step === 1) return t("auth.strength.short");
  if (step === 2) return t("auth.strength.fair");
  if (step === 3) return t("auth.strength.strong");
  return "";
}

/** @param {string} password as typed @returns {string} */
export function renderPasswordMeter(password) {
  const step = passwordStrength(password);
  const bar = '<span class="g-meter__bar" aria-hidden="true"></span>';
  return `<div class="g-meter g-meter--${step}">${bar}${bar}${bar}`
    + `<span class="g-meter__label" aria-live="polite">${escapeHtml(strengthLabel(step))}</span></div>`;
}

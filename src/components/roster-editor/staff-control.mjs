/**
 * The stepper a coach buys staff with, shared by both editors.
 *
 * There used to be two: renderBuilderStaffControl and renderRosterStaffControl,
 * the same card and the same stepper, differing in the wrapper class, the data
 * attribute the buttons carried, and what stops the "+" — the league's starting
 * budget in one, the position maximum in both. Another of the duplicate pairs
 * section 5.1 of the design spec counts.
 *
 * What differs between the two situations lives in modes.mjs; this file reads
 * flags and never asks which mode it is in.
 *
 * The "+" is marked `aria-disabled`, never `disabled`: a disabled button takes
 * no click and shows no tooltip, so the reason it refused never reaches the
 * coach — the same defect step 7.6 fixed in the hire pool, which the league
 * editor's staff steppers still had. The "-" stays plainly `disabled`, because
 * the only reason it ever refuses is that the number next to it already reads
 * zero, and that needs no explaining.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { builderStaffCosts, builderStaffMaximums, startingBudget } from "../../domain/league-rules.mjs";
import { countToNumber } from "../../domain/roster/values.mjs";

/**
 * Why this staff line cannot go up, or nothing if it can.
 *
 * @param {string} key staff field on the draft, e.g. "cheerleaders"
 * @param {string} title translated label, used in the refusal
 * @param {number|string} value what the draft holds now
 * @param {object} mode CREATE_MODE or LEAGUE_MODE
 * @param {number} committedTotal what the roster already costs, for the budget check
 * @returns {{blocked: boolean, title: string}}
 */
export function staffStepVerdict(key, title, value, mode, committedTotal = 0) {
  const max = builderStaffMaximums[key] ?? 6;
  if (countToNumber(value) >= max) return { blocked: true, title: t("validation.STAFF_MAX", { title, max }) };
  if (mode.enforcesBudget && committedTotal + (builderStaffCosts[key] ?? 0) > startingBudget) {
    return { blocked: true, title: t("validation.BUDGET_EXCEEDED", { budget: startingBudget, total: committedTotal }) };
  }
  return { blocked: false, title: "" };
}

/** The refusal, as attributes. Kept apart so the hire pool's rule reads the same. */
export function blockedAttributes(verdict) {
  return verdict.blocked ? `aria-disabled="true" title="${escapeHtml(verdict.title)}"` : "";
}

/** What a staff line costs, worded for the card. */
export function staffCostDescription(key) {
  const max = builderStaffMaximums[key] ?? 6;
  const cost = builderStaffCosts[key] ?? 0;
  return `${cost}k${max > 1 ? ` ${t("roster.each")}` : ""}`;
}

/**
 * One staff line: label, what it costs, and a stepper.
 *
 * @param {object} options
 * @param {string} options.key staff field on the draft
 * @param {string} options.title translated label
 * @param {number|string} options.value what the draft holds now
 * @param {object} options.mode CREATE_MODE or LEAGUE_MODE
 * @param {number} [options.committedTotal] roster cost so far, for the budget check
 * @param {string} [options.description] overrides the price line — a dedicated fan
 *   in a league team was not bought, it accrued, so its card says so instead
 */
export function renderStaffControl({ key, title, value, mode, committedTotal = 0, description }) {
  const current = countToNumber(value);
  const verdict = staffStepVerdict(key, title, value, mode, committedTotal);
  const down = current <= 0 ? "disabled" : "";
  return `
    <div class="builder-addon compact-staff-control ${mode.staffCardClass}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description ?? staffCostDescription(key))}</span>
      </div>
      <div class="inline-stepper-control">
        <button class="filter-button" type="button" data-${mode.staffAttribute}="${key}" data-${mode.staffAttribute}-step="-1" ${down}>-</button>
        <strong>${current}</strong>
        <button class="filter-button" type="button" data-${mode.staffAttribute}="${key}" data-${mode.staffAttribute}-step="1" ${blockedAttributes(verdict)}>+</button>
      </div>
    </div>
  `;
}

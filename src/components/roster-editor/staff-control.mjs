/**
 * The stepper a coach buys staff with.
 *
 * There used to be two: renderBuilderStaffControl and renderRosterStaffControl,
 * the same card and the same stepper, differing in the wrapper class, the data
 * attribute the buttons carried, and what stops the "+" — the league's starting
 * budget in one, the position maximum in both. The builder is gone (the 3.0 team
 * builder replaced it), and this is the one that stayed.
 *
 * What the mode says about the card lives in modes.mjs; this file reads it and
 * never asks which mode it is in.
 *
 * The "+" is marked `aria-disabled`, never `disabled`: a disabled button takes
 * no click and shows no tooltip, so the reason it refused never reaches the
 * coach — the same defect step 7.6 fixed in the hire pool, which the league
 * editor's staff steppers still had. The "-" stays plainly `disabled`, because
 * the only reason it ever refuses is that the number next to it already reads
 * zero, and that needs no explaining.
 *
 * A re-roll the team's stage may not buy (stage.mjs) refuses its "+" with the
 * reason, as the server would answer 422 STAGE_PURCHASE_LOCKED — and a refused
 * autosave would stay at the head of the store's queue and fail every save
 * after it. The admin route is held to no stage, so it passes none.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { builderStaffCosts, builderStaffMaximums } from "../../domain/league-rules.mjs";
import { countToNumber } from "../../domain/roster/values.mjs";
import { canBuy } from "../../domain/roster/stage.mjs";
import { availableMedicalStaffDefinitions, hasBribery } from "../../domain/roster/team-rules.mjs";

/**
 * Why this staff line cannot go up, or nothing if it can.
 *
 * @param {string} key staff field on the draft, e.g. "cheerleaders"
 * @param {string} title translated label, used in the refusal
 * @param {number|string} value what the draft holds now
 * @param {string|null} stage the team's stage, or nothing when no stage applies
 * @returns {{blocked: boolean, title: string}}
 */
function staffStepVerdict(key, title, value, stage = null) {
  // The stage comes first: a team at the maximum of a re-roll its stage locks is
  // told about the stage, which is the reason that will still hold after it sells one.
  if (stage != null && !canBuy(stage, key)) return { blocked: true, title: t(`treasury.lock.${key}`) };
  const max = builderStaffMaximums[key] ?? 6;
  if (countToNumber(value) >= max) return { blocked: true, title: t("validation.STAFF_MAX", { title, max }) };
  return { blocked: false, title: "" };
}

/** The refusal, as attributes. */
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
 * @param {object} options.mode LEAGUE_MODE
 * @param {string} [options.description] overrides the price line — a dedicated fan
 *   in a league team was not bought, it accrued, so its card says so instead
 * @param {boolean} [options.readOnly] disable buttons and omit mutation attributes
 * @param {string|null} [options.stage] the team's stage; a re-roll it may not
 *   buy refuses the "+". Nothing (an administrator, a public team) checks none.
 */
export function renderStaffControl({ key, title, value, mode, description, readOnly = false, stage = null }) {
  const current = countToNumber(value);
  const verdict = staffStepVerdict(key, title, value, stage);
  const down = readOnly || current <= 0 ? "disabled" : "";
  return `
    <div class="builder-addon compact-staff-control ${mode.staffCardClass}">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description ?? staffCostDescription(key))}</span>
      </div>
      <div class="inline-stepper-control">
        <button class="filter-button" type="button" ${readOnly ? "" : `data-${mode.staffAttribute}="${key}" data-${mode.staffAttribute}-step="-1"`} ${down}>-</button>
        <strong>${current}</strong>
        <button class="filter-button" type="button" ${readOnly ? "disabled" : `data-${mode.staffAttribute}="${key}" data-${mode.staffAttribute}-step="1" ${blockedAttributes(verdict)}`}>+</button>
      </div>
    </div>
  `;
}

/**
 * Dedicated fans, worded for a team in play: not a price but a post-match value
 * the team accrued.
 *
 * Kept apart from the hired staff because the editor files it with the team's
 * resources, next to the treasury.
 */
export function renderDedicatedFansLine({ draft, mode, readOnly = false }) {
  return renderStaffControl({
    key: "dedicatedFans",
    title: t("savedRoster.dedicatedFans"),
    value: draft.dedicatedFans,
    mode,
    readOnly,
    description: t("roster.postMatchValue"),
  });
}

/**
 * The staff a coach hires, in the order the editor lists them.
 *
 * Rerolls and money are not here: a league team also has team rerolls and two
 * money fields. Those stay with the editor.
 *
 * @param {object} options
 * @param {object} options.team the race, for bribery and medical staff
 * @param {object} options.draft the roster being edited
 * @param {object} options.mode LEAGUE_MODE
 */
export function renderHiredStaffLines({ team, draft, mode, readOnly = false }) {
  const line = (key, title) => renderStaffControl({ key, title, value: draft[key], mode, readOnly });
  return [
    hasBribery(team) ? line("bribes", t("savedRoster.bribes")) : "",
    line("assistantCoaches", t("savedRoster.assistantCoaches")),
    line("cheerleaders", t("savedRoster.cheerleaders")),
    ...availableMedicalStaffDefinitions(team).map((staff) => line(staff.key, staff.title)),
  ].join("");
}

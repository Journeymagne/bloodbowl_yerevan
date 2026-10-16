/**
 * A − / count / + cell for the SPP actions on one player in the post-match:
 * touchdowns, casualties, completions and the rest, each worth some SPP.
 *
 * The component draws numbers it is given. What an action is worth, how many a
 * player may have and why a plus is refused are the caller's, taken from
 * src/domain.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { dataAttributes } from "./markup.mjs";
import { renderStepButton, wireStepButtons } from "./stepper.mjs";

/**
 * @param {object} props
 * @param {string} props.key what wireActionSteppers reports back
 * @param {string} props.label the short name in the cell ("TD")
 * @param {string} props.name the full name a screen reader hears ("touchdown")
 * @param {number} props.spp what one is worth
 * @param {number} props.value the count the player has
 * @param {number} [props.delta] what this match added, shown beside the count when above zero
 * @param {string} props.player the player's name, for the button labels
 * @param {string} [props.incBlockedReason] why the plus is refused; empty when it is not
 * @param {Record<string, string|number|boolean|null>} [props.data] more data attributes for the cell
 */
export function renderActionStepper({ key, label, name, spp, value, delta = 0, player, incBlockedReason = "", data = {} }) {
  const named = { action: name, player };
  const minus = renderStepButton({ hook: "action", delta: -1, label: t("ui.stepper.decrease", named), disabled: value <= 0, className: "g-stepper__btn" });
  const plus = renderStepButton({ hook: "action", delta: 1, label: t("ui.stepper.increase", named), blockedReason: incBlockedReason, className: "g-stepper__btn g-stepper__btn--inc" });
  const added = delta > 0 ? `<span class="g-stepper__delta">+${escapeHtml(delta)}</span>` : "";
  const worth = `<span class="g-stepper__spp">+${escapeHtml(spp)}</span>`;
  const mid = `<span class="g-stepper__mid"><span class="g-stepper__label">${escapeHtml(label)} ${worth}</span><span class="g-stepper__value">${escapeHtml(value)}${added}</span></span>`;
  // The key goes last so a data bag cannot take it over.
  return `<div class="g-stepper"${dataAttributes({ ...data, actionKey: key })}>${minus}${mid}${plus}</div>`;
}

/** A click on a live − or + reports `({ key, delta, element }, button)`; see wireStepButtons. */
export function wireActionSteppers(root, onStep) {
  return wireStepButtons(root, "action", onStep);
}

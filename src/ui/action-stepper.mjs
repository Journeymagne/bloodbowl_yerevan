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
import { classNames, dataAttributes } from "./markup.mjs";
import { renderStepButton, wireStepButtons } from "./stepper.mjs";

/**
 * @param {object} props
 * @param {string} props.key what wireActionSteppers reports back
 * @param {string} props.label the short name in the cell ("TD")
 * @param {string} props.name the full name a screen reader hears ("touchdown")
 * @param {number} props.spp what one is worth
 * @param {number} props.value the count the player has
 * @param {number} [props.delta] what this match added, shown beside the count when above zero and said after it ("7, this match +1")
 * @param {string} props.player the player's name, for the button labels
 * @param {boolean} [props.compact] the label over a − count + row, for a narrow tile
 * @param {boolean} [props.decDisabled] the − is plainly off; defaults to a count of zero, and the caller says when it stops higher
 * @param {string} [props.incBlockedReason] why the plus is refused; empty when it is not
 * @param {string} [props.lockedReason] why the whole cell is out of reach; it speaks for both buttons, which are explained and not plainly disabled
 * @param {Record<string, string|number|boolean|null>} [props.data] more data attributes for the cell
 */
export function renderActionStepper({ key, label, name, spp, value, delta = 0, player, compact = false, decDisabled = value <= 0, incBlockedReason = "", lockedReason = "", data = {} }) {
  if (!key) throw new Error("an action stepper needs a key: it is what wireActionSteppers reports back, and a click without one is dropped");
  if (!label) throw new Error("an action stepper needs a label: the short name in the cell");
  if (!name) throw new Error("an action stepper needs a name: its buttons are read by it");
  const named = { action: name, player };
  // A locked − is explained rather than plainly disabled, even at zero: the reason is the useful part.
  const minus = renderStepButton({ hook: "action", delta: -1, label: t("ui.stepper.decrease", named), disabled: !lockedReason && decDisabled, blockedReason: lockedReason, className: "g-stepper__btn" });
  const plus = renderStepButton({ hook: "action", delta: 1, label: t("ui.stepper.increase", named), blockedReason: lockedReason || incBlockedReason, className: "g-stepper__btn g-stepper__btn--inc" });
  // "7" and "+1" side by side read as "71" or "4+1" to a screen reader: the words go between.
  const added = delta > 0 ? `<span class="g-sr-only">, ${escapeHtml(t("ui.stepper.thisMatch"))} </span><span class="g-stepper__delta">+${escapeHtml(delta)}</span>` : "";
  const worth = `<span class="g-stepper__spp">+${escapeHtml(spp)}</span>`;
  const caption = `<span class="g-stepper__label">${escapeHtml(label)} ${worth}</span>`;
  const count = `<span class="g-stepper__value">${escapeHtml(value)}${added}</span>`;
  // The key goes last so a data bag cannot take it over.
  const cell = `<div class="${classNames("g-stepper", compact && "g-stepper--compact")}"${dataAttributes({ ...data, actionKey: key })}>`;
  if (compact) return `${cell}${caption}<span class="g-stepper__row">${minus}${count}${plus}</span></div>`;
  return `${cell}${minus}<span class="g-stepper__mid">${caption}${count}</span>${plus}</div>`;
}

/** A click on a live − or + reports `({ key, delta, element }, button)`, on a refused one `options.onRefused`; see wireStepButtons. */
export function wireActionSteppers(root, onStep, options) {
  return wireStepButtons(root, "action", onStep, options);
}

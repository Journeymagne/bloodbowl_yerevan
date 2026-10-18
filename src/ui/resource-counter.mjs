/**
 * A row for something a team holds a number of — re-rolls, staff, fans — with
 * a − / count / + cluster on the right.
 *
 * A counter that cannot be changed right now stays on the page and says why:
 * the lock, the reason in place of the note, and the same reason on both
 * buttons. Which counter is locked, and what the reason is, is the caller's.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { icon } from "./icons.mjs";
import { classNames, dataAttributes } from "./markup.mjs";
import { renderStepButton, wireStepButtons } from "./stepper.mjs";

/**
 * @param {object} props
 * @param {string} props.key what wireResourceCounters reports back
 * @param {string} props.name what the row is called
 * @param {string} [props.note] the quieter line under the name (a price)
 * @param {number} props.value how many the team has
 * @param {boolean} [props.decDisabled] the − is plainly off; defaults to a count of zero
 * @param {string} [props.incBlockedReason] why the + is refused; empty when it is not
 * @param {string} [props.lockedReason] why the whole counter is out of reach; it replaces the note and speaks for both buttons
 */
export function renderResourceCounter({ key, name, note = "", value, decDisabled = value <= 0, incBlockedReason = "", lockedReason = "" }) {
  if (!key) throw new Error("a resource counter needs a key: it is what wireResourceCounters reports back, and a click without one is dropped");
  if (!name) throw new Error("a resource counter needs a name: it names the row and its buttons");
  const locked = Boolean(lockedReason);
  const named = { name };
  // A locked − is explained rather than plainly disabled, even at zero: the reason is the useful part.
  const minus = renderStepButton({ hook: "resource", delta: -1, label: t("ui.counter.decrease", named), disabled: !locked && decDisabled, blockedReason: lockedReason, className: "g-resource__btn" });
  const plus = renderStepButton({ hook: "resource", delta: 1, label: t("ui.counter.increase", named), blockedReason: lockedReason || incBlockedReason, className: "g-resource__btn g-resource__btn--inc" });
  const lock = locked ? `<span class="g-resource__lock" role="img" aria-label="${escapeHtml(t("ui.counter.locked"))}">${icon("lock", 13)}</span>` : "";
  const line = lockedReason || note;
  const caption = line ? `<span class="g-resource__note">${escapeHtml(line)}</span>` : "";
  return `<div class="${classNames("g-resource", locked && "g-resource--locked")}"${dataAttributes({ resourceKey: key })}>`
    + `<span class="g-resource__text"><span class="g-resource__name">${lock}${escapeHtml(name)}</span>${caption}</span>`
    + `<span class="g-resource__stepper">${minus}<span class="g-resource__value">${escapeHtml(value)}</span>${plus}</span>`
    + "</div>";
}

/** A click on a live − or + reports `({ key, delta, element }, button)`, on a refused one `options.onRefused`; see wireStepButtons. */
export function wireResourceCounters(root, onStep, options) {
  return wireStepButtons(root, "resource", onStep, options);
}

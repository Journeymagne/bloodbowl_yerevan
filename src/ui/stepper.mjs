/**
 * What the two steppers share: the − and + buttons, and the click on them.
 *
 * An action stepper (the SPP a player earned) and a resource counter (the
 * re-rolls a team holds) draw different cells, but a button is the same in both:
 * an icon, a name for a screen reader, and a refusal that either looks plain
 * (the number already reads zero) or explains itself (a rule said no).
 *
 * `hook` is the one lower-case word that tells the two apart in the markup:
 * the buttons carry `data-<hook>-step="-1|1"` and the cell around them
 * `data-<hook>-key`, so a wiring only ever hears its own.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { icon } from "./icons.mjs";

const HOOK = /^[a-z]+$/;

/** The hook ends up in an attribute name and a selector, neither of which is escaped. */
function checkedHook(hook) {
  if (!HOOK.test(hook)) throw new Error(`a stepper hook is one lower-case word, not ${JSON.stringify(hook)}`);
  return hook;
}

/**
 * One step button.
 *
 * `disabled` is the plain refusal: the button takes no focus and no click, and
 * needs no explanation. `blockedReason` is the explained one: the button is
 * marked `aria-disabled`, never `disabled`, so it stays in the tab order, still
 * takes a click (the wiring ignores it) and shows the reason as a tooltip, which
 * a disabled button would not do.
 */
export function renderStepButton({ hook, delta, label, disabled = false, blockedReason = "", className }) {
  if (delta !== -1 && delta !== 1) throw new RangeError(`a step is -1 or 1, not ${delta}`);
  if (!label) throw new Error("a step button needs a label: nothing else names it");
  const refusal = blockedReason ? ` aria-disabled="true" title="${escapeHtml(blockedReason)}"` : "";
  return `<button type="button" class="${escapeHtml(className)}" data-${checkedHook(hook)}-step="${delta}" aria-label="${escapeHtml(label)}"${disabled ? " disabled" : ""}${refusal}>${icon(delta < 0 ? "minus" : "plus", 18)}</button>`;
}

/**
 * Report every click on a step button under `root` as `({ key, delta, element }, button)`,
 * where `element` is the nearest `[data-<hook>-key]` around the button and `key` its value.
 * A refused button (`disabled` or `aria-disabled="true"`) reports nothing.
 *
 * @param {Element} root a container that outlives re-renders
 * @param {string} hook the same word the buttons were rendered with
 * @param {(step: {key: string, delta: number, element: Element}, button: Element) => void} onStep
 * @returns {() => void} removes the listener
 */
export function wireStepButtons(root, hook, onStep) {
  const step = `data-${checkedHook(hook)}-step`;
  const owner = `data-${hook}-key`;
  return delegate(root, "click", `[${step}]`, (event, button) => {
    if (button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true") return;
    const element = button.closest(`[${owner}]`);
    if (!element) return;
    onStep({ key: element.getAttribute(owner), delta: Number(button.getAttribute(step)), element }, button);
  });
}

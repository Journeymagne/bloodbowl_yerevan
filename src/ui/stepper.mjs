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
import { delegate, escapeHtml, focusLost } from "../core/dom.mjs";
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
 * takes a click (the wiring takes no step and tells `onRefused`) and shows the
 * reason as a tooltip, which a disabled button would not do.
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
 *
 * A plainly refused button (`disabled`) reports nothing. An explained one
 * (`aria-disabled="true"`) is a step that is not taken, and it is told to
 * `onRefused` instead, with the reason it carries as its tooltip, so that a
 * screen can say it where a coach on a touch screen would read it (a hover
 * never comes): `({ key, delta, element, reason }, button)`.
 *
 * @param {Element} root a container that outlives re-renders
 * @param {string} hook the same word the buttons were rendered with
 * @param {(step: {key: string, delta: number, element: Element}, button: Element) => void} onStep
 * @param {{onRefused?: (step: {key: string, delta: number, element: Element, reason: string}, button: Element) => void}} [options]
 * @returns {() => void} removes the listener
 */
export function wireStepButtons(root, hook, onStep, { onRefused } = {}) {
  const step = `data-${checkedHook(hook)}-step`;
  const owner = `data-${hook}-key`;
  return delegate(root, "click", `[${step}]`, (event, button) => {
    if (button.hasAttribute("disabled")) return;
    const element = button.closest(`[${owner}]`);
    if (!element) return;
    const taken = { key: element.getAttribute(owner), delta: Number(button.getAttribute(step)), element };
    if (button.getAttribute("aria-disabled") === "true") {
      onRefused?.({ ...taken, reason: button.getAttribute("title") ?? "" }, button);
      return;
    }
    onStep(taken, button);
  });
}

/**
 * After a step's redraw, keep the focus in the cell `key` (stage 13, decision 21): a − that emptied it is disabled in
 * place (the builder) or gone with its stepper (the cart). A focus left on nothing, outside `root`, or on a step that
 * takes none (`disabled`, or refused: `aria-disabled`) goes to a step of the cell that is not plainly disabled — the +
 * first, else the −; a refused + is one (in reach, it says why), so a + the press refused keeps the focus it has. A
 * focus the redraw left on any other live control is the coach's and stays.
 *
 * `root` may be the cell itself: then a focus anywhere else is not the cell's, and goes to it (the cart, whose screen
 * gives a focus that fell in a sheet to the sheet's cross).
 *
 * @param {Element} root what holds the cells, or the cell; where the focus a step leaves may stay
 * @param {{hook: string, key: string|number}} cell the hook the buttons were rendered with, and the cell's key
 * @returns {boolean} whether the focus was moved
 */
export function refocusStep(root, { hook, key }) {
  const step = `data-${checkedHook(hook)}-step`;
  const owner = `data-${hook}-key`;
  const active = (root.ownerDocument ?? globalThis.document)?.activeElement ?? null;
  const kept = !focusLost(active) && root.contains(active) && !active.hasAttribute?.("disabled") && active.getAttribute?.("aria-disabled") !== "true";
  if (kept) return false;
  const cell = root.getAttribute?.(owner) === String(key) ? root
    : Array.from(root.querySelectorAll(`[${owner}]`)).find((element) => element.getAttribute(owner) === String(key));
  const live = cell ? Array.from(cell.querySelectorAll(`[${step}]`)).filter((button) => !button.hasAttribute("disabled")) : [];
  const target = live.find((button) => button.getAttribute(step) === "1") ?? live[0];
  if (!target || target === active) return false;
  target.focus();
  return true;
}

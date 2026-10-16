/**
 * What a segmented control, a swatch row and any other one-of-N radio group
 * share: the click and the arrow keys.
 *
 * The markup carries the state. The checked item has aria-checked="true" and
 * tabindex="0", the others "false" and "-1" (a roving tabindex: Tab enters the
 * group once and the arrows move inside it), so this module only flips those
 * attributes and reports. Redrawing the group from the new state is the
 * caller's business, and a redraw that agrees with what was flipped changes
 * nothing.
 */
import { delegate } from "../core/dom.mjs";

const STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

const isAvailable = (element) => element.getAttribute("aria-disabled") !== "true";

/** The item the key moves to, or null for a key that moves nothing. Disabled items are skipped. */
function targetOf(items, from, key) {
  if (key === "Home") return items.find(isAvailable) ?? null;
  if (key === "End") return items.findLast(isAvailable) ?? null;
  const step = STEPS[key];
  if (!step) return null;
  // Up to a full lap: with every other item disabled the walk ends on the item it began at.
  for (let distance = 1; distance <= items.length; distance += 1) {
    const candidate = items[(((from + step * distance) % items.length) + items.length) % items.length];
    if (isAvailable(candidate)) return candidate;
  }
  return null;
}

/**
 * Wire every radio group under `root`.
 *
 * @param {Element} root a container that outlives re-renders
 * @param {object} options
 * @param {string} options.group selector of the group element
 * @param {string} options.item selector of an item inside it
 * @param {string} options.attribute the item's attribute that holds its value
 * @param {(value: string, groupElement: Element) => void} options.onChange
 *   called with the new value when the selection changes, never for a click
 *   or key that lands on the item already checked
 * @returns {() => void} removes the listeners
 */
export function wireRadioGroups(root, { group, item, attribute, onChange }) {
  function choose(groupElement, chosen, focus) {
    const changed = chosen.getAttribute("aria-checked") !== "true";
    for (const candidate of groupElement.querySelectorAll(item)) {
      const on = candidate === chosen;
      candidate.setAttribute("aria-checked", on ? "true" : "false");
      candidate.setAttribute("tabindex", on ? "0" : "-1");
    }
    if (focus) chosen.focus();
    if (changed) onChange(chosen.getAttribute(attribute), groupElement);
  }

  const offClick = delegate(root, "click", item, (event, target) => {
    const groupElement = target.closest(group);
    if (groupElement && isAvailable(target)) choose(groupElement, target, false);
  });

  const offKeys = delegate(root, "keydown", item, (event, target) => {
    // Alt+Arrow is the browser's back and forward; a chord is not ours to take.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const groupElement = target.closest(group);
    if (!groupElement) return;
    const items = [...groupElement.querySelectorAll(item)];
    const next = targetOf(items, items.indexOf(target), event.key);
    if (!next) return;
    event.preventDefault();
    choose(groupElement, next, true);
  });

  return () => {
    offClick();
    offKeys();
  };
}

/**
 * A row of chips of which one is chosen: the category of a list, with how many
 * entries each category holds; or none yet, where the choice is still to be
 * made (the characteristic a lasting injury lowers).
 *
 * A radio group like a segmented control, and wired by the same code. The
 * markup carries the choice (aria-checked, a roving tabindex) and the row
 * scrolls sideways when it does not fit. Which list a chip filters, and the
 * counts, are the caller's.
 */
import { escapeHtml } from "../core/dom.mjs";
import { wireRadioGroups } from "./choice.mjs";
import { dataAttributes } from "./markup.mjs";

/** A count of zero is a count; only no count at all draws no number. */
const hasCount = (count) => count !== undefined && count !== null && count !== "";

/** `entry` is the chip Tab enters the row at: the chosen one, or the first while none is. */
function renderChip({ value, label, count }, selected, entry) {
  const on = value === selected;
  const number = hasCount(count) ? `<span class="g-chip__count">${escapeHtml(count)}</span>` : "";
  return `<button type="button" class="g-chip" role="radio" aria-checked="${on}" tabindex="${value === entry ? 0 : -1}"${dataAttributes({ chipValue: value })}>${escapeHtml(label)}${number}</button>`;
}

/**
 * @param {object} props
 * @param {string} props.label names the group for a screen reader
 * @param {{value: string, label: string, count?: number}[]} props.items the first is "all", when there is one
 * @param {string} props.selected the value of the chip that is chosen, or "" for a choice still to be made (the
 *   characteristic a lasting injury lowers): no chip is checked, and Tab enters the row at the first
 * @param {object} [props.data] data attributes of the row, as for dataAttributes; `chipGroup` names it for wireFilterChips
 */
export function renderFilterChips({ label, items, selected, data = {} }) {
  if (!label) throw new Error("a chip row needs a label: it names the group for a screen reader");
  if (!items.length) throw new Error("a chip row needs chips");
  const known = items.some((item) => item.value === selected);
  if (!known && selected !== "") throw new Error(`selected is not one of the chips: ${selected}`);
  // Radios with none checked would all sit at tabindex -1, a group the keyboard cannot enter: the first takes it.
  const entry = known ? selected : items[0].value;
  return `<div class="g-chips" role="radiogroup" aria-label="${escapeHtml(label)}"${dataAttributes(data)}>${items.map((item) => renderChip(item, selected, entry)).join("")}</div>`;
}

/**
 * Click and arrow keys for the chip rows under `root`, reporting the value of the chip chosen.
 *
 * A screen with two rows wires each by the name it gave in `data.chipGroup`,
 * for the reason wireSegmentedControls gives: the first wiring would flip the
 * second row's state before that row's own wiring saw the change.
 *
 * @param {Element} root
 * @param {(value: string, groupElement: Element) => void} onChange
 * @param {{group?: string}} [options] `group`: only the row rendered with this `data.chipGroup`; every one by default
 */
export function wireFilterChips(root, onChange, { group = "" } = {}) {
  if (group && !/^[\w-]+$/.test(group)) throw new Error(`a chip group is a plain name, not ${JSON.stringify(group)}`);
  const selector = `.g-chips${group ? `[data-chip-group="${group}"]` : ""}`;
  return wireRadioGroups(root, { group: selector, item: ".g-chip", attribute: "data-chip-value", onChange });
}

/**
 * Two or three views of the same thing, one of them shown.
 *
 * With plain items it is a radio group the page switches itself (a theme mode,
 * a filter), wired by wireSegmentedControls. With an href on every item it is
 * navigation, each segment a screen of its own, and the browser does the
 * switching.
 */
import { escapeHtml } from "../core/dom.mjs";
import { wireRadioGroups } from "./choice.mjs";
import { assertLinkHref, dataAttributes } from "./markup.mjs";

function renderLinks(items, selected) {
  return items
    .map(({ value, label, href }) => {
      assertLinkHref(href);
      return `<a class="g-seg__item" href="${escapeHtml(href)}"${value === selected ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
    })
    .join("");
}

function renderRadios(items, selected) {
  return items
    .map(({ value, label }) => {
      const on = value === selected;
      return `<button type="button" class="g-seg__item" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}"${dataAttributes({ segValue: value })}>${escapeHtml(label)}</button>`;
    })
    .join("");
}

/**
 * @param {object} props
 * @param {string} props.label names the group for a screen reader
 * @param {{value: string, label: string, href?: string}[]} props.items
 * @param {string} props.selected the value of the segment that is shown; links may name none (a page that is none of theirs)
 */
export function renderSegmentedControl({ label, items, selected, data = {} }) {
  if (!label) throw new Error("a segmented control needs a label: it names the group for a screen reader");
  if (items.length !== 2 && items.length !== 3) throw new RangeError(`a segmented control has two or three segments, not ${items.length}`);
  const linked = items.filter((item) => item.href).length;
  if (linked !== 0 && linked !== items.length) throw new Error("the segments are all links or all buttons");
  // Radios with none checked would all sit at tabindex -1, a group the keyboard cannot enter. Links are in the tab order anyway.
  if (!linked && !items.some((item) => item.value === selected)) throw new Error(`selected is not one of the segments: ${selected}`);
  const className = `g-seg g-seg--${items.length}`;
  const named = `aria-label="${escapeHtml(label)}"${dataAttributes(data)}`;
  if (linked) return `<nav class="${className}" ${named}>${renderLinks(items, selected)}</nav>`;
  return `<div class="${className}" role="radiogroup" ${named}>${renderRadios(items, selected)}</div>`;
}

/**
 * Click and arrow keys for the radio-style segmented controls under `root`.
 *
 * A screen with two of them wires each by the name it gave in `data.segGroup`:
 * the first wiring would otherwise flip the second control's state before its own
 * wiring saw the change, and that one would never report.
 *
 * @param {Element} root
 * @param {(value: string, groupElement: Element) => void} onChange
 * @param {{group?: string}} [options] `group`: only the control rendered with this `data.segGroup`; every one by default
 */
export function wireSegmentedControls(root, onChange, { group = "" } = {}) {
  if (group && !/^[\w-]+$/.test(group)) throw new Error(`a segmented control group is a plain name, not ${JSON.stringify(group)}`);
  const selector = `.g-seg[role="radiogroup"]${group ? `[data-seg-group="${group}"]` : ""}`;
  return wireRadioGroups(root, { group: selector, item: "[data-seg-value]", attribute: "data-seg-value", onChange });
}

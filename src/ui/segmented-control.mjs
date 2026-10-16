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
import { dataAttributes } from "./markup.mjs";

function renderLinks(items, selected) {
  return items
    .map(({ value, label, href }) => `<a class="g-seg__item" href="${escapeHtml(href)}"${value === selected ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`)
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
 * @param {string} props.selected the value of the segment that is shown
 */
export function renderSegmentedControl({ label, items, selected, data = {} }) {
  if (items.length !== 2 && items.length !== 3) throw new RangeError(`a segmented control has two or three segments, not ${items.length}`);
  const linked = items.filter((item) => item.href).length;
  if (linked !== 0 && linked !== items.length) throw new Error("the segments are all links or all buttons");
  // Nothing checked would leave every radio at tabindex -1, a group the keyboard cannot enter.
  if (!items.some((item) => item.value === selected)) throw new Error(`selected is not one of the segments: ${selected}`);
  const className = `g-seg g-seg--${items.length}`;
  const named = `aria-label="${escapeHtml(label)}"${dataAttributes(data)}`;
  if (linked) return `<nav class="${className}" ${named}>${renderLinks(items, selected)}</nav>`;
  return `<div class="${className}" role="radiogroup" ${named}>${renderRadios(items, selected)}</div>`;
}

/** Click and arrow keys for every radio-style segmented control under `root`. */
export function wireSegmentedControls(root, onChange) {
  return wireRadioGroups(root, { group: '.g-seg[role="radiogroup"]', item: "[data-seg-value]", attribute: "data-seg-value", onChange });
}

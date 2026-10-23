/**
 * A full-width choice inside a sheet: the kind of advancement, the reason for
 * a missed match, the characteristic to improve.
 *
 * A card is a radio button, and the list around it a radio group, so the
 * choosing is wireRadioGroups' (the click, the arrows, the roving tabindex).
 * A card that cannot be chosen is `aria-disabled`, never `disabled`: it stays
 * in the tab order and the reason sits where the sub line would — and, given
 * as `reason`, in its tooltip, which a screen that says why on a press reads
 * (the roster's `data-roster-closed`, carried in `data`). The reason and the
 * price in the pill are the caller's, taken from src/domain.
 */
import { escapeHtml } from "../core/dom.mjs";
import { wireRadioGroups } from "./choice.mjs";
import { dataAttributes } from "./markup.mjs";

/**
 * A card; `tabindex` is the list's, a card on its own has none and is in the tab order as any button is. A refused card's
 * `reason` is its tooltip; `data` are the caller's own attributes beside its value.
 */
function card({ value, title, sub = "", pill = "", radio = false, selected = false, disabled = false, reason = "", data = {} }, tabindex = null) {
  const dot = radio ? '<span class="g-option__radio" aria-hidden="true"></span>' : "";
  const line = sub ? `<span class="g-option__sub">${escapeHtml(sub)}</span>` : "";
  const price = pill ? `<span class="g-option__pill">${escapeHtml(pill)}</span>` : "";
  const text = `<span class="g-option__text"><span class="g-option__title">${escapeHtml(title)}</span>${line}</span>`;
  const why = disabled && reason ? ` title="${escapeHtml(reason)}"` : "";
  const attributes = `aria-checked="${Boolean(selected)}"${tabindex === null ? "" : ` tabindex="${tabindex}"`}${dataAttributes({ ...data, optionValue: value })}${disabled ? ' aria-disabled="true"' : ""}${why}`;
  return `<button type="button" class="g-option" role="radio" ${attributes}>${dot}${text}${price}</button>`;
}

/** One card on its own, for a screen that lays out its own group. */
export function renderOptionCard(props) {
  return card(props);
}

/**
 * The radio group of a sheet.
 *
 * Tab enters the group at one card: the checked one, else the first that can
 * be chosen, else (every card refused) the first, so the reasons can still be
 * reached and read.
 *
 * @param {object} props
 * @param {string} props.label names the group for a screen reader
 * @param {object[]} props.options what renderOptionCard takes; `selected` is the list's and wins over a card's own
 * @param {string} props.selected the value of the checked card, or "" when none is
 */
export function renderOptionList({ label, options, selected }) {
  if (!label) throw new Error("an option list needs a label: it names the group for a screen reader");
  const checked = options.findIndex((option) => option.value === selected);
  const entry = [checked, options.findIndex((option) => !option.disabled), 0].find((index) => index >= 0);
  const cards = options.map((option, index) => card({ ...option, selected: index === checked }, index === entry ? 0 : -1));
  return `<div class="g-options" role="radiogroup" aria-label="${escapeHtml(label)}">${cards.join("")}</div>`;
}

/** Click and arrow keys for every option list under `root`; `onSelect(value, list)` hears a change only. */
export function wireOptionLists(root, onSelect) {
  return wireRadioGroups(root, { group: ".g-options", item: "[data-option-value]", attribute: "data-option-value", onChange: onSelect });
}

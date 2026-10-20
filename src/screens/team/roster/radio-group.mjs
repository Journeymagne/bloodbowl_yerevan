/**
 * A radio group of a player's sheet (constraints, «Радиогруппы»; stage 07d): the advancement's categories and skills
 * (advance-sheet.mjs), a random skill's pair, the faces of the D8 and the characteristics a face allows (roll-view.mjs)
 * — the D16's faces at the table mark two at once, and are no radio group (Task 21). A module of its own, so that the
 * two that draw with it need not import each other.
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { dataAttributes } from "../../../ui/markup.mjs";

/**
 * Its items buttons with `role="radio"`, the chosen one — else the first open one, else the first — in the tab order (a
 * roving tabindex, wireRadioGroups); a closed one `aria-disabled`, its reason its title, said on a press
 * (`data-roster-closed`, K7).
 * @param {{className: string, label: string, chosen: string,
 *   items: {value: string, className: string, data: object, reason: string, html: string}[]}} props `html` is markup
 */
export function radioGroupMarkup({ className, label, items, chosen }) {
  const checked = items.findIndex(({ value }) => value === chosen);
  const entry = [checked, items.findIndex(({ reason }) => !reason), 0].find((index) => index >= 0);
  const buttons = items.map((item, index) => {
    const closed = item.reason ? ` aria-disabled="true" title="${escapeHtml(item.reason)}"` : "";
    return `<button type="button" class="${item.className}" role="radio" aria-checked="${index === checked}" tabindex="${index === entry ? 0 : -1}"${closed}`
      + `${dataAttributes({ ...item.data, rosterClosed: Boolean(item.reason) })}>${item.html}</button>`;
  });
  return `<div class="${className}" role="radiogroup" aria-label="${escapeHtml(label)}">${buttons.join("")}</div>`;
}

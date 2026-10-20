/**
 * An on/off setting as a full-width row: the whole row is the switch, the
 * track on the right shows its state.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { dataAttributes } from "./markup.mjs";

/** An id `aria-describedby` reads as one: a blank would make it a list of two. */
const PLAIN_ID = /^[A-Za-z][\w-]*$/;

/**
 * `key` is what wireToggles reports back; `caption` is the quieter line under the label, and a part of the
 * switch's name. A switch whose explanation is too long to stand beside it in a banner has none: `describedBy`
 * names the element elsewhere that says it, which a screen reader reads as its description (stage 07a's «Edit
 * outside the match», handoff 04 → 05 → 07a). `leadHtml` is markup of another render…() before the words, a mark the
 * switch is drawn with (the captain's «C» of a player's edit, stage 07d); without it the row is as it was.
 */
export function renderToggle({ key, label, caption = "", checked = false, disabled = false, describedBy = "", leadHtml = "" }) {
  if (!key) throw new Error("a toggle needs a key: it is what wireToggles reports back, and a switch without one is never heard");
  if (!label) throw new Error("a toggle needs a label: it is what the switch is called");
  if (describedBy && !PLAIN_ID.test(describedBy)) throw new Error(`a toggle's describedBy is one plain id, not ${JSON.stringify(describedBy)}`);
  const captionLine = caption ? `<span class="g-toggle__caption">${escapeHtml(caption)}</span>` : "";
  const text = `<span class="g-toggle__text"><span class="g-toggle__label">${escapeHtml(label)}</span>${captionLine}</span>`;
  const track = '<span class="g-toggle__track" aria-hidden="true"><span class="g-toggle__knob" aria-hidden="true"></span></span>';
  const description = describedBy ? ` aria-describedby="${describedBy}"` : "";
  return `<button type="button" class="g-toggle" role="switch" aria-checked="${Boolean(checked)}"${description}${dataAttributes({ toggleKey: key })}${disabled ? " disabled" : ""}>${leadHtml}${text}${track}</button>`;
}

/** A click flips the switch and reports `(key, checked, button)`; a disabled switch stays as it is. */
export function wireToggles(root, onChange) {
  return delegate(root, "click", ".g-toggle[data-toggle-key]", (event, button) => {
    if (button.hasAttribute("disabled")) return;
    const checked = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", String(checked));
    onChange(button.getAttribute("data-toggle-key"), checked, button);
  });
}

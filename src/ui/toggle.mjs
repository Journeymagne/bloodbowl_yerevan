/**
 * An on/off setting as a full-width row: the whole row is the switch, the
 * track on the right shows its state.
 */
import { delegate, escapeHtml } from "../core/dom.mjs";
import { dataAttributes } from "./markup.mjs";

/** `key` is what wireToggles reports back; `caption` is the quieter line under the label. */
export function renderToggle({ key, label, caption = "", checked = false, disabled = false }) {
  const captionLine = caption ? `<span class="g-toggle__caption">${escapeHtml(caption)}</span>` : "";
  const text = `<span class="g-toggle__text"><span class="g-toggle__label">${escapeHtml(label)}</span>${captionLine}</span>`;
  const track = '<span class="g-toggle__track" aria-hidden="true"><span class="g-toggle__knob" aria-hidden="true"></span></span>';
  return `<button type="button" class="g-toggle" role="switch" aria-checked="${Boolean(checked)}"${dataAttributes({ toggleKey: key })}${disabled ? " disabled" : ""}>${text}${track}</button>`;
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

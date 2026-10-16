/**
 * A labelled text input with an optional help line and an optional error.
 *
 * The label, the help and the error are all tied to the input by id, so a
 * screen reader reads the label, then the value, then what is said about it:
 * aria-describedby lists only the lines that are drawn, and aria-invalid is
 * set exactly when there is an error. Whether the value is acceptable, and
 * what the error says, is the caller's: this only draws them.
 */
import { escapeHtml } from "../core/dom.mjs";
import { classNames } from "./markup.mjs";

// The id lands in `for`, in `<id>-help` and in a space-separated aria-describedby list, none of which is escaped for it.
const ID = /^[A-Za-z][\w-]*$/;

/** ` name="value"`, ready to sit inside a tag, or nothing for an empty value. */
const attribute = (name, value) => (value ? ` ${name}="${escapeHtml(value)}"` : "");

/**
 * @param {object} props
 * @param {string} props.id a plain name: what the label's `for` and the help and error ids are built from
 * @param {string} props.name the form name of the input
 * @param {string} props.label
 * @param {string} [props.value]
 * @param {string} [props.type] the input type, `text` by default
 * @param {string} [props.help] the quiet line under the input
 * @param {string} [props.error] what is wrong with the value; draws the field as invalid
 * @param {string} [props.autocomplete]
 * @param {string} [props.inputmode]
 * @param {string} [props.placeholder]
 * @param {boolean} [props.required]
 */
export function renderTextField({ id, name, label, value = "", type = "text", help = "", error = "", autocomplete = "", inputmode = "", placeholder = "", required = false }) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`a text field id is a plain name, not ${JSON.stringify(id)}`);
  if (!label) throw new Error("a text field needs a label: nothing else names it");
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const described = [help && helpId, error && errorId].filter(Boolean).join(" ");
  const input = `<input class="g-field__input" id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"`
    + `${attribute("autocomplete", autocomplete)}${attribute("inputmode", inputmode)}${attribute("placeholder", placeholder)}`
    + `${required ? " required" : ""}${error ? ' aria-invalid="true"' : ""}${attribute("aria-describedby", described)}>`;
  const helpLine = help ? `<p class="g-field__help" id="${escapeHtml(helpId)}">${escapeHtml(help)}</p>` : "";
  const errorLine = error ? `<p class="g-field__error" id="${escapeHtml(errorId)}">${escapeHtml(error)}</p>` : "";
  return `<div class="${classNames("g-field", error && "g-field--invalid")}">`
    + `<label class="g-field__label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>${input}${helpLine}${errorLine}</div>`;
}

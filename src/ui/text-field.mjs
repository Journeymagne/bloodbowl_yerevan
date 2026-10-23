/**
 * A labelled text input with an optional help line and an optional error.
 *
 * The label, the help and the error are all tied to the input by id, so a
 * screen reader reads the label, then the value, then what is said about it:
 * aria-describedby lists only the lines that are drawn, and aria-invalid is
 * set exactly when there is an error. Whether the value is acceptable, and
 * what the error says, is the caller's: this only draws them.
 *
 * A field of several lines (a death's cause: StatsMngDead.html, DeskRosterDeath.html) is a
 * textarea with the same label, help, error and ids; it has no type, input mode or autocomplete.
 */
import { escapeHtml } from "../core/dom.mjs";
import { classNames } from "./markup.mjs";

/** The input types a form here uses: a type outside the list (hidden, checkbox, a string that breaks out of the attribute) is a bug in the caller. */
export const TEXT_FIELD_TYPES = ["text", "password", "email", "tel", "url", "search", "number"];

/** The lines a field of several lines may show before it scrolls; both prototypes draw two, the default. */
const AREA_ROWS = { min: 1, max: 8 };

// The id lands in `for`, in `<id>-help` and in a space-separated aria-describedby list, none of which is escaped for it.
const ID = /^[A-Za-z][\w-]*$/;

/** ` name="value"`, ready to sit inside a tag, or nothing for an empty value. */
const attribute = (name, value) => (value ? ` ${name}="${escapeHtml(value)}"` : "");

/**
 * @param {object} props
 * @param {string} props.id a plain name: what the label's `for` and the help and error ids are built from
 * @param {string} props.name the form name of the input
 * @param {string} props.label
 * @param {string|number|null} [props.value] nothing (`null`, `undefined`) is an empty field; a zero is a zero
 * @param {string} [props.type] one of TEXT_FIELD_TYPES, `text` by default; a field of several lines draws none
 * @param {boolean} [props.multiline] a field of several lines: a textarea, whose value is its text
 * @param {number} [props.rows] the lines a field of several lines shows, a whole number from 1 to 8; 2 by default
 * @param {string} [props.help] the quiet line under the input
 * @param {string} [props.error] what is wrong with the value; draws the field as invalid
 * @param {boolean} [props.invalid] draws the field as invalid without a line of its own: the
 *   reason is said once for the whole form (a refused sign-in names two fields in one alert)
 * @param {string} [props.describedBy] the id of what is said about the field elsewhere (that
 *   form's alert), read after the field's own lines
 * @param {boolean} [props.verbatim] what is typed is taken as it is: no capital letter, no
 *   correction and no spell check (a login, a Telegram name)
 * @param {string} [props.autocomplete] not drawn on a field of several lines
 * @param {string} [props.inputmode] not drawn on a field of several lines
 * @param {string} [props.placeholder]
 * @param {boolean} [props.required]
 * @param {boolean} [props.readonly] the value cannot be typed over while something is being done with it (a save on
 *   its way); unlike `disabled` the field keeps its focus and is still read
 * @param {string} [props.asideHtml] markup from a render…() function, at the end of the label's line (a "show" toggle)
 * @param {string} [props.actionHtml] markup from a render…() function, beside the input (a "save" button)
 */
export function renderTextField({ id, name, label, value = "", type = "text", multiline = false, rows = 2, help = "", error = "", invalid = false, describedBy = "", verbatim = false, autocomplete = "", inputmode = "", placeholder = "", required = false, readonly = false, asideHtml = "", actionHtml = "" }) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`a text field id is a plain name, not ${JSON.stringify(id)}`);
  if (describedBy && !ID.test(describedBy)) throw new Error(`a text field is described by a plain id, not ${JSON.stringify(describedBy)}`);
  if (!TEXT_FIELD_TYPES.includes(type)) throw new Error(`a text field type is one of ${TEXT_FIELD_TYPES.join(", ")}, not ${JSON.stringify(type)}`);
  if (!Number.isInteger(rows) || rows < AREA_ROWS.min || rows > AREA_ROWS.max) throw new Error(`a text field shows ${AREA_ROWS.min} to ${AREA_ROWS.max} rows, not ${JSON.stringify(rows)}`);
  if (!label) throw new Error("a text field needs a label: nothing else names it");
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const described = [help && helpId, error && errorId, describedBy].filter(Boolean).join(" ");
  const wrong = Boolean(error) || invalid;
  // What both kinds say alike: the hint, how what is typed is taken, and what is said about it.
  const shared = `${attribute("placeholder", placeholder)}${verbatim ? ' autocapitalize="none" autocorrect="off" spellcheck="false"' : ""}`
    + `${required ? " required" : ""}${readonly ? " readonly" : ""}${wrong ? ' aria-invalid="true"' : ""}${attribute("aria-describedby", described)}`;
  // A browser drops one newline right after <textarea>: the one written before the text keeps a value's own first line.
  const input = multiline
    ? `<textarea class="g-field__input g-field__input--area" id="${escapeHtml(id)}" name="${escapeHtml(name)}" rows="${rows}"${shared}>\n${escapeHtml(value ?? "")}</textarea>`
    : `<input class="g-field__input" id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value ?? "")}"`
      + `${attribute("autocomplete", autocomplete)}${attribute("inputmode", inputmode)}${shared}>`;
  const helpLine = help ? `<p class="g-field__help" id="${escapeHtml(helpId)}">${escapeHtml(help)}</p>` : "";
  const errorLine = error ? `<p class="g-field__error" id="${escapeHtml(errorId)}">${escapeHtml(error)}</p>` : "";
  const labelTag = `<label class="g-field__label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>`;
  // Each wrapper exists only when there is something to put beside the label or the input.
  const head = asideHtml ? `<div class="g-field__head">${labelTag}${asideHtml}</div>` : labelTag;
  const control = actionHtml ? `<div class="g-field__control">${input}${actionHtml}</div>` : input;
  return `<div class="${classNames("g-field", wrong && "g-field--invalid")}">${head}${control}${helpLine}${errorLine}</div>`;
}

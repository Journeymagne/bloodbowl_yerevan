/**
 * A search box: a magnifier, a visually hidden label and an input that filters
 * the list below it as it is typed in.
 *
 * What is looked for, how the list reacts and what an empty result says is the
 * caller's: this draws the field and puts the attributes it is given (a hook
 * for the screen's listener) on the input. The caller listens to `input` on
 * the field itself; nothing here is wired.
 */
import { escapeHtml } from "../core/dom.mjs";
import { icon as renderIcon } from "./icons.mjs";
import { dataAttributes } from "./markup.mjs";

// The id lands in `for` and in the input's own id, and is not escaped for either.
const ID = /^[A-Za-z][\w-]*$/;

/**
 * @param {object} props
 * @param {string} props.id a plain name: what the label's `for` points at
 * @param {string} props.label names the field for a screen reader; the placeholder is not a name
 * @param {string} [props.placeholder] what can be found
 * @param {string} [props.value] what is already typed in, drawn as text
 * @param {object} [props.data] data attributes of the input, as for dataAttributes
 */
export function renderSearchField({ id, label, placeholder = "", value = "", data = {} }) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`a search field id is a plain name, not ${JSON.stringify(id)}`);
  if (!label) throw new Error("a search field needs a label: the placeholder does not name it for a screen reader");
  const input = `<input class="g-search__input" id="${escapeHtml(id)}" type="search" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"`
    + ` autocomplete="off" spellcheck="false" enterkeyhint="search"${dataAttributes(data)}>`;
  return `<div class="g-search">${renderIcon("search", 18)}<label class="g-sr-only" for="${escapeHtml(id)}">${escapeHtml(label)}</label>${input}</div>`;
}

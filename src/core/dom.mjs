/**
 * Building markup safely, and listening to it once.
 *
 * The app renders HTML strings and assigns them with innerHTML. That is fine
 * as long as every value that came from a person is escaped — but escaping by
 * remembering to call a function, in seven thousand lines of template literals,
 * is a rule that only has to be forgotten once. A missed escape here is stored
 * XSS, and the session token lives in localStorage.
 *
 * So `html` escapes by default and `raw()` is the way to say "I meant markup".
 * That inverts the failure mode: forgetting produces an escaped, visibly wrong
 * string instead of executable script.
 */

const RAW = Symbol("raw-html");

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for use as HTML text or inside a double-quoted attribute. */
export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/** Mark a string as already-safe markup so `html` will not escape it again. */
export function raw(markup) {
  return { [RAW]: String(markup ?? "") };
}

export function isRaw(value) {
  return Boolean(value && typeof value === "object" && RAW in value);
}

function renderValue(value) {
  if (value === null || value === undefined || value === false) return "";
  if (isRaw(value)) return value[RAW];
  if (Array.isArray(value)) return value.map(renderValue).join("");
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolation.
 *
 *   html`<h1>${team.name}</h1>`                 // escaped
 *   html`<div>${raw(renderCard(team))}</div>`   // nested markup, on purpose
 *
 * Arrays are joined, so `${items.map(renderItem)}` needs no `.join("")` —
 * as long as renderItem returns raw() or plain text.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let index = 0; index < values.length; index += 1) {
    out += renderValue(values[index]) + strings[index + 1];
  }
  return raw(out);
}

/** The string form, for assigning to innerHTML. */
export function toHtml(value) {
  return renderValue(value);
}

/** An `<option>`, marked selected when its value matches. */
export function renderOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

/**
 * One listener for a whole list instead of one per row.
 *
 * The screens re-render by replacing innerHTML, which throws away every
 * listener attached to the old nodes; delegating to a container that survives
 * the re-render means handlers do not have to be attached again each time.
 *
 * @returns {() => void} removes the listener
 */
export function delegate(root, eventName, selector, handler) {
  const listener = (event) => {
    // Duck-typed rather than `instanceof Element`: text nodes and the document
    // have no `closest` either, and `instanceof` is false across realms, so a
    // click inside an iframe or a printed document would be silently dropped.
    const source = event?.target;
    const target = typeof source?.closest === "function" ? source.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

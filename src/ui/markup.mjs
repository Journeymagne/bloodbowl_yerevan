/**
 * The two rules every src/ui component is written by, and the helpers that
 * make them cheap to follow.
 *
 * 1. Every string reaches markup through escapeHtml. A prop whose name ends
 *    in `Html` is the one exception: it is markup that another render…()
 *    function produced, inserted as it is, so nothing a person typed may be
 *    passed in it.
 * 2. There are no league rules in src/ui. Prices, limits, SPP and the reason
 *    an action is refused arrive from the caller, already decided; a component
 *    only draws them.
 */
import { escapeHtml } from "../core/dom.mjs";

/**
 * ` data-player-id="p1"` for `{ playerId: "p1" }`, with the leading space, ready
 * to sit inside a tag. `null`, `undefined` and `false` leave the attribute out;
 * `0` and `true` are values. Keys come from code, never from a person.
 */
export function dataAttributes(data = {}) {
  let attributes = "";
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === false) continue;
    const name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    attributes += ` data-${name}="${escapeHtml(value)}"`;
  }
  return attributes;
}

/** The class attribute's value: the names that are there, space-separated. */
export function classNames(...names) {
  return names.filter(Boolean).join(" ");
}

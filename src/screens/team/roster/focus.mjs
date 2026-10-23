/**
 * Where the roster's focus is before a redraw, and where it goes after one (index.mjs's `drawVisit`): the screen is
 * patched, not drawn anew, so the focus stays where the coach put it — unless the redraw took that element away.
 */
import { focusLost } from "../../../core/dom.mjs";
import { view } from "../../../core/view.mjs";
import { openerOf } from "./injury.mjs";

/**
 * Where the focus is before a redraw: the line it belongs to (his row, his panel, his sheet), the counter it is on,
 * and in a sheet, that sheet and what opened it.
 * @param {{opener: Element|null, sheet: object|null}} visit index.mjs's `Visit`
 */
export function focusPlace(visit) {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const cell = active.closest?.("[data-action-key]");
  const sheet = active.closest?.("dialog") ? { opener: visit.opener, sheet: visit.sheet } : null;
  const row = active.closest?.("tbody[data-key]")?.getAttribute("data-key") ?? active.closest?.("[data-panel-player]")?.getAttribute("data-panel-player")
    ?? sheet?.sheet?.key;
  return { row: row ?? null, counter: cell?.getAttribute("data-action-key") ?? null, player: cell?.getAttribute("data-player") ?? null, sheet };
}

/**
 * A redraw that took the focused element away, or shut it (a minus stopped at zero), gives the focus to the nearest
 * one left (Carry T9): the same counter's other button, the player's own button in the table, else the title, where a
 * keyboard starts from — never the page's body. A sheet still open keeps it (a button busy with its row, R14): on
 * what is chosen in it, else its close. A sheet the redraw closed (its match over, another on) gives it back to
 * what opened it, else to the title.
 * @param {ReturnType<typeof focusPlace>} place
 */
export function restoreFocus(place) {
  if (!place || (!focusLost(document.activeElement) && !document.activeElement.hasAttribute("disabled"))) return;
  const dialog = place.sheet ? view.querySelector("dialog:modal") : null;
  if (dialog) {
    (dialog.querySelector('[aria-checked="true"]') ?? dialog.querySelector("[data-sheet-close]"))?.focus();
    return;
  }
  if (place.sheet) {
    (openerOf(place.sheet) ?? view.querySelector("h1"))?.focus();
    return;
  }
  // A browser's NodeList has no `find`: spread it (the test page's lists are arrays and would not say so).
  const all = (root, selector) => [...(root?.querySelectorAll(selector) ?? [])];
  const cell = all(view, "[data-action-key]").find((item) => item.getAttribute("data-action-key") === place.counter && item.getAttribute("data-player") === place.player);
  const target = all(cell, "[data-action-step]").find((button) => !button.hasAttribute("disabled"))
    ?? all(view, "[data-row-key]").find((button) => button.getAttribute("data-row-key") === place.row)
    ?? view.querySelector("h1");
  target?.focus();
}

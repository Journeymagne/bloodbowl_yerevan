/**
 * What the roster hears, on the view that outlives its redraws: a header pressed, a player pressed, a skill chip
 * pressed (in a row or in the panel), the skill's sheet closed, «Try again» after a read that failed, a counter's
 * − or + (a refused one too), and «Load the new one» after another device's save. What each one does is the
 * screen's (index.mjs); this file only says who was pressed.
 */
import { delegate } from "../../../core/dom.mjs";
import { wireActionSteppers } from "../../../ui/action-stepper.mjs";
import { wireRosterTable } from "../../../ui/roster-table.mjs";
import { wireSheets } from "../../../ui/sheet.mjs";
import { wireSkillChips } from "../../../ui/skill-chip.mjs";

/** The line a chip belongs to: the panel's player, or the player of the table's body it stands in. */
function lineKeyOf(chip) {
  return chip.closest("[data-panel-player]")?.getAttribute("data-panel-player") ?? chip.closest("tbody[data-key]")?.getAttribute("data-key") ?? null;
}

/**
 * @param {Element} root the view
 * @param {object} handlers
 * @param {(column: string) => void} handlers.onSort
 * @param {(key: string) => void} handlers.onToggle a player's button, by his line's key
 * @param {(key: string, name: string, chip: Element) => void} handlers.onSkill a chip, by the line's key and the skill as written
 * @param {(id: string) => void} handlers.onSheetClose
 * @param {() => void} handlers.onRetry
 * @param {(playerId: string, counter: string, delta: number) => void} handlers.onStep a counter's − or +, by the player's stored id
 * @param {(reason: string) => void} handlers.onRefused a − or + that says why it takes no step
 * @param {() => void} handlers.onReload «Load the new one»
 * @returns {() => void} takes every listener off
 */
export function wireRoster(root, { onSort, onToggle, onSkill, onSheetClose, onRetry, onStep, onRefused, onReload }) {
  const offs = [
    wireRosterTable(root, { onSort, onToggle }),
    wireSkillChips(root, (name, chip) => {
      const key = lineKeyOf(chip);
      if (key) onSkill(key, name, chip);
    }),
    wireSheets(root, { onClose: onSheetClose }),
    wireActionSteppers(root, ({ key, delta, element }) => onStep(element.getAttribute("data-player") ?? "", key, delta), { onRefused: ({ reason }) => onRefused(reason) }),
    delegate(root, "click", "[data-roster-retry]", () => onRetry()),
    delegate(root, "click", "[data-roster-reload]", () => onReload()),
  ];
  return () => offs.forEach((off) => off());
}

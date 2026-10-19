/**
 * What the roster hears, on the view that outlives its redraws: a header pressed, a player pressed, a skill chip
 * pressed (in a row or in the panel), a sheet closed, «Try again» after a read that failed, a counter's − or + (a
 * refused one too), «Load the new one» after another device's save, the switch «Edit outside the match», a way to
 * the player's page that a match has closed (or «Injury in the match…» closed with its taps), and the injury's
 * button, its cards, its characteristics and its two buttons. What each one does is the screen's (index.mjs,
 * injury.mjs); this file only says who was pressed.
 */
import { delegate } from "../../../core/dom.mjs";
import { wireActionSteppers } from "../../../ui/action-stepper.mjs";
import { wireFilterChips } from "../../../ui/filter-chips.mjs";
import { wireOptionLists } from "../../../ui/option-card.mjs";
import { wireRosterTable } from "../../../ui/roster-table.mjs";
import { wireSheets } from "../../../ui/sheet.mjs";
import { wireSkillChips } from "../../../ui/skill-chip.mjs";
import { wireToggles } from "../../../ui/toggle.mjs";
import { INJURY_STAT } from "./sheets.mjs";
import { OUTSIDE_TOGGLE } from "./view.mjs";

/** The line a chip belongs to: the panel's player, or the player of the table's body it stands in. */
function lineKeyOf(chip) {
  return chip.closest("[data-panel-player]")?.getAttribute("data-panel-player") ?? chip.closest("tbody[data-key]")?.getAttribute("data-key") ?? null;
}

/** The injury's presses (Task 12). A closed «Injury in the match…» opens nothing: it says why as `[data-roster-closed]` does (wireRoster). */
function wireInjury(root, { onInjury, onInjuryChoice, onInjuryStep }) {
  return [
    delegate(root, "click", "[data-roster-injury]", (event, button) => {
      if (button.getAttribute("aria-disabled") !== "true") onInjury(button.getAttribute("data-roster-injury"), button);
    }),
    wireOptionLists(root, (code) => onInjuryChoice({ code })),
    wireFilterChips(root, (stat) => onInjuryChoice({ stat }), { group: INJURY_STAT }),
    // A busy button is `disabled`, which a browser does not click: the press is refused again where it is taken (injury.mjs).
    delegate(root, "click", "[data-injury-step]", (event, button) => onInjuryStep(Number(button.getAttribute("data-injury-step")))),
  ];
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
 * @param {(reason: string) => void} handlers.onRefused a − or + that says why it takes no step, and a closed way to the player's page
 * @param {() => void} handlers.onReload «Load the new one»
 * @param {(on: boolean) => void} handlers.onOutside «Edit outside the match» switched on or off
 * @param {(key: string, button: Element) => void} handlers.onInjury «Injury in the match…», by the line's key (not when it is closed)
 * @param {(change: {code?: string, stat?: string}) => void} handlers.onInjuryChoice an injury or its characteristic chosen in the sheet
 * @param {(delta: 1|-1) => void} handlers.onInjuryStep «Record in the match» (+1) or «Remove the record» (−1)
 * @returns {() => void} takes every listener off
 */
export function wireRoster(root, handlers) {
  const { onSort, onToggle, onSkill, onSheetClose, onRetry, onStep, onRefused, onReload, onOutside } = handlers;
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
    wireToggles(root, (key, on) => {
      if (key === OUTSIDE_TOGGLE) onOutside(on);
    }),
    delegate(root, "click", "[data-roster-closed]", (event, button) => onRefused(button.getAttribute("title") ?? "")),
    ...wireInjury(root, handlers),
  ];
  return () => offs.forEach((off) => off());
}

/**
 * What the roster hears, on the view that outlives its redraws: a header pressed, a player pressed, a skill chip
 * pressed (in a row or in the panel), a sheet closed, «Try again» after a read that failed (the roster's, or the
 * one after an injury whose answer was lost), a counter's − or + (a refused one too), «Load the new one» after
 * another device's save, the switch «Edit outside the match», a way to the player's page that a match has closed
 * (or «Injury in the match…» closed with its taps), and the injury's button, its cards, its characteristics and its
 * two buttons; «Miss a match…», its sheet's reasons, characteristic, words and button, «Back on the roster», and a
 * fallen player's «Undo the mark» with its sheet's «Keep» and «Back on the roster» (stage 07b); the «+» beside «Player»,
 * its cart's + and −, «Cancel» and «Buy» (stage 07c). What each one does is the screen's (index.mjs, injury.mjs,
 * marks.mjs, market.mjs); this file only says who was pressed.
 */
import { delegate } from "../../../core/dom.mjs";
import { wireActionSteppers } from "../../../ui/action-stepper.mjs";
import { wireFilterChips } from "../../../ui/filter-chips.mjs";
import { wireOptionLists } from "../../../ui/option-card.mjs";
import { wireRosterTable } from "../../../ui/roster-table.mjs";
import { wireSheets } from "../../../ui/sheet.mjs";
import { wireSkillChips } from "../../../ui/skill-chip.mjs";
import { wireStepButtons } from "../../../ui/stepper.mjs";
import { wireToggles } from "../../../ui/toggle.mjs";
import { MARK_TEXT } from "./mark-sheet.mjs";
import { INJURY_STAT, MARK_SHEET, MARK_STAT } from "./sheets.mjs";
import { OUTSIDE_TOGGLE } from "./view.mjs";

/** The line a chip belongs to: the panel's player, or the player of the table's body it stands in. */
function lineKeyOf(chip) {
  return chip.closest("[data-panel-player]")?.getAttribute("data-panel-player") ?? chip.closest("tbody[data-key]")?.getAttribute("data-key") ?? null;
}

/** A press on a button of one player's, by his line's key, which it carries; a closed one says why as `[data-roster-closed]` does (wireRoster). */
function onPlayerButton(root, attribute, handler) {
  return delegate(root, "click", `[${attribute}]`, (event, button) => {
    if (button.getAttribute("aria-disabled") !== "true") handler(button.getAttribute(attribute), button);
  });
}

/** The injury's presses (Task 12). A closed «Injury in the match…» opens nothing. */
function wireInjury(root, { onInjury, onInjuryChoice, onInjuryStep }) {
  return [
    onPlayerButton(root, "data-roster-injury", onInjury),
    wireFilterChips(root, (stat) => onInjuryChoice({ stat }), { group: INJURY_STAT }),
    // A busy button is `aria-busy` and keeps the focus, so a browser still clicks it: the press is refused where it is
    // taken (injury.mjs's `record`, while the injury is in the air).
    delegate(root, "click", "[data-injury-step]", (event, button) => onInjuryStep(Number(button.getAttribute("data-injury-step")))),
  ];
}

/**
 * The marks' presses (stage 07b): «Miss a match…», «Back on the roster» and «Undo the mark» (not when closed), the mark's
 * sheet's characteristic, words and button, and the undo's sheet's two buttons.
 */
function wireMarks(root, { onMark, onMarkChoice, onMarkText, onMarkSend, onReturn, onUndo, onUndoKeep, onUndoSend }) {
  return [
    onPlayerButton(root, "data-roster-mark", onMark),
    onPlayerButton(root, "data-roster-return", onReturn),
    onPlayerButton(root, "data-roster-undo", onUndo),
    wireFilterChips(root, (stat) => onMarkChoice({ stat }), { group: MARK_STAT }),
    delegate(root, "input", `#${MARK_TEXT}`, (event, field) => onMarkText(field.value)),
    delegate(root, "click", "[data-mark-send]", () => onMarkSend()),
    delegate(root, "click", "[data-undo-keep]", () => onUndoKeep()),
    delegate(root, "click", "[data-undo-send]", () => onUndoSend()),
  ];
}

/**
 * The market's presses (stage 07c): the «+» (not when closed), a card's + or − — «+ To the cart» and the stepper's
 * buttons alike carry `data-hire-step`; a refused + says why — and the cart's «Cancel» and «Buy».
 */
function wireMarket(root, { onHire, onHireStep, onHireKeep, onHireBuy, onRefused }) {
  return [
    onPlayerButton(root, "data-roster-hire", onHire),
    wireStepButtons(root, "hire", ({ key, delta }) => onHireStep(Number(key), delta), { onRefused: ({ reason }) => onRefused(reason) }),
    delegate(root, "click", "[data-hire-keep]", () => onHireKeep()),
    delegate(root, "click", "[data-hire-buy]", () => onHireBuy()),
  ];
}

/**
 * The cards of whichever sheet is open, by the sheet they stand in. One wiring for the root: two would not work, since
 * the first flips the group's cards and the second then hears no change (wireFilterChips says the same of chip rows).
 */
function wireReasons(root, { onInjuryChoice, onMarkChoice }) {
  return wireOptionLists(root, (code, list) => (list.closest("dialog")?.id === MARK_SHEET ? onMarkChoice({ code }) : onInjuryChoice({ code })));
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
 * @param {() => void} handlers.onReread «Try again» after an injury whose fate the read that followed could not say
 * @param {(on: boolean) => void} handlers.onOutside «Edit outside the match» switched on or off
 * @param {(key: string, button: Element) => void} handlers.onInjury «Injury in the match…», by the line's key (not when it is closed)
 * @param {(change: {code?: string, stat?: string}) => void} handlers.onInjuryChoice an injury or its characteristic chosen in the sheet
 * @param {(delta: 1|-1) => void} handlers.onInjuryStep «Record in the match» (+1) or «Remove the record» (−1)
 * @param {(key: string, button: Element) => void} handlers.onMark «Miss a match…», by the line's key (not when it is closed)
 * @param {(change: {code?: string, stat?: string}) => void} handlers.onMarkChoice a reason or its characteristic chosen in the sheet
 * @param {(text: string) => void} handlers.onMarkText another reason's words, as typed
 * @param {() => void} handlers.onMarkSend «Mark the missed match»
 * @param {(key: string) => void} handlers.onReturn «Back on the roster», by the line's key (not when it is closed)
 * @param {(key: string, button: Element) => void} handlers.onUndo «Undo the mark», by the fallen line's key (not when it is closed)
 * @param {() => void} handlers.onUndoKeep «Keep» in the undo's sheet
 * @param {() => void} handlers.onUndoSend «Back on the roster» in the undo's sheet
 * @param {(key: string, button: Element) => void} handlers.onHire the «+» beside «Player» or «Hire players» (not when it is closed)
 * @param {(rowIndex: number, delta: 1|-1) => void} handlers.onHireStep a card's + or −, by the line of the race's table (not a refused +)
 * @param {() => void} handlers.onHireKeep «Cancel» in the cart
 * @param {() => void} handlers.onHireBuy «Buy» in the cart
 * @returns {() => void} takes every listener off
 */
export function wireRoster(root, handlers) {
  const { onSort, onToggle, onSkill, onSheetClose, onRetry, onStep, onRefused, onReload, onReread, onOutside } = handlers;
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
    delegate(root, "click", "[data-roster-reread]", () => onReread()),
    wireToggles(root, (key, on) => {
      if (key === OUTSIDE_TOGGLE) onOutside(on);
    }),
    delegate(root, "click", "[data-roster-closed]", (event, button) => onRefused(button.getAttribute("title") ?? "")),
    wireReasons(root, handlers),
    ...wireInjury(root, handlers),
    ...wireMarks(root, handlers),
    ...wireMarket(root, handlers),
  ];
  return () => offs.forEach((off) => off());
}

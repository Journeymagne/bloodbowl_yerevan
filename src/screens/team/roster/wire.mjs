/**
 * What the roster hears, on the view that outlives its redraws: a header pressed, a player pressed, a skill chip
 * pressed (in a row or in the panel), a sheet closed, «Try again» after a read that failed (the roster's, or the
 * one after an injury whose answer was lost), a counter's − or + (a refused one too), «Load the new one» after
 * another device's save, the switch «Edit outside the match», a way to the player's page that a match has closed
 * (or «Injury in the match…» closed with its taps), and the injury's button, its cards, its characteristics and its
 * two buttons; «Miss a match…», its sheet's reasons, characteristic, words and button, «Back on the roster», and a
 * fallen player's «Undo the mark» with its sheet's «Keep» and «Back on the roster» (stage 07b); the «+» beside «Player»,
 * its cart's + and −, «Cancel» and «Buy», and «Sell» or «Cancel purchase» with its sheet's «Cancel» and button (stage
 * 07c); a player's pencil, his edit's fields as they are typed, its switch «Team captain», «Cancel» and «Save», and
 * his «Advancement» with its sheet's type, category, skill, «Back», «Next», «Take», «Cancel» and «Done», its roll's
 * way, «Roll …», a random skill's pair and the faces marked at the table, the D8's faces, characteristics, «Take a
 * skill in place…» and «Record this roll…», a god's bonus skill
 * and «Add …» on done; the edit's line to the fix by hand, its counters' − and +, its injuries' points, favoured
 * skills and skills to take off, «Cancel» and «Save», and its «Undo the last: …» with its sheet's «Keep» and «Undo
 * advancement»; the button of a phone's «Career» (stage 07d).
 * What each one does is the screen's (index.mjs, injury.mjs, marks.mjs, market.mjs, player.mjs, advance.mjs); this
 * file only says who was pressed.
 */
import { delegate } from "../../../core/dom.mjs";
import { wireActionSteppers } from "../../../ui/action-stepper.mjs";
import { wireRadioGroups } from "../../../ui/choice.mjs";
import { wireFilterChips } from "../../../ui/filter-chips.mjs";
import { wireOptionLists } from "../../../ui/option-card.mjs";
import { wireResourceCounters } from "../../../ui/resource-counter.mjs";
import { wireRosterTable } from "../../../ui/roster-table.mjs";
import { wireSegmentedControls } from "../../../ui/segmented-control.mjs";
import { wireSheets } from "../../../ui/sheet.mjs";
import { wireSkillChips } from "../../../ui/skill-chip.mjs";
import { wireStepButtons } from "../../../ui/stepper.mjs";
import { wireToggles } from "../../../ui/toggle.mjs";
import { MARK_TEXT } from "./mark-sheet.mjs";
import { CAPTAIN_TOGGLE, EDIT_FIELDS } from "./player-sheets.mjs";
import { VIA_GROUP } from "./roll-view.mjs";
import { ADVANCE_SHEET, INJURY_STAT, MARK_SHEET, MARK_STAT } from "./sheets.mjs";
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
 * buttons alike carry `data-hire-step`; a refused + says why — and the cart's «Cancel» and «Buy»; «Sell» or «Cancel
 * purchase» (not when closed), and its sheet's «Cancel» and button.
 */
function wireMarket(root, { onHire, onHireStep, onHireKeep, onHireBuy, onRefused, onSell, onSellKeep, onSellSend }) {
  return [
    onPlayerButton(root, "data-roster-hire", onHire),
    wireStepButtons(root, "hire", ({ key, delta }) => onHireStep(Number(key), delta), { onRefused: ({ reason }) => onRefused(reason) }),
    delegate(root, "click", "[data-hire-keep]", () => onHireKeep()),
    delegate(root, "click", "[data-hire-buy]", () => onHireBuy()),
    onPlayerButton(root, "data-roster-sell", onSell),
    delegate(root, "click", "[data-sell-keep]", () => onSellKeep()),
    delegate(root, "click", "[data-sell-send]", () => onSellSend()),
  ];
}

/**
 * A player's own presses (stage 07d): his pencil (not when closed), the edit's number and name as they are typed — the
 * screen is patched, so the field keeps its focus and its caret — and its «Cancel» and «Save»; his fix by hand's «Undo
 * the last: …» (not when closed) and its sheet's «Keep» and «Undo advancement»; the button of his profile's «Career»,
 * which opens and closes its list. The switch «Team captain» is heard with the roster's other switch (`wireRoster`);
 * the SPP tiles of a desk's edit are the roster's counters, whose − and + `wireActionSteppers` hears.
 */
function wirePlayer(root, { onEdit, onEditField, onEditKeep, onEditSave, onUnadvance, onUnadvanceKeep, onUnadvanceSend, onCareerToggle }) {
  return [
    onPlayerButton(root, "data-player-edit", onEdit),
    ...Object.entries(EDIT_FIELDS).map(([field, id]) => delegate(root, "input", `#${id}`, (event, input) => onEditField(field, input.value))),
    delegate(root, "click", "[data-edit-keep]", () => onEditKeep()),
    delegate(root, "click", "[data-edit-save]", () => onEditSave()),
    onPlayerButton(root, "data-player-unadvance", onUnadvance),
    delegate(root, "click", "[data-unadvance-keep]", () => onUnadvanceKeep()),
    delegate(root, "click", "[data-unadvance-send]", () => onUnadvanceSend()),
    delegate(root, "click", "[data-player-career]", () => onCareerToggle()),
  ];
}

/**
 * A player's fix by hand (stage 07d, Task 13): the edit's line to it (not when closed — a press on a closed one says
 * why, as `[data-roster-closed]` does), its counters' − and + — the roster has no other counters of a resource, so
 * every key is the fix's; a refused + says why — an injury's point, a favoured skill, a skill to take off, «Cancel»
 * and «Save».
 */
function wireFix(root, { onFixOpen, onFixStep, onFixLasting, onFixFavoured, onFixDrop, onFixKeep, onFixSave, onRefused }) {
  const pressed = (attribute, handler) => delegate(root, "click", `[${attribute}]`, (event, button) => handler(button.getAttribute(attribute)));
  return [
    onPlayerButton(root, "data-player-fix", onFixOpen),
    wireResourceCounters(root, ({ key, delta }) => onFixStep({ key, delta }), { onRefused: ({ reason }) => onRefused(reason) }),
    pressed("data-fix-lasting", onFixLasting),
    pressed("data-fix-favoured", onFixFavoured),
    pressed("data-fix-drop", onFixDrop),
    delegate(root, "click", "[data-fix-keep]", () => onFixKeep()),
    delegate(root, "click", "[data-fix-save]", () => onFixSave()),
  ];
}

/** The advancement sheet's buttons, heard by one listener (`wireAdvance`). */
const ADVANCE_BUTTONS = ["next", "take", "roll", "instead", "statback", "bind", "keep", "done"].map((name) => `[data-advance-${name}]`).join(", ");

/**
 * A player's advancement (stage 07d): «Advancement» or «Advance» (not when closed — a press on a closed one says why, as
 * `[data-roster-closed]` does), its categories, its skills, a random skill's pair, the D8's faces and the
 * characteristics, each a radio group of its own (a closed item says why the same way), the D16's faces at the table,
 * which mark (two at once: no radio group; a closed one says why the same way, and marks nothing), the way the roll is
 * made (a closed way says why on a press), and its sheet's «Next», «Take», «Roll …», «Take a skill in place…» and a
 * desk's way back from it, «Record this roll…», «Cancel» and «Done»; on done a god's bonus skills, a radio group of
 * their own, and «Add …» (not when closed). Its types are the option cards `wireReasons` hears; its «Back», the sheet's
 * own (`wireSheets`).
 */
function wireAdvance(root, handlers) {
  const { onAdvance, onAdvanceCategory, onAdvanceSkill, onAdvanceVia, onAdvanceFace, onAdvancePick, onAdvanceStat, onRefused, onFavoured, onFavouredAdd } = handlers;
  const radios = (group, attribute, onChange) => wireRadioGroups(root, { group, item: `[${attribute}]`, attribute, onChange });
  return [
    onPlayerButton(root, "data-player-advance", onAdvance),
    radios(".g-advance__cats", "data-advance-category", onAdvanceCategory),
    radios(".g-advance__skills", "data-advance-skill", onAdvanceSkill),
    radios(".g-advance__pair", "data-advance-pick", onAdvancePick),
    delegate(root, "click", ".g-advance__faces button[data-advance-face]", (event, button) => {
      if (button.getAttribute("aria-disabled") !== "true") onAdvanceFace(Number(button.getAttribute("data-advance-face")));
    }),
    radios(".g-advance__d8", "data-advance-d8", (face) => onAdvanceFace(Number(face))),
    radios(".g-advance__stats", "data-advance-stat", onAdvanceStat),
    radios(".g-favoured__skills", "data-favoured-skill", onFavoured),
    onPlayerButton(root, "data-favoured-add", () => onFavouredAdd()),
    wireSegmentedControls(root, (via) => onAdvanceVia(via), { group: VIA_GROUP }),
    delegate(root, "click", `[data-seg-group="${VIA_GROUP}"] [aria-disabled="true"][title]`, (event, item) => onRefused(item.getAttribute("title"))),
    // One listener for the sheet's buttons: a step patches its one button in place («Roll …», «Next», «Take», «Back to the
    // player»), and a listener of its own for each would hear the same click again on the button it has become. A closed
    // or busy one is `aria-disabled` and still clicked: why is said where the press is taken (advance.mjs).
    delegate(root, "click", ADVANCE_BUTTONS, (event, button) => pressAdvance(button, handlers)),
  ];
}

/** Which of the advancement sheet's buttons was pressed. */
function pressAdvance(button, handlers) {
  const { onAdvanceNext, onAdvanceTake, onAdvanceRoll, onAdvanceInstead, onAdvanceStatBack, onAdvanceBind, onAdvanceKeep, onAdvanceDone } = handlers;
  if (button.hasAttribute("data-advance-next")) onAdvanceNext();
  else if (button.hasAttribute("data-advance-take")) onAdvanceTake();
  else if (button.hasAttribute("data-advance-roll")) onAdvanceRoll();
  else if (button.hasAttribute("data-advance-instead")) onAdvanceInstead();
  else if (button.hasAttribute("data-advance-statback")) onAdvanceStatBack();
  else if (button.hasAttribute("data-advance-bind")) onAdvanceBind();
  else if (button.hasAttribute("data-advance-keep")) onAdvanceKeep();
  else onAdvanceDone();
}

/**
 * The cards of whichever sheet is open, by the sheet they stand in: a missed match's reasons, an advancement's types
 * (stage 07d), an injury's. One wiring for the root: two would not work, since the first flips the group's cards and
 * the second then hears no change (wireFilterChips says the same of chip rows).
 */
function wireReasons(root, { onInjuryChoice, onMarkChoice, onAdvanceType }) {
  return wireOptionLists(root, (code, list) => {
    const sheet = list.closest("dialog")?.id;
    if (sheet === MARK_SHEET) onMarkChoice({ code });
    else if (sheet === ADVANCE_SHEET) onAdvanceType(code);
    else onInjuryChoice({ code });
  });
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
 * @param {(key: string, button: Element) => void} handlers.onSell «Sell» or «Cancel purchase», by the line's key (not when it is closed)
 * @param {() => void} handlers.onSellKeep «Cancel» in the sale's sheet
 * @param {() => void} handlers.onSellSend the sale's sheet's button: «Sell for …» or «Cancel and get … back»
 * @param {(key: string, button: Element) => void} handlers.onEdit a player's pencil, by his line's key (not when it is closed)
 * @param {(field: "number"|"name", value: string) => void} handlers.onEditField a field of his edit, as typed
 * @param {(on: boolean) => void} handlers.onEditCaptain «Team captain» switched on or off
 * @param {() => void} handlers.onEditKeep «Cancel» in the edit
 * @param {() => void} handlers.onEditSave «Save» in the edit
 * @param {(key: string, button: Element) => void} handlers.onAdvance «Advancement» or «Advance», by the line's key (not when it is closed)
 * @param {(type: string) => void} handlers.onAdvanceType a type of advancement chosen in its sheet
 * @param {(category: string) => void} handlers.onAdvanceCategory a category chosen
 * @param {(name: string) => void} handlers.onAdvanceSkill a skill chosen
 * @param {() => void} handlers.onAdvanceNext a phone's «Next»
 * @param {(id: string) => void} handlers.onSheetBack a sheet's «Back», by the sheet's id
 * @param {() => void} handlers.onAdvanceTake «Take …»
 * @param {() => void} handlers.onAdvanceKeep «Cancel» in a desk's window
 * @param {() => void} handlers.onAdvanceDone «Back to the player» or «Done», once taken
 * @param {(via: string) => void} handlers.onAdvanceVia «Roll on the site» or «Rolled at the table»
 * @param {() => void} handlers.onAdvanceRoll «Roll D16» or «Roll D8»
 * @param {(face: number) => void} handlers.onAdvanceFace a face of the D16 marked or unmarked, or of the D8 pressed, at the table
 * @param {(skill: string) => void} handlers.onAdvancePick a die of a random skill's pair chosen ("" for one not in yet)
 * @param {(stat: string) => void} handlers.onAdvanceStat a characteristic the face allows chosen
 * @param {() => void} handlers.onAdvanceInstead «Take a skill in place of the characteristic»
 * @param {() => void} handlers.onAdvanceStatBack a desk's «‹ Back to the characteristic»
 * @param {() => void} handlers.onAdvanceBind «Record this roll for the advancement … taken at the table»
 * @param {(skill: string) => void} handlers.onFavoured a god's bonus skill chosen on the advancement's done step
 * @param {() => void} handlers.onFavouredAdd «Add …» under done (not when it is closed)
 * @param {(key: string) => void} handlers.onUnadvance the fix's «Undo the last: …», by the line's key (not when it is closed)
 * @param {() => void} handlers.onUnadvanceKeep «Keep» in the undo's sheet
 * @param {() => void} handlers.onUnadvanceSend «Undo advancement» in the undo's sheet
 * @param {(key: string, button: Element) => void} handlers.onFixOpen the edit's line to the fix by hand, by the line's key (not when it is closed)
 * @param {(step: {key: string, delta: 1|-1}) => void} handlers.onFixStep a counter's − or + in the fix (not a refused +)
 * @param {(stat: string) => void} handlers.onFixLasting «Take one off» of a lasting injury
 * @param {(skill: string) => void} handlers.onFixFavoured a favoured skill's «Take off» or «Add …»
 * @param {(skill: string) => void} handlers.onFixDrop a skill no advancement gave, its «Take off»
 * @param {() => void} handlers.onFixKeep «Cancel» in the fix
 * @param {() => void} handlers.onFixSave «Save» in the fix
 * @param {() => void} handlers.onCareerToggle the button of a phone's «Career», which opens and closes its list
 * @returns {() => void} takes every listener off
 */
export function wireRoster(root, handlers) {
  const { onSort, onToggle, onSkill, onSheetClose, onSheetBack, onRetry, onStep, onRefused, onReload, onReread, onOutside, onEditCaptain } = handlers;
  const offs = [
    wireRosterTable(root, { onSort, onToggle }),
    wireSkillChips(root, (name, chip) => {
      const key = lineKeyOf(chip);
      if (key) onSkill(key, name, chip);
    }),
    wireSheets(root, { onClose: onSheetClose, onBack: onSheetBack }),
    wireActionSteppers(root, ({ key, delta, element }) => onStep(element.getAttribute("data-player") ?? "", key, delta), { onRefused: ({ reason }) => onRefused(reason) }),
    delegate(root, "click", "[data-roster-retry]", () => onRetry()),
    delegate(root, "click", "[data-roster-reload]", () => onReload()),
    delegate(root, "click", "[data-roster-reread]", () => onReread()),
    wireToggles(root, (key, on) => {
      if (key === OUTSIDE_TOGGLE) onOutside(on);
      else if (key === CAPTAIN_TOGGLE) onEditCaptain(on);
    }),
    delegate(root, "click", "[data-roster-closed]", (event, button) => onRefused(button.getAttribute("title") ?? "")),
    wireReasons(root, handlers),
    ...wireInjury(root, handlers),
    ...wireMarks(root, handlers),
    ...wireMarket(root, handlers),
    ...wirePlayer(root, handlers),
    ...wireAdvance(root, handlers),
    ...wireFix(root, handlers),
  ];
  return () => offs.forEach((off) => off());
}

/**
 * The ThemePicker: Settings → Appearance. The reader picks a mode (light, dark,
 * or follow the system) and a whole palette for it, not just an accent. Each
 * palette is a card with a live miniature drawn in its own colours, its name and
 * a one-line mood. With "follow the system" two rows are drawn, one palette for
 * each mode, since the site will wear both.
 *
 * This module draws and reports; it does not apply or save anything. A pick
 * arrives at `onChoice` as the whole next choice (nextChoice), and the screen
 * decides what that means (screens/settings/index.mjs paints it and, for a
 * coach who is signed in, writes it to the account).
 *
 * The mode control is a segmented control of its own group (`data-seg-group`
 * "mode"), so the language control beside it is not wired by this module and
 * this one is not wired by the language's.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { PALETTE_KEYS, THEME_MODES, normalizeChoice } from "../../core/theme.mjs";
import { wireRadioGroups } from "../../ui/choice.mjs";
import { dataAttributes } from "../../ui/markup.mjs";
import { renderSegmentedControl, wireSegmentedControls } from "../../ui/segmented-control.mjs";

/** The three modes in the order the control shows them, each with its label and its hint (keys as literals). */
const MODES = [
  { value: "light", label: () => t("theme.mode.light"), hint: () => t("settings.modeHint.light") },
  { value: "dark", label: () => t("theme.mode.dark"), hint: () => t("settings.modeHint.dark") },
  { value: "system", label: () => t("theme.mode.system"), hint: () => t("settings.modeHint.system") },
];

/**
 * The choice a pick leads to; the one it was given is not changed.
 *
 * A new mode keeps both palettes. A card in a fixed mode sets its palette and
 * that mode; in "system" it sets the palette of its own mode and leaves the
 * mode as it is. A mode or a palette that is not on the lists (nor a dark
 * palette for the light mode) changes nothing.
 *
 * @param {import("../../core/theme.mjs").ThemeChoice} choice
 * @param {{mode?: string, palette?: {mode: string, key: string}}} pick
 */
export function nextChoice(choice, { mode, palette } = {}) {
  if (mode !== undefined) return THEME_MODES.includes(mode) ? { ...choice, mode } : { ...choice };
  if (!palette || (palette.mode !== "light" && palette.mode !== "dark") || !PALETTE_KEYS[palette.mode].includes(palette.key)) return { ...choice };
  return { ...choice, mode: choice.mode === "system" ? "system" : palette.mode, [palette.mode]: palette.key };
}

/** The miniature: a header strip with the crest's gold dot, a card with two lines of text and the accent and tint plates. */
const PREVIEW = `<span class="g-palette__bar"><span class="g-palette__crest"></span><span class="g-palette__label"></span></span>`
  + `<span class="g-palette__sheet"><span class="g-palette__line g-palette__line--ink"></span><span class="g-palette__line g-palette__line--muted"></span>`
  + `<span class="g-palette__chips"><span class="g-palette__chip g-palette__chip--accent"></span><span class="g-palette__chip g-palette__chip--tint"></span></span></span>`;

/** A card is a radio of its row. The preview is a picture: a screen reader reads the card as its name and its mood. */
function cardHtml(key, checked) {
  const preview = `<span class="g-palette__preview" aria-hidden="true"${dataAttributes({ palettePreview: key })}>${PREVIEW}</span>`;
  const name = escapeHtml(t(`theme.palette.${key}`));
  const mood = escapeHtml(t(`theme.palette.${key}.mood`));
  const text = `<span class="g-palette__text"><span class="g-palette__name">${name}</span><span class="g-palette__mood">${mood}</span></span>`;
  return `<button type="button" class="g-palette" role="radio" aria-checked="${checked}" tabindex="${checked ? 0 : -1}"${dataAttributes({ paletteKey: key })}>${preview}${text}</button>`;
}

/** The palettes of one mode, named for it only when the other mode's are drawn beside them. */
function rowHtml(mode, choice) {
  const caption = choice.mode !== "system" ? t("settings.palette") : mode === "light" ? t("settings.paletteLight") : t("settings.paletteDark");
  const cards = PALETTE_KEYS[mode].map((key) => cardHtml(key, key === choice[mode])).join("");
  return `<div class="g-theme__row"><span class="g-theme__caption" aria-hidden="true">${escapeHtml(caption)}</span>`
    + `<div class="g-palettes" role="radiogroup" aria-label="${escapeHtml(caption)}"${dataAttributes({ paletteMode: mode })}>${cards}</div></div>`;
}

/**
 * The picker for a choice: the mode, what it means, and the palettes of that mode (both, for "system").
 * @param {import("../../core/theme.mjs").ThemeChoice} choice the choice on the page; a field it lacks is repaired as the page would
 * @returns {string} markup, for the screen's `appearanceHtml`
 */
export function themePickerMarkup(choice) {
  const shown = normalizeChoice(choice);
  const control = renderSegmentedControl({
    label: t("settings.mode"),
    items: MODES.map(({ value, label }) => ({ value, label: label() })),
    selected: shown.mode,
    data: { segGroup: "mode" },
  });
  const hint = MODES.find(({ value }) => value === shown.mode).hint();
  const rows = (shown.mode === "system" ? ["light", "dark"] : [shown.mode]).map((mode) => rowHtml(mode, shown)).join("");
  return `<div class="g-theme">${control}<p class="g-theme__hint">${escapeHtml(hint)}</p>${rows}</div>`;
}

/**
 * Click and arrow keys for the mode control and the cards under `root`.
 * `onChoice` hears the whole next choice, never one that is the choice already
 * on screen (a click on the segment or the card already chosen reports nothing).
 * Drawing the picker again is the caller's: patch it (core/dom.mjs), so the
 * focus stays on the radio that was pressed.
 *
 * @param {Element} root a container that outlives re-renders
 * @param {object} options
 * @param {() => import("../../core/theme.mjs").ThemeChoice} options.current the choice on the page now
 * @param {(choice: import("../../core/theme.mjs").ThemeChoice) => void} options.onChoice
 * @returns {() => void} removes the listeners
 */
export function wireThemePicker(root, { current, onChoice }) {
  const offMode = wireSegmentedControls(root, (mode) => onChoice(nextChoice(current(), { mode })), { group: "mode" });
  const offCards = wireRadioGroups(root, {
    group: ".g-palettes",
    item: "[data-palette-key]",
    attribute: "data-palette-key",
    onChange: (key, row) => onChoice(nextChoice(current(), { palette: { mode: row.getAttribute("data-palette-mode"), key } })),
  });
  return () => {
    offMode();
    offCards();
  };
}

/**
 * The few glyphs the controls draw: strokes on a 24-unit grid that take the
 * colour of the text around them, so a disabled or accented control recolours
 * its icon with no rule of its own. Decorative by construction — a control
 * that is only an icon names itself with an aria-label or hidden text.
 */
import { escapeHtml } from "../core/dom.mjs";

const SHAPES = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

export const ICON_NAMES = Object.keys(SHAPES);

/** An unknown name is a typo in code, not something to draw an empty box for. */
export function icon(name, size = 18) {
  if (!Object.hasOwn(SHAPES, name)) throw new Error(`unknown icon: ${name}`);
  const side = escapeHtml(size);
  return `<svg class="g-icon" width="${side}" height="${side}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SHAPES[name]}</svg>`;
}

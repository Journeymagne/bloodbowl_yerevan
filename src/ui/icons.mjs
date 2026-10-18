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
  // A fault's sign: a ring with the «!» in it, the line and its dot.
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  // The bin of a team that can be deleted (the list of teams).
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  // The shell's: a chevron for the team that can be switched, and one glyph for each place the SideNav leads to.
  down: '<path d="M8 10l4 4 4-4"/>',
  overview: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  roster: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  book: '<path d="M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z"/><path d="M5 21V5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
};

export const ICON_NAMES = Object.keys(SHAPES);

/** An unknown name is a typo in code, not something to draw an empty box for. */
export function icon(name, size = 18) {
  if (!Object.hasOwn(SHAPES, name)) throw new Error(`unknown icon: ${name}`);
  const side = escapeHtml(size);
  return `<svg class="g-icon" width="${side}" height="${side}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SHAPES[name]}</svg>`;
}

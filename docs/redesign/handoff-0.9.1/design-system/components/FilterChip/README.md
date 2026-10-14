# FilterChip

Single-choice filter row above a list (skill category, later: race, position).

**Provide:** options with counts, the selected one.

**Anatomy:** height 36, `radius-full`, padding 0 `space-12`, 14/600, count 12px at 75% opacity. Rest: `surface` with a 1px `control-border` inset ring. Selected: `pitch-900` fill, white text, no ring.

**Layout:** one horizontal row that scrolls (`overflow-x: auto`), gap 6, padding 12 16 10. «Все» first. `role="radiogroup"` / `role="radio"` + `aria-checked`.

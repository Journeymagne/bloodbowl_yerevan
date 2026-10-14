# OptionCard

A full-width choice inside a BottomSheet: advancement type, missed-match reason, stat to improve, skill category.

**Provide:** title, one-line sub (what it gives or why it is unavailable), optional trailing pill (cost) or leading radio dot, selected and disabled state.

**Anatomy:** min-height 64, `radius-xl`, padding `space-10` `space-14`, outline `ring`. Title 16/600, sub 13 `muted`. Pill: min-width 58, `radius-sm`, 14/700 on `surface-3`.

**Selected:** `accent-tint-soft` fill + `ring-selected`; the pill turns `accent`/white; the radio dot fills with a 7px `accent` inset. **Disabled:** stays in the list, text `faint`, sub in `danger` stating the gap («Не хватает 2 SPP»).

**Variants:** category card — 2-column grid, min-height 112, category badge 36 top-left, name 17/700 and «доступно N из 12» bottom-left. Stat choice — min-height 52, `MA 8 → 9 · +30k` with the new value in `accent`.

Stack with gap `space-8`. Only one selected.

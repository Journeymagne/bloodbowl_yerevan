# SegmentedControl

Two views of the same data on one screen (Характеристики / SPP и действия on the roster).

**Provide:** two labels and which is selected. Each segment is a link to its own screen or a tab button.

**Anatomy:** track `surface-3`, `radius-lg`, padding and gap `space-4`. Segment min-height 40px, radius 9px, 15px/600 `ink-2`. Selected: `surface` fill, `shadow-thumb`, 700 `ink`.

**Use** directly under the AppHeader, inside the `space-16` gutter, 14px from the header. Two segments; three at most. The default view goes first.

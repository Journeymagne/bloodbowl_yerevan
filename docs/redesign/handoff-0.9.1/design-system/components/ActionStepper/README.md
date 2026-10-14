# ActionStepper

A − / count / + cell for logging match events (TD, CAS, CP, DEF, INT, MVP) with the SPP each one is worth.

**Provide:** the action label, its SPP value, the current count, increment/decrement handlers and an `aria-label` per button that names the action and the player («Добавить: тачдаун, L. Ashby»).

**Anatomy:** `surface` cell, 1px `line-strong` border, `radius-lg`, padding 3px. Buttons `size-touch`, `radius-md`: minus on `surface-3`, plus on `accent` with white icon. Middle: `col-label` with the value in `accent` (`TD +3`), count 20px/700.

**Layout:** 2 columns, gap `space-8`, inside an expanded RosterTable row. Minus is disabled at 0 (icon `disabled`).

SPP values: TD 3 · CAS 2 · CP 1 · DEF 1 · INT 2 · MVP 4.

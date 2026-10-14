# ListRow

Navigational rows (reference index, leaders) and key–value rows (staff, value increases).

- **Nav row** (`g-list-row`): link, min-height 64, padding 10 0, 1px `line` divider; title `list-title` 21, description 13 `muted`, optional record count 13/700 `accent`, chevron 16 in `faint`. Grouped under an Overline.
- **Key–value** (`g-kv`): min-height 44, 16px, label left, value 600 right.
- **Ranked row** (leaders, results): grid `44px 1fr auto` or `32px 1fr auto` — a short label or ResultPill, name + caption, value 18/700.

Rows run inside the `space-16` gutter (not edge to edge, unlike RosterTable).

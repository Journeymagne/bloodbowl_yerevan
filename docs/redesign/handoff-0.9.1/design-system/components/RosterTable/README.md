# RosterTable

The core list of the site: a sticky sortable header and full-width rows that expand in place. Used for SPP tracking, player characteristics, league standings.

**Provide:** columns (key, short uppercase label, width), rows (number + position, name, second line, values), the sort state, which row is expanded and the panel content.

**Columns:** grid `minmax(0,1fr)` for the identity column, then fixed numeric columns (30px for counters, 36px for stats, 24px for W/D/L, 38–50px for wider values), the total last and right-aligned. Labels `col-label` in `muted`; the sorted column `accent` with ▲/▼ (10px glyph).

**Row:** min-height `size-row`, padding `space-8` `space-16`, 1px `line` divider. Identity = NumberBadge + `row-title` + 13px second line (`muted`; `danger` when it states an injury or missed match). Cells 15px centred; zeros `faint`; improved values `accent` 700; total 17px/700 `accent`.

**Expanded:** the row turns `surface-2` and a `g-tpanel` follows (padding 4 16 14, gap 10): the ActionStepper grid, then a row of secondary actions (dark link-button left, outline button right). One row open at a time.

**Sections:** players who miss the next match go to a second table under H2 «Пропускают матч».

**Variants:** standings — rank column 26px (`accent` for playoff places, a 2px `accent` divider under the last playoff row), own team row on `accent-tint` with a 700 name. Characteristics — no expansion; skills render as SkillChips on a second line indented 46px.

**Don't** put buttons inside the row itself; don't wrap numbers; don't exceed 8 numeric columns at 390px.

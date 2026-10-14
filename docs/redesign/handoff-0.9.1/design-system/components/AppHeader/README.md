# AppHeader

The site header on every screen: crest, team name, one subtitle line and the five section tabs.

**Provide:** team name, subtitle (race · league place, optionally a live figure like `· 87 SPP`), and which tab is current (`aria-current="page"`).

**Anatomy:** `pitch-900` band, padding `space-14` `space-16` 0, stack gap `space-10`. Crest 44×50 centred. Team name `team-name` in `header-ink`; subtitle 15px `header-muted`. Tabs 15px/600 `header-tab`, spread with `justify-content: space-between`, 10px top / 12px bottom padding; current tab `header-ink` with a 3px `header-ink` underline sitting on the band's bottom edge.

**Tabs (fixed order):** Команда · Состав · Матчи · Таблица · Справочник. Player and sub-pages keep the parent tab current (player → Состав, a reference page → Справочник).

**On a profile** the crest row is replaced by the team name in 15px `header-muted`, followed by the entity block (large NumberBadge + `player-name` + caption in `header-muted`).

**Don't:** add back arrows, ellipsis menus or a search icon to the header; put more than one line under the team name.

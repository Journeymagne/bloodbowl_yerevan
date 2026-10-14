# Die

Shows a roll in flows that use the league's tables (random skill 1dN, characteristic D8, casualty D16).

**Provide:** die type («D8», «D16», «D14» — N = number of entries in the table) and the result, or nothing before the roll.

**Anatomy:** 76×76, radius 18; die type 12/600 at 80% opacity over the value 36px `display` 700. Before the roll: `surface-3`, «?» in `faint`. After: `accent`, white.

Below it: one `accent` line with the result, then the whole table (2 columns, numbered) with the hit on `accent`/white and already-owned entries struck through in `faint`. The roll button lives in the sheet footer («Бросить 1D16»), then becomes «Принять: Frenzy».

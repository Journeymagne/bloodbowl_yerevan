# MatchBoard

Desktop header of the Season page: a broadcast-style scoreboard that switches between the season's matches. Never shows TD buttons — scoring happens in the roster.

**Anatomy:** `pitch-900` card, `radius-2xl`. Main row is a 3-column grid: our crest + name + sub (race · place · TV), centre (round · venue overline, 72px score, StatusChip or result), opponent monogram + name (link) + sub, mirrored. InfoBubbles go under the team names / under the status. Bottom bar on `rgba(0,0,0,.2)`: season pager left, actions right.

**Pager:** one 30px square per played match coloured by result (accent win, danger loss, neutral draw, `result-friendly` Т), the current round outlined; the selected one is white. Only played rounds and the current one — the Swiss system pairs the next round after all results are in, so future opponents are never shown.

**Actions by state:** Не начат — «Начать матч» (white) + «Сыграть товарищеский» (outline); Идёт игра — «Завершить матч» + «Состав для игры» + «Отменить начало»; sent — the confirmation note. A past match shows «К текущему матчу →».

# MatchCard

The next / current match on the mobile Матчи tab — the only place on mobile where a match is started and finished. The roster (Состав) stays the in-game screen for SPP.

**States:**
- **Не начат:** meta row, teams, tiles (TV us / them; inducements tile — `--gets` when we receive, `--pays` when the opponent does, neutral when equal; tap opens PreMatch), «Пропускает: J. Corr · …» line (tap opens PreMatch), full-width primary «Начать матч». Below the card, an outline «Товарищеский матч» switches the card to a friendly with an opponent select and «← Вернуться к туру N».
- **Идёт игра:** title «Текущий матч» + live StatusChip, `--live` ring, link-card «Состав для игры», dark «Завершить матч» (opens the ResultSheet), text «Отменить начало».
- **Отправлен:** score between the names, warn note «Ждёт подтверждения», the result added on top of «Результаты».

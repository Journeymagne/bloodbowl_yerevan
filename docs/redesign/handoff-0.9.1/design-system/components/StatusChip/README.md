# StatusChip

The state of the current match, everywhere the match appears (MatchCard, MatchBoard, SideNav card).

**States:** «Не начат» (neutral), «Идёт игра» (`live`, accent dot), «Ждёт подтверждения» (`wait`, warn dot) for a league result sent to the opponent; a friendly result reads «Сохранён». On `pitch-900` use `--on-dark`; the live dot becomes `live`.

**Lifecycle:** Не начат → «Начать матч» → Идёт игра → «Завершить матч» opens the ResultSheet → Ждёт подтверждения. «Отменить начало» returns to Не начат.

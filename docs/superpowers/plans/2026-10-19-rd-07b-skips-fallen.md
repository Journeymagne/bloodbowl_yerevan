# Этап 07b · Состав: пропуски и павшие — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Состав» 3.0 (`#/t/:id/roster`) получает «Пропуск матча…» с причиной из `INJURIES` и «Вернуть в состав», отметку гибели с причиной, секции «Пропускают матч» и «Погибшие», а погибший — профиль с «Отменить отметку» и подтверждением (только у ручной отметки): на десктопе в правой панели, на телефоне по адресу игрока.

**Architecture:** пропуск и возврат — изменение блоба одного игрока (`skipNextGame`, `absence`, последствия травмы — чистый `src/domain/roster/absence.mjs`), и уходят тем же `PATCH` через очередь 07a (`save.mjs`), со всеми её правилами (ревизия, потерянный ответ через 409 со своим составом, нет сети, конфликт, R8). Гибель и её отмена — маршруты этапа 03 (`POST …/players/:pid/death`, `DELETE …/fallen/:fid`, новый модуль `fallen.mjs`), только когда очередь пуста; потерянный ответ не отправляется второй раз — команда, записи и погибшие читаются заново. Погибшие читаются вместе с командой и записями (`readSnapshot`) и рисуются строками той же модели (`fallenLines`) во второй и третьей таблице `RosterTable`. Профиль погибшего на телефоне — маршрут `teamPlayer`, который до 07d для игроков состава по-прежнему рисует редактор 2.x.

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/fake-dom.mjs`, `fake-api.mjs`, `ui.mjs`, `contrast.mjs`, `ref-screen.mjs`; CSS custom properties; нативный `<dialog>`; `npm run screens`, `scripts/mock-api.mjs`.

**Spec:**
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0 (п. 1, 8, 11, 12, 13), §2 (таблица «До своего этапа», `#/t/:teamId/roster[/:playerId]`), §3.3 целиком, §4 (`GET …/fallen`, `POST …/death`, `DELETE …/fallen/:fid`, «Ошибки тела запроса»), §6 (строка «Состав …»), §7 («Расхождения этапа 07a» — 07b дописывает свои).
- Спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §0 («Общие правила»), §6 (строка «В таблице все игроки состава…» меняет 07b), §7 (что закрыто в матче), §8, §9 целиком, «Известные расхождения».
- Мастер-план `docs/superpowers/plans/2026-10-14-redesign-rollout.md`: Global Constraints, протокол этапа (шаги 1–10), строка 07a–07e (smoke: `smoke`, `smoke:post-match`), «Дополнения к этапам → 07a–07e» («Из 03, 07b: `GET`/`DELETE …/fallen`; отмену не показывать при `fromMatch`») и блок «05–13».
- План 3.0 `docs/superpowers/plans/2026-10-14-redesign.md`: этап 7, пункт 7b.
- Handoff `docs/redesign/handoff-0.9.1/`: `SCREENS.md` (флоу «Состав · Пропуски и погибшие»); прототипы `mobile/StatsInjured.html`, `StatsMng.html`, `StatsMngDead.html`, `PlayerDead.html`, `PlayerDeadConfirm.html`, `desktop/DeskRosterInjured.html`, `DeskRosterDeath.html`; `design-system/` (RosterTable, OptionCard, BottomSheet, NumberBadge), `PR-CHECKLIST.md`.
- План 07a `docs/superpowers/plans/2026-10-19-rd-07a-roster-table.md` (решения 1–25, «Передача следующим этапам → 07b»), его тело PR и финальное ревью (передача, правила R1–R18 очереди и тапов), передачи 06, 08, 11.
- Контракт этапа 03 — код: `server/routes/team-fallen.mjs`, `server/api/serializers.mjs` (`publicFallen`), `src/domain/roster/transfers.mjs` (`removeFallenPlayer`, `returnFallenPlayer`), `src/domain/roster/schema.mjs` (`ABSENCE_CODES`, `normalizeAbsence`), `src/domain/post-match/roster.mjs` (`applyInjury`).

## Global Constraints

- Ветка `rd/07b-skips-fallen` от `origin/redesign` `6f9059a` (этапы 06, 11, 08 и 07a влиты), worktree `/Users/felstell/git/bb-rd-07b`. PR в `redesign` по протоколу мастер-плана, шаги 6–10; в задачах ничего не пушить. Окружение тестов — `output/07b/env.sh` (`GATA_TEST_DATABASE_URL` — только сервер, тесты БД создают свои `gata_test_*`; `SMOKE_URL` → `gata_smoke_07b`).
- **Параллельного этапа нет.** Следом идёт 07c на этом же экране (найм и продажа). Швы, которые 07b оставляет ему и не занимает: ряд действий `.g-roster__actions` (`actionsMarkup` в `panel.mjs` — «Продать» встаёт рядом с «Пропуском матча…»), слот `headLeadHtml` первой таблицы (`layoutMarkup` — «+» найма), очередь `save.mjs` (запись строки игрока — по образцу `markSkip`), подсчёт снятых в матче правок (`reloadRoster`, R8). 07b не трогает ни одной продажи, найма и персонала.
- **Серверы этапа:** реальный сервер на порту **3072** над `gata_smoke_07b`, mock API с `MOCK_PORT=5172`. Никогда `gata_league` для данных; никогда общие 3002 и 5173–5176.
- **Сервер не меняется, миграций нет.** `team_fallen_players` есть с `011`/`015`, `016` применена и заморожена; маршруты погибших — этапа 03. Если в ходе работы миграция покажется неизбежной — стоп-условие, вопрос контроллеру.
- **Инварианты «Состава» 07a (R1–R18), которые 07b держит:**
  - во время матча ни одна запись состава не уходит (R8): ни `PATCH`, ни гибель, ни отмена; отметка, ждавшая сети, когда начался матч, снимается и тренеру говорится, сколько;
  - команда берётся только вместе с играми после неё (`readWithGames`), пока чтение в воздухе — всё закрыто (`lockOf`);
  - `PATCH` чей ответ потерян узнаётся по 409 со своим составом (`landedTeam`), конфликт решает тренер («Загрузить новую»), 422 берёт состав сервера;
  - потерянный ответ не отправляется второй раз — перечитывается;
  - каждая запись в аккаунт сначала спрашивает `sessionTokenHolds()` и при чужом токене ничего не шлёт (этап 05, R12);
  - очередь тапов матча (`taps.mjs`, `match-taps.mjs`) и шторка травмы (R14) не меняются.
- **Общие файлы и куски 07b в них** (минимальные, аддитивные):
  - `src/ui/roster-table.mjs` — проп `foot` (по умолчанию `true`); `src/ui/number-badge.mjs`/`.css` — проп `fallen`;
  - `src/domain/roster/schema.mjs` — `export` у `ABSENCE_NOTE_MAX`; `src/domain/post-match/roster.mjs` — `applyInjury` зовёт `applyInjuryEffects` (поведение то же);
  - `src/core/router.mjs` — импорт и строка `teamPlayer:`; `src/styles.css` — один `@import` в конце;
  - `scripts/mock/roster.mjs` — вызов `answerFallen` первым; `scripts/mock-api.mjs` — два игрока `t1` меняются **на месте**, без новых строк (файл 599/600);
  - словари — ключи только в `teamRoster.mark.*`, `teamRoster.skips.*`, `teamRoster.fallen.*`.
- **Файлы на пределе:** `src/screens/team/roster/index.mjs` (558), `roster.css` (554), `scripts/mock-api.mjs` (599). В `roster.css` 07b не добавляет ничего: новый CSS — `src/screens/team/roster/marks.css`. Если `index.mjs` переходит 600 — `focusPlace` и `restoreFocus` переезжают как есть в `src/screens/team/roster/focus.mjs`.
- **Редактор 2.x не меняется** (`src/screens/saved-roster.mjs`, `src/components/roster-editor/*`, `roster-editor-shared.mjs`, `roster-notices.mjs`): им рисуются `teamPlayer` для игроков состава (до 07d) и `adminTeamEdit` (до 12).
- Vanilla ES-модули, хешевый роутер; без фреймворка, сборщика, TypeScript и новых зависимостей.
- CSP: ни inline JS, ни `style="…"`, ни `on…=`.
- Каждая строка интерфейса — через `t("key")`; новые ключи — в обоих словарях, в пространствах выше, без дублей. Ключ из шаблонной строки получает тест, перебирающий все значения (07b новых шаблонных ключей не заводит: причины берут `teamRoster.injury.${code}` и `teamRoster.injuryCaption.${code}` 07a, их перебирает тест 07a).
- `escapeHtml` на каждую интерполяцию; пропс `…Html` — только разметка другой функции `render…()`/`…Markup()`.
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 на функцию, 0 недостижимых функций, `src/app.js` ≤ 120 (этап его не трогает). Бюджеты только уменьшаются.
- Ловушка `scripts/check-references.mjs`: ключ объекта, равный экспорту проекта плюс одна буква, ломает `npm run check` (`td:`, `th:`, `tr:`, `to:` от `t`; `states:`, `views:`, `icons:`). Ключи 07b (`fallen`, `skipping`, `active`, `cause`, `note`, `foot`, `retired`, `absence`) проверены — не совпадают; новый экспорт не должен быть ключом объекта без последней буквы.
- Брейкпоинты только `max-width: 900px` / `min-width: 901px`. Нажимаемое — от 44px. Кольцо фокуса — из `src/ui/base.css`; `--focus-ring` не использовать. Новый CSS задаёт шрифт, рамку, фон, `text-transform`, `letter-spacing` и `font-weight` явно (правила 2.x живут до этапа 13). Новый `.css` — `@import` в конце `src/styles.css`.
- `content/` не меняется. Правила и числа — из `src/domain/**` и `content/Gata/**`, вид — из прототипов; расхождение макета с кодом правится по коду без вопроса (§0.1, §0.12); контент против кода — стоп.
- Тесты: сначала `npm run build` (тесты читают `public/data.*.json`); затем `. output/07b/env.sh && npm test`, `npm run check`, `npm run i18n:check`. Каждый PR: одинаковое число страниц EN/RU, 0 fallback; `npm run smoke` и `npm run smoke:post-match` на сервере 3072.
- Новые тесты экрана — в новых файлах (`test/team-roster-skips.test.mjs`, `test/team-player.test.mjs`): `test/team-roster.test.mjs` уже 2314 строк (финальное ревью 07a: «split when 07b adds to it»); в нём 07b правит только то, что ломает перенос пропускающих в свою секцию (Task 6).
- Комментарии в коде — по-английски, в тоне соседних файлов; ответы владельцу — по-русски.
- Каждая задача — один коммит с тестами; сообщение коммита заканчивается вторым `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Стоп-условия:** контент и код расходятся в правиле; нужно продуктовое решение вне спек и этого плана; нужна правка сервера, миграция или файла редактора 2.x. Остановиться и спросить контроллера.

## Review Focus

1. **Ответ на гибель или отмену потерян.** Ожидание: второй раз ничего не уходит; шторка закрывается, команда, записи и погибшие читаются заново, и тренеру говорится то, что держит сервер. Повторное нажатие после такого ответа безопасно: гибель с прежней ревизией получает 409, отмена по id записи — 404. Тесты:
   - Task 4: «a death whose answer was lost is not sent again; nor is an undo»;
   - Task 8: «a death whose answer was lost: the sheet closes, the roster and the fallen are read, and the coach is told what the server holds»;
   - Task 9: «an undo whose answer was lost is not sent again: the roster is read back and the coach told».
2. **Гибель или отмена, пока шаги очереди ждут сети или в пути.** Без условия наша же запись сдвинула бы ревизию под ждущим шагом, и тренер увидел бы «другое устройство». Ожидание: кнопка закрыта словами «Сначала дождитесь сохранения правок», ничего не уходит. Тесты: Task 8 «while steps of the roster wait or one is in the air, no death is sent and the button says why»; Task 9 «in a match, while steps wait, or before the games are read, the undo says why and sends nothing».
3. **Матч начался, пока шторка открыта или отметка ждёт сети.** Ожидание: шторка закрывается, фокус — на строку игрока; ждавшая отметка снимается со словами, сколько (R8). Тесты: Task 7 «a sheet whose match began closes, and the focus goes back to the row»; «a mark that waited for the network is given up when a match begins, and the coach is told how many».
4. **Данные, которые трудно нарисовать.** Пропуск 2.x без причины; временный уход до конца сезона; запись погибшего без `rowIndex` или с позицией, которой у расы нет (форма админа этапа 12 `{name, position, number}`); причина `null` (перенос `015`); погибший, чей id есть в прочитанном составе; разметка в причине. Ожидание: ни исключения, ни `undefined`, одно место на игрока, текст как текст. Тесты: Task 2 «a fallen record the roster cannot read is a line all the same», «a fallen player who is on the roster as read is drawn once, on the roster»; Task 6 «a reason in words under a name…», «the cause and the note are text».
5. **Отмену отклонили правила или запись.** Состав уже из 14, `FALLEN_NOT_RESTORABLE`, гибель из матча. Ожидание: отказ сказан в шторке, ничего не изменилось; у гибели из матча кнопки нет вовсе. Тесты: Task 9 «an undo the rules refuse is said in the sheet, and nothing changes»; Task 6 «a death the post-match recorded says the administrator corrects it, and offers no undo».

## Решения этого плана

Источники оставили их открытыми; план принимает их так (контроллер подтверждает до исполнения).

**Как идёт каждая запись**

| Действие | Запрос | Когда закрыто | Потерянный ответ |
|---|---|---|---|
| «Пропуск матча…» (кроме «Смерти») | `PATCH /api/teams/:id` через очередь 07a: `skipNextGame`, `absence`, последствия травмы | матч; замок `lockOf`; нет id; чужой токен | как шаг SPP: ждёт («Ждёт сети»), повтор узнаётся по 409 со своим составом (`landedTeam`) |
| «Вернуть в состав» | то же: `skipNextGame: false`, `absence: null` | то же; временный уход до конца сезона | то же |
| Отметка гибели | `POST /api/teams/:id/players/:pid/death {cause, revision}` | то же; шаги очереди ждут или в пути | не повторяется: шторка закрывается, всё читается заново, тренеру — что на сервере |
| «Отменить отметку» | `DELETE /api/teams/:id/fallen/:fid` | то же; гибель из матча (кнопки нет) | то же |

1. **Пропуск — одно сохранение состава через очередь 07a.** «Пропуск матча…» ставит `skipNextGame: true` и `absence` (`{code}`, у стойкой травмы `{code, stat}`, у другой причины `{code: "other", note}`), а тяжёлое повреждение и стойкая травма делают с игроком то же, что итоги матча: Niggling Injury +1, −1 к характеристике в `statMods` и `injuryStatMods` (`applyInjuryEffects`, одно правило для итогов и отметки; вопрос владельцу 1). Шаг рисуется сразу из черновика очереди — игрок тут же переходит в «Пропускают матч», — и живёт по правилам очереди 07a: ждёт сети со статусом, потерянный ответ узнаётся по 409, конфликт — «Загрузить новую», 422 — состав сервера.
2. **«Вернуть в состав» — то же сохранение,** `skipNextGame: false`, `absence: null` (спека 3.0 §3.3). Последствия травмы остаются: возврат значит «пропуск отбыт», а не «отмечено по ошибке»; шторка при тяжёлом повреждении и стойкой травме говорит это до отметки. Игрок во временном уходе до конца сезона (`temporarilyRetired`, ставят итоги) не возвращается: кнопка закрыта с причиной (вопрос владельцу 2) — нормализация состава всё равно держала бы его пропускающим.
3. **Отметка гибели — маршрут этапа 03,** не очередь: ревизия — та, на которой стоит очередь (`savedRevision`). Уходит, только когда у очереди ничего не ждёт и ничего нет в пути; иначе кнопка закрыта словами «Сначала дождитесь сохранения правок». Одна запись погибших в пути на команду.
4. **Отмена — `DELETE`** без ревизии (сервер берёт блокировку команды), с тем же условием очереди. Только у ручной отметки (`fromMatch: false`; мастер-план: «отмену не показывать при `fromMatch`»); у гибели из матча — строка «её исправляет админ лиги».
5. **Потерянный ответ гибели или отмены не отправляется второй раз:** шторка закрывается, команда, записи и погибшие читаются заново (`readAgain`), и тренеру говорится, что держит сервер: «гибель отмечена» / «гибели на сервере нет — отметьте ещё раз» (у отмены — «снова в составе» / «отметка осталась»). Повторное нажатие безопасно и само: гибель с прежней ревизией после прошедшей первой — 409, отмена по id записи — 404 `FALLEN_NOT_FOUND`.
6. **Ответы.** Успех гибели и отмены — команда ответа кладётся в очередь (`takeServerTeam`), затем на своё место в список тренера (`takeAnswerTeam`: сначала очередь, чтобы `listAhead` полосы 08 не принял нашу запись за чужую и не перечитал команду). 409 гибели (`TEAM_SAVED_ELSEWHERE`) — состав сервера берётся (`reloadRoster`), шторка остаётся открытой со словами «Состав изменили на другом устройстве, он перечитан. Гибель не отмечена: нажмите ещё раз.» (игрок, которого в составе больше нет, закрывает её). Остальные отказы (`FIELD_INVALID`, `PLAYER_NOT_FOUND`, `DUPLICATE_PLAYER_ID`, 422 правил, `FALLEN_NOT_RESTORABLE`, `FALLEN_FROM_MATCH`) — словами сервера в шторке, она остаётся; `PLAYER_NOT_FOUND` и `FALLEN_NOT_FOUND` ещё и перечитывают состав.
7. **Во время матча** «Пропуск матча…» и «Вернуть в состав» не рисуются (их место — «Травма в матче…», передача 07a), «Отменить отметку» закрыта с причиной «Пропуски и гибель — после итогов матча» (§0.11: запись состава в матче ломает `finishPost`). Пока игры не прочитаны, читается состав или не решён конфликт — замок счётчиков 07a (`lockOf`). Во время подготовки всё открыто, плашка 07a предупреждает о сбросе шагов.
8. **Отметка, ждавшая сети, когда начался матч,** снимается вместе с шагами SPP (R8): `reloadRoster` считает и отметки (`markEdits`) и говорит о них своим сообщением «…отметки пропуска не сохранены (N). Повторите их после итогов матча».
9. Чужой токен — ни одна из четырёх записей не уходит, тренеру `auth.otherTab`.

**Шторка «Пропуск следующего матча»** (`StatsMng`, `StatsMngDead`)

10. Причины — `INJURIES` без `none` и `badly-hurt` (они не дают пропуска) и «Другая причина»: Серьёзная травма, Тяжёлое повреждение, Стойкая травма (+ чипы MA ST AG PA AR «Какая характеристика снижается»), Смерть (+ поле «Причина гибели»), Другая причина (+ поле «Причина»). Названия и подписи — ключи 07a (`teamRoster.injury.*`, `teamRoster.injuryCaption.*`), без «Casualty 9–10» макета (таблица D16 — контент, шторка травмы 07a её не повторяет). Кнопка одна и говорит, чего ждёт: «Выберите причину», «Выберите характеристику», «Напишите причину гибели», «Напишите причину», «Не длиннее 500 знаков», затем «Отметить пропуск» / «Отметить гибель» — основная, не красная: отметку можно отменить (§0).
11. Текст причины — одна строка `renderTextField` (многострочного поля в `src/ui` нет), до 500 знаков, как держат сервер (`MAX_CAUSE_LENGTH`) и схема (`ABSENCE_NOTE_MAX`), и считается так же, как сервер: `text.trim().length`.
12. **Гибель пропускающего** — не из его строки: у пропускающего «Вернуть в состав», затем «Пропуск матча… → Смерть» (вопрос владельцу 4). Второй пропуск поверх первого не ставится: повторная тяжёлая травма прибавила бы ещё одну Niggling Injury.

**Где что стоит** (`StatsInjured`, `DeskRosterInjured`, `PlayerDead`, `PlayerDeadConfirm`)

13. **Секции — второй и третий `renderRosterTable`** под «Активным составом» (передача 07a), каждая со своим `h2` и `label`: «Пропускают матч N» и «Погибшие N»; пустая секция не рисуется. «Активный состав N» считает играющих; строка подсчётов полосы — как в 07a (все игроки состава). Нижняя шапка — только у последней таблицы (`foot`). Сортировка одна на три таблицы (`memory.sort`); без неё погибшие идут, как их отдаёт сервер, свежие первыми. Активный состав без игроков, когда пропускают все, — строка «Все игроки состава пропускают следующий матч».
14. **Строка пропускающего:** под именем красным — причина: «Серьёзная травма», «Тяжёлое повреждение», «Стойкая травма (MA)» (слова травмы 07a, `injuryWords`), текст другой причины, «Временный уход до конца сезона»; без причины (галочка 2.x) — «Пропускает следующий матч», как в 07a.
15. **Строка погибшего:** серый номер (`fallen` у NumberBadge), серые числа, под именем «Погиб · <причина>» (без причины — «Погиб»). Счётчиков, раскрытой правки и действий у неё нет; чип навыка открывает правило, как у всех.
16. **Телефон, раскрытая строка:** у играющего под «Профиль и прокачка» — ряд действий `.g-roster__actions` с «Пропуском матча…» (07c поставит рядом «Продать»); у пропускающего — «Вернуть в состав»; у погибшего — «Причина гибели», причина, «Карьера: N SPP · отмечено вручную · <дата>», «Профиль игрока» и «Отменить отметку можно в профиле» (у гибели из матча — строка про админа вместо подсказки).
17. **Десктоп, панель:** тот же ряд действий под «Следующий матч: …» (у пропускающего — «пропускает · <причина>»). Выбранный погибший стоит в панели профилем (§9: «правая панель и есть профиль»): серый номер 60px, имя, «<позиция> · <раса> · погиб», StatStrip серым, «Погиб» и когда, причина, «Отменить отметку» с подсказкой, «Карьера: N SPP», навыки карточками, «Погибший игрок не выходит на матчи…». После гибели в панели — он, погибший; после отмены — он, снова в составе.
18. **Когда погиб:** ручная отметка — «отмечено вручную · 19 окт» (у ручной отметки нет пары, поэтому не «после тура N» макета — вопрос владельцу 3); из матча — «в матче · тур N · 19 окт», у товарищеского — «в матче · 19 окт».
19. **Профиль погибшего на телефоне — адрес игрока** `#/t/:id/roster/:playerId`. Маршрут `teamPlayer` рисует `renderTeamPlayer`: игрок есть в составе команды из списка тренера — редактор 2.x, как до 07b (до 07d); иначе читаются погибшие, и игрок среди них — его профиль 3.0; ни там ни там — редактор 2.x, как раньше. Страница — под шапкой команды (шапка игрока `PlayerDead` — профиль 07d), видимый `h1` — имя; «Отменить отметку» → шторка → «S. Pike снова в составе» и «К составу». На десктопе «Состав» сюда не ведёт (панель), но адрес работает и там.
20. **Шторка «Отменить отметку?»** — текст макета, «Оставить» (с обводкой, рядом) и «Вернуть в состав» (основная, не красная: возврат обратим новой отметкой); во время подготовки — ещё предложение 07a о сбросе шагов (`prepResetWords`).

**Данные**

21. **Погибшие читаются вместе с командой и записями:** `readSnapshot` — `readRoster` 07a и `GET …/fallen` рядом, и каждое перечитывание экрана (`readWithGames`) идёт через него; отказ любого — отказ чтения («Повторить»). Ревизии у списка погибших нет: запись, чей игрок есть в прочитанном составе, не рисуется — одно место на игрока, если гибель или отмена легла между двумя чтениями; следующее чтение её поправит.
22. **Редактор 2.x не меняется:** его галочка «Пропуск» ставит `skipNextGame` без причины (решение 14), им ещё пользуются `teamPlayer` для игроков состава и `adminTeamEdit`.
23. **Сервер и миграции не меняются** (Global Constraints).

## Вопросы владельцу

План не ждёт ответа: исполняется вариант по умолчанию, ответ «нет» снимает отмеченный шаг.

1. **Последствия травмы при ручной отметке.** Спека 3.0 §3.3 говорит, что «Пропуск матча…» ставит `skipNextGame` и `absence`; спецификация интерфейса §9 («Niggling Injury и пропуск», «−1 к характеристике и пропуск»), макеты `StatsMng` («Какая характеристика снижается») и `StatsInjured` (MA 5 вместо 6) и `Casualties.md` описывают и последствия.
   - **По умолчанию** — отметка делает то же, что итоги матча: Niggling Injury +1, −1 к характеристике (`applyInjuryEffects`, Task 1); «Вернуть в состав» их не снимает, шторка говорит это заранее. Ошибку стойкой травмы правят в редакторе 2.x (характеристики ±) до 07d.
   - **Альтернатива** — только `skipNextGame` и `absence`: Task 1 убирает вызов `applyInjuryEffects` из `markAbsence`, тесты последствий переворачиваются, строка `teamRoster.mark.effectsStay` уходит.
2. **Временный уход до конца сезона** (`temporarilyRetired`, ставят итоги при стойкой травме; снимать его в коде сейчас некому).
   - **По умолчанию** — «Вернуть в состав» закрыта с причиной «Временный уход до конца сезона: здесь его не вернуть».
   - **Альтернатива** — возврат снимает и уход (`clearAbsence` ставит `temporarilyRetired: false`; Task 1 и Task 3, одно поле).
3. **«После тура N» у ручной отметки** (`PlayerDead`).
   - **По умолчанию** — дата: «отмечено вручную · 19 окт»; ручная гибель пары не хранит (`POST …/death` её не принимает).
   - **Альтернатива** — тур вычисляется по играм тренера (последний завершённый тур до `diedAt`); Task 6, одна функция и тест.
4. **Гибель пропускающего.**
   - **По умолчанию** — в два шага: «Вернуть в состав», затем «Пропуск матча… → Смерть».
   - **Альтернатива** — у пропускающего рядом с «Вернуть в состав» ещё «Отметить гибель…»: та же шторка с одной карточкой «Смерть» (Task 8).

## Файлы

| Файл | Задача | Что |
|---|---|---|
| `src/domain/roster/absence.mjs` (новый), `schema.mjs`, `src/domain/post-match/roster.mjs`, `test/roster-absence.test.mjs` | 1 | отметка, возврат, последствия травмы, подсчёт отметок |
| `src/screens/team/roster/model.mjs`, `test/team-roster-model.test.mjs` | 2 | причина в строке, секции, погибшие строками |
| `src/screens/team/roster/save.mjs`, `test/team-roster-data.test.mjs` | 3 | `markSkip`, `unmarkSkip`, `takeAnswerTeam` |
| `src/screens/team/roster/fallen.mjs` (новый), `data.mjs`, `test/team-roster-fallen.test.mjs` (новый) | 4 | чтение погибших, гибель, отмена, `readSnapshot` |
| `src/ui/roster-table.mjs`, `src/ui/number-badge.*`, `test/ui-roster-table.test.mjs`, `test/ui-player.test.mjs` | 5 | `foot`, серый номер |
| `src/screens/team/roster/{index,view,panel}.mjs`, `fallen-view.mjs` (новый), `marks.css` (новый), `src/styles.css`, `test/team-roster-skips.test.mjs` (новый), `test/team-roster.test.mjs`, `test/app-boot-roster.test.mjs` | 6 | секции и погибшие на экране |
| `mark-sheet.mjs`, `marks.mjs` (новые), `panel.mjs`, `sheets.mjs`, `injury.mjs`, `wire.mjs`, `index.mjs`, `view.mjs`, `marks.css` | 7 | «Пропуск матча…», шторка, «Вернуть в состав» |
| `mark-sheet.mjs`, `marks.mjs`, `index.mjs` | 8 | отметка гибели |
| `fallen-view.mjs`, `marks.mjs`, `view.mjs`, `wire.mjs` | 9 | «Отменить отметку» на десктопе |
| `src/screens/team/player/index.mjs` (новый), `src/core/router.mjs`, `marks.css`, `test/team-player.test.mjs` (новый), `test/team-roster.test.mjs`, `test/app-boot-roster.test.mjs` | 10 | профиль погибшего по адресу игрока |
| `scripts/mock/fallen.mjs` (новый), `scripts/mock/roster.mjs`, `scripts/mock-api.mjs` | 11 | mock для снимков |
| `docs/redesign/screens/rd-07b.json` | 12 | снимки (контроллер) |
| спеки, план 3.0 | 13, 14 | проверки, правки спек, PR (контроллер) |

Каталог экрана — `src/screens/team/roster/` (ниже без префикса). Новые `.css`: одна строка `@import url("screens/team/roster/marks.css");` в конце `src/styles.css`.

## Маршруты этапа 07b

| Имя | Адрес | До 07b | После 07b |
|---|---|---|---|
| `teamRoster` | `#/t/:teamId/roster` | «Состав» 3.0 07a | + секции, пропуски, гибель, отмена в панели |
| `teamPlayer` | `#/t/:teamId/roster/:playerId` | редактор 2.x | `renderTeamPlayer`: игрок состава — редактор 2.x (до 07d); погибший команды — профиль погибшего 3.0 (Task 10) |
| `adminTeamEdit` | админский адрес | редактор 2.x | без изменений (этап 12) |

`src/core/routes.mjs` не меняется.

## Рецепты проверки

Команды — из `/Users/felstell/git/bb-rd-07b`; каждый вызов Bash — новая оболочка, переменные — из `output/07b/env.sh`.

**Т — тесты:** `npm run build && node --test <файлы>`; полный прогон — `npm run build && . output/07b/env.sh && npm test && npm run check && npm run i18n:check`.

**С — сервер 3072 и smoke** (Task 12, 13):

```bash
. output/07b/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_07b 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/07b/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3072 node server/server.mjs`; дождаться `curl -fsS http://localhost:3072/api/health` (Monitor с until-циклом). Затем:

```bash
APP_URL=http://localhost:3072 npm run smoke
. output/07b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3072 npm run smoke:post-match
```

Expected: каждый скрипт печатает свою строку `… passed …`.

---

### Task 1: Домен — отметка пропуска, возврат, последствия травмы

Одно правило «что травма делает с игроком» для итогов матча и для ручной отметки (решение 1); итоги ведут себя как раньше.

**Files:**
- Create: `src/domain/roster/absence.mjs`
- Modify: `src/domain/roster/schema.mjs` (`const ABSENCE_NOTE_MAX` → `export const`), `src/domain/post-match/roster.mjs` (`applyInjury`, строки 23–32)
- Test: `test/roster-absence.test.mjs` (добавить)

**Interfaces:**
- Consumes: `ABSENCE_CODES`, `normalizeAbsence` (`schema.mjs`); `storedPlayerId` (`players.mjs`); `PLAYER_STATS` (`values.mjs`).
- Produces (`src/domain/roster/absence.mjs`, чистый модуль):
  - `applyInjuryEffects(player, {code, stat}) → void` — меняет `player` на месте, как `applyInjury` итогов сейчас: `niggling` — `nigglingInjuries = Number(player.nigglingInjuries ?? (player.niglingInjury ? 1 : 0)) + 1`, `niglingInjury = true`; `lasting` со `stat` из `PLAYER_STATS` — `statMods[stat] − 1` и `injuryStatMods[stat] − 1` (оба объекта создаются, если их нет); остальные коды — ничего.
  - `markAbsence(player, {code, stat?, note?}) → object` — новый объект игрока (вход не меняется): `structuredClone`, `applyInjuryEffects`, `skipNextGame: true`, `absence: normalizeAbsence({code, stat: code === "lasting" ? stat : undefined, note: code === "other" ? note : undefined})`. Бросает `Error` на код вне `ABSENCE_CODES`, `lasting` без характеристики, `other` без непустой `note` — это ошибка вызывающего, экран проверяет раньше.
  - `clearAbsence(player) → object` — копия с `skipNextGame: false`, `absence: null`; Niggling Injury, характеристики и `temporarilyRetired` не трогает.
  - `markEdits(before, after) → number` — сколько игроков `after` (по `storedPlayerId`) пропускают или не пропускают иначе, чем тот же id в `before` (`skipNextGame || temporarilyRetired`), или с другой `normalizeAbsence`; игрок, которого в `before` нет, не считается.
- Produces (`schema.mjs`): `export const ABSENCE_NOTE_MAX = 500` (значение не меняется).
- `post-match/roster.mjs`: в `applyInjury` ветки `niggling` и `lasting` заменяются вызовом `applyInjuryEffects(player, injury)` и строкой `if (injury.code === 'lasting' && injury.retire) player.temporarilyRetired = true;`.

- [ ] **Step 1: Падающие тесты** — в `test/roster-absence.test.mjs` (строки Human из `public/data.en.json`, как в файле):

```js
test("a coach's mark: the reason, the missed match, and what the injury does — a Niggling Injury, a characteristic down", () => {
  const player = { id: "p1", rowIndex: 2, statMods: { ag: 1 }, skipNextGame: false, niglingInjury: false, nigglingInjuries: 0, absence: null };
  assert.deepEqual(pick(markAbsence(player, { code: "miss" })), { skipNextGame: true, absence: { code: "miss" }, nigglingInjuries: 0, statMods: { ag: 1 } });
  assert.deepEqual(pick(markAbsence(player, { code: "niggling" })), { skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, statMods: { ag: 1 } });
  const lasting = markAbsence(player, { code: "lasting", stat: "ag" });
  assert.deepEqual([lasting.statMods.ag, lasting.injuryStatMods.ag, lasting.absence], [0, -1, { code: "lasting", stat: "ag" }]);
  assert.deepEqual(markAbsence(player, { code: "other", note: "  Banned  " }).absence, { code: "other", note: "Banned" });
  assert.deepEqual(player.statMods, { ag: 1 }, "what was marked is a copy");
});
```

  (`pick` — локальный помощник теста: `skipNextGame`, `absence`, `nigglingInjuries`, `statMods`.) Ещё тесты:
  - «a 2.x player with a Niggling Injury and no count gets his second»: `{niglingInjury: true}` без `nigglingInjuries` → `nigglingInjuries` 2.
  - «a mark that is not whole is the caller's bug»: `assert.throws` для `{code: "dead"}`, `{code: "lasting"}`, `{code: "other", note: "  "}`.
  - «back on the roster ends the missed match and its reason, and keeps what the injury did»: `clearAbsence(markAbsence(player, {code: "lasting", stat: "ag"}))` → `skipNextGame` false, `absence` null, `statMods.ag` 0, `injuryStatMods.ag` −1; `temporarilyRetired: true` остаётся `true`.
  - «the marks two rosters differ by»: до — `[p1 skip niggling, p2 plays, p3 plays]`, после — `[p1 plays, p2 skip miss, p3 plays, p4 skip]` → 2; `[]` и `null` → 0.
  - «the cap of a reason is the schema's»: `ABSENCE_NOTE_MAX === 500`.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/roster-absence.test.mjs` → FAIL (нет модуля `absence.mjs`).
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `absence.mjs`: «Why a player misses the next match, as a coach marks it on the roster (design spec 3.0 §3.3): the reason, the missed match, and what the injury itself does — the same thing a post-match does with it (`applyInjuryEffects`, which the post-match calls too). Back on the roster ends the missed match only. Pure.»
- [ ] **Step 4: Тесты** — Run: `node --test test/roster-absence.test.mjs test/post-match.test.mjs` и `. output/07b/env.sh && node --test test/post-match-events-db.test.mjs` → PASS (итоги — без изменений в тестах); затем полный прогон (рецепт Т) → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/roster/absence.mjs src/domain/roster/schema.mjs src/domain/post-match/roster.mjs test/roster-absence.test.mjs
git commit -m "feat(roster): a coach's missed-match mark does what the injury does, the post-match's own rule; back on the roster ends the missed match" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Модель — причина пропуска, секции, погибшие строками

**Files:**
- Modify: `src/screens/team/roster/model.mjs`
- Test: `test/team-roster-model.test.mjs`

**Interfaces:**
- Consumes: `rosterLines`, `sortLines` (этот файл); `storedPlayerId` (`players.mjs`).
- Produces (`model.mjs`):
  - `PlayerLine` получает `absence: {code, stat?, note?, pairingId?}|null` (как `rosterPlayerView` нормализовал `player.absence`) и `retired: boolean` (`temporarilyRetired`). JSDoc `@typedef PlayerLine` — две строки.
  - `rosterSections(lines) → {active: PlayerLine[], skipping: PlayerLine[]}` — по `line.skip`, порядок сохраняется.
  - `@typedef FallenLine` — `PlayerLine` и `fallen: {id: string, cause: string|null, fromMatch: boolean, round: number|null, diedAt: string}`; у неё `key` = `` `fallen-${record.id}` ``, `index` — место в списке сервера, `skip`, `captain`, `ready` — `false`, `injury` — `null`, `match` — нули.
  - `fallenLines({fallen, race, rosterIds = []}) → FallenLine[]`:
    - `[]`, когда `race === null`;
    - запись, чей `storedPlayerId(record.player)` есть в `rosterIds`, — не строка (решение 21);
    - снимок, который раса читает, — `rosterLines({draft: {players: [record.player]}, race})[0]` (карьера — счётчики снимка, записей нет) с полями выше;
    - снимок без строки расы (нет `rowIndex`, позиции нет у расы, форма админа `{name, position, number}`) — строка «голая»: `id` — `storedPlayerId ?? ""`, `number`, `name`, `position` — текст снимка или `""`, `kind: "lineman"`, характеристики `{text: "–", change: "", order: null}`, навыков и категорий нет, все счётчики и SPP — нули, `cheapest: null`, `value: 0`;
    - `round` — `record.roundNumber ?? null`; `cause` — `record.cause ?? null`.

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-model.test.mjs`:
  - «a line says why he misses the match, and whether he is retired for the season»: `absence: {code: "niggling"}` у пропускающего → `line.absence` `{code: "niggling"}`; пропуск 2.x без причины → `null`; `temporarilyRetired: true` → `skip` true, `retired` true; `absence` у играющего → `null`.
  - «the roster in two: those who play the next match, then those who miss it, each in the roster's order»: `rosterSections` → ключи `active` и `skipping`.
  - «the fallen as lines: what the roster held when he died, the cause and how it was recorded»:

```js
const record = { id: "f1", player: { id: "d1", rowIndex: 3, number: "8", name: "Pike", spp: { touchdowns: 2 } }, cause: "Foul", pairingId: null, roundNumber: null, diedAt: "2026-10-18T10:00:00Z", fromMatch: false };
const [line] = fallenLines({ fallen: [record], race: race("teams/human") });
assert.deepEqual([line.key, line.id, line.name, line.position, line.career.touchdowns, line.earned], ["fallen-f1", "d1", "Pike", "Blitzer", 2, 6]);
assert.deepEqual(line.fallen, { id: "f1", cause: "Foul", fromMatch: false, round: null, diedAt: "2026-10-18T10:00:00Z" });
assert.deepEqual(line.skills.map(({ name }) => name), ["Block", "Tackle"]);
assert.deepEqual([line.skip, line.captain, line.ready], [false, false, false]);
```

  - «a fallen record the roster cannot read is a line all the same: his name, dashes and no skills»: без `rowIndex`, `rowIndex: 99`, `{name: "Old Joe", position: "Lineman", number: 5}` → три строки, `stats.ma.text` «–», `skills` `[]`, `earned` 0, `number` `"5"`.
  - «a fallen player who is on the roster as read is drawn once, on the roster»: `rosterIds: ["d1"]` → `[]`.
  - «the fallen sort with the roster's sort; with none, in the server's order»: `sortLines(lines, {key: "ma", dir: "desc"})` и `sortLines(lines, null)` — по `index`.
  - «a name and a cause are kept as they are»: `HOSTILE` в имени и причине — значения как есть.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-model.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. В шапку файла — абзац: «The fallen are lines too (stage 07b): what the roster held when each died, read the way a player of the roster is, with how and when he fell; one the roster as read still holds is drawn there and only there.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/model.mjs test/team-roster-model.test.mjs
git commit -m "feat(roster): a line says why he misses the match; the roster in two sections; the fallen as lines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Очередь сохранений — отметка пропуска и возврат одним PATCH

**Files:**
- Modify: `src/screens/team/roster/save.mjs`
- Test: `test/team-roster-data.test.mjs`

**Interfaces:**
- Consumes: `markAbsence`, `clearAbsence` (Task 1); внутреннее `save.mjs` (`store`, `waiting`, `putInPlace`, `takeServerTeam`, `savedRevision`).
- Produces (`save.mjs`):
  - `markSkip(teamId, playerId, mark) → {ok: true} | {ok: false, refusal?: string} | {refusal: string}` — `mark` как у `markAbsence`. Ничего не уходит: игрока нет, статус `conflict`, игрок уже пропускает (`skipNextGame || temporarilyRetired`) — `{ok: false}`; ошибка `invalid` (422) — `{ok: false, refusal}`, как `stepSpp`; чужой токен — `{refusal: t("auth.otherTab")}`. Иначе поля игрока черновика заменяются (`Object.assign(player, markAbsence(player, mark))`), `waiting` + 1, `store.saveChange(teamId)`, `{ok: true}`.
  - `unmarkSkip(teamId, playerId) → то же` — ничего не уходит у игрока, который не пропускает или во временном уходе (`temporarilyRetired`); иначе `clearAbsence`.
  - `takeAnswerTeam(team) → object|null` — команда, которой ответили гибель или отмена: в очередь (`takeServerTeam`), когда очередь её держит (`savedRevision(team.id) !== null`) и ничего нет в пути, и **затем** на своё место в список тренера (`putInPlace`); черновик, или `null`, когда очередь команду не держит (профиль погибшего) или запрос в пути — список обновляется и тогда.
  - Внутреннее: проверки игрока, конфликта и 422 — одна функция на `stepSpp`, `markSkip`, `unmarkSkip`; поведение `stepSpp` не меняется (его тесты проходят как были).

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-data.test.mjs` (помощник `open()` файла; `teamAt` получает необязательный список игроков):
  - «a missed match is one PATCH of the whole roster: the reason, the missed match, and what the injury did, on the revision as read»: `markSkip("t1", "p1", {code: "lasting", stat: "ag"})` → один `PATCH /api/teams/t1`, `roster.players[0]` — `skipNextGame: true`, `absence: {code: "lasting", stat: "ag"}`, `statMods.ag: -1`, `revision: 4`.
  - «back on the roster is one PATCH that ends the missed match and its reason»: игрок с `skipNextGame`, `absence: {code: "miss"}` → `unmarkSkip` → `skipNextGame: false`, `absence: null`.
  - «a mark queues behind a step in the air and goes on the revision it came back with»: `stepSpp` держится (`hold`), `markSkip`, `release` с ревизией 5 → второй `PATCH` — `revision: 5`, в нём и шаг, и отметка.
  - «a mark whose answer was lost is the 409 that holds it: taken as saved, not sent as new»: `fail` → `{status: "offline", waiting: 1}`; 409 с составом, где отметка есть, ревизии 5 → `retrySaves` → `saved`, `waiting: 0`.
  - «nothing is sent for a player who already misses the match, one retired for the season, one the roster has not, or after a conflict; another tab's coach is told»: `{ok: false}` четыре раза и ни одного запроса; чужой токен — `{refusal: "…another tab…"}`.
  - «the answer to a death or an undo goes to the queue, then to the coach's list»: `takeAnswerTeam(teamAt(5))` → черновик; `savedRevision("t1")` 5; в `state.myTeams.items` `t1` ревизии 5 на своём месте; слушатель `onMyTeamsChange` (`src/data/teams.mjs`) уже видит `savedRevision` 5; команда, которую очередь не держит (`t9` в списке), — `null`, а список обновлён.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/team-roster-data.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. В шапку `save.mjs` — абзац: «A missed-match mark and back on the roster are the same kind of step (stage 07b): one player's fields changed in the draft, the whole roster saved. A death and its undo are not the queue's (fallen.mjs); their answer is taken here, the queue first, so that the list's revision is never ahead of the queue's for a write of the queue's own screen.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/save.mjs test/team-roster-data.test.mjs
git commit -m "feat(roster): a missed-match mark and back on the roster are steps of the save queue; a death's answer goes to the queue, then to the list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Погибшие на сервере — чтение, отметка гибели, отмена

**Files:**
- Create: `src/screens/team/roster/fallen.mjs`, `test/team-roster-fallen.test.mjs`
- Modify: `src/screens/team/roster/data.mjs` (`readSnapshot`), оба словаря

**Interfaces:**
- Consumes: `apiRequest`, `sessionTokenHolds` (`src/core/api-client.mjs`); `ApiError`, `refusalText` (`src/core/api.mjs`); `refusalWithRules`, `unanswered` (`src/data/teams.mjs`); `readRoster` (`data.mjs`).
- Produces (`fallen.mjs`):
  - `readFallen(teamId) → Promise<{fallen: object[]} | {error: string}>` — `GET /api/teams/:id/fallen`; ответ, чей `fallen` не массив объектов со строковым `id`, — `{error: t("request.noAnswer")}`; отказ — `{error: refusalText(error)}`.
  - `markDeath(teamId, playerId, {cause, revision}) → Promise<{team, fallen} | {refusal, code, conflict?: object|null, lost?: true} | {ignored: true}>`:
    - запись погибших команды уже в пути — `{ignored: true}`, ничего не уходит;
    - чужой токен — `{refusal: t("auth.otherTab"), code: null}`, ничего не уходит;
    - `POST /api/teams/:id/players/:pid/death`, тело `{cause, revision}`, оба id через `encodeURIComponent`;
    - 2xx с объектами `team` и `fallen` — `{team, fallen}`; 2xx без них — потерян;
    - 409 `TEAM_SAVED_ELSEWHERE` — `{refusal, code, conflict: error.payload?.team ?? null}`;
    - ответа не было (`unanswered(error)` или не `ApiError`) — `{refusal: t("teamRoster.fallen.lost"), code: null, lost: true}`, второй раз не отправляется;
    - иначе — `{refusal: refusalWithRules(error), code: error.code}`.
  - `undoDeath(teamId, fallenId) → Promise<{team} | {refusal, code, lost?: true} | {ignored: true}>` — `DELETE /api/teams/:id/fallen/:fid`, те же правила (ревизии нет; ветки `conflict` нет).
  - `fallenWriting(teamId) → boolean` — запись погибших команды в пути.
- Produces (`data.mjs`): `readSnapshot(teamId) → Promise<{team, events, fallen} | {error}>` — `readRoster(teamId)` и `readFallen(teamId)` рядом (`Promise.all`); сначала отказ состава, затем погибших.

Словари: `teamRoster.fallen.lost` — «The answer did not come: the roster is read again to see what the server holds.» / «Ответ не пришёл: состав перечитывается, чтобы узнать, что на сервере.»

- [ ] **Step 1: Падающие тесты** — `test/team-roster-fallen.test.mjs` (`installFakeApi` до импорта `api-client`, как в `test/team-roster-data.test.mjs`; тренер с токеном `rememberSessionToken`):
  - «the fallen are read for the team, and an answer that is not a list is a read that failed»: `{fallen: [record]}` → `{fallen: [record]}`; `{}`, `{fallen: [null]}` → `{error}` с текстом `request.noAnswer`; `fail` → `{error}` с текстом `refusalText` (ожидаемые строки — как у `readRoster` в `test/team-roster-data.test.mjs`).
  - «the roster's snapshot is the team, its records and its fallen; either failing fails it».
  - «a death is one POST with the cause and the revision the coach's roster is on; its answer is the team and the record»: тело `{cause: "Foul", revision: 4}`, путь `/api/teams/t1/players/p1/death`.
  - «a death whose answer was lost is not sent again; nor is an undo» (Review Focus 1): `fail` → `{lost: true, code: null}`, в `calls` один запрос; то же для `undoDeath`.
  - «a 2xx without the team is an answer that did not come»: 201 `{}` → `lost`.
  - «another device's save: the death is refused with the server's team»: 409 с `team` ревизии 6 → `conflict.revision` 6.
  - «one write of the fallen at a time per team: a second press while one is on its way sends nothing»: `hold` → второй вызов `{ignored: true}`; `fallenWriting("t1")` true, после ответа false.
  - «another tab's coach: nothing is sent».
  - «an undo is one DELETE of the record; a refusal says the rules it breaks»: 200 `{team}`; 422 `ROSTER_BREAKS_THE_RULES` с нарушением → в `refusal` текст `validation.<CODE>`; 403 `FALLEN_FROM_MATCH`, 404 `FALLEN_NOT_FOUND`, 422 `FALLEN_NOT_RESTORABLE` → `code` и `t("error.<CODE>")`.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/team-roster-fallen.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `fallen.mjs`: «A team's fallen on the server (stage 03's routes): who died, a death a coach marks, and its undo. Neither is a save of the roster: a death goes on the revision the roster's queue stands on, an undo names its record, and the screen sends either only when the queue has nothing waiting. An answer that does not come is never a reason to send again — the screen reads the roster back; a second press is safe anyway, since a death on an old revision meets 409 and an undo of a record already gone meets 404.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/fallen.mjs src/screens/team/roster/data.mjs src/i18n/en.json src/i18n/ru.json test/team-roster-fallen.test.mjs
git commit -m "feat(roster): the fallen read with the roster; a death and its undo, one at a time, never sent twice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `src/ui` — нижняя шапка по выбору, серый номер погибшего

**Files:**
- Modify: `src/ui/roster-table.mjs` (проп `foot`), `src/ui/number-badge.mjs`, `src/ui/number-badge.css` (проп `fallen`)
- Test: `test/ui-roster-table.test.mjs`, `test/ui-player.test.mjs`

**Interfaces:**
- Produces:
  - `renderRosterTable({…, foot = true})` — при `false` `<tfoot>` не рисуется; JSDoc: «a table drawn above another one leaves the foot to the last».
  - `renderPlayerBadge({…, fallen = false})` — класс `g-num--fallen` вместо класса позиции, без знака капитана (даже при `captain`); `large` работает. CSS: `.g-num--fallen { background: var(--surface-3); color: var(--muted); }`, после классов позиций.

- [ ] **Step 1: Падающие тесты:**
  - `test/ui-roster-table.test.mjs`: «a table drawn above another has no foot: the labels repeat once, at the end of the list» — `foot: false` → `tfoot` нет; без пропа — есть.
  - `test/ui-player.test.mjs`: «a fallen player's number is grey: no position's colour, no captain's mark, readable in every palette» — `renderPlayerBadge({number: "8", kind: "blitzer", captain: true, fallen: true})` → `.g-num--fallen`, нет `.g-num--blitzer` и `.g-num__captain`; `large` → `.g-num--fallen.g-num--lg`; `assertReadable("src/ui/number-badge.css", ".g-num--fallen", "color", ["--surface-3"], 4.5)`. Если какая-то палитра не проходит — `color: var(--ink-2)`, тест тот же.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/ui-roster-table.test.mjs test/ui-player.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui/roster-table.mjs src/ui/number-badge.mjs src/ui/number-badge.css test/ui-roster-table.test.mjs test/ui-player.test.mjs
git commit -m "feat(ui): a roster table may leave its foot to the one below; a fallen player's number is grey" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Экран — секции «Пропускают матч» и «Погибшие», погибший в строке и в панели

Действий ещё нет (Task 7–9): эта задача рисует, читает и выбирает.

**Files:**
- Create: `src/screens/team/roster/fallen-view.mjs`, `src/screens/team/roster/marks.css`, `test/team-roster-skips.test.mjs`
- Modify: `index.mjs`, `view.mjs`, `panel.mjs`, `src/styles.css`, оба словаря, `test/team-roster.test.mjs`, `test/app-boot-roster.test.mjs`

**Interfaces:**
- Consumes: `readSnapshot` (Task 4); `rosterSections`, `fallenLines`, `FallenLine` (Task 2); `renderRosterTable({foot})`, `renderPlayerBadge({fallen})` (Task 5); `raceTitleOf` (`src/data/teams.mjs`); `formatDay` (`src/core/format.mjs`); `teamPlayerUrl` (`src/core/routes.mjs`).
- `index.mjs`:
  - `Visit` получает `fallen: object[]` (записи, как прочитаны; `[]` в начале визита);
  - чтение на входе (`read`) и `readWithGames` зовут `readSnapshot` вместо `readRoster`;
  - `holdTeam(saving, {team, events, fallen}, draft, since)` кладёт и `fallen` (`fallen ?? visit.fallen`);
  - `linesOf(visit, mode) → {race, lines, fallen}` — `fallen` = `fallenLines({fallen: visit.fallen, race, rosterIds: lines.map(({id}) => id)})`;
  - `screenOf` сортирует `fallen` тем же `memory.sort` и кладёт в `RosterScreen`; `sheetOf` получает `[...lines, ...fallen]` (шторка навыка у погибшего).
- `RosterScreen` (`view.mjs`, JSDoc) получает `fallen: FallenLine[]`.
- `panel.mjs`:
  - `injuryWords({code, stat}) → string` переезжает сюда из `view.mjs` и экспортируется;
  - `absenceWords(line) → string` — решение 14: `retired` → `teamRoster.skips.retired`; нет `absence` → `teamRoster.skip`; `other` → `note`; иначе `injuryWords(absence)`;
  - `prepResetWords() → string` — предложение подготовки 07a (`teamRoster.prep.sub` с `pre.step.*`), которым пользуются `prepMarkup` (`view.mjs`) и шторка отмены (Task 9);
  - у пропускающего в панели — «Следующий матч: пропускает · <причина>» (`teamRoster.skips.sits`).
- `fallen-view.mjs`:
  - `fallenWhen(line) → string` — решение 18 (`teamRoster.fallen.manual|inRound|inMatch`, дата — `formatDay(line.fallen.diedAt)`);
  - `fallenRowMarkup(line, screen) → string` — раскрытая строка погибшего на телефоне (решение 16): «Причина гибели», причина или «Причина не записана.», «Карьера: N SPP · <когда>», «Профиль игрока» (`renderButton({kind: "dark", block: true, href: teamPlayerUrl(screen.team.id, line.id)})`, только у `line.id`), у ручной — «Отменить отметку можно в профиле», у гибели из матча — `teamRoster.fallen.fromMatch`;
  - `fallenProfileMarkup(line, {race, undoHtml = ""}) → string` — тело профиля погибшего (общее для панели и страницы Task 10): StatStrip в `.g-fallen__stats`, `renderStatusChip({label: t("teamRoster.fallen.status")})` и `fallenWhen`, причина, `undoHtml` или у гибели из матча `teamRoster.fallen.fromMatch`, «Карьера: N SPP», навыки карточками (`skillChipsMarkup(line, {card: true})`), `teamRoster.fallen.rules`;
  - `fallenPanelMarkup(line, screen) → string` — панель десктопа: голова (`renderPlayerBadge({number, kind, fallen: true, large: true})`, `h2` имя, `teamRoster.fallen.who` с `raceTitleOf(screen.team.baseTeamSlug)`), затем `fallenProfileMarkup(line, {race: screen.race})`.
- `view.mjs`:
  - `layoutMarkup` — до трёх таблиц, каждая в `<section class="g-roster__section" aria-labelledby="…">` со своей полосой `.g-roster__bar`/`h2.g-roster__heading` и числом `.g-roster__count`: «Активный состав» (`#roster-heading`, статус сохранения — здесь), «Пропускают матч» (`#roster-skips-heading`, `teamRoster.skips.tableLabel`), «Погибшие» (`#roster-fallen-heading`, `teamRoster.fallen.tableLabel`, класс `g-roster__section--fallen`); пустая секция не рисуется; `foot` — только у последней; у первой — слот `headLeadHtml` (пустой до 07c);
  - строка пропускающего — `sub: absenceWords(line)`, `alert: true`; строка погибшего — бейдж `fallen`, `sub` — `teamRoster.fallen.sub` с причиной или `teamRoster.fallen.status`, `alert: false`, клетки без «+N» матча, `panelHtml` — `fallenRowMarkup`;
  - `choiceOf` выбирает среди `[...active, ...skipping, ...fallen]`; по умолчанию — первый активный, иначе первый пропускающий, иначе первый погибший; панель погибшего — `fallenPanelMarkup`;
  - состав без строк — `teamRoster.empty` 07a; строки есть, но все пропускают — вместо первой таблицы `teamRoster.skips.noneActive`;
  - `sheetMarkup` ищет строку шторки и среди `screen.fallen` (правило навыка погибшего).
- `marks.css` (шрифт, рамка, фон, регистр, разрядка и начертание — явно): `.g-roster__section { margin-top: var(--space-24) }`; `.g-roster__section--fallen .g-rtable__c, .g-roster__section--fallen .g-rtable__sub { color: var(--muted) }`; `.g-fallen__*` — блоки профиля (статус и «когда» одной строкой, `white-space: nowrap` у плашки, причина `500 16px/1.4 var(--font-body)`, StatStrip серым: `.g-fallen__stats .g-stat__v { color: var(--muted) }`).

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.skips.heading` | Missing the match | Пропускают матч |
| `teamRoster.skips.tableLabel` | Players of {team} who miss the next match | Игроки команды {team}, пропускающие матч |
| `teamRoster.skips.retired` | Temporarily retired for the season | Временный уход до конца сезона |
| `teamRoster.skips.noneActive` | Everyone on the roster misses the next match. | Все игроки состава пропускают следующий матч. |
| `teamRoster.skips.sits` | sits it out · {reason} | пропускает · {reason} |
| `teamRoster.fallen.heading` | Fallen | Погибшие |
| `teamRoster.fallen.tableLabel` | The fallen of {team} | Погибшие игроки команды {team} |
| `teamRoster.fallen.status` | Fallen | Погиб |
| `teamRoster.fallen.sub` | Fallen · {cause} | Погиб · {cause} |
| `teamRoster.fallen.who` | {position} · {race} · fallen | {position} · {race} · погиб |
| `teamRoster.fallen.cause` | Cause of death | Причина гибели |
| `teamRoster.fallen.noCause` | No cause was recorded. | Причина не записана. |
| `teamRoster.fallen.manual` | marked by hand · {date} | отмечено вручную · {date} |
| `teamRoster.fallen.inRound` | in a match · round {round} · {date} | в матче · тур {round} · {date} |
| `teamRoster.fallen.inMatch` | in a match · {date} | в матче · {date} |
| `teamRoster.fallen.career` | Career: {spp} SPP | Карьера: {spp} SPP |
| `teamRoster.fallen.careerWhen` | Career: {spp} SPP · {when} | Карьера: {spp} SPP · {when} |
| `teamRoster.fallen.profile` | Player's profile | Профиль игрока |
| `teamRoster.fallen.undoInProfile` | The mark can be undone in the profile | Отменить отметку можно в профиле |
| `teamRoster.fallen.fromMatch` | A death the post-match recorded is not undone here: the league administrator corrects it. | Гибель, записанная в итогах матча, так не отменяется — её исправляет админ лиги. |
| `teamRoster.fallen.rules` | A fallen player plays no matches, takes no advancements and is not in TV. | Погибший игрок не выходит на матчи, не прокачивается и не входит в TV. |

- [ ] **Step 1: Падающие тесты** — `test/team-roster-skips.test.mjs`. Окружение — как строки 1–80 `test/team-roster.test.mjs` (страница-`EventTarget`, `installFakeApi` до импортов, `mountView`, `location`, `coach()`), с ответом `GET /api/teams/t1/fallen`. Состав Human: Ann (Lineman), Bors (Blitzer, капитан), Cade (Catcher), Dell (Lineman, `skipNextGame`, `absence: {code: "lasting", stat: "ma"}`, `statMods: {ma: -1}`), Edda (Thrower, `skipNextGame`, без причины), Finn (Lineman, `skipNextGame`, `temporarilyRetired`), Grom (Ogre, `skipNextGame`, `absence: {code: "other", note: "Suspended"}`). Погибшие: `f1` Pike (Blitzer, `spp: {touchdowns: 2}`, причина «Foul by the Raiders», ручная), `f2` Joe (Lineman, причина `null`, `fromMatch: true`, `roundNumber: 2`). Тесты:
  - «the roster in three: those who play, those who miss the next match with why, and the fallen; the counts are the roster's»: `#roster-heading` — «Active roster 3», `#roster-skips-heading` — «Missing the match 4», `#roster-fallen-heading` — «Fallen 2»; `.g-pagehead__sub` — «On the roster: 7 · missing a match: 4 · can advance: …»; порядок `tbody` по таблицам.
  - «a reason in words under a name: an injury, another reason, the season's retirement, none from 2.x»: «Lasting Injury (MA)», «Misses the next match», «Temporarily retired for the season», «Suspended» — все `.g-rtable__sub--alert`.
  - «the labels repeat once, at the end of the list»: один `tfoot`, в последней таблице.
  - «a fallen row: a grey number, grey numbers and «Fallen · cause»; open on a phone it says why, when, and leads to his profile» (`withWindow({phone: true})`): `.g-num--fallen`; «Fallen · Foul by the Raiders»; в раскрытой строке «Cause of death», «Career: 6 SPP · marked by hand · <formatDay>», `href` — `teamPlayerUrl("t1", "d1")`, «The mark can be undone in the profile»; счётчиков (`[data-action-key]`) нет.
  - «a death the post-match recorded says the administrator corrects it, and offers no undo»: `f2` — «Fallen», «in a match · round 2 · …», `teamRoster.fallen.fromMatch`, подсказки об отмене нет.
  - «on a desk a fallen player chosen stands in the panel as his profile» (`withWindow({phone: false})`): клик по `[data-row-key="fallen-f1"]` → `.g-roster__aside[data-panel-player="fallen-f1"]`, `.g-num--fallen.g-num--lg`, «Blitzer · Human · fallen» (позиция — из ростера расы, раса — `raceTitleOf`), `dl.g-stats`, «Career: 6 SPP», `.g-skill--card`, `teamRoster.fallen.rules`.
  - «a skipper's panel says why he sits the next match out»: Dell → «Next match: sits it out · Lasting Injury (MA)».
  - «the fallen are read with the roster; a list that cannot be read fails the read with words and «Try again»»: `fail("GET /api/teams/t1/fallen")` → Callout и «Try again»; ответ 200 и клик → три секции.
  - «a fallen player on the roster as read is drawn once»: запись с `player.id: "p1"` → в «Погибших» её нет.
  - «a fallen record the roster cannot read is drawn with dashes, and the screen stands»: `{name: "Old Joe", position: "Lineman", number: 5}` → строка с «–».
  - «a skill chip of a fallen player opens its rule»: чип «Block» у Pike → `dialog#roster-skill`.
  - «the cause and the note are text»: `HOSTILE` в причине и в `note` → `textContent`, ни `img`, ни `[onerror]`.
  - «every key the new files ask for is in both dictionaries»: `assertDictionaryCovers("src/screens/team/roster/fallen-view.mjs", "src/screens/team/roster/panel.mjs", "src/screens/team/roster/view.mjs")`.
  - «everything drawn is styled»: `assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css", "status-chip.css", "button.css", "callout.css")`; `@import url("screens/team/roster/marks.css");` есть в `src/styles.css`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-skips.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `fallen-view.mjs`: «A fallen player on the roster (stage 07b, spec UI §9): his row opened on a phone, and on a desk the panel, which is his profile; the profile's body is the one the player's own address draws on a phone too (screens/team/player). An undo is offered only for a death a coach marked; one a post-match recorded is the administrator's.»
- [ ] **Step 4: Поправить тесты 07a, которые ломает перенос пропускающих** (`test/team-roster.test.mjs`):
  - `coach()` — ещё `api.reply("GET /api/teams/t1/fallen", 200, { fallen: [] })`;
  - `callKeys` — без `GET /api/teams/t1/fallen`, с комментарием: «the fallen are read with the roster (stage 07b) and are not what these tests count»;
  - «the roster of a team…»: `#roster-heading` — `/^Active roster 6$/`, `order()` и ключи — Dell (`p4#3`) последним;
  - «a header sorts the table…»: в ожидаемых порядках Dell — последним (своя таблица);
  - списки `assertStyled` (строки около 517, 1028, 1157, 1566) — плюс `"src/screens/team/roster/marks.css"`;
  - `test/app-boot-roster.test.mjs` — ответ `GET /api/teams/t1/fallen`.
  Ни одно другое ожидание 07a не меняется; падает что-то ещё — стоп, вопрос контроллеру.
- [ ] **Step 5: Тесты** — Run: `node --test test/team-roster-skips.test.mjs test/team-roster.test.mjs test/app-boot-roster.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 6: Commit**

```bash
git add src/screens/team/roster src/styles.css src/i18n/en.json src/i18n/ru.json test/team-roster-skips.test.mjs test/team-roster.test.mjs test/app-boot-roster.test.mjs
git commit -m "feat(roster): «Missing the match» and «Fallen» under the active roster; a fallen player's row, and his profile in the desk panel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «Пропуск матча…», шторка причин, «Вернуть в состав»

«Смерть» в шторке — Task 8: здесь четыре причины.

**Files:**
- Create: `src/screens/team/roster/mark-sheet.mjs`, `src/screens/team/roster/marks.mjs`
- Modify: `panel.mjs`, `sheets.mjs`, `injury.mjs`, `wire.mjs`, `index.mjs`, `view.mjs`, `marks.css`, оба словаря
- Test: `test/team-roster-skips.test.mjs`

**Interfaces:**
- Consumes: `markSkip`, `unmarkSkip` (Task 3); `markEdits` (Task 1); `ABSENCE_NOTE_MAX` (`schema.mjs`); `renderOptionList`, `renderFilterChips`, `renderTextField`, `renderSheet`, `renderButton`.
- `sheets.mjs`:
  - константы `MARK_SHEET = "roster-mark"`, `UNDO_SHEET = "roster-undo"`, `MARK_STAT = "mark-stat"`;
  - `sheetIdOf(kind) → string` — `skill`, `injury`, `mark`, `undo` → id шторки; `drawVisit` и `onSheetClose` (`index.mjs`) берут id отсюда;
  - `statChipsMarkup({stat, group, label}) → string` — нынешний `statMarkup` шторки травмы с группой и подписью параметрами; травма зовёт его с `INJURY_STAT` и `teamRoster.injury.stat`.
- `mark-sheet.mjs`:
  - `MARK_TEXT = "mark-text"` — id поля причины;
  - `chosenMark(choice) → {code: "miss"|"niggling"} | {code: "lasting", stat} | {code: "other", note} | null` — `choice = {code, stat, text}`; `other` — `text.trim()`, непустой и не длиннее `ABSENCE_NOTE_MAX`;
  - `markWaits(choice) → string` — чего ждёт кнопка (решение 10), `""` когда отметка целая;
  - `markSheetMarkup({line, choice, busy, refusal, reason}) → string` — `renderSheet({id: MARK_SHEET, title: t("teamRoster.mark.title"), sub: t("teamRoster.injury.who", …)})`; тело: `renderOptionList({label: t("teamRoster.mark.choose"), options})` (`miss`, `niggling`, `lasting` — `teamRoster.injury.<code>` и `teamRoster.injuryCaption.<code>`; `other` — `teamRoster.mark.other` / `otherCaption`), у `lasting` — `statChipsMarkup({group: MARK_STAT, label: t("teamRoster.mark.stat")})`, у `other` — `renderTextField({id: MARK_TEXT, name: MARK_TEXT, label: t("teamRoster.mark.note"), value: choice.text})`, у `niggling`/`lasting` — строка `teamRoster.mark.effectsStay`, отказ — `<p class="g-roster__markrefusal" role="alert">`; подвал — одна кнопка `[data-mark-send]`: при `reason` — `aria-disabled` и `title` (как `footButton` шторки травмы), иначе `disabled`, пока `markWaits` не пуст, `busy` — пока запись в пути; подпись — `markWaits` или `teamRoster.mark.send`.
- `panel.mjs`:
  - `markClosed(line, screen, {direct = false} = {}) → string` — матч → `teamRoster.mark.closed`; `screen.lock`; нет `line.id` у строки состава → `teamRoster.mark.noId`; при `direct` (Task 8, 9) — `screen.save.waiting > 0` или статус `saving`/`dirty` → `teamRoster.mark.waitSave`; иначе `""`;
  - `actionsMarkup(line, screen) → string` — `<div class="g-roster__actions">…</div>`, в матче `""`; у пропускающего — «Вернуть в состав» (`data-roster-return`), закрытая причиной `retired ? teamRoster.skips.retiredClosed : markClosed`; у играющего — «Пропуск матча…» (`data-roster-mark`, `aria-haspopup="dialog"`), закрытая `markClosed`; закрытая кнопка — `aria-disabled="true"`, `title`, `data-roster-closed` (нажатие говорит причину, как в 07a); `closedMarkup` получает параметр `reason` (по умолчанию `teamRoster.afterPost`);
  - `rowPanelMarkup` — `actionsMarkup` после «Профиль и прокачка»; `sidePanelMarkup` — после «Следующий матч».
- `marks.mjs`:
  - `markHandlers(saving, {now}) → {onMark, onMarkChoice, onMarkText, onMarkSend, onReturn}`, где `now()` — экран на момент нажатия (`mode`, `lines`, `fallen`, `lock`, `save`), как у `injuryHandlers`;
    - `onMark(key, button)` — причина закрытия → `toast`; иначе `visit.sheet = {kind: "mark", key, choice: {code: "", stat: "", text: ""}, busy: false, refusal: ""}`, `visit.opener = button`;
    - `onMarkChoice(change)`, `onMarkText(text)` — меняют `visit.sheet.choice` (та же шторка) и перерисовывают; ввод текста перерисовку патчем переживает (`patchWithModal` держит каретку, как шторки 08);
    - `onMarkSend()` — `chosenMark` и причина закрытия ещё раз; `markSkip(teamId, line.id, mark)`: `{refusal}` — в шторку; `{ok: true}` — шторка закрывается, фокус — на кнопку строки игрока (`[data-row-key="<key>"]`; ключ строки у пропускающего тот же);
    - `onReturn(key)` — причина закрытия → `toast`; иначе `unmarkSkip`, отказ → `toast`;
  - `markSheetOf(visit, lines, where) → sheet|null` — подпись та же, что у `sheetOf` (`injury.mjs`): шторка `mark` стоит, пока её игрок есть в составе, не пропускает и матча нет; к ней добавляется `reason` (`markClosed`).
- `injury.mjs`: `openerOf` для шторок `mark` и `undo` — открывший элемент, иначе `[data-roster-mark|undo="<key>"]`, иначе кнопка строки `[data-row-key="<key>"]`. `sheetOf` не меняется: какую из двух звать, решает `screenOf` (`marks.mjs` импортирует `closeSheet` из `injury.mjs`, обратного импорта нет — без цикла).
- `wire.mjs`: один `wireOptionLists` на корень вместо того, что в `wireInjury`, — по `list.closest("dialog")?.id`: `MARK_SHEET` → `onMarkChoice({code})`, иначе `onInjuryChoice({code})` (два `wireOptionLists` на одном корне не работают: первый переключает группу, второй не слышит изменения — `src/ui/filter-chips.mjs`, JSDoc `wireFilterChips`); `wireFilterChips(…, {group: MARK_STAT})` → `onMarkChoice({stat})`; `input` на `#mark-text` → `onMarkText(value)`; клики `[data-roster-mark]` (не `aria-disabled`), `[data-roster-return]`, `[data-mark-send]`.
- `index.mjs`: `pressHandlers` добавляет `...markHandlers(saving, {now})` (`now` — плюс `fallen` и `save`); `screenOf` зовёт `markSheetOf` для шторок `mark` и `undo` и `sheetOf` для остальных, обеим — `[...lines, ...fallen]` и `where` с `save` (его читают `markSheetOf` и `markClosed`); `onSheetClose` — любой id из `sheetIdOf`; `drawVisit` — `` `#${sheetIdOf(visit.sheet.kind)}` ``; `reloadRoster` считает и снятые отметки (решение 8):

```js
const spp = Math.min(sppEdits(answer.team.roster, visit.draft).length, waiting);
const marks = Math.min(markEdits(answer.team.roster, visit.draft), waiting - spp);
// …после takeServerTeam, только в матче:
if (spp) toast(t("teamRoster.matchDropped", { count: spp }), { tone: "error" });
if (marks) toast(t("teamRoster.mark.matchDropped", { count: marks }), { tone: "error" });
```

- `view.mjs`: `sheetMarkup` рисует и шторку `mark` (`markSheetMarkup`).
- `marks.css`: `.g-roster__actions { display: flex; gap: var(--space-10) }`, кнопки в нём `flex: 1 1 0`, от 44px; `.g-roster__markrefusal`, `.g-roster__markeffect` — шрифт, цвет и отступы явно.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.mark.open` | Miss a match… | Пропуск матча… |
| `teamRoster.mark.title` | Missing the next match | Пропуск следующего матча |
| `teamRoster.mark.choose` | Reason | Причина |
| `teamRoster.mark.other` | Another reason | Другая причина |
| `teamRoster.mark.otherCaption` | The league's or the coach's decision | Решение лиги или тренера |
| `teamRoster.mark.stat` | Which characteristic goes down | Какая характеристика снижается |
| `teamRoster.mark.note` | Reason | Причина |
| `teamRoster.mark.effectsStay` | The injury's effect stays: «Back on the roster» only ends the missed match. | Последствия травмы останутся: «Вернуть в состав» снимает только пропуск. |
| `teamRoster.mark.chooseFirst` | Choose a reason | Выберите причину |
| `teamRoster.mark.chooseStat` | Choose a characteristic | Выберите характеристику |
| `teamRoster.mark.writeNote` | Write the reason | Напишите причину |
| `teamRoster.mark.tooLong` | No longer than {max} characters | Не длиннее {max} знаков |
| `teamRoster.mark.send` | Mark the missed match | Отметить пропуск |
| `teamRoster.mark.closed` | Missed matches and deaths — after the post-match | Пропуски и гибель — после итогов матча |
| `teamRoster.mark.noId` | This player has no id in the roster, so nothing can be marked for him. Ask the league administrator to fix the roster. | У игрока нет id в составе, поэтому отметить ничего нельзя. Попросите администратора лиги исправить состав. |
| `teamRoster.mark.matchDropped` | A match has begun, so the missed-match marks that were waiting were not saved ({count}). Make them again after the post-match. | Начался матч, поэтому ждавшие отправки отметки пропуска не сохранены ({count}). Повторите их после итогов матча. |
| `teamRoster.skips.return` | Back on the roster | Вернуть в состав |
| `teamRoster.skips.retiredClosed` | Retired for the season: he cannot be brought back here. | Временный уход до конца сезона: здесь его не вернуть. |

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-skips.test.mjs`:
  - «a playing player's row has «Miss a match…», a skipper's «Back on the roster»; a match draws neither»: телефон — в раскрытой строке Ann `[data-roster-mark]`, у Dell `[data-roster-return]`; десктоп — то же в панели; при `LIVE_GAME` (как в `test/team-roster.test.mjs`) — ни того, ни другого.
  - «the sheet: who, the reasons with what each does, and a button that says what it waits for»: `dialog#roster-mark`, `h2` «Missing the next match», `.g-sheet__sub` «#1 Ann · Human Lineman»; заголовки карточек — «Seriously Hurt», «Serious Injury», «Lasting Injury», «Another reason»; кнопка «Choose a reason» (`disabled`); `lasting` → «Choose a characteristic», чип `ag` → «Mark the missed match»; `other` → поле `#mark-text`, пусто → «Write the reason», 501 знак → «No longer than 500 characters».
  - «a missed match marked: one PATCH, the sheet closes, he moves to «Missing the match» with his reason, the focus on his row's button»: тело `PATCH` — Ann `skipNextGame`, `absence: {code: "lasting", stat: "ag"}`, `statMods.ag: -1`; `#roster-skips-heading` +1; под Ann «Lasting Injury (AG)»; `document.activeElement` — `[data-row-key="p1#0"]`.
  - «the injury's effect is said before it is done»: у `niggling` и `lasting` — `teamRoster.mark.effectsStay`, у `miss` и `other` — нет.
  - «back on the roster: one PATCH, he plays the next match again»: Dell → `skipNextGame: false`, `absence: null`; Dell — в «Активном составе».
  - «a player retired for the season cannot be brought back here, and says why»: у Finn кнопка `aria-disabled`, `title` — «Retired for the season…»; клик → сообщение, запросов нет.
  - «closed while the games are unread, the roster is read or a conflict waits»: «Loading the matches…» на кнопке и в сообщении по нажатию; `PATCH` нет.
  - «another tab's coach: no mark is sent, and the coach is told» (токен сменён после `rememberSessionToken`).
  - «a sheet whose match began closes, and the focus goes back to the row» (Review Focus 3): шторка открыта, `gamesAre([LIVE_GAME])` + `loadGames(true)` → `dialog#roster-mark` нет, фокус — кнопка строки Ann.
  - «a mark offline waits like a step: «Waiting for the network · edits: 1»» (`fail(PATCH)`).
  - «a mark that waited for the network is given up when a match begins, and the coach is told how many» (Review Focus 3): `fail(PATCH)`, отметка, затем игры с `LIVE_GAME` → сообщение «…missed-match marks that were waiting were not saved (1)…»; в составе — состав сервера.
  - «the option lists of two sheets do not answer for each other»: шторка травмы в матче (`t2`-подобный состав, `LIVE_GAME`) по-прежнему выбирает травму (тест 07a «Травма в матче» проходит без изменений).
  - «every key is in both dictionaries»: `assertDictionaryCovers` по `mark-sheet.mjs`, `marks.mjs`, `panel.mjs`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-skips.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `marks.mjs`: «The roster's marks (stage 07b): a missed match and back on the roster, which are steps of the save queue (save.mjs) and are drawn at once from its draft; a death and its undo (fallen.mjs), which are not, and go only when the queue has nothing waiting. None of them during a match (R8): their place is the match's injury. What a sheet holds lives on the visit, as the injury's sheet does (injury.mjs).» Шапка `mark-sheet.mjs`: «The sheet «Missing the next match» (spec UI §9, StatsMng): the reasons a coach may give, the characteristic a lasting injury lowers, the words of another reason, and one button that says what it still waits for.»
- [ ] **Step 4: Тесты** — Run: `node --test test/team-roster-skips.test.mjs test/team-roster.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster-skips.test.mjs
git commit -m "feat(roster): «Miss a match…» with its reason, saved as a step of the roster; «Back on the roster»; marks waiting when a match begins are counted" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Отметка гибели

**Files:**
- Modify: `mark-sheet.mjs` (карточка «Смерть», поле причины), `marks.mjs` (отправка гибели), `index.mjs` (`readAgain` возвращает, взято ли чтение; `hold`), оба словаря
- Test: `test/team-roster-skips.test.mjs`

**Interfaces:**
- Consumes: `markDeath`, `fallenWriting` (Task 4); `takeAnswerTeam`, `savedRevision` (Task 3); `markClosed(…, {direct: true})` (Task 7); `storedPlayerId`.
- `mark-sheet.mjs`:
  - пятая карточка `dead` (`teamRoster.injury.dead`, `teamRoster.mark.deadCaption`), между `lasting` и `other`;
  - у `dead` — `renderTextField({id: MARK_TEXT, label: t("teamRoster.fallen.cause"), help: t("teamRoster.mark.causeHelp"), value: choice.text})`;
  - `chosenMark` → `{code: "dead", cause}` (`text.trim()`, 1…500 по `trim().length`, как `checkCause` сервера); `markWaits` → `teamRoster.mark.writeCause` / `tooLong`; подпись готовой — `teamRoster.mark.sendDead`.
- `marks.mjs`:
  - `markHandlers(saving, {now, hold, readAgain, reload})`: `hold({team, fallen}) → void` кладёт ответ (`index.mjs`: `takeAnswerTeam(team)`, затем `holdTeam(saving, {team, events: visit.events, fallen}, draft, visit.heard.length)`; `null` вместо черновика — `reloadRoster(saving)`); `readAgain() → Promise<boolean>` — `true`, когда чтение взято; `reload() → Promise<void>` — `reloadRoster(saving)`;
  - `onMarkSend` для `dead`: причина закрытия `markClosed(line, where, {direct: true})` → в шторку; `fallenWriting` → ничего; иначе `visit.sheet.busy = true`, `markDeath(teamId, line.id, {cause, revision: savedRevision(teamId)})`, затем по ответу:
    - `{team, fallen}` — `hold`, `memory.selected = "fallen-" + fallen.id`, шторка закрывается, фокус — на `[data-row-key="fallen-<id>"]`, `toast(t("teamRoster.mark.deadDone", {name}))`;
    - `conflict` — `reload()`, шторка (если её игрок ещё в составе) — `refusal: t("teamRoster.mark.changed")`, `busy: false`;
    - `lost` — шторка закрывается, `await readAgain()`; взято — `toast` `deadDone`, если запись с его id есть в `visit.fallen`, иначе `teamRoster.mark.deadLost` (`tone: "error"`);
    - `PLAYER_NOT_FOUND` — `refusal` и `readAgain()`; другой отказ — `refusal` в шторку, `busy: false`;
    - визит закрыт или шторка уже другая — ответ ничего не рисует.
- `index.mjs`: `readAgain(saving)` возвращает `true` после `holdTeam` и `false`, когда чтения нет (`readWithGames` → `null`); `tappingOf` по-прежнему зовёт его через `void`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.mark.deadCaption` | the player leaves the roster | игрок выбывает из состава |
| `teamRoster.mark.causeHelp` | Seen on the roster and in the team's history. The player moves to «Fallen». | Видно в составе и в истории команды. Игрок перейдёт в раздел «Погибшие». |
| `teamRoster.mark.writeCause` | Write the cause of death | Напишите причину гибели |
| `teamRoster.mark.sendDead` | Mark the death | Отметить гибель |
| `teamRoster.mark.waitSave` | Wait until your edits are saved | Сначала дождитесь сохранения правок |
| `teamRoster.mark.deadDone` | {name}: the death is marked | {name}: гибель отмечена |
| `teamRoster.mark.deadLost` | The death is not on the server: mark it again. | Гибели на сервере нет: отметьте её ещё раз. |
| `teamRoster.mark.changed` | The roster was changed on another device and has been read again. The death was not marked: press again. | Состав изменили на другом устройстве, он перечитан. Гибель не отмечена: нажмите ещё раз. |

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-skips.test.mjs` (`POST /api/teams/t1/players/p1/death`):
  - ««Death» asks for a cause; the button waits for it, then says «Mark the death»»: карточка `dead`, поле с подписью «Cause of death» и подсказкой; пусто → «Write the cause of death»; 501 знак → «No longer than 500 characters».
  - «a death marked: one POST with the cause and the revision; he moves to «Fallen», the panel and the list take the server's team; the coach is told» (десктоп): тело `{cause: "Foul", revision: 4}`; ответ 201 `{team: ревизия 5 без Ann, fallen: {id: "f9", player: Ann, …}}` → Ann в «Погибших», `.g-roster__aside[data-panel-player="fallen-f9"]`, `state.myTeams.items[0].revision` 5; следующий «+» TD у Bors — `PATCH` с `revision: 5`; сообщение «Ann: the death is marked»; фокус — `[data-row-key="fallen-f9"]`.
  - «while steps of the roster wait or one is in the air, no death is sent and the button says why» (Review Focus 2): `hold(PATCH)` после «+» TD → кнопка `aria-disabled`, `title` «Wait until your edits are saved», нажатие — сообщение, `POST` нет; то же при `fail(PATCH)` («Waiting for the network»).
  - «a death whose answer was lost: the sheet closes, the roster and the fallen are read, and the coach is told what the server holds» (Review Focus 1): `fail(POST)`; (а) перечитанные состав без Ann и погибшие с ней → «Ann: the death is marked»; (б) состав с Ann → «The death is not on the server: mark it again.»; в обоих `POST` ровно один.
  - «another device's save: the roster is read again and the sheet stays open, saying so; the next press goes on the new revision»: 409 с командой ревизии 6 → шторка открыта, `role="alert"` — «The roster was changed on another device…»; второе нажатие → `revision: 6`.
  - «a refusal is said in the sheet and nothing changes»: 422 `ROSTER_BREAKS_THE_RULES` с `DUPLICATE_PLAYER_ID {names: "Ann, Bo"}` → «Ann, Bo» в шторке, Ann в составе; 404 `PLAYER_NOT_FOUND` → слова и перечитывание.
  - «a second press while the death is on its way sends nothing» (`hold(POST)`).
  - «another tab's coach: no death is sent».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-skips.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — Run: `node --test test/team-roster-skips.test.mjs test/team-roster.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster-skips.test.mjs
git commit -m "feat(roster): a death marked with its cause, only when no step of the roster waits; a lost answer is read back, never sent twice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: «Отменить отметку» на десктопе — подтверждение и возврат

**Files:**
- Modify: `fallen-view.mjs` (кнопка в панели, `undoSheetMarkup`), `marks.mjs` (отмена), `view.mjs` (`sheetMarkup` — `undo`), `wire.mjs`, оба словаря
- Test: `test/team-roster-skips.test.mjs`

**Interfaces:**
- Consumes: `undoDeath`, `fallenWriting` (Task 4); `hold`, `readAgain` (Task 8); `markClosed(…, {direct: true})`; `prepResetWords` (Task 6).
- `fallen-view.mjs`:
  - `fallenPanelMarkup` у ручной отметки передаёт в `fallenProfileMarkup` `undoHtml`: `renderButton({label: t("teamRoster.fallen.undo"), data: {rosterUndo: line.key}})` (с обводкой, во всю ширину) и подсказку `teamRoster.fallen.undoHint`; закрытая (`markClosed(line, screen, {direct: true})`) — `aria-disabled`, `title`, `data-roster-closed`;
  - `undoSheetMarkup({line, mode, busy, refusal, reason}) → string` — `renderSheet({id: UNDO_SHEET, title: t("teamRoster.fallen.undoTitle")})`; тело — `teamRoster.fallen.undoBody` с именем, во время подготовки — `prepResetWords()`, отказ — `role="alert"`; `footStartHtml` — «Оставить» (`data-undo-keep`), `footHtml` — «Вернуть в состав» (`kind: "primary"`, `data-undo-send`, `busy`, при `reason` — `aria-disabled` и `title`).
- `marks.mjs`: `onUndo(key, button)` — у ручной отметки, не закрытой, открывает `{kind: "undo", key, busy: false, refusal: ""}`; `onUndoKeep()` — закрывает (фокус — на «Отменить отметку»); `onUndoSend()` — причина ещё раз; `undoDeath(teamId, line.fallen.id)`:
  - `{team}` — `hold({team, fallen: visit.fallen без записи})`, `memory.selected` — ключ его строки в новом составе (по `id`), шторка закрывается, фокус — на кнопку его строки, `toast(t("teamRoster.fallen.back", {name}))`;
  - `lost` — шторка закрывается, `await readAgain()`; взято — `back`, если записи больше нет, иначе `teamRoster.fallen.undoLost` (`tone: "error"`);
  - `FALLEN_NOT_FOUND` — `readAgain()` и слова; другой отказ — в шторку, она остаётся.
  - `markSheetOf` держит шторку `undo`, пока её строка погибшего есть и это ручная отметка; в матче — открыта с `reason`.
- `wire.mjs`: клики `[data-roster-undo]` (не `aria-disabled`), `[data-undo-keep]`, `[data-undo-send]`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.fallen.undo` | Undo the mark | Отменить отметку |
| `teamRoster.fallen.undoHint` | Marked by mistake? He comes back to the roster and into TV. | Если отметили по ошибке — игрок вернётся в состав и в TV. |
| `teamRoster.fallen.undoTitle` | Undo the mark? | Отменить отметку? |
| `teamRoster.fallen.undoBody` | {name} comes back to the roster: into TV again and onto the list of players for a match. The cause of death is removed. | {name} вернётся в состав: снова войдёт в TV и в список игроков на матч. Причина гибели удалится. |
| `teamRoster.fallen.keep` | Keep | Оставить |
| `teamRoster.fallen.restore` | Back on the roster | Вернуть в состав |
| `teamRoster.fallen.back` | {name} is on the roster again | {name} снова в составе |
| `teamRoster.fallen.undoLost` | The mark is still on the server: undo it again. | Отметка на сервере осталась: отмените её ещё раз. |

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-skips.test.mjs` (десктоп, `DELETE /api/teams/t1/fallen/f1`):
  - «a manual death has «Undo the mark» in the desk panel; a death from a match has the administrator's line instead»: Pike — `[data-roster-undo="fallen-f1"]` и подсказка; Joe — нет кнопки, `teamRoster.fallen.fromMatch`.
  - «the undo asks first: who comes back and to what, «Keep» and «Back on the roster»; «Keep» closes and gives the focus back»: `dialog#roster-undo`, «Undo the mark?», «Pike comes back to the roster…»; `[data-undo-keep]` → шторки нет, фокус на `[data-roster-undo="fallen-f1"]`; `DELETE` нет.
  - «undone: one DELETE, he is back on the roster and stands in the panel; the coach is told»: 200 `{team}` с Pike → Pike в «Активном составе», `data-panel-player` — его ключ; «Fallen 1»; «Pike is on the roster again».
  - «an undo the rules refuse is said in the sheet, and nothing changes» (Review Focus 5): 422 `ROSTER_BREAKS_THE_RULES` с нарушением → его `validation.*` в шторке; 422 `FALLEN_NOT_RESTORABLE` → `error.FALLEN_NOT_RESTORABLE`; Pike в «Погибших».
  - «an undo whose answer was lost is not sent again: the roster is read back and the coach told» (Review Focus 1): `fail(DELETE)`; перечитанные погибшие без `f1` → «Pike is on the roster again»; с `f1` → «The mark is still on the server…»; `DELETE` ровно один.
  - «in a match, while steps wait, or before the games are read, the undo says why and sends nothing» (Review Focus 2): `LIVE_GAME` → «Missed matches and deaths — after the post-match»; `hold(PATCH)` → «Wait until your edits are saved»; игры не прочитаны → «Loading the matches…».
  - «during a preparation the sheet says what a change of the roster resets»: `PREP_GAME` → в теле шторки `prepResetWords()`.
  - «another tab's coach: no undo is sent».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-skips.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster-skips.test.mjs
git commit -m "feat(roster): «Undo the mark» in the desk panel, asked first; a death from a match is the administrator's" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Профиль погибшего на телефоне — адрес игрока

**Files:**
- Create: `src/screens/team/player/index.mjs`, `test/team-player.test.mjs`
- Modify: `src/core/router.mjs` (импорт, `teamPlayer: ({ teamId, playerId }) => renderTeamPlayer(teamId, playerId),`), `marks.css` (страница), оба словаря, `test/team-roster.test.mjs` (утверждение о роутере, около строки 2313), `test/app-boot-roster.test.mjs`

**Interfaces:**
- Consumes: `renderSavedRoster` (`src/screens/saved-roster.mjs`); `readFallen`, `undoDeath`, `fallenWriting` (Task 4); `fallenLines`, `rosterMode` (`model.mjs`); `fallenProfileMarkup`, `undoSheetMarkup`, `fallenWhen` (`fallen-view.mjs`); `markClosed`, `prepResetWords` (`panel.mjs`); `takeAnswerTeam`, `saveState` (`save.mjs`); `loadGames`, `onGamesChange`, `loadMyTeams`; `renderPageHead({phone: true})`, `renderCallout`, `wireSheets`, `patchWithModal`, `drawScreen`, `onScreenLeave`, `teamUrl`.
- Produces: `renderTeamPlayer(teamId, playerId) → Promise<void>` — решение 19:
  - игрок с этим `storedPlayerId` есть в составе команды из `state.myTeams` — `return renderSavedRoster(teamId)` сразу, погибшие не читаются;
  - иначе — страница `<div class="g-fallen-page" data-screen="team-player">` со строкой «Загружаем игрока…», затем `readFallen(teamId)` и `loadGames(true)`; визит ушёл (`onScreenLeave("team-player", …)`) — ничего;
  - отказ чтения — Callout `danger` и «Повторить» (`teamRoster.readAgain`);
  - запись с его id (первая, свежая) — профиль: `renderPageHead({title: name, sub: t("teamRoster.fallen.who", …), phone: true})`, большой серый номер, `fallenProfileMarkup(line, {race, undoHtml})`; `h1` берёт фокус;
  - записи нет — `renderSavedRoster(teamId)`, как до 07b;
  - отмена — та же шторка `undoSheetMarkup` и правила (`markClosed(line, {mode: rosterMode(...), lock, save: saveState(teamId)}, {direct: true})`; замок — «Загружаем матчи…», пока игры не прочитаны); успех — `takeAnswerTeam(team)` (очередь — если держит команду; список — всегда), страница — Callout «<имя> снова в составе» со ссылкой «К составу» (`teamUrl(teamId, "roster")`); потерян — `readFallen` и `loadMyTeams(true)`, исход словами (`back` или `undoLost`); отказ — в шторке;
  - `onGamesChange` перерисовывает (матч начался — отмена закрыта причиной).

Словари: `teamRoster.fallen.loading` — «Loading the player…» / «Загружаем игрока…»; `teamRoster.fallen.toRoster` — «To the roster» / «К составу».

- [ ] **Step 1: Падающие тесты** — `test/team-player.test.mjs` (окружение — как `test/team-roster-skips.test.mjs`; ответы редактора 2.x — как в `test/roster-stage-lock.test.mjs`):
  - «a player of the roster: the 2.x editor, as before, without reading the fallen»: `renderTeamPlayer("t1", "p1")` → сразу `.loading` редактора 2.x в `view`; запросов `…/fallen` нет.
  - «a fallen player's address draws his profile: grey number, name, position · race · fallen, characteristics, how and when, the cause, «Undo the mark», career, skills, the rules line»: `renderTeamPlayer("t1", "d1")` → `[data-screen="team-player"]`, `h1` «Pike» видимый (`.g-pagehead--phone`), `.g-num--fallen.g-num--lg`, «Blitzer · Human · fallen», «marked by hand · …», «Foul by the Raiders», `[data-roster-undo]`, «Career: 6 SPP».
  - «a death from a match: no undo, the administrator's line».
  - «undo from the profile: the sheet, one DELETE, «Pike is on the roster again» and «To the roster»; the list takes the team»: `href` — `#/t/t1/roster`; `state.myTeams.items[0].revision` — из ответа.
  - «an id that is neither on the roster nor among the fallen: the 2.x editor».
  - «a list of the fallen that cannot be read says so and reads again on «Try again»».
  - «in a match the undo says why; the page follows the games»: `LIVE_GAME` пришёл после отрисовки → кнопка `aria-disabled` с «Missed matches and deaths — after the post-match».
  - «an undo whose answer was lost on the profile is read back and told».
  - «a visit left before the fallen are read draws nothing».
  - `test/team-roster.test.mjs`, тест о роутере: `teamPlayer: ({ teamId, playerId }) => renderTeamPlayer(teamId, playerId),` вместо строки 2.x; название — «the player's address: a fallen player's profile, else the 2.x editor until stage 07d».
  - `test/app-boot-roster.test.mjs`: «a fallen player's address draws his profile» — страница на `#/t/t1/roster/d1`, ответы `/api/teams/t1/fallen` и `/api/games` → `[data-screen="team-player"]`; `api.assertAnswered()`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-player.test.mjs test/app-boot-roster.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка: «The player's own address (`#/t/:id/roster/:playerId`). A player of the roster still gets the 2.x editor until stage 07d moves his profile here; a fallen player of the team gets his profile (spec UI §9, PlayerDead): how and when he fell, the cause, and for a death a coach marked, «Undo the mark», asked first. An id that is neither is the 2.x editor's, as it was.» CSS страницы — в `marks.css` (`.g-fallen-page` — колонка шириной до 640px с отступами `var(--space-16)`).
- [ ] **Step 4: Тесты** — шаг 2 и `node --test test/team-roster.test.mjs test/shell-navigation.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/player src/core/router.mjs src/screens/team/roster/marks.css src/i18n/en.json src/i18n/ru.json test/team-player.test.mjs test/team-roster.test.mjs test/app-boot-roster.test.mjs
git commit -m "feat(roster): a fallen player's profile at his own address, with «Undo the mark»; a player of the roster still gets the 2.x editor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Mock API для снимков этапа

**Files:**
- Create: `scripts/mock/fallen.mjs`
- Modify: `scripts/mock/roster.mjs` (в начале `answerRoster` — `const fallen = await answerFallen(request, pathname, mock); if (fallen) return fallen;`, шапка — строка о погибших), `scripts/mock-api.mjs` (два игрока `t1` **на месте**, без новых строк)

**Interfaces:**
- Produces (`scripts/mock/fallen.mjs`, по образцу `scripts/mock/treasury.mjs` — `reply`, `refuse`, `savedElsewhere` с командой):
  - `answerFallen(request, pathname, mock) → Promise<{status, payload}|null>`:
    - `GET /api/teams/:id/fallen` — `{fallen}` свежие первыми; у `t1` — две записи: `f1` — Blitzer Eight (`p8`, `rowIndex: 2`, `spp: {touchdowns: 2}`), причина «Foul by the Grimtusk Raiders, Casualty 15», ручная, три дня назад; `f2` — Linewoman Nine (`p9`, `rowIndex: 0`), причина `null`, `fromMatch: true`, `roundNumber: 2`; у остальных команд — `[]`; команды нет — 404 `TEAM_NOT_FOUND`;
    - `POST /api/teams/:id/players/:pid/death` — причина 1…500 после `trim` (иначе 400 `FIELD_INVALID {field: "cause"}`), ревизия не команды — 409 с командой, игрока нет — 404 `PLAYER_NOT_FOUND`; иначе игрок уходит из `roster.players` (и из счёта `roster.roster`), ревизия + 1, запись — первой, 201 `{team, fallen}`;
    - `DELETE /api/teams/:id/fallen/:fid` — нет записи — 404 `FALLEN_NOT_FOUND`, из матча — 403 `FALLEN_FROM_MATCH`, в составе уже 14 игроков — 422 `ROSTER_BREAKS_THE_RULES`; иначе игрок возвращается в конец состава, ревизия + 1, запись уходит, 200 `{team}`.
- `scripts/mock-api.mjs`, амазонки `t1`: `Linewoman Six` — `{ skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, niglingInjury: true }`; `Blitzer Seven` — `{ skipNextGame: true, absence: { code: "other", note: "Suspended by the league" } }` (в той же строке `playerOf(…)`; `wc -l` остаётся 599).

- [ ] **Step 1: Запустить mock и проверить ответы** (`MOCK_PORT=5172`, Bash `run_in_background: true`; ждать until-циклом `curl -fsS http://localhost:5172/api/health`):

```bash
MOCK=http://localhost:5172; H='Authorization: Bearer mock'
curl -fsS -H "$H" $MOCK/api/teams/t1/fallen | node -e 'process.stdin.on("data",d=>{const f=JSON.parse(d).fallen;console.log(f.map(x=>[x.id,x.fromMatch,x.player.name].join(":")).join(" "))})'
curl -s -o /dev/null -w "%{http_code}\n" -H "$H" -X DELETE $MOCK/api/teams/t1/fallen/f2
curl -s -H "$H" -X POST -d '{"cause":" ","revision":1}' $MOCK/api/teams/t1/players/p1/death
curl -fsS -H "$H" $MOCK/api/teams/t2/fallen
```

Expected: `f1:false:Blitzer Eight f2:true:Linewoman Nine`; `403`; `{"error":{"code":"FIELD_INVALID",…"field":"cause"…}}`; `{"fallen":[]}`. Затем запись и отмена: `POST …/players/p1/death` с причиной и ревизией `t1` → 201, `GET …/fallen` — три записи; `DELETE` новой записи → 200, Linewoman One снова в `GET /api/teams/t1`. Mock остановить.
- [ ] **Step 2: Браузер** (встроенный, mock 5172, тренер со `storage` `{"gata-league-auth-token": "mock"}`): `#/t/t1/roster` на 390 и 1440 — три секции; клик по `p6` — «Вернуть в состав»; `#/t/t1/roster/p8` — профиль погибшего. Что видно — в отчёт задачи.
- [ ] **Step 3: Проверки** — `npm run build && . output/07b/env.sh && npm test && npm run check` → PASS; `wc -l scripts/mock-api.mjs` → `599`.
- [ ] **Step 4: Commit**

```bash
git add scripts/mock/fallen.mjs scripts/mock/roster.mjs scripts/mock-api.mjs
git commit -m "test(mock): a team's fallen, a death and its undo; two of Mock Team's players miss the next match" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Снимки этапа (контроллер)

Протокол этапа, шаг 6: каждый экран этапа на 390 и 1440, светлая и одна тёмная палитра, все состояния `SCREENS.md` этапа, выборочно 768 и 1024. Файлы — в `output/screens/rd-07b/` (не коммитятся), в PR — загрузкой.

**Files:**
- Create: `docs/redesign/screens/rd-07b.json`

- [ ] **Step 1: Серверы.** Порты свободны: `lsof -iTCP:3072 -iTCP:5172 -sTCP:LISTEN || echo free`. Mock в фоне: `MOCK_PORT=5172 node scripts/mock-api.mjs`. Реальный сервер — рецепт С. Mock держит записи в памяти: состояния, которые пишут (F12, F13), идут последними; после них mock перезапускается.
- [ ] **Step 2: `rd-07b.json`** — как `docs/redesign/screens/rd-07a.json` (`widths` `[390, 1440]`, те же `heights` и варианты), адреса на `5172`; клик по игроку — по кнопке строки (`[data-row-key^="p1#"]`, `[data-row-key="fallen-f1"]`); действия — внутри видимой на ширине копии (`.g-rtable__panelrow` до 900, `.g-roster__aside` от 901); ввод причины — `const f = document.querySelector('#mark-text'); f.value = '…'; f.dispatchEvent(new Event('input', {bubbles: true}));`.

| id | адрес | действие | ширины | что проверяет |
|---|---|---|---|---|
| F1 | `#/t/t1/roster` | — | + 768, 1024, `fullPage` | «Весь экран с пропусками и погибшими» (`StatsInjured`, `DeskRosterInjured`) |
| F2 | `#/t/t1/roster` | Linewoman One, «Пропуск матча…», `lasting`, чип `ma` | | «Пропуск матча» (`StatsMng`) |
| F3 | `#/t/t1/roster` | Linewoman One, «Пропуск матча…», `dead`, причина | | «Отметка гибели» (`StatsMngDead`, `DeskRosterDeath`) |
| F4 | `#/t/t1/roster` | клик `fallen-f1` | 390, `fullPage` | раскрытая строка погибшего |
| F5 | `#/t/t1/roster` | клик `fallen-f1` | 1440 | панель погибшего с «Отменить отметку» |
| F6 | `#/t/t1/roster` | клик `fallen-f2` | 1440 | гибель из матча: строка про админа |
| F7 | `#/t/t1/roster/p8` | — | | «Профиль погибшего» (`PlayerDead`) |
| F8 | `#/t/t1/roster/p8` | «Отменить отметку» | | «Отмена отметки» (`PlayerDeadConfirm`) |
| F9 | `#/t/t1/roster` | `ru`, `fullPage` | 390 | кириллица секций и причин |
| F10 | `#/t/t1/roster` | клик `p6` | | «Вернуть в состав» в строке и в панели |
| F11 | `#/t/t2/roster` | клик `q4` | 1440 | матч: ни «Пропуска матча…», ни «Вернуть в состав» |
| F12 | `#/t/t1/roster` | Linewoman One, `miss`, «Отметить пропуск» | | после записи: она в «Пропускают матч» — последним |
| F13 | `#/t/t1/roster/p8` | «Отменить отметку», «Вернуть в состав» | 390 | «… снова в составе», «К составу» — последним |
| G1 | `http://localhost:3072/#/t/x/roster/y` | — | 390 | гость идёт ко входу |

- [ ] **Step 3: Снять** — `npm run screens -- docs/redesign/screens/rd-07b.json --out output/screens/rd-07b` → `… PNG(s) written …, 0 not taken`; ошибки браузера — в `errors.json` (ожидаемых нет).
- [ ] **Step 4: Сверка с прототипами** (`output/screens/rd-07b/index.html` рядом с прототипами `SCREENS.md`). Поломка — текст ниже 4.5:1, перенос плашки или подписи, горизонтальная прокрутка страницы на 390, нажимаемое меньше 44px, шрифт без кириллицы, лишняя ошибка в консоли, неработающее действие, два `h1`. Не поломка — данные mock и решения 10–20. Исправление — минимальное, с тестом, где он пишется; полный прогон; `--only <ids>`; отдельный коммит `fix(roster): <что> on <экран>` с трейлером.
- [ ] **Step 5: Реальный сервер вручную** (встроенный браузер, 3072; тестовые значения — из `scripts/seed-pre-match-preview.mjs`, база — `gata_smoke_07b`): войти тренером `preview-home`, открыть состав его команды;
  - «Пропуск матча…» → «Стойкая травма», AG → `PATCH` 200; «Вернуть в состав» → `PATCH` 200;
  - «Пропуск матча…» → «Смерть», причина → `POST …/death` 201; в базе: `. output/07b/env.sh && psql "$SMOKE_URL" -Atc "SELECT player->>'name', cause, from_match FROM team_fallen_players ORDER BY died_at DESC LIMIT 1"` → `<имя>|<причина>|f`;
  - выбрать погибшего (десктоп) → «Отменить отметку» → «Вернуть в состав» → `DELETE` 200; тот же `psql` — строки нет, игрок снова в составе;
  - выйти. Что увидено и вывод `psql` — в `output/07b/real-server.txt` для PR.
- [ ] **Step 6: Commit**

```bash
git add docs/redesign/screens/rd-07b.json
git commit -m "test(screens): stage 07b states — the skips and the fallen, the missed-match sheet, a death, a fallen player's profile and its undo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Финальное ревью, правки спек и проверки перед PR (контроллер)

- [ ] **Step 1: Финальное ревью ветки** — шаг 7 протокола (skill requesting-code-review), с упором на Review Focus и инварианты 07a из Global Constraints. Исправления — отдельными коммитами.
- [ ] **Step 2: Правки спек под решения этапа** (PR-CHECKLIST: «Если реализация разошлась со спецификацией — спецификация поправлена в том же PR»), по ответам на вопросы 1–4:
  - **Спека 3.0:**
    - §2, таблица «До своего этапа»: `#/t/:teamId/roster` — «пропуски и павшие — 07b»; `#/t/:teamId/roster/:playerId` — игрок состава — редактор 2.x до 07d, погибший команды — его профиль 3.0 (07b); «Состав» ведёт в 2.x за наймом, продажей, прокачкой, номером, именем и капитаном (пропуск и гибель — уже в «Составе»);
    - §3.3: ручная отметка делает с игроком то же, что травма итогов (вопрос 1), «Вернуть в состав» последствия не снимает; временный уход до конца сезона ею не снимается (вопрос 2); гибель и отмена не уходят, пока ждут правки состава;
    - §6, строка «Состав · …»: модули 07b (`marks`, `mark-sheet`, `fallen`, `fallen-view`, `screens/team/player`);
    - §7: блок «Расхождения этапа 07b» (прав код) — секции отдельными таблицами со своей шапкой (в `DeskRosterInjured` — строки-разделители одной таблицы), нижняя шапка одна в конце; слова причин — как у травмы 07a («Стойкая травма (MA)», без «· NI», без чипа «Niggling Injury»); подписи причин без «Casualty 9–10»; причина гибели — одна строка до 500 знаков; ручная гибель — дата, а не «после тура N» (вопрос 3); профиль погибшего на телефоне — под шапкой команды; гибель пропускающего — через возврат (вопрос 4); карьера погибшего — SPP, по матчам — 07e; в матче ряд действий не рисуется, отмена закрыта причиной.
  - **Спецификация интерфейса:** §6 — «пропускающие — в своей секции (07b)» вместо «в таблице все игроки состава, пропускающие тоже»; §9 как построено (решения 10–20); «Известные расхождения» — те же пункты блоком «Расхождения этапа 07b».

```bash
git add docs/superpowers/specs/2026-10-14-redesign-design.md docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md
git commit -m "docs(spec): stage 07b — the skips and the fallen as built" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Шаг 8 протокола**

```bash
npm run build && . output/07b/env.sh && npm test && npm run check && npm run i18n:check
APP_URL=http://localhost:3072 npm run smoke
. output/07b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3072 npm run smoke:post-match
git diff --name-only --diff-filter=d origin/redesign -- src | xargs grep -nE ">[A-ZА-Я]" || true   # только комментарии и ключи t()
python3 -c "import json,sys
for f in ('src/i18n/en.json','src/i18n/ru.json'):
    seen=set()
    def hook(pairs):
        for k,_ in pairs:
            assert k not in seen, f'duplicate key {k} in {f}'; seen.add(k)
        return dict(pairs)
    json.load(open(f,encoding='utf-8'),object_pairs_hook=hook)
print('i18n keys unique')"
python3 - <<'PY'
import json, subprocess
old = json.loads(subprocess.run(["git", "show", "origin/redesign:src/i18n/en.json"], capture_output=True, text=True, check=True).stdout)
en = json.load(open("src/i18n/en.json", encoding="utf-8"))
ru = json.load(open("src/i18n/ru.json", encoding="utf-8"))
new = [key for key in en if key not in old]
print(len(new), "new keys; missing in ru:", [key for key in new if key not in ru])
print("outside the stage's spaces:", [key for key in new if not key.startswith(("teamRoster.mark.", "teamRoster.skips.", "teamRoster.fallen."))])
PY
git diff --stat origin/redesign -- content/ server/ src/screens/saved-roster.mjs src/components/roster-editor/   # пусто
git diff --name-only origin/redesign -- server/db/migrations/   # пусто
wc -l src/screens/team/roster/index.mjs src/screens/team/roster/roster.css scripts/mock-api.mjs src/app.js
```

Expected:
- всё зелёное; одинаковое число страниц EN/RU, 0 fallback; `smoke` и `smoke:post-match` — `passed`;
- `i18n keys unique`; `missing in ru: []`; вне пространств этапа — `[]`;
- `content/`, `server/`, редактор 2.x и миграции не менялись;
- `index.mjs` ≤ 600, `roster.css` 554, `scripts/mock-api.mjs` 599, `src/app.js` ≤ 120.

- [ ] **Step 4: `PR-CHECKLIST.md` целиком** — особенно:
  - «Миграции…» — нет миграций;
  - «Новые коды ошибок — в `API_ERRORS`» — новых нет (коды гибели — этапа 03);
  - «Перенесённый экран удалил свой старый CSS и модуль» — нет: редактор 2.x рисует `teamPlayer` для игроков состава и `adminTeamEdit` (решение 22), сказать в PR;
  - снимки 390 и 1440, 768 и 1024.

---

### Task 14: PR и после слияния (контроллер)

- [ ] **Step 1: Ребейз**, если в `redesign` что-то влито с начала этапа: `git fetch origin && git rebase origin/redesign`, конфликты в словарях — объединение, затем Task 13, шаг 3 заново.
- [ ] **Step 2: Тело PR** (`<scratchpad>/pr-rd-07b.md`):
  - пункт 7b плана 3.0 — все три подпункта; дополнение мастер-плана (`GET`/`DELETE …/fallen`, отмена не при `fromMatch`);
  - таблица «Как идёт каждая запись» и что делает потерянный ответ;
  - «Решения этого плана» коротко и ответы владельца на четыре вопроса (или «по умолчанию»);
  - таблица «Маршруты этапа 07b»;
  - вывод Task 13, шаг 3, и ручная проверка реального сервера (`output/07b/real-server.txt`);
  - снимки F1–F13, G1 (загрузкой);
  - расхождения макета с кодом и как решены (Task 13, шаг 2, §7);
  - общие файлы, которые 07b тронул: `src/ui/roster-table.mjs` (`foot`), `src/ui/number-badge.*` (`fallen`), `src/domain/post-match/roster.mjs` (`applyInjuryEffects`, поведение то же), `src/domain/roster/schema.mjs` (`export`);
  - правки спек; «Передача дальше»;
  - строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin rd/07b-skips-fallen
gh pr create --base redesign --head rd/07b-skips-fallen --title "rd/07b: the roster's skips and the fallen — a missed match with its reason, a death with its cause, the fallen player's profile and its undo" --body-file <scratchpad>/pr-rd-07b.md
gh pr merge <номер> --merge
```

После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **Step 3: После слияния** (шаг 10 протокола): в плане 3.0 пункт 7b → `[x]`; строка «07a–07e» мастер-плана остаётся `[ ]` до 07e; коммит `docs(plan): stage 07b done` в следующей ветке или прямым коммитом в `redesign`; `git worktree remove ../bb-rd-07b`; база `gata_smoke_07b` — `dropdb`.

---

## Передача следующим этапам

- **07c · найм и продажа.**
  - «Продать» — в `actionsMarkup` (`panel.mjs`), рядом с «Пропуском матча…»: тот же ряд `.g-roster__actions`, та же закрытость в матче (`markClosed`), стили — `marks.css` (`roster.css` у предела, 554 строки).
  - «+» найма — слот `headLeadHtml` первой таблицы (`layoutMarkup`); у секций его нет.
  - Продажа — изменение блоба (игрок уходит, казна растёт): запись строки — по образцу `markSkip` в очереди `save.mjs` (журнал 08 разложит разницу сам, `classifyTreasuryChange`); снятые в матче продажи — к подсчёту `reloadRoster` (R8), как `markEdits`.
  - Погибшего не продают сами данные: его нет в составе.
  - Передачи 11 и 06, взятые от 07a: `renderRosterStatGrid` и мёртвый `CREATE_MODE` редактора 2.x.
- **07d · профиль, редактирование, прокачка.**
  - `renderTeamPlayer` (`src/screens/team/player/index.mjs`): ветка игрока состава переходит с редактора 2.x на профиль 07d; ветка погибшего остаётся; `fallenProfileMarkup` — готовое тело.
  - Niggling Injury и «−1 от травмы» в профиле (сейчас их видно только в причине пропуска); правка характеристики после ошибочной стойкой травмы.
  - Шапка игрока `PlayerDead` / `PlayerProfile` — для обоих.
- **07e · карьера по матчам.** `GET …/players/:pid/history` отвечает и для погибшего (игрок не обязан быть в составе): карьера в его профиле и панели заменяет строку «Карьера: N SPP».
- **09b · итоги.** Итоги ставят травму через `applyInjuryEffects` (одно правило с ручной отметкой); гибель из итогов — запись `from_match`, которую «Состав» уже показывает без отмены.
- **12 · админка.** Отмена гибели из матча (админ может, `DELETE …/fallen/:fid`); «Добавить погибшего задним числом» пишет полный снимок (`id`, `rowIndex`), иначе строка нарисуется «голой»; снятие временного ухода до конца сезона (вопрос владельцу 2), если владелец не ответит «возврат снимает».
- **13 · зачистка.** Многострочное поле в `src/ui` для причин; одна полоса заголовка «Состава»; глоссарий: «Пропускают матч», «Погибшие», «Отметить гибель», «Отменить отметку», «Временный уход до конца сезона».
- **Любой этап.** `renderRosterTable({foot})`, `renderPlayerBadge({fallen})`; `applyInjuryEffects`, `markAbsence`, `clearAbsence`, `markEdits` (`src/domain/roster/absence.mjs`); `readFallen`, `markDeath`, `undoDeath` (`src/screens/team/roster/fallen.mjs`).

## Охват

| Пункт | Задача |
|---|---|
| План 3.0, 7b: «Пропуск матча…» с причинами из `INJURIES`, «Вернуть в состав» | 1, 3, 7 (решения 1, 2, 10–12) |
| План 3.0, 7b: отметка гибели с причиной; секции «Пропускают матч» и «Погибшие» | 4, 6, 8 (решения 3, 5, 6, 13–15) |
| План 3.0, 7b: профиль погибшего, «Отменить отметку» с подтверждением, только ручная | 9, 10 (решения 4, 17, 19, 20) |
| Мастер-план 07a–07e, «Из 03, 07b»: `GET`/`DELETE …/fallen`; отмену не показывать при `fromMatch` | 4, 6, 9, 10 |
| 05–13: закрытое говорит причину по нажатию (`data-roster-closed`) | 7, 9 |
| 05–13: Sheet — фокус на открывшего после перерисовки, `pointerdown`, блокировка прокрутки | 7–10 (`wireSheets`, `openerOf`) |
| 05–13: радиогруппы не перерисовывать `innerHTML`; одна проводка на корень | 7 (`wire.mjs`) |
| 05–13: Callout — короткие подписи действий («К составу», «Повторить») | 6, 10 |
| 05–13: проверка словаря видит только `t("…")` — шаблонные ключи перебирать | Global Constraints (новых шаблонных нет); 6–10 (`assertDictionaryCovers`) |
| Спека 3.0 §0.8: блоб меняется аддитивно (`absence` — поле `schema.mjs`) | 1, 3 |
| Спека 3.0 §0.11: в матче состав закрыт | 7, 8, 9, 10 (решение 7) |
| Спека 3.0 §0.13: ничего не удаляется — погибший хранится строкой | 4, 8 (маршрут 03) |
| Спека 3.0 §3.3: `absence`, ручная отметка, «Вернуть в состав», гибель и отмена, `from_match` | 1–4, 7–10; правка §3.3 — 13 |
| Спека 3.0 §4: `GET …/fallen`, `POST …/death {cause, revision}`, `DELETE …/fallen/:fid`, `FALLEN_*` | 4, 8, 9 |
| Спецификация интерфейса §9 | 6–10; снимки 12; правка — 13 |
| Спецификация интерфейса §6 (пропускающие в таблице), §7, §8 | 6, 7 (замки, R8); правка §6 — 13 |
| SCREENS.md «Состав · Пропуски и погибшие» (М: `StatsInjured`, `StatsMng`, `StatsMngDead`, `PlayerDead`, `PlayerDeadConfirm`; Д: `DeskRosterInjured`, `DeskRosterDeath`) | 6–10; F1–F13 |
| Передача 07a → 07b: «Пропуск матча…» в строке и панели; секции — тот же RosterTable | 6, 7 |
| Финальное ревью 07a: тесты 07b — в новом файле | Global Constraints; 6–10 |
| Передача 08: `normalizeDraft` на каждом `PATCH` 3.0 | 3 (поля игрока — в `normalizeRosterPlayer`, теряться нечему) |
| План 3.0, этап 7: удалить `saved-roster.mjs` и `roster-editor/*` по мере переноса | не 07b: редактор 2.x ещё рисует `teamPlayer` и `adminTeamEdit` (решение 22) |
| Протокол: шаги 6–10 | 12, 13, 14 |
| Правила проекта: бюджеты, `check-references`, CSP, `escapeHtml`, 900/901, 44px, явная типографика, `content/` не меняется | Global Constraints; 13 |

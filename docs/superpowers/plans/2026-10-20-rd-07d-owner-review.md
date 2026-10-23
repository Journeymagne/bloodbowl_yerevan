# Этап 07d · Дополнение: замечания владельца к compare.html — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** четыре замечания владельца к промежуточному `compare.html` этапа 07d (2026-10-20) сделаны до снимков и PR: (1) случайный навык — «два годных, выбрать»: сайт бросает два D16 сразу, оба навыка у игрока отсутствуют и различны, тренер берёт один; за столом тренер отмечает два выпавших навыка и берёт один; после броска «Бросить D16» нет, списка попыток нет нигде; (2) «Отменить последнюю прокачку» уходит из профиля телефона и панели десктопа в «Исправить вручную»; (3) блок «Карьера» с раскрытием — в профиле телефона после «Навыков» (`PlayerCareer.html`); (4) поиск в полосе «Состава» на десктопе (`DeskRoster.html`): набор сужает таблицу, строка «Искать в справочнике: …» ведёт в справочник с запросом.

**Architecture:** дополнение к плану `docs/superpowers/plans/2026-10-19-rd-07d-profile.md` («план 07d»), той же ветки и той же нумерации задач: Task 20–26, затем контроллер повторяет Task 17–19 плана 07d. Два кубика — новый формат результата броска `result: {dice: [...]}` в той же `jsonb`-колонке `dice_rolls.result` (миграция 012): миграции нет; старый формат (один кубик, `result.skill`) читается как один кубик, поэтому тесты этапа 03 и строки dev-баз остаются верны. Сервер меняется в одном месте — `heldSince` (`stale`); `settleRosterRolls` принимает навык любого из двух через доменный `rollFitsAdvancement`. Отмена прокачки — тот же шаг очереди `undoAdvancement` и то же окно-вопрос, открывается из «Исправить вручную». Карьера — чтение `GET /api/teams/:id/players/:pid/history` (есть с этапа 03), один раз за визит профиля; ничего не пишет. Поиск — память страницы «Состава» (`memory.query`) и фильтр строк при рисовании; ничего не пишет.

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/fake-dom.mjs`, `fake-api.mjs`, `ui.mjs`, `contrast.mjs`, `roster-page.mjs`, `api-db.mjs`; CSS custom properties; `scripts/mock-api.mjs`, `scripts/smoke-api.mjs`.

**Spec:**
- План 07d — «Решения этого плана», «Как идёт каждая запись», Interfaces задач 1, 4, 9–11, 13, 16 (на них опирается каждая задача ниже). Это дополнение меняет решения 3, 9, 11, 12, 18, 19 (см. «Что меняется в решениях плана 07d»).
- Рабочая папка этапа `.superpowers/sdd/2026-10-19-rd-07d-profile/`: `rulings.md` (K1–K29 и передачи задач — в силе, кроме K19: классы отмены в профиле и панели уходят вместе с ней), «Ruling:» в `progress.md`, раздел «Owner review of the interim compare.html» в `progress.md` (замечания и ответы владельца дословно — обязательны), `constraints.md`, `parked.md`, `final-review.md`.
- Ответы владельца 2026-10-20 (AskUserQuestion, обязательны): **случайный навык** — «Два годных, выбрать»; **отмена** — «Спрятать в ручную правку»; **карьера** — «Только телефон»; **поиск** — «Фильтр + справочник». Расхождения с прототипами, которые они создают, — в §7 (Task 18 плана 07d).
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0.2, §3.4, §9.5 (их правит Task 18 по этому дополнению); спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §6 («Поиска в полосе нет (этап 13)» — меняется), §12, §13, §24–26 (поиск справочника: «Набор в полосе вне `#/ref` переносит на `#/ref` с тем же запросом и кареткой в поле»).
- Прототипы (значения в задачах прочитаны из их HTML): `mobile/Adv3Random.html`, `desktop/DeskRosterAdv.html` (один результат; двойной блок — решение владельца, §7), `mobile/Adv3Stat.html` (карточка выбора: радиус 12, кольцо, заливка выбранной), `mobile/Player.html`, `desktop/DeskRoster.html` (отмены нет), `mobile/PlayerCareer.html` (карьера), `desktop/DeskRoster.html` (поле поиска в шапке).
- Код (проверено на `ccad99c`): `server/api/dice-rolls.mjs` (`rollForPlayer`, `heldSince`, `settleRosterRolls`, `checkRolls`), `server/routes/player-history.mjs`, `server/season/player-history.mjs`, `src/domain/post-match/history.mjs` (`playerHistory`: строки `{pairingId, played, source, counters, injury, pending}` и поля матча `{kind, seasonId, roundNumber, status, opponent, score}`), `src/domain/roster/dice.mjs`, `src/screens/team/roster/*`, `src/screens/ref/{frame,memory,search}.mjs`, `src/ui/{search-field,page-head,die}.mjs`.

## Global Constraints

- **Весь блок Global Constraints плана 07d** (`2026-10-19-rd-07d-profile.md`, раздел «Global Constraints») и `constraints.md` рабочей папки — в силе для каждой задачи ниже: ветка `rd/07d-profile` в `/Users/felstell/git/bb-rd-07d`, окружение `output/07d/env.sh`, серверы 3074 / 5178, инварианты «Состава» 07a–07c (R1–R18, K6/K7/K14), D2, токены цвета, CSP, `t()` и оба словаря, `escapeHtml`, бюджеты, ловушка `check-references`, брейкпоинты 900/901, явная типографика нового CSS, радиогруппы, `content/` не меняется, рецепты Т/С/М, стоп-условия, коммит с трейлером `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Ниже — только то, что дополнение добавляет или меняет.
- **HEAD движется:** другой агент коммитит в ту же ветку. Каждая задача начинает с `git log --oneline -3` и `git status --short`; ссылки в задачах — по именам функций, номера строк — подсказки. Чужие незакоммиченные правки не трогать и не коммитить.
- **БЛИЗОСТЬ К ПРОТОТИПАМ обязательна:** значения размеров, шрифтов, радиусов, отступов и цветов — из HTML названного прототипа (цвет — токеном, как в плане 07d). Каждое вынужденное отличие (D2, контраст 4.5:1, нейтральные слова, перенос вместо «…», решение владельца без макета) записывается в отчёт задачи разделом «Deviations from the prototype» с причиной — Task 18 переносит их в §7.
- **D2:** до 900px нажимаемое от 44px; от 901px — как в прототипе, не меньше 24px. **Слова** про игрока нейтральные в обоих словарях (без «он/его», без причастий и прошедшего времени в роде игрока: прототипное «не играл» → «пропуск матча»). **Переносы:** длинные строки карточек и строк переносятся, `text-overflow: ellipsis` в новых правилах нет.
- **Ключи словарей** — только в `teamPlayer.*`, `teamAdvance.*`, `teamRoster.search.*` и `teamSettings.*` (последнему здесь нечего добавлять), в обоих словарях, с одинаковыми плейсхолдерами. Ключи, которые 07d завёл и которые теперь никто не говорит (`teamAdvance.attempts`, `teamAdvance.attempt.*`, `teamAdvance.rerolled`), удаляются: на `origin/redesign` их не было, проверка «удалённых нет» Task 18 их не видит.
- **Пределы строк:** `src/screens/team/roster/save.mjs` 559/560 — ни одна задача дополнения его не трогает (если всё же придётся — сначала отдельный коммит переноса шагов игрока в `src/screens/team/roster/player-steps.mjs`, ruling Task 8); `roster/index.mjs` ≤ 560 (дополнение добавляет не больше 10 строк: ≤ 554 после Task 25); `panel.mjs` ≤ 560 (Task 23 только убирает); `scripts/mock-api.mjs` 599 — не трогается (новые ответы mock — в `scripts/mock/*`); любой файл ≤ 600, функция ≤ 80 строк, 0 недостижимых функций.
- **Сервер:** одна правка — `heldSince` и шапка модуля в `server/api/dice-rolls.mjs` (Task 20). Ни нового маршрута, ни миграции, ни правки `settleRosterRolls`/`checkRolls` (их держит доменный `rollFitsAdvancement`). Иное — стоп-условие.
- **Ruling’и рабочей папки в силе:** K8 (броски по порядку выдачи, отмена с последней, `tableAdvancementFor` — только после последней прокачки с сайта), K15 (каждая запись спрашивает закрытость в момент нажатия; `options.closed` обязателен), K16 (`DICE_ROLL_MISMATCH` словами), K25 (`panel.mjs` ≤ 560), K28 (`line.offers === null` — «неизвестно»), ruling Task 8 (общая рамка шторок `.g-player-sheet` в `player-sheets.css`, `className` у `renderSheet`), ruling Task 10 (`radioGroupMarkup` из `radio-group.mjs`; тесты: `assert.ok(!el)`, не `assert.equal(el, null)`). **K19 отменяется:** `.g-roster__undo` (`frame.css`) и `.g-profile__undo` (`profile.css`) уходят вместе с отменой из профиля и панели (Task 23).
- **Чтение карьеры и поиск ничего не пишут:** ни шага очереди, ни `PATCH`; во время матча и подготовки работают как вне их.

## Review Focus

1. **Навык второго кубика на реальном сервере.** Тренер взял навык второго кубика, сеть оборвалась после записи. Ожидание: повтор несёт тот же `roll.id`, 409 со своим составом — это успех; сервер признаёт навык любого из двух (`rollFitsAdvancement`), навык ни одного из двух — 422 `DICE_ROLL_MISMATCH`; бросок использован один раз и освобождается отменой. Тесты: Task 20 «a random advancement takes either die's skill; a skill neither die rolled is DICE_ROLL_MISMATCH» (БД); Task 26 smoke «a random skill is two dice …, an advancement takes the second; undone, the roll is the player's again».
2. **Один из двух навыков стал у игрока между броском и взятием** (взят прокачкой за столом, добавлен ручной правкой). Ожидание: бросок годен, карточка того кубика закрыта словами «уже есть», второй берётся; оба у игрока — `stale`: слова, «Бросил за столом» открыт, привязка к прокачке за столом, если она есть. Тесты: Task 20 «two dice: stale only when the player has both; the table advancement of either is found»; Task 21 «a die whose skill the player has come to hold is closed, the other taken; both held — the stale roll's words and the table open».
3. **Отмена из ручной правки, когда форма правки изменена, идёт матч или последняя прокачка сменилась под окном-вопросом.** Ожидание: «Отменить последнюю: …» закрыта словами («Сначала сохраните или отмените правку»), ничего не уходит; окно-вопрос, под которым сменилась прокачка, закрывается со словами (`undoSheetOf`, как было); после «Оставить» и после отмены фокус — на карандаше. Тесты: Task 23 «the undo is closed while the fix's form is changed, saying so; nothing opens», ««Keep» and a sent undo give the focus back to the pencil».
4. **Карьера, когда история не пришла, долго идёт или почти пуста** (новый игрок, матчи до записей сайта, матч в игре). Ожидание: итоги рисуются из состава сразу, GP — «–» до ответа; раскрытый список говорит «Читаем матчи…», «Матчи не прочитаны: …» (следующее раскрытие читает снова) или «Матчей пока нет»; матчи до первого, где сайт знает игрока, не показываются; ничего больше в профиле не ждёт чтения. Тесты: Task 24 «a read that failed: the totals stand, GP «–», the list says why; opening it again reads again», «matches before the first one the site knows the player in are not listed».
5. **Поиск, который не находит никого, находит только пропускающего или погибшего, прячет выбранного игрока; Esc; узкое окно.** Ожидание: секции без найденных не рисуются, «Активный состав» говорит, что никого нет, счёт найденных слышит экранный диктор; панель — первый найденный, а очищенный запрос возвращает выбранного; Esc очищает, фокус в поле; до 900px поля нет и запрос ничего не фильтрует. Тесты: Task 25 «the count is said in a live region; a query that finds nobody says so under «Active roster» and draws no other section», «the panel shows the first player found when the chosen one is filtered out, and the chosen one again once the query is gone», «a phone has no field, and a query kept from a desk filters nothing there».

---

## Решения этого дополнения

Нумерация продолжает «Решения этого плана» плана 07d (последнее — 31). Контроллер подтверждает до исполнения.

**Случайный навык: два годных, выбрать один** (ответ владельца 1)

32. **Формат броска — `result: {dice: RolledDie[]}`** в той же колонке `dice_rolls.result jsonb` (012: «`result` is everything that came up»); `RolledDie = {attempts: {roll, skill: string|null, duplicate: boolean, twin?: true}[], skill: string}`. Миграции нет: на проде бросков нет (редизайн не выкачен), формат — содержимое JSON. Бросок старого формата (`{attempts, skill}`, один кубик) читается как один кубик (`rolledDice`): так остаются верны ~50 тестов этапа 03 (`test/roster-rolls-verify.test.mjs`) и строки dev-баз (`gata_smoke_07d` после Task 17).
33. **Второй кубик** перебрасывает пустую грань, навык, который у игрока есть (`duplicate: true`), и навык первого кубика (`twin: true`, `duplicate: false` — это не навык игрока, и `skillsRerolledAgainst` его не считает). Попытки каждого кубика хранятся целиком (честная запись, защита от «руления» кубиком `rerollsHeldBy` — по попыткам обоих кубиков), но **нигде не показываются** (ответ владельца: списка попыток нет).
34. **Один свободный навык в колонке — один кубик**, без выбора: «два годных и разных» невозможно, а отказ закрыл бы прокачку без правила. Окно показывает одну карточку, и навык выбран сразу; за столом — одна отметка. Расхождение с ответом владельца — §7 и PR (если владелец хочет иначе — одна ветка в `randomSkillRoll`).
35. **`stale` — когда у игрока оба навыка.** В момент запроса выбора ещё нет, «выбранного» навыка не существует. Один из двух у игрока — бросок годен: карточка этого кубика закрыта словами `teamAdvance.held` («уже есть»), второй берётся. Оба — `ROLL_STALE {skills}` («Выпали Frenzy, Strip Ball — эти навыки у игрока уже есть…»), «Бросил за столом» открыт, привязка к прокачке за столом — к прокачке любого из двух (`tableAdvancementFor`, K8 без изменений).
36. **`rollFitsAdvancement` принимает навык любого из двух**; `takeAdvancement` (`progression.mjs`) не меняется: он не читает бросок (выбор живёт в броске, а не в прокачке; прокачка записывается как раньше — `{type: "random", grants: {skill}, roll: {id, via: "site"}}`), навык, которого у игрока нет, проверяет `checkAdvancementGrant`, а принадлежность навыка броску держат клиентский `rollRefusal`/`chosenOf` и серверный `settleRosterRolls` (422 `DICE_ROLL_MISMATCH`). `save.mjs` не меняется.
37. **Окно прокачки, сайт:** «Бросить два D16» — тот же один `POST …/rolls` (сервер бросает оба); после броска — двойной блок: две карточки (кубик с гранью и навык), радиогруппа «Выпавшие навыки», тренер выбирает одну, «Принять: …» открыта только с выбором; **кнопки броска после броска нет на обеих ширинах** (на десктопе её больше нет и закрытой — ответ владельца), «Назад» нет, тип, категория и переключатель закрыты (решение 9 в остальном то же). Таблица 16 граней колонки остаётся под блоком (как в прототипе): обе выпавшие грани выделены, навыки игрока зачёркнуты; на сайте она только показывает (список, не кнопки).
38. **Окно прокачки, стол:** грани таблицы — кнопки-отметки (`aria-pressed`): тренер отмечает две грани, которые выпали (пустая грань и навык игрока закрыты словами, как сейчас; третья отметка закрыта словами «Отмечены оба кубика — снимите одну отметку»; нажатие на отмеченную снимает её), отмеченные встают в тот же двойной блок, и тренер выбирает одну. Записывается только выбранный навык с `roll: {via: "table"}` (пара за столом — способ выбора, а не запись; блоб не меняется).
39. **Шторка навыка** (решение 19 плана 07d): вместо попыток — что выпало на кубиках: «Выпало: Frenzy и Strip Ball» (один кубик — «Выпало: Frenzy»); чтение `GET …/rolls` — как было (один раз за визит). Так §9.5 («результат броска виден») держится без списка попыток.

**Отмена последней прокачки** (ответ владельца 2)

40. **Отмена — только в «Исправить вручную»**: в профиле телефона и в панели десктопа её больше нет (как в `Player.html` и `DeskRoster.html`). Последним блоком шторки ручной правки — «Прокачки» с тихой кнопкой «Отменить последнюю: Frenzy» (`teamPlayer.undo.open`), только у игрока с прокачкой. Нажатие открывает то же окно-вопрос `player-unadvance` (решение 18: что дала, «Вернётся SPP», «Стоимость игрока», слова о броске на сайте) на месте шторки правки; тот же шаг очереди `undoAdvancement`, сервер освобождает бросок. Кнопка закрыта словами, пока форма правки изменена (`teamPlayer.fix.saveFirst` — несохранённые правки не теряются молча) и когда закрыта отмена (`undoClosed`: матч, замок, нет id). «Оставить» и отправленная отмена закрывают окно, фокус — на карандаш, которым открыта правка (как «Отмена» ручной правки; вложенные шторки «Состава» назад не возвращаются).

**Карьера** (ответ владельца 3)

41. **Блок «Карьера» — в профиле телефона сразу после «Навыков»** (`PlayerCareer.html`): заголовок-кнопка «Карьера · N SPP · по матчам» с шевроном (`aria-expanded`, `h2` вокруг кнопки — навигация по заголовкам находит его, как «Навыки»), под ней всегда — итоги GP TD CAS COMP KO INT MVP; по нажатию — список матчей и сноска. На десктопе не рисуется (07e, `DeskRosterCareer.html`; шов в `sidePanelMarkup` остаётся), у погибшего — тоже нет (07e).
42. **Откуда числа.** TD…MVP итогов и «N SPP» — карьера строки (`line.career`, `line.earned`: состав плюс неучтённые записи, как таблица «Состава»). GP и строки матчей — `GET /api/teams/:id/players/:pid/history` (этап 03; `{history: {playerId, matches, outside}}`): читается один раз за визит профиля, сразу после первого рисунка профиля с его строкой (а не по раскрытию — GP стоит в итогах всегда); ответ, пришедший после ухода, ничего не рисует; неудачное чтение — следующее раскрытие читает снова. Матч, закончившийся, пока профиль открыт, обновится при следующем входе (ограничение — в PR).
43. **Строка матча** (новые сверху, `PlayerCareer.html`): «Тур N · Соперник» (лига) или «Товарищеский · Соперник»; результат «В 2–1» / «Н 1–1» / «П 0–2» (`score`), у матча в игре — пусто и плашка «ждёт итогов» (`pending`); под ним — что сделал игрок: «TD 1 · COMP 1», «MVP» без числа при одном, травма матча словами `injuryWords`; «пропуск матча» (`played === false`), «без деталей» (`counters === null`), «без действий» (всё по нулям); справа SPP строки — сумма `counters × sppCounterWeights(race)` со знаком («+4», «0»; «—» без деталей и при пропуске). Последней — «Правки вне матча» (`outside`), если там не всё по нулям. GP — матчи `status === "confirmed"` с `played === true`. Матчи до первого, где сайт знает игрока (`played === true` или `source !== "none"`), не показываются: история не знает, когда игрок пришёл в команду. Что из прототипа данными не покрыто — вопрос владельцу 1.

**Поиск** (ответ владельца 4)

44. **Поле — в полосе «Состава» от 901px** (`DeskRoster.html`: справа в шапке, «Игроки, навыки, правила…»), `renderSearchField` в слоте `metaHtml` у `renderPageHead`; до 900px поля нет вовсе (прототипы телефона его не рисуют, а шапка там только для диктора — поле в ней было бы невидимым, но фокусируемым).
45. **Что ищется:** запрос — слова (`normalizeText` справочника: строчные, «ё» как «е»), игрок подходит, когда подходит каждое слово: слово из цифр — номер целиком; иное — подстрока имени, позиции или названия любого навыка строки (`line.skills`). Фильтруются все три секции — «Активный состав», «Пропускают матч», «Погибшие» (их строки — те же игроки команды; прятать от поиска погибших и пропускающих значило бы говорить «никого нет» про того, кто в таблице есть). Секция без найденных не рисуется; «Активный состав» без найденных стоит со словами «По запросу «…» в составе никого нет» (без «+ Нанять»). Счёт найденных — над таблицей, в живой области (`role="status"`, она есть на десктопе всегда, текст — пока есть запрос). Рядом — ссылка «Искать в справочнике: «…»» на `#/ref`: нажатие кладёт запрос в память справочника (`setRefQuery`) и просит каретку в поле (`askSearchFocus`) — механизм этапа 11 (§24–26, `goSearch`). Esc в поле очищает запрос, фокус остаётся в поле.
46. **Запрос — память страницы «Состава»** (`memory.query`, как сортировка и выбор): переживает уход на другую вкладку и возврат, перезагрузка его забывает, в адрес и в хранилище браузера не пишется. Панель показывает выбранного игрока, если его видно, иначе первого найденного (`memory.selected` не меняется — очищенный запрос возвращает выбранного); ничего не найдено — панели нет. Фильтр — только в разметке таблиц: `screen.lines` целы, шторки и шаги ищут игроков в них. Заголовки секций считают показанных.

### Что меняется в решениях плана 07d

- **3:** профиль телефона — шапка, характеристики, SPP (без «Отменить последнюю»), навыки, **карьера**, травмы.
- **9:** после броска на сайте кнопки броска нет и на десктопе (раньше — закрытая рядом с кубиком).
- **11:** `stale` — оба навыка у игрока; привязка — к прокачке за столом любого из двух.
- **12:** D16 — два кубика, оба перебрасывают пустую грань и навык игрока, второй — и навык первого; за столом отмечаются две грани.
- **18:** отмена — из «Исправить вручную», не из профиля и панели.
- **19:** попыток в шторке навыка нет; вместо них — что выпало на кубиках.
- **«Как идёт каждая запись»:** строка «Бросить D16» → «Бросить два D16» (тот же `POST`); строка «Отменить прокачку» — открывается из «Исправить вручную»; новая строка «Карьера» — `GET /api/teams/:id/players/:pid/history`, чтение, один раз за визит профиля телефона; поиск ничего не пишет.

## Вопросы владельцу

1. **Карьера: чего нет в данных истории** (`GET …/players/:pid/history`). Прототип `PlayerCareer.html` показывает три вещи, которых сервер не знает:
   - **GP за всю карьеру.** Сайт знает, кто играл матч, только по снимку состава матча (миграция 005, подготовка 2.x); у старых матчей снимка нет (`played: null`). *По умолчанию:* GP считает сыгранные матчи, которые знает сайт (`played === true`, матч завершён); сноска говорит, что матчи до записей — «без деталей».
   - **Причина пропуска** («не играл · Seriously Hurt»). Строка истории говорит только «не был в составе матча». *По умолчанию:* «пропуск матча» без причины (слово нейтральное: «не играл» называет игрока в роде).
   - **«Этот сезон · 8 матчей».** История отдаёт все матчи команды; фильтр сезона сервера оставляет только матчи лиги, а прототип мешает в список и товарищеский. *По умолчанию:* все матчи команды (лига всех сезонов и товарищеские), новые сверху, заголовок списка «Все матчи · N»; матчи до первого, где сайт знает игрока, не показываются (история не знает, когда игрок пришёл).

   Исполнители идут по умолчаниям; ответ владельца иной — правка слов и одной функции `careerRows` (Task 24).

## Файлы

| Файл | Задача | Что |
|---|---|---|
| `src/domain/roster/dice.mjs`, `server/api/dice-rolls.mjs` (`heldSince`), `scripts/mock/rolls.mjs` (кубики mock), оба словаря (`ROLL_STALE`), `test/roster-dice.test.mjs`, `test/roster-rolls-verify.test.mjs`, `test/roster-advance.test.mjs`, `test/team-rolls-api.test.mjs`, тесты со словами `ROLL_STALE` | 20 | два кубика: домен, сервер, mock |
| `src/screens/team/roster/{roll-view,advance,advance-sheet,wire}.mjs`, `rolls.css`, оба словаря, `test/team-advance-rolls.test.mjs` | 21 | окно прокачки: двойной блок, отметки за столом |
| `src/screens/team/roster/roll-view.mjs` (`rollBlockMarkup`, без `attemptsMarkup`), `rolls.css`, оба словаря, `test/team-advance-undo.test.mjs` | 22 | шторка навыка: что выпало вместо попыток |
| `src/screens/team/roster/{profile,panel,player-access,fix,player,injury}.mjs`, `fix.css`, `profile.css`, `frame.css`, оба словаря, `test/team-advance-undo.test.mjs`, `test/team-player-profile.test.mjs`, `test/team-player-fix.test.mjs`, `test/team-roster.test.mjs` | 23 | отмена — в «Исправить вручную» |
| `src/screens/team/roster/career.mjs` (новый), `profile.mjs`, `profile.css`, `screen.mjs`, `index.mjs`, `player.mjs`, `wire.mjs`, оба словаря, `test/team-player-career.test.mjs` (новый), `test/helpers/roster-page.mjs`, тесты профиля телефона с `assertAnswered`/`callKeys` | 24 | карьера в профиле телефона |
| `src/screens/team/roster/search.mjs` (новый), `view.mjs`, `index.mjs`, `wire.mjs`, `memory.mjs`, `frame.css`, оба словаря, `test/team-roster-search.test.mjs` (новый) | 25 | поиск в полосе «Состава» |
| `scripts/mock/history.mjs` (новый), `scripts/mock/roster.mjs`, `scripts/smoke-api.mjs` | 26 | mock истории, smoke двух кубиков, браузер |
| `docs/redesign/screens/rd-07d*.json`, спеки, PR | 17–19 плана 07d | контроллер, после Task 26 |

Каталог экрана — `src/screens/team/roster/` (ниже без префикса). Рецепты Т, С, М — раздел «Рецепты проверки» плана 07d.

---

### Task 20: Домен и сервер — два кубика случайного навыка

**Files:**
- Modify: `src/domain/roster/dice.mjs` (`randomSkillRoll`, `rollFitsAdvancement`, `skillsRerolledAgainst`, `rollRefusal`, `tableAdvancementFor`, новый `rolledDice`, шапка), `server/api/dice-rolls.mjs` (`heldSince`, абзац шапки о `stale`), `scripts/mock/rolls.mjs` (`seed`, `rollNew`, шапка), `src/i18n/en.json`, `src/i18n/ru.json` (`teamAdvance.refusal.ROLL_STALE`)
- Test: `test/roster-dice.test.mjs`, `test/roster-rolls-verify.test.mjs` (только новые тесты; старые — на формате одного кубика — остаются), `test/roster-advance.test.mjs`, `test/team-rolls-api.test.mjs`; тесты, которые сверяют слова `ROLL_STALE` (`grep -rn "ROLL_STALE\|came up, and the player has this skill" test/`)

**Interfaces:**
- Consumes: `heldSkillKeys`, `canonicalSkillName`, `normalizePlayerAdvancements` (`players.mjs`); `categoriesForAccess` (`values.mjs`); `SKILL_DIE`, `face` (сам `dice.mjs`).
- Produces (`dice.mjs`, чистый):
  - `randomSkillRoll({row, player, category, skillGroups = [], rng, maxAttempts = 1000}) → {ok: true, params: {category: string, candidates: string[], sides: 16}, result: {dice: RolledDie[]}} | {ok: false, reason: "DICE_CATEGORY"|"DICE_NO_SKILL"}` — проверки и их порядок прежние; затем кубик 1 — как сейчас; затем, если в колонке есть второй навык, которого у игрока нет, кубик 2: попытка `{roll, skill, duplicate}` с `twin: true` (и `duplicate: false`), когда грань дала навык кубика 1; пустая грань и навык игрока — как у кубика 1. `maxAttempts` — на каждый кубик (ошибка та же: `no free skill after N attempts`). `rng` спрашивается `SKILL_DIE` на каждую попытку обоих кубиков.
  - `@typedef {{attempts: {roll: number, skill: string|null, duplicate: boolean, twin?: true}[], skill: string}} RolledDie`.
  - `rolledDice(roll) → {face: number|null, skill: string}[]` — только у `purpose === "random_skill"`: кубики `result.dice` по порядку, `face` — `roll` последней попытки кубика (нет попыток — `null`), `skill` — его навык; бросок формата этапа 03 (`result.skill` — строка, `result.attempts`) — один кубик; кубик без строкового `skill` пропускается; иное — `[]`.
  - `rollFitsAdvancement({purpose, result}, {type, grants})` — у `random`: `purpose === "random_skill"` и `grants.skill` канонически равен навыку одного из `rolledDice`; у `stat` — как было.
  - `skillsRerolledAgainst(roll)` — попытки всех кубиков (`result.dice[].attempts`, у формата этапа 03 — `result.attempts`), с `duplicate: true`; исключение капитанского Pro (`params.captain`) — как было.
  - `rollRefusal(roll, row, player)` — у случайного навыка: `roll.stale` или каждый навык `rolledDice` у игрока (`heldSkillKeys`, канонически) → `{code: "ROLL_STALE", params: {skills: <навыки кубиков через «, »>}}`; иначе перебросы — как было (`ROLL_REROLLED {skills}`); один из двух у игрока — `null` (его карточку закрывает окно, Task 21). У D8 — `null`.
  - `tableAdvancementFor(roll, player)` — прокачка `random` за столом после последней прокачки с сайта (K8), чей навык канонически равен навыку одного из `rolledDice`; `-1` — нет.
- Produces (`server/api/dice-rolls.mjs`): `heldSince(roll, position, player)` — `purpose === "random_skill"`, `rolledDice(roll)` не пуст и каждый его навык у игрока (`heldSkillKeys`). `rollForPlayer`, `settleRosterRolls`, `checkRolls`, `checkKeptRerolls` не меняются. Абзац шапки: «A random skill is two dice (the owner, 2026-10-20): both skills the player lacks, and different; the coach takes one, and an advancement may name either (`rollFitsAdvancement`). It is stale only when he holds both.»
- `takeAdvancement` (`progression.mjs`) **не меняется** (решение 36).
- `scripts/mock/rolls.mjs`: `seed` — `dieOf([15, 4, 4, 1])` (кубик 1: пустая 15, Dodge; кубик 2: Dodge — `twin`, затем Catch: у Piranha Warrior Blitzer его нет); `rollNew` — `dieOf([SKILL_DIE, free, second])`, где `second` — грань следующего после `free` навыка колонки, которого у игрока нет (нет такого — `dieOf([SKILL_DIE, free])`: один кубик); шапка — «two dice, …».

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamAdvance.refusal.ROLL_STALE` | {skills} came up, and the player has these skills already: the roll cannot be taken. Take a skill off, or take this advancement at the table. | Выпали {skills} — эти навыки у игрока уже есть: бросок не взять. Уберите навык или возьмите прокачку за столом. |

- [ ] **Step 1: Падающие тесты.**
  - `test/roster-dice.test.mjs` (помощники файла: `scripted`, `lineman`, `clanrat`, `ratOgre`, `blitzer`, `general`, `strength`, `devious`):
    - «a random skill is two D16s over the category's column: each rerolls a blank face and a skill the player has, the second the first's skill too»: Lineman с Dauntless, `scripted(2, 3, 3, 4)` → `{ok: true, params: {category: "General", candidates: general, sides: 16}, result: {dice: [{attempts: [{roll: 2, skill: "Dauntless", duplicate: true}, {roll: 3, skill: "Fend", duplicate: false}], skill: "Fend"}, {attempts: [{roll: 3, skill: "Fend", duplicate: false, twin: true}, {roll: 4, skill: "Frenzy", duplicate: false}], skill: "Frenzy"}]}}`; `rng.asked` — `[16, 16, 16, 16]`.
    - «a column with one skill the player lacks throws one die»: Lineman со всей General, кроме Thick Skull, `scripted(1, 16)` → `result.dice` длиной 1, навык `Thick Skull`, `rng.asked` `[16, 16]`.
    - «a die stuck on the first die's skill stops after maxAttempts»: Lineman без навыков, `rng: () => 1`, `maxAttempts: 5` → бросает `/5 attempts/` (кубик 1 — Block с первой попытки, кубик 2 застрял на нём).
    - Существующие тесты случайного навыка — на `result.dice[0]` (и второй кубик в `scripted`): «the skill die is a D16…» `scripted(14, 3, 3, 1)`; «a face beyond the column…» — `dice[0]`; «the last column… face 16…» `scripted(16, 1)`; «blanks and held skills…» `scripted(15, mightyBlow, 4, 4, 5)` — у кубика 2 `twin`; «a base skill…» `scripted(1, 2, 3)`. Тесты отказов (`DICE_CATEGORY`, `DICE_NO_SKILL`, «stuck on blanks») — без изменений.
  - `test/roster-rolls-verify.test.mjs` (новые, старые не трогать):
    - «a two-dice roll fits a random advancement of either skill, by canonical name, and no other»: `{purpose: "random_skill", result: {dice: [{attempts: [{roll: 4, skill: "Frenzy", duplicate: false}], skill: "Frenzy"}, {attempts: [{roll: 2, skill: "Mighty Blow (+1)", duplicate: false}], skill: "Mighty Blow (+1)"}]}}` → `true` для Frenzy и для `Mighty Blow`, `false` для Block и для `type: "stat"`.
    - «both dice's rerolls are the roster's to hold; a twin is none»: кубик 1 — Block `duplicate: true`, кубик 2 — Frenzy `twin: true`, затем Fend `duplicate: true` → `skillsRerolledAgainst` `["Block", "Fend"]`; `rerollsHeldBy(roll, new Set(["Block"]))` — `false`.
    - «a roll kept with one die (stage 03) reads as one; anything else as none»: `rolledDice({purpose: "random_skill", result: {attempts: [{roll: 4, skill: "Frenzy", duplicate: false}], skill: "Frenzy"}})` → `[{face: 4, skill: "Frenzy"}]`; D8, `result: {}`, `null` → `[]`.
  - `test/roster-advance.test.mjs`: в «a site roll he can no longer take…» `ROLL_STALE` — `{skills: "Frenzy"}`; новый «two dice: stale only when the player has both; the table advancement of either is found»: бросок {Frenzy, Dodge}; у игрока Frenzy → `rollRefusal` `null`; Frenzy и Dodge → `{code: "ROLL_STALE", params: {skills: "Frenzy, Dodge"}}`; прокачка `random` Dodge `{via: "table"}` последней → `tableAdvancementFor` — её индекс; она же раньше прокачки с сайта → `-1`.
  - `test/team-rolls-api.test.mjs` (БД; помощники файла: `scriptedServerDie`, `roll`, `rows`, `seedCoach`, `seedTeam`, `holding`, `generalSkills`):
    - тесты, которые сверяют `result` случайного навыка (`grep -n "result.skill\|result.attempts\|result, {" test/team-rolls-api.test.mjs`), — на `result.dice`; каждому `scriptedServerDie(...)` случайного навыка — грани второго кубика; «a player with every skill of the category but one…» — `result.dice` длиной 1, его `skill` — последний навык.
    - новый «a random skill's roll is two dice, both skills the player lacks and different, kept as one row; asked again, the same two»: `scriptedServerDie(3, 3, 4)` → `dice` — навыки `general[2]`, `general[3]`, попытка `twin` у второго; второй запрос — тот же `id` и тот же `result`; строк в `dice_rolls` — одна.
    - новый «a waiting roll the player has come to hold one skill of is no stale roll; both — stale»: бросок `{general[2], general[3]}`; состав (PATCH) даёт игроку `general[2]` → повторный `POST` без `stale`; оба → `stale: true`.
  - `test/roster-rolls-verify.test.mjs` (БД, помощник `putRoll`, `saveWith`, `site`): «a random advancement takes either die's skill; a skill neither die rolled is DICE_ROLL_MISMATCH»: `putRoll(…, "random_skill", {dice: [{attempts: [{roll: 1, skill: "Block", duplicate: false}], skill: "Block"}, {attempts: [{roll: 3, skill: "Fend", duplicate: false}], skill: "Fend"}]})`; прокачка `random` `{skill: "Fend"}` с `roll: site(id)` → 200, бросок `used_at` не `null`; на свежей команде — `{skill: "Tackle"}` → 422 `DICE_ROLL_MISMATCH`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && . output/07d/env.sh && node --test test/roster-dice.test.mjs test/roster-rolls-verify.test.mjs test/roster-advance.test.mjs test/team-rolls-api.test.mjs` → FAIL (нет `rolledDice`, `result.dice`).
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `dice.mjs` (абзац о D16): «… A random skill is two dice (the owner, 2026-10-20): the second rerolls a blank face, a skill the player holds and the first die's skill (`twin`), so both are skills he lacks and different, and the coach takes one; a column with one such skill throws one die. Every attempt of both is kept; a roll kept before (one die, `result.skill`) reads as one (`rolledDice`).» Слова `ROLL_STALE` — в обоих словарях; тесты, которые сверяют их текст, — на новый текст.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-advance-rolls.test.mjs test/team-roster-data.test.mjs test/team-rolls-client.test.mjs test/team-advance-undo.test.mjs` → PASS (фикстуры одного кубика читаются как раньше); полный прогон рецепта Т → PASS; `git diff --name-only -- server/` → только `server/api/dice-rolls.mjs`.
- [ ] **Step 5: Mock** (рецепт М): `curl -fsS -H 'Authorization: Bearer mock' http://localhost:5178/api/teams/t1/rolls` → у `mock-roll-p3` `result.dice` — навыки `["Dodge", "Catch"]`; `curl -fsS -H 'Authorization: Bearer mock' -H 'Content-Type: application/json' -X POST -d '{"purpose":"random_skill","category":"General"}' http://localhost:5178/api/teams/t1/players/p1/rolls` → `result.dice` длиной 2, навыки разные. Mock остановить. Что видно — в отчёт.
- [ ] **Step 6: Commit**

```bash
git add src/domain/roster/dice.mjs server/api/dice-rolls.mjs scripts/mock/rolls.mjs src/i18n/en.json src/i18n/ru.json test/roster-dice.test.mjs test/roster-rolls-verify.test.mjs test/roster-advance.test.mjs test/team-rolls-api.test.mjs
git commit -m "feat(roll): a random skill is two dice, both skills the player lacks and different — an advancement takes either, and the roll is stale only when he holds both (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(плюс тестовые файлы, в которых поменялись слова `ROLL_STALE`)

---

### Task 21: Окно прокачки — два результата, выбор одного (сайт и стол, обе ширины)

Прототипы: `mobile/Adv3Random.html` (телефон: переключатель 40px → 44 по D2, строка 12/1.4 `--muted`, кубик 76×76 радиус 18, подпись 12/600 прозрачность .8, число Oswald 700 36px, результат 15/600 `--accent-text`, таблица граней в две колонки с зазором 10), `desktop/DeskRosterAdv.html` (колонка «3 · Бросок навыка»: переключатель 36px, кубик 64×64 радиус 16, подпись 11px, число 30px, результат 15/600, «Бросить» min-height 40, отступ 0 14, радиус 10, 14/700; таблица граней — зазор 2 8, грань от 28px, 13px). В прототипах один результат; двойной блок — ответ владельца: его карточка собрана из элементов прототипов — кубик как в Adv3Random/DeskRosterAdv, рамка и выбор как у карточки характеристики `Adv3Stat.html` (радиус 12, кольцо `inset 0 0 0 1px` `--line`, выбранная — `--accent-tint-soft` и кольцо 2px `--accent`). Это расхождение — §7.

**Files:**
- Modify: `roll-view.mjs`, `advance.mjs`, `advance-sheet.mjs`, `wire.mjs`, `rolls.css`, `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-advance-rolls.test.mjs`

**Interfaces:**
- Consumes: `rolledDice` (Task 20); `skillFaces`, `rollRefusal`, `tableAdvancementFor` (`dice.mjs`); `radioGroupMarkup` (`radio-group.mjs`); `renderDie` (`ui/die.mjs`); `choicesOf` (`choices.skills` — колонка категории с `held` и `elite`).
- Состояние шторки (`advance.mjs`, шапка модуля — поправить): у случайного навыка — `marks: number[]` (грани, отмеченные за столом, по порядку отметки), `skill` — выбранный из пары; `face` остаётся только у D8; `attempts` нет. `UNROLLED` — плюс `marks: []`, без `attempts`.
- Produces (`advance.mjs`):
  - `diceCount(sheet, choices) → 1|2` — бросок на сайте есть — `rolledDice(sheet.roll).length` (не меньше 1); иначе `Math.min(2, Math.max(1, число навыков choices.skills без held))`.
  - `pairOf(sheet, choices) → {face: number|null, skill: string|null, held: boolean, elite: boolean}[]` — длиной `diceCount`: на сайте с броском — `rolledDice(sheet.roll)`; за столом — отмеченные грани (`skill` — навык колонки на грани) и пустые места до `diceCount`; на сайте до броска — пустые места. `held` — `heldSkillKeys(choices.player.row, choices.player)` канонически; `elite` — `choices.skills` того же навыка.
  - `answerFields` у случайного навыка: `{roll, via: "site", waiting: "", lost: false, category: roll.params?.category ?? sheet.category, marks: [], skill: <навык, если кубик один, иначе "">}`.
  - `chosenOf` у `random`: на сайте — `sheet.roll` и `sheet.skill` — навык одного из `pairOf`, не `held`; за столом — `sheet.marks.length === diceCount` и `sheet.skill` — навык одной из отмеченных граней, не `held` → `{type: "random", grant: {skill}, elite, roll: <как namedRoll>}`; иначе `null`. Остальные типы — как было.
  - `onAdvanceFace(face)` у случайного навыка за столом: отмеченная грань — снять отметку (выбор с её навыком — снять); неотмеченная грань с навыком, которого у игрока нет, при `marks.length < diceCount` — отметить; иначе только `draw()`. У D8 — как было (`pressedFace`).
  - `onAdvancePick(skill)` (новый) — только из открытой шторки случайного навыка: навык одного из `pairOf`, не `held`, а за столом — при полной паре → `change(sheet, {skill})`; иначе `draw()` (радиогруппа уже перевернулась).
  - `onAdvanceVia(via)` — `{via, face: null, marks: [], stat: "", instead: false, skill: <на сайте с броском из одного кубика — его навык, иначе "">}`.
  - `stepBefore` — «брошено»: `Boolean(sheet.roll || sheet.face || sheet.marks?.length)`.
  - `bindSiteRoll` — слова `teamAdvance.bound` с навыком прокачки за столом, к которой привязан бросок (`line.advancements[tableAdvancementFor(sheet.roll, choices.player)].grants.skill`); `bindable` — как было.
  - `onAdvanceAttempts` удаляется.
- Produces (`roll-view.mjs`):
  - `pairMarkup({sheet, choices, desk}) → string` — `radioGroupMarkup({className: "g-advance__pair", label: t("teamAdvance.pairLabel"), chosen: sheet.skill, items})`; пункт на кубик: `value` — навык, у пустого места — `die-1`/`die-2` (не `""`: пустой выбор отметил бы первое место), `className: classNames("g-advance__pick", held && "g-advance__pick--held")`, `data: {advancePick: skill ?? ""}`, `reason`: места без навыка — `noteWords(sheet)`; `held` — `t("teamAdvance.held")`; `html` — `renderDie({type: "D16", value: face})`, `<span class="g-advance__pickname">` навык или «—» (`aria-hidden`, для диктора — `teamAdvance.blank`), у `elite` — тег `teamAdvance.elite` (`g-advance__picktag`).
  - `facesMarkup`: на сайте — `<ul class="g-advance__faces g-advance__faces--shown">` из `<li class="g-advance__face …" data-advance-face="N">` (номер, навык или «—»); навык игрока — `g-advance__face--held` и для диктора `teamAdvance.held`; выпавшие грани `rolledDice` — `g-advance__face--hit` и для диктора `teamAdvance.rolledFace`. За столом — `<div class="g-advance__faces" role="group" aria-label="t(teamAdvance.facesLabel)">` из `<button type="button" class="g-advance__face" aria-pressed="true|false" data-advance-face="N">`; закрытая грань — `aria-disabled="true"`, `title` — причина, `data-roster-closed` (K7): пустая — `teamAdvance.blank`, навык игрока — `teamAdvance.held`, не отмеченная при полной паре — `teamAdvance.marksFull`.
  - `randomRollMarkup({sheet, choices, desk})` — `viaMarkup`, `pairMarkup`, результат (`g-advance__result`: до броска / до полной пары — `teamAdvance.rollResult`; пара есть, выбора нет — `teamAdvance.pickPair`; выбран — навык), на десктопе до броска на сайте — `rollButtonMarkup(props, t("teamAdvance.rollD16"))` под результатом (после броска и за столом кнопки нет), `alertsMarkup`, привязка, `facesMarkup`, `keptMarkup`. Ряд «кубик + кнопка» десктопа (`g-advance__dierow`, `g-advance__dieside`), `randomFace` и `randomResult` в нынешнем виде уходят.
  - `attemptsMarkup(roll)` — без `open` и `toggle`: только подпись и список (его зовёт шторка навыка до Task 22).
- `advance-sheet.mjs`: кнопка телефона на сайте до броска — `teamAdvance.rollD16`; «Принять: …» — `teamAdvance.accept {skill}`; `waitLabel` случайного: десктоп на сайте до броска — `teamAdvance.rollFirst`; брошено, выбора нет — `teamAdvance.pickPair`; за столом, пара не полна — `teamAdvance.pickFace`, полна — `teamAdvance.pickPair`. Подсказка шага категории — `teamAdvance.randomHint`.
- `wire.mjs`: `radios(".g-advance__pair", "data-advance-pick", onAdvancePick)`; грани D16 — вместо радиогруппы `delegate(root, "click", ".g-advance__faces button[data-advance-face]", …)`, закрытая (`aria-disabled`) не зовёт `onAdvanceFace` (её слова — общий `[data-roster-closed]`); `attempts` из `ADVANCE_BUTTONS` и `onAdvanceAttempts` — убрать; шапка модуля — поправить список.
- `rolls.css` (до 900px — Adv3Random, от 901px — DeskRosterAdv; всё под `#player-advance`):
  - `.g-advance__pair` — `display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px` (от 901px — 8px); одна карточка — на всю ширину;
  - `.g-advance__pick` — `box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 44px; padding: 12px 10px` (от 901px — `10px 8px`, `min-height: 24px`), `border: 0; border-radius: 12px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); font: 600 15px/1.25 var(--font-body)` (от 901px — 14px), `color: var(--ink); text-align: center; text-transform: none; letter-spacing: 0; overflow-wrap: anywhere`; выбранная (`[aria-checked="true"]`) — `background: var(--accent-tint-soft); box-shadow: inset 0 0 0 2px var(--accent)`; закрытая без навыка — кубик `--surface-3`/`--muted`; `--held` — имя `--muted`, `text-decoration: line-through`;
  - кубик в карточке — 76×76, радиус 18, подпись 12px, число 36px (от 901px — 64×64, радиус 16, 11px, 30px); брошен — `--accent`/`--on-accent`, нет — `--surface-3`/`--muted` (как `.g-advance__dice`);
  - `.g-advance__picktag` — 12/600 `--accent-text`;
  - кнопка броска десктопа — `min-height: 40px; padding: 0 14px; border-radius: 10px; font: 700 14px/1.2 var(--font-body)`;
  - грань-кнопка за столом с `aria-pressed="true"` — вид выпавшей (`--accent`, `--on-accent`, 700); `li`-грань на сайте — те же отступы и шрифт, что кнопка;
  - правила `.g-advance__dierow`, `.g-advance__dieside`, `.g-advance__attempts` (кнопка) — удалить; `ellipsis` нет.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamAdvance.rollD16` (значение) | Roll two D16 | Бросить два D16 |
| `teamAdvance.rollResult` (значение) | Two D16s on the category's table | Два D16 по таблице категории |
| `teamAdvance.randomHint` (значение) | Two D16s on the league's Skill Table, each a skill the player lacks, and different: the coach takes one of the two. A blank face, a skill the player has and the first die's skill are rolled again. | Два D16 по таблице навыков лиги — у каждого навык, которого у игрока нет, и разные: тренер берёт один из двух. Пустая грань, имеющийся навык и навык первого кубика перебрасываются. |
| `teamAdvance.note.site` (значение) | The site rolls both dice and keeps the result — no rerolling it | Сайт бросит оба кубика и сохранит результат — перебросить нельзя |
| `teamAdvance.note.table` (значение) | Mark the two skills the dice showed | Отметьте два навыка, выпавших на кубиках |
| `teamAdvance.pickFace` (значение) | Mark the skills rolled | Отметьте выпавшие навыки |
| `teamAdvance.pairLabel` | The skills rolled | Выпавшие навыки |
| `teamAdvance.pickPair` | Choose one of the two skills | Выберите один из двух навыков |
| `teamAdvance.marksFull` | Both dice are marked — take one mark off first | Отмечены оба кубика — сначала снимите одну отметку |
| `teamAdvance.rolledFace` | rolled | выпало |

Удалить: `teamAdvance.rerolled` (оба словаря).

- [ ] **Step 1: Падающие тесты** — `test/team-advance-rolls.test.mjs`. Фикстура `ROLL_SKILL` — двух кубиков: `result: {dice: [{attempts: [{roll: 1, skill: "Block", duplicate: true}, {roll: 4, skill: "Frenzy", duplicate: false}], skill: "Frenzy"}, {attempts: [{roll: 4, skill: "Frenzy", duplicate: false, twin: true}, {roll: 8, skill: "Strip Ball", duplicate: false}], skill: "Strip Ball"}]}` (Ann — Lineman, General, с Block); `WORDS.hint`, `WORDS.site`, `WORDS.table`, `WORDS.stale` — новые слова. Помощники: `pair = () => sheet().querySelectorAll("[data-advance-pick]")`, `pick = (name) => sheet().querySelector(\`[data-advance-pick="${name}"]\`)`. Тесты случайного навыка переписать, остальные (D8, навык вместо характеристики, ожидание, очередь, матч) — только где они касаются D16:
  - «a random skill on the site: declared, then two dice — two skills the player lacks, both faces on the table, no attempts; one of the two is taken» (Adv3Random и ответ владельца): случайный → General → «Roll two D16» → `POST …/players/p1/rolls` с `{purpose: "random_skill", category: "General"}`; две карточки «4 · Frenzy», «8 · Strip Ball» (`role="radiogroup"` «The skills rolled», ни одна не выбрана); «Take» закрыта словами «Choose one of the two skills»; 16 граней — `li`, Block зачёркнут, 4 и 8 — `g-advance__face--hit`; `[data-advance-attempts]` и `.g-advance__attemptlist` нет; «Strip Ball» → «Take: Strip Ball» → один `PATCH`, у Ann прокачка `{type: "random", grants: {skill: "Strip Ball"}, roll: {id: "r1", via: "site"}}`; готово — «Strip Ball», «Random primary skill · General · rolled on the site».
  - «on a desk the pair stands in the third column; after the roll there is no «Roll two D16», nor at the table» (DeskRosterAdv, ответ владельца): до броска — `rollButton()` есть, после — `assert.ok(!rollButton())`; «Rolled at the table» до броска — кнопки нет.
  - «a die whose skill the player has come to hold is closed, the other taken; both held — the stale roll's words and the table open» (Review Focus 2): ответ с Ann, у которой Frenzy (за столом) → карточка Frenzy `aria-disabled`, `title` «has it already», нажатие — сообщение, выбор не меняется; Strip Ball берётся; у Ann и Strip Ball → `stale: true` → строка `ROLL_STALE` «Frenzy, Strip Ball came up…», «Take» закрыта, «Rolled at the table» открыт, «Record this roll for the advancement «Frenzy» taken at the table» → один `PATCH` с `roll: {id: "r1", via: "site"}` у прокачки Frenzy; сообщение «The roll is recorded for «Frenzy»».
  - «at the table: the coach marks the two faces the dice showed, then takes one; a third mark is refused with words; a blank or held face cannot be marked; the advancement says «at the table»» (Cade, Agility): «Rolled at the table» → грани — кнопки `aria-pressed="false"`, 15–16 и Catch, Dodge — `aria-disabled`; 2 и 3 → пара «2 · Diving Catch», «3 · Diving Tackle»; 5 → сообщение «Both dice are marked — take one mark off first», отметок две; 3 снова → снята; 5 → отмечена; «Diving Catch» → «Take: Diving Catch» → тело `{type: "random", grants: {skill: "Diving Catch"}, roll: {via: "table"}}`, `POST …/rolls` нет.
  - «one skill left in the column: one die, taken without a choice»: ответ с одним кубиком → одна карточка, выбрана, «Take: …» открыта; за столом у игрока со всей колонкой, кроме одного навыка, — одна отметка достаточна.
  - «the faces at the table from the keyboard: each open face is a button in the tab order; Space marks it and again unmarks it; the focus stays» (замена теста «the D16's faces at the table from the keyboard…»).
  - «the pair from the keyboard: the arrows move between the two cards, the closed one passed, the focus stays».
  - Обновить под новые слова и форму: «a second press on «Roll two D16»…», «a roll whose answer was lost…» (тот же `POST` дважды; второй ответ — тот же бросок; одна прокачка), «a roll of the other purpose waits…», «a roll of another category than asked…», «a roll rerolled past a skill…» (перебросы — попытки кубика 1), «after a site roll a type or a category pressed anyway changes nothing…», «on a desk a site roll keeps the category chosen…», «on a desk «Roll D16» at the table is closed…» → «on a desk the table has no roll button», «no roll while a step of the queue waits…», «a match begun while a roll is out…», «on a desk the roll stands in its columns».
  - «every key in both dictionaries; styled; readable; D2» — `assertDictionaryCovers` по `roll-view.mjs`, `advance.mjs`, `advance-sheet.mjs`; `valuesOf(ROLLS, "#player-advance .g-advance__pick", "min-height")`: до 900px ≥ 44, от 901px ≥ 24; грань-кнопка: ≥ 44 / ≥ 28; `rolls.css` без `g-advance__dierow`, `g-advance__dieside`; `assertReadable` для имени карточки на `--surface` и на `--accent-tint-soft`.
  - «a long skill on a card or a face wraps; nothing is cut with «…»» — в `rolls.css` нет `text-overflow: ellipsis`, у `.g-advance__pick` — `overflow-wrap: anywhere`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-advance-rolls.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапки `roll-view.mjs` и `advance.mjs` — по решениям 37–38: «…on the site two dice (the owner, 2026-10-20): the pair, of which the coach takes one; at the table the two faces the coach marks, then the one taken; no attempts are shown, and there is no die to roll once the pair is in».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-advance.test.mjs test/team-advance-undo.test.mjs test/team-roster*.test.mjs` → PASS; полный прогон → PASS; `npm run check` — 0 недостижимых функций.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/roll-view.mjs src/screens/team/roster/advance.mjs src/screens/team/roster/advance-sheet.mjs src/screens/team/roster/wire.mjs src/screens/team/roster/rolls.css src/i18n/en.json src/i18n/ru.json test/team-advance-rolls.test.mjs
git commit -m "feat(roster): a random skill's two dice side by side — on the site the pair, at the table the two faces marked — and the coach takes one; no roll button once the pair is in, no attempts (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Шторка навыка — что выпало на кубиках вместо попыток

Прототипа нет (решение 39; рамка — `StatsSkill.html`, как у Task 11 плана 07d).

**Files:**
- Modify: `roll-view.mjs` (`rollBlockMarkup`, внутренний `siteRollMarkup`; `attemptsMarkup` удаляется), `rolls.css` (правила `.g-advance__attempt*`, `#roster-skill .g-advance__attempt*`, `.g-advance__attemptscaption` — удалить; `#roster-skill .g-roster__rollpair` — добавить), `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-advance-undo.test.mjs` (тесты шторки навыка)

**Interfaces:**
- Consumes: `rolledDice` (Task 20); `siteRollOf`, чтение `readRolls`/`visit.rolls` (`player.mjs`) — без изменений.
- `rollBlockMarkup({line, skill, rolls})` — та же подпись. У навыка прокачки `random` с сайта, чей бросок прочитан: строка `<p class="g-roster__rollpair">` — два кубика: `t("teamPlayer.roll.pair", {first, second})`, один — `t("teamPlayer.roll.one", {skill})` (навыки — `rolledDice(roll)` по порядку). Чтение в пути, ошибка, «нет такого броска» — как было. D8 — ничего, как было.
- `#roster-skill .g-roster__rollpair` — 13px/1.45 `--ink-2`, `margin: 0`, `overflow-wrap: anywhere`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamPlayer.roll.pair` | Rolled: {first} and {second} | Выпало: {first} и {second} |
| `teamPlayer.roll.one` | Rolled: {skill} | Выпало: {skill} |

Удалить: `teamAdvance.attempts`, `teamAdvance.attempt.blank`, `teamAdvance.attempt.held`, `teamAdvance.attempt.kept` (оба словаря).

- [ ] **Step 1: Падающие тесты** — в `test/team-advance-undo.test.mjs`:
  - «a skill an advancement gave says how in its sheet; a site roll gave it — what the two dice showed, read once» (вместо «…a site roll's attempts are read once and shown»): чип Strip Ball у Cade (прокачка `random` с сайта, бросок {Frenzy, Strip Ball} в ответе `GET /api/teams/t1/rolls`) → «Advancement 1 · Random primary skill · rolled on the site», «Reading the roll…» → «Rolled: Frenzy and Strip Ball»; второй чип того же визита — без нового `GET`; ошибка чтения — «The roll did not load: …».
  - «a roll kept with one die says its one skill»: бросок формата этапа 03 → «Rolled: Frenzy».
  - «no attempts anywhere: the skill's sheet draws no list» — `.g-advance__attemptlist`, `.g-advance__attemptscaption` нет; «a read of the rolls without a site roll the roster brought since is read again…» — на новой строке, остальное как было.
  - «every key in both dictionaries» — `assertDictionaryCovers` по `roll-view.mjs`; в словарях нет `teamAdvance.attempts`, `teamAdvance.attempt.*`, `teamAdvance.rerolled`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-advance-undo.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; шапка `roll-view.mjs` — «A skill's sheet says how an advancement gave the skill, and for a site roll what its dice showed (`rollBlockMarkup`)».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-advance-rolls.test.mjs` → PASS; полный прогон → PASS; `npm run check` → 0 недостижимых функций; `grep -rn "attempt" src/screens/team/roster/*.mjs src/i18n/*.json` — только записи броска в комментариях и `rolledDice`.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/roll-view.mjs src/screens/team/roster/rolls.css src/i18n/en.json src/i18n/ru.json test/team-advance-undo.test.mjs
git commit -m "feat(roster): a skill a site roll gave says what its two dice showed, in place of the attempts, which nothing shows any more" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Отмена последней прокачки — в «Исправить вручную»

Прототипы: `mobile/Player.html`, `desktop/DeskRoster.html` — отмены нет (сверить: карточка SPP профиля кончается подписью под «Прокачкой», панель — подписью под «Прокачать»). Блок «Прокачки» в ручной правке — без макета (как вся ручная правка, решение 25 плана 07d), рамка — `.g-player-sheet`.

**Files:**
- Modify: `profile.mjs` (`sppMarkup` без `undoLastMarkup`, шапка модуля), `panel.mjs` (`sppMarkup` без `undoLastMarkup`), `player-access.mjs` (`undoLastMarkup` удалить, шапка), `fix.mjs` (блок «Прокачки», экспорт `fixChanged`, шапка), `player.mjs` (`onUnadvance`, `sendUndo`, шапка), `injury.mjs` (`OPENERS.unadvance`, комментарий), `fix.css` (`.g-player-fix__undo`), `profile.css` (`.g-profile__undo` удалить), `frame.css` (`.g-roster__aside .g-roster__undo` удалить, шапка), `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-advance-undo.test.mjs`, `test/team-player-profile.test.mjs`, `test/team-player-fix.test.mjs`, `test/team-roster.test.mjs` и любой тест, который ищет «Undo the last» в профиле или панели (`grep -rln "data-player-unadvance\|Undo the last\|g-roster__undo\|g-profile__undo" test/`)

**Interfaces:**
- Consumes: `undoClosed`, `gaveWords`, `closedMarkup` (`player-access.mjs`); `undoAdvancement` (`save.mjs`, без изменений); `unadvanceSheetMarkup` (`player-sheets.mjs`, без изменений); `undoSheetOf`, `stillLast`, `shownAs` (`player.mjs`, без изменений).
- Produces:
  - `fix.mjs`: `fixChanged(where, line, form) → boolean` — `fixCheck(where, line, form).changed`; блок `advancementsMarkup(line, screen, changed)` последним в `fixSheetMarkup` (после «Навыков вне прокачек»), только при `line.advancements.length > 0`: `blockMarkup(t("teamPlayer.fix.advancements"), button)`, где `button` — `<button type="button" class="g-player-fix__undo" aria-haspopup="dialog" data-player-unadvance="<line.key>">` со словами `t("teamPlayer.undo.open", {what: gaveWords(последней)})`; закрытая — `closedMarkup({className: "g-player-fix__undo", label, reason, data: {playerUnadvance: line.key}})`, `reason` — `undoClosed(line, screen) || (changed ? t("teamPlayer.fix.saveFirst") : "")`.
  - `player.mjs`, `onUnadvance(key, button)`: только из открытой ручной правки этого игрока (`visit.sheet?.kind === "fix" && visit.sheet.key === key`), иначе ничего; причина — `undoClosed(line, where) || (fixChanged(where, line, visit.sheet.form) ? t("teamPlayer.fix.saveFirst") : "")` → сообщение, ничего не открывается; иначе `visit.sheet = {kind: "unadvance", key, index, confirmed: shownAs(...), refusal: ""}` — **`visit.opener` не меняется** (это карандаш, которым открыта правка). `sendUndo` — без `keyed("data-player-advance", …)?.focus()`: фокус даёт `closeSheet`. `onUnadvanceKeep` — как было.
  - `injury.mjs`: `OPENERS.unadvance` — `"data-player-edit"` (фокус после окна-вопроса — на карандаш; его же ищет `openerOf`, если карандаш перерисован).
  - `player-access.mjs`: `undoLastMarkup` удалён (недостижим); шапка — без «Undo the last».
- `fix.css`: `.g-player-fix__undo` — бывшие правила `.g-profile__undo`: текстовая кнопка `box-sizing: border-box; display: flex; align-items: center; justify-content: flex-start; min-height: 44px` (от 901px — 32px, D2), `padding: 0; border: 0; background: none; color: var(--accent-text); font: 600 14px/1.3 var(--font-body); letter-spacing: 0; text-align: left; text-transform: none; overflow-wrap: anywhere; cursor: pointer`; закрытая — общий вид `.g-roster__closed`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamPlayer.fix.advancements` | Advancements | Прокачки |
| `teamPlayer.fix.open` (значение) | Fix by hand: injuries, characteristics, contract, skills, advancements | Исправить вручную: травмы, характеристики, контракт, навыки, прокачки |

- [ ] **Step 1: Падающие тесты.** В `test/team-advance-undo.test.mjs` — помощник `openUndo(phone, {id = "p3", teamAnswer})`: телефон — `playerPage(id)`, десктоп — «Состав» с `open: \`${id}#0\``; карандаш `[data-player-edit]` → строка `[data-player-fix]` → `[data-player-unadvance]`. Существующие тесты отмены — через него (содержание окна-вопроса, `PATCH`, слова — те же). Новые:
  - «no «Undo the last» on the profile nor in the desk's panel» (Player.html, DeskRoster.html): Cade (`ADVANCED`) — в `.g-profile__spp` и в `.g-roster__aside` нет `[data-player-unadvance]`.
  - «the fix by hand ends with «Advancements»: «Undo the last: Frenzy», which asks first as before» — телефон и десктоп: блок последний в `#player-fix`; нажатие → `dialog#player-unadvance` с «Undo the advancement?», «Cade · advancement 1 of 6»; `#player-fix` закрыт.
  - «a player with no advancement has no «Advancements» block».
  - «the undo is closed while the fix's form is changed, saying so; nothing opens» (Review Focus 3): «+» контракта → кнопка `aria-disabled`, `title` «Save or cancel the edit first»; нажатие — это сообщение, `#player-unadvance` нет.
  - ««Keep» and a sent undo give the focus back to the pencil»: `document.activeElement` — `[data-player-edit]` профиля / панели.
  - «closed in a match…» — переписать: матч начался, пока открыта ручная правка, — правка закрыта (как было), фокус — карандаш.
  - «styled; D2»: `valuesOf("src/screens/team/roster/fix.css", ".g-player-fix__undo", "min-height")` — 44 до 900px, ≥ 24 от 901px; в `profile.css` и `frame.css` нет `g-profile__undo`, `g-roster__undo`.
  - В `test/team-player-profile.test.mjs`, `test/team-roster.test.mjs` — убрать ожидания «Undo the last» и классов отмены (по `grep` из Files); в `test/team-player-fix.test.mjs` — строка `teamPlayer.fix.open` новыми словами.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-advance-undo.test.mjs test/team-player-fix.test.mjs test/team-player-profile.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапки `profile.mjs`, `fix.mjs`, `player.mjs`, `player-access.mjs`, `frame.css`, `injury.mjs` (комментарий к `OPENERS`) — без «Undo the last» под «Advancement»; `fix.mjs` — «…and last, the undo of the last advancement, which asks first (owner, 2026-10-20: the profile and the panel have none, as the prototypes)».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-advance*.test.mjs test/team-player*.test.mjs test/team-roster*.test.mjs` → PASS; полный прогон → PASS; `npm run check` → 0 недостижимых функций; `wc -l src/screens/team/roster/panel.mjs` < 491.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-advance-undo.test.mjs test/team-player-profile.test.mjs test/team-player-fix.test.mjs test/team-roster.test.mjs
git commit -m "feat(roster): the last advancement is undone from the fix by hand, asked first as before — the profile and the desk's panel have no undo, as the prototypes (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Карьера в профиле телефона

Прототип: `mobile/PlayerCareer.html` (блок после «Навыков»). Значения: секция — колонка с зазором 10; кнопка-заголовок — min-height 44, без рамки и фона, `justify-content: space-between`, зазор 10; «Карьера» — Oswald 700 24px (как «Навыки»), рядом по базовой линии с зазором 10 — «N SPP · по матчам» 13px `--muted`; шеврон 18px, повёрнут на 180° раскрытым; итоги — сетка 7 равных колонок, по центру, черта сверху и снизу 1px `--line` (`#DCE3DF`), отступ 8px 0, подпись 12/600 `--muted`, число 17/600 с отступом сверху 4, ноль — `--muted` (`#8A948F` → `--muted`); раскрытое — колонка с зазором 8: шапка списка 12px/700, `letter-spacing: .06em`, прописные, `--muted`, по краям «Все матчи · N» и «SPP»; рамка списка — радиус 14, кольцо 1px `--line`; строка — сетка `minmax(0, 1fr) auto`, зазор 10, min-height 56, отступ 8px 12px, черта снизу 1px `--line`; название 14/700, результат 12/700 (победа `--on-accent-tint`, ничья `--muted`, поражение `--danger`), зазор 6; что сделал — 13px `--ink-2` (тихое — `--muted`); SPP — Oswald 700 18px `--on-accent-tint` (тихое — `--muted`); плашка «ждёт итогов» — высота 20, отступ 0 7, радиус 10, `--warn-tint`/`--on-warn-tint` 11/700; сноска 12px/1.45 `--muted`. Отличия: название строки переносится (в прототипе `nowrap` с «…» — ответ владельца о переносах); фон строки «ждёт итогов» `#FFFBF2` — токена нет, строка на `--surface` (плашка остаётся); «не играл» → «пропуск матча» (нейтральные слова); «Этот сезон · 8 матчей» → «Все матчи · N» (вопрос владельцу 1) — всё в «Deviations from the prototype».

**Files:**
- Create: `career.mjs`, `test/team-player-career.test.mjs`
- Modify: `profile.mjs` (`profileMarkup`: блок после `skillsMarkup`; шапка), `profile.css`, `screen.mjs` (`screenOf`: `career`, `careerOpen`), `index.mjs` (`Visit`: `career`, `careerOpen`; начальные значения; `drawVisit` спрашивает `askCareer`), `player.mjs` (`playerHandlers`: `...careerHandlers(saving)`), `wire.mjs` (`[data-player-career]`), `src/i18n/en.json`, `src/i18n/ru.json`, `test/helpers/roster-page.mjs` (ответ истории по умолчанию в `coach()`), тесты профиля телефона, которые сверяют все запросы (`grep -ln "assertAnswered\|callKeys()" test/team-player*.test.mjs test/team-advance*.test.mjs`)

**Interfaces:**
- Consumes: `apiRequest` (как `readRolls` в `rolls.mjs`), `refusalText`; `sppCounterWeights` (`progression.mjs`); `MAIN_COUNTERS`, `EXTRA_COUNTERS` (`model.mjs`); `injuryWords` (`panel.mjs`); `icon("down", 18)`; `line.career`, `line.earned`, `line.id`.
- Produces (`career.mjs`):
  - `readCareer(teamId, playerId) → Promise<{history: {matches: object[], outside: Record<string, number>}} | {error: string}>` — `GET /api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}/history`; `history.matches` не массив → `{error: t("request.noAnswer")}`; ошибка → `{error: refusalText(error)}`.
  - `@typedef {{key: string, title: string, result: string, outcome: "won"|"drawn"|"lost"|"", events: string, spp: string, quiet: boolean, pending: boolean}} CareerRow`.
  - `careerRows(history, race) → CareerRow[]` — решение 43: старые строки без игрока (`source === "none"` и `played !== true`) до первой, где он есть, отброшены; остальные — новые сверху; последней — «Правки вне матча» (`teamPlayer.career.outside`), если в `outside` не всё по нулям. `events` — ненулевые счётчики в порядке `MAIN_COUNTERS`, затем `EXTRA_COUNTERS` и `catches`: «TD 1» (`teamRoster.counter.*` и число со знаком «−» у отрицательного), MVP при одном — «MVP» без числа; затем травма матча (`injuryWords`), через « · ». `spp` — `Σ counters[c] × sppCounterWeights(race)[c]`: больше нуля — «+N», ноль — «0», меньше — «−N»; без счётчиков или пропуск — «—». `quiet` — пропуск, «без деталей», «без действий».
  - `gamesPlayed(history) → number` — матчи `status === "confirmed"` с `played === true`.
  - `careerMarkup({line, race, career, open}) → string` — `<section class="g-profile__career">`: `<h2 class="g-profile__careerhead"><button type="button" class="g-profile__careertoggle" aria-expanded="…" aria-controls="player-career-list" data-player-career>` («Карьера», `teamPlayer.career.sub {spp: line.earned}`, шеврон) `</button></h2>`; `<dl class="g-profile__careertotals">` — `teamPlayer.career.gp` (GP — `gamesPlayed`, «–» пока история не прочитана) и `teamRoster.counter.*` из `MAIN_COUNTERS` (`line.career`); раскрытое — `<div id="player-career-list" class="g-profile__careerlist">`: чтение — `teamPlayer.career.reading` (`role="status"`), ошибка — `teamPlayer.career.failed {reason}` (`role="alert"`), пусто — `teamPlayer.career.none`, иначе шапка (`teamPlayer.career.listHead {count}` — число строк матчей, `teamPlayer.career.sppHead`), `<ul class="g-profile__careerrows">` строк и сноска `teamPlayer.career.note`.
  - `askCareer(saving, screen) → void` — только у профиля телефона (`screen.player && screen.phone`) живого игрока (`screen.lines` его держат) и только раз за визит (`visit.career === null`): `visit.career = {loading: true}`, `readCareer(teamId, line.id)`; ответ берётся, только пока визит здесь и `visit.career` — тот же объект: `visit.career = answer`, `draw()`.
  - `careerHandlers(saving) → {onCareerToggle: () => void}` — `visit.careerOpen = !visit.careerOpen`; у прочитанного с ошибкой `visit.career = null` (следующий рисунок читает снова); `draw()`; фокус остаётся на кнопке (патч).
- `index.mjs`: `Visit` — `career: null | {loading: true} | {history} | {error}`, `careerOpen: boolean` (начально `null`, `false`); `drawVisit` после рисунка: `if (screen.player && screen.phone) askCareer({teamId, visit, draw: () => drawVisit(teamId, visit, memory)}, screen)`. Не больше 6 строк (≤ 550).
- `screen.mjs` (`screenOf`): `career: visit.career, careerOpen: visit.careerOpen`.
- `profile.mjs`: `${skillsMarkup(line)}${careerMarkup({line, race: screen.race, career: screen.career, open: screen.careerOpen})}${injuriesMarkup(line)}`; у погибшего — ничего (07e).
- `wire.mjs`: `delegate(root, "click", "[data-player-career]", () => onCareerToggle())`.
- `profile.css` (до 900px, под `.g-profile`) — значения из шапки задачи; кнопка-заголовок — 44px; `overflow-wrap: anywhere` у названия и событий.
- `test/helpers/roster-page.mjs`: `coach()` отвечает `GET /api/teams/t1/players/<id>/history` → `{history: {playerId: id, matches: [], outside: {}}}` для каждого id из `PLAYERS`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamPlayer.career.title` | Career | Карьера |
| `teamPlayer.career.sub` | {spp} SPP · by match | {spp} SPP · по матчам |
| `teamPlayer.career.gp` | GP | GP |
| `teamPlayer.career.listHead` | All matches · {count} | Все матчи · {count} |
| `teamPlayer.career.sppHead` | SPP | SPP |
| `teamPlayer.career.round` | Round {round} · {opponent} | Тур {round} · {opponent} |
| `teamPlayer.career.friendly` | Friendly · {opponent} | Товарищеский · {opponent} |
| `teamPlayer.career.won` | W {own}–{opponent} | В {own}–{opponent} |
| `teamPlayer.career.drawn` | D {own}–{opponent} | Н {own}–{opponent} |
| `teamPlayer.career.lost` | L {own}–{opponent} | П {own}–{opponent} |
| `teamPlayer.career.idle` | no actions | без действий |
| `teamPlayer.career.out` | missed the match | пропуск матча |
| `teamPlayer.career.bare` | no details | без деталей |
| `teamPlayer.career.pending` | waits for the post-match | ждёт итогов |
| `teamPlayer.career.outside` | Edits outside a match | Правки вне матча |
| `teamPlayer.career.reading` | Reading the matches… | Читаем матчи… |
| `teamPlayer.career.failed` | The matches did not load: {reason} | Матчи не прочитаны: {reason} |
| `teamPlayer.career.none` | No matches yet | Матчей пока нет |
| `teamPlayer.career.note` | Actions are recorded by taps on the roster and in the post-match. A line that waits for the post-match is in the career already, and stays once both coaches finish the match. Edits outside a match are a line of their own. Matches from before the site's records have no details. | Действия записываются тапами в «Составе» и в итогах матча. Строка «ждёт итогов» уже входит в карьеру и закрепится, когда оба тренера завершат матч. Правки вне матча — отдельной строкой. Матчи до записей на сайте — «без деталей». |

- [ ] **Step 1: Падающие тесты** — `test/team-player-career.test.mjs` (окружение — как `test/team-player-profile.test.mjs`; `withWindow({phone: true})`; история `HISTORY` — три матча и правки вне матча: тур 1 против «Grimtusk Raiders» 2–1, `played: true, source: "applied", counters: {touchdowns: 2}`; товарищеский против «Duskspire Knives» без деталей; тур 2 против «Mirefen Rotters» 0–2, `played: false`; тур 3 в игре, `pending: true, source: "events", counters: {touchdowns: 1, completions: 1}`; `outside: {touchdowns: 1}`; Cade — Catcher людей):
  - «the career stands right after the skills: «Career», «N SPP · by match», the totals GP TD CAS COMP KO INT MVP» (PlayerCareer.html): порядок секций тела — `.g-profile__skills`, `.g-profile__career`, травмы; итоги — GP «1», TD … MVP — из `line.career`; ноль — тихий (`g-profile__careerzero`); `aria-expanded="false"`, списка нет.
  - «the list opens on a press: newest first — the round, the opponent, the result, what the player did, the SPP; a match on waits for its post-match; a missed one; one without details; the edits outside a match last»: строки по порядку — «Round 3 · …» (результата нет, «TD 1 · COMP 1», «+4», «waits for the post-match»), «Round 2 · Mirefen Rotters» «L 0–2» «missed the match» «—», «Friendly · Duskspire Knives» «no details» «—», «Round 1 · Grimtusk Raiders» «W 2–1» «TD 2» «+6», «Edits outside a match» «TD 1» «+3»; шапка «All matches · 4»; сноска.
  - «matches before the first one the site knows the player in are not listed»: самый старый матч `source: "none", played: false` перед туром 1 — его нет.
  - «the history is read once a visit, after the roster; another draw reads nothing more; another visit reads again» — `GET /api/teams/t1/players/p3/history` один раз после `GET /api/teams/t1`; раскрытие и сворачивание — без новых запросов.
  - «a read that failed: the totals stand, GP «–», the list says why; opening it again reads again» (Review Focus 4).
  - «an answer after the coach left draws nothing» (`api.hold`, уход на «Состав», затем ответ).
  - «a desk draws no career and reads none; a fallen player's page neither» (07e).
  - «the toggle keeps the focus; its heading is the section's» — `h2 > button[aria-controls="player-career-list"]`.
  - «every key in both dictionaries; styled; D2; wrapping»: `assertDictionaryCovers("src/screens/team/roster/career.mjs")`; `assertStyled` по `profile.css`; кнопка ≥ 44; в `profile.css` нет `ellipsis`; `assertReadable` для результата и плашки.
  - Чистые функции: `careerRows` — MVP «MVP» без числа и «MVP 2»; травма «Badly Hurt»; отрицательная правка вне матча «TD −1 · −3»; `gamesPlayed` не считает матч в игре.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-player-career.test.mjs` → FAIL (нет `career.mjs`).
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `career.mjs`: «A player's career on a phone's profile (owner, 2026-10-20; PlayerCareer.html): the totals from the roster's line, and the matches as GET …/players/:pid/history tells them — read once a visit; nothing is written. A desk's career is stage 07e's (DeskRosterCareer.html).» В `profile.mjs` и `panel.mjs` — комментарий о шве 07e: телефон рисует, десктоп — 07e. Тесты профиля телефона, которые сверяют все запросы, — плюс запрос истории (ответ — `coach()`).
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-player*.test.mjs test/team-advance*.test.mjs test/team-roster*.test.mjs` → PASS; полный прогон → PASS; `wc -l src/screens/team/roster/index.mjs` ≤ 550.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-player-career.test.mjs test/helpers/roster-page.mjs test/team-player*.test.mjs test/team-advance*.test.mjs
git commit -m "feat(roster): a player's career on a phone's profile, after the skills — the totals, and on a press the matches as the site recorded them (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Поиск в полосе «Состава» на десктопе

Прототип: `desktop/DeskRoster.html` (шапка): поле справа — `label` шириной 320px, `max-width: 100%`, высота 44, отступ 0 14, зазор 10, радиус 12, фон `#F3F6F4` (`--surface-2`), цвет `#5F6B65` (`--muted`, лупа 18px); `input type="search"` — 15px, `#14201A` (`--ink`), без рамки и фона, `aria-label` «Поиск», `placeholder` «Игроки, навыки, правила…»; шапка — `flex-wrap: wrap`, зазор 16. Строки счёта и «Искать в справочнике» в прототипе нет — §7.

**Files:**
- Create: `search.mjs`, `test/team-roster-search.test.mjs`
- Modify: `view.mjs` (`rosterMarkup`: поле в `metaHtml`; `layoutMarkup`: фильтр секций, строка найденного), `index.mjs` (`pressHandlers`: `...searchHandlers(saving)`), `wire.mjs` (поле, Esc, ссылка), `memory.mjs` (`query`), `frame.css`, `src/i18n/en.json`, `src/i18n/ru.json`

**Interfaces:**
- Consumes: `renderSearchField` (`ui/search-field.mjs`); `normalizeText` (`src/screens/ref/search.mjs`); `setRefQuery`, `askSearchFocus` (`src/screens/ref/memory.mjs`); `refUrl` (`core/routes.mjs`); `rosterSections` (`model.mjs`); `line.number`, `line.name`, `line.position`, `line.skills[].name`.
- Produces (`search.mjs`):
  - `queryWords(query) → string[]` — `normalizeText(query).split(" ").filter(Boolean)`.
  - `lineMatches(line, words) → boolean` — каждое слово: только цифры — `Number(word) === Number(line.number)` (номер не число — не подходит); иное — подстрока `normalizeText` имени, позиции или одного из навыков. Пустой `words` — `true`.
  - `searchFieldMarkup(query) → string` — `<div class="g-roster__search">` с `renderSearchField({id: "roster-query", label: t("teamRoster.search.label"), placeholder: t("teamRoster.search.placeholder"), value: query, data: {rosterQuery: ""}})`.
  - `foundMarkup(query, count) → string` — `<div class="g-roster__found"><p class="g-roster__foundcount" role="status">` (`teamRoster.search.found {count}` при запросе, иначе пусто) `</p>` и при запросе `<a class="g-roster__refsearch" href="${refUrl()}" data-roster-refsearch>` (`teamRoster.search.ref {query}`) `</div>`.
  - `searchHandlers(saving) → {onRosterQuery: (value: string) => void, onRosterQueryClear: () => void, onRefSearch: () => void}` — `memory.query = value` и `draw()`; очистка — `memory.query = ""`, `draw()`; переход — `setRefQuery(memory.query)`, `askSearchFocus()` (переходит ссылка сама).
- `memory.mjs`: `RosterMemory.query: string`, начально `""`; шапка — «…and the query of a desk's search».
- `view.mjs`:
  - `rosterMarkup`: `renderPageHead({title, sub, metaHtml: screen.phone ? "" : searchFieldMarkup(screen.memory.query)})`.
  - `layoutMarkup`: на десктопе `words = queryWords(memory.query)`; при словах `active`, `skipping`, `fallen` — только `lineMatches`; `choiceOf` — по отфильтрованным; «Активный состав» без найденных — `<p class="g-roster__empty">` со словами `teamRoster.search.none {query}` без кнопки найма; «Пропускают матч» и «Погибшие» без найденных не рисуются; первой в `main` на десктопе — `foundMarkup(memory.query, найдено)` (всегда, чтобы живая область была до первого текста). Телефон — без изменений. Не больше 25 строк в `view.mjs`.
- `index.mjs`: импорт и `...searchHandlers(saving)` в `pressHandlers` — 2 строки.
- `wire.mjs`: `delegate(root, "input", "[data-roster-query]", (event, field) => onRosterQuery(field.value))`; `delegate(root, "keydown", "[data-roster-query]", (event) => { if (event.key === "Escape") { event.preventDefault(); onRosterQueryClear(); } })`; `delegate(root, "click", "[data-roster-refsearch]", () => onRefSearch())`.
- `frame.css` (от 901px): `.g-roster > .g-pagehead { flex-wrap: wrap; }`; `.g-roster__search { width: 320px; max-width: 100%; }`; `.g-roster__search .g-search__input { height: 44px; font-size: 15px; }` (общий `.g-search` — 48px/16px — не трогать); `.g-roster__found` — `display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: 0 0 12px`, пустой — `margin: 0`; `.g-roster__foundcount` — `margin: 0; font: 400 13px/1.45 var(--font-body); color: var(--muted)`; `.g-roster__refsearch` — `display: inline-flex; align-items: center; min-height: 32px; font: 600 14px/1.3 var(--font-body); color: var(--accent-text); text-decoration: none; overflow-wrap: anywhere` (подчёркивание — при наведении).

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.search.label` | Search | Поиск |
| `teamRoster.search.placeholder` | Players, skills, rules… | Игроки, навыки, правила… |
| `teamRoster.search.found` | Players found: {count} | Найдено игроков: {count} |
| `teamRoster.search.none` | Nobody on the roster matches «{query}» | По запросу «{query}» в составе никого нет |
| `teamRoster.search.ref` | Search the reference: «{query}» | Искать в справочнике: «{query}» |

- [ ] **Step 1: Падающие тесты** — `test/team-roster-search.test.mjs` (окружение — `test/helpers/roster-page.mjs`, `withWindow({phone: false})`; набор — `fireEvent(field, "input")` после `field.value = …`):
  - «a desk's roster head has the search as DeskRoster draws it» — в `.g-pagehead__meta` поле `#roster-query`, `type="search"`, метка «Search», placeholder «Players, skills, rules…»; `valuesOf("src/screens/team/roster/frame.css", ".g-roster__search", "width")` — `320px`, высота поля 44, шрифт 15px.
  - «typing narrows the three tables by name, number, position and skill; every word must match; «ё» as «е»» (`PLAYERS` и `FALLEN` из `roster-page.mjs`, люди): «cade» → только Cade; «3» → только Cade (номер целиком: «Blitzer» и навыки с цифрами не подходят); «lineman» → Ann в «Активном составе», Dell и Finn в «Пропускают матч», Joe в «Погибших»; «ann lineman» → Ann; «block» → Bors (Blitzer: Block, Tackle) и погибший Pike (Blitzer); «pike» → только Pike, «Активный состав» — «Nobody on the roster matches «pike»», «Пропускают матч» не рисуется; чистые проверки `lineMatches`: `{name: "Ёрш"}` находится по «ерш» и «ЁРШ», номер `"07"` — по «7», навык `Mighty Blow (+1)` — по «mighty».
  - «the count is said in a live region; a query that finds nobody says so under «Active roster» and draws no other section» (Review Focus 5): `.g-roster__foundcount[role="status"]` есть и без запроса (пустой), при запросе — «Players found: 1».
  - «Esc clears the query; the focus stays in the field»: `keydown` Escape → таблица целиком, `memory` пуст, `document.activeElement` — поле.
  - ««Search the reference: «block»» leads to #/ref with the query and the caret asked for»: `href` — `#/ref`; нажатие → `refQuery()` — «block», `takeSearchFocus()` — `true`.
  - «the panel shows the first player found when the chosen one is filtered out, and the chosen one again once the query is gone»: выбран Ann (`memory.selected`), запрос «cade» → в панели Cade, `memory.selected` — по-прежнему Ann; Esc → в панели Ann.
  - «a phone has no field, and a query kept from a desk filters nothing there» (`withWindow({phone: true})`: `#roster-query` нет, все строки на месте).
  - «the query is the page's memory: a visit elsewhere and back finds it; the address and the storage hold nothing» (`location.hash` без запроса, `localStorage` пуст).
  - «every key in both dictionaries; styled; D2» — `assertDictionaryCovers("src/screens/team/roster/search.mjs")`; `assertStyled` по `frame.css`; ссылка ≥ 24px; `assertReadable` для счёта и ссылки.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-search.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `search.mjs`: «A desk's roster search (owner, 2026-10-20; DeskRoster.html): typing narrows the three tables to the players whose number, name, position or skill each word of the query finds; a line leads to the reference with the same query — the way stage 11's strip does (`setRefQuery`, `askSearchFocus`). The query is the page's memory; a phone has no field. Nothing is written.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-roster*.test.mjs test/team-player*.test.mjs test/ref*.test.mjs` → PASS; полный прогон → PASS; `wc -l src/screens/team/roster/index.mjs` ≤ 554, `view.mjs` ≤ 440.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster-search.test.mjs
git commit -m "feat(roster): a desk's roster search in the page's band — typing narrows the three tables by number, name, position and skill, and a line takes the query to the reference (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 26: Mock истории, smoke двух кубиков, проверка в браузере

**Files:**
- Create: `scripts/mock/history.mjs`
- Modify: `scripts/mock/roster.mjs` (цепочка `answerRoster` — `[answerRolls, answerFallen, answerHistory]`, шапка), `scripts/smoke-api.mjs` (один шаг, шапка). `scripts/mock-api.mjs` не трогается (599).

**Interfaces:**
- `scripts/mock/history.mjs`: `answerHistory(request, pathname, mock) → Promise<{status, payload}|null>` — `GET /api/teams/:id/players/:pid/history` (как `server/routes/player-history.mjs`: нет команды — 404 `TEAM_NOT_FOUND`; ответ `{history: {playerId, matches, outside}}`, поля матча — как `loadPlayerHistory`: `pairingId, kind, seasonId, roundNumber, status, opponent: {teamId, name}, score, played, source, counters, injury, pending`). Фикстура `t1`: матчи `g4` (тур 1, победа 2–1) и `g5` (тур 2, поражение 0–2) с соперниками и счётом, как их держит `scripts/mock-api.mjs` (`pairingOf("g4" …)`, `pairingOf("g5" …)` — имена соперников переписать оттуда), и товарищеский без деталей; у `p3` (Blitzer Three, 7 TD): `g4` — `{touchdowns: 2}`, `g5` — сыграл без действий, товарищеский — `source: "none"`, `outside: {touchdowns: 5}`; у остальных игроков `t1` — те же матчи `played: null, source: "none", counters: null`; у других команд — `matches: [], outside: {}`. Шапка — что отвечает и чего не делает (сезон не фильтруется).
- `scripts/smoke-api.mjs`, шаг «a random skill is two dice, both skills the player lacks and different; an advancement takes the second; undone, the roll is the player's again» — после шага прокачки характеристики, до переименования; игрок — второй в составе (`otherId`), раса `teams/amazon`:
  1. `PATCH` с `spp.touchdowns` 1 у `otherId` (3 SPP — случайный навык на первом ранге);
  2. `POST …/players/:otherId/rolls {purpose: "random_skill", category: "General"}` → `rolledDice(roll)` длиной 2, навыки разные, ни одного нет у игрока (`heldSkillKeys`);
  3. `takeAdvancement(race, row, player, {type: "random", grant: {skill: <навык второго кубика>}, roll: {id, via: "site"}}, skillGroups)` → `PATCH` 200;
  4. `GET …/rolls` → этот бросок `usedAt` не `null`;
  5. `undoLastAdvancement` → `PATCH` 200; `GET …/rolls` → `usedAt` `null`; тот же `POST` → тот же `id`.
- `scripts/smoke-api.mjs`: импорт `rolledDice` (`dice.mjs`), `heldSkillKeys` (`players.mjs`); шапка — «… a random skill's two dice …».

- [ ] **Step 1: Mock** (рецепт М): `curl -fsS -H 'Authorization: Bearer mock' http://localhost:5178/api/teams/t1/players/p3/history` → три матча и `outside.touchdowns` 5; `…/players/p1/history` → матчи без деталей; `…/teams/nope/players/p1/history` → 404 `TEAM_NOT_FOUND`. Mock остановить после шага 2.
- [ ] **Step 2: Браузер** (встроенный, mock 5178, токен `mock` в `gata-league-auth-token` хранилища): 390 — `#/t/t1/roster/p3`: «Карьера» после «Навыков», итоги, раскрытие — строки; «Прокачка» → случайный → General → «Бросить два D16» → две карточки → выбор → «Принять»; карандаш → «Исправить вручную…» → «Прокачки» → «Отменить последнюю: Dodge» → окно-вопрос → «Оставить» → фокус на карандаше; 1440 — `#/t/t1/roster`: поле в шапке, «block», «Esc», «Искать в справочнике» → `#/ref` с запросом; окно прокачки Blitzer Three (десктоп) — после броска кнопки броска нет. Mock перезапускать после состояний, которые пишут. Что видно — в отчёт задачи.
- [ ] **Step 3: Smoke** (рецепт С): `APP_URL=http://localhost:3074 npm run smoke` → `Smoke test passed.`, новый шаг — `ok`; `. output/07d/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3074 npm run smoke:post-match` → `passed`. Сервер остановить.
- [ ] **Step 4: Проверки** — `npm run build && . output/07d/env.sh && npm test && npm run check && npm run i18n:check` → PASS, одинаковое число страниц EN/RU, 0 fallback; `wc -l scripts/mock-api.mjs` → `599`.
- [ ] **Step 5: Commit**

```bash
git add scripts/mock/history.mjs scripts/mock/roster.mjs scripts/smoke-api.mjs
git commit -m "test(smoke): a random skill's two dice on the real server, the second taken and undone; the mock tells a player's career by match" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## После Task 26: контроллер повторяет Task 17–19 плана 07d

Своих задач контроллера у дополнения нет. После Task 26 контроллер исполняет Task 17 (снимки рядом с прототипами), Task 18 (финальное ревью, правки спек, проверки) и Task 19 (PR) **плана 07d** — с тем, что дополнение в них приносит:

- **Task 17:** заново снять состояния, которые дополнение изменило, и добавить новые: A4 (два кубика на сайте, 390 и 1440: на 1440 — без кнопки броска) рядом с `Adv3Random` / `DeskRosterAdv`; A4t (стол: две отметки и выбор, 390) рядом с `Adv3Random`; P1 и P1c (профиль 390 с «Карьерой» свёрнутой и раскрытой) рядом с `Player` / `PlayerCareer`; U1 (отмена из «Исправить вручную», 390 и 1440) — действие «карандаш → «Исправить вручную…» → «Отменить последнюю»»; F1 (ручная правка с блоком «Прокачки»); S-поиск R2 (1440: «block» набран, и «никого не нашлось») рядом с `DeskRoster`; прежний P1 1440 — с полем в шапке. Каждое отличие — исправить или записать, как в шаге 5 Task 17.
- **Task 18, шаг 2 (правки спек):** спека 3.0 §0.2 и §3.4 — «случайный навык — два D16: оба навыка у игрока отсутствуют и различны, тренер берёт один; один свободный навык — один кубик; `stale` — когда у игрока оба; формат `result.dice`, бросок одного кубика читается как раньше»; §9.5 — попыток не показывают; шторка навыка говорит, что выпало на кубиках; §6 — модули `career.mjs`, `search.mjs`; §7 — расхождения дополнения: двойной блок (решения 37–38, нет макета), один кубик при одном свободном навыке (решение 34), отмена в ручной правке (решение 40), «Карьера» — отличия Task 24, поиск — строка счёта и «Искать в справочнике» (нет макета). Спецификация интерфейса: §6 — «Поиска в полосе нет (этап 13)» → поиск построен (07d, решения 44–46); §12 — карьера в профиле телефона, отмены в профиле нет; §13 — два кубика, отметки за столом, отмена из ручной правки.
- **Task 18, шаг 3:** в списке `wc -l` — `career.mjs`, `search.mjs`; `git diff --name-only origin/redesign -- server/` — по-прежнему только `team-rolls.mjs` и `dice-rolls.mjs`.
- **Task 19 (тело PR):** ответы владельца 2026-10-20 и как исполнены; вопрос владельцу 1 и принятые умолчания; известные ограничения — карьера на десктопе и у погибшего (07e), матч, закончившийся при открытом профиле, — до следующего входа, GP — по матчам, которые знает сайт; таблица «Как идёт каждая запись» с правками этого дополнения.

---

## Передача следующим этапам

- **07e · карьера на десктопе.** `readCareer`, `careerRows`, `gamesPlayed` (`roster/career.mjs`) — для панели (`DeskRosterCareer.html`, шов в `sidePanelMarkup`) и для профиля погибшего; ответ владельца на вопрос 1 — там же. Обновлять историю, когда кончается матч при открытом профиле (`onGamesChange`).
- **09b · итоги.** Случайный навык в итогах — тот же бросок двух кубиков: `askRoll`, двойной блок `pairMarkup` (`roll-view.mjs`), `rolledDice`, `rollFitsAdvancement`.
- **10 · соперник.** Публичные броски сопернику — без попыток: что выпало (`rolledDice`), как в шторке навыка.
- **13 · зачистка.** Глоссарий: «Два D16», «Выпавшие навыки»; поиск в полосе других экранов — тот же `searchFieldMarkup`/`setRefQuery`.

## Охват

| Пункт | Задача |
|---|---|
| Ответ владельца 1: два кубика сразу, 1dN по таблице категории, как `randomSkillRoll` сервера | 20 (решения 32–33) |
| …пустая грань и имеющийся навык перебрасываются по кубику, оба годны и различны | 20 (`twin`), 21 |
| …тренер выбирает один | 21 (решение 37) |
| …«Бросил за столом»: отметить два выпавших и выбрать | 21 (решение 38) |
| …нет «Roll D16» на десктопе после броска, нигде нет списка попыток | 21, 22 (решение 39) |
| …`randomSkillRoll` (форма результата), `rollFitsAdvancement` (любой из двух), `stale` (оба) — решено и обосновано | 20 (решения 32, 35, 36) |
| …домен (`dice.mjs`; `takeAdvancement` не меняется — решение 36), клиент (`roll-view`, `advance`, `advance-sheet`, `rolls.css`), mock, smoke, тесты | 20, 21, 22, 26 |
| …миграции нет (`jsonb`, 012) | Архитектура, решение 32 |
| …держится: один запрос, тот же бросок при повторе, потерянный ответ, `DICE_ROLL_WAITING`, порядок K8, отмена освобождает | 20 (сервер не меняется в этом), 21 (тесты повтора и ожидания), 26 (smoke) |
| Ответ владельца 2: отмены нет в профиле и панели; она в «Исправить вручную» с вопросом и шагом очереди; мёртвый код удалён; тесты | 23 (решение 40) |
| Ответ владельца 3: «Карьера» после «Навыков» с раскрытием, как `PlayerCareer`; данные — `GET …/history`; чего нет — вопрос с умолчаниями; десктоп — 07e, шов цел | 24 (решения 41–43, вопрос 1), 26 (mock) |
| Ответ владельца 4: поиск в шапке десктопа, фильтр по имени, номеру, позиции, навыку; «Искать в справочнике: …» с запросом (механизм этапа 11); на телефоне поля нет; близость к полю прототипа; секции пропускающих и погибших фильтруются; Esc и счёт для диктора | 25 (решения 44–46) |
| Ограничения: близость к прототипам, D2, нейтральные слова, переносы, пространства ключей, пределы строк, инварианты 07a–07c | Global Constraints; тесты каждой задачи |
| Снимки, правки спек, PR | Task 17–19 плана 07d (раздел «После Task 26») |

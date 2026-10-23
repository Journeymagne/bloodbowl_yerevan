# Этап 07a · Состав: таблица, сортировка, счётчики — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** перенести «Состав» `#/t/:id/roster` на 3.0 — таблица с сортировкой, раскрываемая строка на телефоне и правая панель на десктопе, чипы навыков с правилом, вторая шапка снизу, счётчики SPP с −/+ (TD, CAS, COMP, KO, INT, MVP и ряд TTM, приземление, бонус), режимы «идёт подготовка» и «идёт матч» (записи, «Правка вне матча», «Травма в матче», закрытая прокачка), конфликт сохранения и нет сети — и миграцией `016` сделать MVP счётчиком записей, чтобы ручная правка MVP попадала в историю игрока.

**Architecture:** что показывает строка игрока, считает чистая модель `src/screens/team/roster/model.mjs` из ответа `GET /api/teams/:id`, неучтённых записей `GET /api/teams/:id/events` (одна ревизия) и списка игр (`state.games`, режим экрана). Вне матча тап меняет блоб одним `PATCH /api/teams/:id` через очередь `createRosterStore` (свой экземпляр экрана), во время матча — запись `POST /api/teams/:id/events` через свою очередь «по одному в пути». Разметка — из `src/ui`: новые `RosterTable` (настоящий `<table>`) и `NumberBadge`, доработанные `ActionStepper`, `StatStrip`, `StatusChip`. Одна разметка на обе ширины, CSS на 900/901 выбирает раскрытую строку или правую панель. Сервер: `016_match_event_mvps.sql` расширяет `CHECK` счётчиков, домен отделяет счётчики правки (с MVP) от счётчиков матча (без MVP).

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/fake-dom.mjs`, `fake-api.mjs`, `scratch-db.mjs`, `api-db.mjs`, `match-db.mjs`; PostgreSQL 16 в Docker (`127.0.0.1:5437`); CSS custom properties; нативный `<dialog>`; `npm run screens`, `scripts/mock-api.mjs`, `npm run rehearsal:*`.

**Spec:**
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0 (п. 1, 8, 9, 11, 12, 13), §2 (таблица «До своего этапа», `#/t/:teamId/roster[/:playerId]`), §3 (вступление), §3.7 целиком, §4 (`GET/POST …/events`, `…/history`, `PATCH /api/teams/:id`), §5, §6 (строки «Состав …»).
- Спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §0, §6, §7, §8, §12 («Карьера по матчам» — только чтобы не помешать 07e), «Модель записей матча».
- Спека выката `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md`: §0.10–0.11, §3.1–3.2, §5.1 (миграции только добавляют).
- Мастер-план `docs/superpowers/plans/2026-10-14-redesign-rollout.md`: Global Constraints, протокол этапа (шаги 1–10), строка 07a–07e (smoke: `smoke`, `smoke:post-match`), «Дополнения к этапам → 07a–07e» и блок «05–13».
- План 3.0 `docs/superpowers/plans/2026-10-14-redesign.md`: этап 7, пункт 7a.
- Handoff `docs/redesign/handoff-0.9.1/`: `SCREENS.md` (флоу «Состав · Список и счётчик SPP», «Состав · Во время подготовки и матча», «Состав · Сохранение: конфликт и нет сети»); прототипы `mobile/Stats.html`, `StatsScrolled.html`, `StatsSkill.html`, `StatsPrep.html`, `StatsLive.html`, `StatsLiveInjury.html`, `SaveConflict.html`, `SaveOffline.html`, `desktop/DeskRoster.html`, `DeskRosterPrep.html`, `DeskRosterLive.html`, `DeskSaveConflict.html`; `design-system/` (RosterTable, ActionStepper, SkillChip, StatStrip, NumberBadge, BottomSheet), `PR-CHECKLIST.md`.
- Планы 02b (`2026-10-16-rd-02b-match-events.md`: рецепты Т/Р/М, засеянный дамп Task 0), 03 (контракт записей), 06 и 11 («Передача следующим этапам»); отчёт `docs/redesign/reports/M1.md` («Решения владельца»: MVP в истории — миграция `016`).

## Global Constraints

- Ветка `rd/07a-roster-table` от `origin/redesign` `a39b932` (этапы 06 и 11 влиты), worktree `/Users/felstell/git/bb-rd-07a`. PR в `redesign` по протоколу мастер-плана, шаги 6–10; в задачах ничего не пушить. Окружение тестов — `output/07a/env.sh` (`GATA_TEST_DATABASE_URL`, `SMOKE_URL` → `gata_smoke_07a`; `SEED_URL` добавляет Task 1).
- **Параллельный этап 08** (казна и ресурсы, `../bb-rd-08`, ветка `rd/08-treasury`). Договор о владении — обязательный:
  - **порядок слияния:** сначала 08, затем 07a (08 меньше и везёт срочный фикс); 07a ребейзится на свежую `redesign` перед Task 15 и перед PR;
  - **07a владеет:** маршрутами `teamRoster` (`#/t/:id/roster`) и `teamPlayer` (`#/t/:id/roster/:playerId`); каталогом `src/screens/team/roster/`; компонентами-таблицами в `src/ui` (`roster-table.*`); миграцией `016` и серверными счётчиками записей (`src/domain/post-match/events.mjs`, `history.mjs`, `server/routes/team-events.mjs`, тесты записей);
  - **08 владеет:** маршрутом `teamManage` (`#/t/:id/team`); каталогом `src/screens/team/manage/`; счётчиками ресурсов со стадией; журналом казны и Coach's Safe; срочным фиксом `STAGE_PURCHASE_LOCKED` в редакторе 2.x — **07a не правит** `src/screens/saved-roster.mjs`, `src/components/roster-editor/*`, `src/components/roster-editor-shared.mjs`, `src/components/roster-notices.mjs`;
  - `saved-roster.mjs` остаётся: им рисуются `teamPlayer` (до 07d) и `adminTeamEdit` (до 12); удаление — в конце серии 07;
  - **полоса казны на десктопе в «Составе»:** 08 экспортирует `renderTreasuryStrip({team}) → string` и `wireTreasuryStrip(root) → () => void` из `src/screens/team/manage/strip.mjs`; 07a ставит её одной поздней задачей (Task 15) после ребейза на `redesign` с влитым 08. Если 08 к тому времени не влит, контроллер отдаёт Task 15 этапу 07b;
  - **общие файлы** — каждый этап правит только свои записи, минимальными кусками; конфликт — объединение. Куски 07a: `src/core/router.mjs` (импорт и строка `teamRoster:`), `src/styles.css` (три `@import` в конце), `src/i18n/en.json` и `ru.json` (ключи `teamRoster.*`, `ui.badge.*`, `ui.stat.*`, `ui.stepper.thisMatch`), `src/ui/icons.mjs` (`pencil`, `offline`), `src/ui/status-chip.*` (тон `danger`), `src/ui/action-stepper.*`, `src/ui/stat-strip.*`, `scripts/mock-api.mjs` (подключение `scripts/mock/roster.mjs`, ростер `t2`, игра `g7`, обрыв соединения), `src/data/teams.mjs` (экспорт `refusalWithRules`), `src/screens/teams/builder-view.mjs` (импорт `positionKind`), `src/components/content-links.mjs`; `src/core/state.mjs` этап не трогает;
  - **серверы:** 07a — реальный сервер на порту **3071** над `gata_smoke_07a` и mock API с `MOCK_PORT=5171`; 08 — 3081 и 5181. Никогда `gata_league` для данных, никогда общие 3002 и 5173–5176.
- Vanilla ES-модули, хешевый роутер; без фреймворка, сборщика, TypeScript и новых зависимостей.
- CSP прода: ни inline JS, ни `style="…"`, ни `on…=`; цвета — классами и токенами.
- Каждая строка интерфейса — через `t("key")`; новые ключи — в обоих словарях, в пространствах, перечисленных выше, без дублей. Ключ из шаблонной строки (`` t(`teamRoster.counter.${key}`) ``, `` t(`teamRoster.injury.${code}`) ``, `` t(`teamRoster.source.${source}`) ``) получает тест, перебирающий все значения.
- `escapeHtml` на каждую интерполяцию; пропс `…Html` — только разметка другой функции `render…()`. Исключение — `page.html` навыка из сборки (уже экранирован `scripts/build-data.mjs`, проверен этапом 11).
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 на функцию, 0 недостижимых функций; `src/app.js` — не больше 120 строк (этап его не трогает). `scripts/mock-api.mjs` (571 строка) остаётся ≤ 600: новое — в `scripts/mock/roster.mjs`. Бюджеты только уменьшаются.
- Ловушка `scripts/check-references.mjs`: ключ объекта, равный экспорту проекта плюс одна буква, ломает `npm run check`. В этом этапе опасны прежде всего `td:`, `th:`, `tr:`, `to:` (→ `t`), а также `states:`, `views:`, `icons:`. Колонки и счётчики называются полными именами (`touchdowns`, `player`), не `td`; новый экспорт не должен быть ключом объекта без последней буквы.
- Брейкпоинты только `max-width: 900px` / `min-width: 901px`. Нажимаемое — от 44px. Кольцо фокуса — из `src/ui/base.css`; токен `--focus-ring` не использовать. Новый CSS задаёт шрифт, рамку, фон, `text-transform`, `letter-spacing` и `font-weight` явно (правила 2.x `table`, `th`, `td`, `button` живут до этапа 13). Каждый новый `.css` — `@import` в конце `src/styles.css`.
- Перенесённый экран удаляет свой модуль и CSS 2.x в том же PR — **кроме** редактора 2.x: им ещё рисуются `teamPlayer` и `adminTeamEdit` (см. договор с 08). 07a не удаляет ни одного файла 2.x.
- `content/` не меняется.
- Правила и числа — из `src/domain/**` и `content/Gata/**`, вид — из прототипов; расхождение макета с кодом правится по коду без вопроса (§0.1, §0.12); контент против кода — стоп, вопрос владельцу.
- **Миграции** (дисциплина 02a/02b): рецепт Т (одноразовые базы) → рецепт Р (засеянный дамп схемы 008) → рецепт М (dev-база, только в Task 17, после финального ревью). До М файл `016` можно править; после М — нет (`server/db/migrate.mjs` сверяет checksum), дефект после М — новая миграция и стоп-условие. Никаких `DELETE`, `UPDATE`, `DROP TABLE`, чтения или перезаписи строк; единственный `DROP` — ограничения `match_events_counter_check` в том же `ALTER TABLE`, что добавляет его шире.
- Запись в аккаунт (`PATCH`, `POST …/events`) сначала спрашивает `sessionTokenHolds()` и при чужом токене ничего не отправляет (этап 05, R12).
- Тесты: сначала `npm run build` (тесты читают `public/data.*.json`); затем `. output/07a/env.sh && npm test` (тесты БД идут только с `env.sh`, без него — `# skipped`), `npm run check`, `npm run i18n:check`. Каждый PR: одинаковое число страниц EN/RU, 0 fallback; `npm run smoke` и `npm run smoke:post-match` на сервере 3071.
- Комментарии в коде — по-английски, в тоне соседних файлов; ответы владельцу — по-русски.
- Каждая задача — один коммит с тестами; сообщение коммита заканчивается вторым `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Стоп-условия:** контент и код расходятся в правиле; нужно продуктовое решение вне спек и этого плана; правка файла 2.x из списка 08 неизбежна; `016` нужно изменить после рецепта М. Остановиться и спросить контроллера.

## Review Focus

1. **Быстрые тапы и ответ, потерянный в пути.** Два быстрых «+» вне матча — два `PATCH` по порядку, второй с ревизией, которую вернул первый; итог +2, а не 409 против самого себя. `PATCH`, чей ответ пропал, но сервер его принял, при повторе получает 409 с нашими же счётчиками — это не «другое устройство». Во время матча «−» сразу за «+» не обгоняет его и не получает `EVENT_BELOW_ZERO`; запись, чей ответ пропал, не отправляется второй раз — записи перечитываются. Тесты:
   - Task 7: «two quick taps are two PATCHes in order, the second on the revision the first came back with»; «a 409 that carries our own counters is a save that landed while its answer was lost».
   - Task 8: «taps go one at a time: a minus waits for the plus before it»; «a tap whose answer was lost is not sent again».
   - Task 11: «a minus right after a plus counts the plus still on its way».
2. **Матч начался или кончился, пока состав открыт; сторона уже сохранила «Игроки».** Ожидание: вне матча при непрочитанных играх тап блоба не делается (`PATCH` во время матча сломал бы `finishPost`); `MATCH_NOT_LIVE` перечитывает игры и записи и переводит экран в обычный режим, тап не превращается в `PATCH` молча; после `EVENT_SIDE_LOCKED` кнопки матча говорят «измените на шаге «Игроки»» до следующего тапа. Тесты: Task 10 «while the games are unread no tap writes the roster»; Task 11 «a match that ended elsewhere: the tap is refused, the screen reads the games and the records again and leaves the match mode»; «a side that saved its Players step: the refusal is said, and the match's steppers say it before the next tap».
3. **Блоб и записи из разных моментов.** Финиш матча между чтением команды и чтением записей посчитал бы матч дважды или ни разу. Ожидание: экран показывает карьеру только когда `revision` записей равна ревизии команды, иначе читает обе ещё раз. Task 7: «the team and its records are read until they agree on the revision».
4. **Правка блоба поверх ждущих записей.** Вне матча карьера = блоб + неучтённые записи (брошенный матч, счёт, подтверждённый в обход итогов). Ожидание: тап шлёт значение блоба ± 1, а не карьеры ± 1, и «−» выключен по блобу; при «Правке вне матча» «−» выключен, когда блоб + ждущие правки вне матча = 0, а у тапа матча — когда счётчик этого матча = 0. Тесты: Task 7 «a tap writes the stored counter plus one, never the career»; Task 6 «the minus of each kind of edit stops where the server would refuse it».
5. **Состав, который трудно нарисовать.** Раса, которой нет в справочнике; игрок с `rowIndex` вне ростера расы; два игрока 2.x под одним id; PA «–»; характеристика, сниженная травмой; имя игрока и навыка с разметкой. Ожидание: ни исключения, ни `undefined`; строки с общим id обе видны и различимы, а отказ сервера называет обоих; «–» в сортировке последний; сниженное помечено и цветом, и текстом. Тесты: Task 6 «an odd roster: no race, a row the race has not, a shared id, a missing PA»; Task 9 «a player's and a skill's name are text»; Task 5 «a changed value says so in words, not only in colour».

## Решения этого плана

Источники оставили их открытыми; план принимает их так (контроллер подтверждает до исполнения).

**Маршруты и что остаётся 2.x**

1. **`teamRoster` рисует 3.0 (`renderTeamRoster`), `teamPlayer` до 07d рисует редактор 2.x**, как обещает таблица спеки 3.0 §2 («`#/t/:teamId/roster[/:playerId]` … заменит 08, 07a и 07d»). Из 3.0-состава туда ведут «Профиль и прокачка» (телефон), «Прокачать» и карандаш панели (десктоп) — `teamPlayerUrl(team, player)`. Так между PR серии 07 тренеру остаётся всё, что 07a не переносит: найм, продажа, пропуск, гибель, прокачка, номер, имя, капитан. Во время матча эти ссылки закрыты (решение 13). Вопрос владельцу 1.
2. **Выбор игрока — в памяти страницы, не в адресе** (`memory.mjs`, по команде): выбранный игрок, сортировка, «Правка вне матча». В адрес и в localStorage не пишется; перезагрузка забывает. На десктопе без выбора панель показывает первого игрока таблицы; на телефоне раскрыта одна строка или ни одной. Адресом панели `teamPlayer` сделает 07d.

**Таблица**

3. **RosterTable — настоящий `<table>`** (`src/ui/roster-table.mjs`), а не сетка кнопок из README компонента: `aria-sort`, заголовки строк и колонок, чтение колонками. Сначала строгий разбор fake-dom (Task 3). Один игрок — один `<tbody>`: основная строка, строка чипов (телефон), строка раскрытой панели (телефон). Чипы рисуются дважды — в ячейке игрока (от 901px) и своей строкой во всю ширину (до 900px); вторая копия скрыта `display: none` и в дерево доступности не попадает.
4. **Колонки:** «Игрок» (номер, имя, позиция), MA ST AG PA AR — на обеих ширинах; от 901px ещё TD CAS COMP KO INT MVP, SPP «Всего» и «Дост.» (как `DeskRoster`). Подпись брони — AR (`stats.ar`), как в справочнике этапа 11, а не AV макета. От 901px таблица в рамке с `overflow-x: auto`, колонка игрока липкая слева: на 901–1279 px рядом с панелью 320px таблица прокручивается в рамке, страница вбок не едет (брейкпоинтов, кроме 900/901, нет).
5. **Сортировка:** первое нажатие — числа по убыванию, AG и PA по возрастанию (меньше — лучше), «Игрок» — по номеру по возрастанию; повторное — обратный порядок. Игрок без значения (PA «–») — последний в обе стороны; равные — в порядке состава. Сортировка помнится на странице (решение 2).
6. **Нижняя шапка** — `<tfoot aria-hidden="true">` с подписями колонок, без кнопок и без «+»: глазам в конце длинного списка. Липкой верхней шапки нет: над ней липкая сжимающаяся шапка оболочки (этап 05), второй липкий слой лёг бы на неё.
7. **Изменённая характеристика** — цвет **и** текст для экранного диктора: улучшенная (`statMods > 0`) — `--accent-text` 700 и «улучшена»; сниженная травмой (`< 0`) — `--danger` и «снижена». В таблице и в StatStrip (мастер-план, 07a: WCAG 1.4.1). Капитан — диск «C» на номере (`ui.badge.captainMark`) и «Капитан» для диктора.

**Счётчики**

8. **Набор счётчиков:** основные TD, CAS, COMP, KO, INT, MVP (на телефоне две колонки), ряд узких плиток TTM, Приземление, Бонус. Ценность — `sppCounterWeights(race)` (у Brawlin' Brutes TD +2, CAS +3). CATCH показывается четвёртой узкой плиткой только там, где приносит SPP (`weights.catches > 0`, Passing Virtuosos): правило из кода важнее макета, где его нет.
9. **Что показывает счётчик и где кончается «−».** Значение — карьера: блоб + неучтённые записи (`careerCounters`, спека §3.7). Тап вне матча меняет счётчик блоба из `GET` на ±1 (никогда карьеру); «−» выключен, когда счётчик блоба 0. Тап матча — запись; «−» выключен, когда сумма записей этого матча по счётчику 0. «Правка вне матча» — запись без пары; «−» выключен, когда блоб + ждущие правки вне матча = 0. Ровно правила сервера (`EVENT_BELOW_ZERO`).
10. **Вне матча каждый тап — один `PATCH`** всей команды, путём автосохранения 2.x: `createRosterStore` (свой экземпляр экрана, `save.mjs`), тело — `name`, `baseTeamSlug`, `logoData` как прочитаны, `rosterForStorage(draft)`, `revision`. Ответ кладётся в список тренера (`addMyTeam`) — обзор и шапка видят новую ревизию и счётчики.
    - 409 `TEAM_SAVED_ELSEWHERE` с нашими же счётчиками в `team` ответа — сохранение, чей ответ пропал: принимается как сохранённое.
    - Иначе красная Callout «Состав изменили на другом устройстве» и «Загрузить новую» (новая версия и записи читаются заново; неотправленная правка пропадает, спецификация §8: «правку нужно повторить»). Кнопки «Что изменилось» нет (вопрос владельцу 4).
    - Нет сети или таймаут — жёлтая Callout «Нет сети», число ждущих правок, статус у заголовка; отправка повторяется по событию `online` и следующим тапом; закрытие вкладки спрашивает (`beforeunload`).
    - 422 — всплывающее сообщение с нарушениями (`validation.SPP_OUT_OF_RANGE {player, counter}`, `DUPLICATE_PLAYER_ID {names}`, `SPP_EDIT_TOO_LARGE`), команда читается заново.
11. **«Сумма SPP текущей правки»** (§6: «пока без действий» / «+N SPP») — разница SPP игрока с момента открытия экрана; во время матча — SPP записей этого матча («+4 SPP» / «+4 SPP в матче»).
12. **«Идёт подготовка»** — у команды есть игра с `preparationStatus` `preparing` или `ready`, не закрытая для игроков (`isGameClosedForPlayers`), и нет идущего матча. Жёлтая Callout «Идёт подготовка к туру N» (товарищеский — «к товарищескому матчу») и ссылка «К подготовке» (`preMatchUrl(game)`). Текст — по коду: подготовку сбрасывает **любое** сохранение состава, SPP тоже (`loadPreparationState` → `resetChangedRosters` по ревизии), а не только найм, продажа и пропуски, как в макете. Правки разрешены.
13. **«Идёт матч»** — `isMatchLive(game)` (`src/shell/current-match.mjs`, как сервер). Зелёная Callout «Идёт матч · тур N · записей: K» (K — строки записей этого матча у команды), текст, переключатель «Правка вне матча» (`renderToggle` в `actionHtml`; включён — Callout жёлтая), ссылка «Итоги матча» (`postMatchUrl(game)`). Тап — `POST …/events` с `pairingId`, «+K» верхним индексом в таблице и в счётчике. Закрыто: «+» MVP с причиной «MVP выбирают в итогах матча» (`onRefused` → сообщение); счётчики игрока с `skipNextGame` (его нет в снимке матча, сервер ответит `POST_PLAYER`) — «Не играет в этом матче»; «Профиль и прокачка», «Прокачать», карандаш — «Прокачка — после итогов матча». С включённой «Правкой вне матча» MVP и пропускающий разрешены: это правка состава, а не тап матча (вопрос владельцу 3). Найма, продажи и пропуска 07a не рисует вовсе (07b, 07c).
14. **«Травма в матче…»** — у каждого играющего в режиме матча (кнопка в раскрытой строке и в панели). Шторка: Badly Hurt, Seriously Hurt, Serious Injury, Lasting Injury (+ характеристика чипами MA ST AG PA AR), Dead с подписями; «Записать в матч» (+1 травмы) и, если запись стоит, «Убрать запись» (−1 той же травмы). Стоящая травма — последняя неотменённая (`statisticsFromEvents`), в строке игрока красная подпись «Стойкая травма (AG) · тур 7». Названия по-русски — как в `content/Gata-ru/General Information/Casualties.md` (Badly Hurt, Серьёзная травма, Тяжёлое повреждение, Стойкая травма, Смерть), а не английские из макета.
15. **Чип навыка** открывает шторку `roster-skill`: заголовок — навык как написан, строка — «категория · тип» (`categoryOf`, `tagsOf` из `screens/ref/skill.mjs`), тело — правило (`page.html` в `.g-prose`) и строка «<игрок> · <откуда>». Страница — `pageForName` (`screens/ref/catalog.mjs`). Нет страницы — «В справочнике нет страницы этого навыка». Знака категории в шапке шторки нет (у `renderSheet` нет слота перед заголовком; категория — в строке). Фокус после закрытия — на чип.
16. **Ссылки на навыки и правила 2.x сходятся с `pageForName`** (передача 11 → 07a): `pageForSkillTableEntry` и общая ветка `pageForRuleEntry` в `src/components/content-links.mjs` зовут `pageForName(state.data, name)`; Leagues и Special Rules — как были.

**Данные**

17. **Один снимок блоба и записей:** `GET /api/teams/:id` и `GET /api/teams/:id/events` (без `pairing`: все неучтённые, со своими `pairingId`), пока `revision` записей не равна ревизии команды; до трёх раз, затем «Состав не прочитался» с «Повторить». Записи матча — неучтённые с `pairingId` идущего матча; ждущие правки вне матча — с `pairingId: null`.
18. **Режим — по `state.games`.** Экран читает игры заново при входе (`loadGames(true)`) и когда вкладка снова видна (`visibilitychange`), слушает `onGamesChange`. Пока игры не прочитаны или не прочитались — счётчики закрыты с причиной («Загружаем матчи…» / текст ошибки): сервер принимает `PATCH` и во время матча, а такой `PATCH` сломал бы `finishPost` (`POST_TEAM_CHANGED`).
19. **Шапка экрана.** От 901px — полоса `renderPageHead`: «Состав» и «В составе: N · пропускают матч: M · могут прокачаться: K» (без форм множественного числа, как решение 25 этапа 05). На телефоне полоса только для диктора, видимый заголовок — «Активный состав» с числом и статусом сохранения справа (на десктопе — над таблицей, как в `DeskSaveConflict`). Поиск в полосе — этап 13.
20. **Правая панель (от 901px, 320px):** номер 60px, имя, «Позиция · стоимость» (`playerCurrentCost`, `formatMoney`), карандаш → `teamPlayerUrl`; StatStrip; блок счётчиков (в матче «Записи матча · тур N» и «+X SPP в матче», вне матча «SPP · ручная правка» — вопрос владельцу 2); SPP: доступно крупно, «заработано / потрачено», «Улучшения: L из 6» (`renderProgressDots`), «Прокачать» → `teamPlayerUrl`, «Самое дешёвое — C SPP» (случайный навык следующего ранга; на шестом — «Все улучшения взяты»); навыки карточками с источником и «Основные: … · Вторичные: …»; «Следующий матч: играет / пропускает»; в матче — «Травма в матче…». Нет «Пропуск матча…», «Продать» (07b, 07c) и «Карьеры» (07e).
21. **Раскрытая строка (до 900px):** «SPP N · ручная правка» (в матче — «SPP N · тур 7 · в карьере сразу») и сумма решения 11 справа; основные счётчики двумя колонками; ряд узких; «Профиль и прокачка ›»; в матче — «Травма в матче…». «Пропуск матча…» и «Продать» — 07b, 07c.
22. **Состав в таблице** — все игроки блоба (`selectedRosterPlayers`), пропускающие тоже, с красной подписью «Пропускает следующий матч»; секции «Пропускают матч» и «Погибшие» — 07b. Ключ строки в DOM — `<id>#<место>`: два игрока 2.x с общим id не ломают `patch()`; запись идёт по `id`, и сервер отказывает, называя обоих.
23. **Редактор 2.x не меняется** (договор с 08). Его `PATCH` с изменённым MVP после `016` тоже пишет строку истории: сервер считает разницу сам (`sppEdits`).

**Сервер и `016`**

24. **`016_match_event_mvps.sql`** — один `ALTER TABLE match_events DROP CONSTRAINT match_events_counter_check, ADD CONSTRAINT match_events_counter_check CHECK (counter IN (… 'bonus','mvps','injury'))`. В Postgres `CHECK` иначе не расширить; ни одна строка не читается и не меняется, все строки `014` проходят новый `CHECK`. Имя ограничения — то, что Postgres дал встроенному `CHECK` `014` (тест Task 1 его проверяет до миграции).
25. **MVP в записях — только правка вне матча:**
    - `PATCH` пишет его учтённой строкой (`sppEdits`), как остальные;
    - `POST …/events` без `pairingId` во время матча — ждущей, `finishPost` переносит её в блоб;
    - тап матча с `counter: "mvps"` — 400 `FIELD_INVALID {field: "counter"}` (MVP выбирают в итогах, §3.7).
    Итоги не читают и не пишут строк MVP: `statisticsFromEvents` и `eventsDiff` считают только счётчики матча (`MATCH_COUNTERS`). MVP завершённого матча — по-прежнему из `match_post_applications`. `outside` истории получает ключ `mvps`; карьера по матчам на экране — 07e.

## Вопросы владельцу

План не ждёт ответа: исполняется вариант по умолчанию, ответ «нет» снимает отмеченный шаг.

1. **Профиль игрока до этапа 07d.**
   - **По умолчанию** — `#/t/:id/roster/:playerId` до 07d рисует редактор 2.x, и «Профиль и прокачка» / «Прокачать» ведут туда (решение 1): найм, продажа, пропуски, гибель и прокачка доступны между PR.
   - **Альтернатива** — этот адрес уже сейчас открывает 3.0-состав с выбранным игроком, а редактор 2.x остаётся только админу; найм, продажа и прокачка у тренера пропадают до 07b–07d (в `redesign`, не на проде). Task 9, шаг 3 — одна строка роутера.
2. **Счётчики SPP на десктопе вне матча.** `DeskRoster` рисует в таблице только числа карьеры, без −/+.
   - **По умолчанию** — в правой панели тот же блок из девяти плиток «SPP · ручная правка», что в матче «Записи матча» (Task 10).
   - **Альтернатива** — вне матча счётчики только на телефоне, на десктопе — в правке игрока 07d.
3. **MVP во время матча через «Правку вне матча».**
   - **По умолчанию** — разрешён: это правка карьеры, а не тап матча (сервер с `016` принимает MVP без пары); тап матча на MVP закрыт (решение 13).
   - **Альтернатива** — MVP закрыт весь матч, с переключателем тоже (Task 11, одно условие).
4. **«Что изменилось» в плашке конфликта** (`SaveConflict`).
   - **По умолчанию** — не рисуется: спецификация §8 называет только «Загрузить новую».
   - **Альтернатива** — список отличий своей версии от серверной (этап 07e или 13).
5. **Journeymen и звёзды в составе во время матча.**
   - **По умолчанию** — не показываются: их статистику вводят на шаге «Игроки» итогов, а в блобе их нет.
   - **Альтернатива** — 09a читает снимок стороны и добавляет их строки с тапами матча.

## Файлы

| Файл | Задача | Что |
|---|---|---|
| `server/db/migrations/016_match_event_mvps.sql`, `test/migration-016-match-event-mvps.test.mjs` | 1 | миграция, рецепты Т и Р |
| `src/domain/post-match/events.mjs`, `history.mjs`, `server/routes/team-events.mjs`, `scripts/smoke-post-match.mjs`, тесты записей, истории и правок вне матча | 2 | MVP — счётчик правки |
| `test/helpers/fake-dom.mjs`, `test/fake-dom.test.mjs` | 3 | строгий разбор: `<p><div>`, `<table><tr>` |
| `src/ui/number-badge.*`, `src/ui/stat-strip.*`, `src/ui/action-stepper.*`, `src/ui/status-chip.*`, `src/ui/icons.mjs`, `src/domain/roster/players.mjs`, `src/screens/teams/builder-view.mjs`, тесты `ui-player`, `ui-steppers`, `ui-match`, `roster-domain` | 4 | NumberBadge, текст изменённой характеристики, компактный счётчик |
| `src/ui/roster-table.*`, `test/ui-roster-table.test.mjs` | 5 | RosterTable |
| `src/screens/team/roster/model.mjs`, `test/team-roster-model.test.mjs` | 6 | модель строк, сортировка, режим |
| `src/screens/team/roster/data.mjs`, `save.mjs`, `src/data/teams.mjs`, `test/team-roster-data.test.mjs` | 7 | чтение снимка, `PATCH` вне матча |
| `src/screens/team/roster/taps.mjs`, `test/team-roster-taps.test.mjs` | 8 | записи матча и правки вне матча: очередь, отказы |
| `src/screens/team/roster/{index,wire,view,panel,sheets,memory}.mjs`, `roster.css`, `src/core/router.mjs`, `scripts/browser-check-roster.mjs`, `test/team-roster.test.mjs`, `test/app-boot-roster.test.mjs` | 9–12 | экран |
| `src/components/content-links.mjs`, `test/content-links.test.mjs` | 13 | ссылки 2.x через `pageForName` |
| `scripts/mock-api.mjs`, `scripts/mock/roster.mjs` | 14 | mock для снимков |
| `src/screens/team/roster/view.mjs`, `roster.css` | 15 | полоса казны 08 (поздняя) |
| `docs/redesign/screens/rd-07a.json` | 16 | снимки (контроллер) |
| спеки, мастер-план | 17 | проверки, рецепт М, правки спек (контроллер) |
| — | 18 | PR (контроллер) |

`*` = `.mjs` и `.css` с тем же именем. Новые `.css` подключаются в конце `src/styles.css` строками `@import url("ui/number-badge.css");`, `@import url("ui/roster-table.css");`, `@import url("screens/team/roster/roster.css");`.

## Маршруты этапа 07a

| Имя | Адрес | До 07a | После 07a |
|---|---|---|---|
| `teamRoster` | `#/t/:teamId/roster` | `renderSavedRoster` 2.x | `renderTeamRoster(teamId)` (Task 9) |
| `teamPlayer` | `#/t/:teamId/roster/:playerId` | `renderSavedRoster` 2.x | без изменений до 07d (решение 1) |
| `teamManage` | `#/t/:teamId/team` | 2.x | этап 08 |
| `adminTeamEdit` | `#/administration/users/:uid/teams/:tid/edit` | 2.x | без изменений (этап 12) |

`src/core/routes.mjs` не меняется: `#/my-teams/:id` → `#/t/:id/roster` уже ведёт на новый состав.

## Рецепты проверки

Задачи ссылаются на них по букве. Команды — из `/Users/felstell/git/bb-rd-07a`; каждый вызов Bash — новая оболочка, переменные берутся из `output/07a/env.sh`.

**Т — тесты на настоящем Postgres:** `. output/07a/env.sh && node --test <файлы>` или `. output/07a/env.sh && npm test`.

**Р — репетиция на засеянном дампе схемы 008** (дамп собирает Task 1, шаг 1):

```bash
npm run rehearsal:restore -- output/07a/seed-008.dump
npm run rehearsal:check -- --before
npm run rehearsal:migrate
npm run rehearsal:check -- --after; echo "exit $?"
sed -n '1,70p' output/rehearsal/report.md
```

Expected: `rehearsal:check: OK — no existing data changed (output/rehearsal/report.md)`, `exit 0`; в отчёте — блок, который план 02b приводит в рецепте Р (`new table match_events: 0 rows`, стадии шести засеянных команд, `- Seed Finished Home: 1`, два открытых состояния `…042 (league)`, `…043 (friendly)`), и строка `Migrations: 8 applied …` с `016_match_event_mvps.sql` последней. База `gata_rehearsal` пересоздаётся; этап 08 миграций не репетирует.

**М — dev-база** (только Task 17): `npm run db:migrate && npm run db:migrate -- --check` → `applied 016_match_event_mvps.sql`, затем `database is up to date`. Лишняя применённая миграция не мешает другим worktree: `assertMigrationsApplied` смотрит только файлы на диске.

**С — сервер 3071 и smoke** (Task 2, 16, 17):

```bash
. output/07a/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_07a 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/07a/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3071 node server/server.mjs`; дождаться `curl -fsS http://localhost:3071/api/health` (Monitor с until-циклом). Затем:

```bash
APP_URL=http://localhost:3071 npm run smoke
. output/07a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3071 npm run smoke:post-match
```

Expected: каждый скрипт печатает свою строку `… passed …`. После правок сервера — перезапуск. Если `016` правился после применения к `gata_smoke_07a`: `dropdb gata_smoke_07a` и рецепт заново.

---

### Task 1: `016_match_event_mvps.sql` — MVP в счётчиках записей (рецепты Т и Р)

Решение владельца на M1 (`docs/redesign/reports/M1.md`, «Нужно от вас»): MVP, исправленный в редакторе состава, должен попадать в историю игрока. Эта задача — только схема; домен и сервер — Task 2.

**Files:**
- Create: `server/db/migrations/016_match_event_mvps.sql`, `test/migration-016-match-event-mvps.test.mjs`
- Local, не коммитится: `output/07a/env.sh` (+ `SEED_URL`), `output/07a/seed.sql`, `output/07a/seed-008.dump`

**Interfaces:**
- Consumes: `withScratchDatabase(run, {through})`, `runMigration(client, name)`, `scratchSkip`, `migrateThrough(client, last)` (`test/helpers/scratch-db.mjs`).
- Produces: ограничение `match_events_counter_check` = `CHECK (counter IN ('touchdowns','casualties','knockouts','completions','catches','interceptions','throws','landings','bonus','mvps','injury'))` — порядок `EVENT_COUNTERS` Task 2. Остальное в `match_events` (колонки, `match_events_delta_check`, индексы, FK) не меняется.

- [ ] **Step 1: Засеянный дамп схемы 008** (как план 02b, Task 0, Steps 3–4, с именами 07a)

```bash
. output/07a/env.sh
grep -q '^export SEED_URL=' output/07a/env.sh || echo "export SEED_URL='${SMOKE_URL%/gata_smoke_07a}/gata_seed_07a'" >> output/07a/env.sh
. output/07a/env.sh && echo "$SEED_URL" | sed -E 's#//[^@]*@#//***@#'
# the SQL of plan 02b, Task 0, Step 3, word for word: three users, six teams, a finished friendly with a death,
# a live league match, a friendly whose post-match stopped at the Players step
awk '/Step 3: `output\/02b\/seed.sql`/ {on = 1} on && /^```sql$/ {copy = 1; next} copy && /^```$/ {exit} copy' \
  docs/superpowers/plans/2026-10-16-rd-02b-match-events.md > output/07a/seed.sql
head -1 output/07a/seed.sql; tail -1 output/07a/seed.sql          # BEGIN;  COMMIT;
docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_seed_07a
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_seed_07a
. output/07a/env.sh && node --input-type=module -e '
import pg from "pg";
import { migrateThrough } from "./test/helpers/scratch-db.mjs";
const client = new pg.Client({ connectionString: process.env.SEED_URL });
await client.connect();
await migrateThrough(client, "008_withdraw_season_entries.sql");
await client.end();'
docker exec -i gata-league-postgres psql -v ON_ERROR_STOP=1 -U gata_admin -d gata_seed_07a < output/07a/seed.sql
docker exec gata-league-postgres pg_dump -Fc -U gata_admin gata_seed_07a > output/07a/seed-008.dump
docker exec gata-league-postgres psql -U gata_admin -d gata_seed_07a -Atc "SELECT max(name) FROM schema_migrations"
```

Expected: `postgres://***@localhost:5437/gata_seed_07a`; `BEGIN;` и `COMMIT;`; непустой `output/07a/seed-008.dump`; последняя строка — `008_withdraw_season_entries.sql`. Затем **рецепт Р до `016`** (базовая линия): как в рецепте, но `Migrations: 7 applied …`, последней — `015_backfill_fallen_players.sql`. Отличие в чём-то ещё — стоп: инструменты репетиции разошлись с планом 02b.

- [ ] **Step 2: Падающие тесты** — `test/migration-016-match-event-mvps.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = id(1), U2 = id(2), H = id(11), A = id(12), GAME = id(41);
const BEFORE_016 = ["touchdowns", "casualties", "knockouts", "completions", "catches", "interceptions", "throws", "landings", "bonus"];

async function friendly(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'h', 'h', '@h', 'x'), ($2, 'a', 'a', '@a', 'x')", [U1, U2]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'Home', 'teams/human'), ($2, $4, 'Away', 'teams/human')", [H, A, U1, U2]);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, result_status) VALUES ($1, 'friendly', 1, $2, $3, $4, $5, 'pending')`, [GAME, U1, U2, H, A]);
}

const insert = (client, [team, pairing, player, counter, delta, injury = null]) => client.query(
  "INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, created_at) VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())",
  [team, pairing, player, counter, delta, injury]);
const rows = async (client) => (await client.query(
  "SELECT id, saved_team_id, pairing_id, player_id, counter, delta, injury, settled_at, created_at FROM match_events ORDER BY created_at, id")).rows;
const counterCheck = async (client) => (await client.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid = 'match_events'::regclass AND conname = 'match_events_counter_check'`)).rows.map((row) => row.definition);

test("016 widens the counter's CHECK by the MVP and leaves every row 014 took as it was", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await friendly(client);
    for (const counter of BEFORE_016) await insert(client, [H, GAME, "p1", counter, 1]);
    await insert(client, [H, null, "p1", "touchdowns", -1]);
    await insert(client, [H, GAME, "p1", "injury", 1, { code: "lasting", stat: "ag" }]);
    assert.equal((await counterCheck(client)).length, 1, "014's inline CHECK carries the name 016 drops");
    const before = await rows(client);
    await runMigration(client, "016_match_event_mvps.sql");
    assert.deepEqual(await rows(client), before);
    const [definition] = await counterCheck(client);
    assert.deepEqual(definition.match(/'([a-z]+)'/g).map((quoted) => quoted.slice(1, -1)), [...BEFORE_016, "mvps", "injury"]);
  }, { through: "015_backfill_fallen_players.sql" });
});

test("after 016 an MVP is a row, and the table still refuses what 014 refused", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await friendly(client);
    await insert(client, [H, null, "a", "mvps", 1]);
    await insert(client, [H, GAME, "a", "mvps", -1]); // the table takes it: refusing a match's MVP is the endpoint's (Task 2)
    for (const [counter, delta] of [["stray", 1], ["mvps", 2], ["mvps", 0], ["crowdCasualties", 1]]) {
      await assert.rejects(insert(client, [H, null, "a", counter, delta]), { code: "23514" }, `${counter} ${delta}`);
    }
  }, { through: "016_match_event_mvps.sql" });
});

test("016 alters the table and touches no row: nothing is read, written or deleted", () => {
  const sql = readFileSync(new URL("../server/db/migrations/016_match_event_mvps.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|SELECT|TRUNCATE|DROP\s+TABLE)\b/i);
  assert.match(sql, /ALTER TABLE match_events\s+DROP CONSTRAINT match_events_counter_check,\s+ADD CONSTRAINT match_events_counter_check CHECK \(counter IN \(/);
});
```

- [ ] **Step 3: Убедиться, что падает** — Run: `. output/07a/env.sh && node --test test/migration-016-match-event-mvps.test.mjs` → FAIL (`no migration 016_match_event_mvps.sql`, нет файла).

- [ ] **Step 4: `server/db/migrations/016_match_event_mvps.sql`.** Шапка-комментарий в стиле `014`/`015`:
  - почему: решение владельца на M1 — MVP, правленный руками, менял блоб без строки, и история игрока не складывалась в карьеру; с `mvps` сохранение состава пишет его учтённой строкой, как остальные счётчики (`sppEdits`), а правка вне матча во время матча ждёт финиша;
  - чего нет: матч MVP не тапает, его выбирают в итогах; тап с парой отклоняет эндпоинт (`server/routes/team-events.mjs`), итоги строк MVP не читают и не пишут;
  - что делает: заменяет встроенный `CHECK` `014` (Postgres назвал его `match_events_counter_check`) тем же списком плюс `'mvps'` в порядке `EVENT_COUNTERS`; расширить `CHECK` можно только снятием и добавлением, оба — в одной транзакции раннера; ни одна строка не читается и не меняется, каждая строка `014` проходит новый `CHECK`; задним числом ничего не заполняется.

  Тело — ровно:

```sql
ALTER TABLE match_events
  DROP CONSTRAINT match_events_counter_check,
  ADD CONSTRAINT match_events_counter_check CHECK (counter IN ('touchdowns','casualties','knockouts','completions','catches',
        'interceptions','throws','landings','bonus','mvps','injury'));
```

- [ ] **Step 5: Рецепт Т** — Run: `. output/07a/env.sh && node --test test/migration-016-match-event-mvps.test.mjs` → PASS (3 tests). Run: `npm run build && . output/07a/env.sh && npm test 2>&1 | tail -6` → `# fail 0`, `# skipped 0`. Правки SQL — только до рецепта М (Task 17).

- [ ] **Step 6: Рецепт Р** — Expected: как в рецепте целиком: `OK`, `exit 0`, `Migrations: 8 applied …` с `016_match_event_mvps.sql` последней, `new table match_events: 0 rows`, стадии, погибший и открытые состояния — как в базовой линии шага 1. Любое другое отличие — вернуться к шагу 4. Сводку (строки `Migrations:` и `rehearsal:check`) сохранить в `output/07a/rehearsal-016.txt` для PR.

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/016_match_event_mvps.sql test/migration-016-match-event-mvps.test.mjs
git commit -m "feat(db): 016 — the MVP is a counter of the match events, for edits outside a match" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: MVP — счётчик правки, не матча: домен, эндпоинт, история, smoke

**Files:**
- Modify: `src/domain/post-match/events.mjs`, `src/domain/post-match/history.mjs`, `server/routes/team-events.mjs`, `scripts/smoke-post-match.mjs`
- Test: `test/match-events.test.mjs`, `test/outside-edits.test.mjs`, `test/match-events-api.test.mjs`, `test/player-history.test.mjs`, `test/player-history-api.test.mjs`

**Interfaces:**
- Consumes: `016` (Task 1); `sppCounterDefinitions` (`src/domain/league-rules.mjs`), `POST_STATS`.
- Produces (`src/domain/post-match/events.mjs`):
  - `EVENT_COUNTERS` = `['touchdowns','casualties','knockouts','completions','catches','interceptions','throws','landings','bonus','mvps','injury']` — порядок `CHECK` `016`;
  - `SPP_EVENT_COUNTERS` (новый экспорт) = `EVENT_COUNTERS` без `injury` — что шагает правка вне матча: `sppEdits`, `applyOutsideEdits`, `careerCounters`, `outside` истории;
  - `MATCH_COUNTERS` (новый экспорт) = `SPP_EVENT_COUNTERS` без `mvps` — что тапает матч и читают итоги: `statisticsFromEvents`, `eventsDiff`;
  - сигнатуры функций не меняются; внутренний `sumCounters(events, counters)` получает список счётчиков вторым аргументом.
- Produces (`server/routes/team-events.mjs`, `checkTap`): с `pairingId` счётчик — один из `MATCH_COUNTERS` или `injury`; без `pairingId` — один из `SPP_EVENT_COUNTERS`; иначе 400 `FIELD_INVALID {field: "counter"}`.
- Produces (история): `outside` — ключ на каждый из `SPP_EVENT_COUNTERS`, `mvps` тоже.

- [ ] **Step 1: Падающие тесты**

`test/match-events.test.mjs` — первый тест заменить, тест про `sppEdits` переписать, добавить два; в «for any events and any saved numbers…» `EVENT_COUNTERS.slice(0, 9)` → `MATCH_COUNTERS` (случайные тапы по-прежнему берут любой счётчик, в том числе `mvps`: так тест проверяет, что итоги его не читают). Импорт — `+ MATCH_COUNTERS, SPP_EVENT_COUNTERS`.

```js
test("the counters are the ones 016 allows: the roster's SPP counters, MVP included, plus injury; a match taps all of them but the MVP", () => {
  const sql = readFileSync(new URL("../server/db/migrations/016_match_event_mvps.sql", import.meta.url), "utf8");
  const allowed = sql.match(/CHECK \(counter IN \(([^)]*)\)\)/)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed, [...EVENT_COUNTERS]);
  assert.deepEqual([...SPP_EVENT_COUNTERS], sppCounterDefinitions.map(([key]) => key));
  assert.deepEqual([...MATCH_COUNTERS], SPP_EVENT_COUNTERS.filter((counter) => counter !== "mvps"));
  assert.ok(MATCH_COUNTERS.every((counter) => POST_STATS.includes(counter)));
});

test("an edit to the roster's SPP is the steps between the two counters, the MVP among them, without players who came or went", () => {
  const before = { players: [{ id: "a", spp: { touchdowns: 1, mvps: 0 } }, { id: "gone", spp: { touchdowns: 5 } }, { rowIndex: 0, spp: {} }] };
  const after = { players: [{ id: "new", spp: { touchdowns: 3 } }, { id: "a", spp: { touchdowns: 3, casualties: 0, completions: 0, mvps: 2 } }] };
  const step = (counter, delta) => ({ playerId: "a", counter, delta, injury: null });
  assert.deepEqual(sppEdits(before, after), [step("touchdowns", 1), step("touchdowns", 1), step("mvps", 1), step("mvps", 1)]);
  assert.deepEqual(sppEdits(after, before), [step("touchdowns", -1), step("touchdowns", -1), step("mvps", -1), step("mvps", -1)]);
  assert.deepEqual(sppEdits(after, after), []);
});

test("an MVP row is no match statistic: the post-match reads none and writes none back", () => {
  const events = [tap("p1", "mvps"), tap("p1", "mvps"), tap("p1", "touchdowns")];
  assert.deepEqual(statisticsFromEvents(snapshot, events).statistics.p1, stats({ touchdowns: 1 }));
  assert.deepEqual(eventsDiff({ statistics: { p1: stats({ touchdowns: 1 }) }, injuries: {} }, events), []);
});

test("an MVP edited outside a match is in the career at once and in the blob at the finish", () => {
  const player = { id: "a", spp: { mvps: 1 } };
  assert.equal(careerCounters(player, [tap("a", "mvps")]).mvps, 2);
  assert.equal(careerCounters(player, [{ ...tap("a", "mvps"), settledAt: "2026-10-19T10:00:00Z" }]).mvps, 1, "a settled row is in the blob already");
  assert.equal(applyOutsideEdits({ players: [player] }, [tap("a", "mvps"), tap("a", "mvps")]).players[0].spp.mvps, 3);
  assert.equal(eventTotal([tap("a", "mvps"), tap("a", "mvps", -1), tap("a", "mvps")], "a", "mvps"), 1);
});
```

`test/outside-edits.test.mjs`:
- первый тест: заголовок «… writes the change as settled edits outside a match, the MVP among them; a refused save and no change write none»; в ожидаемых строках после `casualties` — `{ player_id: "a", counter: "mvps", delta: 1, settled: true }`;
- новый тест по образцу «the finish carries an edit made outside the match…»:

```js
test("during a live match an MVP edited outside it waits and the finish carries it in; a tap of the match on the MVP is refused", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  assert.equal((await edit(token, "home-2", "mvps")).status, 201);
  const tapped = await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { pairingId: G, playerId: "home-2", counter: "mvps", delta: 1 } });
  assert.deepEqual([tapped.status, tapped.body.error.params.field], [400, "counter"]);
  const ready = await toReady(await toPlayersStep(), homeScores);
  assert.equal((await act("home", ready, null, true)).status, "completed");
  const { rows: [applied] } = await client.query("SELECT after_roster FROM match_post_applications WHERE pairing_id = $1 AND side = 'home'", [G]);
  const picked = applied.after_roster.players.find((item) => item.id === "home-2").spp?.mvps ?? 0; // what the post-match itself gave him
  assert.equal((await teamRow(client, teams.home)).roster.players.find((item) => item.id === "home-2").spp.mvps, picked + 1);
  assert.deepEqual(await outside(client, teams.home), [{ player_id: "home-2", counter: "mvps", delta: 1, settled: true }]);
}));
```

`test/match-events-api.test.mjs`: в тесте «a tap is refused outside the live match…» случай `{ counter: "mvps" }` → `"counter"` уже есть — оставить и добавить к нему комментарий `// the MVP is picked in the post-match: no tap of a match carries it (016 lets an edit outside a match carry it)`.

`test/player-history.test.mjs`:
- в «outside is the raw sum…» оба ожидаемых объекта получают `mvps: 0`;
- новый тест:

```js
test("an MVP edited by hand is a row outside the matches, so the rows add up to the career, MVP included", () => {
  const blob = { id: "p", spp: { touchdowns: 2, mvps: 2 } }; // the match gave two TD and an MVP; the coach added an MVP by hand
  const outside = [tap("p", "mvps", 1, "2026-10-19T10:00:00Z")];
  const history = playerHistory("p", [match({ application: { before: { players: [{ id: "p", spp: {} }] }, after: { players: [{ id: "p", spp: { touchdowns: 2, mvps: 1 } }] } } })], outside);
  assert.equal(history.outside.mvps, 1);
  const total = (key) => history.matches.reduce((sum, row) => sum + (row.counters?.[key] ?? 0), history.outside[key]);
  assert.deepEqual([total("touchdowns"), total("mvps")], [blob.spp.touchdowns, blob.spp.mvps]);
});
```

`test/player-history-api.test.mjs`: `COUNTERS` (строка 17) + `"mvps"`.

- [ ] **Step 2: Убедиться, что падают** — Run: `npm run build && . output/07a/env.sh && node --test test/match-events.test.mjs test/outside-edits.test.mjs test/match-events-api.test.mjs test/player-history.test.mjs test/player-history-api.test.mjs` → FAIL: нет экспортов, `sppEdits` без MVP, `outside` без `mvps`.

- [ ] **Step 3: Реализовать** по Interfaces.
  - Шапка `events.mjs`: «A counter is one of the roster's SPP counters, plus the injury. A match taps all of them but the MVP (`MATCH_COUNTERS`), which is picked in the post-match; an edit outside a match steps any of them, the MVP included (016, the owner's decision at M1), so a hand-edited MVP has its row in the history.» Комментарий `// The order of the CHECK on counter in 014.` → `in 016`.
  - Шапка `history.mjs`: из исключений «блоб меняется без строки» убрать «an MVP edited by hand (the rows have no MVP counter)»; `COUNTED` → `SPP_EVENT_COUNTERS`; описание `outside` — «with a key for each counter of an edit (the MVP too, not the injury)».
  - `team-events.mjs`: правило `checkTap` по Interfaces; шапка — абзац «The MVP is no tap of a match …; outside a match it is an edit like the rest (016)».
  - `scripts/smoke-post-match.mjs`:
    - в `tapAndEdit` после правки `completions` — правка `{ playerId: f.outsidePlayer, counter: 'mvps', delta: 1 }` → 201, `f.outsideMvpBefore = player.spp?.mvps ?? 0`; ожидание ждущих записей `2` → `3`;
    - в `afterFinish` — `assert.equal(edited.spp.mvps, f.outsideMvpBefore + 1, 'the finish carried the MVP edit into the blob')` (MVP итогов дома — journeyman, `stats()`) и `assert.equal((await historyOf(f, f.outsidePlayer)).outside.mvps, 1)`;
    - в итоговую строку — «an MVP edited outside a match».

- [ ] **Step 4: Тесты** — Run: `npm run build && . output/07a/env.sh && npm test 2>&1 | tail -6` → `# fail 0`, `# skipped 0`; `npm run check` → PASS. Затем **рецепт С**: `smoke` и `smoke:post-match` на 3071 → `… passed …`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/post-match/events.mjs src/domain/post-match/history.mjs server/routes/team-events.mjs scripts/smoke-post-match.mjs test/match-events.test.mjs test/outside-edits.test.mjs test/match-events-api.test.mjs test/player-history.test.mjs test/player-history-api.test.mjs
git commit -m "feat(events): the MVP is an edit's counter, never a match's — a hand-edited MVP has its row in the history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: fake-dom — `<p><div>` и `<table><tr>` без `<tbody>` становятся ошибкой разбора

Мастер-план, «Дополнения → 07a–07e»: до первого компонента с `<table>` в `src/ui`. Браузер закрывает `<p>` перед блочным элементом и вставляет `<tbody>` перед строкой прямо в таблице; fake-dom сейчас строит дерево «как написано», и тест прошёл бы против дерева, которого в браузере нет.

**Files:**
- Modify: `test/helpers/fake-dom.mjs` (`parseHtml`, `parseOpeningTag`, `setInnerHtml`, шапка)
- Test: `test/fake-dom.test.mjs`
- Возможно: модуль `src/**` 3.0, чья разметка окажется неверной (исправить в том же коммите). Модули из списка 08 (Global Constraints) не правятся: такая находка — стоп-условие.

**Interfaces:**
- `parseHtml(document, markup, { context = null } = {})`: `context` — имя тега элемента, в который ставится разметка (`"TBODY"`, `"TR"`, `"TEMPLATE"`…), `null` — обычный элемент страницы. `setInnerHtml` передаёт `element.tagName`.
- Правило 1 (`<p>`): открывающий тег из списка, который закрывает `<p>` в браузере (`address article aside blockquote dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main menu nav ol p pre section summary table ul`), при открытом `<p>`, если между ним и вершиной стека нет `button`, `table`, `td`, `th`, `caption`, — ошибка `` `<${name}> inside a <p>: a browser closes the <p> before it` ``.
- Правило 2 (таблица): `<tr>` — только в `thead`/`tbody`/`tfoot` (иначе `` `<tr> straight in a <${parent}>: a browser puts a <tbody> around it; write the <tbody>` `` для `table`, и «outside a table section» для прочих); `<td>`/`<th>` — только в `tr`; `thead`/`tbody`/`tfoot`/`caption`/`colgroup` — только в `table`. Родитель на корне разбора — `context`; при `context` `TEMPLATE` корень принимает любую часть таблицы.

- [ ] **Step 1: Падающие тесты** — `test/fake-dom.test.mjs`:

```js
test("a block inside a paragraph is a parse error: a browser closes the <p> before it (07a)", () => {
  assert.throws(() => parseHtml(document, "<p>a<div>b</div></p>"), /<div> inside a <p>/);
  assert.throws(() => parseHtml(document, "<p><span><ul><li>x</li></ul></span></p>"), /<ul> inside a <p>/);
  assert.throws(() => parseHtml(document, "<p>a<p>b</p></p>"), /<p> inside a <p>/);
  assert.doesNotThrow(() => parseHtml(document, '<p><span>a</span><button type="button"><span>b</span></button></p><div>c</div>'));
});

test("a row straight in a table, a cell outside a row, a section outside a table are parse errors (07a)", () => {
  assert.throws(() => parseHtml(document, "<table><tr><td>x</td></tr></table>"), /<tbody>/);
  assert.throws(() => parseHtml(document, "<table><tbody><td>x</td></tbody></table>"), /<td>/);
  assert.throws(() => parseHtml(document, "<div><tr><td>x</td></tr></div>"), /<tr>/);
  assert.throws(() => parseHtml(document, "<div><tbody></tbody></div>"), /<tbody>/);
  assert.doesNotThrow(() => parseHtml(document,
    "<table><caption>c</caption><thead><tr><th>a</th></tr></thead><tbody><tr><th>n</th><td>x</td></tr></tbody><tfoot><tr><td>y</td></tr></tfoot></table>"));
});

test("markup set into a table part or a template may start inside the table", () => {
  const body = document.createElement("tbody");
  body.innerHTML = "<tr><td>x</td></tr>";
  assert.equal(body.querySelector("td").textContent, "x");
  const template = document.createElement("template");
  template.innerHTML = "<tr><td>y</td></tr>";
  assert.equal(template.content.querySelector("td").textContent, "y");
  assert.throws(() => { document.createElement("tr").innerHTML = "<tr><td>z</td></tr>"; }, /<tr>/);
});
```

- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/fake-dom.test.mjs` → FAIL (разбор принимает всё).
- [ ] **Step 3: Реализовать** по Interfaces; шапку `fake-dom.mjs` дополнить: «A block that a browser would put after a `<p>` it closes, and a table part a browser would wrap or drop, throw too (stage 07a, before the first `<table>` in src/ui).»
- [ ] **Step 4: Полный прогон** — Run: `npm run build && . output/07a/env.sh && npm test 2>&1 | tail -6`. Каждое новое падение — разметка, которую браузер строит иначе: исправить в её модуле (минимально, с комментарием) или, если модуль в списке 08, — стоп. Expected в итоге: `# fail 0`; `npm run check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add test/helpers/fake-dom.mjs test/fake-dom.test.mjs
git commit -m "test(fake-dom): a block in a <p> and a table row with no section are parse errors, as a browser builds another tree" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(плюс исправленные модули, если шаг 4 их нашёл — в `git add` и в тело коммита.)

---

### Task 4: `src/ui` — NumberBadge, изменённая характеристика словами, компактный и закрытый счётчик

**Files:**
- Create: `src/ui/number-badge.mjs`, `src/ui/number-badge.css`
- Modify: `src/ui/stat-strip.mjs`, `stat-strip.css`; `src/ui/action-stepper.mjs`, `action-stepper.css`; `src/ui/status-chip.mjs`, `status-chip.css`; `src/ui/icons.mjs`; `src/domain/roster/players.mjs` (+ `positionKind`); `src/screens/teams/builder-view.mjs` (локальные `POSITION_KINDS`/`positionKind` → импорт); `src/styles.css` (`@import url("ui/number-badge.css");` в конце); оба словаря
- Test: `test/ui-player.test.mjs`, `test/ui-steppers.test.mjs`, `test/ui-match.test.mjs` (StatusChip), `test/roster-domain.test.mjs`

**Interfaces:**
- `positionKind(row) → "big"|"thrower"|"catcher"|"blitzer"|"lineman"` (`src/domain/roster/players.mjs`): по тегам строки расы (`Big Guy`, `Thrower`, `Catcher`, `Blitzer`, в этом порядке), иначе `lineman`. Тело — то, что сейчас в `builder-view.mjs:182-188`.
- `PLAYER_BADGE_KINDS` = `["blitzer","catcher","thrower","lineman","big"]`; `renderPlayerBadge({number, kind = "lineman", captain = false, large = false}) → string` (`src/ui/number-badge.mjs`):
  - `<span class="g-num g-num--<kind>[ g-num--lg]"><span class="g-num__n">${number}</span>[<span class="g-num__captain" aria-hidden="true">${t("ui.badge.captainMark")}</span><span class="g-sr-only">${t("ui.badge.captain")}</span>]</span>`;
  - неизвестный `kind` — `throw`.
- `renderStatStrip({values, improved = [], lowered = []})`: плитка `g-stat--up` / `g-stat--down`; в `dd` после значения `<span class="g-sr-only"> ${t("ui.stat.improved"|"ui.stat.lowered")}</span>`; характеристика в обоих списках — `throw` («both improved and lowered»).
- `renderActionStepper({…, compact = false, decDisabled = value <= 0, lockedReason = ""})`:
  - `compact` — класс `g-stepper--compact`: подпись сверху, под ней «− число +» (узкие плитки TTM/Приземление/Бонус и плитки десктопной панели);
  - `decDisabled` — простой отказ «−» (по умолчанию как было: на нуле);
  - `lockedReason` — оба «−» и «+» `aria-disabled` с этой причиной в `title` (`renderStepButton({blockedReason})`), `incBlockedReason` при этом не нужен;
  - `delta > 0` — `${value}<span class="g-sr-only">, ${t("ui.stepper.thisMatch")} </span><span class="g-stepper__delta">+${delta}</span>` (заметка этапа 04: «4+1» читалось слитно).
- `STATUS_TONES` += `"danger"` → класс `g-status--danger` (`color: var(--danger)`, точка тем же цветом).
- `icon("pencil")` — `<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>`; `icon("offline")` — `<path d="M3 3l18 18"/><path d="M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.6-2.6M14.4 10.3A10 10 0 0 1 19 12.9M2 9.4a15 15 0 0 1 4.2-2.6M12 19.5h.01"/>`.

Словари:

| ключ | en | ru |
|---|---|---|
| `ui.badge.captain` | Captain | Капитан |
| `ui.badge.captainMark` | C | C |
| `ui.stat.improved` | improved | улучшена |
| `ui.stat.lowered` | lowered | снижена |
| `ui.stepper.thisMatch` | this match | в этом матче |

- [ ] **Step 1: Падающие тесты**

`test/roster-domain.test.mjs`:
- «a position's kind is read from its tags: a big guy, a thrower, a catcher, a blitzer, else a lineman's»: `positionKind({tags: ["Ogre", "Big Guy"]})` → `"big"`; `["Human", "Thrower"]` → `"thrower"`; `["Human", "Blocker"]` → `"lineman"`; `{}` → `"lineman"`.

`test/ui-player.test.mjs`:

```js
test("a player's badge is his number on his position's colour; the captain's has a «C» that says the word", () => {
  const fragment = mount(renderPlayerBadge({ number: "3", kind: "catcher", captain: true }));
  const badge = fragment.querySelector(".g-num.g-num--catcher");
  assert.equal(badge.querySelector(".g-num__n").textContent, "3");
  assert.equal(badge.querySelector(".g-num__captain").getAttribute("aria-hidden"), "true");
  assert.equal(badge.querySelector(".g-sr-only").textContent, "Captain");
  assert.ok(mount(renderPlayerBadge({ number: "12", kind: "big", large: true })).querySelector(".g-num.g-num--big.g-num--lg"));
  assert.equal(mount(renderPlayerBadge({ number: HOSTILE })).querySelector(".g-num__n").textContent, HOSTILE);
  assert.throws(() => renderPlayerBadge({ number: "1", kind: "ogre" }), /kind/);
  assertCspSafe(fragment);
  assertStyled(fragment, "number-badge.css");
  assert.ok(valuesOf("src/ui/number-badge.css", ".g-num--catcher", "background").includes("var(--pos-catcher)"));
  assert.ok(valuesOf("src/ui/number-badge.css", ".g-num__captain", "background").includes("var(--crest-gold)"));
});

test("a changed characteristic says so in words, not only in colour (WCAG 1.4.1, 07a)", () => {
  const values = { ma: "7", st: "3", ag: "2+", pa: "4+", ar: "8+" };
  const fragment = mount(renderStatStrip({ values, improved: ["ag"], lowered: ["ar"] }));
  const [ma, , ag, , ar] = fragment.querySelectorAll(".g-stat");
  assert.ok(ag.classList.contains("g-stat--up"));
  assert.equal(ag.querySelector("dd .g-sr-only").textContent.trim(), "improved");
  assert.ok(ar.classList.contains("g-stat--down"));
  assert.equal(ar.querySelector("dd .g-sr-only").textContent.trim(), "lowered");
  assert.equal(ma.querySelector(".g-sr-only"), null);
  assert.throws(() => renderStatStrip({ values, improved: ["ag"], lowered: ["ag"] }), /both/);
  assertStyled(fragment, "stat-strip.css");
});
```

`test/ui-steppers.test.mjs`:
- «a compact stepper puts its label over the − count + row (07a)»: `.g-stepper.g-stepper--compact`; `valuesOf("src/ui/action-stepper.css", ".g-stepper--compact", "flex-direction")` содержит `"column"`; кнопки по-прежнему `var(--size-touch)`.
- «a locked stepper refuses both ways and says why on each button»: `lockedReason: "Change them on the Players step"` → у обеих кнопок `aria-disabled="true"` и этот `title`; `wireActionSteppers(root, onStep, {onRefused})` — нажатие на «−» даёт `onRefused` с `delta: -1` и этой причиной, `onStep` не вызван.
- «the minus may stop above zero: the caller says where (07a)»: `value: 3, decDisabled: true` → «−» `disabled`; `value: 0` без `decDisabled` → `disabled`, как было.
- «a count with this match's addition reads "7, this match +1" (stage 04 note)»: `textContent` `.g-stepper__value`, с пробелами, схлопнутыми в один, — `"7, this match +1"`; в ru — `"7, в этом матче +1"`.

`test/ui-match.test.mjs` (StatusChip): «a fault is a red chip» — `renderStatusChip({label: "Not saved", tone: "danger"})` → `.g-status.g-status--danger`; `assertReadable("src/ui/status-chip.css", ".g-status--danger", "color", ["--surface", "--bg"], 4.5)`.

`test/ui-kit.test.mjs` проходит без правок (новые иконки перебираются `ICON_NAMES`).

- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/roster-domain.test.mjs test/ui-player.test.mjs test/ui-steppers.test.mjs test/ui-match.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. CSS:
  - `number-badge.css`: `.g-num` — `position: relative; display: inline-flex; flex: none; align-items: center; justify-content: center; width: var(--size-badge); height: var(--size-badge); border-radius: var(--radius-full); background: var(--pos-lineman); color: var(--on-accent); font: 700 17px/1 var(--font-display); letter-spacing: 0; text-transform: none`; `.g-num--<kind>` — `background: var(--pos-<kind>)`; `.g-num--lg` — 60px, 28px, `box-shadow: 0 0 0 2px var(--header-ink)`; `.g-num__captain` — `position: absolute; top: -4px; right: -6px; width: 16px; height: 16px; border-radius: var(--radius-full); background: var(--crest-gold); color: var(--pitch-900); font: 700 10px/16px var(--font-body); text-align: center`.
  - `stat-strip.css`: `.g-stat--down` — фон `var(--surface-2)`, значение `var(--danger)` (улучшенная, как была, — `--accent-tint` и `--accent`).
  - `action-stepper.css`: `.g-stepper--compact` — `flex-direction: column; align-items: stretch; gap: 2px`, подпись по центру; внутренняя строка «− число +» — `display: grid; grid-template-columns: var(--size-touch) minmax(0, 1fr) var(--size-touch)`; разметка компактного: `<div class="g-stepper g-stepper--compact"><span class="g-stepper__label">…</span><span class="g-stepper__row">−<span class="g-stepper__value">…</span>+</span></div>`.
  - `builder-view.mjs`: удалить `POSITION_KINDS` и `positionKind`, импортировать `positionKind` из `../../domain/roster/players.mjs`; `test/builder-view.test.mjs` не меняется и проходит.
- [ ] **Step 4: Тесты** — `node --test …` из шага 2 → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui src/domain/roster/players.mjs src/screens/teams/builder-view.mjs src/styles.css src/i18n/en.json src/i18n/ru.json test/roster-domain.test.mjs test/ui-player.test.mjs test/ui-steppers.test.mjs test/ui-match.test.mjs
git commit -m "feat(ui): a player's badge, a changed characteristic said in words, a compact and a locked stepper, a red status" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: RosterTable — `<table>` с сортировкой, раскрываемой строкой и нижней шапкой

**Files:**
- Create: `src/ui/roster-table.mjs`, `src/ui/roster-table.css`, `test/ui-roster-table.test.mjs`
- Modify: `src/styles.css` (`@import url("ui/roster-table.css");` в конце)

**Interfaces:**
- Consumes: `delegate` (`src/core/dom.mjs`), `classNames`, `dataAttributes` (`src/ui/markup.mjs`), `t("ui.stepper.thisMatch")`.
- Produces (`src/ui/roster-table.mjs`):

```js
/**
 * @param {object} props
 * @param {string} props.label names the table for a screen reader
 * @param {{key: string, label: string, name?: string, group?: "stats"|"career"|"spp", desk?: boolean, sortable?: boolean}[]} props.columns
 *   the first is the player's; `name` is what a screen reader hears for a short label (aria-label of its button);
 *   `desk` hides the column up to 900px; `sortable` defaults to true
 * @param {{label: string, span: number}[]} [props.groups] the over-heads from 901px ("Characteristics", "Career", "SPP"), aria-hidden;
 *   the first group starts after the player's column
 * @param {RosterTableRow[]} props.rows
 * @param {{key: string, dir: "asc"|"desc"}|null} [props.sort]
 * @param {string} [props.headLeadHtml] markup before the player's header button (stage 07c's «+»)
 * @returns {string} `<div class="g-rtable-frame"><table class="g-rtable" aria-label="…">…</table></div>`
 *
 * @typedef {object} RosterTableRow
 * @property {string} key unique among the rows: it is the row's data-key and what wireRosterTable reports
 * @property {string} badgeHtml markup from renderPlayerBadge
 * @property {string} name
 * @property {string} sub the line under the name (the position, or why he misses the match)
 * @property {boolean} [alert] `sub` states an injury or a missed match: drawn in --danger
 * @property {{text: string, tone?: ""|"zero"|"up"|"down"|"strong", note?: string, delta?: number}[]} cells one per column after the first
 * @property {string} [skillsHtml] markup from renderSkillChips
 * @property {boolean} [expanded] the row's panel is open (up to 900px)
 * @property {boolean} [selected] the row's player is the one in the side panel (from 901px)
 * @property {string} [panelHtml] what the open row shows
 */
export function renderRosterTable({ label, columns, groups = [], rows, sort = null, headLeadHtml = "" })

/** A header button reports `onSort(columnKey)`, a player's button `onToggle(rowKey)`. @returns {() => void} */
export function wireRosterTable(root, { onSort = () => {}, onToggle = () => {} } = {})
```

- Разметка:
  - `thead`: строка групп `<tr class="g-rtable__groups" aria-hidden="true">` (только при `groups`); строка колонок `<th scope="col" class="g-rtable__h[ g-rtable__h--who][ g-rtable__c--<group>][ g-rtable__c--desk]"[ aria-sort="ascending|descending"]>`. В ячейке игрока — `headLeadHtml`. В каждой — `<button type="button" class="g-sort" data-sort-key="<key>"[ aria-label="<name>"]>label<span class="g-sort__arrow" aria-hidden="true">▲|▼</span></button>`; стрелка — только у сортированной колонки.
  - `tbody` на игрока: `<tbody class="g-rtable__player[ is-expanded][ is-selected]" data-key="<key>">`.
    - Основная строка `<tr class="g-rtable__row">`: `<th scope="row" class="g-rtable__who"><button type="button" class="g-rtable__toggle" aria-expanded="true|false" aria-controls="rt-panel-<n>" data-row-key="<key>">${badgeHtml}<span class="g-rtable__text"><span class="g-rtable__name">…</span><span class="g-rtable__sub[ g-rtable__sub--alert]">…</span></span></button><div class="g-rtable__skills g-rtable__skills--desk">${skillsHtml}</div></th>`.
    - Ячейки: `<td class="g-rtable__c[ g-rtable__c--<group>][ g-rtable__c--desk][ g-rtable__c--zero|up|down|strong]">text[<sup class="g-rtable__delta"><span class="g-sr-only">, this match </span>+N</sup>][<span class="g-sr-only"> note</span>]</td>`.
    - Строка чипов `<tr class="g-rtable__skillrow"><td colspan="<все колонки>">${skillsHtml}</td></tr>` — при `skillsHtml`.
    - Строка панели `<tr class="g-rtable__panelrow" id="rt-panel-<n>"><td colspan="…">${panelHtml}</td></tr>` — при `expanded`.
  - `tfoot aria-hidden="true"`: `<tr class="g-rtable__foot"><td class="g-rtable__h …">label</td>…</tr>` — без кнопок и без `headLeadHtml`.
  - `<n>` — место строки в `rows`.
  - Без `label` или со строкой, где `cells.length !== columns.length - 1`, — `throw`.
- CSS:
  - `.g-rtable` — `width: 100%; border-collapse: collapse; table-layout: fixed; font: 400 15px/1.2 var(--font-body); color: var(--ink); background: transparent; text-transform: none; letter-spacing: 0`.
  - Подписи `.g-rtable__h`, `.g-sort` — `600 11px/1 var(--font-body)`, `letter-spacing: .06em`, `text-transform: uppercase`, `color: var(--muted)`; `.g-sort` — `min-height: var(--size-touch)`, без рамки и фона; `[aria-sort] .g-sort` — `color: var(--accent-text)`; стрелка 10px.
  - Колонки до 900px: ячейка игрока — `width: auto`, `.g-rtable__c--stats` — 36px; от 901px: `--stats` 32px, `--career` 36px, `--spp` 48px; ячейка игрока — `min-width: 180px`.
  - Ячейки — `padding: var(--space-8) var(--space-4)`, `text-align: center`, `font-variant-numeric: tabular-nums`, `white-space: nowrap`, `border-bottom: 1px solid var(--line)`, высота строки `var(--size-row)`.
  - Тоны: `--zero` — `color: var(--faint)`; `--up` — `color: var(--accent-text); font-weight: 700`; `--down` — `color: var(--danger); font-weight: 700`; `--strong` — `font: 700 17px/1 var(--font-body); color: var(--accent-text)`. `.g-rtable__delta` — `color: var(--accent-text); font-size: 10px; font-weight: 700`.
  - `.g-rtable__toggle` — `display: flex; align-items: center; gap: var(--space-10); width: 100%; min-height: var(--size-touch); padding: 0; border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer`; имя — `600 15px/1.2`, `.g-rtable__sub` — `400 13px/1.2`, `var(--muted)`; `--alert` — `var(--danger)`.
  - `.g-rtable__player.is-expanded` — `background: var(--surface-2)`.
  - До 900px — `display: none` у `.g-rtable__c--desk`, `.g-rtable__h.g-rtable__c--desk`, `.g-rtable__skills--desk`, `.g-rtable__groups`; строка чипов — `padding-left: 46px` (под именем).
  - От 901px:
    - `display: none` у `.g-rtable__skillrow`, `.g-rtable__panelrow`;
    - `.g-rtable-frame { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }`;
    - `.g-rtable__who { position: sticky; left: 0; background: var(--surface); z-index: 1 }`;
    - `.g-rtable__player.is-selected .g-rtable__row { outline: 2px solid var(--accent); outline-offset: -2px }`.

- [ ] **Step 1: Падающий тест** — `test/ui-roster-table.test.mjs` (колонки и строки — маленькие фикстуры в тесте; `mount` — строгий разбор Task 3):
  - «a roster table is a table: a head of sortable columns, a body per player, and a foot that repeats the labels for the eye»:
    - `table.g-rtable` с `aria-label`;
    - в `thead` по `th[scope="col"] button.g-sort[data-sort-key]` на колонку;
    - по `tbody.g-rtable__player[data-key]` на строку;
    - `th[scope="row"] .g-rtable__toggle`;
    - `tfoot[aria-hidden="true"]` без единой `button`, с теми же подписями;
    - `assertCspSafe`, `assertStyled(fragment, "roster-table.css", "number-badge.css", "skill-chip.css")`.
  - «the sorted column says so and points its arrow; the others say nothing»: `sort: {key: "ag", dir: "asc"}` → у `th` колонки AG `aria-sort="ascending"` и `▲`; у остальных нет `aria-sort` и стрелки; `dir: "desc"` → `descending`, `▼`.
  - «a header button reports its column, a player's button his row» (`wireRosterTable` + `fireEvent(click)`); снятый слушатель молчит.
  - «an open row carries its panel in a row of its own, and its button says it is open and which row it controls»: `expanded: true` → `aria-expanded="true"`, `aria-controls` = `id` строки `.g-rtable__panelrow`, в ней `panelHtml`; у закрытой — `aria-expanded="false"` и строки панели нет.
  - «a player's skills are drawn twice — under the name for a desk, in a row of their own for a phone — and each width hides the other»: оба `.g-rtable__skills--desk` и `.g-rtable__skillrow`; CSS — `valuesOf(…, ".g-rtable__skills--desk", "display")` содержит `"none"`, `valuesOf(…, ".g-rtable__skillrow", "display")` содержит `"none"`.
  - «a changed value says so in words, not only in colour; a zero is quiet; this match's addition is a superscript with words»: `{text: "2+", tone: "up", note: "improved"}` → `.g-rtable__c--up .g-sr-only` = `" improved"`; `{text: "0", tone: "zero"}` → `.g-rtable__c--zero`; `{text: "7", delta: 1}` → `sup.g-rtable__delta` и `textContent` ячейки `"7, this match +1"` после схлопывания пробелов.
  - «a desk column is hidden on a phone, and the over-heads are the desk's»: `desk: true` → класс `g-rtable__c--desk` у `th`, `td` и подписи `tfoot`; `.g-rtable__groups` при `groups`; CSS `display: none` до 900px.
  - «from 901px the table scrolls inside its frame and the player's column stays»: `valuesOf(…, ".g-rtable-frame", "overflow-x")` содержит `"auto"`, `valuesOf(…, ".g-rtable__who", "position")` содержит `"sticky"`.
  - «what a finger presses is 44px»: `min-height: var(--size-touch)` у `.g-sort` и `.g-rtable__toggle`.
  - «names are text»: `HOSTILE` в `name`, `sub`, `label` колонки, `note` — текст, разметки нет.
  - «a table that would draw wrong refuses»: без `label` и со строкой, где ячеек меньше колонок, — `throw`.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/ui-roster-table.test.mjs` → FAIL (нет модуля).
- [ ] **Step 3: Реализовать** по Interfaces; шапка модуля: «The roster as a real table (not the README's grid of buttons): sortable columns a screen reader reads as columns, one body per player — his row, his skills for a phone, his open panel — and a foot that repeats the labels at the end of a long list. Which order, which values and what the panel says is the caller's.»
- [ ] **Step 4: Тесты** — `node --test test/ui-roster-table.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS (`test/ui-kit.test.mjs` видит новый лист в `src/styles.css`).
- [ ] **Step 5: Commit**

```bash
git add src/ui/roster-table.mjs src/ui/roster-table.css src/styles.css test/ui-roster-table.test.mjs
git commit -m "feat(ui): RosterTable — a sortable table with a row that opens, skills for both widths and a foot of labels" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Модель состава — строки, счётчики, сортировка, режим экрана

Всё, что экран говорит об игроке и о том, куда пойдёт тап, — чистые функции над ответами сервера: без DOM, `state` и `t()`.

**Files:**
- Create: `src/screens/team/roster/model.mjs`, `test/team-roster-model.test.mjs`

**Interfaces:**
- Consumes:
  - `selectedRosterPlayers`, `positionKind`, `normalizeSppCounters`, `CAPTAINS_SKILL`, `normalizePlayerExtraSkills`, `normalizePlayerFavouredSkills` (`src/domain/roster/players.mjs`);
  - `sppCounterWeights`, `playerSppTotal`, `playerAdvancementSpent`, `playerAdvancementLevel`, `canTakeAdvancement` (`progression.mjs`);
  - `playerCurrentCost` (`costs.mjs`); `statValueForDisplayByStat`, `PLAYER_STATS`, `categoriesForAccess` (`values.mjs`); `advancementRanks` (`league-rules.mjs`);
  - `careerCounters`, `eventTotal`, `statisticsFromEvents`, `SPP_EVENT_COUNTERS` (`src/domain/post-match/events.mjs`);
  - `isMatchLive` (`src/shell/current-match.mjs`); `gameSides` (`src/data/team-record.mjs`); `isGameClosedForPlayers` (`src/data/games.mjs`).
- Produces (`src/screens/team/roster/model.mjs`):
  - `MAIN_COUNTERS` = `["touchdowns","casualties","completions","knockouts","interceptions","mvps"]`; `EXTRA_COUNTERS` = `["throws","landings","bonus"]`.
  - `counterSlots(race) → {main: {key, spp}[], extra: {key, spp}[]}` — `spp` из `sppCounterWeights(race)`; в `extra` после `bonus` — `catches`, только если `weights.catches > 0`.
  - `rosterMode(games, teamId) → {kind: "plain"} | {kind: "prep"|"match", game, round: number|null}`:
    - `match` — игра команды (`gameSides`), для которой `isMatchLive`; при нескольких — лиговая раньше товарищеской;
    - `prep` — игра команды с `preparationStatus` `"preparing"`/`"ready"`, не `isGameClosedForPlayers`, когда идущей нет;
    - `round` — `null` у товарищеской, иначе `game.roundNumber`.
  - `rosterLines({draft, race, events = [], mode}) → PlayerLine[]` в порядке состава; `[]` при `race === null`:

```js
/** @typedef {object} PlayerLine
 * @property {string} key `<id>#<index>`: unique in the page even where two 2.x players share an id
 * @property {string} id the stored id a write names (`storedPlayerId`)
 * @property {number} index the place in the roster
 * @property {string} number @property {string} name @property {string} position the race's own words for it
 * @property {string} kind positionKind(row) @property {boolean} captain @property {boolean} skip skipNextGame
 * @property {Record<"ma"|"st"|"ag"|"pa"|"ar", {text: string, change: "up"|"down"|"", order: number|null}>} stats
 *   `text` as statValueForDisplayByStat writes it, "–" for a characteristic the player has not; `order` — the number to sort by (the target for AG and PA, "3+" → 3), null for none
 * @property {{name: string, gained: boolean, source: "base"|"primary"|"secondary"|"favoured"|"captain"}[]} skills
 * @property {string[]} primary @property {string[]} secondary category names (categoriesForAccess)
 * @property {Record<string, number>} blob the draft's counters (normalizeSppCounters)
 * @property {Record<string, number>} career careerCounters(player, events not settled)
 * @property {Record<string, number>} match the sum of the live match's own rows per counter (eventTotal), zeros outside a match
 * @property {Record<string, number>} waiting blob + the rows without a match not settled, per counter
 * @property {{code: string, stat?: string}|null} injury the match's standing injury (statisticsFromEvents), null outside a match
 * @property {number} earned playerSppTotal(race, career) @property {number} spent @property {number} available earned − spent
 * @property {number} level advancements taken @property {number|null} cheapest the random skill's cost at the next rank, null at the last
 * @property {boolean} ready cheapest !== null && available >= cheapest
 * @property {number} value playerCurrentCost(row, player), in thousands
 * @property {number} matchSpp the SPP of the match's own rows (weights × match)
 */
```

  - `stepRule(line, counter, {mode, outside = false}) → {via: "roster"|"match"|"outside", decDisabled: boolean, incBlocked: ""|"mvp"|"notPlaying", locked: ""|"notPlaying"}` (решения 9 и 13):
    - не `match` — `via: "roster"`, `decDisabled: line.blob[counter] <= 0`; «+» нельзя выше 999 — `incBlocked` не нужен, это решает `save.mjs`;
    - `match` без `outside` — `via: "match"`, `decDisabled: line.match[counter] <= 0`, `incBlocked: "mvp"` для `mvps`; у `line.skip` — `locked: "notPlaying"`;
    - `match` с `outside` — `via: "outside"`, `decDisabled: line.waiting[counter] <= 0`.
  - `SORT_KEYS` = `["player","ma","st","ag","pa","ar",...MAIN_COUNTERS,"earned","available"]`; `nextSort(current, key) → {key, dir}` — первое нажатие: `player`, `ag`, `pa` → `asc`, остальные → `desc`; то же нажатие ещё раз — обратное; `sortLines(lines, sort) → PlayerLine[]` — копия; `null` — порядок состава; значение `null` — в конец в обе стороны; равные — по `index`.
  - `rosterCounts(lines) → {players, skipping, ready}`.

- [ ] **Step 1: Падающий тест** — `test/team-roster-model.test.mjs`. Данные — `expandCollections(public/data.en.json)`, расы `teams/human`, `teams/orc` (Brawlin' Brutes), `teams/wood-elves` (Passing Virtuosos); строки Human: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 4 Halfling Hopeful, 5 Ogre. Тесты:

```js
test("the slots are six main counters and a row of three, a fourth where catches earn SPP; each is worth what the race says", () => {
  const worth = (slug) => Object.fromEntries([...counterSlots(race(slug)).main, ...counterSlots(race(slug)).extra].map(({ key, spp }) => [key, spp]));
  assert.deepEqual(counterSlots(race("teams/human")).main.map(({ key }) => key), MAIN_COUNTERS);
  assert.deepEqual(counterSlots(race("teams/human")).extra.map(({ key }) => key), ["throws", "landings", "bonus"]);
  assert.deepEqual([worth("teams/human").touchdowns, worth("teams/human").mvps], [3, 5]);
  assert.deepEqual([worth("teams/orc").touchdowns, worth("teams/orc").casualties], [2, 3], "Brawlin' Brutes");
  assert.deepEqual(counterSlots(race("teams/wood-elves")).extra.map(({ key }) => key), ["throws", "landings", "bonus", "catches"], "Passing Virtuosos");
});

test("the mode is the team's live match, else a preparation that is on, else none; a closed game or another team's is none", () => {
  // games as /api/games sends them (fixture helper in the file): live = preparationStatus in_progress, post-match draft
  assert.equal(rosterMode([game("g1"), game("g2", { preparationStatus: "in_progress", postMatchStatus: "draft" })], "t1").game.id, "g2");
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing" })], "t1").kind, "prep");
  assert.equal(rosterMode([game("g1", { preparationStatus: "ready", kind: "friendly", season: null })], "t1").round, null);
  assert.equal(rosterMode([game("g1", { preparationStatus: "preparing", roundStatus: "completed" })], "t1").kind, "plain");
  assert.equal(rosterMode([game("g1", { preparationStatus: "in_progress", home: rivalSide })], "t1").kind, "plain");
  assert.equal(rosterMode([game("gx", { preparationStatus: "in_progress", postMatchStatus: "not_started", resultStatus: "confirmed" })], "t1").kind, "plain",
    "a score confirmed around the post-match is no match on (isMatchLive)");
});
```

  Ещё тесты (имена и проверки):
  - «a line is what the roster and the unsettled rows say: the career, the match's own, and the blob with the edits waiting»: блоб TD 2; записи: `+1 TD` матча `g2`, `+1 TD` без пары, учтённая `+1 TD` без пары → `career.touchdowns` 4, `match.touchdowns` 1, `waiting.touchdowns` 3, `blob.touchdowns` 2; `matchSpp` 3.
  - «the minus of each kind of edit stops where the server would refuse it»:
    - `plain`: блоб 0, карьера 1 → `decDisabled` true;
    - `match`: счётчик матча 0 при карьере 3 → true;
    - `match` + `outside`: блоб 1 и ждущая правка вне матча `−1` → `waiting` 0 → true;
    - MVP в матче → `incBlocked: "mvp"`, с `outside` → `""`;
    - `skip` в матче → `locked: "notPlaying"`, с `outside` → `""`.
  - «a characteristic raised or lowered is marked; AG and PA read the other way»: `statMods {ag: 1, ar: -1}` у Catcher → `stats.ag` `{text: "2+", change: "up", order: 2}`, `stats.ar` `{text: "7+", change: "down"}`; Lineman PA `"4+"`; Troll Slayer `teams/dwarf` (PA `"-"`) → `{text: "–", change: "", order: null}` (тире, как StatStrip).
  - «skills come with where they came from, and the captain's Pro once»: Blitzer с `extraSkills: [{name: "Mighty Blow", access: "primary"}]`, `isCaptain` → `[["Block","base"],["Tackle","base"],["Mighty Blow","primary"],["Pro","captain"]]` (`gained` true только у Mighty Blow); капитан с Pro от прокачки — Pro один, `primary`.
  - «SPP: earned from the career, spent on advancements, the cheapest next one, and who can advance»: TD 2 + MVP 1 у человека → `earned` 11; одна прокачка `random` → `spent` 3, `available` 8, `level` 1, `cheapest` 4 (ранг 2), `ready` true; шесть прокачек → `cheapest` null, `ready` false.
  - «sorting: numbers down, AG and PA up, a missing PA last both ways, a tie in roster order; the second press turns it round»: `nextSort(null, "ma")` → `{key: "ma", dir: "desc"}`, `nextSort({key: "ma", dir: "desc"}, "ma")` → `asc`, `nextSort(null, "ag")` → `asc`, `nextSort(null, "player")` → `asc`; `sortLines` по `pa` asc и desc — игрок с «–» последний оба раза; равные MA — по `index`; `sortLines(lines, null)` — порядок состава.
  - «the standing injury of the match is the last one not taken back»: `+1 lasting ag`, `+1 miss`, `−1 miss` → `{code: "lasting", stat: "ag"}`; вне матча — `null`.
  - «an odd roster: no race, a row the race has not, a shared id, a missing PA»: `rosterLines({race: null, …})` → `[]`; игрок с `rowIndex: 99` пропущен; два игрока с `id: "dup"` — две строки, `key` `dup#0` и `dup#1`, `id` оба `"dup"`; `HOSTILE` в имени — значение как есть (экранирует разметка).
  - «counts: the roster, those who miss a match, those who can advance»: `rosterCounts` → `{players: 3, skipping: 1, ready: 1}`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-model.test.mjs` → FAIL (нет модуля).
- [ ] **Step 3: Реализовать** по Interfaces. Шапка: «What the roster says of each player, read from what the server sends — the roster as GET has it (the draft), its race, the events not settled — and where a tap on a counter goes. Pure: the screen draws it, the tests run it on the real vault.» Если файл переходит 600 строк — режим и правила тапа вынести в `src/screens/team/roster/mode.mjs` (тот же каталог, те же имена экспортов).
- [ ] **Step 4: Тесты** — `node --test test/team-roster-model.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check` → PASS (экспорт для `check-dead-code` — корень, так что функции, которые экран позовёт в Task 9, проверку проходят).
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/model.mjs test/team-roster-model.test.mjs
git commit -m "feat(roster): what each player's line says — career and match, worth of each counter, where a tap goes, the order, the screen's mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Чтение снимка и запись блоба вне матча

**Files:**
- Create: `src/screens/team/roster/data.mjs`, `src/screens/team/roster/save.mjs`, `test/team-roster-data.test.mjs`
- Modify: `src/data/teams.mjs` (`createRefusal` → экспорт `refusalWithRules`, два вызова в файле), оба словаря

**Interfaces:**
- Consumes:
  - `apiRequest`, `sessionTokenHolds` (`src/core/api-client.mjs`); `refusalText`, `API_ERROR` (`src/core/api.mjs`);
  - `createRosterStore`, `SAVE_STATUS` (`src/data/roster-store.mjs` — не меняется); `normalizeSavedRoster`, `rosterForStorage` (`src/data/roster-draft.mjs`); `normalizeDraft` (`src/domain/roster/schema.mjs`);
  - `storedPlayerId`, `normalizeSppCounters` (`players.mjs`); `sameValues` (`src/domain/post-match/events.mjs`); `addMyTeam` (`src/data/teams.mjs`); `state`.
- Produces (`src/data/teams.mjs`): `refusalWithRules(error) → string` — тело нынешнего `createRefusal`: отказ и через пробел `t("validation.<CODE>", params)` каждого нарушения 422.
- Produces (`src/screens/team/roster/data.mjs`):
  - `readRoster(teamId, {attempts = 3} = {}) → Promise<{team: object, events: object[]} | {error: string}>`:
    - `GET /api/teams/:id` и `GET /api/teams/:id/events` (без `pairing`);
    - пока `events.revision !== team.revision` — оба чтения ещё раз; после `attempts` несовпадений — `{error: t("teamRoster.readMismatch")}`;
    - отказ запроса — `{error: refusalText(error)}`.
- Produces (`src/screens/team/roster/save.mjs`, один `createRosterStore` модуля, `debounceMs: 0`):
  - `trackRoster(team) → draft` — `normalizeSavedRoster(structuredClone(team))`; `meta` — та же копия (её `revision` двигают ответы), `endpoint` — `/api/teams/:id`.
  - `stepSpp(teamId, playerId, counter, delta) → {ok: true} | {ok: false} | {refusal: string}`:
    - игрок — первый с `storedPlayerId(player) === playerId`;
    - значение — `normalizeSppCounters(player.spp)[counter] + delta`; вне 0…999, игрока нет или статус `conflict` — `{ok: false}`, ничего не отправлено;
    - чужой токен — `{refusal: t("auth.otherTab")}`;
    - иначе `player.spp = {...player.spp, [counter]: value}`, `saveChange(teamId)`, `{ok: true}`.
  - Тело `PATCH` (`buildRequest`): `{name: meta.name, baseTeamSlug: meta.baseTeamSlug, logoData: meta.logoData ?? "", roster: rosterForStorage(snapshot), revision: meta.revision}` — значения блоба из `GET` и своих шагов, никогда карьера.
  - Транспорт:
    - ответ `{team}` — `addMyTeam(team)`, если тренер тот же, что при отправке;
    - 409, в чьём `payload.team` `name`, `baseTeamSlug` и `normalizeDraft(team.roster)` совпадают (`sameValues`) с `normalizeDraft(request.roster)`, — это наше сохранение, чей ответ пропал: транспорт возвращает `{team: payload.team}` как успех;
    - иначе ошибка идёт в очередь, как раньше.
  - `saveState(teamId) → {status, waiting: number, refusal: string}`:
    - `status` — значение `SAVE_STATUS`;
    - `waiting` — шаги, ещё не подтверждённые ответом (0 после успеха);
    - `refusal` — `refusalWithRules` последней ошибки, иначе `""`.
  - `onSaveState(teamId, listener) → () => void`.
  - `takeServerTeam(team) → draft` — после конфликта или отказа 422: черновик — состав сервера (`adoptServerRoster`), `meta` — его поля и ревизия, `waiting` 0.
  - `retrySaves(teamId) → Promise<string>` (`flush`).
  - `guardUnload(target = globalThis) → () => void` — `beforeunload` спрашивает, пока у любой команды `waiting > 0`; на одну цель ставится один раз (повторный вызов возвращает тот же снимающий). `trackRoster` зовёт `guardUnload()` для страницы.

Словари: `teamRoster.readMismatch` — «The roster kept changing while it was read. Try again.» / «Состав менялся, пока читался. Повторите.»

- [ ] **Step 1: Падающие тесты** — `test/team-roster-data.test.mjs` (`installFakeApi` до импорта `api-client`; команда `t1` ревизии 4, игрок `p1` с `spp: {touchdowns: 2}`, логотип `"data:image/png;base64,AA=="`):
  - «the team and its records are read until they agree on the revision»: первый ответ записей с `revision: 3` (`hold` + `release({status, body})`) → второе чтение обоих; итог — команда и записи ревизии 4.
  - «three readings that never agree give up with words; a failed read says why»: `{error: "The roster kept changing…"}`; `api.fail("GET /api/teams/t1")` → `{error}` с текстом `refusalText`.
  - «a tap writes the stored counter plus one, never the career, with the team as read and its revision» (Review Focus 4): в записях — неучтённая `+1 TD` для `p1`; `stepSpp("t1", "p1", "touchdowns", 1)` → один `PATCH /api/teams/t1` с `roster.players[0].spp.touchdowns === 3`, `revision: 4`, `name`, `baseTeamSlug`, `logoData` как прочитаны.
  - «two quick taps are two PATCHes in order, the second on the revision the first came back with» (Review Focus 1): первый `PATCH` держится (`hold`); второй шаг; `release` с командой ревизии 5 → второй `PATCH` — `revision: 5`, `touchdowns: 4`.
  - «the answer goes into the coach's list: the team first, with its new revision»: `state.myTeams.items[0]` — `t1` ревизии 5.
  - «a 409 that carries our own counters is a save that landed while its answer was lost» (Review Focus 1): `PATCH` → `fail` (offline) → `saveState` `{status: "offline", waiting: 1}`; затем 409 с `team`, чей состав — отправленный, ревизии 5 → `retrySaves` → `{status: "saved", waiting: 0}`; следующий шаг — `revision: 5`.
  - «a 409 with anything else is another device: it waits for the coach, and nothing more is sent»: 409 с `touchdowns: 9` → `status: "conflict"`; ещё `stepSpp` → `{ok: false}`, новых запросов нет; `takeServerTeam(team)` → в черновике `touchdowns: 9`, `status: "idle"`, следующий шаг — с ревизией сервера.
  - «no network: the step waits, counted, and goes when asked again»: `fail` → `{status: "offline", waiting: 1}`; ответ 200 → `retrySaves` → `saved`, `waiting: 0`.
  - «a stored 0 takes no step down, 999 no step up, and a player the roster has not none»: `{ok: false}` и ни одного запроса.
  - «another tab's coach: nothing is sent»: токен в хранилище сменён после `rememberSessionToken` → `{refusal: "…another tab…"}`, запросов нет.
  - «a refusal names the rule»: 422 `ROSTER_BREAKS_THE_RULES` с `violations: [{code: "DUPLICATE_PLAYER_ID", params: {names: "Ann, Bo"}}]` → `saveState().refusal` содержит `"Ann, Bo"`, `status: "error"`.
  - «the browser asks before the tab closes while a step waits»: `guardUnload(target)` на `EventTarget`; `beforeunload` при `waiting > 0` — `defaultPrevented`, при 0 — нет; снятый слушатель молчит.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/team-roster-data.test.mjs` → FAIL (нет модулей).
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `save.mjs`: «The roster's own save queue (the 2.x autosave path, createRosterStore): outside a match a tap is one PATCH of the whole team, the stored counter ± 1 — never the career the screen shows (spec 3.0 §3.7; master plan, 07a: "the editor saves the blob's SPP from GET"). A 409 that holds what was sent is that very save, whose answer was lost.» В `teams.mjs` переименование — без изменения поведения (`test/teams-data.test.mjs` проходит как был).
- [ ] **Step 4: Тесты** — `node --test test/team-roster-data.test.mjs test/teams-data.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/data.mjs src/screens/team/roster/save.mjs src/data/teams.mjs src/i18n/en.json src/i18n/ru.json test/team-roster-data.test.mjs
git commit -m "feat(roster): read the team and its records as one snapshot; outside a match a tap is one PATCH of the stored counter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Записи матча и правки вне матча — очередь и отказы

**Files:**
- Create: `src/screens/team/roster/taps.mjs`, `test/team-roster-taps.test.mjs`
- Modify: оба словаря

**Interfaces:**
- Consumes: `apiRequest`, `sessionTokenHolds`; `API_ERROR`; `refusalWithRules` (Task 7).
- Produces (`src/screens/team/roster/taps.mjs`):
  - `sendTap(teamId, {pairingId = null, playerId, counter, delta, injury = null}) → Promise<{event} | {refusal: string, code: string|null, lost?: true}>`:
    - `POST /api/teams/:id/events` с телом `{pairingId, playerId, counter, delta}` и `injury` только у `counter: "injury"`;
    - у команды одна запись в пути, следующие ждут в порядке вызова;
    - чужой токен — `{refusal: t("auth.otherTab"), code: null}` без запроса;
    - ответ не пришёл (`offline`, `timeout`, 5xx, `http` без кода) — `{refusal: t("teamRoster.tapLost"), code: null, lost: true}`, повторно не отправляется: экран перечитывает записи;
    - отказ — `{refusal: refusalWithRules(error), code: error.code}`.
  - `tapsWaiting(teamId) → number` — отправленные и ждущие очереди, без ответа.

Словари: `teamRoster.tapLost` — «The answer to the record did not arrive: the records are read again to see whether it was written.» / «Ответ на запись не пришёл: записи перечитываются, чтобы узнать, сохранилась ли она.»

- [ ] **Step 1: Падающие тесты** — `test/team-roster-taps.test.mjs`:
  - «a tap of the match is one row: the match, the player, the counter and the step»: тело `{pairingId: "g2", playerId: "q1", counter: "touchdowns", delta: 1}`, без `injury`; ответ 201 `{event}` → `{event}`.
  - «an edit outside the match names no match; an injury carries its injury»: `pairingId: null` в теле; `counter: "injury", injury: {code: "lasting", stat: "ag"}` → в теле `injury`.
  - «taps go one at a time: a minus waits for the plus before it» (Review Focus 1): `hold("POST /api/teams/t2/events")`; два `sendTap` (+1, −1) → `waiting === 1` до `release`; затем второй запрос, порядок тел — +1, −1; `tapsWaiting` 2 → 0.
  - «a tap whose answer was lost is not sent again» (Review Focus 1): `fail` → `{lost: true, code: null}`, в `calls` один запрос.
  - «a refusal is said and named»: по очереди 409 `EVENT_SIDE_LOCKED`, 409 `EVENT_BELOW_ZERO`, 409 `MATCH_NOT_LIVE`, 422 `POST_PLAYER`, 422 `ROSTER_BREAKS_THE_RULES` с `DUPLICATE_PLAYER_ID {names: "Ann, Bo"}` → `code` — код ошибки, `refusal` — `t("error.<CODE>")` (у последнего — с «Ann, Bo»).
  - «another tab's coach: nothing is sent».
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/team-roster-taps.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка: «A tap during a match, and an edit outside it, as the server takes them (`POST /api/teams/:id/events`): one at a time per team, so a step down never overtakes the step up it takes back; an answer that does not come is not a reason to send again — the rows are read again instead (master plan, 07a: taps go to the events, EVENT_SIDE_LOCKED, EVENT_BELOW_ZERO).»
- [ ] **Step 4: Тесты** — `node --test test/team-roster-taps.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/taps.mjs src/i18n/en.json src/i18n/ru.json test/team-roster-taps.test.mjs
git commit -m "feat(roster): taps and edits outside a match go one at a time, a lost answer is read back rather than resent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Экран «Состав» — таблица, раскрытая строка и правая панель, чипы с правилом; маршрут

Счётчиков в этой задаче ещё нет (Task 10): строка и панель показывают их числа как текст.

**Files:**
- Create: `src/screens/team/roster/index.mjs`, `wire.mjs`, `view.mjs`, `panel.mjs`, `sheets.mjs`, `memory.mjs`, `roster.css`, `test/team-roster.test.mjs`, `test/app-boot-roster.test.mjs`
- Modify: `src/core/router.mjs` (импорт и строка `teamRoster:`), `src/styles.css` (`@import url("screens/team/roster/roster.css");` в конце), `scripts/browser-check-roster.mjs` (адрес `#/t/t1/roster` → `#/t/t1/roster/p1`, шапка: «the 2.x editor, which draws the player's address until stage 07d»), оба словаря

**Interfaces:**
- Consumes:
  - Task 4–8: `renderPlayerBadge`, `renderStatStrip`, `renderRosterTable`, `wireRosterTable`, `rosterLines`, `sortLines`, `nextSort`, `rosterMode`, `rosterCounts`, `counterSlots`, `readRoster`, `trackRoster`;
  - `renderPageHead`, `renderSkillChips`, `wireSkillChips`, `renderSheet`, `wireSheets`, `renderButton`, `renderCallout`, `renderProgressDots`, `icon` (`src/ui`);
  - `patchWithModal` (`src/components/dialog.mjs`), `drawScreen` (`src/core/dom.mjs`); `onScreenLeave`; `view`; `state`; `raceTeamOf` (`src/data/teams.mjs`); `loadGames`, `onGamesChange`;
  - `pageForName` (`src/screens/ref/catalog.mjs`); `categoryOf`, `tagsOf` (`src/screens/ref/skill.mjs`); `teamPlayerUrl`; `formatMoney`.
- Produces:
  - `renderTeamRoster(teamId) → Promise<void>` (`index.mjs`) — экран маршрута `teamRoster`; роутер: `teamRoster: ({ teamId }) => renderTeamRoster(teamId),`; строка `teamPlayer:` не меняется.
  - `rosterMemory(teamId) → {sort: {key, dir}|null, selected: string|null, outside: boolean, baseline: Map<string, number>}` (`memory.mjs`) — один объект на команду на время жизни страницы.
  - `rosterMarkup(screen) → string` (`view.mjs`):

```js
/** @typedef {object} RosterScreen
 * @property {object} team the team as last read: name, baseTeamSlug
 * @property {object|null} race its page in the reference
 * @property {object} data the reference (state.data): the skills' pages
 * @property {import("./model.mjs").PlayerLine[]} lines in the order of `memory.sort`
 * @property {{kind: "plain"|"prep"|"match", game?: object, round?: number|null}} mode
 * @property {{sort: object|null, selected: string|null, outside: boolean}} memory
 * @property {{kind: "skill", key: string, name: string}|null} sheet the sheet that is open
 * @property {string} error a read that failed, "" when none
 */
```

  - `rowPanelMarkup(line, screen)`, `sidePanelMarkup(line, screen)`, `skillChipsMarkup(line, {card = false})` (`panel.mjs`).
  - `SKILL_SHEET = "roster-skill"`; `skillSheetMarkup({data, line, name}) → string` (`sheets.mjs`).
- Разметка экрана:

```html
<div class="g-roster" data-screen="team-roster">
  ${renderPageHead({ title: t("shell.tab.roster"), sub: t("teamRoster.counts", counts) })}
  <div class="g-roster__notices">…</div>  <!-- Task 10, 11 -->
  <div class="g-roster__layout">
    <section class="g-roster__main" aria-labelledby="roster-heading">
      <div class="g-roster__bar"><h2 class="g-roster__heading" id="roster-heading">Active roster <span class="g-roster__count">7</span></h2><!-- status, Task 10 --></div>
      ${renderRosterTable(…)}
    </section>
    <aside class="g-roster__aside" aria-label="${t("teamRoster.panelLabel")}" data-panel-player="<key>">${sidePanelMarkup(line, screen)}</aside>
  </div>
  ${screen.sheet ? skillSheetMarkup(…) : ""}
</div>
```

- Колонки таблицы:
  - `player` (подпись `teamRoster.column.player`);
  - `ma st ag pa ar` (`stats.*`, `group: "stats"`);
  - `MAIN_COUNTERS` (`teamRoster.counter.*`, `name` — `teamRoster.counterName.*`, `group: "career"`, `desk: true`);
  - `earned`, `available` (`teamRoster.column.earned` / `.available`, `group: "spp"`, `desk: true`).
  - Группы от 901px: «Характеристики» (5), «За карьеру» (6), «SPP» (2).
  - Ячейки: характеристики — `stats[s].text` с тоном `up`/`down` и `note` (`ui.stat.improved`/`lowered`); счётчики — `career[c]`, тон `zero` у нуля; «Всего» — `earned`; «Дост.» — `available`, тон `strong`.
  - Строка: `badgeHtml` — `renderPlayerBadge({number, kind, captain})`; `sub` — позиция, у `skip` — `teamRoster.skip` с `alert: true`; `skillsHtml` — `skillChipsMarkup(line)`; `expanded` — `memory.selected === line.key`; `selected` — то же или первый игрок, если `memory.selected` пуст; `panelHtml` — `rowPanelMarkup(line, screen)` у раскрытой.
- Нажатия:
  - `onToggle(key)` — на телефоне (`globalThis.matchMedia?.("(max-width: 900px)").matches`) строка открывается и закрывается: `memory.selected = memory.selected === key ? null : key`; на десктопе игрок выбирается для панели, повторное нажатие его оставляет: `memory.selected = key`; перерисовка;
  - `onSort(key)` — `memory.sort = nextSort(memory.sort, key)`, перерисовка;
  - чип (`wireSkillChips`) — `screen.sheet = {kind: "skill", key, name}`, открывший элемент запоминается; закрытие шторки (`wireSheets` `onClose`) — `sheet = null`, перерисовка, затем фокус на запомненный элемент, если он ещё в документе (05–13: фокус после перерисовки, следующей за `onClose`).
- Отрисовка: первая — `drawScreen(view, markup)` и фокус на `h1`; следующие — `patchWithModal(view, markup, sheet ? "#roster-skill" : "")`.
- Чтение: `readRoster(teamId)` и `loadGames(true)` параллельно; `onGamesChange` и `visibilitychange` (вкладка снова видна → `loadGames(true)`) перерисовывают. Ошибка чтения — Callout `danger` с текстом и кнопкой «Повторить» (`teamRoster.readAgain`), без таблицы; раса неизвестна (`raceTeamOf` → `null`) — Callout `danger` `teamRoster.noRace` без таблицы. `onScreenLeave("team-roster", …)` снимает всё.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.counts` | On the roster: {players} · missing a match: {skipping} · can advance: {ready} | В составе: {players} · пропускают матч: {skipping} · могут прокачаться: {ready} |
| `teamRoster.heading` | Active roster | Активный состав |
| `teamRoster.tableLabel` | Players of {team} | Игроки команды {team} |
| `teamRoster.panelLabel` | The player | Игрок |
| `teamRoster.column.player` | Player | Игрок |
| `teamRoster.column.earned` | Total | Всего |
| `teamRoster.column.available` | Avail. | Дост. |
| `teamRoster.group.stats` | Characteristics | Характеристики |
| `teamRoster.group.career` | Career | За карьеру |
| `teamRoster.group.spp` | SPP | SPP |
| `teamRoster.counter.<key>` (`touchdowns casualties completions knockouts interceptions mvps throws landings bonus catches`) | TD · CAS · COMP · KO · INT · MVP · TTM · Landing · Bonus · CATCH | TD · CAS · COMP · KO · INT · MVP · TTM · Призем. · Бонус · CATCH |
| `teamRoster.counterName.<key>` | touchdown · casualty · completion · knockout · interception · MVP · superb throw · safe landing · bonus SPP · catch | тачдаун · травма · пас · нокаут · перехват · MVP · удачный бросок · приземление · бонус SPP · приём |
| `teamRoster.skip` | Misses the next match | Пропускает следующий матч |
| `teamRoster.profile` | Profile and advancement | Профиль и прокачка |
| `teamRoster.advance` | Advance | Прокачать |
| `teamRoster.edit` | Edit {name} | Изменить: {name} |
| `teamRoster.value` | {position} · {value} | {position} · {value} |
| `teamRoster.available` | SPP available | SPP доступно |
| `teamRoster.earned` | earned {spp} | заработано {spp} |
| `teamRoster.spent` | spent {spp} | потрачено {spp} |
| `teamRoster.advancements` | Advancements | Улучшения |
| `teamRoster.cheapest` | Cheapest — {spp} SPP | Самое дешёвое — {spp} SPP |
| `teamRoster.maxed` | Every advancement is taken | Все улучшения взяты |
| `teamRoster.skills` | Skills | Навыки |
| `teamRoster.access` | Primary: {primary} · Secondary: {secondary} | Основные: {primary} · Вторичные: {secondary} |
| `teamRoster.nextMatch` | Next match: {state} | Следующий матч: {state} |
| `teamRoster.plays` | plays | играет |
| `teamRoster.sits` | sits it out | пропускает |
| `teamRoster.source.<source>` (`base primary secondary favoured captain`) | starting · primary · secondary · Favoured · the captain's | стартовый · основной · вторичный · Favoured · капитанский |
| `teamRoster.skill.from` | {player} · {source} | {player} · {source} |
| `teamRoster.skill.noPage` | The reference has no page for this skill. | В справочнике нет страницы этого навыка. |
| `teamRoster.noRace` | The reference does not know this team's race ({slug}): the roster cannot be drawn. | Справочник не знает расу этой команды ({slug}): состав не нарисовать. |
| `teamRoster.readAgain` | Try again | Повторить |
| `teamRoster.loading` | Loading the roster… | Загружаем состав… |
| `teamRoster.empty` | No players on the roster yet. | В составе пока никого нет. |

(`teamRoster.counter.*` и `counterName.*` — по ключу на каждый из `SPP_EVENT_COUNTERS`; аббревиатуры счётчиков — английские в обоих языках, как TD и CAS в глоссарии.)

- CSS `roster.css` (шрифт, рамка, фон, регистр и начертание — явно):
  - `.g-roster__bar` — `display: flex; align-items: center; justify-content: space-between; gap: var(--space-12)`;
  - `.g-roster__heading` — `700 26px/1.1 var(--font-display)`, без `text-transform`; число — `500 18px var(--font-display)`, `var(--muted)`;
  - до 900px — `.g-roster__aside { display: none }`;
  - от 901px:
    - `.g-roster__layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--space-16); align-items: start }`;
    - `.g-roster__aside { position: sticky; top: var(--space-16); padding: var(--space-16); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface) }`;
  - раскрытая строка (`.g-roster__rowpanel`) — `display: flex; flex-direction: column; gap: var(--space-10); padding: var(--space-4) var(--space-16) var(--space-14)`;
  - «Профиль и прокачка» — `renderButton({kind: "dark", block: true, href})`.

- [ ] **Step 1: Падающие тесты** — `test/team-roster.test.mjs` (по образцу `test/team-overview.test.mjs`):
  - Окружение:
    - `installFakeApi`, `#app-view`, `globalThis.location`;
    - `state.auth.currentUser`, `state.myTeams` с `t1` Human, `state.data = expandCollections(public/data.en.json)`, `state.games = {loaded: true, items: []}`.
  - Ответы:
    - `GET /api/teams/t1` — семь игроков Human: Lineman, капитан-Blitzer с `extraSkills: [{name: "Mighty Blow", access: "primary"}]` и `spp: {touchdowns: 1}`, Catcher с `statMods: {ag: 1}`, Lineman с `skipNextGame`, Thrower, Lineman, Ogre; у остальных SPP нет;
    - `GET /api/teams/t1/events` — `{events: [], revision}`;
    - `GET /api/games` — `{games: [], currentGames: []}` (экран читает игры сам, решение 18).
  - Тесты:
    - «the roster of a team: a band «Roster» with its counts, «Active roster» with the number, a row per player in the roster's order»: `h1` = «Roster», `.g-pagehead__sub` = «On the roster: 7 · missing a match: 1 · can advance: 1» (у Blitzer 3 SPP — случайный навык первого ранга); `#roster-heading` содержит «Active roster» и «7»; `tbody.g-rtable__player` — 7 в порядке состава.
    - «a row: the number on the position's colour, the captain's «C», the name, the position and the five characteristics; a changed one says so; one who misses the match says that instead»: `.g-num--blitzer .g-num__captain`; у Catcher ячейка AG — `.g-rtable__c--up` с «improved»; у пропускающего `.g-rtable__sub--alert` = «Misses the next match».
    - «on a desk the first player stands in the panel; a press on another moves him there and marks his row, and a second press keeps him» (`withWindow({phone: false})` из `test/helpers/ref-screen.mjs`): `.g-roster__aside[data-panel-player]` = ключ первого; клик по `[data-row-key="<второй>"]` → атрибут — второй, его `tbody` — `is-selected`; ещё клик — без изменений.
    - «on a phone a press opens the player's row and the next press closes it; one row is open at a time» (`withWindow({phone: true})`): `aria-expanded`, `.g-rtable__panelrow` у одного `tbody`.
    - «a header sorts the table, the next press turns it round, and the order stays when the screen is drawn again and after a visit elsewhere»: клик `[data-sort-key="ma"]` → порядок по MA ↓, `aria-sort="descending"`; ещё клик — `ascending`; `releaseCurrentScreen()` и новый `renderTeamRoster("t1")` → порядок тот же.
    - «a skill chip opens its rule: the name as written, its category and type, the rule, the player and where the skill came from; closed, the focus is back on the chip»: клик по видимому чипу «Mighty Blow» → `dialog#roster-skill` открыт, `h2` = «Mighty Blow», `.g-sheet__sub` = «Strength · Active», в теле `.g-prose`, строка «<имя> · primary»; `[data-sheet-close]` → шторки нет, `document.activeElement` — тот чип.
    - «a skill the reference has no page for opens all the same and says so»: игрок с `extraSkills: [{name: "No Such Skill"}]` → шторка с `teamRoster.skill.noPage`.
    - ««Profile and advancement» on a phone, «Advance» and the pencil on a desk lead to the player's page — the 2.x editor until stage 07d»: `href` = `teamPlayerUrl("t1", id)` у всех трёх.
    - «the desk panel: badge, name, position and value, the characteristics, SPP available, earned and spent, the advancements, the cheapest one, the skills as cards with their source, the access, the next match»: у выбранного Lineman — `.g-num--lg`, «Human Lineman · 50k» (позиция из контента, `playerCurrentCost`, `formatMoney`), `dl.g-stats`, «Advancements: 0 of 6», «Cheapest — 3 SPP», `.g-skill--card .g-skill__source`, «Primary: General · Secondary: Agility, Strength, Devious», «Next match: plays».
    - «a team whose race the reference does not know: a line that says so, and no table»: `baseTeamSlug: "teams/unknown"` → Callout `danger` с `teamRoster.noRace`, `table` нет, исключения нет.
    - «a roster that could not be read says why, and reads again on «Try again»»: `fail` → Callout и кнопка; ответ 200 и клик → таблица.
    - «a player's and a skill's name are text»: `HOSTILE` в имени игрока и в навыке → `textContent`, ни `img`, ни `[onerror]`.
    - «every key the screen asks for is in both dictionaries; the counters' and the sources' are walked»: `assertDictionaryCovers` по файлам `src/screens/team/roster/*.mjs`; перебор `teamRoster.counter.*`, `teamRoster.counterName.*` по `SPP_EVENT_COUNTERS` и `teamRoster.source.*` по пяти источникам в en и ru.
    - «on a phone the open row, on a desk the panel beside the table»: `valuesOf("src/screens/team/roster/roster.css", ".g-roster__aside", "display")` содержит `"none"`; `.g-roster__layout` `grid-template-columns` содержит `"minmax(0, 1fr) 320px"`.
    - «the player's address still draws the 2.x editor until stage 07d»: текст `src/core/router.mjs` содержит `teamRoster: ({ teamId }) => renderTeamRoster(teamId)` и `teamPlayer: ({ teamId }) => renderSavedRoster(teamId)`.
  - `test/app-boot-roster.test.mjs` (по образцу `test/app-boot.test.mjs`): тренер с `t1`, страница на `#/t/t1/roster`, ответы `/api/auth/me`, `/api/teams`, `/api/teams/t1`, `/api/teams/t1/events`, `/api/games`, `/api/season` → «the 3.0 roster is what the team's roster address draws»: `#app-view [data-screen="team-roster"]` и `table.g-rtable`; `api.assertAnswered()`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster.test.mjs test/app-boot-roster.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `index.mjs`: «The team's roster (`#/t/:id/roster`, plan 3.0, 7a): the table, a player's row that opens on a phone and the panel beside it on a desk, the skills and their rules. What a line says is model.mjs's, the markup view/panel/sheets', the writes save/taps'; this file reads, draws and lives as long as the visit. The player's own address (`#/t/:id/roster/:playerId`) still draws the 2.x editor until stage 07d, and the roster leads there for what it does not do yet.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS. Тесты, загружающие страницу на `#/t/t1/roster` (поиск: `grep -ln 't1/roster' test`), получают ответы команды и записей, если теперь рисуют 3.0-экран.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/core/router.mjs src/styles.css scripts/browser-check-roster.mjs src/i18n/en.json src/i18n/ru.json test/team-roster.test.mjs test/app-boot-roster.test.mjs
git commit -m "feat(roster): the 3.0 roster — a sortable table, a row that opens on a phone and a panel on a desk, skills with their rule" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Счётчики SPP вне матча, статус сохранения, конфликт и нет сети

**Files:**
- Modify: `src/screens/team/roster/panel.mjs` (`countersMarkup`), `view.mjs` (Callout, статус), `wire.mjs`, `index.mjs`, `memory.mjs` (`baseline`), `roster.css`, оба словаря
- Test: `test/team-roster.test.mjs`

**Interfaces:**
- Consumes: `counterSlots`, `stepRule` (Task 6); `stepSpp`, `saveState`, `onSaveState`, `takeServerTeam`, `retrySaves`, `guardUnload` (Task 7); `readRoster`; `renderActionStepper`, `wireActionSteppers` с `onRefused`, `renderStatusChip`, `renderCallout`, `renderButton`, `icon("offline")`; `toast`.
- Produces:
  - `countersMarkup(line, screen, {desk = false}) → string` (`panel.mjs`):
    - телефон — основные `MAIN_COUNTERS` двумя колонками (`renderActionStepper`, обычный вид) и ряд узких (`compact`);
    - десктоп — все плитки `compact` сеткой в три колонки, над ними «SPP · ручная правка»;
    - у каждой: `key` — счётчик, `data: {player: line.id}`, `value: line.career[c]`, `spp: slot.spp`, `decDisabled` и причины — из `stepRule`, `lockedReason` — `screen.lock`.
  - `RosterScreen` += `save: {status, waiting, refusal}`, `lock: string` (причина, по которой закрыты все счётчики: игры не прочитаны — `teamRoster.gamesLoading`, не прочитались — текст ошибки, конфликт — `teamRoster.conflict.title`; иначе `""`), `sessionSpp: number` у строки (`line.earned − memory.baseline.get(line.key)`; `baseline` пишется при первом показе строки за визит).
  - Строка SPP раскрытой строки: «SPP {earned} · manual edit» слева, справа «no changes yet» или «±N SPP» (`teamRoster.sppDelta`).
  - Над таблицей справа от заголовка:
    - `saving` — `renderStatusChip` «Saving…» (`wait`);
    - `saved` — «Saved» (`live`), пока не придёт следующий шаг;
    - `conflict` и `error` — «Not saved» (`danger`);
    - `offline` — «Waiting for the network · edits: N» (`wait`).
  - Callout в `.g-roster__notices`:
    - конфликт — `danger`, заголовок «The roster was changed on another device», строка, кнопка «Load the new one» (`data-roster-reload`) — `readRoster` → `takeServerTeam(team)`, записи заменяются, перерисовка;
    - нет сети — `warn`, заголовок «No network», строка «Edits waiting: N. They go once the connection is back. Do not close the page.»;
    - 422 — `toast(saveState().refusal, {tone: "error"})`, `readRoster` → `takeServerTeam`.
  - Тап (`wireActionSteppers` на `view`):
    - `via: "roster"` — `stepSpp(team.id, element.dataset.player, key, delta)`;
    - `{refusal}` — `toast`;
    - `onRefused` — `toast(reason)`.
  - `online` — `retrySaves(team.id)`.
  - Страж `beforeunload` ставит `trackRoster` один раз на страницу (Task 7): очередь живёт и после ухода с экрана, и закрытие вкладки спрашивает, пока шаг ждёт. Страж 2.x в `app.js` не трогается.

Словари:

| ключ | en | ru |
|---|---|---|
| `teamRoster.manual` | SPP · manual edit | SPP · ручная правка |
| `teamRoster.sppLine` | SPP {spp} · manual edit | SPP {spp} · ручная правка |
| `teamRoster.noChanges` | no changes yet | пока без действий |
| `teamRoster.sppDelta` | {delta} SPP | {delta} SPP |
| `teamRoster.gamesLoading` | Loading the matches… | Загружаем матчи… |
| `teamRoster.status.saving` | Saving… | Сохраняем… |
| `teamRoster.status.saved` | Saved | Сохранено |
| `teamRoster.status.unsaved` | Not saved | Не сохранено |
| `teamRoster.status.waiting` | Waiting for the network · edits: {count} | Ждёт сети · правок: {count} |
| `teamRoster.conflict.title` | The roster was changed on another device | Состав изменили на другом устройстве |
| `teamRoster.conflict.sub` | Your last edit was not saved: the server has a newer version. Load it and make the edit again. | Ваши последние правки не сохранились: на сервере уже есть более новая версия. Загрузите её и повторите правку. |
| `teamRoster.conflict.reload` | Load the new one | Загрузить новую |
| `teamRoster.offline.title` | No network | Нет сети |
| `teamRoster.offline.sub` | Edits waiting: {count}. They go once the connection is back. Do not close the page. | Правок ждут отправки: {count}. Сохраним, как только связь вернётся. Не закрывайте страницу. |

- [ ] **Step 1: Падающие тесты** (`test/team-roster.test.mjs`):
  - «the open row has six counters in two columns and a row of three, each with its worth; a team whose catches earn SPP has a fourth»: у Human — 6 `.g-stepper` в `.g-roster__counters` и 3 `.g-stepper--compact` в `.g-roster__extra`, подписи «TD +3» … «MVP +5»; у команды `teams/wood-elves` — 4 узких, последняя «CATCH +1».
  - «a tap on «+» writes the roster at once: the count, the row's SPP and «+3 SPP» since the screen opened change; the status says saving, then saved»: клик `[data-action-key="touchdowns"] [data-action-step="1"]` у раскрытого игрока → `PATCH` с `+1`; значение `.g-stepper__value` +1; строка SPP справа — «+3 SPP»; статус «Saving…», после ответа — «Saved».
  - «the minus stops at the stored zero though the career says more» (Review Focus 4): блоб TD 0 и неучтённая `+1 TD` вне матча → в счётчике 1, «−» `disabled`.
  - «a desk coach edits the same counters in the panel: nine tiles «SPP · manual edit»»: в `.g-roster__aside` — заголовок «SPP · manual edit» и 9 `.g-stepper--compact`; клик в панели шлёт тот же `PATCH`.
  - «another device: a red banner and «Load the new one», which reads the team and its records again; the edit is not sent again»: 409 с другими счётчиками → Callout `.g-callout--danger` с заголовком, статус «Not saved», все счётчики `aria-disabled` с причиной; клик `[data-roster-reload]` → два `GET`, значения сервера, Callout нет, новых `PATCH` нет.
  - «no network: a yellow banner with the edits waiting, the status at the heading; the browser asks before the tab closes; back online, they go»: `fail` → Callout `.g-callout--warn` «Edits waiting: 1…», статус «Waiting for the network · edits: 1»; `beforeunload` — `defaultPrevented`; ответ 200 и событие `online` → «Saved», Callout нет.
  - «a refusal names the rule, and the roster is read again»: 422 с `SPP_OUT_OF_RANGE {player: "Ann", counter: "TD"}` → `toast` с «Ann», два `GET`.
  - «while the games are unread no tap writes the roster» (Review Focus 2): `GET /api/games` держится (`hold`) → счётчики `aria-disabled` с «Loading the matches…», клик → `toast` с причиной, `PATCH` нет; ответ — счётчики открыты. Игры не прочитались — причина — текст ошибки.
- [ ] **Step 2: Убедиться, что падают** — Run: `node --test test/team-roster.test.mjs` → FAIL (новые тесты).
- [ ] **Step 3: Реализовать** по Interfaces. CSS: `.g-roster__counters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-8) }`; `.g-roster__extra { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: var(--space-8) }`; в панели — `repeat(3, minmax(0, 1fr))`; строка SPP — `400 13px/1.3 var(--font-body)`, `var(--muted)`, сумма справа — `600`, `var(--accent-text)`.
- [ ] **Step 4: Тесты** — `node --test test/team-roster.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster.test.mjs
git commit -m "feat(roster): SPP counters with −/+ outside a match — one save per tap, its status, another device and no network said" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: «Идёт подготовка» и «Идёт матч» — плашки, записи матча, «Правка вне матча», закрытая прокачка

**Files:**
- Modify: `src/screens/team/roster/view.mjs`, `panel.mjs`, `wire.mjs`, `index.mjs`, `memory.mjs` (`outside`), `roster.css`, оба словаря
- Test: `test/team-roster.test.mjs`

**Interfaces:**
- Consumes: `rosterMode`, `stepRule` (Task 6); `sendTap`, `tapsWaiting` (Task 8); `readRoster`; `loadGames`; `renderToggle`, `wireToggles`, `renderCallout`; `preMatchUrl`, `postMatchUrl`.
- Produces:
  - Callout подготовки (`mode.kind === "prep"`): `warn`, заголовок «Preparation for round {round} is on» (товарищеский — `teamRoster.prep.titleFriendly`), строка `teamRoster.prep.sub` (решение 12), `actionHtml` — ссылка `<a class="g-roster__calloutlink" href="${preMatchUrl(mode.game)}">` «To the preparation →». Счётчики пишут блоб.
  - Callout матча (`mode.kind === "match"`):
    - `accent` (с `memory.outside` — `warn`), заголовок «Match on · {match} · records: {count}» (`{match}` — «round {round}» или «friendly»), строка `teamRoster.match.sub` (с `outside` — `teamRoster.match.outsideSub`);
    - `actionHtml` — `renderToggle({key: "roster-outside", label: t("teamRoster.match.outside"), caption: t("teamRoster.match.outsideCaption", {match}), checked: memory.outside})` и ссылка «Post-match →» (`postMatchUrl(mode.game)`, `.g-roster__calloutlink`).
  - `RosterScreen` += `pending: Map<"<playerId>:<counter>", number>` (шаги в пути: значение и «−» считают их сразу, Review Focus 1), `sideLocked: string` (`refusal` `EVENT_SIDE_LOCKED` до следующего чтения записей).
  - Счётчики в матче:
    - `via` из `stepRule`; `value` — `career` + шаги в пути; `delta` — `match[c]` + шаги матча в пути;
    - `incBlockedReason` — `mvp` → `teamRoster.mvpInPost`; `locked` — `notPlaying` → `teamRoster.notPlaying`; `sideLocked` → он же, для всех тапов матча (не для правки вне матча);
    - тап: `sendTap(team.id, {pairingId: via === "match" ? mode.game.id : null, playerId, counter, delta})`.
  - Ответы `sendTap`:
    - `{event}` — запись в локальные `events`, шаг из `pending` — прочь;
    - `code === "MATCH_NOT_LIVE"` — `toast`, `loadGames(true)` и `readRoster`;
    - `"EVENT_SIDE_LOCKED"` — `toast`, `sideLocked` = текст;
    - `"EVENT_BELOW_ZERO"` и `lost` — `toast`, `readRoster`;
    - прочие — `toast`.
  - Таблица в матче: у ячеек карьеры `delta` = `match[c]` (верхний индекс «+1»).
  - Раскрытая строка: «SPP {earned} · {match} · counts at once» (`teamRoster.sppLineMatch`), справа «+{matchSpp} SPP».
  - Панель: заголовок блока «Match records · {match}» и справа «+{matchSpp} SPP in the match»; под плитками — `teamRoster.matchNote`.
  - Закрыто в матче: «Profile and advancement», «Advance», карандаш — `aria-disabled="true"` с `title` `teamRoster.afterPost`, без `href`; клик — `toast`. «Самое дешёвое» — `teamRoster.afterPost`.
  - Переключатель (`wireToggles`) — `memory.outside` и перерисовка.

Словари:

| ключ | en | ru |
|---|---|---|
| `teamRoster.prep.title` | Preparation for round {round} is on | Идёт подготовка к туру {round} |
| `teamRoster.prep.titleFriendly` | Preparation for a friendly is on | Идёт подготовка к товарищескому матчу |
| `teamRoster.prep.sub` | Any save of the roster, SPP included, resets the Roster, Inducements and Start steps. Fans and weather stay. | Любая правка состава, в том числе SPP, сбросит шаги «Состав», «Индьюсменты» и «Старт». Фанаты и погода сохранятся. |
| `teamRoster.prep.link` | To the preparation → | К подготовке → |
| `teamRoster.match.round` | round {round} | тур {round} |
| `teamRoster.match.friendly` | friendly | товарищеский |
| `teamRoster.match.title` | Match on · {match} · records: {count} | Идёт матч · {match} · записей: {count} |
| `teamRoster.match.sub` | Taps are recorded in the match: they count in the career at once and fill in the post-match. Hiring, sales, advancements and the treasury — after the post-match. | Тапы записываются в матч: сразу видны в карьере и сами подставятся в итоги. Найм, продажа, прокачка и казна — после итогов. |
| `teamRoster.match.outsideSub` | Taps change the career and do not go into the match: for an old mistake. | Тапы меняют карьеру и не попадают в матч: для исправления старых ошибок. |
| `teamRoster.match.outside` | Edit outside the match | Правка вне матча |
| `teamRoster.match.outsideCaption` | fix an old mistake without touching the {match} | исправить старую ошибку, не трогая {match} |
| `teamRoster.match.postMatch` | Post-match → | Итоги матча → |
| `teamRoster.sppLineMatch` | SPP {spp} · {match} · counts at once | SPP {spp} · {match} · в карьере сразу |
| `teamRoster.records` | Match records · {match} | Записи матча · {match} |
| `teamRoster.matchSpp` | +{spp} SPP in the match | +{spp} SPP в матче |
| `teamRoster.matchNote` | MVP — in the post-match. Advancement and sales — after it. | MVP — в итогах матча. Прокачка и продажа — после итогов. |
| `teamRoster.mvpInPost` | The MVP is picked in the post-match | MVP выбирают в итогах матча |
| `teamRoster.notPlaying` | Not playing this match | Не играет в этом матче |
| `teamRoster.afterPost` | Advancement — after the post-match | Прокачка — после итогов матча |

(Подписи действий Callout короткие и не переносятся — 05–13.)

- [ ] **Step 1: Падающие тесты** (`test/team-roster.test.mjs`; игры — фикстуры как в `test/team-overview.test.mjs`: `g2` команды `t1`, `preparationStatus: "in_progress"`, `postMatchStatus: "draft"`, тур 3):
  - «a preparation that is on: a yellow banner, the round, what any save resets, and the way to it; the counters still write the roster»: `preparationStatus: "preparing"` → `.g-callout--warn` с «Preparation for round 3 is on» и ссылкой `.g-roster__calloutlink[href="#/games/g1/pre-match"]`; клик «+» → `PATCH`.
  - «a match on: a green banner with the round and the records, the switch and the post-match; a tap is a record of the match, and the count shows «+1» for it in the table and in the counter»: Callout `accent` «Match on · round 3 · records: 0», `[role="switch"]`, ссылка `#/games/g2/post-match`; клик «+» TD → `POST /api/teams/t1/events` `{pairingId: "g2", …}`, `PATCH` нет; после 201 — `sup.g-rtable__delta` «+1» в колонке TD, `.g-stepper__delta` «+1», в заголовке Callout «records: 1».
  - «the MVP is no tap of the match: its plus says why; with the switch on it is an edit outside the match»: клик «+» MVP → `toast` «The MVP is picked in the post-match», запросов нет; переключатель → клик «+» MVP → `POST` с `pairingId: null`.
  - «a player who sits the match out takes no tap of it, and says why; with the switch on he does»: обе кнопки `aria-disabled` с «Not playing this match»; с переключателем — `POST` без пары.
  - «with the switch on a tap is an edit outside the match: no pairing, the banner turns yellow, the minus stops at the roster and the edits waiting» (Review Focus 4).
  - «advancement waits for the post-match: «Profile and advancement», «Advance» and the pencil say so»: нет `href`, `aria-disabled="true"`, `title` = «Advancement — after the post-match»; клик → `toast`.
  - «a minus right after a plus counts the plus still on its way» (Review Focus 1): `POST` держится; клик «+» TD при счётчике матча 0 → «−» открыт сразу; клик «−» → второй запрос ждёт первого; после ответов — значение как было, оба запроса по порядку.
  - «a match that ended elsewhere: the tap is refused, the screen reads the games and the records again and leaves the match mode» (Review Focus 2): 409 `MATCH_NOT_LIVE` + новые игры без идущего матча → `toast`, `GET /api/games`, `GET …/events`, Callout матча нет, следующий тап — `PATCH`.
  - «a side that saved its Players step: the refusal is said, and the match's steppers say it before the next tap; the switch still works» (Review Focus 2): 409 `EVENT_SIDE_LOCKED` → `toast`; счётчики матча `aria-disabled` с текстом `error.EVENT_SIDE_LOCKED`; с переключателем — `POST` без пары проходит.
  - «a tap whose answer was lost: the records are read again, not the tap sent again»: `fail` → `toast` `teamRoster.tapLost`, `GET …/events`, один `POST`.
  - «the switch is kept per team while the page lives»: переключатель, уход с экрана и возврат — включён; у другой команды — выключен.
- [ ] **Step 2: Убедиться, что падают** — Run: `node --test test/team-roster.test.mjs` → FAIL (новые тесты).
- [ ] **Step 3: Реализовать** по Interfaces. Callout с переключателем и ссылкой — одна `actionHtml` (`renderToggle` и `<a class="g-roster__calloutlink">`); ссылка `nowrap`, нажимаемое ≥ 44px. Цвет Callout матча — тон `accent` (зелёный), при «Правке вне матча» — `warn`, как `StatsLive` и спецификация §7.
- [ ] **Step 4: Тесты** — `node --test test/team-roster.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster.test.mjs
git commit -m "feat(roster): a preparation that is on and a match in play — the match's records, the edit outside it, advancement closed till the post-match" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: «Травма в матче…»

**Files:**
- Modify: `src/screens/team/roster/sheets.mjs` (`injurySheetMarkup`), `panel.mjs` (кнопка), `view.mjs` (подпись в строке), `wire.mjs`, `roster.css`, оба словаря
- Test: `test/team-roster.test.mjs`

**Interfaces:**
- Consumes: `INJURIES` (`src/domain/post-match/rules.mjs`), `PLAYER_STATS`; `renderOptionList`, `wireOptionLists`, `renderFilterChips`, `wireFilterChips`, `renderSheet`, `renderButton`; `sendTap` (Task 8); `line.injury` (Task 6).
- Produces:
  - `RosterScreen.sheet` += `{kind: "injury", key, choice: {code: string, stat: string}}` (открывает кнопка, `patchWithModal(view, markup, "#roster-injury")`).
  - `INJURY_SHEET = "roster-injury"`; `injurySheetMarkup({line, mode, choice}) → string`:
    - `choice = {code, stat}` — выбранное в шторке;
    - заголовок «Injury in the match», строка «#{number} {name} · {position}»;
    - `renderOptionList` из пяти кодов `INJURIES` без `none` с подписями `teamRoster.injuryCaption.*`;
    - при `lasting` — «Which characteristic» и `renderFilterChips` по `PLAYER_STATS` (`stats.*`, `chipGroup: "injury-stat"`);
    - примечание `teamRoster.injury.note`;
    - подвал: `footStartHtml` — «Remove the record» (`renderButton({kind: "danger-quiet"})`, только когда `line.injury` стоит), `footHtml` — «Record in the match» (`primary`, выключена без выбора и без характеристики у `lasting`).
  - Кнопка «Injury in the match…» (`data-roster-injury="<key>"`) — у играющих (`!line.skip`) в режиме матча, без «Правки вне матча»; в раскрытой строке и в панели.
  - Подпись строки игрока при стоящей травме — `teamRoster.injury.line` («Lasting Injury (AG) · round 3»), `alert: true`.
  - «Record in the match» — `sendTap(team.id, {pairingId: mode.game.id, playerId, counter: "injury", delta: 1, injury: {code[, stat]}})`; «Remove the record» — тот же с `delta: -1` и `injury: line.injury`. Ответ — как у тапа (Task 11), шторка закрывается после успеха и остаётся открытой с `toast` при отказе.
  - Выбор в шторке не перерисовывает радиогруппу через `innerHTML` (05–13): `patchWithModal`, фокус остаётся на карточке.

Словари:

| ключ | en | ru |
|---|---|---|
| `teamRoster.injury.open` | Injury in the match… | Травма в матче… |
| `teamRoster.injury.title` | Injury in the match | Травма в матче |
| `teamRoster.injury.who` | #{number} {name} · {position} | #{number} {name} · {position} |
| `teamRoster.injury.badly-hurt` | Badly Hurt | Badly Hurt |
| `teamRoster.injury.miss` | Seriously Hurt | Серьёзная травма |
| `teamRoster.injury.niggling` | Serious Injury | Тяжёлое повреждение |
| `teamRoster.injury.lasting` | Lasting Injury | Стойкая травма |
| `teamRoster.injury.dead` | Dead | Смерть |
| `teamRoster.injuryCaption.badly-hurt` | no lasting effect after the match | без последствий после матча |
| `teamRoster.injuryCaption.miss` | misses the next match | пропустит следующий матч |
| `teamRoster.injuryCaption.niggling` | a Niggling Injury and a missed match | Niggling Injury и пропуск |
| `teamRoster.injuryCaption.lasting` | −1 to a characteristic and a missed match | −1 к характеристике и пропуск |
| `teamRoster.injuryCaption.dead` | the player died | игрок погиб |
| `teamRoster.injury.choose` | Injury | Травма |
| `teamRoster.injury.stat` | Which characteristic | Какая характеристика |
| `teamRoster.injury.note` | It is recorded in the {match} and fills in the post-match's Players step, where the injury is applied to the roster. While the team has played fewer than 3 matches, any injury becomes Badly Hurt. | Запишется в {match} и подставится в итоги на шаг «Игроки» — там травма окончательно применяется к составу. Если у команды меньше 3 матчей, любая травма станет Badly Hurt. |
| `teamRoster.injury.record` | Record in the match | Записать в матч |
| `teamRoster.injury.remove` | Remove the record | Убрать запись |
| `teamRoster.injury.line` | {injury} · {match} | {injury} · {match} |
| `teamRoster.injury.withStat` | {injury} ({stat}) | {injury} ({stat}) |

(Русские названия травм — как в `content/Gata-ru/General Information/Casualties.md` и в глоссарии: Badly Hurt — английский.)

- [ ] **Step 1: Падающие тесты** (`test/team-roster.test.mjs`, режим матча):
  - ««Injury in the match…» opens a sheet of five injuries; a lasting one asks for the characteristic; «Record in the match» sends one injury row»: клик → `dialog#roster-injury`, 5 `.g-option[role="radio"]`, «Record in the match» `disabled`; выбор `lasting` → чипы MA…AR, кнопка выключена до выбора `ag`; клик → `POST` `{pairingId: "g2", counter: "injury", delta: 1, injury: {code: "lasting", stat: "ag"}}`; после 201 — шторка закрыта, фокус на кнопке, подпись строки «Lasting Injury (AG) · round 3» с `.g-rtable__sub--alert`.
  - «a standing injury can be taken back by its own −1»: у игрока стоит `miss` → в шторке «Remove the record» → `POST` `{counter: "injury", delta: -1, injury: {code: "miss"}}`.
  - «the choice keeps the focus on the card it moved to»: стрелка вниз по группе → `document.activeElement` — следующая карточка, `aria-checked="true"`, та же нода после перерисовки.
  - «a refused record says why and the sheet stays open»: 409 `EVENT_SIDE_LOCKED` → `toast`, `dialog#roster-injury` открыт.
  - «no injury for a player who sits the match out, nor with the switch on»: кнопки нет.
  - «every injury the table knows has its words in both languages»: перебор `INJURIES` без `none` — `teamRoster.injury.<code>` и `teamRoster.injuryCaption.<code>` в en и ru.
- [ ] **Step 2: Убедиться, что падают** — Run: `node --test test/team-roster.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — `node --test test/team-roster.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster.test.mjs
git commit -m "feat(roster): an injury in the match — recorded for the post-match's Players step, and taken back by its own record" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ссылки на навыки и правила 2.x — через `pageForName`

Передача этапа 11 → 07a (спека 3.0 §7, «Отложено после этапа 11»): одно правило «имя → страница» для ссылок в составах 2.x и для справочника.

**Files:**
- Modify: `src/components/content-links.mjs`
- Create: `test/content-links.test.mjs`

**Interfaces:**
- Consumes: `pageForName(data, name)` (`src/screens/ref/catalog.mjs`); `canonicalLeagueName`, `canonicalSpecialRuleName` (`team-rules.mjs`); `state.data`.
- Produces (сигнатуры экспортов не меняются):
  - `pageForSkillTableEntry(title)` = `pageForName(state.data, title)`;
  - `pageForRuleEntry(title)`: лига — страница Leagues, особое правило — Special Rules (как было), иначе `pageForName(state.data, title)`.
  - Комментарий «The two name-to-page rules below stay in this file; their convergence … is stage 07a's» — заменить на «A name finds its page by the reference's one rule (`pageForName`, screens/ref/catalog.mjs); a league and a special rule are sections of their own pages.»

- [ ] **Step 1: Падающий тест** — `test/content-links.test.mjs` (`state.data` = `expandCollections(public/data.en.json)`, разбор — `mount` из `helpers/ui.mjs`):
  - «a roster's skill links to the page the reference finds, whatever the spelling»: `renderRosterLinks(["Bone Head", "Loner (4+)", "Mighty Blow (+1)", "Animosity (All)", "No Such Skill"])` → `href` первых четырёх = `pageUrl(pageForName(data, name))` (`#/traits/bonehead`, `#/traits/loner-x`, `#/skills/mighty-blow-1`, страница Animosity (X)); пятый — `span`, не ссылка.
  - «a team's rule: a league leads to Leagues, a special rule to Special Rules, any other name to the page it stands for»: `renderRuleLinks(["Old World Classic", "Brawlin' Brutes", "Bone Head"])` → `#/leagues`, страница Special Rules, `#/traits/bonehead`.
  - «a name is text»: `HOSTILE` → `span` с текстом.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/content-links.test.mjs` → FAIL (`Bone Head` и `Animosity (All)` без ссылки или не туда).
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — `node --test test/content-links.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/content-links.mjs test/content-links.test.mjs
git commit -m "refactor(links): a roster's skills and a team's rules find their page by the reference's one rule" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Mock API для снимков этапа

В mock нет записей матча, `PATCH` знает только `t1`, нет подготовки и обрыва связи (передача 06 → 07: «PATCH любой команды в mock»). Без этого не снять режимы, конфликт и «нет сети».

**Files:**
- Create: `scripts/mock/roster.mjs`
- Modify: `scripts/mock-api.mjs` (шапка — новые ответы; подключение `answerRoster` в `answerApi` раньше `answerTeams`; ветка `PATCH` `t1` уходит в новый модуль; `t2` получает людей; игра `g7`; обрыв соединения в обработчике). Файл остаётся ≤ 600 строк.

**Interfaces (ответы mock):**
- `answerRoster(request, pathname, {teams, games, readBody, reply, refuse}) → Promise<answer|null>` (`scripts/mock/roster.mjs`); ответ `{drop: true}` значит «соединение оборвано»: обработчик сервера делает `request.socket.destroy()`.
- `PATCH /api/teams/:id` — любая команда тренера:
  - `body.revision !== team.revision` → 409 `{...errorPayload("TEAM_SAVED_ELSEWHERE"), team}`;
  - иначе `name`, `baseTeamSlug`, `logoData`, `roster`, `revision + 1`, `updatedAt` → `{team}`;
  - сохранения `t1`, как раньше, — в `.codex_tmp/mock-saves.json` (`browser-check-roster.mjs`);
  - у `t3` каждый `PATCH` обрывается (`{drop: true}`) — «нет сети».
- `GET /api/teams/:id/events` → `{events: <неучтённые этой команды>, revision}`.
- `POST /api/teams/:id/events` — как сервер в том, что рисует экран:
  - тело: `counter` из `EVENT_COUNTERS` (импорт из `src/domain/post-match/events.mjs`); `mvps` с `pairingId` и `injury` без него → 400 `FIELD_INVALID {field: "counter"}`;
  - идущий матч команды: игра с `preparationStatus: "in_progress"` и итогами не `completed` — правило `isMatchLive`, повторённое в mock (`src/shell/current-match.mjs` тянет за собой DOM и словари); у `t2` это `g2`; `pairingId` не он или идущего нет → 409 `MATCH_NOT_LIVE`;
  - игрок — из ростера; тап матча по игроку с `skipNextGame` → 422 `POST_PLAYER`;
  - −1 при нуле (матч — сумма строк матча; вне матча — блоб + ждущие правки) → 409 `EVENT_BELOW_ZERO`;
  - иначе 201 `{event}`: `id` `e<n>`, `pairingId`, `playerId`, `counter`, `delta`, `injury`, `settledAt: null`, `createdAt`.
- `t2` Mock Humans — семь игроков `teams/human`:

  | id | позиция (строка) | особенность |
  |---|---|---|
  | `q1` | Lineman (0) | — |
  | `q2` | Lineman (0) | `skipNextGame` |
  | `q3` | Lineman (0) | `spp: {casualties: 1}` |
  | `q4` | Blitzer (3) | капитан, `extraSkills: [{name: "Mighty Blow", access: "primary"}]`, `spp: {touchdowns: 3, mvps: 1}`, одна прокачка `primary` |
  | `q5` | Catcher (2) | `statMods: {ag: 1}`, `spp: {touchdowns: 2, completions: 1}` |
  | `q6` | Thrower (1) | `spp: {completions: 4}` |
  | `q7` | Ogre (5) | — |

  - записи на старте: в `g2` — `q4` TD +1, `q5` COMP +1, `q6` травма `{code: "lasting", stat: "ag"}` +1; вне матча, ждущая, — `q5` INT +1;
  - лидеры обзора 06 у `t2` меняются — это не поломка.
- `g7` — товарищеский `t5` против `rt1`: `kind: "friendly"`, `season: null`, `roundNumber: 0`, `preparationStatus: "preparing"`, результат не подан — режим «идёт подготовка» у `t5`.

- [ ] **Step 1: Реализовать** по Interfaces.
- [ ] **Step 2: Проверить ответы**

```bash
MOCK_PORT=5171 node scripts/mock-api.mjs & MOCK=$!; sleep 1
curl -s localhost:5171/api/teams/t2/events | grep -o '"revision":1'                                                                   # "revision":1
curl -s localhost:5171/api/teams/t2/events | grep -o '"counter":"[a-z]*"' | tr '\n' ' '; echo                                          # touchdowns completions injury interceptions
curl -s -X POST localhost:5171/api/teams/t2/events -d '{"pairingId":"g2","playerId":"q4","counter":"touchdowns","delta":1}' | grep -o '"pairingId":"g2"'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5171/api/teams/t2/events -d '{"pairingId":"g2","playerId":"q4","counter":"mvps","delta":1}'      # 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5171/api/teams/t2/events -d '{"pairingId":"g2","playerId":"q2","counter":"touchdowns","delta":1}' # 422
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5171/api/teams/t2/events -d '{"pairingId":"g2","playerId":"q1","counter":"touchdowns","delta":-1}' # 409
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5171/api/teams/t1/events -d '{"pairingId":"g1","playerId":"p1","counter":"touchdowns","delta":1}' # 409
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH localhost:5171/api/teams/t2 -d '{"name":"Mock Humans","baseTeamSlug":"teams/human","roster":{},"revision":7}' # 409
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH localhost:5171/api/teams/t3 -d '{}'; echo "curl exit $?"                                                 # 000, curl exit 52
curl -s localhost:5171/api/games | grep -o '"id":"g7"'                                                                                  # "id":"g7"
kill $MOCK
npm run check
```

Expected: значения в комментариях; `check` проходит (`mock-api.mjs` ≤ 600 строк, у новых функций есть пользователи).

- [ ] **Step 3: Commit**

```bash
git add scripts/mock-api.mjs scripts/mock/roster.mjs
git commit -m "chore(mock): records of a live match, a save of any team with its revision, a dropped save, a preparation that is on" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Полоса казны этапа 08 над составом на десктопе (поздняя задача)

Договор с 08: 08 экспортирует `renderTreasuryStrip({team}) → string` и `wireTreasuryStrip(root) → () => void` из `src/screens/team/manage/strip.mjs`. Задача идёт **после** ребейза на `redesign` с влитым 08.

**Files:**
- Modify: `src/screens/team/roster/view.mjs`, `index.mjs` (или `wire.mjs`), `roster.css`
- Test: `test/team-roster.test.mjs`

- [ ] **Step 1 (контроллер): 08 влит?**

```bash
git fetch origin
git log --oneline origin/redesign | grep -m1 -i "rd/08" || echo "08 not merged"
```

- **08 не влит** — Task 15 не исполняется: контроллер записывает её в «Передачу → 07b» (этот план и тело PR) и переходит к Task 16.
- **08 влит** — `git rebase origin/redesign`. Конфликты — объединение:
  - в `src/i18n/*.json`, `src/styles.css`, `src/core/router.mjs`, `src/ui/icons.mjs`, `scripts/mock-api.mjs` — оба набора строк;
  - в `src/ui/status-chip.*` и `action-stepper.*` — оба изменения.
- Затем `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.

- [ ] **Step 2: Свериться с модулем 08.** Прочитать шапку `src/screens/team/manage/strip.mjs`: экспорты с сигнатурами договора; что такое `team` (команда, как `GET` её отдаёт); как полоса сообщает о своей записи (казна, ресурсы двигают ревизию команды). Сигнатуры другие или сообщения о записи нет — стоп, вопрос контроллеру: без него следующий `PATCH` состава после правки казны получит 409.

- [ ] **Step 3: Падающие тесты** (`test/team-roster.test.mjs`):
  - «a desk roster has the treasury strip over the table; a phone has none, the Team tab is its place»: первый элемент разметки `renderTreasuryStrip({team})` — внутри `.g-roster__strip`, между `.g-roster__notices` и `.g-roster__layout`; `valuesOf("src/screens/team/roster/roster.css", ".g-roster__strip", "display")` содержит `"none"`.
  - «a change the strip writes reaches the roster's next save»: запись полосы (тем путём, каким 08 о ней сообщает) → `readRoster` → следующий тап — `PATCH` с ревизией после записи полосы.

- [ ] **Step 4: Реализовать.**
  - `rosterMarkup` рисует `<div class="g-roster__strip">${renderTreasuryStrip({team: screen.team})}</div>`.
  - `wireTreasuryStrip(view)` — на визит, снимающий — в `onScreenLeave`.
  - На сообщение полосы о записи — `readRoster` → `takeServerTeam`, перерисовка.
  - CSS: до 900px `.g-roster__strip { display: none }`, от 901px — `margin-bottom: var(--space-16)`.

- [ ] **Step 5: Тесты** — `node --test test/team-roster.test.mjs` → PASS; `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/team/roster test/team-roster.test.mjs
git commit -m "feat(roster): stage 08's treasury strip over the desk roster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Снимки этапа (контроллер)

Протокол этапа, шаг 6: каждый экран этапа на 390 и 1440, светлая и одна тёмная палитра, все состояния `SCREENS.md` этапа, выборочно 768 и 1024. Файлы — в `output/screens/rd-07a/` (не коммитятся), в PR — загрузкой.

**Files:**
- Create: `docs/redesign/screens/rd-07a.json`

- [ ] **Step 1: Серверы.**
  - Порты свободны: `lsof -iTCP:3071 -iTCP:5171 -sTCP:LISTEN || echo free`.
  - Mock в фоне: `MOCK_PORT=5171 node scripts/mock-api.mjs`.
  - Реальный сервер — рецепт С (3071 над `gata_smoke_07a`, `preview:seed`).
  - Mock хранит записи и сохранения в памяти: состояния, которые что-то пишут (R11, R12), идут последними; после них mock перезапускается.

- [ ] **Step 2: `rd-07a.json`.**
  - Как `rd-06.json`: `widths` `[390, 1440]`, те же `heights`, варианты `light` / `dark` (`grass` / `night`, `gata-league-locale` = `en`).
  - Состояния тренера — со `storage` `{"gata-league-auth-token": "mock"}`; нажатия — `.click()` в `run`, без `?.`; длинные — `fullPage: true`.
  - Клик по игроку — по кнопке строки (`document.querySelector('[data-row-key^="q4#"]').click()`).
  - Клик по счётчику — внутри видимой на этой ширине копии: `.g-rtable__panelrow` до 900, `.g-roster__aside` от 901.

| id | сервер | адрес | действие | ширины | что проверяет |
|---|---|---|---|---|---|
| R1 | 5171 | `#/t/t1/roster` | — | + 768, 901, 1024 | «Состав» (`Stats`, `DeskRoster`): таблица, первый игрок в панели, «SPP · ручная правка» (вопрос 2), колонки карьеры; рамка таблицы прокручивается на 901–1024 |
| R2 | 5171 | `#/t/t1/roster` | клик по `p3` | 390, `fullPage` | «Состав · игрок раскрыт» (`Stats`) |
| R3 | 5171 | `#/t/t1/roster` | клик по `p3`, `scrollTo(0, 420)` | 390 | «Шапка при прокрутке» (`StatsScrolled`) |
| R4 | 5171 | `#/t/t2/roster` | клик по видимому чипу `Mighty Blow` | | «Подсказка о навыке» (`StatsSkill`) |
| R5 | 5171 | `#/t/t5/roster` | клик по первому игроку | | «Идёт подготовка» (`StatsPrep`, `DeskRosterPrep`) |
| R6 | 5171 | `#/t/t2/roster` | клик по `q4` | + 768, 1024 | «Идёт матч · записи» (`StatsLive`, `DeskRosterLive`): «+1» в таблице и счётчиках, MVP закрыт, подпись травмы `q6` |
| R7 | 5171 | `#/t/t2/roster` | клик по `q4`, `[data-toggle-key="roster-outside"]` | | «Правка вне матча» включена: плашка жёлтая |
| R8 | 5171 | `#/t/t2/roster` | клик по `q4`, `[data-roster-injury^="q4#"]`, карточка `lasting`, чип `ag` | | «Травма в матче» (`StatsLiveInjury`) |
| R9 | 5171 | `#/t/t2/roster` | `ru`, клик по `q4` | 390 | кириллица режима матча |
| R10 | 5171 | `#/t/t1/roster` | клик `[data-sort-key="ag"]` | 1440 | сортировка, `aria-sort`, стрелка |
| R11 | 5171 | `#/t/t3/roster` | клик по первому игроку, «+» TD | | «Нет сети» (`SaveOffline`): плашка, «Ждёт сети · правок: 1» |
| R12 | 5171 | `#/t/t1/roster` | `run`: `const {team} = await (await fetch('/api/teams/t1')).json(); await fetch('/api/teams/t1', {method: 'PATCH', body: JSON.stringify(team)});`, затем клик по первому игроку, «+» TD | | «Конфликт сохранения» (`SaveConflict`, `DeskSaveConflict`) — последним |
| G1 | 3071 | `#/t/x/roster` | — | 390 | гость идёт ко входу |

Если Task 15 сделана — у R1, R5, R6 на 1440 над таблицей полоса казны 08.

- [ ] **Step 3: Снять**

```bash
npm run screens -- docs/redesign/screens/rd-07a.json --out output/screens/rd-07a
```

Expected: `… PNG(s) written …, 0 not taken`; ошибки браузера — в `errors.json` (ожидаемые: 409 в R12, обрыв в R11).

- [ ] **Step 4: Сверка с прототипами** (`output/screens/rd-07a/index.html` рядом с прототипами из `SCREENS.md`).
  - Поломка — это:
    - текст ниже 4.5:1, перенос подписи, плашки или числа;
    - горизонтальная прокрутка страницы на 390 (прокрутка внутри рамки таблицы от 901 — не поломка), нажимаемое меньше 44px;
    - шрифт без кириллицы, ошибка в консоли сверх ожидаемых;
    - неработающее действие, состояние не того экрана;
    - два `h1`.
  - Не поломка: отличия данных mock от демо-данных и решения 4, 6, 8, 12, 15, 19, 20.
  - Исправление: минимальное, с тестом, где его можно написать; полный прогон `npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check`; пересъёмка `--only <ids>`; отдельный коммит `fix(roster): <что> on <экран>` с трейлером.

- [ ] **Step 5: Реальный сервер вручную** (встроенный браузер, 3071; тестовые значения — из `scripts/seed-pre-match-preview.mjs`, база — `gata_smoke_07a`):
  - войти тренером `preview-home`; открыть подготовку из вывода `preview:seed` (`#/games/<id>/pre-match`): чтение подготовки записывает её статус в пару;
  - открыть состав его команды — плашка «Идёт подготовка»;
  - «+» TD и «+» MVP у одного игрока — оба `PATCH` 200 (вкладка «Сеть»);
  - в базе: `. output/07a/env.sh && psql "$SMOKE_URL" -Atc "SELECT counter, delta, settled_at IS NOT NULL FROM match_events WHERE pairing_id IS NULL ORDER BY created_at DESC LIMIT 2"` → `mvps|1|t` и `touchdowns|1|t` (строки истории, решение 25);
  - выйти.

  Что увидено и вывод `psql` — в `output/07a/real-server.txt` для PR.

- [ ] **Step 6: Commit**

```bash
git add docs/redesign/screens/rd-07a.json
git commit -m "test(screens): stage 07a states — the roster, a row open, the panel, a preparation, a match, an injury, another device, no network" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Финальное ревью, правки спек, рецепт М и проверки перед PR (контроллер)

- [ ] **Step 1: Финальное ревью ветки** — шаг 7 протокола (skill requesting-code-review). Исправления — отдельными коммитами; правка `016` ещё возможна (до шага 3).

- [ ] **Step 2: Правки спек под решения этапа** (PR-CHECKLIST: «Если реализация разошлась со спецификацией — спецификация поправлена в том же PR»):
  - **Спека 3.0:**
    - §2, таблица «До своего этапа»: `#/t/:teamId/roster` — «Состав» 3.0 (этап 07a); `#/t/:teamId/roster/:playerId` — редактор 2.x до 07d, «Состав» ведёт туда за тем, чего ещё не делает (решение 1; строку `#/t/:teamId/team` правит 08);
    - §3, вступление: «Восемь миграций (009–016)»;
    - §3.7:
      - в SQL `014` — сноска, что `016_match_event_mvps.sql` добавляет `'mvps'` в `CHECK`;
      - пункт про MVP — решение 25: тап матча MVP не несёт, правка вне матча — несёт;
      - в «Истории игрока» из исключений «блоб меняется без строки» убрать «MVP, правленный руками»;
    - §4: строка `POST …/events` — «`mvps` — только без `pairingId`»; строка `…/history` — «`outside` — по ключу на счётчик правки, MVP тоже»;
    - §6: «Состав · список, SPP, …» и «Состав во время подготовки и матча» → `screens/team/roster/*`, `ui/roster-table`, `ui/number-badge`; что уходит — в конце серии 07;
    - §7: блок «Расхождения этапа 07a» (прав код):
      - AR вместо AV;
      - таблица — `<table>`, а не сетка README;
      - нижняя шапка вместо липкой верхней;
      - CATCH у Passing Virtuosos;
      - плашка подготовки — любая правка, SPP тоже;
      - русские названия травм по контенту;
      - строка подсчётов без форм множественного числа;
      - нет «Что изменилось» (по ответу на вопрос 4);
      - счётчики в десктопной панели вне матча (по ответу на вопрос 2);
      - знак категории не в шапке шторки навыка;
      - рамка таблицы прокручивается на 901–1279;
      - README RosterTable и ActionStepper («CP, DEF, MVP 4») старше 0.9.1 — пакет удаляет этап 13.
  - **Спецификация интерфейса:** §6, §7, §8 как построено (решения 4–22); «Известные расхождения» — те же пункты.
  - **Спека выката:** §4.2, п. 3.4 и §6.3, шаг T+10: «009–015» → «009–016».
  - **Мастер-план, фаза X:** T+10 — `pending: 009_…, …, 016_…`; T+15 — `schema_migrations (+8)`.

```bash
git add docs/superpowers/specs/2026-10-14-redesign-design.md docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md docs/superpowers/specs/2026-10-14-redesign-rollout-design.md docs/superpowers/plans/2026-10-14-redesign-rollout.md
git commit -m "docs(spec): stage 07a — the roster as built, the MVP an edit's counter (016), the runbook's eight migrations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Рецепт М** — `npm run db:migrate && npm run db:migrate -- --check` → `applied 016_match_event_mvps.sql`, `database is up to date`. С этого шага `016` не правится (стоп-условие).

- [ ] **Step 4: Шаг 8 протокола**

```bash
npm run build && . output/07a/env.sh && npm test && npm run check && npm run i18n:check
APP_URL=http://localhost:3071 npm run smoke
. output/07a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3071 npm run smoke:post-match
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
print("outside the stage's spaces:", [key for key in new if not key.startswith(("teamRoster.", "ui.badge.", "ui.stat.", "ui.stepper."))])
PY
shasum -a 256 server/db/migrations/*.sql   # 009–015 — как в отчёте M1; 016 — в тело PR
git diff --stat origin/redesign -- content/   # пусто
```

Expected:
- всё зелёное; одинаковое число страниц EN/RU, 0 fallback; `smoke` и `smoke:post-match` — `passed`;
- `i18n keys unique`; `missing in ru: []`; вне пространств этапа — `[]` (после ребейза на 08 — с ключами 08 в `origin/redesign` это по-прежнему `[]`);
- чек-суммы 009–015 совпадают с `docs/redesign/reports/M1.md`;
- `content/` без изменений; бюджеты не выросли (`src/app.js` ≤ 120, `scripts/mock-api.mjs` ≤ 600).

- [ ] **Step 5: `PR-CHECKLIST.md` целиком** — особенно:
  - «Миграции применяются на чистой и на рабочей копии БД; применённые файлы не правились» (рецепты Т, Р, М);
  - «Новые коды ошибок — в `API_ERRORS`» (новых нет);
  - «Перенесённый экран удалил свой старый CSS и модуль» — нет: редактор 2.x рисует `teamPlayer` и `adminTeamEdit` (решение 1, договор с 08), сказать в PR;
  - «Старые маршруты ведут на новые» (`#/my-teams/:id` → `#/t/:id/roster`, тест `routes`);
  - снимки 390 и 1440, 768 и 1024.

---

### Task 18: PR и после слияния (контроллер)

- [ ] **Step 1: Ребейз.** Если с Task 15 в `redesign` что-то влито (08, правка `main`): `git fetch origin && git rebase origin/redesign`, конфликты — объединение (Task 15, шаг 1), затем Task 17, шаг 4 заново.

- [ ] **Step 2: Тело PR** (`<scratchpad>/pr-rd-07a.md`):
  - пункт 7a плана 3.0 — все четыре подпункта; дополнения мастер-плана к 07a: `016`, StatStrip, fake-dom, API записей;
  - «Решения этого плана» коротко и ответы владельца на пять вопросов (или «по умолчанию»);
  - таблица «Маршруты этапа 07a» и что осталось 2.x (решение 1);
  - миграция `016`:
    - зачем;
    - рецепты Т, Р (`output/07a/rehearsal-016.txt`) и М;
    - чек-сумма `016`;
  - вывод Task 17, шаг 4, и ручная проверка реального сервера (`output/07a/real-server.txt`);
  - снимки R1–R12, G1 (загрузкой);
  - расхождения макета с кодом и как решены (Task 17, шаг 2, §7);
  - что не сделано и почему:
    - `renderRosterStatGrid` (`hire-panel.mjs`) и мёртвый `CREATE_MODE` (R10 этапа 06) — файлы 2.x по договору с 08 → 07c;
    - Task 15 → 07b, если 08 не влит;
  - правки спек;
  - строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin rd/07a-roster-table
gh pr create --base redesign --head rd/07a-roster-table --title "rd/07a: the roster — table, sorting, SPP counters, a match in play; 016 puts the MVP in the history" --body-file <scratchpad>/pr-rd-07a.md
gh pr merge <номер> --merge
```

После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **Step 3: После слияния** (шаг 10 протокола):
  - в плане 3.0 пункт 7a → `[x]`; строка «07a–07e» мастер-плана остаётся `[ ]` до 07e;
  - коммит `docs(plan): stage 07a done` в следующей ветке или прямым коммитом в `redesign`;
  - `git worktree remove ../bb-rd-07a`; базы `gata_seed_07a` и `gata_smoke_07a` — `dropdb`.

---

## Передача следующим этапам

- **07b · пропуски и павшие.**
  - «Пропуск матча…»:
    - в раскрытой строке — в ряд действий `.g-roster__actions` под «Профиль и прокачка», парой с «Продать» 07c;
    - в панели — там же, где «Травма в матче…» в режиме матча;
    - в матче его место занимает «Травма в матче…».
  - Секции «Пропускают матч» и «Погибшие» — вторым и третьим `renderRosterTable` под первым (тот же компонент, свой `label`). Подпись пропускающего уже есть (`teamRoster.skip`).
  - Полоса казны 08 (Task 15), если 08 не был влит к её сроку.
- **07c · найм и продажа.**
  - «+» найма — в `headLeadHtml` RosterTable (вторая шапка снизу его не рисует).
  - «Продать» — рядом с «Пропуском матча…»; в матче закрыты оба (как «Прокачка — после итогов матча»).
  - Передачи 11 и 06, которые 07a не смог взять по договору с 08: экспорт `renderRosterStatGrid` с одним пользователем (`src/components/roster-editor/hire-panel.mjs`) и мёртвый режим создания (`CREATE_MODE`, ветки бюджета и лимитов в `hire-panel`, `staff-control`, `matchday-layout`, ключи `builder.selectedHeader` / `builder.remaining`, комментарии «оба редактора») — уходят вместе с файлами 2.x.
- **07d · профиль, редактирование, прокачка.**
  - `teamPlayer` переезжает: телефон — профиль; десктоп — состав с игроком в панели. Выбор из `memory.mjs` становится адресом.
  - «Профиль и прокачка», «Прокачать» и карандаш уже ведут на `teamPlayerUrl`; в матче закрыты.
  - Шторка навыка может взять `skillDetailMarkup` справочника.
  - `renderPlayerBadge({large: true})` готов для профиля; категорийный NumberBadge — справочнику вместо `g-ref-badge`.
  - `line.ready` / `line.cheapest` модели — для «Доступна прокачка» обзора (передача 06).
- **07e · карьера по матчам.**
  - `GET …/players/:pid/history`: `outside.mvps` теперь есть, ручной MVP — строкой «Правки вне матча».
  - Лидеры обзора 06 — на `careerCounters` (передача 06), как показывает «Состав».
  - Удалить в конце серии: `saved-roster.mjs`, `components/roster-editor/*`, `roster-editor-shared.mjs`, `roster-notices.mjs`, `team-delete.mjs` (если `#/teams` его не держит), `styles/roster.css`, `styles/matchday.css`, `state.savedRosterUi`, `scripts/browser-check-roster.mjs`, импорт `rosterStore` и страж `beforeunload` в `app.js`, запись `saved-roster.mjs` в `check-budgets.json`.
- **08 · казна.**
  - Полоса над составом — Task 15 (или 07b).
  - После своей записи полоса должна сообщать о ней: «Состав» перечитывает команду, иначе его следующий `PATCH` получит 409.
- **09a · матчи.**
  - «Записи матча» карточки и табло ведут в «Состав» (`matchActions` → `teamUrl(id, "roster")`): режим матча там готов.
  - Journeymen и звёзды в составе во время матча — вопрос владельцу 5.
  - Сервер принимает `PATCH` состава во время матча и ломает этим `finishPost` позже (`POST_TEAM_CHANGED`). «Состав» его не шлёт (решение 18), а редактор 2.x на `teamPlayer` и админка — шлют. Отказ на сервере — решить в 09a.
- **09b · итоги.** Итоги не читают и не пишут строк MVP (`MATCH_COUNTERS`); «Счёт из записей» считает только счётчики матча.
- **12 · админка.**
  - `adminTeamEdit` — редактор 2.x.
  - «Состав» 3.0 в режиме админа потребует админских маршрутов записей (спека: казну, гибель и записи админ меняет админским `PATCH`).
- **13 · зачистка.**
  - Липкая верхняя шапка таблицы — если шапка оболочки перестанет быть липкой.
  - Поиск в полосе «Состава».
  - Слот перед заголовком шторки — для знака категории навыка.
  - README RosterTable (сетка кнопок) и ActionStepper (CP, DEF, MVP 4) — пакет удаляется.
  - Глоссарий: «Активный состав», «Записи матча», «Правка вне матча», «Ручная правка», сокращения TTM, Призем., Бонус.
- **Любой этап.**
  - `src/ui/roster-table` (настоящий `<table>`, `aria-sort`, раскрываемая строка, нижняя шапка), `number-badge`, `ActionStepper` (`compact`, `decDisabled`, `lockedReason`, прирост словами), StatStrip (`lowered`), `StatusChip` (`danger`).
  - `positionKind` — в домене.
  - fake-dom ловит `<p><div>` и `<table><tr>`.

## Охват

| Пункт | Задача |
|---|---|
| План 3.0, 7a: таблица, сортировка; раскрываемая строка (М) и правая панель (Д) | 5, 6, 9 (решения 2–5, 20–22) |
| План 3.0, 7a: чипы навыков с правилом; вторая шапка снизу без «+» | 5, 9 (решения 3, 6, 15) |
| План 3.0, 7a: счётчики TD, CAS, COMP, KO, INT, MVP и ряд TTM, приземление, бонус, все с −/+ | 4, 6, 10 (решения 8–11) |
| План 3.0, 7a: «идёт подготовка» (предупреждение) | 6, 11 (решение 12) |
| План 3.0, 7a: «идёт матч» — записи, «Правка вне матча», «Травма в матче», закрытые найм, продажа, прокачка, казна | 8, 11, 12 (решения 13, 14; найм, продажу и казну 07a не рисует) |
| Мастер-план 07a: миграция `016`, `mvps` в `match_events` и `EVENT_COUNTERS`, правка MVP пишет учтённую запись, история показывает | 1, 2 (решения 24, 25); карьера на экране — 07e |
| Мастер-план 07a: полная дисциплина миграций — рецепт Т → репетиция на засеянном дампе → dev-база | 1 (Т, Р), 17 (М) |
| Мастер-план 07a: StatStrip — улучшенное не только цветом | 4 (решение 7), 5, 9 |
| Мастер-план 07a: fake-dom — `<p><div>` и `<table><tr>` без `<tbody>` до RosterTable | 3 |
| Мастер-план 07a: тапы и «Правка вне матча» — `POST …/events`; `EVENT_SIDE_LOCKED` («измените на шаге «Игроки»»), `EVENT_BELOW_ZERO` (−1 на нуле не предлагать), `SPP_OUT_OF_RANGE`, `DUPLICATE_PLAYER_ID` с игроком и подписью | 6 (`stepRule`), 7, 8, 10, 11 |
| Мастер-план 07a: `revision` записей сверять с блобом | 7 (`readRoster`, решение 17) |
| Мастер-план 07a: редактор сохраняет SPP блоба из `GET`, не `careerCounters`; ждущие показывает сверху; во время матча не опускает SPP ниже ждущих правок | 7, 10 (решения 9, 10); во время матча «Состав» блоб не пишет вовсе (18) |
| Мастер-план 07b–07e (пропуски, павшие, найм, продажа, профиль, прокачка, карьера, `careerCounters` как предпросмотр) | не 07a — «Передача» |
| 05–13: отказ степпера (`onRefused`) | 4, 10, 11 |
| 05–13: Sheet — фокус на открывшего после перерисовки, `pointerdown`, блокировка прокрутки | 9 (шторка навыка), 12 (травма); `wireSheets` и `sheet.css` — этапы 05–06 |
| 05–13: радиогруппы не перерисовывать `innerHTML` | 12 |
| 05–13: Callout — короткие подписи действий | 10, 11 |
| 05–13: проверка словаря видит только `t("…")` — шаблонные ключи перебирать | 9 (`counter`, `counterName`, `source`), 12 (`injury`, `injuryCaption`) |
| 05–13 / заметка 04: «4+1» — прирост словами | 4 (`ui.stepper.thisMatch`) |
| 05–13: тесты `legacy-screens` уходят с CSS; литералы 2.x | не 07a: CSS 2.x состава живёт до конца серии (решение 1) |
| Передача 06: лидеры → `careerCounters`; «Доступна прокачка» | 07e, 07d («Передача») |
| Передача 06: `team-delete.mjs` — «Состав» удаления не рисует | 9 (нет удаления); удаление модуля — 07e |
| Передача 06: мёртвый `CREATE_MODE`, устаревшие комментарии | 07c — файлы 2.x по договору с 08 |
| Передача 06: mock `PATCH` только `t1` | 14 |
| Передача 06: степперы с `onRefused` | 10, 11 |
| Передача 11: `renderRosterStatGrid` | 07c (договор с 08) |
| Передача 11: `pageForSkillTableEntry` / `pageForRuleEntry` → `pageForName`; ссылки навыков через `nameMatchesTitle` | 13; 9 (шторка навыка — `pageForName`) |
| Спека 3.0 §0.8: блоб не переписывается | 7 (тот же `PATCH` 2.x, только SPP) |
| Спека 3.0 §0.9, §0.11: записи матча; во время матча состав закрыт, кроме счётчиков и травмы | 8, 11, 12 |
| Спека 3.0 §0.13, спека выката §5.1: миграции только добавляют | 1 (решение 24) |
| Спека 3.0 §2: маршруты `#/t/:id/roster[/:playerId]`, редиректы | 9; «Маршруты этапа 07a» |
| Спека 3.0 §3.7: карьера = блоб + неучтённые; границы правки; правка вне матча | 6, 7, 8 |
| Спека 3.0 §4: `GET/POST …/events`, `…/history` (`outside`) | 2, 7, 8 |
| Спека 3.0 §5: ограничения фронтенда, `src/ui` | Global Constraints; 4, 5 |
| Спека 3.0 §6: строки «Состав» | 9; правка §6 — 17 |
| Спецификация интерфейса §6, §7, §8 | 9–12; снимки 16 |
| SCREENS.md: «Состав · Список и счётчик SPP» (`Stats`, `StatsScrolled`, `StatsSkill`, `DeskRoster`) | 9, 10; R1–R4, R10 |
| SCREENS.md: «Состав · Во время подготовки и матча» (`StatsPrep`, `StatsLive`, `StatsLiveInjury`, `DeskRosterPrep`, `DeskRosterLive`) | 11, 12; R5–R9 |
| SCREENS.md: «Состав · Сохранение: конфликт и нет сети» (`SaveConflict`, `SaveOffline`, `DeskSaveConflict`) | 7, 10; R11, R12 |
| Договор с 08: владение, порядок слияния, полоса казны, общие файлы, серверы | Global Constraints; 15; 18 |
| Протокол: шаги 6–10 | 16, 17, 18 |
| Правила проекта: бюджеты, `check-references`, CSP, `escapeHtml`, 900/901, 44px, явная типографика, `content/` не меняется | Global Constraints; 17 |

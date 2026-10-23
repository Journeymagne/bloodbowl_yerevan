# Этап 09b · Итоги матча по шагам, павшие из итогов, `rehearsal:transitions` — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** итоги матча `#/games/:id/post-match[/:step]` — экран 3.0 своей рамки вместо чеклиста 2.x: «Счёт» с блоком «Из записей матча» и плашкой «Счёт расходится с записями», «Доход», «Игроки» (события из записей, MVP — отличившиеся сверху, при технической победе или сдаче — два, травмы «из записи матча», прокачка тем же листом 07d с броском двух D16 на сайте), «Состав», «Казна», «Дальше», «Итог»; погибшие из итогов видны на шагах и после завершения уходят в «Погибшие»; сервер бросает кубики для итогов, принимает прокачку с броском сайта и тратит бросок при завершении; `npm run rehearsal:transitions` — сквозной тест пяти переходных состояний 2.x → 3.0; итоги 2.x удалены; всё — так близко к прототипам `Post*`/`DeskPost*`, как позволяет код.

**Architecture:** экран итогов строится, как подготовка 09a: модель (`post-model.mjs`) из ответа `GET /api/games/:id/post-match`, рамка — `prep-frame.mjs` 09a с четырьмя аддитивными пропсами, шаги — свои модули `screens/matches/post-*.mjs`, экран (`post.mjs`) читает, пишет `PATCH …/post-match` на ревизии последнего ответа (`savePostMatch` 2.x с повтором при чужой правке) и опрашивает. Числа — только домена `src/domain/post-match/*`: новый чистый `score.mjs` (записи стороны, расхождение со счётом, очки, выбор MVP, кто вернётся), а запись — те же действия `applyPostAction`; домен получает три правки: прокачка итогов несёт бросок (`roll`), бонус Favoured добавляется отдельным действием `favoured` и не обязателен, один бросок не берут две прокачки. Прокачка — лист 07d (`advanceSheetMarkup`, `advanceHandlers`) через адаптер: «Взять», «Бросить два D16» и «Записать бросок…» вводятся в `advanceHandlers` параметрами `lent.take/ask/bind`. Сервер: маршрут броска итогов `POST /api/games/:id/post-match/rolls` (под блокировками итогов, по составу итогов, а не по блобу), проверка броска при `advance`, `settleRosterRolls` в транзакции `finishPost`; очки — из домена. `rehearsal:transitions` — скрипт только на HTTP: `--seed` против `v2.1.0`, `--finish` против 3.0. Миграций нет.

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/{fake-dom,fake-api,ui,contrast,api-db,match-db,scratch-db}.mjs`; CSS custom properties; нативный `<dialog>`; `npm run screens`, `scripts/mock-api.mjs`, `scripts/smoke-*.mjs`; PostgreSQL 16 (docker `gata-league-postgres`); worktree `v2.1.0`.

**Spec:**
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0 (п. 2 — два D16, MVP выбирает тренер; п. 9–11, 13), §2 («`#/games/…` … итоги 2.x — 09b»), §3.3 (павшие: «Post-match при травме `dead` пишет строку … в той же транзакции»), §3.4 (броски, два D16, `rollFitsAdvancement`, одноразовость, `used_at`), §3.6 («Post-match меняется только в одном месте: статистика — из записей»), §3.7 («Итоги», «Счёт из записей», «MVP — счётчик правки, а не матча», «Запись команды во время её матча»), §4 (таблица; `POST …/rolls` — 422 `TEAM_IN_MATCH`), §6 (строка «Матчи … итоги»), §7 («Передано» 07d: «этапу 09b — тот же бросок двух кубиков в итогах (`askRoll`, `pairMarkup`, `rolledDice`, `rollFitsAdvancement`)»; «Передано» 09a: рамка подготовки, `bare`, что удалить с итогами 2.x, `matchRecords`).
- Спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §0 (общие правила), §19 («Итоги матча» — пошаговые, §20), §20 целиком, «Модель записей матча», «Известные расхождения» п. 3 (сдача: уход ветеранов, нет SPP и дохода у проигравшего — на шагах не показаны).
- Спека выката `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md`: §3.1 (`rehearsal:transitions`), §3.2 (п. 2.4), §3.3 целиком, §6.2 (строка «Матч начат, итоги не завершены»).
- Мастер-план `docs/superpowers/plans/2026-10-14-redesign-rollout.md`: Global Constraints, протокол (шаги 1–10; 4 и 7 — в редакции «Процесса» ниже), строка 09b таблицы (зависит от 09a; smoke — все четыре), «Дополнения к этапам → 09b» (:344–:347: `rehearsal:transitions`; «Из 02b» — пересборка стороны и расхождение; «Из 03» — `advance` и `roll`, `used_at` в транзакции итогов; «ActionStepper … 4+1»), «05–13», «Процедура репетиции» (:394–:431).
- План 3.0 `docs/superpowers/plans/2026-10-14-redesign.md`, «Этап 9»: пункты «`npm run rehearsal:transitions`» и «Post-match по шагам в новом виде: счёт и события из записей, расхождение со счётом, MVP (отличившиеся сверху; при технической победе или сдаче — 2 MVP), павшие идут в `team_fallen_players`» — этот этап; «Вызовы» — 09c.
- Решения владельца, обязательные: **D2** — от 901px как в прототипе, не меньше 24px; до 900px — 44px; **близость к прототипам** (каждое состояние — свои прототипы, значения из их HTML, `compare.html`); **слова, называющие игрока, — нейтральные**; **длинные строки переносятся**, «…» — только где за ним не прячутся данные; **деталь прототипа против правила владельца — правило, расхождение записать и спросить**; **случайный навык — два D16, тренер берёт один; в колонке с одним свободным навыком — один кубик**; **команда в матче закрыта до завершения итогов** (09a). **Процесс (владелец): «написать код, а потом разом провести проверки»** — Global Constraints, «Процесс».
- Handoff `docs/redesign/handoff-0.9.1/`: `SCREENS.md` (флоу «Матчи · После матча по шагам», мобайл и десктоп), прототипы `mobile/PostResult.html`, `PostResultMismatch.html`, `PostFans.html`, `PostPlayers.html`, `PostRoster.html`, `PostFinance.html`, `PostNext.html`, `PostReview.html`; `desktop/DeskPostResult.html`, `DeskPostPlayers.html`, `DeskPostReview.html`; лист прокачки — `mobile/Adv1Type.html`…`Adv4Done.html`, `Adv3Random.html`, `desktop/DeskRosterAdv.html` (на них ведёт «Прокачать» прототипов); `design-system/`, `PR-CHECKLIST.md`. Шаблон — строка `DC.define("…", { tpl: "…" })` (снять `\"`, `\n`, `<\/`), логика — `CFG` и `extraVals` в `factory`: значения в задачах прочитаны оттуда.
- Передачи: `pr-rd-09a.md` («09b: итоги по шагам, павшие из итогов, `rehearsal:transitions`, бросок двух кубиков в итогах; 2.x-разметка списка шагов и общий CSS, которые ещё нужны 2.x-итогам»), `pr-rd-07d.md` («09b: бросок двух кубиков в итогах»), `pr-rd-07b.md` («09b: итоги ставят травму через `applyInjuryEffects`»), `pr-rd-07a.md` («09b: итоги не читают и не пишут строк MVP»), `pr-rd-03.md` («08, 09b, 12: бросок на сайте в итогах»), `sdd-stage-02b/final-review.md` («UI behaviour when followed values change under a coach editing the Players step, and «Счёт из записей»: stage 09b»), `sdd-stage-02b/preflight.md` (чужие тапы поднимают ревизию — `POST_REVISION` на позднем шаге), план 09a «Передача следующим этапам → 09b».
- Код (проверено на `origin/redesign` `dad7982`): `src/screens/games/{post-match,game}.mjs`, `src/components/post-match/*`, `src/components/games/{checklist-layout,result-fields}.mjs`, `src/data/post-match-client.mjs`, `src/domain/post-match/*`, `src/domain/roster/{dice,progression,edits}.mjs`, `src/screens/matches/{prep,prep-frame,prep-model,prep-steps}.mjs`, `src/screens/team/roster/{advance,advance-sheet,roll-view,rolls,wire,model,player-access,injury,sheets}.mjs`, `server/routes/{post-match,team-rolls}.mjs`, `server/season/{post-match,finance-store,live-match,match-events-store,preparation-store}.mjs`, `server/api/dice-rolls.mjs`, `scripts/smoke-{post-match,friendly}.mjs`, `scripts/rehearsal-*.mjs`, `scripts/rehearsal/*`, `scripts/mock-api.mjs`, `scripts/mock/matches.mjs`; тег `v2.1.0` (`server/routes/{auth,teams,challenges,games,preparation,post-match}.mjs`).

## Global Constraints

- Ветка `rd/09b-post-match`, worktree `/Users/felstell/git/bb-rd-09b`, от `origin/redesign` `dad7982` (09a влит, PR #31). PR в `redesign` по протоколу мастер-плана, шаги 6–10; в задачах ничего не пушить. Окружение тестов — `. output/09b/env.sh` (`GATA_TEST_DATABASE_URL` — тесты БД создают свои `gata_test_*`; `SMOKE_URL` → `gata_smoke_09b`). **Файл `output/09b/env.sh` держит пароль локальной БД: только `source`, никогда не `cat`, не печатать, не `grep`.** `gata_league` — только через `npm run db:migrate`.
- **Процесс (владелец, обязательно): «написать код, а потом разом провести проверки».**
  - Задачи 1–13 идут подряд. Исполнитель каждой пишет и запускает свои тесты; ревьюера после задачи нет.
  - Исключение — задачи, которые пишут данные итогов, SPP, деньги, погибших или состав: после каждой — короткое ревью сразу (skill requesting-code-review, только дифф задачи, с упором на её Review Focus). Они помечены «⚠ ревью сразу»: **Task 1, Task 3, Task 9, Task 10, Task 13**.
  - Закрывают этап задачи контроллера, по порядку: Task 14 — **параллельно** финальное ревью всей ветки и снимки с `compare.html` против прототипов; Task 15 — **одна** волна исправлений по обоим; Task 16 — проверки (build, test, check, i18n:check, все четыре smoke и `rehearsal:transitions`); Task 17 — правки спек; Task 18 — PR.
- **Серверы этапа:** реальный сервер 3.0 на порту **3077** над `gata_smoke_09b` (и над `gata_transitions_09b` в рецепте Р); mock API — `MOCK_PORT=5181`; прототипы — статический сервер на **5196**; страница сравнения — **5200**; сервер `v2.1.0` только для рецепта Р — порт **3004** (мастер-план) над `gata_transitions_09b`. Никогда общие 3002 и 5173–5176.
- **Сервер: миграций нет; правки — только эти** (иная правка сервера или миграция — стоп-условие):
  - `POST /api/games/:id/post-match/rolls {side?, playerId, purpose, category?}` → `{roll}` (Task 3): бросок итогов. Бросает только тренер стороны (не админ — как `POST …/rolls`), только на шаге «Игроки» (`stage === 2`, не подтверждено, итоги не завершены), только игроку состава команды (journeyman и звезда — нет, 404 `PLAYER_NOT_FOUND`), по составу итогов: блоб плюс то, что эти итоги уже дали игроку (прокачки шага, SPP). `refuseWhilePlaying` маршрут не зовёт: итоги — путь матча к концу (решение 22).
  - `PATCH …/post-match` с `advance` и `roll: {id, via: "site"}` проверяет бросок под блокировкой команды (`checkPostRoll`): этой команды, этого игрока, не использован, самый ранний ждущий игрока, подходит прокачке (`rollFitsAdvancement`) — иначе 422 `DICE_ROLL_MISMATCH {playerId}` / 409 `DICE_ROLL_USED`.
  - `finishPost` в своей транзакции зовёт `settleRosterRolls` по каждой стороне (до записи состава): бросок прокачки итогов получает `used_at`; отказ завершения ничего не тратит.
  - Очки матча считает домен (`postPoints`, `src/domain/post-match/score.mjs`); `points` в `server/season/post-match.mjs:65` удаляется.
  - Новых кодов ошибок нет: `DICE_*`, `POST_*`, `PLAYER_NOT_FOUND`, `FIXTURE_NOT_YOURS` уже в `API_ERRORS` и словарях.
- **Параллельный этап 10 и владение файлами.** Этап 10 («Таблица и соперники») планируется и исполняется сейчас в `/Users/felstell/git/bb-rd-10` (ветка `rd/10-season`, та же база `dad7982`).
  - **10 владеет:** `src/screens/matches/{index,model,card,lists,band,before}.mjs`, `matches.css`, `before.css` (таблица «Сезона», календарь, другие открытые матчи), обзором соперника, `#/coaches/:uid`, тапом по расе. **09b эти файлы не правит.** Ссылка «Итоги матча» карты, полосы и SideNav уже ведёт на `postMatchUrl(game)` — адрес не меняется, кусков в файлах 10 нет.
  - **09b владеет:** экраном итогов и его модулями — новыми `src/screens/matches/post*.mjs`, `post*.css`; серверным кодом итогов (`server/season/post-match.mjs`, `server/routes/post-match.mjs`, `server/api/dice-rolls.mjs`), путём павших из итогов, `src/domain/post-match/*`, `scripts/rehearsal-*`, `scripts/rehearsal/*`, `scripts/mock/post.mjs`, `scripts/smoke-post-match.mjs`.
  - **Файлы 09a, которые правит 09b** (не 10-го): `src/screens/matches/prep-frame.mjs` — четыре аддитивных пропса рамки (Task 4); без них разметка подготовки та же (тест 09a «a phone's frame …» проходит без изменений).
  - **Файлы 07d, которые правит 09b** (минимально, Task 10): `src/screens/team/roster/advance.mjs` — `advanceHandlers` принимает `lent.take`, `lent.ask`, `lent.bind` (без них — как было); `wire.mjs` — `export` у `wireAdvance` (:170) и `wireReasons` (:212); `server/routes/team-rolls.mjs` — `export` у `checkRoll` (:40, Task 3).
  - **Общие файлы и минимальные куски 09b:** `src/i18n/en.json`, `ru.json` — новые ключи только в `after.*`, удаление ключей `post.*` без читателя (Task 11); при слиянии с 10 — объединение ключей. `src/styles.css` — две строки `@import` в конце (`post.css`, `post-players.css`), удаление `@import url("styles/post-match.css");` (Task 11). `src/core/router.mjs` — импорт и строка `postMatch` (:44, :87). `src/shell/navigation.mjs` — `"postMatch"` в `BARE_ROUTES` (:31). `scripts/mock-api.mjs` — **одна строка** `answerApi` (:556): `answerPost` перед `answerMatches` (файл 599/600, новых строк нет). `package.json` — строка `"rehearsal:transitions"`.
- **Файлы на пределе** (`wc -l` на `dad7982`): `scripts/mock-api.mjs` 599 (без новых строк), `src/screens/team/roster/advance.mjs` 514 (Task 10 — не больше 540), `src/screens/matches/prep.css` 529 (не трогать: CSS итогов — свои файлы), `src/screens/team/roster/wire.mjs` 320, `server/api/dice-rolls.mjs` 304 (Task 3 — не больше 360), `scripts/smoke-post-match.mjs` 268 (Task 12 — не больше 380), `server/season/post-match.mjs` 141, `src/screens/matches/prep-frame.mjs` 144, `src/core/router.mjs` 160, `src/shell/navigation.mjs` 172, `test/post-match.test.mjs` 597 (новые тесты домена — в новых файлах). Новые модули — `src/screens/matches/{post,post-model,post-steps,post-players,post-roster,post-money,post-review,post-advance}.mjs`, `src/domain/post-match/score.mjs`, `scripts/mock/post.mjs`, `scripts/rehearsal-transitions.mjs`, `scripts/rehearsal/transitions-{api,seed,finish,checks}.mjs`; CSS — `src/screens/matches/{post,post-players}.css`; каждый ≤ 600, функция ≤ 80.
- **Размеры (D2) и близость к прототипам.** До 900px нажимаемое — от 44px; от 901px — как в прототипе, но не меньше 24px. Значения прототипов: степперы счёта 40px (телефон — 44), грани D6 46px, чипы MVP 40px (телефон — 44), радио травмы 48/44px, характеристики 40px (телефон — 44), «Прокачать» 40px (телефон — 44), степперы персонала и сейфа 34px (телефон — 44), «Отменить последнюю» 36px (телефон — 44), основная кнопка подвала 52px (десктоп — 48), строки «подпись — значение» от 44px, строки событий 52px, строки персонала 58px, переключатели 56px. Цвет — только токенами, как 09a: `--surface` ← `#FFFFFF`, `--surface-2` ← `#F3F6F4`, `--surface-3` ← `#EEF2F0`, `--line` ← `#E6EBE8`/`#DCE3DF`, `--line-strong` ← `#C9D3CE`, `--muted` ← `#5F6B65` и `#8A948F`, `--ink` ← `#14201A`, `--ink-2` ← `#3E4A44`, `--accent` ← `#2F7A52`, `--accent-text`, `--accent-tint` ← `#E4F0E9`, `--accent-tint-soft` ← `#F1F8F4`, `--on-accent-tint` ← `#163A28`, `--warn` ← `#C99A2E` (точка), `--warn-tint` ← `#FFF4DE`, `--on-warn-tint` ← `#7A5410`, `--danger` ← `#A0473A`, `--danger-tint` ← `#FBEDEA`, `--on-danger-tint` ← `#7A2E22`, `--disabled` ← `#A9B3AE`/`#B5BDB9`, `--header` ← `#17392C`, `--header-ink`, `--header-muted` ← `#CFE0D7`, `--header-tab` ← `#A9C4B6`; полупрозрачный белый на шапке — `color-mix(in srgb, var(--header-ink) N%, transparent)`. Звезда MVP `#C99A2E` — `--warn` (текст ≥ 3:1 как крупный значок; иначе ближайший токен, который держит, тест контраста). Расхождение, которое код не позволяет закрыть, — в §7 спеки (Task 17).
- **Слова (ответ владельца после 07c):** строки, которые называют игрока, — нейтральные: без «он/его», без причастий и прошедшего времени в роде («#9 J. Corr · в строю», а не «восстановился»; «Найм: Blitzer», а не «Нанят»; «Гибель: O. Krell»). Числа — без форм множественного числа («записей: 8 + 3», «травм: 1», «+19 · игроков: 4»), как решение 25 этапа 05.
- **Переносы (ответ владельца):** подзаголовок рамки, названия команд над степперами, имена в строках событий, в чипах MVP и в карточках травм, строки «Итога» переносятся; `text-overflow: ellipsis` в новых правилах 09b нет нигде (тесты задач экрана проверяют).
- Vanilla ES-модули, хешевый роутер; без фреймворка, сборщика, TypeScript и новых зависимостей.
- CSP: ни inline JS, ни `style="…"`, ни `on…=`.
- Каждая строка интерфейса — через `t("key")`; новые ключи — в обоих словарях, только в `after.*`, без дублей. Ключи из шаблонных строк получают тест, перебирающий все значения, в задаче, которая их заводит: `after.step.${step}` по `POST_STEPS` и `after.next.${step}` по `POST_STEPS.slice(1)` (Task 4), `after.mode.${mode}` по `RESULT_MODES` и `after.outcome.${outcome}` по `["win", "draw", "loss"]`, `after.part.${key}` по `POINT_PARTS` (Task 5), `after.injury.${code}` по `INJURIES`, `after.injurySub.${code}` по `["miss", "niggling", "lasting"]`, `after.stat.${counter}` по `POST_STATS` (Task 6), `after.mistake.${kind}` по `["none", "pending", "minor", "major", "catastrophe", "under"]` (Task 8), `after.opponent.${state}` (Task 4).
- `escapeHtml` на каждую интерполяцию; пропс `…Html` — только разметка другой функции `render…()`/`…Markup()`.
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 на функцию, 0 недостижимых функций, `src/app.js` ≤ 120 (этап его не трогает). Бюджеты только уменьшаются.
- Ловушка `scripts/check-references.mjs`: ключ объекта, равный экспорту проекта плюс одна буква, в файле, который этот экспорт не импортирует, ломает `npm run check` (`to:`, `td:`, `th:`, `tr:`, `tv:` от `t`; `states:`, `views:`, `icons:`). Ключи 09b (`own`, `other`, `records`, `scorers`, `touchdowns`, `casualties`, `count`, `side`, `counter`, `score`, `parts`, `total`, `top`, `rest`, `chosen`, `returning`, `missing`, `ops`, `staff`, `before`, `after`, `deposit`, `mistake`, `captain`, `rows`, `steps`, `footer`, `opponent`, `notices`, `column`) проверены: экспортов «без последней буквы» нет. TV в объектах — `worth`, никогда `tv`.
- Брейкпоинты только `max-width: 900px` / `min-width: 901px`. Кольцо фокуса — из `src/ui/base.css`; `--focus-ring` не использовать. Новый CSS задаёт шрифт, рамку, фон, `text-transform`, `letter-spacing` и `font-weight` явно (правила 2.x живут до этапа 13). Новый `.css` — `@import` в конце `src/styles.css`, в порядке задач (`post.css` — Task 5, `post-players.css` — Task 6).
- Радиогруппы (мастер-план 05–13): режим, победитель, грани D6/D3, MVP, травма, характеристика, капитан, Expensive Mistakes — `role="radiogroup"` с `aria-label`, пункты `role="radio"`, `aria-checked`, roving tabindex и `wireRadioGroups` (`src/ui/choice.mjs:45`) или `renderSegmentedControl`; в `onChange` группа не перерисовывается через `innerHTML` — экран патчит (`patch`/`patchWithModal`), фокус остаётся на пункте. Отказ степпера говорит причину (`onRefused`).
- **Перенесённый экран удаляет свой модуль и CSS 2.x в том же PR** (Task 11): `screens/games/post-match.mjs`, `components/post-match/{steps,players,review,shared,finance}.mjs`, `components/games/checklist-layout.mjs`, `styles/post-match.css`; правила `styles/pre-match.css`, `matchday.css`, `site-matchday.css`, чьих классов больше нет ни в одном `src/**/*.mjs`. Остаются (страница игры 2.x и редактор 2.x их рисуют): `components/post-match/game-panel.mjs`, `components/pre-match/{game-panel,shared}.mjs`, `components/matchday.mjs` (его берут `page-chrome.mjs` и `roster-editor/matchday-layout.mjs`), `components/games/result-fields.mjs` (`renderAdminResultForm`), `data/post-match-client.mjs` (экран 3.0 берёт `savePostMatch`).
- `content/` не меняется. Правила и числа — из `src/domain/**` и `content/Gata/**`, вид — из прототипов; расхождение макета с кодом правится по коду без вопроса (§0.1, §0.12); контент против кода — вопрос владельцу.
- Тесты: сначала `npm run build`; затем `. output/09b/env.sh && npm test`, `npm run check`, `npm run i18n:check`. Каждый PR: одинаковое число страниц EN/RU, 0 fallback; все четыре smoke на сервере 3077; `rehearsal:transitions` — рецепт Р.
- Комментарии в коде — по-английски, в тоне соседних файлов; ответы владельцу — по-русски.
- Каждая задача — один коммит с тестами; сообщение коммита заканчивается вторым `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Стоп-условия:** контент и код расходятся в правиле; нужно продуктовое решение вне спек и этого плана; нужна правка сервера сверх списка выше или миграция; файл не помещается в бюджет; падает тест 05–09a не там, где задача его называет; этап 10 тронул файл из списка 09b (или наоборот). Остановиться и спросить контроллера.

## Review Focus

1. **Двое пишут итоги одновременно; тап соперника из «Состава» поднимает ревизию; ответ потерян; «Завершить матч» дважды и обоими.** Ожидание: `POST_REVISION` при чужой правке — один повтор `savePostMatch`, если своя сторона и счёт не изменились, иначе чтение заново и слова сервера; тап, изменивший сторону, которая ещё следует за записями, — статистика перечитана, выбранные прокачки сняты, тренеру сказано (`after.tapsChanged`); потерянный ответ — чтение, нажатие не повторяется; завершение — один запрос с экрана, второй тренер видит завершённые итоги; ни одной двойной записи SPP. Тесты: Task 9 — «a refused write on a revision moved by the opponent is sent once more when this side and the score are as seen», «a tap that changed the side is said, and the advancements chosen go», «a lost answer reads the post-match again and sends nothing twice», ««Finish the match» pressed twice is one request; a finish answered completed draws the summary read only».
2. **Бросок сайта в итогах.** Ожидание: просьба дважды — тот же бросок; бросок по составу итогов (навык, взятый в этих же итогах, не выпадет); журнеймен и звезда — только «за столом», админ — не бросает; прокачка с чужим, использованным, не подходящим броском — отказ под блокировкой; отменённая прокачка оставляет бросок ждать (следующая просьба — он же); завершение тратит бросок один раз (`used_at`), отказ завершения — ни одного. Тесты: Task 1 — «an advancement of the post-match keeps the roll it names, and one roll is not named twice»; Task 3 — «a roll of the post-match is the side's coach's, on the Players step, for a roster player, by the roster the post-match holds», «asked again it is the same roll; asked for the other purpose it is DICE_ROLL_WAITING», «the roll is by the post-match's roster: a skill taken in this post-match is not rolled», «an undone advancement leaves its roll waiting», «an advancement naming another player's, a used or an unfitting roll is refused and writes nothing», «the finish uses the roll once; a refused finish uses none»; Task 10 — «a journeyman's advancement is the table's; the site says why», «the admin rolls nothing on the site».
3. **Счёт против записей.** Ожидание: блок «Из записей матча» и плашка расхождения считают так же, как `validateStatistics` (CAS включает crowd и foul; при технической — нули; TD проигравшего сдачу не сверяются); после смены счёта и `reset-side` статистика и травмы вернулись из записей, MVP, crowd/foul, `retire` и уходы обнулены, а расхождение показано; «Далее: состав» закрыта с причиной, пока расходится, и сервер по-прежнему отказывает `POST_STATISTICS`. Тесты: Task 2 — «a mismatch is what lock-players would refuse: a side, a counter, the score and the records»; Task 5 — «the mismatch is said under the score, in the prototype's words»; Task 9 — «a new score rebuilds the side from the records, and the mismatch is said on the Players step».
4. **Итоги, начатые в 2.x и открытые на переезде.** Ожидание: у стороны без ключа `followsEvents` блок записей говорит «матч начат до 3.0: записей нет», расхождения «с записями» нет, чип «из записи матча» не рисуется; завершение — без `POST_TEAM_CHANGED`, SPP один раз, записи матча получают `settled_at`. Тесты: Task 2 — «a side begun before 3.0 has no records»; Task 13 — состояние `postPlayers` рецепта Р; существующий `test/post-match-events-db.test.mjs` («a post-match from 2.x …») — без изменений.
5. **Павшие из итогов.** Ожидание: «Dead» у команды, сыгравшей меньше трёх матчей, — Badly Hurt (защита новичков) и это сказано; погибший не может быть MVP и не прокачивается; journeyman-погибший не идёт в «Погибшие»; после завершения строка `team_fallen_players` с `from_match` и парой, игрок ушёл из состава, «Состав» показывает его в «Погибших» после перечитывания команд. Тесты: Task 2 — «MVP choices leave out stars and the dead; rookie protection makes Dead Badly Hurt»; Task 8 — «the summary names the dead and says they go to «The fallen»»; Task 9 — «the finish reads the teams again»; Task 12 — smoke `deathCounts` (гибель в завершённых итогах — в `GET …/fallen` с `fromMatch` и парой, в блобе игрока нет).

## Решения этого плана

Источники оставили их открытыми; план принимает их так (контроллер подтверждает до исполнения).

**Как идёт каждая запись**

| Действие (шаг) | Запрос | Когда закрыто | Потерянный ответ / отказ |
|---|---|---|---|
| «Отправить счёт», «Отправить свой счёт» («Счёт») | `PATCH /api/games/:id/post-match {revision, side, action: {type: "result", mode, winner, home: {touchdowns, casualties}, away: {…}}}` — степперы и режим копятся на экране, уходят кнопкой | итоги завершены, сторона подтвердила, счёт лиги (`result.official`), запись в пути | `POST_REVISION` — `savePostMatch` повторяет один раз, если своя сторона и счёт те же (сравнение `sameValues`), иначе чтение и слова; потерян — чтение, нажатие не повторяется |
| «Подтвердить счёт 2–1» | `agree-result` | как выше; счёт свой | как выше |
| «Изменить счёт…» (после согласия) | окно-вопрос (`confirmAction`): «Новый счёт начнёт итоги заново для обеих команд», затем степперы открыты, `result` | как выше | как выше |
| «Далее: игроки» («Доход») | `fans {roll, technicalRoll, painted, stalling}` — грани и переключатели копятся на экране | шаг пройден (`stage > 1`) | как выше |
| MVP, травма, характеристика, «До конца сезона», бросок ухода, степпер листа статистики («Игроки») | `statistics {statistics, injuries, mvps, departures}` всей стороны — **сразу**, из черновика шага; нажатие, пока запись в пути, меняет черновик, и после ответа черновик уходит снова, если отличается от ответа (последнее значение побеждает, как кубики 09a) | `stage !== 2`, сторона подтвердила | 409/потерян — чтение, черновик сброшен, тренеру сказано |
| «Бросить два D16», «Бросить D8» (лист прокачки) | `POST /api/games/:id/post-match/rolls {side, playerId, purpose, category?}` | не своя сторона (админ), журнеймен/звезда, `stage !== 2`, бросок в пути | как `askRoll` 07d: потерян — «нажмите ещё раз: сайт вернёт тот же бросок» |
| «Взять …» (лист прокачки) | `advance {playerId, advancementType, grant, roll}` | как выше; правка статистики в пути | отказ — в листе (`sheet.refusal`); потерян — чтение |
| «Добавить» бонус Favoured (готово листа) | `favoured {playerId, skill}` | как выше | как выше |
| «Отменить» прокачку | `undo-advance {playerId}` | как выше | как выше |
| «Далее: состав» | `lock-players` | расхождение со счётом, MVP не выбраны (закрыта со словами) | `POST_STATISTICS`/`POST_MVP` — слова сервера |
| «+ Нанять» → позиция, «Продать…» → игрок, «Оставить · 50k», Raise Dead, степпер персонала («Состав») | `roster {operation: "hire"\|"raise", rowIndex}`, `{operation: "sell"\|"keep", playerId}`, `{operation: "staff", key, delta}` | `stage !== 3`, запись в пути (второе нажатие ничего не шлёт) | как выше |
| «Отменить последнюю» | `undo-roster` | нет операций | как выше |
| «Далее: казна» | `lock-roster` | как выше | как выше |
| «Далее: следующий матч» («Казна») | `finance {deposit, mistake: {roll, first, second}}` — степпер и грани копятся на экране | соперник ещё не сохранил «Игроки» (`POST_WAIT_STATISTICS`, закрыта со словами), бросок не полон | как выше |
| «Далее: итог» («Дальше») | `next {captain}` | капитан не выбран | как выше |
| «Подтвердить итог» («Итог») | `confirm` | `stage !== 6`, уже подтверждено | как выше |
| «Завершить матч» | `POST /api/games/:id/finish {revision, side}` | статус не `ready` («Станет активной, когда соперник подтвердит»); кнопка взводится через `FOOTER_ARM_MS` (двойной щелчок ничего не делает) | ответ `completed` (и у второго тренера тоже — сервер отвечает 200 на завершённые) — итоги только для чтения; `POST_TEAM_CHANGED` — плашка «Команда изменилась…» с «Начать заново с текущим составом» |
| «Изменить с шага «Доход»…» (на пройденном шаге) | окно-вопрос, затем `reopen` | итоги завершены, счёт не согласован | как выше |
| «Начать заново с текущим составом» (`rosterChanged`) | окно-вопрос, затем `reset-side` | итоги завершены | как выше |

**Рамка и шаги**

1. **Своя рамка на обеих ширинах** (`PostResult`…, `DeskPostResult`): `postMatch` — в `BARE_ROUTES`; разметка — `prepFrameMarkup` 09a с аддитивными пропсами (Task 4): `stepsLabel` у навигации шагов, `noticesHtml` под шапкой, `opponentHtml` вместо карточки соперника в колонке десктопа (у итогов её нет — `""`), `actionLeadHtml` в панели кнопки (чип «Соперник на шаге «Игроки»» над кнопкой, как `DeskPostPlayers`). Телефон: «‹» 44×44 → «Матчи» команды тренера (админу — `gameUrl`), «После матча» Oswald 21, подзаголовок «Тур 7 · Ashgrove Wardens 2–1 Silverbrook Rangers» (без счёта — «A — B»; товарищеский — «Товарищеский · …»), переносится; семь точек; подвал — строка о сопернике и одна кнопка. Десктоп: полоса «После матча · тур 7» и «A 2–1 B», шаги 260px со сводкой, карточка шага, колонка (что шаг ставит туда, панель с чипом и кнопкой 48px).
2. **Шаги — `POST_STEPS`**, слова `after.step.*` прототипа: «Счёт», «Доход», «Игроки», «Состав», «Казна», «Дальше», «Итог» (ключи `post.step.*` 2.x не трогаются: их удалит Task 11, если читателей не останется). На экране — запрошенный шаг, не дальше текущего стороны (`side.stage`), без шага — текущий. Пройденные и текущий — ссылки (`postMatchUrl(game, step)`), будущие — нет. Пройденный шаг, подтверждённая сторона, завершённые итоги — только чтение; на пройденном шаге — плашка «Шаг пройден» с тихой «Изменить с шага «Доход»…» (`reopen`, решение «Как идёт каждая запись»). Сводки десктопа: «2–1 · подтверждён» / «вводим», «+80k · фаны 3 → 4», «+14 SPP · травм: 1», «−20k», «сейф +20k», «капитан W. Brandt», у текущего — «сейчас».
3. **Строка о сопернике** — шаг соперника словами: «Соперник на этом шаге», «Соперник на шаге «Игроки»»; на «Счёте» — «Соперник подтвердил счёт 2–1» / «Соперник прислал счёт 2–1» / «Ждём подтверждения соперника» / «Соперник ещё не вводил счёт»; на «Итоге» — «Соперник подтвердил итог» / «Ждём подтверждения соперника». Точка `--accent`, когда соперник своё сделал, иначе `--warn`.

**Счёт**

4. **«Из записей матча»** — статистика стороны в состоянии итогов: у стороны 3.0 (в ней есть ключ `followsEvents`) она всегда равна записям — до сохранения «Игроков» итоги следуют за записями, а сохранение дописывает разницу в записи (§3.7). Поэтому второго чтения нет, и соперник виден так же, как свои. Строки: «Ваши · TD: Ashby, Pike · CAS: Gruk ×2, Brandt — TD 2 · CAS 3», «Соперник · из записей соперника в «Составе» — TD 1 · CAS 1»; чип «записей: 8 + 3» — сумма счётчиков матча и травм стороны (снятые тапы не считаются — расхождение с «Записями матча · N» 09a, записать). Сторона 2.x (ключа нет) — «—» и «матч начат до 3.0: записей нет».
5. **Степперы** «наша | TD/CAS | соперник» (наша — слева), стартуют с отправленного счёта, иначе с записей каждой стороны; соперник поправляет свою часть, отправляя свой счёт, — первый тренер подтверждает его (так устроен `result`/`agree-result`: «Один вводит, второй подтверждает»). «Для вас: Победа · +4 очк.» — `postPoints`; товарищеский — «Товарищеский: вне таблицы».
6. **«Как закончился матч»** — радиогруппа 2×2 (`after.mode.*`); при не «Сыграно» — сегменты «Победитель» с двумя командами (в прототипе нет, а домен требует `winner`: расхождение); «Техническое» закрывает степперы на 2:0 и CAS 0 (домен так и пишет).
7. **Расхождение** — `scoreMismatches(state)` (Task 2), правило `validateStatistics`: красная плашка на «Счёте» (прототип) и на «Игроках» (там её надо сводить); «ваши TD: 3 в счёте, 2 в записях; у соперника счёт расходится с записями.»

**Доход**

8. Грани D6 (у проигравшего сдачу — D3; ничья — без броска, «Ничья: бросок не нужен»), у технической победы — D3 дохода; «Dedicated Fans 3 → 4» / «не меняются» по `nextDedicatedFans`, объяснение по исходу; «Доход за матч» — строки `postIncome` (посещаемость с подстрокой «Fan Factor 5 + 5 = 10 × 5k», тачдауны, без затяжки, покрашенная, техническая), «Итого +80k» Oswald 28; у проигравшего сдачу — «Сдача: у проигравшего дохода нет» (закрывает известное расхождение 3); переключатели «Тянули время (stalling)», «Команда покрашена» (`renderToggle`). Всё копится на экране и уходит «Далее: игроки».

**Игроки**

9. **События** (`PostPlayers`): строки 52px игроков с событиями или травмой — номер Oswald, имя, «Catcher · TD 1 · COMP 1» или «травма: Lasting Injury (AG)», справа «+4 SPP» (`earnedSpp` без MVP) или «—»; ниже тихая «Остальные игроки · 9» раскрывает прочих. Строка — кнопка: открывает **лист статистики** игрока (`renderSheet`, `after-player`): степперы `renderActionStepper` всех `POST_STATS` (11; у crowd и foul — подпись «из CAS»), радио травмы и характеристики, «До конца сезона»; каждое нажатие — запись `statistics` (черновик шага). В прототипе правки на телефоне не видно, а без неё расхождение не свести: расхождение записать. Десктоп (`DeskPostPlayers`): таблица `<table>` # · ИГРОК · TD · CAS · COMP · KO · MVP · SPP · ТРАВМА, имя — кнопка того же листа; прочие счётчики — в листе.
10. **MVP** — `mvpChoices(state, name)` (Task 2): «Отличились» — игроки с SPP за матч, по убыванию, затем «Остальные» по номеру; звёзды и погибшие (с учётом защиты новичков) не входят. Один MVP — одна радиогруппа (две подписи внутри, стрелки идут через обе); два MVP (победитель технической или сдачи) — кнопки-отметки (`aria-pressed`), не больше двух, третье нажатие — «Уже выбраны два MVP — сначала снимите одного»; MVP — **разные игроки** (вопрос владельцу 2). У проигравшего — «MVP нет: …». Десктоп — звезда в колонке MVP, кнопка `aria-pressed` с именем; та же логика.
11. **Травмы** — карточка на каждого игрока с травмой (телефон — в теле шага, десктоп — в колонке): «Травма · #2 O. Krell», чип «из записи матча», пока сторона следует за записями (`sideFollowsEvents`), — после сохранения шага травма уже «введена здесь», чипа нет; радио `INJURIES` 2×3 с подписями «пропуск», «NI + пропуск», «−1 стат»; характеристика (MA ST AG PA AV) при Lasting; «До конца сезона» при Lasting (`retire`, в прототипе нет); подпись о защите новичков, при `gamesPlayed < 3` — «засчитается как Badly Hurt». Травму игроку без неё дают в листе статистики.
12. **Сдача, проигравший** — карточка «Ветераны после сдачи · D6»: игроки с 3+ улучшениями, грани D6, «уходит при 1–3»; SPP строк — «—», подпись «Сдача: SPP за матч нет».
13. **Прокачка** — карточки «L. Ashby может прокачаться · 27 SPP доступно с MVP · прокачка необязательна» + «Прокачать» (игроки итогов, кроме звёзд и погибших, у которых хоть один тип открыт); взятые — «Прокачка: Diving Catch» + «Отменить». «Прокачать» открывает **лист 07d** (Adv1Type…, DeskRosterAdv) по составу итогов (решение 22). Правка статистики или MVP после прокачки снимает прокачки (домен, `saveStatistics`) — подсказка над карточками это говорит.
14. «Далее: состав» закрыта со словами, пока есть расхождение или не выбраны MVP.

**Состав, Казна, Дальше, Итог**

15. **Состав** (`PostRoster`): «Казна после дохода 150k» и остаток Oswald 24 (`--danger` ниже нуля); «Персонал» — `renderResourceCounter` по `postStaffOptions` (Team Re-rolls только «+», подпись «120k за штуку · сейчас 1»); «Игроки»: «+ Нанять» (лист позиций: цена, «2 из 4», закрыта с причиной — мест нет, казны не хватает, в составе 14) и «Продать…» (лист игроков с ценой продажи; при 7 — закрыт); «Journeymen этого матча» — «Оставить · 50k»; у Masters of Undeath — «Raise Dead · Zombie Lineman» (закрыт сверх погибших соперника); «Операции этого шага» со суммами и «Отменить последнюю». Окна подтверждения у продажи нет: до «Далее» её снимает «Отменить последнюю».
16. **Казна** (`PostFinance`): строки до / доход / покупки (и продажи) / в сейф / после Oswald 28 (`postFinance` над `projectPostRoster`); Coach's Safe — степпер 0…min(50, доход, казна); Expensive Mistakes — грани D6, когда в казне после сейфа ≥ 100k, затем D3 (Minor) или два D6 (Catastrophe) — в прототипе одна грань; итог словами `after.mistake.*`.
17. **Дальше** (`PostNext`): «Вернутся к следующему матчу» (пропускал до матча, теперь в строю — «в строю»), «Пропустят следующий матч» (с причиной травмы итогов, «AG 3+ → 4+» у Lasting), TV и CTV «до → после», казна, сейф; «Капитан на следующий матч» — радио 2 колонки (не временно ушедшие), по умолчанию нынешний.
18. **Итог** (`PostReview`, `DeskPostReview`): карточки обеих сторон (чип «Подтвердил» / «Ждём»; MVP «L. Ashby · +5 SPP», «SPP за матч +19 · игроков: 4, с MVP», травмы, гибель, прокачки, покупки, казна, сейф, фанаты) и подпись «…погибшие перейдут в «Погибшие»…»; десктоп справа — «Результат 2–1 · Победа · +3 за победу, +1 за 3+ CAS». Кнопка: «Подтвердить итог», затем «Завершить матч» (закрыта, пока соперник не подтвердил). **После завершения** экран остаётся на «Итоге» только для чтения: плашка «Матч завершён», «К матчам», «К составу»; `invalidateGames()` и `loadMyTeams(true)` — «Состав» читает погибших и состав заново.

**Экран**

19. **Чтение и опрос** — как подготовка 09a: `GET …/post-match` при входе; опрос каждые 6 с, пока вкладка видна, ничего не в пути, черновик шага пуст или равен ответу, ни один лист и окно не открыты; отказ чтения ждёт дольше (до минуты), 403/404 останавливают опрос, завершённые итоги — тоже. Новая ревизия — патч без потери фокуса. Одна форма на ширину (`isPhone`, `onPhoneChange`, `drawKeepingFocus(view, draw, "h1")`). Админ — переключатель стороны рамки (`prep-side`), пишет с `side`; бросать не может (решение 22).
20. **Тап соперника или свой из «Состава»** меняет сторону, которая ещё следует за записями: опрос приносит новую статистику — тренеру `after.tapsChanged`, черновик шага сброшен (02b: «UI behaviour when followed values change …»).

**Сервер, домен, удаление**

21. **Прокачка итогов несёт бросок** (Task 1): `advance {…, roll}` хранит `roll` в выборе; `postPlayers` пишет его в прокачку блоба, как `takeAdvancement` (`{type, grants, roll}`); второй выбор с тем же `roll.id` — `DICE_ROLL_USED`. Бонус Favoured — действие `favoured {playerId, skill}` к последней прокачке игрока в итогах; без него бонуса нет (как ход 07d, решение 17; 2.x требовал D8 на каждую прокачку — вопрос владельцу 3).
22. **Бросок итогов — свой маршрут** (Task 3): `POST …/rolls` команды во время матча — 422 `TEAM_IN_MATCH` (§3.7), а итоги идут, пока матч «идёт»; к тому же бросок по блобу не видит навыка, взятого в этих же итогах. Маршрут итогов зовёт `rollForPlayer` с составом итогов вместо блоба (`teamRow.roster` — игроки `postPlayers` без временных), проверка ждущего броска и перебросы — те же. Бросок — тренера стороны; журнеймен (его id сменится при «Оставить») — только за столом.
23. **Очки** — `postPoints(state, name, kind)` в домене (те же числа, что `points` сервера, плюс части для «Итога»); сервер берёт его.
24. **Павшие из итогов**: серверная запись уже есть (`applyPostMatchRoster`, `server/season/finance-store.mjs:39`, этап 02a; `fallenPlayers` с защитой новичков); 09b — путь на экране и сквозная проверка (smoke): «Dead» с защитой новичков, «Гибель» в «Итоге», «Погибшие» после завершения.
25. **Удаление 2.x** — список Global Constraints; страница игры `#/games/:id` 2.x и её панели остаются (прототипа нет; этап 13).
26. **`rehearsal:transitions`** (Task 13) — только HTTP, без `DATABASE_URL`: `--seed <url>` против `v2.1.0` регистрирует двух тренеров, создаёт им по пять команд и через вызовы — товарищеские пары, доводит пять состояний §3.3 и пишет `output/rehearsal/transitions.json`; `--finish <url>` против 3.0 доводит каждое до конца и проверяет. Все пять — на товарищеских (вопрос владельцу 1): лиговую пару через API пришлось бы ставить в действующий сезон дампа. Админ для «неподтверждённый счёт вносит админ» — `ADMIN_LOGIN`/`ADMIN_PASSWORD` окружения сервера 3.0. **Порядок репетиции меняется**: `--seed` идёт после `rehearsal:restore` и **до** `rehearsal:check -- --before` (иначе засев попал бы между слепками и `--after` сказал бы «данные изменились»), `--finish` — после миграций на сервере 3.0 (Task 17 правит мастер-план и спеку выката).
27. **ActionStepper «4+1»** (мастер-план, заметка этапа 04) — уже сделан 07a (`ui.stepper.thisMatch`, `src/ui/action-stepper.mjs`); лист статистики итогов показывает счёт матча без прироста — нечего делать.
28. **Записи MVP** (передача 07a) — итоги не читают и не пишут строк `mvps` (`MATCH_COUNTERS`); Task 3 добавляет утверждение в тест БД.

## Вопросы владельцу

1. **`rehearsal:transitions` — на товарищеских.** Пять состояний §3.3 создаются через API `v2.1.0`; лиговую пару через API можно поставить только в действующий сезон дампа (новый тур). *По умолчанию:* все пять — товарищеские между двумя своими тренерами; «очки верны» проверяется как 0:0 и неизменная таблица (`GET /api/season` до и после). Альтернатива — одно лиговое состояние в отдельном сезоне `preview`, вставленном SQL (как `preview:seed`), не «через API».
2. **Два MVP одному игроку.** Победитель технической или сдачи выбирает двух; домен допускает одного игрока дважды (2.x так позволял). *По умолчанию:* экран 3.0 даёт двух разных; один дважды — нет (прототип об этом молчит).
3. **Бонус Favoured в итогах.** 2.x требовал вводить D8 бога на каждую прокачку итогов; «Состав» 07d добавляет бонус после «Готово» по желанию (решение 17 плана 07d, ответ владельца 3). *По умолчанию:* итоги — как «Состав»: бонус добавляется после прокачки, не добавлен — бонуса нет (исход тот же, что у D8 мимо).

## Файлы

| Файл | Задача | Что |
|---|---|---|
| — (сверка якорей, базовый прогон) | 0 | база (контроллер) |
| `src/domain/post-match/{state,roster}.mjs`, `test/post-match-rolls.test.mjs` (новый) | 1 ⚠ | бросок прокачки итогов, `favoured`, бонус необязателен |
| `src/domain/post-match/score.mjs` (новый), `test/post-match-score.test.mjs` (новый) | 2 | записи стороны, расхождение, очки, MVP, кто вернётся |
| `server/routes/{post-match,team-rolls}.mjs`, `server/season/post-match.mjs`, `server/api/dice-rolls.mjs`, `test/post-match-rolls-api.test.mjs` (новый), `test/post-match-events-db.test.mjs` | 3 ⚠ | маршрут броска, проверка, `used_at` при завершении, очки из домена |
| `src/screens/matches/{prep-frame,post-model}.mjs`, оба словаря, `test/post-model.test.mjs` (новый), `test/match-prep.test.mjs` | 4 | рамка итогов, модель |
| `src/screens/matches/{post-steps.mjs,post.css}`, `src/styles.css`, оба словаря, `test/post-steps.test.mjs` (новый) | 5 | «Счёт», «Доход» |
| `src/screens/matches/{post-players.mjs,post-players.css}`, `src/styles.css`, оба словаря, `test/post-players.test.mjs` (новый) | 6 | «Игроки», лист статистики |
| `src/screens/matches/post-roster.mjs`, `post.css`, оба словаря, `test/post-roster.test.mjs` (новый) | 7 | «Состав», листы найма и продажи |
| `src/screens/matches/{post-money,post-review}.mjs`, `post.css`, оба словаря, `test/post-money.test.mjs` (новый) | 8 | «Казна», «Дальше», «Итог» |
| `src/screens/matches/post.mjs` (новый), `src/core/router.mjs`, `src/shell/navigation.mjs`, оба словаря, `test/post-screen.test.mjs` (новый), `test/shell-navigation.test.mjs` | 9 ⚠ | экран: чтение, записи, опрос, рамка `bare` |
| `src/screens/matches/post-advance.mjs` (новый), `src/screens/team/roster/{advance,wire}.mjs`, `src/data/post-match-client.mjs`, оба словаря, `test/post-advance.test.mjs` (новый), `test/post-match-client.test.mjs` | 10 ⚠ | прокачка листом 07d, бросок итогов |
| удалить `src/screens/games/post-match.mjs`, `src/components/post-match/{steps,players,review,shared,finance}.mjs`, `src/components/games/checklist-layout.mjs`, `src/styles/post-match.css`; `src/styles/{pre-match,matchday,site-matchday}.css`, `src/styles.css`, оба словаря, `test/legacy-screens.test.mjs` | 11 | итоги 2.x удалены |
| `scripts/mock/post.mjs` (новый), `scripts/mock-api.mjs` (одна строка), `scripts/smoke-post-match.mjs`, `test/mock-post.test.mjs` (новый) | 12 | mock и smoke |
| `scripts/rehearsal-transitions.mjs`, `scripts/rehearsal/transitions-{api,seed,finish,checks}.mjs` (новые), `package.json`, `test/rehearsal-transitions.test.mjs` (новый) | 13 ⚠ | `rehearsal:transitions` |
| `docs/redesign/screens/rd-09b.json` | 14 | снимки рядом с прототипами (контроллер) |
| спеки, план 3.0, мастер-план | 15–18 | исправления, проверки, правки спек, PR (контроллер) |

Каталог экранов — `src/screens/matches/` (ниже без префикса, где ясно).

## Маршруты этапа 09b

| Имя | Адрес | До 09b | После 09b |
|---|---|---|---|
| `postMatch` | `#/games/:id/post-match[/:step]` | итоги 2.x (`renderPostMatch`, `screens/games/post-match.mjs`) в рамке оболочки | итоги 3.0 (`renderPostMatch`, `screens/matches/post.mjs`), рамка `bare`; шаг — `POST_STEPS` |
| `game` | `#/games/:id` | страница игры 2.x | без изменений (панель «Итоги матча» ведёт сюда же) |
| `teamMatches`, `team` | | 09a | без изменений; «Итоги матча» — те же адреса |

`src/core/routes.mjs` не меняется. Новый адрес API: `POST /api/games/:id/post-match/rolls`.

## Рецепты проверки

Команды — из `/Users/felstell/git/bb-rd-09b`; каждый вызов Bash — новая оболочка, переменные — из `output/09b/env.sh` (только `source`).

**Т — тесты:** `npm run build && node --test <файлы>`; с базой — `npm run build && . output/09b/env.sh && node --test <файлы>`; полный прогон — `npm run build && . output/09b/env.sh && npm test && npm run check && npm run i18n:check`.

**С — сервер 3077 и smoke** (Task 12, 14, 16):

```bash
. output/09b/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_09b 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3077 node server/server.mjs`; дождаться `curl -fsS http://localhost:3077/api/health` (Monitor с until-циклом). Затем:

```bash
APP_URL=http://localhost:3077 npm run smoke
. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3077 npm run smoke:pre-match
. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3077 npm run smoke:friendly
. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3077 npm run smoke:post-match
```

Expected: каждый скрипт печатает свою строку `… passed …`. Сервер после — остановить.

**М — mock 5181** (Task 12, 14): `npm run build`, затем в фоне `MOCK_PORT=5181 node scripts/mock-api.mjs`; дождаться `curl -fsS http://localhost:5181/api/health`. Mock держит записи в памяти: после состояний, которые пишут, — перезапуск.

**П — прототипы 5196 и сравнение 5200** (Task 14): в фоне `python3 -m http.server 5196 --bind 127.0.0.1 --directory docs/redesign/handoff-0.9.1/prototypes` и `python3 -m http.server 5200 --bind 127.0.0.1 --directory output/screens/rd-09b`.

**Р — `rehearsal:transitions` на чистой базе** (Task 13 шаг 6, Task 16). Серверы 3077 (рецепт С) и 3004 перед началом свободны (`lsof -iTCP:3004 -iTCP:3077 -sTCP:LISTEN || echo free`).

```bash
# 1. worktree v2.1.0 (один раз)
test -d /Users/felstell/git/bb-v2.1.0 || git worktree add --detach /Users/felstell/git/bb-v2.1.0 v2.1.0
(cd /Users/felstell/git/bb-v2.1.0 && npm ci && npm run build)
# 2. чистая база по схеме 2.1.0
. output/09b/env.sh && docker exec gata-league-postgres dropdb -U gata_admin --if-exists gata_transitions_09b \
  && docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_transitions_09b
. output/09b/env.sh && (cd /Users/felstell/git/bb-v2.1.0 && DATABASE_URL="${SMOKE_URL%/*}/gata_transitions_09b" npm run db:migrate)
# 3. админ 3.0 этого прогона: тестовые значения в output/ (не в git), только source
node -e 'require("fs").writeFileSync("output/09b/transitions-admin.env", `export ADMIN_LOGIN=transitions-admin\nexport ADMIN_PASSWORD=${require("crypto").randomUUID()}\n`, { mode: 0o600 })'
```

4. В фоне: `. output/09b/env.sh && cd /Users/felstell/git/bb-v2.1.0 && DATABASE_URL="${SMOKE_URL%/*}/gata_transitions_09b" APP_PORT=3004 node server/server.mjs`; дождаться `curl -fsS http://localhost:3004/api/health`.
5. `npm run rehearsal:transitions -- --seed http://localhost:3004` → `rehearsal:transitions: seeded 5 states …`; остановить сервер 3004.
6. `. output/09b/env.sh && DATABASE_URL="${SMOKE_URL%/*}/gata_transitions_09b" npm run db:migrate` → применены 009–016.
7. В фоне: `. output/09b/env.sh && . output/09b/transitions-admin.env && DATABASE_URL="${SMOKE_URL%/*}/gata_transitions_09b" APP_PORT=3077 node server/server.mjs`; дождаться health.
8. `. output/09b/transitions-admin.env && npm run rehearsal:transitions -- --finish http://localhost:3077` → пять строк `ok`, код 0; остановить сервер; `docker exec gata-league-postgres dropdb -U gata_admin gata_transitions_09b`.

---

### Task 0: База — сверка якорей и базовый прогон (контроллер)

Ветка уже на `origin/redesign` `dad7982` (09a влит); переноса нет. Коммита нет, кроме случая шага 2.

- [ ] **Step 1: База.** `git fetch origin && git log --oneline origin/redesign -1` → `dad7982` или новее. Новее — `git rebase origin/redesign`, затем шаг 2 по `git diff --stat dad7982 origin/redesign`.
- [ ] **Step 2: Якоря плана.** Для каждой строки — `grep -n` имени; число строки, имя или сигнатура разошлись — поправить план отдельным коммитом `docs(plan): stage 09b — anchors` (с трейлером).

| Файл | Якорь на `dad7982` |
|---|---|
| `server/season/post-match.mjs` (141) | `postSources` :36, `loadPost` :53, `points` :65, `finishPost` :72, `resetSide` :100, `accessPostMatch` :109 |
| `server/routes/post-match.mjs` (17) | регулярное выражение :6 |
| `server/routes/team-rolls.mjs` (88) | `checkRoll` :40, `rollForOwner` :52 |
| `server/api/dice-rolls.mjs` (304) | `publicRoll` :76, `rollForPlayer` :143, `settleRosterRolls` :211 |
| `src/domain/post-match/state.mjs` (142) | `performAction` :84 (`advance` :102), `applyPostAction` :133 |
| `src/domain/post-match/roster.mjs` (185) | `applyFavoured` :28, `postPlayers` :39, `applyPostAdvancement` :61, `projectPostRoster` :128, `fallenPlayers` :172 |
| `src/screens/matches/prep-frame.mjs` (144) | `dotsMarkup` :34, `stepsMarkup` :45, `noticesMarkup` :64, `prepCtaMarkup` :81, `prepFrameMarkup` :129 |
| `src/screens/team/roster/advance.mjs` (514) | `takeChosen` :237 (`advancePlayer` :255), `askFor` :300 (`askRoll` :313), `bindSiteRoll` :331 (`bindRoll` :340), `advanceHandlers` :442 |
| `src/screens/team/roster/wire.mjs` (320) | `wireAdvance` :170, `wireReasons` :212 |
| `src/core/router.mjs` (160) | импорт `renderPostMatch` :44, `postMatch` :87 |
| `src/shell/navigation.mjs` (172) | `BARE_ROUTES` :31 |
| `scripts/mock-api.mjs` (599) | список `answerApi` :556 |

- [ ] **Step 3: Этап 10.** `git -C /Users/felstell/git/bb-rd-10 log --oneline dad7982..HEAD --stat` — тронут ли файл из «09b владеет» или кусок, названный в Global Constraints (`router.mjs`, `navigation.mjs`, `styles.css`, словари — ожидаемо). Иное — стоп, вопрос координатору.
- [ ] **Step 4: Базовый прогон** — рецепт Т, полный: всё зелёное, одинаковое число страниц EN/RU, 0 fallback. Красная база — стоп.

---

### Task 1: Домен — прокачка итогов несёт бросок; бонус Favoured — отдельное действие ⚠ ревью сразу

**Files:**
- Modify: `src/domain/post-match/state.mjs` (`performAction` :84), `src/domain/post-match/roster.mjs` (`applyFavoured` :28, `postPlayers` :39, `applyPostAdvancement` :61)
- Create: `test/post-match-rolls.test.mjs`
- Test: `test/post-match.test.mjs` (тест «Favoured bonus uses manual D8 …», :270 — по решению 21)

**Interfaces:**
- Consumes: `takeAdvancement` и его `choiceRoll` (правило формы броска: `{id, via: "site"}` или `{via: "table"}`, только у `random` и `stat`; `src/domain/roster/progression.mjs:395`), `FAVOURED_ROLLS`, `postError` (`rules.mjs`), `favouredSkillsForChoice` (`domain/roster/team-rules.mjs`).
- Produces:
  - Действие `advance` (`stage === 2`): `{type: "advance", playerId, advancementType, grant, roll?}` — выбор в `side.advancements[playerId]` хранится как `{type, grant, roll?}` (без `favouredRoll`/`favouredSkill`); `roll` неверной формы, или у типа, который не бросают, — `postError("POST_ADVANCEMENT")`; `roll.id`, который уже назван другим выбором стороны, — `postError("DICE_ROLL_USED")`.
  - Действие `favoured` (`stage === 2`): `{type: "favoured", playerId, skill}` — к последнему выбору игрока: `favouredRoll = FAVOURED_ROLLS[alignment]`, `favouredSkill = skill`; у состава без `favouredChoice`, у игрока без выбора — `POST_ACTION`; навык не бога или уже у игрока (по составу итогов) — `POST_FAVOURED`.
  - `applyFavoured`: без `favouredRoll` — бонуса нет (не бросает `POST_DICE`); с ним — как было.
  - `postPlayers`: прокачка блоба получает `roll` выбора — `{type, grants, roll}` (`applyPostAdvancement` после `applyAdvancement` заменяет `player.advancements.at(-1)` на `{...last, roll}`, как `takeAdvancement`; у «навыка вместо характеристики» тип остаётся `stat`).
  - Действия 2.x (`advance` с `favouredRoll` в теле) по-прежнему читаются: `favouredRoll`/`favouredSkill` из тела `advance` переносятся в выбор, если пришли (состояния, начатые в 2.x, и старые клиенты).

- [ ] **Step 1: Падающие тесты** — `test/post-match-rolls.test.mjs` (помощники — как `test/post-match.test.mjs`: состояние через `createPostMatch` на составах из `public/data.en.json`, шаги до «Игроков» через `applyPostAction`):

```js
test("an advancement of the post-match keeps the roll it names, and one roll is not named twice", () => {
  const state = toPlayers(); // the side at stage 2 with SPP to spend
  const roll = { id: "8f6c1d1e-0000-4000-8000-000000000001", via: "site" };
  const next = applyPostAction(state, "home", { type: "advance", playerId: "h1", advancementType: "random", grant: { skill: "Block" }, roll }, data);
  assert.deepEqual(next.home.advancements.h1, [{ type: "random", grant: { skill: "Block" }, roll }]);
  const player = projectPostRoster(next, "home", data).roster.players.find(({ id }) => id === "h1");
  assert.deepEqual(player.advancements.at(-1), { type: "random", grants: { skill: "Block" }, roll });
  assert.throws(() => applyPostAction(next, "home", { type: "advance", playerId: "h2", advancementType: "random", grant: { skill: "Dodge" }, roll }, data), { code: "DICE_ROLL_USED" });
});
```

  Ещё тесты:
  - «a chosen type takes no roll, and a roll of another shape is refused» — `primary` с `roll: {via: "site", id}` → `POST_ADVANCEMENT`; `random` с `roll: {via: "dice"}` → `POST_ADVANCEMENT`; `stat` с `{via: "table"}` → в прокачке блоба `roll: {via: "table"}`.
  - «a characteristic advancement taking a skill in its place keeps its roll and its type» — `stat` с `grant: {skill}` и броском → `{type: "stat", grants: {skill}, roll}`.
  - «a Favoured roster's advancement needs no D8: the bonus is added after it, or not at all» — состав с `favouredChoice: "Khorne"`: `advance` без `favouredRoll` → без бонуса, `projectPostRoster` не бросает; `favoured {playerId, skill: <навык Khorne>}` → у игрока `favouredSkills` с ним; чужой навык → `POST_FAVOURED`; без выбора у игрока → `POST_ACTION`.
  - «a 2.x step with the D8 in the advancement is read as before» — `advance` с `favouredRoll: 8, favouredSkill` (Khorne) → бонус есть.
  - «undoing an advancement takes its roll away from the side» — `undo-advance` → выбор снят, тот же `roll.id` берётся снова без `DICE_ROLL_USED`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-match-rolls.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Тест 2.x `post-match.test.mjs:270` — оставить «may be declined», утверждение «D8 обязателен» (если есть) — заменить на «без D8 — без бонуса» и назвать это в сообщении коммита. Шапку `state.mjs` (комментарий у `advance`) дополнить: «An advancement may name its roll (stage 09b): the site's, kept until the finish uses it (server), or the table's. The Favoured bonus is its own step, as on the roster (07d decision 17).»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/post-match.test.mjs test/post-match-client.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/post-match/state.mjs src/domain/post-match/roster.mjs test/post-match-rolls.test.mjs test/post-match.test.mjs
git commit -m "feat(post-match): an advancement of the post-match names its roll, the site's or the table's, as the roster's does; one roll for one advancement; the Favoured bonus is a step of its own, added after the advancement or not at all" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): requesting-code-review по диффу задачи; упор — Review Focus 2, что состояния 2.x читаются как прежде, что `projectPostRoster` не бросает там, где 2.x не бросал.

---

### Task 2: Домен — записи стороны, расхождение со счётом, очки, MVP, кто вернётся

**Files:**
- Create: `src/domain/post-match/score.mjs`, `test/post-match-score.test.mjs`

**Interfaces:**
- Consumes: `POST_STATS`, `mvpCount`, `effectiveInjury`, `postOutcome` (`rules.mjs`), `earnedCounters`, `earnedSpp` (`statistics.mjs`), `MATCH_COUNTERS`, `sideFollowsEvents` (`events.mjs`), `matchPoints`, `seasonPoints` (`domain/league-rules.mjs`), `SIDES`, `otherSide` (`domain/match/rules.mjs`).
- Produces (чистый, без DOM и `t()`; шапка — что считает и почему записи — это статистика стороны 3.0, решение 4):
  - `hasRecords(side) → boolean` — сторона начата в 3.0: в ней есть ключ `followsEvents` (`Object.hasOwn`).
  - `sideRecords(side) → {touchdowns, casualties, count, scorers: {id, number, name, touchdowns, casualties}[]} | null` — `null` без записей; `touchdowns`/`casualties` — суммы `side.statistics`; `count` — сумма всех `MATCH_COUNTERS` и травм `side.injuries` (решение 4); `scorers` — игроки снимка с TD или CAS, в порядке снимка.
  - `scoreMismatches(state) → {side: "home"|"away", counter: "touchdowns"|"casualties", score: number, records: number}[]` — по правилу `validateStatistics` (`statistics.mjs:37`): технический — счёт 0; TD проигравшего сдачу не сверяются; сторона без записей — нет; без счёта — `[]`.
  - `POINT_PARTS` — `Object.freeze(["win", "draw", "loss", "bigWin", "shutout", "casualties", "technical"])`.
  - `postPoints(state, name, kind) → {total: number, parts: {key: string, points: number}[]}` — `kind` `"friendly"` → `{total: 0, parts: []}`; технический — `{total: 2|0, parts: [{key: "technical", points: 2}]}` у победителя; иначе `total` — `matchPoints(...)`, части — по `seasonPoints` (`win`/`draw`/`loss`, `bigWin` при разнице ≥ `bigWinMargin`, `shutout` при сухой победе, `casualties` при CAS ≥ `casualtyThreshold`), сумма частей = `total`. Те же числа, что `points` сервера (`server/season/post-match.mjs:65`).
  - `mvpChoices(state, name) → {count: number, top: Choice[], rest: Choice[]}`, `Choice` — `{id, number, name, spp}`: годные — снимок без звёзд и без мёртвых (`effectiveInjury(...).code === "dead"`); `top` — с `earnedSpp` без MVP > 0, по убыванию, при равенстве — порядок снимка; `rest` — прочие годные по номеру; `count` — `mvpCount`.
  - `nextMatchChanges(state, name, roster) → {returning: {id, number, name}[], missing: {id, number, name, injury: object|null, retired: boolean}[]}` — `roster` — `projectPostRoster(...).roster`: вернувшиеся — в `baseRoster` `skipNextGame`, в `roster` — нет; пропускающие — `skipNextGame` в `roster`, `injury` — `effectiveInjury` этих итогов (или `null` — старая причина).

- [ ] **Step 1: Падающие тесты** — `test/post-match-score.test.mjs` (состояния — как Task 1):
  - «a side's records are its statistics: TD, CAS, the scorers and how many steps» — статистика хозяев: TD 1 у двоих, CAS 2 и CAS 1, одна травма → `{touchdowns: 2, casualties: 3, count: 6, scorers: [<двое с TD>, <двое с CAS>]}` в порядке снимка.
  - «a side begun before 3.0 has no records» — `delete side.followsEvents` → `hasRecords` false, `sideRecords` null, `scoreMismatches` без неё.
  - «a mismatch is what lock-players would refuse: a side, a counter, the score and the records» — счёт 3–1, записи 2–1 → `[{side: "home", counter: "touchdowns", score: 3, records: 2}]`; для того же состояния `applyPostAction(…, {type: "lock-players"})` бросает `POST_STATISTICS`; при пустом расхождении — не бросает (MVP выбран). Технический: записи TD 1 → расхождение `score: 0`. Сдача: TD проигравшего не сверяются.
  - «points as the table counts them, in parts that add up» — 3–0, CAS 3 → `postPoints(...).total === matchPoints({touchdownsFor: 3, touchdownsAgainst: 0, casualtiesFor: 3})`, части `win`, `bigWin`, `shutout`, `casualties`, сумма = total; ничья; поражение; технический победитель 2, проигравший 0; товарищеский — 0 и `[]`.
  - «MVP choices leave out stars and the dead; rookie protection makes Dead Badly Hurt» — звезда не в списке; «Dead» при `gamesPlayed: 3` — нет, при `gamesPlayed: 1` — есть (Badly Hurt); `top` по SPP; `count` 2 у победителя технического, 0 у проигравшего.
  - «who comes back and who misses the next match» — пропускавший до матча без травмы → `returning`; травма `miss` → `missing` с `injury.code`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-match-score.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/post-match/score.mjs test/post-match-score.test.mjs
git commit -m "feat(post-match): the score against the match records — a side's records, the mismatch lock-players would refuse, the points in parts, the MVP choices with the ones who stood out first, who comes back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Сервер — бросок итогов, бросок прокачки под блокировкой, `used_at` при завершении, очки из домена ⚠ ревью сразу

**Files:**
- Modify: `server/routes/post-match.mjs`, `server/routes/team-rolls.mjs` (`export` у `checkRoll` :40), `server/season/post-match.mjs` (`points` :65 — удалить; `finishPost` :72; `accessPostMatch` :109; новый `rollInPostMatch`), `server/api/dice-rolls.mjs` (новый `checkPostRoll`)
- Create: `test/post-match-rolls-api.test.mjs`
- Test: `test/post-match-events-db.test.mjs` (утверждение о строках MVP)

**Interfaces:**
- Consumes: `postPoints` (Task 2), выбор с `roll` (Task 1), `rollForPlayer`, `publicRoll`, `settleRosterRolls` (`dice-rolls.mjs`), `checkRoll` (`team-rolls.mjs`), `postPlayers` (`domain/post-match/roster.mjs`), `teamBySlug` (`server/domain/roster.mjs`), `isUuid` (`server/api/team-access.mjs`), `rollFitsAdvancement` (`domain/roster/dice.mjs`); помощники тестов `withApiDatabase`, `callApi`, `sessionFor`, `seedCoach` (`test/helpers/api-db.mjs`), `startedFriendly`, `coaches`, `teams`, `G`, `toPlayersStep`, `toReady`, `homeScores`, `act` (`test/helpers/match-db.mjs`).
- Produces:
  - Маршрут: `server/routes/post-match.mjs` — путь `^/api/games/([0-9a-f-]+)/post-match/rolls$` и `POST` → `sendJson(200, {roll: publicRoll(await rollInPostMatch(id, user, checkRoll(body), body))})`; прочие методы — 405.
  - `rollInPostMatch(pairingId, user, {purpose, category}, body, {rng = serverDie} = {}) → Promise<object>` (`server/season/post-match.mjs`; `rng` — для тестов, как у `rollForPlayer`): транзакция с теми же блокировками и в том же порядке, что `accessPostMatch` (пара, обе команды, строка итогов `FOR UPDATE`), `followEvents`; `name = body.side || viewerSide`; отказы: не тренер этой стороны (админу тоже) — 403 `FIXTURE_NOT_YOURS`; итоги `completed` — 409 `POST_CLOSED`; `side.stage !== 2` или `side.confirmed` — 409 `POST_ACTION`; игрока нет в `side.baseRoster.players` — 404 `PLAYER_NOT_FOUND`. Затем `rollForPlayer(client, {teamRow: {id, base_team_slug, roster: {...side.baseRoster, players: postPlayers(state, name, data).filter((p) => !p.kind)}}, playerId, purpose, category, userId: user.id})`. Состояние итогов не меняется и не сохраняется (ревизия та же). Шапка: решение 22.
  - `checkPostRoll(client, {teamId, playerId, roll, advancement: {type, grants}}) → Promise<void>` (`dice-rolls.mjs`): `roll.via !== "site"` — ничего; `isUuid(roll.id)` нет, строки нет в команде, `player_id` другой, `!rollFitsAdvancement(row, advancement)` — 422 `DICE_ROLL_MISMATCH {playerId}`; `used_at` есть или это не самый ранний ждущий бросок игрока (`WAITING_ROLLS`, :43) — 409 `DICE_ROLL_USED`.
  - `accessPostMatch`: перед `applyPostAction` у `advance` с `roll.via === "site"` — `checkPostRoll(client, {teamId: sources[name].team.id, playerId: action.playerId, roll: action.roll, advancement: {type: action.advancementType, grants: action.grant}})`.
  - `finishPost`: по каждой стороне после `validatePostSide` и до `applyPostMatchRoster` — `await settleRosterRolls(client, {teamId: state[name].team.id, race: teamBySlug(state[name].team.baseTeamSlug), before: state[name].baseRoster, after: projection.roster})`; очки — `postPoints(state, name, fixture.match_kind).total`.

- [ ] **Step 1: Падающие тесты** — `test/post-match-rolls-api.test.mjs` (`const db = { skip: scratchSkip }`; матч — `startedFriendly`, итоги до «Игроков» — `toPlayersStep` и `act`; у игрока хозяев SPP на прокачку — `UPDATE saved_teams` после `startedFriendly`, до первого чтения итогов):

```js
test("a roll of the post-match is the side's coach's, on the Players step, for a roster player, by the roster the post-match holds", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,1,spp}', '{\"bonus\": 30}') WHERE id = $1", [teams.home]);
  await toPlayersStep(); // both sides at stage 2; the post-match takes the roster as it is now
  const token = await sessionFor(client, coaches.home.id);
  const ask = (body, who = token) => callApi("POST", `/api/games/${G}/post-match/rolls`, { token: who, body });
  const answer = await ask({ playerId: "home-1", purpose: "random_skill", category: "General" });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.roll.playerId, "home-1");
  assert.equal(answer.body.roll.result.dice.length, 2);
  const away = await sessionFor(client, coaches.away.id);
  assert.equal((await ask({ side: "home", playerId: "home-1", purpose: "stat" }, away)).status, 403);
  const admin = await sessionFor(client, (await seedCoach(client, "boss", { admin: true })).id);
  assert.equal((await ask({ side: "home", playerId: "home-1", purpose: "stat" }, admin)).status, 403);
  assert.equal((await ask({ playerId: "nobody", purpose: "stat" })).body.error.code, "PLAYER_NOT_FOUND");
}));
```

  (Порядок строк: `startedFriendly(client)`, затем `UPDATE` SPP игрока `home-1`, затем `toPlayersStep()` — состав итогов берётся при их первом чтении. Журнеймен: снимок `startedFriendly` его не держит — `PLAYER_NOT_FOUND` проверяется игроком не из состава; журнеймен на экране — Task 10.) Ещё тесты:
  - «asked again it is the same roll; asked for the other purpose it is DICE_ROLL_WAITING» — второй `random_skill` → тот же `id`; `stat` → 409 `DICE_ROLL_WAITING`.
  - «the roll is by the post-match's roster: a skill taken in this post-match is not rolled» — `home-1` взял в итогах `primary` «Block» (General); `rollInPostMatch(G, coaches.home, {purpose: "random_skill", category: "General"}, {}, {rng})`, где `rng` сначала даёт грань «Block» колонки General → у первого кубика первая попытка `duplicate: true`, навык кубика — не «Block».
  - «not on the Players step, or the post-match finished: nothing is rolled» — сторона на `stage` 3 → 409 `POST_ACTION`; `dice_rolls` — 0 строк.
  - «an advancement naming another player's, a used or an unfitting roll is refused and writes nothing» — бросок `home-1`, `advance` для `home-2` с ним → 422 `DICE_ROLL_MISMATCH`; `random` с навыком, которого нет ни на одном кубике → 422; ревизия итогов не выросла.
  - «the finish uses the roll once; a refused finish uses none» — `advance` с броском, итоги до `ready` (`toReady`), ревизию команды гостей поднять → `finish` 409 `POST_TEAM_CHANGED`, `used_at IS NULL`; `reset-side`, снова до `ready`, `finish` → 200, `used_at` есть, в блобе у игрока прокачка `{type: "random", grants: {skill}, roll: {id, via: "site"}}`.
  - «an undone advancement leaves its roll waiting» — `advance`, `undo-advance`, просьба броска → тот же `id`, `used_at IS NULL`.
  - «the points of a finished league match are the domain's» — в существующем тесте лиги (или новом) — `home_points` = `postPoints(...).total`; товарищеский — 0.
  - `test/post-match-events-db.test.mjs`, в тест «a match tapped in 3.0 …»: после завершения `SELECT count(*) FROM match_events WHERE pairing_id = $1 AND counter = 'mvps'` → 0 (передача 07a).
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && . output/09b/env.sh && node --test test/post-match-rolls-api.test.mjs test/post-match-events-db.test.mjs` → FAIL (404 маршрута).
- [ ] **Step 3: Реализовать** по Interfaces. Шапку `server/season/post-match.mjs` дополнить абзацем о броске итогов и `used_at` при завершении; шапку `dice-rolls.mjs` — строкой о `checkPostRoll`.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-rolls-api.test.mjs test/team-in-match-api.test.mjs test/finance-store.test.mjs` → PASS без изменений; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add server/routes/post-match.mjs server/routes/team-rolls.mjs server/season/post-match.mjs server/api/dice-rolls.mjs test/post-match-rolls-api.test.mjs test/post-match-events-db.test.mjs
git commit -m "feat(server): the post-match rolls its own dice — the side's coach, on the Players step, by the roster the post-match holds; an advancement's site roll is checked under the lock and used once at the finish; the points are the domain's" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): упор — Review Focus 2, порядок блокировок (как `accessPostMatch`), что `POST …/rolls` команды по-прежнему отказывает `TEAM_IN_MATCH`, что отказ завершения ничего не тратит.

---

### Task 4: Рамка и модель итогов

Прототипы: телефон — шапка, точки, подвал всех `Post*.html`; десктоп — полоса, шаги со сводками, колонка `DeskPostResult.html`, `DeskPostPlayers.html`, `DeskPostReview.html`. Сверять (решения 1–3).

**Files:**
- Modify: `src/screens/matches/prep-frame.mjs` (аддитивно), оба словаря
- Create: `src/screens/matches/post-model.mjs`, `test/post-model.test.mjs`
- Test: `test/match-prep.test.mjs` (рамка подготовки — без изменений)

**Interfaces:**
- Consumes: `POST_STEPS`, `resultAgreed` (`rules.mjs`), `postIncome`, `nextDedicatedFans` (`finance.mjs`), `projectPostRoster` (`roster.mjs`), `earnedSpp`, `effectiveInjury`, `sideRecords`, `postPoints` (Task 2), `postMatchUrl`, `teamUrl`, `gameUrl` (`core/routes.mjs`), `formatMoney` (`core/format.mjs`), `otherSide`.
- Produces:
  - `prepFrameMarkup(model, {phone, contentHtml, asideHtml, cardTitle, footHtml, opponentHtml, actionLeadHtml, noticesHtml})` — новые пропсы: `opponentHtml` (строка; задан — стоит вместо `opponentCard(model)`, `""` — карточки нет), `actionLeadHtml` (в панели кнопки десктопа перед кнопкой), `noticesHtml` (после заметок под шапкой); навигация шагов — `aria-label` `model.stepsLabel ?? t("pre.steps")`. Без новых пропсов разметка та же.
  - `postModel(payload, sideName, step, ui) → PostModel` (`post-model.mjs`, без DOM): поля рамки, как у `prepModel` — `{gameId, teamId, isAdmin, sideName, sides: {home, away}, step, stepIndex, current, steps: {key, label, state: "done"|"current"|"open"|"later", summary, href|null, onScreen}[], stepsLabel, title, sub, deskTitle, deskSub, back, readonly, readonlyWhy: "", error, footer, opponent: {text, done}}` и данные итогов: `{post, own, other, preview, completed, confirmed, agreed, passed, rosterChanged, kind}` — `preview` — `projectPostRoster` своей стороны (ошибка домена — превью без операций и казны, как `previewPost` 2.x, `invalid` — её код); `passed` — шаг на экране раньше текущего. `current` — `side.stage`; шаг на экране — запрошенный (`POST_STEPS.indexOf`), не дальше текущего, иначе текущий. Сводки — решение 2; `back` — `teamUrl(own.teamId, "matches")`, админу не своей стороны — `gameUrl`. `footer` — по умолчанию следующий шаг ссылкой `after.next.<следующий>`, закрытый с `after.wait…`, пока он не открыт; шаги переопределяют его в Task 5–8 (модель шага — функции тех модулей).
  - `opponentState(post, sideName) → "same"|"step"|"agreed"|"sent"|"waiting"|"none"|"confirmed"|"confirmWaiting"` и слова `after.opponent.<state>` (`{step}`, `{score}`).
  - `scoreWords(post, viewerSide) → string` — «2–1»: TD своей стороны, затем соперника (подпись прототипа «Соперник подтвердил счёт 2–1» у хозяев при 2–1), `""` без счёта.

Словари (en / ru; главные — остальные по образцу, все в `after.*`):

| ключ | en | ru |
|---|---|---|
| `after.title` | After the match | После матча |
| `after.titleDesk` | After the match · {match} | После матча · {match} |
| `after.round` | Round {round} | Тур {round} |
| `after.roundDesk` | round {round} | тур {round} |
| `after.friendly` | Friendly | Товарищеский |
| `after.sub` | {match} · {teams} | {match} · {teams} |
| `after.scoreLine` | {home} {score} {away} | {home} {score} {away} |
| `after.versus` | {home} — {away} | {home} — {away} |
| `after.steps` | Post-match steps | Шаги итогов |
| `after.step.result` … `after.step.review` | Score, Income, Players, Roster, Treasury, Next, Summary | Счёт, Доход, Игроки, Состав, Казна, Дальше, Итог |
| `after.next.fans` | Next: income and fans | Далее: доход и фанаты |
| `after.next.players` | Next: players | Далее: игроки |
| `after.next.roster` | Next: roster | Далее: состав |
| `after.next.finance` | Next: treasury | Далее: казна |
| `after.next.next` | Next: the next match | Далее: следующий матч |
| `after.next.review` | Next: summary | Далее: итог |
| `after.now` | now | сейчас |
| `after.sum.result` | {score} · confirmed | {score} · подтверждён |
| `after.sum.resultOpen` | being entered | вводим |
| `after.sum.fans` | {income} · fans {from} → {to} | {income} · фаны {from} → {to} |
| `after.sum.players` | {spp} SPP · injuries: {count} | {spp} SPP · травм: {count} |
| `after.sum.finance` | safe +{amount} | сейф +{amount} |
| `after.sum.next` | captain {name} | капитан {name} |
| `after.opponent.same` | The opponent is on this step | Соперник на этом шаге |
| `after.opponent.step` | The opponent is on «{step}» | Соперник на шаге «{step}» |
| `after.opponent.agreed` | The opponent confirmed the score {score} | Соперник подтвердил счёт {score} |
| `after.opponent.sent` | The opponent sent the score {score} | Соперник прислал счёт {score} |
| `after.opponent.waiting` | Waiting for the opponent to confirm | Ждём подтверждения соперника |
| `after.opponent.none` | The opponent has not entered a score yet | Соперник ещё не вводил счёт |
| `after.opponent.confirmed` | The opponent confirmed the summary | Соперник подтвердил итог |
| `after.opponent.confirmWaiting` | Waiting for the opponent to confirm | Ждём подтверждения соперника |
| `after.passed` | This step is done. | Шаг пройден. |
| `after.reopen` | Change from «Income»… | Изменить с шага «Доход»… |
| `after.rosterChanged` | The team changed after the post-match began. | Команда изменилась после начала итогов. |
| `after.reset` | Start over with the current roster | Начать заново с текущим составом |
| `after.completed` | The match is finished | Матч завершён |
| `after.loading` | Reading the post-match… | Читаем итоги… |
| `after.unread` | The post-match could not be read: {reason} | Итоги не прочитаны: {reason} |

- [ ] **Step 1: Падающие тесты** — `test/post-model.test.mjs` (нагрузка — `{postMatch, viewerSide, isAdmin, rosterChanged, fixture: {id, kind, seasonName, roundNumber}}` из `createPostMatch`/`applyPostAction`, как Task 1):
  - «the steps as the side stands: done, on screen, current, later; a step asked beyond the current is the current» — сторона на `stage` 2, запрошен `review` → шаг `players`; `steps[0..1]` `done` со ссылками, `[2]` `current`, `[3..6]` `later` без ссылок; запрошен `result` → `passed`, `onScreen` на нём.
  - «the frame's words: a phone's title and sub, a desk's band, back to the team's matches» — «After the match», «Round 7 · Mock Team 2–1 Mock Rivals» (без счёта — «Mock Team — Mock Rivals»; товарищеский — «Friendly · …»), «After the match · round 7»; `back` — `teamUrl(…, "matches")`, у админа не своей стороны — `gameUrl`.
  - «a desk's summaries» — «2–1 · confirmed», «+80k · fans 3 → 4», «+14 SPP · injuries: 1», «now» у текущего.
  - «the opponent's line on each step» — каждое состояние `opponentState` и его слова, точка `done`.
  - «a projection the domain refuses is drawn without the roster's steps, and says why» — `operations` с продажей при 7 → `preview.invalid === "POST_SELL"`.
  - `test/match-prep.test.mjs`: «a frame given none of the new props is drawn as before» — разметка `prepFrameMarkup(model, {phone, contentHtml})` подготовки равна снимку строки до правки; «with them: no opponent card, a lead before the button, notices under the head, the steps' own label».
  - «every key in both dictionaries», ключи из шаблонов — `after.step.*` по `POST_STEPS`, `after.next.*` по `POST_STEPS.slice(1)`, `after.opponent.*` по состояниям.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-model.test.mjs test/match-prep.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `prep-frame.mjs`: «The post-match draws in the same frame (stage 09b): its steps' label, its own notices, no opponent card, a chip over the button.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/prep-frame.mjs src/screens/matches/post-model.mjs src/i18n/en.json src/i18n/ru.json test/post-model.test.mjs test/match-prep.test.mjs
git commit -m "feat(post): the post-match's model in the preparation's frame — seven steps as the prototype names them, a desk's summaries, the opponent's line, the way back to the team's matches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: «Счёт» и «Доход»

Прототипы: «Счёт» — `mobile/PostResult.html`, `PostResultMismatch.html` (`CFG`: TD 3 у нас), `desktop/DeskPostResult.html`; «Доход» — `mobile/PostFans.html` (десктопа нет: карточки в рамке десктопа). Сверять (решения 4–8).

**Files:**
- Create: `src/screens/matches/post-steps.mjs`, `src/screens/matches/post.css`, `test/post-steps.test.mjs`
- Modify: `src/styles.css` (`@import url("screens/matches/post.css");` последним), оба словаря

**Interfaces:**
- Consumes: `postModel` (Task 4), `sideRecords`, `hasRecords`, `scoreMismatches`, `postPoints` (Task 2), `RESULT_MODES`, `postOutcome`, `resultAgreed` (`rules.mjs`), `postIncome`, `nextDedicatedFans`, `PAINTING_BONUS` (`finance.mjs`), `renderStepButton` (`ui/stepper.mjs:33`), `renderSegmentedControl`, `renderToggle` (`ui/toggle.mjs:18`), `renderStatusChip`, `formatMoney`.
- Produces:
  - `resultStep(model, draft) → {contentHtml, asideHtml, footer}` — `draft` — черновик экрана `{mode, winner, own: {touchdowns, casualties}, other: {…}, changed: boolean, unlocked: boolean}` (Task 9 держит его; `resultDraft(model)` — начальный: отправленный счёт, иначе записи сторон, иначе нули). Карточки (`PostResult`): «Из записей матча» (заголовок 700 12px 0.06em заглавными `--muted`, чип «записей: 8 + 3» 700 12px `--on-accent-tint`; строки «подпись — значение» от 44px, 15/1.25, подпись `--muted` с подстрокой 12px, значение 600 `--ink` `nowrap`; подпись 13/1.45 `--muted`), степперы (сетка `minmax(0,1fr) auto minmax(0,1fr)`, зазор 8; названия команд 700 13px переносятся; кнопки 40px от 901px и 44px до 900px, радиус 9, фон `--surface`, значение Oswald 700 20px шириной 30; группа — фон `--surface-2`, радиус 12, отступ 3; «TD»/«CAS» 700 13px `--muted`; кнопки — `data-after-score="own|other"`, `data-after-counter`, `data-delta`, закрыты по краям 0…99, при «Техническом», после согласия до «Изменить счёт…»), «Для вас: Победа» 14px `--muted` и «+4 очк.» 700 15px `--on-accent-tint`, плашка расхождения (`role="alert"`, `--danger-tint`, `--on-danger-tint`, радиус 14, отступ 12 14, заголовок 700 14px, текст 13/1.45), «Как закончился матч» — радиогруппа 2×2 (`data-after-mode`; кнопки от 44px, радиус 10; выбранная — `--accent-tint-soft` с кольцом 2px `--accent`, 700; прочие — `--surface` с кольцом 1px `--line-strong`, 600; 14px) и при не «Сыграно» — «Победитель» (`renderSegmentedControl`, `data.segGroup: "after-winner"`), подпись о режимах, подпись «Один вводит…». Десктоп — те же карточки в карточке шага; в колонке — `actionLeadHtml` с чипом строки о сопернике (Task 9 кладёт). `footer` — решение «Как идёт каждая запись»: `{kind: "action", action: "result", label: "after.send"}` / `"agree-result"` («Подтвердить счёт 2–1») / после правки черновика — «Отправить свой счёт»; свой неподтверждённый — следующий шаг закрытым с `after.waitAgree`; согласован — ссылка «Далее: доход и фанаты», тихая `quiet: {action: "unlock-result", label: "after.change"}`; счёт лиги — плашка `after.official`, ссылка дальше.
  - `fansStep(model, draft) → {contentHtml, footer}` — `draft` `{roll, technicalRoll, painted, stalling}` (`fansDraft(model)` — из стороны); грани D6 (`role="radiogroup"`, `data-after-fans`, 6 колонок, зазор 6, 46px, Oswald 20px, как PreFans 09a) — D3 у проигравшего сдачу, нет у ничьей; «Dedicated Fans 3 → 4» 700 16px (`--on-accent-tint` при росте, иначе `--muted`) и объяснение; D3 технической победы (`data-after-technical`); «Доход за матч» — строки `postIncome` над черновиком (подсчёт — домен над копией состояния с черновиком), «Итого» и «+80k» Oswald 700 28px `--on-accent-tint`; переключатели (`renderToggle`, `key` `stalling`/`painted`, строки 56px, черта `--line`). `footer` — «Далее: игроки», `action: "fans"`, закрыта, пока грань не выбрана (кроме ничьей), с `after.fansNeedRoll`.

Словари (en / ru; главные):

| ключ | en | ru |
|---|---|---|
| `after.records` | From the match records | Из записей матча |
| `after.recordsCount` | records: {own} + {other} | записей: {own} + {other} |
| `after.yours` | Yours | Ваши |
| `after.theirs` | Opponent | Соперник |
| `after.theirsSub` | from the opponent's records on the «Roster» | из записей соперника в «Составе» |
| `after.scorers` | TD: {td} · CAS: {cas} | TD: {td} · CAS: {cas} |
| `after.totals` | TD {td} · CAS {cas} | TD {td} · CAS {cas} |
| `after.noRecords` | begun before 3.0: no records | матч начат до 3.0: записей нет |
| `after.recordsNote` | The score below is filled from the records. If the opponent kept no count, their part is zeros — the opponent corrects it when confirming. | Счёт ниже подставлен из записей. Если соперник не вёл счётчики, его часть — нули: соперник поправит её при подтверждении. |
| `after.forYou` | For you: {outcome} | Для вас: {outcome} |
| `after.outcome.win` / `.draw` / `.loss` | Win / Draw / Loss | Победа / Ничья / Поражение |
| `after.points` | +{points} pts | +{points} очк. |
| `after.offTable` | Friendly: off the table | Товарищеский: вне таблицы |
| `after.part.win` | +{points} for the win | +{points} за победу |
| `after.part.draw` | +{points} for the draw | +{points} за ничью |
| `after.part.loss` | +{points} for the loss | +{points} за поражение |
| `after.part.bigWin` | +{points} for 3+ TD ahead | +{points} за разницу 3+ |
| `after.part.shutout` | +{points} for a clean sheet | +{points} за сухую победу |
| `after.part.casualties` | +{points} for 3+ CAS | +{points} за 3+ CAS |
| `after.part.technical` | +{points} for a technical win | +{points} за техническую победу |
| `after.mismatch` | The score does not match the records | Счёт расходится с записями |
| `after.mismatchOwn` | your {counter}: {score} in the score, {records} in the records | ваши {counter}: {score} в счёте, {records} в записях |
| `after.mismatchOther` | the opponent's score does not match the opponent's records | у соперника счёт расходится с записями |
| `after.mismatchTail` | On the «Players» step the players' TD and CAS must add up to the score — add or take away a record there. | На шаге «Игроки» сумма TD и CAS игроков должна совпасть со счётом — там добавьте или уберите запись. |
| `after.howEnded` | How the match ended | Как закончился матч |
| `after.mode.played` / `.technical` / `.conceded` / `.conceded-safe` | Played / Technical / Conceded / Conceded, no penalty | Сыграно / Техническое / Сдача / Сдача без штрафа |
| `after.modeNote` | Technical — a no-show or the league's decision. Conceded — a coach gave up during the game; «no penalty» — conceded before the game by the league's rules. | Техническое — неявка или решение лиги. Сдача — тренер сдался во время игры; «без штрафа» — сдача до начала игры по правилам лиги. |
| `after.winner` | Winner | Победитель |
| `after.technicalNote` | A technical result is 2–0 to the winner, CAS 0. | Техническое: 2:0 в пользу победителя, CAS 0. |
| `after.agreeNote` | One coach enters the score, the other confirms it. Until both have, the next steps can be seen, but the match cannot be finished. | Один тренер вводит счёт, второй подтверждает. Пока результат не подтверждён обоими, следующие шаги видны, но завершить матч нельзя. |
| `after.send` | Send the score | Отправить счёт |
| `after.sendOwn` | Send your score | Отправить свой счёт |
| `after.agree` | Confirm the score {score} | Подтвердить счёт {score} |
| `after.waitAgree` | Opens once the opponent confirms the score | Станет доступно, когда соперник подтвердит счёт |
| `after.official` | The league entered this score | Счёт внесён лигой |
| `after.change` | Change the score… | Изменить счёт… |
| `after.changeAsk` | A new score starts the post-match over for both teams. | Новый счёт начнёт итоги заново для обеих команд. |
| `after.fewer` / `after.more` | {team} · {counter}: fewer / more | {team} · {counter}: меньше / больше |
| `after.fansRoll` | Dedicated Fans · D6 after a win | Dedicated Fans · D6 после победы |
| `after.fansRollLoss` | Dedicated Fans · D6 after a loss | Dedicated Fans · D6 после поражения |
| `after.fansRollConceded` | Dedicated Fans · D3 after conceding | Dedicated Fans · D3 после сдачи |
| `after.fansUp` / `after.fansDown` | Dedicated Fans {from} → {to} | Dedicated Fans {from} → {to} |
| `after.fansSame` | Dedicated Fans stay at {fans} | Dedicated Fans не меняются |
| `after.fansWhyWin` | Win: if the D6 is at least the current Dedicated Fans ({fans}), they go up by 1, at most 7. | Победа: если D6 не меньше текущих Dedicated Fans ({fans}), их становится на 1 больше, максимум 7. |
| `after.fansWhyLoss` | Loss: if the D6 is below the current Dedicated Fans ({fans}), they go down by 1. | Поражение: если D6 меньше текущих Dedicated Fans ({fans}), их становится на 1 меньше. |
| `after.fansWhyConceded` | Conceded: Dedicated Fans go down by the D3, not below 1. | Сдача: Dedicated Fans уменьшаются на D3, но не ниже 1. |
| `after.fansDraw` | A draw: no roll, Dedicated Fans stay at {fans}. | Ничья: бросок не нужен, Dedicated Fans остаются {fans}. |
| `after.fansNeedRoll` | Roll the D6 at the table and mark it | Бросьте D6 за столом и отметьте |
| `after.technicalRoll` | Technical win · D3: (D3 + 2) × 10k | Техническая победа · D3: (D3 + 2) × 10k |
| `after.income` | Income from the match | Доход за матч |
| `after.attendance` | Attendance | Посещаемость |
| `after.attendanceSub` | Fan Factor {home} + {away} = {sum} × {per}k | Fan Factor {home} + {away} = {sum} × {per}k |
| `after.touchdowns` | Touchdowns | Тачдауны |
| `after.touchdownsSub` | {count} × 10k | {count} × 10k |
| `after.nonStalling` | No stalling | Без затяжки времени |
| `after.painting` | Painted team | Покрашенная команда |
| `after.technicalIncome` | Technical win | Техническая победа |
| `after.total` | Total | Итого |
| `after.noIncome` | Conceded: no income for the loser. | Сдача: у проигравшего дохода нет. |
| `after.stalling` | Stalled (stalling) | Тянули время (stalling) |
| `after.stallingSub` | If yes — no 10k bonus | Если да — нет бонуса 10k |
| `after.painted` | The team is painted | Команда покрашена |
| `after.paintedSub` | +{bonus}k to income | +{bonus}k к доходу |

- `post.css` (значения — `Post*.html`): карточки шага — `--surface`, радиус 16, кольцо 1px `--line`, отступ 14 16, зазор 10 (без зазора у карточек строк); заголовок карточки — 700 12px, `letter-spacing: 0.06em`, заглавные, `--muted`; строки «подпись — значение» — от 44px, отступ 6 0, черта снизу `--line`, 15/1.25; подпись 13/1.45 `--muted`; итог — Oswald 700 28px. Общее для Task 6–8 тоже здесь (карточка, строка, заголовок, подпись) — классы `.g-after__card`, `.g-after__row`, `.g-after__label`, `.g-after__note`, `.g-after__big`.

- [ ] **Step 1: Падающие тесты** — `test/post-steps.test.mjs` (модель — `postModel` над состояниями Task 1; DOM — `mount`):
  - «the records block: yours with the scorers, the opponent's from their records, how many» (`PostResult`) — «From the match records», «records: 6 + 2», «TD: Ashby, Pike · CAS: Gruk ×2, Brandt» по данным, «TD 2 · CAS 3».
  - «a side begun before 3.0 says it has no records, and nothing is said to mismatch them» — `delete followsEvents` у соперника → «begun before 3.0: no records», нет `role="alert"` из-за соперника.
  - «the steppers start at the score sent, else at each side's records; ours at the left» — без счёта → значения записей; с отправленным → его числа со стороны тренера (гости видят свою часть слева).
  - «the mismatch is said under the score, in the prototype's words» (`PostResultMismatch`) — черновик TD 3 при записях 2 → `[role="alert"]` «The score does not match the records», «your TD: 3 in the score, 2 in the records.» и хвост.
  - «the button follows the score: send, confirm the opponent's, wait for the opponent, next» — четыре состояния → `data-prep-action="result"` «Send the score» / «agree-result» «Confirm the score 2–1» / закрытая «Next: income and fans» с `after.waitAgree` / ссылка `postMatchUrl(g, "fans")` и тихая «Change the score…».
  - «a technical result closes the steppers at 2–0; a mode other than played asks for the winner» — `after-winner` сегменты, степперы `disabled`.
  - «points for you: a win in parts, a friendly off the table» — «For you: Win», «+4 pts»; товарищеский — «Friendly: off the table».
  - «the fans: a D6 after a win, a D3 after conceding, none at a draw; Dedicated Fans as they will be» (`PostFans`) — 6 граней `role="radio"`; при `roll` 4 и фанатах 3 → «Dedicated Fans 3 → 4»; ничья — нет `radiogroup`, «A draw: no roll…»; сдача — 3 грани.
  - «the income is the domain's, with the draft's toggles» — посещаемость «Fan Factor 5 + 5 = 10 × 5k» и «50k», «No stalling 10k», с `stalling` — «0k», «Total» и `+` сумма `postIncome`; проигравший сдачу — «Conceded: no income for the loser.»
  - «names are text» (`HOSTILE`); «every key in both dictionaries», `after.mode.*` по `RESULT_MODES`, `after.outcome.*`, `after.part.*` по `POINT_PARTS`; «styled» (`assertStyled(..., "src/screens/matches/post.css", "src/screens/matches/prep.css")`); «readable» (`--on-danger-tint` на `--danger-tint`, `--on-accent-tint` на `--surface`, `--muted` на `--surface` ≥ 4.5:1 во всех палитрах); D2 — степперы, режимы, грани, переключатели ≥ 44 до 900px, ≥ 24 от 901px; «no ellipsis» в `post.css`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-steps.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/post-steps.mjs src/screens/matches/post.css src/styles.css src/i18n/en.json src/i18n/ru.json test/post-steps.test.mjs
git commit -m "feat(post): the score from the match records with the mismatch said under it, how the match ended, the points in parts; the fans and the income as the domain counts them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: «Игроки» — события, MVP, травмы, уходы, лист статистики

Прототипы: `mobile/PostPlayers.html` (события, MVP «Отличились»/«Остальные», карточка травмы, «может прокачаться»), `desktop/DeskPostPlayers.html` (таблица, звезда MVP, травма в колонке). Сверять (решения 9–14).

**Files:**
- Create: `src/screens/matches/post-players.mjs`, `src/screens/matches/post-players.css`, `test/post-players.test.mjs`
- Modify: `src/styles.css` (`@import url("screens/matches/post-players.css");` последним), оба словаря

**Interfaces:**
- Consumes: `mvpChoices`, `sideRecords`, `scoreMismatches` (Task 2), `POST_STATS`, `INJURIES`, `effectiveInjury`, `mvpCount` (`rules.mjs`), `earnedSpp`, `earnedCounters` (`statistics.mjs`), `sideFollowsEvents` (`events.mjs`), `sppCounterWeights`, `canTakeAdvancement` (`progression.mjs`), `renderActionStepper` (`ui/action-stepper.mjs`), `renderSheet` (`ui/sheet.mjs:41`), `renderToggle`, `renderStatusChip`, `renderButton`, `renderCallout`.
- Produces:
  - `PLAYERS_SHEET = "after-player"`.
  - `playersDraft(side) → {statistics, injuries, mvps, departures}` — копия того, что уходит действием `statistics`.
  - `playersStep(model, draft, {phone, open}) → {contentHtml, asideHtml, footer}` — `open` — раскрыты ли «Остальные игроки». Телефон (`PostPlayers`): плашка расхождения сверху (как Task 5), «События матча» с подписью `after.eventsNote` (у стороны 2.x — `after.eventsNote2x`), строки-кнопки (`data-after-player="<id>"`, от 52px, номер Oswald 700 17px шириной 28, имя 700 15px переносится, подстрока 12px `--muted`: позиция и «TD 1 · COMP 1» или «травма: Lasting Injury (AG)», справа «+4 SPP» 700 `--on-accent-tint` или «—»; у проигравшего сдачу — «—»), «Остальные игроки · 9» (`aria-expanded`); карточка MVP (`after.mvpTitle`, подпись, «Отличились» / «Остальные», чипы 2 / 3 колонки, `data-after-mvp="<id>"`: один MVP — одна `role="radiogroup"`, два — `aria-pressed`), карточки травм (`data-after-injury="<id>"` с `data-code`, характеристика `data-after-stat`, «До конца сезона» — `renderToggle` `key: "retire:<id>"`), «Ветераны после сдачи · D6» (`data-after-departure="<id>"`), подсказка «Правка статистики или MVP снимает выбранные прокачки», карточки прокачки (`--accent-tint-soft`: «L. Ashby может прокачаться», «27 SPP доступно с MVP · прокачка необязательна», кнопка «Прокачать» `data-player-advance="<key>"` — ключ строки листа 07d, Task 10 даёт его; взятые — «Прокачка: Diving Catch» и «Отменить» `data-after-untake="<id>"`). Десктоп (`DeskPostPlayers`): `<table class="g-after__table">` (`<caption>` sr-only; колонки `36px minmax(0,1.4fr) repeat(5, 52px) 64px minmax(0,1.2fr)`; шапка 700 12px 0.04em `--muted`, черта `--line-strong`; строки от 52px, черта `--line`; имя — кнопка листа; MVP — кнопка-звезда `aria-pressed` 32px с `aria-label` «MVP: L. Ashby», цвет `--warn`; SPP 700 `--on-accent-tint`; травма 600 `--danger` или «—» `--muted`), подписи прототипа над таблицей, карточки прокачки под ней; `asideHtml` — карточки травм.
  - `playerSheetMarkup(model, draft, playerId, {phone}) → string` — `renderSheet({id: PLAYERS_SHEET, title: "#3 L. Ashby", sub: позиция, bodyHtml})`: степперы `POST_STATS` (`renderActionStepper({key: counter, label: after.stat.<counter>, name, spp: вес (crowd/foul — 0, подпись «из CAS»), value, player, compact: phone, tile: !phone, data: {afterPlayer: id}})`), травма и характеристика, «До конца сезона»; закрыто всё, когда шаг только для чтения (`lockedReason`).
  - `playersFooter(model, draft) → footer` — «Далее: состав», `action: "lock-players"`; закрыта с `after.mismatchShut` при расхождении (над черновиком), с `after.mvpShut`, пока MVP меньше `count`, с `after.departureShut`, пока броски ухода не отмечены.

Словари (en / ru; главные):

| ключ | en | ru |
|---|---|---|
| `after.events` | Match events | События матча |
| `after.eventsNote` | From the records of {match}: taps on the «Roster» during the game: {count}. An edit here changes the same records — the player's career stays right. | Из записей {match}: тапов в «Составе» во время игры: {count}. Правка здесь меняет те же записи — история в карьере игрока останется верной. |
| `after.eventsNote2x` | The match began before 3.0: there are no records, the statistics are entered here. | Матч начат до 3.0: записей нет, статистику вводят здесь. |
| `after.rest` | Other players · {count} | Остальные игроки · {count} |
| `after.injuryLine` | injury: {injury} | травма: {injury} |
| `after.spp` | +{spp} SPP | +{spp} SPP |
| `after.mvpTitle` | MVP · +5 SPP | MVP · +5 SPP |
| `after.mvpNote` | Those who stood out in the match are on top. MVP can go to anyone but stars and the dead. After a technical win or the opponent's concession — two MVPs, none for the loser. | Отличились в матче — сверху. MVP можно отдать любому, кроме звёзд и погибших. При технической победе или сдаче соперника — два MVP, у проигравшего ни одного. |
| `after.mvpTop` | Stood out | Отличились |
| `after.mvpRest` | Others | Остальные |
| `after.mvpNone` | No MVP for this side: {why} | MVP у этой стороны нет: {why} |
| `after.mvpFull` | Two MVPs are chosen — take one off first | Уже выбраны два MVP — сначала снимите одного |
| `after.injury` | Injury · #{number} {name} | Травма · #{number} {name} |
| `after.fromRecord` | from a match record | из записи матча |
| `after.injuryNote` | Marked on the «Roster» during the game: {injury}. Check it — here the injury is applied for good. | Отмечено в «Составе» во время игры: {injury}. Проверьте — здесь травма применяется окончательно. |
| `after.injury.none` … `.dead` | No injury, Badly Hurt, Seriously Hurt, Serious Injury, Lasting Injury, Dead | Без травмы, Badly Hurt, Seriously Hurt, Serious Injury, Lasting Injury, Dead |
| `after.injurySub.miss` / `.niggling` / `.lasting` | misses a match / NI + misses a match / −1 stat | пропуск / NI + пропуск / −1 стат |
| `after.whichStat` | Which characteristic | Какая характеристика |
| `after.retire` | Out for the rest of the season | До конца сезона |
| `after.injuryCodes` | Codes as in the Casualty Table. With fewer than 3 games played, any injury counts as Badly Hurt. | Коды как в Casualty Table. Если у команды меньше 3 сыгранных матчей, любая травма считается Badly Hurt. |
| `after.rookie` | Counts as Badly Hurt: the team has played fewer than 3 games | Засчитается как Badly Hurt: у команды меньше 3 сыгранных матчей |
| `after.departures` | Veterans after conceding · D6 | Ветераны после сдачи · D6 |
| `after.departuresNote` | A player with 3+ advancements leaves on 1–3. | Игрок с 3+ улучшениями уходит при 1–3. |
| `after.concededSpp` | Conceded: no SPP for this match | Сдача: SPP за матч нет |
| `after.canAdvance` | {name} can advance | {name} может прокачаться |
| `after.canAdvanceSub` | {spp} SPP available with MVP · optional | {spp} SPP доступно с MVP · прокачка необязательна |
| `after.advance` | Advance | Прокачать |
| `after.taken` | Advancement: {gave} | Прокачка: {gave} |
| `after.untake` | Undo | Отменить |
| `after.resetsAdvancements` | Changing the statistics or the MVP takes the advancements chosen here off. | Правка статистики или MVP снимает выбранные здесь прокачки. |
| `after.mismatchShut` | First make the players' TD and CAS add up to the score | Сначала сведите TD и CAS игроков со счётом |
| `after.mvpShut` | Choose the MVP first | Сначала выберите MVP |
| `after.departureShut` | Mark the veterans' D6 first | Сначала отметьте D6 ветеранов |
| `after.stat.touchdowns` … `.foulCasualties` | TD, CAS, KO, COMP, CATCH, INT, TTM, LAND, BONUS, Crowd CAS, Foul CAS | TD, CAS, KO, COMP, CATCH, INT, TTM, LAND, BONUS, CAS от толпы, CAS от фолов |
| `after.statName.<counter>` | touchdown, casualty, … (то, что слышит экранный диктор) | тачдаун, травма соперника, … |
| `after.partOfCas` | part of CAS | из CAS |
| `after.col.number` / `.player` / `.spp` / `.injury` | # / Player / SPP / Injury | # / Игрок / SPP / Травма |

- `post-players.css` (значения — `PostPlayers`, `DeskPostPlayers`): чипы MVP — от 40px (до 900px — 44), радиус 10, 14px, выбранный — `--accent-tint-soft` с кольцом 2px `--accent`, 700; прочие — кольцо 1px `--line-strong`, 600; сетки 2 и 3 колонки, зазор 6; карточка травмы — чип «из записи матча» 26px радиус 13 `--accent-tint`/`--on-accent-tint` 700 12px с точкой 7px `--accent`; радио травмы — от 48px (десктоп 44), подпись 11px 500 с прозрачностью 0.75 → `--ink-2`; характеристика — 5 колонок от 40px (до 900px — 44); карточка прокачки — `--accent-tint-soft`, «Прокачать» от 40px (до 900px — 44), радиус 10, `--accent`, белый 700 14px; таблица десктопа — сетка выше, `tabular-nums`.

- [ ] **Step 1: Падающие тесты** — `test/post-players.test.mjs`:
  - «the events: rows of those who did something, their counters and SPP; the rest behind a button» (`PostPlayers`) — строки игроков со статистикой или травмой, «Catcher · TD 1 · COMP 1», «+4 SPP»; «Other players · 9» с `aria-expanded="false"`, `open` → строки прочих.
  - «a row opens the player's sheet: every counter a stepper, the injury, the characteristic, the season's toggle» — `playerSheetMarkup` → `dialog#after-player`, 11 степперов `data-action-key`, у crowd — «part of CAS»; Lasting → характеристики и `retire`.
  - «MVP: those who stood out first; one MVP one radio group, two MVPs two pressed buttons at most» — `top` и `rest` как `mvpChoices`; `count` 1 → один `role="radiogroup"`; `count` 2 → `aria-pressed`, у выбранных `true`; `count` 0 → `after.mvpNone`.
  - «an injury from the records says so while the side follows them; once saved it is the coach's» — `followsEvents: true` → «from a match record»; после сохранения (`followsEvents: false`) — чипа нет.
  - «rookie protection is said on the injury» — `gamesPlayed: 1`, Dead → `after.rookie`.
  - «conceding: the veterans' D6, no SPP for the loser» — сдача, проигравший → карточка уходов с гранями 1–6 у игроков с 3+ прокачками; SPP «—», `after.concededSpp`.
  - «who can advance: a card with the SPP and «Advance»; a taken one with «Undo»» — игрок с SPP → «can advance», `data-player-advance`; выбор есть → «Advancement: Block», `data-after-untake`.
  - «the footer is closed while the score and the records disagree, the MVP is missing or a veteran's die is not marked» — три случая со словами; всё сведено → `action: "lock-players"`.
  - «a desk's table: a real table, the MVP a star button, the injuries at the right» (`DeskPostPlayers`) — `table` с `caption`, `th[scope="col"]` девяти колонок, звезда `aria-pressed` с именем; `asideHtml` с карточками травм.
  - «names are text» (`HOSTILE`); «every key in both dictionaries», `after.injury.*` по `INJURIES`, `after.injurySub.*`, `after.stat.*` и `after.statName.*` по `POST_STATS`; «styled» (`assertStyled(..., "src/screens/matches/post-players.css", "src/screens/matches/post.css", "src/ui/action-stepper.css", "src/ui/sheet.css")`); «readable» (`--warn` на `--surface` ≥ 3:1 — значок; `--danger` на `--surface` ≥ 4.5:1; `--on-accent-tint` на `--accent-tint-soft` ≥ 4.5:1); D2 — строки событий, чипы, радио, «Прокачать», звезда ≥ 44 до 900px, ≥ 24 от 901px; «no ellipsis».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-players.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/post-players.mjs src/screens/matches/post-players.css src/styles.css src/i18n/en.json src/i18n/ru.json test/post-players.test.mjs
git commit -m "feat(post): the Players step — the match's events with their SPP, each player's sheet of counters and injury, the MVP with those who stood out first, injuries from the records, the veterans' dice after a concession, who can advance" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «Состав» — персонал, найм, продажа, журнеймены, Raise Dead

Прототип: `mobile/PostRoster.html` (десктопа нет: карточки в рамке десктопа). Сверять (решение 15).

**Files:**
- Create: `src/screens/matches/post-roster.mjs`, `test/post-roster.test.mjs`
- Modify: `src/screens/matches/post.css`, оба словаря

**Interfaces:**
- Consumes: `projectPostRoster`, `postStaffOptions` (`roster.mjs`), `effectiveInjury`, `rowsForTeam`, `rosterMax`, `costToNumber` (`domain/roster/values.mjs`), `playerSaleValue` (`domain/roster/transfers.mjs`), `playerCurrentCost` (`domain/roster/costs.mjs`), `teamHasSpecialRule`, `isLineman`, `builderStaffCosts`, `builderStaffMaximums`, `combinedRerollsMaximum` (`league-rules.mjs`), `renderResourceCounter` (`ui/resource-counter.mjs:26`), `renderSheet`, `renderButton`.
- Produces:
  - `HIRE_SHEET = "after-hire"`, `SELL_SHEET = "after-sell"`.
  - `rosterStep(model) → {contentHtml, footer}` — «Казна после дохода 150k» (14px `--muted`, число 700 `--ink`) и остаток Oswald 700 24px (`--on-accent-tint`, ниже нуля — `--danger`), подпись `after.paidAtFinish`; «Персонал» — `renderResourceCounter({key, name, note: «120k за штуку · сейчас 1», value, decDisabled, incBlockedReason, lockedReason})` по `postStaffOptions`: у Team Re-rolls «−» закрыт (`after.rerollsNote`), «+» закрыт сверх максимума, сверх 8 с Start Re-rolls (`combinedRerollsMaximum`) или без казны — со словами; подпись про Team Re-rolls; «Игроки» — «+ Нанять» (`data-after-open="hire"`) и «Продать…» (`data-after-open="sell"`), 44px, кольцо `--line-strong`, 600 14px; журнеймены матча (не погибшие, не оставленные) — строки с «Оставить · 50k» (`data-after-keep="<id>"`); Masters of Undeath — «Raise Dead · <позиция>» (`data-after-raise="<rowIndex>"`, закрыта сверх погибших соперника — `after.raiseShut`); «Операции этого шага» — строки «Assistant Coaches 1 → 2 · −10k» (`--danger` у трат, `--on-accent-tint` у продаж) и «Отменить последнюю» (тихая, `data-prep-action="undo-roster"`). `footer` — «Далее: казна», `action: "lock-roster"`.
  - `hireSheetMarkup(model) → string` — позиции расы: «Blitzer · 90k · 2 из 4», кнопка 52px `data-after-hire="<rowIndex>"`, закрыта с причиной (`after.hireFull`, `after.rosterFull`, `after.short {amount}`).
  - `sellSheetMarkup(model) → string` — игроки состава после матча: «#3 L. Ashby · +45k» `data-after-sell="<id>"`; при 7 — все закрыты (`after.sellSeven`).
  - Строки операций — `opLines(model) → {label, amount}[]`: «Найм: Blitzer», «Продажа: L. Ashby», «Journeyman остаётся: J. Corr», «Raise Dead: Zombie», «Assistant Coaches 1 → 2».

Словари (главные): `after.treasuryAfterIncome` «Treasury after income» / «Казна после дохода»; `after.paidAtFinish` «This step's purchases are paid when the match is finished.» / «Покупки этого шага списываются при завершении матча.»; `after.staff` «Staff» / «Персонал»; `after.rerollsBuy` «Team Re-rolls · buy more» / «Team Re-rolls · докупить»; `after.staffEach` «{price} each · now {count}» / «{price} за штуку · сейчас {count}»; `after.staffNow` «{price} · now {count}» / «{price} · сейчас {count}»; `after.rerollsNote` «Team Re-rolls can only be bought after a match; they cannot be sold.» / «Team Re-rolls после матча можно только докупить; продать их нельзя.»; `after.players` «Players» / «Игроки»; `after.hire` «+ Hire» / «+ Нанять»; `after.sell` «Sell…» / «Продать…»; `after.playersNote` «Journeymen who played this match can be kept at full price. Raise Dead — Masters of Undeath only.» / «Journeymen, сыгравших этот матч, можно оставить за полную цену. Raise Dead — только у Masters of Undeath.»; `after.journeymen` «Journeymen of this match» / «Journeymen этого матча»; `after.keep` «Keep · {price}» / «Оставить · {price}»; `after.raise` «Raise Dead · {position}»; `after.raiseShut` «No more dead on the other side to raise» / «Погибших соперника больше нет»; `after.ops` «This step's operations» / «Операции этого шага»; `after.undoLast` «Undo the last» / «Отменить последнюю»; `after.op.hire` «Hire: {position}» / «Найм: {position}»; `after.op.sell` «Sale: {name}» / «Продажа: {name}»; `after.op.keep` «Journeyman stays: {name}» / «Journeyman остаётся: {name}»; `after.op.raise` «Raise Dead: {position}»; `after.op.staff` «{staff} {from} → {to}»; `after.hireTitle` «Hire a player» / «Нанять игрока»; `after.hireCount` «{count} of {max}» / «{count} из {max}»; `after.hireFull` «No place left at this position» / «Мест на позиции нет»; `after.rosterFull` «14 on the roster already» / «В составе уже 14»; `after.short` «Not enough treasury · {amount}» / «Не хватает казны · {amount}»; `after.sellTitle` «Sell a player» / «Продать игрока»; `after.sellSeven` «7 on the roster: no sale» / «В составе 7 — продавать нельзя».

- [ ] **Step 1: Падающие тесты** — `test/post-roster.test.mjs`:
  - «the treasury after income and what is left once this step's purchases are paid» (`PostRoster`) — 150k, после найма — остаток, ниже нуля — `--danger`-класс.
  - «staff as counters: Team Re-rolls only up, the others both ways, each closed with why» — у Team Re-rolls «−» закрыт с `after.rerollsNote`; Assistant Coaches на максимуме — «+» закрыт; без казны — `after.short`.
  - «hire: the race's positions with their price, how many and why one is closed» — лист `dialog#after-hire`, «2 of 4», полная позиция закрыта.
  - «sell: the roster's players with their price; at seven none» — лист `dialog#after-sell`; при 7 — все `aria-disabled`.
  - «a journeyman of this match can be kept at full price; a dead one cannot» — журнеймен с «Keep · 50k»; погибший — нет строки.
  - «Raise Dead only for Masters of Undeath, no more than the other side's dead» — у людей нет; у Undead (раса с правилом) — есть, закрыт после стольких, сколько погибших у соперника.
  - «this step's operations in words with their money, and «Undo the last»» — после операций — строки «Hire: Blitzer · −90k», «Assistant Coaches 1 → 2 · −10k»; `data-prep-action="undo-roster"`.
  - «names are text»; «every key in both dictionaries»; «styled»; «readable»; D2 — степперы, кнопки листов ≥ 44 до 900px, ≥ 24 от 901px (степпер — 34 как прототип); «no ellipsis».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-roster.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/post-roster.mjs src/screens/matches/post.css src/i18n/en.json src/i18n/ru.json test/post-roster.test.mjs
git commit -m "feat(post): the Roster step — staff as counters with Team Re-rolls only up, hiring and selling from sheets, journeymen kept at full price, Raise Dead for Masters of Undeath, this step's operations with their money" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: «Казна», «Дальше», «Итог»

Прототипы: `mobile/PostFinance.html`, `PostNext.html`, `PostReview.html`, `desktop/DeskPostReview.html` (карточки сторон 2 колонки `auto-fit minmax(300px, 1fr)`, справа «Результат» Oswald 40). Сверять (решения 16–18).

**Files:**
- Create: `src/screens/matches/post-money.mjs`, `src/screens/matches/post-review.mjs`, `test/post-money.test.mjs`
- Modify: `src/screens/matches/post.css`, оба словаря

**Interfaces:**
- Consumes: `postFinance`, `mistakeKind` (`finance.mjs`), `projectPostRoster`, `fallenPlayers` (`roster.mjs`), `nextMatchChanges`, `postPoints` (Task 2), `earnedSpp`, `effectiveInjury`, `createMatchSide`, `calculateMatchCtv` (`domain/match/roster.mjs`), `absenceWords` (`screens/team/roster/panel.mjs`), `gaveWords` (`screens/team/roster/player-access.mjs`), `renderResourceCounter`, `renderStatusChip`.
- Produces:
  - `financeStep(model, draft) → {contentHtml, footer}` — `draft` `{deposit, roll, first, second}` (`financeDraft(model)`); строки «Казна до матча 70k», «Доход за матч +80k», «Покупки после матча · Assistant Coach и Cheerleader −20k», «Продажи +45k» (если есть), «В сейф −20k», «Казна после» Oswald 28 — `postFinance` над копией состояния с черновиком; «Coach's Safe» — `renderResourceCounter` (34px; до 900px — 44) 0…min(50, доход, казна), подпись «До 50k из дохода за матч · сейчас 20k → 40k»; «Expensive Mistakes»: при казне после сейфа ≥ 100k — подпись `after.mistakesRoll` и грани D6 (`data-after-mistake`), затем по виду — D3 (`data-after-extra="first"`, 3 грани) или два D6 (`first`, `second`); итог словами `after.mistake.<kind>` 700 15px (`--danger` при потере, иначе `--on-accent-tint`), подпись прототипа. `footer` — «Далее: следующий матч», `action: "finance"`; закрыта, пока соперник на шаге «Игроки» или раньше (`after.waitStats`), и пока бросок не полон (`after.mistakeNeed`).
  - `nextStep(model, draft) → {contentHtml, footer}` — `draft` `{captain}`; «Вернутся к следующему матчу» («#9 J. Corr · в строю»), «Пропустят следующий матч» («#2 O. Krell · Lasting Injury · AG 3+ → 4+» — травма словами 07b, `absenceWords`, со сдвигом характеристики у Lasting); TV и CTV «1 120k → 1 160k» (`calculateMatchCtv` над `createMatchSide` до и после; TV — с пропускающими, как `postValues` 2.x), «Казна», «Coach's Safe»; «Капитан на следующий матч» — радио 2 колонки (`data-after-captain`), без временно ушедших; `footer` — «Далее: итог», `action: "next"`, закрыта без капитана, когда есть годные.
  - `reviewStep(model) → {contentHtml, asideHtml, footer}` — карточки сторон (имя 700 16px, чип «Подтвердил» `live` / «Ждём» `wait`; строки: MVP «L. Ashby · +5 SPP» (два — через запятую), «SPP за матч» «+19 · игроков: 4, с MVP», «Травмы» «O. Krell · Lasting Injury (AG)» или «—», «Гибель» (только если есть: `fallenPlayers` своей стороны, у соперника тоже), «Прокачка» «L. Ashby · Diving Catch» (`gaveWords`), «Покупки» «Assistant Coach, Cheerleader · −20k», «Казна 70k → 110k», «Coach's Safe 20k → 40k», «Dedicated Fans 3 → 4»; у соперника — MVP, травмы, гибель, казна, как прототип); подпись `after.reviewNote` (товарищеский — `after.reviewNoteFriendly`); десктоп `asideHtml` — «Результат» 13px `--muted`, «2–1» Oswald 700 40px, «Победа · +3 за победу, +1 за 3+ CAS» 700 14px `--on-accent-tint` (`postPoints`). `footer`: «Подтвердить итог» (`confirm`) → после — «Завершить матч» (`action: "finish"`, закрыта, пока статус не `ready`, `after.finishHint`); завершено — `kind: "none"` и плашка `after.completed` с «К матчам» и «К составу» (рамка, Task 9).

Словари (главные): `after.before` «Treasury before the match» / «Казна до матча»; `after.matchIncome` «Income from the match» / «Доход за матч»; `after.purchases` «Purchases after the match» / «Покупки после матча»; `after.sales` «Sales» / «Продажи»; `after.toSafe` «Into the safe» / «В сейф»; `after.treasuryAfter` «Treasury after» / «Казна после»; `after.safe` «Coach's Safe»; `after.safeSub` «Up to 50k of the match income · now {now} → {next}» / «До 50k из дохода за матч · сейчас {now} → {next}»; `after.mistakes` «Expensive Mistakes»; `after.mistakesRoll` «100k or more in the treasury — roll a D6 at the table.» / «В казне 100k и больше — бросьте D6 за столом.»; `after.mistake.none` «Nothing happened» / «Ничего не случилось»; `.pending` «Roll the D6» / «Бросьте D6»; `.minor` «Minor Incident: you lose D3 × 10k» / «Minor Incident: теряете D3 × 10k»; `.major` «Major Incident: the treasury is halved» / «Major Incident: казна уменьшается вдвое»; `.catastrophe` «Catastrophe: 2D6 × 10k is left» / «Catastrophe: остаётся 2D6 × 10k»; `.under` «Less than 100k in the treasury — no roll» / «Казна меньше 100k — бросок не нужен»; `after.extraD3` «D3 at the table» / «D3 за столом»; `after.extraD6` «Two D6 at the table» / «Два D6 за столом»; `after.mistakesNote` «The table depends on the treasury: the more money, the higher the risk of Minor, Major and Catastrophe. Money in the safe is not at risk.» / «Таблица зависит от суммы в казне: чем больше денег, тем выше риск Minor, Major и Catastrophe. Деньги в сейфе не рискуют.»; `after.waitStats` «Opens once the opponent saves the «Players» step» / «Станет доступно, когда соперник сохранит шаг «Игроки»»; `after.mistakeNeed` «Mark the dice first» / «Сначала отметьте кубики»; `after.returning` «Back for the next match» / «Вернутся к следующему матчу»; `after.inLineup` «in the lineup» / «в строю»; `after.missing` «Miss the next match» / «Пропустят следующий матч»; `after.tv` «TV»; `after.ctv` «CTV»; `after.ctvSub` «without those missing» / «без пропускающих»; `after.treasury` «Treasury» / «Казна»; `after.captain` «Captain for the next match» / «Капитан на следующий матч»; `after.confirmed` «Confirmed» / «Подтвердил»; `after.waitingChip` «Waiting» / «Ждём»; `after.row.mvp` «MVP»; `after.row.spp` «SPP for the match» / «SPP за матч»; `after.sppMatch` «+{spp} · players: {count}, with MVP» / «+{spp} · игроков: {count}, с MVP»; `after.row.injuries` «Injuries» / «Травмы»; `after.row.dead` «Death» / «Гибель»; `after.row.advancements` «Advancement» / «Прокачка»; `after.row.purchases` «Purchases» / «Покупки»; `after.row.fans` «Dedicated Fans»; `after.reviewNote` «The match is finished once both coaches confirm the summary. Then the rosters and the treasuries are updated, the dead go to «The fallen», and the result goes into the table.» / «Матч завершится, когда оба тренера подтвердят итог. После этого составы и казна обновятся, погибшие перейдут в «Погибшие», а результат попадёт в таблицу.»; `after.reviewNoteFriendly` — то же без таблицы; `after.result` «Result» / «Результат»; `after.confirm` «Confirm the summary» / «Подтвердить итог»; `after.finish` «Finish the match» / «Завершить матч»; `after.finishHint` «Opens once the opponent confirms» / «Станет активной, когда соперник подтвердит»; `after.toMatches` «To the matches» / «К матчам»; `after.toRoster` «To the roster» / «К составу».

- [ ] **Step 1: Падающие тесты** — `test/post-money.test.mjs`:
  - «the treasury's lines are the domain's, the safe a counter up to what the match brought» (`PostFinance`) — строки и «Treasury after» = `postFinance(...).after`; «+» сейфа закрыт на min(50, доход, казна).
  - «Expensive Mistakes: a die from 100k, then a D3 or two D6 as the kind needs; under 100k no roll» — казна 130 → грани D6; грань 1 при 130 → «Minor Incident…» и D3; казна 90 → `after.mistake.under`, граней нет.
  - «the treasury step waits for the opponent's Players step» — соперник на `stage` 2 → кнопка закрыта с `after.waitStats`.
  - «next: who comes back, who misses the next match and why, TV and CTV before and after, the captain» (`PostNext`) — «#9 J. Corr · in the lineup», «#2 O. Krell · Lasting Injury · AG 3+ → 4+», «TV 1 120k → 1 160k»; радио капитана без временно ушедшего; по умолчанию — нынешний капитан.
  - «the summary: both sides, confirmed or waiting, MVP, SPP, injuries, the dead, advancements, purchases, money» (`PostReview`) — «Confirmed» / «Waiting»; гибель — строка «Death · O. Krell»; у защиты новичков — нет.
  - «the summary names the dead and says they go to «The fallen»» — `after.reviewNote`; товарищеский — без таблицы.
  - «a desk's result: the score, the outcome and the points in parts» (`DeskPostReview`) — «2–1», «Win · +3 for the win, +1 for 3+ CAS».
  - «confirm, then finish once the opponent has confirmed» — `confirm`; после своего — «Finish the match» закрыта с `after.finishHint`; `ready` — открыта, `action: "finish"`.
  - «names are text»; «every key in both dictionaries», `after.mistake.*` по набору; «styled»; «readable»; D2; «no ellipsis».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-money.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/post-money.mjs src/screens/matches/post-review.mjs src/screens/matches/post.css src/i18n/en.json src/i18n/ru.json test/post-money.test.mjs
git commit -m "feat(post): the treasury with the safe and the Expensive Mistakes' dice, who comes back and who misses the next match, the captain; the summary of both sides with the dead going to «The fallen», confirmed then finished" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Экран итогов — чтение, записи, черновики, опрос, своя рамка ⚠ ревью сразу

**Files:**
- Create: `src/screens/matches/post.mjs`, `test/post-screen.test.mjs`
- Modify: `src/core/router.mjs` (:44 импорт `renderPostMatch` из `../screens/matches/post.mjs`; :87 как было), `src/shell/navigation.mjs` (:31 `BARE_ROUTES` + `"postMatch"`; комментарий — итоги в своей рамке), оба словаря
- Test: `test/shell-navigation.test.mjs`

**Interfaces:**
- Consumes: `postModel`, `opponentState` (Task 4), `resultStep`, `resultDraft`, `fansStep`, `fansDraft` (Task 5), `playersStep`, `playersDraft`, `playerSheetMarkup`, `playersFooter`, `PLAYERS_SHEET` (Task 6), `rosterStep`, `hireSheetMarkup`, `sellSheetMarkup`, `HIRE_SHEET`, `SELL_SHEET` (Task 7), `financeStep`, `financeDraft`, `nextStep`, `reviewStep` (Task 8), `prepFrameMarkup`, `prepCtaMarkup` (`prep-frame.mjs`), `savePostMatch` (`src/data/post-match-client.mjs:8`), `sameValues` (`events.mjs`), `apiRequest`, `errorText`, `API_ERROR`, `invalidateGames` (`data/games.mjs:74`), `loadMyTeams` (`data/teams.mjs:67`), `patchWithModal`, `confirmAction` (`components/dialog.mjs:21, :48`), `wireSheets`, `wireRadioGroups`, `wireSegmentedControls`, `wireToggles`, `wireStepButtons`, `wireActionSteppers`, `wireResourceCounters`, `isPhone`, `onPhoneChange` (`screens/team/roster/screen.mjs`), `drawKeepingFocus`, `focusLost`, `listenerGroup`, `delegate`, `patch` (`core/dom.mjs`), `onScreenLeave`, `toast`, `renderLogin` (`screens/auth/login.mjs`).
- Produces:
  - `renderPostMatch(gameId, requestedStep = "") → Promise<void>` (`post.mjs`; шапка — как `prep.mjs` 09a: что читает, как пишет, что опрашивает): гость — экран входа; `GET /api/games/:id/post-match` → `visit.payload`, сторона — `viewerSide`; рисует `prepFrameMarkup` формы ширины с пропсами Task 4 (`stepsLabel`, `opponentHtml: ""`, `actionLeadHtml` — чип строки о сопернике на десктопе, `noticesHtml` — завершено / «Команда изменилась…» с «Начать заново…» / пройденный шаг с «Изменить с шага «Доход»…» / ошибка записи `role="alert"`); `h1` в фокусе при первом рисунке; `onPhoneChange` → `drawKeepingFocus(view, draw, "h1")`; ошибка чтения — плашка со словами и «Повторить».
  - Визит: `{gameId, step, payload, sideName, ui: {busy, error, drafts: {result, fans, players, finance, next}, open, sheet, opener, unlocked}, poll, here}`; черновики — Task 5–8 (`…Draft(model)`), сбрасываются, когда ответ приносит другую ревизию своей стороны.
  - `send(visit, action, {finish = false} = {}) → Promise<boolean>`: одна запись в пути (`ui.busy`; второе нажатие ничего не шлёт); `savePostMatch(apiRequest, visit.payload, visit.sideName, action, finish)` — ответ нарисован, `invalidateGames()`; при `finish` ещё `loadMyTeams(true)`; ошибка — `ui.error = errorText(error)`; 409 (`POST_REVISION` после отказа повтора, `POST_CLOSED`, `POST_TEAM_CHANGED`) и потеря ответа (`API_ERROR.OFFLINE`, `TIMEOUT`) — чтение заново; ничего не повторяется само.
  - Запись «Игроков»: каждое нажатие (MVP, травма, характеристика, «До конца сезона», бросок ухода, степпер листа) меняет `ui.drafts.players` и зовёт `sendPlayers(visit)` — пока запись в пути, ничего; после ответа, если черновик не `sameValues` со статистикой, травмами, MVP и уходами ответа, — `statistics` ещё раз из черновика; 409/потеря — чтение, черновик сброшен, `toast(after.draftLost)`.
  - Кнопки рамки (`data-prep-action`): `result`, `agree-result`, `fans`, `lock-players`, `lock-roster`, `undo-roster`, `finance`, `next`, `confirm`, `finish`, `unlock-result` (окно `confirmAction` с `after.changeAsk` → `ui.unlocked`), `reopen` и `reset-side` (окно-вопрос → действие); подвал взводится `FOOTER_ARM_MS` (600) после появления, как подготовка 09a (двойной щелчок по «Подтвердить итог» не жмёт «Завершить матч»).
  - Прочие нажатия: степперы счёта (`data-after-score`) и режим/победитель — черновик «Счёта»; грани и переключатели «Дохода» — черновик; MVP (`wireRadioGroups` и `aria-pressed`), травмы, характеристики, уходы, строки событий (`data-after-player` → лист `PLAYERS_SHEET` через `patchWithModal(view, markup, "#after-player")`, фокус на открывшего при закрытии), «Остальные игроки» (`ui.open`); персонал (`wireResourceCounters` → `roster {operation: "staff", key, delta}`), листы найма и продажи, «Оставить», Raise Dead → `roster`; сейф и грани «Казны», капитан — черновики; переключатель стороны админа (`prep-side`) — сторона экрана, черновики сброшены. Закрытое (`aria-disabled`) — `toast` с причиной.
  - Опрос: каждые 6000 мс `GET …/post-match`, когда `!document.hidden`, ничего не в пути, черновик шага на экране пуст или равен ответу, ни один лист и окно не открыты; другая ревизия — патч; если своя сторона следовала за записями и её статистика или травмы сменились — `toast(after.tapsChanged)` и черновик «Игроков» сброшен; отказ ждёт дольше (до 9 интервалов), 403/404 и `completed` останавливают опрос. Уход (`onScreenLeave("post-match", …)`) — стоп опроса, снятие слушателей, закрытие листов.
  - `shellModel` для `postMatch` → `{mode: "bare", tabs: [], side: []}`.

Словари: `after.draftLost` «The post-match was read again: what was not sent is gone» / «Итоги прочитаны заново: неотправленное не сохранилось»; `after.tapsChanged` «The match records changed: the statistics are read again and the advancements chosen here are taken off.» / «Записи матча изменились: статистика прочитана заново, выбранные здесь прокачки сняты.»; `after.reopenAsk` «Advancements, roster, treasury and this side's confirmation are reset.» / «Прокачки, состав, казна и подтверждение этой стороны сбросятся.»; `after.resetAsk` «The side starts over from the team as it is now; the statistics are read from the records again.» / «Сторона начнётся заново с команды как она есть; статистика снова прочитается из записей.»; `after.retry` «Read again» / «Прочитать снова».

- [ ] **Step 1: Падающие тесты** — `test/post-screen.test.mjs` (fake-api: `GET /api/games/g1/post-match` → нагрузка домена; `PATCH` и `POST /finish` → следующие нагрузки; `matchMedia` телефона и десктопа):
  - «the post-match draws its own frame and the step asked for, the focus on its title» — `#/games/g1/post-match/players` при `stage` 3 → шаг «Players» только для чтения, плашка «This step is done.», `h1` в фокусе.
  - «the score is sent with the revision and the side; the answer is drawn» — степпер TD «+», «Send the score» → `PATCH` `{revision, side: "home", action: {type: "result", mode: "played", winner: "", home: {touchdowns: 3, casualties: …}, away: {…}}}`; ответ нарисован, `GET /api/games` после.
  - «a refused write on a revision moved by the opponent is sent once more when this side and the score are as seen» (Review Focus 1) — первый `PATCH` → 409 `POST_REVISION`, `GET` даёт ту же свою сторону с ревизией +1 → второй `PATCH` на новой ревизии; своя сторона другая → второго нет, `[role="alert"]` со словами `error.POST_REVISION`.
  - «a lost answer reads the post-match again and sends nothing twice» — `fail("PATCH …")` → `GET` заново, `PATCH` один.
  - «a press while a write is on its way sends nothing; a Players' press waits and is sent from the latest draft» — `api.hold`; два «Next» → один запрос; две смены MVP при задержанной записи → после ответа один `statistics` с последним MVP.
  - «a tap that changed the side is said, and the advancements chosen go» — опрос (подменённый `setInterval`) приносит статистику, отличную от прежней, у стороны `followsEvents: true` → `toast` `after.tapsChanged`.
  - «a new score rebuilds the side from the records, and the mismatch is said on the Players step» — ответ `result` с пересобранной стороной, где TD записей ≠ счёту → на «Players» `[role="alert"]` расхождения, «Next: roster» закрыта с `after.mismatchShut`.
  - «the fans, the treasury and the captain are kept on the page and sent by the step's button» — грань 4, «stalling» → нет `PATCH`; «Next: players» → `{type: "fans", roll: 4, technicalRoll: null, painted: false, stalling: true}`.
  - «staff, hire, sell, keep and raise are writes of the roster step; «Undo the last» takes one back» — «+» Assistant Coaches → `{type: "roster", operation: "staff", key: "assistantCoaches", delta: 1}`; лист найма → `{operation: "hire", rowIndex}`; `undo-roster`.
  - «changing the score after it is agreed asks first» — «Change the score…» → `dialog` с `after.changeAsk`; «Cancel» → степперы закрыты; «OK» → открыты.
  - «reopen and reset-side ask first» — окна-вопросы, затем `reopen` / `reset-side`.
  - ««Finish the match» pressed twice is one request; a finish answered completed draws the summary read only» — `ready`, взвод (подменить таймер) → двойной щелчок → один `POST /finish`; ответ `completed` → `after.completed`, «To the matches» `teamUrl(…, "matches")`, «To the roster»; `GET /api/teams` (`loadMyTeams(true)`) и `GET /api/games` после.
  - «the finish reads the teams again» — после `completed` `api.calls` содержит `GET /api/teams`.
  - «the admin picks a side and writes for it» — `isAdmin: true`, сторона «away» → `PATCH` с `side: "away"`.
  - «the poll waits while a write is on its way, a draft differs, a sheet is open or the tab is hidden; a finished post-match stops it».
  - «leaving stops the poll and the listeners» — `releaseCurrentScreen()` → таймер снят, нажатие ничего не шлёт.
  - «one form for each width: crossing 900px draws the other, the focus kept or on the title».
  - `test/shell-navigation.test.mjs`: «the post-match brings its own frame: no header, no tabs, no SideNav» — `shellModel({route: {name: "postMatch"}, user})` → `mode: "bare"`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-screen.test.mjs test/shell-navigation.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Роутер переключить на новый экран. Модули 2.x остаются без импортёров до Task 11, поэтому `npm run check` (недостижимые функции) запускается после Task 11, не здесь.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/routes.test.mjs test/post-match-client.test.mjs test/match-prep-screen.test.mjs` → PASS; `npm run build && . output/09b/env.sh && npm test` → PASS; `npm run i18n:check` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/post.mjs src/core/router.mjs src/shell/navigation.mjs src/i18n/en.json src/i18n/ru.json test/post-screen.test.mjs test/shell-navigation.test.mjs
git commit -m "feat(post): the 3.0 post-match on its address, in a frame of its own — each step's draft kept on the page and sent by its button, the Players step written press by press, a refused or lost write read again and never resent, finished once" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): упор — Review Focus 1, что тела действий те же, что у 2.x (сравнить с `screens/games/post-match.mjs` `formAction`, `statisticsAction`), что опрос не затирает черновики.

---

### Task 10: Прокачка в итогах — лист 07d и бросок итогов ⚠ ревью сразу

Прототипы: «Прокачать» `PostPlayers`/`DeskPostPlayers` ведёт на `Adv1Type.html`…`Adv4Done.html`, `Adv3Random.html`, `DeskRosterAdv.html` — тот же лист 07d. Сверять (решения 13, 21, 22).

**Files:**
- Create: `src/screens/matches/post-advance.mjs`, `test/post-advance.test.mjs`
- Modify: `src/screens/team/roster/advance.mjs` (`takeChosen` :237, `askFor` :300, `bindSiteRoll` :331, `advanceHandlers` :442), `src/screens/team/roster/wire.mjs` (`export` у `wireAdvance` :170, `wireReasons` :212), `src/data/post-match-client.mjs` (`askPostRoll`), `src/screens/matches/post.mjs` (проводка), оба словаря
- Test: `test/post-match-client.test.mjs`, `test/team-advance.test.mjs`, `test/team-advance-rolls.test.mjs` (без изменений — проходят)

**Interfaces:**
- Consumes: `advanceSheetMarkup` (`advance-sheet.mjs:368`), `advanceHandlers` (`advance.mjs:442`), `wireAdvance`, `wireReasons` (`wire.mjs`), `rosterLines` (`roster/model.mjs:239`), `ADVANCE_SHEET` (`roster/sheets.mjs:48`), `closeSheet` (`roster/injury.mjs:83`), `SAVE_STATUS` (`data/roster-store.mjs:37`), `bonusOf` (`advance.mjs:71`), `takeAdvancement` (`progression.mjs:395`), `postPlayers`, `effectiveInjury`, `apiRequest`, `refusalText`, `unanswered`, `refusalWithRules` (`data/teams.mjs`), `DICE_PURPOSES`.
- Produces:
  - `advance.mjs`: `advanceHandlers(saving, lent)` — `lent` может нести `take(line, choice) → Promise<{ok: true, cost, value, level} | {ok: false} | {refusal: string}>`, `ask(line, {purpose, category, closed}) → Promise<…ответ askRoll…>`, `bind(line, roll) → {refusal: string} | {ok: true}`; без них — как было (`advancePlayer`, `askRoll`, `bindRoll`, синхронно в том же такте). `takeChosen` — `async`; с `lent.take` ждёт ответа, пока ждёт — `sheet.taking = true`, второе нажатие «Взять» ничего не делает. Шапку дополнить строкой: «The post-match draws the same sheet (stage 09b) and lends its own take, ask and bind: its advancement is an action of the post-match, its roll the post-match's.» Не больше +26 строк.
  - `wire.mjs`: `export function wireAdvance`, `export function wireReasons` — без других правок.
  - `askPostRoll(gameId, side, playerId, {purpose, category, closed}) → Promise<{roll} | {waiting} | {refusal, code?} | {lost: true} | {ignored: true}>` (`src/data/post-match-client.mjs`) — `POST /api/games/:id/post-match/rolls`; форма ответа и правила — как `askRoll` (`roster/rolls.mjs:44`): одна просьба в воздухе на игрока, `closed()` спрошен при нажатии, `DICE_ROLL_WAITING` → `{waiting}`.
  - `post-advance.mjs`:
    - `postAdvanceWhere(visit) → {teamId, phone, race, draft, lines, mode: {kind: "post"}, lock, save: {status, waiting: 0}}` — `draft` — `{...side.baseRoster, players: postPlayers(state, name, data)}` без звёзд и погибших; `lines` — `rosterLines({draft, race, skillGroups: state.data.skillGroups})`; `lock` — причина, когда шаг «Игроки» не открыт для записи (только чтение, не на `stage` 2) или пишется статистика; `save.status` — `SAVE_STATUS.SAVING`, пока запись в пути, иначе `SAVE_STATUS.SAVED`.
    - `postAdvanceKey(visit, playerId) → string` — ключ строки листа игрока (`data-player-advance` карточек Task 6).
    - `postAdvanceMarkup(visit) → string` — `advanceSheetMarkup({line, screen: postAdvanceWhere(visit), sheet: visit.ui.sheet})`, когда открыт лист прокачки.
    - `postAdvanceHandlers(visit, draw) → object` — `advanceHandlers({teamId, visit: visit.ui, draw}, {now: () => postAdvanceWhere(visit), refused: () => {}, readAgain: () => readAgain(visit), take, ask, bind})` плюс `onFavoured`, `onFavouredAdd` и `onRefused`:
      - `take(line, choice)` — цена, прибавка к стоимости и ранг считаются заранее `takeAdvancement` на копии игрока; затем `send(visit, {type: "advance", playerId: line.id, advancementType: choice.type, grant: choice.grant, ...(choice.roll ? {roll: choice.roll} : {})})`; удача — `{ok: true, cost, value, level}`; отказ — `{refusal: ui.error}`.
      - `ask(line, ask)` — игрок не в `side.baseRoster` (журнеймен) → `{refusal: t("after.rollJourneyman")}`; админ не своей стороны → `{refusal: t("after.rollAdmin")}`; иначе `askPostRoll(gameId, sideName, line.id, ask)`.
      - `bind()` → `{refusal: t("after.bindLater")}`.
      - `onFavouredAdd` — `send(visit, {type: "favoured", playerId, skill: sheet.bonus})`, затем `favoured: "added"` в листе; `onFavoured` — как `player.mjs:252`.
  - `post.mjs`: лист прокачки — `patchWithModal(view, markup, "#player-advance")`; `wireAdvance(view, handlers)` и `wireReasons(view, {onInjuryChoice() {}, onMarkChoice() {}, onAdvanceType: handlers.onAdvanceType})`; «Отменить» прокачку — `undo-advance`.

Словари: `after.rollJourneyman` «A journeyman rolls at the table: there is no roster place yet» / «Journeyman бросает за столом: в составе его ещё нет»; `after.rollAdmin` «Only the team's coach rolls on the site» / «Бросок на сайте — только у тренера команды»; `after.bindLater` «A roll is put on an advancement taken at the table on the «Roster», after the post-match» / «Привязать бросок к прокачке за столом можно в «Составе» после итогов».

- [ ] **Step 1: Падающие тесты** — `test/post-advance.test.mjs` (экран Task 9 с fake-api: нагрузка итогов на `stage` 2 с игроком, у которого SPP на прокачку; `POST /api/games/g1/post-match/rolls` → бросок двумя кубиками (форма `publicRoll`, как `scripts/mock/rolls.mjs`)):
  - ««Advance» opens the roster's sheet for the player as the post-match holds him» — `[data-player-advance]` → `dialog#player-advance`, типы с ценой по его SPP итогов (с MVP, если выбран).
  - «a random skill is two dice on the site, asked of the post-match; the coach takes one» — тип «random», категория, «Roll two D16» → `POST /api/games/g1/post-match/rolls` `{side: "home", playerId, purpose: "random_skill", category}`; пара; выбор кубика; «Take: …» → `PATCH` `{type: "advance", playerId, advancementType: "random", grant: {skill}, roll: {id, via: "site"}}`; готово — «−N SPP», «Saved».
  - «a characteristic's D8 the same way, a skill in its place too» — `purpose: "stat"`, `advance` с `roll`.
  - «at the table the advancement names a table roll» — «Rolled at the table», две отметки, взять → `roll: {via: "table"}`.
  - «a journeyman's advancement is the table's; the site says why» — у журнеймена «Roll two D16» → `toast` `after.rollJourneyman`, запроса нет.
  - «the admin rolls nothing on the site» — `isAdmin`, сторона «away» → `after.rollAdmin`.
  - «a take pressed twice while its write is on its way sends one» — `api.hold("PATCH …")`.
  - «a refused take is said in the sheet, which stays» — `PATCH` → 422 `DICE_ROLL_MISMATCH` → `.g-player-sheet__refusal` со словами.
  - «a Favoured roster adds the god's bonus after the advancement» — состав с `favouredChoice`: готово, навык бога, «Add» → `PATCH` `{type: "favoured", playerId, skill}`.
  - «undo takes the advancement off» — «Undo» → `{type: "undo-advance", playerId}`.
  - `test/post-match-client.test.mjs`: «a post-match roll is asked once at a time, a lost answer is lost, a waiting roll of the other kind is said by its purpose» — по образцу `test/team-rolls-client.test.mjs`.
  - Существующие `test/team-advance*.test.mjs` — без изменений (лист «Состава» синхронный, как был).
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/post-advance.test.mjs test/post-match-client.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-advance.test.mjs test/team-advance-rolls.test.mjs test/team-advance-undo.test.mjs test/team-rolls-client.test.mjs` → PASS без изменений; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/post-advance.mjs src/screens/matches/post.mjs src/screens/team/roster/advance.mjs src/screens/team/roster/wire.mjs src/data/post-match-client.mjs src/i18n/en.json src/i18n/ru.json test/post-advance.test.mjs test/post-match-client.test.mjs
git commit -m "feat(post): advancing in the post-match is the roster's sheet — two D16 rolled for the post-match, one taken; a characteristic's D8; the table's way; a journeyman at the table only; the god's bonus after it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): упор — Review Focus 2; что лист «Состава» не изменил поведения (синхронный «Взять» в том же такте), что `advance.mjs` ≤ 540 строк.

---

### Task 11: Итоги 2.x удалены

**Files:**
- Delete: `src/screens/games/post-match.mjs`, `src/components/post-match/{steps,players,review,shared,finance}.mjs`, `src/components/games/checklist-layout.mjs`, `src/styles/post-match.css`
- Modify: `src/styles.css` (строка `@import url("styles/post-match.css");` :25 — удалить), `src/styles/{pre-match,matchday,site-matchday}.css` (правила без читателей), оба словаря (ключи без читателей), `test/legacy-screens.test.mjs`

**Interfaces:**
- Consumes: —
- Produces: остаются `components/post-match/game-panel.mjs`, `components/pre-match/{game-panel,shared}.mjs`, `components/matchday.mjs`, `components/games/result-fields.mjs`, `data/post-match-client.mjs` (Global Constraints).

- [ ] **Step 1: Убедиться, что читателей нет** — `grep -rn "screens/games/post-match\|components/post-match/\(steps\|players\|review\|shared\|finance\)\|checklist-layout" src test scripts` → только удаляемые файлы.
- [ ] **Step 2: Удалить** модули и `post-match.css`; из `pre-match.css`, `matchday.css`, `site-matchday.css` — правила, чьих классов нет ни в одном `src/**/*.mjs` (скрипт: для каждого селектора-класса — `grep -rqw` по `src`; список удалённых — в сообщение коммита). Селекторы `:not(.pre-dice-field):not(.pre-checkbox)` `pre-match.css` (передача 09a → 13) — убрать, если их правила остались без читателей. Ключи `post.*` без читателя — скрипт по `src/**/*.mjs` с учётом семейств из шаблонов (`post.status.`, `post.step.`, `post.mode.`, `post.stat.`, `post.injury.`, `post.advancement.`, `post.mistake.`) — удалить из обоих словарей; ключи страницы игры (`post.title`, `post.open`, `post.viewCompleted`, `post.completed`, `post.entryIntro`), «Моих игр» (`post.status.*`) и редактора 2.x остаются.
- [ ] **Step 3: Тесты** — `test/legacy-screens.test.mjs`: утверждения об удалённых правилах убрать, остальные — как были. Run: `npm run build && . output/09b/env.sh && npm test && npm run check && npm run i18n:check` → PASS, 0 недостижимых функций.
- [ ] **Step 4: Commit**

```bash
git add -A src/screens/games src/components/post-match src/components/games src/styles src/styles.css src/i18n/en.json src/i18n/ru.json test/legacy-screens.test.mjs
git commit -m "chore(post): the 2.x post-match is gone — its screen, its steps, the checklist layout, its stylesheet, the rules and the keys nothing reads; the game page keeps its panels" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Mock и smoke

**Files:**
- Create: `scripts/mock/post.mjs`, `test/mock-post.test.mjs`
- Modify: `scripts/mock-api.mjs` (:556 — `answerPost` перед `answerMatches`, та же строка; импорт — в существующей строке импортов `scripts/mock/*`), `scripts/smoke-post-match.mjs`

**Interfaces:**
- Consumes: `createPostMatch`, `applyPostAction` (`state.mjs`), `followEvents` (`events.mjs`), `randomSkillRoll`, `statRoll` (`dice.mjs`), `publicRoll`-форма (`scripts/mock/rolls.mjs`), `matchReference` (`server/domain/match-reference.mjs`); из `scripts/mock-api.mjs` — через параметр `mock` (команды, игры, `readBody`, `reply`, `refuse`), без новых экспортов.
- Produces (`scripts/mock/post.mjs`; шапка — пути и состояния):
  - `answerPost(request, pathname, mock) → Promise<{status, payload}|null>`:
    - `GET /api/games/:id/post-match`, `PATCH` того же, `POST /api/games/:id/finish` — для `g2` (в игре у `t2`): итоги из снимков подготовки mock (`scripts/mock/matches.mjs` — старт `g2`), записи `g2` — свои, как в прототипе: игрокам `t2` по порядку — TD 1 + COMP 1, TD 1, CAS 2, CAS 1 + KO 1, Lasting (AG); `PATCH` — `applyPostAction` на ревизии (иначе 409 `POST_REVISION`), ошибки домена — их коды; `finish` — `status: "completed"` и `postMatchStatus` игры;
    - `POST /api/games/:id/post-match/rolls` — бросок по составу итогов с mock-кубиком (детерминированный порядок граней), повтор — тот же;
    - mock-only `POST /api/mock/post/:id/:case` — `result` (пусто), `sent` (наш счёт ждёт), `agreed`, `mismatch` (счёт 3–1 при записях 2–1), `fans`, `players`, `players-two` (техническая победа: два MVP), `conceded` (мы сдались: уходы ветеранов), `roster`, `finance`, `next`, `review`, `ready`, `completed` — играет домен за обе стороны до состояния.
  - `scripts/smoke-post-match.mjs`:
    - в `verify` лиги, после `stats(f, "home")`: бросок итогов `POST …/post-match/rolls {playerId: <home players[0]>, purpose: "random_skill", category: <первая категория primary его позиции>}` → 200; повтор — тот же `id`; `advance` с `grant.skill` первого кубика и `roll: {id, via: "site"}`; после завершения — у игрока в блобе прокачка с `roll.id`, `GET /api/teams/:id/rolls` — `usedAt` не `null`; утверждение `home.players[0].advancements.length` → 1 у лиги (0 у товарищеского).
    - `deathCounts(veteran)` для фикстуры с `previousGames = 4`: статистика с травмой `dead` у `snapshot.players[1]`, шаги до `ready`, `finish` → `GET /api/teams/:id/fallen` содержит его с `fromMatch: true` и `pairingId`, в блобе его нет.
    - «Игроки» с суммой TD игроков ≠ счёту → `lock-players` 409 `POST_STATISTICS` (до верной статистики).
    - Последняя строка: «… a site roll in the post-match used once at the finish, a death of the post-match in the team's fallen, the score held to the records».
- [ ] **Step 1: Падающие тесты** — `test/mock-post.test.mjs` (по образцу `test/mock-matches.test.mjs`): «the mock plays the post-match to each case and answers its writes as the domain does» — каждый `case` → `GET` даёт ожидаемый `stage`/`status`; `mismatch` — расхождение `scoreMismatches`; бросок повтором — тот же `id`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/mock-post.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** mock и smoke.
- [ ] **Step 4: Проверки** — `node --test test/mock-post.test.mjs` → PASS; рецепт М: `curl -fsS -X POST -H 'Authorization: Bearer mock' http://localhost:5181/api/mock/post/g2/players` → затем `GET …/api/games/g2/post-match` → `postMatch.home.stage` (или сторона `t2`) 2; рецепт С: `smoke:post-match` → строка `passed` с новым хвостом, три остальных — `passed`; `wc -l scripts/mock-api.mjs` → 599; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add scripts/mock/post.mjs scripts/mock-api.mjs scripts/smoke-post-match.mjs test/mock-post.test.mjs
git commit -m "test(mock): the post-match played by the domain to each case, its rolls and its finish; the post-match smoke rolls on the site, finishes a death into the team's fallen and holds the score to the records" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `rehearsal:transitions` — сквозной тест переходных состояний 2.x → 3.0 ⚠ ревью сразу

Спека выката §3.3; мастер-план «Дополнения → 09b» (:344–:345); решения 26, вопрос владельцу 1.

**Files:**
- Create: `scripts/rehearsal-transitions.mjs`, `scripts/rehearsal/transitions-api.mjs`, `scripts/rehearsal/transitions-seed.mjs`, `scripts/rehearsal/transitions-finish.mjs`, `scripts/rehearsal/transitions-checks.mjs`, `test/rehearsal-transitions.test.mjs`
- Modify: `package.json` (`"rehearsal:transitions": "node scripts/rehearsal-transitions.mjs"` после `rehearsal:migrate`)

**Interfaces:**
- Consumes: `loadEnvFile` (`server/config/env-file.mjs`), `preparationStep` (`src/domain/match/preparation.mjs:12`), `calculateMatchCtv` (`src/domain/match/roster.mjs`), `normalizeSppCounters` (`src/domain/roster/players.mjs`), `MATCH_COUNTERS` (`events.mjs`).
- Produces:
  - CLI (`scripts/rehearsal-transitions.mjs`; шапка — что делает, порядок репетиции из решения 26, что никогда не трогает БД сама): `--seed <url>` или `--finish <url>` (ровно один); `assertLocalSite(url)` — `http:`, хост `localhost`/`127.0.0.1`/`[::1]`, иначе отказ; `--seed` пишет `output/rehearsal/transitions.json` (права `0o600`: в нём тестовые пароли прогона), `--finish` читает его и пишет `output/rehearsal/transitions-finish.json`; по строке на состояние «`<state>: ok`» / «`<state>: FAIL — <почему>`»; код 1 при любом FAIL, 2 — без файла засева. `--finish` требует `ADMIN_LOGIN` и `ADMIN_PASSWORD` в окружении (как у сервера 3.0), иначе отказ с этими словами.
  - `siteApi(base) → {request(method, path, {token, body}) → Promise<{status, data}>, ok(method, path, opts) → Promise<data>}` (`transitions-api.mjs`) — `ok` бросает с методом, путём, статусом и телом; `transitionRoster(name) → object` — состав людей (`teams/human`, 11 игроков `rowIndex` `[0,0,0,0,0,0,1,2,2,3,3]`, id `t-<stamp>-<n>`, `treasury: 100`, `dedicatedFans: 2`, у первого `spp.bonus: 30` — SPP на прокачку).
  - `seedTransitions(api, {stamp}) → Promise<TransitionsRecord>` (`transitions-seed.mjs`), только API `v2.1.0`: два тренера `POST /api/auth/register {login: "transitions-home-<stamp8>", password, telegram: "@transitions"}` (пароль — `randomUUID()`), по пять команд `POST /api/teams`, пары — вызов `POST /api/challenges {opponentId, teamId}` хозяев и `POST /api/challenges/:id/accept {teamId}` гостей:
    1. `preparation` — фанаты обеих (`fans`), погода (`weather`) → шаг «Состав» (`preparationStep` = 2);
    2. `started` — подготовка целиком (как `scripts/smoke-friendly.mjs:79`, без индьюсментов) и `POST /start`;
    3. `postPlayers` — подготовка, старт, итоги 2.x: `result` (2–1, CAS 1–0) и `agree-result`, `fans` обеих, `statistics` обеих (TD игрокам, MVP, у хозяев травма `miss`), `lock-players` обеих — сторона на шаге 3, в состоянии нет `followsEvents`; записаны составы команд **до** итогов (`GET /api/teams/:id`) и статистика итогов;
    4. `proposed` — `POST /api/games/:id/propose {homeTouchdowns: 2, awayTouchdowns: 0, homeCasualties: 1, awayCasualties: 0}` хозяевами, без подготовки;
    5. `challenge` — вызов хозяев пятой командой, не принят.
    `TransitionsRecord` — `{version: 1, stamp, seededAt, seedBase, coaches: {home: {login, password, id}, away: {…}}, season: <GET /api/season>, states: {preparation: {gameId, step}, started: {gameId, teamIds}, postPlayers: {gameId, teamIds, before: {<teamId>: roster}, statistics: {home, away}, mvps: {home, away}}, proposed: {gameId, score}, challenge: {challengeId, teamId}}}`.
  - `finishTransitions(api, record, {admin}) → Promise<{state: string, ok: boolean, checks: string[], error?: string}[]>` (`transitions-finish.mjs`), только API 3.0:
    - `preparation`: `GET …/preparation` → `preparationStep(preparation) === record.states.preparation.step` («подготовка продолжается с того же шага»); дальше — составы, корзины по очереди CTV, подтверждения, старт; затем `playPostMatch` (ниже);
    - `started`: тап хозяев `POST /api/teams/:id/events {pairingId, playerId, counter: "touchdowns", delta: 1}`; `playPostMatch`;
    - `postPlayers`: `GET …/post-match` → стороны на шаге 3, ключа `followsEvents` нет; `lock-roster`, `finance {deposit: 0, mistake: {roll: 6}}`, `next {captain}`, `confirm` обеих, `finish` → 200 (не `POST_TEAM_CHANGED`); проверки — `sppAfterMatch` (ниже) против составов после, записи матча (`GET /api/teams/:id/events?pairing=`) все с `settledAt` и в сумме равны статистике итогов, казна — тождество `settlement.accounting` (как smoke), очки 0:0;
    - `proposed`: админ `PATCH /api/games/:id {homeTouchdowns, awayTouchdowns, homeCasualties, awayCasualties}` → `resultStatus: "confirmed"`, счёт тот же, очки 0;
    - `challenge`: гости `POST /api/challenges/:id/accept {teamId}` → 200 с `gameId`;
    - в конце: `GET /api/season` равен `record.season` (товарищеские таблицу не трогают).
    - `playPostMatch(api, gameId, tokens)` — `result` (по записям) и `agree-result`, `fans`, `statistics` из статистики стороны с MVP, `lock-players`, `lock-roster`, `finance`, `next`, `confirm`, `finish`; проверки — те же, что у `postPlayers`.
  - `transitions-checks.mjs` (чистый): `assertLocalSite(url)`; `parseTransitionsArgs(argv) → {mode: "seed"|"finish", base}` (иначе бросает с подсказкой); `assertTransitionsRecord(value) → TransitionsRecord` (версия, все пять состояний); `sppAfterMatch(beforePlayers, side) → Map<id, counters>` — `normalizeSppCounters(before.spp)` + статистика стороны по `MATCH_COUNTERS` + MVP (по разу за упоминание в `side.mvps`), только игроки состава (журнеймены и звёзды — нет), режим «Сыграно»; `sppMismatches(expected, afterPlayers) → string[]` — «<id>: <counter> <ожидалось> ≠ <есть>».
- [ ] **Step 1: Падающие тесты** — `test/rehearsal-transitions.test.mjs` (только чистое):
  - «the site must be local: http on localhost, 127.0.0.1 or ::1» — `https://bloodbowlyerevan…` и `http://10.0.0.2:3004` — отказ; `http://localhost:3004` — да.
  - «exactly one of --seed and --finish, each with its site» — `["--seed"]`, `["--seed", "x", "--finish", "y"]`, `[]` — отказ со словами; `["--finish", "http://127.0.0.1:3077"]` → `{mode: "finish", base}`.
  - «a record names all five states, or it is not one» — без `challenge` — отказ.
  - «SPP after the match is SPP before plus the match's statistics and MVPs, once» — игрок с `spp {touchdowns: 2}`, статистика TD 1, MVP дважды → `{touchdowns: 3, mvps: 2}`; журнеймена снимка в результате нет; `sppMismatches` на вдвое прибавленных → строка.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/rehearsal-transitions.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS; `npm run check` (скрипты под бюджетами и без недостижимых функций).
- [ ] **Step 5: Прогон** — рецепт Р целиком: `--seed` → «seeded 5 states», `--finish` → пять `ok`. Красное — исправить в этой задаче (не в коде итогов без вопроса: настоящая поломка перехода — стоп, вопрос контроллеру).
- [ ] **Step 6: Commit**

```bash
git add scripts/rehearsal-transitions.mjs scripts/rehearsal/transitions-api.mjs scripts/rehearsal/transitions-seed.mjs scripts/rehearsal/transitions-finish.mjs scripts/rehearsal/transitions-checks.mjs package.json test/rehearsal-transitions.test.mjs
git commit -m "feat(rehearsal): rehearsal:transitions — 2.1.0 seeds a preparation half done, a match begun, a post-match past its Players step, a score sent and a challenge waiting; 3.0 takes each to its end and checks the step, SPP once, settled records, money, the admin's score and the challenge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Ревью сразу** (контроллер): упор — Review Focus 4, что проверки независимы от проверяемого кода (SPP считаются сами, не доменом итогов), что скрипт не касается БД и отказывает не локальному адресу, что пароли прогона только в `output/`.

---

### Task 14: Финальное ревью ∥ снимки рядом с прототипами (контроллер)

Две работы **параллельно** (два агента), результаты — в одну волну исправлений (Task 15). Ничего не исправлять в этой задаче.

**A. Финальное ревью ветки** — шаг 7 протокола (skill requesting-code-review), вся ветка от `origin/redesign`; упор: Review Focus, таблица «Как идёт каждая запись», сервер (блокировки, `used_at`, отказы), что «Состав» 07a–07e не изменился (лист прокачки синхронный, R8), D2, слова и переносы, CSP, `escapeHtml`, ловушка `check-references`. Итог — `output/09b/final-review.md` (не коммитится): «Critical / Important / Minor» со ссылками `file:line`.

**B. Снимки** (протокол, шаг 6; требование близости): каждое состояние на 390 и 1440, светлая и одна тёмная палитра, выборочно 768 и 1024; рядом — прототип той же ширины; список отличий. Файлы — `output/screens/rd-09b/` (не коммитятся).

**Files:**
- Create: `docs/redesign/screens/rd-09b.json`

- [ ] **Step 1: Серверы.** `lsof -iTCP:3077 -iTCP:5181 -iTCP:5196 -iTCP:5200 -sTCP:LISTEN || echo free`. Рецепты М и П. Состояния, которые пишут (W1–W3), — последними, по одной ширине; после них mock перезапускается.
- [ ] **Step 2: `rd-09b.json`** — как `docs/redesign/screens/rd-09a.json` (`widths` `[390, 1440]`, те же `heights` и варианты), адреса на `5181`, хранилище `gata-league-auth-token: mock`; состояние итогов — `run` с `fetch("/api/mock/post/g2/<case>", {method: "POST"})` и перезагрузкой.

| id | адрес | действие (`case`) | ширины | прототип: телефон / десктоп | что проверяет |
|---|---|---|---|---|---|
| S1 | `#/games/g2/post-match/result` | `result` | + 768, 1024 | `PostResult` / `DeskPostResult` | записи, степперы, режим |
| S2 | то же | `mismatch` | | `PostResultMismatch` / `DeskPostResult` (`CFG` TD 3) | плашка расхождения |
| S3 | то же | `sent` | 390 | — | ждём соперника, закрытая кнопка |
| F1 | `#/games/g2/post-match/fans` | `agreed` | | `PostFans` / — | доход и фанаты |
| P1 | `#/games/g2/post-match/players` | `fans` | + 768, 1024 | `PostPlayers` / `DeskPostPlayers` | события, MVP, травма, «может прокачаться» |
| P2 | P1 | клик по строке события | | — | лист статистики |
| P3 | P1 | `players-two` | 390 | — | два MVP |
| P4 | P1 | `conceded` | 390 | — | ветераны после сдачи, SPP «—» |
| A1 | P1 | «Прокачать» → «Случайный» → категория → «Бросить два D16» | | `Adv3Random` / `DeskRosterAdv` | пара кубиков в итогах |
| R1 | `#/games/g2/post-match/roster` | `roster` | | `PostRoster` / — | персонал, найм, операции |
| R2 | R1 | «+ Нанять» | 390 | — | лист найма |
| T1 | `#/games/g2/post-match/finance` | `finance` | | `PostFinance` / — | сейф, Expensive Mistakes |
| N1 | `#/games/g2/post-match/next` | `next` | | `PostNext` / — | вернутся, пропустят, капитан |
| V1 | `#/games/g2/post-match/review` | `review` | + 768, 1024 | `PostReview` / `DeskPostReview` | итог, «Ждём» |
| V2 | V1 | `completed` | | — | завершено, ссылки |
| U1 | `#/games/g2/post-match/result` | `ru`, `fullPage` | 390 | `PostResult` | кириллица |
| U2 | P1 | `ru` | 1440 | `DeskPostPlayers` | кириллица |
| W1 | P1 | грань MVP | 390 | `PostPlayers` | запись, ответ нарисован |
| W2 | V1 | `ready`, «Завершить матч» | 390 | — | завершение, только чтение |
| W3 | `#/t/t2/roster` | после W2 | 390 | — | «Состав» вышел из режима матча (`postMatchStatus` `completed`) |
| G1 | `#/games/g2/post-match` без токена | — | 390 | — | гость идёт ко входу |

- [ ] **Step 3: Снять** — `npm run screens -- docs/redesign/screens/rd-09b.json --out output/screens/rd-09b` → `… PNG(s) written …, 0 not taken`; ошибки браузера — `errors.json` (ожидаемых нет).
- [ ] **Step 4: Прототипы рядом.** Каждый прототип таблицы (`review: false`) — с `http://127.0.0.1:5196/…` той же шириной в `output/screens/rd-09b/proto/`; `output/screens/rd-09b/compare.html` (виден на `http://127.0.0.1:5200/compare.html`) — для каждого состояния наш снимок и прототип рядом, под ними список отличий.
- [ ] **Step 5: Список отличий** — каждое видимое отличие строкой: «исправить» (поломка исправляется всегда: текст ниже 4.5:1, перенос «пилюли» или короткой подписи кнопки, «…», прячущее данные, горизонтальная прокрутка на 390, цель меньше 44px до 900px или 24px от 901px, шрифт без кириллицы, лишняя ошибка в консоли, неработающее действие, два `h1`) или «оставить» с причиной (данные mock; решения 1–28 и их записанные расхождения; правило кода). Итог — `output/09b/fidelity-diffs.md`.
- [ ] **Step 6: Реальный сервер вручную** (встроенный браузер, 3077, `gata_smoke_09b`; тестовые значения — из `scripts/seed-pre-match-preview.mjs`): два тренера в двух источниках (`http://localhost:3077` — `preview-home`, `http://127.0.0.1:3077` — `preview-away`). Подготовка до старта (09a), тап TD в «Составе» хозяев; «Итоги матча»: хозяева шлют счёт из записей, гости подтверждают; оба — доход, игроки (MVP, у хозяев бросок двух D16 и прокачка), состав, казна, дальше, итог; «Завершить матч» хозяевами; гости видят завершённое. В базе: `. output/09b/env.sh && psql "$SMOKE_URL" -Atc "SELECT used_at IS NOT NULL FROM dice_rolls ORDER BY created_at DESC LIMIT 1"` → `t`; `SELECT count(*) FROM match_events WHERE settled_at IS NULL AND pairing_id = '<игра>'` → 0. Что увидено и вывод `psql` — в `output/09b/real-server.txt` для PR.
- [ ] **Step 7: Commit** (только конфиг снимков)

```bash
git add docs/redesign/screens/rd-09b.json
git commit -m "test(screens): stage 09b states beside their prototypes — every post-match step on both widths, the mismatch, two MVPs, a concession, the two dice of an advancement, the finish" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Одна волна исправлений (контроллер)

- [ ] **Step 1: Сводный список** — `output/09b/final-review.md` и `output/09b/fidelity-diffs.md` в один; Critical и Important ревью и все «исправить» сверки — к исправлению; Minor — исправить, если дешевле, чем объяснить, иначе в PR как известный предел.
- [ ] **Step 2: Исправления** — один исполнитель (или по одному на несвязанные файлы) с этим списком; каждое — коммит `fix(<область>): <что> on <экран>` с трейлером и тестом, где поведение; после — полный прогон (рецепт Т).
- [ ] **Step 3: Пересъёмка** — `npm run screens -- docs/redesign/screens/rd-09b.json --out output/screens/rd-09b --only <ids исправленных>`; `compare.html` обновлён; Critical/Important закрыты — короткая повторная проверка того же ревьюера по диффу волны. Второй волны нет: оставшееся — в PR.

---

### Task 16: Проверки перед PR (контроллер)

- [ ] **Step 1: Шаг 8 протокола**

```bash
npm run build && . output/09b/env.sh && npm test && npm run check && npm run i18n:check
APP_URL=http://localhost:3077 npm run smoke
. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3077 npm run smoke:pre-match
. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3077 npm run smoke:friendly
. output/09b/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3077 npm run smoke:post-match
git diff --name-only --diff-filter=d origin/redesign -- src | xargs grep -nE ">[A-ZА-Я]" || true   # только комментарии и ключи t()
python3 -c "import json
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
en = json.load(open("src/i18n/en.json", encoding="utf-8")); ru = json.load(open("src/i18n/ru.json", encoding="utf-8"))
new = [k for k in en if k not in old]
print(len(new), "new keys; missing in ru:", [k for k in new if k not in ru])
print("outside after.*:", [k for k in new if not k.startswith("after.")])
print("removed:", [k for k in old if k not in en])
PY
git diff --stat origin/redesign -- content/ server/db/migrations/   # пусто
git diff --name-only origin/redesign -- server/                    # только файлы Task 3
wc -l src/screens/matches/post*.mjs src/screens/matches/post*.css src/screens/team/roster/advance.mjs server/api/dice-rolls.mjs scripts/mock-api.mjs scripts/mock/post.mjs scripts/rehearsal-transitions.mjs scripts/rehearsal/transitions-*.mjs scripts/smoke-post-match.mjs src/app.js
```

Затем рецепт Р целиком (`--seed` против `v2.1.0`, миграции, `--finish` против 3.0).

Expected:
- всё зелёное; одинаковое число страниц EN/RU, 0 fallback; четыре smoke — `passed` (у `smoke:post-match` — с новым хвостом); `rehearsal:transitions --finish` — пять `ok`, код 0;
- `i18n keys unique`; `missing in ru: []`; вне `after.*` — `[]`; удалённые — только ключи `post.*` итогов 2.x (перечислить в PR);
- `content/` и миграции не менялись; на сервере — `routes/post-match.mjs`, `routes/team-rolls.mjs`, `season/post-match.mjs`, `api/dice-rolls.mjs`;
- каждый файл ≤ 600, `scripts/mock-api.mjs` 599, `advance.mjs` ≤ 540, `src/app.js` ≤ 120.
- [ ] **Step 2: `PR-CHECKLIST.md` целиком** — особенно: миграций нет; новых кодов ошибок нет (`test/api-errors.test.mjs`); перенесённый экран удалил старое (итоги 2.x — да; страница игры 2.x — не переносилась); экран совпадает с прототипом — `compare.html`; снимки 390 и 1440, 768 и 1024.

---

### Task 17: Правки спек и мастер-плана (контроллер)

PR-CHECKLIST: «Если реализация разошлась со спецификацией — спецификация поправлена в том же PR».

- [ ] **Step 1: Спека 3.0:**
  - §2, таблица «До своего этапа», строка `#/games/…`: `#/games/:id/post-match[/:step]` — итоги 3.0 (`screens/matches/post.mjs`, этап 09b) в рамке подготовки, `bare`;
  - §3.3: «Post-match при травме `dead` пишет строку …» — дополнить: экран итогов говорит гибель на «Игроках» и «Итоге», после завершения «Состав» перечитывает команду (09b);
  - §3.4: абзац «**Бросок в итогах** (этап 09b)»: маршрут `POST /api/games/:id/post-match/rolls`, почему не `POST …/rolls` (`TEAM_IN_MATCH`; состав итогов), кто бросает, `advance` с `roll` (проверка под блокировкой), `used_at` при завершении (`settleRosterRolls`), журнеймен — за столом, бонус Favoured — действием `favoured` (вопрос 3);
  - §3.7: «Счёт из записей» — как построено (решения 4–7); «Итоги» — тап, изменивший сторону, сказан и снимает прокачки;
  - §4: строки `POST /api/games/:id/post-match/rolls`, `PATCH …/post-match` (`advance` с `roll`, `favoured`), `POST …/finish` (тратит броски); `POST …/rolls` — «во время матча — 422 `TEAM_IN_MATCH`; бросок итогов — свой маршрут»;
  - §6, строка «Матчи … итоги»: модули 09b (`post`, `post-model`, `post-steps`, `post-players`, `post-roster`, `post-money`, `post-review`, `post-advance`, CSS `post`, `post-players`; домен `domain/post-match/score.mjs`); «Что уходит»: итоги 2.x — ушли с 09b;
  - §7: блок «Расхождения этапа 09b» — из решений и Task 14: подписи шагов прототипа, «записей: 8 + 3» без снятых тапов, «Победитель» при не «Сыграно», правка статистики листом на телефоне, второй MVP — разные игроки, звезда-кнопка на десктопе, «До конца сезона», ветераны после сдачи, D3/2D6 Expensive Mistakes, чип над кнопкой на десктопе, «Состав» и «Казна» без своих десктопных прототипов, после завершения — «Итог» только для чтения, слова нейтральные («в строю», «Найм:»), числа без форм множественного числа; «Передано» (см. «Передача следующим этапам»).
- [ ] **Step 2: Спецификация интерфейса:** §20 — «Как построено на этапе 09b» (решения 1–20); «Известные расхождения» п. 3 — закрыто (сдача: ветераны, нет SPP и дохода — на шагах); блок «Расхождения этапа 09b».
- [ ] **Step 3: Спека выката:** §3.1 — `rehearsal:transitions -- --seed <url 2.1> | --finish <url 3.0>`, только HTTP, `output/rehearsal/transitions*.json`; §3.2 п. 2 — порядок: restore → сервер `v2.1.0` → `--seed` → check `--before` → migrate → check `--after` → сервер 3.0 → smoke → `--finish`; §3.3 — пять состояний на товарищеских (ответ на вопрос 1 или умолчание), «очки верны» — 0:0 и неизменная таблица.
- [ ] **Step 4: Мастер-план** — «Процедура репетиции», шаг 4: команды в порядке Step 3 (`--seed` после `rehearsal:restore` и до `rehearsal:check -- --before`, `--finish` после smoke на 3.0; сервер `v2.1.0` на 3004 нужен и для засева); «Дополнения → 09b» — пометка «сделано этапом 09b» у четырёх строк (строка ActionStepper — «сделано 07a»).
- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-14-redesign-design.md docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md docs/superpowers/specs/2026-10-14-redesign-rollout-design.md docs/superpowers/plans/2026-10-14-redesign-rollout.md
git commit -m "docs(spec): stage 09b — the post-match by steps as built, its own roll and the roll's use at the finish, the fallen of the post-match; rehearsal:transitions and where it stands in a rehearsal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: PR и после слияния (контроллер)

- [ ] **Step 1: Ребейз**, если в `redesign` что-то влито с начала этапа (этап 10): `git fetch origin && git rebase origin/redesign`, конфликты в словарях — объединение ключей, `router.mjs`/`navigation.mjs`/`styles.css` — обе строки; затем Task 16, шаг 1 заново.
- [ ] **Step 2: Тело PR** (`<scratchpad>/pr-rd-09b.md`):
  - пункты этапа 9 плана 3.0 («`rehearsal:transitions`», «Post-match по шагам …») и как закрыты; что ушло в 09c;
  - таблица «Как идёт каждая запись»; что делают 409, потерянный ответ, двойное нажатие и двойное завершение; бросок итогов и `used_at`;
  - «Решения этого плана» коротко; ответы на вопросы 1–3 (или принятые умолчания); D2 и правила владельца — что сделано;
  - таблица «Маршруты этапа 09b»;
  - вывод Task 16, прогон `rehearsal:transitions` (пять строк), ручная проверка (`output/09b/real-server.txt`);
  - снимки S1–S3, F1, P1–P4, A1, R1–R2, T1, N1, V1–V2, U1–U2, W1–W3, G1 рядом с прототипами (загрузкой), `compare.html` и список отличий;
  - общие файлы и куски (Global Constraints, «Параллельный этап 10»), куски в файлах 07d и 09a;
  - известные ограничения: страница игры 2.x и её панели — этап 13; лиговое состояние `rehearsal:transitions` (вопрос 1); привязка ждущего броска к прокачке за столом в итогах — в «Составе» после итогов;
  - правки спек; «Передача дальше»; строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin rd/09b-post-match
gh pr create --base redesign --head rd/09b-post-match --title "rd/09b: the post-match by steps — the score from the match records and its mismatch, MVP, injuries and the fallen, the roster's advancement sheet with its two dice; rehearsal:transitions" --body-file <scratchpad>/pr-rd-09b.md
gh pr merge <номер> --merge
```

После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **Step 3: После слияния** (шаг 10 протокола): в плане 3.0, «Этап 9», пункты «`rehearsal:transitions`» и «Post-match по шагам …» → `[x]`; в мастер-плане строка `09b` → `[x]`; коммит `docs(plan): stage 09b done` в следующей ветке или прямым коммитом в `redesign`; `git worktree remove ../bb-rd-09b`; базы `gata_smoke_09b`, `gata_transitions_09b` — `dropdb`; `../bb-v2.1.0` оставить (нужен репетициям M3–M5).

---

## Передача следующим этапам

- **09c · вызовы.** Товарищеский матч от вызова идёт теми же подготовкой и итогами; `rehearsal:transitions` уже принимает висящий вызов (`POST /api/challenges/:id/accept`) — новый экран вызовов этого не меняет.
- **10 · таблица и соперник.** Очки матча — `postPoints` (`domain/post-match/score.mjs`), с частями для подписи; броски сопернику — тем, что выпало (`rolledDice`), без попыток, как решил 07d.
- **12 · админка.** Админ бросить в итогах не может (решение 22) — если владелец захочет, это одно условие в `rollInPostMatch`; брошенный матч (итоги не завершены) — действие админа всё ещё не запланировано; ввод старых неподтверждённых счетов проверяет `rehearsal:transitions` (`PATCH /api/games/:id` админом).
- **13 · зачистка.** Страница игры 2.x (`screens/games/game.mjs`) и её панели (`components/post-match/game-panel.mjs`, `components/pre-match/{game-panel,shared}.mjs`, `components/games/result-fields.mjs`), остаток `styles/pre-match.css`, `matchday.css`, `site-matchday.css`; общие части `prep.mjs` и `post.mjs` (взвод подвала, опрос с отступом) — в один модуль; глоссарий: «Итоги матча», «Из записей матча», «Отличились», «Ветераны после сдачи».
- **M3 и далее · репетиции.** Порядок с `rehearsal:transitions` — мастер-план «Процедура репетиции» в редакции Task 17; worktree `../bb-v2.1.0` уже есть; «Матч начат, итоги не завершены» в день X — предупреждение при зелёном прогоне (спека выката §6.2).
- **Любой этап.** `sideRecords`, `hasRecords`, `scoreMismatches`, `postPoints`, `POINT_PARTS`, `mvpChoices`, `nextMatchChanges` (`domain/post-match/score.mjs`); действие `favoured` и прокачка с `roll` (`domain/post-match/state.mjs`); `POST /api/games/:id/post-match/rolls`, `checkPostRoll` (`server/api/dice-rolls.mjs`); `askPostRoll` (`data/post-match-client.mjs`); `advanceHandlers(saving, {take, ask, bind})` — лист прокачки 07d для любого места, где прокачка — не шаг очереди «Состава»; `prepFrameMarkup` с `opponentHtml`, `actionLeadHtml`, `noticesHtml`, `stepsLabel`.

## Охват

| Пункт | Задача |
|---|---|
| План 3.0, этап 9: «Post-match по шагам в новом виде: счёт и события из записей» | 2, 5, 6, 9 (решения 4–9) |
| … «расхождение со счётом» | 2, 5, 6, 9 (решение 7) |
| … «MVP (отличившиеся сверху; при технической победе или сдаче — 2 MVP)» | 2, 6 (решение 10; вопрос 2) |
| … «павшие идут в `team_fallen_players`» | сервер — 02a (решение 24); экран — 6, 8, 9; сквозная проверка — 12 |
| План 3.0, этап 9: `npm run rehearsal:transitions` | 13, 16, 17 (решение 26; вопрос 1) |
| Мастер-план «Дополнения → 09b»: скрипт `--seed`/`--finish`, пять состояний, проверки | 13 |
| … «Из 02b»: пересборка стороны после смены счёта и `reset-side`, расхождение в интерфейсе; настоящая строка итогов 2.x | 9 (тест «a new score rebuilds …»), 13 (состояние `postPlayers` создаёт `v2.1.0`) |
| … «Из 03»: `advance` принимает `roll`, `rollFitsAdvancement`, `used_at` в транзакции итогов | 1, 3 |
| … ActionStepper «4+1» | сделано 07a (решение 27) |
| Мастер-план «Процедура репетиции» — место `rehearsal:transitions` | 17 (конфликт порядка, решение 26) |
| Спека выката §3.3, §6.2 | 13, 17 |
| Передача 07d: бросок двух кубиков в итогах (`askRoll`, `pairMarkup`, `rolledDice`, `rollFitsAdvancement`) | 3 (`rollFitsAdvancement`), 10 (лист 07d с `pairMarkup`, `askPostRoll` по образцу `askRoll`) |
| Передача 07b: итоги ставят травму через `applyInjuryEffects` | сделано (`domain/post-match/roster.mjs:16` `applyInjury`); 6 показывает |
| Передача 07a: итоги не читают и не пишут строк MVP | 3 (утверждение в тесте БД; решение 28) |
| Передача 03: бросок на сайте в итогах | 3, 10 |
| Передача 09a: рамка подготовки и `bare`; удалить с итогами 2.x их модули и CSS; `matchRecords` для шага «Счёт» | 4, 9 (рамка), 11 (удаление); записи «Счёта» — статистика стороны (решение 4), `matchRecords` не нужен |
| 02b: поведение, когда записи меняют сторону под тренером; «Счёт из записей» | 9 (решение 20), 5 |
| 02b preflight: чужие тапы → `POST_REVISION` на позднем шаге | 9 (`savePostMatch`, Review Focus 1) |
| Спецификация интерфейса §20, «Модель записей матча», известное расхождение 3 | 4–10 (решения 1–20), 5–6 (сдача) |
| SCREENS.md «Матчи · После матча по шагам» (8 телефонных, 3 десктопных) | 4–8; S1–S3, F1, P1–P4, R1–R2, T1, N1, V1–V2 |
| Лист прокачки (`Adv*`, `DeskRosterAdv`) из итогов | 10; A1 |
| Мастер-план 05–13: радиогруппы, отказ степпера говорит причину, лист — фокус на открывшего | Global Constraints; 5–10 |
| Мастер-план 05–13: ключи из шаблонов перебирать | 4–8 |
| Решение владельца D2, близость к прототипам, `compare.html` | все задачи экрана (тесты размеров), 14, 15 |
| Правила владельца: нейтральные слова, переносы, «два D16, тренер выбирает», «один кубик — один свободный навык», замок команды до завершения итогов, процесс «код, затем проверки» | Global Constraints; 6, 8, 10; Task 14–18 |
| Протокол: шаги 6–10 | 14, 15, 16, 17, 18 |
| Правила проекта: бюджеты, `check-references`, CSP, `escapeHtml`, 900/901, явная типографика, `content/` не меняется, 2.x удаляется с переносом | Global Constraints; 11, 16 |

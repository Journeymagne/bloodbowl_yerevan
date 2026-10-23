# Этап 09a · Матчи: табло, «перед матчем», подготовка, игра — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вкладка «Матчи» (`#/t/:id/matches`) получает экран 3.0 вместо «Моих игр» 2.x — на телефоне `Matches.html` (текущий матч картой, «Результаты», «Дальше в сезоне»), на десктопе `DeskSeason.html` без таблицы (табло с листанием по турам и «Календарь»); «Перед матчем» — шторка с CTV, бюджетом индьюсментов и пропускающими обеих сторон, открываемая плиткой, строкой пропусков и пузырями табло; табло обзора десктопа получает то же листание, TV соперника и пузыри; подготовка `#/games/:id/pre-match[/:step]` — экран 3.0 своей рамки (`PreFans`…`PreReview`, `DeskPreInducements`, `DeskPreReview`) на той же логике `src/domain/match/*`; «Идёт игра» — карта с «Записями матча · N» и «Итогами матча»; форма быстрого счёта у тренера удалена (ручной результат админа остаётся); сервер отказывает правке состава, казны, гибели и броскам на сайте, пока команда играет матч; всё — так близко к прототипам, как позволяет код.

**Architecture:** экран «Матчи» строится, как обзор: модель (`matchesModel`) — из того, что уже читается (`/api/season`, `/api/games`), плюс команда соперника (`GET /api/players/:uid/teams/:tid`, спека 3.0 §4: «вкладка «Матчи» собирается на клиенте … без новых эндпоинтов») и записи живого матча (`GET /api/teams/:id/events`). Числа «Перед матчем» — чистый домен (`src/domain/match/preview.mjs`): та же подготовка, что строит сервер (`createPreparation` из сохранённых составов), и тот же бюджет (`matchBudget`), поэтому шторка никогда не расходится с шагом «Индьюсменты». Подготовку **не читаем** ради «Перед матчем»: `GET …/preparation` создаёт её и ставит паре `preparing` (`server/season/preparation-store.mjs:32-48`). Табло — общий компонент `ui/match-board` с аддитивными пропсами (вкладки-квадраты, стрелки, чипы, пузыри, итог прошлого матча) и модуль `screens/matches/band.mjs`, общий для обзора и страницы «Матчи» десктопа. Подготовка 3.0 — свой модуль `screens/matches/prep*.mjs` в рамке `bare` (без шапки, вкладок и SideNav на обеих ширинах, как `PreFans`/`DeskPreInducements`); её записи — те же `PATCH /api/games/:id/preparation` и `POST …/start`, что у 2.x, правила домена не меняются. На сервере — один отказ `TEAM_IN_MATCH` (422) в пяти записях команды, под блокировкой строки команды, и поправка тестового сезона `preview:seed`; миграций нет.

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/fake-dom.mjs`, `fake-api.mjs`, `ui.mjs`, `contrast.mjs`, `roster-page.mjs`, `api-db.mjs`, `match-db.mjs`, `scratch-db.mjs`; CSS custom properties; нативный `<dialog>`; `npm run screens`, `scripts/mock-api.mjs`, `scripts/smoke-*.mjs`.

**Spec:**
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0 (п. 1, 9–12), §2 (таблица «До своего этапа»: `#/t/:teamId/matches`, `#/games/…`), §3.2 и §3.3 («Сервер … не отклоняет … передано 09a»), §3.4 (то же), §3.7 (живой матч, `LIVE_MATCH`), §4 (таблица; «Обзор команды, обзор соперника и вкладка «Матчи» собираются на клиенте»), §6 (строки «Матчи…» и «Состав во время подготовки и матча»), §7 («Известные расхождения»; «Передано» 07d второго круга: листание табло, TV соперника, пузыри подготовки), §9.6 (быстрый счёт у тренера убрать).
- Спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §0, §3 (табло обзора), §7 (слова шагов подготовки в плашках), §16, §17, §18, §19, «Модель записей матча», «Известные расхождения» п. 1, 2, 9, 17.
- Решения владельца, обязательные: **D2** — от 901px элементы управления компактны, как в прототипе, цель не меньше 24px (WCAG 2.5.8 AA), до 900px — 44px; близость к прототипам (2026-10-19): каждое состояние названо своими прототипами, значения — из их HTML, снимки рядом с прототипами, `compare.html` владельцу; **слова, которые называют игрока, — нейтральные**; **длинные строки переносятся**, «…» — только где за ним не прячутся данные (исключение владельца — карточки лидеров обзора десктопа, это не 09a); **табло обзора на телефоне остаётся** («потом отпишу»); деталь прототипа против правила владельца — правило, расхождение записать и спросить. **Процесс (владелец, 2026-10-20): «написать код, а потом разом провести проверки»** — см. Global Constraints, «Процесс».
- Мастер-план `docs/superpowers/plans/2026-10-14-redesign-rollout.md`: Global Constraints, протокол этапа (шаги 1–10; шаги 4 и 7 — в редакции «Процесса» ниже), строка 09a таблицы (зависит от M2; smoke — все четыре), «Дополнения к этапам → 09a» (:342: форма быстрого счёта у тренера удаляется, ручной результат админа остаётся), блок «05–13».
- План 3.0 `docs/superpowers/plans/2026-10-14-redesign.md`, «Этап 9 · Матчи» (:147–:154): пункты 1–4 — этот этап; пункты 5–6 (`rehearsal:transitions`, итоги по шагам) — 09b; пункт 7 (вызовы) — 09c.
- Handoff `docs/redesign/handoff-0.9.1/`: `SCREENS.md` (флоу «Матчи · Табло сезона и календарь», «Перед матчем», «Подготовка к матчу по шагам», «Идёт игра»; мобайл и десктоп); прототипы `mobile/Matches.html`, `MatchesPrePlus.html`, `MatchesPreMinus.html`, `MatchesPreEven.html`, `MatchesLive.html`, `PreFans.html`, `PreWeather.html`, `PreRoster.html`, `PreInducements.html`, `PreReview.html`; `desktop/DeskSeason.html`, `DeskSeasonPrePlus.html`, `DeskSeasonPreMinus.html`, `DeskSeasonPreEven.html`, `DeskSeasonLive.html`, `DeskPreInducements.html`, `DeskPreReview.html`, `DeskOverview.html` (табло обзора); `design-system/`, `PR-CHECKLIST.md`. Шаблоны — строки `DC.define("…", { tpl: "…" })` (снять `\"`, `\n`, `<\/`), демо-состояния — `dc-import` (`demo-match="live"`, `demo-pre="plus-open|minus-open|even-open"`) и логика `factory` (`mdVals`, `preVals`, `bandVals`, `kitVals`): значения в задачах прочитаны из них.
- Передачи: тело PR 07d (`pr-rd-07d.md`, «Передача дальше»: «09 / 09a: листание табло, TV соперника, пузыри подготовки»; `renderMatchBoard` примет их полями); тело PR 07c (`pr-rd-07c.md`: сервер должен отказывать в правке состава во время матча; тестовый сезон `preview:seed` не читается как подготовка); тела PR 07b (отказ сервера для гибели и отмены во время матча), 07a (сервер принимает `PATCH` и операции казны во время матча; «Записи матча» карточки ведут в «Состав»; `readWithGames`, тап после ухода), 08 (`PATCH` и казна во время матча; лимит 8 re-roll), 06 (один чтец предложенного счёта; TV соперника и «Т» среди квадратов), 05 (экраны матча зовут `invalidateGames()`); план 07e «Передача» (09a: табло обзора в матче берёт те же записи, что лидеры, `readRecords`); спека 3.0 §7 «Передано» (второй круг 07d).
- Код (проверено на `origin/redesign` `2fccec3`): `src/screens/games/{my-games,game,pre-match}.mjs`, `src/components/pre-match/*`, `src/components/games/*`, `src/domain/match/*`, `src/shell/{current-match,navigation}.mjs`, `src/ui/{match-board,match-card,sheet,segmented-control,resource-counter,choice}.mjs`, `src/screens/team/overview.mjs`, `src/data/team-record.mjs`, `src/screens/team/manage/sheet-host.mjs`, `server/routes/{teams,team-fallen,team-ledger,team-rolls,preparation}.mjs`, `server/season/{live-match,preparation,preparation-store}.mjs`, `scripts/seed-pre-match-preview.mjs`, `scripts/smoke-pre-match.mjs`, `scripts/mock-api.mjs`.

## Global Constraints

- Ветка `rd/09a-matches-prep`, worktree `/Users/felstell/git/bb-rd-09a`, от `origin/redesign` `2fccec3` (07d влит, PR #29). **План пишется сейчас, исполняется после вехи M2, когда влит этап 07e** (карьера в панели десктопа): Task 0 переносит ветку и сверяет числа строк и имена, на которые опирается план; до Task 0 ни одна задача не исполняется. PR в `redesign` по протоколу мастер-плана, шаги 6–10; в задачах ничего не пушить. Окружение тестов — `. output/09a/env.sh` (`GATA_TEST_DATABASE_URL` — тесты БД создают свои `gata_test_*`; `SMOKE_URL` → `gata_smoke_09a`). **Файл `output/09a/env.sh` держит пароль локальной БД: только `source`, никогда не `cat`, не печатать, не `grep`.** `gata_league` — только через `npm run db:migrate`.
- **Процесс (владелец, 2026-10-20, обязательно): «написать код, а потом разом провести проверки».**
  - Задачи 1–13 идут подряд. Исполнитель каждой пишет и запускает свои тесты; ревьюера после задачи нет.
  - Исключение — задачи, которые пишут данные матча, деньги, SPP или состояние подготовки: после каждой — короткое ревью сразу (skill requesting-code-review, только дифф задачи, с упором на её Review Focus). Такие задачи помечены в заголовке «⚠ ревью сразу»: **Task 1, Task 11, Task 12**.
  - Закрывают этап задачи контроллера, по порядку: Task 14 — **параллельно** финальное ревью всей ветки и снимки с `compare.html` против прототипов (каждое состояние 09a, 390 и 1440); Task 15 — **одна** волна исправлений по обоим; Task 16 — проверки (build, test, check, i18n:check, все четыре smoke); Task 17 — правки спек; Task 18 — PR.
- **Серверы этапа:** реальный сервер на порту **3076** над `gata_smoke_09a`; mock API — `MOCK_PORT=5180`; прототипы — статический сервер на **5196**; страница сравнения — **5199**. Никогда общие 3002 и 5173–5176.
- **Сервер: один отказ и тестовый сезон, миграций нет.**
  - `TEAM_IN_MATCH` (422, Task 1) — пока у команды идёт матч (`teamHasLiveMatch`, `server/season/live-match.mjs:107`, правило `LIVE_MATCH`), отказывают: `PATCH /api/teams/:id` тренера (`writeSavedTeam`, `server/routes/teams.mjs:159`), `POST …/players/:pid/death` (`writeDeath`, `team-fallen.mjs:81`), `DELETE …/fallen/:fid` тренера (`returnPlayer`, `team-fallen.mjs:119`), `POST …/treasury` (`writeEntry`, `team-ledger.mjs:79`), `POST …/players/:pid/rolls` (`rollForOwner`, `team-rolls.mjs:49`). Проверка — под блокировкой строки команды, **после** сверки ревизии (устаревшая вкладка по-прежнему слышит 409 `TEAM_SAVED_ELSEWHERE` с командой, и потерянный ответ узнаётся). Админский `PATCH /api/admin/teams/:id` и отмена гибели админом не отказывают (вопрос владельцу 2). `POST …/events` (тап и правка вне матча) — как был.
  - Тестовый сезон `preview:seed` ставит паре `preparation_status` по своей подготовке (Task 1).
  - `GET /api/games/:id/preparation`, `PATCH …/preparation`, `POST …/start`, `proposeGameResult` и вся логика подготовки — без изменений (§0.10: «логика `src/domain/match/*` не меняется»).
  - Иная правка сервера или миграция — стоп-условие, вопрос контроллеру.
- **Параллельный этап и владение файлами.** 07e исполняется сейчас в `/Users/felstell/git/bb-rd-07e`; его файлы — `src/screens/team/roster/*` (карьера и панель), `src/screens/team/overview-lists.css`, а по его плану ещё `src/data/team-record.mjs`, `src/screens/team/overview.mjs` (лидеры, Task 6 07e), `src/screens/team/player/index.mjs`, `scripts/mock/history.mjs`, `scripts/mock/fallen.mjs`. **09a эти файлы не правит**, кроме минимальных кусков ниже; все задачи 09a исполняются после Task 0 (ребейз на влитый 07e), поэтому куски ложатся на его код:
  - `src/screens/team/roster/panel.mjs:107` — `kickoff: t("pre.step.kickoff")` → `kickoff: t("pre.step.review")` (Task 9; слова шагов подготовки);
  - `src/screens/team/roster/save.mjs` (`patchTeam`, :101) — только если тест Task 1 «… the games are read again» падает: `if (error?.code === "TEAM_IN_MATCH") void invalidateGames();` перед повторным `throw` и импорт `invalidateGames` (2 строки; файл 559/600);
  - `src/screens/team/overview.mjs` — табло (`boardOf`, `boardMarkup`, `opponentOf`, `proposedScore`, `markupOf`, `renderTeamOverview`) — Task 6; лидеры и `readRecords` 07e не трогаются;
  - `src/screens/team/overview-lists.css`, `src/data/team-record.mjs`, `scripts/mock/history.mjs`, `scripts/mock/fallen.mjs`, `src/screens/team/player/index.mjs` — не трогаются (числа и экспорты из них только читаются).
- **Общие файлы и куски 09a в них** (минимальные):
  - `src/ui/match-board.mjs`, `match-board.css` — аддитивные пропсы табло и `wireBoardPager` (Task 5): табло без новых пропсов рисуется как прежде;
  - `src/ui/match-card.mjs` — проп `labelledBy` (Task 7), аддитивный;
  - `src/styles/tokens.css` — одна постоянная `--on-header-loss: #F2A99C` в блоке «Fixed colours» (Task 5);
  - `src/shell/current-match.mjs` — экспорт `sentScore` (Task 6), `matchActions` и карточка SideNav — как были;
  - `src/shell/navigation.mjs` — `preMatch` в `BARE_ROUTES` (:30, Task 11);
  - `src/core/router.mjs` — `teamMatches` (:78, Task 7) и `preMatch` (:85, Task 11);
  - `src/screens/team/manage/index.mjs:101` — `kickoff: t("pre.step.review")` (Task 9);
  - `src/screens/games/game.mjs`, `src/components/games/result-fields.mjs` — без формы тренера (Task 12);
  - `src/components/pre-match/shared.mjs` — только удаление экспортов, у которых после Task 11 нет импортёров; `money`, `safe`, `playerCard` остаются (их берут итоги 2.x и `game-panel.mjs`);
  - `server/routes/{teams,team-fallen,team-ledger,team-rolls}.mjs`, `server/season/live-match.mjs`, `server/http/errors.mjs`, `scripts/seed-pre-match-preview.mjs` — Task 1;
  - `scripts/mock-api.mjs` — **одна строка** `answerApi` (:556, список ответчиков), без новых строк (файл 599/600); `scripts/smoke-pre-match.mjs` — один шаг (Task 13);
  - словари — ключи только в `matches.*`, `prep.*`, `ui.board.*`, `error.TEAM_IN_MATCH`, `teamOverview.oppValue`; значения `pre.step.inducements` (RU) и `pre.step.review` меняются (Task 9); ключ `pre.step.kickoff` и ключи `pre.*`, `games.*`, у которых после Task 11 и Task 12 нет читателя, удаляются.
- **Файлы на пределе** (числа — `wc -l` на `2fccec3`; Task 0 сверяет): `scripts/mock-api.mjs` 599 (без новых строк), `src/screens/team/roster/save.mjs` 559, `panel.mjs` 490, `src/screens/team/overview.mjs` 422 (Task 6 — не больше 520; не помещается — модель табло в `screens/matches/band.mjs`), `src/ui/match-board.css` 419 (Task 5 — не больше 590; иначе правила листания — в `src/screens/matches/band.css`), `src/ui/match-board.mjs` 134, `src/shell/current-match.mjs` 197, `src/core/router.mjs` 159, `server/routes/teams.mjs` 253, `team-fallen.mjs` 164, `team-ledger.mjs` 125, `team-rolls.mjs` 84, `server/season/live-match.mjs` 109, `server/http/errors.mjs` 178, `src/styles/tokens.css` 360. Новые модули — `src/screens/matches/{index,model,card,lists,band,before,prep,prep-model,prep-frame,prep-steps,prep-inducements,prep-effects}.mjs`, `src/domain/match/preview.mjs`, `src/data/match-day.mjs`, `scripts/mock/matches.mjs`; CSS — `src/screens/matches/{before,matches,prep,prep-inducements}.css`; каждый ≤ 600, функция ≤ 80.
- **Размеры (D2) и близость к прототипам.** До 900px нажимаемое — от 44px; от 901px — как в прототипе, но не меньше 24px. Каждое состояние названо своими прототипами, значения — из их HTML. Цвет — только токенами: `--surface` ← `#FFFFFF`, `--surface-2` ← `#F3F6F4`, `--surface-3` ← `#EEF2F0`, `--line` ← `#E6EBE8`/`#DCE3DF`, `--line-strong` ← `#C9D3CE`, `--muted` ← `#5F6B65` и `#8A948F` (3,1:1 — мало, как решили 07a/07b), `--ink-2` ← `#3E4A44`, `--ink` ← `#14201A`, `--accent` ← `#2F7A52`, `--accent-text`, `--accent-tint` ← `#E4F0E9`, `--accent-tint-soft` ← `#F1F8F4`, `--on-accent-tint` ← `#163A28`, `--warn` ← `#B07A1E`/`#C99A2E` (точка), `--warn-tint` ← `#FBF1DD`/`#FFF4DE`, `--on-warn-tint` ← `#6B4A0E`/`#7A5410`, `--danger` ← `#A0473A`, `--danger-tint` ← `#FBEDEA`, `--on-danger-tint` ← `#7A2E22`, `--disabled` ← `#A9B3AE`, `--header` ← `#17392C`, `--header-ink` ← `#FFFFFF`, `--header-muted` ← `#CFE0D7`, `--header-tab` ← `#A9C4B6`, `--live` ← `#7FD3A2`, `--on-header-loss` ← `#F2A99C` (новый, Task 5), `--hero-gets` ← `#1E5C3D`, `--hero-pays` ← `#6B2B22`, `--hero-even` ← `#3A4440`, `--result-friendly` ← `#8A5A12`, `--neutral-result` ← `#6F7A75`, `--crest-gold` ← `#F2C14E`; полупрозрачный белый на шапке (`rgba(255,255,255,0.12…0.25)`) — `color-mix(in srgb, var(--header-ink) N%, transparent)`, как `match-board.css:269`. Где токен не держит 4.5:1 (текст) или 3:1 (крупный текст, кольцо) в какой-то палитре — ближайший, что держит; тест контраста тот же. Расхождение, которое код не позволяет закрыть, — в §7 спеки (Task 17).
- **Слова (ответ владельца после 07c):** строки, которые называют игрока, — нейтральные в обоих словарях: без «он/его», без причастий и прошедшего времени в роде («Пропуски: J. Corr · серьёзная травма», «вернётся к туру 8», «Результат подтверждает Silverbrook Rangers»). Числа — без форм множественного числа («пропускают матч: 2», «команд: 10»), как решение 25 этапа 05.
- **Переносы (ответ владельца):** длинное название команды, соперник в строке результата, подзаголовок подготовки, подписи шагов переносятся; `text-overflow: ellipsis` в новых правилах 09a нет нигде (тесты задач экрана проверяют).
- Vanilla ES-модули, хешевый роутер; без фреймворка, сборщика, TypeScript и новых зависимостей.
- CSP: ни inline JS, ни `style="…"`, ни `on…=`. Ширина полосы бюджета — классом-ступенью или `<progress>`, не `style`.
- Каждая строка интерфейса — через `t("key")`; новые ключи — в обоих словарях, в пространствах выше, без дублей. Ключи из шаблонных строк получают тест, перебирающий все значения, в задаче, которая их заводит: `matches.status.${phase}` по `MATCH_PHASES` (Task 7), `matches.before.to.${gets}`, `matches.before.note.${gets}`, `matches.before.tileWho.${gets}` по `BEFORE_GETS` (Task 4), `pre.step.${step}` по `MATCH_STEPS` (Task 9), `prep.wait.${step}` и `prep.opponent.${state}` (Task 9), `prep.turn.${turn}` (Task 10).
- `escapeHtml` на каждую интерполяцию; пропс `…Html` — только разметка другой функции `render…()`/`…Markup()`.
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 на функцию, 0 недостижимых функций, `src/app.js` ≤ 120 (этап его не трогает). Бюджеты только уменьшаются.
- Ловушка `scripts/check-references.mjs`: ключ объекта, равный экспорту проекта плюс одна буква, в файле, который этот экспорт не импортирует, ломает `npm run check` (`to:`, `td:`, `th:`, `tr:`, **`tv:`** от `t`; `states:`, `views:`, `icons:`). Ключи 09a (`own`, `other`, `gets`, `ctv`, `worth`, `missing`, `available`, `total`, `budget`, `petty`, `bonus`, `treasury`, `first`, `items`, `index`, `chips`, `bubbles`, `outcome`, `records`, `count`, `touchdowns`, `casualties`, `phase`, `card`, `results`, `upcoming`, `calendar`, `steps`, `summary`, `opponent`, `footer`, `aside`, `turn`, `rows`, `effects`) проверены: экспортов «без последней буквы» нет. TV в объектах — `worth`, никогда `tv`.
- Брейкпоинты только `max-width: 900px` / `min-width: 901px`. Кольцо фокуса — из `src/ui/base.css`; `--focus-ring` не использовать. Новый CSS задаёт шрифт, рамку, фон, `text-transform`, `letter-spacing` и `font-weight` явно (правила 2.x живут до этапа 13). Новый `.css` — `@import` в конце `src/styles.css`, в порядке задач (`before.css`, `matches.css`, `prep.css`, `prep-inducements.css`).
- Радиогруппы (мастер-план 05–13): кубики D3 и D6, время года, категории индьюсментов — `role="radiogroup"` с `aria-label`, пункты `role="radio"`, `aria-checked`, roving tabindex и проводка `wireRadioGroups` (`src/ui/choice.mjs:45`) или `renderSegmentedControl`/`wireSegmentedControls`; в `onChange` группа не перерисовывается через `innerHTML` — экран патчит (`patch`/`patchWithModal`), фокус остаётся на пункте.
- **Перенесённый экран удаляет свой модуль и CSS 2.x в том же PR:** `screens/games/pre-match.mjs`, `components/pre-match/{steps,catalog,effects}.mjs` и их правила `styles/pre-match.css` — Task 11; `screens/games/my-games.mjs` остаётся — его рисует `teamChallenges` до 09c (решение 3); `checklist-layout.mjs`, `matchday.mjs`, `components/pre-match/shared.mjs`, `game-panel.mjs` и общие правила `pre-match.css`/`matchday.css` остаются — их берут итоги 2.x (09b) и страница игры 2.x.
- `content/` не меняется. Правила и числа — из `src/domain/**` и `content/Gata/**`, вид — из прототипов; расхождение макета с кодом правится по коду без вопроса (§0.1, §0.12); контент против кода — вопрос владельцу.
- Тесты: сначала `npm run build` (тесты читают `public/data.*.json`); затем `. output/09a/env.sh && npm test`, `npm run check`, `npm run i18n:check`. Каждый PR: одинаковое число страниц EN/RU, 0 fallback; все четыре smoke (`smoke`, `smoke:pre-match`, `smoke:friendly`, `smoke:post-match`) на сервере 3076.
- Комментарии в коде — по-английски, в тоне соседних файлов; ответы владельцу — по-русски.
- Каждая задача — один коммит с тестами; сообщение коммита заканчивается вторым `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Стоп-условия:** контент и код расходятся в правиле; нужно продуктовое решение вне спек и этого плана; нужна правка сервера сверх Task 1 или миграция; файл не помещается в бюджет; тест 05–08 или 07e (оболочка, обзор, «Состав», «Команда») падает не там, где задача его называет. Остановиться и спросить контроллера.

## Review Focus

1. **Запись во время матча с экрана, который об этом не знает.** Тренер прибавил TD в «Составе», а соперник в ту же секунду нажал «Начать матч»; или вкладка с «Командой» 08 открыта со вчера. Ожидание: сервер отказывает 422 `TEAM_IN_MATCH`, ничего не пишется (ни ревизии, ни строки журнала, ни броска, ни погибшего); «Состав» снимает шаг, говорит слова сервера и перечитывает игры (режим матча); устаревшая ревизия по-прежнему слышит 409 со своим составом, и потерянный ответ узнаётся. Тесты: Task 1 — «while its match is on, a coach's save, a death, an undo, a treasury entry and a site roll are refused with TEAM_IN_MATCH, and nothing is written», «the revision is asked first: a stale save still hears TEAM_SAVED_ELSEWHERE with the team», «the check is made under the team's lock: a save that waited for the start is refused», «a step the server refuses because the match has begun is given up in the server's words, and the games are read again»; Task 13 — smoke, пункт «after the start the roster, the treasury, a death and a roll are refused».
2. **Двое жмут в подготовке одновременно; ответ потерян; «Начать матч» дважды.** Ожидание: 409 `MATCH_REVISION` — подготовка читается заново, слова сервера, нажатие не повторяется само; потерянный ответ — чтение заново, а не повтор; второй старт (оба тренера, двойное нажатие) — один старт, оба на странице «Матчи» в режиме игры; одна запись в пути на экран. Тесты: Task 11 — «a press while a write is on its way sends nothing», «a 409 reads the preparation again and says why; nothing is sent twice», «a lost answer reads the preparation again», «the start pressed twice is one request; a start answered in_progress leads to the matches», «a match begun elsewhere makes the preparation read-only».
3. **Числа «Перед матчем» против шага «Индьюсменты».** Ожидание: шторка и шаг говорят одно — тот же `createPreparation` и `matchBudget`: пропускающие не в CTV, Low Cost Linemen, надбавка за тир при равных CTV (тогда «индьюсментов нет» не говорится), казна покупающего первым — вся, второго — до 50k, при равных — нельзя. Тесты: Task 2 — «the preview is the preparation's own budget: petty cash, tier bonus, treasury rule — the same numbers matchBudget gives the step», «equal CTVs give no petty cash and no treasury, and a tier bonus still counts», «a player who sits the match out is not in the CTV and is listed with why»; Task 4 — «with equal CTVs and a tier bonus the sheet does not say there are no inducements».
4. **Соперник не читается, его нет (bye, «соперник — после тура N»), раса неизвестна.** Ожидание: плитки, пузыри и строка пропусков не рисуют полу-чисел: плитка «Индьюсменты» закрыта с причиной, пузырей нет, шторка не открывается; остальная страница цела; повторное чтение — при следующем входе и при смене игр. Тесты: Task 3 — «a bye, or a game that is not the team's, is read as nothing; a failed read is said and not kept»; Task 2 — «a race the reference does not know, or a treasury the rules cannot read: no preview»; Task 7 — «no opponent yet: «Opponent — after round 3», no tiles»; «the opponent could not be read: the inducement tile is closed and says why, the rest is drawn».
5. **Листание табло клавиатурой и смена игр под ним.** Ожидание: квадраты — вкладки одной группы (стрелки, Home/End, roving tabindex), стрелки «‹ ›» выключены на краях, «К текущему матчу →» возвращает текущий и фокус на его квадрат; игры перечитались (старт, счёт) — показан тот же матч, если он ещё есть, иначе текущий; на телефоне квадраты не вкладки (30px меньше 44px). Тесты: Task 5 — «the squares are tabs of one group: arrows, Home and End move the selection and the focus», «the arrows are off at the ends», ««To the current match» brings the current back with the focus on its square»; Task 6 — «games read again keep the match shown when it is still there, the current otherwise».

## Решения этого плана

Источники оставили их открытыми; план принимает их так (контроллер подтверждает до исполнения).

**Как идёт каждая запись**

| Действие | Запрос | Когда закрыто | Потерянный ответ / отказ |
|---|---|---|---|
| Кубик D3 фанатов (`PreFans`) | `PATCH /api/games/:id/preparation {revision, side, action: {type: "fans", value}}` сразу по нажатию | матч начат (`in_progress`), тур закрыт (`fixture.closed`), запись в пути, сторона не тренера | чтение подготовки заново, нажатие не повторяется; 409 `MATCH_REVISION` — чтение и слова сервера |
| Время года и кубики D6 (`PreWeather`) | тот же `PATCH` `{type: "weather", season, home, away}` — по каждому нажатию, со всем, что выбрано (пустой кубик — `null`, домен принимает) | как фанаты; шаг < 1 — шаг не открыт | как фанаты |
| «+ Journeyman · <позиция>», «Убрать», «Подтвердить состав», «Изменить состав» (`PreRoster`) | `add-journeyman {rowIndex}`, `remove-journeyman {id}`, `lock-roster`, `reopen` | как фанаты; состав подтверждён — всё, кроме «Изменить» | как фанаты; `MATCH_ROSTER_CHANGED` — чтение и слова |
| ± индьюсмента, «Взять»/«Убрать» звезду, эффекты, «Подтвердить покупки», «Без покупок», «Изменить покупки» (`PreInducements`) | `basket {id, quantity}`, `effects {effects}`, `lock-basket`, `reopen` | как фанаты; не очередь стороны (`!budget.canChoose`), корзина подтверждена; «+» — с причиной (`purchaseReason`) | как фанаты |
| «Подтвердить подготовку», «Начать матч» (`PreReview`) | `confirm`; `POST /api/games/:id/start {revision, side?}` | как фанаты; «Начать» — пока статус не `ready` | старт идемпотентен на сервере: ответ `in_progress` или повторный старт — переход на «Матчи»; потерян — чтение заново |
| Запись команды во время её матча (PATCH тренера, гибель, отмена гибели тренером, казна, бросок) | как были | — | сервер: 422 `TEAM_IN_MATCH`, ничего не пишется (Task 1) |
| Форма быстрого счёта у тренера | — | удалена (Task 12); `proposeGameResult` на сервере — для админа и счетов до 3.0 | — |

**Страница «Матчи»**

1. **Одна форма на ширину**, как обзор (решение 47 07d): модель знает `phone` (`isPhone`, `onPhoneChange` из `screens/team/roster/screen.mjs`), экран перерисовывается при переходе через 900px (`drawKeepingFocus(view, draw, "h1")`). Телефон — `Matches.html`: заголовок раздела над картой текущего матча, карта, «Товарищеские матчи», «Результаты», «Дальше в сезоне». Десктоп — `DeskSeason.html` без таблицы: полоса заголовка «Сезон» (`h1`, как пункт SideNav), табло во всю ширину, «Календарь» (вопрос владельцу 1).
2. **Какой матч на карте** — `currentMatch(games, teamId)` (`shell/current-match.mjs:90`), как карточка SideNav и табло обзора: идущий, иначе ближайший тура, иначе отправленный счёт. Фазы карты (`MATCH_PHASES`): `idle` (не начат), `preparing` (подготовка `preparing`/`ready`), `live` (`isMatchLive`, итогов ещё нет), `post` (идёт, `postMatchStatus` не `not_started`), `sent` (ждёт подтверждения) — плашка словами `matches.status.<phase>` («Не начат», «Подготовка», «Идёт игра», «Итоги», «Ждёт подтверждения»; жизненный цикл §16).
3. **«Товарищеские матчи»** ведут на `teamUrl(id, "challenges")` — «Мои игры» 2.x до этапа 09c; `screens/games/my-games.mjs` остаётся только за этим маршрутом (§6 спеки 3.0 называет его «что уходит» — уходит с 09c).
4. **Плитки карты** (`showTiles` прототипа): «CTV» нашей и соперника (не TV: индьюсменты считаются по CTV — закрывает известное расхождение 2) и «Индьюсменты · получаем мы / у соперника / CTV равны» с суммой (`+90k` / `−90k` / `0`), которая открывает «Перед матчем». Под ними — строка пропусков («Пропуски: J. Corr · серьёзная травма» или «Состав: все в строю»), которая тоже открывает шторку. У товарищеского — плитки тоже (подготовка у него та же, с индьюсментами; прототип их прячет — расхождение) и строка «Не влияет на таблицу лиги…». В фазе `sent` плиток нет (как прототип).
5. **Игра** (`MatchesLive`): блок-ссылка «Записи матча · N» (N — строки записей этого матча у команды, как «записей: K» плашки «Состава» 07a), под ней «TD 2 · CAS 3 · тапы в «Составе»» (суммы записей), ведёт в «Состав» (`teamUrl(id, "roster")`, режим матча 07a); подпись «После игры оба тренера проходят итоги…»; тёмная кнопка «Итоги матча» → `postMatchUrl(game)` (итоги 2.x до 09b). Записи читает `readTeamRecords` (Task 3); пока не прочитаны — «Записи матча» без числа; ошибка — строка `matches.recordsUnread`.
6. **Отправленный счёт** (`sent`): строка «Победа 1:1 · CAS 2–1» (`sentScore`, один чтец с SideNav — передача 06), под ней «Результат подтверждает <соперник>» или, если счёт прислал соперник, кнопка «Подтвердить счёт» (`matchActions` → `gameUrl(game)`). «К следующему матчу» прототипа — демо-переключатель, в коде ему нечего делать; не рисуется (расхождение).
7. **«Результаты»** — все завершённые матчи команды (лига этого сезона и товарищеские), новые сверху (`recentResults(games, teamId, Infinity)`), справа в заголовке — «4 · 1 · 1» (`seasonRecord`); строка — плашка результата 30px, соперник (ссылка на его обзор `playerTeamUrl`), «Тур 6 · <раса ссылкой> · CAS 3–1», «MVP: Gruk» (только когда есть), счёт Oswald 26; строка не ссылка, матч открывает слово тура (как «Результаты» обзора десктопа 07d). «Дальше в сезоне» — открытые матчи команды, которых нет на карте (другая фаза или товарищеский рядом с лиговым), строками со ссылкой на их подготовку или итоги (вопрос владельцу 3), затем одна строка следующего тура «Тур N+1 · Соперник — после тура N · Швейцарка: пара по очкам после всех результатов тура» — длины сезона код не знает, вторую строку прототипа не выдумываем.
8. **Вне таблицы сезона** — вместо карты призыв заявиться (`teamOverview.notInSeason`, как обзор), «Товарищеские матчи» и «Результаты» товарищеских. Пока игры или таблица не прочитаны — как обзор: без того, что они могли бы опровергнуть; отказ — плашка `danger` со словами.
9. **Чтения:** игры — на входе всегда заново (`loadGames(true)`: фаза матча не судится по старому списку, как страница «Команда» 08) и при возвращении вкладки (`visibilitychange`); таблица — `loadSeason()`; соперник текущего матча и записи живого матча — по Task 3, один раз за визит и заново, когда игры сменились (`onGamesChange`). Никакого опроса по таймеру (2.x опрашивал каждые 6 с: соперник виден при следующем входе).

**«Перед матчем»**

10. **Числа — подготовки, а не макета** (Task 2): `matchPreview({own, other}, data)` строит подготовку из сохранённых составов (`createPreparation`) и берёт её бюджет (`matchBudget` для нашей стороны): CTV обеих, кто получает petty cash (`gets`: `"own"`, `"other"` или `null`), petty cash, надбавку за тир, правило казны (`all` — покупает первым, вся казна; `top` — второй, до 50k; `none` — CTV равны). Подготовку сервера не читаем (её чтение создаёт подготовку — `preparation-store.mjs:32-48`); во время подготовки и матча шторка — по сохранённым составам (CTV и пропуски до старта не меняются; журнеймены подготовки в неё не входят — расхождение записать).
11. **Шторка** (`MatchesPre*`, `DeskSeasonPre*`) — `renderSheet` (`wide`: 640px на десктопе, снизу на телефоне): заголовок «Перед матчем · Тур 7» («· Товарищеский»), тёмный блок CTV против CTV с суммой и «индьюсменты нам / сопернику / CTV равны — индьюсментов нет» на фоне `--hero-gets`/`--hero-pays`/`--hero-even` (градиент прототипа 90° со сменой на 38–62%), «В строю 11 из 12» обеих; «Пропускают матч» двумя колонками (наши слева, соперника справа): «#9 J. Corr», позиция, причина словами травмы 07b (`absenceWords`) `--danger`, «вернётся к туру 8» / «вернётся к следующему матчу» (товарищеский) / «до конца сезона» (временный уход); «Пропусков нет» `--muted`; блок «Бюджет на индьюсменты» — строки по `matchPreview`, подпись по `gets`; ссылка «Что можно купить на индьюсменты» → `refUrl("inducements")`. Хост — свой на `<body>` (`mountSheetHost`), шторка переживает перерисовки экрана и закрывается с уходом.
12. **Равные CTV с надбавкой за тир:** «CTV равны» без «индьюсментов нет», строка «Надбавка за тир: 200k», подпись `noteEvenBonus` (прототип при равных говорит «индьюсментов нет» — код даёт надбавку; расхождение).

**Табло**

13. **Листание по турам — только на десктопе** (`DeskSeason`, `DeskOverview`): квадраты — вкладки `role="tablist"`/`role="tab"` 30px (D2 от 901px — ≥ 24), стрелки «‹ ›» 32px; пункты — сыгранные матчи команды в порядке подтверждения (лига и товарищеские; товарищеский — «Т» на `--result-friendly`), затем текущий (или «соперник — после тура N»). У прошлого — счёт цветом исхода (`--live` победа, `--on-header-loss` поражение), под ним «Победа · +3 в таблице» (очки — `homePoints`/`awayPoints` сервера, у товарищеского — «Не влияет на таблицу»), чипы «CAS 3–1», «MVP Gruk», справа «К текущему матчу →». На телефоне — как сейчас: квадраты не ссылки (30px < 44px), листания нет (решение 12 этапа 05; «табло на телефоне остаётся»).
14. **TV соперника** — в строке под его именем на обеих ширинах: «Dwarf · 5-е · TV 1 210k» (`teamValue` по его составу); пока соперник не прочитан — без TV; у прошлых матчей TV нет.
15. **Пузыри** (десктоп, текущий матч не `sent`): у стороны, которая получает petty cash, — «+90k на индьюсменты»; посередине — «пропускают матч: 2» или «Все игроки в строю»; каждый — кнопка 28px (≥ 24), открывает «Перед матчем». У товарищеского — тоже (решение 4) и чип «Не влияет на таблицу лиги».
16. **Действия полосы** (`DeskSeason`, `DeskSeasonLive`): до матча — «Подготовка к матчу» (белая) и «Товарищеские матчи» (обводка); в игре — «Записи матча · N» (обводка) и «Итоги матча» (белая); отправлен — слова. Слова и адреса — `matchActions`; виды и число записей — `bandActions` (Task 5). Карточка SideNav не меняется (этап 05; в `DeskSeason` её «Записей матча» нет — не трогаем).

**Подготовка**

17. **Своя рамка на обеих ширинах** (`PreFans`…, `DeskPreInducements`): `preMatch` — в `BARE_ROUTES` оболочки: ни шапки и вкладок, ни SideNav. Телефон: тёмная шапка с «‹» (44×44, D2; в прототипе 40) → «Матчи» команды тренера (`teamUrl(teamId, "matches")`; админу — `gameUrl`), «Перед матчем» Oswald 21, подзаголовок «Тур 7 · A — B» (переносится), ряд точек шагов; тело; подвал со строкой о сопернике и одной основной кнопкой. Десктоп: тёмная полоса «‹ Перед матчем · тур 7» и «A — B»; слева список шагов 260px (галочка, название, сводка шага), в середине карточка шага, справа колонка (бюджет и соперник на индьюсментах, погода и старт на «Старте», соперник на остальных — для фанатов, погоды и состава прототипа десктопа нет, собраны из частей).
18. **Шаги — `MATCH_STEPS`** (фанаты → погода → состав → индьюсменты → старт), слова — `pre.step.*` с новыми значениями: «Индьюсменты» (RU, было «Индусменты»), «Старт» / "Start" (было «Итоги» / "Review"). Ключ `pre.step.kickoff` («Удар / приём» — шага нет с правил версии 2) удаляется: плашки «Состава» и «Команды» называют третий сбрасываемый шаг `pre.step.review` — «сбросят шаги «Состав», «Индьюсменты» и «Старт»» (так `resetChangedRosters` и делает: фанаты и погода сохраняются). Пройденные шаги и текущий — ссылки (телефон: столбец точки и подписи от 44px; десктоп: строка 56px), будущие — нет.
19. **Кубики — сразу записью** (фанаты, погода): нажатие на грань — один `PATCH`; повторного «Сохранить» нет. **Погода — одна на матч** (код: `{season, home, away}` пишет любой тренер): два ряда D6 — наш и соперника, оба нажимаемы; «Время года выбирает лига» прототипа — неправда (известное расхождение 1: время года выбирают на шаге), подпись говорит «Время года выбирают тренеры на этот матч».
20. **Индьюсменты:** карточка бюджета (чип очереди «Ваша очередь · соперник уже выбрал на 0k» / «Покупаете первыми» / «Ждём покупок соперника: CTV у него выше», «Petty cash 90k + из казны до 50k», потрачено Oswald 24, полоса, подсказка), «Помощь | Звёзды» (`renderSegmentedControl`), строки — `renderResourceCounter` с ценой, лимитом и первой строкой правила (как 2.x), «+» с причиной (`purchaseReason` 2.x переносится в модель); звёзды — строки с «Взять»/«Убрать»; показываются только доступные команде (`catalogAccess`), как 2.x по умолчанию — переключателя «показать недоступные» нет; поиска нет (в прототипе нет; 2.x искал) — расхождения записать. Эффекты (молитвы Nuffle, Mark of Chaos, Rowdy Rookies) — формой 3.0 под списком, как 2.x (`effectsFromForm`), только когда куплены; в прототипе их нет.
21. **Старт:** погода, две карточки сторон («Подтвердил» / «Ждём»; Fan Factor, «В строю · без Journeymen / · Journeymen: 2», CTV, индьюсменты «Nuffle's Prayers · 15k», «Из казны: 0k · казна 70k»), подпись о старте; «Подтвердить подготовку» → затем «Начать матч» (закрыта, пока соперник не подтвердил: «Кнопка станет активной, когда соперник подтвердит»). После старта — `location.hash = teamUrl(teamId, "matches")` (карта «Идёт игра»). Матч начат или тур закрыт — подготовка только для чтения, плашка и ссылки «Записи матча» / «Итоги матча».
22. **Админ** — переключатель стороны (`renderSegmentedControl`, две команды) над телом; пишет с `side`. В прототипах админа нет.
23. **Опрос** — как 2.x: каждые 6 с `GET …/preparation`, пока вкладка видна, ничего не в пути и ни одна шторка не открыта; новая ревизия — перерисовка патчем. После каждой удачной записи — `invalidateGames()` (передача 05).

**Остальное**

24. **Страница игры `#/games/:id`** остаётся экраном 2.x (прототипа нет): без формы быстрого счёта у тренера (§9.6); подтверждение счёта соперника, ручной результат админа, панели подготовки и итогов 2.x — как были.
25. **Передачи 07a, отложенные с причиной:** «`readWithGames` перечитывать, если матч сменился во время чтения» и «тап, на который ответ пришёл после ухода, не перечитывает записи» — код «Состава» (файлы 07e), а отказ сервера Task 1 закрывает то, от чего первое защищало (запись во время матча больше не ложится); второе — записи читаются при следующем входе. Этапу 13.
26. **Лимит 8 re-roll при `PATCH`** (передача 08 «09a / 12») — правило состава, не матча: новое блокирующее нарушение отказало бы составам 2.x, сначала нужна проверка дампа (как «больше 14» на M2). Этапу 12.

## Вопросы владельцу

1. **Страница «Матчи» десктопа до таблицы этапа 10.** `DeskSeason` — табло, таблица и «Календарь»; таблица — этап 10 («Таблица лиги, календарь»), а пункт SideNav «Сезон» ведёт на `#/season` (2.x до этапа 10). *По умолчанию:* `#/t/:id/matches` на десктопе — «Сезон» без таблицы: табло во всю ширину и под ним «Календарь» во всю строку; SideNav «Сезон» — как был; этап 10 ставит таблицу слева от календаря и решает, один ли это экран с `#/season`.
2. **Админ во время матча.** `TEAM_IN_MATCH` не трогает админский `PATCH /api/admin/teams/:id` и отмену гибели админом. *По умолчанию:* админу не отказываем — это путь ремонта; итоги после его правки просят сбросить черновик (`POST_TEAM_CHANGED`), экран админа — этап 12. Альтернатива — та же проверка в `writeSavedTeam` без условия `actor.admin` (одна строка).
3. **Другие открытые матчи команды.** Карта показывает один (`currentMatch`); товарищеский, принятый рядом с лиговым, на ней не виден. *По умолчанию:* такие матчи — первыми строками «Дальше в сезоне»: «Товарищеский · <соперник>» и фаза словами, ссылкой на подготовку (или итоги, если идёт). В прототипе этого нет.

## Файлы

| Файл | Задача | Что |
|---|---|---|
| — (перенос на влитый 07e, сверка якорей, базовый прогон) | 0 | база (контроллер) |
| `server/season/live-match.mjs`, `server/routes/{teams,team-fallen,team-ledger,team-rolls}.mjs`, `server/http/errors.mjs`, `scripts/seed-pre-match-preview.mjs`, оба словаря, `test/team-in-match-api.test.mjs` (новый), `test/preview-seed.test.mjs`, `test/team-roster-in-match.test.mjs` (новый); при падении — `src/screens/team/roster/save.mjs` (2 строки) | 1 ⚠ | отказ `TEAM_IN_MATCH`; тестовый сезон — подготовка |
| `src/domain/match/preview.mjs` (новый), `test/match-preview.test.mjs` (новый) | 2 | числа «Перед матчем», записи матча |
| `src/data/match-day.mjs` (новый), `test/match-day-data.test.mjs` (новый) | 3 | чтение команды соперника и записей |
| `src/screens/matches/{before.mjs,before.css}` (новые), `src/styles.css`, оба словаря, `test/matches-before.test.mjs` (новый) | 4 | шторка «Перед матчем», плитки, пузыри, строка пропусков |
| `src/ui/match-board.mjs`, `match-board.css`, `src/styles/tokens.css`, `src/screens/matches/band.mjs` (новый), оба словаря, `test/ui-match.test.mjs`, `test/matches-band.test.mjs` (новый) | 5 | листание, чипы, пузыри, итог прошлого матча |
| `src/screens/team/overview.mjs`, `overview.css`, `src/shell/current-match.mjs`, оба словаря, `test/team-overview.test.mjs`, `test/current-match.test.mjs` | 6 | табло обзора: листание, TV соперника, пузыри; один чтец счёта |
| `src/screens/matches/{index,model,card,lists}.mjs`, `matches.css` (новые), `src/ui/match-card.mjs`, `src/core/router.mjs`, `src/styles.css`, оба словаря, `test/team-matches.test.mjs` (новый), `test/ui-match.test.mjs` | 7 | «Матчи» телефона |
| `src/screens/matches/{index,lists}.mjs`, `matches.css`, оба словаря, `test/team-matches.test.mjs` | 8 | «Матчи» десктопа |
| `src/screens/matches/{prep-model,prep-frame,prep-steps}.mjs`, `prep.css` (новые), `src/styles.css`, `src/screens/team/roster/panel.mjs:107`, `src/screens/team/manage/index.mjs:101`, оба словаря, `test/match-prep.test.mjs` (новый), тесты 07a–08 с прежними словами шагов | 9 | рамка подготовки, фанаты, погода, состав, старт; слова шагов |
| `src/screens/matches/{prep-inducements,prep-effects}.mjs`, `prep-inducements.css` (новые), `prep-model.mjs`, `src/styles.css`, оба словаря, `test/match-prep-inducements.test.mjs` (новый) | 10 | индьюсменты и эффекты |
| `src/screens/matches/prep.mjs` (новый), `src/core/router.mjs`, `src/shell/navigation.mjs`, `src/screens/games/pre-match.mjs` (удалить), `src/components/pre-match/{steps,catalog,effects}.mjs` (удалить), `shared.mjs`, `src/styles/pre-match.css`, оба словаря, `test/match-prep-screen.test.mjs` (новый), `test/shell-navigation.test.mjs`, `test/legacy-screens.test.mjs` | 11 ⚠ | экран подготовки: чтение, записи, опрос, рамка `bare`; 2.x удалён |
| `src/screens/games/game.mjs`, `src/components/games/result-fields.mjs`, оба словаря, `test/game-page.test.mjs` (новый) | 12 ⚠ | без формы быстрого счёта у тренера |
| `scripts/mock/matches.mjs` (новый), `scripts/mock-api.mjs` (одна строка), `scripts/smoke-pre-match.mjs` | 13 | mock и smoke |
| `docs/redesign/screens/rd-09a.json` | 14 | снимки рядом с прототипами (контроллер) |
| спеки, план 3.0, мастер-план | 15–18 | исправления, проверки, правки спек, PR (контроллер) |

Каталог экранов — `src/screens/matches/` (ниже без префикса, где ясно).

## Маршруты этапа 09a

| Имя | Адрес | До 09a | После 09a |
|---|---|---|---|
| `teamMatches` | `#/t/:teamId/matches` | «Мои игры» 2.x (`renderMyGames`) | «Матчи» 3.0 (`renderTeamMatches`): телефон — `Matches.html`, десктоп — «Сезон» без таблицы (`DeskSeason.html`) |
| `teamChallenges` | `#/t/:teamId/challenges` | «Мои игры» 2.x | без изменений до 09c |
| `preMatch` | `#/games/:id/pre-match[/:step]` | подготовка 2.x в рамке оболочки | подготовка 3.0, рамка `bare` (`PreFans`…`PreReview`, `DeskPreInducements`, `DeskPreReview`); `/kickoff` по-прежнему ведёт на `/review` |
| `game` | `#/games/:id` | страница игры 2.x с формой быстрого счёта | страница игры 2.x без неё (Task 12) |
| `postMatch` | `#/games/:id/post-match[/:step]` | итоги 2.x | без изменений до 09b |
| `team` | `#/t/:teamId` | обзор 07d | + табло десктопа: листание, TV соперника, пузыри, «Перед матчем»; телефон — TV соперника |
| `season` | `#/season` | 2.x | без изменений до 10 |

`src/core/routes.mjs` не меняется.

## Рецепты проверки

Команды — из `/Users/felstell/git/bb-rd-09a`; каждый вызов Bash — новая оболочка, переменные — из `output/09a/env.sh` (только `source`).

**Т — тесты:** `npm run build && node --test <файлы>`; с базой — `npm run build && . output/09a/env.sh && node --test <файлы>`; полный прогон — `npm run build && . output/09a/env.sh && npm test && npm run check && npm run i18n:check`.

**С — сервер 3076 и smoke** (Task 13, 14, 16):

```bash
. output/09a/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_09a 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3076 node server/server.mjs`; дождаться `curl -fsS http://localhost:3076/api/health` (Monitor с until-циклом). Затем:

```bash
APP_URL=http://localhost:3076 npm run smoke
. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3076 npm run smoke:pre-match
. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3076 npm run smoke:friendly
. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3076 npm run smoke:post-match
```

Expected: каждый скрипт печатает свою строку `… passed …`. Сервер после — остановить.

**М — mock 5180** (Task 13, 14): `npm run build`, затем в фоне `MOCK_PORT=5180 node scripts/mock-api.mjs`; дождаться `curl -fsS http://localhost:5180/api/health`. Mock держит записи в памяти: после состояний, которые пишут, — перезапуск.

**П — прототипы 5196 и сравнение 5199** (Task 14): в фоне `python3 -m http.server 5196 --bind 127.0.0.1 --directory docs/redesign/handoff-0.9.1/prototypes` и `python3 -m http.server 5199 --bind 127.0.0.1 --directory output/screens/rd-09a`.

---

### Task 0: База — влитый 07e и сверка якорей (контроллер)

Этап 09a исполняется после вехи M2, когда влит 07e. Пока Task 0 не закрыт, ни одна задача ниже не исполняется. Коммита нет, кроме случая шага 4.

- [ ] **Step 1: Готовность.** `gh pr list --base redesign --head rd/07e-career --state merged --json number,mergeCommit` → одна запись; в мастер-плане строки `07a–07e` и **M2** отмечены (или координатор подтвердил «ок» владельца на M2). Нет — ждать.
- [ ] **Step 2: Перенос.** `git fetch origin && git rebase origin/redesign`; `git log --oneline origin/redesign..HEAD` → только коммит этого плана.
- [ ] **Step 3: Что пришло.** `git diff --stat 2fccec3 origin/redesign`. Если в списке `package-lock.json` — `npm ci`.
- [ ] **Step 4: Якоря плана.** Для каждой строки — `grep -n` имени в файле; число строки, имя или сигнатура разошлись — поправить план отдельным коммитом `docs(plan): stage 09a — anchors after 07e` (с трейлером). Иначе ничего.

| Файл | Якорь на `2fccec3` | Кто мог сдвинуть |
|---|---|---|
| `src/screens/team/overview.mjs` (422) | `proposedScore` :96, `opponentOf` :109, `boardOf` :137, `overviewModel` :215, `statusChip` :247, `boardMarkup` :255, `markupOf` :363, `renderTeamOverview` :388 | 07e Task 6 (`readRecords`, визит `records`) |
| `src/data/team-record.mjs` (249) | `gameSides` :29, `seasonRecord` :69, `standingOf` :107, `seasonPager` :122, `recentResults` :157, `teamValue` :202, `teamLeaders` :225 | 07e Task 6 |
| `src/screens/team/roster/panel.mjs` (490) | `injuryWords` :73, `absenceWords` :96, слова подготовки :107 | 07e Task 4 |
| `src/screens/team/roster/save.mjs` (559) | `patchTeam` :101 | — |
| `src/screens/team/roster/screen.mjs` | `isPhone` :32, `onPhoneChange` :41 | 07e Task 3 |
| `src/screens/team/manage/index.mjs` (208) | `resetSteps` :101 | — |
| `src/screens/team/manage/sheet-host.mjs` | `mountSheetHost` :32, `unmountSheetHost` :40, `sheetController` :75 | — |
| `src/shell/current-match.mjs` (197) | `isMatchLive` :49, `currentMatch` :90, `subLine` :103, `sentLineOf` :109, `matchActions` :143 | — |
| `src/shell/navigation.mjs` (171) | `BARE_ROUTES` :30, `DRILL_ROUTES` :33 | — |
| `src/core/router.mjs` (159) | `teamMatches` :78, `teamChallenges` :79, `preMatch` :85 | — |
| `src/ui/match-board.mjs` (134), `match-board.css` (419) | `renderMatchBoard` :100, `renderBoardActions` :131 | — |
| `src/screens/games/game.mjs` (82) | форма тренера :42, `[data-game-proposal]` :72–76 | — |
| `server/routes/teams.mjs` (253) | `writeSavedTeam` :159, сверка ревизии :174–178 | — |
| `server/routes/team-fallen.mjs` (164) | `writeDeath` :81, `returnPlayer` :119 | — |
| `server/routes/team-ledger.mjs` (125) | `writeEntry` :79 | — |
| `server/routes/team-rolls.mjs` (84) | `rollForOwner` :49 | — |
| `server/season/live-match.mjs` (109) | `teamHasLiveMatch` :107 | — |
| `scripts/mock-api.mjs` (599) | список `answerApi` :556 | 07e Task 7 (`scripts/mock/*`) |
| `scripts/seed-pre-match-preview.mjs` (41) | `createPreparation` :36, `INSERT … match_preparations` :37 | — |
| `src/styles/tokens.css` (360) | `--hero-gets` :89, `--hero-pays` :90, `--hero-even` :91 | — |

- [ ] **Step 5: Записи обзора 07e.** `grep -n "readRecords\|records" src/screens/team/overview.mjs`: если 07e держит записи визита обзора (`records: {events, revision}`), Task 6 берёт число записей живого матча из них, а не вторым чтением; если `readRecords` 07e экспортирован из модуля вне `src/screens/team/roster/`, `readTeamRecords` Task 3 — это он (Task 3 тогда только переэкспортирует). Решение — строкой в план тем же коммитом шага 4.
- [ ] **Step 6: Базовый прогон** — рецепт Т, полный: всё зелёное, одинаковое число страниц EN/RU, 0 fallback. Красная база — стоп, вопрос координатору.

---

### Task 1: Сервер — запись команды во время её матча; тестовый сезон — подготовка ⚠ ревью сразу

**Files:**
- Modify: `server/season/live-match.mjs` (после `teamHasLiveMatch` :107), `server/routes/teams.mjs` (`writeSavedTeam`, после сверки ревизии :174–178), `server/routes/team-fallen.mjs` (`writeDeath` :81, `returnPlayer` :119), `server/routes/team-ledger.mjs` (`writeEntry` :79), `server/routes/team-rolls.mjs` (`rollForOwner` :49), `server/http/errors.mjs`, `scripts/seed-pre-match-preview.mjs` (:37), оба словаря
- Create: `test/team-in-match-api.test.mjs`, `test/team-roster-in-match.test.mjs`
- Modify (test): `test/preview-seed.test.mjs`
- Только при падении теста «… the games are read again»: `src/screens/team/roster/save.mjs` (`patchTeam` :101, 2 строки)

**Interfaces:**
- Consumes: `teamHasLiveMatch(db, teamId)` (`live-match.mjs:107`), `httpError` (`server/http/errors.mjs`); помощники тестов `withApiDatabase`, `callApi`, `sessionFor`, `seedCoach`, `seedTeam`, `teamRow` (`test/helpers/api-db.mjs`), `startedFriendly`, `coaches`, `teams`, `G`, `toPlayersStep`, `toReady`, `homeScores`, `act` (`test/helpers/match-db.mjs`), `lockRow` (`test/helpers/scratch-db.mjs`), `coach`, `team`, `api`, `save`, `settle`, `renderTeamRoster`, `view` (`test/helpers/roster-page.mjs`).
- Produces:
  - `refuseWhilePlaying(db, teamId) → Promise<void>` (`live-match.mjs`): бросает `httpError(422, "TEAM_IN_MATCH")`, когда `teamHasLiveMatch(db, teamId)`. Шапка-комментарий: зовётся внутри транзакции, которая уже держит строку команды `FOR UPDATE`; поэтому старт (берёт пару, затем обе команды) и запись упорядочены: запись первой — старт видит другую ревизию (`MATCH_ROSTER_CHANGED`), старт первым — запись видит идущий матч; финиш берёт ту же строку.
  - `API_ERRORS.TEAM_IN_MATCH`: `"This team is playing a match: its roster, treasury, deaths and site rolls change after the post-match."`; словари — `error.TEAM_IN_MATCH`: en — то же; ru — «Команда играет матч: состав, казна, гибель и броски на сайте — после итогов матча.»
  - Вызовы (каждый — строка, в своём месте транзакции):
    - `writeSavedTeam`: `if (!actor.admin) await refuseWhilePlaying(client, teamId);` — после блока ревизии (`:174–178`), до `normalizeDraft`;
    - `writeDeath`: после сверки ревизии; `returnPlayer`: `if (!user.is_admin) await refuseWhilePlaying(client, team.id);` сразу после `teamForUser(…, {lock: true, admin: true})`;
    - `writeEntry`: после сверки ревизии;
    - `rollForOwner`: в транзакции, после `teamForUser(client, …, {lock: true})`, до `rollForPlayer`.
  - `scripts/seed-pre-match-preview.mjs`: после `INSERT … match_preparations … DO NOTHING` — `UPDATE season_pairings p SET preparation_status = m.state->>'status' FROM match_preparations m WHERE m.pairing_id = p.id AND p.id = $1` (статус той подготовки, что лежит, — второй прогон её не пересоздаёт).

- [ ] **Step 1: Падающие тесты** — `test/team-in-match-api.test.mjs` (`const db = { skip: scratchSkip }`, каждый — `withApiDatabase`, матч — `startedFriendly(client)`, токен — `sessionFor(client, coaches.home.id)`):

```js
test("while its match is on, a coach's save, a death, an undo, a treasury entry and a site roll are refused with TEAM_IN_MATCH, and nothing is written", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const before = await teamRow(client, teams.home);
  const body = { name: "home", baseTeamSlug: "teams/human", revision: before.revision, roster: before.roster };
  for (const [method, path, payload] of [
    ["PATCH", `/api/teams/${teams.home}`, body],
    ["POST", `/api/teams/${teams.home}/players/home-1/death`, { cause: "smoke", revision: before.revision }],
    ["POST", `/api/teams/${teams.home}/treasury`, { delta: 5, reason: "sponsor", revision: before.revision }],
    ["POST", `/api/teams/${teams.home}/players/home-1/rolls`, { purpose: "stat" }],
  ]) {
    const answer = await callApi(method, path, { token, body: payload });
    assert.deepEqual([answer.status, answer.body.error.code], [422, "TEAM_IN_MATCH"], `${method} ${path}`);
  }
  const after = await teamRow(client, teams.home);
  assert.deepEqual([after.revision, after.roster], [before.revision, before.roster]);
  for (const table of ["team_ledger", "team_fallen_players", "dice_rolls"]) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE saved_team_id = $1`, [teams.home])).rows[0].n, 0, table);
  }
}));
```

  Ещё тесты:
  - «an undo of a hand-marked death is refused to the coach while the match is on, and lands for the admin» — `team_fallen_players` строкой `from_match = false` (снимок игрока `home-6` с `rowIndex`), игрок вынут из блоба SQL; `DELETE …/fallen/:id` тренером → 422 `TEAM_IN_MATCH`, строка цела; админом (`seedCoach(client, "boss", {admin: true})`) → 200.
  - «the revision is asked first: a stale save still hears TEAM_SAVED_ELSEWHERE with the team» — `PATCH` с `revision - 1` → 409 `TEAM_SAVED_ELSEWHERE`, `body.team.id === teams.home` (так потерянный ответ узнаётся).
  - «a tap and an edit outside the match are taken as before» — `POST …/events` с `pairingId: G` (`touchdowns`, +1) и без него (`completions`, +1) → 201 каждый.
  - «the admin's save of a team in a match lands» — `PATCH /api/admin/teams/:id` → 200 (вопрос владельцу 2).
  - «outside a live match the same writes land: no match, a finished one, a score confirmed without a post-match» — команда без матча (`seedTeam`) → `PATCH` 200; после `toReady(await toPlayersStep(), homeScores)` и `act("home", ready, null, true)` (финиш) → `PATCH` 200; пара с `result_status = 'confirmed'` без строки итогов (`UPDATE season_pairings`) → 200.
  - «the check is made under the team's lock: a save that waited for the start is refused» — команда в паре с `preparation_status = 'ready'` без снимков; второй клиент (`url`) держит строку команды (`BEGIN`; `client.query(...lockRow("saved_teams", teams.home))`), `PATCH` уходит и ждёт (дождаться ожидания, как `withForcedOverlap`, `test/helpers/scratch-db.mjs:158`, — по `pg_stat_activity`); держащий клиент ставит `preparation_status = 'in_progress'` и пишет оба снимка (`match_roster_snapshots`), `COMMIT` → ответ `PATCH` — 422 `TEAM_IN_MATCH`.
  - `test/preview-seed.test.mjs`, в тот же тест после цикла: `SELECT p.preparation_status FROM season_pairings p JOIN match_preparations m ON m.pairing_id = p.id` → одна строка `preparing` (после двух прогонов).
  - `test/team-roster-in-match.test.mjs` (помощники `roster-page.mjs`): «a step the server refuses because the match has begun is given up in the server's words, and the games are read again» — «Состав» вне матча, «+» TD у игрока → `PATCH /api/teams/t1` отвечает `{status: 422, body: {error: {code: "TEAM_IN_MATCH"}}}`; после `settle()`: тренеру сказаны слова `error.TEAM_IN_MATCH` (сообщение или статус), у очереди нет ждущего шага (`save.saveState("t1").waiting === 0` или имя проверки очереди файла `team-roster-data.test.mjs`), `GET /api/games` вызван после `PATCH` (`api.calls`), `api.assertAnswered()`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && . output/09a/env.sh && node --test test/team-in-match-api.test.mjs test/preview-seed.test.mjs test/team-roster-in-match.test.mjs` → FAIL (200 вместо 422; `not_started` вместо `preparing`).
- [ ] **Step 3: Реализовать** по Interfaces. Если падает только третье утверждение клиентского теста (игры не перечитаны) — кусок `save.mjs` из Files. Шапки `writeSavedTeam` и `writeDeath` дополнить одной фразой: «While the team plays a match, a coach's write is refused (TEAM_IN_MATCH, stage 09a) — after the revision, so a stale tab still hears it was saved elsewhere.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS. Тест, который пишет команду тренера во время её живого матча и ждёт 200, теперь ждёт 422 или пишет до старта — поправить его, назвав в сообщении коммита.
- [ ] **Step 5: Commit**

```bash
git add server/season/live-match.mjs server/routes/teams.mjs server/routes/team-fallen.mjs server/routes/team-ledger.mjs server/routes/team-rolls.mjs server/http/errors.mjs scripts/seed-pre-match-preview.mjs src/i18n/en.json src/i18n/ru.json test/team-in-match-api.test.mjs test/preview-seed.test.mjs test/team-roster-in-match.test.mjs
git commit -m "fix(server): a team playing a match keeps its roster, treasury, dead and site rolls until the post-match — TEAM_IN_MATCH under the team's lock, after the revision; the preview season reads as a preparation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): requesting-code-review по диффу задачи; упор — Review Focus 1, порядок блокировок, что админ и `POST …/events` не задеты.

---

### Task 2: Домен — числа «Перед матчем» и записи живого матча

**Files:**
- Create: `src/domain/match/preview.mjs`, `test/match-preview.test.mjs`

**Interfaces:**
- Consumes: `createPreparation(sources, data)` (`src/domain/match/preparation.mjs:6`), `matchBudget(preparation, sideName, data)` (`budget.mjs:20`), `calculateMatchCtv(side)` (`roster.mjs:50`), `absenceOf`, `sitsOut` (`src/domain/roster/absence.mjs:60-62`).
- Produces (чистый, без DOM и `t()`):
  - `@typedef {{user: {id: string, login: string}, team: {id: string, name: string, baseTeamSlug: string, revision: number, roster: object}}} PreviewSource` — сторона в форме `createMatchSide`.
  - `@typedef {{id: string, number: string, name: string, position: string, retired: boolean, absence: object|null}} MissingPlayer` — пропускающий (`sitsOut`), `absence` — `absenceOf(player)`, `position` — `row.position`.
  - `@typedef {{name: string, ctv: number, available: number, total: number, missing: MissingPlayer[]}} PreviewSide` — `available` — `calculateMatchCtv(side).players`, `total` — игроков в составе.
  - `BEFORE_GETS` — `Object.freeze(["own", "other", "even"])`: кому petty cash.
  - `matchPreview({ own, other }, data) → {own: PreviewSide, other: PreviewSide, gets: "own"|"other"|"even", difference: number, petty: number, bonus: number, treasury: {rule: "all"|"top"|"none", amount: number}} | null` — подготовка `createPreparation({home: own, away: other}, data)`, бюджет `matchBudget(prep, "home", data)`: `difference` — `|CTV other − CTV own|`; `gets` — `own` при CTV соперника выше, `other` при нашем выше, `even` при равных; `petty` — `budget.pettyCash`, `bonus` — `budget.bonus`; `treasury.rule` — `all`, когда мы покупаем первыми (`purchaseOrder(prep) === "home"`), `top` — вторыми, `none` — при равных; `treasury.amount` — `budget.treasuryLimit`. Неизвестная раса (`createMatchSide` бросает `UNKNOWN_TEAM`) или казна, которую правила не читают (`MATCH_BUDGET`), — `null`.
  - `matchRecords(events, pairingId) → {count: number, touchdowns: number, casualties: number}` — строки с `pairingId === pairingId` и без `settledAt`; `count` — их число (как «записей: K» 07a), суммы — `delta` по `touchdowns` и `casualties`.

- [ ] **Step 1: Падающие тесты** — `test/match-preview.test.mjs`. Справочник — `expandCollections(JSON.parse(readFileSync("public/data.en.json")))`, как `test/match-preparation.test.mjs`; составы — игроки `{id, rowIndex, number, name}` рас из данных.

```js
test("the preview is the preparation's own budget: petty cash, tier bonus, treasury rule — the same numbers matchBudget gives the step", () => {
  const sources = { own: source("h", "teams/human", humans), other: source("d", "teams/dwarf", dwarves) };
  const preview = matchPreview(sources, data);
  const prep = createPreparation({ home: sources.own, away: sources.other }, data);
  const budget = matchBudget(prep, "home", data);
  assert.equal(preview.own.ctv, calculateMatchCtv(prep.home).total);
  assert.equal(preview.other.ctv, calculateMatchCtv(prep.away).total);
  assert.deepEqual([preview.petty, preview.bonus, preview.treasury.amount], [budget.pettyCash, budget.bonus, budget.treasuryLimit]);
});
```

  (`source(id, slug, players, roster = {})` — локальный помощник.) Ещё тесты:
  - «the side with the lower CTV gets the difference; the higher buys first with the whole treasury»: наш дешевле на 90k → `gets: "own"`, `difference: 90`, `petty: 90`, `treasury: {rule: "top", amount: 50}`; наоборот → `gets: "other"`, `petty: 0`, `treasury: {rule: "all", amount: <наша казна>}`.
  - «equal CTVs give no petty cash and no treasury, and a tier bonus still counts»: одинаковые составы одной расы → `gets: "even"`, `petty: 0`, `treasury.rule: "none"`, `amount: 0`, `bonus: 0`; две расы разных тиров с равным CTV (подобрать игроков) → `bonus` — `tierAllowance` (200 при 2 против 1).
  - «a player who sits the match out is not in the CTV and is listed with why; a season's retirement too»: `skipNextGame` с `absence: {code: "miss"}` (Серьёзная травма; коды — `INJURIES`, `src/domain/post-match/rules.mjs:5`) и `temporarilyRetired: true` → оба в `missing` с `retired` `false`/`true`, `available === total − 2`, CTV меньше на их стоимость.
  - «a race the reference does not know, or a treasury the rules cannot read: no preview» → `null` у `baseTeamSlug: "teams/nope"` и у `roster.treasury: "много"`.
  - «a match's records: its own rows not settled, counted as rows, summed with their signs»: строки этого матча `+1 TD`, `+1 TD`, `−1 TD`, `+1 CAS`, учтённая строка, строка другого матча, правка вне матча (`pairingId: null`) → `{count: 4, touchdowns: 1, casualties: 1}`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/match-preview.test.mjs` → FAIL (нет модуля).
- [ ] **Step 3: Реализовать** по Interfaces. Шапка модуля: «What the board and the matches page say before the match: the preparation the server would build from the saved rosters, and its own budget — so the sheet never disagrees with the inducements step. The preparation itself is not read for it: reading it creates it (stage 09a, decision 10).»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/match-preparation.test.mjs` → PASS без изменений; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/match/preview.mjs test/match-preview.test.mjs
git commit -m "feat(match): before the match in numbers — both CTVs, who gets the petty cash, the tier bonus and the treasury rule, as the preparation's own budget; who misses it; a live match's records counted" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Данные — команда соперника и записи матча

**Files:**
- Create: `src/data/match-day.mjs`, `test/match-day-data.test.mjs`

**Interfaces:**
- Consumes: `apiRequest` (`src/core/api-client.mjs`), `refusalText` (`src/core/api.mjs`), `gameSides` (`src/data/team-record.mjs:29`), `state` (`core/state.mjs`), `t` (`request.noAnswer`).
- Produces:
  - `readOpponentTeam(game, teamId) → Promise<{team: object} | {error: string} | null>` — `null`, когда у игры нет соперника для `teamId` (`gameSides` — `null`: bye, чужая игра); иначе `GET /api/players/${encodeURIComponent(other.user.id)}/teams/${encodeURIComponent(other.team.id)}` → `{team}`; ответ без `team` — `{error: t("request.noAnswer")}`; отказ — `{error: refusalText(error)}`. Удачный ответ помнится по ключу `${coachId}:${game.id}:${game.updatedAt}` (тренер страницы, игра, её отметка), пока страница жива; отказ не помнится.
  - `readTeamRecords(teamId) → Promise<{events: object[], revision: number} | {error: string}>` — `GET /api/teams/${encodeURIComponent(teamId)}/events`; не массив — `{error: t("request.noAnswer")}`. Если Task 0, шаг 5 нашёл экспортированный `readRecords` 07e, `readTeamRecords` — его переэкспорт.

- [ ] **Step 1: Падающие тесты** — `test/match-day-data.test.mjs` (`installFakeApi()` до импорта модуля, как `test/team-overview.test.mjs`):
  - «the opponent's team is read from his public page, once for the same game as it stands» — игра `g1` (наши дома) → `GET /api/players/u-r1/teams/r1` один раз на два вызова; `updatedAt` сменился → второе чтение.
  - «a bye, or a game that is not the team's, is read as nothing; a failed read is said and not kept» — `away: null` → `null`, запросов нет; 404 `TEAM_NOT_FOUND` → `{error}` словами `error.TEAM_NOT_FOUND`, следующий вызов читает снова; `{}` → `{error: t("request.noAnswer")}`.
  - «another coach signed in reads afresh» — `state.auth.currentUser.id` сменился → чтение заново.
  - «the team's records are its events as the server sends them» — `{events: [...], revision: 4}` → то же; `{events: "x"}` → `{error}`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/match-day-data.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка: «What the matches page and the board read beyond the games: the opponent's team, from its public page (spec 3.0 §4: the matches tab is built on the client), and the team's match records.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/data/match-day.mjs test/match-day-data.test.mjs
git commit -m "feat(data): the opponent's team read from its public page, once a game as it stands; the team's match records" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: «Перед матчем» — шторка, плитка, строка пропусков, пузыри

Прототипы: телефон — `mobile/MatchesPrePlus.html`, `MatchesPreMinus.html`, `MatchesPreEven.html` (`Matches` с `demo-pre="plus-open|minus-open|even-open"`); десктоп — `desktop/DeskSeasonPrePlus.html`, `DeskSeasonPreMinus.html`, `DeskSeasonPreEven.html`. Сверять с ними (решения 10–12), размеры — D2.

**Files:**
- Create: `src/screens/matches/before.mjs`, `src/screens/matches/before.css`, `test/matches-before.test.mjs`
- Modify: `src/styles.css` (`@import url("screens/matches/before.css");` последним), оба словаря

**Interfaces:**
- Consumes: `matchPreview`, `BEFORE_GETS` (Task 2), `renderSheet`, `wireSheets` (`src/ui/sheet.mjs:41, :89`), `mountSheetHost`, `unmountSheetHost` (`src/screens/team/manage/sheet-host.mjs:32, :40`), `patchWithModal` (`src/components/dialog.mjs`), `absenceWords` (`src/screens/team/roster/panel.mjs:96`, только импорт; на вход — `{retired, absence}`), `formatMoney` (`core/format.mjs`), `refUrl` (`core/routes.mjs`). Номер игрока — текстом «#9», как прототип (не `renderPlayerBadge`).
- Produces:
  - `BEFORE_SHEET_ID = "match-before"`.
  - `beforeTitle(game) → string` — `matches.before.title {match}`, `match` — `matches.before.round {round}` или `matches.before.friendly`.
  - `beforeSheetMarkup({ preview, game, phone }) → string` — `renderSheet({ id: BEFORE_SHEET_ID, title: beforeTitle(game), wide: true, className: "g-before-sheet", bodyHtml })`, тело — блок CTV (`.g-before__hero` с модификатором `--gets|--pays|--even` по `preview.gets`: `own` → `--gets`, `other` → `--pays`), «В строю», «Пропускают матч» двумя колонками, бюджет, ссылка `refUrl("inducements")`.
  - `beforeFigures(preview) → {tile: {who: string, amount: string, tone: "gets"|"pays"|"even"}, miss: {lead: string, names: string, why: string}, bubble: {gets: "own"|"other"|null, text: string}, missText: string}` — слова плиток, строки и пузырей одним источником: `amount` — `+90k` / `−90k` / `0` (`formatMoney`, минус — U+2212); `miss` — «Пропуски:» + имена наших через «, » + « · » причина первого строчными, или «Состав:» + «все в строю»; `missText` — `matches.before.bubbleMiss {count}` по обеим сторонам или `matches.before.allIn`.
  - `openBeforeSheet(opener, { preview, game })` — хост `mountSheetHost("match-before")` (один на страницу, переподключается к `<body>`, как `new-sheet.mjs:218-227`), `patchWithModal(host, beforeSheetMarkup(...), "#match-before")`; закрытие (`wireSheets` `onClose`, Escape, фон) отдаёт фокус открывшему. `closeBeforeSheet()` — закрыть и снять хост (`unmountSheetHost`); зовут экраны при уходе.
- `before.css` (значения — `MatchesPre*`, `DeskSeasonPre*`):
  - блок CTV: отступ 18 20 16, зазор 12, текст `--header-ink`; фон — `linear-gradient(90deg, var(--hero-gets) 0 38%, var(--hero-pays) 62% 100%)` (у `--pays` — наоборот), `--even` — `var(--hero-even)`; сетка `minmax(0, 1fr) auto minmax(0, 1fr)`, зазор 10; имя команды Oswald 700 19/1.05 (телефон) и 24 (от 901px), «CTV» 12px `color-mix(in srgb, var(--header-ink) 70%, transparent)`, число Oswald 700 30/1; сумма посередине Oswald 700 30/1, «индьюсменты нам» 700 12px, `max-width` 120px, 85% белого; строка «В строю 11 из 12» 13px, число 700 `--header-ink`; правая сторона — по правому краю;
  - тело: отступ 16 20 22, зазор 12; «ПРОПУСКАЮТ МАТЧ» 700 12px, `letter-spacing: 0.06em`, `text-transform: uppercase`, `--muted`, по центру; две колонки, правая с чертой слева 2px `--line` и отступом 14; пункт: «#9 J. Corr» 700 16px, позиция 12px `--muted`, причина 600 14px `--danger`, «вернётся…» 12px `--muted`, зазор пунктов 14; «Пропусков нет» 14px `--muted`;
  - бюджет: `--surface-2`, радиус 14, отступ 12 14, зазор 8; заголовок как «Пропускают матч» (по левому краю); строки от 28px, 14px, подпись `--muted`, значение 700 `--ink`, `white-space: nowrap` у значения; подпись 12/1.4 `--muted`;
  - ссылка «Что можно купить на индьюсменты» 700 14px `--accent-text`, по центру, от 44px до 900px (D2), от 24px от 901px.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `matches.before.title` | Before the match · {match} | Перед матчем · {match} |
| `matches.before.round` | Round {round} | Тур {round} |
| `matches.before.friendly` | Friendly | Товарищеский |
| `matches.before.ctv` | CTV | CTV |
| `matches.before.to.own` | inducements to us | индьюсменты нам |
| `matches.before.to.other` | inducements to the opponent | индьюсменты сопернику |
| `matches.before.to.even` | CTVs equal — no inducements | CTV равны — индьюсментов нет |
| `matches.before.evenBonus` | CTVs equal | CTV равны |
| `matches.before.lineup` | In the lineup | В строю |
| `matches.before.ofTotal` | {count} of {total} | {count} из {total} |
| `matches.before.missing` | Miss the match | Пропускают матч |
| `matches.before.none` | No one misses it | Пропусков нет |
| `matches.before.back` | back for round {round} | вернётся к туру {round} |
| `matches.before.backNext` | back for the next match | вернётся к следующему матчу |
| `matches.before.retired` | for the rest of the season | до конца сезона |
| `matches.before.budget` | Inducement budget | Бюджет на индьюсменты |
| `matches.before.petty` | Petty cash · the CTV difference | Petty cash · разница CTV |
| `matches.before.pettyNone` | Petty cash | Petty cash |
| `matches.before.bonus` | Tier bonus | Надбавка за тир |
| `matches.before.treasury` | From the treasury | Из казны |
| `matches.before.treasuryTop` | From the treasury, on top | Из казны, сверху |
| `matches.before.treasuryAll` | the whole treasury · {amount} | вся казна · {amount} |
| `matches.before.treasuryUpTo` | up to {amount} | до {amount} |
| `matches.before.treasuryNone` | not allowed · CTVs equal | нельзя · CTV равны |
| `matches.before.note.own` | The side with the higher CTV buys first; what it spends is added to your petty cash. On top of the budget you may add up to 50k from the treasury. | Соперник с большим CTV покупает первым; потраченное им прибавится к вашему petty cash. Сверх бюджета можно добавить до 50k из казны. |
| `matches.before.note.other` | Your CTV is higher: you buy first and may spend the whole treasury. What you spend is added to the opponent's petty cash. | Ваш CTV выше: вы покупаете первыми и можете тратить всю казну. Потраченное вами прибавится к petty cash соперника. |
| `matches.before.note.even` | CTVs are equal — no inducements, and the treasury cannot be spent on the match. | CTV равны — индьюсментов нет, казну на матч тратить нельзя. |
| `matches.before.noteEvenBonus` | CTVs are equal: no petty cash, and the treasury cannot be spent on the match; the tier bonus stays. | CTV равны: petty cash нет, казну на матч тратить нельзя; надбавка за тир остаётся. |
| `matches.before.shop` | What inducements can buy | Что можно купить на индьюсменты |
| `matches.before.tile` | Inducements · {who} | Индьюсменты · {who} |
| `matches.before.tileWho.own` | we get them | получаем мы |
| `matches.before.tileWho.other` | the opponent's | у соперника |
| `matches.before.tileWho.even` | CTVs equal | CTV равны |
| `matches.before.bubble` | +{amount} for inducements | +{amount} на индьюсменты |
| `matches.before.bubbleMiss` | missing the match: {count} | пропускают матч: {count} |
| `matches.before.allIn` | Everyone is in the lineup | Все игроки в строю |
| `matches.before.out` | Out: | Пропуски: |
| `matches.before.lineupLead` | Lineup: | Состав: |
| `matches.before.lineupAll` | all in | все в строю |
| `matches.before.unread` | The opponent's team could not be read: {reason} | Команду соперника не прочитать: {reason} |

- [ ] **Step 1: Падающие тесты** — `test/matches-before.test.mjs` (превью — `matchPreview` на составах из данных, как Task 2):
  - «the sheet says who gets the inducements and why: CTV against CTV, the amount, the lineups» (`MatchesPrePlus`): `gets: "own"` → заголовок «Before the match · Round 7», блок `.g-before__hero--gets`, «inducements to us», сумма `formatMoney(90)`, «In the lineup» «11 of 12» обеих; правая сторона — соперник.
  - «who misses the match, on each side, with why and when back» — наш «#9 J. Corr», «Lineman», «Seriously Hurt» (слова `absenceWords`), «back for round 8» (тур 7 + 1); товарищеский → «back for the next match»; временный уход → «for the rest of the season»; пустая сторона — «No one misses it».
  - «the budget lines are the preview's»: `own` → «Petty cash · the CTV difference 90k», «Tier bonus 0k», «From the treasury, on top up to 50k», подпись `note.own`; `other` → «From the treasury the whole treasury · 70k»; `even` без надбавки → «From the treasury not allowed · CTVs equal», `note.even`.
  - «with equal CTVs and a tier bonus the sheet does not say there are no inducements» (Review Focus 3): `bonus: 200` → «CTVs equal», нет «no inducements», «Tier bonus 200k», `noteEvenBonus`.
  - «the tile, the line and the bubbles say the same as the sheet» — `beforeFigures` трёх случаев: `+90k` / `−90k` (U+2212) / `0`; `miss` — «Out:» «J. Corr» « · seriously hurt»; без пропусков — «Lineup:» «all in»; `missText` — «missing the match: 3» / «Everyone is in the lineup».
  - «the sheet opens over the page, gives the focus back on close, and goes with the screen» — `openBeforeSheet(button, …)` → `dialog#match-before` открыт в хосте на `<body>`; Escape → закрыт, фокус на кнопке; `closeBeforeSheet()` → хоста нет.
  - «names are text» (`HOSTILE`); «every key in both dictionaries» (`assertDictionaryCovers`), ключи из шаблонов — по `BEFORE_GETS`; «styled» (`assertStyled(..., "src/screens/matches/before.css", "src/ui/sheet.css")`); «readable» — белый на `--hero-gets`, `--hero-pays`, `--hero-even` ≥ 4.5:1, `--danger` на `--surface` ≥ 4.5:1 во всех палитрах (`assertReadable`); D2 — ссылка ≥ 44 до 900px, ≥ 24 от 901px; «no ellipsis» — в `before.css` нет `text-overflow: ellipsis`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/matches-before.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/before.mjs src/screens/matches/before.css src/styles.css src/i18n/en.json src/i18n/ru.json test/matches-before.test.mjs
git commit -m "feat(matches): «Before the match» — CTV against CTV, who gets the inducements and the budget as the preparation's, who misses it on each side; its tile, line and bubbles in the same words" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Табло — листание по турам, чипы, пузыри, итог прошлого матча

Прототипы: `desktop/DeskSeason.html` и `DeskOverview.html` (полоса `section[aria-label="Матчи сезона"]`, `bandVals`), `DeskSeasonLive.html` (в игре). Телефонное табло (`g-board` до 900px) не меняется (решение 13).

**Files:**
- Modify: `src/ui/match-board.mjs` (`renderMatchBoard` :100), `src/ui/match-board.css`, `src/styles/tokens.css` (блок «Fixed colours», после `--live`), оба словаря
- Create: `src/screens/matches/band.mjs`, `test/matches-band.test.mjs`
- Test: `test/ui-match.test.mjs`

**Interfaces:**
- Consumes: `gameSides`, `gameOutcome`, `resultKind`, `standingOf` (`team-record.mjs`), `currentMatch`, `matchActions`, `subLine` (`current-match.mjs`), `resultLabels` (`ui/result-pill.mjs`), `matchRecords` (Task 2), `beforeFigures` (Task 4), `raceTeamOf` (`data/teams.mjs`).
- Produces (`ui/match-board.mjs`, аддитивно; без новых пропсов — разметка та же, тесты 06/07d те же):
  - `pager` — у пункта ещё `{selected?: boolean, title?: string}`; `tabs: true` рисует `<div class="g-board__nav">`: кнопка `‹` (`data-board-step="-1"`, `aria-label` `ui.board.prev`, `disabled` у первого), `role="tablist"` (`aria-label` `ui.board.pager`) из `<button role="tab" class="g-board__square …" data-board-item="<index>" aria-selected tabindex>` (у выбранного `tabindex="0"`, у остальных `-1`; имя — `title` и состояние), кнопка `›` (`data-board-step="1"`). Без `tabs` — список `ol` как прежде.
  - `outcome: {label: string, note: string, result: "w"|"d"|"l"|"t"}` — строка под счётом прошлого матча «Победа · +3 в таблице»; `scoreResult: "w"|"l"|""` — счёт цветом `--live`/`--on-header-loss`.
  - `chipsHtml` — ряд по центру полосы (`.g-board__chips`), `bubbles: {own?: string, mid?: string, other?: string}` — разметка кнопок экрана под названием своей стороны / под статусом / под названием соперника.
  - `toCurrentHtml` — кнопка «К текущему матчу →» на месте действий (у прошлого матча).
  - `wireBoardPager(root, onPick) → () => void` — клики по квадратам и стрелкам, стрелки ←/→, Home/End на вкладках (roving): `onPick(index)`; возвращает снятие.
- Produces (`screens/matches/band.mjs`):
  - `@typedef {{key: string, gameId: string|null, label: string, title: string, venue: string, opponent: {name: string, userId: string, teamId: string, race: string}|null, score: string, cas: string, mvps: string[], result: "w"|"d"|"l"|"t"|null, points: number|null, friendly: boolean, current: boolean}} BandItem`.
  - `bandItems(games, teamId, seasonData) → BandItem[]` — сыгранные матчи команды (лига этого сезона и товарищеские, `resultKind` не `null`) по времени подтверждения, старые первыми; затем текущий (`currentMatch`) или, без него, «соперник — после тура N» (`current: true`, `opponent: null`). `label` — номер тура или `ui.result.t` («Т»); `title` — «Тур N» / «Товарищеский»; `points` — очки команды в паре (`homePoints`/`awayPoints`), у товарищеского `null`.
  - `bandActions(current, teamId, records) → {links, sentLine}` — `matchActions`, в фазе `live` виды полосы `DeskSeasonLive`: «Записи матча · N» (`matches.records {count}`; без записей — `shell.match.records`) — `light`, «Итоги матча» — `primary`; до матча в конец — «Товарищеские матчи» (`teamUrl(id, "challenges")`, `light`), как обзор.
  - `bandMarkup({ items, index, team, raceTeam, seasonData, current, preview, opponent, records, phone }) → string` — `renderMatchBoard` для пункта `index`: у текущего — наша строка «Люди · 2-е · TV 1 120k», соперника «Лесные эльфы · 5-е · TV 1 210k» (TV — `teamValue(opponent.team, raceTeamOf(…))`, без прочитанного соперника — без TV), статус, пузыри (`beforeFigures`, `data-before-open` на каждом; только десктоп и не `sent`), чип «Не влияет на таблицу лиги» у товарищеского; у прошлого — его соперник (раса и место, без TV), счёт, `outcome`, чипы «CAS 3–1», «MVP Gruk», «К текущему матчу →» (`data-board-current`). Телефон — без `tabs`, пузырей и чипов (как сейчас).
  - `wireBand(root, { onPick, onBefore }) → () => void` — `wireBoardPager` + делегированные клики `[data-board-current]` → `onPick(последний)` с фокусом на его квадрат, `[data-before-open]` → `onBefore(button)`.
- `tokens.css`: `--on-header-loss: #F2A99C;` в «Fixed colours» (тот же во всех палитрах, как `--live`).
- `match-board.css` (значения — `DeskSeason.html`): полоса `.g-board__bar` — фон `rgba(0,0,0,0.2)` прототипа как `color-mix(in srgb, var(--header) 80%, #000000)`; отступ 10 16; `flex-wrap`, зазор 12 20; стрелки 32×32, радиус 8, без фона, `--header-ink` (выключенная — 30% белого); вкладки 30×30, радиус 8, зазор 4, 700 12px: выбранная — фон `--header-ink`, текст `--header`; текущая не выбранная — кольцо 1.5px 60% белого; цвета исходов — `.g-board__square--w|d|l|t` (уже есть); чипы — высота 30, радиус 15, отступ 0 12, 600 13px, фон 10% белого, текст `--header-muted`; пузырь — кнопка 28px, радиус 14, отступ 0 11, фон 14% белого, кольцо 1px 25% белого, 600 13px `--header-ink`, значок «i» 14px; итог прошлого — 700 13px цветом исхода, примечание 500 `--header-muted`; «К текущему матчу →» — 40px, радиус 10, кольцо 1.5px 40% белого, 600 14px. Кольцо фокуса на полосе — `--header-ink` (как `:298-301`).

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `ui.board.prev` | Previous match | Предыдущий матч |
| `ui.board.next` | Next match | Следующий матч |
| `ui.board.toCurrent` | To the current match → | К текущему матчу → |
| `matches.band.points` | {points} in the table | {points} в таблице |
| `matches.band.offTable` | Does not count in the table | Не влияет на таблицу |
| `matches.band.cas` | CAS {cas} | CAS {cas} |
| `matches.band.mvp` | MVP {names} | MVP {names} |
| `matches.band.friendlyChip` | Does not count in the league table | Не влияет на таблицу лиги |
| `matches.band.square` | {title} · {opponent} | {title} · {opponent} |
| `matches.records` | Match records · {count} | Записи матча · {count} |

- [ ] **Step 1: Падающие тесты.**
  - `test/ui-match.test.mjs`:
    - «a board given none of the new props is drawn as before» — разметка `renderMatchBoard(props07d)` равна снимку прежней строки (тесты 07d проходят без изменений).
    - «the squares are tabs of one group: arrows, Home and End move the selection and the focus» (Review Focus 5) — `tabs: true`, пять пунктов, выбран 4-й: `role="tablist"`, у 4-го `aria-selected="true"`, `tabindex="0"`, у остальных `-1`; `wireBoardPager` + `keydown` ArrowLeft на нём → `onPick(3)`; Home → `onPick(0)`; End → `onPick(4)`.
    - «the arrows are off at the ends» — выбран первый → `‹` `disabled`; последний → `›` `disabled`.
    - «a past match: its score in the result's colour, the outcome under it, its chips» — `outcome {label: "Win", note: "+3 in the table", result: "w"}`, `scoreResult: "w"` → классы `.g-board__score--w`, `.g-board__outcome--w`; `chipsHtml` в `.g-board__chips`.
    - «bubbles stand under their side and under the state» — `bubbles.own` в стороне нашей, `mid` — в `.g-board__mid`, `other` — у соперника.
    - «styled; readable» — `--on-header-loss` и `--live` на `--header` каждой палитры ≥ 4.5:1; текст чипов `--header-muted` на полосе ≥ 4.5:1; D2 — вкладки ≥ 24 от 901px, стрелки ≥ 24.
  - `test/matches-band.test.mjs` (игры — форма `/api/games`, как `test/team-overview.test.mjs`):
    - «the band is the team's played matches in the order they were settled, then the current one» — лига туров 1–2, товарищеский между ними по `confirmedAt`, текущий тура 3 → `label` `["1", "F", "2", "3"]` в английском (буква `ui.result.t`; в русском — «Т»), последний `current`.
    - «no current match: the last item is the opponent to come» — `current: true`, `opponent: null`, `title` — «Round 4».
    - «a past item's points are the server's, a friendly has none» — победа всухую → `points: 4`; товарищеский → `points: null`.
    - «in a match the records are an outlined button with their count and the post-match the light one» — `bandActions` live, `records {count: 8}` → «Match records · 8» `light`, «Post-match» `primary`; без записей — «Match records».
    - «a desk's current item carries the bubbles, a phone's none» — `bandMarkup({phone: false, preview})` → `[data-before-open]` ×2 («+90k for inducements», «missing the match: 3»); `phone: true` → ни одного, нет `role="tablist"`.
    - «the opponent's value is said once he is read» — без `opponent` строка соперника без «TV»; с ним — «TV» и `formatMoney(teamValue(…))`.
    - «names are text» (`HOSTILE`); «every key in both dictionaries».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/ui-match.test.mjs test/matches-band.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапку `match-board.mjs` дополнить: что теперь рисует (вкладки на десктопе, итог прошлого, чипы, пузыри) и почему квадраты телефона по-прежнему не ссылки; строку «What the board does not draw…» (:27–30) — убрать сделанное.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-overview.test.mjs` → PASS без изменений; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui/match-board.mjs src/ui/match-board.css src/styles/tokens.css src/screens/matches/band.mjs src/i18n/en.json src/i18n/ru.json test/ui-match.test.mjs test/matches-band.test.mjs
git commit -m "feat(board): a desk's board pages through the season — its squares are tabs, past matches with their score, outcome, CAS and MVP, the friendly an F among them; bubbles that open «Before the match»; the records' count on the band" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Обзор — табло десктопа листает, TV соперника, пузыри; один чтец счёта

Прототипы: `desktop/DeskOverview.html` (полоса табло, `bandVals`, `preVals`), `mobile/Team.html` (табло на телефоне — нет; оставлено по ответу владельца). Сверять (решения 13–16).

**Files:**
- Modify: `src/screens/team/overview.mjs` (`proposedScore` :96, `opponentOf` :109, `boardOf` :137, `boardMarkup` :255, `markupOf` :363, `renderTeamOverview` :388 — числа после Task 0), `src/screens/team/overview.css` (если нужно), `src/shell/current-match.mjs` (`sentLineOf` :109), оба словаря
- Test: `test/team-overview.test.mjs`, `test/current-match.test.mjs`

**Interfaces:**
- Consumes: `bandItems`, `bandMarkup`, `bandActions`, `wireBand` (Task 5), `readOpponentTeam`, `readTeamRecords` (Task 3; или записи визита 07e — Task 0, шаг 5), `matchPreview`, `matchRecords` (Task 2), `openBeforeSheet`, `closeBeforeSheet` (Task 4), `teamValue`, `raceTeamOf`.
- Produces:
  - `sentScore(game, sides) → string` (`current-match.mjs`, экспорт) — «2–1» предложенного счёта со стороны команды; `""`, если числа нет. `sentLineOf` и обзор берут его; `proposedScore` и `proposedTouchdowns` в `overview.mjs` удаляются.
  - Визит обзора держит `band: {index: number|null}` (`null` — текущий), `opponent: {team}|{error}|null`, записи (свои или 07e). `boardOf` → `bandMarkup` с ними: десктоп — листание, пузыри, чипы; телефон — как было, плюс TV соперника. После `onGamesChange`: показанный пункт остаётся, если в новых `bandItems` есть пункт с тем же `key`, иначе `index: null` (Review Focus 5). Соперник читается при первом рисунке и при смене игр, когда у текущего матча есть соперник; ответ берётся, только пока визит здесь.
  - Пузырь → `openBeforeSheet(button, {preview, game})`; `preview` — `matchPreview({own: {user, team}, other: {user, team: opponent.team}}, state.data)`. Уход с обзора — `closeBeforeSheet()`.
  - `teamOverview.oppValue` — «TV {value}» (en/ru одинаково) в хвосте строки соперника.

- [ ] **Step 1: Падающие тесты** — в `test/team-overview.test.mjs` (помощники файла; `coach()` отвечает и `GET /api/players/u-r1/teams/r1` → `{team: RIVAL_TEAM}` с составом и пропускающим):
  - «a desk's board pages back to a past match and forward again» (`DeskOverview`): игры `g4` (тур 1, победа 2–1, MVP), `g5` (тур 2), текущий `g1` → `role="tablist"` из трёх, выбран третий; клик по первому → счёт «2:1» (как пишет табло), «Win · +3 in the table», чипы «CAS 1–0», «MVP Linewoman Five», «To the current match →»; нажатие на неё → снова текущий, фокус на третьем квадрате.
  - «games read again keep the match shown when it is still there, the current otherwise» — выбран тур 1, `notifyGames` с теми же играми → тур 1; без `g4` → текущий.
  - «the opponent's value stands in his line once his team is read, on both widths» — до ответа нет «TV» у соперника; после — «TV» и `formatMoney(teamValue(RIVAL_TEAM, dwarf))`; телефон — тоже, без вкладок и пузырей.
  - «the bubbles open «Before the match» over the page» — десктоп, `g1`: «+Nk for inducements» у стороны, которая получает, «missing the match: 1»; клик → `dialog#match-before`; уход с экрана (`releaseCurrentScreen()`) → шторки нет.
  - «the opponent could not be read: no bubbles, no value, nothing said twice» — 404 → нет пузырей и TV, нет `[role="alert"]` от него; `api.assertAnswered()`.
  - «in a match the band offers the records with their count and the post-match» — `g2` в игре у `t2`, записи с 8 строками матча → «Match records · 8» (обводка), «Post-match» (белая).
  - `test/current-match.test.mjs`: «the score sent is read one way for the card and the board» — `sentScore(game, sides)` у предложения 2–1 гостями → «1–2» для хозяев; пустое — `""`; `renderNavMatch` по-прежнему «Win 2–1 · CAS 1–0».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-overview.test.mjs test/current-match.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Лидеры, «Результаты», «Готовы к прокачке» и чтение записей 07e не меняются. Шапку `overview.mjs` (абзац о табло) дополнить: листание, TV соперника, пузыри, почему телефон без них. `overview.mjs` — не больше 520 строк; иначе модель табло — в `band.mjs`.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/overview.mjs src/screens/team/overview.css src/shell/current-match.mjs src/i18n/en.json src/i18n/ru.json test/team-overview.test.mjs test/current-match.test.mjs
git commit -m "feat(overview): a desk's board pages through the season and opens «Before the match» from its bubbles; the opponent's value by his name on both widths; one reader of a score sent for the card and the board" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «Матчи» — телефон

Прототипы: `mobile/Matches.html` (idle), `MatchesLive.html` (`demo-match="live"`), `MatchesPrePlus.html` (плитки и строка до открытия шторки); `sent` — состояние того же компонента (`demo-match="sent"`). Сверять (решения 1–9).

**Files:**
- Create: `src/screens/matches/index.mjs`, `model.mjs`, `card.mjs`, `lists.mjs`, `matches.css`, `test/team-matches.test.mjs`
- Modify: `src/ui/match-card.mjs` (проп `labelledBy`), `src/core/router.mjs` (:78 `teamMatches: ({ teamId }) => renderTeamMatches(teamId)`; импорт), `src/styles.css` (`@import url("screens/matches/matches.css");` последним), оба словаря
- Test: `test/ui-match.test.mjs` (`labelledBy`)

**Interfaces:**
- Consumes: `currentMatch`, `isMatchLive`, `matchActions`, `subLine`, `sentScore` (`current-match.mjs`), `gameSides`, `recentResults`, `seasonRecord`, `standingOf`, `teamValue` (`team-record.mjs`), `raceTeamOf`, `loadGames`, `onGamesChange`, `loadSeason`, `readOpponentTeam`, `readTeamRecords` (Task 3), `matchPreview`, `matchRecords` (Task 2), `beforeFigures`, `openBeforeSheet`, `closeBeforeSheet` (Task 4), `renderMatchCard` (`ui/match-card.mjs`), `renderStatusChip`, `renderResultPill`, `renderButton`, `renderCallout`, `renderPageHead`, `isPhone`, `onPhoneChange`, `drawKeepingFocus`, `patch`, `onScreenLeave`.
- Produces:
  - `MATCH_PHASES` — `Object.freeze(["idle", "preparing", "live", "post", "sent"])` (`model.mjs`).
  - `matchesModel({ team, raceTeam, seasonData, games, gamesError, seasonError, opponent, records, phone }) → MatchesModel` (`model.mjs`, без DOM): `{teamId, phone, inSeason, seasonRead, current: CardModel|null, pendingRound: number|null, results: ResultRow[], record: {wins, draws, losses}|null, others: OtherRow[], nextRound: number|null, band, failures: string[]}`; `CardModel` — `{gameId, phase, head: "next"|"friendly"|"live"|"sent", meta, own: {name, sub}, other: {name, sub, href}, score, tiles: {own: string, other: string, before: object|null, reason: string}|null, miss: object|null, friendly: boolean, records: {count, touchdowns, casualties}|null, recordsError: string, sent: {line, waitingFor: string, confirmHref: string}|null, links}`; фаза — из `currentMatch` и статусов (решение 2).
  - `currentCardMarkup(card) → string` (`card.mjs`): заголовок раздела `h2#matches-current` («Следующий матч» и т. д.) с плашкой фазы справа (не у `idle`: прототип рисует её с `notIdle`), под ним `renderMatchCard({ labelledBy: "matches-current", meta, home, away, score, live, tilesHtml, bodyHtml, actionsHtml })`.
  - `resultsMarkup(rows, record)`, `othersMarkup(rows, nextRound)` (`lists.mjs`).
  - `renderTeamMatches(teamId) → Promise<void>` (`index.mjs`): визит как `renderTeamOverview` (рисует сразу из состояния, `h1` берёт фокус; `loadGames(true)`, `loadSeason()`; `onGamesChange`, `onPhoneChange`, `visibilitychange` → `loadGames(true)`; соперник и записи — решение 9; уход — `closeBeforeSheet()` и снятие слушателей). Плитка «Индьюсменты» и строка пропусков (`data-before-open`) → `openBeforeSheet`.
  - `ui/match-card.mjs`: `labelledBy` — у статьи `aria-labelledby`, внутреннего заголовка нет; `title` тогда не обязателен. Без `labelledBy` — как прежде.
- `matches.css` (значения — `Matches.html`, `MatchesLive.html`): страница — отступ 16 16 28, зазор 22 (поля оболочки — её, этап 13); заголовок раздела Oswald 700 26px; плашка фазы — `renderStatusChip` (26px, радиус 13, 700 13px): `idle` — нейтральная, `live` — `live`, `sent` — `wait`, `preparing`/`post` — `wait`; карта — радиус 16, кольцо 1px `--line-strong` (в игре — 2px `--accent`), отступ 16, зазор 14; мета 13px `--muted`, левая часть 600; имена Oswald 700 20/1.1, подстрока 13px `--muted`; «vs» Oswald 700 20px `--muted`; счёт Oswald 700 36px; плитки — две колонки, зазор 8, радиус 12, отступ 10 12: «CTV» 12px `--muted`, «1 120k» 700 17px, « / 1 210k» 500 `--muted`; плитка индьюсментов — кнопка: фон `--accent-tint`/`--danger-tint`/`--surface-2`, текст `--on-accent-tint`/`--on-danger-tint`/`--ink-2`, «Индьюсменты · …» 12px, сумма 700 17px, значок «i» 14px; строка пропусков — кнопка от 44px (прототип 40; D2), 14px `--ink-2`, имена 700, значок `--accent-text`; «Подготовка к матчу» — 52px, радиус 12, `--accent`, белый 700 17px, шеврон 16; блок записей — от 56px, радиус 12, `--accent-tint`, `--on-accent-tint`, отступ 8 14, «Записи матча · 8» 700 16px, подстрока 13px; подпись 13/1.45 `--muted`; «Итоги матча» — 52px, `--header`, `--header-ink`, 700 17px; отправленный счёт — `--warn-tint`, `--on-warn-tint`, радиус 12, отступ 10 12, строка 700 15px, подпись 13px; «Товарищеские матчи» — от 52px, радиус 14, кольцо 1.5px `--accent`, текст `--accent-text` 700 16px, плюс 18px; «Результаты»: заголовок Oswald 700 26px, справа «4 · 1 · 1» 600 15px `--muted`; строка — сетка `30px minmax(0, 1fr) auto`, зазор 12, отступ 12 0, черта `--line`; плашка 30px радиус 8 (`renderResultPill`), соперник 500 16px (ссылка, переносится), строка «Тур 6 · <раса> · CAS 3–1» 13px `--muted` с расой-ссылкой 600 `--accent-text` (книга 12px), «MVP: Gruk» 13px `--muted`, счёт Oswald 700 26px; «Дальше в сезоне»: сетка `56px minmax(0, 1fr)`, «Тур 8» 600 13px `--muted`, соперник 500 16px `--ink-2`, примечание 13px `--muted`. Цели — от 44px (D2).

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `matches.title` | Matches | Матчи |
| `matches.head.next` | Next match | Следующий матч |
| `matches.head.friendly` | Friendly match | Товарищеский матч |
| `matches.head.live` | Current match | Текущий матч |
| `matches.head.sent` | Last match | Последний матч |
| `matches.status.idle` | Not started | Не начат |
| `matches.status.preparing` | Preparation | Подготовка |
| `matches.status.live` | In play | Идёт игра |
| `matches.status.post` | Post-match | Итоги |
| `matches.status.sent` | Awaiting confirmation | Ждёт подтверждения |
| `matches.offTable` | Friendly · off the table | Товарищеский · вне таблицы |
| `matches.ctv` | CTV | CTV |
| `matches.friendlyNote` | Does not count in the league table. SPP, injuries and the treasury count as usual. | Не влияет на таблицу лиги. SPP, травмы и казна считаются как обычно. |
| `matches.recordsSub` | TD {td} · CAS {cas} · taps on the «Roster» | TD {td} · CAS {cas} · тапы в «Составе» |
| `matches.recordsUnread` | Records not read: {reason} | Записи не прочитаны: {reason} |
| `matches.liveNote` | After the game both coaches go through the post-match — the score and events come from the records. | После игры оба тренера проходят итоги — счёт и события подставятся из записей. |
| `matches.sentWaiting` | {team} confirms the result | Результат подтверждает {team} |
| `matches.results` | Results | Результаты |
| `matches.mvp` | MVP: {names} | MVP: {names} |
| `matches.noResults` | No matches played yet | Сыгранных матчей пока нет |
| `matches.upcoming` | Later in the season | Дальше в сезоне |
| `matches.swiss` | Swiss: paired by points once every result of the round is in | Швейцарка: пара по очкам после всех результатов тура |
| `matches.noMatch` | The team has no match of this round yet | У команды пока нет матча тура |

- [ ] **Step 1: Падающие тесты** — `test/team-matches.test.mjs` (по образцу `test/team-overview.test.mjs`: `installFakeApi`, `#app-view`, `matchMedia` телефона, `coach()` отвечает `/api/games`, `/api/season`, `/api/players/u-r1/teams/r1`, `/api/teams/t1/events`):

```js
test("a phone's next match: its card, the CTVs, the inducements and who misses it, «Match preparation»", async () => {
  coach({ games: [game("g1")], rival: RIVAL_TEAM });
  await renderTeamMatches("t1");
  await settle();
  assert.equal(view.querySelector("h2#matches-current").textContent, "Next match");
  const card = view.querySelector('article[aria-labelledby="matches-current"]');
  assert.match(card.querySelector(".g-match__meta").textContent, /Round 3 · home/);
  assert.deepEqual([...card.querySelectorAll(".g-matches__tile")].length, 2);
  assert.equal(card.querySelector(".g-btn--primary, .g-matches__prepare").getAttribute("href"), preMatchUrl("g1"));
});
```

  Ещё тесты:
  - «the inducement tile and the line of who misses it open «Before the match»» — клик по плитке → `dialog#match-before`; закрыть; клик по строке → снова.
  - «in play: the records with their count and sums lead to the roster, and «Post-match» to its first step» (`MatchesLive`) — `g2` у `t2`, записи (8 строк, TD 2, CAS 3) → «Match records · 8», «TD 2 · CAS 3 · taps on the «Roster»», `href` — `teamUrl("t2", "roster")`; «Post-match» → `postMatchUrl("g2")`; карта с `.g-match--live`, плашка «In play».
  - «records not read: the block has no count and says why» — 500 на `/events` → «Match records» без числа, `matches.recordsUnread`.
  - «a score sent: the line, and who confirms it; sent by the opponent, «Confirm the score»» — `g3` (`viewerIsProposer: false`) → «Last match», «Awaiting confirmation», строка `shell.match.result`, «Confirm the score» → `gameUrl("g3")`; своё предложение — «<rival> confirms the result»; плиток нет.
  - «a friendly: the note, the tiles too» — текущий товарищеский → «Friendly match», `matches.friendlyNote`, плитки есть (решение 4).
  - «no opponent yet: «Opponent — after round 3», no tiles» (Review Focus 4) — нет текущего, таблица на туре 3 → «Opponent — after round 3» в «Later in the season»; карты нет.
  - «the opponent could not be read: the inducement tile is closed and says why, the rest is drawn» — 404 → плитка `aria-disabled="true"` с `matches.before.unread`, нажатие не открывает шторку и говорит причину; «Match preparation» на месте.
  - «the results: every finished match, newest first, the record in its head» — `g6` (товарищеский), `g5`, `g4` → три строки в этом порядке, «1 · 0 · 1» у заголовка; у `g4` «MVP: Linewoman Five»; соперник — ссылка `playerTeamUrl`; раса — ссылка на правила.
  - «later in the season: the team's other open matches first, then the next round» (вопрос 3) — `g1` на карте и `g7`-подобный товарищеский в подготовке → строка «Friendly · <rival>» «Preparation» со ссылкой на `preMatchUrl`; затем «Round 4».
  - «a team not in the table: the call to enter the season, the friendlies, their results».
  - «the games are read afresh on the way in and when the tab is seen again» — `GET /api/games` при входе, ещё раз после `visibilitychange` (видима).
  - «one form for each width: crossing 900px draws the other, the focus kept or on the title» — смена `matchMedia` → десктопная форма (Task 8 даст её разметку; здесь — что перерисовка была и `h1` в фокусе, если фокус ушёл).
  - «leaving closes the sheet and stops listening» — открыть шторку, `releaseCurrentScreen()` → шторки нет; `notifyGames` → нет рисунка.
  - «names are text» (`HOSTILE`); «every key in both dictionaries», `matches.status.*` по `MATCH_PHASES`; «styled» (`assertStyled(..., "src/screens/matches/matches.css", "src/ui/match-card.css", "src/screens/matches/before.css")`); «readable» (`--on-accent-tint` на `--accent-tint`, `--on-danger-tint` на `--danger-tint`, `--on-warn-tint` на `--warn-tint`, `--header-ink` на `--header`); D2 — каждая цель ≥ 44 до 900px; «a long opponent's name wraps; nothing is cut with «…»».
  - `test/ui-match.test.mjs`: «a card labelled by a heading outside it has none of its own» — `renderMatchCard({labelledBy: "x", …})` → `article[aria-labelledby="x"]`, нет `.g-match__head`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-matches.test.mjs test/ui-match.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. `screens/games/my-games.mjs` остаётся за `teamChallenges` (решение 3); его шапку дополнить строкой: «Since stage 09a only `teamChallenges` draws it, for the challenges, until stage 09c.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/routes.test.mjs test/shell-navigation.test.mjs test/team-switcher.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/index.mjs src/screens/matches/model.mjs src/screens/matches/card.mjs src/screens/matches/lists.mjs src/screens/matches/matches.css src/ui/match-card.mjs src/core/router.mjs src/screens/games/my-games.mjs src/styles.css src/i18n/en.json src/i18n/ru.json test/team-matches.test.mjs test/ui-match.test.mjs
git commit -m "feat(matches): the Matches tab on a phone — the current match as a card with its CTVs, inducements and who misses it, «Match preparation», the records in play and the post-match; the results and what comes later in the season" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: «Матчи» — десктоп («Сезон» без таблицы)

Прототипы: `desktop/DeskSeason.html` (idle), `DeskSeasonLive.html`, `DeskSeasonPrePlus.html` (пузыри). Таблица `DeskSeason` — этап 10 (вопрос владельцу 1).

**Files:**
- Modify: `src/screens/matches/index.mjs`, `model.mjs`, `lists.mjs`, `matches.css`, оба словаря
- Test: `test/team-matches.test.mjs`

**Interfaces:**
- Consumes: `bandItems`, `bandMarkup`, `wireBand` (Task 5), `renderPageHead`, `standingOf`, `seasonRecord`, всё Task 7.
- Produces:
  - `matchesModel` → ещё `calendar: CalendarRow[]` и `seasonLine: string`: `CalendarRow` — `{key, square: {label, result|null, current, friendly}, opponent: {name, href}|null, line: string, score: string, muted: boolean}`; строки — сыгранные (как `bandItems`), текущий («дома · следующий», «· идёт игра», «· ждёт подтверждения»; счёт — `sentScore` или «—»), следующий тур («Соперник — после тура N», «пара по швейцарской системе», приглушён).
  - `calendarMarkup(rows, teamId) → string` (`lists.mjs`): карточка «Календарь» с «Товарищескими матчами» в шапке (36px, обводка `--accent`, 700 13px; D2 ≥ 24).
  - Десктопная форма `renderTeamMatches`: `renderPageHead({title: t("shell.side.season"), sub: seasonLine})`; табло `bandMarkup` во всю ширину с листанием и пузырями (визит держит `band.index`, как обзор Task 6); под ним «Календарь» во всю строку (вопрос 1).
- `matches.css` (значения — `DeskSeason.html`): `main` — отступ 24 32 40 (оболочка — 28, этап 13), зазор 20; «Календарь» — `--surface`, радиус 16, кольцо 1px `--line`, отступ 16 20 8; заголовок Oswald 700 24px; строка — сетка `30px minmax(0, 1fr) auto`, зазор 12, от 52px, черта `--line`; квадрат 30px радиус 8, 700 13px: сыгранный — цвет исхода (`--result-friendly` «Т»), текущий — `--accent-tint` с кольцом 1px `--line-strong`, будущий — `--surface` с кольцом; соперник 500 15px (ссылка), будущий — `--muted`; строка 12px `--muted`; счёт Oswald 700 22px, «—» `--muted`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `matches.seasonLine` | {season} · teams: {teams} · after round {round} | {season} · команд: {teams} · после тура {round} |
| `matches.calendar` | Calendar | Календарь |
| `matches.calendarHome` | at home · CAS {cas} | дома · CAS {cas} |
| `matches.calendarAway` | away · CAS {cas} | в гостях · CAS {cas} |
| `matches.calendarFriendly` | off the table · CAS {cas} | вне таблицы · CAS {cas} |
| `matches.calendarNext` | next | следующий |
| `matches.calendarSwiss` | paired by the Swiss system | пара по швейцарской системе |

- [ ] **Step 1: Падающие тесты** — в `test/team-matches.test.mjs`:
  - «a desk's matches page is the season's: its head, the board through its matches, the calendar» (`DeskSeason`) — `h1` «Season», подстрока «Mock Season · teams: 4 · after round 2» (последний завершённый тур); табло с `role="tablist"`; «Calendar» со строками туров 1, 2 (и товарищеского между ними), 3 (текущий, «at home · next»), 4 («Opponent — after round 3», «paired by the Swiss system»).
  - «paging the board shows a past match; the calendar stays» — клик по первому квадрату → «To the current match →»; «Calendar» тот же.
  - «in play: the band's records and post-match; the calendar's line says it is on» (`DeskSeasonLive`) — «Match records · 8», «Post-match», строка текущего — «at home · in play».
  - «the bubbles open «Before the match»» (`DeskSeasonPrePlus`) — пузырь → `dialog#match-before`.
  - «no table on the page» — нет `table`, нет «Table» (вопрос 1).
  - D2 — «Friendlies» календаря ≥ 24, вкладки ≥ 24 от 901px; «styled»; «no ellipsis».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-matches.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/index.mjs src/screens/matches/model.mjs src/screens/matches/lists.mjs src/screens/matches/matches.css src/i18n/en.json src/i18n/ru.json test/team-matches.test.mjs
git commit -m "feat(matches): the Matches page on a desk is the season's — the board paging through the team's matches with its bubbles, and the calendar of played, current and coming rounds; the table is stage 10's" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Подготовка I — рамка, фанаты, погода, состав, старт; слова шагов

Прототипы: телефон — `mobile/PreFans.html`, `PreWeather.html`, `PreRoster.html`, `PreReview.html` (шапка, точки шагов, подвал); десктоп — `desktop/DeskPreReview.html` (рамка: полоса, список шагов, колонки) и `DeskPreInducements.html` (та же рамка); фанатов, погоды и состава на десктопе в прототипах нет — их карточки — из телефона в рамке десктопа (решение 17). Сверять, D2. Разметка — экспорты, маршрут переключит Task 11.

**Files:**
- Create: `src/screens/matches/prep-model.mjs`, `prep-frame.mjs`, `prep-steps.mjs`, `prep.css`, `test/match-prep.test.mjs`
- Modify: `src/styles.css` (`@import url("screens/matches/prep.css");` последним), оба словаря (`pre.step.inducements` RU → «Индьюсменты», `pre.step.review` → «Старт»/"Start", ключ `pre.step.kickoff` удалить), `src/screens/team/roster/panel.mjs:107` и `src/screens/team/manage/index.mjs:101` (`kickoff: t("pre.step.review")`)
- Test: тесты 07a–08, которые ждут «Индусменты» / «Удар / приём» / "Kick / receive" (`grep -rln 'Kick / receive\|Удар / приём\|Индусмент' test`) — новые слова

**Interfaces:**
- Consumes: `MATCH_STEPS`, `SIDES`, `otherSide` (`domain/match/rules.mjs`), `preparationStep` (`preparation.mjs:12`), `calculateMatchCtv`, `journeymanPositions` (`roster.mjs`), `matchBudget` (`budget.mjs`), `weatherEntries`, `weatherResult` (`weather.mjs`), `matchPlayers` (`snapshot.mjs`), `rosterMax` (`domain/roster/values.mjs`), `wireRadioGroups` (`ui/choice.mjs`), `renderSegmentedControl`, `renderButton`, `renderStatusChip`, `renderCallout`, `formatMoney`, `teamUrl`, `gameUrl`, `preMatchUrl`.
- Produces:
  - `prepModel(payload, sideName, step, ui) → PrepModel` (`prep-model.mjs`, без DOM): `{gameId, teamId, isAdmin, sideName, step, current, steps: {key, label, state: "done"|"current"|"open"|"later", summary, href|null}[], title, sub, readonly, readonlyWhy: "started"|"closed"|"", own, other, opponent: {state, text}, footer: {kind: "next"|"action"|"start"|"none", label, action?, href?, disabled, hint}, ctv: {own, other}, budget, error}` — `current` — `preparationStep`, шаг на экране — запрошенный, не дальше текущего (как 2.x `step()`); `steps[].state` — пройденный (`< current`), текущий, открытый (шаг экрана, если он раньше текущего), поздний; сводки десктопа: фанаты «Fan Factor 5 : 5», погода — имя `weatherResult` или «—», состав «11 и 9 в строю», текущий — «сейчас»; `opponent` — строка подвала: `prep.opponent.<state>` (фанаты `rolled|waiting`, погода `set|waiting`, состав `locked|waiting` с числом в строю, индьюсменты — Task 10, старт `confirmed|waiting`); `footer` — решение 21 и строки «Как идёт каждая запись»: следующий шаг ссылкой («Далее: погода»), закрытый с `prep.wait.<step>`, пока шаг не пройден обеими сторонами; на составе — «Подтвердить состав» (`lock-roster`) или после — «Далее: индьюсменты» и тихая «Изменить состав» (`reopen`); на старте — «Подтвердить подготовку» (`confirm`), затем «Начать матч» (`start`, закрыт до `ready`, подсказка `prep.startHint`).
  - `prepFrameMarkup(model, { phone, contentHtml, asideHtml }) → string` (`prep-frame.mjs`): телефон — `<div class="g-prep">` шапка (`a.g-prep__back` 44×44 → `teamUrl(teamId, "matches")`, у админа — `gameUrl`; `h1.g-prep__title` «Перед матчем»; подзаголовок; `nav.g-prep__dots` с `aria-label` `pre.steps`: пройденные и текущий — `<a>` с `aria-current="step"` у шага экрана, поздние — `<span>`), тело, подвал (строка о сопернике с точкой `--accent`/`--warn` и кнопка `footer`); десктоп — полоса (`a.g-prep__back`, `h1` «Перед матчем · тур 7», «A — B»), `aside.g-prep__steps` 260px (строки 56px: кружок 28 — ✓ на `--accent`, номер на `--accent` у текущего, на `--surface-3` у поздних; название 500/700 15px, сводка 12px `--muted`; фон текущего `--accent-tint`), `section.g-prep__card` с контентом, правая колонка `asideHtml` (соперник — карточка «Соперник», имя 700 16px, строки 44px; кнопка подвала — там же). Матч начат / тур закрыт — `renderCallout` под шапкой (`prep.started` со ссылками «Записи матча» и «Итоги матча» / `prep.closed`); ошибка записи — `renderCallout({tone: "danger"})` с `role="alert"`.
  - `fansMarkup(model)`, `weatherMarkup(model, data)`, `rosterMarkup(model)`, `reviewMarkup(model, data)` (`prep-steps.mjs`) — карточки (`--surface`, радиус 16, кольцо 1px `--line`, отступ 14 16, зазор 10):
    - фанаты (`PreFans`): подпись «Fan Factor = Dedicated Fans + D3…», наша карточка (название 700 16px, «Dedicated Fans 3», плашка «Вы» `--accent-tint`), «ВАШ БРОСОК D3» (700 12px, 0.06em, заглавные, `--muted`), радиогруппа трёх граней (`data-prep-fans`, 52px, радиус 10; выбранная — `--accent-tint-soft` с кольцом 2px `--accent`, 700; прочие — `--surface`, кольцо 1px `--line-strong`, 600; Oswald 20px), «Fan Factor» и число Oswald 700 28px `--on-accent-tint`; карточка соперника («Бросил» / «Ждём»; «D3 = 1 · Fan Factor 5» или «—»); подпись «Бросок делают за столом…»;
    - погода (`PreWeather`): «ВРЕМЯ ГОДА» — `renderSegmentedControl` (Весна/Лето/Осень, `pre.season.*`; сегменты 38px от 901px, 44px до 900px; `data.segGroup: "prep-season"`), подпись `prep.weather.seasonNote`; два ряда D6 (`data-prep-weather="home|away"`, по 6 граней 46px, подпись ряда — название команды); строка «Сумма 2D6: 7»; карточка результата (`--accent-tint-soft`: «Погода на матч · 4–10», имя Oswald 700 26/1.1, описание 14/1.45 `--ink-2`); «ТАБЛИЦА» — строки `weatherEntries` от 36px, 14px, выпавшая — `--accent-tint-soft`, 700;
    - состав (`PreRoster`): «В строю 11 из 12» 700 16px, «CTV 1 120k» 13px `--muted`; строки игроков от 40px (до 900px — от 44px не нужны: строки не нажимаемы), номер Oswald 700 26px шириной, имя, «Blitzer · C»; пропускающий — `--danger`, «пропускает · <причина>»; журнеймены — строка «Journeyman» со «Убрать» (`data-prep-remove`); карточка «Journeymen» (Oswald 700 20px, подпись `prep.roster.journeymenNote {count}`), по кнопке на позицию `journeymanPositions` «+ Journeyman · Human Lineman» (`data-prep-hire="<rowIndex>"`, от 44px, радиус 10; закрыта с причиной, когда в строю уже 7 или позиция полна, и после подтверждения); подпись `prep.roster.lockNote`; соперник — раскрываемый список его играющих (`<details>`), как 2.x;
    - старт (`PreReview`): погода (`--accent-tint-soft`: «Погода», «Perfect Conditions · осень» 700 17px), карточки сторон (плашка «Подтвердил» `live` / «Ждём» `wait`; строки «подпись — значение» от 44px, 15/1.25: Fan Factor, В строю («11 · без Journeymen» / «7 · Journeymen: 2»), CTV, Индьюсменты («Nuffle's Prayers · 15k» через «, » или «—»), Из казны («0k · казна 70k», только у своей); молитвы и эффекты — строкой «Эффекты», когда есть; подпись `prep.review.note`.
  - Слова шагов: `pre.step.<step>` по `MATCH_STEPS` — en Fans, Weather, Roster, Inducements, Start; ru Фанаты, Погода, Состав, Индьюсменты, Старт. Плашки «Состава» и «Команды» говорят «сбросят шаги «Состав», «Индьюсменты» и «Старт»».
- `prep.css` (значения — прототипы): корень — `--surface-2`, `min-height: 100dvh`; шапка телефона — `--header`, отступ 10 14 12, зазор 12, «‹» 44×44 радиус 22 фон 12% белого; заголовок Oswald 600 21/1.15; подзаголовок 12px `--header-muted`, переносится; точки — 5 колонок, зазор 2, колонка от 44px; кружок 24px радиус 12, 700 12px: текущий — фон `--header-ink`, цифра `--header`; пройденный — `--accent` и ✓ белым, поздний — 14% белого и `--header-muted`; подпись 10px, текущая 700 белым, прочие 500 `--header-tab`, без «…» (`overflow-wrap: anywhere`); тело — отступ 14 16 16, зазор 14; подвал — `--surface`, черта сверху `--line`, отступ 10 16 16, зазор 8; строка о сопернике 13/1.35 `--muted` по центру, точка 8px; основная кнопка 52px, радиус 12, `--accent`, белый 700 17px; закрытая — `--disabled`; подсказка 12px `--muted`. Десктоп: полоса — отступ 18 32, «‹» 40px (≥ 24, прототип), заголовок Oswald 600 28/1.1, подстрока 14px `--header-muted`; `main` — `flex-wrap`, зазор 20, отступ 24 32 40; список шагов — `flex: 0 1 260px`, `min-width` 220, отступ 12, радиус 16, кольцо; карточка шага — `flex: 3 1 520px`, отступ 20 24, заголовок Oswald 700 20/1.15; правая колонка — `flex: 1 1 300px`, зазор 16; кнопка 48px (`DeskPreInducements`) / 52px (`DeskPreReview`).

Словари (en / ru; главные — остальные по образцу, все в `prep.*`):

| ключ | en | ru |
|---|---|---|
| `prep.title` | Before the match | Перед матчем |
| `prep.titleDesk` | Before the match · {match} | Перед матчем · {match} |
| `prep.sub` | {match} · {home} — {away} | {match} · {home} — {away} |
| `prep.back` | Back to the matches | Назад к матчам |
| `prep.now` | now | сейчас |
| `prep.fans.intro` | Fan Factor = Dedicated Fans + D3. It counts for the gate after the match and for Kick-off events. | Fan Factor = Dedicated Fans + D3. Он влияет на доход с посещаемости после матча и на события кик-оффа. |
| `prep.fans.you` | You | Вы |
| `prep.fans.roll` | Your D3 roll | Ваш бросок D3 |
| `prep.fans.factor` | Fan Factor | Fan Factor |
| `prep.fans.rolled` | Rolled | Бросил |
| `prep.fans.waiting` | Waiting | Ждём |
| `prep.fans.tabletop` | The roll is made at the table and entered here. Each coach enters their own. | Бросок делают за столом и вводят сюда. Каждый тренер вводит только свой. |
| `prep.weather.season` | Time of year | Время года |
| `prep.weather.seasonNote` | The coaches choose the time of year for this match. | Время года выбирают тренеры на этот матч. |
| `prep.weather.die` | {team} · D6 | {team} · D6 |
| `prep.weather.sum` | 2D6 total: {sum} | Сумма 2D6: {sum} |
| `prep.weather.result` | Weather for the match · {range} | Погода на матч · {range} |
| `prep.weather.table` | Table | Таблица |
| `prep.roster.lineup` | In the lineup {count} of {total} | В строю {count} из {total} |
| `prep.roster.misses` | misses it · {reason} | пропускает · {reason} |
| `prep.roster.journeymen` | Journeymen | Journeymen |
| `prep.roster.journeymenNote` | With fewer than 7 in the lineup, add free Journeymen — Linemen with Loner (4+). You have {count}. | Если в строю меньше 7 игроков, добавьте бесплатных Journeymen — линейных с Loner (4+). У вас {count}. |
| `prep.roster.hire` | + Journeyman · {position} | + Journeyman · {position} |
| `prep.roster.full` | Seven in the lineup already | В строю уже семь |
| `prep.roster.lockNote` | Once confirmed, the roster is fixed for the match. It can only be changed by coming back to this step before the start. | После подтверждения состав фиксируется на матч. Изменить его можно, только вернувшись на этот шаг до старта. |
| `prep.roster.opponent` | The opponent's lineup | Состав соперника |
| `prep.review.weather` | Weather | Погода |
| `prep.review.confirmed` | Confirmed | Подтвердил |
| `prep.review.waiting` | Waiting | Ждём |
| `prep.review.lineupNone` | {count} · no Journeymen | {count} · без Journeymen |
| `prep.review.lineupSome` | {count} · Journeymen: {journeymen} | {count} · Journeymen: {journeymen} |
| `prep.review.fromTreasury` | {spent} · treasury {treasury} | {spent} · казна {treasury} |
| `prep.review.note` | The match starts once both coaches confirm. At the start the roster is fixed, purchases from the treasury are paid, and recent player purchases can no longer be undone. | Матч стартует, когда оба тренера подтвердят. При старте состав фиксируется, покупки из казны списываются, а отмена недавних покупок игроков закрывается. |
| `prep.next` | Next: {step} | Далее: {step} |
| `prep.confirm` | Confirm the preparation | Подтвердить подготовку |
| `prep.start` | Start the match | Начать матч |
| `prep.startHint` | The button opens once the opponent confirms | Кнопка станет активной, когда соперник подтвердит |
| `prep.lockRoster` | Confirm the roster | Подтвердить состав |
| `prep.reopenRoster` | Change the roster | Изменить состав |
| `prep.wait.fans` | Opens once both have rolled | Станет доступно, когда оба бросят |
| `prep.wait.weather` | Opens once the weather is rolled | Станет доступно, когда погода брошена |
| `prep.wait.roster` | Opens once both rosters are confirmed | Станет доступно, когда оба подтвердят состав |
| `prep.wait.inducements` | Opens once both have confirmed their purchases | Станет доступно, когда оба подтвердят покупки |
| `prep.wait.review` | — | — |
| `prep.opponent.rolled` | The opponent has entered their roll | Соперник ввёл свой бросок |
| `prep.opponent.waitingRoll` | Waiting for the opponent's roll | Ждём бросок соперника |
| `prep.opponent.weatherSet` | The weather is entered | Погода записана |
| `prep.opponent.weatherWaiting` | Waiting for the dice | Ждём кубики |
| `prep.opponent.locked` | The opponent confirmed the roster: {count} in the lineup | Соперник подтвердил состав: {count} в строю |
| `prep.opponent.lockWaiting` | The opponent has not confirmed the roster yet | Соперник ещё не подтвердил состав |
| `prep.opponent.confirmed` | The opponent has confirmed | Соперник подтвердил |
| `prep.opponent.confirmWaiting` | Waiting for the opponent to confirm | Ждём подтверждения соперника |
| `prep.opponentCard` | Opponent | Соперник |
| `prep.started` | The match has begun: the preparation is read-only. | Матч начат: подготовку можно только посмотреть. |
| `prep.closed` | The round is closed: the preparation is read-only. | Тур закрыт: подготовку можно только посмотреть. |
| `prep.side` | Side | Сторона |

- [ ] **Step 1: Падающие тесты** — `test/match-prep.test.mjs` (полезная нагрузка — `{preparation, snapshots: {}, viewerSide, isAdmin, fixture}` из `createPreparation` и `applyPreparationAction` на составах данных, как `test/match-preparation.test.mjs`):
  - «the steps as the preparation stands: done, the one on screen, the current, later» — после фанатов обеих → `steps[0].state` `done`, `[1]` `current`, `[2..4]` `later`; ссылки только у первых двух; сводка фанатов «Fan Factor 5 : 5».
  - «a step asked beyond the current is the current» — запрошен `review` при текущем `weather` → шаг экрана `weather`.
  - «a phone's frame: back to the team's matches, the title, the dots, the footer» (`PreFans`) — `a.g-prep__back` `href` — `teamUrl(<team>, "matches")`, у админа — `gameUrl`; `h1` «Before the match»; пять точек, текущая с `aria-current="step"`; подвал — строка о сопернике и «Next: Weather» закрытая с `prep.wait.fans`, пока соперник не бросил.
  - «a desk's frame: the steps aside with their summaries, the card, the column» (`DeskPreReview`) — `aside.g-prep__steps` пять строк, ✓ у пройденных; `h1` «Before the match · Round 7».
  - «the fans' dice are one radio group; the opponent's card says whether they rolled» — `role="radiogroup"`, три `role="radio"`, выбранная — `aria-checked="true"` с `tabindex="0"`; «Waiting» / «Rolled» и «D3 = 2 · Fan Factor 4».
  - «the weather: the time of year, both dice rows, the sum, the result and the table with its row lit» — `pre.season.*`, два ряда по 6, «2D6 total: 7», имя `weatherResult`, строка таблицы `4–10` выделена.
  - «the roster: who plays, who misses it and why, the journeymen positions closed with why» — пропускающий `--danger` с «misses it · Seriously Hurt»; в строю 7 → «+ Journeyman» закрыта `prep.roster.full`; подтверждено → «Change the roster» и «Next: Inducements».
  - «the start: both sides' rows, the start closed until the opponent confirms» (`PreReview`) — «Confirmed» / «Waiting», «11 · no Journeymen», «Start the match» закрыта с `prep.startHint`; оба подтвердили (`ready`) → открыта.
  - «a match begun, or a round closed, reads only: the callout says so and leads to the records and the post-match» — `status: "in_progress"` → `prep.started`, ссылки `teamUrl(…, "roster")` и `postMatchUrl`; кнопок записи нет.
  - «the steps' names are the preparation's, and the roster's and the team page's banners name them» — `pre.step.*` по `MATCH_STEPS` в обоих словарях; ключа `pre.step.kickoff` нет; RU `pre.step.inducements` — «Индьюсменты», `pre.step.review` — «Старт»; `t("teamRoster.prep.banner", …)` через `panel.mjs` → «… «Состав», «Индьюсменты» и «Старт» …» (проверить строкой разметки «Состава» в режиме подготовки через `roster-page.mjs` или прямым вызовом функции `panel.mjs:107`).
  - «names are text» (`HOSTILE`); «every key in both dictionaries», `prep.wait.*` и `prep.opponent.*` по их наборам; «styled» (`assertStyled(..., "src/screens/matches/prep.css")`); «readable» (белый на `--accent`, `--header-tab` на `--header` для подписей точек 10px — ≥ 4.5:1 во всех палитрах, `--on-accent-tint` на `--accent-tint-soft`); D2 — «‹», точки-ссылки, грани, кнопки ≥ 44 до 900px; от 901px ≥ 24; «no ellipsis».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/match-prep.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; правки слов шагов и два куска `panel.mjs`/`manage/index.mjs`; ожидания тестов 07a–08 — на новые слова.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-roster.test.mjs test/team-manage.test.mjs test/team-settings.test.mjs test/team-roster-market.test.mjs test/team-roster-fallen-undo.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/prep-model.mjs src/screens/matches/prep-frame.mjs src/screens/matches/prep-steps.mjs src/screens/matches/prep.css src/styles.css src/screens/team/roster/panel.mjs src/screens/team/manage/index.mjs src/i18n/en.json src/i18n/ru.json test/match-prep.test.mjs test/team-roster.test.mjs test/team-manage.test.mjs test/team-settings.test.mjs test/team-roster-market.test.mjs test/team-roster-fallen-undo.test.mjs
git commit -m "feat(prep): the preparation's own frame — a phone's head with its step dots and footer, a desk's steps aside and columns — and its fans, weather, roster and start; the steps are named as the preparation has them, and the roster's banners follow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Список тестов в `git add` — те, что `grep` назвал.)

---

### Task 10: Подготовка II — индьюсменты и эффекты

Прототипы: `mobile/PreInducements.html` («Помощь» и «Звёзды», `isHelp`/`isStars`), `desktop/DeskPreInducements.html` (карточка шага и колонка «Бюджет» / «Соперник»). Эффектов в прототипах нет — форма 2.x (`components/pre-match/effects.mjs`) в виде 3.0 (решение 20).

**Files:**
- Create: `src/screens/matches/prep-inducements.mjs`, `prep-effects.mjs`, `prep-inducements.css`, `test/match-prep-inducements.test.mjs`
- Modify: `src/screens/matches/prep-model.mjs` (индьюсменты в `prepModel`), `src/styles.css` (`@import url("screens/matches/prep-inducements.css");` последним), оба словаря

**Interfaces:**
- Consumes: `matchCatalog`, `catalogAccess` (`domain/match/catalog.mjs`), `matchBudget`, `basketTotals`, `purchaseOrder` (`budget.mjs`), `MATCH_RULES`, `teamKey`, `otherSide` (`rules.mjs`), `starProfiles` (`snapshot.mjs`), `effectTargets`, `TARGET_PRAYERS` (`effects.mjs`), `prayerEntries` (`weather.mjs`), `journeymanPositions`, `categoriesForAccess` (`domain/roster/values.mjs`), `renderResourceCounter`, `wireResourceCounters` (`ui/resource-counter.mjs`), `renderSegmentedControl`, `renderStatusChip`, `renderButton`.
- Produces:
  - `prepModel` → ещё `inducements: {turn: "first"|"second"|"wait"|"even", spentByOther: number, petty, bonus, treasuryUpTo, chosen, remaining, share: 0..10, hint, category: "help"|"stars", rows: InducementRow[], stars: {used, of}, editable, locked, effects: object|null}` и подвал шага: «Подтвердить покупки» / «Продолжить без покупок» (`lock-basket`), после — «Далее: старт» и тихая «Изменить покупки» (`reopen`); строка о сопернике `prep.turn.*`.
  - `@typedef {{id: string, title: string, note: string, cost: number, quantity: number, limit: number, reason: string, star: boolean, slots: number}} InducementRow` — только доступные команде (`catalogAccess`); `note` — «15k · до 3 · <первая строка правила>» (как 2.x `itemCard`: тело страницы без шапки и вики-ссылок), у звезды — «85k» + « · Mega Star · 2 места», когда `slots` 2; `reason` — `purchaseReason` 2.x (`components/pre-match/catalog.mjs:14-24`), перенесённый в модель: доступ, лимит, не хватает денег (`pre.missingMoney` → `prep.missing {amount}`), места звёзд, лимит состава.
  - `share` — доля потраченного из максимума десятками (0…10) — класс `g-prep-budget__bar--<share>` (CSP: без `style`).
  - `inducementsMarkup(model) → string`, `budgetCardMarkup(model, { desk })` (`prep-inducements.mjs`): карточка бюджета (чип очереди `prep.turn.<turn>` — `wait` тон `wait`, прочие `live`; «Petty cash 90k + из казны до 50k» 13px с числами 700 `--ink`; потрачено Oswald 700 24px «{chosen}»; полоса 8px радиус 4 `--line`, заполнение `--accent` (перерасход — `--danger`); подсказка 12px `--muted`); на десктопе — в колонке со строками купленного (36px) и кнопкой 48px; «Помощь | Звёзды» — `renderSegmentedControl` (`pre.category.*`, `data.segGroup: "prep-category"`); строки помощи — `renderResourceCounter({key: id, name: title, note, value: quantity, incBlockedReason: reason, lockedReason})`; звёзды — подпись «Мест для звёзд: N из M. Mega Star занимает два места.» и строки 60px с «Взять» / «Убрать» (36px, кольцо 1px `--line-strong`, 600 14px `--ink-2`; D2 до 900px — 44px; `data-prep-star`); эффекты — `effectsMarkup(model)` под списком.
  - `effectsMarkup(model) → string`, `effectsFromForm(form, previous, quantity) → object` (`prep-effects.mjs`) — поля и смысл 2.x (`components/pre-match/effects.mjs:27-44`): молитвы (результат по `prayerEntries`, цель, число, навык при 16), Mark of Chaos, Rowdy Rookies; родные `<select>` в карточке 3.0 (`--surface`, радиус 12, кольцо; подпись 13px `--muted`; от 44px до 900px), «Сохранить эффекты» — `renderButton({kind: "outline"})`.
- `prep-inducements.css` (значения — `PreInducements`, `DeskPreInducements`): строки 60px, черта `--line`; название 600 15px, подпись 12px `--muted`; степпер — фон `--surface-2`, радиус 12, отступ 3, кнопки `--surface` радиус 9 34px от 901px и 44px до 900px (D2), значение Oswald 700 20px; на десктопе строки — сетка `repeat(auto-fit, minmax(300px, 1fr))`, зазор колонок 24.

Словари (en / ru; главные):

| ключ | en | ru |
|---|---|---|
| `prep.ind.title` | Inducements | Индьюсменты |
| `prep.ind.order` | The side with the higher CTV buys first — the opponent has {theirs} against your {ours}. The {difference} difference is your petty cash. | Покупает первым команда с большим CTV — у соперника {theirs} против ваших {ours}. Разница {difference} — ваш petty cash. |
| `prep.turn.first` | You buy first | Покупаете первыми |
| `prep.turn.second` | Your turn · the opponent chose {amount} | Ваша очередь · соперник уже выбрал на {amount} |
| `prep.turn.wait` | Waiting for the opponent's purchases: their CTV is higher | Ждём покупок соперника: CTV у него выше |
| `prep.turn.even` | CTVs equal: no petty cash | CTV равны: petty cash нет |
| `prep.ind.budget` | Budget | Бюджет |
| `prep.ind.petty` | Petty cash {petty} + from the treasury up to {treasury} | Petty cash {petty} + из казны до {treasury} |
| `prep.ind.hint` | Left {remaining}; what the petty cash does not cover comes from the treasury | Осталось {remaining}; что не покрывает petty cash — из казны |
| `prep.ind.note` | {cost} · up to {limit} · {rule} | {cost} · до {limit} · {rule} |
| `prep.ind.stars` | Star places: {used} of {of}. A Mega Star takes two. | Мест для звёзд: {used} из {of}. Mega Star занимает два места. |
| `prep.ind.mega` | Mega Star · 2 places | Mega Star · 2 места |
| `prep.ind.take` | Take | Взять |
| `prep.ind.drop` | Remove | Убрать |
| `prep.missing` | Not enough · {amount} | Не хватает · {amount} |
| `prep.lockBasket` | Confirm the purchases | Подтвердить покупки |
| `prep.noBasket` | Go on without purchases | Продолжить без покупок |
| `prep.reopenBasket` | Change the purchases | Изменить покупки |
| `prep.opponentFirst` | Bought first | Покупал первым |
| `prep.opponentState` | Status | Статус |
| `prep.opponentChosen` | choice confirmed | выбор подтверждён |
| `prep.effects` | Prayers and effects | Молитвы и эффекты |
| `prep.effectsNote` | Roll at the table and record what came up. | Бросьте за столом и запишите, что выпало. |
| `prep.saveEffects` | Save the effects | Сохранить эффекты |
| `prep.mercenaries` | Mercenaries are not available in Gata League. | Наёмники в Gata League недоступны. |

- [ ] **Step 1: Падающие тесты** — `test/match-prep-inducements.test.mjs` (подготовка на шаге индьюсментов — действия домена: фанаты, погода, оба состава подтверждены):
  - «the budget card says whose turn it is and what is left: the preparation's own numbers» — наша команда дешевле → `prep.turn.wait`, пока соперник не подтвердил корзину; после — `prep.turn.second {amount}`; «Petty cash 90k + from the treasury up to 50k»; потрачено и `remaining` — `matchBudget`.
  - «only what the team may buy is listed; a plus that cannot be pressed says why» — нет «Plague Doctor» у людей (`catalogAccess`); «+» с причиной «Not enough · 15k» при `remaining` 0; на лимите — `pre.limitReached` словами `prep.*`.
  - «the stars: their places, Take and Remove; a mega star takes two» — подпись «Star places: 0 of 2…»; «Take» у доступной; после покупки — «Remove»; «Griff Oberwald» — «Mega Star · 2 places».
  - «not our turn, or the basket confirmed: the counters are locked with why» — `lockedReason` у каждой строки; «Change the purchases» после подтверждения.
  - «the effects appear once a prayer, a Mark of Chaos or Rowdy Rookies is bought, and read back as the form sends them» — `effectsMarkup` с одной молитвой: поле результата, цели; `effectsFromForm` формы с выбором → `{prayers: [{roll, targets, count, skill}], markTarget, rookies}` как 2.x (тот же вход — тот же выход, сравнить с `components/pre-match/effects.mjs`, пока он есть).
  - «the bar is a class, never a style» — `g-prep-budget__bar--<share>`, нет атрибута `style` (`assertCspSafe`).
  - «a desk's column: the budget with the bought lines and its button, the opponent's card» (`DeskPreInducements`).
  - «every key in both dictionaries», `prep.turn.*` по набору; «styled»; «readable»; D2 — степпер и «Take» ≥ 44 до 900px, ≥ 24 от 901px; «no ellipsis».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/match-prep-inducements.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/match-prep.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/prep-inducements.mjs src/screens/matches/prep-effects.mjs src/screens/matches/prep-inducements.css src/screens/matches/prep-model.mjs src/styles.css src/i18n/en.json src/i18n/ru.json test/match-prep-inducements.test.mjs
git commit -m "feat(prep): inducements as the prototype has them — whose turn it is and what is left, help and stars, a plus that says why it cannot, the prayers and effects to record" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Подготовка III — экран: чтение, записи, опрос, своя рамка; 2.x удалён ⚠ ревью сразу

**Files:**
- Create: `src/screens/matches/prep.mjs`, `test/match-prep-screen.test.mjs`
- Modify: `src/core/router.mjs` (:85 `preMatch` → новый `renderPreMatch`; импорт), `src/shell/navigation.mjs` (:30 `BARE_ROUTES` + `"preMatch"`; шапка-комментарий — подготовка в своей рамке), `src/components/pre-match/shared.mjs` (экспорты без импортёров — удалить), `src/styles/pre-match.css` (правила, чьих классов больше нет в `src/**/*.mjs`), оба словаря (ключи `pre.*` без читателя)
- Delete: `src/screens/games/pre-match.mjs`, `src/components/pre-match/steps.mjs`, `catalog.mjs`, `effects.mjs`
- Test: `test/shell-navigation.test.mjs` (bare-маршруты), `test/legacy-screens.test.mjs` (утверждения об удалённых правилах `pre-match.css` — убрать)

**Interfaces:**
- Consumes: `prepModel`, `prepFrameMarkup`, `fansMarkup`, `weatherMarkup`, `rosterMarkup`, `reviewMarkup` (Task 9), `inducementsMarkup`, `budgetCardMarkup`, `effectsMarkup`, `effectsFromForm` (Task 10), `apiRequest`, `errorText`, `invalidateGames`, `onScreenLeave`, `isPhone`, `onPhoneChange`, `patch`, `drawKeepingFocus`, `wireRadioGroups`, `wireSegmentedControls`, `wireResourceCounters`, `MATCH_STEPS` (`rules.mjs`), `preMatchUrl`, `teamUrl`.
- Produces:
  - `renderPreMatch(gameId, requestedStep = "") → Promise<void>` (`prep.mjs`): `/kickoff` → `location.replace(preMatchUrl(gameId, "review"))` (как 2.x); гость — экран входа (маршрут и так в `SIGNED_IN_ROUTES`); `GET /api/games/:id/preparation` → нагрузка, сторона — `viewerSide`; рисует `prepFrameMarkup` формы ширины (`onPhoneChange` → `drawKeepingFocus(view, draw, "h1")`), `h1` получает фокус при первом рисунке.
  - `send(action) → Promise<void>`: одна запись в пути на экран (`ui.busy`; второе нажатие ничего не шлёт); `PATCH …/preparation {revision, side, action}`; ответ — новая нагрузка, `invalidateGames()`; ошибка — `ui.error = errorText(error)`, при 409 (`MATCH_REVISION`, `MATCH_ROSTER_CHANGED`, `MATCH_STARTED`) и при потере ответа (`offline`) — чтение заново; ничего не повторяется само.
  - `start() → Promise<void>`: `POST …/start {revision, side}`; ответ со статусом `in_progress` (и повторный старт, сервер отвечает тем же) → `invalidateGames()` и `location.hash = teamUrl(teamId, "matches")`; потерян — чтение; статус `in_progress` после чтения — туда же.
  - Проводка (`listenerGroup(view)`): грани фанатов (`wireRadioGroups`, `data-prep-fans`) → `fans`; время года (`wireSegmentedControls`, группа `prep-season`) и грани D6 (`data-prep-weather`) → `weather` со всем выбранным; `data-prep-hire` → `add-journeyman`; `data-prep-remove` → `remove-journeyman`; кнопка подвала / колонки (`data-prep-action="lock-roster|reopen|lock-basket|confirm|start"`); категории (`prep-category`) — только `ui.category`, без записи; степперы индьюсментов (`wireResourceCounters`, `onRefused` говорит причину) → `basket {id, quantity: текущее ± 1}`; `data-prep-star` → `basket` 1/0; форма эффектов (`submit`, `change` у `select`) → `effects`; переключатель стороны админа (`prep-side`) — сторона экрана, без записи; `[aria-disabled="true"]` → сообщение с причиной.
  - Опрос: `setInterval` 6000 мс — `GET …/preparation`, когда `!document.hidden`, ничего не в пути, форма эффектов не изменена и не открыт ни один `dialog`; другая ревизия — нагрузка и патч. Уход (`onScreenLeave("pre-match", …)`) — стоп опроса, снятие слушателей.
  - `shellModel` для `preMatch` → `{mode: "bare", tabs: [], side: []}`.

- [ ] **Step 1: Падающие тесты** — `test/match-prep-screen.test.mjs` (fake-api: `GET /api/games/g1/preparation` → нагрузка домена; `PATCH` и `POST /start` → следующие нагрузки):
  - «the preparation draws its own frame and the step asked for, the focus on its title» — `#/games/g1/pre-match/weather` при пройденных фанатах → карточка погоды, `h1` в фокусе.
  - «a die pressed is one write with the revision and the side; the answer is drawn» — грань D3 «2» → `PATCH` с `{revision: 1, side: "home", action: {type: "fans", value: 2}}`; ответ ревизии 2 нарисован; `GET /api/games` после (`invalidateGames`).
  - «a press while a write is on its way sends nothing» (Review Focus 2) — `api.hold("PATCH …")`, две грани подряд → один `PATCH`.
  - «a 409 reads the preparation again and says why; nothing is sent twice» — 409 `MATCH_REVISION` → `GET` ещё раз, `[role="alert"]` со словами `error.MATCH_REVISION`, второй `PATCH` не ушёл.
  - «a lost answer reads the preparation again» — `fail("PATCH …")` → `GET` заново, `PATCH` один.
  - «the weather sends what is chosen: the season and both dice, an empty die as null» — сегмент «Spring» → `{type: "weather", season: "Spring", home: null, away: null}`; затем грань дома «3» → `{season: "Spring", home: 3, away: null}`.
  - «a journeyman added, the roster confirmed, reopened» — `add-journeyman {rowIndex}`, `lock-roster`, `reopen`.
  - «a counter's plus is a basket of one more; a refused plus says why and sends nothing» — «+» Bloodweiser Keg → `{type: "basket", id: "bloodweiser-keg", quantity: 1}`; закрытый «+» → сообщение с причиной, `PATCH` нет.
  - «the start pressed twice is one request; a start answered in_progress leads to the matches» — подтверждения обеих (статус `ready`) → «Start the match» дважды → один `POST /start`; ответ `in_progress` → `location.hash` — `teamUrl(<team>, "matches")`.
  - «a match begun elsewhere makes the preparation read-only» — опрос (`setInterval` подменён) приносит `in_progress` → `prep.started`, кнопок записи нет.
  - «the poll waits while a write is on its way, the tab is hidden, or the effects' form is being filled».
  - «the admin picks a side and writes for it» — `isAdmin: true`, сторона «away» → `PATCH` с `side: "away"`.
  - «leaving stops the poll and the listeners» — `releaseCurrentScreen()` → `setInterval` снят, клик ничего не шлёт.
  - `test/shell-navigation.test.mjs`: «the preparation brings its own frame: no header, no tabs, no SideNav» — `shellModel({route: {name: "preMatch"}, user})` → `mode: "bare"`, пустые `tabs`, `side`.
  - Удаление: `node -e` не нужен — проверка `npm run check` (нет ссылок на удалённое) и `grep -rn "pre-match/steps\|pre-match/catalog\|pre-match/effects\|screens/games/pre-match" src test` → пусто.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/match-prep-screen.test.mjs test/shell-navigation.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; удалить модули 2.x; в `shared.mjs` удалить `actionButton`, `diceField`, `renderSummary`, если их больше никто не импортирует (`grep`); в `pre-match.css` — правила, чьих классов нет ни в одном `src/**/*.mjs` (скрипт: для каждого селектора-класса `grep -rq`), список удалённых — в сообщение коммита; ключи `pre.*` без читателя — скрипт по `src/**/*.mjs` с учётом семейств из шаблонов (`pre.status.`, `pre.step.`, `pre.season.`, `pre.category.`), удалить из обоих словарей. `legacy-screens.test.mjs` — убрать утверждения об удалённых правилах, остальные — как были.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/match-preparation.test.mjs test/legacy-screens.test.mjs test/routes.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/prep.mjs src/core/router.mjs src/shell/navigation.mjs src/components/pre-match/shared.mjs src/styles/pre-match.css src/i18n/en.json src/i18n/ru.json test/match-prep-screen.test.mjs test/shell-navigation.test.mjs test/legacy-screens.test.mjs
git rm src/screens/games/pre-match.mjs src/components/pre-match/steps.mjs src/components/pre-match/catalog.mjs src/components/pre-match/effects.mjs
git commit -m "feat(prep): the 3.0 preparation on its address, in a frame of its own — each press one write on the revision, a 409 or a lost answer read again and never resent, the start once, a match begun read-only; the 2.x preparation is gone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): requesting-code-review по диффу задачи; упор — Review Focus 2, что записи и их тела те же, что у 2.x (сравнить с удалённым `pre-match.mjs`), что опрос не затирает ввод.

---

### Task 12: Без формы быстрого счёта у тренера ⚠ ревью сразу

Мастер-план, «Дополнения → 09a»; спека 3.0 §9.6; план 3.0, этап 9, пункт 4.

**Files:**
- Modify: `src/screens/games/game.mjs` (:18, :42, :55, :72–76), `src/components/games/result-fields.mjs` (`renderGameResultForm`), оба словаря (ключ формы тренера без читателя — удалить)
- Create: `test/game-page.test.mjs`

**Interfaces:**
- Consumes: `renderResultFields` (тот же файл; его берут итоги 2.x — `components/post-match/steps.mjs:1`).
- Produces:
  - `renderAdminResultForm(game) → string` (`result-fields.mjs`) — бывший `renderGameResultForm(game, true)`: форма `data-admin-game-result`, значения — счёт, иначе предложенный, кнопка `games.adminSaveResultAction`. `renderGameResultForm` удаляется (режима тренера больше нет).
  - `game.mjs`: ветка `playerResultForm` и проводка `[data-game-proposal]` (`POST …/propose`) удаляются; подтверждение и отказ счёта соперника, ожидание подтверждения, панели подготовки и итогов 2.x, форма админа — как были. Шапку файла дополнить: «The coach's quick score is gone (spec 3.0 §9.6): a match is played through its preparation and post-match; the admin's manual result stays.»

- [ ] **Step 1: Падающие тесты** — `test/game-page.test.mjs` (fake-api, `#app-view`, `renderGamePage`):
  - «a coach's game page has no score form: nothing to propose a result with» — игра тура без результата, тренер → нет `form[data-game-proposal]`, нет полей `homeTouchdowns`; ни один клик не шлёт `POST /api/games/g1/propose`.
  - «the admin keeps the manual result» — админ → `form[data-admin-game-result]`; `submit` → `PATCH /api/games/g1` с полями формы.
  - «a score the opponent sent is still confirmed or rejected here» — `awaiting_confirmation`, `viewerIsProposer: false` → «Confirm» → `POST /api/games/g1/confirm`.
  - «the preparation panel still leads to the preparation» — ссылка `preMatchUrl(game)`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/game-page.test.mjs` → FAIL (форма тренера есть).
- [ ] **Step 3: Реализовать** по Interfaces; `grep -rn "renderGameResultForm\|data-game-proposal\|requestConfirmationAction" src test` → пусто.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/post-match.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/games/game.mjs src/components/games/result-fields.mjs src/i18n/en.json src/i18n/ru.json test/game-page.test.mjs
git commit -m "feat(games): no quick score for a coach — a match goes through its preparation and post-match; the admin's manual result and the confirmation of a score sent before 3.0 stay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): что у админа и подтверждения ничего не пропало, что сервер не тронут.

---

### Task 13: Mock и smoke

**Files:**
- Create: `scripts/mock/matches.mjs`
- Modify: `scripts/mock-api.mjs` (:556 — список `answerApi`, та же строка: `answerMatches` перед `answerLeague` и `answerPeople`), `scripts/smoke-pre-match.mjs` (один шаг после `verifyStart`)

**Interfaces:**
- Consumes: `createPreparation`, `applyPreparationAction`, `preparationStep` (`src/domain/match/preparation.mjs`), `createMatchSnapshots` (`snapshot.mjs`), `matchReference` (`server/domain/match-reference.mjs`), `errorPayload`; из `scripts/mock-api.mjs` — через параметр `mock` ответчика (как `answerRoster`), без новых экспортов в нём: команды, соперники, игры.
- Produces (`scripts/mock/matches.mjs`; шапка — какие пути и состояния):
  - `answerMatches(request, pathname, mock) → Promise<{status, payload}|null>`:
    - `GET /api/players/:uid/teams/:tid` соперника → `{user, team}` его команды mock: у `rivals[0]` (соперник `g1`) — состав, чей CTV выше, чем у `t1`, двое пропускающих (`absence: {code: "niggling"}` и `{code: "other", note: "Disqualified"}`); у прочих соперников — составы без пропусков; команда тренера — как раньше (`answerPeople`);
    - `GET /api/games/:id/preparation` → нагрузка домена для `g1`, `g2` (`in_progress`, снимки), `g7`; первая — `createPreparation` из команд mock (`viewerSide` — сторона тренера, `fixture` — как сервер);
    - `PATCH /api/games/:id/preparation` → `applyPreparationAction` (409 `MATCH_REVISION` на чужой ревизии; ошибки домена — их коды), `POST /api/games/:id/start` → статус `in_progress`, снимки, `preparationStatus` игры в списке;
    - mock-only `POST /api/mock/prep/:id/:step` — играет действия домена за обе стороны до шага (`fans`, `weather`, `roster`, `inducements`, `review`, `ready`) — для снимков;
    - mock-only `POST /api/mock/before/:case` (`plus` | `minus` | `even`) — состав `rivals[0]` дороже, дешевле или равен `t1` по CTV — для снимков «Перед матчем».
  - `scripts/smoke-pre-match.mjs`: шаг `verifyClosedInMatch()` после `verifyStart()`: тренер хозяев — `PATCH /api/teams/<teams[0]>` (тело — команда, как её отдаёт `GET`, со своей ревизией), `POST …/treasury`, `POST …/players/<id>/death`, `POST …/players/<id>/rolls` → каждый 422 `TEAM_IN_MATCH`; ревизия и казна команды в БД — как были. Строку «Pre-match API smoke passed: …» дополнить «…, and a team in a match keeps its roster, treasury, dead and rolls».
- [ ] **Step 1: Проверка mock руками** — рецепт М; `curl -fsS -H 'Authorization: Bearer mock' http://localhost:5180/api/games/g1/preparation | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).preparation.status))'` → `preparing`; `curl -X POST …/api/mock/prep/g1/inducements` → затем `GET` → `preparationStep` 3; `curl …/api/players/<rival-uid>/teams/<rival-team>` → состав с двумя `skipNextGame`.
- [ ] **Step 2: Smoke** — рецепт С (сервер 3076): `smoke:pre-match` → строка `passed` с новым хвостом; остальные три — `passed`.
- [ ] **Step 3: Проверки** — `wc -l scripts/mock-api.mjs` → 599; полный прогон (рецепт Т) → PASS.
- [ ] **Step 4: Commit**

```bash
git add scripts/mock/matches.mjs scripts/mock-api.mjs scripts/smoke-pre-match.mjs
git commit -m "test(mock): the opponent's team, a preparation played by the domain step by step and started, and the cases of «Before the match»; the pre-match smoke checks a team in a match keeps its roster, treasury, dead and rolls" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Финальное ревью ∥ снимки рядом с прототипами (контроллер)

Две работы **параллельно** (два агента), результаты — в одну волну исправлений (Task 15). Ничего не исправлять в этой задаче.

**A. Финальное ревью ветки** — шаг 7 протокола (skill requesting-code-review), вся ветка от `origin/redesign`; упор: Review Focus, таблица «Как идёт каждая запись», инварианты 07a–07e («Состав» во время матча, R8), D2, слова и переносы, CSP, `escapeHtml`, ловушка `check-references`. Итог — `output/09a/final-review.md` (не коммитится): замечания «Critical / Important / Minor» со ссылками `file:line`.

**B. Снимки** (протокол, шаг 6; требование близости): каждое состояние на 390 и 1440, светлая и одна тёмная палитра, выборочно 768 и 1024; рядом — прототип той же ширины; список отличий. Файлы — `output/screens/rd-09a/` (не коммитятся).

**Files:**
- Create: `docs/redesign/screens/rd-09a.json`

- [ ] **Step 1: Серверы.** `lsof -iTCP:3076 -iTCP:5180 -iTCP:5196 -iTCP:5199 -sTCP:LISTEN || echo free`. Рецепты М и П. Состояния, которые пишут (W1–W3), — последними, по одной ширине; после них mock перезапускается.
- [ ] **Step 2: `rd-09a.json`** — как `docs/redesign/screens/rd-07d.json` (`widths` `[390, 1440]`, те же `heights` и варианты), адреса на `5180`, хранилище `gata-league-auth-token: mock`; подготовка к шагу — `run` с `fetch("/api/mock/prep/<id>/<step>", {method: "POST"})` и перезагрузкой; случай «Перед матчем» — `fetch("/api/mock/before/<case>", {method: "POST"})`.

| id | адрес | действие | ширины | прототип: телефон / десктоп | что проверяет |
|---|---|---|---|---|---|
| M1 | `#/t/t1/matches` | — | + 768, 1024 | `Matches` / `DeskSeason` | следующий матч, плитки, «Результаты», «Дальше в сезоне» / табло, календарь |
| M2 | `#/t/t2/matches` | — | | `MatchesLive` / `DeskSeasonLive` | игра: записи, итоги |
| M3 | `#/t/t3/matches` | — | | `Matches` (`sent`) / `DeskSeason` (`sent`) | отправленный счёт, «Подтвердить счёт» |
| M4 | `#/t/t5/matches` | — | 390 | — | товарищеский на карте |
| M5 | `#/t/t1/matches` | клик по первому квадрату | 1440 | `DeskSeason` (`bandIdx` 0) | прошлый матч, «К текущему матчу →» |
| B1 | `#/t/t1/matches` | `before/plus`, плитка «Индьюсменты» | | `MatchesPrePlus` / `DeskSeasonPrePlus` | «Перед матчем»: нам |
| B2 | то же | `before/minus` | | `MatchesPreMinus` / `DeskSeasonPreMinus` | сопернику |
| B3 | то же | `before/even` | | `MatchesPreEven` / `DeskSeasonPreEven` | CTV равны |
| O1 | `#/t/t1` | — | 1440 | — / `DeskOverview` | табло обзора: TV соперника, пузыри, листание |
| O2 | `#/t/t1` | пузырь | 1440 | — / `DeskOverview` (`preOpen`) | «Перед матчем» с обзора |
| P1 | `#/games/g1/pre-match` | — | | `PreFans` / — (рамка `DeskPreReview`) | фанаты, рамка `bare` |
| P2 | `#/games/g1/pre-match/weather` | `prep/g1/weather` | | `PreWeather` / — | погода |
| P3 | `#/games/g1/pre-match/roster` | `prep/g1/roster` | | `PreRoster` / — | состав, журнеймены |
| P4 | `#/games/g1/pre-match/inducements` | `prep/g1/inducements` | + 768, 1024 | `PreInducements` / `DeskPreInducements` | индьюсменты, «Помощь» |
| P5 | P4 | «Звёзды» | | `PreInducements` (`isStars`) / `DeskPreInducements` | звёзды |
| P6 | `#/games/g1/pre-match/review` | `prep/g1/review` | | `PreReview` / `DeskPreReview` | старт, «Ждём» |
| P7 | `#/games/g2/pre-match/review` | — | 390 | — | матч начат: только чтение |
| R1 | `#/t/t1/matches` | `ru`, `fullPage` | 390 | `Matches` | кириллица |
| R2 | P4 | `ru` | 1440 | `DeskPreInducements` | кириллица |
| W1 | P1 | грань D3 «2» | 390 | `PreFans` | запись, ответ нарисован |
| W2 | `#/games/g1/pre-match/review` | `prep/g1/ready`, «Начать матч» | 390 | `MatchesLive` | старт → «Матчи» в игре |
| W3 | `#/games/g1` | — | 1440 | — | страница игры без формы счёта |
| G1 | `http://localhost:5180/#/t/t1/matches` без токена | — | 390 | — | гость идёт ко входу |

- [ ] **Step 3: Снять** — `npm run screens -- docs/redesign/screens/rd-09a.json --out output/screens/rd-09a` → `… PNG(s) written …, 0 not taken`; ошибки браузера — `errors.json` (ожидаемых нет, кроме 404 соперника, если состояние его требует).
- [ ] **Step 4: Прототипы рядом.** Каждый прототип таблицы (`review: false`, демо-состояние — как в его `dc-import`) — с `http://127.0.0.1:5196/…` той же шириной (390 и 768 — мобильные, 1440 и 1024 — десктопные) в `output/screens/rd-09a/proto/`; `output/screens/rd-09a/compare.html` (виден на `http://127.0.0.1:5199/compare.html`) — для каждого состояния наш снимок и прототип рядом, под ними список отличий.
- [ ] **Step 5: Список отличий** — каждое видимое отличие строкой: «исправить» (поломка исправляется всегда: текст ниже 4.5:1, перенос «пилюли» или короткой подписи кнопки, «…», прячущее данные, горизонтальная прокрутка на 390, цель меньше 44px до 900px или 24px от 901px, шрифт без кириллицы, лишняя ошибка в консоли, неработающее действие, два `h1`) или «оставить» с причиной (данные mock; решения 1–26 и их записанные расхождения; правило кода). Итог — `output/09a/fidelity-diffs.md`.
- [ ] **Step 6: Реальный сервер вручную** (встроенный браузер, 3076; тестовые значения — из `scripts/seed-pre-match-preview.mjs`, база — `gata_smoke_09a`): два тренера — в двух источниках (`http://localhost:3076` — `preview-home`, `http://127.0.0.1:3076` — `preview-away`: сессии в `localStorage` своего источника). «Матчи» хозяев — «Подготовка»; оба проходят фанаты, погоду, состав, индьюсменты (покупатель первым — первым), подтверждают; «Начать матч» хозяевами → «Матчи» в игре, «Записи матча · 0»; «Состав» хозяев — режим матча, «+» TD → запись; в базе: `. output/09a/env.sh && psql "$SMOKE_URL" -Atc "SELECT preparation_status FROM season_pairings p JOIN match_preparations m ON m.pairing_id = p.id"` → `in_progress`; выйти обоими. Что увидено и вывод `psql` — в `output/09a/real-server.txt` для PR.
- [ ] **Step 7: Commit** (только конфиг снимков)

```bash
git add docs/redesign/screens/rd-09a.json
git commit -m "test(screens): stage 09a states beside their prototypes — the matches on both widths, in play and sent, «Before the match» in its three cases, the overview's board, every step of the preparation, the start" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Одна волна исправлений (контроллер)

- [ ] **Step 1: Сводный список** — `output/09a/final-review.md` и `output/09a/fidelity-diffs.md` в один список; Critical и Important ревью и все «исправить» сверки — к исправлению; Minor — исправить, если дешевле, чем объяснить, иначе в PR как известный предел.
- [ ] **Step 2: Исправления** — один исполнитель (или по одному на несвязанные файлы) с этим списком; каждое — коммит `fix(<область>): <что> on <экран>` с трейлером и тестом, где поведение; после — полный прогон (рецепт Т).
- [ ] **Step 3: Пересъёмка** — `npm run screens -- docs/redesign/screens/rd-09a.json --out output/screens/rd-09a --only <ids исправленных>`; `compare.html` обновлён; Critical/Important ревью закрыты — короткая повторная проверка того же ревьюера по диффу волны. Второй волны нет: оставшееся — в PR.

---

### Task 16: Проверки перед PR (контроллер)

- [ ] **Step 1: Шаг 8 протокола**

```bash
npm run build && . output/09a/env.sh && npm test && npm run check && npm run i18n:check
APP_URL=http://localhost:3076 npm run smoke
. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3076 npm run smoke:pre-match
. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3076 npm run smoke:friendly
. output/09a/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3076 npm run smoke:post-match
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
print("outside the stage's spaces:", [k for k in new if not k.startswith(("matches.", "prep.", "ui.board.", "error.TEAM_IN_MATCH", "teamOverview.oppValue"))])
print("removed:", [k for k in old if k not in en])
PY
git diff --stat origin/redesign -- content/ server/db/migrations/   # пусто
git diff --name-only origin/redesign -- server/                    # только файлы Task 1
wc -l src/screens/matches/*.mjs src/screens/matches/*.css src/ui/match-board.* src/screens/team/overview.mjs src/screens/team/roster/save.mjs scripts/mock-api.mjs scripts/mock/matches.mjs src/app.js
```

Expected:
- всё зелёное; одинаковое число страниц EN/RU, 0 fallback; четыре smoke — `passed` (у `smoke:pre-match` — с хвостом о команде в матче);
- `i18n keys unique`; `missing in ru: []`; вне пространств этапа — `[]`; удалённые — только `pre.step.kickoff`, ключи `pre.*` удалённой подготовки 2.x и ключ формы тренера (перечислить в PR);
- `content/` и миграции не менялись; на сервере — `live-match.mjs`, `teams.mjs`, `team-fallen.mjs`, `team-ledger.mjs`, `team-rolls.mjs`, `errors.mjs`;
- каждый файл ≤ 600, `scripts/mock-api.mjs` 599, `src/app.js` ≤ 120.
- [ ] **Step 2: `PR-CHECKLIST.md` целиком** — особенно: миграций нет; новый код ошибки `TEAM_IN_MATCH` — в `API_ERRORS` и обоих словарях (`test/api-errors.test.mjs`); перенесённый экран удалил старое (подготовка 2.x — да; «Мои игры» — нет, `teamChallenges` до 09c; страница игры 2.x — не переносилась); экран совпадает с прототипом — `compare.html`; снимки 390 и 1440, 768 и 1024.

---

### Task 17: Правки спек (контроллер)

PR-CHECKLIST: «Если реализация разошлась со спецификацией — спецификация поправлена в том же PR».

- [ ] **Step 1: Спека 3.0:**
  - §2, таблица «До своего этапа»: `#/t/:teamId/matches` — «Матчи» 3.0 (`screens/matches/index.mjs`, этап 09a): телефон — `Matches.html`, десктоп — «Сезон» без таблицы (этап 10); `#/t/:teamId/challenges` — «Мои игры» 2.x до 09c; `#/games/…` — подготовка 3.0 в своей рамке (09a), страница игры 2.x без формы быстрого счёта у тренера, итоги 2.x до 09b;
  - §3.2 («Сервер `PATCH` во время матча не отклоняет … передано 09a»), §3.3 (гибель и отмена), §3.4 (прокачка и бросок), §7 (пункты «передано 09a» этапов 07b–07d) — «с этапа 09a сервер отказывает 422 `TEAM_IN_MATCH`: `PATCH` тренера, гибель, отмена гибели тренером, казна, бросок на сайте; под блокировкой команды, после ревизии; админ — нет (вопрос 2)»;
  - §4: строки `PATCH /api/teams/:id`, `POST …/death`, `DELETE …/fallen/:fid`, `POST …/treasury`, `POST …/rolls` — «во время матча команды — 422 `TEAM_IN_MATCH`»; список новых кодов — «код этапа 09a: `TEAM_IN_MATCH`»;
  - §6, строка «Матчи: табло, перед матчем, подготовка, идёт игра, итоги»: модули 09a (`index`, `model`, `card`, `lists`, `band`, `before`, `prep`, `prep-model`, `prep-frame`, `prep-steps`, `prep-inducements`, `prep-effects`, CSS; домен — `domain/match/preview.mjs`; данные — `data/match-day.mjs`; `ui/match-board` — листание, чипы, пузыри; `ui/match-card` — `labelledBy`); «Что уходит»: подготовка 2.x (`screens/games/pre-match.mjs`, `components/pre-match/{steps,catalog,effects}.mjs`) — ушла; `my-games.mjs` — с 09c;
  - §7: блок «Расхождения этапа 09a» (прав код) — из списка Task 14 и решений: CTV, а не TV на плитке карты (закрывает известное расхождение 2); плитки и пузыри у товарищеского; «К следующему матчу» не рисуется; «Дальше в сезоне» — одна строка тура и открытые матчи (вопрос 3); десктоп без таблицы (вопрос 1); «Перед матчем» по сохранённым составам, без журнейменов подготовки; равные CTV с надбавкой; «Пропуски:» вместо «Пропускает:», числа без форм; листание только на десктопе; погода — одна на матч, оба ряда D6, время года выбирают тренеры (известное расхождение 1); кубики — сразу записью; рамка подготовки без SideNav; «‹» 44px; подписи точек без «…»; индьюсменты только доступные, без поиска; эффекты — форма без макета; степперы 44px на телефоне; админский переключатель стороны; шаги «Индьюсменты» и «Старт»; переход после старта на «Матчи»; страница игры 2.x;
  - §9.6 — «сделано этапом 09a».
- [ ] **Step 2: Спецификация интерфейса:** §3 — табло десктопа: листание, TV соперника, пузыри, «Перед матчем» (09a); §7 — слова шагов в плашках («Состав», «Индьюсменты», «Старт»); §16–§19 — «Как построено на этапе 09a»; «Известные расхождения»: п. 1 — время года на шаге «Погода» в коде, подпись 3.0 так и говорит; п. 2 — закрыто (карта показывает CTV); п. 9 — листание по турам и «Т» сделаны на десктопе (09a), на телефоне квадраты не ссылки; п. 17 — TV соперника на табло сделан (09a); блок «Расхождения этапа 09a».
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-14-redesign-design.md docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md
git commit -m "docs(spec): stage 09a — the matches, «Before the match», the preparation and the game as built; a team in a match keeps its roster on the server too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: PR и после слияния (контроллер)

- [ ] **Step 1: Ребейз**, если в `redesign` что-то влито с начала этапа: `git fetch origin && git rebase origin/redesign`, конфликты в словарях — объединение, затем Task 16, шаг 1 заново.
- [ ] **Step 2: Тело PR** (`<scratchpad>/pr-rd-09a.md`):
  - пункты 1–4 этапа 9 плана 3.0 и как закрыты; что ушло в 09b и 09c;
  - таблица «Как идёт каждая запись»; что делают 409, потерянный ответ, двойное нажатие и двойной старт; отказ `TEAM_IN_MATCH`;
  - «Решения этого плана» коротко; ответы на вопросы 1–3 (или принятые умолчания); D2 и правила владельца — что сделано;
  - таблица «Маршруты этапа 09a»;
  - вывод Task 16 и ручная проверка реального сервера (`output/09a/real-server.txt`);
  - снимки M1–M5, B1–B3, O1–O2, P1–P7, R1–R2, W1–W3, G1 рядом с прототипами (загрузкой), `compare.html` и список отличий;
  - общие файлы, которые 09a тронул (Global Constraints, «Общие файлы»), и куски в файлах 07e (`panel.mjs:107`; `save.mjs` — если понадобился);
  - известные ограничения: админ во время матча не ограничен; «Перед матчем» — по сохранённым составам; таблица десктопа — этап 10; вызовы — 2.x до 09c; итоги — 2.x до 09b; передачи 07a об `readWithGames` и тапе после ухода — этапу 13; лимит 8 re-roll — этапу 12;
  - правки спек; «Передача дальше»; строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin rd/09a-matches-prep
gh pr create --base redesign --head rd/09a-matches-prep --title "rd/09a: the matches — the current match and the season on both widths, «Before the match» with the preparation's own numbers, the 3.0 preparation in its own frame, the game; no quick score for a coach; a team in a match keeps its roster on the server" --body-file <scratchpad>/pr-rd-09a.md
gh pr merge <номер> --merge
```

После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **Step 3: После слияния** (шаг 10 протокола): в плане 3.0, «Этап 9», пункты 1–4 → `[x]`; в мастер-плане строка `09a` → `[x]`; коммит `docs(plan): stage 09a done` в следующей ветке или прямым коммитом в `redesign`; `git worktree remove ../bb-rd-09a`; база `gata_smoke_09a` — `dropdb`.

---

## Передача следующим этапам

- **09b · итоги.** «Итоги матча» карты, полосы и SideNav ведут на итоги 2.x (`postMatchUrl`); экран итогов 3.0 может взять рамку подготовки (`prep-frame.mjs`: шапка с точками, список шагов, колонки — `PostResult`…`DeskPostReview` той же анатомии) и `bare`-режим оболочки. Остаются за итогами 2.x: `components/games/checklist-layout.mjs`, `components/matchday.mjs`, `components/pre-match/shared.mjs` (`money`, `safe`, `playerCard`), `components/post-match/*`, общие правила `styles/pre-match.css` и `styles/matchday.css` — удалить вместе с ними. `matchRecords` (`domain/match/preview.mjs`) — счёт из записей для шага «Счёт». Завершение итогов: `invalidateGames()` — карта «Матчей» уйдёт из фазы `post` сама.
- **09c · вызовы.** `#/t/:id/challenges` рисует «Мои игры» 2.x (`screens/games/my-games.mjs`); с переносом вызовов — удалить его и `components/games/challenges.mjs` (вид); «Товарищеские матчи» карты, полосы и календаря уже ведут туда. Товарищеский на карте и в «Дальше в сезоне» — тем же `currentMatch`.
- **10 · таблица и соперник.** Таблица `DeskSeason` — слева от «Календаря» на `#/t/:id/matches` десктопа (`matches.css`: колонки `flex: 999 1 640px` и `1 1 320px; max-width: 420px` прототипа) и решение, один ли это экран с `#/season` и куда ведёт SideNav «Сезон» (вопрос 1). Команда соперника уже читается (`readOpponentTeam`, `data/match-day.mjs`) — обзор соперника может взять её же.
- **12 · админка.** Админ во время матча (вопрос 2) — одна строка в `writeSavedTeam`; ручной результат админа — `renderAdminResultForm` (`components/games/result-fields.mjs`) на странице игры 2.x, переносить с экранами сезона; лимит 8 re-roll при `PATCH` (передача 08) — с проверкой дампа.
- **13 · зачистка.** Передачи 07a: `readWithGames` перечитывать при смене матча во время чтения; тап, ответ на который пришёл после ухода, — записи перечитать при следующем входе. Глоссарий: «Перед матчем», «Индьюсменты», «Записи матча», «Журнеймены» (Journeymen — английский). Поля страниц 32px (оболочка 28px). README MatchBoard (листание, пузыри) — пакет удаляется.
- **Любой этап.** `matchPreview`, `BEFORE_GETS`, `matchRecords` (`domain/match/preview.mjs`); `readOpponentTeam`, `readTeamRecords` (`data/match-day.mjs`); `openBeforeSheet`, `closeBeforeSheet`, `beforeFigures` (`screens/matches/before.mjs`); `bandItems`, `bandMarkup`, `bandActions`, `wireBand` (`screens/matches/band.mjs`); `renderMatchBoard({tabs, outcome, scoreResult, chipsHtml, bubbles, toCurrentHtml})`, `wireBoardPager` (`ui/match-board.mjs`); `renderMatchCard({labelledBy})`; `sentScore` (`shell/current-match.mjs`); `refuseWhilePlaying` (`server/season/live-match.mjs`) — для любой новой записи команды.

## Охват

| Пункт | Задача |
|---|---|
| План 3.0, этап 9, п. 1: `#/t/:id/matches` — текущий матч (MatchCard) с одной «Подготовкой к матчу», в игре «Записи матча» и «Итоги матча»; календарь швейцарки | 7, 8 (решения 1–9); 5 (полоса) |
| План 3.0, этап 9, п. 2: перед матчем — шапка с индьюсментами и пропускающими; шаги pre-match в новом виде, логика `src/domain/match/*` не меняется | 2, 4, 5, 6 (решения 10–16); 9, 10, 11 (решения 17–23) |
| План 3.0, этап 9, п. 3: игра — счётчики SPP пишут записи (07a); отмены начала нет | 7 (карта «Идёт игра»), 5 (полоса), 11 (подготовка после старта — только чтение), 1 (сервер держит состав) |
| План 3.0, этап 9, п. 4; мастер-план «Дополнения → 09a»; спека 3.0 §9.6: форма быстрого счёта у тренера удаляется, ручной результат админа остаётся | 12 (решение 24) |
| План 3.0, этап 9, п. 5–6 (`rehearsal:transitions`, итоги по шагам) | 09b (передача) |
| План 3.0, этап 9, п. 7 (вызовы) | 09c (передача; решение 3) |
| Передача 07d: листание табло по турам, TV соперника, пузыри подготовки — полями `renderMatchBoard` | 5, 6, 8 (решения 13–15) |
| Передача 07c: сервер отказывает правке состава во время матча | 1 |
| Передача 07c: тестовый сезон `preview:seed` не читается как подготовка | 1 |
| Передача 07b: отказ сервера для гибели и отмены во время матча | 1 |
| Передача 07a: «Записи матча» ведут в «Состав»; сервер принимает `PATCH` и казну во время матча | 7 (`teamUrl(…, "roster")`), 1 |
| Передача 07a: `readWithGames`, тап после ухода | отложено — этапу 13 (решение 25) |
| Передача 08: `PATCH` и казна во время матча | 1 |
| Передача 08: лимит 8 re-roll | отложено — этапу 12 (решение 26) |
| Передача 06: один чтец предложенного счёта; TV соперника и «Т» среди квадратов | 6 (`sentScore`), 5, 6 |
| Передача 05: экраны матча зовут `invalidateGames()` | 11 (решение 23) |
| Передача 07e: табло обзора в матче берёт те же записи | 0 (шаг 5), 6 |
| Спека 3.0 §3.2–§3.4, §7: «сервер … не отклоняет … передано 09a» | 1, 17 |
| Спека 3.0 §4: «вкладка «Матчи» собирается на клиенте … без новых эндпоинтов» | 3, 7 (решение 9) |
| Спека 3.0 §0.10–§0.11: один путь к матчу; в матче состав закрыт | 11, 12, 1 |
| Спецификация интерфейса §3 (табло), §16, §17, §18, §19 | 5, 6; 7, 8; 2, 4; 9–11; 7 |
| Спецификация интерфейса §7: слова шагов подготовки в плашках | 9 (решение 18) |
| Известные расхождения п. 1, 2, 9, 17 | 9 (погода), 7 (CTV), 5–6, 6; 17 |
| SCREENS.md «Матчи · Табло сезона и календарь» (`Matches`, `DeskSeason`) | 7, 8; M1, M3–M5 |
| SCREENS.md «Матчи · Перед матчем» (`MatchesPre*`, `DeskSeasonPre*`) | 4; B1–B3, O2 |
| SCREENS.md «Матчи · Подготовка к матчу по шагам» (`PreFans`…`PreReview`, `DeskPreInducements`, `DeskPreReview`) | 9–11; P1–P7, W1–W2 |
| SCREENS.md «Матчи · Идёт игра» (`MatchesLive`, `DeskSeasonLive`) | 7, 8; M2 |
| SCREENS.md «Обзор команды» (`DeskOverview`: табло) | 6; O1–O2 |
| Мастер-план 05–13: радиогруппы не перерисовывать `innerHTML`; отказ степпера говорит причину; Sheet — фокус на открывшего | Global Constraints; 9, 10 (`wireRadioGroups`, `onRefused`), 4 (`openBeforeSheet`) |
| Мастер-план 05–13: ключи из шаблонов перебирать | 4, 7, 9, 10 |
| Решение владельца D2 | все задачи экрана (тесты размеров), 14 |
| Близость к прототипам, `compare.html` | 4–11 (значения из прототипов), 14 (B), 15 |
| Правила владельца: нейтральные слова, переносы, табло телефона остаётся, процесс «код, затем проверки» | Global Constraints; тесты 4–10; 6 (телефон без листания); «Процесс», Task 14–18 |
| Протокол: шаги 6–10 | 14, 15, 16, 17, 18 |
| Правила проекта: бюджеты, `check-references`, CSP, `escapeHtml`, 900/901, явная типографика, `content/` не меняется, 2.x удаляется с переносом | Global Constraints; 11 (удаление подготовки 2.x), 16 |

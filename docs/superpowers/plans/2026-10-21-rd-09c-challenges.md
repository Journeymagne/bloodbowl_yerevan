# Этап 09c · Товарищеские вызовы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `#/t/:teamId/challenges` рисует раздел вызовов 3.0 вместо «Моих игр» 2.x — на телефоне `Challenges.html` («Товарищеские · сыграно N», «Бросить вызов», «Входящие» с «Принять…»/«Отклонить», «Исходящие» с «Ждём» и «Отменить вызов», «Принятые» с переходом к матчу, история), на десктопе `DeskChallenges.html`; «Бросить вызов» — шторка (телефон) или окно 760px (десктоп) с поиском по логину и названию команды, «Недавними», списком тренеров, «Вызов отправлен» и выбором своей команды; «Принять…» — шторка выбора своей команды и «Принять и перейти к подготовке»; «Бросить вызов» профиля тренера (этап 10) открывает этот поток с тренером выбранным (`#/t/:id/challenges/:uid`); «Мои игры» 2.x и их вид удалены; лимит товарищеских — по ответу владельца (вопрос 1); всё — так близко к прототипам, как позволяют код и правила владельца.

**Architecture:** экран — `screens/matches/challenges.mjs` (визит, чтения, шторки, записи) над чистой моделью `challenges-model.mjs` (разделы, «Недавние», поиск, «Вызов отправлен», строки «когда») и разметкой `challenges-view.mjs` (страница) и `challenges-sheets.mjs` (шторки вызова и принятия); данные — `data/challenges.mjs` (`GET /api/challenges`, `POST …`, ответ на вызов); фаза и ссылка принятого матча — `currentMatch`/`matchActions` оболочки (как карточка SideNav). Сервер меняется в одном месте (Task 1): список вызовов аддитивно отдаёт команды соперников и расу вызывающей команды — иначе поиск по названию команды не собрать без чтения каждого профиля. Лимит товарищеских (Task 9) — правило контента против кода, по ответу владельца: домен `domain/friendly.mjs`, проверка в транзакциях отправки и принятия. Миграций нет.

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/{fake-dom,fake-api,ui,contrast,api-db,scratch-db}.mjs`; CSS custom properties; нативный `<dialog>` (`ui/sheet.mjs`); `npm run screens`, `scripts/mock-api.mjs`, `scripts/smoke-friendly.mjs`; PostgreSQL 16 (docker `gata-league-postgres`).

**Spec:**
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0 (п. 10 «Товарищеский — только через вызов»; п. 12 — контент против кода — вопрос владельцу), §1 (строка «Товарищеские»: «раздел вызовов, выбор соперника с поиском»), §2 (маршрут `#/t/:teamId/challenges`; таблица «До своего этапа»: «“Мои игры” 2.x … — 09c»), §3.6 («товарищеские вызовы остаются как есть»), §4 (строки API; «Передано» 09a), §6 (строки «Матчи …» — «`my-games.mjs` — с 09c», «Товарищеские вызовы — `screens/matches/challenges.mjs`, `/api/challenges`, уходит `components/games/challenges.mjs`»), §7 п. 5 («выбор соперника: поиск, «Недавние», список, «Уже вызван»»), «Передано» 09a (:802: «этапу 09c — `#/t/:id/challenges`: с переносом удалить `screens/games/my-games.mjs` и вид `components/games/challenges.mjs`») и 10 (:855: «вызов из профиля может открыть соперника выбранным, без `?`-параметров»).
- Спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §0 (общие правила), §16 («Товарищеские матчи» ведёт в раздел вызовов), §21 целиком, §23 («Вызов ведёт в «Мои игры» 2.x … до этапа 09c»), «Известные расхождения» (блок 10, :810).
- Мастер-план `docs/superpowers/plans/2026-10-14-redesign-rollout.md`: Global Constraints, протокол (шаги 1–10; 4 и 7 — в редакции «Процесса» ниже), строка 09c таблицы (зависит от 09b; smoke `smoke:friendly`), «05–13» (отказ степпера, Sheet — фокус на открывшего, радиогруппы без перерисовки `innerHTML`, ключи из шаблонов). Своих строк «Дополнений к этапам» у 09c нет.
- План 3.0 `docs/superpowers/plans/2026-10-14-redesign.md`, «Этап 9»: «Вызовы на товарищеские: отправить (поиск соперника, «Недавние», «Уже вызван»), принять с выбором команды, отклонить, отменить» — этот этап.
- Спека выката `docs/superpowers/specs/2026-10-14-redesign-rollout-design.md`: §3.3 («висящий вызов … вызов принимается» — `rehearsal:transitions` 09b), §6.2 («Вызов висит или принят — можно»): сервер принятия не меняется (лимит Task 9 — только своё новое условие).
- Решения владельца, обязательные: **D2** — от 901px как в прототипе, не меньше 24px; до 900px — 44px; **близость к прототипам** (каждое состояние — свои прототипы, значения из их HTML, `compare.html`); **слова, называющие игрока или тренера, — нейтральные**; **длинные строки переносятся**, «…» — только где за ним не прячутся данные (исключение владельца — имя карточки лидера обзора десктопа, не этого этапа); **деталь прототипа против правила владельца — правило, расхождение записать и спросить**; **правила лиги (`content/Gata/Rules`, EN+RU) решают поведение игры везде — код, который расходится, — ошибка** (вопрос 1); **процесс: «написать код, а потом разом провести проверки»** — Global Constraints. Ответы владельца перед M3 (`/Users/felstell/git/bb-rd-09b/.superpowers/sdd/2026-10-21-rd-09b-post-match/owner-answers-m3.md`) вызовов не касаются.
- Handoff `docs/redesign/handoff-0.9.1/`: `SCREENS.md` (флоу «Матчи · Товарищеские вызовы»: мобайл и десктоп), прототипы `mobile/Challenges.html`, `mobile/ChallengeSend.html` (`demoPick: "thalion"`), `mobile/ChallengeSendSearch.html` (`demoQuery: "raid"`), `mobile/ChallengeAccept.html`, `desktop/DeskChallenges.html` (`demoPick: "thalion"`; окно открыто поверх страницы); `design-system/`, `PR-CHECKLIST.md`. Шаблон — строка `DC.define("…", { tpl: "…" })` (снять `\"`, `\n`, `<\/`), логика — `CFG` и `extraVals` в `factory` (`COACHES`, `rowOf`, `summary`, `cta`): значения в задачах прочитаны оттуда.
- Контент: `content/Gata/Rules/4. Match Procedures.md:9` («Off-season: Friendly matches … provided the team is not currently participating in another event … up to 6 games per month»), `content/Gata/Rules/5. Patch Notes.md:11` («Friendly match limit: 3 per month»); RU — те же строки `Gata-ru` (вопрос 1).
- Передачи: `output/sdd-archive/pr-rd-09a.md` («09c: товарищеские вызовы (`#/t/:id/challenges` пока на `my-games.mjs`)»), `pr-rd-10.md` («09c: «Бросить вызов» пока ведёт в «Мои игры» 2.x»), план 10 «Передача следующим этапам → 09c» (соперник адресом, без `?`-параметров), план 09b «Передача → 09c» (`rehearsal:transitions` принимает висящий вызов — экран этого не меняет).
- Код (проверено на `origin/redesign` `89eafbf`): `src/screens/games/my-games.mjs`, `src/components/games/challenges.mjs`, `src/styles/challenges.css`, `server/routes/challenges.mjs`, `server/friendly/challenges.mjs`, `server/db/migrations/006_friendly_challenges.sql`, `server/api/serializers.mjs` (`publicGame` :229, `publicSavedTeamSlim` :122), `src/core/{router,routes}.mjs`, `src/shell/{navigation,team-switcher,current-match}.mjs`, `src/screens/matches/{index,model,lists,band}.mjs`, `src/screens/coaches/profile.mjs`, `src/data/{coaches,games,teams,team-record}.mjs`, `src/ui/{sheet,search-field,segmented-control,choice,status-chip,button,callout,page-head}.mjs`, `src/components/dialog.mjs` (`patchWithModal`), `scripts/{mock-api,smoke-friendly}.mjs`, `scripts/mock/{season,matches,roster}.mjs`.

## Global Constraints

- Ветка `rd/09c-challenges`, worktree `/Users/felstell/git/bb-rd-09c`, от `origin/redesign` `89eafbf` (09a и 10 влиты). **09b исполняется параллельно и вливается раньше 09c**: Task 0 ребейзит ветку на `redesign` после слияния 09b (или сразу, если 09b уже влит), Task 14 — ещё раз перед PR. PR в `redesign` по протоколу мастер-плана, шаги 6–10; в задачах ничего не пушить. Окружение тестов — `. output/09c/env.sh` (`GATA_TEST_DATABASE_URL` — тесты БД создают свои `gata_test_*`; `SMOKE_URL` → `gata_smoke_09c`). **Файл `output/09c/env.sh` держит пароль локальной БД: только `source`, никогда не `cat`, не печатать, не `grep`.** `gata_league` — никогда.
- **Процесс (владелец, обязательно): «написать код, а потом разом провести проверки».**
  - Задачи 1–9 идут подряд (порядок пачек — «Порядок исполнения»). Исполнитель каждой пишет и запускает свои тесты; ревьюера после задачи нет.
  - Исключение — задачи, которые пишут данные (вызовы и матчи), меняют то, что сервер отдаёт чужим, или правило лиги: после каждой — короткое ревью сразу (skill requesting-code-review, только дифф задачи, с упором на её Review Focus). Помечены «⚠ ревью сразу»: **Task 1, Task 6, Task 9**.
  - Закрывают этап задачи контроллера, по порядку: Task 10 — **параллельно** финальное ревью всей ветки и снимки с `compare.html` против прототипов; Task 11 — **одна** волна исправлений по обоим; Task 12 — проверки (build, test, check, i18n:check, все четыре smoke); Task 13 — правки спек; Task 14 — PR.
- **Серверы этапа:** реальный сервер на порту **3079** над `gata_smoke_09c`; mock API — `MOCK_PORT=5183`; прототипы — статический сервер на **5196**; страница сравнения — **5202**. Никогда общие 3002 и 5173–5176; убивать только свои PID, никогда `pkill -f`.
- **Сервер: миграций нет; правки — только эти** (иная — стоп-условие):
  - Task 1: `listChallenges` (`server/friendly/challenges.mjs:11`) отдаёт ещё `opponents[].teams: [{id, name, baseTeamSlug}]` (все сохранённые команды тренера, новые по `updated_at` первыми) и `challenges[].team.baseTeamSlug` (раса вызывающей команды). Ничего больше о чужих командах — ни состава, ни казны, ни стадии.
  - Task 9 (по ответу владельца на вопрос 1): `createChallenge` и `acceptChallenge` отказывают 422 `FRIENDLY_LIMIT {team, limit}` команде, у которой в этом месяце уже `FRIENDLY_LIMIT` товарищеских; новый код — в `API_ERRORS` и обоих словарях.
- **Параллельный этап 09b и владение файлами.** 09b («Итоги матча») исполняется сейчас в `/Users/felstell/git/bb-rd-09b` (ветка `rd/09b-post-match`, та же база `89eafbf`).
  - **09b владеет:** экраном итогов и его модулями (`src/screens/matches/post*.mjs`, `post*.css`, `prep-frame.mjs`), `src/screens/games/post-match.mjs` и `src/components/post-match/*` (удаляет их), серверным кодом итогов (`server/season/post-match*.mjs`, `server/routes/{post-match,team-rolls}.mjs`, `server/api/dice-rolls.mjs`), `src/domain/post-match/*`, `src/domain/roster/progression.mjs`, `scripts/rehearsal-*`, `scripts/rehearsal/*`, `scripts/mock/post.mjs`, `scripts/smoke-post-match.mjs`, `test/shell-navigation.test.mjs`. **09c эти файлы не правит.**
  - **09c владеет:** `src/screens/matches/challenges*.mjs`, `challenges*.css`, `src/data/challenges.mjs`, `src/domain/friendly.mjs` (новые), `server/friendly/challenges.mjs`, `server/routes/challenges.mjs` (не меняется), `scripts/mock/challenges.mjs` (новый), `scripts/smoke-friendly.mjs`, удаляемые `src/screens/games/my-games.mjs`, `src/components/games/challenges.mjs`, `src/styles/challenges.css`, тесты этих модулей.
  - **Чужие файлы, которые 09c правит минимально** (не 09b): `src/screens/coaches/profile.mjs:108` (`challengeHref`, этап 10, влит — Task 5) и `test/coach-profile.test.mjs` (:113, :121, :151, :170); `src/screens/season/season-links.mjs` (:54, :60 — удаление `pairingTouchdowns`, `pairingCasualties`, если читателей не осталось, Task 7); `src/styles/controls.css:43–44` (селекторы `.challenge-card select, .challenge-dialog select`, Task 7).
  - **Общие файлы и куски 09c в них** (при ребейзе — объединение, затем Task 12 заново):
    - `src/i18n/en.json`, `ru.json` — новые ключи только в `friendly.*` (и `error.FRIENDLY_LIMIT` в Task 9); удаляются ключи 2.x без читателя (Task 7: `challenges.*`, `pre.status.*`, `post.status.*`, часть `games.*` — по скрипту); 09b дописывает `after.*` в конец тех же файлов — объединение;
    - `src/styles.css` — удаление строки `@import url("styles/challenges.css");` (:23; 09b удаляет :25 `post-match.css` — строки не соседние) и две строки `@import` в конце (`screens/matches/challenges.css` — Task 3, `challenges-sheets.css` — Task 4) после строк 09b;
    - `src/core/router.mjs` — импорт :40 (`renderMyGames` → `renderTeamChallenges`) и строка :80 `teamChallenges` (09b правит :44 и не трогает :80);
    - `src/core/routes.mjs` — строка `teamChallenges` в `ID_ROUTES` (:173) и билдер `challengeUrl` (Task 5; 09b файл не трогает);
    - `src/styles/site-matchday.css` — правила `.challenge-*` (:67, `.challenge-card, ` из :68, :69, :94; Task 7); 09b может удалить в этом файле правила своих классов — объединение;
    - `scripts/mock-api.mjs` (559) — импорт `answerChallenges` рядом с `answerSeason` (:104), строка списка `answerApi` (:516: `answerChallenges` перед `answerLeague`; 09b ставит в ту же строку `answerPost` — объединение), `const mock` (:411: `+ pairingOf`), удаление блока `challenge`/`challenges` (:362–:380), строки `/api/challenges` в `answerLeague` (:487) и упоминаний вызовов в шапке (:29–:30, :93) — Task 8.
  - `src/shell/navigation.mjs` не меняется: `teamChallenges` уже горит «Матчи»/«Сезон» (`OWNERS` :52). `src/shell/team-switcher.mjs` не меняется: `teamChallenges` → `challenges` (`SECTIONS` :30) — адрес с тренером при смене команды ведёт на вызовы другой команды без тренера.
- **Файлы на пределе** (`wc -l` на `89eafbf`; Task 0 сверяет после ребейза): `scripts/mock-api.mjs` 559 (Task 8 — только короче), `src/core/routes.mjs` 316, `src/core/router.mjs` 160, `src/screens/coaches/profile.mjs` 215, `server/friendly/challenges.mjs` 86 (Task 9 — не больше 140), `scripts/smoke-friendly.mjs` 140, `test/routes.test.mjs` 355, `test/coach-profile.test.mjs` 327. Новые модули — `src/data/challenges.mjs`, `src/screens/matches/{challenges,challenges-model,challenges-view,challenges-sheets}.mjs`, `src/domain/friendly.mjs`, `scripts/mock/challenges.mjs`; CSS — `src/screens/matches/{challenges,challenges-sheets}.css`; каждый ≤ 600 строк, функция ≤ 80.
- **Размеры (D2) и близость к прототипам.** До 900px нажимаемое — от 44px; от 901px — как в прототипе, но не меньше 24px. Значения прототипов: «Бросить вызов» 48px (15px 700), «Принять…»/«Отклонить»/«Отменить вызов» 40px (телефон — 44), «Подготовка к матчу» 48px, строка тренера в списке от 60px, «Очистить» 36px (телефон — 44), закрыть окна 40px десктоп / 44 телефон, сегменты команды 38px (телефон — 44), чипы «Недавние» десктопа 36px, варианты своей команды 56px, кнопка шторки «Вызвать …» 52px (десктоп — 48), «Принять и перейти к подготовке» 48px. Цвет — только токенами: `--surface` ← `#FFFFFF`, `--surface-2` ← `#F3F6F4`, `--surface-3` ← `#EEF2F0`, `--line` ← `#E6EBE8`, `--line-strong` ← `#DCE3DF` (кольца карточек и строк), `--control-border` ← `#C9D3CE` (кольца кнопок, радио), `--muted` ← `#5F6B65`, `--ink` ← `#14201A`, `--ink-2` ← `#3E4A44`, `--accent` ← `#2F7A52`, `--on-accent` (белый на кнопке), `--accent-tint-soft` ← `#F1F8F4` (выбранная строка), `--warn-tint` ← `#FFF4DE`, `--on-warn-tint` ← `#7A5410`, `--warn` ← `#C99A2E` (точка «Ждём»), `--disabled` ← `#A9B3AE` (закрытая главная кнопка), `--header` ← аватары (`#7B2E2E`, `#2E6E8E`… — у цветов тренеров токенов нет; решение 6), `--scrim` ← `rgba(10,22,16,.5)`; тень выбранного сегмента — `0 1px 2px color-mix(in srgb, var(--ink) 12%, transparent)`; точка нейтрального чипа `#8A948F` — `--muted`. Где токен не держит 4,5:1 (текст) или 3:1 (крупный текст, кольцо) в какой-то палитре — ближайший, что держит (`assertReadable`). Расхождение, которое код не позволяет закрыть, — в §7 спеки (Task 13).
- **Слова (ответ владельца после 07c и этап 10):** строки, которые называют тренера или игрока, — нейтральные в обоих словарях: без «он/его», без прошедшего времени в роде («вызов вчера», а не «вызвал вчера»; «Вызов отправлен», а не «Уже вызван»). Числа — без форм множественного числа: «сыграно 2», «Входящие · 1», «Найдено · 2»; срок — словом или датой («сегодня», «вчера», «19 окт.»), а не «2 дня».
- **Переносы (ответ владельца):** логины, названия команд в строках, «Наша vs Их» принятого, строки соперников в списке, подписи сегментов команды — переносятся; `text-overflow: ellipsis` в новых правилах этапа нет нигде (тесты экрана проверяют). Прототипы режут «…» в списке тренеров, сегментах и строке матча — расхождение (правило владельца).
- Vanilla ES-модули, хешевый роутер; без фреймворка, сборщика, TypeScript и новых зависимостей.
- CSP: ни inline JS, ни `style="…"`, ни `on…=`.
- Каждая строка интерфейса — через `t("key")`; новые ключи — в обоих словарях, только в `friendly.*` (и `error.FRIENDLY_LIMIT`), без дублей. Ключи из шаблонных строк получают тест, перебирающий все значения, в задаче, которая их заводит: `friendly.status.${kind}` по `HISTORY_KINDS` (Task 2).
- `escapeHtml` на каждую интерполяцию; пропс `…Html` — только разметка другой функции `render…()`/`…Markup()`; `href` из данных — через `assertLinkHref` (`src/ui/markup.mjs`).
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 на функцию, 0 недостижимых функций, `src/app.js` ≤ 120 (этап его не трогает). Бюджеты только уменьшаются.
- Ловушка `scripts/check-references.mjs`: ключ объекта, равный экспорту проекта плюс одна буква, в файле, который этот экспорт не импортирует, ломает `npm run check` (`to:`, `td:`, `th:`, `tr:`, `tv:` от `t`; `states:`, `views:`, `icons:`). Ключи этапа проверены по 1459 экспортам на `89eafbf`: `incoming`, `outgoing`, `accepted`, `history`, `recent`, `rows`, `opponents`, `teams`, `team`, `login`, `initial`, `line`, `busy`, `checked`, `closed`, `reason`, `query`, `searching`, `nobody`, `summary`, `cta`, `played`, `when`, `links`, `own`, `other`, `chip`, `failures`, `empty`, `note`, `options`, `chosen`, `title`, `sub`, `kind`, `href`, `gameId`, `limit`, `count` — совпадений нет; TV в объектах — `worth`, никогда `tv`; `views` ключом не делать.
- Брейкпоинты только `max-width: 900px` / `min-width: 901px`. Кольцо фокуса — из `src/ui/base.css`; `--focus-ring` не использовать. Новый CSS задаёт шрифт, рамку, фон, `text-transform`, `letter-spacing` и `font-weight` явно (правила 2.x живут до этапа 13). Новый `.css` — `@import` в конце `src/styles.css`, в порядке задач.
- Радиогруппы (мастер-план 05–13): выбор соперника, своя команда вызова, своя команда принятия — `role="radiogroup"` с `aria-label`, пункты `role="radio"`, `aria-checked`, roving tabindex и `wireRadioGroups` (`src/ui/choice.mjs:45`); занятой пункт — `aria-disabled="true"` (стрелки его пропускают); в `onChange` группа не перерисовывается через `innerHTML` — экран патчит (`patchWithModal`), фокус остаётся на пункте. Шторка — `renderSheet`/`wireSheets` (`src/ui/sheet.mjs`): после закрытия фокус на открывшей кнопке.
- **Перенесённый экран удаляет свой модуль и CSS 2.x в том же PR** (Task 7): `src/screens/games/my-games.mjs`, `src/components/games/challenges.mjs`, `src/styles/challenges.css` и правила `.challenge-*` в `styles/{site-matchday,controls}.css`. Остаются: `screens/games/game.mjs` (страница игры 2.x, этап 13), `components/games/context.mjs` (её берёт `game.mjs`), `components/game-status.mjs` (её берут `season/{admin,schedule}.mjs`).
- `content/` не меняется. Правила — из `src/domain/**` и `content/Gata/**`, вид — из прототипов; расхождение макета с кодом правится по коду без вопроса (§0.1); контент против кода — вопрос владельцу (§0.12): одно такое нашлось (вопрос 1). Если владелец велит поправить контент (6 против 3 в месяц) — EN и RU одним коммитом в Task 9, по `CLAUDE.md` и `docs/i18n-glossary.md`.
- Тесты: сначала `npm run build`; затем `. output/09c/env.sh && npm test`, `npm run check`, `npm run i18n:check`. Каждый PR: одинаковое число страниц EN/RU, 0 fallback; все четыре smoke на сервере 3079.
- Комментарии в коде — по-английски, в тоне соседних файлов; ответы владельцу — по-русски.
- Каждая задача — один коммит с тестами; сообщение коммита заканчивается вторым `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Стоп-условия:** контент и код расходятся в правиле, которое задача должна показать (кроме вопроса 1 — у него своя задача); нужно продуктовое решение вне спек и этого плана; нужна правка сервера сверх списка выше или миграция; файл не помещается в бюджет; падает тест 05–10 не там, где задача его называет; ребейз на 09b сдвинул якорь так, что задача не сходится. Остановиться и спросить контроллера.

## Review Focus

1. **Двойное нажатие, потерянный ответ, ответ соперника между чтением и нажатием.** Ожидание: «Вызвать …», «Принять и перейти к подготовке», «Отклонить», «Отменить вызов» — один запрос; второе нажатие, пока запись в пути, ничего не шлёт; потерянный ответ — список перечитан, запись не повторяется (принятие, которое дошло, ведёт к подготовке его матча по перечитанному списку); соперник отменил вызов, пока шторка принятия открыта, — `CHALLENGE_CLOSED` сказан словами сервера, список перечитан, шторка закрыта. Тесты: Task 6 — «a second press while the challenge is on its way sends nothing», «a lost send is not sent again: the list is read and says what came of it», «an accept whose answer was lost goes to the match the list now names», «a challenge cancelled meanwhile: the accept is refused in the server's words, the list is read again, the sheet closes», «decline and cancel: one request each; the card goes and the focus is on the title».
2. **«Вызов отправлен» — по выбранной своей команде.** Ожидание: занят тот, кому выбранной командой уже отправлен вызов, ждущий ответа; другой своей командой его можно вызвать; смена команды пересчитывает и снимает выбор, ставший занятым; отказ сервера `CHALLENGE_ALREADY_SENT` (вызов с другого устройства) — слова в шторке и чип после перечитывания. Тесты: Task 2 — «a coach already challenged with the chosen team is busy; with another team he is not»; Task 6 — «CHALLENGE_ALREADY_SENT from another device: the sheet says it, the list is read, the coach is busy».
3. **Поиск и длинные слова.** Ожидание: поиск по логину и по названию любой команды тренера, без учёта регистра и для кириллицы, пробелы по краям не в счёт; «Недавние» при поиске скрыты, «Найдено · N»; ничего — «Никого не нашли…»; тренеров нет совсем — то же без поиска; длинный логин и длинные названия переносятся, «…» нет; ввод не теряет фокус и каретку при перерисовке. Тесты: Task 2 — «the search finds a coach by his login or any of his teams, whatever the case», «recent opponents: three at most, the freshest first, games and challenges both, only those who can be challenged; they are not among the others»; Task 4 — «nobody found says so; a long login and long team names wrap»; Task 6 — «typing keeps the focus in the field».
4. **Тренер из адреса и профиль.** Ожидание: `#/t/:id/challenges/:uid` открывает шторку с ним выбранным; занятой — не выбран, виден чип; сам тренер, тренер без команд или чужой id — не выбран, сказано почему; закрытие и отправка возвращают адрес `…/challenges` без перерисовки и без записи в истории; профиль тренера без команд кнопки вызова не рисует; гость — вход и возврат на тот же адрес. Тесты: Task 5 — «the address names a coach to challenge, or none», «a coach with no team has no challenge on his profile»; Task 6 — «a coach named in the address is chosen when the sheet opens; closing it puts the address back without drawing again», «a busy or unknown coach in the address is not chosen; the unknown one is said».
5. **Ширина, шторки и уход.** Ожидание: одна форма на ширину; переход через 900px перерисовывает экран с той же открытой шторкой (шторка снизу ↔ окно 760px), запросом, выбором тренера и команды; фокус остаётся или уходит на `h1`; уход закрывает шторку и снимает слушателей; закрытие шторки возвращает фокус на «Бросить вызов» / «Принять…». Тесты: Task 6 — «crossing 900px keeps the sheet open with the query and the choice», «leaving closes the sheet and stops listening», «closing a sheet gives the focus back to the button that opened it».

## Решения этого плана

Источники оставили их открытыми; план принимает их так (контроллер подтверждает до исполнения).

**Как идёт каждая запись**

| Действие | Запрос | Когда закрыто | Отказ / потерянный ответ |
|---|---|---|---|
| «Вызвать <логин>» (шторка вызова) | `POST /api/challenges {opponentId, teamId}` → 201 `{id}` | соперник не выбран («Выберите соперника»); запись в пути (второе нажатие ничего не шлёт); (Task 9) своя команда на лимите | `CHALLENGE_ALREADY_SENT` 409, `CHALLENGE_OPPONENT_UNAVAILABLE` 404, `TEAM_NOT_FOUND` 404 — слова сервера в шторке (`role="alert"`), список перечитан, шторка открыта; потерян — список перечитан: вызов есть в исходящих — шторка закрыта и сказано «Вызов отправлен: …», нет — `friendly.lost` в шторке; запрос не повторяется |
| «Принять и перейти к подготовке» (шторка принятия) | `POST /api/challenges/:id/accept {teamId}` → `{gameId}` | своя команда не выбрана; запись в пути; (Task 9) команда на лимите | `CHALLENGE_CLOSED` 409 — слова, список перечитан, шторка закрыта; `TEAM_NOT_FOUND` — слова в шторке; потерян — список перечитан: вызов принят — `invalidateGames()` и переход к подготовке его матча, иначе `friendly.lost` |
| «Отклонить» | `POST /api/challenges/:id/decline {}` | запись в пути | слова сервера (`announce`), список перечитан; потерян — перечитан |
| «Отменить вызов» / «Отменить» | `POST /api/challenges/:id/cancel {}` | запись в пути | как выше |

Успех: отправка — список перечитан, шторка закрыта, `announce(t("friendly.sent", {login}))`, фокус на «Бросить вызов»; принятие — `invalidateGames()`, `location.hash = preMatchUrl(gameId)`; отклонение и отмена — список перечитан, фокус на `h1` (карточки больше нет).

**Экран**

1. **`#/t/:teamId/challenges` — экран 3.0** (`renderTeamChallenges`, `screens/matches/challenges.mjs`), одна форма на ширину, как «Матчи» 09a: телефон — `Challenges.html` в оболочке (вкладка «Матчи»), десктоп — `DeskChallenges.html` (SideNav «Сезон»); модель знает ширину (`isPhone`), экран перерисовывается при переходе через 900px (`onPhoneChange`, `drawKeepingFocus(view, draw, "h1")`).
2. **Чьё на странице.** Входящие адресованы тренеру — видны на странице любой его команды; исходящие и принятые — все вызовы тренера, не только команды страницы (команда страницы — по умолчанию в шторках); у исходящего не этой командой в строке — «командой X». «сыграно N» — товарищеские команды страницы с подтверждённым счётом (`gameOutcome`).
3. **Порядок блоков** (`Challenges.html`): заголовок «Товарищеские» (Oswald 700 24, `h1` страницы, `renderPageHead({phone: true})`) и справа «сыграно 2», подпись «Товарищеский матч не влияет на таблицу…», «Бросить вызов» (48px), «Входящие · 1», «Исходящие · 1», «Принятые», ниже — «История вызовов · N» (вопрос 2). Раздел без строк не рисуется; нет ничего — `friendly.none`. Десктоп (`DeskChallenges.html`): полоса «Товарищеские» с «Вне таблицы · SPP, травмы и казна считаются» и **«Бросить вызов» справа в полосе** (в прототипе окно уже открыто, кнопки не видно — расхождение: иначе окна не открыть), сетка `repeat(auto-fit, minmax(320px, 1fr))` с карточками «Входящие»/«Исходящие», «Принятые» во всю ширину, «История» — карточкой ниже.
4. **Строки карточек.** Входящий: телефон — «Grimtusk Raiders · Orc · вызов вчера», десктоп — «Grimtusk Raiders · вчера» (как прототипы), кнопки «Принять…» и «Отклонить». Исходящий: команды соперника, «ждёт ответа · вчера» (и «командой X» — решение 2), чип «Ждём» (`renderStatusChip({tone: "wait"})`), «Отменить вызов» (телефон) / «Отменить» (десктоп). Принятый: чип `matches.offTable` «Товарищеский · вне таблицы», «принят сегодня», «Наша vs Их» (переносится; в прототипе «…»), ссылки фазы матча — `matchActions(currentMatch([game], ownTeamId), ownTeamId).links` (не начат и подготовка — «Подготовка к матчу» 48px; идёт и итоги — «Итоги матча» и «Записи матча»; счёт отправлен — «Подтвердить счёт» или строка `sentLine`). «Когда» — «сегодня» / «вчера» / `formatDay` («19 окт.») по часам читателя: «2 дня» — форма множественного числа, «вызвал» — прошедшее в роде.
5. **«Принятые» и история.** Принятый — вызов `accepted`, чей матч есть в играх тренера и ещё открыт (`currentMatch([game], ownTeamId)` не `null`). Сыгранные, отклонённые, отменённые — в «Истории вызовов» (вопрос 2): до 8, свежие первыми (`updatedAt`), строка «rival · Rival Team · отклонён · вчера»; у сыгранного — ссылка на матч (`gameUrl`). История свёрнута: кнопка «История вызовов · N» с `aria-expanded`, раскрытие — состояние экрана.
6. **Аватар** — буква логина (`Array.from(login.trim())[0]?.toUpperCase()`) в круге `--header`, 44px в карточках, 36px в строках списка, 28px в чипах «Недавних»: цвета тренеров макета токенов не имеют (как круг профиля тренера, решение 24 этапа 10).
7. **Чтения.** Вызовы (`readChallenges`) и игры (`loadGames(true)`) — при входе, когда вкладка снова видна, после каждой своей записи (игры — после принятия). Таймера нет (2.x опрашивал каждые 6 с; как решение 9 этапа 09a: ответ соперника виден при следующем входе или возвращении на вкладку). Пока вызовы не прочитаны — `friendly.loading`; отказ — плашка `friendly.unread {reason}` с «Обновить» (`common.refresh`), кнопка «Бросить вызов» закрыта; отказ игр — плашка `teamOverview.gamesFailed`, «Принятые» и «сыграно» не рисуются.

**Шторка вызова**

8. **Одна шторка на обе ширины** (`renderSheet({id: "friendly-send", className: "g-challenge-send"})`): телефон — снизу, 92% высоты, заголовок «Кого вызываем» (`ChallengeSend`); десктоп — окно 760px «Вызов на товарищеский» с подзаголовком «Вне таблицы лиги · SPP, травмы и казна считаются» (`DeskChallenges`). Подвал телефона — «Вызываем командой», сводка, кнопка 52px; десктоп — команды в теле, в подвале сводка, «Отмена» (закрывает) и «Вызвать …» 48px.
9. **Поиск** — `renderSearchField` (`friendly-search`) и своя кнопка «Очистить», пока есть запрос; по логину и по названию любой команды тренера, по подстроке, без учёта регистра (`toLocaleLowerCase`), запрос без пробелов по краям (как `factory` прототипа). При поиске «Недавние» скрыты, подпись — «Найдено · N»; ничего — «Никого не нашли. Вызвать можно тренера, у которого есть хотя бы одна команда.»; без запроса — «Остальные тренеры · N».
10. **«Недавние соперники»** — до трёх тренеров из своих игр (любых: лиговых и товарищеских, по `updatedAt`) и вызовов (обоих направлений, по `createdAt`), свежие первыми, только те, кто есть в `opponents`; в «Остальных» их нет (как прототип). Телефон — строки в **одной** радиогруппе с «Остальными» (две подписи внутри, стрелки идут через обе — как MVP 09b); десктоп — чипы `aria-pressed` «Недавние:» над списком (как прототип), список — радиогруппа в две колонки высотой до 300px с прокруткой.
11. **«Вызов отправлен»** (в прототипе и спеке «Уже вызван», `CHALLENGE_ALREADY_SENT`): тренер, которому выбранной своей командой отправлен вызов, ждущий ответа, — строка с чипом, `aria-disabled="true"`, не выбирается; смена своей команды пересчитывает; выбранный, ставший занятым, снимается. Слово — нейтральное (правило владельца; «вызван» — причастие в роде), расхождение записать.
12. **«Вызываем командой»** — своя радиогруппа в виде сегментов (сетка в две колонки, подписи переносятся): `renderSegmentedControl` держит только 2–3 сегмента, а команд у тренера до четырёх («A single coach may register up to 4 teams», контент). Одна команда — строкой «Вызываем командой X» без группы. По умолчанию — команда страницы. Сводка — слова прототипа: «rival выберет свою команду, когда примет вызов. Вы играете: Mock Team.» / «Соперник выберет свою команду, когда примет вызов.». Кнопка — «Вызвать rival» / «Выберите соперника» (закрыта).
13. **Тренер из адреса** (решение 19): шторка вызова открыта сразу после чтения, тренер выбран и прокручен в видимое (`scrollIntoView({block: "nearest"})`); занятой выбранной командой — не выбран (чип виден); не из `opponents` (сам тренер, без команд, неизвестный id) — не выбран, в шторке `friendly.unknownCoach`. Закрытие и отправка возвращают адрес `teamUrl(teamId, "challenges")` через `history.replaceState` (без перерисовки и записи в истории; как `screens/season/index.mjs:149`).

**Шторка принятия**

14. **`ChallengeAccept`** (`renderSheet({id: "friendly-accept", className: "g-challenge-accept"})`); на десктопе — то же в окне 480px (своего прототипа нет). Карточка вызывающего (фон `--surface-2`): буква, «orc_boss · Grimtusk Raiders», «Orc · TV 1 050k · Telegram @orc_boss» — TV и Telegram из публичной команды (`readCoachTeam(sender.id, team.id)`, `teamValue`), читается при открытии шторки; пока читается или не прочиталась — строка без них. «Какой командой играете» — все свои команды (в том числе не заявленные в сезон), вариант 56px: имя и «Люди · TV 1 120k · в сезоне» (`raceTitleOf`, `teamValue`, `inActiveSeason`); по умолчанию — команда страницы. Подпись «Сыграть можно любой своей командой, в том числе той, что не заявлена в сезон.» «Принять и перейти к подготовке» → `preMatchUrl(gameId)` (прототип ведёт на `PreFans`; 2.x вёл на страницу игры).
15. **«Отклонить» и «Отменить вызов» — без подтверждения**: прототипы рисуют их прямыми кнопками, новый вызов возвращает отменённое, 2.x делал так же.

**Сервер, адрес, удаление, mock**

16. **`GET /api/challenges` аддитивно** (Task 1): `opponents[].teams` и `challenges[].team.baseTeamSlug`. Без них поиск по названию команды и строки «Grimtusk Raiders · Iron Teeth» не собрать иначе как чтением профиля каждого тренера. Ответ по-прежнему несёт `teams` тренера (клиент 3.0 берёт `state.myTeams`).
17. **Лимит товарищеских** — вопрос владельцу 1, Task 9.
18. **Удаление 2.x** (Task 7) — список Global Constraints; ключи без читателей — скриптом.
19. **Адрес с тренером** — `#/t/:teamId/challenges/:userId`: тот же маршрут `teamChallenges` с необязательным `userId` (как `step` у `preMatch`), билдер `challengeUrl(team, user)`; `TEAM_SECTIONS` и `teamUrl` не меняются; профиль тренера ведёт туда (`challengeHref`), у тренера без команд (`teams.length === 0`) кнопки нет (сервер ответил бы `CHALLENGE_OPPONENT_UNAVAILABLE`).
20. **Mock** (Task 8) — вызовы в своём модуле `scripts/mock/challenges.mjs`, со своими состояниями и записями, тренеры лиги mock (`rival` u2, `narek` u3, `lilit` u4 — как `scripts/mock/season.mjs`) и ещё девять тренеров прототипа, чтобы список был длинным, как в `ChallengeSend`.

## Вопросы владельцу

1. **Лимит товарищеских — контент против кода (§0.12).** Контент: «Off-season: Friendly matches … provided the team is not currently participating in another event … You may register up to 6 games per month» (`4. Match Procedures.md:9`) и «Friendly match limit: 3 per month» (`5. Patch Notes.md:11`, сезон 2); RU — те же строки. Код (2.x и 3.0) лимита не знает; спецификация интерфейса §21: «Лимита по числу вызовов нет» (о вызовах, не о матчах); прототип принятия предлагает команду «в сезоне». *По умолчанию (Task 9):* правило контента по последней правке — **3 товарищеских матча в календарный месяц (по Еревану) на команду**; матч — принятый вызов (пара создаётся при принятии); вызовы без лимита; отправка закрыта своей команде на лимите, принятие — если на лимите любая из двух команд (`FRIENDLY_LIMIT`). Оговорка «команда не участвует в другом мероприятии» — **не ограничивает** команды сезона (так рисует прототип и работает код; «другое мероприятие» — турнир, которых в коде нет). Нужен ответ: 3 или 6; на команду или на тренера; запрещены ли товарищеские командам в сезоне; если 6 в «Match Procedures» устарело — поправить контент EN+RU.
2. **История вызовов.** 2.x показывал последние 8 ответов («Recent responses»); прототипы и §21 знают только входящие, исходящие и принятые. *По умолчанию:* «История вызовов · N» — свёрнутой кнопкой внизу: отклонённые, отменённые и сыгранные, до 8, у сыгранного — ссылка на матч. Альтернатива — не рисовать (сыгранные товарищеские и так в «Результатах» «Матчей»).

## Файлы

| Файл | Задача | Что |
|---|---|---|
| — (база, ребейз на 09b, якоря, базовый прогон) | 0 | контроллер |
| `server/friendly/challenges.mjs`, `scripts/smoke-friendly.mjs`, `test/challenges-api.test.mjs` (новый) | 1 ⚠ | команды соперников и раса вызывающей команды в списке |
| `src/data/challenges.mjs`, `src/screens/matches/challenges-model.mjs` (новые), оба словаря, `test/challenges-model.test.mjs` (новый) | 2 | чтения и записи; модель страницы и шторок |
| `src/screens/matches/challenges-view.mjs`, `challenges.css` (новые), `src/styles.css`, оба словаря, `test/challenges-view.test.mjs` (новый) | 3 | страница: телефон и десктоп |
| `src/screens/matches/challenges-sheets.mjs`, `challenges-sheets.css` (новые), `src/styles.css`, оба словаря, `test/challenges-sheets.test.mjs` (новый) | 4 | шторки вызова и принятия |
| `src/core/routes.mjs`, `src/screens/coaches/profile.mjs`, `test/routes.test.mjs`, `test/coach-profile.test.mjs` | 5 | адрес с тренером, вызов из профиля |
| `src/screens/matches/challenges.mjs` (новый), `src/core/router.mjs`, оба словаря, `test/challenges-screen.test.mjs` (новый) | 6 ⚠ | экран: чтения, шторки, записи |
| удалить `src/screens/games/my-games.mjs`, `src/components/games/challenges.mjs`, `src/styles/challenges.css`; `src/styles.css`, `src/styles/{site-matchday,controls}.css`, `src/screens/season/season-links.mjs`, оба словаря | 7 | «Мои игры» 2.x удалены |
| `scripts/mock/challenges.mjs` (новый), `scripts/mock-api.mjs`, `test/mock-challenges.test.mjs` (новый) | 8 | mock вызовов |
| `src/domain/friendly.mjs` (новый), `server/friendly/challenges.mjs`, `server/http/errors.mjs`, `src/screens/matches/challenges-model.mjs`, `scripts/mock/challenges.mjs`, оба словаря, `test/friendly-limit.test.mjs` (новый), `test/challenges-api.test.mjs`, `test/challenges-model.test.mjs`, `test/mock-challenges.test.mjs` | 9 ⚠ | лимит товарищеских (вопрос 1) |
| `docs/redesign/screens/rd-09c.json` | 10 | снимки рядом с прототипами (контроллер) |
| спеки, план 3.0, мастер-план | 11–14 | исправления, проверки, правки спек, PR (контроллер) |

## Маршруты этапа 09c

| Имя | Адрес | До 09c | После 09c |
|---|---|---|---|
| `teamChallenges` | `#/t/:teamId/challenges` | «Мои игры» 2.x (`renderMyGames`) | вызовы 3.0 (`renderTeamChallenges`): `Challenges` / `DeskChallenges` |
| `teamChallenges` | `#/t/:teamId/challenges/:userId` | — (страница содержимого) | то же, шторка вызова открыта с этим тренером |
| `coach` | `#/coaches/:uid` | «Бросить вызов» → `#/t/<активная>/challenges` | → `#/t/<активная>/challenges/:uid`; у тренера без команд кнопки нет |

## Рецепты проверки

Команды — из `/Users/felstell/git/bb-rd-09c`; каждый вызов Bash — новая оболочка, переменные — из `output/09c/env.sh` (только `source`).

**Т — тесты:** `npm run build && node --test <файлы>`; с базой — `npm run build && . output/09c/env.sh && node --test <файлы>`; полный прогон — `npm run build && . output/09c/env.sh && npm test && npm run check && npm run i18n:check`.

**С — сервер 3079 и smoke** (Task 1, 9, 10, 12):

```bash
. output/09c/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_09c 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3079 node server/server.mjs`; дождаться `curl -fsS http://localhost:3079/api/health` (Monitor с until-циклом). Затем:

```bash
APP_URL=http://localhost:3079 npm run smoke
. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3079 npm run smoke:friendly
. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3079 npm run smoke:pre-match
. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3079 npm run smoke:post-match
```

Expected: каждый печатает свою строку `… passed …`. Сервер после — остановить.

**М — mock 5183** (Task 8, 10): `npm run build`, затем в фоне `MOCK_PORT=5183 node scripts/mock-api.mjs`; дождаться `curl -fsS http://localhost:5183/api/health`. Mock держит вызовы в памяти: после состояний, которые пишут, — перезапуск.

**П — прототипы 5196 и сравнение 5202** (Task 10): в фоне `python3 -m http.server 5196 --bind 127.0.0.1 --directory docs/redesign/handoff-0.9.1/prototypes` (если 5196 уже занят статическим сервером прототипов — взять его) и `python3 -m http.server 5202 --bind 127.0.0.1 --directory output/screens/rd-09c`.

## Порядок исполнения

«Параллель по максимуму» (владелец): Task 1 ⚠ (сервер) и пачка Task 2–5 (клиент; файлы не пересекаются, кроме словарей — одна пачка у одного исполнителя) идут одновременно; короткое ревью Task 1 — параллельно пачке. Затем Task 6 ⚠ (+ ревью сразу ∥ Task 7 и 8 одной пачкой). Task 9 ⚠ — после ответа владельца на вопрос 1 (или по умолчанию, если контроллер так решит до её начала), затем Task 10.

---

### Task 0: База — ребейз на 09b, якоря, базовый прогон (контроллер)

Коммита нет, кроме случая шага 3.

- [ ] **Step 1: База.** `git fetch origin && git log --oneline -3 origin/redesign`. 09b влит (`git log origin/redesign --oneline | grep -i "rd/09b"`) — `git rebase origin/redesign` (в ветке только коммит плана), `git diff --stat 89eafbf origin/redesign`; в списке `package-lock.json` — `npm ci`. Не влит — начать на `89eafbf`; шаги 1–3 повторить, как только 09b влит (до Task 10), и в Task 14.
- [ ] **Step 2: Якоря плана.** Для каждой строки — `grep -n` имени.

| Файл | Якорь на `89eafbf` | Кто мог сдвинуть |
|---|---|---|
| `src/core/router.mjs` (160) | импорт `renderMyGames` :40, `teamChallenges` :80 | 09b (:44, :87) |
| `src/core/routes.mjs` (316) | `TEAM_ROUTES` :25, `TEAM_SECTIONS` :28, `teamUrl` :47, `preMatchUrl` :97, `ID_ROUTES` `teamChallenges` :173 | — |
| `src/styles.css` (98) | `@import url("styles/challenges.css");` :23; последний `@import` | 09b (:25 и конец) |
| `src/styles/site-matchday.css` (95) | `.challenge-panel` :67, `.challenge-card, .pre-team-panel` :68, `.challenge-card h3` :69, `.challenge-panel` :94 | 09b (правила без читателей) |
| `src/styles/controls.css` (73) | `.challenge-card select, .challenge-dialog select {` :44 | — |
| `src/screens/season/season-links.mjs` (64) | `pairingTouchdowns` :54, `pairingCasualties` :60 | — |
| `src/screens/coaches/profile.mjs` (215) | `coachModel` :92, `challengeHref` :108 | — |
| `src/shell/current-match.mjs` (217) | `currentMatch` :90, `matchActions` :163 | 09b |
| `server/friendly/challenges.mjs` (86) | `listChallenges` :11, `ownedTeam` :26, `createChallenge` :32, `respondToChallenge` :58, `acceptChallenge` :75 | — |
| `scripts/mock-api.mjs` (559) | импорт `answerSeason` :104, блок вызовов :362–:380, `const mock` :411, `/api/challenges` в `answerLeague` :487, список `answerApi` :516 | 09b (`answerPost` в :516) |
| `src/data/teams.mjs` | `raceTeamOf` :24, `raceTitleOf` :29, `unanswered` :128 | — |
| `src/data/team-record.mjs` | `gameSides` :31, `gameOutcome` :47, `teamValue` :204 | — |
| `src/data/coaches.mjs` | `readCoachTeam` :26 | — |

- [ ] **Step 3:** число строки, имя или сигнатура разошлись — поправить план отдельным коммитом `docs(plan): stage 09c — anchors after 09b` (с трейлером). 09b тронул файл из «09c владеет» или `scripts/mock-api.mjs` стал длиннее 590 — стоп, вопрос координатору.
- [ ] **Step 4: Базовый прогон** — рецепт Т, полный: всё зелёное, одинаковое число страниц EN/RU, 0 fallback. Красная база — стоп.

---

### Task 1: Сервер — команды соперников и раса вызывающей команды в списке вызовов ⚠ ревью сразу

**Files:**
- Modify: `server/friendly/challenges.mjs` (`listChallenges` :11–:24), `scripts/smoke-friendly.mjs` (`verifyChallenges` :47, итоговая строка :124)
- Create: `test/challenges-api.test.mjs`

**Interfaces:**
- Consumes: `pool`; помощники тестов `withApiDatabase`, `callApi`, `sessionFor`, `seedCoach`, `seedTeam(client, owner, {name, slug})` (`test/helpers/api-db.mjs`), `scratchSkip` (`test/helpers/scratch-db.mjs`).
- Produces (`GET /api/challenges`, ответ `{challenges, teams, opponents}`, всё прежнее на месте):
  - `challenges[].team` — `{id, name, baseTeamSlug}`: `baseTeamSlug` — `saved_teams.base_team_slug` вызывающей команды (`t.base_team_slug AS sender_team_slug` в том же запросе).
  - `opponents[]` — `{id, login, teams: {id, name, baseTeamSlug}[]}`: каждый другой тренер хотя бы с одной командой (как было), по `login_key`; `teams` — все его сохранённые команды, по `updated_at DESC, id` (как `/api/teams`); одним запросом (`json_agg(json_build_object(...) ORDER BY t.updated_at DESC, t.id)` с `GROUP BY u.id`).

- [ ] **Step 1: Падающие тесты** — `test/challenges-api.test.mjs` (`{ skip: scratchSkip }`, как `test/players-api.test.mjs`):

```js
test("the list names every other coach with a team, each of his teams newest first, and nothing else of them", db, () => withApiDatabase(async ({ client }) => {
  const lion = await seedCoach(client, "lion"), wolf = await seedCoach(client, "wolf"), bear = await seedCoach(client, "bear");
  await seedTeam(client, lion.id, { name: "Lions" });
  const old = await seedTeam(client, wolf.id, { name: "Wolves", slug: "teams/orc" });
  const pack = await seedTeam(client, wolf.id, { name: "Pack", slug: "teams/skaven" });
  await client.query("UPDATE saved_teams SET updated_at = now() - interval '1 day' WHERE id = $1", [old]);
  const answer = await callApi("GET", "/api/challenges", { token: await sessionFor(client, lion.id) });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.opponents, [{ id: wolf.id, login: "wolf", teams: [
    { id: pack, name: "Pack", baseTeamSlug: "teams/skaven" }, { id: old, name: "Wolves", baseTeamSlug: "teams/orc" }] }]);
  assert.ok(!answer.body.opponents.some(({ id }) => id === bear.id || id === lion.id), "a coach without a team and oneself are not offered");
}));
```

  Ещё тест: «a challenge names the challenging team's race» — `wolf` вызывает `lion` командой `Pack` (`POST /api/challenges {opponentId, teamId}` с сессией `wolf` → 201); `GET` у `lion` → `challenges[0].team` `{id: pack, name: "Pack", baseTeamSlug: "teams/skaven"}`; у `wolf` — тот же вызов с той же командой.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && . output/09c/env.sh && node --test test/challenges-api.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `listChallenges` (JSDoc): «Each coach who can be challenged comes with his teams' names and races (stage 09c: the challenge sheet finds a coach by any of his teams); nothing else of them.» Smoke: в `verifyChallenges` после `const id = await invite()` — у `home` в `opponents` есть `away` с командой `teams.away` и непустым `baseTeamSlug`; у вызова `id` — `team.baseTeamSlug` равен `base_team_slug` исходной команды хозяев; итоговая строка — «… opponents with their teams and the challenging team's race, …».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; рецепт С: `smoke:friendly` → `passed` с новой строкой; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add server/friendly/challenges.mjs scripts/smoke-friendly.mjs test/challenges-api.test.mjs
git commit -m "feat(server): the list of challenges names each coach's teams and the challenging team's race — the challenge sheet finds a coach by any of his teams; nothing else of another coach's team is sent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): requesting-code-review по диффу задачи; упор — что видит чужой тренер (только id, имя, раса команды), порядок и один запрос, что прежние поля ответа не изменились (2.x-клиент и `rehearsal:transitions` 09b читают их).

---

### Task 2: Данные и модель вызовов

**Files:**
- Create: `src/data/challenges.mjs`, `src/screens/matches/challenges-model.mjs`, `test/challenges-model.test.mjs`
- Modify: оба словаря

**Interfaces:**
- Consumes: `apiRequest` (`core/api-client.mjs`), `refusalText` (`core/api.mjs`), `unanswered` (`data/teams.mjs:128`: нет ответа — offline, timeout, 5xx), `raceTitleOf`, `raceTeamOf` (`data/teams.mjs`), `gameSides`, `gameOutcome`, `teamValue` (`data/team-record.mjs`), `currentMatch`, `matchActions` (`shell/current-match.mjs`), `formatDay`, `formatMoney` (`core/format.mjs`), `gameUrl` (`core/routes.mjs`), `t`.
- Produces:
  - `src/data/challenges.mjs` (шапка — что читает и пишет, что значит `lost`):
    - `readChallenges() → Promise<{challenges: object[], opponents: object[]}|{error: string, code: string}>` — `GET /api/challenges`; ответ без массивов `challenges`/`opponents` — `{error: t("request.noAnswer"), code: ""}`.
    - `sendChallenge({ opponentId, teamId }) → Promise<{id: string}|{error: string, code: string, lost: boolean}>` — `POST /api/challenges`.
    - `answerChallenge(id, action, teamId = "") → Promise<{gameId: string|null}|{error, code, lost}>` — `POST /api/challenges/:id/<accept|decline|cancel>`, тело `{teamId}` только у `accept`, иначе `{}`; `action` вне трёх — `throw`.
    - Отказ — `{error: refusalText(e), code: e.code ?? "", lost: unanswered(e)}`.
  - `src/screens/matches/challenges-model.mjs` (без DOM; шапка — решения 2–5, 9–14):
    - `HISTORY_KINDS = ["declined", "cancelled", "played"]`.
    - `dayWord(moment, now) → string` — `friendly.today` / `friendly.yesterday` по календарным дням читателя (`new Date(...).toDateString()` сравнение с `now` и `now − 1 день`), иначе `formatDay(moment)`; не дата — `formatDay` (тире).
    - `coachInitial(login) → string` — `Array.from(String(login ?? "").trim())[0]?.toUpperCase() ?? "?"`.
    - `teamsLine(opponent) → string` — названия его команд через « · »; у тренера без `teams` (ответ сервера до Task 1, mock 2.x) — `""`; у вызова без `team.baseTeamSlug` раса не пишется.
    - `matchOpponents(opponents, query) → object[]` — по подстроке логина или названия любой команды, `toLocaleLowerCase()`, запрос `trim()`; пустой — все.
    - `recentOpponents({ games, challenges, opponents, viewerId, limit = 3 }) → string[]` — id тренеров (решение 10).
    - `busyRecipients(challenges, viewerId, teamId) → Set<string>` — `recipient.id` вызовов `pending`, где `sender.id === viewerId` и `team.id === teamId`.
    - `friendliesPlayed(games, teamId) → number` — товарищеские с `gameOutcome(game, teamId)`.
    - `challengesModel({ payload, readError, games, gamesError, teamId, viewerId, teams, now, phone }) → PageModel`:
      `{teamId, phone, read: boolean, played: string, failures: string[], incoming: {id, login, initial, line}[], outgoing: {id, login, initial, line}[], accepted: {id, gameId, own, other, when, links: {label, href, kind}[], sentLine: string}[], history: {id, line, href}[], empty: boolean}` — `payload` — ответ `readChallenges` или `null`; `games` — `null`, пока игры не прочитаны; строки — решение 4, части через « · »: входящий — `[team.name, раса (только телефон), friendly.challengedWhen]` (десктоп — `[team.name, dayWord]`), исходящий — `[teamsLine(соперник), friendly.withTeam (только не командой страницы; имя из `teams`), friendly.waitingWhen]`; новые сверху (`createdAt`); принятые и история — решение 5; `played` — `t("friendly.played", {count})` или `""` без игр; `failures` — `friendly.unread {reason}`, `teamOverview.gamesFailed {reason}`; `empty` — прочитано и нет ни одного раздела.
    - `sendModel({ payload, games, teams, teamId, viewerId, query, chosenId, teamChoice, presetId }) → SendModel`:
      `{query, searching, recent: Row[], rows: Row[], listLabel, nobody: boolean, single: string, teams: {id, name, checked, closed, reason}[], teamId: string, chosen: Row|null, note: string, summary: string, cta: {label: string, disabled: boolean}}`, `Row = {id, login, initial, line, busy: boolean, checked: boolean}` — `teamChoice` по умолчанию `teamId` страницы; `single` — `friendly.oneTeam {team}` при одной команде, иначе `""`; `teams` — при двух и больше (`closed: false, reason: ""` до Task 9); `chosenId`, ставший `busy`, — не выбран; `presetId` не из `opponents` — `note: t("friendly.unknownCoach")`.
    - `acceptModel({ challenge, sender, teams, choiceId, teamId }) → AcceptModel`:
      `{id, login, initial, title, line, options: {id, name, line, checked, closed, reason}[], chosenId, cta: {label, disabled}}` — `sender` — ответ `readCoachTeam` или `null`/отказ; `title` — `friendly.acceptWho {login, team}`; `line` — раса, `friendly.tv {worth}` (`formatMoney(teamValue(...))`), `friendly.telegram {handle}` — только прочитанные части, через « · »; `options` — свои команды: `line` — раса, TV, `friendly.inSeason` при `inActiveSeason`; по умолчанию выбрана команда страницы.

Словари (en / ru; главные — остальные по образцу, все в `friendly.*`):

| ключ | en | ru |
|---|---|---|
| `friendly.title` | Friendlies | Товарищеские |
| `friendly.played` | played {count} | сыграно {count} |
| `friendly.today` / `.yesterday` | today / yesterday | сегодня / вчера |
| `friendly.challengedWhen` | challenge {when} | вызов {when} |
| `friendly.waitingWhen` | awaiting an answer · {when} | ждёт ответа · {when} |
| `friendly.withTeam` | with {team} | командой {team} |
| `friendly.acceptedWhen` | accepted {when} | принят {when} |
| `friendly.status.declined` / `.cancelled` / `.played` | declined / cancelled / match played | отклонён / отменён / матч сыгран |
| `friendly.unread` | The challenges could not be read: {reason} | Вызовы не прочитаны: {reason} |
| `friendly.oneTeam` | Challenging with {team} | Вызываем командой {team} |
| `friendly.summary` | {login} chooses a team on accepting the challenge. You play: {team}. | {login} выберет свою команду, когда примет вызов. Вы играете: {team}. |
| `friendly.summaryNone` | The opponent chooses a team on accepting the challenge. | Соперник выберет свою команду, когда примет вызов. |
| `friendly.challenge` | Challenge {login} | Вызвать {login} |
| `friendly.choose` | Choose an opponent | Выберите соперника |
| `friendly.others` | Other coaches · {count} | Остальные тренеры · {count} |
| `friendly.found` | Found · {count} | Найдено · {count} |
| `friendly.unknownCoach` | This coach cannot be challenged: a coach with at least one team can be. | Этого тренера не вызвать: вызвать можно тренера, у которого есть хотя бы одна команда. |
| `friendly.acceptWho` | {login} · {team} | {login} · {team} |
| `friendly.tv` | TV {worth} | TV {worth} |
| `friendly.telegram` | Telegram {handle} | Telegram {handle} |
| `friendly.inSeason` | in the season | в сезоне |
| `friendly.acceptGo` | Accept and go to the preparation | Принять и перейти к подготовке |

- [ ] **Step 1: Падающие тесты** — `test/challenges-model.test.mjs` (данные — как `test/coach-profile.test.mjs`: `state.data` из `public/data.en.json`, игры `/api/games`-формы, `now = new Date("2026-10-21T12:00:00")`):

```js
test("a coach already challenged with the chosen team is busy; with another team he is not", () => {
  const payload = { challenges: [pending("c2", ME, LILIT, T1, "2026-10-19T10:00:00")], opponents: [RIVAL, NAREK, LILIT] };
  const withT1 = sendModel({ ...base, payload, teamChoice: "t1", chosenId: "u4" });
  assert.equal(withT1.rows.find(({ id }) => id === "u4").busy, true);
  assert.equal(withT1.chosen, null, "a busy coach is not chosen");
  assert.equal(sendModel({ ...base, payload, teamChoice: "t2", chosenId: "u4" }).chosen.id, "u4");
});
```

  Ещё тесты:
  - «the search finds a coach by his login or any of his teams, whatever the case» — «RAID» → `rival` (Rival Raiders) и `narek` (Sevan Raiders); тренер `{login: "Лилит", teams: [{name: "Серебряный ручей"}]}`: «  лил » и «РУЧЕЙ» → он; при поиске `searching`, `recent: []`, `listLabel` «Found · 2»; «zzz» → `nobody`.
  - «recent opponents: three at most, the freshest first, games and challenges both, only those who can be challenged; they are not among the others» — игры с `u2` (вчера) и `u9` (не в `opponents`), вызовы от `u3` (сегодня) и к `u4` (два дня) → `["u3", "u2", "u4"]`; `rows` их не содержат, `listLabel` — «Other coaches · N».
  - «the page: incoming with the race on a phone and without on a desk, outgoing with the opponent's teams and the team it was sent with, accepted with its match's links, history» — «Grimtusk Raiders · Orc · challenge yesterday» / «Grimtusk Raiders · yesterday»; «Silverbrook Rangers · Mirefen Rotters · with Mock Humans · awaiting an answer · 19 Oct» (другой командой); принятый с неначатым матчем → `links[0]` `{label: "Match preparation", href: "#/games/g7/pre-match", kind: "primary"}`, `when` «accepted today»; отклонённый и принятый с подтверждённым счётом — в `history` (у второго `href` `#/games/g6`), отменённый — тоже; больше 8 — первые 8.
  - «played counts the page's team's friendlies with a confirmed score» — «played 2»; без игр — «».
  - «a day is today, yesterday or its date» — `dayWord` для `now`, `now − 1 день` (в 00:30), `2026-10-19` → «today», «yesterday», `formatDay`.
  - «the challenge sheet: the default team is the page's; one team is a line; the summary and the button follow the choice» — `summaryNone` и «Choose an opponent» (`disabled`); выбран `rival` → «rival chooses a team on accepting the challenge. You play: Mock Team.» и «Challenge rival»; одна команда → `single` «Challenging with Mock Team», `teams: []`.
  - «a coach named by the address but not offered is said» — `presetId: "u1"` (сам) и `"zz"` → `note` `friendly.unknownCoach`, `chosen: null`.
  - «the accept sheet: the challenger with what was read of his team, the coach's teams with their race, value and season» — `sender` с составом → `line` «Orc · TV 1,050k · Telegram @orc_boss» (TV — `teamValue`); `sender` — отказ → «Orc»; варианты: «Human · TV … · in the season»; выбрана команда страницы; `choiceId` чужой — команда страницы.
  - «names are text» — `HOSTILE` в логине и названии проходит в модель как текст (экранирует разметка, Task 3–4); «every key in both dictionaries», `friendly.status.*` по `HISTORY_KINDS`.
  - `readChallenges`/`sendChallenge`/`answerChallenge` (fake API): ответ без `opponents` — `request.noAnswer`; 409 `CHALLENGE_ALREADY_SENT` → `{code, lost: false}`; `api.fail` → `lost: true`; `accept` шлёт `{teamId}`, `decline` — `{}`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/challenges-model.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/data/challenges.mjs src/screens/matches/challenges-model.mjs src/i18n/en.json src/i18n/ru.json test/challenges-model.test.mjs
git commit -m "feat(challenges): the challenges read and written, and what the page and its sheets say — incoming, outgoing, accepted with their match, the history, recent opponents, the search, who is already challenged with the team chosen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Страница вызовов — телефон и десктоп

Прототипы: `mobile/Challenges.html`, `desktop/DeskChallenges.html` (страница под окном). Сверять (решения 3–7).

**Files:**
- Create: `src/screens/matches/challenges-view.mjs`, `src/screens/matches/challenges.css`, `test/challenges-view.test.mjs`
- Modify: `src/styles.css` (`@import url("screens/matches/challenges.css");` последним), оба словаря

**Interfaces:**
- Consumes: `challengesModel` (Task 2), `renderPageHead`, `renderButton`, `renderStatusChip`, `renderCallout` (`ui/*`), `escapeHtml`, `assertLinkHref`, `t`.
- Produces: `challengesMarkup(model, { historyOpen = false } = {}) → string` — корень `<div class="g-friendly" data-screen="team-challenges">`:
  - телефон (`Challenges.html`, фон `--surface-2`, отступ 16 16 28, зазор 18): `renderPageHead({title: t("friendly.title"), metaHtml: played, phone: true})` — в ряд, базовая линия, заголовок Oswald 700 24px, «сыграно 2» 13px `--muted`; подпись `friendly.note` 13/1.45 `--muted`; «Бросить вызов» — `renderButton({kind: "primary", block: true, dialog: true, data: {friendlySend: ""}, disabled: !model.read})` 48px, 15px 700, радиус 12; плашки `failures` (`renderCallout({tone: "danger"})`, у отказа вызовов — `actionHtml` «Обновить» `data-friendly-retry`); подписи разделов «Входящие · 1» 700 12px `letter-spacing: 0.06em` заглавные `--muted`; карточка (`--surface`, радиус 16, кольцо 1px `--line-strong`, отступ 14 16, зазор 10): круг 44px `--header` с буквой Oswald 700 22px `--header-ink`, логин 700 16px, строка 13px `--muted` (обе переносятся, `overflow-wrap: anywhere`); входящий — сетка `1fr 1fr` зазор 8: «Принять…» (`kind: "primary"`, `dialog: true`, `data: {friendlyAccept: id}`) и «Отклонить» (`data: {friendlyAnswer: "decline", friendlyId: id}`), обе 44px (десктоп 40), радиус 12, 14px 700; исходящий — чип «Ждём» справа (`renderStatusChip({label: t("friendly.waitChip"), tone: "wait"})`: высота 26, отступ 0 10, радиус 13, 12px 700, точка 7px), «Отменить вызов» во всю ширину (`friendlyAnswer: "cancel"`); принятый — чип `matches.offTable` (нейтральный: `--surface-3`, `--ink-2`, точка `--muted`) и «принят сегодня» 13px справа, ряд `minmax(0,1fr) auto minmax(0,1fr)` зазор 10: имена Oswald 700 19/1.1 (правое — `text-align: right`, переносятся), «vs» Oswald 17px `--muted`; ссылки фазы: `primary` — `renderButton({href, kind: "primary", block: true})` 48px 15px, `light` — outline 44px, `text` — ссылка `--accent-text` 600 от 44px; `sentLine` — 13px `--muted`; история — кнопка `data-friendly-history` `aria-expanded` `aria-controls="friendly-history"` «История вызовов · N» (подпись раздела, вся строка 44px), список `<ul id="friendly-history">` строк 13/1.45 (`hidden`, пока свёрнута), строка с `href` — ссылка; `empty` — `friendly.none` 14/1.45 `--muted`; пока не прочитано — `friendly.loading` (`role="status"`).
  - десктоп (`DeskChallenges.html`): `renderPageHead({title, sub: t("friendly.deskSub"), metaHtml: «Бросить вызов» (primary, не block, 48px)})`; тело отступ 24 32 40, зазор 20; сетка `repeat(auto-fit, minmax(320px, 1fr))` зазор 20 `align-items: start`: карточки «Входящие»/«Исходящие» (отступ 18 20, `h2` Oswald 700 24px; строка — круг 44, логин 700, строка 13px, кнопки 40px в ряд справа: «Принять…» и «Отклонить» / «Отменить» `friendly.cancelDesk`); «Принятые» — во всю ширину: чип, «Наша vs Их» Oswald 700 22px (переносится), ссылки справа (`margin-left: auto`), `flex-wrap`; «История вызовов» — карточка с той же кнопкой и списком.
  - `historyOpen` — раскрыта ли история: состояние экрана (Task 6), не модели.

Словари (en / ru, главные):

| ключ | en | ru |
|---|---|---|
| `friendly.note` | A friendly does not count in the table, but SPP, injuries and the treasury count as usual. | Товарищеский матч не влияет на таблицу, но SPP, травмы и казна считаются как обычно. |
| `friendly.deskSub` | Off the table · SPP, injuries and the treasury count | Вне таблицы · SPP, травмы и казна считаются |
| `friendly.send` | Challenge | Бросить вызов |
| `friendly.incoming` / `.incomingCount` | Incoming / Incoming · {count} | Входящие / Входящие · {count} |
| `friendly.outgoing` / `.outgoingCount` | Outgoing / Outgoing · {count} | Исходящие / Исходящие · {count} |
| `friendly.accepted` | Accepted | Принятые |
| `friendly.history` | Challenge history · {count} | История вызовов · {count} |
| `friendly.accept` | Accept… | Принять… |
| `friendly.decline` | Decline | Отклонить |
| `friendly.cancel` / `.cancelDesk` | Cancel the challenge / Cancel | Отменить вызов / Отменить |
| `friendly.waitChip` | Waiting | Ждём |
| `friendly.vs` | vs | vs |
| `friendly.none` | No challenges yet. Challenge a coach: the opponent chooses a team on accepting. | Вызовов пока нет. Бросьте вызов: соперник выберет свою команду, когда примет его. |
| `friendly.loading` | Reading the challenges… | Читаем вызовы… |

- [ ] **Step 1: Падающие тесты** — `test/challenges-view.test.mjs` (модель — `challengesModel` над данными Task 2; DOM — `mount`):
  - «a phone's page in the prototype's order: the title with played, the note, the button, incoming, outgoing, accepted, the history» (`Challenges`) — порядок классов детей корня; «Incoming · 1», «Outgoing · 1», «Accepted»; «Accept…» `data-friendly-accept="c1"` и `aria-haspopup="dialog"`; «Decline» `data-friendly-answer="decline"`; чип «Waiting» `g-status--wait`; «Match preparation» → `#/games/g7/pre-match`.
  - «a desk's page: the band with its line and the button, the two cards side by side, accepted the whole width» (`DeskChallenges`) — `h1` «Friendlies», «Off the table · …», «Challenge» в `.g-pagehead__meta`; `h2` «Incoming», «Outgoing»; «Cancel» (не «Cancel the challenge»).
  - «nothing yet says so; a section with nothing in it is not drawn» — пустой список → `friendly.none`, нет «Incoming».
  - «the challenges not read: the danger callout with Refresh, the button closed; the games not read: no accepted, no played».
  - «the history is folded until it is opened» — кнопка `aria-expanded="false"`, `#friendly-history[hidden]`; `historyOpen: true` → открыта.
  - «names are text» (`HOSTILE`), `assertCspSafe`, «styled» (`assertStyled(..., "src/screens/matches/challenges.css")`), «readable» (`--muted` на `--surface` и `--surface-2`, `--on-warn-tint` на `--warn-tint`, `--ink-2` на `--surface-3` ≥ 4.5:1 во всех палитрах), D2 — кнопки карточек ≥ 44 до 900px, ≥ 24 от 901px (40px), «Бросить вызов» и «Подготовка к матчу» 48px; «no ellipsis» в `challenges.css`; «every key in both dictionaries».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/challenges-view.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка CSS: «Values from Challenges.html and DeskChallenges.html; font, border, background, text-transform, letter-spacing and font-weight are set on purpose (the 2.x globals live until stage 13).»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/challenges-view.mjs src/screens/matches/challenges.css src/styles.css src/i18n/en.json src/i18n/ru.json test/challenges-view.test.mjs
git commit -m "feat(challenges): the friendlies page as the prototypes draw it — played, the note and the call to challenge, incoming with accept and decline, outgoing waiting, accepted with its match, the history folded; a desk's band and cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Шторки вызова и принятия

Прототипы: `mobile/ChallengeSend.html` (выбран `thalion`), `mobile/ChallengeSendSearch.html` («raid»), `mobile/ChallengeAccept.html`, `desktop/DeskChallenges.html` (окно). Сверять (решения 8–14).

**Files:**
- Create: `src/screens/matches/challenges-sheets.mjs`, `src/screens/matches/challenges-sheets.css`, `test/challenges-sheets.test.mjs`
- Modify: `src/styles.css` (`@import url("screens/matches/challenges-sheets.css");` последним), оба словаря

**Interfaces:**
- Consumes: `sendModel`, `acceptModel` (Task 2), `renderSheet` (`ui/sheet.mjs:46`: `className`, `sub`, `footHtml`), `renderSearchField` (`ui/search-field.mjs`), `renderButton`, `renderIconButton`, `escapeHtml`, `t`.
- Produces:
  - `SEND_SHEET = "friendly-send"`, `ACCEPT_SHEET = "friendly-accept"`.
  - `sendSheetMarkup(model, { phone, refusal = "" }) → string` — `renderSheet({id: SEND_SHEET, className: "g-challenge-send", title: phone ? t("friendly.sheetTitle") : t("friendly.sheetTitleDesk"), sub: phone ? "" : t("friendly.sheetSubDesk"), bodyHtml, footHtml})`:
    - поиск: `renderSearchField({id: "friendly-search", label: t("friendly.search"), placeholder: t("friendly.searchPlaceholder"), value: model.query, data: {friendlySearch: ""}})` в обёртке 48px (`--surface-2`, кольцо 1px `--line-strong`, радиус 12, отступ 0 6 0 14, поле 16px), при запросе — `<button data-friendly-clear aria-label=t("friendly.clear")>` 44px (десктоп 36), круг, `--muted`;
    - телефон: одна `<div class="g-challenge__group" role="radiogroup" aria-label=t("friendly.opponentGroup")>` — без поиска: подпись «Недавние соперники» и строки `recent`, подпись «Остальные тренеры · N» и строки `rows`; при поиске — подпись «Найдено · N» и строки; `nobody` — блок `friendly.nobody` (`--surface-2`, радиус 12, отступ 18 12, 14/1.45 `--muted`, по центру);
    - строка (`Row`): `<button type="button" class="g-challenge__row" role="radio" aria-checked tabindex data-friendly-pick="<id>"[ aria-disabled="true"]>` от 60px, отступ 8 12, радиус 12, фон `--surface` (выбранная — `--accent-tint-soft`, кольцо 2px `--accent`; иначе 1px `--line-strong`), круг 36px Oswald 17px, логин 700 15/1.25, строка 13/1.3 `--muted` (переносится), справа — чип `friendly.busy` (высота 24, отступ 0 8, радиус 12, `--warn-tint`/`--on-warn-tint` 12px 700) или радио 22px (кольцо 2px `--control-border`; выбранное — `inset 0 0 0 6px var(--accent)`); roving tabindex — выбранная или первая доступная;
    - десктоп: тело отступ 16 24, зазор 14: поиск; без поиска — ряд «Недавние:» 13px 600 `--muted` и чипы `<button type="button" class="g-challenge__chip" aria-pressed data-friendly-pick="<id>">` 36px (отступ 0 12 0 4, радиус 18, круг 28px Oswald 14, 14px 600; нажатый — `--accent-tint-soft` и кольцо 2px `--accent`); подпись; радиогруппа — сетка в две колонки, зазор 6, `max-height: 300px`, `overflow-y: auto`, отступ 2; ряд «Вызываем командой» 13px 600 `--muted` и группа команд (`flex: 0 1 420px`);
    - команды: при `model.single` — строка 13px; иначе `<div class="g-challenge__teams" role="radiogroup" aria-label=t("friendly.withTeamLabel")>` — сетка `repeat(2, minmax(0, 1fr))`, зазор 4, отступ 4, радиус 12, фон `--surface-3`; пункт `role="radio" data-friendly-team="<id>"` 44px (десктоп 38), радиус 9, 14px, выбранный — фон `--surface`, тень сегмента, 700, иначе прозрачный, 600; подписи переносятся; `closed` — `aria-disabled="true"` и `reason` строкой под группой (Task 9);
    - `note` (тренер из адреса) — 13/1.45 `--muted` над списком; `refusal` — `<p class="g-challenge__refusal" role="alert">` (`--danger-tint`, `--on-danger-tint`, радиус 12, отступ 10 12, 13/1.45);
    - подвал телефона (отступ 12 16 16, черта `--line`, зазор 10): подпись «Вызываем командой» 13px 600 `--muted` и группа (или `single`), сводка 12/1.4 `--muted`, `renderButton({label: cta.label, kind: "primary", disabled: cta.disabled, data: {friendlyChallenge: ""}})` 52px 17px (закрытая — фон `--disabled`); подвал десктопа (отступ 12 24 20, `justify-content: flex-end`, зазор 8): сводка 13/1.4 `--muted` (`flex: 1`), «Отмена» (`common.cancel`, outline 48px, `data-sheet-close`), кнопка 48px (отступ 0 20, без переноса).
  - `acceptSheetMarkup(model, { phone, refusal = "" }) → string` — `renderSheet({id: ACCEPT_SHEET, className: "g-challenge-accept", title: t("friendly.acceptTitle"), bodyHtml, footHtml})`: тело отступ 10 16 12, зазор 14 — карточка вызывающего (`--surface-2`, кольцо `--line-strong`, радиус 16, отступ 14 16: круг 44px, `title` 700 16px, `line` 13px `--muted`); подпись «Какой командой играете» (700 12px заглавные `--muted`); `<div role="radiogroup" aria-label=t("friendly.whichTeam")>` в одну колонку, зазор 6: пункт `data-friendly-own="<id>"` от 56px, отступ 4 8, радиус 10, имя 14px, `line` 11px 500 `--muted` (в прототипе `opacity: .75` — роняет контраст; расхождение), выбранный — `--accent-tint-soft`, кольцо 2px `--accent`, 700, иначе `--surface`, кольцо 1px `--control-border`, 600; подпись `friendly.anyTeam` 13/1.45 `--muted`; `refusal`; подвал (отступ 10 16 22): `renderButton({label: t("friendly.acceptGo"), kind: "primary", disabled: cta.disabled, data: {friendlyConfirm: ""}})` 48px 15px.
  - CSS: `dialog.g-sheet.g-challenge-send` до 900px — `height: 92dvh; max-height: 92dvh`; `.g-challenge-accept` до 900px — `max-height: 88dvh`; от 901px `.g-challenge-send` — `width: min(760px, calc(100% - 32px))`, радиус 20, заголовок Oswald 700 28px, подзаголовок 13px `--muted` слева, закрыть 40px; закрыть на телефоне 44px (`--surface-3`).

Словари (en / ru, главные):

| ключ | en | ru |
|---|---|---|
| `friendly.sheetTitle` | Whom do we challenge | Кого вызываем |
| `friendly.sheetTitleDesk` | Challenge to a friendly | Вызов на товарищеский |
| `friendly.sheetSubDesk` | Off the league table · SPP, injuries and the treasury count | Вне таблицы лиги · SPP, травмы и казна считаются |
| `friendly.search` | Find a coach or a team | Найти тренера или команду |
| `friendly.searchPlaceholder` | Coach or team | Тренер или команда |
| `friendly.clear` | Clear | Очистить |
| `friendly.opponentGroup` | Opponent | Соперник |
| `friendly.recent` / `.recentDesk` | Recent opponents / Recent: | Недавние соперники / Недавние: |
| `friendly.nobody` | Nobody found. A coach with at least one team can be challenged. | Никого не нашли. Вызвать можно тренера, у которого есть хотя бы одна команда. |
| `friendly.busy` | Challenge sent | Вызов отправлен |
| `friendly.withTeamLabel` | Challenging with | Вызываем командой |
| `friendly.acceptTitle` | Accept the challenge | Принять вызов |
| `friendly.whichTeam` | Which team do you play | Какой командой играете |
| `friendly.anyTeam` | Any of your teams can play, one not entered in the season too. | Сыграть можно любой своей командой, в том числе той, что не заявлена в сезон. |

- [ ] **Step 1: Падающие тесты** — `test/challenges-sheets.test.mjs`:
  - «a phone's challenge sheet: the search, recent opponents and the others in one radio group, the team chosen, the summary, the button» (`ChallengeSend`) — `dialog#friendly-send.g-challenge-send`, `h2` «Whom do we challenge», одна `[role="radiogroup"]` с двумя подписями, выбранная строка `aria-checked="true"` `tabindex="0"`, остальные `-1`; занятой — `aria-disabled="true"` и «Challenge sent»; подвал — «Challenging with», группа `data-friendly-team`, сводка, «Challenge rival».
  - «a desk's challenge window: the title and its line, recent as pressed chips, the list in two columns, the team row in the body, Cancel and the button in the foot» (`DeskChallenges`).
  - «while searching: found and nothing else; nobody found says so; a long login and long team names wrap» (`ChallengeSendSearch`) — «Found · 2», нет «Recent opponents»; `nobody` → текст; «no ellipsis» в `challenges-sheets.css`.
  - «one team is a line, not a group».
  - «a refusal is said in the sheet as an alert».
  - «the accept sheet: the challenger, the coach's teams as one radio group, the note, the button» (`ChallengeAccept`) — «orc_boss · Grimtusk Raiders», «Orc · TV 1,050k · Telegram @orc_boss», пункты `data-friendly-own`, «Accept and go to the preparation».
  - «names are text» (`HOSTILE`), `assertCspSafe`, «styled», «readable» (`--on-warn-tint` на `--warn-tint`, `--muted` на `--surface`/`--surface-2`/`--accent-tint-soft`, `--on-danger-tint` на `--danger-tint`), D2 — строки ≥ 60, «Очистить», сегменты, закрыть ≥ 44 до 900px; ≥ 24 от 901px; «every key in both dictionaries».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/challenges-sheets.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/challenges-sheets.mjs src/screens/matches/challenges-sheets.css src/styles.css src/i18n/en.json src/i18n/ru.json test/challenges-sheets.test.mjs
git commit -m "feat(challenges): the challenge sheet — the search, recent opponents, every coach who can be challenged, those already challenged with the team, the team to play; a desk's window of 760px; the accept sheet with the coach's teams" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Адрес с тренером и вызов из профиля

**Files:**
- Modify: `src/core/routes.mjs` (`ID_ROUTES` :173; билдер после `postMatchUrl` :101), `src/screens/coaches/profile.mjs` (:18 импорт, :108 `challengeHref`), `test/routes.test.mjs` (:166), `test/coach-profile.test.mjs` (:113, :121, :151, :170)

**Interfaces:**
- Consumes: `teamUrl`, `segment` (`routes.mjs`).
- Produces:
  - `ID_ROUTES`: `[/^t\/([^/]+)\/challenges(?:\/([^/]+))?$/, "teamChallenges", "teamId", "userId"]` — `matchRoute("t/t1/challenges")` → `{name: "teamChallenges", params: {teamId: "t1", userId: ""}}`, `"t/t1/challenges/u2"` → `userId: "u2"`.
  - `challengeUrl(teamOrId, userOrId = "") → string` — `teamUrl(team, "challenges")` и `/${segment(user)}`, когда тренер назван.
  - `coachModel(...).challengeHref` — `challengeUrl(activeTeamId, user.id)` у чужого профиля при активной команде **и хотя бы одной команде тренера** (`teams.length > 0`), иначе `""`.

- [ ] **Step 1: Падающие тесты:**
  - `test/routes.test.mjs`: «the address names a coach to challenge, or none» — два `matchRoute` выше; `challengeUrl("t1", "u 2")` → `"#/t/t1/challenges/u%202"`, `challengeUrl("t1")` → `"#/t/t1/challenges"`; гость на `#/t/t1/challenges/u2` → `#/login` с `returnTo` этим адресом (`resolveRedirect`); `"t/t1/challenges/u2/x"` — не `teamChallenges`. Строку :166 — с `userId: ""`.
  - `test/coach-profile.test.mjs`: ожидания `#/t/t1/challenges` → `#/t/t1/challenges/u2` (:113, :151, :170); новый — «a coach with no team has no challenge on his profile» (`teams: []` → `challengeHref` `""`, нет `.g-coach__challenge`).
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/routes.test.mjs test/coach-profile.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `routes.mjs` у `challengeUrl`: «The challenges of a team, with a coach to challenge when one is named (stage 09c: the coach's profile opens the challenge with him chosen).»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/shell-navigation.test.mjs test/team-switcher.test.mjs` → PASS (без изменений); полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/core/routes.mjs src/screens/coaches/profile.mjs test/routes.test.mjs test/coach-profile.test.mjs
git commit -m "feat(routes): a team's challenges may name the coach to challenge; the coach's profile leads there with him named, and has no challenge for a coach with no team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Экран вызовов — чтения, шторки, записи ⚠ ревью сразу

**Files:**
- Create: `src/screens/matches/challenges.mjs`, `test/challenges-screen.test.mjs`
- Modify: `src/core/router.mjs` (:40 импорт, :80 `teamChallenges: ({ teamId, userId }) => renderTeamChallenges(teamId, userId)`), оба словаря

**Interfaces:**
- Consumes: `readChallenges`, `sendChallenge`, `answerChallenge` (`data/challenges.mjs`), `challengesModel`, `sendModel`, `acceptModel` (Task 2), `challengesMarkup` (Task 3), `sendSheetMarkup`, `acceptSheetMarkup`, `SEND_SHEET`, `ACCEPT_SHEET` (Task 4), `readCoachTeam` (`data/coaches.mjs`), `loadGames`, `invalidateGames`, `onGamesChange` (`data/games.mjs`), `patchWithModal` (`components/dialog.mjs`), `wireSheets` (`ui/sheet.mjs`), `wireRadioGroups` (`ui/choice.mjs`), `delegate`, `drawKeepingFocus` (`core/dom.mjs`), `isPhone`, `onPhoneChange` (`screens/team/roster/screen.mjs`), `onScreenLeave`, `announce`, `preMatchUrl`, `teamUrl`, `state`, `view`.
- Produces: `renderTeamChallenges(teamId, presetUserId = "") → Promise<void>` (шапка — решения 1, 7, 13–15 и таблица «Как идёт каждая запись»):
  - визит `{payload, readError, sheet: null|"send"|"accept", query, chosenId, teamChoice, acceptId, ownChoice, sender, refusal, writing, historyOpen, preset}`; рисует `challengesMarkup(model, {historyOpen}) + (sheet === "send" ? sendSheetMarkup : sheet === "accept" ? acceptSheetMarkup : "")` через `patchWithModal(view, markup, sheet ? "#" + id : "")`;
  - вход: первая отрисовка из состояния (`friendly.loading`), фокус на `h1`; `Promise.allSettled([readChallenges(), loadGames(true)])`; затем, если `presetUserId`, — шторка вызова с ним (решение 13);
  - слушатели (`onScreenLeave("team-challenges", …)` снимает все и закрывает шторку): `onGamesChange` → перерисовка; `onPhoneChange` → `drawKeepingFocus(view, draw, "h1")` с той же шторкой; `visibilitychange` (видна) → `readChallenges` и `loadGames(true)`; `[data-friendly-retry]` → чтение заново; `[data-friendly-history]` → раскрыть/свернуть;
  - шторка вызова: `[data-friendly-send]` → открыть; `input` на `[data-friendly-search]` → `query`, перерисовка (фокус и каретка остаются: `patch`); `[data-friendly-clear]` → пусто, фокус в поле; `wireRadioGroups(view, {group: ".g-challenge__group", item: "[data-friendly-pick]", attribute: "data-friendly-pick", onChange})` и клик по чипу «Недавних» десктопа (`[data-friendly-pick][aria-pressed]`) → `chosenId`; `wireRadioGroups` для `.g-challenge__teams` (`data-friendly-team`) → `teamChoice`; `[data-friendly-challenge]` → отправка;
  - шторка принятия: `[data-friendly-accept]` → `acceptId`, `ownChoice = teamId`, `readCoachTeam(sender.id, team.id)` (ответ кладётся в `sender`, перерисовка, если шторка всё ещё та же); группа `data-friendly-own` → `ownChoice`; `[data-friendly-confirm]` → принятие;
  - `[data-friendly-answer]` → отклонить/отменить;
  - `wireSheets(view, {onClose})` → `sheet = null`, `refusal = ""`, фокус на открывшей кнопке (`[data-friendly-send]` или `[data-friendly-accept="<id>"]`, если она ещё есть, иначе `h1`), при `preset` — `history.replaceState(null, "", teamUrl(teamId, "challenges"))` и `preset = ""`;
  - записи — таблица «Как идёт каждая запись»: `writing` — одна запись в полёте, кнопки закрыты (`busy`); после записи — `readChallenges`.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `friendly.sent` | Challenge sent: {login} | Вызов отправлен: {login} |
| `friendly.lost` | No answer came: the challenges are read again, nothing is sent twice. | Ответа нет: вызовы прочитаны заново, ничего не отправлено дважды. |
| `friendly.declined` | Challenge declined | Вызов отклонён |
| `friendly.cancelled` | Challenge cancelled | Вызов отменён |

- [ ] **Step 1: Падающие тесты** — `test/challenges-screen.test.mjs` (как `test/coach-profile.test.mjs`: `installFakeApi` до импортов, `globalThis.location = {hash, replace() {}}`, `globalThis.history = {replaceState: spy}`, `matchMedia` с переключением ширины; ответы `GET /api/challenges`, `GET /api/games`, `GET /api/players/u3/teams/n1`):

```js
test("a second press while the challenge is on its way sends nothing", async () => {
  await visit();
  click("[data-friendly-send]");
  click('[data-friendly-pick="u2"]');
  api.hold("POST /api/challenges");
  click("[data-friendly-challenge]");
  click("[data-friendly-challenge]");
  assert.equal(api.calls.filter(({ key }) => key === "POST /api/challenges").length, 1);
  assert.deepEqual(api.calls.find(({ key }) => key === "POST /api/challenges").body, { opponentId: "u2", teamId: "t1" });
  api.reply("POST /api/challenges", 201, { id: "c9" });
  api.release();
  await settle();
  assert.equal(view.querySelector("#friendly-send")?.open ?? false, false);
  assert.equal(document.activeElement, view.querySelector("[data-friendly-send]"));
});
```

  Ещё тесты (имена — Review Focus):
  - «the page reads the challenges and the games and draws them; the tab seen again reads them again».
  - «a lost send is not sent again: the list is read and says what came of it» — `api.fail` → одно `POST`; список перечитан; вызов появился — шторка закрыта и `announce` «Challenge sent: rival»; не появился — `friendly.lost` в шторке.
  - «CHALLENGE_ALREADY_SENT from another device: the sheet says it, the list is read, the coach is busy».
  - «accept: the team picked, one request with it, the games read again, the address is the new match's preparation» — `POST /api/challenges/c1/accept {teamId: "t2"}` → `location.hash === "#/games/g9/pre-match"`, `GET /api/games` после.
  - «an accept whose answer was lost goes to the match the list now names».
  - «a challenge cancelled meanwhile: the accept is refused in the server's words, the list is read again, the sheet closes».
  - «decline and cancel: one request each; the card goes and the focus is on the title».
  - «a coach named in the address is chosen when the sheet opens; closing it puts the address back without drawing again» — `renderTeamChallenges("t1", "u3")` → шторка открыта, `aria-checked` у `u3`; закрытие → `history.replaceState(null, "", "#/t/t1/challenges")`, `GET /api/challenges` не повторён.
  - «a busy or unknown coach in the address is not chosen; the unknown one is said».
  - «typing keeps the focus in the field»; «switching the team clears a coach now busy».
  - «crossing 900px keeps the sheet open with the query and the choice».
  - «closing a sheet gives the focus back to the button that opened it»; «leaving closes the sheet and stops listening».
  - «the accept sheet reads the challenger's team once; a read that fails leaves the line without it».
  - `api.assertAnswered()` в каждом тесте.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/challenges-screen.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; роутер — две строки. `renderMyGames` остаётся неиспользуемым экспортом до Task 7.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/routes.test.mjs test/shell-navigation.test.mjs test/team-matches.test.mjs test/coach-profile.test.mjs` → PASS; полный прогон → PASS; рецепт М (с mock 2.x, до Task 8 — страница рисуется, шторка открывается).
- [ ] **Step 5: Commit**

```bash
git add src/screens/matches/challenges.mjs src/core/router.mjs src/i18n/en.json src/i18n/ru.json test/challenges-screen.test.mjs
git commit -m "feat(challenges): the friendlies of a team in 3.0 — challenge a coach found by name or team, accept with the team to play and go to the preparation, decline, cancel; one request a press, a lost answer read again and never resent; a coach named by the address chosen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): упор — Review Focus 1, 2, 4; что ни одна запись не уходит дважды и не повторяется сама; что принятие ведёт к подготовке только по ответу или по перечитанному списку.

---

### Task 7: «Мои игры» 2.x удалены

**Files:**
- Delete: `src/screens/games/my-games.mjs`, `src/components/games/challenges.mjs`, `src/styles/challenges.css`
- Modify: `src/styles.css` (:23 — удалить строку), `src/styles/site-matchday.css` (:67, `.challenge-card, ` из :68, :69, :94), `src/styles/controls.css` (:43–:44: селектор правила — `.filter-field :is(input, select), .pre-match :is(input, select) {`), `src/screens/season/season-links.mjs` (`pairingTouchdowns` :54, `pairingCasualties` :60 — если читателей нет), оба словаря

**Interfaces:**
- Consumes: —
- Produces: остаются `screens/games/game.mjs`, `components/games/context.mjs`, `components/game-status.mjs` (Global Constraints).

- [ ] **Step 1: Читателей нет** — `grep -rn "my-games.mjs\|components/games/challenges\|styles/challenges.css\|renderMyGames\|mountChallenges" src test scripts` → только удаляемые файлы и строка `styles.css:23`; `grep -rn "pairingTouchdowns\|pairingCasualties" src test scripts` → только `season-links.mjs` и удаляемый файл (иначе функции остаются).
- [ ] **Step 2: Удалить** файлы и правила; в `site-matchday.css` строка :68 становится `.pre-team-panel { border-color: var(--line); }` (если 09b её не удалил). Ключи: кандидаты — ключи из `t("…")` удалённых файлов и семейства шаблонов `challenges.status.`, `pre.status.`, `post.status.`; удалить из обоих словарей те, у кого после удаления нет читателя (скрипт: литерал ключа или префикс семейства в `src/**/*.mjs`, `index.html`, `scripts/**/*.mjs`); список — в сообщение коммита. Ожидаемо уходят `challenges.*` (23), `pre.status.*`, `post.status.*`, `games.{historyHeading,loading,nextGameHeading,noHistory,noLeaguePoints,noNextGame}`, `nav.myGames`; остаются `common.refresh` (Task 3), `games.subtitle`, `games.friendlyMatch`, `games.friendlyRules`, `games.loginRequired`, `games.vsLabel`, `season.*`.
- [ ] **Step 3: Тесты** — `grep -rn "challenge-" src/styles src/screens src/components` → пусто (кроме `g-challenge*` этапа); Run: `npm run build && . output/09c/env.sh && npm test && npm run check && npm run i18n:check` → PASS.
- [ ] **Step 4: Commit**

```bash
git add -A src/screens/games src/components/games src/styles src/styles.css src/screens/season/season-links.mjs src/i18n/en.json src/i18n/ru.json
git commit -m "chore(challenges): the 2.x «My games» is gone — its screen, its challenges' view, their stylesheet and rules, the keys nothing reads; the game page keeps its own" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mock вызовов

**Files:**
- Create: `scripts/mock/challenges.mjs`, `test/mock-challenges.test.mjs`
- Modify: `scripts/mock-api.mjs` (Global Constraints: импорт, `answerApi` :516, `const mock` :411 `+ pairingOf`, удалить :362–:380 и :487, шапка :29–:30, :93)

**Interfaces:**
- Consumes: из `mock` — `teams`, `games`, `user`, `rival`, `readBody`, `reply`, `refuse`, `pairingOf(id, table, own, opposing, changes)` (как `answerMatches`); `errorPayload`.
- Produces (`scripts/mock/challenges.mjs`; шапка — пути и состояния, как `scripts/mock/season.mjs`):
  - `answerChallenges(request, pathname, mock) → Promise<{status, payload}|null>`:
    - `GET /api/challenges` — `{challenges, teams, opponents}`: `opponents` — `rival` (u2: Rival Team, Rival Raiders, Rival Wardens), `narek` (u3: Ararat Lions, Sevan Raiders), `lilit` (u4: Silverbrook Rangers, Mirefen Rotters) — имена и расы как `scripts/mock/season.mjs` — и девять тренеров прототипа (`amazona` — Lustria Valkyries, `frostulf` — Frostfang Raiders, `gutbag` — Cinderpeak Ash, `howler` — Bloodmoon Howlers, `lizardking` — Sotek's Chosen, `pharaoh_k` — Tombway Kings, `rotfather` — Mirefen Rotters · Plaguebearers (две команды), `snotty` — Gobbo Wreckers, `squeak` — Ratwharf Gnawers), по логину; `challenges`: `c1` входящий от `rival` командой `rt2`, вчера (входящие mock — только от `rival`: `pairingOf` ставит соперником его, и его команды подготовка mock знает); `c2` исходящий `t1` → `lilit`, два дня назад; `c3` принятый от `rival` (`rt1`) → матч `g7` (`t5`, подготовка идёт), сегодня; `c4` отклонённый (`t2` → `amazona`), `c5` отменённый (`t1` → `frostulf`), `c6` принятый → `g6` (сыгран);
    - `POST /api/challenges` — как сервер: `opponentId` не UUID-форма не проверяется (ids mock), себя — 400 `CHALLENGE_SELF`, нет в `opponents` — 404 `CHALLENGE_OPPONENT_UNAVAILABLE`, `teamId` не из `teams` — 404 `TEAM_NOT_FOUND`, ждущий тот же — 409 `CHALLENGE_ALREADY_SENT`; иначе 201 `{id}` и вызов `pending` от тренера;
    - `POST /api/challenges/:id/(accept|decline|cancel)` — как `checkChallengeAction`: не того — 403 `CHALLENGE_NOT_YOURS`, закрыт — 409 `CHALLENGE_CLOSED`, повтор принятия — тот же `gameId`; принятие — `teamId` из `teams` (иначе 404), новый товарищеский `g<n>` (`pairingOf(id, 1, своя, команда вызывающего, {kind: "friendly", season: null, roundId: null, roundNumber: 0, homeEntryId: null, awayEntryId: null, viewerIsHome: false, createdAt: <сейчас>})` — вызывающий хозяева, как `acceptChallenge`) в начало `mock.games`, `{gameId}`; отклонение и отмена — `{gameId: null}`;
    - mock-only `POST /api/mock/challenges/:case` — `empty` (вызовов нет), `reset` (как при старте); иначе 400 `FIELD_INVALID {field: "case"}`.
  - `MOCK_EMPTY=1` — вызовов нет (команд у тренера нет — страница недостижима).
- [ ] **Step 1: Падающие тесты** — `test/mock-challenges.test.mjs` (ответчик напрямую, как `test/mock-season.test.mjs`): «the list has every kind of challenge and a long list of coaches with their teams» (6 вызовов, 12 тренеров, у каждого `teams` с `baseTeamSlug`); «a challenge is sent once; again it is CHALLENGE_ALREADY_SENT; oneself, nobody and another's team are refused as the server refuses»; «accepting makes a friendly in the games and answers its id; again the same id; declining and cancelling close it»; «the cases empty and reset».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/mock-challenges.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Затем рецепт М: `curl -fsS -H 'Authorization: Bearer mock' http://localhost:5183/api/challenges | node -e 'process.stdin.on("data",d=>{const s=JSON.parse(d);console.log(s.challenges.length, s.opponents.length)})'` → `6 12`.
- [ ] **Step 4: Проверки** — `wc -l scripts/mock-api.mjs` → меньше 559; `grep -n "challenges" scripts/mock-api.mjs` → только импорт и `answerApi`; `node --test test/mock-matches.test.mjs test/mock-season.test.mjs test/screenshots-plan.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add scripts/mock/challenges.mjs scripts/mock-api.mjs test/mock-challenges.test.mjs
git commit -m "test(mock): the challenges in a module of their own — every kind of them, a long list of coaches with their teams, sending, accepting into a new friendly, declining and cancelling as the server does" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Лимит товарищеских — правило лиги ⚠ ревью сразу

Вопрос владельцу 1. Исполняется по ответу владельца; без ответа к её началу — по умолчанию вопроса, если контроллер так решит (иначе ждёт только эта задача). Ответ «лимита нет» — задача не исполняется, Task 13 записывает ответ; «6», «на тренера» — меняются константа и выборка, тесты те же по смыслу.

**Files:**
- Create: `src/domain/friendly.mjs`, `test/friendly-limit.test.mjs`
- Modify: `server/friendly/challenges.mjs` (`createChallenge` :32, `acceptChallenge` :75), `server/http/errors.mjs` (`FRIENDLY_LIMIT` рядом с `CHALLENGE_*` :47–:54), `src/screens/matches/challenges-model.mjs` (`sendModel`, `acceptModel`: `closed`, `reason`), `scripts/mock/challenges.mjs` (отказ и случай `limit`), оба словаря, `test/challenges-api.test.mjs`, `test/challenges-model.test.mjs`, `test/mock-challenges.test.mjs`

**Interfaces:**
- Consumes: `httpError`, `pool`; Task 1–2, 8.
- Produces:
  - `src/domain/friendly.mjs` (чистый; шапка — строки контента и ответ владельца): `FRIENDLY_LIMIT = 3`, `LEAGUE_TIME_ZONE = "Asia/Yerevan"`, `friendlyMonth(moment: string|Date) → string` — «YYYY-MM» по часам лиги (`Intl.DateTimeFormat("en-CA", {timeZone: LEAGUE_TIME_ZONE, year: "numeric", month: "2-digit"})`), не дата — `""`; `friendliesThisMonth(moments: (string|Date)[], now: Date) → number`.
  - Сервер: `friendlyCount(client, teamId, now = new Date()) → Promise<number>` — `created_at` товарищеских пар команды (`match_kind = 'friendly' AND $1 IN (friendly_home_team_id, friendly_away_team_id) AND created_at > now() - interval '40 days'`), счёт — `friendliesThisMonth`; `createChallenge` после `ownedTeam` — своя команда на лимите → 422 `FRIENDLY_LIMIT {team: <имя>, limit}`; `acceptChallenge` после блокировки команд — команда вызывающего, затем принимающего → то же.
  - `API_ERRORS.FRIENDLY_LIMIT` — «{team}: friendlies this month — {limit} of {limit}, the league's limit.»; `error.FRIENDLY_LIMIT` ru — «{team}: товарищеских в этом месяце — {limit} из {limit}, это лимит лиги.».
  - Модель: `acceptModel` получает ещё `games` и `now` (`sendModel` — `now`); свои команды с `friendliesThisMonth(createdAt товарищеских игр команды, now) >= FRIENDLY_LIMIT` — `closed: true`, `reason: t("friendly.limitReached", {team, limit})`; по умолчанию выбирается первая открытая (команда страницы, если открыта); все закрыты — кнопка закрыта, `cta.label` прежний, причина строкой под группой; одна команда на лимите — `single` и причина.
  - Mock: `POST` и принятие командой с тремя товарищескими в этом месяце — 422; случай `limit` добавляет в игры три товарищеских `t1` с `createdAt` сейчас (у `g6` и `g7` — `daysAgo(30)`, они могут быть прошлым месяцем).

Словари: `friendly.limitReached` — «{team}: {limit} friendlies this month, the league's limit» / «{team}: товарищеских в этом месяце — {limit}, это лимит лиги»; `error.FRIENDLY_LIMIT` (выше).

- [ ] **Step 1: Падающие тесты:**
  - `test/friendly-limit.test.mjs`: «a month is the league's: the last evening of October in UTC is November in Yerevan» — `friendlyMonth("2026-10-31T20:30:00Z")` → «2026-11»; «three this month close the team; last month's do not count»; «not a date is no month».
  - `test/challenges-api.test.mjs` (БД): «a team with three friendlies this month cannot send a challenge» (три пары `match_kind='friendly'` с командой — `INSERT` как `acceptChallenge` — → 422 `FRIENDLY_LIMIT {team, limit: 3}`, вызов не записан); «nor accept one, whichever side is at the limit» (принимающая на лимите → 422, вызов остаётся `pending`, пары нет; вызывающая на лимите → то же); «last month's friendlies do not count» (`created_at` прошлого месяца → 201).
  - `test/challenges-model.test.mjs`: «a team at the limit is closed with why; the first open one is chosen; all closed close the button».
  - `test/mock-challenges.test.mjs`: «the case limit refuses t1's challenge as the server does».
  - «every API error code has a message in both languages» (`test/api-errors.test.mjs`) — без изменений, проходит с новым кодом.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && . output/09c/env.sh && node --test test/friendly-limit.test.mjs test/challenges-api.test.mjs test/challenges-model.test.mjs test/mock-challenges.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Счёт — под теми же блокировками, что принятие (`acceptChallenge` уже блокирует обе команды); при отправке — `FOR UPDATE` своей команды в `ownedTeam` уже есть.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; рецепт С: `smoke:friendly` → `passed` (одна пара на команду за прогон — лимит не задет); полный прогон → PASS; `wc -l server/friendly/challenges.mjs` ≤ 140.
- [ ] **Step 5: Commit**

```bash
git add src/domain/friendly.mjs server/friendly/challenges.mjs server/http/errors.mjs src/screens/matches/challenges-model.mjs scripts/mock/challenges.mjs src/i18n/en.json src/i18n/ru.json test/friendly-limit.test.mjs test/challenges-api.test.mjs test/challenges-model.test.mjs test/mock-challenges.test.mjs
git commit -m "feat(challenges): the league's friendly limit — three a month a team by the league's clock, as the rules' patch notes say; a team at it neither sends nor accepts, and the sheets say why" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ревью сразу** (контроллер): упор — граница месяца, что отказ ничего не пишет (ни вызова, ни пары), что считается под блокировкой, что `rehearsal:transitions` 09b (пять пар, по одной на команду) и `smoke:friendly` лимита не задевают.

---

### Task 10: Финальное ревью ∥ снимки рядом с прототипами (контроллер)

Две работы **параллельно** (два агента), результаты — в одну волну исправлений (Task 11). Ничего не исправлять в этой задаче.

**A. Финальное ревью ветки** — шаг 7 протокола (skill requesting-code-review), вся ветка от `origin/redesign`; упор: Review Focus, таблица «Как идёт каждая запись», что видит чужой тренер (Task 1), лимит (Task 9), D2, слова и переносы, CSP, `escapeHtml`, ловушка `check-references`, удалённое 2.x без читателей, что «Матчи», обзор и профиль тренера 09a/10 не изменились (кроме `challengeHref`). Итог — `output/09c/final-review.md` (не коммитится): «Critical / Important / Minor» со ссылками `file:line`.

**B. Снимки** (протокол, шаг 6; требование близости): каждое состояние на 390 и 1440, светлая и одна тёмная палитра, выборочно 768 и 1024; рядом — прототип той же ширины; список отличий. Файлы — `output/screens/rd-09c/` (не коммитятся).

**Files:**
- Create: `docs/redesign/screens/rd-09c.json`

- [ ] **Step 1: Серверы.** `lsof -iTCP:3079 -iTCP:5183 -iTCP:5196 -iTCP:5202 -sTCP:LISTEN || echo free`. Рецепты М и П. Состояния, которые пишут (W1–W3), — последними, по одной ширине; после них mock перезапускается.
- [ ] **Step 2: `rd-09c.json`** — как `docs/redesign/screens/rd-10.json` (`widths` `[390, 1440]`, те же `heights` и варианты), адреса на `5183`, хранилище `gata-league-auth-token: mock`; гость — без хранилища; действия — `run` (нажатия по `data-friendly-*`, ввод в `#friendly-search` с событием `input`), состояние mock — `fetch("/api/mock/challenges/<case>", {method: "POST"})` и перезагрузка.

| id | адрес | действие | ширины | прототип: телефон / десктоп | что проверяет |
|---|---|---|---|---|---|
| C1 | `#/t/t1/challenges` | — | + 768, 1024 | `Challenges` / `DeskChallenges` (страница под окном) | разделы, карточки, история свёрнута |
| C2 | C1 | «Бросить вызов», выбрать `rival` | + 768, 1024 | `ChallengeSend` / `DeskChallenges` | шторка/окно: недавние, остальные, «Вызов отправлен» у `lilit`, команды, сводка |
| C3 | C1 | «Бросить вызов», «raid» | | `ChallengeSendSearch` / — | найдено |
| C4 | C1 | «Бросить вызов», «zzz» | 390 | — | никого не нашли |
| C5 | C1 | «Принять…» у `c1` | | `ChallengeAccept` / — | принятие: вызывающий с TV, свои команды |
| C6 | `#/t/t1/challenges/u3` | — | | `ChallengeSend` / `DeskChallenges` | вызов из профиля: `narek` выбран |
| C7 | `#/t/t1/challenges/u4` | — | 390 | — | занятой — не выбран, чип |
| C8 | C1 | «История вызовов» | 390 | — | история раскрыта |
| C9 | C1 | `empty` | 390, 1440 | — | пусто |
| C10 | C1 | `ru`, `fullPage` | 390 | `Challenges` | кириллица, переносы |
| C11 | C2 | `ru` | 1440 | `DeskChallenges` | кириллица в окне |
| C12 | C2 | случай `limit` (Task 9) | 390 | — | команда на лимите закрыта с причиной |
| P1 | `#/coaches/u3` | — | 390 | `CoachProfile` | «Бросить вызов…» → `#/t/t1/challenges/u3` |
| W1 | C2 | «Вызвать rival» | 390 | — | исходящий появился, шторка закрыта |
| W2 | C5 | «Принять и перейти к подготовке» | 390 | `PreFans` | подготовка нового матча |
| W3 | C1 | «Отклонить» у `c1` | 390 | — | ушёл в историю |
| G1 | C1 гостем | — | 390 | — | гость идёт ко входу |

- [ ] **Step 3: Снять** — `npm run screens -- docs/redesign/screens/rd-09c.json --out output/screens/rd-09c` → `… PNG(s) written …, 0 not taken`; ошибки браузера — `errors.json` (ожидаемых нет).
- [ ] **Step 4: Прототипы рядом.** Каждый прототип таблицы — с `http://127.0.0.1:5196/…` той же шириной (390 и 768 — мобильные, 1440 и 1024 — десктопные) в `output/screens/rd-09c/proto/`; `output/screens/rd-09c/compare.html` (`http://127.0.0.1:5202/compare.html`) — для каждого состояния наш снимок и прототип рядом, под ними список отличий.
- [ ] **Step 5: Список отличий** — каждое видимое отличие строкой: «исправить» (поломка исправляется всегда: текст ниже 4.5:1, перенос короткой подписи или плашки, «…», прячущее данные, горизонтальная прокрутка страницы на 390 и 901, цель меньше 44px до 900px или 24px от 901px, шрифт без кириллицы, лишняя ошибка в консоли, неработающее действие, два `h1`) или «оставить» с причиной (данные mock; решения 1–20 и их записанные расхождения; правило кода или владельца). Итог — `output/09c/fidelity-diffs.md`.
- [ ] **Step 6: Реальный сервер вручную** (встроенный браузер, 3079, `gata_smoke_09c` после `preview:seed`; тестовые значения — из `scripts/seed-pre-match-preview.mjs`): два тренера в двух источниках (`http://localhost:3079` — `preview-home`, `http://127.0.0.1:3079` — `preview-away`). Хозяева: профиль гостей → «Бросить вызов…» → шторка с ними выбранными → «Вызвать»; гости: «Принять…» → своя команда → подготовка; хозяева видят «Принятые». Затем второй вызов — гости отклоняют; третий — хозяева отменяют. В базе: `. output/09c/env.sh && psql "$SMOKE_URL" -Atc "SELECT status, pairing_id IS NOT NULL FROM friendly_challenges ORDER BY created_at DESC LIMIT 3"` → `cancelled|f`, `declined|f`, `accepted|t`. Что увидено и вывод `psql` — в `output/09c/real-server.txt` для PR.
- [ ] **Step 7: Commit** (только конфиг снимков)

```bash
git add docs/redesign/screens/rd-09c.json
git commit -m "test(screens): stage 09c states beside their prototypes — the friendlies page, the challenge sheet and window, the search, the accept sheet, a coach named by the profile, the history, the writes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Одна волна исправлений (контроллер)

- [ ] **Step 1: Сводный список** — `output/09c/final-review.md` и `output/09c/fidelity-diffs.md` в один; Critical и Important ревью и все «исправить» сверки — к исправлению; Minor — исправить, если дешевле, чем объяснить, иначе в PR как известный предел.
- [ ] **Step 2: Исправления** — один исполнитель (или по одному на несвязанные файлы) с этим списком; каждое — коммит `fix(<область>): <что> on <экран>` с трейлером и тестом, где поведение; после — полный прогон (рецепт Т).
- [ ] **Step 3: Пересъёмка** — `npm run screens -- docs/redesign/screens/rd-09c.json --out output/screens/rd-09c --only <ids исправленных>`; `compare.html` обновлён; Critical/Important закрыты — короткая повторная проверка того же ревьюера по диффу волны. Второй волны нет: оставшееся — в PR.

---

### Task 12: Проверки перед PR (контроллер)

- [ ] **Step 1: Шаг 8 протокола**

```bash
npm run build && . output/09c/env.sh && npm test && npm run check && npm run i18n:check
APP_URL=http://localhost:3079 npm run smoke
. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3079 npm run smoke:friendly
. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3079 npm run smoke:pre-match
. output/09c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3079 npm run smoke:post-match
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
print("outside the stage's spaces:", [k for k in new if not k.startswith(("friendly.", "error.FRIENDLY_LIMIT"))])
print("removed:", [k for k in old if k not in en])
PY
git diff --stat origin/redesign -- content/ server/db/migrations/   # пусто
git diff --name-only origin/redesign -- server/                    # server/friendly/challenges.mjs (+ server/http/errors.mjs с Task 9)
wc -l src/screens/matches/challenges*.mjs src/screens/matches/challenges*.css src/data/challenges.mjs src/domain/friendly.mjs server/friendly/challenges.mjs scripts/mock-api.mjs scripts/mock/challenges.mjs scripts/smoke-friendly.mjs src/core/routes.mjs src/screens/coaches/profile.mjs src/app.js
```

Expected:
- всё зелёное; одинаковое число страниц EN/RU, 0 fallback; четыре smoke — `passed` (`smoke:friendly` — с новой строкой Task 1); `rehearsal:transitions` не нужен: принятие вызова сервер не менял, кроме лимита (Task 9 — его ревью сверило пять пар 09b);
- `i18n keys unique`; `missing in ru: []`; вне пространств этапа — `[]` (ключи 09b после ребейза — не новые этого этапа); удалённые — только ключи «Моих игр» 2.x (перечислить в PR);
- `content/` и миграции не менялись (или контент EN+RU — по ответу владельца, вопрос 1); на сервере — только файлы Task 1 и 9;
- каждый файл ≤ 600, `scripts/mock-api.mjs` < 559, `server/friendly/challenges.mjs` ≤ 140, `src/app.js` ≤ 120.
- [ ] **Step 2: `PR-CHECKLIST.md` целиком** — особенно: миграций нет; новые коды ошибок (`FRIENDLY_LIMIT`) — в обоих словарях (`test/api-errors.test.mjs`); перенесённый экран удалил старое («Мои игры» 2.x — да; страница игры 2.x — не переносилась, этап 13); старые адреса (`#/my-games`) ведут на новые (`resolveRedirect`, без изменений); экран совпадает с прототипом — `compare.html`; снимки 390 и 1440, 768 и 1024.

---

### Task 13: Правки спек (контроллер)

PR-CHECKLIST: «Если реализация разошлась со спецификацией — спецификация поправлена в том же PR».

- [ ] **Step 1: Спека 3.0:**
  - §2, таблица маршрутов: `#/t/:teamId/challenges[/:userId]` — «Товарищеские вызовы; с `userId` — шторка вызова с этим тренером (профиль тренера)»; таблица «До своего этапа», строка `#/t/:teamId/challenges`: «вызовы 3.0 (`screens/matches/challenges.mjs`, этап 09c): `Challenges` / `DeskChallenges`; «Мои игры» 2.x удалены» и «Заменит» — «—»;
  - §4: строка `GET /api/challenges` — «`{challenges, teams, opponents}`; с 09c `opponents[].teams: [{id, name, baseTeamSlug}]` и `challenges[].team.baseTeamSlug`; ничего больше о чужих командах»; строки `POST /api/challenges`, `…/:id/accept` — «422 `FRIENDLY_LIMIT {team, limit}` — 3 товарищеских в месяц на команду по часам лиги (09c, ответ владельца)» (или ответ владельца);
  - §6, строка «Матчи …»: «`my-games.mjs` — с 09c» → «ушёл с 09c»; строка «Товарищеские вызовы»: модули 09c (`challenges`, `challenges-model`, `challenges-view`, `challenges-sheets`, CSS `challenges`, `challenges-sheets`; данные `data/challenges.mjs`; домен `domain/friendly.mjs`), «Что уходит» — `components/games/challenges.mjs`, `screens/games/my-games.mjs`, `styles/challenges.css` — ушли с 09c;
  - §7: блок «Расхождения этапа 09c» (прав код или правило владельца) — из решений и Task 10: «Бросить вызов» в полосе десктопа (3), «вызов вчера» и даты вместо «вызвал вчера» и «2 дня» (4), аватары `--header` (6), без опроса (7), «Вызов отправлен» вместо «Уже вызван» (11), сегменты команд — своя группа на 2–4 команды (12), окно принятия десктопа без прототипа (14), строка варианта своей команды `--muted` вместо прозрачности (Task 4), «Отклонить»/«Отменить» без подтверждения (15), переносы вместо «…», история вызовов (вопрос 2); «Передано» 09a и 10 о вызовах — «сделано этапом 09c»;
  - §0 п. 12 или §9 — ответ владельца на вопрос 1 (лимит; команды сезона).
- [ ] **Step 2: Спецификация интерфейса:** §21 — «Как построено на этапе 09c» (решения 1–15; «Лимита по числу вызовов нет» — уточнить: «вызовов — нет; товарищеских матчей — 3 в месяц на команду» или ответ владельца); §23 — «Вызов ведёт в «Мои игры» 2.x … до этапа 09c» → «открывает шторку вызова с этим тренером (`#/t/<активная>/challenges/:uid`); у тренера без команд кнопки нет»; «Известные расхождения», блок 10 (:810) — «вызов из профиля … до 09c» — закрыто; блок «Расхождения этапа 09c».
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-14-redesign-design.md docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md
git commit -m "docs(spec): stage 09c — the friendlies as built: the challenge sheet with its search and recent opponents, the accept sheet, a coach named by the profile, the list naming each coach's teams, the league's friendly limit; the wave's deviations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: PR и после слияния (контроллер)

- [ ] **Step 1: Ребейз** на `redesign` после 09b (если ещё не сделан или влито что-то новое): `git fetch origin && git rebase origin/redesign`; конфликты — словари (объединение ключей), `styles.css` (обе группы строк), `router.mjs`, строка `answerApi` `scripts/mock-api.mjs` (оба ответчика), `site-matchday.css` (удаления обоих этапов); затем Task 0 шаг 2 и Task 12 шаг 1 заново.
- [ ] **Step 2: Тело PR** (`<scratchpad>/pr-rd-09c.md`):
  - пункт этапа 9 плана 3.0 («Вызовы на товарищеские…») и как закрыт; передачи 09a и 10 и как закрыты;
  - таблица «Как идёт каждая запись»; что делают двойное нажатие, потерянный ответ, вызов, отменённый соперником;
  - «Решения этого плана» коротко; ответы на вопросы 1–2 (или принятые умолчания); D2 и правила владельца — что сделано;
  - таблица «Маршруты этапа 09c»;
  - что видит чужой тренер в списке вызовов (Task 1);
  - вывод Task 12 и ручная проверка (`output/09c/real-server.txt`);
  - снимки C1–C12, P1, W1–W3, G1 рядом с прототипами (загрузкой), `compare.html` и список отличий;
  - общие файлы и куски (Global Constraints, «Параллельный этап 09b»), правка профиля тренера 10;
  - известные ограничения: опроса нет (ответ соперника — при входе или возвращении на вкладку); страница игры 2.x — этап 13; лимит — по ответу владельца;
  - правки спек; «Передача дальше»; строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin rd/09c-challenges
gh pr create --base redesign --head rd/09c-challenges --title "rd/09c: friendly challenges in 3.0 — the coach found by name or team, recent opponents, those already challenged, accepting with the team to play, the history; the profile's challenge; the league's friendly limit" --body-file <scratchpad>/pr-rd-09c.md
gh pr merge <номер> --merge
```

После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **Step 3: После слияния** (шаг 10 протокола): в плане 3.0, «Этап 9», пункт «Вызовы на товарищеские…» → `[x]`; в мастер-плане строка `09c` → `[x]` (M3 — ждёт только репетицию); коммит `docs(plan): stage 09c done` прямым коммитом в `redesign`; `git worktree remove ../bb-rd-09c`; база `gata_smoke_09c` — `dropdb`.

---

## Передача следующим этапам

- **M3 · репетиция №2.** Вызовы — через экран 3.0; «вызов принимается» `rehearsal:transitions` (09b) — тем же `POST …/accept`; лимит (Task 9) пять пар 09b не задевает (по одной на команду).
- **12 · админка.** Админ вызовов не видит и не правит (как 2.x); если владелец захочет снимать лимит или закрывать висящие вызовы — это админка. Число лимита — константа `FRIENDLY_LIMIT` (`domain/friendly.mjs`); если владелец сделает его настройкой сезона (как зону плей-офф) — туда.
- **13 · зачистка.** Глоссарий: «Товарищеские», «Бросить вызов», «Вызов отправлен», «Недавние соперники», «История вызовов»; буква тренера в круге — `coachInitial` 09c и `initial` профиля тренера 10 — одним компонентом в `src/ui`; страница игры 2.x (`screens/games/game.mjs`, `components/games/context.mjs`) и ключи `games.*`, которые останутся у неё.
- **Любой этап.** `readChallenges`, `sendChallenge`, `answerChallenge` (`data/challenges.mjs`); `challengesModel`, `sendModel`, `acceptModel`, `recentOpponents`, `matchOpponents`, `busyRecipients`, `dayWord`, `coachInitial` (`screens/matches/challenges-model.mjs`); `challengeUrl` (`core/routes.mjs`); `FRIENDLY_LIMIT`, `friendlyMonth`, `friendliesThisMonth` (`domain/friendly.mjs`); `opponents[].teams` в `GET /api/challenges`.

## Охват

| Пункт | Задача |
|---|---|
| План 3.0, этап 9: «Вызовы на товарищеские: отправить (поиск соперника, «Недавние», «Уже вызван»)» | 1, 2, 4, 6 (решения 8–13, 16) |
| … «принять с выбором команды» | 2, 4, 6 (решение 14) |
| … «отклонить, отменить» | 3, 6 (решение 15) |
| Спека 3.0 §2: `#/t/:teamId/challenges` — 09c; §6: `screens/matches/challenges.mjs`, уходят `my-games.mjs` и `components/games/challenges.mjs` | 6, 7 |
| Спека 3.0 §7 п. 5: поиск, «Недавние», список, «Уже вызван» | 2, 4 (решение 11 — слово нейтральное) |
| Спецификация интерфейса §21: входящие, исходящие, принятые; «не влияет на таблицу»; шторка на всю высоту, окно 760px; принятие с выбором команды | 3, 4, 6 (решения 3–15) |
| Спецификация интерфейса §16: «Товарищеские матчи» ведёт в раздел вызовов | без изменений (ссылки 09a ведут на `teamUrl(id, "challenges")`) |
| Передача 09a: `#/t/:id/challenges` на `my-games.mjs` — удалить с переносом | 6, 7 |
| Передача 10: «Бросить вызов» профиля — соперник выбранным, без `?`-параметров | 5, 6 (решения 13, 19) |
| Контент: лимит товарищеских (3 / 6 в месяц) против кода | 9 (вопрос 1) |
| 2.x: история ответов на вызовы | 2, 3 (решение 5, вопрос 2) |
| Мастер-план 05–13: радиогруппы, Sheet — фокус на открывшего, ключи из шаблонов перебирать | Global Constraints; 2, 4, 6 |
| Решение владельца D2, близость к прототипам, `compare.html` | 3, 4 (значения из прототипов, тесты размеров), 10, 11 |
| Правила владельца: нейтральные слова, переносы, правила лиги решают, процесс «код, затем проверки» | Global Constraints; 2–4, 9; Task 10–14 |
| Протокол: шаги 6–10 | 10, 11, 12, 13, 14 |
| Правила проекта: бюджеты, `check-references`, CSP, `escapeHtml`, 900/901, явная типографика, `content/` не меняется, 2.x удаляется с переносом | Global Constraints; 7, 12 |

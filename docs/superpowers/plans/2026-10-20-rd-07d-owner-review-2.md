# Этап 07d · Дополнение 2: второй круг замечаний владельца к compare.html — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** четыре замечания владельца к финальному `compare.html` этапа 07d (2026-10-20, круг 2) сделаны до снимков и PR: (1) обзор команды — как `DeskOverview.html` и `mobile/Team.html`: верхние плитки, карточки лидеров, порядок блоков, строки результатов, мини-таблица, табло; (2) «Настройки команды» — свой экран «вглубь» на телефоне (тёмная шапка с «‹», как `Builder.html`) и карточка в правой колонке «Команды» на десктопе (как карточка «Команда» `DeskBuilder.html`), нижняя секция уходит; (3) смены расы нет совсем: раса только показана; (4) «Новая команда» — шторка (телефон) и окно (десктоп) над текущим экраном (`TeamNew.html`, `DeskTeamNew.html`), после «Создать» — набор, как сейчас.

**Architecture:** второе дополнение к плану `docs/superpowers/plans/2026-10-19-rd-07d-profile.md` («план 07d») и к дополнению `docs/superpowers/plans/2026-10-20-rd-07d-owner-review.md` («дополнение 1»), та же ветка и та же нумерация: Task 30–40; задач контроллера здесь нет — после Task 40 контроллер повторяет Task 17–19 плана 07d (раздел «После Task 40»). Сервер, миграции, mock-api и `content/` не меняются. Обзор получает признак ширины (`phone`, как «Состав») и рисует одну форму на ширину; новые числа (разница TD/CAS, мини-таблица) — чистые функции `src/data/team-record.mjs` над тем, что уже присылают `/api/games` и `/api/season`. «Настройки команды» — новый адрес `#/t/:id/settings` (маршрут `teamSettings`, экран «вглубь» в модели оболочки, как адрес игрока); телефон рисует там свой экран, десктоп — страницу «Команда» с карточкой справа; правила записи Task 14–15 не меняются, кроме ушедшей расы. Первый шаг новой команды — шторка в своём хосте на `<body>`; память набора переезжает из `new.mjs` в свой модуль, чтобы шторку открывали и экраны, и оболочка без цикла импортов; `#/teams/new` остаётся адресом набора.

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/fake-dom.mjs`, `fake-api.mjs`, `ui.mjs`, `contrast.mjs`, `ref-screen.mjs` (`withWindow`), нативный `<dialog>`; CSS custom properties.

**Spec:**
- План 07d — «Global Constraints», «Решения этого плана» (решения 24–31), Task 12, 14, 15; дополнение 1 — «Global Constraints», решения 32–46. Это дополнение меняет решения 26–28 плана 07d и ruling K17 (см. «Что меняется»).
- Рабочая папка `.superpowers/sdd/2026-10-19-rd-07d-profile/`: `progress.md`, раздел «Owner review of the final compare.html (2026-10-20, round 2)» — замечания и ответы владельца (обязательны); `constraints.md`, `rulings.md`, `parked.md`.
- Ответы владельца 2026-10-20, круг 2 (обязательны): **настройки** — «Ориентируйся на макет. Это отдельный экран на мобилке, справа на десктопе, есть кнопка назад в мобильной версии»; **создание** — «Шторка, как в TeamNew»; **раса** — смена убрана совсем, раса только для чтения; админская правка — на редакторе 2.x до этапа 12.
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §2 (таблица адресов), §6, §7; спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §3, §4, §5 («страница `#/teams/new` (не шторка над обзором)» — владелец отменяет), §7, §14, «Известные расхождения» 9, 11, 12, 17. Их правит контроллер после Task 40.
- Прототипы (значения в задачах прочитаны из их HTML): `desktop/DeskOverview.html`, `mobile/Team.html`; `mobile/Builder.html`, `desktop/DeskBuilder.html` (карточка «Команда»), `mobile/TeamManage.html`, `desktop/DeskRosterFunds.html` (страница «Команда»); `mobile/TeamNew.html`, `desktop/DeskTeamNew.html`. Снимки сравнения: `output/screens/rd-07d/O1-1440-light.png`, `O1-390-light.png`, `S1-1440-light.png`, `S1-390-light.png`, `proto/DeskOverview-1440-light.png`, `proto/Team-390-light.png`, `proto/DeskBuilder-1440-light.png`, `proto/BuilderFull-390-light.png`, `proto/TeamNew-390-light.png`, `proto/DeskTeamNew-1440-light.png`.
- Код (проверено на `31bbbff`): `src/screens/team/overview.mjs` (`overviewModel` :138, `boardOf` :88, `leadersMarkup` :246, `resultsMarkup` :261, `overviewMarkup` :274), `overview.css`, `src/data/team-record.mjs` (`teamLeaders` :182, `recentResults` :122, `seasonRecord` :68), `src/ui/kpi-tile.*`, `src/ui/match-board.*`, `src/screens/team/manage/{index,settings,settings-sheet}.mjs` и `settings.css`, `src/domain/roster/team-edits.mjs` (`withRace` :121), `src/data/treasury.mjs` (`assertSameRace` :244, `saveTeamRoster` :265), `src/core/routes.mjs` (`TEAM_ROUTES` :25, `TEAM_SECTIONS` :28, `ID_ROUTES` :166), `src/core/router.mjs`, `src/shell/{navigation,shell,team-switcher}.mjs`, `src/screens/teams/{new,builder-view,index}.mjs`, `new.css`, `src/screens/team/empty.mjs`, `src/app.js`.

## Global Constraints

- **Весь блок Global Constraints плана 07d** и **дополнения 1**, и `constraints.md` рабочей папки — в силе для каждой задачи ниже: окружение `output/07d/env.sh`, серверы 3074 / 5178, инварианты «Состава» 07a–07c (R1–R18, K6/K7/K14), D2, токены цвета, CSP, `t()` и оба словаря, `escapeHtml`, бюджеты, ловушка `check-references`, брейкпоинты 900/901, явная типографика нового CSS, радиогруппы, рецепты Т/С/М, стоп-условия, коммит с трейлером `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Ниже — только то, что это дополнение добавляет или меняет.
- **База и HEAD:** worktree `/Users/felstell/git/bb-rd-07d`, ветка `rd/07d-profile`, HEAD `31bbbff` или новее. Каждая задача начинает с `git log --oneline -3` и `git status --short`; ссылки — по именам функций, номера строк — подсказки. Чужие незакоммиченные правки не трогать.
- **БЛИЗОСТЬ К ПРОТОТИПАМ обязательна:** значения размеров, шрифтов, радиусов, отступов и цветов — из HTML названного прототипа (цвет — токеном: кольцо прототипа `inset 0 0 0 1px #DCE3DF` — `var(--ring)` (`--line-strong`), `#E6EBE8` — `--line`, `#C9D3CE` — `--control-border`, `#F3F6F4` — `--surface-2`, `#EEF2F0` — `--surface-3`, `#E4F0E9` — `--accent-tint`, `#F1F8F4` — `--accent-tint-soft`, `#2F7A52` текстом — `--accent-text`, `#5F6B65` и `#8A948F` — `--muted`, `#3E4A44` — `--ink-2`, `#17392C` — `--header`, `#CFE0D7` — `--header-muted`). Каждое вынужденное отличие (D2, контраст 4.5:1, нейтральные слова, перенос вместо «…», ссылка не может стоять внутри ссылки, данных нет) записывается в отчёт задачи разделом «Deviations from the prototype» с причиной.
- **D2:** до 900px нажимаемое от 44px; от 901px — как в прототипе, не меньше 24px. **Слова** нейтральные (без рода игрока). **Переносы:** в новых правилах нет `text-overflow: ellipsis` и `white-space: nowrap` у имён и названий.
- **Ключи словарей** — в пространствах `teamOverview.*`, `teamSettings.*`, `newTeam.*`, `teams.*`; в обоих словарях, с одинаковыми плейсхолдерами. Ключи, которые больше никто не говорит, удаляются из обоих словарей в той же задаче.
- **Пределы:** любой файл ≤ 600 строк (CSS тоже), функция ≤ 80, 0 недостижимых функций (`npm run check`); `src/screens/team/manage/index.mjs` ≤ 210; `scripts/mock-api.mjs` 599 — не трогается; `src/app.js` ≤ 120 (Task 40 добавляет одну строку); `src/screens/team/overview.css` ≤ 600 — поэтому лидеры, результаты и таблица уходят в новый `overview-lists.css`. Новый `.css` — `@import` в конце `src/styles.css`.
- **Сервер, миграции, `content/`, mock-api, smoke** не меняются. Правка сервера — стоп-условие.
- **Инварианты 08 держатся:** казна (одна запись в пути, 409 и потерянный ответ — как `write` в `treasury.mjs`), ресурсы, Coach's Safe, исправление казны, история — их разметка, порядок на телефоне (карта казны, сейф, исправление, ресурсы, история) и проводка не меняются; меняются только место настроек и сетка колонок десктопа (Task 36).
- **Правила записи настроек (Task 14–15 плана 07d, финальное ревью I1)** держатся: причина закрытия по порядку (матч → очередь «Состава» → запись в пути), спрашивается в момент нажатия; слова сброса подготовки (`prepResetWords("teamSettings.prep")`) в секции и шторках; одна запись в пути (`sheetController`, `gate`); `sessionTokenHolds` (внутри `write`); `saveTeamRoster` с `identity` `{name?, logoData?}`. Свежее чтение команды перед записью (K17) было только у смены расы и уходит с ней.
- **Редактор 2.x** (`src/screens/saved-roster.mjs`, `src/components/roster-editor/*`) и его ключи (`roster.raceLockedInSeason` и др.) не меняются: админская правка `adminTeamEdit` остаётся на нём до этапа 12.
- **Набор (`builder-view.mjs`) не меняется**, кроме того, что нужно потоку: `onRestart` получает нажатую кнопку, у «Сменить расу или название» — `aria-haspopup="dialog"` (Task 39).

## Review Focus

1. **Обзор, пока игры или таблица не прочитаны, не пришли, или команда вне сезона.** Ожидание: ничего, что противоречило бы данным: «Очки» без «· В/Н/П», «TD ± / CAS ±» и «В · Н · П» — «–», пока игры не прочитаны; без таблицы — ни места, ни мини-таблицы; вне сезона — две плитки и правая колонка только с «Готовы к прокачке» (или её нет). Тесты: Task 31 «before the games are read the record and the difference say «–»; outside the season two tiles on both widths», Task 33 «no table without the season's table, outside the season, or on a phone».
2. **Ширина меняется на открытом экране** (окно сужено, планшет повёрнут). Ожидание: обзор перерисовывается в форму ширины (плитки, лидеры, результаты), адрес настроек переходит между экраном «вглубь» и страницей «Команда» с карточкой; фокус не теряется на `body`. Тесты: Task 31 «the overview follows the width: a desk turned phone draws Team.html's tiles, and back», Task 36 «the settings' address follows the width».
3. **Настройки на своём экране телефона закрыты** (идёт матч, ждёт шаг «Состава», идёт подготовка, в соседней вкладке другой тренер). Ожидание: экран говорит почему (плашка), кнопки строк `aria-disabled` с причиной, нажатие — слова, ничего не уходит; «‹» ведёт назад на «Команду». Тест: Task 36 «held on its own screen as on the page: a match on, the roster's queue, a preparation's words; «‹» still leads back».
4. **Шторка новой команды на краях:** название из пробелов, раса не выбрана, набранный состав и другая раса, двойное нажатие «Создать», «назад» браузера при открытой шторке, `#/teams/new` без набора (набран руками, перезагрузка, гость после входа). Ожидание: кнопка говорит, чего не хватает; другая раса предупреждает; одно нажатие — один набор и один переход; смена адреса закрывает шторку; без набора — «Мои команды» с открытой шторкой. Тесты: Task 39 «a name of blanks or no race keeps «Create» shut, saying what is missing; typing keeps the caret», «a second press on «Create» makes nothing more: one build, one change of address», «the cross, the backdrop and Escape close it with the focus back where it was; a link in it, and a change of address, close it», «#/teams/new with no build is «My teams» with the sheet open over it; with a build, the builder».
5. **Раса не меняется ни одной записью.** Ожидание: `identity` с расой её не отправляет — уходит раса команды; команда старого импорта (`roster.teamSlug` ≠ колонке) сохраняется под расой колонки, как до 07d, без исключения; ни на одном экране тренера нет кнопки смены расы. Тесты: Task 35 «an identity that names a race sends the team's race», «a team whose stored roster names another race than its column saves under the column's race», «the race is read only on every width and in every state».

---

## Решения этого дополнения

Нумерация продолжает дополнение 1 (последнее — 46). Контроллер подтверждает до исполнения.

**Обзор команды** (замечание владельца 1)

47. **Одна форма на ширину.** `overviewModel({…, phone})`: экран спрашивает `isPhone()` (`src/screens/team/roster/screen.mjs`) при каждом рисунке и перерисовывается при смене ширины (`onPhoneChange`, Task 31), как «Состав». Исключение — «Доступна прокачка» / «Готовы к прокачке» (Task 12 плана 07d): рисуются обе, CSS показывает одну, как сейчас.
48. **Плитки.** Десктоп (`DeskOverview.html`, пять карточек): «Место в лиге» `2` + `/ 10` (вторая часть 20px `--muted`), «Очки · В/Н/П» `13` + `· 4/1/1` (22px `--muted`), «Стоимость команды», «Казна» (ссылка на «Команду», спецификация §3), «TD ± / CAS ±» `+6 / +4` — `--accent-text`, когда обе разницы ≥ 0 и хотя бы одна > 0. Телефон (`Team.html`, четыре плитки): «Стоимость команды», «Казна», «В · Н · П» `4 · 1 · 1`, «TD / CAS разница» `+6 / +4` (цвет текста); место — в подзаголовке шапки телефона. Вне таблицы сезона — две плитки (стоимость, казна) на обеих ширинах. Разница — по тем же матчам, что В/Н/П: лига активного сезона, счёт подтверждён, bye не в счёт (`seasonDifference`, Task 30); знак «+», ноль «0», минус «−» (U+2212). Пока игры не прочитаны: «Очки» без второй части, «В · Н · П» и разница — «–».
49. **Поиск в шапке десктопа** (`DeskOverview.html`: поле 320×44 справа). Механизм этапа 11 (§24–26): `renderSearchField` с `data-search-all`, `wireRefSearch(view, {onQuery: goSearch})` — набор переносит на `#/ref` с запросом и кареткой в поле. Слова — поля справочника (`ref.search`, `search.placeholder`): прототипное «Игроки, навыки, правила…» обещало бы игроков, а справочник их не ищет — отличие записывается. До 900px поля нет (шапка там только для диктора).
50. **Лидеры.** Десктоп — карточки `DeskOverview.html`: ярлык (SPP, TD, CAS, COMP), под ним номер на цвете позиции (`renderPlayerBadge`), имя и позиция, справа число Oswald 30 `--accent-text`; карточка — ссылка на адрес игрока (`teamPlayerUrl`: на десктопе «Состав» с ним в панели). Телефон — строки `Team.html` под «Лидеры»: ярлык, имя и рядом «#3 Catcher» 13px `--muted`, справа число 18/700, у SPP — `--accent-text`, у остальных — цвет текста; строка целиком — ссылка на игрока (D2: в прототипе ссылка только имя, 32px). Без id игрока — не ссылка. `teamLeaders` отдаёт `id` и `kind` (Task 30).
51. **Порядок блоков.** Десктоп (`DeskOverview.html`): после табло — две колонки, `flex-wrap`: левая (`2 1 560px`) — «Лидеры команды», «Результаты»; правая (`1 1 300px`) — «Готовы к прокачке», «Таблица». Колонка без содержимого не рисуется, и другая берёт ряд. Телефон (`Team.html`): плитки, «Доступна прокачка», табло (вопрос 2), «Лидеры», «Последние матчи» — как сейчас.
52. **Результаты.** Десктоп — карточка с шапкой внутри («Результаты», «Весь сезон →»), строка — сетка `30px 60px minmax(0,1fr) 90px 70px`: значок результата 30px, «Тур 6» (у товарищеского — «Товарищеский»), соперник и под ним его раса текстом 12px `--muted`, «CAS 3–1», счёт Oswald 26. Строка целиком — ссылка на матч (спецификация §3), поэтому ни имя, ни раса не ссылки (в прототипе — ссылки на команду соперника и на правила расы; ссылка внутри ссылки невозможна — отличие). MVP — вопрос 3. Пять строк (§3; в прототипе шесть). Телефон — как сейчас, кроме счёта 18/700 шрифтом текста и колонки значка 32px (`Team.html`).
53. **Мини-таблица** (вопрос 1; по умолчанию — в 07d). Правая колонка десктопа, под «Готовы к прокачке»: «Таблица», «Вся таблица →» (`seasonTabUrl()`); шесть первых мест по `rank` без выбывших, своя строка — последней, если команда ниже шестой (`seasonTable`, Task 30); строка: место 14/700 `--muted`, название — ссылка (своя — обзор, чужая — `playerTeamUrl(userId, teamId)`), разница TD со знаком (`--accent-text` больше нуля, иначе `--muted`), очки 16/700; своя строка — фон `--accent-tint`, название 700. Разница TD — из `rounds[].pairings` ответа `/api/season` (обе стороны и оба `points` есть; bye не в счёт). Зоны плей-офф прототипа (зелёные места 1–4, черта 2px под четвёртым) нет: `content/Gata/Rules/3. Team Management.md` ставит выход в плей-офф в зависимость от числа участников.
54. **Табло, десктоп.** У нашего названия — герб лиги 52×59 (`renderCrest`, как в SideNav); у соперника — круг 52px с первой буквой названия; раса соперника — ссылка на правила расы (`pageUrl({slug})`, значок книги 12px, подчёркнута), за ней «· 5-е» (короткое место, `teamOverview.opponentPlace`). На телефоне ни герба, ни круга; раса — текстом, место — тем же коротким словом. Не делается: TV соперника (этап 09, нужен `GET /api/players/:uid/teams/:tid`, §3), пузыри «+90k на индьюсменты» и «N игроков пропускают матч» (подготовка, этап 09a, §17), листание табло по турам, «‹ ›», квадраты-вкладки и «Т» среди квадратов («Известные расхождения» 9: решает этап 09).
55. **Табло на телефоне остаётся** (вопрос 2; в `Team.html` его нет).

**«Настройки команды»** (замечание владельца 2)

56. **Адрес** `#/t/:id/settings` — маршрут `teamSettings`, экран команды (`TEAM_ROUTES`: команда готовится, становится активной, гостя ведёт ко входу); в модели оболочки — «вглубь», как `teamPlayer` (`drill`); владельцы вкладок — как у `teamManage` (`["team", "roster"]`); выбор другой команды в переключателе ведёт на её настройки.
57. **Телефон.** Страница «Команда» (`#/t/:id/team`) вместо секции рисует последним блоком, после «Истории», строку-ссылку «Настройки команды» (`renderNavRow`, подпись «Название, лига, логотип, Dedicated Fans, порядок в составе») в рамке карточки «Истории». `#/t/:id/settings` — свой экран: тёмная шапка `Builder.html` (круглая «‹» на `#/t/:id/team`, «Настройки команды» — `h1`, под ним «название · раса»), под ней строки карточки, проверка состава, плашки «закрыто» и «подготовка»; ни казны, ни ресурсов, ни истории. Шторки строк — те же, поверх экрана.
58. **Десктоп.** Оба адреса рисуют страницу «Команда»; карточка настроек — последняя в правой колонке, под «Историей» (сетка `.g-manage__cols`: `"resources side" "resources history" "resources settings"`); на адресе настроек фокус — на заголовке карточки (`#team-settings-title`, `tabindex="-1"`), и она прокручивается в вид. Секции во всю ширину под колонками больше нет.
59. **Вид карточки** — карточка «Команда» `DeskBuilder.html` / `Builder.html` (Task 37). На десктопе заголовок карточки — «Настройки команды», а не «Команда» прототипа: карточка стоит на странице «Команда»; на телефоне `h2` нет — экран называет шапка (`h1`). Порядок строк — наш (название, раса, лига, Favoured of…, логотип, Dedicated Fans, порядок, проверка): в прототипе только раса, лига, логотип.
60. **Запись настроек не меняется** (Global Constraints, «Правила записи»).

**Раса** (замечание владельца 3)

61. **Раса только для чтения**: строка «Раса · Human · Tier 1» без кнопки и без подписи о сезоне, на обеих ширинах и в любом состоянии. Уходят `withRace` и `RACE_STAFF` (`team-edits.mjs`), отказы `RACE_*`, шторка расы, красная кнопка, свежее чтение (K17), их ключи, CSS и тесты. `assertSameRace` (`treasury.mjs`) уходит тоже: он ловил только черновик чужой расы, который делал `withRace`, а все три вызова `saveTeamRoster` (ресурсы, исправление казны, настройки) шлют черновик сохранённого состава этой же команды. `identity.baseTeamSlug` больше не читается: раса уходит как у команды — в колонке и в `roster.teamSlug`, как до 07d. Админская правка 2.x свою смену расы сохраняет (этап 12).

**«Новая команда»** (замечание владельца 4)

62. **Первый шаг — шторка над текущим экраном** (телефон — снизу, `TeamNew.html`; десктоп — окно 760px, отступ сверху 64px, `DeskTeamNew.html`): «Новая команда», под ним название сезона (или «Gata League» — расхождение 14 остаётся), поле «Название», «Раса» — радиогруппа, «Правила рас и стартовый бюджет — в справочнике →», кнопка «Создать «…»» говорит, чего не хватает. «Создать» начинает набор, как сейчас (та же раса сохраняет набранное, другая начинает заново и предупреждает), и открывает `#/teams/new` — набор. На сервер ничего не пишется.
63. **`#/teams/new` — адрес набора.** С начатым набором — набор. Без него (набран руками, перезагрузка, `#/builder` 2.x, ссылка «Создать команду» экрана сезона 2.x, гость после входа) — `location.replace("#/teams")` и шторка над «Моими командами» (`askNewTeamSheet`), фокус после закрытия — на кнопку «Новая команда» страницы (у тренера без команд — «Создать команду»).
64. **Откуда открывается:** «Новая команда» переключателя команд (телефон — «‹» в шапке шторки, десктоп — «← Мои команды» в подвале окна возвращают в переключатель; в прототипе это второй шаг той же шторки — у нас две шторки подряд, отличие), кнопка «Новая команда» страницы «Мои команды», «Создать команду» пустого обзора (тренер без команд), «Сменить расу или название» набора (шторка над набором). Кроме переключателя, возврата нет — только крест: возвращаться некуда.
65. **Память набора** (название, раса, черновик, `startedAt`) — модуль `src/screens/teams/new-flow.mjs` (Task 38): её читают набор и шторка; набранное в шторке видно при следующем открытии; конец сессии и другой тренер начинают с нуля (K6a, как сейчас).
66. **Шторка закрывается** крестом, фоном, Escape (фокус — туда, откуда открыта), ссылкой в ней и любой сменой адреса (`hashchange`); «Создать» закрывает её без возврата фокуса — его берёт заголовок набора.

### Что меняется в решениях плана 07d, дополнения 1 и спеки

- **Решение 26 плана 07d:** настройки — не последняя секция страницы, а экран `#/t/:id/settings` на телефоне и карточка правой колонки на десктопе (решения 56–59).
- **Решение 27:** свежее чтение перед записью — было только у расы, уходит. **Решение 28 и ruling K17** — отменены (решение 61).
- **Решение 22 плана 07d / спецификация §3, «Как построено на 07d»:** «Готовы к прокачке» — правая колонка, а не во всю ширину под колонками (решение 51).
- **Решение 11 плана 06 / спецификация §3:** плитки по ширине (решение 48), лидеры — карточки и строки прототипов (50), мини-таблица и поиск в шапке — сделаны (49, 53).
- **Спецификация §5 и «Известные расхождения» 11:** «Новая команда» — шторка над текущим экраном (решения 62–66).

## Вопросы владельцу

Исполнители идут по умолчаниям; иной ответ — правка, названная в вопросе.

1. **Мини-таблица «Таблица» в правой колонке обзора** (`DeskOverview.html`). Спецификация §3 и «Известные расхождения» 17 отдавали её этапу 10. Данные есть: места и очки — `standings` ответа `/api/season`, разница TD — его же `rounds[].pairings`. *По умолчанию:* строим в 07d (Task 33, решение 53) без зоны плей-офф (контент не ставит её на четыре места). Ответ «этап 10» — Task 33 без `tableMarkup`, Task 30 без `seasonTable`.
2. **Табло матча на телефоне.** В `mobile/Team.html` его нет: после «Доступна прокачка» сразу «Лидеры». *По умолчанию:* табло остаётся — до этапа 09a вкладка «Матчи» телефона рисует экран 2.x, и табло обзора — единственный путь 3.0 к «Подготовке к матчу» с телефона. Ответ «убрать» — одно правило `.g-board { display: none; }` до 900px в `overview.css` и тест.
3. **MVP в строках «Результатов» десктопа** («Орки · MVP Gruk»). `/api/games` MVP не присылает: это запись игрока в итогах (`match_events`, миграция 016); чтение по матчу — запрос на строку. *По умолчанию:* строка без MVP (решение 52). Ответ «нужен MVP» — поле в `publicGame` сервера, этапом 09b или малым PR.

## Все отличия обзора от прототипов

Сверка `O1-1440-light.png` с `proto/DeskOverview-1440-light.png` и `O1-390-light.png` с `proto/Team-390-light.png` и HTML прототипов.

| № | Где | Прототип | У нас | Что делаем |
|---|---|---|---|---|
| 1 | шапка, Д | поле поиска справа, 320×44, радиус 12, `--surface-2` | нет | Task 31 (решение 49) |
| 2 | шапка, Д | «Сезон [N] · после 6 тура» | «Mock Season · round 3» | оставляем: слова §3 (этап 06), в прототипе заглушка |
| 3 | плитки, Д | пять белых карточек в кольце, радиус 14, 14 16, число Oswald 34 | четыре плитки `--surface-2` без кольца, 30px со сжатием | Task 31 |
| 4 | плитки, Д | «TD ± / CAS ±» `+6 / +4` зелёным | нет | Task 31 |
| 5 | плитки, Д | «2 / 10», «13 · 4/1/1»: вторая часть 20/22px `--muted` | одним кеглем | Task 31 |
| 6 | плитки, Д | сетка `auto-fit, minmax(180px, 1fr)`, зазор 12 | один ряд, кегль сжимается | Task 31 |
| 7 | плитки, М | стоимость, казна, «В · Н · П», «TD / CAS разница» | место, очки, стоимость, казна | Task 31 |
| 8 | табло, Д | герб 52×59 у нашего названия | нет | Task 34 |
| 9 | табло, Д | круг 52px с буквой соперника | нет | Task 34 |
| 10 | табло, Д | раса соперника ссылкой, «5-е» | «Dwarf · #1 in the league» текстом | Task 34 |
| 11 | табло, Д | «TV 1 210k» соперника | нет | оставляем: этап 09 (§3) |
| 12 | табло, Д | пузыри индьюсментов и пропусков | нет | оставляем: этап 09a (§17) |
| 13 | табло, Д | «‹ ›», квадраты-вкладки, «Т», прошлые матчи с CAS и MVP | квадраты-не-ссылки | оставляем: «Известные расхождения» 9 (этап 09) |
| 14 | табло, М | табло нет | есть | вопрос 2 (по умолчанию остаётся) |
| 15 | порядок, Д | слева лидеры и результаты, справа «Готовы к прокачке» и таблица | лидеры и результаты рядом, «Готовы» во всю ширину | Task 32 |
| 16 | лидеры, Д | ярлык; номер на цвете позиции, имя 13/600, позиция 12; число справа Oswald 30 | ярлык и число сверху, «#3 Piranha Warrior Blitzer» под именем | Task 32 |
| 17 | лидеры, Д | кольцо `#DCE3DF` тенью, сетка `minmax(150px, 1fr)`, карточка — ссылка | рамка 1px, `minmax(120px, 1fr)`, не ссылка | Task 32 |
| 18 | лидеры, Д | имя `nowrap` | переносится | оставляем: ответ владельца о переносах |
| 19 | лидеры, М | «Лидеры»; «#3 Catcher» рядом с именем; число 18/700, зелёное у SPP | «Лидеры команды»; подпись под именем; все зелёные | Task 32 |
| 20 | лидеры, М | ссылка — имя (32px) | не ссылка | Task 32: строка целиком (D2) |
| 21 | результаты, Д | карточка с шапкой внутри, «Результаты» | заголовок над карточкой, «Последние матчи» | Task 33 |
| 22 | результаты, Д | значок 30, «Тур 6», соперник и раса, «CAS 3–1», счёт Oswald 26 | значок 28, «Round 2 · CAS 0–1» под соперником, счёт 22 | Task 33 |
| 23 | результаты, Д | имя — ссылка на команду, раса — на справочник | строка — ссылка на матч | оставляем: §3 «строка открывает матч»; раса текстом |
| 24 | результаты, Д | «· MVP Gruk» | нет | вопрос 3 |
| 25 | результаты, Д | шесть строк | пять | оставляем: §3 |
| 26 | результаты, М | счёт 18/700 шрифтом текста, колонка значка 32 | Oswald 22, колонка 28 | Task 33 |
| 27 | результаты, М | без «Весь сезон →» | «Весь сезон →» | оставляем: §3, путь к матчам |
| 28 | таблица, Д | «Таблица» справа | нет | Task 33 (вопрос 1) |
| 29 | таблица, Д | места 1–4 зелёные, черта под 4-м | — | не рисуем: контент не ставит плей-офф на четыре места |
| 30 | таблица, Д | название `nowrap` с «…» | — | переносится (ответ о переносах) |
| 31 | «Готовы к прокачке», Д | «7 игроков» | «игроков: 7» | оставляем: §7 плана 07d (без форм множественного числа) |
| 32 | SideNav, Д | «Люди · Gata League» | «Amazon» | оставляем: §0 «Навигация» (этап 05) |

## Файлы

| Файл | Задача | Что |
|---|---|---|
| `src/data/team-record.mjs`, `test/team-record.test.mjs` | 30 | разница сезона, лидеры с id и видом позиции, раса соперника, мини-таблица |
| `src/ui/kpi-tile.{mjs,css}`, `src/screens/team/roster/screen.mjs` (`onPhoneChange`), `src/screens/team/overview.{mjs,css}`, оба словаря, `test/team-overview.test.mjs`, `test/ui-match.test.mjs` | 31 | плитки обеих ширин, поиск в шапке, признак ширины |
| `src/screens/team/overview-lists.{mjs,css}` (новые), `overview.{mjs,css}`, `src/styles.css`, оба словаря, `test/team-overview.test.mjs` | 32 | лидеры, порядок блоков |
| `overview-lists.{mjs,css}`, `overview.{mjs,css}`, оба словаря, `test/team-overview.test.mjs` | 33 | результаты, мини-таблица |
| `src/ui/match-board.{mjs,css}`, `overview.mjs`, оба словаря, `test/ui-match.test.mjs`, `test/team-overview.test.mjs` | 34 | табло: герб, буква, раса |
| `src/domain/roster/team-edits.mjs`, `src/data/treasury.mjs`, `src/screens/team/manage/{settings,settings-sheet}.mjs`, `settings.css`, оба словаря, `test/team-edits.test.mjs`, `test/treasury-data.test.mjs`, `test/team-settings.test.mjs` | 35 | смены расы нет |
| `src/core/{routes,router}.mjs`, `src/shell/{navigation,team-switcher}.mjs`, `src/screens/team/manage/{index,settings,strip}.mjs`, `settings-screen.mjs` (новый), `settings.css`, `manage.css`, оба словаря, `test/routes.test.mjs`, `test/shell-navigation.test.mjs`, `test/shell-markup.test.mjs`, `test/team-switcher.test.mjs`, `test/team-settings.test.mjs`, `test/team-manage.test.mjs` | 36 | свой экран и карточка справа |
| `settings.css`, `settings.mjs`, `src/ui/icons.mjs`, `test/team-settings.test.mjs`, `test/ui-kit.test.mjs` | 37 | вид карточки |
| `src/screens/teams/new-flow.mjs` (новый), `new.mjs`, `test/new-team-screen.test.mjs` | 38 | память набора в свой модуль (перенос) |
| `src/screens/teams/new-sheet.mjs` (новый), `new-flow.mjs`, `new.mjs`, `builder-view.mjs`, `new.css`, `src/screens/teams/index.mjs`, `src/screens/team/empty.mjs`, `src/ui/button.mjs`, `test/new-team-screen.test.mjs`, `test/builder-view.test.mjs`, `test/teams-screen.test.mjs`, `test/team-empty.test.mjs`, `test/home-route.test.mjs`, `test/ui-controls.test.mjs` | 39 | шторка «Новая команда» |
| `src/shell/{team-switcher,shell}.mjs`, `team-switcher.css`, `src/app.js`, `test/team-switcher.test.mjs`, `test/shell-frame.test.mjs` | 40 | «Новая команда» из переключателя |
| `docs/redesign/screens/rd-07d*.json`, спеки, PR | 17–19 плана 07d | контроллер, после Task 40 |

Рецепты Т, С, М — раздел «Рецепты проверки» плана 07d.

---

### Task 30: Данные обзора — разница сезона, лидеры, раса соперника, таблица

**Files:**
- Modify: `src/data/team-record.mjs` (импорт `positionKind` из `../domain/roster/players.mjs`; шапка модуля — плюс разница и таблица)
- Test: `test/team-record.test.mjs`

**Interfaces:**
- Consumes: `gameSides`, `gameOutcome`, внутренние `seasonGames`, `count`; `selectedRosterPlayers`, `positionKind` (`players.mjs`).
- Produces (чистые, без DOM и `t()`):
  - `seasonDifference(games, teamId, seasonId) → {touchdowns: number, casualties: number}` — сумма «свои − чужие» по `seasonGames(games, teamId, seasonId)`, у которых `gameOutcome` не `null` (тот же набор, что `seasonRecord`).
  - `teamLeaders(savedTeam, raceTeam)` — каждый элемент плюс `id: string` (`String(player.id ?? "")`) и `kind` (`positionKind(player.row)`); выбор и порядок прежние.
  - `recentResults(games, teamId, limit)` — каждый элемент плюс `opponentRace: string` (`game[sides.other].team?.baseTeamSlug ?? ""`).
  - `seasonTable(seasonData, teamId, limit = 6) → {teamId: string, userId: string, name: string, rank: number, points: number, touchdowns: number, own: boolean}[]` — строки `standings` без `withdrawnAt`, по `rank`; `touchdowns` — сумма «свои − чужие» TD по `seasonData.rounds[].pairings`, где есть `homeEntryId` и `awayEntryId` и оба `homePoints`/`awayPoints` не `null` (числа — `Number(x) || 0`), для `entryId` строки; первые `limit`; если своей строки среди них нет, последняя из них уступает место своей. Нет `standings` — `[]`.

- [ ] **Step 1: Падающие тесты** в `test/team-record.test.mjs`:
  - «the season's TD and CAS difference: the league's confirmed matches of the season, from the team's side; a friendly, another season, a bye and an unconfirmed score add nothing» — матчи: свой дома 2–1 / CAS 1–0, в гостях 0–2 / CAS 0–2, товарищеский 3–0, матч другого сезона 5–0, bye, неподтверждённый 4–0 → `{touchdowns: -1, casualties: -1}`.
  - «a leader carries the player's id and the kind of the position: the badge's colour and the way to the player» — `id` из состава, `kind === positionKind(row)`; игрок без id — `id: ""`.
  - «a recent result names the opponent's race by its slug» — `opponentRace: "teams/dwarf"`; соперник без `baseTeamSlug` — `""`.
  - «the season's table for the overview: the first six by rank without the withdrawn, the team's own row last when it ranks lower, each team's TD difference from the rounds' pairings» — восемь строк, одна выбывшая, своя — восьмая: ранги `[1, 2, 3, 4, 5, 8]`, у своей `own: true`; пара без очков и bye в разницу не входят; `seasonTable(null, "t1")` и `{}` → `[]`.
  - Существующие `deepEqual` тесты `teamLeaders` и `recentResults` — с новыми полями.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-record.test.mjs` → FAIL (нет `seasonDifference`, `seasonTable`).
- [ ] **Step 3: Реализовать** по Interfaces; JSDoc каждой новой функции говорит, какие матчи она считает (bye — нет).
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-overview.test.mjs test/team-switcher.test.mjs test/teams-screen.test.mjs` → PASS; полный прогон рецепта Т → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/data/team-record.mjs test/team-record.test.mjs
git commit -m "feat(team): the season's TD and CAS difference, the leaders with their player and position, the opponent's race, the overview's table — read from what the server already sends" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 31: Обзор — верхние плитки обеих ширин и поиск в шапке десктопа

Прототипы: `desktop/DeskOverview.html` — плитки: сетка `repeat(auto-fit, minmax(180px, 1fr))`, зазор 12; карточка радиус 14, фон `--surface`, `var(--ring)`, отступ 14 16; подпись 13px `--muted`; число Oswald 700 34px (высота строки шрифта), вторая часть «/ 10» — 20px `--muted`, «· 4/1/1» — 22px `--muted`; «+6 / +4» — `--accent-text`. Шапка: поле — `label` 320px, `max-width: 100%`, высота 44, отступ 0 14, зазор 10, радиус 12, `--surface-2`, `--muted`, лупа 18; `input` 15px `--ink`. `mobile/Team.html` — сетка 2 колонки, зазор 8; плитка `--surface-2`, радиус 14, отступ 12 14, подпись 13px `--muted`, число Oswald 700 30px (как `.g-kpi` сейчас).

**Files:**
- Modify: `src/ui/kpi-tile.mjs` (`renderKpiTile`: `rest`, `accent`), `src/ui/kpi-tile.css`, `src/screens/team/roster/screen.mjs` (`onPhoneChange`), `src/screens/team/overview.mjs` (`overviewModel`, `overviewMarkup`, `markupOf`, `renderTeamOverview`), `src/screens/team/overview.css`, `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-overview.test.mjs`, `test/ui-match.test.mjs` (тесты `renderKpiTile`/`renderKpiGrid`)

**Interfaces:**
- Consumes: `seasonDifference` (Task 30), `seasonRecord`, `standingOf`; `renderSearchField` (`ui/search-field.mjs`); `wireRefSearch`, `goSearch` (`src/screens/ref/frame.mjs`); `PHONE`, `isPhone` (`roster/screen.mjs`).
- Produces:
  - `renderKpiTile({label, value, rest = "", accent = false, positive, compact, href})` — `rest` (текст) — тихая вторая часть числа той же строкой: `<span class="g-kpi__v">${value} <span class="g-kpi__rest">${rest}</span></span>`; `accent` — число `--accent-text` (`g-kpi--accent`). `renderKpiGrid` передаёт оба поля плитки.
  - `onPhoneChange(listener) → () => void` (`roster/screen.mjs`) — `change` у `globalThis.matchMedia?.(PHONE)`; нет `matchMedia` или `addEventListener` — пустая отписка.
  - `overviewModel({…, phone = false})` — поле `phone`; `tiles` по решению 48 (десктоп в таблице — пять, телефон в таблице — четыре, вне таблицы — две; «–» и вторые части — по решению 48). Внутренний `signed(n)` — «+n», «0», «−n».
  - `overviewMarkup(model)` — `metaHtml` шапки: плашка «Набор» (как сейчас) и, на десктопе, `<div class="g-overview__search">${renderSearchField({id: "overview-query", label: t("ref.search"), placeholder: t("search.placeholder"), data: {searchAll: ""}})}</div>`; на телефоне поля нет.
  - `renderTeamOverview(teamId)` — `markupOf` передаёт `phone: isPhone()`; при уходе снимаются `wireRefSearch(view, {onQuery: goSearch})` и `onPhoneChange(draw)`.
- `kpi-tile.css`: `.g-kpi__rest { color: var(--muted); font-size: 22px; }` (шрифт и начертание — числа); `.g-kpi--accent .g-kpi__v { color: var(--accent-text); }`; от 901px `.g-kpis--row` — `grid-auto-flow: row; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-12)` (одиночная последняя плитка — `grid-column: auto`).
- `overview.css` (от 901px): `.g-overview .g-kpi { padding: var(--space-14) var(--space-16); background: var(--surface); box-shadow: var(--ring); }`; `.g-overview .g-kpi__v { font-size: 34px; line-height: normal; }` — вместо нынешнего `clamp` десктопа; `.g-overview .g-kpi:first-child .g-kpi__rest { font-size: 20px; }` (место); наведение на плитку-ссылку — `color-mix(in srgb, var(--ink) 4%, var(--surface))`; `.g-overview__search { width: 320px; max-width: 100%; }`, `.g-overview__search .g-search { width: 100%; }`, `.g-overview__search .g-search__input { height: 44px; font-size: 15px; }`. До 900px `clamp` телефона остаётся.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamOverview.tile.record` | W · D · L | В · Н · П |
| `teamOverview.tile.diff` | TD / CAS difference | TD / CAS разница |
| `teamOverview.tile.diffDesk` | TD ± / CAS ± | TD ± / CAS ± |

- [ ] **Step 1: Падающие тесты** — `test/team-overview.test.mjs` (фикстуры файла: `SEASON`, `TEAMS`, `GAMES`; у `t1` лиги: `ga` 2–1 / CAS 1–0, `gb` в гостях 0–2 / CAS 0–2 → разница «−1 / −1», В/Н/П 1/0/1):
  - «a desk's tiles are DeskOverview's five: the place «2» with «/ 4», the points «3» with «· 1/0/1», the value, the treasury leading to the team page, «TD ± / CAS ±» «−1 / −1»» — вместо «a team in the season: its place, its points…»; ярлыки и `.g-kpi__rest` по порядку.
  - «a phone's tiles are Team.html's four: the value, the treasury, «W · D · L» «1 · 0 · 1», «TD / CAS difference» «−1 / −1»» (`phone: true`).
  - «the difference is in the accent on a desk only when neither is below zero and one is above; never on a phone» — игры с разницей «+1 / 0» → `g-kpi--accent` на десктопе, нет на телефоне; «−1 / −1» — нет.
  - «before the games are read the record and the difference say «–»; outside the season two tiles on both widths» (Review Focus 1).
  - «a desk's head has the reference's search at its right; typing takes the coach to #/ref with the query and the caret asked for; a phone has no field» — `#overview-query` `type="search"`, ввод «block» → `location.hash === "#/ref"`, `refQuery()` — «block», `takeSearchFocus()` — `true`.
  - «the overview follows the width: a desk turned phone draws Team.html's tiles, and back» (Review Focus 2) — `globalThis.matchMedia` с событием `change`, как в `test/team-player-profile.test.mjs`.
  - «styled; readable; breakpoints only 900/901» — `valuesOf("src/screens/team/overview.css", ".g-overview .g-kpi", "box-shadow")` от 901px — `["var(--ring)"]`; `.g-overview .g-kpi__v` — 34px; `assertReadable` для `.g-kpi__rest` на `--surface` и `--surface-2`.
  - `test/ui-match.test.mjs`: «a tile can say a quieter second part of its figure, and a figure in the accent; both escaped».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-overview.test.mjs test/ui-match.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `overview.mjs` — абзац о ширине (решение 47) и о плитках по прототипам; шапка `kpi-tile.css` — «a row of tiles wraps by 180px from 901px (the overview's figures, DeskOverview)».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-*.test.mjs test/shell-*.test.mjs test/ref*.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui/kpi-tile.mjs src/ui/kpi-tile.css src/screens/team/roster/screen.mjs src/screens/team/overview.mjs src/screens/team/overview.css src/i18n/en.json src/i18n/ru.json test/team-overview.test.mjs test/ui-match.test.mjs
git commit -m "feat(overview): the figures as the prototypes draw them — five cards with the TD and CAS difference on a desk, Team.html's four on a phone — and the reference's search in a desk's head (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 32: Обзор — лидеры и порядок блоков

Прототипы: `desktop/DeskOverview.html` — колонки: обёртка `display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start`, левая `flex: 2 1 560px`, правая `flex: 1 1 300px`, обе — колонка с зазором 20; «Лидеры команды» — секция колонкой с зазором 12, `h2` Oswald 700 24px, сетка `repeat(auto-fit, minmax(150px, 1fr))`, зазор 12; карточка — радиус 14, `--surface`, `var(--ring)`, отступ 14 16, колонка с зазором 10, ссылка без подчёркивания; ярлык 12/600, `letter-spacing: .04em`, `--muted`; ряд — `align-items: center`, зазор 10: номер 36px на цвете позиции (`renderPlayerBadge`), имя 13/600, позиция 12px `--muted`, число `margin-left: auto`, Oswald 700 30px `--accent-text`. `mobile/Team.html` — «Лидеры»: `h2` 0 0 6, Oswald 700 24px; строка — сетка `44px minmax(0, 1fr) auto`, зазор 10, отступ 8 0, черта снизу 1px `--line` (у последней нет); ярлык 13/700 `--muted`; имя 16/500, рядом через 6px «#3 Catcher» 13px `--muted`; число 18/700 (у SPP — `--accent-text`).

**Files:**
- Create: `src/screens/team/overview-lists.mjs`, `src/screens/team/overview-lists.css`
- Modify: `src/screens/team/overview.mjs` (`leadersMarkup`, `leaderTag`, `playerLine` уходят в `overview-lists.mjs`; `overviewMarkup` — колонки), `src/screens/team/overview.css` (правила `.g-overview__cols`, `.g-overview__title`, `.g-overview__leaders*`, `.g-overview__leaderlist` и их части в `@media` уходят), `src/styles.css` (`@import url("screens/team/overview-lists.css");` в конце), `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-overview.test.mjs`

**Interfaces:**
- Consumes: `teamLeaders` с `id`, `kind` (Task 30); `renderPlayerBadge`; `teamPlayerUrl`.
- Produces (`overview-lists.mjs`):
  - `leadersMarkup({leaders, teamId, phone}) → string` — "" без лидеров. Десктоп: `<section class="g-overview__leaders" aria-labelledby="overview-leaders-title">`, `<h2 class="g-overview__title" id="overview-leaders-title">` (`teamOverview.leaders`), `<div class="g-overview__leadercards">`, карточка — `<a class="g-overview__leader" href="${teamPlayerUrl(teamId, id)}">` (без id — `<div class="g-overview__leader">`): `<span class="g-overview__leadertag">` ярлык `teamOverview.leader.${key}`, `<span class="g-overview__leaderrow">${renderPlayerBadge({number, kind})}<span class="g-overview__leaderwho"><span class="g-overview__leadername">имя</span><span class="g-overview__leaderpos">позиция</span></span><span class="g-overview__leadervalue">число</span></span>`. Телефон: тот же `section`, заголовок `teamOverview.leadersShort`, `<div class="g-overview__leaderrows">`, строка — `<a class="g-overview__leaderline" href>` (без id — `div`): ярлык, `<span class="g-overview__leadername">имя <span class="g-overview__leaderpos">#3 Catcher</span></span>` (номер и позиция — прежняя `playerLine`), `<span class="g-overview__leadervalue">` (у `key === "spp"` — плюс `g-overview__leadervalue--spp`).
- `overview.mjs`, `overviewMarkup`: вместо `.g-overview__cols` с двумя списками и `readyListMarkup` под ним — `<div class="g-overview__cols">${main}${aside}</div>`, где `main` — `<div class="g-overview__main">` с лидерами и результатами, `aside` — `<div class="g-overview__aside">` с `readyListMarkup` (Task 33 добавит таблицу); колонка без содержимого не рисуется, обе пусты — нет и обёртки. `readyCardMarkup` и табло — на прежних местах.
- `overview-lists.css`: значения из шапки задачи; до 900px `.g-overview__cols` — колонка с зазором 22, `.g-overview__aside { display: none; }` (обе её части — десктопные); от 901px — обёртка и колонки по прототипу. Строка телефона: `min-height: 48px` (D2 ≥ 44), `color: var(--ink)`, без подчёркивания; имя и позиция — `overflow-wrap: anywhere`. Шрифт, рамка, фон, регистр, разрядка, начертание — явно.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamOverview.leadersShort` | Leaders | Лидеры |

- [ ] **Step 1: Падающие тесты** — `test/team-overview.test.mjs`:
  - «on a desk the leaders are DeskOverview's cards: the tag over the player's number on his position's colour, the name and the position, the figure at the right; each card leads to the player» — вместо «the leaders are the four counters in order…»; `href` — `teamPlayerUrl("t1", "p1")`; бейдж — `.g-badge--<kind>` (класс — как рисует `renderPlayerBadge`).
  - «on a phone the leaders are Team.html's rows under «Leaders»: the tag, the name with «#3 …» beside it, the figure; only SPP's in the accent; each row leads to the player».
  - «a leader the roster stores no id for is no link, on either width».
  - «the blocks stand as DeskOverview orders them: the leaders and the results at the left, who can advance at the right; a phone keeps Team.html's order» — порядок узлов `.g-overview__main` / `.g-overview__aside`; телефон: плитки, карточка прокачки, табло, лидеры, результаты.
  - «one column alone takes the row: no one ready leaves the left alone; no leader and no result leave the right alone» — вместо «leaders and ready players, no results…».
  - «styled; readable; D2; wrapping» — `assertStyled` с `overview-lists.css`; `valuesOf(".g-overview__leaderline", "min-height")` ≥ 44; у `overview-lists.css` нет `ellipsis` и `nowrap`; `assertReadable` для `.g-overview__leadervalue` (`--accent-text` на `--surface`), `.g-overview__leaderpos` (`--muted`).
  - «every key in both dictionaries» — `assertDictionaryCovers("src/screens/team/overview.mjs", "src/screens/team/overview-lists.mjs")`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-overview.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; шапка `overview-lists.mjs` — «The overview's lists (DeskOverview, Team.html): the leaders, the results and the table, each in the form of its width»; шапка `overview.css` — без лидеров.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS; `wc -l src/screens/team/overview.mjs src/screens/team/overview.css` — каждый < 600.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/overview.mjs src/screens/team/overview.css src/screens/team/overview-lists.mjs src/screens/team/overview-lists.css src/styles.css src/i18n/en.json src/i18n/ru.json test/team-overview.test.mjs
git commit -m "feat(overview): the leaders as DeskOverview's cards and Team.html's rows, each leading to the player, and the blocks in the prototype's order — the lists at the left, who can advance at the right (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 33: Обзор — строки результатов и мини-таблица

Прототипы: `desktop/DeskOverview.html` — «Результаты»: секция — радиус 16, `--surface`, `var(--ring)`, отступ 8 24 12; шапка — `justify-content: space-between`, отступ 14 0 6, `h2` Oswald 700 24px, «Весь сезон →» 14/600 `--accent-text`; строка — сетка `30px 60px minmax(0, 1fr) 90px 70px`, зазор 14, `min-height: 52px`, черта снизу 1px `--line`; значок 30×30 (`renderResultPill` без `compact`); «Тур 6» 13px `--muted`; соперник 16/500, под ним раса 12px; «CAS 3–1» 13px `--muted`; счёт справа Oswald 700 26px. «Таблица»: секция — радиус 16, `--surface`, `var(--ring)`, отступ 20 0 8; шапка — `align-items: baseline`, отступ 0 20 8, `h2` Oswald 700 24px, «Вся таблица →» 14/600 `--accent-text`; строка — сетка `24px minmax(0, 1fr) 34px 30px`, зазор 8, `min-height: 42px`, отступ 0 20, черта снизу 1px `--line`, своя — фон `--accent-tint`; место 14/700; название 15px (своё — 700, иначе 500); разница TD 14px по центру (больше нуля — `--accent-text`, иначе `--muted`); очки 16/700 справа. `mobile/Team.html` — строка: сетка `32px minmax(0, 1fr) auto`, зазор 10, отступ 10 0; значок 28; соперник 16/500, строка 13px `--muted`; счёт 18/700 шрифтом текста.

**Files:**
- Modify: `src/screens/team/overview-lists.mjs` (`resultsMarkup`, `tableMarkup`), `overview-lists.css` (правила результатов из `overview.css` — сюда, плюс таблица), `src/screens/team/overview.mjs` (`resultRow`, `resultsMarkup` уходят; модель — `table`; правая колонка — плюс таблица), `overview.css` (правила `.g-overview__bar`, `__all`, `__list`, `__result`, `__row`, `__text`, `__opponent`, `__line`, `__score` и их `@media` уходят), `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-overview.test.mjs`

**Interfaces:**
- Consumes: `recentResults` с `opponentRace`, `seasonTable` (Task 30); `raceTitleOf` (`data/teams.mjs`); `renderResultPill`; `gameUrl`, `teamUrl`, `playerTeamUrl`, `seasonTabUrl`.
- Produces (`overview-lists.mjs`):
  - `resultsMarkup({results, teamId, phone}) → string` — "" без результатов. Десктоп: `<section class="g-overview__results">` — карточка, шапка внутри: `teamOverview.resultsTitle`, «Весь сезон →» (`teamUrl(teamId, "matches")`); строка `<li class="g-overview__result"><a class="g-overview__row" href="${gameUrl(gameId)}">` — `renderResultPill({result})`, `<span class="g-overview__round">` (`teamOverview.round {round}` / `teamOverview.friendly`), `<span class="g-overview__text"><span class="g-overview__opponent">…</span><span class="g-overview__race">${raceTitleOf(opponentRace)}</span></span>` (нет названия расы — нет `span`), `<span class="g-overview__cas">` (`teamOverview.cas {cas}`), `<span class="g-overview__score">`. Телефон — как сейчас (`compact`, `teamOverview.results`, строки `resultLine`/`friendlyLine`).
  - `tableMarkup({rows, teamId}) → string` — "" без строк. `<section class="g-overview__table" aria-labelledby="overview-table-title">`, шапка (`teamOverview.table.title`, `teamOverview.table.all` → `seasonTabUrl()`), `<ol class="g-overview__tablerows">`, строка `<li class="g-overview__tablerow[ g-overview__tablerow--own]"[ aria-current="true"]>`: `<span class="g-overview__tablepos">rank</span>`, `<a class="g-overview__tablename" href>` (своя — `teamUrl(teamId)`, чужая — `playerTeamUrl(row.userId, row.teamId)`), `<span class="g-overview__tabletd[ g-overview__tabletd--plus]"><span class="g-sr-only">${t("teamOverview.table.td")}</span>+3</span>` (знак — как у плиток), `<span class="g-overview__tablepts"><span class="g-sr-only">${t("teamOverview.table.points")}</span>13</span>`.
- `overviewModel`: `table: phone || !standing ? [] : seasonTable(seasonData, team.id)`; правая колонка — `readyListMarkup` и `tableMarkup`.
- `overview-lists.css`: значения из шапки задачи; от 901px карточкой становится `.g-overview__results` (а не `.g-overview__list`); «Весь сезон →» и «Вся таблица →» от 901px `min-height: 24px` (D2), до 900px — 44px как сейчас; название таблицы — `display: inline-flex; min-height: 24px`, подчёркивание при наведении, `overflow-wrap: anywhere`; до 900px `.g-overview__table` не рисуется (его и нет в модели). Пятая и четвёртая строки результатов на телефоне скрыты, как сейчас.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamOverview.resultsTitle` | Results | Результаты |
| `teamOverview.round` | Round {round} | Тур {round} |
| `teamOverview.friendly` | Friendly | Товарищеский |
| `teamOverview.cas` | CAS {cas} | CAS {cas} |
| `teamOverview.table.title` | Table | Таблица |
| `teamOverview.table.all` | Whole table → | Вся таблица → |
| `teamOverview.table.td` | TD difference | Разница TD |
| `teamOverview.table.points` | Points | Очки |

- [ ] **Step 1: Падающие тесты** — `test/team-overview.test.mjs`:
  - «on a desk a result is DeskOverview's row: the pill, the round, the opponent with the race under it, the casualties, the score; the whole row opens the match» — вместо «a recent result: the pill, the opponent…» (десктоп); товарищеский — «Friendly» в колонке тура.
  - «on a desk the results are a card with its head inside: «Results» and «Whole season →»».
  - «on a phone a result keeps Team.html's row: the score in the body's face at 18px, the pill's column 32px» — `valuesOf("src/screens/team/overview-lists.css", ".g-overview__score", "font")` до 900px.
  - «the table on a desk: the first six by place, the team's row on the accent's tint and in bold, the TD difference signed and in the accent above zero, the points; «Whole table →» leads to the season» — фикстура `SEASON` с `standings` (с `entryId`, `user`) и `rounds[].pairings`.
  - «a team ranked below the six sees its own row last»; «a name in the table leads to that team: ours to the overview, another to its coach's team page».
  - «no table without the season's table, outside the season, or on a phone» (Review Focus 1).
  - «names are text» — `HOSTILE` в сопернике, расе (через `state.data.teams`) и названии строки таблицы.
  - «styled; readable; D2; wrapping» — `assertReadable` для `.g-overview__tablepos` на `--accent-tint` и `--surface`, `.g-overview__race`, `.g-overview__cas`; ссылки десктопа ≥ 24; нет `ellipsis`/`nowrap` в `overview-lists.css`.
  - «every key in both dictionaries».
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-overview.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/overview.mjs src/screens/team/overview.css src/screens/team/overview-lists.mjs src/screens/team/overview-lists.css src/i18n/en.json src/i18n/ru.json test/team-overview.test.mjs
git commit -m "feat(overview): DeskOverview's results card with its round, race and casualties columns, Team.html's phone rows, and the league's table at the right of a desk (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 34: Табло — герб, буква соперника и раса ссылкой на десктопе

Прототип `desktop/DeskOverview.html` (табло): наша сторона — `display: flex; align-items: center; gap: 16px`, герб 52×59; сторона соперника — `flex-direction: row-reverse`, зазор 16, круг 52×52, радиус 26, фон белый 12%, кольцо `inset 0 0 0 2px` белый 50%, буква Oswald 700 26px; под названием — раса ссылкой: 13/600, белым, подчёркнута (`text-decoration-color` белый 40%, `text-underline-offset: 3px`), книга 12px, зазор 5; «· 5-е» 13px `--header-muted`. Белый в прозрачности — `color-mix(in srgb, var(--header-ink) N%, transparent)`, как `.g-board__actions .g-btn:hover`.

**Files:**
- Modify: `src/ui/match-board.mjs` (`renderTeam`, `renderMatchBoard`, JSDoc), `src/ui/match-board.css`, `src/screens/team/overview.mjs` (`boardOf`, `opponentLine`), `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/ui-match.test.mjs`, `test/team-overview.test.mjs`

**Interfaces:**
- Consumes: `renderCrest` (`src/shell/crest.mjs`), `icon("book", 12)`, `pageUrl` (`core/routes.mjs`), `raceTitleOf`, `standingOf`.
- Produces:
  - `renderMatchBoard({own: {name, sub?, crestHtml?}, opponent: {name, sub?, initial?, race?: {title: string, href: string}} | null, …})` — `crestHtml` (разметка `renderCrest`) — `<span class="g-board__crest">` перед текстами нашей стороны; тексты стороны — в `<span class="g-board__texts">`; `initial` — `<span class="g-board__initial" aria-hidden="true">`; `race` — ссылка `<a class="g-board__race" href>` в начале строки под названием, за ней « · » и `sub`, когда он есть. Без новых полей — разметка как сейчас.
  - `boardOf` (`overview.mjs`): десктоп — `own.crestHtml: renderCrest({size: "md"})`, `opponent.initial` — первая буква названия (`Array.from(name.trim())[0]?.toUpperCase() ?? ""`), `opponent.race` — `{title: raceTitleOf(slug), href: pageUrl({slug})}` при известной расе, `opponent.sub` — `teamOverview.opponentPlace {place}` (нет места — ""); телефон — `opponent.sub` — раса и короткое место через « · », без герба, буквы и ссылки.
- `match-board.css`: до 900px `.g-board__crest, .g-board__initial { display: none; }`; от 901px — значения из шапки задачи; `.g-board__crest .g-crest { width: 52px; height: 59px; }`; ссылка расы `display: inline-flex; align-items: center; min-height: 24px` (D2), кольцо фокуса — `--header-ink`, как у действий табло; `overflow-wrap: anywhere` у названий.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamOverview.opponentPlace` | #{place} | {place}-е |

- [ ] **Step 1: Падающие тесты.**
  - `test/ui-match.test.mjs`: «the board can carry our crest, the opponent's initial, and the opponent's race as a link heading the line under the name; without them it is as it was»; «the initial is hidden from a screen reader; the race's title and the line are text» (`HOSTILE`).
  - `test/team-overview.test.mjs`: «on a desk the board draws the league's crest by our name, the opponent's initial by theirs, the race as a link to its rules and the place short» — `a.g-board__race[href="#/teams/dwarf"]` «Dwarf», строка «Dwarf · #1»; «a phone's board draws neither the crest nor the initial, and the race as text» (`phone: true`); обновить «the board names both teams by race, our place and value…» под короткое место.
  - CSS: «styled; the crest and the initial are a desk's» — `valuesOf("src/ui/match-board.css", ".g-board__initial", "width")` от 901px — `52px`; до 900px — `display: none`; ссылка ≥ 24.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/ui-match.test.mjs test/team-overview.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; шапка `match-board.mjs` — о новых полях (DeskOverview) и о том, чего табло не делает (решение 54).
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui/match-board.mjs src/ui/match-board.css src/screens/team/overview.mjs src/i18n/en.json src/i18n/ru.json test/ui-match.test.mjs test/team-overview.test.mjs
git commit -m "feat(overview): DeskOverview's board — the league's crest by our name, the opponent's initial, the opponent's race as a link to its rules (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 35: Смены расы больше нет

**Files:**
- Modify: `src/domain/roster/team-edits.mjs`, `src/data/treasury.mjs` (`saveTeamRoster`, JSDoc), `src/screens/team/manage/settings.mjs`, `src/screens/team/manage/settings-sheet.mjs`, `src/screens/team/manage/settings.css`, `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/team-edits.test.mjs`, `test/treasury-data.test.mjs`, `test/team-settings.test.mjs`; любой тест из `grep -rln "withRace\|assertSameRace\|raceChange\|raceOpen\|raceDrops\|raceStaff\|racePreparing\|settingsRace\|RACE_IN_SEASON\|RACE_SAME\|RACE_UNKNOWN\|Change the race" test/`

**Interfaces:**
- `team-edits.mjs`: удалены `withRace`, `RACE_STAFF`, импорты `medicalStaffDefinitions`, `syncMedicalStaffForTeam`, `countToNumber` (если больше не нужны); `TEAM_EDIT_REFUSALS` — `["TEAM_NAME_EMPTY", "LEAGUE_UNKNOWN", "FAVOURED_UNKNOWN", "FANS_RANGE"]`; шапка — без «its race changed».
- `treasury.mjs`: `saveTeamRoster(teamId, draft, identity = {}, { words } = {})` — `identity` `{name?, logoData?}`; раса — всегда `team.baseTeamSlug` (поле тела и `roster.teamSlug`); `assertSameRace` и `@throws` удалены; JSDoc: «The race goes as the team has it, always: a coach does not change a team's race (owner, 2026-10-20); a race named in `identity` is not read».
- `settings.mjs`: `settingsModel` — без `inSeason`, `players`, `raceHeld`; строка расы — `row("race", {label: t("teamSettings.race"), value})` без кнопки и подписи; удалены `changeRace`, `takeFresh`, `REFOCUS.race`, проводка `.g-races`, `opened`/`stillOpen` в `apply` и `sendOf`, ставшие лишними импорты (`apiRequest`, `sessionTokenHolds`, `refusalText`, `setMyTeams`, `withRace`, `wireRadioGroups`); `open()` — причина `now.held`; шапка модуля — без K17.
- `settings-sheet.mjs`: `KINDS` и `SETTINGS_KINDS` — `name`, `league`, `favoured`, `fans`; `settingsCheck` — `closed: now.held`; удалены `raceBody`, `raceDrops`, `staffWords`, ветка расы `footOf`, `wide`; импорты `medicalStaffDefinitions`, `withRace`, `racesMarkup`; шапка модуля — без расы и красной кнопки.
- `settings.css`: удалить `.g-team-settings__sheet .g-races`, `.g-team-settings-sheet .g-sheet__foot`, `.g-team-settings-sheet .g-team-settings__drops`; шапка — без «the races are new.css's».
- Удалить из обоих словарей: `teamSettings.refusal.RACE_SAME`, `teamSettings.refusal.RACE_UNKNOWN`, `teamSettings.refusal.RACE_IN_SEASON`, `teamSettings.raceOpen`, `teamSettings.raceDrops`, `teamSettings.raceStaff`, `teamSettings.racePreparing`, `teamSettings.raceChange`. `teamSettings.race`, `newTeam.needRace`, `roster.raceLockedInSeason` остаются. `racesMarkup` пока остаётся экспортом `new.mjs` (его переносит Task 39).

- [ ] **Step 1: Падающие тесты.**
  - `test/team-settings.test.mjs`: «the race is read only on every width and in every state: «Race · Human · Tier 1», no button, no note — in the season or out of it, during a preparation, during a match» (Review Focus 5); «no sheet of the settings lists the races» — `SETTINGS_KINDS` — `["name", "league", "favoured", "fans"]`, `[data-settings-open="race"]` нет. Удалить тесты расы: «the race: the sheet lists the races…», «the race's red button names no race…», «a match being prepared closes the race…» (переписать: «a preparation leaves every setting open and says what a save resets»), «a team the season took meanwhile keeps its race…», «a second press on «Change the race»…», «closing the race's sheet during its read…», «leaving the page during the race's read…», «a preparation or a step of the roster's that comes during the race's read…». В «the team page ends with…» строка расы — «Race · Human · Tier 1».
  - `test/treasury-data.test.mjs`: «an identity that names a race sends the team's race: no save changes it» — `saveTeamRoster("t1", draft, {baseTeamSlug: "teams/goblin"})` → тело `baseTeamSlug` и `roster.teamSlug` — `"teams/human"`; «a team whose stored roster names another race than its column saves under the column's race, as before 07d — nothing throws» (вместо теста M3 с `assert.throws`). Удалить «a race changed goes with the new race…» и «a draft of another race than its save sends throws…»; в «without an identity a save is as before…» — без `baseTeamSlug`.
  - `test/team-edits.test.mjs`: удалить тесты `withRace`; «there is no race to change: team-edits has no withRace» (`assert.equal(edits.withRace, undefined)`); «every refusal of the settings is worded in both dictionaries» — по новому `TEAM_EDIT_REFUSALS`; «the race's words are gone from both dictionaries» — ключей из Interfaces нет ни в `en.json`, ни в `ru.json`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-settings.test.mjs test/treasury-data.test.mjs test/team-edits.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-manage.test.mjs test/treasury-*.test.mjs test/team-*.test.mjs` → PASS; полный прогон → PASS; `npm run check` → 0 недостижимых функций; `grep -rn "withRace\|assertSameRace\|raceChange\|settingsRace\|RACE_IN_SEASON" src test scripts` → пусто; `git diff --name-only -- src/screens/saved-roster.mjs src/components/roster-editor` → пусто.
- [ ] **Step 5: Commit**

```bash
git add src/domain/roster/team-edits.mjs src/data/treasury.mjs src/screens/team/manage/settings.mjs src/screens/team/manage/settings-sheet.mjs src/screens/team/manage/settings.css src/i18n/en.json src/i18n/ru.json test/team-edits.test.mjs test/treasury-data.test.mjs test/team-settings.test.mjs
git commit -m "feat(team): a team's race is shown and never changed — the race's sheet, its red button, withRace and the save's race guard are gone (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(плюс тестовые файлы из `grep` в Files)

---

### Task 36: «Настройки команды» — свой экран на телефоне, карточка справа на десктопе

Прототипы: `mobile/Builder.html` (шапка: фон `--header`, отступ 10 16 14; ряд — `align-items: center`, зазор 10; «‹» — круг 40×40 (до 900px — 44, D2), радиус 20, фон белый 12% (`color-mix(in srgb, var(--header-ink) 12%, transparent)`, как `.g-build__head > .g-icon-btn`), значок 18; название Oswald 600 22px/1.15 `--header-ink`; подпись 13px `--header-muted`), `mobile/TeamManage.html` (страница телефона: настроек в ней нет — строка-ссылка решения 57 без макета), `desktop/DeskRosterFunds.html` и `desktop/DeskBuilder.html` (карточка «Команда» в правой колонке).

**Files:**
- Create: `src/screens/team/manage/settings-screen.mjs`
- Modify: `src/core/routes.mjs` (`TEAM_ROUTES`, `TEAM_SECTIONS`, `ID_ROUTES`), `src/core/router.mjs` (`screens.teamSettings`), `src/shell/navigation.mjs` (`OWNERS`, `drill`, шапка модуля), `src/shell/team-switcher.mjs` (`SECTIONS`), `src/screens/team/manage/index.mjs` (`manageModel`, `manageMarkup`, `markupOf`, `renderTeamManage`, шапка), `src/screens/team/manage/strip.mjs` (сюда — `cardMarkup` и `opener`), `src/screens/team/manage/settings.mjs` (`settingsMarkup(model, {titled})`), `settings.css`, `manage.css` (три строки сетки), `src/i18n/en.json`, `src/i18n/ru.json`
- Test: `test/routes.test.mjs`, `test/shell-navigation.test.mjs`, `test/shell-markup.test.mjs`, `test/team-switcher.test.mjs`, `test/team-settings.test.mjs`, `test/team-manage.test.mjs`

**Interfaces:**
- Consumes: `isPhone`, `onPhoneChange` (Task 31); `settingsModel`, `settingsMarkup`, `wireSettings` (Task 35); `renderNavRow`; `icon("back", 18)`; `teamUrl`.
- Produces:
  - `routes.mjs`: `TEAM_SECTIONS` — плюс `"settings"` (`teamUrl(id, "settings")` → `#/t/:id/settings`); `ID_ROUTES` — `[/^t\/([^/]+)\/settings$/, "teamSettings", "teamId"]`; `TEAM_ROUTES` — плюс `"teamSettings"` (`SIGNED_IN_ROUTES` и `ROUTE_NAMES` берут его сами).
  - `router.mjs`: `teamSettings: ({ teamId }) => renderTeamManage(teamId, { settings: true })`.
  - `navigation.mjs`: `OWNERS.teamSettings = ["team", "roster"]`; `drill` — `DRILL_ROUTES.has(route.name)`, `DRILL_ROUTES = new Set(["teamPlayer", "teamSettings"])`.
  - `team-switcher.mjs`: `SECTIONS.teamSettings = "settings"`.
  - `strip.mjs`: экспорт `treasuryCardMarkup(model, live)` и `shutOpener(className, data, label, live)` — бывшие `cardMarkup` и `opener` `index.mjs`, тела те же (освобождают место: `index.mjs` ≤ 210).
  - `index.mjs`: `manageModel({…, phone = false, screen = "page"})` → плюс `phone`, `screen` (`"page"|"settings"`); `manageMarkup(model)`: `phone && screen === "settings"` → `settingsScreenMarkup(model)`; иначе страница: на десктопе `settingsMarkup(model)` — последним ребёнком `.g-manage__cols` (после истории), на телефоне `settingsEntryMarkup(model.teamId)` — после `.g-manage__cols`; `markupOf(teamId, screen)` — `phone: isPhone()`; `renderTeamManage(teamId, { settings = false } = {})` — первый фокус `#team-settings-title` на адресе настроек, иначе `h1`; в `releases` — `onPhoneChange(draw)`.
  - `settings.mjs`: `settingsMarkup({teamId, settings}, { titled = true } = {})` — `titled: false`: без `h2` (секцию называет `h1` экрана с тем же `id`); `h2` получает `tabindex="-1"`.
  - `settings-screen.mjs`:
    - `settingsScreenMarkup(model) → string` — `<div class="g-team-settings-screen" data-screen="team-settings">` + шапка `<header class="g-team-settings-screen__head"><a class="g-team-settings-screen__back" href="${teamUrl(teamId, "team")}" aria-label="${t("teamSettings.backLabel")}">${icon("back", 18)}</a><div class="g-team-settings-screen__titles"><h1 class="g-team-settings-screen__title" id="team-settings-title" tabindex="-1">${t("teamSettings.title")}</h1><p class="g-team-settings-screen__sub">${[team.name, settings.raceTitle].filter(Boolean).join(" · ")}</p></div></header>` + `<div class="g-team-settings-screen__body">${settingsMarkup(model, {titled: false})}</div></div>` (всё — `escapeHtml`).
    - `settingsEntryMarkup(teamId) → string` — `<div class="g-team-settings-entry">${renderNavRow({href: teamUrl(teamId, "settings"), title: t("teamSettings.title"), desc: t("teamSettings.entryDesc")})}</div>`.
- `settings.css` (все правила `.g-team-settings*` — только здесь, тест «no other stylesheet styles the team's settings»):
  - до 900px: `.g-frame #app-view:has(> .g-team-settings-screen) { display: flex; flex-direction: column; padding: 0; }`; `.g-main:has(.g-team-settings-screen) { overflow-x: clip; }` (шапка липнет, как у профиля, K3); экран — колонка, `--surface`; шапка — `position: sticky; top: 0; z-index: 3` и значения из шапки задачи; «‹» 44×44, радиус 22, цвет `--header-ink`, без подчёркивания, кольцо фокуса `--header-ink`; заголовок — без контура при фокусе (место начала, не элемент управления), `overflow-wrap: anywhere`; тело — отступ `var(--space-4) var(--space-16) 28px`.
  - строка-ссылка: `.g-team-settings-entry` — рамка карточки «Истории» (`box-sizing: border-box; padding: 0 var(--space-16); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface)`), у `.g-list-row` внутри — без черты снизу.
  - от 901px: `.g-manage__cols > .g-team-settings { grid-area: settings; }`.
- `manage.css` (от 901px, `.g-manage__cols`): `grid-template-rows: auto auto 1fr; grid-template-areas: "resources side" "resources history" "resources settings";` вместо двух прежних строк.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamSettings.entryDesc` | Name, league, logo, Dedicated Fans, roster order | Название, лига, логотип, Dedicated Fans, порядок в составе |
| `teamSettings.backLabel` | Back to the team page | Назад на страницу «Команда» |

- [ ] **Step 1: Падающие тесты.**
  - `test/routes.test.mjs`: «the team's settings have an address of their own: #/t/:id/settings, a team screen a guest signs in for» — `teamUrl("t1", "settings")`, `matchRoute("t/t1/settings")` → `{name: "teamSettings", params: {teamId: "t1"}}`, `TEAM_ROUTES.has("teamSettings")`, гость → `#/login` с `returnTo`.
  - `test/shell-navigation.test.mjs`: «the player's address and the team's settings are drilled into: no header of the shell; every other route keeps it» (вместо теста `drill` только игрока); «the settings light the tab «Team» and the SideNav's «Roster», as the team page».
  - `test/team-switcher.test.mjs`: «a team chosen on its settings goes to the other team's settings» — `switchTarget(at("teamSettings"), "t2")` → `#/t/t2/settings`.
  - `test/team-settings.test.mjs` (ширина — `withWindow` из `test/helpers/ref-screen.mjs` или своя заглушка `matchMedia` с событием `change`, как в `test/team-player-profile.test.mjs`):
    - «a phone's team page has no settings section but a row «Team settings» last, after the history, leading to #/t/t1/settings».
    - «#/t/t1/settings on a phone is a screen of its own (Builder.html's head): «‹» back to the team page, «Team settings» and «Ashgrove Wardens · Human», the rows under it; neither the treasury, the resources nor the history» — `renderTeamManage("t1", {settings: true})`; фокус — `h1#team-settings-title`.
    - «a sheet opened on the phone's screen works as on the page: one PATCH, the focus back on the row's button».
    - «held on its own screen as on the page: a match on, the roster's queue, a preparation's words; «‹» still leads back» (Review Focus 3).
    - «on a desk the settings are a card in the right column, under the history; the resources keep the left» — вместо «the team page ends with the team's settings…» и «on a desk the settings are a card across the page…»: `.g-manage__cols > .g-team-settings` после `.g-manage__history`.
    - «#/t/t1/settings on a desk is the team page, the focus on the card's title».
    - «the settings' address follows the width: a phone turned desk draws the page with the card, and back» (Review Focus 2).
    - «D2: «‹» 44px; the row 44px or more» — `valuesOf(SETTINGS, ".g-team-settings-screen__back", "width")` — `44px`.
    - «every key in both dictionaries» — `assertDictionaryCovers` с `settings-screen.mjs`.
  - `test/team-manage.test.mjs`: «the phone's page keeps stage 08's order — the card, the safe, the correction, the resources, the history — and then the settings' row»; тесты, что ждали секцию настроек в конце страницы, — на строку-ссылку (телефон) или карточку в колонке (десктоп).
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/routes.test.mjs test/shell-navigation.test.mjs test/shell-markup.test.mjs test/team-switcher.test.mjs test/team-settings.test.mjs test/team-manage.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces: сначала перенос `cardMarkup`/`opener` в `strip.mjs` (поведение то же), затем адрес и экраны. Шапки `index.mjs` (абзац «On a phone…» — плюс строка настроек и их экран; «On a desk…» — карточка последней справа), `navigation.mjs` («A player's address and the team's settings are drilled into…»), `settings-screen.mjs` («The team's settings on a phone are a screen of their own (owner, 2026-10-20: «отдельный экран на мобилке… есть кнопка назад»), under Builder.html's head; on a desk the card stands in the team page's right column»).
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/treasury-*.test.mjs test/team-*.test.mjs test/shell-*.test.mjs test/app-boot*.test.mjs` → PASS; полный прогон → PASS; `wc -l src/screens/team/manage/index.mjs` ≤ 210.
- [ ] **Step 5: Commit**

```bash
git add src/core/routes.mjs src/core/router.mjs src/shell/navigation.mjs src/shell/team-switcher.mjs src/screens/team/manage src/i18n/en.json src/i18n/ru.json test/routes.test.mjs test/shell-navigation.test.mjs test/shell-markup.test.mjs test/team-switcher.test.mjs test/team-settings.test.mjs test/team-manage.test.mjs
git commit -m "feat(team): the team's settings are a screen of their own on a phone, #/t/:id/settings under a dark head with «‹», and a card in the team page's right column on a desk (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 37: Карточка настроек — как карточка «Команда» билдера

Прототипы: `desktop/DeskBuilder.html` — секция `padding: 4px 24px 20px`, радиус 16, `--surface`, `var(--ring)`; шапка `padding: 18px 0 4px`, `h2` Oswald 700 22px; строка 52px (логотип — 60) и черта 1px `--line`, подпись 14px `--muted`, значение 15/700; рамка логотипа 40×40, радиус 10, `--surface-2`, `var(--ring)`, значок картинки 18 `--muted` (`<rect x="3" y="5" width="18" height="14" rx="2"/>` и `<path d="M3 15l5-5 4 4 3-3 6 6"/>`); «Загрузить» — `min-height: 36px`, отступ 0 12, радиус 10, `--surface`, `box-shadow: inset 0 0 0 1px` `--control-border`, 14/600 `--ink-2`. `mobile/Builder.html` — то же без рамки карточки (кнопки до 900px — 44px, D2).

**Files:**
- Modify: `src/screens/team/manage/settings.css`, `src/screens/team/manage/settings.mjs` (`logoRow`: `icon("image", 18)`), `src/ui/icons.mjs` (`image`)
- Test: `test/team-settings.test.mjs`, `test/ui-kit.test.mjs` (`ICON_NAMES`)

**Interfaces:**
- `icons.mjs`: `SHAPES.image` — пути из шапки задачи (штрих — общий 2.4; в прототипе 2 — отличие записать).
- `settings.css` (от 901px): `.g-team-settings` — `padding: var(--space-4) var(--space-24) var(--space-20); border-radius: var(--radius-2xl); box-shadow: var(--ring)` (было `inset 0 0 0 1px var(--line)`, 20px); `.g-team-settings__title` — `padding: 18px 0 var(--space-4); font: 700 22px/normal var(--font-display)`; `.g-team-settings__btn` — `border: 0; box-shadow: inset 0 0 0 1px var(--control-border)` на обеих ширинах (было `border: 1px solid`); значения строк и логотипа — сверить с шапкой задачи, отличия поправить.

- [ ] **Step 1: Падающие тесты** — `test/team-settings.test.mjs`:
  - «on a desk the card is DeskBuilder's team card: 24px at its sides, 4px over the heading's 18, a radius of 16 in the kit's ring» — `valuesOf(SETTINGS, ".g-team-settings", "padding")`, `"box-shadow"` от 901px.
  - «the logo's frame shows the picture, or the image glyph Builder draws» — без логотипа в `.g-team-settings__logo` — `svg` с `path[d="M3 15l5-5 4 4 3-3 6 6"]`.
  - «a row's button is Builder's «Upload»: the ring inside it, 14/600 --ink-2; 36px at a desk, 44px up to 900px» (обновить «D2: the settings' buttons…»).
  - `test/ui-kit.test.mjs`: `ICON_NAMES` — плюс `image`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-settings.test.mjs test/ui-kit.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; шапка `settings.css` — «the rows of the builder's team card (Builder, DeskBuilder): a card in the right column of a desk, a screen's body on a phone».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/manage/settings.css src/screens/team/manage/settings.mjs src/ui/icons.mjs test/team-settings.test.mjs test/ui-kit.test.mjs
git commit -m "fix(team): the settings' card as the builder's team card — its sides, its heading, the kit's ring, the logo's picture glyph and the ring inside its buttons (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 38: Память набора — в свой модуль (перенос, поведение то же)

**Files:**
- Create: `src/screens/teams/new-flow.mjs`
- Modify: `src/screens/teams/new.mjs` (переменная `flow`, `freshFlow`, `holdsPicks`, `watchSession`, проверка тренера — уходят в `new-flow.mjs`; шапка)
- Test: `test/new-team-screen.test.mjs` (только импорты, если нужно)

**Interfaces:**
- Produces (`new-flow.mjs`; `Build` — нынешний `Flow` целиком, `{userId, step, name, raceSlug, draft, startedAt, rosterOpen, choice, pending, refusal}`; `step` уходит в Task 39):
  - `buildOf() → Build` — набор этого тренера: другого тренера или никакого — новый пустой; с первого вызова слушает сессию (`onSessionChange`: другой тренер — набор забыт), как `watchSession`.
  - `isCurrentBuild(build) → boolean` — `build` всё ещё набор тренера (замена проверки `flow !== build`).
  - `pickOf() → {name: string, raceSlug: string, resets: boolean}` — что показывает шаг выбора; `resets` — `holdsPicks(draft)`.
  - `setPick({name, raceSlug}) → void` — меняет только переданные поля.
  - `startBuild() → boolean` — тело нынешнего `create` без `show`: без названия или расы — `false`; та же раса — переименовать черновик; другая — `newBuild`, `startedAt`, `rosterOpen: false`, `choice: null`; `refusal: ""`; затем слушатели `onBuildStarted`; `true`.
  - `onBuildStarted(listener) → () => void`.
  - `endBuild(build) → void` — команда создана: набор забыт, если он ещё тренера.
  - `holdsPicks(draft) → boolean`.
- `new.mjs` — те же экраны и поведение: шаг выбора на месте (`pickMarkup`, `step`); ввод названия и выбор расы — `setPick`, рисунок шага — `pickOf`; «Создать» — `startBuild()`; визит слушает `onBuildStarted` → `show("build")` (снимается при уходе); `save` — `isCurrentBuild`, `endBuild`. Каждый экспорт `new-flow.mjs` кем-то вызван (0 недостижимых); `hasBuild` добавит Task 39 вместе с первым вызовом.

- [ ] **Step 1: Тест** — `test/new-team-screen.test.mjs` без изменений поведения; новый «the build's memory is one module's: buildOf, pickOf, setPick, startBuild — a session that ends starts from nothing» на `new-flow.mjs` (чистый: `state.auth.currentUser`, `sessionEnded`).
- [ ] **Step 2: Run** — `npm run build && node --test test/new-team-screen.test.mjs` → новый тест FAIL (нет модуля), остальные PASS.
- [ ] **Step 3: Перенести** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS весь файл; `node --test test/builder-view.test.mjs test/teams-*.test.mjs test/home-route.test.mjs` → PASS; полный прогон → PASS; `npm run check` → 0 недостижимых, без циклов импорта (`new-flow.mjs` не импортирует `new.mjs`).
- [ ] **Step 5: Commit**

```bash
git add src/screens/teams/new-flow.mjs src/screens/teams/new.mjs test/new-team-screen.test.mjs
git commit -m "refactor(teams): the new team's build in a module of its own, for the builder and the sheet to come — no change of behaviour" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 39: «Новая команда» — шторка и окно над текущим экраном

Прототипы: `mobile/TeamNew.html` — шторка: шапка — сетка `44px minmax(0,1fr) 44px`, отступ 6 12 4, «‹» и крест — круги 44, `--surface-3`; «Новая команда» Oswald 700 24px/1.1, под ним 13px `--muted`; тело — отступ 12 16, колонка с зазором 14; подпись поля 13/600 `--muted`, зазор 6; поле 48px, радиус 12, `--surface-2`, 16px; «Раса» 13/600 `--muted`; расы — 2 колонки, зазор 6; раса — `min-height: 44px`, радиус 10, отступ 0 12, 14px, `--surface` и `var(--ring)`, 500; выбранная — `--accent-tint-soft`, `var(--ring-selected)`, 700; ссылка 13/600 `--accent-text`; подвал — отступ 10 16 24, черта сверху; «Создать» — 100%, 52px, радиус 12, 17/700, выключенная — `--disabled`. `desktop/DeskTeamNew.html` — окно 760px, `max-width: calc(100% - 32px)`, сверху 64px, радиус 20; шапка — отступ 20 24, черта снизу, Oswald 700 28px/1, подпись 14px; крест 44; тело — отступ 20 24, зазор 18, подпись поля — зазор 8; расы — `repeat(auto-fill, minmax(160px, 1fr))`, зазор 6; подвал — `justify-content: space-between`, отступ 16 24, черта сверху, `--surface-2`; «← Мои команды» — 48px, отступ 0 18, радиус 12, `--surface`, `inset 0 0 0 1px` `--control-border`, 15/600 `--ink-2`; «Создать» — 48px, `min-width: 240px`, отступ 0 20, радиус 12, 16/700.

**Files:**
- Create: `src/screens/teams/new-sheet.mjs`
- Modify: `src/screens/teams/new-flow.mjs` (`hasBuild`, без `step`), `src/screens/teams/new.mjs` (шаг выбора, `pickMarkup`, `createLabel`, `racesMarkup`, `step`, проводка поля и рас уходят; `renderNewTeam` — только набор), `src/screens/teams/builder-view.mjs` (`onRestart(button)`, у кнопки `dialog: true`), `src/ui/button.mjs` (`dialog`), `src/screens/teams/new.css`, `src/screens/teams/index.mjs` (кнопка «Новая команда», спрошенная шторка), `src/screens/team/empty.mjs` (кнопка «Создать команду» и её проводка)
- Test: `test/new-team-screen.test.mjs`, `test/builder-view.test.mjs`, `test/teams-screen.test.mjs`, `test/team-empty.test.mjs`, `test/home-route.test.mjs`, `test/ui-controls.test.mjs`

**Interfaces:**
- Consumes: Task 38 (`buildOf`, `pickOf`, `setPick`, `startBuild`, `onBuildStarted`); `renderSheet`, `wireSheets`, `renderTextField`, `renderButton`, `wireRadioGroups`; `patchWithModal`; `mountSheetHost` (`src/screens/team/manage/sheet-host.mjs`); `loadSeason`; `newTeamUrl`, `teamsUrl`, `refUrl`.
- Produces:
  - `new-flow.mjs`: `hasBuild() → boolean` — у тренера начат набор (`buildOf().draft` не `null`); поле `step` у `Build` уходит.
  - `renderButton({…, dialog = false})` — у кнопки `aria-haspopup="dialog"`; со `href` — исключение («a link opens no dialog»).
  - `new-sheet.mjs`:
    - `NEW_TEAM_SHEET_ID = "new-team-sheet"`; `racesMarkup(races, raceSlug)` — перенос из `new.mjs` как есть.
    - `newTeamSheetMarkup({name, raceSlug, races, seasonName, resets, back}) → string` — `back: boolean` — есть ли путь назад; `renderSheet({id: NEW_TEAM_SHEET_ID, title: t("newTeam.title"), sub: seasonName || t("shell.league"), canGoBack: back, className: "g-new-sheet", bodyHtml, footHtml, footStartHtml})`: тело — поле (`renderTextField({id: "new-team-name", name: "name", label: t("newTeam.name"), placeholder: t("newTeam.namePlaceholder"), value: name, autocomplete: "off"})`), «Раса» (`g-new__label`, `aria-hidden`), `racesMarkup`, при `resets` — `newTeam.raceResets`, ссылка `newTeam.raceRules` (`refUrl("teams")`); подвал — `renderButton({kind: "primary", label: <как createLabel>, disabled, data: {newTeamCreate: true}})`; `footStartHtml` при `back` — `renderButton({label: t("teams.title"), icon: "back", data: {newTeamBack: true}})`.
    - `openNewTeamSheet(opener, { back = null } = {}) → void` — `back` — функция пути назад или `null`; хост `mountSheetHost("new-team")` один на страницу, проведён один раз; рисунок из `pickOf()`, `state.data.teams`, названия сезона; фокус — `#new-team-name`; `loadSeason()` и перерисовка, пока открыта.
    - `askNewTeamSheet() → void`; `openAskedNewTeamSheet(opener) → boolean` — открыть, если просили, и забыть просьбу.
    - Проводка (на хосте): ввод `#new-team-name` → `setPick({name})` и перерисовка; `wireRadioGroups(host, {group: ".g-races", item: "[data-race]", attribute: "data-race", onChange})` → `setPick({raceSlug})` и перерисовка; `[data-new-team-create]` → `startBuild()`; при `true` шторка закрывается без возврата фокуса и, если `location.hash !== newTeamUrl()`, `location.hash = newTeamUrl()`; `wireSheets(host, {onClose, onBack})` — крест, фон, Escape: закрыть и вернуть фокус `opener` (его нет на странице — `h1`); «‹» и `[data-new-team-back]` — закрыть и `back()`; клик по ссылке в шторке и `hashchange` (`globalThis.addEventListener?.("hashchange", …)`, один раз) — закрыть без возврата фокуса.
  - `new.mjs`: `renderNewTeam()` — `hasBuild()` нет → `askNewTeamSheet(); location.replace(teamsUrl()); return;`; иначе набор, как сейчас; `onBuildStarted` (на время визита) — перерисовать набор и фокус на его `h1`; `onRestart(build, button)` → `openNewTeamSheet(button)`; `loadSeason()` больше не нужен набору (название сезона — у шторки). Экспорты: `renderNewTeam`, `LOGO_DATA_URL`.
  - `builder-view.mjs`: `delegate(root, "click", "[data-new-team-restart]", (event, button) => handlers.onRestart(button))`; у «Сменить расу или название» `dialog: true`.
  - `teams/index.mjs`: в `teamsMarkup` «Новая команда» — `renderButton({label: t("teams.new"), kind: "primary", icon: "plus", dialog: true, data: {newTeam: true}})`; `group.on("click", "[data-new-team]", (event, button) => openNewTeamSheet(button))`; после первого `draw()` — `openAskedNewTeamSheet(view.querySelector("[data-new-team]"))`.
  - `team/empty.mjs`: `noTeamMarkup` — «Создать команду» `renderButton({…, dialog: true, data: {newTeam: true}})`; `renderNoTeam` проводит `[data-new-team]` → `openNewTeamSheet(button)` и снимает при уходе.
- `new.css`: удалить правила страницы `.g-new`, `.g-new :where(p, h1)`, `.g-main:has(.g-new)`, `.g-new__card`, `__head`, `__titles`, `__title`, `__sub`, `__body`, `__foot` и их `@media`; оставить `.g-new__label`, `.g-new__ref`, `.g-races*` (значения рас — из шапки задачи: `border: 0; box-shadow: var(--ring)`, выбранная — `--accent-tint-soft` и `var(--ring-selected)`, `min-height: 44px`); добавить `.g-new-sheet …`: до 900px — тело зазор 14, `.g-sheet__foot-start` нет, «Создать» 52px; от 901px — `dialog.g-sheet.g-new-sheet { width: min(760px, calc(100% - 32px)); margin: 64px auto auto; max-height: min(86dvh, calc(100dvh - 96px)); border-radius: 20px; }`, шапка и тело — значения из шапки задачи, «‹» шапки скрыт (`[data-sheet-back]`), подвал — ряд `space-between`, «← Мои команды» и «Создать» — значения из шапки задачи; ссылка на справочник — `min-height: 24px` от 901px. Шапка `new.css` — о шторке.

- [ ] **Step 1: Падающие тесты** — `test/new-team-screen.test.mjs`: помощник `open()` — `openNewTeamSheet(null)`, ввод названия, выбор расы, «Создать», затем `renderNewTeam()` на `#/teams/new`; тесты набора — через него. Тесты шага выбора — переписать на шторку:
  - ««New team» is a sheet over the page it is opened on (TeamNew), a window on a desk (DeskTeamNew): the title, the season's name, the name, the races as one radio group, the way to their rules, «Create» saying what is missing» (вместо «step one asks for a name and a race…», «the first step is the page of the address…», «the markup of the first step…»).
  - «a name of blanks or no race keeps «Create» shut, saying what is missing; typing keeps the caret» (Review Focus 4).
  - ««Create» opens the builder of that race with the name, the sheet gone and the focus on the builder's title».
  - «a second press on «Create» makes nothing more: one build, one change of address».
  - ««Change the race or the name» opens the sheet over the builder with what was picked; another race says the squad starts again; «Create» goes back to the builder, the same race keeping the squad» (вместо «creating opens the builder…» и «going back shows what was picked…»).
  - «#/teams/new with no build is «My teams» with the sheet open over it; with a build, the builder» (Review Focus 4).
  - «the cross, the backdrop and Escape close it with the focus back where it was; a link in it, and a change of address, close it».
  - «a sheet opened before the season was read takes its name once it is in»; «it speaks Russian…» (вместо «the first step speaks Russian…»).
  - «the look: TeamNew's and DeskTeamNew's values; D2; readable; no inline widths; breakpoints only 900/901» — `valuesOf("src/screens/teams/new.css", ".g-races__item", "min-height")` — `44px`; «Создать» — 52 / 48; «← My teams» — 48; окно — 760px; `assertReadable` для `.g-new__label`, `.g-new__ref`, `.g-races__resets`.
  - `test/builder-view.test.mjs`: ««Change the race or the name» opens a dialog: onRestart is handed its button» (`aria-haspopup="dialog"`).
  - `test/teams-screen.test.mjs`: ««New team» opens the sheet over «My teams», with no change of address» (вместо `a.g-btn--primary[href="#/teams/new"]`); `test/team-empty.test.mjs`, `test/home-route.test.mjs`: «Create a team» — кнопка `[data-new-team][aria-haspopup="dialog"]`, открывает шторку; у тренера с непрочитанным списком её нет, как сейчас.
  - `test/ui-controls.test.mjs`: «a button that opens a dialog says so; a link cannot».
  - `assertDictionaryCovers("src/screens/teams/new.mjs", "src/screens/teams/new-sheet.mjs")`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/new-team-screen.test.mjs test/builder-view.test.mjs test/teams-screen.test.mjs test/team-empty.test.mjs test/home-route.test.mjs test/ui-controls.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапки `new.mjs` («`#/teams/new`: the builder of the build in hand… the first step is a sheet over the screen it is opened on (owner, 2026-10-20), new-sheet.mjs») и `new-sheet.mjs` (решения 62–66).
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/routes.test.mjs test/shell-*.test.mjs test/teams-*.test.mjs` → PASS; полный прогон → PASS; `npm run check` → 0 недостижимых, без циклов (`new-sheet.mjs` не импортирует `new.mjs`).
- [ ] **Step 5: Commit**

```bash
git add src/screens/teams src/screens/team/empty.mjs src/ui/button.mjs test/new-team-screen.test.mjs test/builder-view.test.mjs test/teams-screen.test.mjs test/team-empty.test.mjs test/home-route.test.mjs test/ui-controls.test.mjs
git commit -m "feat(teams): «New team» is a sheet over the screen it is opened on, a window on a desk, as TeamNew and DeskTeamNew; #/teams/new is the builder, and with no build «My teams» with the sheet (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 40: «Новая команда» из переключателя команд

Прототипы: `mobile/Team.html` / `desktop/DeskOverview.html` (`demo-teams="new"`: «Новая команда» под списком переключателя открывает шаг «Новая команда»; «‹» в шапке шторки телефона и «← Мои команды» окна десктопа возвращают к списку).

**Files:**
- Modify: `src/shell/team-switcher.mjs` (кнопка, `wireTeamSwitcher`), `src/shell/team-switcher.css` (`.g-switcher__new` — кнопка: `width: 100%`, `cursor: pointer`), `src/shell/shell.mjs` (`mountShell`, обработчик), `src/app.js` (импорт и вызов `mountShell`)
- Test: `test/team-switcher.test.mjs`, `test/shell-frame.test.mjs`

**Interfaces:**
- `team-switcher.mjs`: «Новая команда» — `<button type="button" class="g-switcher__new" data-switcher-new aria-haspopup="dialog">` (значок «+» и `teams.new`, как сейчас); `wireTeamSwitcher(host, { onSwitch, onClose, onNewTeam = () => {} })` — `delegate(host, "click", "[data-switcher-new]", () => onNewTeam())`.
- `shell.mjs`: `mountShell({ document, scroller, onNewTeam = () => {} } = {})`; нажатие — `const button = opener; closeSwitcher(); onNewTeam(button, { back: () => openSwitcher(button) })`. Оболочка не импортирует экраны: шторку ей даёт `app.js`.
- `app.js`: `import { openNewTeamSheet } from "./screens/teams/new-sheet.mjs";` и `mountShell({ onNewTeam: openNewTeamSheet });` — та же строка, что сейчас; `wc -l src/app.js` ≤ 120.

- [ ] **Step 1: Падающие тесты.**
  - `test/team-switcher.test.mjs`: ««New team» under the list is a button that opens a dialog, not a link to #/teams/new» (вместо проверок `a.g-switcher__new[href]`); «pressed, it is reported to onNewTeam».
  - `test/shell-frame.test.mjs`: ««New team» in the switcher: the switcher closes, onNewTeam is handed the team block's button and a way back that opens the switcher again» — шпион `onNewTeam`; `back()` → `#team-switcher` открыт, фокус — в нём.
  - `test/new-team-screen.test.mjs`: «opened from the switcher, «‹» on a phone and «← My teams» on a desk go back to it; the cross gives the focus to the team block» — `openNewTeamSheet(teamButton, {back})`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-switcher.test.mjs test/shell-frame.test.mjs test/new-team-screen.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces; шапка `team-switcher.mjs` — «Under the list stand the way to a new team, a sheet the shell is handed (app.js), and the way to all of them».
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/shell-*.test.mjs test/app-boot*.test.mjs test/teams-*.test.mjs` → PASS; полный прогон рецепта Т → PASS (`npm run check`, `npm run i18n:check`: одинаковое число страниц EN/RU, 0 fallback).
- [ ] **Step 5: Браузер** (встроенный, рецепт М: mock 5178, токен `mock` в `gata-league-auth-token`): 390 — `#/t/t1` (плитки, лидеры, результаты, табло), шеврон шапки → «Новая команда» → шторка, «‹» → снова переключатель, «Новая команда» → название, раса, «Создать» → набор, «Сменить расу или название» → шторка над набором; `#/t/t1/team` → строка «Настройки команды» → экран с «‹»; 1440 — `#/t/t1` (пять карточек, лидеры-карточки, справа «Готовы к прокачке» и «Таблица», поиск в шапке, герб и буква на табло), SideNav → «Новая команда» → окно 760px с «← Мои команды»; `#/t/t1/team` — карточка настроек справа под историей; `#/teams/new` набрать руками → «Мои команды» со шторкой. Mock остановить. Что видно и чем отличается от прототипов — в отчёт.
- [ ] **Step 6: Commit**

```bash
git add src/shell/team-switcher.mjs src/shell/team-switcher.css src/shell/shell.mjs src/app.js test/team-switcher.test.mjs test/shell-frame.test.mjs test/new-team-screen.test.mjs
git commit -m "feat(shell): «New team» in the team switcher opens the new team's sheet over the page, with the way back to the switcher (owner, 2026-10-20)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## После Task 40: контроллер повторяет Task 17–19 плана 07d

Своих задач контроллера у дополнения нет. После Task 40 контроллер исполняет Task 17 (снимки рядом с прототипами), Task 18 (финальное ревью, правки спек, проверки) и Task 19 (PR) **плана 07d** — с тем, что приносит это дополнение:

- **Task 17 (снимки, `docs/redesign/screens/rd-07d.json`):** переснять O1 (390 и 1440) рядом с `Team` / `DeskOverview`; добавить O2 — обзор команды вне сезона (`#/t/t4`, 390 и 1440); S1 — `#/t/t1/team` 1440 (карточка справа) рядом с `DeskBuilder` (карточка «Команда») и `DeskRosterFunds`; S2 — `#/t/t1/team` 390 (строка-ссылка) рядом с `TeamManage`; новый S4 — `#/t/t1/settings` 390 рядом с `Builder` / `BuilderFull`; S3 и S3p (смена расы) — удалить; новые N1 — шторка «Новая команда» над обзором 390 (действие: шеврон → «Новая команда») рядом с `TeamNew`, N2 — окно 1440 рядом с `DeskTeamNew`, N3 — `#/teams/new` без набора → «Мои команды» со шторкой. Состояния `rd-06.json` на `#/teams/new` теперь попадают на «Мои команды» со шторкой — контроллер решает, переснимать ли их. Каждое отличие — исправить или записать, как в шаге 5 Task 17; таблица «Все отличия обзора» выше — исходный список.
- **Task 18, шаг 2 (правки спек):**
  - спека 3.0: §2 — строка `#/teams/new` («набор; первый шаг — шторка над текущим экраном, без набора — «Мои команды» со шторкой»), новая строка `#/t/:teamId/settings` («Настройки команды»: на телефоне экран «вглубь» с «‹», на десктопе — страница «Команда» с карточкой справа), строка `#/t/:teamId/team` (настройки — карточка правой колонки на десктопе, строка-ссылка на телефоне); §6 — модули `team/overview-lists`, `team/manage/settings-screen`, `teams/new-flow`, `teams/new-sheet`; §7 — расхождения этого дополнения (решения 48–55, 57–59, 62–66 и отчёты задач), снять строки о смене расы (§7 07d: «красная кнопка говорит…», «Сервер… смену расы… не отклоняет») и запись 06 «Новая команда — страница…»;
  - спецификация интерфейса: §3 — плитки по ширине, «TD ± / CAS ±», поиск в шапке, лидеры, порядок блоков, результаты, мини-таблица, табло (герб, буква, раса); строка «Не в этапе 06» — без мини-таблицы и поиска; «Как построено на 07d» — «Готовы к прокачке» в правой колонке; §4 — «Новая команда» переключателя и «Моих команд» открывает шторку; §5 — первый шаг — шторка (телефон) и окно 760px (десктоп) над текущим экраном, `#/teams/new` — набор, без набора — «Мои команды» со шторкой, «Сменить расу или название» — шторка над набором; §7 — «Настройки команды» без слов о расе; §14 — свой экран и карточка, раса только для чтения, абзац «Смена расы» снять; «Известные расхождения»: 9 — герб и буква сделаны, листание по турам — этап 09; 11 — закрыто; 17 — мини-таблица и поиск сделаны, TV соперника — этап 09; новые — из «Deviations from the prototype» отчётов Task 30–40.
- **Task 18, шаг 3:** `wc -l` — плюс `overview-lists.mjs`, `overview-lists.css`, `settings-screen.mjs`, `new-flow.mjs`, `new-sheet.mjs`, `src/app.js` (≤ 120), `manage/index.mjs` (≤ 210); `git diff --name-only origin/redesign -- server/` — как после дополнения 1.
- **Task 19 (тело PR):** замечания и ответы владельца круга 2 и как исполнены; вопросы 1–3 и принятые умолчания; ограничения — TV соперника и листание табло (этап 09), пузыри подготовки (09a), MVP в результатах (вопрос 3), mock без пар туров (разница TD мини-таблицы в mock — нули); админская смена расы — на редакторе 2.x до этапа 12.

---

## Передача следующим этапам

- **07e.** «Лидеры обзора» сделаны здесь (Task 32); карьера на десктопе — как в дополнении 1.
- **09 / 09a · табло.** Листание табло по турам («‹ ›», квадраты-вкладки, «Т», прошлый матч с CAS и MVP), TV соперника, пузыри индьюсментов и пропусков — `renderMatchBoard` готов принять их полями; герб, буква и раса ссылкой уже есть (Task 34). Решение владельца о табло на телефоне — вопрос 2.
- **10 · сезон.** Мини-таблица (`seasonTable`, `tableMarkup`) — карточка обзора; полная таблица 3.0 может считать разницу TD так же (`rounds[].pairings`); зона плей-офф — по правилу контента, когда оно будет числом.
- **12 · админ и стадия `draft`.** «Создать» шторки — место, где команда будет создаваться в `draft` (§5); смена расы — только в админской правке.
- **13 · зачистка.** Значок логотипа набора (`builder-view.mjs`, щит) — привести к `image`, как в настройках; поле поиска в шапках других экранов — тем же `renderSearchField` + `wireRefSearch`/`goSearch`.

## Охват

| Пункт | Задача |
|---|---|
| Замечание 1: карточки лидеров не как в прототипе | 30, 32 (решение 50) |
| …другой порядок блоков | 32 (решение 51) |
| …верхние карточки | 30, 31 (решение 48) |
| …каждое отличие `DeskOverview` перечислено и решено, данные, которых нет, — вопрос с умолчанием | таблица «Все отличия обзора», 31–34, вопросы 1–3 |
| …телефон `Team.html` проверен: плитки, лидеры, результаты исправлены; табло — вопрос 2 | 31, 32, 33 |
| Замечание 2: свой экран телефона с тёмной шапкой и «‹», адрес, роутер, оболочка, вход со страницы «Команда» | 36 (решения 56–57) |
| …карточка правой колонки десктопа, как карточка «Команда» `DeskBuilder` | 36, 37 (решения 58–59) |
| …нижняя секция ушла; 08 (ресурсы, казна, история) не тронуты | 36 (тесты `team-manage`) |
| …правила записи Task 14–15 держатся | 35, 36 (Global Constraints, тесты закрытия) |
| Замечание 3: раса только показана; шторка, `withRace`, `assertSameRace`, `identity.baseTeamSlug`, ключи, CSS, тесты удалены; 0 недостижимых; админ 2.x не тронут | 35 (решение 61) |
| Замечание 4: шторка / окно над текущим экраном, как `TeamNew` / `DeskTeamNew`; после «Создать» — набор | 38, 39 (решения 62, 65, 66) |
| …что делает `#/teams/new`; откуда открывается: переключатель, «Мои команды», тренер без команд, набор | 39, 40 (решения 63–64) |
| …набор не изменён, кроме нужного потоку; правка §5 спецификации — контроллеру | 39, «После Task 40» |
| Ограничения: близость, D2, слова, переносы, пространства ключей, пределы, инварианты 07a–08 | Global Constraints; тесты каждой задачи |
| Снимки, правки спек, PR | Task 17–19 плана 07d (раздел «После Task 40») |

# Редизайн Gata League 3.0: новая структура сайта, модель данных и API

**Тип документа:** design spec (проектное решение). Пошаговый план — `docs/superpowers/plans/2026-10-14-redesign.md`.
**Основа:** ветка `main`, коммит `dc9a08e` (релиз 2.0.0 + fix(season)).
**Макеты:** канвас «Blood Bowl — состав и SPP», версия 0.8, архив `Gata-League-v0.8.zip`: прототипы, спецификация интерфейса `spec/SPEC.md` и дизайн-система Gata League UI.

---

## 0. Решения владельца (2026-10-14)

1. **Правила игры берутся из кода и контента лиги, а не из макетов.** Макеты задают вид, структуру и потоки. Где спецификация 0.8 расходится с кодом (MVP = 5 SPP, продажа за половину стоимости, KO = 1 SPP, веса SPP для Brawlin' Brutes и Passing Virtuosos), правится спецификация.
2. **Броски на сайте добавляются как необязательные.** Это случайный основной навык (по Skill Table) и бросок D8 характеристики (по таблице из `content/Gata/General Information/Player Advancement.md`). Ручной ввод результата «бросил за столом» остаётся. Решение из плана post-match от 2026-10-06 («приложение не бросает кубик») пересматривается только для прокачки. MVP по-прежнему выбирает тренер, бросок для MVP — открытый вопрос (§9).
3. **Ветки.** Долгоживущая ветка `redesign` от `main`. В неё идут этапные PR из веток `rd/NN-название`. В `main` она вливается целиком, когда перенесены все разделы. Пока идёт работа, `main` можно чинить, а `redesign` регулярно ребейзится или мержит `main`.
4. **Экраны без макетов сначала дорисовываются** (канвас 0.9), потом переносятся. Этапы, которые от них не зависят (БД, API, дизайн-система в коде, каркас), идут параллельно.
5. **Запрет переписывать roster-блоб остаётся в силе** (решение от 2026-08-19, `src/domain/roster/schema.mjs`). Блоб меняется только аддитивно: новые необязательные поля с безопасным значением по умолчанию. Новые сущности живут в новых таблицах.

## 1. Что меняется для тренера

Сегодня сайт устроен вокруг разделов: Главная, Мои команды, Справочник, Мои игры, Сезон, Администрирование. В 0.8 он устроен **вокруг активной команды**. В шапке всегда видно, за какую команду ты сейчас, и все разделы показывают её.

| | Сегодня (2.0) | 3.0 |
|---|---|---|
| Мобильная навигация | выезжающая боковая панель, 6 пунктов | шапка команды (сжимается при прокрутке) и горизонтальные вкладки: Обзор · Команда · Состав · Матчи · Таблица · Справочник · Настройки |
| Десктоп | боковая панель 280px с теми же 6 пунктами | SideNav: переключатель команды, Обзор · Состав · Сезон · Справочник · Настройки, (Администрирование), карточка текущего матча |
| Вход | модальное окно в шапке | отдельный экран `#/login` с вкладками «Вход / Регистрация» |
| Тема | 6 тем в выпадающем списке в шапке | «Настройки → Оформление»: режим Светлая / Тёмная / Как в системе и по 4 палитры на режим |
| Шрифты | Comfortaa / Nunito | Golos Text / Oswald, оба с кириллицей |
| Казна | число, которое правят руками | счётчики ресурсов, «Зачислить / Списать» с причиной, история операций |
| Пропуск матча | галочка skip next game | причина пропуска; погибшие игроки — отдельная секция с причиной гибели |
| Прокачка | выбор в редакторе | шаги «тип → категория → навык / бросок → готово», можно бросить на сайте |

Публичная часть без входа остаётся: Справочник, таблица и календарь сезона (`GET /api/season` и так публичный), правовая страница.

## 2. Информационная архитектура и маршруты

Роутер остаётся хешевым и чистым (`src/core/routes.mjs`). Новые маршруты:

| Маршрут | Экран (канвас 0.8) | Заменяет |
|---|---|---|
| `#/login`, `#/register` | Вход и регистрация | `#auth-modal` |
| `#/teams` | Мои команды (переключатель, полноэкранный на мобильном) | `#/my-teams` |
| `#/teams/new` | Новая команда → команда в стадии `draft` (§3.1) | `#/builder` |
| `#/t/:teamId` | Обзор команды | `#/` для вошедшего тренера |
| `#/t/:teamId/team` | Команда: казна, ресурсы, история (на десктопе — полоса в «Составе») | ресурсы в `saved-roster` |
| `#/t/:teamId/roster` | Состав | `#/my-teams/:teamId` |
| `#/t/:teamId/roster/:playerId` | Профиль игрока, прокачка | карточка игрока в `saved-roster` |
| `#/t/:teamId/matches` | Матчи: текущий матч, календарь, товарищеские | `#/my-games` |
| `#/season`, `#/season/:tab` | Таблица / Сезон | без изменений по смыслу |
| `#/coaches/:uid`, `#/coaches/:uid/teams/:tid` | Профиль тренера, обзор соперника | `#/players/...` |
| `#/games/:id`, `.../pre-match[/:step]`, `.../post-match[/:step]` | Перед матчем, игра, итоги | без изменений |
| `#/ref`, `#/ref/:section`, `#/:slug` | Справочник: разделы, списки, статьи | `#/pages`, `#/skills`, `#/teams`, … |
| `#/settings` | Настройки: аккаунт, оформление | профиль в модальном окне, `#theme-select` |
| `#/administration/...` | Администрирование | без изменений по смыслу, новый вид |

**Старые маршруты не ломаются:** `routes.mjs` получает таблицу редиректов (`#/my-teams/:id` → `#/t/:id/roster`, `#/players/...` → `#/coaches/...`, `#/builder` → `#/teams/new`, `#/my-games` → `#/t/<активная>/matches`). Ссылки из Telegram-чатов лиги продолжат работать.

**Активная команда.** Хранится в `users.preferences.activeTeamId` (§3.5) и дублируется в localStorage для быстрого старта. Если команды нет — пустой «Обзор» с кнопкой «Создать команду». Маршрут `#/t/:teamId/*` делает команду активной.

## 3. Модель данных

Пять миграций, все аддитивные. Номера идут следом за `008_withdraw_season_entries.sql`. Применяются как обычно: `npm run db:migrate`, сервер не стартует, пока миграции не применены.

### 3.1 `009_team_stage.sql` — стадия команды (межсезонье / сезон)

Из правил Gata: Team Reroll «не удваивается при наборе команды, но удваивается при покупке в сезоне» (`content/Gata/Rules/3. Team Management.md`). В коде это два поля, `startingRerolls` за 60k и `teamRerolls` за 120k, но когда какое покупается, сейчас ничего не ограничивает. В 0.8 это два счётчика, и каждый заблокирован в «чужой» стадии.

```sql
ALTER TABLE saved_teams ADD COLUMN stage TEXT NOT NULL DEFAULT 'active'
  CHECK (stage IN ('draft','active'));
ALTER TABLE saved_teams ADD COLUMN activated_at TIMESTAMPTZ;
```

- Все существующие команды получают `active`: они уже собраны и играли.
- Новая команда создаётся в `draft`. В этой стадии работают правила билдера: бюджет 600k, позиции, только Start Re-rolls. Билдер перестаёт быть отдельной сущностью с черновиком в localStorage: это та же команда в стадии `draft`, сохранённая на сервере.
- Переход `draft → active` происходит при `POST /api/games/:id/start` первого матча команды (лиги или товарищеского) или явно у админа (§9, вопрос 1). Обратного перехода нет.
- В домене: `src/domain/roster/stage.mjs` (чистый модуль) с `canBuy(stage, key)` и `stageViolations(before, after, stage)`. Сервер в `PATCH /api/teams/:id` отклоняет рост `startingRerolls` в `active` и рост `teamRerolls` в `draft` с кодом `STAGE_PURCHASE_LOCKED` (код нужно добавить в `API_ERRORS` и i18n).

### 3.2 `010_team_ledger.sql` — журнал казны

```sql
CREATE TABLE team_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  delta integer NOT NULL,            -- в тысячах, со знаком
  balance_after integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manual','hire','sale','cancel_purchase','staff','staff_refund',
        'match_spend','match_income','safe','mistake','admin')),
  reason text,                       -- для manual: friendly|sponsor|fine|purchase|other
  note text,
  pairing_id uuid REFERENCES season_pairings(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_ledger_team_idx ON team_ledger (saved_team_id, created_at DESC);
```

- **Казна по-прежнему живёт в блобе** (`roster.treasury`): это источник истины, журнал — объяснение. Задним числом журнал не заполняется, экран пишет «История ведётся с <дата миграции>».
- Строки пишет только сервер, в той же транзакции, что и изменение казны:
  - `PATCH /api/teams/:id`: чистая функция `src/domain/roster/ledger.mjs::classifyTreasuryChange(before, after)` раскладывает разницу на найм, продажу, отмену покупки и персонал по диффу игроков и `purchasedStaff`. Остаток, который не объясняется, считается `admin` (только для админа) или отклоняется (`TREASURY_UNEXPLAINED`) для тренера;
  - `POST /api/teams/:id/treasury` — ручная операция «Зачислить / Списать» с обязательной причиной;
  - старт матча (`finance-store.mjs`) — `match_spend`; завершение post-match — `match_income`, `safe`, `mistake`.
- **Поле «Казна» перестаёт редактироваться тренером напрямую.** Прямую правку с причиной `admin` может делать только админ.

### 3.3 `011_fallen_players.sql` и поле `absence` — пропуски и павшие

Блоб игрока получает необязательное поле `absence` (аддитивно, `schema.mjs`: `kind: "object"`, по умолчанию `null`):

```js
absence: { code: 'miss' | 'niggling' | 'lasting' | 'other', stat?: 'ma'|'st'|'ag'|'pa'|'ar', note?: string, pairingId?: string } | null
```

- Источником истины для TV и допуска к матчу остаётся `skipNextGame`, а `absence` объясняет причину. Коды совпадают с кодами травм post-match (`src/domain/post-match/roster.mjs`), поэтому post-match заполняет `absence` сам.
- Ручная отметка «Пропуск матча…» в составе ставит `skipNextGame = true` и `absence`. «Вернуть в состав» сбрасывает оба поля.

Погибшие сейчас просто удаляются из блоба. 0.8 показывает их отдельной секцией с причиной, поэтому заводится таблица:

```sql
CREATE TABLE team_fallen_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  player jsonb NOT NULL,              -- снимок игрока на момент гибели
  cause text,
  pairing_id uuid REFERENCES season_pairings(id) ON DELETE SET NULL,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  died_at timestamptz NOT NULL DEFAULT now()
);
```

- Post-match при травме `dead` пишет строку туда в той же транзакции, где применяет ростер.
- Ручная отметка гибели (`POST /api/teams/:id/players/:playerId/death {cause}`) удаляет игрока из блоба и вставляет строку. Отмена (`DELETE /api/teams/:id/fallen/:fallenId`) возвращает игрока, если позволяет лимит состава.

### 3.4 `012_dice_rolls.sql` — броски на сайте

```sql
CREATE TABLE dice_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('random_skill','stat')),
  params jsonb NOT NULL,             -- категория, список кандидатов
  result jsonb NOT NULL,             -- все броски, включая переброшенные дубли
  rolled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- Бросает только сервер (`crypto.randomInt`), клиент ничего не генерирует. Таблицы бросков — чистый модуль `src/domain/roster/dice.mjs`: D8 из Player Advancement и Skill Table для случайного навыка. Уже имеющиеся навыки перебрасываются автоматически, все попытки записываются.
- Бросок одноразовый: прокачка, которая на него ссылается, ставит `used_at`. Повторный бросок для того же незавершённого шага возвращает тот же результат, чтобы нельзя было «бросать до удачного».
- Advancement в блобе получает необязательное `roll: { id, via: 'site' } | { via: 'table' }` (аддитивно). Соперник и админ видят, как получен результат.

### 3.5 `013_user_preferences.sql` — настройки пользователя

```sql
ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Ключи: `themeMode` (`light|dark|system`), `lightPalette`, `darkPalette`, `activeTeamId`, `locale`. Сервер принимает только известные ключи и значения. localStorage остаётся кешем для `theme-boot.js`: тема должна примениться до загрузки модулей, без мигания.

**Палитры.** Шесть текущих тем заменяются на 4 светлых и 4 тёмных палитры из 0.8. `theme-boot.js` переводит сохранённые старые id в ближайшую новую палитру, таблица соответствия лежит в `src/core/theme.mjs`.

### 3.6 Что не меняется

Сезоны, раунды, пары, швейцарская система, очки, товарищеские вызовы, состояния pre-match и post-match, снапшоты ростеров и сессии остаются как есть. Меняется только их вид.

## 4. API

Новые и изменённые эндпоинты. Все ошибки идут через `httpError` с кодами в `server/http/errors.mjs` и ключами `error.<CODE>` в обоих словарях (это проверяет `test/api-errors.test.mjs`).

| Метод и путь | Доступ | Назначение |
|---|---|---|
| `GET /api/teams/:id` | U | + `stage`, `activatedAt` |
| `PATCH /api/teams/:id` | U | + проверка стадии (`STAGE_PURCHASE_LOCKED`) и классификация казны (`TREASURY_UNEXPLAINED`), запись в `team_ledger` |
| `GET /api/teams/:id/ledger?before=&limit=` | U (владелец, админ) | история казны, постранично |
| `POST /api/teams/:id/treasury` | U | `{delta, reason, note?, revision}` → `{team, entry}`; уход в минус → 422 с нарушением `TREASURY_INVALID` |
| `GET /api/teams/:id/fallen` | U | павшие игроки |
| `POST /api/teams/:id/players/:pid/death` | U | `{cause, revision}` → `{team, fallen}` |
| `DELETE /api/teams/:id/fallen/:fid` | U | вернуть игрока → `{team}` |
| `POST /api/teams/:id/players/:pid/rolls` | U | `{purpose, category?}` → `{roll}` (повторный вызов на тот же шаг возвращает тот же бросок) |
| `POST /api/teams/:id/activate` | A | ручной перевод `draft → active` |
| `PATCH /api/auth/profile` | U | смена пароля требует `currentPassword` (`CURRENT_PASSWORD_WRONG`) |
| `GET /api/auth/me`, `PATCH /api/auth/preferences` | U | `preferences` в пользователе и их запись |
| `GET /api/health` | P | + `maintenance: {kind, startsAt, endsAt} \| null` |

Обзор команды, обзор соперника и вкладка «Матчи» собираются на клиенте из `GET /api/season`, `GET /api/games` и `GET /api/players/:uid/teams/:tid`, без новых эндпоинтов. Отдельный `GET /api/season/entries/:id/summary` добавляется, только если клиентская сборка окажется медленной.

**Техобслуживание.** Флаг-файл `/etc/bloodbowl-league/maintenance.json` (или `MAINTENANCE_FILE` в `.env`) с полями `{kind: planned|unplanned, startsAt, endsAt, changes}`.
- Пока он есть, сервер отдаёт 503 и самодостаточную `public/maintenance.html` (экран 0.8 «Техобслуживание», без модулей приложения) на любой не-API путь.
- На `/api/*` сервер отвечает 503 `MAINTENANCE`. Исключения: `/api/health` и запросы админа.
- Страница сама опрашивает `/api/health` раз в 30 секунд. В `DEPLOYMENT.md` добавляется, как включать режим и как отдать ту же страницу из nginx, если Node не запущен.

## 5. Фронтенд

**Ограничения не меняются:**
- vanilla ES-модули, без фреймворка и сборщика;
- хешевый роутер;
- `t()` и `data-i18n*` для всех строк, словари `en.json` и `ru.json`;
- CSP без inline JS;
- `escapeHtml` для каждой интерполяции;
- бюджеты `scripts/check-budgets.json` (600 строк на файл, 80 строк на функцию; бюджеты только уменьшаются);
- ноль недостижимых функций;
- чистый `src/domain/**`.

**Слои:**
- `src/styles/tokens.css` переписывается по `tokens.json` дизайн-системы: цвета светлых и тёмных палитр, `--font-display: Oswald`, `--font-body: Golos Text`, отступы, радиусы, размеры касания. Старые переменные (`--panel`, `--md-*` …) временно отображаются на новые, чтобы ещё не перенесённые экраны не развалились. Они удаляются на последнем этапе.
- Шрифты self-hosted в `assets/fonts/` (woff2, подмножества latin, latin-ext, cyrillic, cyrillic-ext; лицензии OFL рядом), как сейчас сделано с Comfortaa.
- `src/ui/` — новая папка с компонентами дизайн-системы, по одному модулю: Button, SegmentedControl, Sheet (шторка на мобильном и модальное окно от 901px — один компонент поверх текущего `components/dialog.mjs`), ActionStepper, ResourceCounter, SkillChip, StatStrip, Die, ProgressDots, Toggle, TextField, OptionCard, KpiTile, FormStrip, ResultPill, StatusChip, MatchCard, ListRow, Callout. Каждый компонент — функция `render…(props) → html` плюс, если нужно, `wire…(root)`.
- `src/shell/` — новая оболочка: шапка команды со сжатием (`scrollTop > 48` / `< 8`), вкладки, SideNav, карточка текущего матча. `index.html` получает новую разметку оболочки, модальное окно входа удаляется.
- Экраны переносятся по одному в `src/screens/<раздел>/`. Перенесённый экран удаляет свой старый CSS в том же PR.

**Брейкпоинты.** Мобильная раскладка до 900px, десктоп от 901px (как сейчас). Макеты сделаны для 390 и 1440, промежуточные ширины проверяются на 768 и 1024.

## 6. Соответствие экранов

| Флоу канваса 0.8 | Новый модуль | Данные | Что уходит |
|---|---|---|---|
| Вход и регистрация | `screens/auth/login.mjs` | `/api/auth/*` | `components/auth-modal.mjs` |
| Обзор команды | `screens/team/overview.mjs` | season + games | `screens/home.mjs` (для вошедших) |
| Смена и создание команды | `screens/teams/index.mjs`, `teams/new.mjs` | `/api/teams` | `my-teams.mjs`, `builder.mjs` |
| Состав · список, SPP, пропуски, найм, продажа, профиль, прокачка | `screens/roster/*` | `/api/teams/:id` + fallen + rolls | `saved-roster.mjs`, `components/roster-editor/*` |
| Казна и ресурсы (сезон и межсезонье) | `screens/team/treasury.mjs` | ledger, treasury | `staff-control.mjs`, поля казны и сейфа |
| Матчи: табло, перед матчем, игра, итоги | `screens/matches/*` + restyle `games/*` | `/api/games*`, preparation, post-match | `my-games.mjs` |
| Таблица → соперник | `screens/season/*`, `screens/coaches/*` | `/api/season`, `/api/players/*` | `players/*` |
| Справочник | `screens/ref/*` | `public/data.*.json` | `section.mjs`, `detail.mjs` (вид) |
| Настройки | `screens/settings/*` | profile, preferences | `#theme-select`, профиль в модальном окне |
| Техобслуживание | `public/maintenance.html` | `/api/health` | — |

## 7. Макеты, которые нужно дорисовать (канвас 0.9)

0.8 не покрывает часть того, что уже работает на сайте. До переноса этих экранов рисуются:

1. **Новая команда в стадии `draft`:** раса, лига / Favoured of, логотип, набор игроков на 600k с лимитами позиций, Start Re-rolls, персонал, капитан. Это билдер.
2. **Персонал во всех вариантах:** Bribes (с Bribery), Apothecary, Mortuary Assistant, Plague Doctor, Coach's Safe (депозит после матча, баланс).
3. **Pre-match по шагам:** фанаты (D3), погода, состав (джорнимены, Loner 4+), индьюсменты и звёзды (лимиты слотов, Mega Star), бюджет (petty cash, тир, казна), обзор, старт.
4. **Post-match по шагам:** результат (технический, сдача), фанаты и доход, игроки (SPP, MVP, травмы, прокачка), состав (найм, Raise, keep journeyman, продажа, персонал), казна (сейф, Expensive Mistakes), следующий матч (капитан), итоги и подтверждение обоими.
5. **Товарищеские:** отправить вызов, входящие и исходящие, принять с выбором команды, отклонить, отменить.
6. **Администрирование:** список тренеров, профиль тренера (сброс пароля, команды), правка любой команды, сезон (участники, раунды, пары, ручной результат, добавить тренера с командой).
7. **Профиль тренера** (публичный) и обзор соперника, если матча с ним нет.
8. **Прокачка с бросками на сайте:** Skill Table и D8 с настоящими таблицами, вариант «бросил за столом», история с пометкой «на сайте / за столом».
9. **Конфликт сохранения** (409 `TEAM_SAVED_ELSEWHERE`) и офлайн-состояние автосохранения.
10. **Главная для гостя:** что видит человек без входа, справочник и сезон.

Вместе с этим правится спецификация 0.8, чтобы она совпадала с правилами кода (§0.1): веса SPP, продажа за половину стоимости, недоступность продажи при 7 игроках, лимиты стоимости игрока и характеристик (MA 9, ST 8, AV 11+, AG/PA 1+, не больше +2), состав 7–14.

## 8. Что не делаем

- Не переписываем существующие roster-блобы и не вводим RosterV2.
- Не меняем правила матчей, очки сезона и швейцарскую систему.
- Не вводим фреймворк, сборщик или TypeScript.
- Не меняем хостинг, Postgres и схему авторизации (bearer-токены).

## 9. Открытые вопросы владельцу лиги

1. **Когда команда переходит из `draft` в `active`:** при старте первого матча (предложение), при заявке в сезон или только руками админа?
2. **Бросок MVP на сайте** («3 игрока, D3»): добавлять ли наравне с прокачкой?
3. **Прямая правка казны:** оставить её только админу (предложение) или и тренеру, с обязательной причиной?
4. **Палитры вместо тем:** подтвердить, что шесть тем 2.0 заменяются палитрами 0.8, и утвердить таблицу соответствия.
5. **Видимость бросков:** показывать сопернику только итог или всю историю попыток?

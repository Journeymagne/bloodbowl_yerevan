# Этап 07c · Состав: найм и продажа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Состав» 3.0 (`#/t/:id/roster`) получает «+» рядом с «ИГРОК» в шапке «Активного состава» и корзину найма с лимитами позиций, лимитом 14 и казной; «Продать» второй кнопкой пары действий («Пропуск матча…» | «Продать», в матче «Травма в матче…» | «Продать», закрыта) с подтверждением (половина текущей стоимости, Architect of Fate, запрет при ≤ 7) и «Отменить покупку» с полным возвратом до старта матча — так близко к прототипам `StatsHire`, `StatsSell`, `DeskRosterHire`, `DeskRosterSell`, как позволяет код.

**Architecture:** найм и продажа — шаги очереди сохранений 07a (`save.mjs`), как отметка пропуска 07b: изменение черновика, один `PATCH` всего состава на ревизии очереди, со всеми её правилами (ждёт сети, потерянный ответ узнаётся по 409 со своим составом, конфликт, 422, R8, чужой токен). Деньги и лимиты считает чистый домен (`src/domain/roster/transfers.mjs`: `hireQuote`, `hirePlayers` и существующие `playerRemoval`, `removeLeaguePlayer`); новые игроки создаются в той форме, в какой их хранит сервер, а журнал казны пишет сервер (`classifyTreasuryChange`) — строка `hire`, `sale` или `cancel_purchase` ровно на сумму шага. Корзина и подтверждение — шторки на визите (`market.mjs`, `hire-sheet.mjs`, `sell-sheet.mjs`, `market.css`), их вид по ширинам — из прототипов. Этап начинается от влитого PR «desk fidelity» (решения владельца D1–D3).

**Tech Stack:** vanilla ES-модули, хешевый роутер, Node 22 (`node --test`), `test/helpers/fake-dom.mjs`, `fake-api.mjs`, `ui.mjs`, `contrast.mjs`, `roster-page.mjs`, `ref-screen.mjs`; CSS custom properties; нативный `<dialog>`; `npm run screens`, `scripts/mock-api.mjs`, `scripts/smoke-api.mjs`.

**Spec:**
- Спека 3.0 `docs/superpowers/specs/2026-10-14-redesign-design.md`: §0 (п. 1, 5, 8, 11, 12), §2 (таблица «До своего этапа», `#/t/:teamId/roster[/:playerId]`), §3.2 (журнал казны, `classifyTreasuryChange`), §3.3 (как «Состав» пишет — образец), §4 (`PATCH /api/teams/:id`, «Ошибки тела запроса»), §6 (строка «Состав …»), §7 («Расхождения этапа 07a», «07b» — 07c дописывает свои).
- Спецификация интерфейса `docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md`: §0 («Общие правила»), §6, §7, §8, §10, §11, §18 (старт закрывает отмену покупок), «Известные расхождения».
- Решения владельца 2026-10-19 (через координатора; обязательны): **D1** — счётчики SPP в панели десктопа — сетка 3×3 `DeskRosterLive`; **D2** — от 901px элементы управления и чипы компактны, как в прототипе, цель не меньше 24px (WCAG 2.5.8 AA) вместо 44px; на телефоне 44px; **D3** — вне матча в панели десктопа нет счётчиков SPP: доступные SPP и «Прокачать», навыки, следующий матч, пара «Пропуск матча…» | «Продать», карьера. D1 и D3 приносит отдельный PR «desk fidelity» до 07c; 07c от него начинается (Task 1). Близость к прототипам: каждое состояние названо своим прототипом, значения в задачах — из HTML прототипов.
- Мастер-план `docs/superpowers/plans/2026-10-14-redesign-rollout.md`: Global Constraints, протокол этапа (шаги 1–10), строка 07a–07e (smoke: `smoke`, `smoke:post-match`), «Дополнения к этапам → 07a–07e» и блок «05–13».
- План 3.0 `docs/superpowers/plans/2026-10-14-redesign.md`: этап 7, пункт 7c.
- Handoff `docs/redesign/handoff-0.9.1/`: `SCREENS.md` (флоу «Состав · Найм игроков», «Состав · Продажа игрока»); прототипы `mobile/StatsHire.html`, `mobile/StatsSell.html`, `desktop/DeskRosterHire.html`, `desktop/DeskRosterSell.html`, для пары действий — `desktop/DeskRosterPrep.html`, `desktop/DeskRosterLive.html`, `mobile/StatsLive.html`; `design-system/` (RosterTable, BottomSheet, Button), `PR-CHECKLIST.md`.
- Передачи: план 07b (решения 1–23, «Передача следующим этапам → 07c»), тело PR 07b и его журнал (K1–K20, R1–R3), финальное ревью 07b; тело PR 07a и журнал (R1–R18); PR 08 (казна, `classifyTreasuryChange`, `normalizeDraft`, полоса); PR 06 (правила набора `src/domain/roster/build.mjs`, мёртвый `CREATE_MODE`); план 11 (решение 19, `renderRosterStatGrid`).
- Контракт сервера — код: `server/routes/teams.mjs` (`writeSavedTeam`, `readTeamBody`), `server/domain/roster.mjs` (`checkRoster`, `BLOCKING_CODES`), `src/domain/roster/ledger.mjs` (`classifyTreasuryChange`), `src/domain/roster/stage.mjs`, `src/domain/roster/transfers.mjs`, `server/season/finance-store.mjs` (`sealPlayerPurchases` при старте матча); контент `content/Gata/Rules/3. Team Management.md`, `content/Gata/Rules/2. Team Creation.md`, `content/Gata/General Information/Special Rules.md` (Architect of Fate).

## Global Constraints

- Ветка `rd/07c-hire-sell`, worktree `/Users/felstell/git/bb-rd-07c`, сейчас от `origin/redesign` `6313b6b` (06, 11, 08, 07a, 07b влиты). **07c начинается от влитого PR «desk fidelity»** (D1–D3, вид 07a/07b по прототипам): Task 1 переносит ветку на `origin/redesign` после его слияния и сверяет швы, которые называет этот план. До Task 1 ни одна задача не исполняется. PR в `redesign` по протоколу мастер-плана, шаги 6–10; в задачах ничего не пушить. Окружение тестов — `output/07c/env.sh` (`GATA_TEST_DATABASE_URL` — только сервер, тесты БД создают свои `gata_test_*`; `SMOKE_URL` → `gata_smoke_07c`).
- **Параллельного этапа нет.** Следом идёт 07d на этом же экране (профиль, правка, прокачка; ручная правка SPP вне матча на десктопе — D3). Швы, которые 07c оставляет ему и не занимает: адрес игрока `teamPlayer` (ветка игрока состава — редактор 2.x), первая кнопка пары действий, «Профиль и прокачка», карандаш и «Прокачать» панели. 07c не трогает ни номера, ни имени, ни капитана, ни прокачки, ни счётчиков SPP.
- **Серверы этапа:** реальный сервер на порту **3073** над `gata_smoke_07c`, mock API с `MOCK_PORT=5177`. Никогда `gata_league` для данных; никогда общие 3002 и 5173–5176.
- **Сервер не меняется, миграций нет.** Клиент живёт по контракту, который уже есть (проверено по коду):
  - `PATCH /api/teams/:id` (`writeSavedTeam`, `server/routes/teams.mjs`): чужая ревизия — 409 `TEAM_SAVED_ELSEWHERE` с командой сервера; запись и строки журнала — одна транзакция (`classifyTreasuryChange(race, before, roster)`: найм узнаётся по `purchaseRefund` нового игрока, продажа — `playerSaleValue` игрока сохранённого состава, отмена — `purchaseRefund`; необъяснённое — одна строка `manual`).
  - `readTeamBody` → `checkRoster` отклоняет 422 `ROSTER_BREAKS_THE_RULES` только по `BLOCKING_CODES` (`server/domain/roster.mjs`): `ROSTER_MAX_PLAYERS` (считает всех игроков состава, пропускающих тоже, `calculateRosterCosts().totalPlayersCount` — после Task 2a, ответ владельца 2; минимум 7 по-прежнему считает играющих, `playersCount`), `POSITION_MAX`, `TREASURY_INVALID` (казна ниже нуля), `SAFE_INVALID`, `SPP_OUT_OF_RANGE`, `DUPLICATE_PLAYER_ID`. `ROSTER_MIN_PLAYERS` не блокирует: запрет продажи при ≤ 7 держит только клиент (как в 2.x).
  - Стадия (`stageViolations`, `STAGE_PURCHASE_LOCKED`) — только re-roll; найму и продаже она не мешает.
  - Идёт ли матч, `PATCH` не проверяет (передано 09a в PR 07a/08): держит клиент (R8).
  - Покупку запечатывают старт матча (`sealPlayerPurchases`, `server/season/finance-store.mjs`) и подтверждённые итоги: после них `purchaseRefund` нет, и игрок продаётся за полцены.
  Правка сервера или миграция — стоп-условие, вопрос контроллеру.
- **Инварианты «Состава» 07a/07b, которые 07c держит:**
  - во время матча ни одна запись состава не уходит (R8): ни шаг, ни найм, ни продажа; шаг, ждавший сети, когда начался матч, снимается, и тренеру говорится;
  - команда берётся только вместе с играми после неё (`readWithGames`); пока чтение в воздухе или в пути запись погибших — всё закрыто (`lockOf`, K7);
  - `PATCH`, чей ответ потерян, узнаётся по 409 со своим составом (`landedTeam`) и второй раз как новый не уходит; конфликт решает тренер, 422 берёт состав сервера;
  - каждая запись сначала спрашивает `sessionTokenHolds()` и при чужом токене ничего не шлёт (этап 05, R12);
  - гибель и её отмена уходят только при пустой очереди (K6): ждущий найм или продажа закрывают их, как ждущий шаг SPP;
  - очередь тапов матча, шторка травмы (R14), отметки и погибшие 07b не меняются; что принёс PR «desk fidelity», 07c не переделывает.
- **Размеры (D2) и близость к прототипам.** До 900px нажимаемое — от 44px; от 901px — как в прототипе, но не меньше 24px. Каждое новое состояние названо своими прототипами (мобильным и десктопным), значения шрифтов, отступов, радиусов и цветов в задачах — из их HTML; цвет — только токенами (`--accent` ← `#2F7A52`, `--accent-tint` ← `#E4F0E9`, `--accent-tint-soft` ← `#F1F8F4`, `--on-accent-tint` ← `#163A28`, `--surface-2` ← `#F3F6F4`, `--line` ← `#E6EBE8`/`#DCE3DF`, `--line-strong` ← `#C9D3CE`, `--muted` ← `#5F6B65`, `--ink-2` ← `#3E4A44`, `--ink` ← `#14201A`, `--danger` ← `#C4352A`/`#A0473A`, `--danger-tint` ← `#FBEDEA`); где токен не держит 4.5:1 в какой-то палитре — ближайший, что держит, тест контраста тот же. Расхождение, которое код не позволяет закрыть, записывается в §7 спеки (Task 11).
- **Общие файлы и куски 07c в них** (минимальные):
  - `src/domain/roster/transfers.mjs` — новые экспорты и поиск игрока в `removeLeaguePlayer` по `storedPlayerId` (поведение для строковых id то же);
  - `src/ui/roster-table.mjs` — слот `headLeadHtml` (зарезервирован для 07c, других пользователей нет) становится `headTailHtml` и встаёт **после** кнопки «Игрок» (`DeskRosterHire`: `ИГРОК▲` и «+» через 8px);
  - `src/ui/stat-strip.mjs` — `positionStatsLine` (переезжает из `src/screens/teams/builder-view.mjs`, разметка набора та же);
  - `src/components/roster-editor/*` — только Task 8 (мёртвый режим создания), поведение 2.x то же;
  - `src/styles.css` — один `@import` в конце;
  - `scripts/mock-api.mjs` — один игрок `t1` **в той же строке**, без новых строк (файл 599/600); `scripts/mock/treasury.mjs` — одна проверка; `scripts/smoke-api.mjs` — один шаг (Task 9);
  - `test/helpers/roster-page.mjs` — `STYLES`; 07a/07b тесты — только списки `assertStyled`, конец `styles.css` и место «Травмы в матче…», если его меняет Task 6;
  - словари — ключи только в `teamRoster.hire.*`, `teamRoster.sell.*`, `teamRoster.market.*`; Task 8 удаляет ключи режима создания.
- **Файлы на пределе** (числа — на `6313b6b`, Task 1 сверяет после fidelity): `src/screens/team/roster/index.mjs` (586 по `wc -l`, предел 599: 07c добавляет не больше 4 строк в Task 5 и убирает 3 в Task 7), `roster.css` (554 — 07c не добавляет), `marks.css` (287 — не трогает), `scripts/mock-api.mjs` (599 — без новых строк). Новый CSS экрана — `src/screens/team/roster/market.css`. Если `index.mjs` не помещается — стоп, вопрос контроллеру.
- **Редактор 2.x** (`src/screens/saved-roster.mjs`, `src/components/roster-editor/*`) меняется только в Task 8: им рисуются `teamPlayer` для игроков состава (до 07d) и `adminTeamEdit` (до 12), найм и продажа там остаются.
- Vanilla ES-модули, хешевый роутер; без фреймворка, сборщика, TypeScript и новых зависимостей.
- CSP: ни inline JS, ни `style="…"`, ни `on…=`.
- Каждая строка интерфейса — через `t("key")`; новые ключи — в обоих словарях, в пространствах выше, без дублей. Ключ из шаблонной строки получает тест, перебирающий все значения: 07c строит `validation.${code}` из `TRANSFER_REFUSALS` (тест — Task 2).
- `escapeHtml` на каждую интерполяцию; пропс `…Html` — только разметка другой функции `render…()`/`…Markup()`.
- Бюджеты `scripts/check-budgets.json`: 600 строк на файл, 80 на функцию, 0 недостижимых функций, `src/app.js` ≤ 120 (этап его не трогает). Бюджеты только уменьшаются.
- Ловушка `scripts/check-references.mjs`: ключ объекта, равный экспорту проекта плюс одна буква, ломает `npm run check` (`td:`, `th:`, `tr:`, `to:` от `t`; `states:`, `views:`, `icons:`). Пара «казна сейчас → после» — ключи `before`/`after`, **никогда** `from`/`to`. Ключи 07c (`cart`, `quote`, `rows`, `players`, `numbers`, `free`, `left`, `total`, `removal`, `amount`, `hired`, `price`) проверены — экспортов без последней буквы нет.
- Брейкпоинты только `max-width: 900px` / `min-width: 901px`. Кольцо фокуса — из `src/ui/base.css`; `--focus-ring` не использовать. Новый CSS задаёт шрифт, рамку, фон, `text-transform`, `letter-spacing` и `font-weight` явно (правила 2.x живут до этапа 13). Новый `.css` — `@import` в конце `src/styles.css`.
- `content/` не меняется. Правила и числа — из `src/domain/**` и `content/Gata/**`, вид — из прототипов; расхождение макета с кодом правится по коду без вопроса (§0.1, §0.12); контент против кода — вопрос владельцу (ответы владельца ниже).
- Тесты: сначала `npm run build` (тесты читают `public/data.*.json`); затем `. output/07c/env.sh && npm test`, `npm run check`, `npm run i18n:check`. Каждый PR: одинаковое число страниц EN/RU, 0 fallback; `npm run smoke` и `npm run smoke:post-match` на сервере 3073.
- Новые тесты экрана — в новом файле `test/team-roster-market.test.mjs` (окружение — `test/helpers/roster-page.mjs`); очереди — в `test/team-roster-data.test.mjs`; домена — `test/roster-hire.test.mjs` (новый) и `test/roster-transfers.test.mjs`.
- Комментарии в коде — по-английски, в тоне соседних файлов; ответы владельцу — по-русски.
- Каждая задача — один коммит с тестами; сообщение коммита заканчивается вторым `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Стоп-условия:** контент и код расходятся в правиле; нужно продуктовое решение вне спек и этого плана; нужна правка сервера или миграция; `index.mjs` не помещается в 599 строк; шов, который называет план, после fidelity устроен иначе, чем описано в Task 1. Остановиться и спросить контроллера.

## Review Focus

1. **Ответ на покупку или продажу потерян.** Ожидание: шаг ждёт («Ждёт сети · правок: 1»), повтор несёт тот же снимок (те же id новых игроков) и встречает 409 со своим составом — это успех, никто не нанят дважды и деньги не вернулись дважды. Держится, только если новые игроки собраны в той форме, в какой их хранит сервер. Тесты:
   - Task 2: «a hire as the server stores it is the hire as sent: a lost answer's 409 is known as this very hire»;
   - Task 4: «a purchase whose answer was lost is the 409 that holds it: taken as saved, nobody hired twice», «a sale whose answer was lost: the same»;
   - Task 9 (smoke, реальный сервер): «a hire resent on the old revision meets the 409 that holds it».
2. **Казна и лимиты.** Корзина дороже казны, позиция на максимуме, 14 в составе (вместе с пропускающими), казна, которую между открытием корзины и нажатием потратил другой шаг. Ожидание: «+» позиции отказывает словами на лимитах, деньги «+» не останавливают, кнопка покупки говорит «Не хватает Nk» и ничего не шлёт; домен проверяет всё ещё раз на черновике в момент нажатия. Тесты: Task 2 «one more of a position refused at its maximum, and at fourteen on the roster…», «a cart over the treasury, a position or the roster is refused as a whole»; Task 4 «a cart the draft no longer pays for, or that breaks a limit, sends nothing and says why»; Task 5 «a position at its maximum, and a full roster, refuse the + and say why; money does not».
3. **Двойное нажатие** на «Купить», «Продать за Nk», «Отменить и вернуть Nk». Ожидание: один `PATCH`, один игрок, одна сумма. Тесты: Task 5 «a second press on «Buy» sends nothing more»; Task 6 «a second press on «Sell» sends nothing more».
4. **Матч начался, пока открыта корзина или подтверждение, или пока покупка ждёт сети.** Ожидание: шторка закрывается, фокус — на «+» или на строку игрока; ждавшая покупка или продажа снимается вместе с составом сервера, тренеру говорится (R8); в матче «+» и «Продать» закрыты словами. Тесты: Task 5 «a match begun while the cart is open closes it…», «in a match the «+» says why and opens nothing»; Task 6 «in a match «Sell» stands closed beside «Injury in the match…»…», «a sheet whose match began closes…»; Task 7 «a hire and a sale that waited for the network are given up when a match begins…».
5. **Деньги так, как их читает сервер.** Половина текущей стоимости с золотом (47.5k), Architect of Fate — полная стоимость и 10k за травму, отмена — уплаченное полностью, найм — цена позиции за каждого; остатка `manual` нет. Запечатанная стартом матча покупка (на другом устройстве) не возвращается целиком. Тесты: Task 2 «a sale and a cancelled purchase as the server reads them…»; Task 4 «a purchase sealed by a match begun elsewhere is not refunded in full…»; Task 9 (smoke) «PATCH journals a hire, its cancel and a sale exactly…».

## Решения этого плана

Источники оставили их открытыми; план принимает их так (контроллер подтверждает до исполнения).

**Как идёт каждая запись**

| Действие | Запрос | Когда закрыто | Потерянный ответ |
|---|---|---|---|
| «Купить» в корзине | `PATCH /api/teams/:id` через очередь 07a: новые игроки (`purchased: true`, `purchaseRefund` = цена позиции, свободные номера), казна минус сумма, счётчики позиций | матч (R8; «+» закрыт словами); замок `lockOf`; чужой токен; пустая корзина, не хватает казны, лимит (кнопка говорит) | как шаг SPP: ждёт сети, повтор узнаётся по 409 со своим составом (`landedTeam`) — снимок и id те же |
| «Продать» | то же: игрок уходит, казна + `playerSaleValue` | то же; нет id; ≤ 7 игроков в составе | то же |
| «Отменить покупку» | то же: игрок уходит, казна + `purchaseRefund` | то же; нет id | то же; запечатанная покупка — 409 «другое устройство» |

1. **Найм и продажа — шаги очереди сохранений** (передача 07b: «продажа — шаг очереди по образцу `markSkip`»). Один шаг — один снимок черновика — один `PATCH`, и сервер видит ровно его разницу: строки журнала (`classifyTreasuryChange`) — `hire` на каждого купленного, `sale` на сумму `playerSaleValue` игрока сохранённого состава, `cancel_purchase` на `purchaseRefund`. Клиент считает деньги теми же функциями домена, поэтому остатка `manual` нет. Шаг рисуется сразу из черновика очереди и живёт по правилам очереди 07a: ждёт сети со статусом, конфликт — «Загрузить новую», 422 — состав сервера (`refused`), чужой токен — `auth.otherTab`.
2. **Новые игроки — в форме сервера.** `hirePlayers` собирает игрока `createPlayer` и пропускает через `normalizeRosterPlayer`, как `checkRoster` сервера, и пересчитывает счётчики позиций (`syncRosterCountsFromPlayers`). Поэтому 409 потерянного ответа совпадает с отправленным (`landedTeam` → `sameValues`), и повтор не нанимает второй раз. Id делает клиент, повтор несёт тот же снимок.
3. **Лимиты и деньги корзины** (правила набора 06, `hirePlayer`): «+» позиции отказывает на максимуме позиции (`rosterMax(row.qty)`; считаются её игроки в составе и в корзине) и на 14 в составе — **считаются все игроки состава, пропускающие тоже** (контент: «The team size is limited to 14 players»; набор 06; ответ владельца 2: лимит один и тот же в клиенте и на сервере — Task 2a). Деньги «+» не останавливают (как в наборе и в `StatsHire`): кнопка покупки — «Не хватает Nk», выключена, плитка «Останется» красная. Отказ «+» говорит причину словами `validation.<CODE>` (как набор 06). При нажатии «Купить» домен проверяет корзину целиком ещё раз на черновике очереди (`hireQuote().refusal`); последний рубеж — 422 сервера.
4. **Правила продажи — одни, домена** (2.x: `playerRemoval`, `removeLeaguePlayer`): половина текущей стоимости (`playerSaleValue`; золото сохраняется: 47.5k); Architect of Fate — полная стоимость и 10k за каждую травму (`Special Rules.md`); игрок с `purchaseRefund` — «Отменить покупку», полная уплаченная цена, до старта матча (`sealPlayerPurchases`). Продажа закрыта при 7 игроках в составе и меньше (`playerRemoval().blocked`, считаются все); отмена покупки этим не ограничена (ответ владельца 1). Погибшего в составе нет — продавать нечего. Капитан уходит вместе с игроком; нового 07c не назначает (07d), шторка говорит это заранее.
5. **Что делает нажатие, решают данные в момент нажатия.** `PlayerLine.removal` (`{type, amount, blocked}`) считает домен на черновике очереди, шторка рисуется из него при каждой перерисовке, нажатие передаёт `type` в `removePlayer`. Отмена покупки, которую тем временем запечатал старт матча, отказывает `PLAYER_PURCHASE_CLOSED`; если черновик об этом не знает, шаг уходит на старой ревизии и встречает 409 «другое устройство» — полная цена за запечатанную покупку не возвращается никогда.
6. **Двойное нажатие безопасно само:** шаг берётся синхронно и закрывает шторку; второе нажатие не находит ни шторки, ни игрока.
7. **Пара действий** (`StatsHire`, `StatsLive`, `DeskRosterPrep`, `DeskRosterLive`, `DeskRosterSell`): две равные колонки с зазором 8px; на телефоне — под «Профиль и прокачка», на десктопе — под «Следующий матч: …». Вне матча — «Пропуск матча…» / «Вернуть в состав» | «Продать» / «Отменить покупку»; **в матче** — «Травма в матче…» | «Продать», закрытая словами «Найм и продажа — после итогов матча» (§0: недоступное видно с причиной); у пропускающего в матче — одна закрытая «Продать». «+» в матче — тоже закрыт этими словами. Открытая корзина или подтверждение при начале матча закрываются, фокус — на «+» или на строку игрока. Замок 07a (`lockOf`) закрывает «+», «Продать» и кнопки шторок своими словами.
8. **Найм или продажа, ждавшие сети, когда начался матч,** снимаются вместе с шагами SPP и отметками (R8): `reloadRoster` говорит своими словами «…найм и продажа не сохранены. Повторите их после итогов матча» — без числа: одна покупка может быть несколькими игроками. Подсчёт трёх видов переезжает из `index.mjs` в `droppedWords` (`market.mjs`), слова SPP и отметок — те же.
9. **Во время подготовки** всё открыто; плашка 07a предупреждает, и обе шторки повторяют предложение о сбросе шагов (`prepResetWords`).
10. **Какая казна где:** корзина и подтверждение показывают казну черновика очереди (с ждущими шагами — она и уйдёт). Полоса казны 08 на десктопе рисуется из списка команд и догоняет, когда сохранение ответило (`putInPlace`); пока покупка ждёт сети, статус «Ждёт сети» говорит, что казна сервера ещё прежняя.
11. **`putInPlace` перечитывает список, если его чтение уже в пути** (передача 07b, как `adopt` казны 08): иначе старое чтение вернуло бы прежнюю ревизию поверх ответа покупки.
12. **«+»** (`StatsHire`, `DeskRosterHire`): в шапке первой таблицы «Активный состав», **после** кнопки «ИГРОК» с зазором 8px, круг `--accent` с белым плюсом 14px; на телефоне — круг 26px в цели 44×44, на десктопе — 24×24 (D2). У «Пропускают матч» и «Погибших» его нет. Когда первой таблицы нет (состав пуст или все пропускают, 07b) — под словами кнопка во всю ширину «Нанять игроков» (передача 07b).
13. **Корзина** — по ширинам, как прототипы:
    - **телефон** (`StatsHire`): шторка снизу, заголовок «Нанять игроков» 24px Oswald по центру, под ним 13px `--muted` «Люди · в составе 12 из 14 · свободно мест: 1»; три плитки (сетка 3×1, зазор 8px; радиус 12, фон `--surface-2`, отступ 10px 12px; подпись 12px `--muted`; число 24px Oswald 700): «Казна», «Корзина» («−80k»), «Останется» (фон `--accent-tint`; ниже нуля — `--danger-tint` и число `--danger`); позиции — карточки (радиус 14, отступ 12, зазор 12; рамка 1px `--line`, в корзине — фон `--accent-tint-soft` и рамка 2px `--accent`): буква на цвете позиции (круг 38px, 18px Oswald 700), имя 16px 700 и цена 18px Oswald 700 `--accent-text` в строке, характеристики 12px `--ink-2` и «навыки · в команде N из M» 12px `--muted` — обе в одну строку с многоточием; справа «+» (пока позиции нет в корзине; 44×44, рамка `--accent`) или степпер «− N +» (кнопки 44×44 по D2, число 20px Oswald 700; плюс — заливка `--accent`); строки корзины на `--surface-2` («1 × Blitzer» — «80k» жирным, 14px); номера 12px `--muted`; подвал — одна кнопка во всю ширину 52px: «Корзина пуста» / «Не хватает 10k» (выключены) / «Купить за 80k · игроков: 1». «Отмены» на телефоне нет — закрывает крестик.
    - **десктоп** (`DeskRosterHire`): модальное окно 640px (`wide`), заголовок 28px Oswald слева, подзаголовок тот же; то же тело; «+» — кнопка с обводкой «+ В корзину» высотой 40px; степпер 36×36; подвал справа — «Отмена» (фон `--surface-2`, 44px, 15px 600) и основная 44px.
    - Подпись покупки без форм множественного числа (как строка подсчётов 07a). Номера — свободные от 1 до 99 по порядку корзины (`nextFreeNumber`), имена — как у набора и 2.x («Human Lineman 4»).
14. **Подтверждение продажи** — по ширинам:
    - **телефон** (`StatsSell`): заголовок «Продать игрока» по центру, без подзаголовка; карточка игрока (фон `--surface-2`, радиус 14, отступ 12; номер на цвете позиции 44px, 20px Oswald; имя 17px 700; «Позиция · N SPP · навыки» 13px `--muted`); строки «подпись — значение» (от 44px, граница снизу `--line`, 15px/1.25, подпись `--muted`): «Цена найма Catcher» 75k (600), «Навыки и улучшения» +20k или «—» (600), «Текущая стоимость» 95k (700), «SPP за карьеру» «6 · сгорят» (600, `--danger`; в `StatsSell` строки нет — её требует §11 спецификации интерфейса, записывается расхождением), «Вернётся в казну · половина» +47.5k (700, `--accent-text`); поток «Казна сейчас → После продажи» (фон `--accent-tint`, текст `--on-accent-tint`, радиус 14, отступ 12px 14px, числа 26px Oswald 700, стрелка 20px); примечание 12px/1.45 `--muted`; одна красная кнопка во всю ширину 52px «Продать за 47.5k».
    - **десктоп** (`DeskRosterSell`): модальное окно (Sheet 480px; прототип — 520px, расхождение записывается), заголовок слева, подзаголовок «Hal · #8 Catcher»; карточки игрока нет; те же строки, SPP включительно; поток с числами 28px и отступом 12px 16px; примечание 13px; подвал — «Отмена» (фон `--surface-2`) и красная «Продать за 47.5k», обе 44px.
    - Architect of Fate — строка «Вернётся в казну · полная стоимость и травмы» и своё примечание; у капитана — строка о капитане; у игрока с `purchaseRefund` — «Отменить покупку»: строки «Куплен в этот раз за» и «Вернётся в казну», «→ После отмены», примечание о старте матча и кнопка «Отменить и вернуть 50k» — **основная, не красная**: отмена обратима новой покупкой, красная залитая кнопка — только у необратимого шага (§0; в прототипах красная — расхождение записывается).
15. **После шага:** покупка — шторка закрывается, сообщение «Куплено: Human Lineman #8, Human Lineman #9 · в казне 20k» (в прототипе — плашка над таблицей с крестиком: сообщение, как у всех записей «Состава», расхождение), фокус — на «+»; продажа или отмена — «Продан: Hal · +47.5k · в казне 167.5k» / «Покупка отменена: …», фокус — на заголовок страницы (строки игрока больше нет); на десктопе панель берёт первого игрока (`choiceOf` 07a, как `DeskRosterSell`: `sel: rest[0]`).
16. **Строки корзины — свои,** по `StatsHire`/`DeskRosterHire` (карточка, «+» отдельно от степпера), а не строки набора 06 (`Builder` — другой вид); общая с набором только строка характеристик: `positionStatsLine` переезжает из `builder-view.mjs` в `src/ui/stat-strip.mjs`. Кнопки «−»/«+» корзины несут `data-hire-step`, карточка — `data-hire-key`, и их слышит `wireStepButtons(root, "hire", …)` с `onRefused` (05–13).
17. **Редактор 2.x:** найм и продажа в нём остаются (он рисует `teamPlayer` до 07d и `adminTeamEdit` до 12). Мёртвый режим создания (`CREATE_MODE`, его ветки и ключи) уходит, `renderRosterStatGrid` теряет `export` (передачи 06 и 11, Task 8); поведение 2.x то же.
18. **Сервер и миграции не меняются.** `npm run smoke` получает шаг, который на настоящем сервере проверяет то, на что опирается экран: найм, отмена и продажа, собранные функциями домена, дают ровно свои строки журнала; повторно отправленный найм встречает 409 со своим составом; казна ниже нуля — 422 `TREASURY_INVALID` (Task 9).

## Ответы владельца

Оба вопроса закрыты владельцем 2026-10-19; исполняется то, что он решил.

1. **Отмена покупки при 7 игроках и меньше (§0.12).** Контент: «You cannot sell or remove a player if doing so would leave the team with fewer than 7 players» (`content/Gata/Rules/3. Team Management.md`). Код 2.x отменяет покупку при любом числе игроков, и это записано тестом («undo restores a short original roster», `test/roster-transfers.test.mjs`); спецификация интерфейса §11 и прототипы закрывают только «Продать».
   - **Ответ: отмена покупки при ≤ 7 разрешена** — как код: она не ограничена (возвращает состав к тому, каким он был до покупки). Запрет при ≤ 7 держит только «Продать».
2. **Кого считает лимит 14.** Контент: «The team size is limited to 14 players»; набор 06 и прототип (`slots = 14 − players.length`) считают всех; сервер (`ROSTER_MAX_PLAYERS`) считал только тех, кто играет следующий матч.
   - **Ответ: все игроки состава, пропускающие тоже** — команда с 12 играющими и 2 пропускающими не нанимает пятнадцатого. Выровнено в **Task 2a**: общий `validateRoster` (`src/domain/roster/validate.mjs`) считает максимум по `costs.totalPlayersCount` (минимум 7 — по-прежнему играющих, `playersCount`), и клиент (корзина, предупреждения редактора 2.x), и сервер (`checkRoster`: `PATCH`/`POST` команды, отмена гибели, админка, заявка в сезон) считают одинаково; файлы `server/` не меняются. Сохранённая команда, у которой в составе больше 14, теперь не пройдёт ни одной записи, пока тренер не продаст лишних; до выката 07c на последнем дампе: `SELECT id FROM saved_teams WHERE jsonb_array_length(roster->'players') > 14` (проверка данных несёт контроллер).

## Файлы

| Файл | Задача | Что |
|---|---|---|
| — (перенос ветки) | 1 | база: влитый PR «desk fidelity», сверка швов (контроллер) |
| `src/domain/roster/validate.mjs`, `src/domain/roster/costs.mjs` (комментарий), `test/roster-domain.test.mjs`, `test/teams-route.test.mjs`, `test/team-fallen-api.test.mjs` | 2a | лимит 14 считает всех игроков состава — общий `validateRoster`, клиент и сервер вместе (контроллер, ответ владельца 2) |
| `src/domain/roster/transfers.mjs`, `test/roster-hire.test.mjs` (новый), `test/roster-transfers.test.mjs` | 2 | корзина, найм в форме сервера, подсчёт переходов, отказы словарём |
| `src/screens/team/roster/model.mjs`, `test/team-roster-model.test.mjs` | 3 | `price`, `removal` в строке |
| `src/screens/team/roster/save.mjs`, `test/team-roster-data.test.mjs` | 4 | `buyPlayers`, `removePlayer`, `putInPlace` |
| `src/screens/team/roster/{market,hire-sheet}.mjs`, `market.css` (новые), `index.mjs`, `view.mjs`, `panel.mjs`, `sheets.mjs`, `injury.mjs`, `wire.mjs`, `src/ui/roster-table.mjs`, `src/ui/stat-strip.mjs`, `src/screens/teams/builder-view.mjs`, `src/styles.css`, оба словаря, `test/team-roster-market.test.mjs` (новый), `test/ui-roster-table.test.mjs`, `test/ui-player.test.mjs`, `test/helpers/roster-page.mjs`, `test/team-roster.test.mjs` | 5 | «+» и корзина |
| `src/screens/team/roster/sell-sheet.mjs` (новый), `market.mjs`, `panel.mjs`, `view.mjs`, `wire.mjs`, `market.css`, оба словаря, `test/team-roster-market.test.mjs` | 6 | пара действий с «Продать», подтверждение, отмена покупки |
| `market.mjs`, `index.mjs`, оба словаря, `test/team-roster-market.test.mjs` | 7 | R8 для найма и продажи |
| `src/components/roster-editor/{modes,hire-panel,staff-control,matchday-layout,identity}.mjs`, оба словаря, `test/ref-article.test.mjs`, `test/roster-view-mode.test.mjs` | 8 | мёртвый режим создания 2.x |
| `scripts/mock-api.mjs`, `scripts/mock/treasury.mjs`, `scripts/smoke-api.mjs` | 9 | mock и smoke |
| `docs/redesign/screens/rd-07c.json` | 10 | снимки рядом с прототипами (контроллер) |
| спеки, план 3.0 | 11, 12 | проверки, правки спек, PR (контроллер) |

Каталог экрана — `src/screens/team/roster/` (ниже без префикса).

## Маршруты этапа 07c

| Имя | Адрес | До 07c | После 07c |
|---|---|---|---|
| `teamRoster` | `#/t/:teamId/roster` | «Состав» 3.0 07a/07b (+ fidelity) | + «+» и корзина найма, «Продать» / «Отменить покупку» в паре действий с подтверждением |
| `teamPlayer` | `#/t/:teamId/roster/:playerId` | игрок состава — редактор 2.x (с наймом и продажей), погибший — профиль 3.0 | без изменений (до 07d) |
| `adminTeamEdit` | админский адрес | редактор 2.x | без изменений (этап 12) |

`src/core/routes.mjs` и `src/core/router.mjs` не меняются.

## Рецепты проверки

Команды — из `/Users/felstell/git/bb-rd-07c`; каждый вызов Bash — новая оболочка, переменные — из `output/07c/env.sh`.

**Т — тесты:** `npm run build && node --test <файлы>`; полный прогон — `npm run build && . output/07c/env.sh && npm test && npm run check && npm run i18n:check`.

**С — сервер 3073 и smoke** (Task 9, 10, 11):

```bash
. output/07c/env.sh
docker exec gata-league-postgres createdb -U gata_admin -T template0 gata_smoke_07c 2>/dev/null || true
DATABASE_URL="$SMOKE_URL" npm run db:migrate
DATABASE_URL="$SMOKE_URL" npm run preview:seed > /dev/null
```

Затем сервер в фоне (Bash `run_in_background: true`): `. output/07c/env.sh && DATABASE_URL="$SMOKE_URL" APP_PORT=3073 node server/server.mjs`; дождаться `curl -fsS http://localhost:3073/api/health` (Monitor с until-циклом). Затем:

```bash
APP_URL=http://localhost:3073 npm run smoke
. output/07c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3073 npm run smoke:post-match
```

Expected: каждый скрипт печатает свою строку `… passed …`. Сервер после — остановить.

**М — mock 5177** (Task 9, 10): `npm run build`, затем в фоне `MOCK_PORT=5177 node scripts/mock-api.mjs`; дождаться `curl -fsS http://localhost:5177/api/health`. Mock держит записи в памяти: после состояний, которые пишут, — перезапуск.

---

### Task 1: База — влитый PR «desk fidelity» (контроллер)

Исполняется, когда PR «desk fidelity» влит в `redesign`; до этого ни одна задача не начинается.

- [ ] **Step 1: Перенести ветку.** В ветке только коммит этого плана: `git fetch origin && git rebase origin/redesign`; `git log --oneline origin/redesign..HEAD` → один коммит `docs(plan): stage 07c — hire and sell`. Затем `npm ci` (если менялся `package-lock.json`), `npm run build && . output/07c/env.sh && npm test && npm run check && npm run i18n:check` → PASS (базовый прогон, число тестов — в журнал).
- [ ] **Step 2: Сверить швы, которые называет план**, по коду после fidelity:
  - `src/screens/team/roster/panel.mjs`: функция, которая рисует пару действий (07b — `actionsMarkup(line, screen)`, ряд `.g-roster__actions`), её имя и где её зовут телефон и панель; рисуется ли пара в матче и стоит ли «Травма в матче…» в ней (десктоп и телефон) или отдельной кнопкой (`injuryMarkup` 07a);
  - `src/ui/roster-table.mjs`: `renderRosterTable({…, headLeadHtml})` — слот всё ещё без пользователей;
  - размеры D2: как fidelity задаёт 24px-цели от 901px (класс, токен, правило в `roster.css`/`src/ui/*.css`) — 07c делает так же;
  - `wc -l src/screens/team/roster/index.mjs roster.css marks.css panel.mjs view.mjs` и `scripts/mock-api.mjs`;
  - `test/team-roster.test.mjs`: строки со списками `assertStyled` и с концом `src/styles.css` (план называет 523, 1034, 1163, 1573, 2205, 2249 — на `6313b6b`).
- [ ] **Step 3: Записать расхождения** в журнал этапа и в бриф каждой затронутой задачи (Task 5–7): новые имена, строки, размеры. Если пара действий или слот шапки устроены не так, как описывают решения 7 и 12 (например, fidelity уже поставил что-то вторым в пару), — стоп, вопрос контроллеру/владельцу до Task 5.

Коммита нет (только перенос ветки).

---

### Task 2: Домен — корзина найма, найм в форме сервера, подсчёт переходов

**Files:**
- Modify: `src/domain/roster/transfers.mjs`
- Create: `test/roster-hire.test.mjs`
- Test: `test/roster-transfers.test.mjs` (один тест)

**Interfaces:**
- Consumes: `createPlayer` (`schema.mjs`); `normalizeRosterPlayer`, `rowCountInPlayers`, `positionKind`, `storedPlayerId`, `syncRosterCountsFromPlayers` (`players.mjs`); `nextFreeNumber` (`build.mjs`); `rosterSizeLimits` (`league-rules.mjs`); `costToNumber`, `countToNumber`, `rosterMax`, `rowCost`, `rowsForTeam` (`values.mjs`); `sumMoney` (`money.mjs`).
- Produces (`src/domain/roster/transfers.mjs`, чистый):
  - `TRANSFER_REFUSALS` — `Object.freeze(["POSITION_MAX", "ROSTER_MAX_PLAYERS", "TREASURY_INVALID", "PLAYER_NOT_FOUND", "PLAYER_PURCHASE_CLOSED", "PLAYER_SALE_MIN"])`: коды, которыми найм и продажа отказывают; экран говорит их `t(\`validation.${code}\`, params)`.
  - `@typedef {Record<string, number>} HireCart` — сколько игроков каждой строки таблицы расы в корзине, по индексу строки.
  - `@typedef {{rowIndex: number, position: string, kind: string, price: number, have: number, max: number, inCart: number, refusal: {code: string, params: object}|null}} HireRow` — `have` — игроков позиции в составе; `refusal` — почему ещё одного этой позиции в корзину не положить: `POSITION_MAX {position, max}`, когда `have + inCart >= max`; иначе `ROSTER_MAX_PLAYERS {max, count}`, когда `players + count >= max состава` (`count` — игроки и корзина); иначе `null`. Деньги — не отказ.
  - `@typedef {{players: number, max: number, treasury: number, count: number, total: number, left: number, free: number, numbers: number[], refusal: {code: string, params: object}|null, rows: HireRow[]}} HireQuote` — `players` — все игроки состава (`draft.players.length`, пропускающие тоже — решение 3); `max` — `rosterSizeLimits.max`; `count`, `total` — корзина (тысячи); `left` — `sumMoney(treasury, -total)` (бывает < 0); `free` — `Math.max(0, max - players - count)`; `numbers` — номера новичков по порядку строк расы и корзины (`nextFreeNumber` по составу и уже выданным); `refusal` — корзина целиком: строка, где `have + inCart > max`, → `POSITION_MAX`; `players + count > max` → `ROSTER_MAX_PLAYERS {max, count: players + count}`; `left < 0` → `TREASURY_INVALID {}`; иначе `null`. Строки корзины, которых у расы нет, и счётчики ≤ 0 не считаются.
  - `hireQuote(team, draft, cart) → HireQuote`.
  - `hirePlayers(team, draft, cart) → {hired: object[]}` — меняет `draft`: по строкам расы и корзины добавляет `normalizeRosterPlayer(createPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex), {number: nextFreeNumber(draft.players), purchased: true, purchaseRefund: price}), rowsForTeam(team), draft.players.length)`, тратит казну `sumMoney(countToNumber(draft.treasury), -total)`, `syncRosterCountsFromPlayers(draft)`; `hired` — новые игроки по порядку. Пустая корзина — `{hired: []}`, черновик не тронут. Корзина с `hireQuote().refusal` — `throw new Error(…)` до любых изменений (ошибка вызывающего: очередь проверяет `hireQuote` раньше).
  - `transferEdits(before, after) → number` — сколько игроков (по `storedPlayerId`) есть только в одном из двух составов (`{players}`); без id не считаются; `null`/`{}` — 0.
  - `removeLeaguePlayer` находит игрока `storedPlayerId(item) === String(playerId)` (2.x-шный `5` — это `"5"`); остальное не меняется.

- [ ] **Step 1: Падающие тесты** — `test/roster-hire.test.mjs`. Раса — из `public/data.en.json` (`expandCollections`), как `test/team-roster-model.test.mjs`; серверная нормализация — `loadTeamReference(root)`, `checkRoster`, `blockingViolations` из `server/domain/roster.mjs` (как `test/teams-route.test.mjs`). Люди: 0 Human Lineman 50k (0–16), 1 Thrower 80k (0–2), 2 Catcher 75k (0–2), 3 Blitzer 80k (0–2), 4 Halfling Hopeful 30k (0–3), 5 Ogre 140k (0–1). Состав-фикстура: семь игроков `p1…p7`, номера 1–7 (три Lineman, один пропускает; Blitzer; Catcher; Thrower; Ogre), казна 120.

```js
test("a cart: what it costs, what the treasury keeps, the places left, the numbers the new players get", () => {
  const quote = hireQuote(human, roster(), { 0: 2, 4: 1 });
  assert.deepEqual([quote.players, quote.max, quote.treasury, quote.count, quote.total, quote.left, quote.free], [7, 14, 120, 3, 130, -10, 4]);
  assert.deepEqual(quote.numbers, [8, 9, 10]);
  assert.deepEqual(pick(quote.rows[0]), { rowIndex: 0, position: "Human Lineman", kind: "lineman", price: 50, have: 3, max: 16, inCart: 2, refusal: null });
  assert.deepEqual(quote.refusal, { code: "TREASURY_INVALID", params: {} });
});
```

  (`pick` — локальный помощник: поля `HireRow`.) Ещё тесты:
  - «one more of a position refused at its maximum, and at fourteen on the roster — everyone on it, those who miss the next match too; money refuses no position»: `rows[5]` (Ogre уже есть) — `{code: "POSITION_MAX", params: {position: "Ogre", max: 1}}`; состав из 13 (один пропускает) и корзина `{0: 1}` — у всех строк, кроме Ogre (у него по-прежнему `POSITION_MAX`: максимум позиции проверяется первым), `{code: "ROSTER_MAX_PLAYERS", params: {max: 14, count: 14}}`; казна 0 — `rows[0].refusal` `null`.
  - «a cart over the treasury, a position or the roster is refused as a whole»: `{3: 2}` при одном Blitzer → `POSITION_MAX`; 13 игроков и `{0: 2}` → `ROSTER_MAX_PLAYERS {max: 14, count: 15}`; `{0: 1}` при казне 120 → `null`; `{9: 1}`, `{0: 0}`, `{0: -1}` — не считаются (`count` 0).
  - «a hire: the players as the server stores them, the purchase recorded, the treasury spent, the counts kept»: `hirePlayers(human, draft, {0: 2})` → два игрока `rowIndex: 0`, `number` `"8"`/`"9"`, `name` `"Human Lineman 4"`/`"Human Lineman 5"`, `purchased: true`, `purchaseRefund: 50`, `spp` со всеми счётчиками 0; каждый `deepEqual` своему `normalizeRosterPlayer(player, rowsForTeam(human))`; `draft.treasury` 20; `draft.roster[0]` 5.
  - «an empty cart changes nothing; a refused one throws before it changes anything»: `{}` → `{hired: []}`, черновик `deepEqual` копии; `{0: 3}` при казне 120 → `assert.throws`, черновик не изменился.
  - «a hire as the server stores it is the hire as sent: a lost answer's 409 is known as this very hire» (Review Focus 1): `const { roster: stored, violations } = checkRoster("teams/human", draft)` после `hirePlayers` → `blockingViolations(violations)` `[]`; `sameValues(normalizeDraft(stored), normalizeDraft(rosterForStorage(draft)))` — `true` (так сравнивает `landedTeam` в `save.mjs`); `classifyTreasuryChange(human, before, stored)` → `[{kind: "hire", delta: -50}, {kind: "hire", delta: -50}]`.
  - «a sale and a cancelled purchase as the server reads them: one line of their kind, at the screen's amount, no remainder» (Review Focus 5): восьмой — Catcher с `extraSkills: [Block]` → `removeLeaguePlayer(human, draft, id, "sell")` → `amount` 47.5, `classifyTreasuryChange(human, before, checkRoster(…).roster)` → `[{kind: "sale", delta: 47.5}]`; игрок с `purchased: true, purchaseRefund: 50` → `"cancel-purchase"` → `[{kind: "cancel_purchase", delta: 50}]`; Tzeentch (`teams/tzeentch`, Architect of Fate): Pink Horror с `nigglingInjuries: 1` → `amount` 85 (75 + 10), строка `sale` 85.
  - «the players two rosters differ by, hired or let go»: до `[p1, p2, p3]`, после `[p1, p3, n1, n2]` → 3; без id не считаются; `transferEdits(null, {})` → 0.
  - «every refusal a hire or a sale can meet is worded in both dictionaries»: для каждого кода `TRANSFER_REFUSALS` — `validation.${code}` есть в `src/i18n/en.json` и `ru.json`.
  - В `test/roster-transfers.test.mjs`: «a player is found by his id as stored: a 2.x roster's 5 is "5"» — `id: 5` (число) → `removeLeaguePlayer(team, draft, "5", "sell").applied` `true`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/roster-hire.test.mjs test/roster-transfers.test.mjs` → FAIL (нет `hireQuote`).
- [ ] **Step 3: Реализовать** по Interfaces. В шапку `transfers.mjs` — абзац: «Hiring on a roster in play (stage 07c): the cart as the league's rules read it — a position's maximum, fourteen on the roster, the treasury — and the players it buys made the way the server stores them, so that a save whose answer was lost is known by the 409 that holds it, and the server journals each as a hire at the price recorded.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/roster-ledger.test.mjs test/builder-view.test.mjs` → PASS (без изменений); полный прогон (рецепт Т) → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/domain/roster/transfers.mjs test/roster-hire.test.mjs test/roster-transfers.test.mjs
git commit -m "feat(roster): a hire cart priced and limited by the league's rules; the players it buys made as the server stores them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Модель — цена позиции и то, что даст расставание

**Files:**
- Modify: `src/screens/team/roster/model.mjs`
- Test: `test/team-roster-model.test.mjs`

**Interfaces:**
- Consumes: `playerRemoval` (`transfers.mjs`); `costToNumber`, `rowCost` (`values.mjs`).
- Produces (`model.mjs`):
  - `PlayerLine` получает `price: number` (`costToNumber(rowCost(row))`, тысячи) и `removal: {type: "sell"|"cancel-purchase", amount: number, blocked: boolean}` — `playerRemoval(race, draft, player)` на черновике, который дан `rosterLines`. JSDoc `@typedef PlayerLine` — две строки.
  - `bareLine` (погибший без строки расы): `price: 0`, `removal: {type: "sell", amount: 0, blocked: true}`. У погибших из `rosterLines` поля есть, экран их не читает.

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-model.test.mjs`:
  - «a line says what letting him go brings back, and whether the roster may lose him»: восемь людей, Catcher с `extraSkills: [Block]` → `price` 75, `removal` `{type: "sell", amount: 47.5, blocked: false}`; игрок с `purchased: true, purchaseRefund: 50` → `{type: "cancel-purchase", amount: 50, blocked: false}`; тот же состав без одного (7) → у продажи `blocked: true`, у отмены `false`.
  - «Architect of Fate: his full value and his injuries»: Tzeentch, Pink Horror с `nigglingInjuries: 1` → `removal.amount` 85.
  - «a fallen record the roster cannot read lets nobody go»: `fallenLines` с `{name: "Old Joe", position: "Lineman", number: 5}` → `price` 0, `removal.blocked` `true`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-model.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/model.mjs test/team-roster-model.test.mjs
git commit -m "feat(roster): a line knows its position's price and what selling him, or cancelling his purchase, brings back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Очередь сохранений — покупка и продажа одним PATCH; список, читавшийся в пути

**Files:**
- Modify: `src/screens/team/roster/save.mjs`
- Test: `test/team-roster-data.test.mjs`

**Interfaces:**
- Consumes: `hireQuote`, `hirePlayers`, `playerRemoval`, `removeLeaguePlayer` (Task 2); `rowsForTeam`; `loadMyTeams` (`src/data/teams.mjs`); внутреннее `save.mjs` (`store`, `waiting`, `saveState`, `stepOn`).
- Produces (`save.mjs`):
  - Внутреннее `stepRoster(teamId, plan)` — шаг на весь черновик. `plan(draft) → null | {refusal: string} | {apply: () => object}`. Порядок: нет черновика или статус `conflict` → `{ok: false}`; ошибка `invalid` (422) → `{ok: false, refusal}` (как `stepOn`); `plan` → `null` → `{ok: false}`; `{refusal}` → `{ok: false, refusal}`; чужой токен → `{refusal: t("auth.otherTab")}`; иначе `apply()`, `waiting` + 1, `store.saveChange(teamId)`, `{ok: true, ...applied}`. `stepOn` и его порядок не меняются (тесты `stepSpp`, `markSkip`, `unmarkSkip` проходят как были); общее — общими помощниками.
  - `buyPlayers(teamId, race, cart) → {ok: true, hired: {number: string, position: string}[], treasury: number} | {ok: false, refusal?: string} | {refusal: string}` — план: `hireQuote(race, draft, cart)`; `count` 0 → `null`; `quote.refusal` → `{refusal: t(\`validation.${code}\`, params)}`; иначе `hirePlayers`, `hired` — номер и позиция (`rowsForTeam(race)[rowIndex].position`), `treasury` — казна черновика после.
  - `removePlayer(teamId, race, playerId, type) → {ok: true, amount: number, treasury: number} | {ok: false, refusal?: string} | {refusal: string}` — `type`: `"sell"` или `"cancel-purchase"` (как нарисовала шторка). План: игрока с этим `storedPlayerId` нет → `null`; `playerRemoval(race, draft, player)`: `type === "cancel-purchase"` и `removal.type !== type` → `PLAYER_PURCHASE_CLOSED`; продажа и `removal.blocked` → `PLAYER_SALE_MIN` (словами `validation.*`); иначе `removeLeaguePlayer(race, draft, playerId, type)`.
  - `putInPlace(team)`: список, чтение которого в пути (`state.myTeams.loading`), после записи читается заново — `void loadMyTeams(true)`; старый ответ отбрасывает `loadMyTeams` (решение 11, как `adopt` в `src/data/treasury.mjs`).

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-data.test.mjs` (помощники файла: `open()`, `teamAt(revision, spp, over, players)`, `patches()`, `settle()`; раса людей — из `public/data.en.json`; в `setDictionaries` теста — `validation.POSITION_MAX`, `ROSTER_MAX_PLAYERS`, `TREASURY_INVALID`, `PLAYER_SALE_MIN`, `PLAYER_PURCHASE_CLOSED` тем же текстом, что в `src/i18n/en.json`):
  - «a purchase is one PATCH of the whole roster: the new players with the next free numbers and their price recorded, the treasury spent, on the revision as read»: Ann и казна 50 → `buyPlayers("t1", human, {0: 1})` → `{ok: true, hired: [{number: "2", position: "Human Lineman"}], treasury: 0}`; один `PATCH`, тело: `revision: 4`, `roster.players[1]` — `rowIndex: 0`, `number: "2"`, `purchased: true`, `purchaseRefund: 50`; `roster.treasury` 0; `roster.roster` `{0: 2}`.
  - «a cart the draft no longer pays for, or that breaks a limit, sends nothing and says why» (Review Focus 2): `{0: 2}` при казне 50 → `{ok: false, refusal: <TREASURY_INVALID>}`; `{1: 3}` → `POSITION_MAX`; ни одного запроса.
  - «a sale is one PATCH without him and the treasury up by the sale; a cancelled purchase by what was paid»: восемь игроков, Catcher с Block → `removePlayer("t1", human, "p2", "sell")` → `{ok: true, amount: 47.5, treasury: 97.5}`, в теле `PATCH` его нет, `roster.roster` пересчитан; игрок с `purchased: true, purchaseRefund: 50` → `"cancel-purchase"` → `amount` 50.
  - «a sale the rules refuse sends nothing and says why»: семь игроков → `"sell"` → `PLAYER_SALE_MIN`; отмена при `purchaseRefund`, которого уже нет, → `PLAYER_PURCHASE_CLOSED`; запросов нет.
  - «a purchase whose answer was lost is the 409 that holds it: taken as saved, nobody hired twice» (Review Focus 1): `api.fail(PATCH)` → `buyPlayers` → `settle()` → `{status: "offline", waiting: 1}`; затем 409 `TEAM_SAVED_ELSEWHERE` с командой ревизии 5, чей `roster` — из тела первого `PATCH` → `retrySaves("t1")` → `saved`, `waiting: 0`; оба `PATCH` несут одно тело (тот же id нового игрока); `savedRevision("t1")` 5.
  - «a sale whose answer was lost: the same» — то же для `removePlayer`.
  - «a purchase sealed by a match begun elsewhere is not refunded in full: the 409 that does not hold it is the coach's conflict» (Review Focus 5): отмена покупки → 409 с командой ревизии 5, где у игрока нет `purchaseRefund` → статус `conflict`; `retrySaves` больше ничего не шлёт.
  - «nothing is sent after a conflict, for a player the roster has not, for an empty cart; another tab's coach is told»: `{ok: false}` трижды, ни одного запроса; чужой токен — `{refusal: "…another tab…"}`.
  - «a list read on its way when a save answers is asked again: the older list never takes the answer back»: `api.hold("GET /api/teams")`, `loadMyTeams(true)` в пути; `stepSpp` отвечает командой ревизии 5 → в `state.myTeams.items` `t1` ревизии 5 и отправлено второе `GET /api/teams`; первое отпускается со списком ревизии 4 → в списке по-прежнему 5; второе отвечает 5.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-data.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. В шапку `save.mjs` — абзац: «A purchase and a sale are steps of the queue too (stage 07c): the draft changed as a whole — players hired or let go, the treasury moved — and the whole roster saved, one step one PATCH, so that the server journals exactly that step (`classifyTreasuryChange`). The players a purchase makes are the server's shape, which is what lets a lost answer's 409 be known as this very purchase.»
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-roster.test.mjs test/team-roster-skips.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster/save.mjs test/team-roster-data.test.mjs
git commit -m "feat(roster): a purchase and a sale are steps of the save queue, one PATCH each; a list read in the air is asked again" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Экран — «+» и корзина найма

Прототипы: телефон — `mobile/StatsHire.html` (корзина, «+» у «ИГРОК»), десктоп — `desktop/DeskRosterHire.html`. Сверять с ними (решения 12, 13), размеры — D2.

**Files:**
- Create: `src/screens/team/roster/market.mjs`, `src/screens/team/roster/hire-sheet.mjs`, `src/screens/team/roster/market.css`, `test/team-roster-market.test.mjs`
- Modify: `index.mjs`, `view.mjs`, `panel.mjs`, `sheets.mjs`, `injury.mjs`, `wire.mjs`, `src/ui/roster-table.mjs`, `src/ui/stat-strip.mjs`, `src/screens/teams/builder-view.mjs`, `src/styles.css`, оба словаря, `test/ui-roster-table.test.mjs`, `test/ui-player.test.mjs`, `test/helpers/roster-page.mjs`, `test/team-roster.test.mjs`

**Interfaces:**
- Consumes: `buyPlayers` (Task 4); `hireQuote` (Task 2); `closedMarkup`, `prepResetWords` (`panel.mjs`); `closeSheet`, `keyed` (`injury.mjs`); `footButton`, `sheetIdOf` (`sheets.mjs`); `renderStepButton`, `wireStepButtons` (`src/ui/stepper.mjs`); `renderSheet`, `renderButton`, `icon`, `formatMoney`, `toast`, `raceTitleOf`, `rowsForTeam`.
- `src/ui/roster-table.mjs`: проп `headLeadHtml` переименовывается в `headTailHtml` и встаёт **после** кнопки сортировки первого столбца, обе — в одном ряду с зазором 8px (`DeskRosterHire`: `display: flex; align-items: center; gap: 8px`); JSDoc — «markup after the player's header button (stage 07c's «+»)»; `test/ui-roster-table.test.mjs:146` — тот же тест с новым именем и порядком.
- `src/ui/stat-strip.mjs`: `positionStatsLine(row) → string` — нынешний `statsLine` из `src/screens/teams/builder-view.mjs` без изменений («MA 6 · ST 3 · …», пара связана неразрывным пробелом, точка — с парой перед ней); `builder-view.mjs` импортирует его и удаляет свой (разметка набора та же; `test/builder-view.test.mjs` проходит без изменений).
- `index.mjs` (не больше +4 строк):
  - `linesOf(visit, mode)` возвращает и `draft` (нормализованный, который он уже строит);
  - `screenOf`: `where` получает `race` и `draft`; хранитель шторки — по таблице `const KEEPERS = { mark: markSheetOf, undo: markSheetOf, hire: marketSheetOf, sell: marketSheetOf };` вместо `MARKS`: `(KEEPERS[visit.sheet?.kind] ?? sheetOf)(visit, [...lines, ...fallen], where)`;
  - `pressHandlers`: `now()` возвращает и `race`, `draft`; `...marketHandlers(saving, marks)` рядом с `...markHandlers(saving, marks)`;
  - JSDoc `Visit.sheet` — плюс `{kind: "hire", key: "hire", cart, refusal}` и `{kind: "sell", key, refusal}`.
- `RosterScreen` (`view.mjs`, JSDoc) получает `draft: object` (нормализованный черновик очереди: `players`, `treasury`).
- `sheets.mjs`: `HIRE_SHEET = "roster-hire"`, `SELL_SHEET = "roster-sell"`; `SHEET_IDS` — плюс `hire`, `sell` (`sell` нужен Task 6, константа — здесь).
- `injury.mjs`: `OPENERS` — плюс `hire: "data-roster-hire"`, `sell: "data-roster-sell"`.
- `panel.mjs`: `hireClosed(screen) → string` — матч → `t("teamRoster.market.closed")`; `screen.lock`; иначе `""`.
- `hire-sheet.mjs`:
  - `hireButtonMarkup(screen, {block = false} = {}) → string` — «+» (решение 12): `<button type="button" class="g-roster__hire" aria-haspopup="dialog" aria-label="…" data-roster-hire="hire">` с `icon("plus", 14)`; `block` — `renderButton({label: t("teamRoster.hire.open"), kind: "primary", block: true, data: {rosterHire: "hire"}})`; закрытый (`hireClosed`) — `closedMarkup({className, label: t("teamRoster.hire.open"), glyph: block ? "" : "plus", reason, data: {rosterHire: "hire"}})`.
  - `cartRowMarkup({row, quoteRow, left}) → string` — карточка позиции (решение 13): `<div class="g-market__row" data-hire-key="${rowIndex}">` (в корзине — `g-market__row--in`), буква на цвете позиции (`g-market__letter g-market__letter--${kind}`), имя и цена, `positionStatsLine(row)`, «навыки · в команде N из M» (`teamRoster.hire.limit`; навыки — через запятую или `t("newTeam.noSkills")`); справа — при `inCart === 0` кнопка `<button type="button" class="g-market__add" data-hire-step="1" aria-label="…">` с плюсом и словом `teamRoster.hire.addWord` в `<span class="g-market__addword">` (видно от 901px), иначе степпер `.g-market__stepper` из `renderStepButton({hook: "hire", delta: -1, …})`, числа и `renderStepButton({hook: "hire", delta: 1, …})`. Отказ «+» (`quoteRow.refusal`) — `aria-disabled="true"` и `title` словами `validation.<CODE>` у «+» в обоих видах.
  - `hireSheetMarkup({race, quote, mode, refusal = "", reason = ""}) → string` — `renderSheet({id: HIRE_SHEET, title: t("teamRoster.hire.title"), sub: t("teamRoster.hire.sub", {race: race.title, players, max, free}), wide: true, …})`; тело — плитки (`<dl class="g-market__tiles">`: «Казна» `formatMoney(treasury)`; «Корзина» `formatMoney(0)` или `t("teamRoster.hire.minus", {amount})`; «Останется» `formatMoney(left)`, класс `g-market__tile--left`, при `left < 0` — `g-market__tile--short`), карточки `cartRowMarkup` по `quote.rows`, строки корзины (`<ul class="g-market__lines">`, `teamRoster.hire.line` и сумма), номера (`teamRoster.hire.numbers` или `noneYet`), во время подготовки — `prepResetWords()`, отказ — `<p class="g-market__refusal" role="alert">`; `footStartHtml` — «Отмена» (`renderButton({label: t("teamRoster.hire.keep"), data: {hireKeep: true}})` с классом `g-market__keep`, скрыт до 900px), `footHtml` — `footButton({label, kind: "primary", data: {hireBuy: true}, disabled: !reason && Boolean(waits), reason})`, подпись — `empty` / `short` / `buy`.
- `market.mjs`:
  - `marketSheetOf(visit, lines, where) → sheet|null` — шторка `hire`: `null` в матче или без расы; иначе `{...sheet, quote: hireQuote(where.race, where.draft, sheet.cart), reason: hireClosed(where)}`. (Ветка `sell` — Task 6.)
  - `marketHandlers(saving, lent) → {onHire, onHireStep, onHireKeep, onHireBuy}` (`lent` — `{now, refused}` из `index.mjs`):
    - `onHire(key, button)` — причина `hireClosed(now())` → `toast`; иначе `visit.sheet = {kind: "hire", key: "hire", cart: {}, refusal: ""}`, `visit.opener = button`, `draw()`;
    - `onHireStep(rowIndex, delta)` — только для открытой `hire`; `+1` при отказе строки (`hireQuote(...).rows[rowIndex].refusal`) → `toast` словами, корзина не меняется; иначе `cart[rowIndex]` ± 1 (не ниже 0, ноль удаляется), `refusal: ""`, `draw()`;
    - `onHireKeep()` — `closeSheet(saving)`;
    - `onHireBuy()` — причина ещё раз → `toast`; корзина пуста или `quote.refusal` → ничего; `buyPlayers(teamId, now().race, sheet.cart)`: `{refusal}` → в шторку, `refused()`; `{ok: true}` → `closeSheet(saving)` (фокус — на «+», `openerOf`), `toast(t("teamRoster.hire.done", {players, treasury}))` (`players` — `teamRoster.hire.player` через запятую).
- `view.mjs`:
  - `layoutMarkup`: первая таблица — `table(label, active, hireButtonMarkup(screen))` (в `renderRosterTable` — `headTailHtml`); без неё — `<p class="g-roster__empty">…</p>` и под ним `<div class="g-market__hirebar">${hireButtonMarkup(screen, {block: true})}</div>`;
  - `sheetMarkup`: шторка `hire` — до поиска строки: `hireSheetMarkup({race: screen.race, quote: sheet.quote, mode: screen.mode, refusal: sheet.refusal, reason: sheet.reason})`.
- `wire.mjs`: `wireMarket(root, handlers)` — `onPlayerButton(root, "data-roster-hire", onHire)`; `wireStepButtons(root, "hire", ({key, delta}) => onHireStep(Number(key), delta), {onRefused: ({reason}) => onRefused(reason)})` (слышит и «+ В корзину», и степпер: оба несут `data-hire-step`); `[data-hire-keep]`, `[data-hire-buy]`; JSDoc `wireRoster` — новые обработчики.
- `market.css` (шрифт, рамка, фон, регистр, разрядка, начертание — явно; значения — решения 12, 13):
  - `.g-roster__hire` — круг `--accent`, плюс `--on-accent`; до 900px — видимый круг 26px внутри цели 44×44, от 901px — 24×24; закрытый — как `.g-roster__closed` (фон `--surface-3`);
  - `.g-market__hirebar`; `.g-market__tiles`, `.g-market__tile`, `.g-market__tile--left` (`--accent-tint`), `.g-market__tile--short` (`--danger-tint`, число `--danger`);
  - `.g-market__row` (+ `--in`), `.g-market__letter` (+ `--lineman|thrower|catcher|blitzer|big` на `--pos-*`), `.g-market__name`, `.g-market__price`, `.g-market__stats`, `.g-market__meta`, `.g-market__add` (до 900px — 44×44 только плюс; от 901px — высота 40px, плюс и слово), `.g-market__addword`, `.g-market__stepper` (кнопки до 900px — 44×44, от 901px — 36×36; плюс — заливка `--accent`; отказ — `--surface-3`/`--disabled`);
  - `.g-market__lines`, `.g-market__numbers`, `.g-market__refusal`, `.g-market__prep`; `.g-market__keep { display: none }` до 900px.
- `src/styles.css`: `@import url("screens/team/roster/market.css");` в самом конце.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.hire.open` | Hire players | Нанять игроков |
| `teamRoster.hire.title` | Hire players | Нанять игроков |
| `teamRoster.hire.sub` | {race} · on the roster {players} of {max} · places left: {free} | {race} · в составе {players} из {max} · свободно мест: {free} |
| `teamRoster.hire.treasury` | Treasury | Казна |
| `teamRoster.hire.cart` | Cart | Корзина |
| `teamRoster.hire.left` | Left | Останется |
| `teamRoster.hire.minus` | −{amount} | −{amount} |
| `teamRoster.hire.limit` | {skills} · in the team {have} of {max} | {skills} · в команде {have} из {max} |
| `teamRoster.hire.add` | Add to the cart: {position} | Добавить в корзину: {position} |
| `teamRoster.hire.addWord` | To the cart | В корзину |
| `teamRoster.hire.drop` | Take out of the cart: {position} | Убрать из корзины: {position} |
| `teamRoster.hire.line` | {count} × {position} | {count} × {position} |
| `teamRoster.hire.numbers` | Numbers of the new players: {numbers} — change them in the player's profile | Номера новичков: {numbers} — поменять можно в профиле игрока |
| `teamRoster.hire.noneYet` | Add players to the cart | Добавьте игроков в корзину |
| `teamRoster.hire.empty` | The cart is empty | Корзина пуста |
| `teamRoster.hire.short` | Not enough: {amount} | Не хватает {amount} |
| `teamRoster.hire.buy` | Buy for {total} · players: {count} | Купить за {total} · игроков: {count} |
| `teamRoster.hire.keep` | Cancel | Отмена |
| `teamRoster.hire.done` | Hired: {players} · treasury {treasury} | Куплено: {players} · в казне {treasury} |
| `teamRoster.hire.player` | {position} #{number} | {position} #{number} |
| `teamRoster.market.closed` | Hiring and selling — after the post-match | Найм и продажа — после итогов матча |

- [ ] **Step 1: Падающие тесты** — `test/team-roster-market.test.mjs` (окружение — `test/helpers/roster-page.mjs`; `withWindow` — `test/helpers/ref-screen.mjs`; `PREP_GAME` — как `test/team-roster-fallen-undo.test.mjs:63`; сообщения — `document.querySelectorAll("output")`, как `toasts()` в `test/team-roster-skips.test.mjs:407`). Команда — `team({ roster: { players: PLAYERS, treasury: 120 } })` (семь людей помощника; Lineman — Ann, Dell, Finn; Ogre — Grom). В `test/ui-player.test.mjs` — `positionStatsLine(human.team.roster[0])` → `"MA 6 · ST 3 · AG 3+ · PA 4+ · AR 9+"`. Экран:
  - «the «+» stands right after «Player» in the active roster's header, on a phone and on a desk; the other tables have none» (`StatsHire`, `DeskRosterHire`): в первой `table.g-rtable` у `th.g-rtable__h--who` — сначала `.g-sort`, затем `[data-roster-hire]` (`aria-haspopup="dialog"`, `aria-label` «Hire players»); во второй и третьей — нет.
  - «a roster with nobody who plays the next match still hires: the button under the words»: все семеро пропускают → «Everyone on the roster misses the next match.» и под ним `.g-market__hirebar [data-roster-hire]` «Hire players»; пустой состав — то же под «No players on the roster yet.».
  - «in a match the «+» says why and opens nothing» (Review Focus 4): `LIVE_GAME` → `aria-disabled="true"`, `title` «Hiring and selling — after the post-match»; клик → это сообщение, `dialog#roster-hire` нет.
  - «closed while the games are unread, the roster is read, or a death is on its way»: «Loading the matches…» у «+»; `hold("POST /api/teams/t1/players/p1/death")` (как Task 8 07b) → «Saving the mark…».
  - «the cart: the race and the places, the treasury, what it costs and what is left; every position with its price, its characteristics, its skills and how many the team has» (десктоп): `dialog#roster-hire.g-sheet--wide`, `h2` «Hire players», `.g-sheet__sub` «Human · on the roster 7 of 14 · places left: 7»; плитки «120k», «0k», «120k» (у третьей `g-market__tile--left`); `.g-market__row` — по строкам расы (6), у Lineman «Human Lineman», «50k», «no skills · in the team 3 of 16», у каждой — `.g-market__add` со словом «To the cart»; подвал — «Cancel» и выключенная «The cart is empty»; «Add players to the cart».
  - «+ adds to the cart, − takes out; the card, the totals, the numbers the new players get and the button follow»: два «+» Lineman → у карточки `g-market__row--in` и степпер с «2», «−100k», «20k», «2 × Human Lineman», «Numbers of the new players: 8, 9 — …», кнопка «Buy for 100k · players: 2»; «−» → «1»; ещё «−» → снова «+ To the cart».
  - «a position at its maximum, and a full roster, refuse the + and say why; money does not» (Review Focus 2): «+» Ogre — `aria-disabled`, `title` «Ogre: maximum is 1.» (`validation.POSITION_MAX`), клик → то же сообщение, корзина пуста; Blitzer, Thrower и Catcher по одному при казне 120 → «Not enough: 115k», кнопка `disabled`, плитка `g-market__tile--short`, «+» Lineman не `aria-disabled`; состав из 14 → у всех «+», кроме Ogre (у него — максимум позиции), `title` — `validation.ROSTER_MAX_PLAYERS`.
  - «bought: one PATCH of the whole roster — the players with the next free numbers, the purchase recorded, the treasury spent — on the revision as read; the sheet closes, the coach is told, the focus on the «+»»: тело — 9 игроков, новые `purchased: true`, `purchaseRefund: 50`, `number` «8» и «9», `treasury: 20`, `revision: 4`; шторки нет; сообщение «Hired: Human Lineman #8, Human Lineman #9 · treasury 20k»; «Active roster 5» (было 3); `document.activeElement` — `[data-roster-hire]`.
  - «a second press on «Buy» sends nothing more» (Review Focus 3): два клика подряд → один `PATCH`.
  - «a purchase offline waits like a step: «Waiting for the network · edits: 1»» (`api.fail("PATCH /api/teams/t1")`).
  - «during a preparation the sheet says what a change of the roster resets»: `PREP_GAME` → в теле шторки `prepResetWords()`.
  - «another tab's coach: nothing is bought, and the coach is told» (токен сменён после `rememberSessionToken`): `PATCH` нет, `auth.otherTab` в шторке.
  - «a match begun while the cart is open closes it, the focus back on the «+»» (Review Focus 4): шторка открыта, `LIVE_GAME` + `loadGames(true)` → шторки нет, фокус — закрытый «+».
  - «on a phone: no «Cancel», the + alone, a 44px target» (`withWindow({phone: true})`): разметка та же; `market.css` — `.g-market__keep` и `.g-market__addword` скрыты в `@media (max-width: 900px)`; `valuesOf` даёт 44px у `.g-roster__hire`, `.g-market__add`, кнопок `.g-market__stepper` до 900px и 24px у `.g-roster__hire` от 901px (D2).
  - «every key the new files ask for is in both dictionaries»: `assertDictionaryCovers("src/screens/team/roster/market.mjs", "src/screens/team/roster/hire-sheet.mjs", "src/screens/team/roster/panel.mjs")`.
  - «everything drawn is styled, and the cart's colours are readable»: `assertStyled(view, ...STYLES, "sheet.css")` с открытой шторкой; `assertReadable("src/screens/team/roster/market.css", ".g-market__tile--short …", "color", ["--danger-tint"], 4.5)`, `.g-market__price` и `.g-market__meta` на `--surface`, `.g-market__letter` на `--pos-*` (как `.g-hire__avatar` в `test/builder-view.test.mjs:672`); брейкпоинты — только 900/901; `@import url("screens/team/roster/market.css");` — последний в `src/styles.css`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-market.test.mjs test/ui-roster-table.test.mjs test/ui-player.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `market.mjs`: «The roster's market (stage 07c): hiring from the race's positions into a cart and buying it, and letting a player go — sold, or his purchase cancelled. Each is a step of the save queue (save.mjs), drawn at once from its draft, with the queue's rules: it waits for the network, a lost answer is known by the 409 that holds it, a conflict is the coach's. None during a match (R8). What a sheet holds lives on the visit, as the marks' do (marks.mjs).» Шапка `hire-sheet.mjs`: «The roster's «+» and its cart (spec UI §10; StatsHire on a phone, DeskRosterHire on a desk): the race's positions as cards with what each costs and how many the team holds, the treasury and what the cart leaves of it, and one button that says what it waits for.»
- [ ] **Step 4: Поправить тесты 07a/07b, которые ломает «+» в шапке:**
  - `test/helpers/roster-page.mjs`: `STYLES` — плюс `"src/screens/team/roster/market.css"`;
  - `test/team-roster.test.mjs`: списки `assertStyled` (на `6313b6b` — строки около 523, 1034, 1163, 1573, 2205; после Task 1 — как записано в журнале) — плюс `"src/screens/team/roster/market.css"`; утверждение о конце `styles.css` (около 2249) — теперь `…marks.css");\n@import url("screens/team/roster/market.css");`, комментарий над ним — «07c's market.css after 07b's marks.css».
  Ни одно другое ожидание 07a/07b не меняется; падает что-то ещё — стоп, вопрос контроллеру.
- [ ] **Step 5: Тесты** — Run: `node --test test/team-roster-market.test.mjs test/team-roster.test.mjs test/team-roster-skips.test.mjs test/team-roster-fallen-undo.test.mjs test/team-player.test.mjs test/builder-view.test.mjs` → PASS; полный прогон → PASS; `wc -l src/screens/team/roster/index.mjs` — не больше записанного в Task 1 плюс 4.
- [ ] **Step 6: Commit**

```bash
git add src/screens/team/roster src/ui/roster-table.mjs src/ui/stat-strip.mjs src/screens/teams/builder-view.mjs src/styles.css src/i18n/en.json src/i18n/ru.json test/team-roster-market.test.mjs test/ui-roster-table.test.mjs test/ui-player.test.mjs test/helpers/roster-page.mjs test/team-roster.test.mjs
git commit -m "feat(roster): «+» beside «Player» opens a cart of the race's positions, limited by the rules and paid from the treasury, bought as one step of the roster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Экран — «Продать» в паре действий, подтверждение, отмена покупки

Прототипы: телефон — `mobile/StatsSell.html` (подтверждение), пара — `mobile/StatsHire.html`/`StatsLive.html` (раскрытая строка); десктоп — `desktop/DeskRosterSell.html` (подтверждение), пара — `DeskRosterPrep.html` (вне матча), `DeskRosterLive.html` (в матче). Сверять с ними (решения 7, 14), размеры — D2.

**Files:**
- Create: `src/screens/team/roster/sell-sheet.mjs`
- Modify: `market.mjs`, `panel.mjs`, `view.mjs`, `wire.mjs`, `market.css`, оба словаря
- Test: `test/team-roster-market.test.mjs` (и `test/team-roster.test.mjs` — только место «Травмы в матче…», если его меняет шаг 3)

**Interfaces:**
- Consumes: `removePlayer` (Task 4); `PlayerLine.price`, `.removal` (Task 3); `SELL_SHEET` (Task 5); `teamHasSpecialRule` (`team-rules.mjs`); `renderPlayerBadge`, `renderSheet`, `renderButton`, `footButton`, `formatMoney`, `sumMoney`, `prepResetWords`.
- `panel.mjs` (имена — как сверил Task 1):
  - `sellClosed(line, screen) → string` — матч → `teamRoster.market.closed`; `screen.lock`; нет `line.id` → `teamRoster.sell.noId`; `line.removal.blocked` → `t("validation.PLAYER_SALE_MIN")`; иначе `""`;
  - пара действий (07b `actionsMarkup`; после fidelity — как записал Task 1) — две равные колонки, зазор 8px: первая — что там стоит (вне матча «Пропуск матча…» / «Вернуть в состав»; в матче «Травма в матче…», где её рисует 07a), вторая — «Продать» (`teamRoster.sell.open`) или у `removal.type === "cancel-purchase"` «Отменить покупку» (`teamRoster.sell.cancelOpen`), `data: {key: "roster-sell", rosterSell: line.key}`, `dialog: true`, причина — `sellClosed`. **В матче пара рисуется** (решение 7): если до 07c в матче ряда нет, а «Травма в матче…» стоит отдельно (`injuryMarkup` 07a), она переезжает в первую колонку пары на обеих ширинах — тот же `data-roster-injury`, та же причина закрытия; у пропускающего в матче — одна закрытая «Продать». Высота кнопок пары: до 900px — от 44px, от 901px — 40px (`DeskRosterPrep`: `min-height: 40px`, радиус 10, рамка 1px `--line-strong`, 14px 600 `--ink-2`). JSDoc модуля и функции — пара (07c).
- `sell-sheet.mjs`: `sellSheetMarkup({line, race, treasury, mode, refusal = "", reason = ""}) → string` — решение 14:
  - `renderSheet({id: SELL_SHEET, title: t(cancel ? "teamRoster.sell.cancelTitle" : "teamRoster.sell.title"), sub: t("teamRoster.sell.sub", {name, number, position})})` (подзаголовок скрыт до 900px: `#roster-sell .g-sheet__sub`);
  - тело: карточка `.g-market__who` (скрыта от 901px): `renderPlayerBadge({number, kind, captain})`, имя, `teamRoster.sell.who` (позиция, `line.earned`, навыки через запятую или `newTeam.noSkills`); строки `<dl class="g-market__rows">` — продажа: `price` (`line.price`), `extras` (`line.value - line.price`: `teamRoster.sell.plus` или `teamRoster.sell.nothing`), `value` (`line.value`), `spp` (`teamRoster.sell.sppLost`, класс `g-market__lost`), `back` или у Architect of Fate (`teamHasSpecialRule(race, "Architect of Fate")`) `backFate` (`teamRoster.sell.plus`, класс `g-market__back`); отмена: `paid`, `refund`; поток `.g-market__flow`: «Казна сейчас» `formatMoney(treasury)` → `after`/`afterCancel` `formatMoney(sumMoney(treasury, amount))`; примечание `note` / `noteFate` / `cancelNote`; у `line.captain` — `teamRoster.sell.captain`; во время подготовки — `prepResetWords()`; отказ — `role="alert"`;
  - `footStartHtml` — «Отмена» (`data: {sellKeep: true}`, класс `g-market__keep`, скрыта до 900px); `footHtml` — `footButton({label: t(cancel ? "teamRoster.sell.cancelSend" : "teamRoster.sell.send", {amount: formatMoney(amount)}), kind: cancel ? "primary" : "danger", data: {sellSend: true}, reason})`; красная — того же размера, что основная шторки (до 900px во всю ширину 52px, от 901px 44px).
- `market.mjs`:
  - `marketSheetOf`, ветка `sell`: строка состава (не погибший) с `sheet.key`; нет её или матч → `null`; иначе `{...sheet, reason: sellClosed(line, where)}`;
  - `marketHandlers` — плюс `onSell(key, button)` (строка состава; причина `sellClosed` → `toast`; иначе `{kind: "sell", key, refusal: ""}` и `opener`), `onSellKeep()` (`closeSheet`), `onSellSend()`: причина ещё раз → `toast`; `removePlayer(teamId, now().race, line.id, line.removal.type)`: `{refusal}` → в шторку, `refused()`; `{ok: true}` → `visit.sheet = null`, `visit.opener = null`, `memory.selected` — `null`, если был он; `draw()`; фокус — `view.querySelector("h1")`; `toast(t(cancel ? "teamRoster.sell.cancelled" : "teamRoster.sell.done", {name: line.name, amount: formatMoney(answer.amount), treasury: formatMoney(answer.treasury)}))`.
- `view.mjs`: `sheetMarkup` — шторка `sell` (строка по ключу, как у остальных): `sellSheetMarkup({line, race: screen.race, treasury: screen.draft.treasury, mode: screen.mode, refusal: sheet.refusal, reason: sheet.reason})`.
- `wire.mjs`: `onPlayerButton(root, "data-roster-sell", onSell)`, `[data-sell-keep]`, `[data-sell-send]`.
- `market.css`: `.g-market__who`; `.g-market__rows` (строки от 44px, граница снизу `--line`, 15px/1.25; подпись `--muted`; значение `nowrap`, 600, у `--total` 700); `.g-market__lost` (`--danger`); `.g-market__back` (`--accent-text`, 700); `.g-market__flow` (`--accent-tint` / `--on-accent-tint`, радиус 14; до 900px отступ 12px 14px и числа 26px, от 901px — 12px 16px и 28px; Oswald 700; стрелка 20px); `.g-market__note` (до 900px 12px/1.45, от 901px 13px/1.45, `--muted`); размеры красной кнопки — как у основной.

Словари (en / ru):

| ключ | en | ru |
|---|---|---|
| `teamRoster.sell.open` | Sell | Продать |
| `teamRoster.sell.cancelOpen` | Cancel purchase | Отменить покупку |
| `teamRoster.sell.title` | Sell the player | Продать игрока |
| `teamRoster.sell.cancelTitle` | Cancel the purchase | Отменить покупку |
| `teamRoster.sell.sub` | {name} · #{number} {position} | {name} · #{number} {position} |
| `teamRoster.sell.who` | {position} · {spp} SPP · {skills} | {position} · {spp} SPP · {skills} |
| `teamRoster.sell.price` | Hire price {position} | Цена найма {position} |
| `teamRoster.sell.extras` | Skills and improvements | Навыки и улучшения |
| `teamRoster.sell.value` | Current value | Текущая стоимость |
| `teamRoster.sell.spp` | Career SPP | SPP за карьеру |
| `teamRoster.sell.sppLost` | {spp} · lost | {spp} · сгорят |
| `teamRoster.sell.back` | Back to the treasury · half | Вернётся в казну · половина |
| `teamRoster.sell.backFate` | Back to the treasury · full value and injuries | Вернётся в казну · полная стоимость и травмы |
| `teamRoster.sell.paid` | Bought this time for | Куплен в этот раз за |
| `teamRoster.sell.refund` | Back to the treasury | Вернётся в казну |
| `teamRoster.sell.plus` | +{amount} | +{amount} |
| `teamRoster.sell.nothing` | — | — |
| `teamRoster.sell.now` | Treasury now | Казна сейчас |
| `teamRoster.sell.after` | After the sale | После продажи |
| `teamRoster.sell.afterCancel` | After the cancel | После отмены |
| `teamRoster.sell.note` | The player leaves the team for good: SPP, skills and improvements are lost. Half his current value comes back. Nobody can be sold while the roster has 7 players or fewer. | Игрок уходит из команды насовсем: SPP, навыки и улучшения пропадают. Возвращается половина текущей стоимости. Продать нельзя, если в составе 7 игроков или меньше. |
| `teamRoster.sell.noteFate` | The player leaves the team for good: SPP, skills and improvements are lost. Architect of Fate: his full value comes back, and 10k for each injury. Nobody can be sold while the roster has 7 players or fewer. | Игрок уходит из команды насовсем: SPP, навыки и улучшения пропадают. Architect of Fate: возвращается полная стоимость и 10k за каждую травму. Продать нельзя, если в составе 7 игроков или меньше. |
| `teamRoster.sell.cancelNote` | He was bought after the last match, so the full price comes back. Once a match starts the purchase cannot be cancelled. | Игрок куплен после последнего матча, поэтому возвращается полная цена. После старта матча покупку отменить нельзя. |
| `teamRoster.sell.captain` | He is the captain: the team has none until you name another in a player's profile. | Он капитан: у команды не будет капитана, пока вы не назначите нового в профиле игрока. |
| `teamRoster.sell.keep` | Cancel | Отмена |
| `teamRoster.sell.send` | Sell for {amount} | Продать за {amount} |
| `teamRoster.sell.cancelSend` | Cancel and get {amount} back | Отменить и вернуть {amount} |
| `teamRoster.sell.done` | Sold: {name} · +{amount} · treasury {treasury} | Продан: {name} · +{amount} · в казне {treasury} |
| `teamRoster.sell.cancelled` | Purchase cancelled: {name} · +{amount} · treasury {treasury} | Покупка отменена: {name} · +{amount} · в казне {treasury} |
| `teamRoster.sell.noId` | This player has no id in the roster, so he cannot be sold. Ask the league administrator to fix the roster. | У игрока нет id в составе, поэтому продать его нельзя. Попросите администратора лиги исправить состав. |

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-market.test.mjs`. Фикстура `MARKET` — `PLAYERS` помощника и ещё двое: `{id: "p8", rowIndex: 2, number: "8", name: "Hal", extraSkills: [{name: "Block", access: "primary"}], spp: {touchdowns: 2}}` (Catcher 75k + 20k), `{id: "p9", rowIndex: 0, number: "9", name: "Ivo", purchased: true, purchaseRefund: 50}`; казна 120:
  - «the action pair: «Sell» second, beside «Miss a match…» or «Back on the roster»; a fresh purchase says «Cancel purchase»» (телефон — раскрытая строка, десктоп — панель, `DeskRosterPrep`): в `.g-roster__actions` у Ann — `[data-roster-mark]`, затем `[data-roster-sell]` «Sell»; у Dell — `[data-roster-return]` и «Sell»; у Ivo — «Cancel purchase».
  - «in a match «Sell» stands closed beside «Injury in the match…», and says why» (`DeskRosterLive`, Review Focus 4): `LIVE_GAME` → пара `[data-roster-injury]` | `[data-roster-sell]` (`aria-disabled`, `title` «Hiring and selling — after the post-match»); клик → сообщение, шторки нет; у пропускающего — одна закрытая «Sell».
  - «at seven players «Sell» is closed and says why; «Cancel purchase» is not»: `PLAYERS` и Ivo (8) → «Sell» открыт; без Grom и с Ivo (7) → у Ann `aria-disabled`, `title` — `validation.PLAYER_SALE_MIN`, клик → сообщение; у Ivo «Cancel purchase» открыт.
  - «the sheet on a desk: who he is, what he cost, what he gained, what he is worth, the SPP that go, half back, the treasury now and after; «Cancel» and a red «Sell for 47.5k»» (`DeskRosterSell`): Hal → `dialog#roster-sell`, `h2` «Sell the player», `.g-sheet__sub` «Hal · #8 Catcher»; строки «Hire price Catcher» «75k», «Skills and improvements» «+20k», «Current value» «95k», «Career SPP» «6 · lost» (`.g-market__lost`), «Back to the treasury · half» «+47.5k» (`.g-market__back`); поток «120k» → «167.5k»; `[data-sell-send].g-btn--danger` «Sell for 47.5k»; `[data-sell-keep]` «Cancel» → шторки нет, фокус — `[data-roster-sell]` Hal.
  - «the sheet on a phone: his card, the same lines, one red button» (`StatsSell`, `withWindow({phone: true})`): `.g-market__who` с номером «8», «Hal», «Catcher · 6 SPP · Block»; `market.css` скрывает `.g-market__who` от 901px, `.g-market__keep` и `#roster-sell .g-sheet__sub` до 900px.
  - «Architect of Fate: full value and the injuries back, said so» (Tzeentch, Pink Horror с `nigglingInjuries: 1`, восемь игроков): «Back to the treasury · full value and injuries» «+85k», примечание `noteFate`.
  - «a cancelled purchase: what was paid comes back in full, and its button is not red»: Ivo → «Cancel the purchase», «Bought this time for» «50k», «After the cancel» «170k», `cancelNote`, кнопка `.g-btn--primary` «Cancel and get 50k back».
  - «a captain sold: the sheet says the team is left without one»: Bors → `teamRoster.sell.captain`.
  - «sold: one PATCH without him, the treasury up by the sale, on the revision as read; the sheet closes, the coach is told, the focus on the title»: тело без Hal, `treasury: 167.5`, `revision: 4`; «Sold: Hal · +47.5k · treasury 167.5k»; `document.activeElement` — `h1`; на десктопе в панели — первый игрок.
  - «a purchase cancelled: one PATCH without him, the full price back»: «Purchase cancelled: Ivo · +50k · treasury 170k».
  - «a second press on «Sell» sends nothing more» (Review Focus 3).
  - «a sheet whose match began closes, and the focus goes back to his row» (Review Focus 4): шторка открыта, `LIVE_GAME` + `loadGames(true)` → шторки нет, фокус — `[data-row-key]` Hal.
  - «a player gone from the roster as read takes his sheet with him».
  - «another tab's coach: nothing is sold, and the coach is told» — слова в шторке, `PATCH` нет.
  - «a fallen player has no «Sell»»: в раскрытой строке и панели погибшего `[data-roster-sell]` нет.
  - «the name and the skills are text»: `HOSTILE` в имени → `textContent`, ни `img`, ни `[onerror]`.
  - «the pair's size: 44px on a phone, 40px on a desk» (D2): `valuesOf("src/screens/team/roster/market.css" или файл, где fidelity держит пару, ".g-roster__actions > .g-btn", "min-height")`.
  - «every key is in both dictionaries»: `assertDictionaryCovers` по `sell-sheet.mjs`, `market.mjs`, `panel.mjs`; «styled and readable»: `assertStyled` с открытой шторкой; `assertReadable("src/screens/team/roster/market.css", ".g-market__lost", "color", ["--surface"], 4.5)`, `.g-market__back` на `--surface`, `.g-market__flow` на `--accent-tint`.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-market.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. Шапка `sell-sheet.mjs`: «Letting a player go (spec UI §11; StatsSell on a phone, DeskRosterSell on a desk): what he cost, what he gained, what he is worth now and what comes back — half his value, or under Architect of Fate his full value and his injuries — and the treasury before and after; for a purchase no match has sealed yet, the price paid back in full. The sale's button is the screen's one red button: it cannot be undone; a cancelled purchase can be bought again, so its button is not.» Если «Травма в матче…» переезжает в пару — тесты 07a, которые ищут её место (`.g-btn--block` под рядом), правятся на новое место; другие ожидания 07a не меняются.
- [ ] **Step 4: Тесты** — шаг 2 → PASS; `node --test test/team-roster.test.mjs test/team-roster-skips.test.mjs test/team-roster-taps.test.mjs` → PASS; полный прогон → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster-market.test.mjs test/team-roster.test.mjs
git commit -m "feat(roster): «Sell» second in the action pair, asked first: half his value, Architect of Fate in full, none at seven, closed in a match; «Cancel purchase» in full until a match starts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: R8 — найм и продажа, ждавшие сети, когда начался матч

**Files:**
- Modify: `market.mjs` (`droppedWords`), `index.mjs` (`reloadRoster`, импорты), оба словаря
- Test: `test/team-roster-market.test.mjs`

**Interfaces:**
- Consumes: `sppEdits` (`src/domain/post-match/events.mjs`), `markEdits` (`absence.mjs`), `transferEdits` (Task 2).
- Produces (`market.mjs`): `droppedWords(server, draft, waiting) → string[]` — что начавшийся матч снял из ждавших шагов тренера, словами, по порядку: `spp = Math.min(sppEdits(server, draft).length, waiting)` → `teamRoster.matchDropped {count}`; `marks = Math.min(markEdits(server, draft), waiting - spp)` → `teamRoster.mark.matchDropped {count}`; найм и продажа — когда `waiting - spp - marks > 0` и `transferEdits(server, draft) > 0` → `teamRoster.market.matchDropped` (без числа, решение 8); нулевые не говорятся. JSDoc: сохранение другого устройства, снятое тем же чтением, может попасть в слова — как у 07a, верх ограничен `waiting`.
- `index.mjs`, `reloadRoster`: до `takeServerTeam` — `const dropped = droppedWords(answer.team.roster, visit.draft, waiting);`; после — в матче `for (const words of dropped) toast(words, { tone: "error" });` вместо двух строк `spp`/`marks` и двух `toast`; импорты `sppEdits` и `markEdits` уходят из `index.mjs`; JSDoc `reloadRoster` и шапки — «…and the hires and sales». `index.mjs` — минус 3 строки.

Словари: `teamRoster.market.matchDropped` — «A match has begun, so the hires and sales that were waiting were not saved. Make them again after the post-match.» / «Начался матч, поэтому ждавшие отправки найм и продажа не сохранены. Повторите их после итогов матча.»

- [ ] **Step 1: Падающие тесты** — в `test/team-roster-market.test.mjs`:
  - «a hire and a sale that waited for the network are given up when a match begins, and the coach is told» (Review Focus 4): `api.fail(PATCH)`, покупка Lineman → «Waiting for the network · edits: 1»; игры с `LIVE_GAME` и `loadGames(true)` → сообщение `teamRoster.market.matchDropped`; в составе — состав сервера; `PATCH` — ровно один (неудачный).
  - «SPP, a mark and a hire given up together: each in its own words, SPP first»: «+» TD, «Пропуск матча… → Серьёзная травма», покупка — всё `fail(PATCH)`; матч → три сообщения в порядке SPP, отметки, найм.
  - «a match begun with no hire or sale waiting says nothing of them»: ждёт только шаг SPP → `market.matchDropped` нет.
- [ ] **Step 2: Убедиться, что падает** — Run: `npm run build && node --test test/team-roster-market.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 и `node --test test/team-roster.test.mjs test/team-roster-skips.test.mjs` (их тесты R8 — без изменений) → PASS; полный прогон → PASS; `index.mjs` — на 3 строки меньше, чем после Task 5.
- [ ] **Step 5: Commit**

```bash
git add src/screens/team/roster src/i18n/en.json src/i18n/ru.json test/team-roster-market.test.mjs
git commit -m "feat(roster): hires and sales waiting when a match begins are given up with the server's roster, and the coach is told" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Редактор 2.x — мёртвый режим создания

Передачи 06 (R10) и 11 (решение 19). Редактор 2.x живёт только в `LEAGUE_MODE`; ветки, до которых доходил лишь `CREATE_MODE` (билдер 2.x удалён этапом 06), уходят. Поведение 2.x то же.

**Files:**
- Modify: `src/components/roster-editor/modes.mjs`, `hire-panel.mjs`, `staff-control.mjs`, `matchday-layout.mjs`, `identity.mjs` (комментарий), оба словаря, `test/ref-article.test.mjs` (строка 346), `test/roster-view-mode.test.mjs`

**Interfaces:**
- `modes.mjs`: `CREATE_MODE` удаляется; из `LEAGUE_MODE` и typedef уходят флаги, которые только он ставил в `true` или которые у лиги всегда `true`: `enforcesBudget`, `enforcesPositionLimit`, `showsHireCards`, `spendsTreasury`, `marksPurchased`; строки (`hireAttribute`, `hireCountHeadingKey`, `staffAttribute`, `staffCardClass`, `identityAttribute`, `identityFormClass`) остаются. Шапка — один режим; комментарии «оба редактора» / "both editors" говорят «редактор».
- `hire-panel.mjs`: найм лиги пулом не отказывается (как и было: проверка — 422 сервера): `hireVerdict`, отказ в `hireAttributes`, `disabled-row`/`disabled`, `matchday-hire-reason`, `overBudget`, `toast` в `wireHirePanel` уходят; покупка всегда с `purchased: true, purchaseRefund` и `spendTreasury`; `property` — всегда `addSavedRow`; блок карточек `showsHireCards` уходит (ветка `cardsOnly` остаётся); `renderRosterStatGrid` — без `export`; `startingBudget` и ненужные импорты уходят.
- `staff-control.mjs`: ветка бюджета и параметр `committedTotal` (`staffStepVerdict`, `renderStaffControl`, `renderDedicatedFansLine`) уходят; `description` — всегда `t("roster.postMatchValue")`, как было у лиги.
- `matchday-layout.mjs`: деньги — всегда `countToNumber(draft.treasury)` с подписью `savedRoster.treasury` и `data-treasury-display`.
- Словари: `builder.selectedHeader`, `builder.remaining` удаляются; `roster.overBudgetLabel` и `validation.BUDGET_EXCEEDED` — только если `grep -rn` по `src`, `server`, `scripts` не находит других пользователей.

- [ ] **Step 1: Падающие тесты** — `test/ref-article.test.mjs:346`: «`renderRosterStatGrid` stays with its one user, unexported» — `assert.match(read("src/components/roster-editor/hire-panel.mjs"), /\nfunction renderRosterStatGrid\(/)` и `doesNotMatch` с `export function renderRosterStatGrid`; `test/roster-view-mode.test.mjs`: «the editor has one mode: the league's» — `modes.mjs` не экспортирует `CREATE_MODE`, у `LEAGUE_MODE` нет `enforcesBudget`.
- [ ] **Step 2: Убедиться, что падает** — Run: `node --test test/ref-article.test.mjs test/roster-view-mode.test.mjs` → FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Тесты** — шаг 2 и `node --test test/roster-stage-lock.test.mjs test/roster-view-mode.test.mjs` и тесты `saved-roster` (что найдёт `ls test | grep -i saved`) → PASS; `grep -rn "CREATE_MODE\|enforcesBudget\|enforcesPositionLimit\|showsHireCards\|builder.selectedHeader\|builder.remaining" src test` → пусто; полный прогон → PASS (`npm run check`: недостижимых функций 0).
- [ ] **Step 5: Commit**

```bash
git add src/components/roster-editor src/i18n/en.json src/i18n/ru.json test/ref-article.test.mjs test/roster-view-mode.test.mjs
git commit -m "refactor(roster-editor): the 2.x editor's dead create mode goes; renderRosterStatGrid stays with its one user, unexported" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Mock и smoke

**Files:**
- Modify: `scripts/mock-api.mjs` (одна строка `amazons`, **на месте**), `scripts/mock/treasury.mjs` (`save`), `scripts/smoke-api.mjs` (один шаг)

**Interfaces:**
- `scripts/mock-api.mjs`: в строке `playerOf("p", 7, 2, "Blitzer Seven", …),` (около 161) после неё **в той же строке** — `playerOf("p", 8, 0, "Linewoman Eight", { purchased: true, purchaseRefund: 50 }),`; `wc -l` остаётся 599. У `t1` восемь игроков: «Продать» открыт, у Linewoman Eight — «Отменить покупку»; у `t3` (двое) — «Продать» закрыт (≤ 7); у `t5` идёт подготовка (`g7`).
- `scripts/mock/treasury.mjs`, `save`: после проверки стадии — `if (!isMoneyAmount(roster.treasury)) return reply({ ...errorPayload("ROSTER_BREAKS_THE_RULES"), violations: [{ code: VALIDATION_CODES.TREASURY_INVALID, params: {} }] }, 422);` (как `addEntry`); в шапке — строка про 422.
- `scripts/smoke-api.mjs`: шаг «PATCH journals a hire, its cancel and a sale exactly; a resent hire meets the 409 that holds it; a treasury below zero is refused» — после шага `…/rolls` (продаётся **последний** игрок, не `playerId`): раса — `expandCollections(JSON.parse(public/data.en.json))`, `teams/amazon`; черновик — `normalizeDraft(team.roster)`; тело — `{name, baseTeamSlug, revision, roster: rosterForStorage(draft)}`:
  1. `hirePlayers(race, draft, {0: 1})` → `PATCH` 200; голова `GET …/ledger` — `{kind: "hire", delta: -50}`;
  2. то же тело ещё раз (старая ревизия) → 409, `sameValues(normalizeDraft(conflict.team.roster), normalizeDraft(body.roster))` — `true`;
  3. `removeLeaguePlayer(race, draft, hiredId, "cancel-purchase")` → голова — `cancel_purchase` +50;
  4. `removeLeaguePlayer(race, draft, lastId, "sell")` → голова — `sale` +25;
  5. `treasury: -1` → 422, `violations[0].code` `TREASURY_INVALID`;
  6. среди строк журнала, написанных шагом, нет `manual`.

- [ ] **Step 1: Mock** (рецепт М): проверить ответы:

```bash
MOCK=http://localhost:5177; H='Authorization: Bearer mock'
curl -fsS -H "$H" $MOCK/api/teams/t1 | node -e 'process.stdin.on("data",d=>{const p=JSON.parse(d).team.roster.players;console.log(p.length, p.at(-1).name, p.at(-1).purchaseRefund)})'
curl -s -H "$H" -H 'Content-Type: application/json' -X PATCH -d '{"name":"Mock Team","baseTeamSlug":"teams/amazon","roster":{"players":[],"treasury":-1}}' $MOCK/api/teams/t1
```

Expected: `8 Linewoman Eight 50`; `{"error":{"code":"ROSTER_BREAKS_THE_RULES",…},"violations":[{"code":"TREASURY_INVALID",…}]}`. Mock остановить.
- [ ] **Step 2: Браузер** (встроенный, mock 5177, `storage` `{"gata-league-auth-token": "mock"}`): `#/t/t1/roster` на 390 и 1440 — «+» после «ИГРОК», корзина, «Купить»; у Linewoman Eight — «Отменить покупку»; `#/t/t3/roster` — «Продать» закрыт. Что видно — в отчёт задачи.
- [ ] **Step 3: Smoke** (рецепт С): `APP_URL=http://localhost:3073 npm run smoke` → `Smoke test passed.`, новый шаг в выводе — `ok`. Сервер остановить.
- [ ] **Step 4: Проверки** — `npm run build && . output/07c/env.sh && npm test && npm run check` → PASS; `wc -l scripts/mock-api.mjs` → `599`.
- [ ] **Step 5: Commit**

```bash
git add scripts/mock-api.mjs scripts/mock/treasury.mjs scripts/smoke-api.mjs
git commit -m "test(smoke): a hire, its cancel and a sale journal exactly, a resent hire is the 409 that holds it; the mock refuses a treasury below zero and gives Mock Team a fresh purchase" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Снимки рядом с прототипами (контроллер)

Протокол этапа, шаг 6, и требование владельца о близости к прототипам: каждое состояние на 390 и 1440, светлая и одна тёмная палитра, выборочно 768 и 1024; рядом — прототип той же ширины; каждое видимое отличие либо исправлено, либо записано с причиной. Файлы — в `output/screens/rd-07c/` (не коммитятся), в PR — загрузкой; `compare.html` — владельцу.

**Files:**
- Create: `docs/redesign/screens/rd-07c.json`

- [ ] **Step 1: Серверы.** Порты свободны: `lsof -iTCP:3073 -iTCP:5177 -sTCP:LISTEN || echo free`. Mock — рецепт М. Реальный сервер — рецепт С. Состояния, которые пишут (W1, W2), — последними, у каждого одна ширина; после них mock перезапускается.
- [ ] **Step 2: `rd-07c.json`** — как `docs/redesign/screens/rd-07b.json` (`widths` `[390, 1440]`, те же `heights` и варианты), адреса на `5177`; клик по игроку — по кнопке строки (`[data-row-key^="p2#"]`); действия — внутри видимой на ширине копии (`.g-rtable__panelrow` до 900, `.g-roster__aside` от 901); корзина — `document.querySelector('[data-hire-key="0"] [data-hire-step="1"]').click()`.

| id | адрес | действие | ширины | прототип: телефон / десктоп | что проверяет |
|---|---|---|---|---|---|
| H1 | `#/t/t1/roster` | клик `p2` | + 768, 1024 | `StatsHire` (строка без шторки) / `DeskRosterPrep` | «+» после «ИГРОК»; пара «Пропуск матча…» \| «Продать» |
| H2 | `#/t/t1/roster` | «+» | | `StatsHire` / `DeskRosterHire` | пустая корзина |
| H3 | `#/t/t1/roster` | «+», Linewoman +1 | | `DeskRosterHire` (корзина с одним) | корзина, номера, «Купить» |
| H4 | `#/t/t1/roster` | «+», Blocker +1 | | `StatsHire` («не хватает казны») | «Не хватает 10k», «Останется» красным, Blitzer на максимуме |
| H5 | `#/t/t5/roster` | «+» | 390 | `StatsHire` | подготовка: предложение о сбросе шагов |
| H6 | `#/t/t1/roster` | `ru`, «+», Linewoman +1, `fullPage` | 390 | `StatsHire` | кириллица корзины |
| S1 | `#/t/t1/roster` | клик `p2`, «Продать» | | `StatsSell` / `DeskRosterSell` | подтверждение продажи |
| S2 | `#/t/t1/roster` | клик `p8`, «Отменить покупку» | | `StatsSell` / `DeskRosterSell` (вариант отмены — по логике прототипа) | отмена покупки |
| S3 | `#/t/t3/roster` | клик `r1` | | `StatsHire` / `DeskRoster` | «Продать» закрыт (≤ 7) |
| S4 | `#/t/t1/roster` | `ru`, клик `p2`, «Продать» | 390 | `StatsSell` | кириллица подтверждения |
| M1 | `#/t/t2/roster` | клик `q4` | | `StatsLive` / `DeskRosterLive` | матч: «+» закрыт, пара «Травма в матче…» \| «Продать» (закрыта) |
| W1 | `#/t/t1/roster` | «+», Linewoman +1, «Купить» | 390 | `StatsHire` (после покупки) | сообщение «Куплено…», новый игрок в таблице |
| W2 | `#/t/t1/roster` | клик `p2`, «Продать», «Продать за …» | 1440 | `DeskRosterSell` (после продажи) | сообщение «Продан…», панель — первый игрок |
| G1 | `http://localhost:3073/#/t/x/roster` | — | 390 | — | гость идёт ко входу |

- [ ] **Step 3: Снять** — `npm run screens -- docs/redesign/screens/rd-07c.json --out output/screens/rd-07c` → `… PNG(s) written …, 0 not taken`; ошибки браузера — в `errors.json` (ожидаемых нет).
- [ ] **Step 4: Прототипы рядом.** Каждый прототип из таблицы (с выключенной рамкой ревью: `review: false`, демо-состояние — как в его `dc-import`) снимается той же шириной (390 — мобильные, 1440 и 1024 — десктопные; 768 — мобильные) в `output/screens/rd-07c/proto/`; `output/screens/rd-07c/compare.html` — для каждого состояния наш снимок и прототип рядом, под ними список отличий.
- [ ] **Step 5: Сверка.** Каждое видимое отличие — строка списка: исправлено (коммит `fix(roster): <что> on <экран>` с трейлером, тест — где пишется; полный прогон; `--only <ids>`) или оставлено с причиной (данные mock; решения 7, 13–15 и их записанные расхождения: «Отмена» на телефоне не рисуется, SPP-строка на телефоне, 480px вместо 520px, не красная отмена покупки, сообщение вместо плашки; правило кода). Поломка всегда исправляется: текст ниже 4.5:1, перенос плашки или подписи, горизонтальная прокрутка на 390, нажимаемое меньше 44px до 900px или меньше 24px от 901px, шрифт без кириллицы, лишняя ошибка в консоли, неработающее действие, два `h1`.
- [ ] **Step 6: Реальный сервер вручную** (встроенный браузер, 3073; тестовые значения — из `scripts/seed-pre-match-preview.mjs`, база — `gata_smoke_07c`): войти тренером `preview-home` (команда «Yerevan Lions», 7 игроков, казна 150, идёт подготовка), открыть состав:
  - «+» → Lineman ×1 → «Купить» → `PATCH` 200; «Отменить покупку» у новичка → `PATCH` 200; снова Lineman ×1 → «Купить»; «Продать» у первого игрока → `PATCH` 200;
  - в базе: `. output/07c/env.sh && psql "$SMOKE_URL" -Atc "SELECT kind, delta FROM team_ledger WHERE saved_team_id = (SELECT id FROM saved_teams WHERE name = 'Yerevan Lions') ORDER BY created_at DESC LIMIT 4"` → `sale|…`, `hire|-50.000`, `cancel_purchase|50.000`, `hire|-50.000`, строк `manual` нет;
  - выйти. Что увидено и вывод `psql` — в `output/07c/real-server.txt` для PR.
- [ ] **Step 7: Commit**

```bash
git add docs/redesign/screens/rd-07c.json
git commit -m "test(screens): stage 07c states beside their prototypes — the cart, money short, a sale, a cancelled purchase, closed at seven and in a match" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Финальное ревью, правки спек и проверки перед PR (контроллер)

- [ ] **Step 1: Финальное ревью ветки** — шаг 7 протокола (skill requesting-code-review), с упором на Review Focus, инварианты 07a/07b и размеры D2 из Global Constraints. Исправления — отдельными коммитами.
- [ ] **Step 2: Правки спек под решения этапа** (PR-CHECKLIST: «Если реализация разошлась со спецификацией — спецификация поправлена в том же PR»), по ответам на вопросы 1–2:
  - **Спека 3.0:**
    - §2, таблица «До своего этапа»: `#/t/:teamId/roster` — «найм и продажа — этап 07c: «+» после «Игрок» в шапке «Активного состава», корзина, «Продать» / «Отменить покупку» второй кнопкой пары действий с подтверждением»; `#/t/:teamId/roster/:playerId` — «Состав» ведёт в редактор 2.x за прокачкой, номером, именем и капитаном (найм и продажа — уже в «Составе», 07c);
    - §3.2 — абзац «Как «Состав» пишет найм и продажу» (решения 1, 2, 4, 5, 8): шаги очереди, игроки в форме сервера, строки журнала ровно шага;
    - §6, строка «Состав · …»: модули 07c (`market`, `hire-sheet`, `sell-sheet`, `market.css`; правило — `domain/roster/transfers.mjs`; `ui/roster-table` `headTailHtml`, `ui/stat-strip` `positionStatsLine`);
    - §7: блок «Расхождения этапа 07c» (прав код) — из списка Task 10, шаг 5: подзаголовок корзины с расой на обеих ширинах; «Отмены» в корзине и подтверждении на телефоне нет (как прототип), крестик закрывает; SPP-строка подтверждения на телефоне (§11); подтверждение — Sheet 480px, а не 520px; у отмены покупки кнопка основная, не красная; сообщение «Куплено…» вместо плашки над таблицей; имена новичков — как у набора; подпись покупки без форм множественного числа; степпер корзины на телефоне 44px (D2) вместо 36px; лимит 14 считает пропускающих (ответ 2); отмена покупки не ограничена 7 (ответ 1); в «Чего «Состав» 3.0 пока не делает» блока 07a — без «Продать (07c)».
  - **Спецификация интерфейса:** §6 — «Продать» второй кнопкой пары (07c); §7 — «+» и «Продать» в матче закрыты словами, снятые матчем найм и продажа сказаны; §10, §11 — «Как построено на этапе 07c» (решения 3, 4, 7, 12–15); «Известные расхождения» — те же пункты блоком «Расхождения этапа 07c».

```bash
git add docs/superpowers/specs/2026-10-14-redesign-design.md docs/superpowers/specs/2026-10-14-ui-spec-v0.9.md
git commit -m "docs(spec): stage 07c — hire and sell as built" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Шаг 8 протокола**

```bash
npm run build && . output/07c/env.sh && npm test && npm run check && npm run i18n:check
APP_URL=http://localhost:3073 npm run smoke
. output/07c/env.sh && DATABASE_URL="$SMOKE_URL" SMOKE_BASE_URL=http://localhost:3073 npm run smoke:post-match
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
gone = [key for key in old if key not in en]
print(len(new), "new keys; missing in ru:", [key for key in new if key not in ru])
print("outside the stage's spaces:", [key for key in new if not key.startswith(("teamRoster.hire.", "teamRoster.sell.", "teamRoster.market."))])
print("removed:", gone)
PY
git diff --stat origin/redesign -- content/ server/   # пусто: лимит 14 меняется в общем домене (Task 2a), не в server/
git diff --name-only origin/redesign -- server/db/migrations/   # пусто
wc -l src/screens/team/roster/index.mjs src/screens/team/roster/roster.css src/screens/team/roster/marks.css scripts/mock-api.mjs src/app.js
```

Expected:
- всё зелёное; одинаковое число страниц EN/RU, 0 fallback; `smoke` (с шагом найма и продажи) и `smoke:post-match` — `passed`;
- `i18n keys unique`; `missing in ru: []`; вне пространств этапа — `[]`; удалены только ключи Task 8;
- `content/`, `server/` и миграции не менялись;
- `index.mjs` ≤ 599, `roster.css` и `marks.css` — как после Task 1, `scripts/mock-api.mjs` 599, `src/app.js` ≤ 120.

- [ ] **Step 4: `PR-CHECKLIST.md` целиком** — особенно:
  - «Миграции…» — нет миграций;
  - «Новые коды ошибок — в `API_ERRORS`» — новых нет;
  - «Перенесённый экран удалил свой старый CSS и модуль» — нет: найм и продажа 2.x остаются в редакторе, который рисует `teamPlayer` и `adminTeamEdit` (решение 17), сказать в PR;
  - «Экран совпадает с прототипом» — `compare.html` и список отличий Task 10;
  - снимки 390 и 1440, 768 и 1024.

---

### Task 12: PR и после слияния (контроллер)

- [ ] **Step 1: Ребейз**, если в `redesign` что-то влито с начала этапа: `git fetch origin && git rebase origin/redesign`, конфликты в словарях — объединение, затем Task 11, шаг 3 заново.
- [ ] **Step 2: Тело PR** (`<scratchpad>/pr-rd-07c.md`):
  - пункт 7c плана 3.0 — все три подпункта;
  - таблица «Как идёт каждая запись» и что делают потерянный ответ и двойное нажатие;
  - «Решения этого плана» коротко и ответы владельца на два вопроса (1: отмена покупки при ≤ 7 разрешена; 2: лимит 14 считает всех игроков состава, пропускающих тоже, — клиент и сервер, Task 2a); D1–D3 — что принёс fidelity, что сделал 07c;
  - таблица «Маршруты этапа 07c»;
  - вывод Task 11, шаг 3, и ручная проверка реального сервера (`output/07c/real-server.txt`);
  - снимки H1–H6, S1–S4, M1, W1, W2, G1 рядом с прототипами (загрузкой) и список отличий;
  - расхождения макета с кодом и как решены (Task 11, шаг 2, §7);
  - общие файлы, которые 07c тронул: `src/domain/roster/transfers.mjs`, `src/ui/roster-table.mjs` (`headTailHtml`), `src/ui/stat-strip.mjs` (`positionStatsLine` из набора), `src/components/roster-editor/*` (режим создания), `scripts/smoke-api.mjs`;
  - известные ограничения: сервер принимает `PATCH` во время матча (09a); лимит 14 считает всех игроков состава — клиент и сервер (Task 2a); полоса казны догоняет после сохранения;
  - правки спек; «Передача дальше»;
  - строка `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin rd/07c-hire-sell
gh pr create --base redesign --head rd/07c-hire-sell --title "rd/07c: the roster's hire and sell — a cart of the race's positions, a sale asked first, a purchase cancelled until the match starts" --body-file <scratchpad>/pr-rd-07c.md
gh pr merge <номер> --merge
```

После `gh pr create` — `ccd_pr.get_status` / `bind_pr`.

- [ ] **Step 3: После слияния** (шаг 10 протокола): в плане 3.0 пункт 7c → `[x]`; строка «07a–07e» мастер-плана остаётся `[ ]` до 07e; коммит `docs(plan): stage 07c done` в следующей ветке или прямым коммитом в `redesign`; `git worktree remove ../bb-rd-07c`; база `gata_smoke_07c` — `dropdb`.

---

## Передача следующим этапам

- **07d · профиль, редактирование, прокачка.**
  - `renderTeamPlayer` (`src/screens/team/player/index.mjs`): ветка игрока состава переходит с редактора 2.x на профиль 3.0 — вместе с ней из пути тренера уходят найм и продажа 2.x (редактор остаётся только `adminTeamEdit`).
  - Пара действий — «Пропуск матча…» / «Вернуть в состав» / «Травма в матче…» | «Продать» / «Отменить покупку»; профиль может поставить ту же пару (`sellClosed`, `marketHandlers`). Ручная правка SPP вне матча на десктопе (D3) — правка игрока 07d.
  - Новички называются как в наборе («Human Lineman 4») и получают свободные номера: имя и номер правит 07d. Капитана после продажи капитана 07c не назначает — «Капитан» 07d.
- **07e · карьера по матчам.** Проданный игрок уходит с историей в `match_events`; `…/players/:pid/history` по его id отвечает 404 (его нет в составе) — решить, нужна ли карьера проданного.
- **09a · подготовка и игра.** Сервер принимает `PATCH` состава во время матча — найм и продажа тоже `PATCH`: отказ нужен там же, где для шагов SPP (передано из 07a/08).
- **09b · итоги.** Шаг «Состав» итогов (найм, продажа, Journeymen) может взять `hireQuote`, `hirePlayers`, `cartRowMarkup`; покупки итогов запечатываются при завершении (`sealPlayerPurchases`).
- **12 · админка.** «Состав» в режиме админа: найм и продажа идут админским `PATCH` (остаток журнала — `admin`, классификация та же); лимит 14 — тот же, что у «Состава» (Task 2a: `ROSTER_MAX_PLAYERS` считает всех игроков состава, пропускающих тоже, и на клиенте, и на сервере); удаление редактора 2.x (режим создания уже убран).
- **13 · зачистка.** «−» на нуле теряет фокус (степпер корзины, как в наборе); слова `validation.ROSTER_MAX_PLAYERS` («A Sevens roster…») — сверить с контентом; глоссарий: «Нанять игроков», «Корзина», «Отменить покупку», «Продать игрока».
- **Любой этап.** `hireQuote`, `hirePlayers`, `transferEdits`, `TRANSFER_REFUSALS` (`src/domain/roster/transfers.mjs`); `positionStatsLine` (`src/ui/stat-strip.mjs`); `buyPlayers`, `removePlayer` (`src/screens/team/roster/save.mjs`); `renderRosterTable({headTailHtml})`.

## Охват

| Пункт | Задача |
|---|---|
| План 3.0, 7c: корзина найма с лимитами и казной | 2, 4, 5 (решения 2, 3, 12, 13) |
| План 3.0, 7c: «Продать» в паре с «Пропуском матча» и диалог подтверждения: половина стоимости, Architect of Fate, запрет при ≤ 7 | 2, 3, 4, 6 (решения 4, 5, 7, 14) |
| План 3.0, 7c: отмена покупки до старта матча | 2, 3, 4, 6 (решения 4, 5; ответ владельца 1) |
| План 3.0, этап 7: удалить `saved-roster.mjs` и `roster-editor/*` по мере переноса | не 07c: редактор 2.x ещё рисует `teamPlayer` (до 07d) и `adminTeamEdit` (до 12); мёртвый режим создания — 8 (решение 17) |
| Решения владельца D1–D3 (2026-10-19) | D1, D3 — PR «desk fidelity», 07c начинается от него (1); D2 — размеры всех новых элементов (5, 6; Global Constraints) |
| Требование владельца: близость к прототипам, снимки рядом | 5, 6 (значения из прототипов), 10 (`compare.html`), 11 (§7) |
| Мастер-план 07a–07e, дополнения | к 07c относятся только общие (R8, запись в аккаунт) — Global Constraints; 4–7 |
| 05–13: отказ степпера говорит причину (`onRefused`, `data-roster-closed`) | 5 («+» корзины, закрытый «+»), 6 (закрытая «Продать») |
| 05–13: Sheet — фокус на открывшего после перерисовки, `pointerdown`, блокировка прокрутки | 5, 6 (`wireSheets`, `openerOf`, `closeSheet`) |
| 05–13: радиогруппы не перерисовывать `innerHTML` | в шторках 07c радиогрупп нет |
| 05–13: Callout — короткие подписи действий | новых Callout нет |
| 05–13: проверка словаря видит только `t("…")` — шаблонные ключи перебирать | 2 (`TRANSFER_REFUSALS` × оба словаря) |
| Спека 3.0 §0.1: продажа за половину стоимости — по коду | 2, 3, 6 |
| Спека 3.0 §0.5, §3.2: журнал объясняет казну, строки пишет сервер | 2, 4, 9 (решения 1, 18) |
| Спека 3.0 §0.8: блоб меняется аддитивно (`purchased`, `purchaseRefund` — поля 2.x) | 2, 4 |
| Спека 3.0 §0.11: в матче найм и продажа закрыты | 5–7 (решения 7, 8) |
| Спека 3.0 §4: `PATCH /api/teams/:id`, 422 `ROSTER_BREAKS_THE_RULES`, 409 `TEAM_SAVED_ELSEWHERE` | 4, 9 |
| Спецификация интерфейса §0: недоступное видно с причиной; красная кнопка только у необратимого | 5, 6 (решения 7, 14) |
| Спецификация интерфейса §7, §8 (подготовка, матч, сохранение) | 5–7 |
| Спецификация интерфейса §10 | 5; снимки 10; правка — 11 |
| Спецификация интерфейса §11 | 6; снимки 10; правка — 11 |
| Спецификация интерфейса §18: старт матча закрывает отмену покупок | 3, 4 (`sealPlayerPurchases`, решение 5) |
| SCREENS.md «Состав · Найм игроков», «Состав · Продажа игрока» (М: `StatsHire`, `StatsSell`; Д: `DeskRosterHire`, `DeskRosterSell`) | 5, 6; H1–H6, S1–S4, W1, W2 |
| Передача 07b → 07c: «Продать» в ряду действий и закрыт в матче так же; «+» в шапке и куда он встаёт, когда все пропускают; продажа — шаг очереди по образцу `markSkip`; `putInPlace` перечитывает список в пути | 6 (решение 7), 5 (решение 12), 4, 4 (решение 11) |
| Передачи 06/11 через 07a: `renderRosterStatGrid`, мёртвый `CREATE_MODE` | 8 |
| Передача 08: покупки и продажи пишут строки через `classifyTreasuryChange`; `normalizeDraft` на каждом `PATCH`; полоса казны в «Составе» | 2, 4, 9; решение 10 |
| Передача 06: правила найма набора (`build.mjs`) | 2 (`nextFreeNumber`, лимиты), 5 (`positionStatsLine`) |
| Протокол: шаги 6–10 | 10, 11, 12 |
| Правила проекта: бюджеты, `check-references`, CSP, `escapeHtml`, 900/901, 44px/24px (D2), явная типографика, `content/` не меняется | Global Constraints; 11 |
